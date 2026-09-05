import { useEffect, useState } from 'react'
import GlowCard from '../../components/GlowCard'
import NoModel from '../../components/NoModel'
import Stepper from '../../components/Stepper'
import VoiceModeToggle from '../../components/VoiceModeToggle'
import VoiceMicButton from '../../components/VoiceMicButton'
import { useChainModel } from '../../hooks/useChainModel'
import { api } from '../../lib/api'
import { FINALE_SPECIALTIES } from '../../lib/constants'

const GROUPS = [
  {
    title: 'Pièces',
    fields: [
      ['pieceRetouche', 'Pièce retouche'],
      ['pieceTerminee', 'Pièce terminée'],
      ['piece2eme', 'Pièce 2ème'],
    ],
  },
  {
    title: 'En cours par poste',
    fields: [
      ['encoursSpecial', 'Encours spécial'],
      ['encoursRepassage', 'Encours repassage'],
      ['encoursControle', 'Encours contrôle'],
    ],
  },
  {
    title: 'Moyenne production / heure',
    fields: [
      ['moyenneProdSpecial', 'Moyenne prod/h spécial'],
      ['moyenneProdRepassageFinal', 'Moyenne prod/h repassage final'],
      ['moyenneProdControleFinal', 'Moyenne prod/h contrôle final'],
    ],
  },
]

const DETAIL_KEYS = GROUPS.flatMap((g) => g.fields.map(([key]) => key))

export default function FinaleForm({ token, chainNumber }) {
  const { modelId, dashboard, loading, refresh } = useChainModel(chainNumber)
  const [enCours, setEnCours] = useState(0)
  const [details, setDetails] = useState(Object.fromEntries(DETAIL_KEYS.map((k) => [k, 0])))
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [voiceMode, setVoiceMode] = useState(false)
  const [effectif, setEffectif] = useState({})
  const [savingEffectif, setSavingEffectif] = useState(false)
  const [effectifSaved, setEffectifSaved] = useState(false)

  useEffect(() => {
    if (dashboard) {
      setEnCours(dashboard.finaleEnCours)
      setDetails(dashboard.finaleDetails)
      setEffectif(Object.fromEntries(dashboard.finaleAttendance.map((e) => [e.specialty, e.present])))
    }
  }, [dashboard])

  if (loading) return <div className="py-10 text-center text-slate-400">Chargement…</div>
  if (!modelId) return <NoModel chainNumber={chainNumber} />

  async function submit(e) {
    e.preventDefault()
    setSaving(true)
    try {
      const payload = { enCours: Number(enCours) || 0 }
      for (const key of DETAIL_KEYS) payload[key] = Number(details[key]) || 0
      await api.finale.update(token, modelId, payload)
      setSaved(true)
      refresh()
      setTimeout(() => setSaved(false), 2000)
    } finally {
      setSaving(false)
    }
  }

  async function submitEffectif() {
    setSavingEffectif(true)
    try {
      await api.finale.updateEffectif(token, modelId, effectif)
      setEffectifSaved(true)
      refresh()
      setTimeout(() => setEffectifSaved(false), 2000)
    } finally {
      setSavingEffectif(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <VoiceModeToggle voiceMode={voiceMode} setVoiceMode={setVoiceMode} />

      <GlowCard title="Finale">
        <label className="block">
          <span className="mb-1 block text-xs uppercase tracking-wide text-slate-500">En cours Finale</span>
          <span className="mb-1.5 block text-xs text-slate-500">عدد القطع الموجودة حالياً بمرحلة Finale</span>
          <div className="flex items-center gap-2">
            <input
              type="number"
              inputMode="numeric"
              min="0"
              value={enCours || ''}
              onChange={(e) => setEnCours(e.target.value)}
              className="h-12 w-full rounded-md border border-slate-700 bg-navy-900 px-3 text-lg text-slate-200 focus:border-turquoise focus:outline-none"
            />
            {voiceMode && <VoiceMicButton label="En cours Finale" onConfirm={setEnCours} />}
          </div>
        </label>
      </GlowCard>

      {GROUPS.map((group) => (
        <GlowCard key={group.title} title={group.title}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {group.fields.map(([key, label]) => (
              <label key={key} className="block">
                <span className="mb-1 block text-xs uppercase tracking-wide text-slate-500">{label}</span>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    inputMode="numeric"
                    min="0"
                    value={details[key] || ''}
                    onChange={(e) => setDetails({ ...details, [key]: e.target.value })}
                    className="h-11 w-full rounded-md border border-slate-700 bg-navy-900 px-3 text-base text-slate-200 focus:border-turquoise focus:outline-none"
                  />
                  {voiceMode && (
                    <VoiceMicButton label={label} onConfirm={(n) => setDetails({ ...details, [key]: n })} />
                  )}
                </div>
              </label>
            ))}
          </div>
        </GlowCard>
      ))}

      <button
        type="submit"
        disabled={saving}
        className="w-full rounded-md border border-turquoise bg-turquoise/10 py-3.5 text-base font-medium text-turquoise shadow-glow-sm active:bg-turquoise/20 disabled:opacity-50 sm:w-auto sm:px-8"
      >
        {saving ? 'Enregistrement…' : saved ? 'Enregistré ✓' : 'Enregistrer'}
      </button>

      <GlowCard title="Effectif Finale">
        <p className="mb-3 text-sm text-slate-400">
          عدد العمال الحاضرين اليوم بمرحلة Finale لكل تخصص — يظهر بمجموع Finale بشاشة "État des effectifs".
        </p>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
          {FINALE_SPECIALTIES.map((sp) => (
            <div key={sp} className="flex flex-col items-center gap-1.5 rounded-md border border-slate-800 bg-navy-900/40 py-3">
              <Stepper label={sp} value={effectif[sp] ?? 0} onChange={(v) => setEffectif({ ...effectif, [sp]: v })} max={999} />
              {voiceMode && <VoiceMicButton label={sp} onConfirm={(n) => setEffectif({ ...effectif, [sp]: n })} />}
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={submitEffectif}
          disabled={savingEffectif}
          className="mt-4 w-full rounded-md border border-turquoise bg-turquoise/10 py-3.5 text-base font-medium text-turquoise shadow-glow-sm active:bg-turquoise/20 disabled:opacity-50 sm:w-auto sm:px-8"
        >
          {savingEffectif ? 'Enregistrement…' : effectifSaved ? 'Enregistré ✓' : 'Enregistrer'}
        </button>
      </GlowCard>
    </form>
  )
}
