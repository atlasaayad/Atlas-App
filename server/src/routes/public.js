import { Router } from 'express'
import { db } from '../db/index.js'
import { verifyPin, issueToken } from '../auth.js'
import { DEPARTMENTS, CHAIN_NUMBERS, HOURLY_SLOTS, SPECIALTIES, GENERIC_POSTE_DEPARTMENTS } from '../constants.js'
import { computeObjectifJour, prodAMaintenant } from '../calc.js'

export const publicRouter = Router()

publicRouter.get('/config', (req, res) => {
  const row = db.prepare('SELECT value FROM config WHERE key = ?').get('company_name')
  res.json({ companyName: row?.value || 'ATLAS' })
})

publicRouter.get('/departments', (req, res) => {
  res.json(DEPARTMENTS)
})

publicRouter.post('/auth/:deptKey/login', (req, res) => {
  const { deptKey } = req.params
  const { pin } = req.body || {}
  if (!pin) return res.status(400).json({ error: 'pin_required' })
  const dept = verifyPin(deptKey, pin)
  if (!dept) return res.status(401).json({ error: 'invalid_pin' })
  const token = issueToken(deptKey)
  res.json({ token, dept: deptKey })
})

publicRouter.get('/models', (req, res) => {
  const rows = db
    .prepare('SELECT id, client, dessin, chain_number, active FROM models WHERE active = 1 ORDER BY chain_number')
    .all()
  res.json(rows)
})

publicRouter.get('/chains', (req, res) => {
  const active = db
    .prepare('SELECT id, client, dessin, chain_number FROM models WHERE active = 1')
    .all()
  const byChain = Object.fromEntries(active.map((m) => [m.chain_number, m]))
  res.json(CHAIN_NUMBERS.map((n) => ({ chainNumber: n, model: byChain[n] || null })))
})

publicRouter.get('/models/:id', (req, res) => {
  const model = db.prepare('SELECT * FROM models WHERE id = ?').get(req.params.id)
  if (!model) return res.status(404).json({ error: 'not_found' })
  const gamme = db.prepare('SELECT * FROM gamme_lines WHERE model_id = ? ORDER BY seq_no').all(model.id)
  const effectifRows = db.prepare('SELECT * FROM effectif_requis WHERE model_id = ?').all(model.id)
  const effectif = Object.fromEntries(SPECIALTIES.map((s) => [s, 0]))
  for (const r of effectifRows) effectif[r.specialty] = r.required
  res.json({ ...model, gamme, effectif })
})

function fullDashboard(model) {
  const gamme = db.prepare('SELECT * FROM gamme_lines WHERE model_id = ? ORDER BY seq_no').all(model.id)
  const effectifRows = db.prepare('SELECT * FROM effectif_requis WHERE model_id = ?').all(model.id)
  const effectifRequis = Object.fromEntries(SPECIALTIES.map((s) => [s, 0]))
  for (const r of effectifRows) effectifRequis[r.specialty] = r.required

  const hourlyRows = db.prepare('SELECT * FROM hourly_production WHERE model_id = ?').all(model.id)
  const hourlyMap = Object.fromEntries(hourlyRows.map((r) => [r.slot_index, r.qty]))
  const hourly = HOURLY_SLOTS.map((s) => ({ ...s, qty: hourlyMap[s.index] || 0, pct: model.dt > 0 ? Math.round(((hourlyMap[s.index] || 0) / model.dt) * 100) : 0 }))

  const totals = db.prepare('SELECT * FROM production_totals WHERE model_id = ?').get(model.id) || { total_entree: 0, total_sortie: 0 }
  const demande = Math.round(computeObjectifJour(model.dt))
  const produit = prodAMaintenant(hourlyMap)
  const restant = Math.max(demande - produit, 0)
  const enCours = totals.total_entree - totals.total_sortie

  const rhRows = db.prepare('SELECT * FROM rh_attendance WHERE model_id = ?').all(model.id)
  const present = Object.fromEntries(SPECIALTIES.map((s) => [s, 0]))
  for (const r of rhRows) present[r.specialty] = r.present
  const effectifs = SPECIALTIES.map((s) => ({ specialty: s, present: present[s] || 0, required: effectifRequis[s] || 0 }))
  const ouvriersPresents = effectifs.reduce((s, e) => s + e.present, 0)

  const quality = db.prepare('SELECT * FROM quality WHERE model_id = ?').get(model.id) || { percentage: 0, reprises: 0 }
  const finale = db.prepare('SELECT * FROM finale WHERE model_id = ?').get(model.id) || { en_cours: 0 }
  const depot = db.prepare('SELECT * FROM depot WHERE model_id = ?').get(model.id) || { total_pieces: 0 }
  const exports = db
    .prepare('SELECT * FROM logistics_exports WHERE model_id = ? ORDER BY date')
    .all(model.id)
    .map((e) => ({ ...e, client: model.client, mod: model.dessin }))

  const postes = db.prepare('SELECT * FROM poste_status WHERE model_id = ?').all(model.id)
  const posteMap = Object.fromEntries(postes.map((p) => [p.dept_key, p]))
  const etatDesPostes = GENERIC_POSTE_DEPARTMENTS.map((key) => {
    const p = posteMap[key]
    const pct = p?.percentage ?? 100
    const status = pct >= 90 ? 'good' : pct >= 70 ? 'warn' : 'bad'
    return { deptKey: key, percentage: pct, note: p?.note || '', status }
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
      totalSortie: totals.total_sortie,
      leReste: restant,
      enCours,
    },
    finaleEnCours: finale.en_cours,
    depotTotal: depot.total_pieces,
    exports,
    objectifAtteintPct,
    quality: { percentage: quality.percentage, reprises: quality.reprises },
    etatDesPostes,
    effectifs,
  }
}

publicRouter.get('/models/:id/dashboard', (req, res) => {
  const model = db.prepare('SELECT * FROM models WHERE id = ?').get(req.params.id)
  if (!model) return res.status(404).json({ error: 'not_found' })
  res.json(fullDashboard(model))
})

publicRouter.get('/chains/:chainNumber/dashboard', (req, res) => {
  const model = db
    .prepare('SELECT * FROM models WHERE chain_number = ? AND active = 1')
    .get(Number(req.params.chainNumber))
  if (!model) return res.status(404).json({ error: 'no_active_model' })
  res.json(fullDashboard(model))
})
