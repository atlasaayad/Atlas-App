import GlowCard from './GlowCard'

// Planning — Plan vs Réel, three levels at once (Agent Méthode's own spec):
// a cumulative curve (the whole model, Début → expected finish), today's
// hourly bars, and a per-day table with the exact gap in pieces AND %. No
// monetary figure anywhere here, by design — only pieces and percentages.
// Entirely omitted by the caller when `planning.hasPlan` is false, so a
// model nobody ever planned looks exactly like it did before this feature.
export default function PlanReelCard({ planning }) {
  if (!planning?.hasPlan) return null

  const lastDaily = planning.daily[planning.daily.length - 1]
  const cumulativeDiff = (lastDaily?.realCumulative || 0) - (lastDaily?.planCumulative || 0)
  const cumulativeDiffPct =
    lastDaily?.planCumulative > 0 ? Math.round((cumulativeDiff / lastDaily.planCumulative) * 1000) / 10 : null

  return (
    <GlowCard title="Planning — Plan vs Réel">
      <div className="mb-3 flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
        <Legend swatch="bg-target" label="Plan" />
        <Legend swatch="bg-turquoise" label="Réel" />
        {planning.expectedFinishDate && (
          <span className="text-xs text-slate-500">تاريخ الانتهاء المتوقع (Plan): {planning.expectedFinishDate}</span>
        )}
        {lastDaily && (
          <span className="text-xs text-slate-500">
            تراكمي: <span className="font-mono text-slate-300">{lastDaily.realCumulative}</span> /{' '}
            <span className="font-mono text-slate-300">{lastDaily.planCumulative}</span> —{' '}
            <DiffBadge diffQty={cumulativeDiff} diffPct={cumulativeDiffPct} />
          </span>
        )}
      </div>

      <CumulativeLineChart daily={planning.daily} />

      <div className="mt-4 border-t border-slate-800 pt-3">
        <div className="mb-2 text-xs uppercase tracking-wide text-slate-500">Aujourd'hui — بالساعة</div>
        <HourlyDualBars hourly={planning.todayHourly} />
      </div>

      <div className="mt-4 border-t border-slate-800 pt-3">
        <div className="mb-2 text-xs uppercase tracking-wide text-slate-500">يومياً</div>
        <DailyTable daily={planning.daily} />
      </div>
    </GlowCard>
  )
}

function Legend({ swatch, label }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-slate-400">
      <span className={`h-2 w-4 rounded-sm ${swatch}`} />
      {label}
    </span>
  )
}

function DiffBadge({ diffQty, diffPct }) {
  const behind = diffQty < 0
  const color = diffQty === 0 ? 'text-slate-400' : behind ? 'text-status-bad' : 'text-status-good'
  const sign = diffQty > 0 ? '+' : ''
  return (
    <span className={`font-mono ${color}`}>
      {sign}
      {diffQty} {diffPct !== null && `(${sign}${diffPct}%)`}
    </span>
  )
}

const CHART_WIDTH = 600
const CHART_HEIGHT = 150
const PAD = 8

// A plain two-line SVG curve, no library — matches HourlyBarChart's own
// hand-rolled approach elsewhere in this app. X = day index (evenly
// spaced), Y = cumulative qty scaled to whichever line reaches higher.
function CumulativeLineChart({ daily }) {
  if (daily.length === 0) return null
  const maxVal = Math.max(1, ...daily.map((d) => Math.max(d.planCumulative, d.realCumulative)))
  const innerW = CHART_WIDTH - PAD * 2
  const innerH = CHART_HEIGHT - PAD * 2
  const x = (i) => PAD + (daily.length > 1 ? (i / (daily.length - 1)) * innerW : innerW / 2)
  const y = (v) => PAD + innerH - (v / maxVal) * innerH

  const planPath = daily.map((d, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(d.planCumulative).toFixed(1)}`).join(' ')
  const realPath = daily.map((d, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(d.realCumulative).toFixed(1)}`).join(' ')

  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`} className="h-[150px] w-full min-w-[420px]" preserveAspectRatio="none">
        <path d={planPath} fill="none" stroke="#A78BFA" strokeWidth="2" strokeDasharray="5 4" />
        <path d={realPath} fill="none" stroke="#2BF0D9" strokeWidth="2.5" />
        {daily.map((d, i) => (
          <circle key={`r-${d.date}`} cx={x(i)} cy={y(d.realCumulative)} r="2.5" fill="#2BF0D9" />
        ))}
      </svg>
      <div className="flex justify-between px-1 font-mono text-[10px] text-slate-500">
        <span>{daily[0].date}</span>
        <span>{daily[daily.length - 1].date}</span>
      </div>
    </div>
  )
}

// Today's hourly Plan vs Réel — a plan bar (violet, dashed outline) next to
// a real bar (solid turquoise) per hour, scaled to whichever is bigger
// across the day. An hour with neither planned nor produced anything is
// still shown (both bars empty) — same 9-slot grid as everywhere else.
function HourlyDualBars({ hourly }) {
  const maxVal = Math.max(1, ...hourly.map((s) => Math.max(s.planQty, s.realQty)))
  return (
    <div className="scroll-fade-right overflow-x-auto pb-1">
      <div className="flex items-end gap-3 pl-1" style={{ minWidth: 'max-content', height: 90 }}>
        {hourly.map((s) => (
          <div key={s.index} className="flex w-14 flex-shrink-0 flex-col items-center gap-1">
            <div className="flex h-16 items-end gap-1">
              <div
                className="w-4 rounded-t-sm border border-dashed border-target/70 bg-target/10"
                style={{ height: Math.max((s.planQty / maxVal) * 64, s.planQty > 0 ? 3 : 0) }}
                title={`Plan: ${s.planQty}`}
              />
              <div
                className="w-4 rounded-t-sm bg-turquoise/80"
                style={{ height: Math.max((s.realQty / maxVal) * 64, s.realQty > 0 ? 3 : 0) }}
                title={`Réel: ${s.realQty}`}
              />
            </div>
            <span className="font-mono text-[9px] leading-tight text-slate-500">{s.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// Exact per-day figures — the chart above is for the shape of the trend,
// this is for the precise number when someone needs it. Scrollable rather
// than paginated: a model's whole span is rarely more than a few weeks.
function DailyTable({ daily }) {
  return (
    <div className="max-h-56 overflow-y-auto rounded-md border border-slate-800">
      <table className="w-full text-xs">
        <thead className="sticky top-0 bg-navy-900">
          <tr className="text-slate-500">
            <th className="px-2.5 py-1.5 text-right font-normal">التاريخ</th>
            <th className="px-2.5 py-1.5 text-right font-normal">Plan</th>
            <th className="px-2.5 py-1.5 text-right font-normal">Réel</th>
            <th className="px-2.5 py-1.5 text-right font-normal">الفرق</th>
          </tr>
        </thead>
        <tbody>
          {daily.map((d) => {
            const diffQty = d.realQty - d.planQty
            const diffPct = d.planQty > 0 ? Math.round((diffQty / d.planQty) * 1000) / 10 : null
            return (
              <tr key={d.date} className="border-t border-slate-800/60">
                <td className="px-2.5 py-1.5 font-mono text-slate-400">{d.date}</td>
                <td className="px-2.5 py-1.5 text-right font-mono text-target">{d.planQty}</td>
                <td className="px-2.5 py-1.5 text-right font-mono text-turquoise">{d.realQty}</td>
                <td className="px-2.5 py-1.5 text-right">
                  <DiffBadge diffQty={diffQty} diffPct={diffPct} />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
