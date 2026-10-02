import { useState } from 'react'
import DeptLogin from './DeptLogin'
import { DEPARTMENT_META } from '../lib/constants'
import { MESSAGES } from '../lib/errors'

// Login in place, for screens opened from a public page (Fiche Modèle on
// Home, Ask Atlas): pick a department, enter its PIN, and `onLoggedIn`
// lets the caller reload its content — no detour through /departements.
// `preferredDept` (the department whose session just expired) goes straight
// to its PIN pad, with a way back to the full list.
export default function LoginPrompt({ preferredDept = null, expired = false, intro, onLoggedIn }) {
  const [dept, setDept] = useState(preferredDept && DEPARTMENT_META[preferredDept] ? preferredDept : null)
  const notice = expired ? `${MESSAGES.session.ar}\n${MESSAGES.session.fr}` : null

  if (dept) {
    const meta = DEPARTMENT_META[dept]
    return (
      <div>
        <DeptLogin deptKey={dept} deptLabel={meta.label} deptIcon={meta.icon} notice={notice} onLoggedIn={(token) => onLoggedIn(dept, token)} />
        <div className="text-center">
          <button onClick={() => setDept(null)} className="h-10 px-4 text-sm text-turquoise">
            ← Autre département
          </button>
        </div>
      </div>
    )
  }
  return (
    <div className="space-y-3">
      {notice && <p className="whitespace-pre-line rounded-md border border-status-bad/50 bg-status-bad/10 p-3 text-center text-sm text-status-bad">{notice}</p>}
      {intro && <p className="text-sm text-slate-300">{intro}</p>}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {Object.entries(DEPARTMENT_META).map(([key, meta]) => (
          <button
            key={key}
            onClick={() => setDept(key)}
            className="flex min-h-12 items-center gap-2 rounded-md border border-turquoise/30 bg-navy-800 px-3 py-2 text-left text-sm text-slate-200 active:bg-turquoise/10"
          >
            <span className="text-lg">{meta.icon}</span>
            <span className="min-w-0 break-words">{meta.label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
