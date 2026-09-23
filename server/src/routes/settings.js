import { Router } from 'express'
import { nanoid } from 'nanoid'
import { all, run, logAudit } from '../db/index.js'
import { requireDept, requireAnyDept } from '../auth.js'
import { getSpecialties, addSpecialty, renameSpecialty, deleteSpecialty } from '../specialties.js'

export const settingsRouter = Router()

const GROUP_KEYS = new Set(['chain', 'finale'])

// ⚙️ Réglages — Agent Méthode/Patron only (reuses whichever of those two
// department tokens the person already has, see client/src/pages/
// SettingsGate.jsx — there is no separate "settings" PIN).
const requireSettings = requireDept(['methode', 'patron'])

settingsRouter.get('/settings/specialties/:groupKey', requireSettings, async (req, res) => {
  const { groupKey } = req.params
  if (!GROUP_KEYS.has(groupKey)) return res.status(400).json({ error: 'invalid_group' })
  res.json({ specialties: await getSpecialties(groupKey) })
})

settingsRouter.post('/settings/specialties/:groupKey', requireSettings, async (req, res) => {
  const { groupKey } = req.params
  if (!GROUP_KEYS.has(groupKey)) return res.status(400).json({ error: 'invalid_group' })
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
