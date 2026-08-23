export function emptyMatch() {
  return {
    id: null,
    homeTeam: '',
    awayTeam: '',
    league: '',
    date: '',
    time: '',
    xgHome: 1.3,
    xgAway: 1.1,
    possessionHome: 50,
    possessionAway: 50,
    sotHome: 4,
    sotAway: 3,
    bigChancesHome: 2,
    bigChancesAway: 1,
    cornersHome: 5,
    cornersAway: 4,
    passAccHome: 82,
    passAccAway: 80,
    formHome: '',
    formAway: '',
    h2h: '',
    h2hEdge: 'even',
    injuries: '',
    injuriesImpact: 'none',
    motivationHome: 'comfortable',
    motivationAway: 'comfortable',
    isKnockout: false,
    couldGoToPenalties: false,
    opponentPromoted: 'none',
    bothBenefitFromDraw: false,
    eliteGK: 'none',
    rotationRisk: 'none',
    revengeFactor: 'none',
    result: null,
  }
}

export const MOTIVATION_OPTIONS = ['must_win', 'comfortable', 'resting']
export const SIDE_NONE_OPTIONS = ['none', 'home', 'away', 'both']
export const EDGE_OPTIONS = ['even', 'home', 'away']
