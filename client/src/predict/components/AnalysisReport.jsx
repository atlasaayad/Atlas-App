import { useLang } from '../lib/i18n'
import ConfidenceMeter from './ConfidenceMeter'

function pct(n) {
  return Number.isFinite(n) ? `${(n * 100).toFixed(0)}%` : '—'
}

function Section({ title, children, warn }) {
  if (!children) return null
  return (
    <div className="rounded-lg border border-[#D4AF37]/10 bg-navy-900/40 p-3">
      <div className="mb-1 text-xs font-semibold text-[#D4AF37]">{title}</div>
      <p className="text-sm leading-relaxed text-slate-300">{children}</p>
      {warn && <p className="mt-1.5 text-[11px] text-amber">{warn}</p>}
    </div>
  )
}

export default function AnalysisReport({ report, grounding }) {
  const { t } = useLang()
  if (!report) return null
  const m = report.markets || {}

  return (
    <div dir="rtl" className="space-y-4 border-t border-[#D4AF37]/10 pt-4">
      <div className="flex items-center justify-between gap-4">
        <div className="text-sm text-slate-400">{report.matchContext}</div>
        {m.outcome1x2 && (
          <ConfidenceMeter confidence={m.outcome1x2.confidence ?? 0} tier={report.confidenceTier || 'red'} size={80} />
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Section title={t('reportHomeForm')}>{report.homeFormSummary}</Section>
        <Section title={t('reportAwayForm')}>{report.awayFormSummary}</Section>
        <Section title={t('reportH2H')}>{report.headToHead}</Section>
        <Section title={t('reportVenue')}>{report.venueConditions}</Section>
        <Section title={t('reportLineups')} warn={t('generalAnalysisNote')}>
          {report.expectedLineupsKeyPlayers}
        </Section>
        <Section title={t('reportInjuries')} warn={t('generalAnalysisNote')}>
          {report.injuriesSuspensions}
        </Section>
        <Section title={t('reportTactical')}>{report.tacticalAnalysis}</Section>
        <Section title={t('reportScorers')}>{report.likelyScorers}</Section>
      </div>

      <div>
        <div className="mb-2 text-xs font-semibold text-[#D4AF37]">{t('reportMarkets')}</div>
        <div className="grid gap-3 sm:grid-cols-2">
          {m.outcome1x2 && (
            <div className="rounded-lg border border-[#D4AF37]/15 bg-navy-900/60 p-3">
              <div className="text-xs text-slate-400">1X2</div>
              <div className="mt-1 flex justify-between text-sm font-bold text-slate-100">
                <span dir="ltr">1: {pct(m.outcome1x2.home)}</span>
                <span dir="ltr">X: {pct(m.outcome1x2.draw)}</span>
                <span dir="ltr">2: {pct(m.outcome1x2.away)}</span>
              </div>
              <div dir="ltr" className="mt-1 text-xs text-[#D4AF37]">{t('recommendedMarket')}: {m.outcome1x2.pick}</div>
            </div>
          )}
          {m.doubleChance && (
            <div className="rounded-lg border border-[#D4AF37]/15 bg-navy-900/60 p-3">
              <div className="text-xs text-slate-400">Double Chance</div>
              <div className="mt-1 font-display text-lg font-bold text-[#D4AF37]">{m.doubleChance.pick}</div>
              <div className="text-xs text-slate-500">{pct(m.doubleChance.probability)}</div>
            </div>
          )}
          {m.overUnder && (
            <div className="rounded-lg border border-[#D4AF37]/15 bg-navy-900/60 p-3">
              <div className="text-xs text-slate-400">{t('overUnder')}</div>
              <div className="mt-1 font-display text-lg font-bold text-[#D4AF37]">{m.overUnder.pick}</div>
              <div dir="ltr" className="mt-1 flex gap-3 text-[11px] text-slate-500">
                <span>1.5: {pct(m.overUnder.line1_5?.over)}</span>
                <span>2.5: {pct(m.overUnder.line2_5?.over)}</span>
                <span>3.5: {pct(m.overUnder.line3_5?.over)}</span>
              </div>
            </div>
          )}
          {m.btts && (
            <div className="rounded-lg border border-[#D4AF37]/15 bg-navy-900/60 p-3">
              <div className="text-xs text-slate-400">{t('btts')}</div>
              <div className="mt-1 font-display text-lg font-bold text-[#D4AF37]">
                {m.btts.pick === 'yes' ? t('yes') : m.btts.pick === 'no' ? t('no') : t('avoid')}
              </div>
              <div className="text-xs text-slate-500">{pct(m.btts.yes)}</div>
            </div>
          )}
          {m.cleanSheet && (
            <div className="rounded-lg border border-[#D4AF37]/15 bg-navy-900/60 p-3 sm:col-span-2">
              <div className="text-xs text-slate-400">{t('cleanSheet')}</div>
              <div className="mt-1 flex justify-between font-display text-sm font-bold text-[#D4AF37]">
                <span>{pct(m.cleanSheet.home)}</span>
                <span>{pct(m.cleanSheet.away)}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {m.bestBet && (
        <div className="rounded-lg border border-[#D4AF37]/30 bg-[#D4AF37]/10 p-3">
          <div className="text-xs font-semibold text-[#D4AF37]">{t('reportBestBet')}</div>
          <div className="mt-1 font-display text-base font-bold text-slate-100">{m.bestBet.market}</div>
          <p className="mt-1 text-sm text-slate-300">{m.bestBet.reasoning}</p>
          <div className="mt-1 text-xs text-slate-400">{t('confidence')}: {m.bestBet.confidence}%</div>
        </div>
      )}

      {m.smartCombo && (
        <div className="rounded-lg border border-[#D4AF37]/15 bg-navy-900/40 p-3">
          <div className="text-xs font-semibold text-[#D4AF37]">{t('reportSmartCombo')}</div>
          <ul className="mt-1 list-inside list-disc text-sm text-slate-300">
            {(m.smartCombo.legs || []).map((leg, i) => (
              <li key={i}>{leg}</li>
            ))}
          </ul>
          <div className="mt-1 text-xs text-slate-400">
            {t('comboProbability')}: {pct(m.smartCombo.combinedProbability)}
          </div>
          {m.smartCombo.note && <p className="mt-1 text-xs text-slate-500">{m.smartCombo.note}</p>}
        </div>
      )}

      {Array.isArray(report.methodologyNotes) && report.methodologyNotes.length > 0 && (
        <div>
          <div className="mb-1 text-xs font-semibold text-[#D4AF37]">{t('reportMethodology')}</div>
          <ul className="space-y-1 text-[11px] text-slate-400">
            {report.methodologyNotes.map((note, i) => (
              <li key={i} className="flex gap-1.5">
                <span className="text-[#D4AF37]">•</span> {note}
              </li>
            ))}
          </ul>
        </div>
      )}

      {report.disclaimer && (
        <p className="rounded-lg border border-slate-600/30 bg-navy-800/50 px-3 py-2 text-[11px] text-slate-500">
          <span className="font-semibold text-slate-400">{t('reportDisclaimer')}: </span>
          {report.disclaimer}
        </p>
      )}

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
