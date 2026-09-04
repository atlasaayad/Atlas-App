export function computeVTMinutes(gammeLines) {
  const totalSeconds = gammeLines.reduce((sum, l) => sum + (Number(l.tps) || 0), 0)
  return totalSeconds / 60
}

export function computeDT(nd, totalTpsSeconds) {
  if (!totalTpsSeconds || totalTpsSeconds <= 0) return 0
  return (Number(nd) * 3600) / totalTpsSeconds
}

export function computeObjectifJour(dt) {
  return dt * 9
}

// Client-side mirror of server/src/calc.js's computeQualityPct — used only
// for live, immediate UI feedback (e.g. a row's Qualité% while the user is
// still typing, or right after a save before the next server refresh
// lands). The server always recomputes and returns the authoritative value
// on every read; this never substitutes for that.
export function computeQualityPct(producedQty, pieceRetouche) {
  const qty = Number(producedQty) || 0
  if (qty <= 0) return null
  const retouche = Number(pieceRetouche) || 0
  return Math.round(((qty - retouche) / qty) * 1000) / 10
}

// Client-side mirror of server/src/calc.js's computeLaunchTimerState — run
// every second (setInterval) against the local clock to tick the "Temps de
// lancement" countdown/overrun display live, from the same startedAt
// timestamp the server persisted. The server recomputes and enforces this
// same logic independently at stop time; this is purely for the ticking UI.
export function computeLaunchTimerState({ objectifHeures, startedAt, stoppedAt }, now = new Date()) {
  if (!startedAt) return { status: 'not_started' }

  const objectifSeconds = Math.round((Number(objectifHeures) || 0) * 3600)
  const startedMs = new Date(startedAt).getTime()
  const endMs = stoppedAt ? new Date(stoppedAt).getTime() : now.getTime()
  const elapsedSeconds = Math.max(0, Math.round((endMs - startedMs) / 1000))
  const isOverrun = elapsedSeconds > objectifSeconds
  const overrunSeconds = isOverrun ? elapsedSeconds - objectifSeconds : 0

  if (!stoppedAt) {
    return {
      status: isOverrun ? 'overrun_running' : 'running',
      elapsedSeconds,
      remainingSeconds: isOverrun ? 0 : objectifSeconds - elapsedSeconds,
      overrunSeconds,
    }
  }
  return {
    status: isOverrun ? 'stopped_overrun' : 'stopped_on_target',
    elapsedSeconds,
    overrunSeconds,
  }
}

// Objectif (heures) is stored/sent to the API as a decimal number of hours,
// but entered/displayed as an alarm-clock-style HH:MM picker
// (`<input type="time">`) — these two convert between the two
// representations so nothing about the API needs to change.
export function hoursToHHMM(decimalHours) {
  const totalMinutes = Math.max(0, Math.round((Number(decimalHours) || 0) * 60))
  const h = Math.floor(totalMinutes / 60)
  const m = totalMinutes % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

export function hhmmToHours(hhmm) {
  if (!hhmm) return 0
  const [h, m] = hhmm.split(':').map(Number)
  return (Number(h) || 0) + (Number(m) || 0) / 60
}

// "3661" -> "1:01:01" / "125" -> "02:05" — always includes seconds so a
// live countdown visibly ticks every second. Dropping seconds once hours
// are involved (an earlier version did this) makes a running timer look
// frozen for up to 59 seconds at a stretch — exactly what reads as "the
// countdown isn't working" even though it's ticking correctly underneath.
export function formatDuration(totalSeconds) {
  const s = Math.max(0, Math.round(totalSeconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
}
