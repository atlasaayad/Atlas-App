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

// "3661" -> "1h01min" / "125" -> "2min05" — compact, factory-floor-readable.
export function formatDuration(totalSeconds) {
  const s = Math.max(0, Math.round(totalSeconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (h > 0) return `${h}h${String(m).padStart(2, '0')}min`
  return `${m}min${String(sec).padStart(2, '0')}`
}
