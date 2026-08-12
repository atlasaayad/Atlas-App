import { Router } from 'express'
import { run, logAudit } from '../db/index.js'
import { requireDept } from '../auth.js'

export const qualityRouter = Router()
qualityRouter.use(requireDept('quality'))

qualityRouter.put('/models/:id', async (req, res) => {
  const { id } = req.params
  const percentage = Math.max(0, Math.min(100, Number(req.body?.percentage) || 0))
  const reprises = Math.max(0, Number(req.body?.reprises) || 0)
  const now = new Date().toISOString()
  await run(
    `INSERT INTO quality (model_id, percentage, reprises, updated_at) VALUES ($1, $2, $3, $4)
     ON CONFLICT (model_id) DO UPDATE SET percentage = excluded.percentage, reprises = excluded.reprises, updated_at = excluded.updated_at`,
    [id, percentage, reprises, now]
  )
  await logAudit({ deptKey: 'quality', modelId: id, action: 'update_quality', details: { percentage, reprises } })
  res.json({ ok: true })
})
