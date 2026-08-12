import { Router } from 'express'
import { db, logAudit } from '../db/index.js'
import { requireDept } from '../auth.js'

export const depotRouter = Router()
depotRouter.use(requireDept('depot'))

depotRouter.put('/models/:id', (req, res) => {
  const { id } = req.params
  const totalPieces = Math.max(0, Number(req.body?.totalPieces) || 0)
  const now = new Date().toISOString()
  db.prepare(
    `INSERT INTO depot (model_id, total_pieces, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(model_id) DO UPDATE SET total_pieces = excluded.total_pieces, updated_at = excluded.updated_at`
  ).run(id, totalPieces, now)
  logAudit({ deptKey: 'depot', modelId: id, action: 'update_depot', details: { totalPieces } })
  res.json({ ok: true })
})
