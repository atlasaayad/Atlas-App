import { Router } from 'express'
import Anthropic from '@anthropic-ai/sdk'
import { get, run } from '../db/index.js'
import { todayInFactoryTZ } from '../calc.js'

// Standalone route for the ATLAS PREDICT sub-app (client/src/predict,
// mounted at /predict). Entirely separate data/tables from the factory
// tracker — no shared state, no dependency on chains/models/departments.
export const predictRouter = Router()

const FOOTBALL_DATA_KEY = process.env.FOOTBALL_DATA_KEY
const FOOTBALL_DATA_BASE = 'https://api.football-data.org/v4'

const anthropic = process.env.ANTHROPIC_API_KEY ? new Anthropic() : null

// System-wide cap on AI match-analysis reports per factory-local day —
// protects against runaway Anthropic API spend. Mirrors ask.js's
// DAILY_LIMIT pattern exactly.
export const ANALYSIS_DAILY_LIMIT = Number(process.env.PREDICT_ANALYSIS_DAILY_LIMIT) || 50

// The 6 leagues requested. `match()` resolves each against the live
// /competitions list at request time rather than trusting a hardcoded
// competition code, since football-data.org's free-tier league coverage
// (and which code maps to which league) can change without notice — a
// league that isn't on the current plan comes back as `available: false`
// instead of silently guessing wrong and erroring deep in a fetch.
const LEAGUE_DEFS = [
  {
    id: 'premier-league',
    labelAr: 'الدوري الإنجليزي الممتاز',
    labelFr: 'Premier League',
    match: (c) => c.name === 'Premier League' && c.area?.name === 'England',
  },
  {
    id: 'la-liga',
    labelAr: 'الدوري الإسباني',
    labelFr: 'La Liga',
    match: (c) => ['La Liga', 'Primera Division'].includes(c.name) && c.area?.name === 'Spain',
  },
  {
    id: 'serie-a',
    labelAr: 'الدوري الإيطالي',
    labelFr: 'Serie A',
    match: (c) => c.name === 'Serie A' && c.area?.name === 'Italy',
  },
  {
    id: 'bundesliga',
    labelAr: 'الدوري الألماني',
    labelFr: 'Bundesliga',
    match: (c) => c.name === 'Bundesliga' && c.area?.name === 'Germany',
  },
  {
    id: 'ligue-1',
    labelAr: 'الدوري الفرنسي',
    labelFr: 'Ligue 1',
    match: (c) => c.name === 'Ligue 1' && c.area?.name === 'France',
  },
  {
    id: 'saudi-league',
    labelAr: 'الدوري السعودي للمحترفين',
    labelFr: 'Saudi Pro League',
    match: (c) => /saudi/i.test(c.name) || /saudi/i.test(c.area?.name || ''),
  },
]

async function footballDataFetch(path, params = {}) {
  const url = new URL(FOOTBALL_DATA_BASE + path)
  for (const [k, v] of Object.entries(params)) {
    if (v != null) url.searchParams.set(k, v)
  }
  const resp = await fetch(url, { headers: { 'X-Auth-Token': FOOTBALL_DATA_KEY } })
  if (!resp.ok) {
    const body = await resp.text().catch(() => '')
    const err = new Error(`football_data_${resp.status}`)
    err.code = resp.status
    err.body = body.slice(0, 500)
    throw err
  }
  return resp.json()
}

// football-data.org's free tier allows only 10 requests/minute, shared
// across every user of this app (one API key). A plain in-memory cache
// doesn't protect against that: Vercel doesn't guarantee the same warm
// instance handles the next request, so two requests seconds apart can
// land on cold instances with no shared memory. Postgres (predict_football_
// cache) is the one thing every instance actually shares, so it's the real
// cache here — 10 minute TTL, same table for every kind of football-data.org
// call this route makes.
const FOOTBALL_CACHE_TTL_MS = 10 * 60 * 1000

async function cachedFootballDataFetch(cacheKey, path, params = {}) {
  const cached = await get('SELECT data, fetched_at FROM predict_football_cache WHERE cache_key = $1', [cacheKey])
  if (cached && Date.now() - new Date(cached.fetched_at).getTime() < FOOTBALL_CACHE_TTL_MS) {
    return cached.data
  }
  const data = await footballDataFetch(path, params)
  await run(
    `INSERT INTO predict_football_cache (cache_key, data, fetched_at) VALUES ($1, $2, NOW())
     ON CONFLICT (cache_key) DO UPDATE SET data = $2, fetched_at = NOW()`,
    [cacheKey, JSON.stringify(data)]
  )
  return data
}

function fetchCompetitions() {
  return cachedFootballDataFetch('competitions', '/competitions')
}

function handleFootballDataError(res, err) {
  // err.body (football-data.org's own response text, when present) only goes
  // to the server log — never returned to the client — since it could echo
  // request details back; the UI gets a generic, code-mapped message instead.
  console.error('predict_football_data_error', err.code, err.message, err.body || '')
  if (err.code === 429) return res.status(429).json({ error: 'football_data_rate_limited' })
  if (err.code === 401 || err.code === 403) return res.status(502).json({ error: 'football_data_invalid_key' })
  return res.status(502).json({ error: 'football_data_unreachable' })
}

function mapMatch(m) {
  return {
    id: m.id,
    utcDate: m.utcDate,
    status: m.status,
    matchday: m.matchday,
    stage: m.stage,
    homeTeam: { id: m.homeTeam.id, name: m.homeTeam.name, shortName: m.homeTeam.shortName, crest: m.homeTeam.crest },
    awayTeam: { id: m.awayTeam.id, name: m.awayTeam.name, shortName: m.awayTeam.shortName, crest: m.awayTeam.crest },
    venue: m.venue || null,
    score: m.score || null,
    competition: m.competition ? { id: m.competition.id, name: m.competition.name, code: m.competition.code } : null,
  }
}

predictRouter.get('/predict/leagues', async (req, res) => {
  if (!FOOTBALL_DATA_KEY) return res.status(503).json({ error: 'football_data_not_configured' })
  try {
    const data = await fetchCompetitions()
    const competitions = data.competitions || []
    const leagues = LEAGUE_DEFS.map((def) => {
      const found = competitions.find(def.match)
      return {
        id: def.id,
        labelAr: def.labelAr,
        labelFr: def.labelFr,
        available: !!found,
        code: found?.code || null,
      }
    })
    res.json({ leagues })
  } catch (err) {
    handleFootballDataError(res, err)
  }
})

predictRouter.get('/predict/matches', async (req, res) => {
  if (!FOOTBALL_DATA_KEY) return res.status(503).json({ error: 'football_data_not_configured' })
  const leagueId = String(req.query.league || '')
  const def = LEAGUE_DEFS.find((d) => d.id === leagueId)
  if (!def) return res.status(400).json({ error: 'invalid_league' })

  try {
    const competitionsData = await fetchCompetitions()
    const found = (competitionsData.competitions || []).find(def.match)
    if (!found) return res.status(404).json({ error: 'league_unavailable' })

    const dateFrom = todayInFactoryTZ()
    const dateTo = todayInFactoryTZ(new Date(Date.now() + 10 * 86400000))
    const data = await cachedFootballDataFetch(
      `matches:${found.code}:${dateFrom}:${dateTo}`,
      `/competitions/${found.code}/matches`,
      { dateFrom, dateTo },
    )
    const matches = (data.matches || []).map(mapMatch)
    res.json({ league: { id: def.id, code: found.code, name: found.name }, matches })
  } catch (err) {
    handleFootballDataError(res, err)
  }
})

function extractStandingsRows(data, teamIds) {
  const total = (data.standings || []).find((s) => s.type === 'TOTAL')
  if (!total) return null
  return total.table
    .filter((row) => teamIds.includes(row.team.id))
    .map((row) => ({
      team: row.team.name,
      position: row.position,
      played: row.playedGames,
      points: row.points,
      won: row.won,
      draw: row.draw,
      lost: row.lost,
      goalsFor: row.goalsFor,
      goalsAgainst: row.goalsAgainst,
      goalDifference: row.goalDifference,
      // "W,D,L,W,W"-style last-5 form, straight from football-data.org —
      // real data with zero extra requests, instead of the previous design's
      // 2 separate /teams/{id}/matches calls just to derive the same thing.
      form: row.form,
    }))
}

// Exactly 3 football-data.org calls (each independently cached above), down
// from the previous design's 5 — match detail, head-to-head, and standings
// (which covers both teams' position/points/form in one call).
async function buildGrounding(matchId) {
  const match = await cachedFootballDataFetch(`match:${matchId}`, `/matches/${matchId}`)

  const [h2h, standings] = await Promise.all([
    cachedFootballDataFetch(`h2h:${matchId}`, `/matches/${matchId}/head2head`, { limit: 5 }).catch(() => null),
    match.competition?.code
      ? cachedFootballDataFetch(`standings:${match.competition.code}`, `/competitions/${match.competition.code}/standings`).catch(() => null)
      : null,
  ])

  return {
    match: {
      homeTeam: match.homeTeam.name,
      awayTeam: match.awayTeam.name,
      competition: match.competition?.name || null,
      utcDate: match.utcDate,
      matchday: match.matchday,
      stage: match.stage,
      venue: match.venue || null,
    },
    headToHead: h2h
      ? {
          totalMatches: h2h.aggregates?.numberOfMatches ?? null,
          homeTeamWins: h2h.aggregates?.homeTeam?.wins ?? null,
          draws: h2h.aggregates?.homeTeam?.draws ?? null,
          awayTeamWins: h2h.aggregates?.awayTeam?.wins ?? null,
        }
      : null,
    standings: standings ? extractStandingsRows(standings, [match.homeTeam.id, match.awayTeam.id]) : null,
  }
}

// One short prompt, one small response — the only reliable way to fit
// inside Vercel Hobby's hard function-duration cap regardless of its exact
// value. No narrative sections; just the essential pick.
const QUICK_SYSTEM_PROMPT = `أنت محلل توقعات كرة قدم سريع في نظام "أطلس بريديكت". بالاعتماد فقط على البيانات الحقيقية المُعطاة (ترتيب، نقاط، فورمة آخر 5 مباريات، مواجهات سابقة) أعطِ توقعًا مختصرًا جدًا. لا تكتب مقدمات أو شرح — فقط JSON.

قواعد: لا تعطِ ثقة 90% فأكثر إلا بفارق واضح جدًا في الترتيب والفورمة. خفّض الثقة إذا كان أحد الفريقين حديث الصعود أو الفارق غير واضح. "tacticalNote" سطران فقط، مختصر جدًا.

رد بصيغة JSON صالح فقط (بدون أي نص قبله أو بعده، وبدون علامات كود Markdown)، مطابق تمامًا لهذا الشكل:
{"outcome":{"pick":"1","confidence":0},"overUnder25":{"pick":"over","probability":0.0},"btts":{"pick":"yes","probability":0.0},"bestBet":"نص قصير جدًا","tacticalNote":"سطران فقط"}

"pick" في outcome: "1" (فوز المضيف) أو "X" (تعادل) أو "2" (فوز الضيف). "pick" في overUnder25: "over" أو "under". "pick" في btts: "yes" أو "no". probability أرقام عشرية بين 0 و1. confidence رقم صحيح بين 0 و97.`

async function incrementAnalysisUsage() {
  const date = todayInFactoryTZ()
  const row = await get(
    `INSERT INTO predict_analysis_usage (date, count) VALUES ($1, 1)
     ON CONFLICT (date) DO UPDATE SET count = predict_analysis_usage.count + 1
     RETURNING count`,
    [date]
  )
  return row.count
}

function parseQuickReport(text) {
  const cleaned = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim()
  const parsed = JSON.parse(cleaned)
  if (!parsed || typeof parsed !== 'object' || !parsed.outcome?.pick) {
    throw new Error('invalid_shape')
  }
  return parsed
}

function confidenceTierOf(confidence) {
  if (confidence >= 80) return 'green'
  if (confidence >= 60) return 'yellow'
  return 'red'
}

predictRouter.post('/predict/analyze', async (req, res) => {
  const matchId = req.body?.matchId
  if (!matchId) return res.status(400).json({ error: 'match_id_required' })
  if (!FOOTBALL_DATA_KEY) return res.status(503).json({ error: 'football_data_not_configured' })
  if (!anthropic) return res.status(503).json({ error: 'ai_not_configured' })

  const usedToday = await incrementAnalysisUsage()
  if (usedToday > ANALYSIS_DAILY_LIMIT) {
    return res.status(429).json({ error: 'daily_limit_reached' })
  }

  let grounding
  try {
    grounding = await buildGrounding(matchId)
  } catch (err) {
    return handleFootballDataError(res, err)
  }

  try {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      system: QUICK_SYSTEM_PROMPT,
      messages: [
        { role: 'user', content: `بيانات حقيقية:\n${JSON.stringify(grounding)}\n\nولّد التوقع بصيغة JSON فقط.` },
      ],
    })

    const textBlock = response.content.find((b) => b.type === 'text')
    if (!textBlock?.text) return res.status(502).json({ error: 'empty_ai_response' })

    const parsed = parseQuickReport(textBlock.text)
    const report = { ...parsed, confidenceTier: confidenceTierOf(Number(parsed.outcome?.confidence) || 0) }
    res.json({ report, grounding })
  } catch (err) {
    console.error('predict_analyze_error', err)
    res.status(502).json({ error: 'invalid_ai_response' })
  }
})
