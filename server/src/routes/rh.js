import { Router } from 'express'
import { db, logAudit } from '../db/index.js'
import { requireDept } from '../auth.js'
import { SPECIALTIES } from '../constants.js'

export const rhRouter = Router()
rhRouter.use(requireDept('rh'))

// Bulk update: { attendance: { "301": 2, "Main": 4, ... } }
rhRouter.put('/models/:id/attendance', (req, res) => {
  const { id } = req.params
  const attendance = req.body?.attendance || {}
  const now = new Date().toISOString()
  const tx = db.transaction(() => {
    for (const spec of SPECIALTIES) {
      if (!(spec in attendance)) continue
      const present = Number(attendance[spec]) || 0
      db.prepare(
        `INSERT INTO rh_attendance (model_id, specialty, present, updated_at) VALUES (?, ?, ?, ?)
         ON CONFLICT(model_id, specialty) DO UPDATE SET present = excluded.present, updated_at = excluded.updated_at`
      ).run(id, spec, present, now)
    }
  })
  tx()
  logAudit({ deptKey: 'rh', modelId: id, action: 'update_attendance', details: attendance })
  res.json({ ok: true })
})
