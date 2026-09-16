import { Router } from 'express'
import { get } from '../db/index.js'
import { requireDept } from '../auth.js'
import { todayInFactoryTZ } from '../calc.js'
import { saveAttendance, savePersonnelAdmin, getAttendanceForDate, DATE_RE } from '../attendanceShared.js'

export const rhRouter = Router()
rhRouter.use(requireDept('rh'))

// Bulk update: { attendance: { "301": 2, "Main": 4, ... }, date }. Agent
// Méthode has an identical endpoint (routes/methode.js) writing to the
// exact same rh_attendance_history row for the given date — this is now
// the backup/secondary entry point, see README "Présence et Rendement" for
// why the responsibility moved. A specific date can be targeted (same
// backdating pattern as Agent Production's/Quality's hourly entry).
rhRouter.put('/models/:id/attendance', async (req, res) => {
  const result = await saveAttendance({
    deptKey: 'rh',
    id: req.params.id,
    attendance: req.body?.attendance || {},
    date: req.body?.date,
  })
  if (!result.ok) return res.status(result.error === 'not_found' ? 404 : 400).json({ error: result.error })
  res.json(result)
})

// A specific day's Présence per specialty — today's or any previous day's.
rhRouter.get('/models/:id/attendance', async (req, res) => {
  const model = await get('SELECT chain_number FROM models WHERE id = $1', [req.params.id])
  if (!model) return res.status(404).json({ error: 'not_found' })
  const date = String(req.query.date || todayInFactoryTZ())
  if (!DATE_RE.test(date)) return res.status(400).json({ error: 'invalid_date' })
  const attendance = await getAttendanceForDate(model.chain_number, date)
  res.json({ date, attendance })
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
