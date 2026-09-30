import { Router } from 'express'
import { nanoid } from 'nanoid'
import { all, run, logAudit } from '../db/index.js'
import { requireDept, requireAnyDept } from '../auth.js'
import { reject, normalizeName, rejectBadWorkHour } from '../validation.js'
import { getSpecialties, addSpecialty, renameSpecialty, deleteSpecialty } from '../specialties.js'
import { getWorkHours, addWorkHour, updateWorkHour, deleteWorkHour } from '../workHours.js'

export const settingsRouter = Router()

const GROUP_KEYS = new Set(['chain', 'finale'])

// ⚙️ Réglages — Agent Méthode/Patron only (reuses whichever of those two
// department tokens the person already has, see client/src/pages/
// SettingsGate.jsx — there is no separate "settings" PIN).
const requireSettings = requireDept(['methode', 'patron'])

// A new (or renamed) specialty that differs from an EXISTING one only by
// capitals / spaces / accents would split its attendance data in two —
// refused. Exact matches keep their current behaviour (add: no-op; rename:
// the deliberate merge in specialties.js). Existing rows are never touched.
async function rejectSimilarSpecialty(res, groupKey, newName, currentName = null) {
  const wanted = String(newName || '').trim()
  if (!wanted) return false
  const key = normalizeName(wanted)
  const existing = (await getSpecialties(groupKey)).find((n) => n !== currentName && normalizeName(n) === key)
  if (!existing) return false
  if (currentName !== null && existing === wanted) return false // rename onto an exact name = existing merge
  return reject(res, 'similar_specialty_exists', `كاين ديجا تخصص بنفس الاسم: "${existing}"`, `Une spécialité identique existe déjà : « ${existing} »`, { existing })
}

settingsRouter.get('/settings/specialties/:groupKey', requireSettings, async (req, res) => {
  const { groupKey } = req.params
  if (!GROUP_KEYS.has(groupKey)) return res.status(400).json({ error: 'invalid_group' })
  res.json({ specialties: await getSpecialties(groupKey) })
})

settingsRouter.post('/settings/specialties/:groupKey', requireSettings, async (req, res) => {
  const { groupKey } = req.params
  if (!GROUP_KEYS.has(groupKey)) return res.status(400).json({ error: 'invalid_group' })
  if (await rejectSimilarSpecialty(res, groupKey, req.body?.name)) return
  try {
    await addSpecialty(groupKey, req.body?.name)
  } catch (err) {
    return res.status(400).json({ error: err.code || 'invalid_name' })
  }
  await logAudit({ deptKey: req.dept, action: 'add_specialty', details: { groupKey, name: req.body?.name } })
  res.status(201).json({ specialties: await getSpecialties(groupKey) })
})

settingsRouter.put('/settings/specialties/:groupKey/:name', requireSettings, async (req, res) => {
  const { groupKey, name } = req.params
  if (!GROUP_KEYS.has(groupKey)) return res.status(400).json({ error: 'invalid_group' })
  if (await rejectSimilarSpecialty(res, groupKey, req.body?.name, name)) return
  try {
    await renameSpecialty(groupKey, name, req.body?.name)
  } catch (err) {
    return res.status(400).json({ error: err.code || 'invalid_name' })
  }
  await logAudit({ deptKey: req.dept, action: 'rename_specialty', details: { groupKey, from: name, to: req.body?.name } })
  res.json({ specialties: await getSpecialties(groupKey) })
})

settingsRouter.delete('/settings/specialties/:groupKey/:name', requireSettings, async (req, res) => {
  const { groupKey, name } = req.params
  if (!GROUP_KEYS.has(groupKey)) return res.status(400).json({ error: 'invalid_group' })
  await deleteSpecialty(groupKey, name)
  await logAudit({ deptKey: req.dept, action: 'delete_specialty', details: { groupKey, name } })
  res.json({ specialties: await getSpecialties(groupKey) })
})

// ⏰ ساعات العمل — the live, admin-editable hourly-slot layout every screen
// using hourly slots (Planning, Production, Quality, Home, the audit
// report) now reads from instead of a hardcoded constant — see
// workHours.js for exactly why add/delete are restricted (append-only /
// last-only) while editing an existing slot's own time is unrestricted.
settingsRouter.get('/settings/work-hours', requireSettings, async (req, res) => {
  res.json({ workHours: await getWorkHours() })
})

settingsRouter.post('/settings/work-hours', requireSettings, async (req, res) => {
  if (await rejectInvalidSlot(res, req.body?.start, req.body?.end)) return
  try {
    await addWorkHour(req.body?.start, req.body?.end)
  } catch (err) {
    return res.status(400).json({ error: err.code || 'invalid_time' })
  }
  await logAudit({ deptKey: req.dept, action: 'add_work_hour', details: { start: req.body?.start, end: req.body?.end } })
  res.status(201).json({ workHours: await getWorkHours() })
})

settingsRouter.put('/settings/work-hours/:id', requireSettings, async (req, res) => {
  if (await rejectInvalidSlot(res, req.body?.start, req.body?.end, req.params.id)) return
  try {
    await updateWorkHour(req.params.id, req.body?.start, req.body?.end)
  } catch (err) {
    return res.status(400).json({ error: err.code || 'invalid_time' })
  }
  await logAudit({ deptKey: req.dept, action: 'update_work_hour', details: { id: req.params.id, start: req.body?.start, end: req.body?.end } })
  res.json({ workHours: await getWorkHours() })
})

// End after start + no overlap with the other slots. Malformed times are
// left to workHours.js's own check (400 invalid_time), as before.
async function rejectInvalidSlot(res, start, end, ownId = null) {
  const TIME = /^([01]\d|2[0-3]):[0-5]\d$/
  const s = String(start || '').trim()
  const e = String(end || '').trim()
  if (!TIME.test(s) || !TIME.test(e)) return false
  const others = (await getWorkHours()).filter((w) => w.id !== ownId)
  return rejectBadWorkHour(res, s, e, others)
}

settingsRouter.delete('/settings/work-hours/:id', requireSettings, async (req, res) => {
  try {
    await deleteWorkHour(req.params.id)
  } catch (err) {
    return res.status(400).json({ error: err.code || 'invalid_delete' })
  }
  await logAudit({ deptKey: req.dept, action: 'delete_work_hour', details: { id: req.params.id } })
  res.json({ workHours: await getWorkHours() })
})

// 📩 الإبلاغ عن مشكلة — open to any logged-in department (see the small
// button DeptGate.jsx's BackBar renders on every department screen), so
// whoever hits a real problem can report it from wherever they are, not
// just from inside the Méthode/Patron-only Réglages screen.
settingsRouter.post('/settings/feedback', requireAnyDept(), async (req, res) => {
  const message = String(req.body?.message || '').trim()
  if (!message) return res.status(400).json({ error: 'message_required' })
  await run('INSERT INTO feedback_reports (id, dept_key, message, created_at) VALUES ($1, $2, $3, $4)', [
    `fbk_${nanoid(10)}`,
    req.dept,
    message,
    new Date().toISOString(),
  ])
  res.status(201).json({ ok: true })
})

// Reviewing the feedback log stays Méthode/Patron-only, same as the rest
// of ⚙️ Réglages — newest first, plain chronological list, no status/
// resolved flag (matches the app's general minimalism).
settingsRouter.get('/settings/feedback', requireSettings, async (req, res) => {
  const rows = await all('SELECT id, dept_key, message, created_at FROM feedback_reports ORDER BY created_at DESC LIMIT 200')
  res.json({ reports: rows })
})
