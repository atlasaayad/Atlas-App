import { Router } from 'express'
import { nanoid } from 'nanoid'
import { get, run, logAudit } from '../db/index.js'
import { requireDept } from '../auth.js'
import { todayInFactoryTZ } from '../calc.js'

export const productionRouter = Router()
productionRouter.use(requireDept('production'))

productionRouter.put('/models/:id/hourly/:slotIndex', async (req, res) => {
  const { id, slotIndex } = req.params
  const qty = Number(req.body?.qty) || 0
  const idx = Number(slotIndex)
  if (idx < 0 || idx > 8) return res.status(400).json({ error: 'invalid_slot' })
  const now = new Date().toISOString()

  await run(
    `INSERT INTO hourly_production (model_id, slot_index, qty, updated_at) VALUES ($1, $2, $3, $4)
     ON CONFLICT (model_id, slot_index) DO UPDATE SET qty = excluded.qty, updated_at = excluded.updated_at`,
    [id, idx, qty, now]
  )

  // Permanent history record, keyed by chain + today's date (factory TZ) —
  // never overwritten by a different day, only ever corrected in place if
  // this same hour is re-saved later today.
  const model = await get('SELECT chain_number FROM models WHERE id = $1', [id])
  if (model) {
    const today = todayInFactoryTZ()
    await run(
      `INSERT INTO production_history (id, model_id, chain_number, date, slot_index, qty, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $7)
       ON CONFLICT (chain_number, date, slot_index)
         DO UPDATE SET qty = excluded.qty, model_id = excluded.model_id, updated_at = excluded.updated_at`,
      [`ph_${nanoid(10)}`, id, model.chain_number, today, idx, qty, now]
    )
  }

  await logAudit({ deptKey: 'production', modelId: id, action: 'update_hourly', details: { slotIndex: idx, qty } })
  res.json({ ok: true })
})

// Total sortie is never written here — it is auto-computed on read from
// hourly_production (same running-sum logic as "Prod à maintenant"). Only
// Total entré is a manual figure, entered once per day by Agent Production.
productionRouter.put('/models/:id/totals', async (req, res) => {
  const { id } = req.params
  const totalEntree = Number(req.body?.totalEntree) || 0
  const now = new Date().toISOString()
  await run(
    `INSERT INTO production_totals (model_id, total_entree, updated_at) VALUES ($1, $2, $3)
     ON CONFLICT (model_id) DO UPDATE SET total_entree = excluded.total_entree, updated_at = excluded.updated_at`,
    [id, totalEntree, now]
  )
  await logAudit({ deptKey: 'production', modelId: id, action: 'update_totals', details: { totalEntree } })
  res.json({ ok: true })
})
