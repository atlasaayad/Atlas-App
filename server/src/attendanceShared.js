import { nanoid } from 'nanoid'
import { get, run, logAudit } from './db/index.js'
import { SPECIALTIES } from './constants.js'
import { todayInFactoryTZ } from './calc.js'

// Shared by RH's and Agent Méthode's "Présence" screens — both write to the
// exact same rh_attendance rows, so whichever department saves last is
// automatically what the Rendement calculation (and everything else that
// reads rh_attendance) uses. No separate "most recent department" logic is
// needed: it's the same row being overwritten, not two copies to reconcile.
export async function saveAttendance({ deptKey, id, attendance }) {
  const now = new Date().toISOString()
  const model = await get('SELECT chain_number FROM models WHERE id = $1', [id])
  const today = todayInFactoryTZ()

  for (const spec of SPECIALTIES) {
    if (!(spec in attendance)) continue
    const present = Number(attendance[spec]) || 0
    await run(
      `INSERT INTO rh_attendance (model_id, specialty, present, updated_at) VALUES ($1, $2, $3, $4)
       ON CONFLICT (model_id, specialty) DO UPDATE SET present = excluded.present, updated_at = excluded.updated_at`,
      [id, spec, present, now]
    )

    // Permanent daily record for the BSCI/SMETA audit report — never
    // overwritten by a different day, only corrected in place if this same
    // specialty is re-submitted later today.
    if (model) {
      await run(
        `INSERT INTO rh_attendance_history (id, model_id, chain_number, specialty, date, present, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $7)
         ON CONFLICT (chain_number, specialty, date)
           DO UPDATE SET present = excluded.present, model_id = excluded.model_id, updated_at = excluded.updated_at`,
        [`rah_${nanoid(10)}`, id, model.chain_number, spec, today, present, now]
      )
    }
  }

  await logAudit({ deptKey, modelId: id, action: 'update_attendance', details: attendance })
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
