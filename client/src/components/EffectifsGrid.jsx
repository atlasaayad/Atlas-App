export default function EffectifsGrid({ effectifs }) {
  return (
    <div>
      <div className="mb-2 flex items-center gap-3 text-[11px] text-slate-500">
        <span className="flex items-center gap-1">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-turquoise" /> Présent
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-slate-500" /> Requis
        </span>
      </div>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
        {effectifs.map((e) => (
          <div key={e.specialty} className="rounded-md border border-slate-700/70 bg-navy-900/50 p-2 text-center">
            <div className="font-mono text-xs text-slate-400">{e.specialty}</div>
            <div className="font-display text-base font-semibold">
              <span className="text-turquoise">{e.present}</span>
              <span className="mx-0.5 text-slate-600">/</span>
              <span className="text-slate-500">{e.required}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
