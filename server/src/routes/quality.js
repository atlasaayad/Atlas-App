import { Router } from 'express'
import { nanoid } from 'nanoid'
import { get, all, run, logAudit } from '../db/index.js'
import { requireDept } from '../auth.js'
import { todayInFactoryTZ, computeQualityPct } from '../calc.js'
import { HOURLY_SLOTS } from '../constants.js'

export const qualityRouter = Router()
qualityRouter.use(requireDept('quality'))

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

// A specific day's hourly "Pièces retouche" (defaults to today), joined
// against Agent Production's real qty for the same chain/date/slot so each
// row can show its own computed Qualité% — never a manual entry.
qualityRouter.get('/models/:id/hourly', async (req, res) => {
  const model = await get('SELECT chain_number FROM models WHERE id = $1', [req.params.id])
  if (!model) return res.status(404).json({ error: 'not_found' })

  const date = String(req.query.date || todayInFactoryTZ())
  if (!DATE_RE.test(date)) return res.status(400).json({ error: 'invalid_date' })

  const [productionRows, retoucheRows] = await Promise.all([
    all('SELECT slot_index, qty FROM production_history WHERE chain_number = $1 AND date = $2', [model.chain_number, date]),
    all('SELECT slot_index, piece_retouche FROM quality_history WHERE chain_number = $1 AND date = $2', [model.chain_number, date]),
  ])
  const qtyMap = Object.fromEntries(productionRows.map((r) => [r.slot_index, r.qty]))
  const retoucheMap = Object.fromEntries(retoucheRows.map((r) => [r.slot_index, r.piece_retouche]))
  const hourly = HOURLY_SLOTS.map((s) => {
    const qty = qtyMap[s.index] || 0
    const pieceRetouche = retoucheMap[s.index] || 0
    return { ...s, qty, pieceRetouche, qualityPct: computeQualityPct(qty, pieceRetouche) }
  })
  res.json({ date, hourly })
})

// Every hourly "Pièces retouche" entry — today's or a previous day's — is
// written straight to quality_history, the single source of truth for it
// (same architecture as production_history — see routes/production.js).
qualityRouter.put('/models/:id/hourly/:slotIndex', async (req, res) => {
  const { id, slotIndex } = req.params
  const pieceRetouche = Math.max(0, Number(req.body?.pieceRetouche) || 0)
  const idx = Number(slotIndex)
  if (idx < 0 || idx > 8) return res.status(400).json({ error: 'invalid_slot' })

  const model = await get('SELECT chain_number, debut FROM models WHERE id = $1', [id])
  if (!model) return res.status(404).json({ error: 'not_found' })

  const today = todayInFactoryTZ()
  const date = String(req.body?.date || today)
  if (!DATE_RE.test(date)) return res.status(400).json({ error: 'invalid_date' })
  if (date > today) return res.status(400).json({ error: 'date_in_future' })
  if (model.debut && date < model.debut) return res.status(400).json({ error: 'date_before_debut' })

  const now = new Date().toISOString()
  // Backdated edits (any date other than today) are flagged explicitly in
  // the audit trail, same as Agent Production's hourly entry — an auditor
  // needs to see exactly where a retroactive change was made.
  const isBackdated = date !== today
  await Promise.all([
    run(
      `INSERT INTO quality_history (id, model_id, chain_number, date, slot_index, piece_retouche, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $7)
       ON CONFLICT (chain_number, date, slot_index)
         DO UPDATE SET piece_retouche = excluded.piece_retouche, model_id = excluded.model_id, updated_at = excluded.updated_at`,
      [`qh_${nanoid(10)}`, id, model.chain_number, date, idx, pieceRetouche, now]
    ),
    logAudit({ deptKey: 'quality', modelId: id, action: 'update_quality_hourly', details: { slotIndex: idx, pieceRetouche, date, isBackdated } }),
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
