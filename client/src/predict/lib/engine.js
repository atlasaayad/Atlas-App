// ATLAS PREDICT prediction engine.
//
// Deterministic, rule-based, fully client-side. Goal expectancy (lambda) is
// derived from the input match stats, then adjusted by a fixed set of
// "methodology rules" learned from reviewing 150+ World Cup 2026 matches
// (see REFERENCE_LESSONS in lessons.js) before being turned into 1X2, Over/
// Under, BTTS, clean-sheet and Asian-handicap numbers via a Poisson model.
import {
  outcomeProbabilities,
  overProbability,
  bttsProbability,
  cleanSheetProbabilities,
  handicapCoverProbability,
  clamp,
} from './poisson'

const FORM_POINTS = { W: 3, D: 1, L: 0 }

export function formScore(form) {
  const letters = (form || '').split('').filter((c) => FORM_POINTS[c] !== undefined)
  if (letters.length === 0) return 0.5
  const total = letters.reduce((sum, c) => sum + FORM_POINTS[c], 0)
  return total / (letters.length * 3)
}

function num(v, fallback = 0) {
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}

function qualityMultiplier(m, side) {
  const form = formScore(m[`form${side}`]) // 0..1
  const possession = clamp(num(m[`possession${side}`], 50) / 100, 0, 1)
  const sot = clamp(num(m[`sot${side}`], 4) / 8, 0, 1.5)
  const bigChances = clamp(num(m[`bigChances${side}`], 2) / 5, 0, 1.5)
  const passAcc = clamp(num(m[`passAcc${side}`], 80) / 100, 0, 1)
  const corners = clamp(num(m[`corners${side}`], 5) / 10, 0, 1.2)

  const composite =
    0.34 * (form * 2) +
    0.18 * (possession * 1.6) +
    0.2 * sot +
    0.14 * bigChances +
    0.08 * (passAcc * 1.4) +
    0.06 * corners

  return clamp(composite, 0.6, 1.55)
}

const OTHER = { home: 'away', Home: 'Away', away: 'home', Away: 'Home' }

function computeLambdas(m) {
  const applied = []
  let lambdaHome = clamp(num(m.xgHome, 1), 0.15, 5) * qualityMultiplier(m, 'Home')
  let lambdaAway = clamp(num(m.xgAway, 1), 0.15, 5) * qualityMultiplier(m, 'Away')

  if (m.revengeFactor === 'home') {
    lambdaHome *= 1.08
    applied.push({ key: 'revengeFactor', side: 'home' })
  } else if (m.revengeFactor === 'away') {
    lambdaAway *= 1.08
    applied.push({ key: 'revengeFactor', side: 'away' })
  }

  if (m.rotationRisk === 'home' || m.rotationRisk === 'both') {
    lambdaHome *= 0.87
    applied.push({ key: 'rotationRisk', side: 'home' })
  }
  if (m.rotationRisk === 'away' || m.rotationRisk === 'both') {
    lambdaAway *= 0.87
    applied.push({ key: 'rotationRisk', side: 'away' })
  }

  if (m.eliteGK === 'home' || m.eliteGK === 'both') {
    lambdaAway *= 0.85
    applied.push({ key: 'eliteGK', side: 'home' })
  }
  if (m.eliteGK === 'away' || m.eliteGK === 'both') {
    lambdaHome *= 0.85
    applied.push({ key: 'eliteGK', side: 'away' })
  }

  if (m.bothBenefitFromDraw) {
    lambdaHome *= 0.9
    lambdaAway *= 0.9
    applied.push({ key: 'bothBenefitFromDraw' })
  }

  return {
    lambdaHome: clamp(lambdaHome, 0.05, 6),
    lambdaAway: clamp(lambdaAway, 0.05, 6),
    applied,
  }
}

function favoriteSide(pHome, pDraw, pAway) {
  const top = Math.max(pHome, pDraw, pAway)
  if (top === pDraw) return 'draw'
  return top === pHome ? 'home' : 'away'
}

// Each check returns which side it favors ('home' | 'away' | 'even' | null).
// A factor "supports" the predicted outcome when its side matches the
// favorite (or, for a predicted draw, when the check reads 'even').
function buildFactorChecks(m) {
  const xgGap = num(m.xgHome) - num(m.xgAway)
  const formGap = formScore(m.formHome) - formScore(m.formAway)
  const possGap = num(m.possessionHome, 50) - num(m.possessionAway, 50)
  const bcGap = num(m.bigChancesHome) - num(m.bigChancesAway)

  const sideOf = (gap, threshold) => {
    if (Math.abs(gap) < threshold) return 'even'
    return gap > 0 ? 'home' : 'away'
  }

  const checks = [
    { key: 'xg', side: sideOf(xgGap, 0.8) },
    { key: 'form', side: sideOf(formGap, 0.27) },
    { key: 'possession', side: sideOf(possGap, 10) },
    { key: 'bigChances', side: sideOf(bcGap, 2) },
  ]

  if (m.h2hEdge && m.h2hEdge !== 'even') checks.push({ key: 'h2h', side: m.h2hEdge })
  else if (m.h2hEdge === 'even') checks.push({ key: 'h2h', side: 'even' })

  if (m.injuriesImpact === 'home') checks.push({ key: 'injuries', side: 'away' })
  else if (m.injuriesImpact === 'away') checks.push({ key: 'injuries', side: 'home' })
  else if (m.injuriesImpact === 'none') checks.push({ key: 'injuries', side: 'even' })

  if (m.revengeFactor === 'home' || m.revengeFactor === 'away') {
    checks.push({ key: 'revenge', side: m.revengeFactor })
  }

  const motivHome = m.motivationHome
  const motivAway = m.motivationAway
  if (motivHome === 'must_win' && motivAway !== 'must_win') checks.push({ key: 'motivation', side: 'home' })
  if (motivAway === 'must_win' && motivHome !== 'must_win') checks.push({ key: 'motivation', side: 'away' })

  return checks
}

function supportingFactors(m, favorite) {
  const checks = buildFactorChecks(m)
  const target = favorite === 'draw' ? 'even' : favorite
  return checks.filter((c) => c.side === target)
}

function isTrapGame(m, favorite) {
  if (favorite === 'draw') return false
  const underdog = favorite === 'home' ? 'away' : 'home'
  const underdogMotivation = m[`motivation${cap(underdog)}`]
  const favoriteMotivation = m[`motivation${cap(favorite)}`]
  return underdogMotivation === 'must_win' && favoriteMotivation !== 'must_win'
}

function cap(s) {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function computeConfidence({ pHome, pDraw, pAway, m, factorsCount, trapGame }) {
  const favorite = favoriteSide(pHome, pDraw, pAway)
  let confidence = Math.max(pHome, pDraw, pAway) * 100
  const notes = []

  if (m.opponentPromoted && m.opponentPromoted !== 'none') {
    confidence *= 0.775
    notes.push('reduceTrustPromoted')
  }

  const favoriteHasRotationRisk =
    (favorite === 'home' && (m.rotationRisk === 'home' || m.rotationRisk === 'both')) ||
    (favorite === 'away' && (m.rotationRisk === 'away' || m.rotationRisk === 'both'))
  if (favoriteHasRotationRisk) {
    confidence *= 0.825
    notes.push('reduceTrustRotation')
  }

  if (m.isKnockout && m.couldGoToPenalties) {
    confidence *= 0.8
    notes.push('penaltyUncertainty')
  }

  if (trapGame) {
    confidence *= 0.9
    notes.push('trapGame')
  }

  if (confidence >= 90 && factorsCount < 3) {
    confidence = 89
    notes.push('cappedNoFactors')
  }

  confidence = clamp(Math.round(confidence), 3, 97)
  return { confidence, notes, favorite }
}

function outcomeMarket({ pHome, pDraw, pAway, confidence, factorsCount, trapGame, isKnockout }) {
  const options = [
    { key: '1', p: pHome },
    { key: 'X', p: pDraw },
    { key: '2', p: pAway },
  ].sort((a, b) => b.p - a.p)
  const top = options[0]

  const strongEvidence = confidence >= 80 && factorsCount >= 3 && !trapGame
  const useDoubleChance = isKnockout || !strongEvidence

  if (!useDoubleChance) {
    return { pick: top.key, kind: 'direct', probability: top.p }
  }

  let pick
  if (top.key === '1') pick = '1X'
  else if (top.key === '2') pick = 'X2'
  else pick = pHome >= pAway ? '1X' : 'X2'

  const probability =
    pick === '1X' ? pHome + pDraw : pick === 'X2' ? pDraw + pAway : pHome + pAway

  return { pick, kind: 'double-chance', probability }
}

function overUnderMarket({ totalLambda, eliteGK, bothBenefitFromDraw }) {
  const p25 = overProbability(totalLambda, 2.5)
  const p15 = overProbability(totalLambda, 1.5)
  const p35 = overProbability(totalLambda, 3.5)

  const suppressed = eliteGK !== 'none' || bothBenefitFromDraw
  let pick = p25 >= 0.5 ? 'over2.5' : 'under2.5'
  if (suppressed && p25 < 0.65) pick = 'under2.5'

  return {
    pick,
    probability: pick === 'over2.5' ? p25 : 1 - p25,
    over15: p15,
    over25: p25,
    over35: p35,
    suppressedByRule: suppressed,
  }
}

function bttsMarket({ lambdaHome, lambdaAway, xgHome, xgAway, eliteGK }) {
  const p = bttsProbability(lambdaHome, lambdaAway)
  const ruleTriggered = (num(xgHome) > 1.5 || num(xgAway) > 1.5) && eliteGK === 'none'
  const yesThreshold = ruleTriggered ? 0.5 : 0.55
  const noThreshold = 0.42

  let pick = 'avoid'
  if (p >= yesThreshold) pick = 'yes'
  else if (p <= noThreshold) pick = 'no'

  return { pick, probability: p, ruleTriggered }
}

function asianHandicapMarket({ lambdaHome, lambdaAway, matrix }) {
  const diff = lambdaHome - lambdaAway
  const magnitude = Math.abs(diff)
  let line
  if (magnitude < 0.25) line = 0
  else if (magnitude < 0.75) line = 0.25
  else if (magnitude < 1.25) line = 0.5
  else if (magnitude < 1.75) line = 1
  else if (magnitude < 2.25) line = 1.5
  else line = 2

  const side = magnitude < 0.25 ? 'even' : diff > 0 ? 'home' : 'away'
  const signedLine = side === 'away' ? line : -line // handicap applied to the favored side
  const coverLine = side === 'home' ? line : side === 'away' ? -line : 0
  const probability =
    side === 'home'
      ? handicapCoverProbability(matrix, coverLine)
      : side === 'away'
        ? 1 - handicapCoverProbability(matrix, -coverLine)
        : 0.5

  return { side, line, signedLine, probability }
}

export function computePrediction(m) {
  const { lambdaHome, lambdaAway, applied } = computeLambdas(m)
  const { pHome, pDraw, pAway, matrix } = outcomeProbabilities(lambdaHome, lambdaAway)
  const totalLambda = lambdaHome + lambdaAway

  const favorite = favoriteSide(pHome, pDraw, pAway)
  const factors = supportingFactors(m, favorite)
  const trapGame = isTrapGame(m, favorite)

  const { confidence, notes, favorite: confFavorite } = computeConfidence({
    pHome,
    pDraw,
    pAway,
    m,
    factorsCount: factors.length,
    trapGame,
  })

  const outcome = outcomeMarket({
    pHome,
    pDraw,
    pAway,
    confidence,
    factorsCount: factors.length,
    trapGame,
    isKnockout: !!m.isKnockout,
  })

  const overUnder = overUnderMarket({
    totalLambda,
    eliteGK: m.eliteGK || 'none',
    bothBenefitFromDraw: !!m.bothBenefitFromDraw,
  })

  const btts = bttsMarket({
    lambdaHome,
    lambdaAway,
    xgHome: m.xgHome,
    xgAway: m.xgAway,
    eliteGK: m.eliteGK || 'none',
  })

  const cleanSheet = cleanSheetProbabilities(lambdaHome, lambdaAway)
  const asianHandicap = asianHandicapMarket({ lambdaHome, lambdaAway, matrix })

  const sortedOutcomes = [
    { key: 'home', p: pHome },
    { key: 'draw', p: pDraw },
    { key: 'away', p: pAway },
  ].sort((a, b) => b.p - a.p)

  const alternativeScenario = {
    key: sortedOutcomes[1].key,
    probability: sortedOutcomes[1].p,
  }

  let tier = 'red'
  if (confidence >= 80) tier = 'green'
  else if (confidence >= 60) tier = 'yellow'

  return {
    lambdaHome,
    lambdaAway,
    pHome,
    pDraw,
    pAway,
    favorite: confFavorite,
    confidence,
    tier,
    confidenceNotes: notes,
    appliedRules: applied,
    supportingFactors: factors,
    trapGame,
    penaltyWarning: !!(m.isKnockout && m.couldGoToPenalties),
    outcome,
    overUnder,
    btts,
    cleanSheet,
    asianHandicap,
    alternativeScenario,
  }
}

// --- Tracker / accuracy -----------------------------------------------

export function actualOutcomeKey(homeGoals, awayGoals) {
  if (homeGoals > awayGoals) return 'home'
  if (homeGoals < awayGoals) return 'away'
  return 'draw'
}

function outcomePickHits(pick, actualKey) {
  const map = { 1: 'home', X: 'draw', 2: 'away' }
  if (pick === '1X') return actualKey === 'home' || actualKey === 'draw'
  if (pick === 'X2') return actualKey === 'draw' || actualKey === 'away'
  if (pick === '12') return actualKey !== 'draw'
  return map[pick] === actualKey
}

export function evaluateMatch(match) {
  const { result, prediction } = match
  if (!result || result.homeGoals === '' || result.homeGoals == null || result.awayGoals == null) {
    return null
  }
  const homeGoals = num(result.homeGoals)
  const awayGoals = num(result.awayGoals)
  const actualKey = actualOutcomeKey(homeGoals, awayGoals)
  const totalGoals = homeGoals + awayGoals
  const bttsActual = homeGoals > 0 && awayGoals > 0

  const outcomeHit = outcomePickHits(prediction.outcome.pick, actualKey)
  const overUnderHit =
    prediction.overUnder.pick === 'over2.5' ? totalGoals > 2.5 : totalGoals <= 2.5
  const bttsHit =
    prediction.btts.pick === 'avoid' ? null : prediction.btts.pick === 'yes' ? bttsActual : !bttsActual

  return {
    actualKey,
    homeGoals,
    awayGoals,
    totalGoals,
    bttsActual,
    outcomeHit,
    overUnderHit,
    bttsHit,
    hit: outcomeHit,
  }
}

export { qualityMultiplier, computeLambdas, favoriteSide, supportingFactors, isTrapGame }
