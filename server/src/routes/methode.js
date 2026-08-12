import { Router } from 'express'
import { nanoid } from 'nanoid'
import { db, logAudit } from '../db/index.js'
import { requireDept } from '../auth.js'
import { SPECIALTIES } from '../constants.js'
import { computeVTMinutes, computeDT } from '../calc.js'

export const methodeRouter = Router()
methodeRouter.use(requireDept('methode'))

function recompute(modelId) {
  const gamme = db.prepare('SELECT tps FROM gamme_lines WHERE model_id = ?').all(modelId)
  const effectifRows = db.prepare('SELECT required FROM effectif_requis WHERE model_id = ?').all(modelId)
  const nd = effectifRows.reduce((s, r) => s + (r.required || 0), 0)
  const totalTps = gamme.reduce((s, g) => s + (g.tps || 0), 0)
  const vt = computeVTMinutes(gamme)
  const dt = computeDT(nd, totalTps)
  db.prepare('UPDATE models SET nd = ?, vt = ?, dt = ?, updated_at = ? WHERE id = ?').run(
    nd, vt, dt, new Date().toISOString(), modelId
  )
  return { nd, vt, dt }
}

// Create a new model and assign it to a chain, deactivating whatever was
// previously running there.
methodeRouter.post('/models', (req, res) => {
  const { client, qteTotale, debut, finPrevue, dessin, commande, chainNumber } = req.body || {}
  if (!client || !chainNumber) return res.status(400).json({ error: 'client_and_chain_required' })

  const now = new Date().toISOString()
  const id = `mdl_${nanoid(10)}`
  const tx = db.transaction(() => {
    db.prepare('UPDATE models SET active = 0 WHERE chain_number = ? AND active = 1').run(chainNumber)
    db.prepare(
      `INSERT INTO models (id, client, qte_totale, debut, fin_prevue, dessin, commande, chain_number, active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`
    ).run(id, client, qteTotale || 0, debut || null, finPrevue || null, dessin || null, commande || 0, chainNumber, now, now)
    for (const spec of SPECIALTIES) {
      db.prepare('INSERT INTO effectif_requis (model_id, specialty, required) VALUES (?, ?, 0)').run(id, spec)
    }
    for (let i = 0; i < 9; i++) {
      db.prepare('INSERT INTO hourly_production (model_id, slot_index, qty, updated_at) VALUES (?, ?, 0, ?)').run(id, i, now)
    }
    db.prepare('INSERT INTO production_totals (model_id, total_entree, total_sortie, updated_at) VALUES (?, 0, 0, ?)').run(id, now)
    db.prepare('INSERT INTO quality (model_id, percentage, reprises, updated_at) VALUES (?, 100, 0, ?)').run(id, now)
    db.prepare('INSERT INTO finale (model_id, en_cours, updated_at) VALUES (?, 0, ?)').run(id, now)
    db.prepare('INSERT INTO depot (model_id, total_pieces, updated_at) VALUES (?, 0, ?)').run(id, now)
  })
  tx()

  logAudit({ deptKey: 'methode', modelId: id, action: 'create_model', details: { client, chainNumber } })
  res.status(201).json({ id })
})

methodeRouter.put('/models/:id', (req, res) => {
  const { client, qteTotale, debut, finPrevue, dessin, commande } = req.body || {}
  const model = db.prepare('SELECT id FROM models WHERE id = ?').get(req.params.id)
  if (!model) return res.status(404).json({ error: 'not_found' })
  db.prepare(
    `UPDATE models SET client = ?, qte_totale = ?, debut = ?, fin_prevue = ?, dessin = ?, commande = ?, updated_at = ? WHERE id = ?`
  ).run(client, qteTotale || 0, debut || null, finPrevue || null, dessin || null, commande || 0, new Date().toISOString(), req.params.id)
  logAudit({ deptKey: 'methode', modelId: req.params.id, action: 'update_identity', details: req.body })
  res.json({ ok: true })
})

// Replace the whole gamme (list of {operation, machine, tps}) and recompute VT/DT.
methodeRouter.put('/models/:id/gamme', (req, res) => {
  const model = db.prepare('SELECT id FROM models WHERE id = ?').get(req.params.id)
  if (!model) return res.status(404).json({ error: 'not_found' })
  const lines = Array.isArray(req.body?.lines) ? req.body.lines : []
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM gamme_lines WHERE model_id = ?').run(req.params.id)
    const insert = db.prepare(
      'INSERT INTO gamme_lines (id, model_id, seq_no, operation, machine, tps) VALUES (?, ?, ?, ?, ?, ?)'
    )
    lines.forEach((l, i) => {
      insert.run(`gml_${nanoid(10)}`, req.params.id, i + 1, l.operation || '', l.machine || '', Number(l.tps) || 0)
    })
  })
  tx()
  const computed = recompute(req.params.id)
  logAudit({ deptKey: 'methode', modelId: req.params.id, action: 'update_gamme', details: { count: lines.length, ...computed } })
  res.json({ ok: true, ...computed })
})

// Replace effectif requis (map of specialty -> required count) and recompute ND/DT.
methodeRouter.put('/models/:id/effectif', (req, res) => {
  const model = db.prepare('SELECT id FROM models WHERE id = ?').get(req.params.id)
  if (!model) return res.status(404).json({ error: 'not_found' })
  const effectif = req.body?.effectif || {}
  const tx = db.transaction(() => {
    for (const spec of SPECIALTIES) {
      const required = Number(effectif[spec]) || 0
      db.prepare(
        `INSERT INTO effectif_requis (model_id, specialty, required) VALUES (?, ?, ?)
         ON CONFLICT(model_id, specialty) DO UPDATE SET required = excluded.required`
      ).run(req.params.id, spec, required)
    }
  })
  tx()
  const computed = recompute(req.params.id)
  logAudit({ deptKey: 'methode', modelId: req.params.id, action: 'update_effectif', details: { effectif, ...computed } })
  res.json({ ok: true, ...computed })
})
