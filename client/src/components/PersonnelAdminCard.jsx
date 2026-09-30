import { useEffect, useState } from 'react'
import GlowCard from './GlowCard'
import { api } from '../lib/api'
import { useSaveStatus } from '../hooks/useSaveStatus'
import ErrorNote from './ErrorNote'
import { errorMessage } from '../lib/errors'
import { todayInFactoryTZ } from '../lib/date'

// Personnel administratif / Encadrement — a single company-wide headcount,
// entirely separate from production workers. Used identically by RH
// (primary) and Patron (backup): both write to the exact same
// personnel_admin_history row for a given date, so whichever saves last is
// authoritative — no reconciliation logic needed, same as chain attendance.
// `updateFn` is the department-specific API call (api.rh.updatePersonnelAdmin
// or api.patron.updatePersonnelAdmin); everything else here is shared.
export default function PersonnelAdminCard({ token, updateFn }) {
  const TODAY = todayInFactoryTZ()
  const [selectedDate, setSelectedDate] = useState(TODAY)
  const [dateError, setDateError] = useState('')
  const [total, setTotal] = useState(0)
  const [cumulativeTotal, setCumulativeTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)
  const [retryTick, setRetryTick] = useState(0)
  const save = useSaveStatus()

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setLoadError(null)
    api
      .getPersonnelAdmin(token, selectedDate)
      .then((r) => {
        if (cancelled) return
        setTotal(r.total)
        setCumulativeTotal(r.cumulativeTotal)
        setLoading(false)
      })
      .catch((err) => {
        if (cancelled) return
        setLoadError(err)
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [token, selectedDate, retryTick])

  function handleDateChange(value) {
    if (value > TODAY) {
      setDateError('ما تقدر تدخل بيانات لتاريخ مستقبلي.')
      return
    }
    setDateError('')
    setSelectedDate(value)
  }

  async function submit(e) {
    e.preventDefault()
    const { ok } = await save.run(() => updateFn(token, selectedDate, Number(total) || 0))
    if (ok) {
      // Only the cumulative figure is refreshed; a failure here is not a
      // failed save, so it doesn't turn the confirmation into an error.
      api
        .getPersonnelAdmin(token, selectedDate)
        .then((r) => setCumulativeTotal(r.cumulativeTotal))
        .catch(() => {})
    }
  }

  const isBackdated = selectedDate !== TODAY

  return (
    <GlowCard title="Personnel administratif / Encadrement">
      <p className="mb-3 text-sm text-slate-400">
        موظفون إداريون/إشرافيون — منفصلون تماماً عن عمال الإنتاج. رقم إجمالي واحد فقط، بدون تفصيل تخصصات.
      </p>
      <label className="mb-3 block max-w-xs">
        <span className="mb-1 block text-xs uppercase tracking-wide text-slate-500">التاريخ</span>
        <input
          type="date"
          value={selectedDate}
          max={TODAY}
          onChange={(e) => handleDateChange(e.target.value)}
          className="h-11 w-full rounded border border-slate-700 bg-navy-900 px-3 text-base text-slate-200 focus:border-turquoise focus:outline-none"
        />
      </label>
      {dateError && <div className="mb-3 text-sm text-status-bad">{dateError}</div>}
      {!dateError && isBackdated && (
        <div className="mb-3 rounded-md border border-amber bg-amber-soft px-3 py-2 text-sm text-amber">
          ⚠️ تعدّل بيانات يوم سابق ({selectedDate}) — أي حفظ هنا يُسجَّل بأثر رجعي بسجل التعديلات.
        </div>
      )}
      {loading ? (
        <div className="py-4 text-center text-sm text-slate-500">Chargement…</div>
      ) : loadError ? (
        <div className="flex flex-col items-center gap-2 py-4 text-center">
          <ErrorNote message={errorMessage(loadError, { load: true })} />
          <button
            type="button"
            onClick={() => setRetryTick((t) => t + 1)}
            className="rounded border border-turquoise/50 px-4 py-2 text-sm font-medium text-turquoise active:bg-turquoise/10"
          >
            إعادة المحاولة
          </button>
        </div>
      ) : (
        <form onSubmit={submit} className="flex flex-wrap items-end gap-3">
          <label className="block">
            <span className="mb-1 block text-xs uppercase tracking-wide text-slate-500">Total ({selectedDate})</span>
            <input
              type="number"
              inputMode="numeric"
              min="0"
              value={total || ''}
              onChange={(e) => setTotal(e.target.value)}
              className="h-11 w-32 rounded border border-slate-700 bg-navy-900 px-3 text-base text-slate-200 focus:border-turquoise focus:outline-none"
            />
          </label>
          <button
            type="submit"
            disabled={save.saving}
            className="flex h-11 shrink-0 items-center justify-center gap-1.5 rounded-md border border-turquoise bg-turquoise/10 px-6 text-sm font-medium text-turquoise shadow-glow-sm active:bg-turquoise/20 disabled:opacity-50"
          >
            {save.saving ? '...' : save.saved ? 'Enregistré ✓' : 'Enregistrer'}
          </button>
          <ErrorNote message={save.error} className="basis-full" />
          <div className="ml-auto text-right">
            <div className="text-[10px] uppercase tracking-wide text-slate-500">تراكمي (كل الأيام المسجَّلة)</div>
            <div className="font-display text-lg font-semibold text-slate-300">{cumulativeTotal}</div>
          </div>
        </form>
      )}
    </GlowCard>
  )
}
