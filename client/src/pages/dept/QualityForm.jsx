import { useEffect, useState } from 'react'
import GlowCard from '../../components/GlowCard'
import NoModel from '../../components/NoModel'
import { useChainModel } from '../../hooks/useChainModel'
import { api } from '../../lib/api'

export default function QualityForm({ token, chainNumber }) {
  const { modelId, dashboard, loading, refresh } = useChainModel(chainNumber)
  const [percentage, setPercentage] = useState(100)
  const [reprises, setReprises] = useState(0)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (dashboard) {
      setPercentage(dashboard.quality.percentage)
      setReprises(dashboard.quality.reprises)
    }
  }, [dashboard])

  if (loading) return <div className="py-10 text-center text-slate-400">Chargement…</div>
  if (!modelId) return <NoModel chainNumber={chainNumber} />

  async function submit(e) {
    e.preventDefault()
    setSaving(true)
    try {
      await api.quality.update(token, modelId, Number(percentage), Number(reprises))
      setSaved(true)
      refresh()
      setTimeout(() => setSaved(false), 2000)
    } finally {
      setSaving(false)
    }
  }

  return (
    <GlowCard title="Qualité">
      <form onSubmit={submit} className="space-y-5">
        <div>
          <div className="mb-2 flex justify-between text-sm">
            <span className="text-slate-400">Qualité %</span>
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
          <span className="mb-1 block text-xs uppercase tracking-wide text-slate-500">Reprises</span>
          <input
            type="number"
            min="0"
            value={reprises}
            onChange={(e) => setReprises(e.target.value)}
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
