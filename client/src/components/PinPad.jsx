import { useState } from 'react'

export default function PinPad({ deptLabel, deptIcon, onSubmit, error, loading }) {
  const [pin, setPin] = useState('')

  function press(digit) {
    if (pin.length >= 4) return
    const next = pin + digit
    setPin(next)
    if (next.length === 4) onSubmit(next).then(() => setPin(''), () => setPin(''))
  }

  function backspace() {
    setPin((p) => p.slice(0, -1))
  }

  return (
    <div className="mx-auto flex max-w-xs flex-col items-center gap-6 py-8">
      <div className="text-4xl">{deptIcon}</div>
      <div className="font-display text-lg font-semibold text-slate-100">{deptLabel}</div>
      <div className="text-xs uppercase tracking-widest text-slate-500">Code secret (4 chiffres)</div>

      <div className="flex gap-3">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className={`h-4 w-4 rounded-full border-2 ${
              i < pin.length ? 'border-turquoise bg-turquoise shadow-glow-sm' : 'border-slate-600'
            }`}
          />
        ))}
      </div>

      {error && <div className="text-sm text-status-bad">Code incorrect, réessayez.</div>}
      {loading && <div className="text-sm text-turquoise">Vérification…</div>}

      <div className="grid grid-cols-3 gap-3">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
          <button
            key={d}
            onClick={() => press(d)}
            className="h-16 w-16 rounded-lg border border-turquoise/30 bg-navy-800/70 font-display text-xl font-medium text-slate-100 active:bg-turquoise/20"
          >
            {d}
          </button>
        ))}
        <button
          onClick={backspace}
          className="h-16 w-16 rounded-lg border border-slate-700 bg-navy-800/40 text-slate-400 active:bg-navy-700"
        >
          ⌫
        </button>
        <button
          onClick={() => press('0')}
          className="h-16 w-16 rounded-lg border border-turquoise/30 bg-navy-800/70 font-display text-xl font-medium text-slate-100 active:bg-turquoise/20"
        >
          0
        </button>
        <div />
      </div>
    </div>
  )
}
