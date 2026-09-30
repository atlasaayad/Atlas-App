import { useEffect, useState } from 'react'
import GlowCard from '../../components/GlowCard'
import NoModel from '../../components/NoModel'
import VoiceModeToggle from '../../components/VoiceModeToggle'
import VoiceMicButton from '../../components/VoiceMicButton'
import ModelSwitcher from '../../components/ModelSwitcher'
import { useChainModel } from '../../hooks/useChainModel'
import { api } from '../../lib/api'
import { useSaveStatus } from '../../hooks/useSaveStatus'
import ErrorNote from '../../components/ErrorNote'

export default function DepotForm({ token, chainNumber }) {
  const { modelId, dashboard, loading, loadError, refresh, openModels, selectModel } = useChainModel(chainNumber, { selectable: true })
  const [totalPieces, setTotalPieces] = useState(0)
  const [effectifTotal, setEffectifTotal] = useState(0)
  const save = useSaveStatus()
  const [voiceMode, setVoiceMode] = useState(false)

  useEffect(() => {
    if (dashboard) {
      setTotalPieces(dashboard.depotTotal)
      setEffectifTotal(dashboard.depotEffectif)
    }
  }, [dashboard])

  if (loading) return <div className="py-10 text-center text-slate-400">Chargement…</div>
  if (!modelId) return <NoModel chainNumber={chainNumber} loadError={loadError} onRetry={refresh} />

  async function submit(e) {
    e.preventDefault()
    const { ok } = await save.run(() => api.depot.update(token, modelId, Number(totalPieces), Number(effectifTotal)))
    if (ok) refresh()
  }

  return (
    <GlowCard title="Dépôt">
      <div className="mb-3">
        <ModelSwitcher openModels={openModels} selectedId={modelId} onSelect={selectModel} />
      </div>
      <VoiceModeToggle voiceMode={voiceMode} setVoiceMode={setVoiceMode} />
      <form onSubmit={submit} className="space-y-4">
        <label className="block">
          <span className="mb-1 block text-xs uppercase tracking-wide text-slate-500">Total pièces sur dépôt</span>
          <span className="mb-1.5 block text-xs text-slate-500">إجمالي عدد القطع الجاهزة والمخزّنة بالدépôt الآن</span>
          <div className="flex items-center gap-2">
            <input
              type="number"
              inputMode="numeric"
              min="0"
              value={totalPieces || ''}
              onChange={(e) => setTotalPieces(e.target.value)}
              className="h-12 w-full rounded-md border border-slate-700 bg-navy-900 px-3 text-lg text-slate-200 focus:border-turquoise focus:outline-none"
            />
            {voiceMode && <VoiceMicButton label="Total pièces sur dépôt" onConfirm={setTotalPieces} />}
          </div>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs uppercase tracking-wide text-slate-500">Effectif Dépôt</span>
          <span className="mb-1.5 block text-xs text-slate-500">عدد العمال الحاضرين حالياً بالDépôt — يظهر بشاشة "État des effectifs"</span>
          <div className="flex items-center gap-2">
            <input
              type="number"
              inputMode="numeric"
              min="0"
              value={effectifTotal || ''}
              onChange={(e) => setEffectifTotal(e.target.value)}
              className="h-12 w-full rounded-md border border-slate-700 bg-navy-900 px-3 text-lg text-slate-200 focus:border-turquoise focus:outline-none"
            />
            {voiceMode && <VoiceMicButton label="Effectif Dépôt" onConfirm={setEffectifTotal} />}
          </div>
        </label>
        <button
          type="submit"
          disabled={save.saving}
          className="w-full rounded-md border border-turquoise bg-turquoise/10 py-3.5 text-base font-medium text-turquoise shadow-glow-sm active:bg-turquoise/20 disabled:opacity-50 sm:w-auto sm:px-8"
        >
          {save.saving ? 'Enregistrement…' : save.saved ? 'Enregistré ✓' : 'Enregistrer'}
        </button>
        <ErrorNote message={save.error} />
      </form>
    </GlowCard>
  )
}
