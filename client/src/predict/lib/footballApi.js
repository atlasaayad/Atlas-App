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

// Report generation is split server-side into two smaller calls (narrative
// text, then markets/predictions) so each stays well under the serverless
// function's time limit instead of one long call risking a timeout.
async function requestAnalysisPart(matchId, part) {
  const res = await fetch('/api/predict/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ matchId, part }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    const err = new Error(body.error || `http_${res.status}`)
    err.status = res.status
    throw err
  }
  return res.json()
}

// onPhase(phase) fires right before each call starts, so the caller can
// show phase-aware loading text ('narrative' then 'markets').
export async function requestAnalysis(matchId, onPhase) {
  onPhase?.('narrative')
  const narrative = await requestAnalysisPart(matchId, 'narrative')
  onPhase?.('markets')
  const markets = await requestAnalysisPart(matchId, 'markets')
  return {
    report: { ...narrative.report, ...markets.report },
    grounding: markets.grounding || narrative.grounding,
  }
}
