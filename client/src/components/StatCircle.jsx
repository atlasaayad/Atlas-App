export default function StatCircle({ label, value, size = 'md', accent = true }) {
  const sizeClasses = size === 'lg' ? 'h-28 w-28 text-2xl' : 'h-20 w-20 text-lg'
  return (
    <div className="flex flex-col items-center gap-2">
      <div
        className={`flex ${sizeClasses} items-center justify-center rounded-full border ${
          accent ? 'border-turquoise/70 shadow-glow' : 'border-slate-600'
        } bg-navy-900/60 font-display font-semibold ${accent ? 'text-turquoise glow-number' : 'text-slate-300'}`}
      >
        {value}
      </div>
      <div className="text-center text-xs font-medium uppercase tracking-wide text-slate-400">{label}</div>
    </div>
  )
}
