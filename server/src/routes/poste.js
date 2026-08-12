import { Router } from 'express'
import { db, logAudit } from '../db/index.js'
import { requireDept } from '../auth.js'
import { GENERIC_POSTE_DEPARTMENTS } from '../constants.js'

export const posteRouter = Router()
posteRouter.use(requireDept(GENERIC_POSTE_DEPARTMENTS))

// Département inferred from the authenticated token (req.dept) — a poste can
// only ever write its own status.
posteRouter.put('/models/:id', (req, res) => {
  const { id } = req.params
  const percentage = Math.max(0, Math.min(100, Number(req.body?.percentage) || 0))
  const note = String(req.body?.note || '').slice(0, 500)
  const now = new Date().toISOString()
  db.prepare(
    `INSERT INTO poste_status (model_id, dept_key, percentage, note, updated_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(model_id, dept_key) DO UPDATE SET percentage = excluded.percentage, note = excluded.note, updated_at = excluded.updated_at`
  ).run(id, req.dept, percentage, note, now)
  logAudit({ deptKey: req.dept, modelId: id, action: 'update_poste_status', details: { percentage, note } })
  res.json({ ok: true })
})
