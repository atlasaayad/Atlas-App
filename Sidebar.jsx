import { NavLink } from 'react-router-dom'
import {
  LayoutGrid,
  Shirt,
  FolderOpen,
  Route,
  Boxes,
  CalendarClock,
  Factory,
  ShieldCheck,
  FileBarChart2,
  Settings as SettingsIcon,
  Sparkles,
} from 'lucide-react'

const nav = [
  { to: '/', label: 'Dashboard', icon: LayoutGrid, end: true },
  { to: '/products', label: 'Products', icon: Shirt },
  { to: '/dossiers', label: 'Technical Dossiers', icon: FolderOpen },
  { to: '/gammes', label: 'Gammes', icon: Route },
  { to: '/modules', label: 'Modules', icon: Boxes },
  { to: '/planning', label: 'Planning', icon: CalendarClock },
  { to: '/production', label: 'Production', icon: Factory },
  { to: '/quality', label: 'Quality', icon: ShieldCheck },
  { to: '/reports', label: 'Reports', icon: FileBarChart2 },
]

export default function Sidebar({ open, onClose }) {
  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-30 bg-ink/30 lg:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}
      <aside
        className={`fixed z-40 inset-y-0 left-0 w-64 shrink-0 border-r border-line bg-surface transition-transform duration-200 lg:static lg:translate-x-0 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex h-16 items-center gap-2.5 px-5 border-b border-line">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-white font-display font-semibold">
            A
          </div>
          <div>
            <p className="font-display font-semibold leading-tight text-ink">Atlas-App</p>
            <p className="text-[11px] text-ink-faint leading-tight">Production management</p>
          </div>
        </div>

        <nav className="flex flex-col gap-0.5 px-3 py-4">
          {nav.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              onClick={onClose}
              className={({ isActive }) =>
                `group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-indigo-50 text-indigo-700'
                    : 'text-ink-soft hover:bg-paper hover:text-ink'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && (
                    <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 stitch-line-v text-indigo-600" />
                  )}
                  <Icon size={18} strokeWidth={2} />
                  <span>{label}</span>
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="mt-2 px-3">
          <div className="stitch-line text-line" />
        </div>

        <div className="px-3 py-4">
          <NavLink
            to="/settings"
            onClick={onClose}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                isActive ? 'bg-indigo-50 text-indigo-700' : 'text-ink-soft hover:bg-paper hover:text-ink'
              }`
            }
          >
            <SettingsIcon size={18} strokeWidth={2} />
            Settings
          </NavLink>

          <div className="mt-4 rounded-xl border border-dashed border-indigo-300 bg-indigo-50/60 p-3.5">
            <div className="flex items-center gap-2 text-indigo-700">
              <Sparkles size={16} />
              <p className="text-xs font-semibold uppercase tracking-wide">AI Copilot</p>
            </div>
            <p className="mt-1.5 text-xs text-ink-soft leading-relaxed">
              Reads technical dossiers, suggests operation sequences, estimates SMV and balances lines.
            </p>
            <span className="badge badge-info mt-2">Preview</span>
          </div>
        </div>
      </aside>
    </>
  )
}
