import { useEffect, useState } from 'react'
import GlowCard from '../../components/GlowCard'
import NoModel from '../../components/NoModel'
import { useChainModel } from '../../hooks/useChainModel'
import { api } from '../../lib/api'

export default function GenericPosteForm({ token, chainNumber, deptKey }) {
  const { modelId, dashboard, loading, refresh } = useChainModel(chainNumber)
  const [percentage, setPercentage] = useState(100)
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (dashboard) {
      const poste = dashboard.etatDesPostes.find((p) => p.deptKey === deptKey)
      setPercentage(poste?.percentage ?? 100)
      setNote(poste?.note ?? '')
    }
  }, [dashboard, deptKey])

  if (loading) return <div className="py-10 text-center text-slate-400">Chargement…</div>
  if (!modelId) return <NoModel chainNumber={chainNumber} />

  async function submit(e) {
    e.preventDefault()
    setSaving(true)
    try {
      await api.poste.update(token, modelId, Number(percentage), note)
      setSaved(true)
      refresh()
      setTimeout(() => setSaved(false), 2000)
    } finally {
      setSaving(false)
    }
  }

  return (
    <GlowCard title="État du poste">
      <form onSubmit={submit} className="space-y-5">
        <div>
          <div className="mb-2 flex justify-between text-sm">
            <span className="text-slate-400">Avancement de la tâche du jour</span>
            <span className="font-mono text-turquoise">{percentage}%</span>
          </div>
          <input
            type="range"
            min="0"
            max="100"
            value={percentage}
            onChange={(e) => setPercentage(e.target.value)}
            className="w-full accent-turquoise"
          />
        </div>
        <label className="block">
          <span className="mb-1 block text-xs uppercase tracking-wide text-slate-500">Remarque (optionnel)</span>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            className="w-full rounded-md border border-slate-700 bg-navy-900 px-3 py-2 text-sm text-slate-200 focus:border-turquoise focus:outline-none"
          />
        </label>
        <button
          type="submit"
          disabled={saving}
          className="rounded-md border border-turquoise bg-turquoise/10 px-4 py-2 font-medium text-turquoise shadow-glow-sm hover:bg-turquoise/20 disabled:opacity-50"
        >
          {saving ? 'Enregistrement…' : saved ? 'Enregistré ✓' : 'Enregistrer'}
        </button>
      </form>
    </GlowCard>
  )
}
