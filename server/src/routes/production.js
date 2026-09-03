import { Router } from 'express'
import { nanoid } from 'nanoid'
import { get, all, run, logAudit } from '../db/index.js'
import { requireDept } from '../auth.js'
import { todayInFactoryTZ } from '../calc.js'
import { HOURLY_SLOTS } from '../constants.js'

export const productionRouter = Router()
productionRouter.use(requireDept('production'))

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

// A specific day's hourly slots (defaults to today) — lets Agent Production
// load a previous day's entries for review/correction, not just today's.
productionRouter.get('/models/:id/hourly', async (req, res) => {
  const model = await get('SELECT chain_number FROM models WHERE id = $1', [req.params.id])
  if (!model) return res.status(404).json({ error: 'not_found' })

  const date = String(req.query.date || todayInFactoryTZ())
  if (!DATE_RE.test(date)) return res.status(400).json({ error: 'invalid_date' })

  const rows = await all(
    'SELECT slot_index, qty FROM production_history WHERE chain_number = $1 AND date = $2',
    [model.chain_number, date]
  )
  const hourlyMap = Object.fromEntries(rows.map((r) => [r.slot_index, r.qty]))
  const hourly = HOURLY_SLOTS.map((s) => ({ ...s, qty: hourlyMap[s.index] || 0 }))
  res.json({ date, hourly })
})

// Every hourly entry — today's or a previous day's — is written straight to
// production_history, the single source of truth for hourly data (see the
// comment on that table). There is no separate "today" table to also keep
// in sync, so a corrected past day is immediately reflected everywhere that
// reads production data: the live dashboard (when the edited date is
// today), Historique, exports, and the early-warning agent.
productionRouter.put('/models/:id/hourly/:slotIndex', async (req, res) => {
  const { id, slotIndex } = req.params
  const qty = Number(req.body?.qty) || 0
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
  // Backdated edits (any date other than today) get flagged explicitly in
  // the audit trail, distinct from ordinary same-day entry — an auditor
  // (BSCI/SMETA or otherwise) needs to see exactly where a retroactive
  // change was made, not just that "production was updated".
  const isBackdated = date !== today
  // The history write and the audit-log write are independent inserts (the
  // audit entry doesn't need the history row to exist first) — firing them
  // together instead of one after another halves this route's DB round
  // trips, which matters on every keystroke-triggered save from the factory
  // floor, often over a slow/cold connection.
  await Promise.all([
    run(
      `INSERT INTO production_history (id, model_id, chain_number, date, slot_index, qty, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $7)
       ON CONFLICT (chain_number, date, slot_index)
         DO UPDATE SET qty = excluded.qty, model_id = excluded.model_id, updated_at = excluded.updated_at`,
      [`ph_${nanoid(10)}`, id, model.chain_number, date, idx, qty, now]
    ),
    logAudit({ deptKey: 'production', modelId: id, action: 'update_hourly', details: { slotIndex: idx, qty, date, isBackdated } }),
  ])
  res.json({ ok: true, date, isBackdated })
})

// Total sortie is never written here — it is auto-computed on read from
// production_history (same running-sum logic as "Prod à maintenant"). Only
// Total entré is a manual figure, entered once per day by Agent Production,
// and always refers to today — the date picker above the hourly table does
// not apply to it.
productionRouter.put('/models/:id/totals', async (req, res) => {
  const { id } = req.params
  const totalEntree = Number(req.body?.totalEntree) || 0
  const now = new Date().toISOString()
  await Promise.all([
    run(
      `INSERT INTO production_totals (model_id, total_entree, updated_at) VALUES ($1, $2, $3)
       ON CONFLICT (model_id) DO UPDATE SET total_entree = excluded.total_entree, updated_at = excluded.updated_at`,
      [id, totalEntree, now]
    ),
    logAudit({ deptKey: 'production', modelId: id, action: 'update_totals', details: { totalEntree } }),
  ])
  res.json({ ok: true })
})
