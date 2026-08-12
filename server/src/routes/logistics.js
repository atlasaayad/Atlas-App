import { Router } from 'express'
import { nanoid } from 'nanoid'
import { get, run, logAudit } from '../db/index.js'
import { requireDept } from '../auth.js'

export const logisticsRouter = Router()
logisticsRouter.use(requireDept('logistics'))

logisticsRouter.post('/models/:id/exports', async (req, res) => {
  const { id } = req.params
  const { description, quantite, date } = req.body || {}
  if (!date) return res.status(400).json({ error: 'date_required' })
  const now = new Date().toISOString()
  const exportId = `exp_${nanoid(10)}`
  await run(
    `INSERT INTO logistics_exports (id, model_id, description, quantite, date, created_at) VALUES ($1, $2, $3, $4, $5, $6)`,
    [exportId, id, description || '', Number(quantite) || 0, date, now]
  )
  await logAudit({ deptKey: 'logistics', modelId: id, action: 'add_export', details: { description, quantite, date } })
  res.status(201).json({ id: exportId })
})

logisticsRouter.delete('/exports/:exportId', async (req, res) => {
  const row = await get('SELECT model_id FROM logistics_exports WHERE id = $1', [req.params.exportId])
  if (!row) return res.status(404).json({ error: 'not_found' })
  await run('DELETE FROM logistics_exports WHERE id = $1', [req.params.exportId])
  await logAudit({ deptKey: 'logistics', modelId: row.model_id, action: 'delete_export', details: { exportId: req.params.exportId } })
  res.json({ ok: true })
})
