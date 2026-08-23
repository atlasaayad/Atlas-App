import { useLang } from '../lib/i18n'
import ConfidenceMeter from './ConfidenceMeter'

function Bar({ label, value, color }) {
  return (
    <div>
      <div className="mb-1 flex justify-between text-xs text-slate-400">
        <span>{label}</span>
        <span className="font-mono text-slate-200">{(value * 100).toFixed(1)}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-navy-800">
        <div className="h-full rounded-full" style={{ width: `${value * 100}%`, background: color }} />
      </div>
    </div>
  )
}

const OUTCOME_LABEL_KEY = { 1: 'homeWin', X: 'draw', 2: 'awayWin', '1X': null, X2: null, 12: null }

export default function PredictionDetail({ match }) {
  const { t } = useLang()
  const p = match.prediction
  if (!p) return null

  const outcomeLabel =
    p.outcome.kind === 'direct'
      ? t(OUTCOME_LABEL_KEY[p.outcome.pick])
      : p.outcome.pick === '1X'
        ? `${t('homeWin')} / ${t('draw')} (1X)`
        : p.outcome.pick === 'X2'
          ? `${t('draw')} / ${t('awayWin')} (X2)`
          : `${t('homeWin')} / ${t('awayWin')} (12)`

  const alt = p.alternativeScenario
  const altLabel = alt.key === 'home' ? t('homeWin') : alt.key === 'draw' ? t('draw') : t('awayWin')

  const ruleKeys = [...new Set([...p.confidenceNotes, ...p.appliedRules.map((r) => r.key)])]

  return (
    <div className="space-y-4 border-t border-gold/10 pt-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="grid flex-1 min-w-[220px] gap-2">
          <Bar label={`${match.homeTeam} (1)`} value={p.pHome} color="#D4AF37" />
          <Bar label={`${t('draw')} (X)`} value={p.pDraw} color="#94A3B8" />
          <Bar label={`${match.awayTeam} (2)`} value={p.pAway} color="#5B8DEF" />
        </div>
        <ConfidenceMeter confidence={p.confidence} tier={p.tier} />
      </div>

      {p.trapGame && (
        <div className="rounded-lg border border-amber/40 bg-amber-soft px-3 py-2 text-xs text-amber">
          {t('trapGameWarning')}
        </div>
      )}
      {p.penaltyWarning && (
        <div className="rounded-lg border border-amber/40 bg-amber-soft px-3 py-2 text-xs text-amber">
          {t('penaltyWarning')}
        </div>
      )}
      {p.supportingFactors.length < 3 && (
        <div className="rounded-lg border border-slate-600/40 bg-navy-800/60 px-3 py-2 text-xs text-slate-400">
          {t('noFactorsNote')}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-gold/15 bg-navy-900/60 p-3">
          <div className="text-xs text-slate-400">{t('recommendedMarket')}</div>
          <div className="mt-1 font-display text-lg font-bold text-gold">{outcomeLabel}</div>
          <div className="text-xs text-slate-500">
            {p.outcome.kind === 'double-chance' ? t('saferPick') : t('directPick')} — {(p.outcome.probability * 100).toFixed(1)}%
          </div>
        </div>

        <div className="rounded-lg border border-gold/15 bg-navy-900/60 p-3">
          <div className="text-xs text-slate-400">{t('overUnder')}</div>
          <div className="mt-1 font-display text-lg font-bold text-gold">
            {p.overUnder.pick === 'over2.5' ? 'Over 2.5' : 'Under 2.5'}
          </div>
          <div className="text-xs text-slate-500">{(p.overUnder.probability * 100).toFixed(1)}%</div>
          <div className="mt-1 flex gap-3 text-[11px] text-slate-500">
            <span>O1.5 {(p.overUnder.over15 * 100).toFixed(0)}%</span>
            <span>O2.5 {(p.overUnder.over25 * 100).toFixed(0)}%</span>
            <span>O3.5 {(p.overUnder.over35 * 100).toFixed(0)}%</span>
          </div>
        </div>

        <div className="rounded-lg border border-gold/15 bg-navy-900/60 p-3">
          <div className="text-xs text-slate-400">{t('btts')}</div>
          <div className="mt-1 font-display text-lg font-bold text-gold">
            {p.btts.pick === 'yes' ? t('yes') : p.btts.pick === 'no' ? t('no') : t('avoid')}
          </div>
          <div className="text-xs text-slate-500">{(p.btts.probability * 100).toFixed(1)}%</div>
        </div>

        <div className="rounded-lg border border-gold/15 bg-navy-900/60 p-3">
          <div className="text-xs text-slate-400">{t('cleanSheet')}</div>
          <div className="mt-1 flex justify-between font-display text-sm font-bold text-gold">
            <span>{match.homeTeam}: {(p.cleanSheet.home * 100).toFixed(0)}%</span>
            <span>{match.awayTeam}: {(p.cleanSheet.away * 100).toFixed(0)}%</span>
          </div>
        </div>

        <div className="rounded-lg border border-gold/15 bg-navy-900/60 p-3 sm:col-span-2">
          <div className="text-xs text-slate-400">{t('asianHandicap')}</div>
          <div className="mt-1 font-display text-lg font-bold text-gold">
            {p.asianHandicap.side === 'even'
              ? `${t('draw')} (0)`
              : `${p.asianHandicap.side === 'home' ? match.homeTeam : match.awayTeam} -${p.asianHandicap.line}`}
          </div>
          <div className="text-xs text-slate-500">{(p.asianHandicap.probability * 100).toFixed(1)}%</div>
        </div>
      </div>

      <div className="rounded-lg border border-gold/10 bg-navy-900/40 p-3 text-sm">
        <span className="text-slate-400">{t('alternativeScenario')}: </span>
        <span className="font-semibold text-slate-200">{altLabel} — {(alt.probability * 100).toFixed(1)}%</span>
      </div>

      {p.supportingFactors.length > 0 && (
        <div>
          <div className="mb-1 text-xs text-slate-400">{t('supportingFactors')}</div>
          <div className="flex flex-wrap gap-1.5">
            {p.supportingFactors.map((f, i) => (
              <span key={i} className="rounded-full border border-status-good/30 bg-status-good/10 px-2 py-0.5 text-[11px] text-status-good">
                {t(`factor_${f.key}`)}
              </span>
            ))}
          </div>
        </div>
      )}

      {ruleKeys.length > 0 && (
        <div>
          <div className="mb-1 text-xs text-slate-400">{t('appliedRules')}</div>
          <ul className="space-y-1 text-[11px] text-slate-400">
            {ruleKeys.map((k) => (
              <li key={k} className="flex gap-1.5">
                <span className="text-gold">•</span> {t(`rule_${k}`)}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
