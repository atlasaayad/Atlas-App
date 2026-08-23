import { useState } from 'react'
import { useLang } from '../lib/i18n'
import PredictionDetail from './PredictionDetail'

const TIER_RING = {
  green: 'ring-status-good/40 border-status-good/30',
  yellow: 'ring-amber/40 border-amber/30',
  red: 'ring-status-bad/40 border-status-bad/30',
}

export default function MatchCard({
  match,
  onEdit,
  onDelete,
  selectable,
  selected,
  onSelectToggle,
  footer,
  defaultExpanded = false,
}) {
  const { t } = useLang()
  const [expanded, setExpanded] = useState(defaultExpanded)
  const p = match.prediction

  return (
    <div className={`rounded-xl border bg-navy-900/60 p-4 shadow-sm transition ${p ? TIER_RING[p.tier] : 'border-[#D4AF37]/10'}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          {selectable && (
            <input
              type="checkbox"
              className="mt-1.5 h-4 w-4"
              checked={selected}
              onChange={() => onSelectToggle(match.id)}
            />
          )}
          <div>
            <div className="font-display text-base font-semibold text-slate-100">
              {match.homeTeam} <span className="text-slate-500">vs</span> {match.awayTeam}
            </div>
            <div className="text-xs text-slate-500">
              {match.league} · {match.date} {match.time}
            </div>
          </div>
        </div>
        {p && (
          <div className="flex flex-col items-end">
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                p.tier === 'green'
                  ? 'bg-status-good/15 text-status-good'
                  : p.tier === 'yellow'
                    ? 'bg-amber/15 text-amber'
                    : 'bg-status-bad/15 text-status-bad'
              }`}
            >
              {p.confidence}%
            </span>
            {match.evaluation && (
              <span className={`mt-1 text-[11px] font-semibold ${match.evaluation.hit ? 'text-status-good' : 'text-status-bad'}`}>
                {match.evaluation.hit ? `✓ ${t('hit')}` : `✗ ${t('miss')}`}
              </span>
            )}
          </div>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          onClick={() => setExpanded((v) => !v)}
          className="rounded-md border border-[#D4AF37]/20 px-2.5 py-1 text-xs text-[#D4AF37] hover:bg-[#D4AF37]/10"
        >
          {expanded ? t('hideDetails') : t('viewDetails')}
        </button>
        {onEdit && (
          <button onClick={() => onEdit(match)} className="rounded-md border border-slate-600/40 px-2.5 py-1 text-xs text-slate-300 hover:border-slate-400">
            {t('edit')}
          </button>
        )}
        {onDelete && (
          <button
            onClick={() => {
              if (confirm(t('confirmDelete'))) onDelete(match.id)
            }}
            className="rounded-md border border-status-bad/30 px-2.5 py-1 text-xs text-status-bad hover:bg-status-bad/10"
          >
            {t('delete')}
          </button>
        )}
      </div>

      {expanded && <PredictionDetail match={match} />}
      {footer}
    </div>
  )
}
