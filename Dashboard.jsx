import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  BarChart,
  Bar,
  Cell,
} from 'recharts'
import { useOutletContext } from 'react-router-dom'
import { PageHeader, StatusBadge } from '../components/PageHeader.jsx'
import StatCard from '../components/StatCard.jsx'
import {
  controlKpis,
  alerts,
  delayedModules,
  exportsToday,
  productionTrend,
  moduleEfficiency,
} from '../data/mockData.js'
import { AlertTriangle, AlertOctagon, Info, Clock, Truck } from 'lucide-react'

const alertStyle = {
  critical: { icon: AlertOctagon, dot: 'bg-signal-bad', text: 'text-signal-bad' },
  warning: { icon: AlertTriangle, dot: 'bg-signal-warn', text: 'text-signal-warn' },
  info: { icon: Info, dot: 'bg-signal-info', text: 'text-signal-info' },
}

function barColor(v) {
  if (v >= 85) return '#2F9E64'
  if (v >= 70) return '#D4901F'
  return '#C6493F'
}

export default function Dashboard() {
  const { openAI } = useOutletContext()
  return (
    <div>
      <PageHeader
        eyebrow="Live · 14:32"
        title="Floor status, right now"
        description="Five modules, three lines, three exports before end of shift — everything that needs a decision today."
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {controlKpis.map((k) => (
          <StatCard key={k.label} {...k} />
        ))}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 xl:grid-cols-3">
        {/* Alerts */}
        <div className="card p-5 xl:col-span-1">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-display font-semibold text-ink">Alerts</h3>
            <span className="badge badge-bad">{alerts.filter((a) => a.level === 'critical').length} critical</span>
          </div>
          <ul className="space-y-3">
            {alerts.map((a) => {
              const s = alertStyle[a.level]
              const Icon = s.icon
              return (
                <li key={a.id} className="flex gap-3">
                  <Icon size={16} className={`mt-0.5 shrink-0 ${s.text}`} />
                  <div className="min-w-0">
                    <p className="text-sm text-ink leading-snug">{a.text}</p>
                    <p className="text-[11px] text-ink-faint mt-0.5">{a.time}</p>
                  </div>
                </li>
              )
            })}
          </ul>
        </div>

        {/* Delayed modules */}
        <div className="card p-5 xl:col-span-1">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-display font-semibold text-ink">Delayed modules</h3>
            <Clock size={16} className="text-ink-faint" />
          </div>
          <ul className="space-y-4">
            {delayedModules.map((d) => (
              <li key={d.module} className="border-b border-line/70 pb-3 last:border-0 last:pb-0">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-medium text-ink leading-snug">{d.module}</p>
                  <span className="badge badge-bad shrink-0">-{d.delay}</span>
                </div>
                <p className="text-xs text-ink-faint mt-0.5">{d.order} · {d.line}</p>
                <p className="text-xs text-ink-soft mt-1">{d.reason}</p>
              </li>
            ))}
          </ul>
          <button
            onClick={openAI}
            className="mt-4 text-xs font-medium text-indigo-700 hover:underline"
          >
            Ask AI for a rebalancing plan →
          </button>
        </div>

        {/* Exports due today */}
        <div className="card p-5 xl:col-span-1">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-display font-semibold text-ink">Exports due today</h3>
            <Truck size={16} className="text-ink-faint" />
          </div>
          <ul className="space-y-4">
            {exportsToday.map((e) => (
              <li key={e.po} className="border-b border-line/70 pb-3 last:border-0 last:pb-0">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-medium text-ink">{e.client}</p>
                  <StatusBadge status={e.status} />
                </div>
                <p className="text-xs text-ink-faint mt-0.5">{e.product} · {e.qty.toLocaleString()} pcs</p>
                <p className="text-xs text-ink-soft mt-1">{e.destination} · leaves {e.time}</p>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="card p-5 xl:col-span-2">
          <div className="mb-4">
            <h3 className="font-display font-semibold text-ink">Planned vs. actual output</h3>
            <p className="text-xs text-ink-faint">Units produced, current week</p>
          </div>
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={productionTrend}>
              <defs>
                <linearGradient id="actualFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#2B4C7E" stopOpacity={0.25} />
                  <stop offset="100%" stopColor="#2B4C7E" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#E4E3DD" vertical={false} />
              <XAxis dataKey="day" tick={{ fontSize: 12, fill: '#8A90A0' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 12, fill: '#8A90A0' }} axisLine={false} tickLine={false} width={40} />
              <Tooltip
                contentStyle={{ borderRadius: 10, borderColor: '#E4E3DD', fontSize: 13 }}
                labelStyle={{ fontWeight: 600 }}
              />
              <Area type="monotone" dataKey="planned" stroke="#8A90A0" strokeDasharray="4 3" fill="none" strokeWidth={1.5} />
              <Area type="monotone" dataKey="actual" stroke="#2B4C7E" strokeWidth={2.5} fill="url(#actualFill)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="card p-5">
          <div className="mb-4">
            <h3 className="font-display font-semibold text-ink">Efficiency by module</h3>
            <p className="text-xs text-ink-faint">This shift</p>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={moduleEfficiency} barSize={28}>
              <CartesianGrid stroke="#E4E3DD" vertical={false} />
              <XAxis dataKey="module" tick={{ fontSize: 11, fill: '#8A90A0' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 12, fill: '#8A90A0' }} axisLine={false} tickLine={false} width={36} />
              <Tooltip contentStyle={{ borderRadius: 10, borderColor: '#E4E3DD', fontSize: 13 }} />
              <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                {moduleEfficiency.map((m) => (
                  <Cell key={m.module} fill={barColor(m.value)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}
