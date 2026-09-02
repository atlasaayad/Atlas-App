import { Router } from 'express'
import { nanoid } from 'nanoid'
import { all, get, run, logAudit } from '../db/index.js'
import { requireDept } from '../auth.js'
import { SPECIALTIES } from '../constants.js'
import { computeVTMinutes, computeDT } from '../calc.js'

export const methodeRouter = Router()
methodeRouter.use(requireDept('methode'))

// Builds a "($1, $2, ...), ($n+1, ...)" multi-row VALUES clause plus its
// flat parameter list, so N rows can be inserted in one round trip instead
// of N — the same fix applies everywhere this file loops awaiting one
// INSERT per row, which is the main reason gamme/effectif saves were slow
// over a real network hop to Postgres (Neon) rather than local dev.
function buildBulkInsert(rows) {
  const values = []
  const params = []
  for (const row of rows) {
    const placeholders = row.map((_, i) => `$${params.length + i + 1}`)
    values.push(`(${placeholders.join(', ')})`)
    params.push(...row)
  }
  return { valuesSql: values.join(', '), params }
}

async function recompute(modelId) {
  const [gamme, effectifRows] = await Promise.all([
    all('SELECT tps FROM gamme_lines WHERE model_id = $1', [modelId]),
    all('SELECT required FROM effectif_requis WHERE model_id = $1', [modelId]),
  ])
  const nd = effectifRows.reduce((s, r) => s + (r.required || 0), 0)
  const totalTps = gamme.reduce((s, g) => s + (g.tps || 0), 0)
  const vt = computeVTMinutes(gamme)
  const dt = computeDT(nd, totalTps)
  await run('UPDATE models SET nd = $1, vt = $2, dt = $3, updated_at = $4 WHERE id = $5', [
    nd,
    vt,
    dt,
    new Date().toISOString(),
    modelId,
  ])
  return { nd, vt, dt }
}

// Create a new model and assign it to a chain, deactivating whatever was
// previously running there.
methodeRouter.post('/models', async (req, res) => {
  const { client, qteTotale, debut, finPrevue, dessin, commande, chainNumber } = req.body || {}
  if (!client || !chainNumber) return res.status(400).json({ error: 'client_and_chain_required' })

  const now = new Date().toISOString()
  const id = `mdl_${nanoid(10)}`

  await run('UPDATE models SET active = 0 WHERE chain_number = $1 AND active = 1', [chainNumber])
  await run(
    `INSERT INTO models (id, client, qte_totale, debut, fin_prevue, dessin, commande, chain_number, active, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 1, $9, $9)`,
    [id, client, qteTotale || 0, debut || null, finPrevue || null, dessin || null, commande || 0, chainNumber, now]
  )

  const effectifRows = buildBulkInsert(SPECIALTIES.map((spec) => [id, spec, 0]))
  const hourlyRows = buildBulkInsert(Array.from({ length: 9 }, (_, i) => [id, i, 0, now]))
  await Promise.all([
    run(`INSERT INTO effectif_requis (model_id, specialty, required) VALUES ${effectifRows.valuesSql}`, effectifRows.params),
    run(`INSERT INTO hourly_production (model_id, slot_index, qty, updated_at) VALUES ${hourlyRows.valuesSql}`, hourlyRows.params),
    run('INSERT INTO production_totals (model_id, total_entree, total_sortie, updated_at) VALUES ($1, 0, 0, $2)', [id, now]),
    // No quality row seeded here on purpose: a fake "100%" would look like a
    // real confirmation from Quality before they've ever reported anything.
    // The dashboard shows "not reported yet" until their first real PUT.
    run('INSERT INTO finale (model_id, en_cours, updated_at) VALUES ($1, 0, $2)', [id, now]),
    run('INSERT INTO depot (model_id, total_pieces, updated_at) VALUES ($1, 0, $2)', [id, now]),
  ])

  await logAudit({ deptKey: 'methode', modelId: id, action: 'create_model', details: { client, chainNumber } })
  res.status(201).json({ id })
})

methodeRouter.put('/models/:id', async (req, res) => {
  const { client, qteTotale, debut, finPrevue, dessin, commande } = req.body || {}
  const model = await get('SELECT id FROM models WHERE id = $1', [req.params.id])
  if (!model) return res.status(404).json({ error: 'not_found' })
  await run(
    `UPDATE models SET client = $1, qte_totale = $2, debut = $3, fin_prevue = $4, dessin = $5, commande = $6, updated_at = $7 WHERE id = $8`,
    [client, qteTotale || 0, debut || null, finPrevue || null, dessin || null, commande || 0, new Date().toISOString(), req.params.id]
  )
  await logAudit({ deptKey: 'methode', modelId: req.params.id, action: 'update_identity', details: req.body })
  res.json({ ok: true })
})

// Replace the whole gamme (list of {operation, machine, tps}) and recompute VT/DT.
methodeRouter.put('/models/:id/gamme', async (req, res) => {
  const model = await get('SELECT id FROM models WHERE id = $1', [req.params.id])
  if (!model) return res.status(404).json({ error: 'not_found' })
  const lines = Array.isArray(req.body?.lines) ? req.body.lines : []

  await run('DELETE FROM gamme_lines WHERE model_id = $1', [req.params.id])
  if (lines.length > 0) {
    const rows = lines.map((l, i) => [`gml_${nanoid(10)}`, req.params.id, i + 1, l.operation || '', l.machine || '', Number(l.tps) || 0])
    const { valuesSql, params } = buildBulkInsert(rows)
    await run(`INSERT INTO gamme_lines (id, model_id, seq_no, operation, machine, tps) VALUES ${valuesSql}`, params)
  }

  const computed = await recompute(req.params.id)
  await logAudit({ deptKey: 'methode', modelId: req.params.id, action: 'update_gamme', details: { count: lines.length, ...computed } })
  res.json({ ok: true, ...computed })
})

// Replace effectif requis (map of specialty -> required count) and recompute ND/DT.
methodeRouter.put('/models/:id/effectif', async (req, res) => {
  const model = await get('SELECT id FROM models WHERE id = $1', [req.params.id])
  if (!model) return res.status(404).json({ error: 'not_found' })
  const effectif = req.body?.effectif || {}

  const rows = SPECIALTIES.map((spec) => [req.params.id, spec, Number(effectif[spec]) || 0])
  const { valuesSql, params } = buildBulkInsert(rows)
  await run(
    `INSERT INTO effectif_requis (model_id, specialty, required) VALUES ${valuesSql}
     ON CONFLICT (model_id, specialty) DO UPDATE SET required = excluded.required`,
    params
  )

  const computed = await recompute(req.params.id)
  await logAudit({ deptKey: 'methode', modelId: req.params.id, action: 'update_effectif', details: { effectif, ...computed } })
  res.json({ ok: true, ...computed })
})
