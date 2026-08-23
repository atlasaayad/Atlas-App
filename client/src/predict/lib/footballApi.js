// Client for ATLAS PREDICT's own backend (server/src/routes/predict.js),
// never football-data.org or the Anthropic API directly — keeps both API
// keys server-side only and avoids football-data.org's CORS restrictions.
async function apiGet(path) {
  const res = await fetch(path)
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    const err = new Error(body.error || `http_${res.status}`)
    err.status = res.status
    throw err
  }
  return res.json()
}

export function fetchLeagues() {
  return apiGet('/api/predict/leagues')
}

export function fetchMatches(leagueId) {
  return apiGet(`/api/predict/matches?league=${encodeURIComponent(leagueId)}`)
}

export async function requestAnalysis(matchId) {
  const res = await fetch('/api/predict/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ matchId }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    const err = new Error(body.error || `http_${res.status}`)
    err.status = res.status
    throw err
  }
  return res.json()
}
