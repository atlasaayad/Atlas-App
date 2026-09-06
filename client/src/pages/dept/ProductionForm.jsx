import { useEffect, useRef, useState } from 'react'
import GlowCard from '../../components/GlowCard'
import NoModel from '../../components/NoModel'
import VoiceModeToggle from '../../components/VoiceModeToggle'
import VoiceMicButton from '../../components/VoiceMicButton'
import { useChainModel } from '../../hooks/useChainModel'
import { api } from '../../lib/api'
import { todayInFactoryTZ } from '../../lib/date'

export default function ProductionForm({ token, chainNumber }) {
  const { modelId, dashboard, loading, refresh } = useChainModel(chainNumber)
  const TODAY = todayInFactoryTZ()
  const [selectedDate, setSelectedDate] = useState(TODAY)
  const [dateError, setDateError] = useState('')
  const [hourlySlots, setHourlySlots] = useState([])
  const [hourlyLoading, setHourlyLoading] = useState(false)
  const [hourlyError, setHourlyError] = useState(false)
  const [retryTick, setRetryTick] = useState(0)
  const [totalEntree, setTotalEntree] = useState('')
  const [savingSlot, setSavingSlot] = useState(null)
  const [savedSlots, setSavedSlots] = useState({})
  const [slotErrors, setSlotErrors] = useState({})
  const [savingTotals, setSavingTotals] = useState(false)
  const [totalsSaved, setTotalsSaved] = useState(false)
  const [totalsError, setTotalsError] = useState(false)
  const [voiceMode, setVoiceMode] = useState(false)

  // "Total entré" always refers to today, regardless of which date is
  // selected above the hourly table — initialize it exactly once per model
  // (chain switch / initial load), never again on a later background
  // refresh, for the same reason as the hourly fix below: a background
  // refresh must never silently discard an unsaved edit elsewhere on screen.
  const initializedForRef = useRef(null)
  useEffect(() => {
    if (dashboard && initializedForRef.current !== modelId) {
      setTotalEntree(dashboard.bilan.totalEntree)
      initializedForRef.current = modelId
    }
  }, [dashboard, modelId])

  // Load the selected day's hourly slots — today's or any previous day's —
  // straight from production_history via the dedicated endpoint, so this
  // form always shows exactly what's really saved for that date.
  useEffect(() => {
    if (!modelId) return
    let cancelled = false
    setHourlyLoading(true)
    setHourlyError(false)
    api.production
      .getHourly(token, modelId, selectedDate)
      .then((r) => {
        if (cancelled) return
        setHourlySlots(r.hourly)
        setSavedSlots({})
        setSlotErrors({})
        setHourlyLoading(false)
      })
      .catch(() => {
        // Without this, a failed/timed-out request left `hourlyLoading` stuck
        // at true forever — the spinner never resolves and there's no way to
        // retry short of leaving and re-entering the page.
        if (cancelled) return
        setHourlyError(true)
        setHourlyLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [modelId, selectedDate, token, retryTick])

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
    setHourlySlots((prev) => prev.map((s) => (s.index === idx ? { ...s, qty: value } : s)))
    // The displayed value no longer matches what's saved — drop the
    // "Modifier ✓" confirmation until it's saved again.
    setSavedSlots((s) => ({ ...s, [idx]: false }))
    setSlotErrors((s) => ({ ...s, [idx]: false }))
  }

  async function saveSlot(idx) {
    const slot = hourlySlots.find((s) => s.index === idx)
    setSavingSlot(idx)
    setSlotErrors((s) => ({ ...s, [idx]: false }))
    try {
      await api.production.updateHourly(token, modelId, idx, Number(slot?.qty) || 0, selectedDate)
      setSavedSlots((s) => ({ ...s, [idx]: true }))
      refresh() // silent — no longer flips `loading`, see useChainModel; keeps today's live dashboard figures in sync
    } catch (err) {
      // The request itself is bounded (see REQUEST_TIMEOUT_MS in api.js), so
      // this always resolves within a few seconds either way — the user is
      // never left staring at a spinner with no explanation.
      setSlotErrors((s) => ({ ...s, [idx]: err.timedOut ? 'timeout' : true }))
    } finally {
      setSavingSlot(null)
    }
  }

  // Couleur/Variante: same hour, one input per color (root included) —
  // each saved as its own production_history row via targetModelId, so two
  // colors can both log a real qty for the very same hour instead of one
  // overwriting the other. Keyed by "slotIndex:colorModelId" throughout,
  // completely separate from the single-input state above (used only when
  // the model has no variants), so a normal model's behavior is untouched.
  function updateColorSlot(idx, colorModelId, value) {
    setHourlySlots((prev) =>
      prev.map((s) =>
        s.index === idx
          ? { ...s, byModel: s.byModel.map((c) => (c.modelId === colorModelId ? { ...c, qty: value } : c)) }
          : s
      )
    )
    const key = `${idx}:${colorModelId}`
    setSavedSlots((s) => ({ ...s, [key]: false }))
    setSlotErrors((s) => ({ ...s, [key]: false }))
  }

  async function saveColorSlot(idx, colorModelId) {
    const slot = hourlySlots.find((s) => s.index === idx)
    const color = slot?.byModel.find((c) => c.modelId === colorModelId)
    const key = `${idx}:${colorModelId}`
    setSavingSlot(key)
    setSlotErrors((s) => ({ ...s, [key]: false }))
    try {
      await api.production.updateHourly(token, modelId, idx, Number(color?.qty) || 0, selectedDate, colorModelId)
      setSavedSlots((s) => ({ ...s, [key]: true }))
      refresh()
    } catch (err) {
      setSlotErrors((s) => ({ ...s, [key]: err.timedOut ? 'timeout' : true }))
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
    } catch (err) {
      setTotalsError(err.timedOut ? 'timeout' : true)
    } finally {
      setSavingTotals(false)
    }
  }

  const isBackdated = selectedDate !== TODAY

  return (
    <div className="space-y-4">
      <VoiceModeToggle voiceMode={voiceMode} setVoiceMode={setVoiceMode} />

      <GlowCard title="Production par heure">
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
        <p className="mb-3 text-sm text-slate-400">أدخل عدد القطع المنتجة بكل ساعة، واضغط OK لحفظها.</p>
        {hourlyLoading ? (
          <div className="flex items-center justify-center gap-2 py-6 text-sm text-slate-500">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-turquoise/30 border-t-turquoise" />
            Chargement…
          </div>
        ) : hourlyError ? (
          <div className="flex flex-col items-center gap-2 py-6 text-center">
            <span className="text-sm text-status-bad">فشل تحميل بيانات الساعات — تحقق من الاتصال.</span>
            <button
              onClick={() => setRetryTick((t) => t + 1)}
              className="rounded border border-turquoise/50 px-4 py-2 text-sm font-medium text-turquoise active:bg-turquoise/10"
            >
              إعادة المحاولة
            </button>
          </div>
        ) : (
          <div className="space-y-2.5">
            {hourlySlots.map((slot) =>
              slot.byModel ? (
                <ColorSlotRow
                  key={slot.index}
                  slot={slot}
                  voiceMode={voiceMode}
                  savingSlot={savingSlot}
                  savedSlots={savedSlots}
                  slotErrors={slotErrors}
                  onChange={updateColorSlot}
                  onSave={saveColorSlot}
                />
              ) : (
                <div key={slot.index}>
                  <div className="flex items-center gap-2.5">
                    <span className="w-24 shrink-0 font-mono text-xs text-slate-400">{slot.label}</span>
                    <input
                      type="number"
                      inputMode="numeric"
                      value={slot.qty || ''}
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
              )
            )}
          </div>
        )}
      </GlowCard>

      <GlowCard title="Total entré">
        <p className="mb-3 text-sm text-slate-400">
          أدخل المجموع الكلي للقطع اللي دخلت السلسلة من بداية الموديل لحد الآن (مش بس اليوم) — عدّله كل ما دخلت كمية
          جديدة. (يبقى دائماً القيمة الحالية بغض النظر عن التاريخ المختار فوق.)
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
            className="flex h-11 shrink-0 items-center justify-center gap-1.5 rounded-md border border-turquoise bg-turquoise/10 px-6 text-sm font-medium text-turquoise shadow-glow-sm active:bg-turquoise/20 disabled:opacity-50"
          >
            {savingTotals ? (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-turquoise/30 border-t-turquoise" />
            ) : totalsSaved ? (
              'Enregistré ✓'
            ) : (
              'Enregistrer'
            )}
          </button>
        </form>
        {totalsError === 'timeout' && (
          <div className="mt-2 text-sm text-status-bad">
            انتهت مهلة الاتصال — الشبكة بطيئة جداً أو مقطوعة. تحقق من الاتصال وحاول مرة ثانية.
          </div>
        )}
        {totalsError === true && (
          <div className="mt-2 text-sm text-status-bad">فشل الحفظ — تحقق من الاتصال وحاول مرة ثانية.</div>
        )}
      </GlowCard>
    </div>
  )
}

// One hour, one input per color (root — label "Défaut" — plus every active
// variant) — lets Agent Production log a real, separate qty for each color
// at the very same hour (e.g. 5 pieces of color 800 + 10 of color 681 at
// the same hour), instead of one save overwriting the other.
function ColorSlotRow({ slot, voiceMode, savingSlot, savedSlots, slotErrors, onChange, onSave }) {
  return (
    <div className="rounded-md border border-slate-800 bg-navy-900/30 p-2.5">
      <div className="mb-2 font-mono text-xs text-slate-400">{slot.label}</div>
      <div className="space-y-2">
        {slot.byModel.map((color) => {
          const key = `${slot.index}:${color.modelId}`
          return (
            <div key={color.modelId}>
              <div className="flex items-center gap-2.5">
                <span className="w-20 shrink-0 truncate text-xs text-slate-500">{color.label || 'Défaut'}</span>
                <input
                  type="number"
                  inputMode="numeric"
                  value={color.qty || ''}
                  onChange={(e) => onChange(slot.index, color.modelId, e.target.value)}
                  className="h-11 w-full min-w-0 rounded border border-slate-700 bg-navy-900 px-3 text-base text-slate-200 focus:border-turquoise focus:outline-none"
                />
                {voiceMode && <VoiceMicButton label={color.label || 'Défaut'} onConfirm={(n) => onChange(slot.index, color.modelId, n)} />}
                <button
                  onClick={() => onSave(slot.index, color.modelId)}
                  disabled={savingSlot === key}
                  className={`flex h-11 shrink-0 items-center justify-center gap-1.5 rounded border px-4 text-sm font-medium disabled:opacity-50 ${
                    savedSlots[key]
                      ? 'border-turquoise bg-turquoise text-navy-950 active:bg-turquoise/80'
                      : 'border-turquoise/50 text-turquoise active:bg-turquoise/10'
                  }`}
                >
                  {savingSlot === key ? (
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-turquoise/30 border-t-turquoise" />
                  ) : savedSlots[key] ? (
                    'Modifier ✓'
                  ) : (
                    'OK'
                  )}
                </button>
              </div>
              {slotErrors[key] === 'timeout' && (
                <div className="mt-1 pr-[6.75rem] text-xs text-status-bad">
                  انتهت مهلة الاتصال — الشبكة بطيئة جداً أو مقطوعة. تحقق من الاتصال وحاول مرة ثانية.
                </div>
              )}
              {slotErrors[key] === true && (
                <div className="mt-1 pr-[6.75rem] text-xs text-status-bad">فشل الحفظ — تحقق من الاتصال وحاول مرة ثانية.</div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
