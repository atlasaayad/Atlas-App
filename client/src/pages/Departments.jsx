import { Link } from 'react-router-dom'
import GlowCard from '../components/GlowCard'
import { DEPARTMENT_META } from '../lib/constants'

export default function Departments() {
  return (
    <div>
      <h1 className="mb-4 font-display text-xl font-semibold text-slate-100">Départements</h1>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
        {Object.entries(DEPARTMENT_META).map(([key, meta]) => (
          <Link key={key} to={`/departements/${key}`}>
            <GlowCard className="flex h-28 flex-col items-center justify-center gap-2 transition-transform hover:scale-[1.03]">
              <span className="text-3xl">{meta.icon}</span>
              <span className="text-center text-sm font-medium text-slate-200">{meta.label}</span>
            </GlowCard>
          </Link>
        ))}
      </div>
    </div>
  )
}
