import { useLang } from '../lib/i18n'
import AnalysisReport from './AnalysisReport'

function formatDateTime(utcDate) {
  if (!utcDate) return ''
  const d = new Date(utcDate)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

const PHASE_KEY = { gathering: 'analyzingGathering', analyzing: 'analyzingNarrative', picks: 'analyzingMarkets' }

function Spinner() {
  return (
    <span
      className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-[#D4AF37]/25 border-t-[#D4AF37]"
      aria-hidden="true"
    />
  )
}

export default function LiveMatchCard({ match, state, onAnalyze }) {
  const { t } = useLang()
  const { analyzing, phase, report, grounding, error, expanded } = state || {}

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
          className="flex shrink-0 items-center gap-2 rounded-lg bg-[#D4AF37] px-3 py-1.5 text-sm font-semibold text-navy-950 transition hover:bg-[#F5D061] disabled:opacity-70"
        >
          {analyzing && <Spinner />}
          {analyzing ? t('analyzing') : t('analyzeButton')}
        </button>
      </div>

      {analyzing && (
        <div dir="rtl" className="mt-3 flex items-center gap-2 rounded-lg border border-[#D4AF37]/10 bg-navy-900/40 px-3 py-2 text-xs text-slate-400">
          <Spinner />
          <span>{t(PHASE_KEY[phase] || 'analyzingNarrative')}</span>
        </div>
      )}

      {error && <p className="mt-2 text-xs text-status-bad">{error}</p>}

      {expanded && report && <AnalysisReport report={report} grounding={grounding} />}
    </div>
  )
}
