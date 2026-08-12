import { Router } from 'express'
import { db, logAudit } from '../db/index.js'
import { requireDept } from '../auth.js'

export const productionRouter = Router()
productionRouter.use(requireDept('production'))

productionRouter.put('/models/:id/hourly/:slotIndex', (req, res) => {
  const { id, slotIndex } = req.params
  const qty = Number(req.body?.qty) || 0
  const idx = Number(slotIndex)
  if (idx < 0 || idx > 8) return res.status(400).json({ error: 'invalid_slot' })
  const now = new Date().toISOString()
  db.prepare(
    `INSERT INTO hourly_production (model_id, slot_index, qty, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(model_id, slot_index) DO UPDATE SET qty = excluded.qty, updated_at = excluded.updated_at`
  ).run(id, idx, qty, now)
  logAudit({ deptKey: 'production', modelId: id, action: 'update_hourly', details: { slotIndex: idx, qty } })
  res.json({ ok: true })
})

productionRouter.put('/models/:id/totals', (req, res) => {
  const { id } = req.params
  const totalEntree = Number(req.body?.totalEntree) || 0
  const totalSortie = Number(req.body?.totalSortie) || 0
  const now = new Date().toISOString()
  db.prepare(
    `INSERT INTO production_totals (model_id, total_entree, total_sortie, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(model_id) DO UPDATE SET total_entree = excluded.total_entree, total_sortie = excluded.total_sortie, updated_at = excluded.updated_at`
  ).run(id, totalEntree, totalSortie, now)
  logAudit({ deptKey: 'production', modelId: id, action: 'update_totals', details: { totalEntree, totalSortie } })
  res.json({ ok: true })
})
