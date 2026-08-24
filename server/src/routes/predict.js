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

// Report generation is split into 4 small, focused Claude calls instead of
// one (or even two) larger ones — Vercel Hobby hard-caps function duration
// regardless of the maxDuration config, so the only reliable fix is making
// every individual call fast enough to fit inside that ceiling regardless
// of what the exact number is. Each call uses claude-haiku-4-5-20251001
// (the same fast/cheap model Ask Atlas already uses, for the same reason)
// with a small max_tokens.
//
// The server is deliberately stateless across these calls: football-data.org
// grounding is fetched once via a dedicated 'grounding' part (no Claude call
// at all — just the data, back in well under a second normally) and the
// client passes that same JSON forward to every other part. This avoids
// relying on Vercel reusing the same warm instance across the 3 calls that
// run in parallel (context/insights/markets-core) — a fresh cold instance
// wouldn't share an in-memory cache anyway, so the previous per-instance
// cache design didn't actually guarantee reuse under concurrency.
const CONTEXT_SYSTEM_PROMPT = `أنت محلل كرة قدم في نظام "أطلس بريديكت". اكتب 4 فقرات قصيرة جدًا باللغة العربية الفصحى عن مباراة كرة قدم، بالاعتماد فقط على البيانات الحقيقية المُعطاة لك — لا تختلق أرقامًا لم تُعطَ لك. كل فقرة جملتان إلى ثلاث جمل فقط، مختصرة ومباشرة.

ردك يجب أن يكون JSON صالح فقط (بدون أي نص قبله أو بعده، وبدون علامات كود Markdown)، مطابق تمامًا لهذا الشكل:
{
  "matchContext": "جملتان-3 عن سياق المباراة وأهميتها",
  "homeFormSummary": "جملتان-3 عن فورمة الفريق المضيف في آخر 5 مباريات",
  "awayFormSummary": "جملتان-3 عن فورمة الفريق الزائر في آخر 5 مباريات",
  "headToHead": "جملتان-3 عن تاريخ المواجهات المباشرة"
}`

const INSIGHTS_SYSTEM_PROMPT = `أنت محلل كرة قدم في نظام "أطلس بريديكت". اكتب 5 فقرات قصيرة جدًا باللغة العربية الفصحى عن مباراة كرة قدم. كل فقرة جملة إلى ثلاث جمل فقط.

مهم: لا تملك معلومات مؤكدة لحظيًا عن التشكيلة أو الإصابات الحالية، فاكتب هذين الحقلين كتحليل عام مبني على أسلوب الفريقين المعتاد فقط، وابدأ كل واحد منهما بعبارة "تحليل عام غير مؤكد لحظيًا:".

ردك يجب أن يكون JSON صالح فقط (بدون أي نص قبله أو بعده، وبدون علامات كود Markdown)، مطابق تمامًا لهذا الشكل:
{
  "expectedLineupsKeyPlayers": "تحليل عام غير مؤكد لحظيًا: جملتان-3 عن التشكيلة المتوقعة واللاعبين الأساسيين",
  "injuriesSuspensions": "تحليل عام غير مؤكد لحظيًا: جملتان-3 عن الإصابات والإيقافات المحتملة",
  "venueConditions": "جملة إلى جملتين عن الملعب والظروف",
  "tacticalAnalysis": "جملتان-3 تحليل تكتيكي",
  "likelyScorers": "جملة إلى جملتين عن اللاعبين الأقرب للتسجيل"
}`

const MARKETS_CORE_SYSTEM_PROMPT = `أنت محلل توقعات كرة قدم في نظام "أطلس بريديكت". احسب احتمالات الأسواق الأساسية لمباراة كرة قدم بالاعتماد فقط على البيانات الحقيقية المُعطاة لك — لا تختلق أرقامًا لم تُعطَ لك.

${METHODOLOGY}

ردك يجب أن يكون JSON صالح فقط (بدون أي نص قبله أو بعده، وبدون علامات كود Markdown)، مطابق تمامًا لهذا الشكل:
{
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
    "cleanSheet": { "home": 0.0, "away": 0.0 }
  }
}

كل الاحتمالات أرقام عشرية بين 0 و1 (وليست نسب مئوية). "confidence" على مستوى المباراة ككل، رقم صحيح بين 0 و97.`

const MARKETS_PICKS_SYSTEM_PROMPT = `أنت محلل توقعات كرة قدم في نظام "أطلس بريديكت". بالاعتماد على احتمالات الأسواق المحسوبة مسبقًا (مُعطاة لك أدناه)، حدد أفضل رهان وكومبو ذكي وملاحظات المنهجية — لا تعد حساب الاحتمالات، استخدم نفس الأرقام المُعطاة لك للحفاظ على الاتساق.

${METHODOLOGY}

ردك يجب أن يكون JSON صالح فقط (بدون أي نص قبله أو بعده، وبدون علامات كود Markdown)، مطابق تمامًا لهذا الشكل:
{
  "markets": {
    "bestBet": { "market": "نص قصير", "reasoning": "جملة واحدة فقط", "confidence": 0 },
    "smartCombo": { "legs": ["نص", "نص"], "combinedProbability": 0.0, "note": "جملة واحدة فقط" }
  },
  "methodologyNotes": ["ملاحظة قصيرة (أقل من 12 كلمة) عن قاعدة منهجية طُبقت", "..."],
  "confidenceTier": "green",
  "disclaimer": "جملة واحدة تذكير بأن هذا تحليل احتمالي وليس ضمانًا"
}

confidenceTier: green إذا كانت ثقة outcome1x2 المُعطاة 80% فأكثر، yellow إذا بين 60% و79%، red إذا أقل من 60%. اذكر 2 إلى 4 ملاحظات منهجية فقط، الأكثر أهمية.`

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

function parseReport(text, checkFn) {
  const cleaned = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim()
  const parsed = JSON.parse(cleaned)
  if (!parsed || typeof parsed !== 'object' || !checkFn(parsed)) {
    throw new Error('invalid_shape')
  }
  return parsed
}

async function callClaude(systemPrompt, maxTokens, userContent, checkFn) {
  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: maxTokens,
    system: systemPrompt,
    messages: [{ role: 'user', content: userContent }],
  })
  const textBlock = response.content.find((b) => b.type === 'text')
  if (!textBlock?.text) throw new Error('empty_ai_response')
  return parseReport(textBlock.text, checkFn)
}

// GET-like, no Claude call — just the football-data.org grounding, fast
// enough to comfortably finish well inside any Vercel duration limit. The
// client fetches this once and passes it to every part below.
predictRouter.post('/predict/analyze/grounding', async (req, res) => {
  const matchId = req.body?.matchId
  if (!matchId) return res.status(400).json({ error: 'match_id_required' })
  if (!FOOTBALL_DATA_KEY) return res.status(503).json({ error: 'football_data_not_configured' })

  try {
    const grounding = await buildGrounding(matchId)
    res.json({ grounding })
  } catch (err) {
    handleFootballDataError(res, err)
  }
})

predictRouter.post('/predict/analyze', async (req, res) => {
  const matchId = req.body?.matchId
  const part = req.body?.part
  const grounding = req.body?.grounding
  if (!matchId) return res.status(400).json({ error: 'match_id_required' })
  if (!['context', 'insights', 'markets-core', 'markets-picks'].includes(part)) {
    return res.status(400).json({ error: 'invalid_part' })
  }
  if (!grounding || typeof grounding !== 'object') {
    return res.status(400).json({ error: 'grounding_required' })
  }
  if (!anthropic) return res.status(503).json({ error: 'ai_not_configured' })

  // Counted once per analysis (on 'context', part of the first parallel
  // batch the client fires) rather than once per HTTP call — 4 calls now
  // make up one logical "report", so the daily cap should still mean
  // ANALYSIS_DAILY_LIMIT reports/day, not a quarter of that in calls.
  if (part === 'context') {
    const usedToday = await incrementAnalysisUsage()
    if (usedToday > ANALYSIS_DAILY_LIMIT) {
      return res.status(429).json({ error: 'daily_limit_reached' })
    }
  }

  const groundingJson = JSON.stringify(grounding)

  try {
    let report
    if (part === 'context') {
      report = await callClaude(
        CONTEXT_SYSTEM_PROMPT,
        450,
        `بيانات حقيقية:\n${groundingJson}\n\nولّد الجزء المطلوب بصيغة JSON فقط.`,
        (p) => p.matchContext,
      )
    } else if (part === 'insights') {
      report = await callClaude(
        INSIGHTS_SYSTEM_PROMPT,
        550,
        `بيانات حقيقية:\n${groundingJson}\n\nولّد الجزء المطلوب بصيغة JSON فقط.`,
        (p) => p.expectedLineupsKeyPlayers,
      )
    } else if (part === 'markets-core') {
      report = await callClaude(
        MARKETS_CORE_SYSTEM_PROMPT,
        450,
        `بيانات حقيقية:\n${groundingJson}\n\nولّد الجزء المطلوب بصيغة JSON فقط.`,
        (p) => p.markets?.outcome1x2,
      )
    } else {
      const marketsCore = req.body?.marketsCore
      if (!marketsCore || typeof marketsCore !== 'object') {
        return res.status(400).json({ error: 'markets_core_required' })
      }
      report = await callClaude(
        MARKETS_PICKS_SYSTEM_PROMPT,
        450,
        `بيانات حقيقية:\n${groundingJson}\n\nاحتمالات الأسواق المحسوبة مسبقًا:\n${JSON.stringify(marketsCore)}\n\nولّد الجزء المطلوب بصيغة JSON فقط.`,
        (p) => p.confidenceTier,
      )
    }
    res.json({ report })
  } catch (err) {
    console.error('predict_analyze_error', part, err)
    res.status(502).json({ error: 'invalid_ai_response' })
  }
})
