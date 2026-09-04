import { useEffect, useMemo, useState } from 'react'
import GlowCard from '../../components/GlowCard'
import Stepper from '../../components/Stepper'
import VoiceModeToggle from '../../components/VoiceModeToggle'
import VoiceMicButton from '../../components/VoiceMicButton'
import DevisCard from '../../components/DevisCard'
import { api } from '../../lib/api'
import { SPECIALTIES, MACHINES, DELAY_REASONS } from '../../lib/constants'
import { computeVTMinutes, computeDT, computeObjectifJour, computeLaunchTimerState, formatDuration, hoursToHHMM, hhmmToHours } from '../../lib/calc'

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

export default function MethodeForm({ token, chainNumber }) {
  const [loading, setLoading] = useState(true)
  const [model, setModel] = useState(null)
  const [dashboard, setDashboard] = useState(null)

  // Silent re-fetch (no `loading` flip) — used after every save so a tab
  // doesn't unmount/remount and lose its own state (which tab is open, an
  // in-progress form, the live launch-timer countdown's interval) every
  // time something is saved. Only the initial load / chain switch below
  // shows the "Chargement…" full-screen state.
  async function refresh() {
    const chains = await api.getChains()
    const info = chains.find((c) => c.chainNumber === chainNumber)
    if (info?.model) {
      // Dashboard fetched alongside the model so the Présence tab can show
      // today's actual headcount (rh_attendance) next to the required
      // headcount (effectif_requis) — getModel() alone only has the latter.
      const [m, dash] = await Promise.all([api.getModel(info.model.id), api.getDashboardByChain(chainNumber)])
      setModel(m)
      setDashboard(dash)
    } else {
      setModel(null)
      setDashboard(null)
    }
  }

  useEffect(() => {
    setLoading(true)
    refresh().finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chainNumber])

  if (loading) return <div className="py-10 text-center text-slate-400">Chargement…</div>
  if (!model) return <CreateModelForm token={token} chainNumber={chainNumber} onCreated={refresh} />
  return <EditModel token={token} model={model} dashboard={dashboard} onSaved={refresh} />
}

function CreateModelForm({ token, chainNumber, onCreated }) {
  const [form, setForm] = useState({ client: '', qteTotale: '', debut: '', finPrevue: '', dessin: '', commande: '' })
  const [saving, setSaving] = useState(false)
  const [voiceMode, setVoiceMode] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setSaving(true)
    try {
      await api.methode.createModel(token, { ...form, chainNumber })
      onCreated()
    } finally {
      setSaving(false)
    }
  }

  return (
    <GlowCard>
      <div className="mb-3 font-display text-base font-semibold text-slate-100">
        Nouveau modèle — Chaîne {chainNumber}
      </div>
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

function EditModel({ token, model, dashboard, onSaved }) {
  const [tab, setTab] = useState('identite')
  return (
    <div className="space-y-4">
      <div className="flex gap-2 overflow-x-auto">
        {[
          ['identite', 'Identité'],
          ['gamme', 'Gamme de montage'],
          ['effectif', 'Effectif'],
          ['presence', 'Présence'],
          ['lancement', 'Temps de lancement'],
        ].map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`whitespace-nowrap rounded-md border px-4 py-2.5 text-sm font-medium ${
              tab === key ? 'border-turquoise bg-turquoise/10 text-turquoise' : 'border-slate-700 text-slate-400'
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
      {tab === 'effectif' && <EffectifTab token={token} model={model} onSaved={onSaved} />}
      {tab === 'presence' && <PresenceTab token={token} model={model} dashboard={dashboard} onSaved={onSaved} />}
      {tab === 'lancement' && <LaunchTimerTab token={token} model={model} onSaved={onSaved} />}
    </div>
  )
}

function PresenceTab({ token, model, dashboard, onSaved }) {
  const [attendance, setAttendance] = useState(
    Object.fromEntries(SPECIALTIES.map((sp) => [sp, dashboard?.effectifs.find((e) => e.specialty === sp)?.present ?? 0]))
  )
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [voiceMode, setVoiceMode] = useState(false)

  async function submit() {
    setSaving(true)
    try {
      await api.methode.updateAttendance(token, model.id, attendance)
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
        عدد العمال الحاضرين فعلياً اليوم لكل تخصص — يُستخدم لحساب Rendement (كفاءة الإنتاج). Agent Méthode هو
        المسؤول الأساسي عن هذا الرقم الآن (بدل RH وحده سابقاً)؛ RH لسه يقدر يعدّله من شاشته كنسخة احتياطية — آخر
        تحديث من أي القسمين هو المُعتمد.
      </p>
      {dashboard && (
        <div className="mb-3 text-sm text-slate-400">
          Rendement اليوم:{' '}
          <span className="font-mono text-turquoise">
            {dashboard.rendement.daily.score === null ? 'غير محسوب' : `${dashboard.rendement.daily.score}%`}
          </span>
        </div>
      )}
      <VoiceModeToggle voiceMode={voiceMode} setVoiceMode={setVoiceMode} />
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
        {SPECIALTIES.map((sp) => {
          const required = model.effectif?.[sp] ?? 0
          return (
            <div key={sp} className="flex flex-col items-center gap-1.5 rounded-md border border-slate-800 bg-navy-900/40 py-3">
              <Stepper
                label={`${sp} / ${required} مطلوب`}
                value={attendance[sp] ?? 0}
                onChange={(v) => setAttendance({ ...attendance, [sp]: v })}
                max={999}
              />
              {voiceMode && <VoiceMicButton label={sp} onConfirm={(n) => setAttendance({ ...attendance, [sp]: n })} />}
            </div>
          )
        })}
      </div>
      <div className="mt-4">
        <SaveButton onClick={submit} saving={saving} saved={saved} />
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

function EffectifTab({ token, model, onSaved }) {
  const [effectif, setEffectif] = useState({ ...model.effectif })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [voiceMode, setVoiceMode] = useState(false)

  const nd = useMemo(() => SPECIALTIES.reduce((s, sp) => s + (Number(effectif[sp]) || 0), 0), [effectif])

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
      <p className="mb-3 text-sm text-slate-400">
        عدد العمال المطلوبين لكل تخصص (301, 502, 504, 516, Main, Sp, M/sp, Finition, Control, Stg, Fer). المجموع
        (ND) يُحسب تلقائياً وتُستخدم لحساب DT.
      </p>
      <div className="mb-3 text-sm text-slate-400">
        ND total: <span className="font-mono text-turquoise">{nd}</span>
      </div>
      <VoiceModeToggle voiceMode={voiceMode} setVoiceMode={setVoiceMode} />
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
        {SPECIALTIES.map((sp) => (
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

  // Tick every second only while the timer is actually running (started,
  // not stopped) — this is what makes the countdown/overrun display live
  // without polling the server every second.
  useEffect(() => {
    if (!lt.startedAt || lt.stoppedAt) return undefined
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [lt.startedAt, lt.stoppedAt])

  const state = computeLaunchTimerState(lt, now)

  async function saveConfig(e) {
    e.preventDefault()
    setSavingConfig(true)
    try {
      const { objectifTime, ...rest } = form
      await api.methode.updateLaunchTimer(token, model.id, { ...rest, objectifHeures: hhmmToHours(objectifTime) })
      setConfigSaved(true)
      onSaved()
      setTimeout(() => setConfigSaved(false), 2000)
    } finally {
      setSavingConfig(false)
    }
  }

  async function start() {
    setStarting(true)
    try {
      await api.methode.startLaunchTimer(token, model.id)
      onSaved()
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

function SaveButton({ onClick, saving, saved, type }) {
  return (
    <button
      type={type || 'button'}
      onClick={onClick}
      disabled={saving}
      className="col-span-full w-full rounded-md border border-turquoise bg-turquoise/10 py-3.5 text-base font-medium text-turquoise shadow-glow-sm active:bg-turquoise/20 disabled:opacity-50 sm:w-auto sm:px-8"
    >
      {saving ? 'Enregistrement…' : saved ? 'Enregistré ✓' : 'Enregistrer'}
    </button>
  )
}
