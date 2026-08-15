import { useEffect, useMemo, useState } from 'react'
import GlowCard from '../../components/GlowCard'
import Stepper from '../../components/Stepper'
import VoiceModeToggle from '../../components/VoiceModeToggle'
import VoiceMicButton from '../../components/VoiceMicButton'
import DevisCard from '../../components/DevisCard'
import { api } from '../../lib/api'
import { SPECIALTIES, MACHINES } from '../../lib/constants'
import { computeVTMinutes, computeDT, computeObjectifJour } from '../../lib/calc'

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

  async function load() {
    setLoading(true)
    const chains = await api.getChains()
    const info = chains.find((c) => c.chainNumber === chainNumber)
    if (info?.model) {
      setModel(await api.getModel(info.model.id))
    } else {
      setModel(null)
    }
    setLoading(false)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chainNumber])

  if (loading) return <div className="py-10 text-center text-slate-400">Chargement…</div>
  if (!model) return <CreateModelForm token={token} chainNumber={chainNumber} onCreated={load} />
  return <EditModel token={token} model={model} onSaved={load} />
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

function EditModel({ token, model, onSaved }) {
  const [tab, setTab] = useState('identite')
  return (
    <div className="space-y-4">
      <div className="flex gap-2 overflow-x-auto">
        {[
          ['identite', 'Identité'],
          ['gamme', 'Gamme de montage'],
          ['effectif', 'Effectif'],
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
    </div>
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
              value={line.tps}
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
            <Stepper label={sp} value={effectif[sp] ?? 0} onChange={(v) => setEffectif({ ...effectif, [sp]: v })} max={30} />
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
