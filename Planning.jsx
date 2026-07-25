import { Plus } from 'lucide-react'
import { PageHeader, StatusBadge } from '../components/PageHeader.jsx'
import { planningRows } from '../data/mockData.js'

function daysBetween(a, b) {
  return Math.round((new Date(b) - new Date(a)) / 86400000)
}

export default function Planning() {
  const today = new Date('2026-07-20')

  return (
    <div>
      <PageHeader
        eyebrow="Scheduling"
        title="Planning"
        description="Purchase orders scheduled across lines, from cutting to packing."
        actions={
          <button className="btn-primary">
            <Plus size={16} /> Schedule order
          </button>
        }
      />

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="table-shell">
            <thead>
              <tr>
                <th>PO</th>
                <th>Product</th>
                <th>Line</th>
                <th>Qty</th>
                <th>Window</th>
                <th>Progress</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {planningRows.map((r) => {
                const total = daysBetween(r.start, r.end) || 1
                const elapsed = Math.min(Math.max(daysBetween(r.start, today), 0), total)
                const pct = Math.round((elapsed / total) * 100)
                return (
                  <tr key={r.po}>
                    <td className="font-mono text-xs text-indigo-700">{r.po}</td>
                    <td className="font-medium text-ink">{r.product}</td>
                    <td className="text-ink-soft">{r.line}</td>
                    <td className="text-ink-soft">{r.qty.toLocaleString()}</td>
                    <td className="text-ink-soft text-xs whitespace-nowrap">{r.start} → {r.end}</td>
                    <td className="w-40">
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-line">
                        <div className="h-full rounded-full bg-indigo-600" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-[11px] text-ink-faint">{pct}%</span>
                    </td>
                    <td>
                      <StatusBadge status={r.status} />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
