import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import DeptLogin from '../components/DeptLogin'
import { getDeptToken, onSessionExpired } from '../lib/api'
import { MESSAGES } from '../lib/errors'
import SettingsScreen from './SettingsScreen'

// ⚙️ Réglages — Agent Méthode/Patron only, using whichever of those two
// department's OWN existing PIN they already have (see server/src/routes/
// settings.js — requireDept(['methode', 'patron'])). There is no separate
// "settings" department/PIN: if either token is already in sessionStorage
// (e.g. they're already logged into Méthode elsewhere in the app this
// session), this skips straight to the screen; otherwise it asks which of
// the two they are, then reuses the exact same PinPad/login flow as
// DeptGate.jsx.
const ALLOWED = [
  { key: 'methode', label: 'Agent Méthode', icon: '⏱️' },
  { key: 'patron', label: 'Patron', icon: '👤' },
]

export default function SettingsGate() {
  const navigate = useNavigate()
  const [activeDept, setActiveDept] = useState(() => ALLOWED.find((d) => getDeptToken(d.key))?.key || null)
  const [chosenDept, setChosenDept] = useState(null)
  // Same "session expired" overlay as DeptGate: PIN pad on top, the
  // settings screen (and anything typed in it) stays mounted underneath.
  const [expired, setExpired] = useState(false)

  useEffect(() => onSessionExpired((expiredDept) => expiredDept && expiredDept === activeDept && setExpired(true)), [activeDept])

  if (activeDept) {
    const meta = ALLOWED.find((d) => d.key === activeDept)
    return (
      <>
        <SettingsScreen token={getDeptToken(activeDept) || ''} onBack={() => navigate('/departements')} />
        {expired && (
          <div className="fixed inset-0 z-[60] overflow-y-auto bg-navy-950/95 px-4">
            <DeptLogin
              deptKey={activeDept}
              deptLabel={meta.label}
              deptIcon={meta.icon}
              onLoggedIn={() => setExpired(false)}
              notice={`${MESSAGES.session.ar}\n${MESSAGES.session.fr}`}
            />
          </div>
        )}
      </>
    )
  }

  if (!chosenDept) {
    return (
      <div>
        <BackBar onBack={() => navigate('/departements')} />
        <div className="mx-auto max-w-xs space-y-3 py-8">
          <div className="text-center text-4xl">⚙️</div>
          <div className="text-center font-display text-lg font-semibold text-slate-100">الإعدادات</div>
          <p className="text-center text-sm text-slate-400">محصور على مسؤول المناهج أو الباطرون — اختر واحد لتسجيل الدخول:</p>
          {ALLOWED.map((d) => (
            <button
              key={d.key}
              onClick={() => setChosenDept(d.key)}
              className="flex w-full items-center gap-3 rounded-md border border-turquoise/30 bg-navy-800 px-4 py-3.5 text-slate-200 active:bg-turquoise/10"
            >
              <span className="text-2xl">{d.icon}</span>
              <span className="font-medium">{d.label}</span>
            </button>
          ))}
        </div>
      </div>
    )
  }

  const meta = ALLOWED.find((d) => d.key === chosenDept)
  return (
    <div>
      <BackBar onBack={() => setChosenDept(null)} />
      <DeptLogin deptKey={chosenDept} deptLabel={meta.label} deptIcon={meta.icon} onLoggedIn={() => setActiveDept(chosenDept)} />
    </div>
  )
}

function BackBar({ onBack }) {
  return (
    <div className="mb-4">
      <button onClick={onBack} className="text-sm text-turquoise hover:underline">
        ← Retour
      </button>
    </div>
  )
}
