import { useState } from 'react'
import GlowCard from '../../components/GlowCard'
import NoModel from '../../components/NoModel'
import ExportTable from '../../components/ExportTable'
import { useChainModel } from '../../hooks/useChainModel'
import { api } from '../../lib/api'

export default function LogisticsForm({ token, chainNumber }) {
  const { modelId, dashboard, loading, refresh } = useChainModel(chainNumber)
  const [form, setForm] = useState({ description: '', quantite: '', date: '' })
  const [saving, setSaving] = useState(false)

  if (loading) return <div className="py-10 text-center text-slate-400">Chargement…</div>
  if (!modelId) return <NoModel chainNumber={chainNumber} />

  async function submit(e) {
    e.preventDefault()
    setSaving(true)
    try {
      await api.logistics.addExport(token, modelId, form)
      setForm({ description: '', quantite: '', date: '' })
      refresh()
    } finally {
      setSaving(false)
    }
  }

  async function remove(exportId) {
    await api.logistics.deleteExport(token, exportId)
    refresh()
  }

  return (
    <div className="space-y-4">
      <GlowCard title="Nouvelle expédition">
        <form onSubmit={submit} className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <input
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="Description"
            required
            className="rounded-md border border-slate-700 bg-navy-900 px-3 py-2 text-sm text-slate-200 focus:border-turquoise focus:outline-none"
          />
          <input
            type="number"
            value={form.quantite}
            onChange={(e) => setForm({ ...form, quantite: e.target.value })}
            placeholder="Quantité"
            required
            className="rounded-md border border-slate-700 bg-navy-900 px-3 py-2 text-sm text-slate-200 focus:border-turquoise focus:outline-none"
          />
          <input
            type="date"
            value={form.date}
            onChange={(e) => setForm({ ...form, date: e.target.value })}
            required
            className="rounded-md border border-slate-700 bg-navy-900 px-3 py-2 text-sm text-slate-200 focus:border-turquoise focus:outline-none"
          />
          <button
            type="submit"
            disabled={saving}
            className="sm:col-span-3 rounded-md border border-turquoise bg-turquoise/10 py-2.5 font-medium text-turquoise shadow-glow-sm hover:bg-turquoise/20 disabled:opacity-50"
          >
            {saving ? 'Ajout…' : 'Ajouter au programme'}
          </button>
        </form>
      </GlowCard>

      <GlowCard title="Programme d'export">
        <ExportTable exports={dashboard.exports} />
        {dashboard.exports.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {dashboard.exports.map((e) => (
              <button
                key={e.id}
                onClick={() => remove(e.id)}
                className="rounded border border-status-bad/40 px-2 py-1 text-xs text-status-bad hover:bg-status-bad/10"
              >
                Supprimer {e.date}
              </button>
            ))}
          </div>
        )}
      </GlowCard>
    </div>
  )
}
