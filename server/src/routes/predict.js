import { Router } from 'express'
import Anthropic from '@anthropic-ai/sdk'
import { get } from '../db/index.js'
import { todayInFactoryTZ } from '../calc.js'

// Standalone route for the ATLAS PREDICT sub-app (client/src/predict,
// mounted at /predict). Entirely separate data/tables from the factory
// tracker — no shared state, no dependency on chains/models/departments.
export const predictRouter = Router()

const FOOTBALL_DATA_KEY = process.env.FOOTBALL_DATA_KEY
const FOOTBALL_DATA_BASE = 'https://api.football-data.org/v4'

const anthropic = process.env.ANTHROPIC_API_KEY ? new Anthropic() : null

// System-wide cap on AI match-analysis reports per factory-local day —
// protects against runaway Anthropic API spend on the heavier report-
// generation model. Mirrors ask.js's DAILY_LIMIT pattern exactly.
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

let competitionsCache = null
let competitionsCacheAt = 0
const COMPETITIONS_TTL_MS = 6 * 60 * 60 * 1000

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

async function fetchCompetitions() {
  if (competitionsCache && Date.now() - competitionsCacheAt < COMPETITIONS_TTL_MS) {
    return competitionsCache
  }
  const data = await footballDataFetch('/competitions')
  competitionsCache = data.competitions || []
  competitionsCacheAt = Date.now()
  return competitionsCache
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
    const competitions = await fetchCompetitions()
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
    const competitions = await fetchCompetitions()
    const found = competitions.find(def.match)
    if (!found) return res.status(404).json({ error: 'league_unavailable' })

    const dateFrom = todayInFactoryTZ()
    const dateTo = todayInFactoryTZ(new Date(Date.now() + 10 * 86400000))
    const data = await footballDataFetch(`/competitions/${found.code}/matches`, { dateFrom, dateTo })
    const matches = (data.matches || []).map(mapMatch)
    res.json({ league: { id: def.id, code: found.code, name: found.name }, matches })
  } catch (err) {
    handleFootballDataError(res, err)
  }
})

function average(nums) {
  const valid = nums.filter((n) => Number.isFinite(n))
  if (!valid.length) return null
  return valid.reduce((a, b) => a + b, 0) / valid.length
}

function round1(n) {
  return n == null ? null : Math.round(n * 10) / 10
}

function summarizeForm(matches, teamId) {
  const last5 = matches
    .filter((m) => m.score?.fullTime?.home != null && m.score?.fullTime?.away != null)
    .slice(0, 5)
    .map((m) => {
      const isHome = m.homeTeam.id === teamId
      const gf = isHome ? m.score.fullTime.home : m.score.fullTime.away
      const ga = isHome ? m.score.fullTime.away : m.score.fullTime.home
      const outcome = gf > ga ? 'W' : gf < ga ? 'L' : 'D'
      return {
        date: m.utcDate?.slice(0, 10),
        opponent: isHome ? m.awayTeam.name : m.homeTeam.name,
        venue: isHome ? 'home' : 'away',
        score: `${gf}-${ga}`,
        outcome,
      }
    })
  return {
    last5,
    formString: last5.map((r) => r.outcome).join(''),
    avgGoalsFor: round1(average(last5.map((r) => Number(r.score.split('-')[0])))),
    avgGoalsAgainst: round1(average(last5.map((r) => Number(r.score.split('-')[1])))),
  }
}

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
      form: row.form,
    }))
}

async function buildGrounding(matchId) {
  const match = await footballDataFetch(`/matches/${matchId}`)

  const [h2h, homeMatches, awayMatches, standings] = await Promise.all([
    footballDataFetch(`/matches/${matchId}/head2head`, { limit: 10 }).catch(() => null),
    footballDataFetch(`/teams/${match.homeTeam.id}/matches`, { status: 'FINISHED', limit: 5 }).catch(() => null),
    footballDataFetch(`/teams/${match.awayTeam.id}/matches`, { status: 'FINISHED', limit: 5 }).catch(() => null),
    match.competition?.code
      ? footballDataFetch(`/competitions/${match.competition.code}/standings`).catch(() => null)
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
          recentMeetings: (h2h.matches || []).slice(0, 5).map((m) => ({
            date: m.utcDate?.slice(0, 10),
            home: m.homeTeam?.name,
            away: m.awayTeam?.name,
            score: m.score?.fullTime ? `${m.score.fullTime.home}-${m.score.fullTime.away}` : null,
          })),
        }
      : null,
    homeForm: homeMatches ? summarizeForm(homeMatches.matches || [], match.homeTeam.id) : null,
    awayForm: awayMatches ? summarizeForm(awayMatches.matches || [], match.awayTeam.id) : null,
    standings: standings ? extractStandingsRows(standings, [match.homeTeam.id, match.awayTeam.id]) : null,
  }
}

const METHODOLOGY = `
منهجية أطلس بريديكت — طبّقها بدقة عند بناء التقرير والتوقعات:
1. عتبة منخفضة + أدلة قوية = ثقة عالية. لا تعطِ ثقة 90% أو أكثر إلا إذا توفرت 3 عوامل داعمة حقيقية على الأقل (فارق واضح في الترتيب/النقاط، فارق في الفورمة، تاريخ مواجهات حاسم...).
2. في مباريات الكأس/الإقصاء، خيار "1X" أو "X2" (Double Chance) أكثر أمانًا من الفوز المباشر — رجّحه ما لم تكن الأدلة قوية جدًا لصالح الفوز المباشر.
3. إذا كان الفريق الأضعف حديث الصعود أو أول موسم له في هذا المستوى، خفّض نسبة الثقة بمقدار 20-25% حتى لو كان الفارق الإحصائي كبيرًا — فرق الصعود تنتج نتائج متطرفة وغير مستقرة.
4. ظاهرة "الحارس العالمي": إذا كان أحد الفريقين يملك حارس مرمى استثنائي معروف، خفّض ثقة سوق Over (فوق) وأشر لذلك صراحة كتحذير.
5. عامل التدوير/الإراحة: إذا كان أحد الفريقين يخوض مباريات متتالية كثيرة أو من المتوقع أن يُريح لاعبين أساسيين (مثلاً قبل مباراة أوروبية مهمة)، خفّض الثقة 15-20% وأشر لذلك.
6. دائمًا اقترح السوق الأكثر أمانًا (Double Chance بدل الفوز المباشر، مثلاً) إلا إذا كانت الأدلة قوية جدًا لصالح الخيار الأخطر.
7. اذكر دائمًا سيناريو بديل مع احتمال تقريبي له.
8. لا تختلق معلومات دقيقة عن التشكيلة المتوقعة أو الإصابات الحالية — هذه ليست بيانات مؤكدة لحظيًا، فاكتبها كتحليل عام مبني على معرفتك بأسلوب الفريقين المعتاد، وذكّر القارئ صراحة أن هذا القسم "تحليل عام غير مؤكد لحظيًا" وليس خبرًا مؤكدًا.
`.trim()

const SYSTEM_PROMPT = `أنت محلل كرة قدم خبير في نظام "أطلس بريديكت". مهمتك توليد تقرير تحليل وتوقعات كامل باللغة العربية الفصحى لمباراة كرة قدم، بالاعتماد فقط على البيانات الحقيقية المُعطاة لك (نتائج، ترتيب، تاريخ مواجهات) — لا تختلق أرقامًا إحصائية لم تُعطَ لك.

${METHODOLOGY}

يجب أن يكون ردك JSON صالح فقط (بدون أي نص قبله أو بعده، وبدون علامات كود Markdown)، مطابق تمامًا لهذا الشكل:
{
  "matchContext": "فقرة عن سياق المباراة وأهميتها",
  "homeFormSummary": "فقرة عن فورمة الفريق المضيف في آخر 5 مباريات",
  "awayFormSummary": "فقرة عن فورمة الفريق الزائر في آخر 5 مباريات",
  "headToHead": "فقرة عن تاريخ المواجهات المباشرة",
  "expectedLineupsKeyPlayers": "فقرة (تحليل عام غير مؤكد لحظيًا) عن التشكيلة المتوقعة واللاعبين الأساسيين",
  "injuriesSuspensions": "فقرة (تحليل عام غير مؤكد لحظيًا) عن الإصابات والإيقافات المحتملة",
  "venueConditions": "فقرة عن الملعب والظروف",
  "tacticalAnalysis": "فقرة تحليل تكتيكي",
  "likelyScorers": "فقرة عن اللاعبين الأقرب للتسجيل",
  "markets": {
    "outcome1x2": { "home": 0.0, "draw": 0.0, "away": 0.0, "pick": "1", "confidence": 0 },
    "doubleChance": { "pick": "1X", "probability": 0.0 },
    "overUnder": {
      "line1_5": { "over": 0.0, "under": 0.0 },
      "line2_5": { "over": 0.0, "under": 0.0 },
      "line3_5": { "over": 0.0, "under": 0.0 },
      "pick": "over2.5"
    },
    "btts": { "yes": 0.0, "no": 0.0, "pick": "yes" },
    "cleanSheet": { "home": 0.0, "away": 0.0 },
    "bestBet": { "market": "نص قصير", "reasoning": "فقرة قصيرة", "confidence": 0 },
    "smartCombo": { "legs": ["نص", "نص"], "combinedProbability": 0.0, "note": "فقرة قصيرة" }
  },
  "methodologyNotes": ["ملاحظة قصيرة عن قاعدة منهجية طُبقت", "..."],
  "confidenceTier": "green",
  "disclaimer": "جملة تذكير بأن هذا تحليل احتمالي وليس ضمانًا"
}

كل الاحتمالات أرقام عشرية بين 0 و1 (وليست نسب مئوية). "confidence" و"confidenceTier" على مستوى المباراة ككل: green إذا 80% فأكثر، yellow إذا بين 60% و79%، red إذا أقل من 60%.`

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

function parseReport(text) {
  const cleaned = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim()
  const parsed = JSON.parse(cleaned)
  if (!parsed || typeof parsed !== 'object' || !parsed.markets) {
    throw new Error('missing_markets')
  }
  return parsed
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
      model: 'claude-sonnet-5',
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: `بيانات حقيقية من football-data.org (JSON):\n${JSON.stringify(grounding)}\n\nولّد تقرير التحليل والتوقعات الكامل بصيغة JSON فقط حسب الشكل المطلوب.`,
        },
      ],
    })

    const textBlock = response.content.find((b) => b.type === 'text')
    if (!textBlock?.text) {
      return res.status(502).json({ error: 'empty_ai_response' })
    }

    const report = parseReport(textBlock.text)
    res.json({ report, grounding })
  } catch (err) {
    console.error('predict_analyze_error', err)
    res.status(502).json({ error: 'invalid_ai_response' })
  }
})
