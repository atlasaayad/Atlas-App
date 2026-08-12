import { Router } from 'express'
import { run, logAudit } from '../db/index.js'
import { requireDept } from '../auth.js'
import { SPECIALTIES } from '../constants.js'

export const rhRouter = Router()
rhRouter.use(requireDept('rh'))

// Bulk update: { attendance: { "301": 2, "Main": 4, ... } }
rhRouter.put('/models/:id/attendance', async (req, res) => {
  const { id } = req.params
  const attendance = req.body?.attendance || {}
  const now = new Date().toISOString()

  for (const spec of SPECIALTIES) {
    if (!(spec in attendance)) continue
    const present = Number(attendance[spec]) || 0
    await run(
      `INSERT INTO rh_attendance (model_id, specialty, present, updated_at) VALUES ($1, $2, $3, $4)
       ON CONFLICT (model_id, specialty) DO UPDATE SET present = excluded.present, updated_at = excluded.updated_at`,
      [id, spec, present, now]
    )
  }

  await logAudit({ deptKey: 'rh', modelId: id, action: 'update_attendance', details: attendance })
  res.json({ ok: true })
})
