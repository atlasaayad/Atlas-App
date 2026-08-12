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
