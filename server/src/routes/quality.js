import { Router } from 'express'
import { nanoid } from 'nanoid'
import { get, all, run, logAudit } from '../db/index.js'
import { requireDept } from '../auth.js'
import { todayInFactoryTZ, computeQualityPct } from '../calc.js'
import { getWorkHours } from '../workHours.js'
import { getHourlyEntryTargets } from '../openModels.js'

export const qualityRouter = Router()
qualityRouter.use(requireDept('quality'))

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

// A specific day's hourly "Pièces retouche" (defaults to today), joined
// against Agent Production's real qty for the same chain/date/slot so each
// row can show its own computed Qualité% — never a manual entry. Selectable
// entries for this chain: this model's own Couleur/Variante variants PLUS,
// since a chain overlap is real (see openModels.js), any OTHER root model
// still open on the same chain (and that root's own variants too) — same
// generalization as Agent Production's own GET /hourly. For each entry, qty
// and pieceRetouche are summed by model_id first (so two entries logging
// the same hour combine correctly into the chain-wide qty/Qualité% instead
// of one silently overwriting the other — see quality_history's widened
// unique key in db/index.js), and each slot also carries a byModel
// breakdown with its OWN per-entry Qualité%. Omitted entirely when there's
// only one entry, so a normal (single-model, no-color) chain's response
// shape is unchanged.
qualityRouter.get('/models/:id/hourly', async (req, res) => {
  const model = await get('SELECT id, chain_number FROM models WHERE id = $1', [req.params.id])
  if (!model) return res.status(404).json({ error: 'not_found' })

  const date = String(req.query.date || todayInFactoryTZ())
  if (!DATE_RE.test(date)) return res.status(400).json({ error: 'invalid_date' })

  const [entries, workHours] = await Promise.all([getHourlyEntryTargets(model), getWorkHours()])
  const hasEntries = entries.length > 1
  const entryIds = entries.map((e) => e.modelId)

  // Both restricted to exactly this chain's current entries (model_id =
  // ANY(...)) — chain_number alone would also pick up a previous, now-
  // finished/unrelated model's leftover rows on the same chain (see the
  // identical fix in fullDashboard(), routes/public.js, and in Agent
  // Production's own GET /hourly, routes/production.js).
  const [productionRows, retoucheRows] = await Promise.all([
    all('SELECT slot_index, model_id, qty FROM production_history WHERE chain_number = $1 AND date = $2 AND model_id = ANY($3)', [
      model.chain_number,
      date,
      entryIds,
    ]),
    all(
      'SELECT slot_index, model_id, piece_retouche FROM quality_history WHERE chain_number = $1 AND date = $2 AND model_id = ANY($3)',
      [model.chain_number, date, entryIds]
    ),
  ])

  const qtyMap = {}
  const qtyByModel = {}
  for (const r of productionRows) {
    qtyMap[r.slot_index] = (qtyMap[r.slot_index] || 0) + r.qty
    if (hasEntries) {
      qtyByModel[r.slot_index] ??= {}
      qtyByModel[r.slot_index][r.model_id] = r.qty
    }
  }
  const retoucheMap = {}
  const retoucheByModel = {}
  for (const r of retoucheRows) {
    retoucheMap[r.slot_index] = (retoucheMap[r.slot_index] || 0) + r.piece_retouche
    if (hasEntries) {
      retoucheByModel[r.slot_index] ??= {}
      retoucheByModel[r.slot_index][r.model_id] = r.piece_retouche
    }
  }

  const hourly = workHours.map((s) => {
    const qty = qtyMap[s.index] || 0
    const pieceRetouche = retoucheMap[s.index] || 0
    const base = { ...s, qty, pieceRetouche, qualityPct: computeQualityPct(qty, pieceRetouche) }
    if (!hasEntries) return base
    const qtyPresent = qtyByModel[s.index] || {}
    const retouchePresent = retoucheByModel[s.index] || {}
    return {
      ...base,
      byModel: entries.map((e) => {
        const entryQty = qtyPresent[e.modelId] || 0
        const entryRetouche = retouchePresent[e.modelId] || 0
        return { modelId: e.modelId, label: e.label, qty: entryQty, pieceRetouche: entryRetouche, qualityPct: computeQualityPct(entryQty, entryRetouche) }
      }),
    }
  })
  res.json({ date, hourly, variants: entries.slice(1).map((e) => ({ id: e.modelId, label: e.label })) })
})

// Every hourly "Pièces retouche" entry — today's or a previous day's — is
// written straight to quality_history, the single source of truth for it
// (same architecture as production_history — see routes/production.js).
// Couleur/Variante: an entry can target a specific colour (targetModelId =
// that variant's id) instead of the chain's root model — same mechanism as
// Agent Production's hourly PUT — defaulting to the root itself, so a
// normal (single-colour) model's request is unchanged.
qualityRouter.put('/models/:id/hourly/:slotIndex', async (req, res) => {
  const { id, slotIndex } = req.params
  const pieceRetouche = Math.max(0, Number(req.body?.pieceRetouche) || 0)
  const idx = Number(slotIndex)

  const model = await get('SELECT chain_number, debut FROM models WHERE id = $1', [id])
  if (!model) return res.status(404).json({ error: 'not_found' })

  const workHours = await getWorkHours()
  if (idx < 0 || idx >= workHours.length) return res.status(400).json({ error: 'invalid_slot' })

  // An entry can target ANY other model sharing this chain — its own
  // Couleur/Variante variants, or (a chain overlap — see openModels.js) a
  // completely independent sibling root model also open on this chain, or
  // that sibling's own variants. The target's OWN début is what's
  // validated below (not `:id`'s) — an overlapping model can genuinely
  // start later than whatever's already running on the same chain.
  const targetModelId = req.body?.targetModelId || id
  let targetModel = model
  if (targetModelId !== id) {
    targetModel = await get('SELECT debut FROM models WHERE id = $1 AND chain_number = $2', [targetModelId, model.chain_number])
    if (!targetModel) return res.status(400).json({ error: 'invalid_target_model' })
  }

  const today = todayInFactoryTZ()
  const date = String(req.body?.date || today)
  if (!DATE_RE.test(date)) return res.status(400).json({ error: 'invalid_date' })
  if (date > today) return res.status(400).json({ error: 'date_in_future' })
  if (targetModel.debut && date < targetModel.debut) return res.status(400).json({ error: 'date_before_debut' })

  const now = new Date().toISOString()
  // Backdated edits (any date other than today) are flagged explicitly in
  // the audit trail, same as Agent Production's hourly entry — an auditor
  // needs to see exactly where a retroactive change was made.
  const isBackdated = date !== today
  await Promise.all([
    run(
      `INSERT INTO quality_history (id, model_id, chain_number, date, slot_index, piece_retouche, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $7)
       ON CONFLICT (chain_number, date, slot_index, model_id)
         DO UPDATE SET piece_retouche = excluded.piece_retouche, updated_at = excluded.updated_at`,
      [`qh_${nanoid(10)}`, targetModelId, model.chain_number, date, idx, pieceRetouche, now]
    ),
    logAudit({
      deptKey: 'quality',
      modelId: targetModelId,
      action: 'update_quality_hourly',
      details: { slotIndex: idx, pieceRetouche, date, isBackdated },
    }),
  ])
  res.json({ ok: true, date, isBackdated })
})

// Reprises stays a single, manually maintained running figure — separate
// from "Pièces retouche" above and unaffected by the date picker (same role
// as "Total entré" on Agent Production's screen). Qualité% ("percentage")
// is never written here or anywhere else — always computed live.
qualityRouter.put('/models/:id', async (req, res) => {
  const { id } = req.params
  const reprises = Math.max(0, Number(req.body?.reprises) || 0)
  const now = new Date().toISOString()
  await Promise.all([
    run(
      `INSERT INTO quality (model_id, reprises, updated_at) VALUES ($1, $2, $3)
       ON CONFLICT (model_id) DO UPDATE SET reprises = excluded.reprises, updated_at = excluded.updated_at`,
      [id, reprises, now]
    ),
    logAudit({ deptKey: 'quality', modelId: id, action: 'update_reprises', details: { reprises } }),
  ])
  res.json({ ok: true })
})
