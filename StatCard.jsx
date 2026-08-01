import { ArrowUpRight, ArrowDownRight } from 'lucide-react'

export default function StatCard({ label, value, unit, delta, trend, hint }) {
  // `trend` is a good/bad semantic flag (color); the arrow direction follows
  // the sign of `delta` itself, so a rising-but-bad metric (e.g. absenteeism
  // up) can still show an up-arrow colored red.
  const good = trend === 'up'
  const rising = typeof delta === 'string' && delta.trim().startsWith('+')
  return (
    <div className="card p-5">
      <p className="text-xs font-medium uppercase tracking-wide text-ink-faint">{label}</p>
      <div className="mt-2 flex items-baseline gap-1">
        <span className="font-display text-2xl font-semibold text-ink">{value}</span>
        {unit && <span className="text-sm text-ink-faint">{unit}</span>}
      </div>
      {delta && (
        <div className={`mt-2 inline-flex items-center gap-1 text-xs font-medium ${good ? 'text-signal-good' : 'text-signal-bad'}`}>
          {rising ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
          {delta} {hint && <span className="text-ink-faint font-normal">{hint}</span>}
        </div>
      )}
    </div>
  )
}
