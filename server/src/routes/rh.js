import { Router } from 'express'
import { requireDept } from '../auth.js'
import { saveAttendance, savePersonnelAdmin } from '../attendanceShared.js'

export const rhRouter = Router()
rhRouter.use(requireDept('rh'))

// Bulk update: { attendance: { "301": 2, "Main": 4, ... } }. Agent Méthode
// has an identical endpoint (routes/methode.js) writing to the exact same
// rh_attendance rows — this is now the backup/secondary entry point, see
// README "Présence et Rendement" for why the responsibility moved.
rhRouter.put('/models/:id/attendance', async (req, res) => {
  await saveAttendance({ deptKey: 'rh', id: req.params.id, attendance: req.body?.attendance || {} })
  res.json({ ok: true })
})

// Personnel administratif / Encadrement — RH is the primary entry point;
// Patron has an identical endpoint (routes/patron.js) writing to the exact
// same personnel_admin_history row for a given date.
rhRouter.put('/personnel-admin', async (req, res) => {
  const { date, total } = req.body || {}
  if (!date) return res.status(400).json({ error: 'date_required' })
  await savePersonnelAdmin({ deptKey: 'rh', date, total })
  res.json({ ok: true })
})
