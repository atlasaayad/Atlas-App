export default function EffectifsGrid({ effectifs }) {
  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
      {effectifs.map((e) => {
        const short = e.present < e.required
        return (
          <div key={e.specialty} className="rounded-md border border-slate-700/70 bg-navy-900/50 p-2 text-center">
            <div className="font-mono text-xs text-slate-400">{e.specialty}</div>
            <div className={`font-display text-base font-semibold ${short ? 'text-status-warn' : 'text-turquoise'}`}>
              {e.present}/{e.required}
            </div>
          </div>
        )
      })}
    </div>
  )
}
