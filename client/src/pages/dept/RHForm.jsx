import { useEffect, useState } from 'react'
import GlowCard from '../../components/GlowCard'
import NoModel from '../../components/NoModel'
import Stepper from '../../components/Stepper'
import VoiceModeToggle from '../../components/VoiceModeToggle'
import VoiceMicButton from '../../components/VoiceMicButton'
import AuditReportCard from '../../components/AuditReportCard'
import { useChainModel } from '../../hooks/useChainModel'
import { api } from '../../lib/api'
import { SPECIALTIES } from '../../lib/constants'

export default function RHForm({ token, chainNumber }) {
  const { modelId, dashboard, loading, refresh } = useChainModel(chainNumber)
  const [attendance, setAttendance] = useState({})
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [voiceMode, setVoiceMode] = useState(false)

  useEffect(() => {
    if (dashboard) {
      setAttendance(Object.fromEntries(dashboard.effectifs.map((e) => [e.specialty, e.present])))
    }
  }, [dashboard])

  if (loading) return <div className="py-10 text-center text-slate-400">Chargement…</div>
  if (!modelId) return <NoModel chainNumber={chainNumber} />

  async function submit(e) {
    e.preventDefault()
    setSaving(true)
    try {
      await api.rh.updateAttendance(token, modelId, attendance)
      setSaved(true)
      refresh()
      setTimeout(() => setSaved(false), 2000)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <GlowCard title="Présence par spécialité">
        <p className="mb-4 text-sm text-slate-400">
          عدد العمال الحاضرين اليوم لكل تخصص. استخدم <span className="text-turquoise">+</span> و
          <span className="text-turquoise"> −</span> للتعديل. الرقم الصغير تحت كل تخصص هو العدد المطلوب (حسب Agent
          Méthode).
        </p>
        <VoiceModeToggle voiceMode={voiceMode} setVoiceMode={setVoiceMode} />
        <form onSubmit={submit}>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
            {SPECIALTIES.map((sp) => {
              const required = dashboard.effectifs.find((e) => e.specialty === sp)?.required ?? 0
              return (
                <div key={sp} className="flex flex-col items-center gap-1.5 rounded-md border border-slate-800 bg-navy-900/40 py-3">
                  <Stepper
                    label={`${sp} / ${required} مطلوب`}
                    value={attendance[sp] ?? 0}
                    onChange={(v) => setAttendance({ ...attendance, [sp]: v })}
                    max={999}
                  />
                  {voiceMode && (
                    <VoiceMicButton label={sp} onConfirm={(n) => setAttendance({ ...attendance, [sp]: n })} />
                  )}
                </div>
              )
            })}
          </div>
          <button
            type="submit"
            disabled={saving}
            className="mt-5 w-full rounded-md border border-turquoise bg-turquoise/10 py-3.5 text-base font-medium text-turquoise shadow-glow-sm active:bg-turquoise/20 disabled:opacity-50 sm:w-auto sm:px-6"
          >
            {saving ? 'Enregistrement…' : saved ? 'Enregistré ✓' : 'Enregistrer'}
          </button>
        </form>
      </GlowCard>

      <AuditReportCard token={token} />
    </div>
  )
}
