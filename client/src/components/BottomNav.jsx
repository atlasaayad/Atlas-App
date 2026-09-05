import { NavLink } from 'react-router-dom'

const tabs = [
  { to: '/', label: 'Accueil', icon: '🏠', end: true },
  { to: '/departements', label: 'Départements', icon: '🗂️', end: false },
  // 👥 (busts in silhouette) renders as a flat solid-color glyph in this
  // font, visually heavier/inconsistent next to the other three tabs'
  // detailed illustrated-style emoji — 🧑‍🤝‍🧑 matches their style.
  { to: '/effectifs', label: 'État des effectifs', icon: '🧑‍🤝‍🧑', end: false },
  { to: '/ask', label: 'Ask Atlas', icon: '💬', end: false },
]

export default function BottomNav() {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-turquoise/20 bg-navy-950/95 backdrop-blur">
      <div className="mx-auto flex max-w-3xl items-stretch justify-around">
        {tabs.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.end}
            className={({ isActive }) =>
              `flex flex-1 flex-col items-center gap-1 py-2.5 text-xs font-medium transition-colors ${
                isActive ? 'text-turquoise' : 'text-slate-400 hover:text-slate-200'
              }`
            }
          >
            <span className="text-xl leading-none">{tab.icon}</span>
            <span className="whitespace-nowrap">{tab.label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  )
}
