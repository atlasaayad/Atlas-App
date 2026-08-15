import { Router } from 'express'
import { all, get } from '../db/index.js'
import { verifyPin, issueToken } from '../auth.js'
import { DEPARTMENTS, CHAIN_NUMBERS, HOURLY_SLOTS, SPECIALTIES, GENERIC_POSTE_DEPARTMENTS } from '../constants.js'
import { computeObjectifJour, prodAMaintenant } from '../calc.js'

export const publicRouter = Router()

publicRouter.get('/config', async (req, res) => {
  const row = await get('SELECT value FROM config WHERE key = $1', ['company_name'])
  res.json({ companyName: row?.value || 'Casual' })
})

publicRouter.get('/departments', (req, res) => {
  res.json(DEPARTMENTS)
})

publicRouter.post('/auth/:deptKey/login', async (req, res) => {
  const { deptKey } = req.params
  const { pin } = req.body || {}
  if (!pin) return res.status(400).json({ error: 'pin_required' })

  const result = await verifyPin(deptKey, pin)
  if (!result.ok) {
    if (result.reason === 'locked') {
      return res.status(423).json({ error: 'locked', retryAfterSeconds: result.retryAfterSeconds })
    }
    return res.status(401).json({ error: 'invalid_pin', attemptsRemaining: result.attemptsRemaining })
  }

  const token = issueToken(deptKey, result.dept.pin_hash)
  res.json({ token, dept: deptKey })
})

publicRouter.get('/models', async (req, res) => {
  const rows = await all(
    'SELECT id, client, dessin, chain_number, active FROM models WHERE active = 1 ORDER BY chain_number'
  )
  res.json(rows)
})

publicRouter.get('/chains', async (req, res) => {
  const active = await all('SELECT id, client, dessin, chain_number FROM models WHERE active = 1')
  const byChain = Object.fromEntries(active.map((m) => [m.chain_number, m]))
  res.json(CHAIN_NUMBERS.map((n) => ({ chainNumber: n, model: byChain[n] || null })))
})

publicRouter.get('/models/:id', async (req, res) => {
  const model = await get('SELECT * FROM models WHERE id = $1', [req.params.id])
  if (!model) return res.status(404).json({ error: 'not_found' })
  const gamme = await all('SELECT * FROM gamme_lines WHERE model_id = $1 ORDER BY seq_no', [model.id])
  const effectifRows = await all('SELECT * FROM effectif_requis WHERE model_id = $1', [model.id])
  const effectif = Object.fromEntries(SPECIALTIES.map((s) => [s, 0]))
  for (const r of effectifRows) effectif[r.specialty] = r.required
  res.json({ ...model, gamme, effectif })
})

export async function fullDashboard(model) {
  const effectifRows = await all('SELECT * FROM effectif_requis WHERE model_id = $1', [model.id])
  const effectifRequis = Object.fromEntries(SPECIALTIES.map((s) => [s, 0]))
  for (const r of effectifRows) effectifRequis[r.specialty] = r.required

  const hourlyRows = await all('SELECT * FROM hourly_production WHERE model_id = $1', [model.id])
  const hourlyMap = Object.fromEntries(hourlyRows.map((r) => [r.slot_index, r.qty]))
  const hourly = HOURLY_SLOTS.map((s) => ({
    ...s,
    qty: hourlyMap[s.index] || 0,
    pct: model.dt > 0 ? Math.round(((hourlyMap[s.index] || 0) / model.dt) * 100) : 0,
  }))

  const totals = (await get('SELECT * FROM production_totals WHERE model_id = $1', [model.id])) || {
    total_entree: 0,
  }
  const demande = Math.round(computeObjectifJour(model.dt))
  const produit = prodAMaintenant(hourlyMap)
  const restant = Math.max(demande - produit, 0)
  // Total sortie is auto-computed with the same running-sum logic as
  // "Prod à maintenant" (produit) — it is never a manual entry. Total entré
  // stays a single manual daily figure from Agent Production, so En cours
  // and Le reste recompute live off of those two automatically.
  const totalSortie = produit
  const enCours = totals.total_entree - totalSortie

  const rhRows = await all('SELECT * FROM rh_attendance WHERE model_id = $1', [model.id])
  const present = Object.fromEntries(SPECIALTIES.map((s) => [s, 0]))
  for (const r of rhRows) present[r.specialty] = r.present
  const effectifs = SPECIALTIES.map((s) => ({ specialty: s, present: present[s] || 0, required: effectifRequis[s] || 0 }))
  const ouvriersPresents = effectifs.reduce((s, e) => s + e.present, 0)

  // No row yet means Quality hasn't reported anything for this model — that
  // must never look like a real "100% quality" confirmation, so it's null
  // (rendered as "not reported yet"), not a number nobody actually entered.
  const quality = (await get('SELECT * FROM quality WHERE model_id = $1', [model.id])) || { percentage: null, reprises: null }
  const finale = (await get('SELECT * FROM finale WHERE model_id = $1', [model.id])) || {
    en_cours: 0,
    piece_retouche: 0,
    piece_terminee: 0,
    piece_2eme: 0,
    encours_special: 0,
    encours_repassage: 0,
    encours_controle: 0,
    moyenne_prod_special: 0,
    moyenne_prod_repassage_final: 0,
    moyenne_prod_controle_final: 0,
  }
  const depot = (await get('SELECT * FROM depot WHERE model_id = $1', [model.id])) || { total_pieces: 0 }
  const exportRows = await all('SELECT * FROM logistics_exports WHERE model_id = $1 ORDER BY date', [model.id])
  const exports = exportRows.map((e) => ({ ...e, client: model.client, mod: model.dessin }))

  const postes = await all('SELECT * FROM poste_status WHERE model_id = $1', [model.id])
  const posteMap = Object.fromEntries(postes.map((p) => [p.dept_key, p]))
  // No status row yet means that department has never reported anything for
  // this model — that must never be shown as a fake "100% good", so it gets
  // its own "unreported" state instead of a real percentage/status.
  const etatDesPostes = GENERIC_POSTE_DEPARTMENTS.map((key) => {
    const p = posteMap[key]
    if (!p) return { deptKey: key, percentage: null, note: '', status: 'unreported' }
    const pct = p.percentage
    const status = pct >= 90 ? 'good' : pct >= 70 ? 'warn' : 'bad'
    return { deptKey: key, percentage: pct, note: p.note || '', status }
  })

  const objectifAtteintPct = demande > 0 ? Math.round((produit / demande) * 100) : 0

  return {
    id: model.id,
    chainNumber: model.chain_number,
    identity: {
      client: model.client,
      qteTotale: model.qte_totale,
      debut: model.debut,
      finPrevue: model.fin_prevue,
      dessin: model.dessin,
      commande: model.commande,
    },
    dt: model.dt,
    vt: model.vt,
    nd: model.nd,
    hourly,
    prodAMaintenant: produit,
    ouvriers: { presents: ouvriersPresents, requis: model.nd },
    demande,
    produit,
    restant,
    bilan: {
      totalEntree: totals.total_entree,
      totalSortie,
      leReste: restant,
      enCours,
    },
    finaleEnCours: finale.en_cours,
    finaleDetails: {
      pieceRetouche: finale.piece_retouche,
      pieceTerminee: finale.piece_terminee,
      piece2eme: finale.piece_2eme,
      encoursSpecial: finale.encours_special,
      encoursRepassage: finale.encours_repassage,
      encoursControle: finale.encours_controle,
      moyenneProdSpecial: finale.moyenne_prod_special,
      moyenneProdRepassageFinal: finale.moyenne_prod_repassage_final,
      moyenneProdControleFinal: finale.moyenne_prod_controle_final,
    },
    depotTotal: depot.total_pieces,
    exports,
    objectifAtteintPct,
    quality: { percentage: quality.percentage, reprises: quality.reprises },
    etatDesPostes,
    effectifs,
  }
}

publicRouter.get('/models/:id/dashboard', async (req, res) => {
  const model = await get('SELECT * FROM models WHERE id = $1', [req.params.id])
  if (!model) return res.status(404).json({ error: 'not_found' })
  res.json(await fullDashboard(model))
})

publicRouter.get('/chains/:chainNumber/dashboard', async (req, res) => {
  const model = await get('SELECT * FROM models WHERE chain_number = $1 AND active = 1', [Number(req.params.chainNumber)])
  if (!model) return res.status(404).json({ error: 'no_active_model' })
  res.json(await fullDashboard(model))
})

// Historique — everything computed live from production_history, nothing
// assumed or hardcoded. recordsCount is the number of hourly records
// actually stored for the window (not an assumed 9/day), so the average is
// always total ÷ real records logged. total/average are null (not 0) when
// there's no data at all for the window, so the client can show "no data"
// instead of a fake zero.
async function historyAggregate(chainNumber, fromDate, toDate) {
  const row = await get(
    `SELECT COALESCE(SUM(qty), 0) AS total, COUNT(*) AS records
     FROM production_history WHERE chain_number = $1 AND date >= $2 AND date <= $3`,
    [chainNumber, fromDate, toDate]
  )
  const records = Number(row.records)
  const total = Number(row.total)
  return {
    from: fromDate,
    to: toDate,
    total: records > 0 ? total : null,
    recordsCount: records,
    average: records > 0 ? total / records : null,
  }
}

publicRouter.get('/chains/:chainNumber/history/day', async (req, res) => {
  const { date } = req.query
  if (!date) return res.status(400).json({ error: 'date_required' })
  const result = await historyAggregate(Number(req.params.chainNumber), date, date)
  res.json({ date, total: result.total, recordsCount: result.recordsCount })
})

publicRouter.get('/chains/:chainNumber/history/range', async (req, res) => {
  const { from, to } = req.query
  if (!from || !to) return res.status(400).json({ error: 'from_and_to_required' })
  res.json(await historyAggregate(Number(req.params.chainNumber), from, to))
})

publicRouter.get('/chains/:chainNumber/history/months', async (req, res) => {
  const fromYear = Number(req.query.fromYear)
  const fromMonth = Number(req.query.fromMonth)
  const toYear = Number(req.query.toYear)
  const toMonth = Number(req.query.toMonth)
  if (!fromYear || !fromMonth || !toYear || !toMonth) {
    return res.status(400).json({ error: 'from_and_to_year_month_required' })
  }
  const fromDate = `${fromYear}-${String(fromMonth).padStart(2, '0')}-01`
  const lastDay = new Date(Date.UTC(toYear, toMonth, 0)).getUTCDate()
  const toDate = `${toYear}-${String(toMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
  res.json(await historyAggregate(Number(req.params.chainNumber), fromDate, toDate))
})
