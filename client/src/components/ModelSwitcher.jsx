// Fin de série / Démarrage: only rendered when the chain runs two models at
// once. One button per model (fin de série first, démarrage second), each
// with how many of today's hours already have an entry — so whoever is
// entering data doesn't forget the other model.
const ROLE_LABEL = { fin_de_serie: 'fin', demarrage: 'début' }

export default function ModelSwitcher({ openModels, selectedId, onSelect, totalSlots }) {
  if (!openModels || openModels.length < 2) return null
  return (
    <div className="rounded-md border border-slate-800 bg-navy-900/40 p-3">
      <div className="mb-2 text-xs uppercase tracking-wide text-slate-500">Modèle</div>
      <div className="flex flex-wrap gap-2">
        {openModels.map((m) => {
          const active = m.id === selectedId
          const isStart = m.role === 'demarrage'
          return (
            <button
              key={m.id}
              onClick={() => onSelect(m.id)}
              className={`flex items-center gap-2 rounded-md border px-3 py-2.5 text-sm font-medium ${
                active
                  ? isStart
                    ? 'border-status-good bg-status-good/10 text-status-good'
                    : 'border-amber bg-amber-soft text-amber'
                  : 'border-slate-700 text-slate-400'
              }`}
            >
              <span>
                {active ? '● ' : ''}
                {m.dessin || m.client} ({ROLE_LABEL[m.role] || ''})
              </span>
              {m.filledSlots !== null && m.filledSlots !== undefined && (
                <span className="rounded bg-navy-950/60 px-1.5 py-0.5 font-mono text-[11px] text-slate-300">
                  {m.filledSlots}/{totalSlots}h
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
