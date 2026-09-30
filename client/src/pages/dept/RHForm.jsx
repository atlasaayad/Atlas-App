import { useEffect, useState } from 'react'
import GlowCard from '../../components/GlowCard'
import NoModel from '../../components/NoModel'
import Stepper from '../../components/Stepper'
import VoiceModeToggle from '../../components/VoiceModeToggle'
import VoiceMicButton from '../../components/VoiceMicButton'
import AuditReportCard from '../../components/AuditReportCard'
import PersonnelAdminCard from '../../components/PersonnelAdminCard'
import { useChainModel } from '../../hooks/useChainModel'
import { api } from '../../lib/api'
import { useSaveStatus } from '../../hooks/useSaveStatus'
import ErrorNote from '../../components/ErrorNote'
import { errorMessage } from '../../lib/errors'
import { todayInFactoryTZ } from '../../lib/date'

export default function RHForm({ token, chainNumber }) {
  const { modelId, dashboard, loading, loadError, refresh } = useChainModel(chainNumber)
  const TODAY = todayInFactoryTZ()
  const [selectedDate, setSelectedDate] = useState(TODAY)
  const [dateError, setDateError] = useState('')
  const [attendance, setAttendance] = useState({})
  const [attendanceLoading, setAttendanceLoading] = useState(false)
  const [attendanceError, setAttendanceError] = useState(false)
  const [retryTick, setRetryTick] = useState(0)
  const save = useSaveStatus()
  const [voiceMode, setVoiceMode] = useState(false)

  const minDate = dashboard?.identity.debut || null

  // Load the selected day's Présence — today's or any previous day's —
  // straight from rh_attendance_history (same pattern as Agent Production's
  // and Quality's hourly entry), so this screen always shows exactly what's
  // really saved for that date.
  useEffect(() => {
    if (!modelId) return
    let cancelled = false
    setAttendanceLoading(true)
    setAttendanceError(false)
    api.rh
      .getAttendance(token, modelId, selectedDate)
      .then((r) => {
        if (cancelled) return
        setAttendance(r.attendance)
        setAttendanceLoading(false)
      })
      .catch((err) => {
        if (cancelled) return
        setAttendanceError(err)
        setAttendanceLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [modelId, selectedDate, token, retryTick])

  function handleDateChange(value) {
    if (value > TODAY) {
      setDateError('ما تقدر تدخل بيانات لتاريخ مستقبلي.')
      return
    }
    if (minDate && value < minDate) {
      setDateError(`ما تقدر تدخل بيانات قبل تاريخ بداية الموديل (${minDate}).`)
      return
    }
    setDateError('')
    setSelectedDate(value)
  }

  async function submit(e) {
    e.preventDefault()
    const { ok } = await save.run(() => api.rh.updateAttendance(token, modelId, attendance, selectedDate))
    if (ok) refresh()
  }

  const isBackdated = selectedDate !== TODAY

  // Personnel administratif is company-wide, not tied to any chain/model, so
  // it renders regardless of whether the currently-picked chain has an
  // active model — unlike the per-chain attendance section below it.
  if (loading) return <div className="py-10 text-center text-slate-400">Chargement…</div>
  if (!modelId) {
    return (
      <div className="space-y-4">
        <PersonnelAdminCard token={token} updateFn={api.rh.updatePersonnelAdmin} />
        <NoModel chainNumber={chainNumber} loadError={loadError} onRetry={refresh} />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <PersonnelAdminCard token={token} updateFn={api.rh.updatePersonnelAdmin} />

      <GlowCard title="Présence par spécialité">
        <p className="mb-4 text-sm text-slate-400">
          عدد العمال الحاضرين لكل تخصص باليوم المحدد. استخدم <span className="text-turquoise">+</span> و
          <span className="text-turquoise"> −</span> للتعديل. الرقم الصغير تحت كل تخصص هو العدد المطلوب (حسب Agent
          Méthode).
        </p>

        <label className="mb-3 block max-w-xs">
          <span className="mb-1 block text-xs uppercase tracking-wide text-slate-500">التاريخ</span>
          <input
            type="date"
            value={selectedDate}
            min={minDate || undefined}
            max={TODAY}
            onChange={(e) => handleDateChange(e.target.value)}
            className="h-11 w-full rounded border border-slate-700 bg-navy-900 px-3 text-base text-slate-200 focus:border-turquoise focus:outline-none"
          />
        </label>
        {dateError && <div className="mb-3 text-sm text-status-bad">{dateError}</div>}
        {!dateError && isBackdated && (
          <div className="mb-3 rounded-md border border-amber bg-amber-soft px-3 py-2 text-sm text-amber">
            ⚠️ تعدّل بيانات يوم سابق ({selectedDate}) — أي حفظ هنا يُسجَّل بأثر رجعي بسجل التعديلات، ولا يغيّر حضور
            اليوم الحقيقي.
          </div>
        )}

        <VoiceModeToggle voiceMode={voiceMode} setVoiceMode={setVoiceMode} />
        <form onSubmit={submit}>
          {attendanceLoading ? (
            <div className="flex items-center justify-center gap-2 py-6 text-sm text-slate-500">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-turquoise/30 border-t-turquoise" />
              Chargement…
            </div>
          ) : attendanceError ? (
            <div className="flex flex-col items-center gap-2 py-6 text-center">
              <span className="whitespace-pre-line text-sm text-status-bad">{errorMessage(attendanceError, { load: true })}</span>
              <button
                type="button"
                onClick={() => setRetryTick((t) => t + 1)}
                className="rounded border border-turquoise/50 px-4 py-2 text-sm font-medium text-turquoise active:bg-turquoise/10"
              >
                إعادة المحاولة
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
              {dashboard.effectifs.map(({ specialty: sp, required }) => {
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
          )}
          <button
            type="submit"
            disabled={save.saving || attendanceLoading || !!attendanceError}
            className="mt-5 w-full rounded-md border border-turquoise bg-turquoise/10 py-3.5 text-base font-medium text-turquoise shadow-glow-sm active:bg-turquoise/20 disabled:opacity-50 sm:w-auto sm:px-6"
          >
            {save.saving ? 'Enregistrement…' : save.saved ? 'Enregistré ✓' : 'Enregistrer'}
          </button>
          <ErrorNote message={save.error} className="mt-2" />
        </form>
      </GlowCard>

      <AuditReportCard token={token} />
    </div>
  )
}
