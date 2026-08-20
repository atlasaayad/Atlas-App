import { useEffect, useState } from 'react'
import { api } from '../lib/api'

// Polls independently of whichever chain is currently selected on Home —
// this is meant to surface a factory-wide heads-up regardless of what the
// viewer happens to be looking at. Renders nothing when the list is empty,
// and needs no manual dismissal: since it's recomputed from live data on
// every poll, a chain that recovers next hour just stops appearing.
const POLL_MS = 20000

export default function EarlyWarningBanner() {
  const [warnings, setWarnings] = useState([])

  useEffect(() => {
    let cancelled = false
    function load() {
      api
        .getEarlyWarnings()
        .then((r) => {
          if (!cancelled) setWarnings(r.warnings || [])
        })
        .catch(() => {})
    }
    load()
    const id = setInterval(load, POLL_MS)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [])

  if (warnings.length === 0) return null

  return (
    <div className="rounded-lg border border-amber bg-amber-soft px-4 py-3 shadow-[0_0_16px_rgba(245,158,11,0.2)]">
      <div className="space-y-1.5">
        {warnings.map((w) => (
          <div key={w.chainNumber} className="flex items-start gap-2 text-sm text-amber">
            <span className="shrink-0">⚠️</span>
            <span>
              <span className="font-semibold">إنذار مبكر:</span> Chaîne {w.chainNumber} ({w.client}) يتراجع منذ{' '}
              {w.hoursDeclining} ساعات متتالية ({w.startQty} → {w.currentQty}) — راقبه
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
