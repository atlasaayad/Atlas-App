// Large tap targets (44px+), no on-screen keyboard needed — for short
// counts (headcount, attendance) where +/- is faster than typing on mobile.
export default function Stepper({ value, onChange, min = 0, max = 99, label }) {
  const num = Number(value) || 0

  function set(v) {
    onChange(Math.max(min, Math.min(max, v)))
  }

  return (
    <div className="flex flex-col items-center gap-1.5">
      {label && <span className="text-center font-mono text-xs text-slate-500">{label}</span>}
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => set(num - 1)}
          disabled={num <= min}
          aria-label="Diminuer"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-slate-700 bg-navy-900 text-xl text-slate-300 active:bg-navy-700 disabled:opacity-30"
        >
          −
        </button>
        <div className="flex h-11 w-12 shrink-0 items-center justify-center rounded-md border border-turquoise/40 bg-navy-900 font-display text-lg font-semibold text-turquoise">
          {num}
        </div>
        <button
          type="button"
          onClick={() => set(num + 1)}
          disabled={num >= max}
          aria-label="Augmenter"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-slate-700 bg-navy-900 text-xl text-slate-300 active:bg-navy-700 disabled:opacity-30"
        >
          +
        </button>
      </div>
    </div>
  )
}
