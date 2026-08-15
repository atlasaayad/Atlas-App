import { useEffect, useState } from 'react'
import GlowCard from '../../components/GlowCard'
import NoModel from '../../components/NoModel'
import VoiceModeToggle from '../../components/VoiceModeToggle'
import VoiceMicButton from '../../components/VoiceMicButton'
import { useChainModel } from '../../hooks/useChainModel'
import { api } from '../../lib/api'

const NOTE_PRESETS = ['Panne machine', 'Manque de personnel', 'Manque de matière première', 'Retard livraison', 'Problème qualité']

export default function GenericPosteForm({ token, chainNumber, deptKey }) {
  const { modelId, dashboard, loading, refresh } = useChainModel(chainNumber)
  const [percentage, setPercentage] = useState(100)
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [voiceMode, setVoiceMode] = useState(false)

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
      <VoiceModeToggle voiceMode={voiceMode} setVoiceMode={setVoiceMode} />
      <form onSubmit={submit} className="space-y-6">
        <div>
          <div className="mb-2 flex items-center justify-between gap-2 text-sm">
            <span className="text-slate-400">نسبة إنجاز مهمة اليوم</span>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xl text-turquoise">{percentage}%</span>
              {voiceMode && (
                <VoiceMicButton label="نسبة إنجاز مهمة اليوم" onConfirm={(n) => setPercentage(Math.min(100, n))} />
              )}
            </div>
          </div>
          <input
            type="range"
            min="0"
            max="100"
            value={percentage}
            onChange={(e) => setPercentage(e.target.value)}
            className="h-3 w-full accent-turquoise"
          />
          <div className="mt-1 text-xs text-slate-500">100% = كل شي طبيعي، أقل من 70% = يظهر أحمر بالشاشة الرئيسية (اختناق)</div>
        </div>

        <label className="block">
          <span className="mb-1 block text-xs uppercase tracking-wide text-slate-500">
            سبب التأخير (اختياري — إذا النسبة أقل من 100%)
          </span>
          <div className="mb-2 flex flex-wrap gap-2">
            {NOTE_PRESETS.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => setNote(preset)}
                className={`rounded-full border px-3 py-2 text-xs ${
                  note === preset ? 'border-turquoise bg-turquoise/10 text-turquoise' : 'border-slate-700 text-slate-400'
                }`}
              >
                {preset}
              </button>
            ))}
          </div>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="أو اكتب ملاحظة مخصصة..."
            rows={3}
            className="w-full rounded-md border border-slate-700 bg-navy-900 px-3 py-2.5 text-sm text-slate-200 focus:border-turquoise focus:outline-none"
          />
        </label>

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
