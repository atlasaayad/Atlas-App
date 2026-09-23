import { nanoid } from 'nanoid'
import { get, all, run, logAudit } from './db/index.js'
import { getSpecialties } from './specialties.js'
import { todayInFactoryTZ } from './calc.js'

export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

// Shared by RH's and Agent Méthode's "Présence" screens — both write to the
// exact same rh_attendance_history rows for the target date, so whichever
// department saves last for that date is automatically what the audit
// report (and, for today, the Rendement calculation) uses. No separate
// "most recent department" logic is needed: it's the same row being
// overwritten, not two copies to reconcile.
//
// A specific date can be targeted (same date-picker/backdating pattern as
// Agent Production's and Quality's hourly entry — see routes/production.js)
// instead of always writing today: rh_attendance_history (permanent, one
// row per chain/specialty/date) is always written for the target date.
// rh_attendance (the LIVE snapshot everything else reads — Rendement,
// Home, État des effectifs, Classement) only ever reflects TODAY's real
// attendance, so it's only touched when the target date IS today — a
// correction to a past day must never silently change what "today's"
// headcount reads as.
export async function saveAttendance({ deptKey, id, attendance, date }) {
  const model = await get('SELECT chain_number, debut FROM models WHERE id = $1', [id])
  if (!model) return { ok: false, error: 'not_found' }

  const today = todayInFactoryTZ()
  const targetDate = String(date || today)
  if (!DATE_RE.test(targetDate)) return { ok: false, error: 'invalid_date' }
  if (targetDate > today) return { ok: false, error: 'date_in_future' }
  if (model.debut && targetDate < model.debut) return { ok: false, error: 'date_before_debut' }

  const now = new Date().toISOString()
  const isBackdated = targetDate !== today
  const specialties = await getSpecialties('chain')

  for (const spec of specialties) {
    if (!(spec in attendance)) continue
    const present = Number(attendance[spec]) || 0

    // Permanent daily record for the BSCI/SMETA audit report — never
    // overwritten by a different day, only corrected in place if this same
    // specialty/date is re-submitted later.
    await run(
      `INSERT INTO rh_attendance_history (id, model_id, chain_number, specialty, date, present, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $7)
       ON CONFLICT (chain_number, specialty, date)
         DO UPDATE SET present = excluded.present, model_id = excluded.model_id, updated_at = excluded.updated_at`,
      [`rah_${nanoid(10)}`, id, model.chain_number, spec, targetDate, present, now]
    )

    if (!isBackdated) {
      await run(
        `INSERT INTO rh_attendance (model_id, specialty, present, updated_at) VALUES ($1, $2, $3, $4)
         ON CONFLICT (model_id, specialty) DO UPDATE SET present = excluded.present, updated_at = excluded.updated_at`,
        [id, spec, present, now]
      )
    }
  }

  await logAudit({ deptKey, modelId: id, action: 'update_attendance', details: { attendance, date: targetDate, isBackdated } })
  return { ok: true, date: targetDate, isBackdated }
}

// A specific day's Présence per specialty — today's or any previous day's —
// read straight from rh_attendance_history, the permanent record (same
// architecture as Agent Production's/Quality's "get hourly for date X").
// Specialties with no record yet for that date come back as 0, never
// omitted, so the caller can always render the current specialty list.
export async function getAttendanceForDate(chainNumber, date) {
  const [rows, specialties] = await Promise.all([
    all('SELECT specialty, present FROM rh_attendance_history WHERE chain_number = $1 AND date = $2', [chainNumber, date]),
    getSpecialties('chain'),
  ])
  const present = Object.fromEntries(specialties.map((s) => [s, 0]))
  for (const r of rows) present[r.specialty] = r.present
  return present
}

// Personnel administratif / Encadrement — a single company-wide headcount
// (not tied to any chain/model), entered by RH (primary) or Patron (backup)
// via an identical route on each department's own screen. Both write to the
// exact same personnel_admin_history row for a given date, so whichever
// department saves last is what reads back — same no-reconciliation-needed
// pattern as saveAttendance() above. Can target any past date (not just
// today), so a department can go back and correct a previous day's total.
export async function savePersonnelAdmin({ deptKey, date, total }) {
  const now = new Date().toISOString()
  const safeTotal = Math.max(0, Number(total) || 0)
  await run(
    `INSERT INTO personnel_admin_history (id, date, total, created_at, updated_at) VALUES ($1, $2, $3, $4, $4)
     ON CONFLICT (date) DO UPDATE SET total = excluded.total, updated_at = excluded.updated_at`,
    [`pah_${nanoid(10)}`, date, safeTotal, now]
  )
  await logAudit({ deptKey, action: 'update_personnel_admin', details: { date, total: safeTotal } })
}

// Read helper shared by RH's/Patron's own screens and the public overview
// endpoint: today's (or any date's) total, plus the cumulative sum across
// every day ever recorded — mirrors Quality's "today + cumulative" split.
export async function getPersonnelAdmin(date) {
  const [dayRow, cumulativeRow] = await Promise.all([
    get('SELECT total FROM personnel_admin_history WHERE date = $1', [date]),
    get('SELECT COALESCE(SUM(total), 0) AS total FROM personnel_admin_history'),
  ])
  return { date, total: dayRow?.total ?? 0, cumulativeTotal: Number(cumulativeRow.total) }
}
