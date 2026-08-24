import { useLang } from '../lib/i18n'
import ConfidenceMeter from './ConfidenceMeter'

function pct(n) {
  return Number.isFinite(n) ? `${(n * 100).toFixed(0)}%` : '—'
}

const OUTCOME_LABEL_KEY = { 1: 'homeWin', X: 'draw', 2: 'awayWin' }

export default function AnalysisReport({ report, grounding }) {
  const { t } = useLang()
  if (!report) return null

  return (
    <div dir="rtl" className="space-y-4 border-t border-[#D4AF37]/10 pt-4">
      <div className="flex items-center justify-between gap-4">
        <div className="grid flex-1 gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-[#D4AF37]/15 bg-navy-900/60 p-3">
            <div className="text-xs text-slate-400">1X2</div>
            <div className="mt-1 font-display text-lg font-bold text-[#D4AF37]">
              {t(OUTCOME_LABEL_KEY[report.outcome?.pick] || 'homeWin')}
            </div>
          </div>
          <div className="rounded-lg border border-[#D4AF37]/15 bg-navy-900/60 p-3">
            <div className="text-xs text-slate-400">{t('overUnder')} 2.5</div>
            <div className="mt-1 font-display text-lg font-bold text-[#D4AF37]">
              {report.overUnder25?.pick === 'over' ? 'Over 2.5' : 'Under 2.5'}
            </div>
            <div className="text-xs text-slate-500">{pct(report.overUnder25?.probability)}</div>
          </div>
          <div className="rounded-lg border border-[#D4AF37]/15 bg-navy-900/60 p-3 sm:col-span-2">
            <div className="text-xs text-slate-400">{t('btts')}</div>
            <div className="mt-1 font-display text-lg font-bold text-[#D4AF37]">
              {report.btts?.pick === 'yes' ? t('yes') : t('no')}
            </div>
            <div className="text-xs text-slate-500">{pct(report.btts?.probability)}</div>
          </div>
        </div>
        <ConfidenceMeter confidence={report.outcome?.confidence ?? 0} tier={report.confidenceTier || 'red'} size={80} />
      </div>

      {report.bestBet && (
        <div className="rounded-lg border border-[#D4AF37]/30 bg-[#D4AF37]/10 p-3">
          <div className="text-xs font-semibold text-[#D4AF37]">{t('reportBestBet')}</div>
          <p className="mt-1 text-sm font-medium text-slate-100">{report.bestBet}</p>
        </div>
      )}

      {report.tacticalNote && (
        <div className="rounded-lg border border-[#D4AF37]/10 bg-navy-900/40 p-3">
          <div className="mb-1 text-xs font-semibold text-[#D4AF37]">{t('reportTactical')}</div>
          <p className="text-sm leading-relaxed text-slate-300">{report.tacticalNote}</p>
        </div>
      )}

      <p className="rounded-lg border border-slate-600/30 bg-navy-800/50 px-3 py-2 text-[11px] text-slate-500">
        <span className="font-semibold text-slate-400">{t('reportDisclaimer')}: </span>
        {t('quickDisclaimer')}
      </p>

      {grounding && (
        <details className="text-[11px] text-slate-500">
          <summary className="cursor-pointer text-[#D4AF37]">{t('dataSourcesUsed')}</summary>
          <pre className="mt-2 max-h-60 overflow-auto rounded-lg bg-navy-950/60 p-2 text-start" dir="ltr">
            {JSON.stringify(grounding, null, 2)}
          </pre>
        </details>
      )}
    </div>
  )
}
