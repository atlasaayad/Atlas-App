import { Sparkles, Users, Building2, Plug } from 'lucide-react'
import { PageHeader } from '../components/PageHeader.jsx'

export default function Settings() {
  return (
    <div>
      <PageHeader
        eyebrow="Workspace"
        title="Settings"
        description="Factory profile, team access and integrations."
      />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <div className="card p-5">
          <div className="flex items-center gap-2.5 mb-4">
            <Building2 size={18} className="text-indigo-600" />
            <h3 className="font-display font-semibold text-ink">Factory profile</h3>
          </div>
          <div className="space-y-4 text-sm">
            <label className="block">
              <span className="text-ink-soft">Factory name</span>
              <input className="mt-1 w-full rounded-lg border border-line bg-paper px-3 py-2 outline-none focus-visible:border-indigo-500" defaultValue="Atlas Garment Works" />
            </label>
            <label className="block">
              <span className="text-ink-soft">Time zone</span>
              <input className="mt-1 w-full rounded-lg border border-line bg-paper px-3 py-2 outline-none focus-visible:border-indigo-500" defaultValue="GMT+1 — Casablanca" />
            </label>
            <label className="block">
              <span className="text-ink-soft">Shift pattern</span>
              <input className="mt-1 w-full rounded-lg border border-line bg-paper px-3 py-2 outline-none focus-visible:border-indigo-500" defaultValue="2 shifts · 08:00–16:00 / 16:00–00:00" />
            </label>
            <button className="btn-primary">Save changes</button>
          </div>
        </div>

        <div className="card p-5">
          <div className="flex items-center gap-2.5 mb-4">
            <Users size={18} className="text-indigo-600" />
            <h3 className="font-display font-semibold text-ink">Team access</h3>
          </div>
          <ul className="divide-y divide-line">
            {[
              { name: 'Amina R.', role: 'Production manager' },
              { name: 'Youssef B.', role: 'Quality lead' },
              { name: 'Sara M.', role: 'Planner' },
            ].map((u) => (
              <li key={u.name} className="flex items-center justify-between py-3 text-sm">
                <div>
                  <p className="font-medium text-ink">{u.name}</p>
                  <p className="text-xs text-ink-faint">{u.role}</p>
                </div>
                <span className="badge badge-good">Active</span>
              </li>
            ))}
          </ul>
          <button className="btn-secondary mt-4">Invite teammate</button>
        </div>

        <div className="card p-5 xl:col-span-2">
          <div className="flex items-center gap-2.5 mb-4">
            <Plug size={18} className="text-indigo-600" />
            <h3 className="font-display font-semibold text-ink">Integrations</h3>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex items-center justify-between rounded-lg border border-line px-4 py-3">
              <span className="text-sm text-ink">ERP sync</span>
              <span className="badge badge-info">Not connected</span>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-dashed border-indigo-300 bg-indigo-50/50 px-4 py-3">
              <div className="flex items-center gap-2">
                <Sparkles size={15} className="text-indigo-600" />
                <span className="text-sm text-ink">AI Copilot (dossiers, gammes, SMV, line balancing)</span>
              </div>
              <span className="badge badge-info">Coming soon</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
