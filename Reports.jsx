import { Download, Play, Plus, FileBarChart2 } from 'lucide-react'
import { PageHeader } from '../components/PageHeader.jsx'
import { reportPresets } from '../data/mockData.js'

export default function Reports() {
  return (
    <div>
      <PageHeader
        eyebrow="Analytics"
        title="Reports"
        description="Scheduled reports and one-off exports across production, planning and quality."
        actions={
          <button className="btn-primary">
            <Plus size={16} /> New report
          </button>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {reportPresets.map((r) => (
          <div key={r.name} className="card p-5 flex items-start gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
              <FileBarChart2 size={18} />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="font-medium text-ink">{r.name}</h3>
              <p className="text-xs text-ink-faint mt-0.5">{r.cadence} · last run {r.lastRun}</p>
              <div className="mt-3 flex items-center gap-2">
                <button className="btn-secondary !px-3 !py-1.5 text-xs">
                  <Play size={13} /> Run now
                </button>
                <button className="btn-secondary !px-3 !py-1.5 text-xs">
                  <Download size={13} /> Export
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
