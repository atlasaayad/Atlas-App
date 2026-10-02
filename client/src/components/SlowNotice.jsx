import { useEffect, useState } from 'react'
import { onSlowRequests } from '../lib/api'
import { MESSAGES } from '../lib/errors'

// Small bar shown on every screen while a request is slow (> 6 s) or being
// retried automatically — so a cold-starting server reads as "slow,
// retrying", never as a frozen app or a lost connection.
export default function SlowNotice() {
  const [count, setCount] = useState(0)
  useEffect(() => onSlowRequests(setCount), [])
  if (count === 0) return null
  return (
    <div
      role="status"
      className="fixed inset-x-0 top-0 z-[70] flex items-center justify-center gap-2 bg-amber/95 px-3 py-1.5 text-center text-xs font-medium text-navy-950"
    >
      <span className="h-3 w-3 animate-spin rounded-full border-2 border-navy-950/30 border-t-navy-950" />
      {MESSAGES.slow.ar} · {MESSAGES.slow.fr}
    </div>
  )
}
