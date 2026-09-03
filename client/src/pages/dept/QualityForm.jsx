import { useEffect, useState } from 'react'
import GlowCard from '../../components/GlowCard'
import NoModel from '../../components/NoModel'
import Stepper from '../../components/Stepper'
import VoiceModeToggle from '../../components/VoiceModeToggle'
import VoiceMicButton from '../../components/VoiceMicButton'
import { useChainModel } from '../../hooks/useChainModel'
import { api } from '../../lib/api'
import { todayInFactoryTZ } from '../../lib/date'
import { computeQualityPct } from '../../lib/calc'

export default function QualityForm({ token, chainNumber }) {
  const { modelId, dashboard, loading, refresh } = useChainModel(chainNumber)
  const TODAY = todayInFactoryTZ()
  const [selectedDate, setSelectedDate] = useState(TODAY)
  const [dateError, setDateError] = useState('')
  const [hourlySlots, setHourlySlots] = useState([])
  const [hourlyLoading, setHourlyLoading] = useState(false)
  const [savingSlot, setSavingSlot] = useState(null)
  const [savedSlots, setSavedSlots] = useState({})
  const [slotErrors, setSlotErrors] = useState({})
  const [reprises, setReprises] = useState(0)
  const [savingReprises, setSavingReprises] = useState(false)
  const [reprisesSaved, setReprisesSaved] = useState(false)
  const [reprisesError, setReprisesError] = useState(false)
  const [voiceMode, setVoiceMode] = useState(false)

  useEffect(() => {
    if (dashboard) setReprises(dashboard.quality.reprises || 0)
  }, [dashboard])

  // Load the selected day's "Pièces retouche" — today's or any previous
  // day's — joined against Agent Production's real qty for that same
  // chain/date/slot, so each row shows its own computed Qualité%.
  useEffect(() => {
    if (!modelId) return
    let cancelled = false
    setHourlyLoading(true)
    api.quality.getHourly(token, modelId, selectedDate).then((r) => {
      if (cancelled) return
      setHourlySlots(r.hourly)
      setSavedSlots({})
      setSlotErrors({})
      setHourlyLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [modelId, selectedDate, token])

  if (loading) return <div className="py-10 text-center text-slate-400">Chargement…</div>
  if (!modelId) return <NoModel chainNumber={chainNumber} />

  const minDate = dashboard.identity.debut || null

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

  function updateSlot(idx, value) {
    setHourlySlots((prev) => prev.map((s) => (s.index === idx ? { ...s, pieceRetouche: value } : s)))
    setSavedSlots((s) => ({ ...s, [idx]: false }))
    setSlotErrors((s) => ({ ...s, [idx]: false }))
  }

  async function saveSlot(idx) {
    const slot = hourlySlots.find((s) => s.index === idx)
    setSavingSlot(idx)
    setSlotErrors((s) => ({ ...s, [idx]: false }))
    try {
      await api.quality.updateHourly(token, modelId, idx, Number(slot?.pieceRetouche) || 0, selectedDate)
      setSavedSlots((s) => ({ ...s, [idx]: true }))
      refresh()
    } catch (err) {
      setSlotErrors((s) => ({ ...s, [idx]: err.timedOut ? 'timeout' : true }))
    } finally {
      setSavingSlot(null)
    }
  }

  async function saveReprises(e) {
    e.preventDefault()
    setSavingReprises(true)
    setReprisesError(false)
    try {
      await api.quality.updateReprises(token, modelId, Number(reprises) || 0)
      setReprisesSaved(true)
      refresh()
      setTimeout(() => setReprisesSaved(false), 2000)
    } catch (err) {
      setReprisesError(err.timedOut ? 'timeout' : true)
    } finally {
      setSavingReprises(false)
    }
  }

  const isBackdated = selectedDate !== TODAY
  const q = dashboard.quality

  return (
    <div className="space-y-4">
      <VoiceModeToggle voiceMode={voiceMode} setVoiceMode={setVoiceMode} />

      <GlowCard title="Qualité — résumé">
        <div className="grid grid-cols-2 gap-4 text-center sm:grid-cols-4">
          <SummaryStat label="Qualité% (aujourd'hui)" value={q.dailyPercentage === null ? null : `${q.dailyPercentage}%`} />
          <SummaryStat label="Qualité% (cumulé)" value={q.percentage === null ? null : `${q.percentage}%`} accent />
          <SummaryStat label="Pièces retouche (aujourd'hui)" value={q.pieceRetoucheToday} />
          <SummaryStat label="Pièces retouche (cumulé)" value={q.pieceRetoucheCumulative} />
        </div>
        <p className="mt-3 text-xs text-slate-500">
          Qualité% = (إنتاج الساعة − Pièces retouche لتلك الساعة) ÷ إنتاج الساعة × 100 — يُحسب تلقائياً من بيانات
          Agent Production الحقيقية، ولا يُدخل يدوياً.
        </p>
      </GlowCard>

      <GlowCard title="Pièces retouche par heure">
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
            ⚠️ تعدّل بيانات يوم سابق ({selectedDate}) — أي حفظ هنا يُسجَّل بأثر رجعي بسجل التعديلات.
          </div>
        )}
        <p className="mb-3 text-sm text-slate-400">
          أدخل عدد القطع اللي تحتاج تصليح بكل ساعة، واضغط OK لحفظها. Qualité% لكل ساعة يُحسب تلقائياً من إنتاج تلك
          الساعة (Agent Production).
        </p>
        {hourlyLoading ? (
          <div className="flex items-center justify-center gap-2 py-6 text-sm text-slate-500">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-turquoise/30 border-t-turquoise" />
            Chargement…
          </div>
        ) : (
          <div className="space-y-2.5">
            {hourlySlots.map((slot) => (
              <div key={slot.index}>
                <div className="flex items-center gap-2.5">
                  <span className="w-24 shrink-0 font-mono text-xs text-slate-400">{slot.label}</span>
                  <div className="w-16 shrink-0 text-center font-mono text-xs text-slate-500" title="إنتاج الساعة (Agent Production)">
                    {slot.qty}
                  </div>
                  <input
                    type="number"
                    inputMode="numeric"
                    value={slot.pieceRetouche || ''}
                    onChange={(e) => updateSlot(slot.index, e.target.value)}
                    className="h-11 w-full min-w-0 rounded border border-slate-700 bg-navy-900 px-3 text-base text-slate-200 focus:border-turquoise focus:outline-none"
                  />
                  {voiceMode && <VoiceMicButton label={slot.label} onConfirm={(n) => updateSlot(slot.index, n)} />}
                  <button
                    onClick={() => saveSlot(slot.index)}
                    disabled={savingSlot === slot.index}
                    className={`flex h-11 shrink-0 items-center justify-center gap-1.5 rounded border px-4 text-sm font-medium disabled:opacity-50 ${
                      savedSlots[slot.index]
                        ? 'border-turquoise bg-turquoise text-navy-950 active:bg-turquoise/80'
                        : 'border-turquoise/50 text-turquoise active:bg-turquoise/10'
                    }`}
                  >
                    {savingSlot === slot.index ? (
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-turquoise/30 border-t-turquoise" />
                    ) : savedSlots[slot.index] ? (
                      'Modifier ✓'
                    ) : (
                      'OK'
                    )}
                  </button>
                  <div className="w-14 shrink-0 text-center font-mono text-xs text-turquoise">
                    {(() => {
                      // Computed live from the row's current values — not the
                      // server's last-fetched qualityPct — so it updates
                      // instantly on every keystroke and right after a save,
                      // never showing a stale percentage from before the edit.
                      const pct = computeQualityPct(slot.qty, slot.pieceRetouche)
                      return pct === null ? '—' : `${pct}%`
                    })()}
                  </div>
                </div>
                {slotErrors[slot.index] === 'timeout' && (
                  <div className="mt-1 pr-[6.75rem] text-xs text-status-bad">
                    انتهت مهلة الاتصال — الشبكة بطيئة جداً أو مقطوعة. تحقق من الاتصال وحاول مرة ثانية.
                  </div>
                )}
                {slotErrors[slot.index] === true && (
                  <div className="mt-1 pr-[6.75rem] text-xs text-status-bad">
                    فشل الحفظ — تحقق من الاتصال وحاول مرة ثانية.
                  </div>
                )}
              </div>
            ))}
            <div className="flex items-center gap-2.5 pt-1 text-[10px] uppercase tracking-wide text-slate-600">
              <span className="w-24 shrink-0">الساعة</span>
              <span className="w-16 shrink-0 text-center">إنتاج</span>
              <span className="flex-1">Pièces retouche</span>
              <span className="w-14 shrink-0 text-center">Qualité%</span>
            </div>
          </div>
        )}
      </GlowCard>

      <GlowCard title="Reprises">
        <p className="mb-3 text-sm text-slate-400">
          عدد القطع اللي تحتاج إعادة شغل بسبب عيب — رقم تراكمي منفصل عن Pièces retouche فوق، لا يؤثر على Qualité%.
        </p>
        <form onSubmit={saveReprises} className="flex items-center gap-3">
          <Stepper value={reprises} onChange={setReprises} max={999} />
          {voiceMode && <VoiceMicButton label="Reprises" onConfirm={setReprises} />}
          <button
            type="submit"
            disabled={savingReprises}
            className="flex h-11 shrink-0 items-center justify-center gap-1.5 rounded-md border border-turquoise bg-turquoise/10 px-6 text-sm font-medium text-turquoise shadow-glow-sm active:bg-turquoise/20 disabled:opacity-50"
          >
            {savingReprises ? (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-turquoise/30 border-t-turquoise" />
            ) : reprisesSaved ? (
              'Enregistré ✓'
            ) : (
              'Enregistrer'
            )}
          </button>
        </form>
        {reprisesError === 'timeout' && (
          <div className="mt-2 text-sm text-status-bad">
            انتهت مهلة الاتصال — الشبكة بطيئة جداً أو مقطوعة. تحقق من الاتصال وحاول مرة ثانية.
          </div>
        )}
        {reprisesError === true && (
          <div className="mt-2 text-sm text-status-bad">فشل الحفظ — تحقق من الاتصال وحاول مرة ثانية.</div>
        )}
      </GlowCard>
    </div>
  )
}

function SummaryStat({ label, value, accent }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`mt-1 font-display font-semibold ${value === null ? 'text-sm text-slate-500' : `text-lg ${accent ? 'text-turquoise glow-number' : 'text-slate-200'}`}`}>
        {value === null ? 'غير محسوب' : value}
      </div>
    </div>
  )
}
