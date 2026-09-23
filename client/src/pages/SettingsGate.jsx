import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import PinPad from '../components/PinPad'
import { api, getDeptToken, setDeptToken } from '../lib/api'
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
  const [pinError, setPinError] = useState(false)
  const [pinLoading, setPinLoading] = useState(false)
  const [attemptsRemaining, setAttemptsRemaining] = useState(null)

  async function handlePin(pin) {
    setPinLoading(true)
    setPinError(false)
    try {
      const res = await api.login(chosenDept, pin)
      setDeptToken(chosenDept, res.token)
      setActiveDept(chosenDept)
    } catch (err) {
      setPinError(true)
      setAttemptsRemaining(typeof err.data?.attemptsRemaining === 'number' ? err.data.attemptsRemaining : null)
      throw err
    } finally {
      setPinLoading(false)
    }
  }

  if (activeDept) {
    return <SettingsScreen token={getDeptToken(activeDept)} onBack={() => navigate('/departements')} />
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
      <PinPad
        deptLabel={meta.label}
        deptIcon={meta.icon}
        onSubmit={handlePin}
        error={pinError}
        loading={pinLoading}
        attemptsRemaining={attemptsRemaining}
      />
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
