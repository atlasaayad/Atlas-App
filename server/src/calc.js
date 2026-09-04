import { HOURLY_SLOTS, WORK_HOURS_PER_DAY } from './constants.js'

// VT = somme des temps (TPS, en secondes) de la gamme, exprimée en minutes.
export function computeVTMinutes(gammeLines) {
  const totalSeconds = gammeLines.reduce((sum, l) => sum + (Number(l.tps) || 0), 0)
  return totalSeconds / 60
}

// DT (Objectif/heure) = (ND * 3600) / somme des TPS (secondes)
export function computeDT(nd, totalTpsSeconds) {
  if (!totalTpsSeconds || totalTpsSeconds <= 0) return 0
  return (Number(nd) * 3600) / totalTpsSeconds
}

// Objectif/jour (Demandé) = DT * heures de travail (9)
export function computeObjectifJour(dt) {
  return dt * WORK_HOURS_PER_DAY
}

const SLOT_START_MINUTES = HOURLY_SLOTS.map((s) => {
  const [start] = s.label.split('-')
  const [h, m] = start.split(':').map(Number)
  return h * 60 + m
})

// Index (0-based) of the hourly slot the current time falls into, in the
// factory's timezone. Returns -1 before the shift starts, HOURLY_SLOTS.length-1
// once the shift is over (so "Prod à maintenant" sums the full day).
export function currentSlotIndex(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Casablanca',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)
  const hour = Number(parts.find((p) => p.type === 'hour').value)
  const minute = Number(parts.find((p) => p.type === 'minute').value)
  const nowMinutes = hour * 60 + minute

  if (nowMinutes < SLOT_START_MINUTES[0]) return -1
  let idx = 0
  for (let i = 0; i < SLOT_START_MINUTES.length; i++) {
    if (nowMinutes >= SLOT_START_MINUTES[i]) idx = i
  }
  return idx
}

// Sum of hourly production qty from slot 0 up to (and including) the current slot.
export function prodAMaintenant(hourlyMap, now = new Date()) {
  const idx = currentSlotIndex(now)
  if (idx < 0) return 0
  let total = 0
  for (let i = 0; i <= idx; i++) total += Number(hourlyMap[i] || 0)
  return total
}

// Minimum length of a strictly-declining, hour-by-hour streak (recorded
// data only — never inferred) before it counts as an early-warning trend:
// 3 hours = 2 consecutive hour-over-hour drops. Below that, a single bad
// hour would trigger false alarms; this is deliberately conservative.
const MIN_DECLINE_STREAK = 3

// entries: [{ slotIndex, qty }, ...] sorted ascending by slotIndex — only
// hours actually recorded today (production_history), gaps and all. Walks
// backward from the most recent entry, extending the streak only while
// each earlier hour is both the immediately preceding slot (no gap) and
// strictly greater than the hour after it. Returns null if there's no
// sustained decline (including when there simply isn't enough data yet —
// callers must never guess from an incomplete day).
export function detectDeclineTrend(entries) {
  if (entries.length < MIN_DECLINE_STREAK) return null

  let streak = 1
  for (let i = entries.length - 1; i > 0; i--) {
    const curr = entries[i]
    const prev = entries[i - 1]
    if (prev.slotIndex !== curr.slotIndex - 1) break
    if (prev.qty <= curr.qty) break
    streak++
  }

  if (streak < MIN_DECLINE_STREAK) return null

  const streakEntries = entries.slice(entries.length - streak)
  return {
    hoursDeclining: streak,
    startQty: streakEntries[0].qty,
    currentQty: streakEntries[streak - 1].qty,
  }
}

// Qualité% for any (produced qty, pièces retouche) pair — one hour, a full
// day, or the model's whole life, always the same formula. Null (never a
// fake 0% or 100%) when there's no real production recorded to divide by,
// so the caller can render "non calculé" instead of a misleading number.
export function computeQualityPct(producedQty, pieceRetouche) {
  const qty = Number(producedQty) || 0
  if (qty <= 0) return null
  const retouche = Number(pieceRetouche) || 0
  return Math.round(((qty - retouche) / qty) * 1000) / 10
}

// Today's date (YYYY-MM-DD) in the factory's timezone — used to key
// permanent history records, independent of the server's own local TZ.
export function todayInFactoryTZ(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Casablanca',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)
  const y = parts.find((p) => p.type === 'year').value
  const m = parts.find((p) => p.type === 'month').value
  const d = parts.find((p) => p.type === 'day').value
  return `${y}-${m}-${d}`
}

// Rendement_Production% — standard SAM-based line-efficiency formula:
// (quantité produite × SAM) / (ouvriers présents × minutes de présence) × 100.
// Works at any scope (one hour, a day, the model's whole life) — the caller
// picks qty/attendanceMinutes to match. Null (never a misleading 0%) when
// there's no real headcount or time to divide by.
export function computeRendementProduction(qty, samMinutes, workersPresent, attendanceMinutes) {
  const workers = Number(workersPresent) || 0
  const minutes = Number(attendanceMinutes) || 0
  if (workers <= 0 || minutes <= 0) return null
  const q = Number(qty) || 0
  const sam = Number(samMinutes) || 0
  return Math.round(((q * sam) / (workers * minutes)) * 1000) / 10
}

// Score_Rendement = simple 50/50 average of Rendement_Production% and
// Qualité% at the same scope. Null if either input is null/not-yet-computed
// — averaging a real number against a missing one would misrepresent a
// number nobody has actually confirmed yet, exactly like the individual
// metrics never fake a 0% for missing data.
export function computeScoreRendement(rendementProductionPct, qualityPct) {
  if (rendementProductionPct === null || qualityPct === null) return null
  return Math.round(((rendementProductionPct + qualityPct) / 2) * 10) / 10
}

// Inclusive day count between two YYYY-MM-DD dates (used to size the
// cumulative-since-Début attendance-minutes denominator: cumulativeDays *
// WORK_HOURS_PER_DAY * 60). UTC-based arithmetic on date-only strings, so
// it's immune to DST — there is no time-of-day component to shift.
export function daysBetweenInclusive(fromDate, toDate) {
  const from = new Date(`${fromDate}T00:00:00Z`)
  const to = new Date(`${toDate}T00:00:00Z`)
  return Math.round((to - from) / 86400000) + 1
}
