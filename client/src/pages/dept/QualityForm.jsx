import { useEffect, useState } from 'react'
import GlowCard from '../../components/GlowCard'
import NoModel from '../../components/NoModel'
import Stepper from '../../components/Stepper'
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
      <form onSubmit={submit} className="space-y-6">
        <div>
          <div className="mb-2 flex justify-between text-sm">
            <span className="text-slate-400">نسبة الجودة</span>
            <span className="font-mono text-xl text-turquoise">{percentage}%</span>
          </div>
          <input
            type="range"
            min="0"
            max="100"
            value={percentage}
            onChange={(e) => setPercentage(e.target.value)}
            className="h-3 w-full accent-turquoise"
          />
        </div>
        <div>
          <div className="mb-1 text-xs uppercase tracking-wide text-slate-500">Reprises</div>
          <div className="mb-2 text-xs text-slate-500">عدد القطع اللي تحتاج إعادة شغل بسبب عيب</div>
          <Stepper value={reprises} onChange={setReprises} max={999} />
        </div>
        <button
          type="submit"
          disabled={saving}
          className="w-full rounded-md border border-turquoise bg-turquoise/10 py-3.5 text-base font-medium text-turquoise shadow-glow-sm active:bg-turquoise/20 disabled:opacity-50 sm:w-auto sm:px-8"
        >
          {saving ? 'Enregistrement…' : saved ? 'Enregistré ✓' : 'Enregistrer'}
        </button>
      </form>
    </GlowCard>
  )
}
