import { Router } from 'express'
import { run, logAudit } from '../db/index.js'
import { requireDept } from '../auth.js'

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
  await logAudit({ deptKey: 'production', modelId: id, action: 'update_hourly', details: { slotIndex: idx, qty } })
  res.json({ ok: true })
})

productionRouter.put('/models/:id/totals', async (req, res) => {
  const { id } = req.params
  const totalEntree = Number(req.body?.totalEntree) || 0
  const totalSortie = Number(req.body?.totalSortie) || 0
  const now = new Date().toISOString()
  await run(
    `INSERT INTO production_totals (model_id, total_entree, total_sortie, updated_at) VALUES ($1, $2, $3, $4)
     ON CONFLICT (model_id) DO UPDATE SET total_entree = excluded.total_entree, total_sortie = excluded.total_sortie, updated_at = excluded.updated_at`,
    [id, totalEntree, totalSortie, now]
  )
  await logAudit({ deptKey: 'production', modelId: id, action: 'update_totals', details: { totalEntree, totalSortie } })
  res.json({ ok: true })
})
