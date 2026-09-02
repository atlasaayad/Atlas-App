import { useEffect, useRef, useState } from 'react'
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
  const [savedSlots, setSavedSlots] = useState({})
  const [slotErrors, setSlotErrors] = useState({})
  const [savingTotals, setSavingTotals] = useState(false)
  const [totalsSaved, setTotalsSaved] = useState(false)
  const [totalsError, setTotalsError] = useState(false)
  const [voiceMode, setVoiceMode] = useState(false)

  // Initialize local state from the dashboard exactly once per model (chain
  // switch / initial load) — never again on a later background refresh.
  // Re-running this on every `dashboard` change (the old behavior) meant
  // saving ONE hourly slot re-synced ALL of them from the server, silently
  // discarding whatever the user had typed but not yet confirmed in any
  // other field.
  const initializedForRef = useRef(null)
  useEffect(() => {
    if (dashboard && initializedForRef.current !== modelId) {
      setHourly(Object.fromEntries(dashboard.hourly.map((h) => [h.index, h.qty])))
      setTotalEntree(dashboard.bilan.totalEntree)
      initializedForRef.current = modelId
    }
  }, [dashboard, modelId])

  if (loading) return <div className="py-10 text-center text-slate-400">Chargement…</div>
  if (!modelId) return <NoModel chainNumber={chainNumber} />

  function updateSlot(idx, value) {
    setHourly({ ...hourly, [idx]: value })
    // The displayed value no longer matches what's saved — drop the
    // "Modifier ✓" confirmation until it's saved again.
    setSavedSlots((s) => ({ ...s, [idx]: false }))
    setSlotErrors((s) => ({ ...s, [idx]: false }))
  }

  async function saveSlot(idx) {
    setSavingSlot(idx)
    setSlotErrors((s) => ({ ...s, [idx]: false }))
    try {
      await api.production.updateHourly(token, modelId, idx, Number(hourly[idx]) || 0)
      setSavedSlots((s) => ({ ...s, [idx]: true }))
      refresh() // silent — no longer flips `loading`, see useChainModel
    } catch {
      setSlotErrors((s) => ({ ...s, [idx]: true }))
    } finally {
      setSavingSlot(null)
    }
  }

  async function saveTotals(e) {
    e.preventDefault()
    setSavingTotals(true)
    setTotalsError(false)
    try {
      await api.production.updateTotals(token, modelId, Number(totalEntree) || 0)
      setTotalsSaved(true)
      refresh()
      setTimeout(() => setTotalsSaved(false), 2000)
    } catch {
      setTotalsError(true)
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
            <div key={slot.index}>
              <div className="flex items-center gap-2.5">
                <span className="w-24 shrink-0 font-mono text-xs text-slate-400">{slot.label}</span>
                <input
                  type="number"
                  inputMode="numeric"
                  value={hourly[slot.index] || ''}
                  onChange={(e) => updateSlot(slot.index, e.target.value)}
                  className="h-11 w-full min-w-0 rounded border border-slate-700 bg-navy-900 px-3 text-base text-slate-200 focus:border-turquoise focus:outline-none"
                />
                {voiceMode && (
                  <VoiceMicButton
                    label={slot.label}
                    onConfirm={(n) => updateSlot(slot.index, n)}
                  />
                )}
                <button
                  onClick={() => saveSlot(slot.index)}
                  disabled={savingSlot === slot.index}
                  className={`h-11 shrink-0 rounded border px-4 text-sm font-medium disabled:opacity-50 ${
                    savedSlots[slot.index]
                      ? 'border-turquoise bg-turquoise text-navy-950 active:bg-turquoise/80'
                      : 'border-turquoise/50 text-turquoise active:bg-turquoise/10'
                  }`}
                >
                  {savingSlot === slot.index ? '…' : savedSlots[slot.index] ? 'Modifier ✓' : 'OK'}
                </button>
              </div>
              {slotErrors[slot.index] && (
                <div className="mt-1 pr-[6.75rem] text-xs text-status-bad">
                  فشل الحفظ — تحقق من الاتصال وحاول مرة ثانية.
                </div>
              )}
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
              value={totalEntree || ''}
              onChange={(e) => {
                setTotalEntree(e.target.value)
                setTotalsError(false)
              }}
              className="h-11 w-full rounded-md border border-slate-700 bg-navy-900 px-3 text-base text-slate-200 focus:border-turquoise focus:outline-none"
            />
          </label>
          {voiceMode && <VoiceMicButton label="Total entré" onConfirm={(n) => setTotalEntree(n)} />}
          <button
            type="submit"
            disabled={savingTotals}
            className="h-11 shrink-0 rounded-md border border-turquoise bg-turquoise/10 px-6 text-sm font-medium text-turquoise shadow-glow-sm active:bg-turquoise/20 disabled:opacity-50"
          >
            {savingTotals ? '…' : totalsSaved ? 'Enregistré ✓' : 'Enregistrer'}
          </button>
        </form>
        {totalsError && (
          <div className="mt-2 text-sm text-status-bad">فشل الحفظ — تحقق من الاتصال وحاول مرة ثانية.</div>
        )}
      </GlowCard>
    </div>
  )
}
