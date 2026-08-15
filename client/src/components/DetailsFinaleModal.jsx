const GROUPS = [
  {
    title: 'Pièces',
    fields: [
      ['pieceRetouche', 'Pièce retouche'],
      ['pieceTerminee', 'Pièce terminée'],
      ['piece2eme', 'Pièce 2ème'],
    ],
  },
  {
    title: 'En cours par poste',
    fields: [
      ['encoursSpecial', 'Encours spécial'],
      ['encoursRepassage', 'Encours repassage'],
      ['encoursControle', 'Encours contrôle'],
    ],
  },
  {
    title: 'Moyenne production / heure',
    fields: [
      ['moyenneProdSpecial', 'Moyenne prod/h spécial'],
      ['moyenneProdRepassageFinal', 'Moyenne prod/h repassage final'],
      ['moyenneProdControleFinal', 'Moyenne prod/h contrôle final'],
    ],
  },
]

export default function DetailsFinaleModal({ details, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center sm:p-4" onClick={onClose}>
      <div
        className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-lg border border-turquoise/30 bg-navy-900 p-4 sm:rounded-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <div className="font-display text-lg font-semibold text-slate-100">🔍 Détails Finale</div>
          <button onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded text-slate-400 active:bg-navy-800">
            ✕
          </button>
        </div>

        <div className="space-y-5">
          {GROUPS.map((group) => (
            <div key={group.title}>
              <div className="mb-2 text-sm font-medium text-turquoise">{group.title}</div>
              <div className="grid grid-cols-3 gap-2">
                {group.fields.map(([key, label]) => (
                  <div key={key} className="rounded-md border border-slate-800 bg-navy-800 p-2.5 text-center">
                    <div className="font-mono text-lg font-semibold text-turquoise glow-number">
                      {(details?.[key] ?? 0).toLocaleString('fr-FR')}
                    </div>
                    <div className="mt-1 text-[10px] leading-tight text-slate-500">{label}</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
