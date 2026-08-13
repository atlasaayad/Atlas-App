import { useEffect, useState } from 'react'

export default function LockedScreen({ deptLabel, deptIcon, retryAfterSeconds, onExpire }) {
  const [remaining, setRemaining] = useState(retryAfterSeconds)

  useEffect(() => {
    setRemaining(retryAfterSeconds)
  }, [retryAfterSeconds])

  useEffect(() => {
    if (remaining <= 0) {
      onExpire()
      return
    }
    const id = setInterval(() => setRemaining((r) => r - 1), 1000)
    return () => clearInterval(id)
  }, [remaining, onExpire])

  const mm = Math.floor(remaining / 60)
  const ss = remaining % 60

  return (
    <div className="mx-auto flex max-w-xs flex-col items-center gap-4 py-12 text-center">
      <div className="text-4xl">🔒</div>
      <div className="font-display text-lg font-semibold text-slate-100">
        {deptIcon} {deptLabel}
      </div>
      <div className="rounded-md border border-status-bad/40 bg-status-bad/10 px-4 py-3">
        <div className="text-sm text-status-bad">القسم مقفول مؤقتاً بسبب محاولات خاطئة متكررة</div>
        <div className="mt-2 font-mono text-3xl font-semibold text-status-bad glow-number">
          {mm}:{String(ss).padStart(2, '0')}
        </div>
        <div className="mt-1 text-xs text-slate-400">حاول مرة ثانية بعد ما ينتهي الوقت</div>
      </div>
    </div>
  )
}
