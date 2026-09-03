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
