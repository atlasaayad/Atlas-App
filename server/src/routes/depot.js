import { Router } from 'express'
import { run, logAudit } from '../db/index.js'
import { requireDept } from '../auth.js'

export const depotRouter = Router()
depotRouter.use(requireDept('depot'))

depotRouter.put('/models/:id', async (req, res) => {
  const { id } = req.params
  const totalPieces = Math.max(0, Number(req.body?.totalPieces) || 0)
  const now = new Date().toISOString()
  await run(
    `INSERT INTO depot (model_id, total_pieces, updated_at) VALUES ($1, $2, $3)
     ON CONFLICT (model_id) DO UPDATE SET total_pieces = excluded.total_pieces, updated_at = excluded.updated_at`,
    [id, totalPieces, now]
  )
  await logAudit({ deptKey: 'depot', modelId: id, action: 'update_depot', details: { totalPieces } })
  res.json({ ok: true })
})
