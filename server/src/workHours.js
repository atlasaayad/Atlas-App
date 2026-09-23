import { nanoid } from 'nanoid'
import { all, get, run } from './db/index.js'

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/

function assertValidTime(value) {
  const trimmed = String(value || '').trim()
  if (!TIME_RE.test(trimmed)) throw Object.assign(new Error('invalid_time'), { code: 'invalid_time' })
  return trimmed
}

// Live, admin-editable hourly-slot layout (⚙️ Réglages → ساعات العمل, Agent
// Méthode/Patron only — see routes/settings.js) — replaces the old
// hardcoded HOURLY_SLOTS/WORK_HOURS_PER_DAY constants everywhere they used
// to be imported directly. `index` here (ascending `sort_order`) IS the
// `slot_index` used throughout production_history/quality_history/
// planning_hourly — see the work_hours table comment in db/index.js for why
// add/delete are therefore restricted to the end of the list only.
export async function getWorkHours() {
  const rows = await all('SELECT id, start_time, end_time FROM work_hours ORDER BY sort_order, start_time')
  return rows.map((r, i) => ({ index: i, id: r.id, label: `${r.start_time}-${r.end_time}`, start: r.start_time, end: r.end_time }))
}

// Always appended at the end (next sort_order) — never inserted in the
// middle, which would shift every later slot's index and silently
// reinterpret its already-recorded historical data under a different time
// range.
export async function addWorkHour(startTime, endTime) {
  const start = assertValidTime(startTime)
  const end = assertValidTime(endTime)
  const maxRow = await get('SELECT COALESCE(MAX(sort_order), -1) AS m FROM work_hours')
  const now = new Date().toISOString()
  await run(
    `INSERT INTO work_hours (id, start_time, end_time, sort_order, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $5)`,
    [`wh_${nanoid(10)}`, start, end, Number(maxRow.m) + 1, now]
  )
}

// Changing an existing slot's own start/end time in place is always safe —
// its position (and therefore its slot_index) never moves, so no historical
// row is reinterpreted.
export async function updateWorkHour(id, startTime, endTime) {
  const start = assertValidTime(startTime)
  const end = assertValidTime(endTime)
  const now = new Date().toISOString()
  await run('UPDATE work_hours SET start_time = $1, end_time = $2, updated_at = $3 WHERE id = $4', [start, end, now, id])
}

// Only the LAST slot (highest sort_order) may be deleted — the safe
// symmetric inverse of addWorkHour's append-only rule. Deleting any earlier
// slot would shift every later one's index, silently reinterpreting its
// already-recorded historical data (same non-destructive philosophy as
// specialty deletion, just protecting order instead of existence).
export async function deleteWorkHour(id) {
  const lastRow = await get('SELECT id FROM work_hours ORDER BY sort_order DESC LIMIT 1')
  if (!lastRow || lastRow.id !== id) {
    throw Object.assign(new Error('can_only_delete_last'), { code: 'can_only_delete_last' })
  }
  await run('DELETE FROM work_hours WHERE id = $1', [id])
}
