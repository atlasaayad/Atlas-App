// Small self-contained Poisson helpers used to turn goal-expectancy (lambda)
// numbers into win/draw/loss, over/under, BTTS and clean-sheet probabilities.

const factorialCache = [1]
function factorial(n) {
  for (let i = factorialCache.length; i <= n; i++) {
    factorialCache[i] = factorialCache[i - 1] * i
  }
  return factorialCache[n]
}

export function poissonPMF(k, lambda) {
  if (lambda <= 0) return k === 0 ? 1 : 0
  return (Math.exp(-lambda) * Math.pow(lambda, k)) / factorial(k)
}

export function poissonCDF(k, lambda) {
  let sum = 0
  for (let i = 0; i <= k; i++) sum += poissonPMF(i, lambda)
  return sum
}

// Joint scoreline matrix for two independent Poisson processes, truncated at
// `max` goals per side (10 is plenty for realistic football lambdas).
export function scoreMatrix(lambdaHome, lambdaAway, max = 10) {
  const matrix = []
  for (let i = 0; i <= max; i++) {
    const row = []
    for (let j = 0; j <= max; j++) {
      row.push(poissonPMF(i, lambdaHome) * poissonPMF(j, lambdaAway))
    }
    matrix.push(row)
  }
  return matrix
}

export function outcomeProbabilities(lambdaHome, lambdaAway) {
  const matrix = scoreMatrix(lambdaHome, lambdaAway)
  let pHome = 0
  let pDraw = 0
  let pAway = 0
  for (let i = 0; i < matrix.length; i++) {
    for (let j = 0; j < matrix[i].length; j++) {
      const p = matrix[i][j]
      if (i > j) pHome += p
      else if (i === j) pDraw += p
      else pAway += p
    }
  }
  const total = pHome + pDraw + pAway || 1
  return { pHome: pHome / total, pDraw: pDraw / total, pAway: pAway / total, matrix }
}

// P(homeGoals - awayGoals > line), i.e. the probability home covers an
// Asian-handicap line of `line` (positive line handicaps the home side).
export function handicapCoverProbability(matrix, line) {
  let p = 0
  let total = 0
  for (let i = 0; i < matrix.length; i++) {
    for (let j = 0; j < matrix[i].length; j++) {
      total += matrix[i][j]
      if (i - j > line) p += matrix[i][j]
    }
  }
  return total > 0 ? p / total : 0
}

export function overProbability(totalLambda, threshold) {
  // threshold is X.5, e.g. 2.5 -> "over 2 goals scored"
  return 1 - poissonCDF(Math.floor(threshold), totalLambda)
}

export function bttsProbability(lambdaHome, lambdaAway) {
  const pHomeBlank = Math.exp(-lambdaHome)
  const pAwayBlank = Math.exp(-lambdaAway)
  return 1 - pHomeBlank - pAwayBlank + pHomeBlank * pAwayBlank
}

export function cleanSheetProbabilities(lambdaHome, lambdaAway) {
  return {
    home: Math.exp(-lambdaAway), // away fails to score
    away: Math.exp(-lambdaHome), // home fails to score
  }
}

export const clamp = (v, min, max) => Math.min(max, Math.max(min, v))
