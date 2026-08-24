import { useEffect, useState } from 'react'
import { useLang } from '../lib/i18n'
import { fetchLeagues, fetchMatches, requestAnalysis } from '../lib/footballApi'
import LeagueSelector from './LeagueSelector'
import LiveMatchCard from './LiveMatchCard'

const ERROR_KEY = {
  football_data_not_configured: 'footballDataNotConfigured',
  football_data_rate_limited: 'footballDataRateLimited',
  football_data_invalid_key: 'footballDataInvalidKey',
  football_data_unreachable: 'footballDataUnreachable',
  league_unavailable: 'leagueUnavailableNote',
  ai_not_configured: 'aiNotConfigured',
  daily_limit_reached: 'analysisDailyLimitReached',
}

export default function LiveMatches() {
  const { t } = useLang()
  const [leagues, setLeagues] = useState([])
  const [leaguesError, setLeaguesError] = useState(null)
  const [selectedLeague, setSelectedLeague] = useState(null)
  const [matches, setMatches] = useState([])
  const [matchesLoading, setMatchesLoading] = useState(false)
  const [matchesError, setMatchesError] = useState(null)
  const [analysisState, setAnalysisState] = useState({})

  useEffect(() => {
    fetchLeagues()
      .then((data) => {
        setLeagues(data.leagues)
        const firstAvailable = data.leagues.find((l) => l.available)
        if (firstAvailable) setSelectedLeague(firstAvailable.id)
      })
      .catch((err) => setLeaguesError(t(ERROR_KEY[err.message] || 'footballDataUnreachable')))
  }, [])

  useEffect(() => {
    if (!selectedLeague) return
    setMatchesLoading(true)
    setMatchesError(null)
    setMatches([])
    fetchMatches(selectedLeague)
      .then((data) => setMatches(data.matches))
      .catch((err) => setMatchesError(t(ERROR_KEY[err.message] || 'footballDataUnreachable')))
      .finally(() => setMatchesLoading(false))
  }, [selectedLeague])

  function handleAnalyze(match) {
    setAnalysisState((prev) => ({
      ...prev,
      [match.id]: { ...prev[match.id], analyzing: true, error: null, expanded: true },
    }))
    requestAnalysis(match.id)
      .then((data) => {
        setAnalysisState((prev) => ({
          ...prev,
          [match.id]: { analyzing: false, report: data.report, grounding: data.grounding, expanded: true, error: null },
        }))
      })
      .catch((err) => {
        setAnalysisState((prev) => ({
          ...prev,
          [match.id]: {
            ...prev[match.id],
            analyzing: false,
            error: t(ERROR_KEY[err.message] || 'analysisFailed'),
          },
        }))
      })
  }

  return (
    <div className="space-y-4">
      {leaguesError ? (
        <p className="text-sm text-status-bad">{leaguesError}</p>
      ) : (
        <LeagueSelector leagues={leagues} selected={selectedLeague} onSelect={setSelectedLeague} />
      )}

      {matchesLoading && <p className="text-sm text-slate-500">{t('loadingMatches')}</p>}
      {matchesError && <p className="text-sm text-status-bad">{matchesError}</p>}
      {!matchesLoading && !matchesError && selectedLeague && matches.length === 0 && (
        <p className="text-sm text-slate-500">{t('noMatchesFound')}</p>
      )}

      <div className="space-y-3">
        {matches.map((match) => (
          <LiveMatchCard key={match.id} match={match} state={analysisState[match.id]} onAnalyze={handleAnalyze} />
        ))}
      </div>
    </div>
  )
}
