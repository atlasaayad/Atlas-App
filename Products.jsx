import { Plus, Filter } from 'lucide-react'
import { PageHeader, StatusBadge } from '../components/PageHeader.jsx'
import { products } from '../data/mockData.js'

export default function Products() {
  return (
    <div>
      <PageHeader
        eyebrow="Catalog"
        title="Products"
        description="Every style in the catalog, its category, season and the gamme that drives production."
        actions={
          <>
            <button className="btn-secondary">
              <Filter size={16} /> Filter
            </button>
            <button className="btn-primary">
              <Plus size={16} /> New product
            </button>
          </>
        }
      />

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="table-shell">
            <thead>
              <tr>
                <th>Reference</th>
                <th>Product</th>
                <th>Category</th>
                <th>Season</th>
                <th>Dossier</th>
                <th>Gamme</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.ref}>
                  <td className="font-mono text-xs text-ink-soft">{p.ref}</td>
                  <td className="font-medium text-ink">{p.name}</td>
                  <td className="text-ink-soft">{p.category}</td>
                  <td className="text-ink-soft">{p.season}</td>
                  <td className="font-mono text-xs text-ink-soft">{p.dossier}</td>
                  <td className="font-mono text-xs text-indigo-700">{p.gamme}</td>
                  <td>
                    <StatusBadge status={p.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
