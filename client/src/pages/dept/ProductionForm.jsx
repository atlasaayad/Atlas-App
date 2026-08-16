import { useEffect, useState } from 'react'
import GlowCard from '../../components/GlowCard'
import NoModel from '../../components/NoModel'
import VoiceModeToggle from '../../components/VoiceModeToggle'
import VoiceMicButton from '../../components/VoiceMicButton'
import { useChainModel } from '../../hooks/useChainModel'
import { api } from '../../lib/api'

export default function ProductionForm({ token, chainNumber }) {
  const { modelId, dashboard, loading, refresh } = useChainModel(chainNumber)
  const [hourly, setHourly] = useState({})
  const [totalEntree, setTotalEntree] = useState('')
  const [savingSlot, setSavingSlot] = useState(null)
  const [savingTotals, setSavingTotals] = useState(false)
  const [voiceMode, setVoiceMode] = useState(false)

  useEffect(() => {
    if (dashboard) {
      setHourly(Object.fromEntries(dashboard.hourly.map((h) => [h.index, h.qty])))
      setTotalEntree(dashboard.bilan.totalEntree)
    }
  }, [dashboard])

  if (loading) return <div className="py-10 text-center text-slate-400">Chargement…</div>
  if (!modelId) return <NoModel chainNumber={chainNumber} />

  async function saveSlot(idx) {
    setSavingSlot(idx)
    try {
      await api.production.updateHourly(token, modelId, idx, Number(hourly[idx]) || 0)
      refresh()
    } finally {
      setSavingSlot(null)
    }
  }

  async function saveTotals(e) {
    e.preventDefault()
    setSavingTotals(true)
    try {
      await api.production.updateTotals(token, modelId, Number(totalEntree) || 0)
      refresh()
    } finally {
      setSavingTotals(false)
    }
  }

  return (
    <div className="space-y-4">
      <VoiceModeToggle voiceMode={voiceMode} setVoiceMode={setVoiceMode} />

      <GlowCard title="Production par heure">
        <p className="mb-3 text-sm text-slate-400">أدخل عدد القطع المنتجة بكل ساعة، واضغط OK لحفظها.</p>
        <div className="space-y-2.5">
          {dashboard.hourly.map((slot) => (
            <div key={slot.index} className="flex items-center gap-2.5">
              <span className="w-24 shrink-0 font-mono text-xs text-slate-400">{slot.label}</span>
              <input
                type="number"
                inputMode="numeric"
                value={hourly[slot.index] ?? 0}
                onChange={(e) => setHourly({ ...hourly, [slot.index]: e.target.value })}
                className="h-11 w-full min-w-0 rounded border border-slate-700 bg-navy-900 px-3 text-base text-slate-200 focus:border-turquoise focus:outline-none"
              />
              {voiceMode && (
                <VoiceMicButton
                  label={slot.label}
                  onConfirm={(n) => setHourly({ ...hourly, [slot.index]: n })}
                />
              )}
              <button
                onClick={() => saveSlot(slot.index)}
                disabled={savingSlot === slot.index}
                className="h-11 shrink-0 rounded border border-turquoise/50 px-4 text-sm font-medium text-turquoise active:bg-turquoise/10 disabled:opacity-50"
              >
                {savingSlot === slot.index ? '…' : 'OK'}
              </button>
            </div>
          ))}
        </div>
      </GlowCard>

      <GlowCard title="Total entré">
        <p className="mb-3 text-sm text-slate-400">
          أدخل مرة واحدة، بآخر ساعة من اليوم: مجموع القطع اللي دخلت السلسلة كامل اليوم.
        </p>
        <form onSubmit={saveTotals} className="flex items-end gap-3">
          <label className="block flex-1">
            <span className="mb-1 block text-xs uppercase tracking-wide text-slate-500">Total entré</span>
            <input
              type="number"
              inputMode="numeric"
              value={totalEntree}
              onChange={(e) => setTotalEntree(e.target.value)}
              className="h-11 w-full rounded-md border border-slate-700 bg-navy-900 px-3 text-base text-slate-200 focus:border-turquoise focus:outline-none"
            />
          </label>
          {voiceMode && <VoiceMicButton label="Total entré" onConfirm={(n) => setTotalEntree(n)} />}
          <button
            type="submit"
            disabled={savingTotals}
            className="h-11 shrink-0 rounded-md border border-turquoise bg-turquoise/10 px-6 text-sm font-medium text-turquoise shadow-glow-sm active:bg-turquoise/20 disabled:opacity-50"
          >
            {savingTotals ? '…' : 'Enregistrer'}
          </button>
        </form>
      </GlowCard>
    </div>
  )
}
