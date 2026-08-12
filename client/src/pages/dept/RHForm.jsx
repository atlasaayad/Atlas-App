import { useEffect, useState } from 'react'
import GlowCard from '../../components/GlowCard'
import NoModel from '../../components/NoModel'
import { useChainModel } from '../../hooks/useChainModel'
import { api } from '../../lib/api'
import { SPECIALTIES } from '../../lib/constants'

export default function RHForm({ token, chainNumber }) {
  const { modelId, dashboard, loading, refresh } = useChainModel(chainNumber)
  const [attendance, setAttendance] = useState({})
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

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
    <GlowCard title="Présence par spécialité">
      <form onSubmit={submit}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {SPECIALTIES.map((sp) => {
            const required = dashboard.effectifs.find((e) => e.specialty === sp)?.required ?? 0
            return (
              <label key={sp} className="block">
                <span className="mb-1 block text-center font-mono text-xs text-slate-500">
                  {sp} <span className="text-slate-600">/ {required}</span>
                </span>
                <input
                  type="number"
                  min="0"
                  value={attendance[sp] ?? 0}
                  onChange={(e) => setAttendance({ ...attendance, [sp]: e.target.value })}
                  className="w-full rounded border border-slate-700 bg-navy-900 px-2 py-1.5 text-center text-sm text-slate-200 focus:border-turquoise focus:outline-none"
                />
              </label>
            )
          })}
        </div>
        <button
          type="submit"
          disabled={saving}
          className="mt-4 rounded-md border border-turquoise bg-turquoise/10 px-4 py-2 font-medium text-turquoise shadow-glow-sm hover:bg-turquoise/20 disabled:opacity-50"
        >
          {saving ? 'Enregistrement…' : saved ? 'Enregistré ✓' : 'Enregistrer'}
        </button>
      </form>
    </GlowCard>
  )
}
