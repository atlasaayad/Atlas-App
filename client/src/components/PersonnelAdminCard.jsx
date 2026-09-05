import { useEffect, useState } from 'react'
import GlowCard from './GlowCard'
import { api } from '../lib/api'
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
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    api.getPersonnelAdmin(selectedDate).then((r) => {
      if (cancelled) return
      setTotal(r.total)
      setCumulativeTotal(r.cumulativeTotal)
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [selectedDate])

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
    setSaving(true)
    try {
      await updateFn(token, selectedDate, Number(total) || 0)
      setSaved(true)
      const r = await api.getPersonnelAdmin(selectedDate)
      setCumulativeTotal(r.cumulativeTotal)
      setTimeout(() => setSaved(false), 2000)
    } finally {
      setSaving(false)
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
            disabled={saving}
            className="flex h-11 shrink-0 items-center justify-center gap-1.5 rounded-md border border-turquoise bg-turquoise/10 px-6 text-sm font-medium text-turquoise shadow-glow-sm active:bg-turquoise/20 disabled:opacity-50"
          >
            {saving ? '...' : saved ? 'Enregistré ✓' : 'Enregistrer'}
          </button>
          <div className="ml-auto text-right">
            <div className="text-[10px] uppercase tracking-wide text-slate-500">تراكمي (كل الأيام المسجَّلة)</div>
            <div className="font-display text-lg font-semibold text-slate-300">{cumulativeTotal}</div>
          </div>
        </form>
      )}
    </GlowCard>
  )
}
