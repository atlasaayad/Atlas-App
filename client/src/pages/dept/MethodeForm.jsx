import { useEffect, useMemo, useState } from 'react'
import GlowCard from '../../components/GlowCard'
import Stepper from '../../components/Stepper'
import VoiceModeToggle from '../../components/VoiceModeToggle'
import VoiceMicButton from '../../components/VoiceMicButton'
import DevisCard from '../../components/DevisCard'
import { api } from '../../lib/api'
import { MACHINES, DELAY_REASONS } from '../../lib/constants'
import { computeVTMinutes, computeDT, computeObjectifJour, computeLaunchTimerState, formatDuration, hoursToHHMM, hhmmToHours } from '../../lib/calc'
import { todayInFactoryTZ } from '../../lib/date'

// Quick-pick suggestions for common operation names — still a free-text
// field (garment operations vary too much to force a fixed list), but this
// means most entries are a couple of taps instead of typing.
const OPERATION_SUGGESTIONS = [
  'Coulisser col',
  'Rep col',
  'Surp col',
  'Montage manche',
  'Assemblage côtés',
  'Ourlet bas',
  'Repassage',
  'Contrôle final',
  'Piquage poche',
  'Fermeture éclair',
  'Boutonnière',
  'Surjet',
]

// Chain overlap: a chain's Entré reaching its target while it's still
// mid-process/exiting, and a new model starting to be fed into the SAME
// chain — ordinary, expected factory operation (see README "Chain overlap
// — a new model without closing the old one"), not an edge case to hide
// behind a confirmation step. A chain can therefore have more than one open
// model (see openModels.js server-side) — `openModels` (oldest first) is
// what `/chains` now returns per chain instead of a single `model`.
// `selectedModelId` is which one Agent Méthode is currently viewing/
// editing; it's never displaced by a background refresh (only by an
// explicit pick or by the chain actually changing), matching the same
// "never discard what the user is doing" rule as everything else here.
export default function MethodeForm({ token, chainNumber }) {
  const [loading, setLoading] = useState(true)
  const [openModels, setOpenModels] = useState([])
  const [selectedModelId, setSelectedModelId] = useState(null)
  const [model, setModel] = useState(null)
  const [dashboard, setDashboard] = useState(null)
  const [showCreateForm, setShowCreateForm] = useState(false)

  // Silent re-fetch (no `loading` flip) — used after every save so a tab
  // doesn't unmount/remount and lose its own state (which tab is open, an
  // in-progress form, the live launch-timer countdown's interval) every
  // time something is saved. Only the initial load / chain switch below
  // shows the "Chargement…" full-screen state. `preferredModelId` lets a
  // caller (picking a pill, or a just-created model) steer which model
  // becomes selected once the fresh list comes back.
  async function refresh(preferredModelId) {
    const chains = await api.getChains()
    const info = chains.find((c) => c.chainNumber === chainNumber)
    const models = info?.models || (info?.model ? [info.model] : [])
    setOpenModels(models)

    const isOpen = (id) => id && models.some((m) => m.id === id)
    const targetId = isOpen(preferredModelId) ? preferredModelId : isOpen(selectedModelId) ? selectedModelId : models[0]?.id || null

    if (targetId) {
      // Dashboard fetched alongside the model so the Présence tab can show
      // today's actual headcount (rh_attendance) next to the required
      // headcount (effectif_requis) — getModel() alone only has the latter.
      const [m, dash] = await Promise.all([api.getModel(targetId), api.getDashboard(targetId)])
      setModel(m)
      setDashboard(dash)
      setSelectedModelId(targetId)
      setShowCreateForm(false)
    } else {
      setModel(null)
      setDashboard(null)
      setSelectedModelId(null)
    }
  }

  useEffect(() => {
    setLoading(true)
    setSelectedModelId(null)
    setShowCreateForm(false)
    refresh().finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chainNumber])

  if (loading) return <div className="py-10 text-center text-slate-400">Chargement…</div>

  // Nothing open on this chain yet, or explicitly starting a new one —
  // the overlap bar (if there's already something open) stays visible above
  // the create form, so switching back to an existing model is one tap away.
  if (!model || showCreateForm) {
    return (
      <div className="space-y-4">
        {openModels.length > 0 && (
          <ModelOverlapBar
            openModels={openModels}
            selectedModelId={showCreateForm ? null : selectedModelId}
            onSelect={(id) => refresh(id)}
            onAddNew={() => setShowCreateForm(true)}
          />
        )}
        <CreateModelForm
          token={token}
          chainNumber={chainNumber}
          onCreated={(newId) => refresh(newId)}
          onCancel={openModels.length > 0 ? () => refresh() : null}
        />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <ModelOverlapBar openModels={openModels} selectedModelId={selectedModelId} onSelect={(id) => refresh(id)} onAddNew={() => setShowCreateForm(true)} />
      <EditModel token={token} model={model} dashboard={dashboard} onSaved={() => refresh()} />
    </div>
  )
}

// Pills to switch between this chain's open models (only rendered when
// there's more than one) plus an "add a new one in parallel" action that's
// ALWAYS available — even with just one open model — since that's exactly
// how a second one gets started: not by closing the first (there is no such
// action anywhere), just by creating a new model on the same chain.
function ModelOverlapBar({ openModels, selectedModelId, onSelect, onAddNew }) {
  if (openModels.length === 0) return null
  return (
    <div className="flex flex-wrap items-center gap-2">
      {openModels.length > 1 &&
        openModels.map((m) => (
          <button
            key={m.id}
            onClick={() => onSelect(m.id)}
            className={`whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-medium ${
              selectedModelId === m.id ? 'border-turquoise bg-turquoise/10 text-turquoise' : 'border-slate-700 text-slate-400'
            }`}
          >
            {m.client} ({m.dessin})
          </button>
        ))}
      <button
        onClick={onAddNew}
        className="whitespace-nowrap rounded-full border border-dashed border-turquoise/50 px-3 py-1.5 text-xs font-medium text-turquoise active:bg-turquoise/10"
      >
        ➕ نموذج جديد بالتوازي
      </button>
      {openModels.length > 1 && (
        <span className="text-xs text-slate-500">
          {openModels.length} موديلات نشطة بهذه السلسلة (تداخل — عادي وقت انتهاء موديل وبدء آخر)
        </span>
      )}
    </div>
  )
}

function CreateModelForm({ token, chainNumber, onCreated, onCancel }) {
  const [form, setForm] = useState({ client: '', qteTotale: '', debut: '', finPrevue: '', dessin: '', commande: '' })
  const [saving, setSaving] = useState(false)
  const [voiceMode, setVoiceMode] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setSaving(true)
    try {
      const res = await api.methode.createModel(token, { ...form, chainNumber })
      onCreated(res.id)
    } finally {
      setSaving(false)
    }
  }

  return (
    <GlowCard>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="font-display text-base font-semibold text-slate-100">
          Nouveau modèle — Chaîne {chainNumber}
        </div>
        {onCancel && (
          <button onClick={onCancel} className="text-sm text-slate-400 active:text-slate-200">
            ✕ إلغاء
          </button>
        )}
      </div>
      {onCancel && (
        <p className="mb-3 text-xs text-slate-500">
          هذا يضيف موديل جديد لنفس السلسلة، بلا أي تأثير على الموديل (أو الموديلات) الموجودة أصلاً — كلها تبقى تشتغل
          بشكل مستقل تماماً، بغامتها الخاصة.
        </p>
      )}
      <VoiceModeToggle voiceMode={voiceMode} setVoiceMode={setVoiceMode} />
      <form onSubmit={submit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <TextField label="Client" value={form.client} onChange={(v) => setForm({ ...form, client: v })} required />
        <TextField
          label="Dessin"
          value={form.dessin}
          onChange={(v) => setForm({ ...form, dessin: v })}
          hint="رقم أو مرجع تصميم الموديل، مثال: DSN-2451"
        />
        <TextField
          label="Qté totale"
          type="number"
          value={form.qteTotale}
          onChange={(v) => setForm({ ...form, qteTotale: v })}
          hint="إجمالي كمية الطلبية الكاملة من العميل"
          voiceMode={voiceMode}
        />
        <TextField
          label="Commande"
          type="number"
          value={form.commande}
          onChange={(v) => setForm({ ...form, commande: v })}
          hint="الكمية المؤكدة بأمر الشغل الحالي"
          voiceMode={voiceMode}
        />
        <TextField label="Début" type="date" value={form.debut} onChange={(v) => setForm({ ...form, debut: v })} />
        <TextField label="Fin prévue" type="date" value={form.finPrevue} onChange={(v) => setForm({ ...form, finPrevue: v })} />
        <button
          type="submit"
          disabled={saving}
          className="col-span-full mt-2 rounded-md border border-turquoise bg-turquoise/10 py-3.5 text-base font-medium text-turquoise shadow-glow-sm active:bg-turquoise/20 disabled:opacity-50"
        >
          {saving ? 'Création…' : 'Créer le modèle'}
        </button>
      </form>
    </GlowCard>
  )
}

// Effectif (fixed target headcount) and Présence (today's actual attendance)
// otherwise look near-identical — same 13-row stepper layout — and a mix-up
// between them corrupts ND/DT/Rendement for the whole chain. Each gets its
// own icon + accent color (🎯 violet "target" vs 📅 sky "daily"), carried
// through the tab button, its card's colored badge, and (Présence only) the
// mismatch warning below — three reinforcing cues instead of reading text.
const TABS = [
  ['identite', 'Identité', null],
  ['gamme', 'Gamme de montage', null],
  ['planning', '📊 Planning', null],
  ['effectif', '🎯 Effectif', 'target'],
  ['presence', '📅 Présence', 'daily'],
  ['lancement', 'Temps de lancement', null],
  ['variantes', 'Couleurs / Variantes', null],
]

const TAB_ACCENT_CLASSES = {
  target: 'border-target bg-target/10 text-target',
  daily: 'border-daily bg-daily/10 text-daily',
  default: 'border-turquoise bg-turquoise/10 text-turquoise',
}

function EditModel({ token, model, dashboard, onSaved }) {
  const [tab, setTab] = useState('identite')
  return (
    <div className="space-y-4">
      <div className="flex gap-2 overflow-x-auto">
        {TABS.map(([key, label, accent]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`whitespace-nowrap rounded-md border px-4 py-2.5 text-sm font-medium ${
              tab === key ? TAB_ACCENT_CLASSES[accent || 'default'] : 'border-slate-700 text-slate-400'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <GlowCard>
        <div className="flex flex-wrap gap-4 text-sm">
          <Metric label="VT" value={`${model.vt.toFixed(2)} min`} />
          <Metric label="DT (Objectif/heure)" value={Math.round(model.dt)} />
          <Metric label="ND (effectif)" value={model.nd} />
          <Metric label="Objectif/jour" value={Math.round(computeObjectifJour(model.dt)).toLocaleString('fr-FR')} />
        </div>
        <div className="mt-2 text-xs text-slate-500">
          VT وDT وObjectif/jour تُحسب تلقائياً من الگامة (تبويب "Gamme de montage") والإفكتيف (تبويب "Effectif") — ما
          تحتاج تدخلها يدوياً.
        </div>
        <DevisCard token={token} modelId={model.id} />
      </GlowCard>

      {tab === 'identite' && <IdentiteTab token={token} model={model} onSaved={onSaved} />}
      {tab === 'gamme' && <GammeTab token={token} model={model} onSaved={onSaved} />}
      {tab === 'planning' && <PlanningTab token={token} model={model} />}
      {tab === 'effectif' && <EffectifTab token={token} model={model} onSaved={onSaved} />}
      {tab === 'presence' && <PresenceTab token={token} model={model} dashboard={dashboard} onSaved={onSaved} />}
      {tab === 'lancement' && <LaunchTimerTab token={token} model={model} onSaved={onSaved} />}
      {tab === 'variantes' && <VariantesTab token={token} model={model} dashboard={dashboard} onSaved={onSaved} />}
    </div>
  )
}

function PresenceTab({ token, model, dashboard, onSaved }) {
  const TODAY = todayInFactoryTZ()
  const [selectedDate, setSelectedDate] = useState(TODAY)
  const [dateError, setDateError] = useState('')
  const [attendance, setAttendance] = useState({})
  const [attendanceLoading, setAttendanceLoading] = useState(false)
  const [attendanceError, setAttendanceError] = useState(false)
  const [retryTick, setRetryTick] = useState(0)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [voiceMode, setVoiceMode] = useState(false)

  const minDate = model.debut || null

  // Load the selected day's Présence — today's or any previous day's —
  // straight from rh_attendance_history, so this tab always shows exactly
  // what's really saved for that date (same pattern as Agent Production's
  // and Quality's hourly entry).
  useEffect(() => {
    let cancelled = false
    setAttendanceLoading(true)
    setAttendanceError(false)
    api.methode
      .getAttendance(token, model.id, selectedDate)
      .then((r) => {
        if (cancelled) return
        setAttendance(r.attendance)
        setAttendanceLoading(false)
      })
      .catch(() => {
        if (cancelled) return
        setAttendanceError(true)
        setAttendanceLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [token, model.id, selectedDate, retryTick])

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

  async function submit() {
    setSaving(true)
    try {
      await api.methode.updateAttendance(token, model.id, attendance, selectedDate)
      setSaved(true)
      onSaved()
      setTimeout(() => setSaved(false), 2000)
    } finally {
      setSaving(false)
    }
  }

  const isBackdated = selectedDate !== TODAY

  return (
    <GlowCard>
      <div className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-daily bg-daily/10 px-3 py-1 text-xs font-medium text-daily">
        📅 يتغيّر كل يوم — حضور اليوم اللي تختاره تحت
      </div>
      <p className="mb-3 text-sm text-slate-400">
        <b className="text-slate-300">Présence</b> — عدد العمال الحاضرين فعلياً لكل تخصص باليوم المحدد — يُستخدم
        لحساب Rendement (كفاءة الإنتاج) عن يوم اليوم تحديداً. Agent Méthode هو المسؤول الأساسي عن هذا الرقم الآن
        (بدل RH وحده سابقاً)؛ RH لسه يقدر يعدّله من شاشته كنسخة احتياطية — آخر تحديث ليوم اليوم من أي القسمين هو
        المُعتمد.
      </p>
      {dashboard && (
        <div className="mb-3 text-sm text-slate-400">
          Rendement اليوم:{' '}
          <span className="font-mono text-turquoise">
            {dashboard.rendement.daily.score === null ? 'غير محسوب' : `${dashboard.rendement.daily.score}%`}
          </span>
        </div>
      )}

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
          اليوم الحقيقي (Rendement اليوم فوق يبقى كما هو).
        </div>
      )}

      <VoiceModeToggle voiceMode={voiceMode} setVoiceMode={setVoiceMode} />
      {attendanceLoading ? (
        <div className="flex items-center justify-center gap-2 py-6 text-sm text-slate-500">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-turquoise/30 border-t-turquoise" />
          Chargement…
        </div>
      ) : attendanceError ? (
        <div className="flex flex-col items-center gap-2 py-6 text-center">
          <span className="text-sm text-status-bad">فشل تحميل بيانات الحضور — تحقق من الاتصال.</span>
          <button
            onClick={() => setRetryTick((t) => t + 1)}
            className="rounded border border-turquoise/50 px-4 py-2 text-sm font-medium text-turquoise active:bg-turquoise/10"
          >
            إعادة المحاولة
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
          {Object.keys(model.effectif || {}).map((sp) => {
            const required = model.effectif?.[sp] ?? 0
            const value = attendance[sp] ?? 0
            // Not an error (real over-staffing happens) — just a nudge for the
            // one scenario this tab exists to prevent: typing Effectif's
            // target number into Présence (or vice versa) without noticing.
            // Requires both a large ratio AND a large absolute gap so it never
            // fires over small, everyday numbers (e.g. 1 required vs 2 present).
            const suspicious = required > 0 && value > required * 2 && value - required >= 3
            return (
              <div key={sp} className="flex flex-col items-center gap-1.5 rounded-md border border-slate-800 bg-navy-900/40 py-3">
                <Stepper
                  label={`${sp} / ${required} مطلوب`}
                  value={value}
                  onChange={(v) => setAttendance({ ...attendance, [sp]: v })}
                  max={999}
                />
                {voiceMode && <VoiceMicButton label={sp} onConfirm={(n) => setAttendance({ ...attendance, [sp]: n })} />}
                {suspicious && (
                  <div className="px-1.5 text-center text-[10px] leading-tight text-amber">
                    ⚠️ أعلى من المطلوب ({required}) بكثير — تأكد إنك بتبويب Présence
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
      <div className="mt-4">
        <SaveButton onClick={submit} saving={saving || attendanceLoading || attendanceError} saved={saved} />
      </div>
    </GlowCard>
  )
}

function IdentiteTab({ token, model, onSaved }) {
  const [form, setForm] = useState({
    client: model.client || '',
    qteTotale: model.qte_totale || '',
    debut: model.debut || '',
    finPrevue: model.fin_prevue || '',
    dessin: model.dessin || '',
    commande: model.commande || '',
  })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [voiceMode, setVoiceMode] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setSaving(true)
    try {
      await api.methode.updateModel(token, model.id, form)
      setSaved(true)
      onSaved()
      setTimeout(() => setSaved(false), 2000)
    } finally {
      setSaving(false)
    }
  }

  return (
    <GlowCard>
      <ModelImageUploader token={token} model={model} onSaved={onSaved} />
      <VoiceModeToggle voiceMode={voiceMode} setVoiceMode={setVoiceMode} />
      <form onSubmit={submit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <TextField label="Client" value={form.client} onChange={(v) => setForm({ ...form, client: v })} required />
        <TextField
          label="Dessin"
          value={form.dessin}
          onChange={(v) => setForm({ ...form, dessin: v })}
          hint="رقم أو مرجع تصميم الموديل، مثال: DSN-2451"
        />
        <TextField
          label="Qté totale"
          type="number"
          value={form.qteTotale}
          onChange={(v) => setForm({ ...form, qteTotale: v })}
          hint="إجمالي كمية الطلبية الكاملة من العميل"
          voiceMode={voiceMode}
        />
        <TextField
          label="Commande"
          type="number"
          value={form.commande}
          onChange={(v) => setForm({ ...form, commande: v })}
          hint="الكمية المؤكدة بأمر الشغل الحالي"
          voiceMode={voiceMode}
        />
        <TextField label="Début" type="date" value={form.debut} onChange={(v) => setForm({ ...form, debut: v })} />
        <TextField label="Fin prévue" type="date" value={form.finPrevue} onChange={(v) => setForm({ ...form, finPrevue: v })} />
        <SaveButton type="submit" saving={saving} saved={saved} />
      </form>
    </GlowCard>
  )
}

// Optional — the identity card on Home stays exactly as before if this is
// never used (see fullDashboard()'s `identity.imageUrl`). Reads the picked
// file client-side (FileReader → data URI) rather than a multipart upload —
// simpler given the app's JSON-only API, and small enough at these size caps
// (5MB here, 6MB decoded server-side — the base64 envelope adds ~33%).
const MAX_IMAGE_BYTES = 5 * 1024 * 1024

function ModelImageUploader({ token, model, onSaved }) {
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState(null)

  function readFileAsDataUri(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result)
      reader.onerror = () => reject(reader.error)
      reader.readAsDataURL(file)
    })
  }

  async function handleFile(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setError(null)
    if (file.size > MAX_IMAGE_BYTES) {
      setError('الصورة كبيرة بزاف — الحد الأقصى 5MB.')
      return
    }
    setUploading(true)
    try {
      const dataUri = await readFileAsDataUri(file)
      await api.methode.uploadModelImage(token, model.id, dataUri)
      onSaved()
    } catch (err) {
      setError(
        err?.data?.error === 'storage_not_configured'
          ? 'تخزين الصور غير مفعّل حالياً على هاد السيرفر.'
          : 'فشل رفع الصورة — تحقق من الاتصال وإعادة المحاولة.'
      )
    } finally {
      setUploading(false)
    }
  }

  async function handleDelete() {
    setUploading(true)
    setError(null)
    try {
      await api.methode.deleteModelImage(token, model.id)
      onSaved()
    } catch {
      setError('فشل حذف الصورة.')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="mb-4 flex items-center gap-4 border-b border-slate-800 pb-4">
      {model.image_url ? (
        <img src={model.image_url} alt="" className="h-20 w-20 rounded-md border border-slate-700 object-cover" />
      ) : (
        <div className="flex h-20 w-20 items-center justify-center rounded-md border border-dashed border-slate-700 text-2xl text-slate-600">
          🖼️
        </div>
      )}
      <div className="flex flex-col gap-1.5">
        <label className="w-fit cursor-pointer rounded-md border border-turquoise/40 px-3 py-1.5 text-xs text-turquoise active:bg-turquoise/10">
          {uploading ? 'جاري الرفع…' : model.image_url ? '📷 تغيير الصورة' : '📷 إضافة صورة الموديل'}
          <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" disabled={uploading} onChange={handleFile} />
        </label>
        {model.image_url && (
          <button onClick={handleDelete} disabled={uploading} className="w-fit text-xs text-status-bad active:opacity-70 disabled:opacity-50">
            🗑 حذف الصورة
          </button>
        )}
        {error && <span className="text-xs text-status-bad">{error}</span>}
      </div>
    </div>
  )
}

// Couleur/Variante — a second (third, ...) color of the exact same model.
// A variant always uses the model's own gamme/VT/DT/effectif (see the
// "models" table comment server-side) — this tab only ever asks for the
// color's own name and its own Qté totale, never operations/time again.
// `dashboard.colors` is [root, ...variants] — colors.slice(1) is the
// existing variant list, each with its own live totalSortie already
// computed by fullDashboard().
function VariantesTab({ token, model, dashboard, onSaved }) {
  const variants = dashboard?.colors?.slice(1) || []
  const [label, setLabel] = useState('')
  const [qteTotale, setQteTotale] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  async function submitNew(e) {
    e.preventDefault()
    if (!label) return
    setSaving(true)
    try {
      await api.methode.addVariant(token, model.id, label, Number(qteTotale) || 0)
      setLabel('')
      setQteTotale('')
      setSaved(true)
      onSaved()
      setTimeout(() => setSaved(false), 2000)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <GlowCard title="Ajouter une variante de couleur">
        <p className="mb-3 text-sm text-slate-400">
          نفس الموديل (نفس الغامة، نفس VT/DT) بلون/رقم مرجعي مختلف — ما تحتاج تعيد إدخال العمليات. اكتب فقط اسم/رقم
          اللون والكمية المستهدفة الخاصة فيه (جزء من الطلبية الكلية للموديل).
        </p>
        <form onSubmit={submitNew} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <TextField label="Couleur / référence" value={label} onChange={setLabel} required hint='مثال: "800" أو "Bleu"' />
          <TextField
            label="Qté totale (cette couleur)"
            type="number"
            value={qteTotale}
            onChange={setQteTotale}
            hint="الكمية المستهدفة الخاصة بهذا اللون فقط"
          />
          <SaveButton type="submit" saving={saving} saved={saved} />
        </form>
      </GlowCard>

      <GlowCard title="Variantes actives">
        {variants.length === 0 ? (
          <p className="text-sm text-slate-500">لا يوجد لون/متغير إضافي بعد لهذا الموديل.</p>
        ) : (
          <div className="space-y-2.5">
            {variants.map((v) => (
              <VariantRow key={v.id} token={token} modelId={model.id} variant={v} onSaved={onSaved} />
            ))}
          </div>
        )}
      </GlowCard>
    </div>
  )
}

function VariantRow({ token, modelId, variant, onSaved }) {
  const [editing, setEditing] = useState(false)
  const [label, setLabel] = useState(variant.label || '')
  const [qteTotale, setQteTotale] = useState(variant.qteTotale || 0)
  const [saving, setSaving] = useState(false)

  async function save() {
    setSaving(true)
    try {
      await api.methode.updateVariant(token, modelId, variant.id, label, Number(qteTotale) || 0)
      setEditing(false)
      onSaved()
    } finally {
      setSaving(false)
    }
  }

  if (editing) {
    return (
      <div className="flex flex-wrap items-end gap-2.5 rounded-md border border-turquoise/40 bg-navy-900/40 p-3">
        <TextField label="Couleur / référence" value={label} onChange={setLabel} />
        <TextField label="Qté totale" type="number" value={qteTotale} onChange={setQteTotale} />
        <button
          onClick={save}
          disabled={saving}
          className="h-11 shrink-0 rounded-md border border-turquoise bg-turquoise/10 px-4 text-sm font-medium text-turquoise disabled:opacity-50"
        >
          {saving ? '...' : 'Enregistrer'}
        </button>
      </div>
    )
  }

  return (
    <div className="flex items-center justify-between gap-2 rounded-md border border-slate-800 bg-navy-900/40 p-3">
      <div>
        <div className="text-sm font-medium text-slate-200">{variant.label}</div>
        <div className="font-mono text-xs text-slate-500">
          {variant.totalSortie} / {variant.qteTotale} pièces — reste {variant.leReste}
        </div>
      </div>
      <button onClick={() => setEditing(true)} className="rounded border border-slate-700 px-3 py-1.5 text-xs text-slate-400">
        Modifier
      </button>
    </div>
  )
}

function GammeTab({ token, model, onSaved }) {
  const [lines, setLines] = useState(model.gamme.map((g) => ({ operation: g.operation, machine: g.machine, tps: g.tps })))
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [voiceMode, setVoiceMode] = useState(false)

  const preview = useMemo(() => {
    const vt = computeVTMinutes(lines)
    const totalTps = lines.reduce((s, l) => s + (Number(l.tps) || 0), 0)
    const dt = computeDT(model.nd, totalTps)
    return { vt, dt }
  }, [lines, model.nd])

  function updateLine(i, patch) {
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)))
  }
  function addLine() {
    setLines((prev) => [...prev, { operation: '', machine: MACHINES[0], tps: 0 }])
  }
  function removeLine(i) {
    setLines((prev) => prev.filter((_, idx) => idx !== i))
  }

  async function submit() {
    setSaving(true)
    try {
      await api.methode.updateGamme(token, model.id, lines)
      setSaved(true)
      onSaved()
      setTimeout(() => setSaved(false), 2000)
    } finally {
      setSaving(false)
    }
  }

  return (
    <GlowCard>
      <p className="mb-3 text-sm text-slate-400">
        لكل عملية بالگامة: اسمها، الآلة اللي تُستعمل، والوقت بالثواني. الوقت يُستخدم تلقائياً لحساب VT وDT فوق —
        اكتب الاسم أو اختر من الاقتراحات.
      </p>
      <VoiceModeToggle voiceMode={voiceMode} setVoiceMode={setVoiceMode} />
      <datalist id="operation-suggestions">
        {OPERATION_SUGGESTIONS.map((op) => (
          <option key={op} value={op} />
        ))}
      </datalist>
      <div className="mb-3 flex flex-wrap gap-4 text-xs text-slate-400">
        <span>
          Aperçu VT: <span className="font-mono text-turquoise">{preview.vt.toFixed(2)} min</span>
        </span>
        <span>
          Aperçu DT: <span className="font-mono text-turquoise">{Math.round(preview.dt)}</span>
        </span>
      </div>
      <div className="space-y-2.5 overflow-x-auto pb-1">
        {lines.map((line, i) => (
          <div
            key={i}
            className={`grid min-w-max items-center gap-2 ${
              voiceMode
                ? 'grid-cols-[1.5rem_11rem_5.5rem_4.5rem_2.25rem_2.75rem]'
                : 'grid-cols-[1.5rem_11rem_5.5rem_4.5rem_2.75rem]'
            }`}
          >
            <span className="text-center font-mono text-xs text-slate-500">{i + 1}</span>
            <input
              value={line.operation}
              onChange={(e) => updateLine(i, { operation: e.target.value })}
              placeholder="Opération"
              list="operation-suggestions"
              className="w-full rounded border border-slate-700 bg-navy-900 px-2.5 py-2.5 text-sm text-slate-200 focus:border-turquoise focus:outline-none"
            />
            <select
              value={line.machine}
              onChange={(e) => updateLine(i, { machine: e.target.value })}
              className="rounded border border-slate-700 bg-navy-900 px-2 py-2.5 text-sm text-slate-200 focus:border-turquoise focus:outline-none"
            >
              {MACHINES.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
            <input
              type="number"
              inputMode="numeric"
              value={line.tps || ''}
              onChange={(e) => updateLine(i, { tps: e.target.value })}
              placeholder="TPS (s)"
              className="rounded border border-slate-700 bg-navy-900 px-2.5 py-2.5 text-sm text-slate-200 focus:border-turquoise focus:outline-none"
            />
            {voiceMode && (
              <VoiceMicButton label={`TPS ${line.operation || i + 1}`} onConfirm={(n) => updateLine(i, { tps: n })} />
            )}
            <button
              type="button"
              onClick={() => removeLine(i)}
              aria-label="Supprimer l'opération"
              className="flex h-11 w-11 items-center justify-center rounded border border-slate-700 text-slate-400 active:border-status-bad active:text-status-bad"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={addLine}
        className="mt-3 w-full rounded-md border border-dashed border-turquoise/40 py-3 text-sm font-medium text-turquoise active:bg-turquoise/10 sm:w-auto sm:px-6"
      >
        + Ajouter une opération
      </button>
      <div className="mt-4">
        <SaveButton onClick={submit} saving={saving} saved={saved} />
      </div>
    </GlowCard>
  )
}

const DAY_NAME_FORMAT = new Intl.DateTimeFormat('fr-FR', { timeZone: 'UTC', weekday: 'long' })

function formatDayLabel(dateStr) {
  const d = new Date(`${dateStr}T00:00:00Z`)
  const weekday = DAY_NAME_FORMAT.format(d)
  const dd = String(d.getUTCDate()).padStart(2, '0')
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0')
  const yy = String(d.getUTCFullYear()).slice(-2)
  return `${weekday.charAt(0).toUpperCase()}${weekday.slice(1)} ${dd}/${mm}/${yy}`
}

// Planning — Agent Méthode's hourly production PLAN, entered ahead of real
// production so Home can show Plan vs Réel (see planning.js server-side).
// One continuous, scrollable table — a row per day, days appended
// automatically as they're filled in — never a day-picker to hop between
// screens with (that was the previous design; this replaces it entirely).
// Each cell auto-saves on blur (one real request per hour actually
// touched) — there's no page-wide "Enregistrer" anymore, since there's no
// single "day" being edited at a time. Unlike Présence/hourly entry
// elsewhere, planned dates are NOT capped at today — planning ahead is the
// entire point. An hour left blank stays blank ("—"), never a fake 0 — the
// server deletes that cell's row entirely when cleared.
function PlanningTab({ token, model }) {
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [retryTick, setRetryTick] = useState(0)
  const [debut, setDebut] = useState(model.debut)
  const [hourlySlots, setHourlySlots] = useState([])
  const [plannedDates, setPlannedDates] = useState([]) // ["2026-08-01", ...] — explicit, user-controlled rows
  const [cellsByDay, setCellsByDay] = useState({}) // { "2026-08-01": { "0": 50, "2": 60 } }
  const [summary, setSummary] = useState({ totalPlanned: 0, expectedFinishDate: null })
  const [savingCells, setSavingCells] = useState({}) // key `${date}:${index}` -> true
  const [savedCells, setSavedCells] = useState({})
  const [newDayDate, setNewDayDate] = useState('')
  const [dayActionPending, setDayActionPending] = useState(null) // 'add' | a date being deleted
  const [dayActionError, setDayActionError] = useState(null)

  async function loadPlanning() {
    const r = await api.methode.getPlanning(token, model.id)
    setDebut(r.debut)
    setHourlySlots(r.hourlySlots)
    setPlannedDates(r.plannedDates || [])
    setCellsByDay(r.days || {})
    setSummary({ totalPlanned: r.totalPlanned, expectedFinishDate: r.expectedFinishDate })
  }

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setLoadError(false)
    loadPlanning()
      .then(() => {
        if (!cancelled) setLoading(false)
      })
      .catch(() => {
        if (cancelled) return
        setLoadError(true)
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, model.id, retryTick])

  // Rows are the explicit, server-held list (planning_days) — sorted here
  // since a day can be added out of sequence (skipping a holiday, filling
  // in an earlier date after a later one already exists).
  const rows = useMemo(
    () => [...plannedDates].sort().map((date) => ({ date, label: formatDayLabel(date), cells: cellsByDay[date] || {} })),
    [plannedDates, cellsByDay]
  )

  function updateCell(date, index, value) {
    setCellsByDay((prev) => ({ ...prev, [date]: { ...prev[date], [index]: value } }))
  }

  async function saveCell(date, index, rawValue) {
    const key = `${date}:${index}`
    const qty = rawValue === '' || rawValue === null || rawValue === undefined ? null : Number(rawValue)
    setSavingCells((s) => ({ ...s, [key]: true }))
    try {
      const res = await api.methode.updatePlanning(token, model.id, date, [{ index, qty }])
      setSummary({ totalPlanned: res.totalPlanned, expectedFinishDate: res.expectedFinishDate })
      setSavedCells((s) => ({ ...s, [key]: true }))
      setTimeout(() => setSavedCells((s) => ({ ...s, [key]: false })), 1500)
    } finally {
      setSavingCells((s) => ({ ...s, [key]: false }))
    }
  }

  async function addDay(e) {
    e.preventDefault()
    if (!newDayDate) return
    setDayActionError(null)
    setDayActionPending('add')
    try {
      await api.methode.addPlanningDay(token, model.id, newDayDate)
      await loadPlanning()
      setNewDayDate('')
    } catch (err) {
      setDayActionError(err?.data?.error === 'date_before_debut' ? 'التاريخ قبل Début — اختر تاريخ لاحق.' : 'فشلت إضافة اليوم.')
    } finally {
      setDayActionPending(null)
    }
  }

  async function deleteDay(date) {
    if (!confirm(`حذف يوم ${formatDayLabel(date)}؟ غادي يمسح معه أي قيم كانت مدخلة فيه.`)) return
    setDayActionError(null)
    setDayActionPending(date)
    try {
      const res = await api.methode.deletePlanningDay(token, model.id, date)
      setSummary({ totalPlanned: res.totalPlanned, expectedFinishDate: res.expectedFinishDate })
      setPlannedDates((prev) => prev.filter((d) => d !== date))
      setCellsByDay((prev) => {
        const next = { ...prev }
        delete next[date]
        return next
      })
    } catch {
      setDayActionError('فشل حذف اليوم.')
    } finally {
      setDayActionPending(null)
    }
  }

  const qteTotale = model.qte_totale || 0
  const overPlanned = qteTotale > 0 && summary.totalPlanned > qteTotale

  return (
    <GlowCard>
      <p className="mb-3 text-sm text-slate-400">
        <b className="text-slate-300">Planning</b> — الكمية المخططة لكل ساعة، قبل بداية الإنتاج الحقيقي — عمّر كل يوم
        بقيمه الخاصة (بداية بطيئة وتسريع بالوسط، ما يشترط رقم ثابت). زيد أو احذف أي يوم بالزر تحت (تقدر تخطى يوم عطلة
        أو تزيد أيام بلا ترتيب صارم) — والحفظ أوتوماتيكي بمجرد ما تخرج من الخانة. النظام كيقارنها أوتوماتيكياً
        بالإنتاج الحقيقي (Plan مقابل Réel، بادينا Home).
      </p>

      <div className="mb-4 flex flex-wrap gap-4 text-sm">
        <div>
          <div className="text-[11px] uppercase tracking-wide text-slate-500">Total planifié</div>
          <div className={`font-mono ${overPlanned ? 'text-amber' : 'text-turquoise'}`}>
            {summary.totalPlanned.toLocaleString('fr-FR')} / {qteTotale.toLocaleString('fr-FR')}
          </div>
        </div>
      </div>
      {overPlanned && (
        <div className="mb-3 rounded-md border border-amber bg-amber-soft px-3 py-2 text-sm text-amber">
          ⚠️ مجموع المخطط ({summary.totalPlanned.toLocaleString('fr-FR')}) تجاوز Qté totale (
          {qteTotale.toLocaleString('fr-FR')}) — تأكد من الأرقام.
        </div>
      )}
      {summary.expectedFinishDate && (
        <div className="mb-3 rounded-md border border-status-good/40 bg-status-good/10 px-3 py-2 text-sm text-status-good">
          ✅ المخطط وصل للكمية الإجمالية — آخر يوم: {summary.expectedFinishDate}
        </div>
      )}

      <form onSubmit={addDay} className="mb-3 flex flex-wrap items-end gap-2">
        <input
          type="date"
          value={newDayDate}
          min={debut || undefined}
          onChange={(e) => setNewDayDate(e.target.value)}
          className="rounded-md border border-slate-700 bg-navy-900 px-2.5 py-2 text-sm text-slate-200 focus:border-turquoise focus:outline-none"
        />
        <button
          type="submit"
          disabled={!newDayDate || dayActionPending === 'add'}
          className="rounded-md border border-turquoise/50 px-3 py-2 text-sm font-medium text-turquoise active:bg-turquoise/10 disabled:opacity-50"
        >
          {dayActionPending === 'add' ? 'جاري الإضافة…' : '+ إضافة يوم'}
        </button>
        {dayActionError && <span className="text-xs text-status-bad">{dayActionError}</span>}
      </form>

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-6 text-sm text-slate-500">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-turquoise/30 border-t-turquoise" />
          Chargement…
        </div>
      ) : loadError ? (
        <div className="flex flex-col items-center gap-2 py-6 text-center">
          <span className="text-sm text-status-bad">فشل تحميل المخطط — تحقق من الاتصال.</span>
          <button
            onClick={() => setRetryTick((t) => t + 1)}
            className="rounded border border-turquoise/50 px-4 py-2 text-sm font-medium text-turquoise active:bg-turquoise/10"
          >
            إعادة المحاولة
          </button>
        </div>
      ) : (
        <div className="overflow-auto rounded-md border border-slate-800" style={{ maxHeight: '65vh' }}>
          <table className="border-collapse text-sm">
            <thead>
              <tr>
                <th className="sticky top-0 left-0 z-20 whitespace-nowrap bg-navy-900 px-3 py-2 text-right text-xs font-medium uppercase tracking-wide text-slate-500">
                  اليوم
                </th>
                {hourlySlots.map((s) => (
                  <th
                    key={s.index}
                    className="sticky top-0 z-10 whitespace-nowrap bg-navy-900 px-2 py-2 text-center font-mono text-[11px] font-normal text-slate-500"
                  >
                    {s.label}
                  </th>
                ))}
                <th className="sticky top-0 z-10 bg-navy-900 px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.date}>
                  <td className="sticky left-0 z-10 whitespace-nowrap border-t border-slate-800 bg-navy-900 px-3 py-1.5 text-sm font-medium text-slate-300">
                    {row.label}
                  </td>
                  {hourlySlots.map((s) => {
                    const key = `${row.date}:${s.index}`
                    const value = row.cells[s.index]
                    return (
                      <td key={s.index} className="border-t border-slate-800 p-1">
                        <input
                          type="number"
                          inputMode="numeric"
                          placeholder="—"
                          defaultValue={value ?? ''}
                          key={`${key}:${value ?? ''}`}
                          onBlur={(e) => {
                            updateCell(row.date, s.index, e.target.value)
                            saveCell(row.date, s.index, e.target.value)
                          }}
                          className={`h-10 w-20 rounded border bg-navy-900 px-1.5 text-center text-sm text-slate-200 placeholder:text-slate-600 focus:border-turquoise focus:outline-none ${
                            savedCells[key] ? 'border-turquoise' : 'border-slate-700'
                          } ${savingCells[key] ? 'opacity-50' : ''}`}
                        />
                      </td>
                    )
                  })}
                  <td className="border-t border-slate-800 px-1 text-center">
                    <button
                      onClick={() => deleteDay(row.date)}
                      disabled={dayActionPending === row.date}
                      title="حذف اليوم"
                      className="text-status-bad active:opacity-70 disabled:opacity-50"
                    >
                      🗑
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </GlowCard>
  )
}

function EffectifTab({ token, model, onSaved }) {
  const [effectif, setEffectif] = useState({ ...model.effectif })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [voiceMode, setVoiceMode] = useState(false)

  const nd = useMemo(() => Object.values(effectif).reduce((s, v) => s + (Number(v) || 0), 0), [effectif])

  async function submit() {
    setSaving(true)
    try {
      await api.methode.updateEffectif(token, model.id, effectif)
      setSaved(true)
      onSaved()
      setTimeout(() => setSaved(false), 2000)
    } finally {
      setSaving(false)
    }
  }

  return (
    <GlowCard>
      <div className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-target bg-target/10 px-3 py-1 text-xs font-medium text-target">
        🎯 ثابت طول عمر الموديل — ما يتغيّر يومياً
      </div>
      <p className="mb-3 text-sm text-slate-400">
        <b className="text-slate-300">Effectif</b> — عدد العمال المطلوبين لكل تخصص (301, 502, 504, 516, Main, Sp,
        M/sp, Finition, Control, Stg, Fer). المجموع (ND) يُحسب تلقائياً وتُستخدم لحساب DT.
      </p>
      <div className="mb-3 text-sm text-slate-400">
        ND total: <span className="font-mono text-turquoise">{nd}</span>
      </div>
      <VoiceModeToggle voiceMode={voiceMode} setVoiceMode={setVoiceMode} />
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
        {Object.keys(effectif).map((sp) => (
          <div key={sp} className="flex flex-col items-center gap-1.5 rounded-md border border-slate-800 bg-navy-900/40 py-3">
            <Stepper label={sp} value={effectif[sp] ?? 0} onChange={(v) => setEffectif({ ...effectif, [sp]: v })} max={999} />
            {voiceMode && (
              <VoiceMicButton label={sp} onConfirm={(n) => setEffectif({ ...effectif, [sp]: n })} />
            )}
          </div>
        ))}
      </div>
      <div className="mt-4">
        <SaveButton onClick={submit} saving={saving} saved={saved} />
      </div>
    </GlowCard>
  )
}

function LaunchTimerTab({ token, model, onSaved }) {
  const lt = model.launchTimer || {}
  // Objectif is entered as an alarm-clock-style HH:MM picker
  // (<input type="time">, a native wheel/clock UI on mobile) — converted to
  // decimal hours only at save time; the API itself is unchanged.
  const [form, setForm] = useState({
    objectifTime: lt.objectifHeures ? hoursToHHMM(lt.objectifHeures) : '',
    groupeLancement: lt.groupeLancement || '',
    agentMethode: lt.agentMethode || '',
    mecanicien: lt.mecanicien || '',
    electriciens: lt.electriciens || '',
    agentQuality: lt.agentQuality || '',
    chefChaine: lt.chefChaine || '',
  })
  const [savingConfig, setSavingConfig] = useState(false)
  const [configSaved, setConfigSaved] = useState(false)
  const [now, setNow] = useState(new Date())
  const [starting, setStarting] = useState(false)
  const [stopping, setStopping] = useState(false)
  const [showOverrunForm, setShowOverrunForm] = useState(false)
  const [responsible, setResponsible] = useState('')
  const [reasonCode, setReasonCode] = useState('')
  const [reasonComment, setReasonComment] = useState('')
  const [stopError, setStopError] = useState('')
  const [startError, setStartError] = useState('')

  // Tick every second only while the timer is actually running (started,
  // not stopped) — this is what makes the countdown/overrun display live
  // without polling the server every second.
  useEffect(() => {
    if (!lt.startedAt || lt.stoppedAt) return undefined
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [lt.startedAt, lt.stoppedAt])

  const state = computeLaunchTimerState(lt, now)

  function persistConfig() {
    const { objectifTime, ...rest } = form
    return api.methode.updateLaunchTimer(token, model.id, { ...rest, objectifHeures: hhmmToHours(objectifTime) })
  }

  async function saveConfig(e) {
    e.preventDefault()
    setSavingConfig(true)
    try {
      await persistConfig()
      setConfigSaved(true)
      onSaved()
      setTimeout(() => setConfigSaved(false), 2000)
    } finally {
      setSavingConfig(false)
    }
  }

  async function start() {
    setStarting(true)
    setStartError('')
    try {
      // Persist whatever Objectif/équipe is currently typed before starting —
      // the server is the source of truth for objectif_heures and rejects
      // starting on an unsaved/zero value, so a user who types the time and
      // goes straight for "Démarrer" (without a separate "Enregistrer" click
      // first) must not silently fail.
      await persistConfig()
      await api.methode.startLaunchTimer(token, model.id)
      onSaved()
    } catch (err) {
      if (err?.data?.error === 'already_started') {
        // Not a real failure — a duplicate tap or a previous attempt that
        // actually succeeded server-side. Just refresh so the UI catches up
        // to the real (already running) state instead of showing an error
        // for something that already worked.
        onSaved()
      } else {
        const code = err?.data?.error || err?.message || 'unknown_error'
        setStartError(`تعذّر بدء العداد (${code}) — تحقق من الاتصال ثم أعد المحاولة.`)
      }
    } finally {
      setStarting(false)
    }
  }

  async function attemptStop() {
    if (state.status === 'overrun_running') {
      setShowOverrunForm(true)
      return
    }
    setStopping(true)
    try {
      await api.methode.stopLaunchTimer(token, model.id, {})
      onSaved()
    } finally {
      setStopping(false)
    }
  }

  async function confirmOverrunStop(e) {
    e.preventDefault()
    if (!responsible || !reasonCode) {
      setStopError('اختر المسؤول والسبب قبل تأكيد الإيقاف.')
      return
    }
    setStopping(true)
    setStopError('')
    try {
      await api.methode.stopLaunchTimer(token, model.id, { responsible, reasonCode, reasonComment })
      onSaved()
    } catch {
      setStopError('فشل الحفظ — تحقق من الاتصال وحاول مرة ثانية.')
    } finally {
      setStopping(false)
    }
  }

  // Dropdown options are the real person names entered above, each tagged
  // with their role — not the bare role labels — so responsibility lands on
  // an actual person, not a generic job title.
  const teamOptions = [
    { role: 'Agent méthode', name: lt.agentMethode },
    { role: 'Mécanicien', name: lt.mecanicien },
    { role: 'Électriciens', name: lt.electriciens },
    { role: 'Agent Quality', name: lt.agentQuality },
    { role: 'Chef de chaîne', name: lt.chefChaine },
  ].filter((t) => t.name)

  return (
    <div className="space-y-4">
      <GlowCard title="Temps de lancement — configuration">
        <p className="mb-3 text-sm text-slate-400">
          يُحدَّد من جديد لكل موديل/إطلاق — مو رقم ثابت. الحقول النصية توثيقية فقط (تُستخدم لاحقاً كخيارات "المسؤول"
          عند أي تجاوز).
        </p>
        <form onSubmit={saveConfig} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-xs uppercase tracking-wide text-slate-500">Objectif (heures)</span>
            <input
              type="time"
              value={form.objectifTime}
              onChange={(e) => setForm({ ...form, objectifTime: e.target.value })}
              className="w-full rounded-md border border-slate-700 bg-navy-900 px-3 py-3 text-sm text-slate-200 focus:border-turquoise focus:outline-none"
            />
            <span className="mt-1 block text-xs text-slate-500">الوقت المستهدف لإنجاز الإطلاق — اختره مثل ضبط منبه (ساعة:دقيقة)</span>
          </label>
          <TextField label="Groupe de lancement" value={form.groupeLancement} onChange={(v) => setForm({ ...form, groupeLancement: v })} />
          <TextField label="Agent méthode" value={form.agentMethode} onChange={(v) => setForm({ ...form, agentMethode: v })} />
          <TextField label="Mécanicien" value={form.mecanicien} onChange={(v) => setForm({ ...form, mecanicien: v })} />
          <TextField label="Électriciens" value={form.electriciens} onChange={(v) => setForm({ ...form, electriciens: v })} />
          <TextField label="Agent Quality" value={form.agentQuality} onChange={(v) => setForm({ ...form, agentQuality: v })} />
          <TextField label="Chef de chaîne" value={form.chefChaine} onChange={(v) => setForm({ ...form, chefChaine: v })} />
          <SaveButton type="submit" saving={savingConfig} saved={configSaved} />
        </form>
      </GlowCard>

      <GlowCard title="Compte à rebours">
        {state.status === 'not_started' && (
          <>
            <p className="mb-3 text-sm text-slate-400">
              لسه ما بدأ العداد. اضغط "▶️ Démarrer" لبدء العداد التنازلي من Objectif المحدد فوق.
            </p>
            <button
              onClick={start}
              disabled={starting || hhmmToHours(form.objectifTime) <= 0}
              className="w-full rounded-md border border-turquoise bg-turquoise/10 py-3.5 text-base font-medium text-turquoise shadow-glow-sm active:bg-turquoise/20 disabled:opacity-50"
            >
              {starting ? '...' : '▶️ Démarrer'}
            </button>
            {startError && <p className="mt-2 text-sm text-status-bad">{startError}</p>}
          </>
        )}

        {(state.status === 'running' || state.status === 'overrun_running') && (
          <>
            <div className="text-center">
              <div
                className={`font-display text-4xl font-bold ${
                  state.status === 'overrun_running' ? 'text-status-bad' : 'text-turquoise glow-number'
                }`}
              >
                {state.status === 'overrun_running' ? `+${formatDuration(state.overrunSeconds)}` : formatDuration(state.remainingSeconds)}
              </div>
              <div className="mt-1 text-xs text-slate-500">
                {state.status === 'overrun_running' ? '⚠️ تجاوز الهدف — جاري التشغيل' : 'جاري التشغيل'}
              </div>
            </div>

            {!showOverrunForm && (
              <button
                onClick={attemptStop}
                disabled={stopping}
                className="mt-4 w-full rounded-md border border-status-bad/60 bg-status-bad/10 py-3.5 text-base font-medium text-status-bad active:bg-status-bad/20 disabled:opacity-50"
              >
                {stopping ? '...' : '⏹ Arrêter / Première pièce terminée'}
              </button>
            )}

            {showOverrunForm && (
              <form onSubmit={confirmOverrunStop} className="mt-4 space-y-3 rounded-md border border-amber bg-amber-soft p-3">
                <p className="text-sm text-amber">تجاوزت الوقت المحدد — اختر المسؤول والسبب قبل إكمال الإيقاف.</p>
                <label className="block">
                  <span className="mb-1 block text-xs uppercase tracking-wide text-slate-500">المسؤول عن التأخير</span>
                  <select
                    value={responsible}
                    onChange={(e) => setResponsible(e.target.value)}
                    className="h-11 w-full rounded-md border border-slate-700 bg-navy-900 px-3 text-sm text-slate-200 focus:border-turquoise focus:outline-none"
                  >
                    <option value="">-- اختر --</option>
                    {teamOptions.map((t) => (
                      <option key={t.role} value={`${t.name} (${t.role})`}>
                        {t.name} ({t.role})
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs uppercase tracking-wide text-slate-500">السبب</span>
                  <select
                    value={reasonCode}
                    onChange={(e) => setReasonCode(e.target.value)}
                    className="h-11 w-full rounded-md border border-slate-700 bg-navy-900 px-3 text-sm text-slate-200 focus:border-turquoise focus:outline-none"
                  >
                    <option value="">-- اختر --</option>
                    {DELAY_REASONS.map((r) => (
                      <option key={r.code} value={r.code}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs uppercase tracking-wide text-slate-500">تعليق إضافي (اختياري)</span>
                  <textarea
                    value={reasonComment}
                    onChange={(e) => setReasonComment(e.target.value)}
                    rows={2}
                    className="w-full rounded-md border border-slate-700 bg-navy-900 px-3 py-2 text-sm text-slate-200 focus:border-turquoise focus:outline-none"
                  />
                </label>
                {stopError && <div className="text-sm text-status-bad">{stopError}</div>}
                <button
                  type="submit"
                  disabled={stopping}
                  className="w-full rounded-md border border-status-bad bg-status-bad/10 py-3 text-sm font-medium text-status-bad active:bg-status-bad/20 disabled:opacity-50"
                >
                  {stopping ? '...' : 'تأكيد الإيقاف'}
                </button>
              </form>
            )}
          </>
        )}

        {state.status === 'stopped_on_target' && (
          <div className="text-center">
            <div className="font-display text-2xl font-bold text-status-good">🎯 Objectif atteint</div>
            <div className="mt-1 text-sm text-slate-400">الوقت الفعلي: {formatDuration(state.elapsedSeconds)}</div>
          </div>
        )}

        {state.status === 'stopped_overrun' && (
          <div className="text-center">
            <div className="font-display text-xl font-bold text-status-bad">⚠️ تجاوز الهدف بمقدار {formatDuration(state.overrunSeconds)}</div>
            <div className="mt-1 text-sm text-slate-400">الوقت الفعلي: {formatDuration(state.elapsedSeconds)}</div>
            <div className="mt-2 text-sm text-slate-300">المسؤول: {lt.responsible}</div>
            <div className="text-sm text-slate-300">السبب: {DELAY_REASONS.find((r) => r.code === lt.reasonCode)?.label || lt.reasonCode}</div>
            {lt.reasonComment && <div className="mt-1 text-xs text-slate-500">{lt.reasonComment}</div>}
          </div>
        )}
      </GlowCard>
    </div>
  )
}

function TextField({ label, value, onChange, type = 'text', required, hint, voiceMode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs uppercase tracking-wide text-slate-500">{label}</span>
      <div className="flex items-center gap-2">
        <input
          type={type}
          inputMode={type === 'number' ? 'numeric' : undefined}
          value={value}
          required={required}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-md border border-slate-700 bg-navy-900 px-3 py-3 text-sm text-slate-200 focus:border-turquoise focus:outline-none"
        />
        {type === 'number' && voiceMode && <VoiceMicButton label={label} onConfirm={(n) => onChange(String(n))} />}
      </div>
      {hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
    </label>
  )
}

function Metric({ label, value }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className="font-mono text-sm font-medium text-turquoise">{value}</div>
    </div>
  )
}

// `disabled` defaults to `saving` (every existing caller's behavior,
// unchanged) but can be passed separately — e.g. "the underlying data
// failed to load, so there's nothing sane to submit yet" is a real reason
// to disable the button, but it is NOT "currently saving", and must never
// say "Enregistrement…" for something that was never actually sent.
function SaveButton({ onClick, saving, saved, disabled, type }) {
  return (
    <button
      type={type || 'button'}
      onClick={onClick}
      disabled={disabled ?? saving}
      className="col-span-full w-full rounded-md border border-turquoise bg-turquoise/10 py-3.5 text-base font-medium text-turquoise shadow-glow-sm active:bg-turquoise/20 disabled:opacity-50 sm:w-auto sm:px-8"
    >
      {saving ? 'Enregistrement…' : saved ? 'Enregistré ✓' : 'Enregistrer'}
    </button>
  )
}
