export default function ExportTable({ exports }) {
  if (!exports?.length) {
    return <div className="py-6 text-center text-sm text-slate-500">Aucune expédition programmée.</div>
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[520px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-turquoise/25 text-left font-mono text-[11px] uppercase tracking-wide text-turquoise/70">
            <th className="py-2 pr-3">Client</th>
            <th className="py-2 pr-3">Mod</th>
            <th className="py-2 pr-3">Description</th>
            <th className="py-2 pr-3">Quantité</th>
            <th className="py-2 pr-3">Date</th>
          </tr>
        </thead>
        <tbody>
          {exports.map((row) => (
            <tr key={row.id} className="border-b border-slate-800/70">
              <td className="py-2 pr-3 text-slate-300">{row.client}</td>
              <td className="py-2 pr-3 font-mono text-slate-400">{row.mod}</td>
              <td className="py-2 pr-3 text-slate-300">{row.description}</td>
              <td className="py-2 pr-3 font-mono text-slate-200">{row.quantite.toLocaleString('fr-FR')}</td>
              <td className="py-2 pr-3 font-mono text-slate-400">{row.date}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
