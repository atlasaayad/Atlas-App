import { useMemo } from 'react'
import { useLang } from '../lib/i18n'
import MatchCard from './MatchCard'

function todayIso() {
  const d = new Date()
  return d.toISOString().slice(0, 10)
}

export default function Dashboard({ matches, onEdit, onDelete, accuracy, streak }) {
  const { t } = useLang()
  const today = todayIso()

  const todaysMatches = useMemo(
    () => matches.filter((m) => m.date === today).sort((a, b) => (b.prediction?.confidence || 0) - (a.prediction?.confidence || 0)),
    [matches, today],
  )

  const ranked = useMemo(
    () =>
      [...matches]
        .filter((m) => m.prediction)
        .sort((a, b) => b.prediction.confidence - a.prediction.confidence)
        .slice(0, 8),
    [matches],
  )

  const bestBet = useMemo(() => {
    const pool = (todaysMatches.length ? todaysMatches : matches).filter(
      (m) => m.prediction && m.prediction.tier === 'green' && !m.prediction.trapGame,
    )
    if (pool.length) return pool.sort((a, b) => b.prediction.confidence - a.prediction.confidence)[0]
    const fallback = (todaysMatches.length ? todaysMatches : matches).filter((m) => m.prediction)
    return fallback.length ? fallback.sort((a, b) => b.prediction.confidence - a.prediction.confidence)[0] : null
  }, [todaysMatches, matches])

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label={t('totalMatches')} value={matches.length} />
        <StatTile label={t('settledMatches')} value={matches.filter((m) => m.evaluation).length} />
        <StatTile label={t('accuracyOverall')} value={accuracy != null ? `${accuracy.toFixed(0)}%` : '—'} />
        <StatTile
          label={t('currentStreak')}
          value={streak.count > 0 ? `${streak.count} ${streak.type === 'win' ? t('streakWins') : t('streakLosses')}` : t('noStreak')}
        />
      </div>

      <section>
        <h2 className="mb-2 font-display text-sm font-semibold uppercase tracking-wide text-[#D4AF37]">{t('bestBetOfDay')}</h2>
        {bestBet ? (
          <MatchCard match={bestBet} onEdit={onEdit} onDelete={onDelete} defaultExpanded />
        ) : (
          <p className="text-sm text-slate-500">{t('noBestBet')}</p>
        )}
      </section>

      <section>
        <h2 className="mb-2 font-display text-sm font-semibold uppercase tracking-wide text-[#D4AF37]">{t('todaysMatches')}</h2>
        {todaysMatches.length === 0 ? (
          <p className="text-sm text-slate-500">{t('noMatchesToday')}</p>
        ) : (
          <div className="space-y-3">
            {todaysMatches.map((m) => (
              <MatchCard key={m.id} match={m} onEdit={onEdit} onDelete={onDelete} />
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-2 font-display text-sm font-semibold uppercase tracking-wide text-[#D4AF37]">{t('confidenceRanking')}</h2>
        {ranked.length === 0 ? (
          <p className="text-sm text-slate-500">{t('noBestBet')}</p>
        ) : (
          <div className="space-y-3">
            {ranked.map((m) => (
              <MatchCard key={m.id} match={m} onEdit={onEdit} onDelete={onDelete} />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

function StatTile({ label, value }) {
  return (
    <div className="rounded-xl border border-[#D4AF37]/10 bg-navy-900/50 p-3 text-center">
      <div className="font-display text-xl font-bold text-[#D4AF37]">{value}</div>
      <div className="mt-0.5 text-[11px] text-slate-400">{label}</div>
    </div>
  )
}
