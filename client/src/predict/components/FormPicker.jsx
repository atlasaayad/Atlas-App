const CYCLE = ['W', 'D', 'L']
const COLOR = { W: 'bg-status-good/80 text-navy-950', D: 'bg-amber/80 text-navy-950', L: 'bg-status-bad/80 text-navy-950' }

export default function FormPicker({ value, onChange, label }) {
  const letters = (value || '').padEnd(5, '_').slice(0, 5).split('')

  function cycle(index) {
    const current = letters[index]
    const currentIdx = CYCLE.indexOf(current)
    const next = CYCLE[(currentIdx + 1) % CYCLE.length]
    const updated = [...letters]
    updated[index] = next
    onChange(updated.join('').replace(/_/g, ''))
  }

  return (
    <div>
      {label && <div className="mb-1 text-xs text-slate-400">{label}</div>}
      <div className="flex gap-1.5">
        {letters.map((c, i) => (
          <button
            type="button"
            key={i}
            onClick={() => cycle(i)}
            className={`h-8 w-8 rounded-md text-xs font-bold transition ${
              c === '_' ? 'bg-navy-700/70 text-slate-500' : COLOR[c]
            }`}
            title="W / D / L"
          >
            {c === '_' ? '—' : c}
          </button>
        ))}
      </div>
    </div>
  )
}
