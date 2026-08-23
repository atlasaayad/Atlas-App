import { useLang } from '../lib/i18n'
import AnalysisReport from './AnalysisReport'

function formatDateTime(utcDate) {
  if (!utcDate) return ''
  const d = new Date(utcDate)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

export default function LiveMatchCard({ match, state, onAnalyze }) {
  const { t } = useLang()
  const { analyzing, report, grounding, error, expanded } = state || {}

  return (
    <div className="rounded-xl border border-[#D4AF37]/10 bg-navy-900/60 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="font-display text-base font-semibold text-slate-100">
            {match.homeTeam.name} <span className="text-slate-500">vs</span> {match.awayTeam.name}
          </div>
          <div className="text-xs text-slate-500">
            {match.competition?.name} · {formatDateTime(match.utcDate)}
          </div>
        </div>
        <button
          onClick={() => onAnalyze(match)}
          disabled={analyzing}
          className="shrink-0 rounded-lg bg-[#D4AF37] px-3 py-1.5 text-sm font-semibold text-navy-950 transition hover:bg-[#F5D061] disabled:opacity-50"
        >
          {analyzing ? t('analyzing') : t('analyzeButton')}
        </button>
      </div>

      {error && <p className="mt-2 text-xs text-status-bad">{error}</p>}

      {expanded && report && <AnalysisReport report={report} grounding={grounding} />}
    </div>
  )
}
