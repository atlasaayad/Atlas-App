import { useEffect, useState } from 'react'

// Ticks every second; resets implicitly whenever `lastUpdated` changes (a
// new successful poll). Under 60s shows seconds, 60s+ switches to minutes.
export default function LiveIndicator({ lastUpdated }) {
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  if (!lastUpdated) return null

  const seconds = Math.max(0, Math.floor((now - lastUpdated) / 1000))
  const text = seconds < 60 ? `il y a ${seconds}s` : `il y a ${Math.floor(seconds / 60)} min`

  return (
    <div className="flex items-center gap-1.5 text-xs text-slate-500">
      <span className="h-2 w-2 rounded-full bg-turquoise shadow-glow-sm animate-pulse-soft" />
      <span>Mis à jour {text}</span>
    </div>
  )
}
