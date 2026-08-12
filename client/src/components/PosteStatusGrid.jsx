import { DEPARTMENT_META } from '../lib/constants'

const STATUS_STYLE = {
  good: { dot: 'bg-status-good', text: 'text-status-good', ring: 'border-status-good/40' },
  warn: { dot: 'bg-status-warn', text: 'text-status-warn', ring: 'border-status-warn/40' },
  bad: { dot: 'bg-status-bad', text: 'text-status-bad', ring: 'border-status-bad/40' },
}

export default function PosteStatusGrid({ postes }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {postes.map((p) => {
        const style = STATUS_STYLE[p.status]
        const meta = DEPARTMENT_META[p.deptKey]
        return (
          <div key={p.deptKey} className={`rounded-md border ${style.ring} bg-navy-900/50 p-3`}>
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-300">
                {meta?.icon} {meta?.label}
              </span>
              <span className={`h-2.5 w-2.5 rounded-full ${style.dot} animate-pulse-soft`} />
            </div>
            <div className={`mt-1 font-display text-xl font-semibold ${style.text}`}>{Math.round(p.percentage)}%</div>
            {p.note && <div className="mt-1 truncate text-xs text-slate-500">{p.note}</div>}
          </div>
        )
      })}
    </div>
  )
}
