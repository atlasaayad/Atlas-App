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

async function apiPost(path, body) {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}))
    const err = new Error(errBody.error || `http_${res.status}`)
    err.status = res.status
    throw err
  }
  return res.json()
}

// Report generation is split server-side into 4 small Claude calls (each
// using the same fast claude-haiku-4-5-20251001 model Ask Atlas uses) so
// every individual call stays well under the serverless function's hard
// duration limit. Grounding is fetched once (no Claude call, fast) and this
// client passes it forward to every part — the server holds no state
// between calls. context/insights/markets-core only need grounding and run
// in parallel; markets-picks needs markets-core's numbers first.
//
// onPhase(phase) fires right before each stage starts, so the caller can
// show phase-aware loading text: 'gathering' -> 'analyzing' -> 'picks'.
export async function requestAnalysis(matchId, onPhase) {
  onPhase?.('gathering')
  const { grounding } = await apiPost('/api/predict/analyze/grounding', { matchId })

  onPhase?.('analyzing')
  const [context, insights, marketsCore] = await Promise.all([
    apiPost('/api/predict/analyze', { matchId, part: 'context', grounding }),
    apiPost('/api/predict/analyze', { matchId, part: 'insights', grounding }),
    apiPost('/api/predict/analyze', { matchId, part: 'markets-core', grounding }),
  ])

  onPhase?.('picks')
  const marketsPicks = await apiPost('/api/predict/analyze', {
    matchId,
    part: 'markets-picks',
    grounding,
    marketsCore: marketsCore.report.markets,
  })

  const report = {
    ...context.report,
    ...insights.report,
    markets: { ...marketsCore.report.markets, ...marketsPicks.report.markets },
    methodologyNotes: marketsPicks.report.methodologyNotes,
    confidenceTier: marketsPicks.report.confidenceTier,
    disclaimer: marketsPicks.report.disclaimer,
  }

  return { report, grounding }
}
