import { useMemo, useState } from 'react'
import { useLang } from '../lib/i18n'
import MatchCard from './MatchCard'
import AccuracyChart from './AccuracyChart'

function ResultForm({ match, onSettle }) {
  const { t } = useLang()
  const [homeGoals, setHomeGoals] = useState(match.result?.homeGoals ?? '')
  const [awayGoals, setAwayGoals] = useState(match.result?.awayGoals ?? '')

  return (
    <div className="mt-3 flex flex-wrap items-end gap-2 border-t border-gold/10 pt-3">
      <label className="text-xs text-slate-400">
        {t('homeGoals')}
        <input
          type="number"
          min="0"
          className="mt-1 block w-16 rounded-md border border-gold/15 bg-navy-900/70 px-2 py-1 text-sm text-slate-100"
          value={homeGoals}
          onChange={(e) => setHomeGoals(e.target.value)}
        />
      </label>
      <label className="text-xs text-slate-400">
        {t('awayGoals')}
        <input
          type="number"
          min="0"
          className="mt-1 block w-16 rounded-md border border-gold/15 bg-navy-900/70 px-2 py-1 text-sm text-slate-100"
          value={awayGoals}
          onChange={(e) => setAwayGoals(e.target.value)}
        />
      </label>
      <button
        onClick={() => onSettle(match.id, homeGoals, awayGoals)}
        disabled={homeGoals === '' || awayGoals === ''}
        className="rounded-md bg-gold px-3 py-1.5 text-xs font-semibold text-navy-950 disabled:opacity-40"
      >
        {t('saveResult')}
      </button>
    </div>
  )
}

function bucketKey(dateStr, granularity) {
  const d = new Date(dateStr)
  if (Number.isNaN(d.getTime())) return dateStr
  if (granularity === 'monthly') return dateStr.slice(0, 7)
  if (granularity === 'weekly') {
    const onejan = new Date(d.getFullYear(), 0, 1)
    const week = Math.ceil(((d - onejan) / 86400000 + onejan.getDay() + 1) / 7)
    return `${d.getFullYear()}-W${week}`
  }
  return dateStr
}

export default function Tracker({ matches, onSettle, accuracy, streak }) {
  const { t } = useLang()
  const [granularity, setGranularity] = useState('daily')

  const settled = useMemo(() => matches.filter((m) => m.evaluation).sort((a, b) => (a.date > b.date ? 1 : -1)), [matches])
  const pending = useMemo(
    () => matches.filter((m) => m.prediction && !m.evaluation).sort((a, b) => (a.date > b.date ? 1 : -1)),
    [matches],
  )

  const chartPoints = useMemo(() => {
    const buckets = new Map()
    for (const m of settled) {
      const key = bucketKey(m.date, granularity)
      if (!buckets.has(key)) buckets.set(key, { hit: 0, total: 0 })
      const b = buckets.get(key)
      b.total += 1
      if (m.evaluation.hit) b.hit += 1
    }
    return [...buckets.entries()]
      .sort((a, b) => (a[0] > b[0] ? 1 : -1))
      .map(([label, b]) => ({ label: label.slice(5) || label, accuracy: (b.hit / b.total) * 100 }))
  }, [settled, granularity])

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-lg font-semibold text-gold">{t('trackerTitle')}</h2>
        <p className="text-sm text-slate-400">{t('trackerDesc')}</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-gold/10 bg-navy-900/50 p-3 text-center">
          <div className="font-display text-xl font-bold text-gold">{accuracy != null ? `${accuracy.toFixed(0)}%` : '—'}</div>
          <div className="mt-0.5 text-[11px] text-slate-400">{t('accuracyOverall')}</div>
        </div>
        <div className="rounded-xl border border-gold/10 bg-navy-900/50 p-3 text-center">
          <div className={`font-display text-xl font-bold ${streak.type === 'win' ? 'text-status-good' : streak.type === 'loss' ? 'text-status-bad' : 'text-gold'}`}>
            {streak.count || 0}
          </div>
          <div className="mt-0.5 text-[11px] text-slate-400">
            {streak.count > 0 ? (streak.type === 'win' ? t('streakWins') : t('streakLosses')) : t('noStreak')}
          </div>
        </div>
        <div className="rounded-xl border border-gold/10 bg-navy-900/50 p-3 text-center">
          <div className="font-display text-xl font-bold text-gold">{settled.length}</div>
          <div className="mt-0.5 text-[11px] text-slate-400">{t('settledMatches')}</div>
        </div>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-200">{t('accuracyOverTime')}</h3>
          <div className="flex gap-1">
            {['daily', 'weekly', 'monthly'].map((g) => (
              <button
                key={g}
                onClick={() => setGranularity(g)}
                className={`rounded-md px-2 py-1 text-xs ${granularity === g ? 'bg-gold text-navy-950 font-semibold' : 'text-slate-400 hover:text-gold'}`}
              >
                {t(g)}
              </button>
            ))}
          </div>
        </div>
        {chartPoints.length > 0 ? (
          <AccuracyChart points={chartPoints} />
        ) : (
          <p className="text-sm text-slate-500">{t('noSettled')}</p>
        )}
      </div>

      <section>
        <h3 className="mb-2 text-sm font-semibold text-slate-200">{t('enterResult')}</h3>
        {pending.length === 0 ? (
          <p className="text-sm text-slate-500">{t('noSettled')}</p>
        ) : (
          <div className="space-y-3">
            {pending.map((m) => (
              <MatchCard key={m.id} match={m} footer={<ResultForm match={m} onSettle={onSettle} />} />
            ))}
          </div>
        )}
      </section>

      {settled.length > 0 && (
        <section>
          <h3 className="mb-2 text-sm font-semibold text-slate-200">{t('allMatches')}</h3>
          <div className="space-y-3">
            {settled.map((m) => (
              <MatchCard key={m.id} match={m} />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
