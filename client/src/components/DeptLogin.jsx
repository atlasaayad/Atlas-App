import { useState } from 'react'
import PinPad from './PinPad'
import LockedScreen from './LockedScreen'
import { api, setDeptToken } from '../lib/api'
import { errorMessage } from '../lib/errors'

// The PIN login of one department — shared by the department gate, the
// ⚙️ Réglages gate and the "session expired" overlay, so they all behave
// the same: wrong code → attempts left; 423 → lockout countdown; network or
// server failure → that real reason (never "Code incorrect").
export default function DeptLogin({ deptKey, deptLabel, deptIcon, onLoggedIn, notice }) {
  const [pinError, setPinError] = useState(null) // null | { text } | { attemptsRemaining }
  const [loading, setLoading] = useState(false)
  const [lockInfo, setLockInfo] = useState(null)

  async function handlePin(pin) {
    setLoading(true)
    setPinError(null)
    try {
      const res = await api.login(deptKey, pin)
      setDeptToken(deptKey, res.token)
      onLoggedIn(res.token)
    } catch (err) {
      if (err.status === 423) setLockInfo({ retryAfterSeconds: err.data?.retryAfterSeconds || 600 })
      else if (err.status === 401)
        setPinError({ attemptsRemaining: typeof err.data?.attemptsRemaining === 'number' ? err.data.attemptsRemaining : null })
      else setPinError({ text: errorMessage(err, { plain: true }) })
      throw err
    } finally {
      setLoading(false)
    }
  }

  if (lockInfo) {
    return <LockedScreen deptLabel={deptLabel} deptIcon={deptIcon} retryAfterSeconds={lockInfo.retryAfterSeconds} onExpire={() => setLockInfo(null)} />
  }
  return (
    <div>
      {notice && (
        <div role="alert" className="mx-auto mt-4 max-w-xs whitespace-pre-line rounded-md border border-status-bad/50 bg-status-bad/10 p-3 text-center text-sm font-medium text-status-bad">
          {notice}
        </div>
      )}
      <PinPad
        deptLabel={deptLabel}
        deptIcon={deptIcon}
        onSubmit={handlePin}
        error={Boolean(pinError)}
        errorText={pinError?.text}
        loading={loading}
        attemptsRemaining={pinError?.attemptsRemaining}
      />
    </div>
  )
}
