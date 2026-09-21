import { Router } from 'express'
import { nanoid } from 'nanoid'
import { all, get, run, logAudit } from '../db/index.js'
import { requireDept } from '../auth.js'
import { SPECIALTIES, DELAY_REASONS, HOURLY_SLOTS } from '../constants.js'
import { computeVTMinutes, computeDT, computeLaunchTimerState, todayInFactoryTZ } from '../calc.js'
import { saveAttendance, getAttendanceForDate, DATE_RE } from '../attendanceShared.js'
import { getPlanningSummary } from '../planning.js'

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

// Create a new model and assign it to a chain. Does NOT deactivate/replace
// whatever was already running there — a chain overlap (a model's Entré
// reaching its target while it's still mid-process/exiting, and a new model
// starting to be fed in at the same time) is real, ordinary factory
// operation, not an exception to design around. The new model gets its own
// completely independent gamme/effectif/VT/DT — it never shares anything
// with whatever else is running on the chain (that's the difference from a
// Couleur/Variante variant, which deliberately DOES share its root's
// gamme). See openModels.js for how "which models are this chain's current
// work" is resolved — the answer to that is what changed, not model
// creation itself. A model, once created, simply stays `active=1` forever;
// there is no manual "close/archive" action anywhere — see
// isModelFinished() in openModels.js for how it naturally drops out of
// consideration once its own Entré has reached target and En cours hits 0.
methodeRouter.post('/models', async (req, res) => {
  const { client, qteTotale, debut, finPrevue, dessin, commande, chainNumber } = req.body || {}
  if (!client || !chainNumber) return res.status(400).json({ error: 'client_and_chain_required' })

  const now = new Date().toISOString()
  const id = `mdl_${nanoid(10)}`

  await run(
    `INSERT INTO models (id, client, qte_totale, debut, fin_prevue, dessin, commande, chain_number, active, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 1, $9, $9)`,
    [id, client, qteTotale || 0, debut || null, finPrevue || null, dessin || null, commande || 0, chainNumber, now]
  )

  // No hourly_production seeding — production_history has no rows yet for
  // this brand-new model, and an absent row already reads back as qty 0
  // wherever hourly data is displayed, so there's nothing to pre-create.
  const effectifRows = buildBulkInsert(SPECIALTIES.map((spec) => [id, spec, 0]))
  await Promise.all([
    run(`INSERT INTO effectif_requis (model_id, specialty, required) VALUES ${effectifRows.valuesSql}`, effectifRows.params),
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

// Couleur/Variante — a second (third, ...) color of the exact same model,
// same gamme/VT/DT/effectif (the manufacturing process and shared line
// don't change per color), own Qté totale + own production_totals/
// production_history entries. Only a root model (parent_model_id IS NULL)
// can have variants — no nesting. Gamme/effectif are never copied onto the
// variant row: nothing ever reads them from a variant, since VT/DT/ND stay
// the root's alone (see the "models" table comment in db/index.js).
methodeRouter.post('/models/:id/variants', async (req, res) => {
  const parent = await get('SELECT id, client, dessin, chain_number, parent_model_id FROM models WHERE id = $1', [req.params.id])
  if (!parent) return res.status(404).json({ error: 'not_found' })
  if (parent.parent_model_id) return res.status(400).json({ error: 'cannot_nest_variants' })

  const { label, qteTotale } = req.body || {}
  if (!label) return res.status(400).json({ error: 'label_required' })

  const now = new Date().toISOString()
  const id = `mdl_${nanoid(10)}`
  await run(
    `INSERT INTO models (id, client, qte_totale, dessin, chain_number, active, parent_model_id, variant_label, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, 1, $6, $7, $8, $8)`,
    [id, parent.client, Number(qteTotale) || 0, parent.dessin, parent.chain_number, parent.id, label, now]
  )
  await run('INSERT INTO production_totals (model_id, total_entree, total_sortie, updated_at) VALUES ($1, 0, 0, $2)', [id, now])

  await logAudit({ deptKey: 'methode', modelId: id, action: 'create_variant', details: { parentModelId: parent.id, label, qteTotale } })
  res.status(201).json({ id })
})

// Edit a variant's own label/Qté totale — never its gamme/effectif (there is
// none to edit; it has always used the parent's).
methodeRouter.put('/models/:id/variants/:variantId', async (req, res) => {
  const variant = await get('SELECT id FROM models WHERE id = $1 AND parent_model_id = $2', [req.params.variantId, req.params.id])
  if (!variant) return res.status(404).json({ error: 'not_found' })
  const { label, qteTotale } = req.body || {}
  if (!label) return res.status(400).json({ error: 'label_required' })
  await run('UPDATE models SET variant_label = $1, qte_totale = $2, updated_at = $3 WHERE id = $4', [
    label,
    Number(qteTotale) || 0,
    new Date().toISOString(),
    req.params.variantId,
  ])
  await logAudit({ deptKey: 'methode', modelId: req.params.variantId, action: 'update_variant', details: { label, qteTotale } })
  res.json({ ok: true })
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

// Actual daily headcount present, per specialty — for the Rendement_Production%
// calculation (see fullDashboard() in routes/public.js). Agent Méthode is now
// the primary owner of this figure (previously RH-only); RH keeps the same
// endpoint as a backup — both write to the exact same rh_attendance_history
// row for the given date, so whichever department saves most recently for
// that date is automatically what's used. A specific date can be targeted
// (same backdating pattern as Agent Production's/Quality's hourly entry) —
// see saveAttendance() in attendanceShared.js for exactly what a backdated
// save does and doesn't touch.
methodeRouter.put('/models/:id/attendance', async (req, res) => {
  const result = await saveAttendance({
    deptKey: 'methode',
    id: req.params.id,
    attendance: req.body?.attendance || {},
    date: req.body?.date,
  })
  if (!result.ok) return res.status(result.error === 'not_found' ? 404 : 400).json({ error: result.error })
  res.json(result)
})

// A specific day's Présence per specialty — today's or any previous day's.
methodeRouter.get('/models/:id/attendance', async (req, res) => {
  const model = await get('SELECT chain_number FROM models WHERE id = $1', [req.params.id])
  if (!model) return res.status(404).json({ error: 'not_found' })
  const date = String(req.query.date || todayInFactoryTZ())
  if (!DATE_RE.test(date)) return res.status(400).json({ error: 'invalid_date' })
  const attendance = await getAttendanceForDate(model.chain_number, date)
  res.json({ date, attendance })
})

// Planning — the hourly production PLAN Agent Méthode enters ahead of real
// production, one day at a time, so Home can show Plan vs Réel (see
// planning.js). Unlike Agent Production's/Quality's hourly entry, dates
// here are NOT capped at today — planning ahead is the entire point, so
// tomorrow/next week are valid targets; only a date before Début is
// rejected (nothing is planned before the model even starts).
methodeRouter.get('/models/:id/planning', async (req, res) => {
  const model = await get('SELECT id, qte_totale, debut FROM models WHERE id = $1', [req.params.id])
  if (!model) return res.status(404).json({ error: 'not_found' })

  const date = String(req.query.date || model.debut || todayInFactoryTZ())
  if (!DATE_RE.test(date)) return res.status(400).json({ error: 'invalid_date' })

  const [rows, summary] = await Promise.all([
    all('SELECT slot_index, qty FROM planning_hourly WHERE model_id = $1 AND date = $2', [req.params.id, date]),
    getPlanningSummary(model),
  ])
  const byIndex = Object.fromEntries(rows.map((r) => [r.slot_index, r.qty]))
  // A slot with no row is `qty: null` (never a fake 0) — the client leaves
  // its input blank rather than showing an unplanned hour as "0 planned".
  const hourly = HOURLY_SLOTS.map((s) => ({ ...s, qty: s.index in byIndex ? byIndex[s.index] : null }))

  res.json({ date, hourly, qteTotale: model.qte_totale || 0, totalPlanned: summary.totalPlanned, expectedFinishDate: summary.expectedFinishDate })
})

// Bulk-saves one full day's plan in a single request (9 slots at once) —
// Agent Méthode fills in a whole day, then one "Enregistrer", not a
// per-hour OK button like live production entry (there's no time pressure
// planning ahead, unlike logging what just happened on the floor). Each
// slot's qty is either a number (upsert) or null (delete — clears a
// previously-planned hour back to "not planned", never a fake 0).
methodeRouter.put('/models/:id/planning/:date', async (req, res) => {
  const { id, date } = req.params
  if (!DATE_RE.test(date)) return res.status(400).json({ error: 'invalid_date' })

  const model = await get('SELECT id, chain_number, debut FROM models WHERE id = $1', [id])
  if (!model) return res.status(404).json({ error: 'not_found' })
  if (model.debut && date < model.debut) return res.status(400).json({ error: 'date_before_debut' })

  const hourly = Array.isArray(req.body?.hourly) ? req.body.hourly : []
  const now = new Date().toISOString()
  await Promise.all(
    hourly
      .filter((h) => h && Number.isInteger(h.index) && h.index >= 0 && h.index <= 8)
      .map((h) => {
        if (h.qty === null || h.qty === '' || h.qty === undefined) {
          return run('DELETE FROM planning_hourly WHERE model_id = $1 AND date = $2 AND slot_index = $3', [id, date, h.index])
        }
        return run(
          `INSERT INTO planning_hourly (id, model_id, chain_number, date, slot_index, qty, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $7)
           ON CONFLICT (model_id, date, slot_index)
             DO UPDATE SET qty = excluded.qty, updated_at = excluded.updated_at`,
          [`plh_${nanoid(10)}`, id, model.chain_number, date, h.index, Math.max(0, Number(h.qty) || 0), now]
        )
      })
  )

  const summary = await getPlanningSummary(await get('SELECT id, qte_totale FROM models WHERE id = $1', [id]))
  await logAudit({ deptKey: 'methode', modelId: id, action: 'update_planning_hourly', details: { date, hourly } })
  res.json({ ok: true, date, totalPlanned: summary.totalPlanned, expectedFinishDate: summary.expectedFinishDate })
})

const DELAY_REASON_CODES = new Set(DELAY_REASONS.map((r) => r.code))

// "Temps de lancement" config — Objectif (heures) + the team names shown
// with every new model/launch. Editable any time before the timer is
// stopped (Démarrer/Arrêter below are separate actions, not touched here).
methodeRouter.put('/models/:id/launch-timer', async (req, res) => {
  const model = await get('SELECT id FROM models WHERE id = $1', [req.params.id])
  if (!model) return res.status(404).json({ error: 'not_found' })
  const { objectifHeures, groupeLancement, agentMethode, mecanicien, electriciens, agentQuality, chefChaine } = req.body || {}
  const now = new Date().toISOString()
  await run(
    `INSERT INTO launch_timer (model_id, objectif_heures, groupe_lancement, agent_methode, mecanicien, electriciens, agent_quality, chef_chaine, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (model_id) DO UPDATE SET
       objectif_heures = excluded.objectif_heures, groupe_lancement = excluded.groupe_lancement,
       agent_methode = excluded.agent_methode, mecanicien = excluded.mecanicien,
       electriciens = excluded.electriciens, agent_quality = excluded.agent_quality,
       chef_chaine = excluded.chef_chaine, updated_at = excluded.updated_at`,
    [req.params.id, Math.max(0, Number(objectifHeures) || 0), groupeLancement || null, agentMethode || null, mecanicien || null, electriciens || null, agentQuality || null, chefChaine || null, now]
  )
  await logAudit({ deptKey: 'methode', modelId: req.params.id, action: 'update_launch_timer_config', details: req.body })
  res.json({ ok: true })
})

// ▶️ Démarrer — starts the countdown from Objectif (heures). Only allowed
// once (a model/launch has exactly one timer), and only after Objectif has
// actually been set to something real.
methodeRouter.post('/models/:id/launch-timer/start', async (req, res) => {
  const timer = await get('SELECT * FROM launch_timer WHERE model_id = $1', [req.params.id])
  if (!timer) return res.status(400).json({ error: 'launch_timer_not_configured' })
  if (timer.started_at) return res.status(400).json({ error: 'already_started' })
  if (!timer.objectif_heures || timer.objectif_heures <= 0) return res.status(400).json({ error: 'objectif_required' })

  const now = new Date().toISOString()
  await run('UPDATE launch_timer SET started_at = $1, updated_at = $1 WHERE model_id = $2', [now, req.params.id])
  await logAudit({ deptKey: 'methode', modelId: req.params.id, action: 'start_launch_timer', details: { objectifHeures: timer.objectif_heures, startedAt: now } })
  res.json({ ok: true, startedAt: now })
})

// ⏹ Arrêter / Première pièce terminée — stops the countdown. If it had
// already gone into overrun (red, counting up past Objectif), the person
// responsible and a reason are required before the stop is accepted — this
// is enforced server-side, not just in the UI, so it can never be skipped.
methodeRouter.post('/models/:id/launch-timer/stop', async (req, res) => {
  const timer = await get('SELECT * FROM launch_timer WHERE model_id = $1', [req.params.id])
  if (!timer) return res.status(400).json({ error: 'launch_timer_not_configured' })
  if (!timer.started_at) return res.status(400).json({ error: 'not_started' })
  if (timer.stopped_at) return res.status(400).json({ error: 'already_stopped' })

  const now = new Date().toISOString()
  const state = computeLaunchTimerState({ objectifHeures: timer.objectif_heures, startedAt: timer.started_at, stoppedAt: now })

  const { responsible, reasonCode, reasonComment } = req.body || {}
  if (state.status === 'stopped_overrun') {
    if (!responsible || !reasonCode) return res.status(400).json({ error: 'responsible_and_reason_required' })
    if (!DELAY_REASON_CODES.has(reasonCode)) return res.status(400).json({ error: 'invalid_reason_code' })
  }

  const finalResponsible = state.status === 'stopped_overrun' ? responsible : null
  const finalReasonCode = state.status === 'stopped_overrun' ? reasonCode : null
  const finalReasonComment = state.status === 'stopped_overrun' ? reasonComment || null : null

  await run(
    'UPDATE launch_timer SET stopped_at = $1, responsible = $2, reason_code = $3, reason_comment = $4, updated_at = $1 WHERE model_id = $5',
    [now, finalResponsible, finalReasonCode, finalReasonComment, req.params.id]
  )
  await logAudit({
    deptKey: 'methode',
    modelId: req.params.id,
    action: 'stop_launch_timer',
    details: {
      stoppedAt: now,
      elapsedSeconds: state.elapsedSeconds,
      overrun: state.status === 'stopped_overrun',
      overrunSeconds: state.overrunSeconds,
      responsible: finalResponsible,
      reasonCode: finalReasonCode,
      reasonComment: finalReasonComment,
    },
  })
  res.json({ ok: true, stoppedAt: now, overrun: state.status === 'stopped_overrun' })
})
