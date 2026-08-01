import { Plus, Users, UserX, Clock, Gauge } from 'lucide-react'
import { PageHeader, StatusBadge } from '../components/PageHeader.jsx'
import { modules } from '../data/mockData.js'

function effColor(v) {
  if (v >= 85) return 'text-signal-good'
  if (v >= 70) return 'text-signal-warn'
  return 'text-signal-bad'
}

export default function Modules() {
  return (
    <div>
      <PageHeader
        eyebrow="Workstations"
        title="Modules"
        description="Workforce presence, hourly output vs. target, efficiency, downtime and absences — one card per module, live."
        actions={
          <button className="btn-primary">
            <Plus size={16} /> New module
          </button>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {modules.map((m) => {
          const gap = m.hourlyActual - m.hourlyTarget
          return (
            <div key={m.id} className="card p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-mono text-[11px] text-ink-faint">{m.id} · {m.line}</p>
                  <h3 className="font-display font-semibold text-ink mt-0.5 leading-snug">{m.name}</h3>
                </div>
                <StatusBadge status={m.status} />
              </div>

              <div className="mt-2 stitch-line text-line" />

              <div className="mt-4 flex items-baseline justify-between">
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-wide text-ink-faint">Hourly output</p>
                  <p className="mt-0.5">
                    <span className="font-display text-xl font-semibold text-ink">{m.hourlyActual}</span>
                    <span className="text-sm text-ink-faint"> / {m.hourlyTarget} pcs</span>
                  </p>
                </div>
                <span className={`font-display text-2xl font-semibold ${effColor(m.efficiency)}`}>{m.efficiency}%</span>
              </div>

              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-line">
                <div
                  className={`h-full rounded-full ${gap >= 0 ? 'bg-signal-good' : 'bg-signal-bad'}`}
                  style={{ width: `${Math.min((m.hourlyActual / m.hourlyTarget) * 100, 100)}%` }}
                />
              </div>
              <p className="mt-1 text-[11px] text-ink-faint">
                {gap >= 0 ? `+${gap} pcs ahead of target` : `${gap} pcs behind target`}
              </p>

              <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                <div className="rounded-lg bg-paper px-2 py-2.5">
                  <Users size={14} className="mx-auto text-ink-faint" />
                  <p className="mt-1 text-sm font-semibold text-ink">{m.workforcePresent}/{m.workforceTotal}</p>
                  <p className="text-[10px] text-ink-faint">present</p>
                </div>
                <div className="rounded-lg bg-paper px-2 py-2.5">
                  <UserX size={14} className={`mx-auto ${m.absent > 0 ? 'text-signal-bad' : 'text-ink-faint'}`} />
                  <p className={`mt-1 text-sm font-semibold ${m.absent > 0 ? 'text-signal-bad' : 'text-ink'}`}>{m.absent}</p>
                  <p className="text-[10px] text-ink-faint">absent</p>
                </div>
                <div className="rounded-lg bg-paper px-2 py-2.5">
                  <Clock size={14} className={`mx-auto ${m.downtimeMin > 0 ? 'text-signal-warn' : 'text-ink-faint'}`} />
                  <p className={`mt-1 text-sm font-semibold ${m.downtimeMin > 0 ? 'text-signal-warn' : 'text-ink'}`}>{m.downtimeMin}m</p>
                  <p className="text-[10px] text-ink-faint">downtime</p>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <div className="mt-4 card p-5">
        <div className="flex items-center gap-2 mb-4">
          <Gauge size={16} className="text-indigo-600" />
          <h3 className="font-display font-semibold text-ink text-sm">All modules — hourly detail</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="table-shell">
            <thead>
              <tr>
                <th>Module</th>
                <th>Line</th>
                <th>Workforce</th>
                <th>Absent</th>
                <th>Target/h</th>
                <th>Actual/h</th>
                <th>Downtime</th>
                <th>Efficiency</th>
              </tr>
            </thead>
            <tbody>
              {modules.map((m) => (
                <tr key={m.id}>
                  <td className="font-medium text-ink">{m.name}</td>
                  <td className="text-ink-soft">{m.line}</td>
                  <td className="text-ink-soft">{m.workforcePresent}/{m.workforceTotal}</td>
                  <td className={m.absent > 0 ? 'text-signal-bad' : 'text-ink-soft'}>{m.absent}</td>
                  <td className="text-ink-soft">{m.hourlyTarget}</td>
                  <td className="text-ink-soft">{m.hourlyActual}</td>
                  <td className={m.downtimeMin > 0 ? 'text-signal-warn' : 'text-ink-soft'}>{m.downtimeMin} min</td>
                  <td>
                    <span className={`font-mono text-xs font-semibold ${effColor(m.efficiency)}`}>{m.efficiency}%</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
