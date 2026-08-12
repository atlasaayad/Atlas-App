import { useEffect, useMemo, useState } from 'react'
import GlowCard from '../../components/GlowCard'
import { api } from '../../lib/api'
import { SPECIALTIES, MACHINES } from '../../lib/constants'
import { computeVTMinutes, computeDT, computeObjectifJour } from '../../lib/calc'

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
      <form onSubmit={submit} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <TextField label="Client" value={form.client} onChange={(v) => setForm({ ...form, client: v })} required />
        <TextField label="Dessin" value={form.dessin} onChange={(v) => setForm({ ...form, dessin: v })} />
        <TextField label="Qté totale" type="number" value={form.qteTotale} onChange={(v) => setForm({ ...form, qteTotale: v })} />
        <TextField label="Commande" type="number" value={form.commande} onChange={(v) => setForm({ ...form, commande: v })} />
        <TextField label="Début" type="date" value={form.debut} onChange={(v) => setForm({ ...form, debut: v })} />
        <TextField label="Fin prévue" type="date" value={form.finPrevue} onChange={(v) => setForm({ ...form, finPrevue: v })} />
        <button
          type="submit"
          disabled={saving}
          className="col-span-full mt-2 rounded-md border border-turquoise bg-turquoise/10 py-2.5 font-medium text-turquoise shadow-glow-sm hover:bg-turquoise/20 disabled:opacity-50"
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
            className={`whitespace-nowrap rounded-md border px-3 py-1.5 text-sm ${
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
      <form onSubmit={submit} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <TextField label="Client" value={form.client} onChange={(v) => setForm({ ...form, client: v })} required />
        <TextField label="Dessin" value={form.dessin} onChange={(v) => setForm({ ...form, dessin: v })} />
        <TextField label="Qté totale" type="number" value={form.qteTotale} onChange={(v) => setForm({ ...form, qteTotale: v })} />
        <TextField label="Commande" type="number" value={form.commande} onChange={(v) => setForm({ ...form, commande: v })} />
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
      <div className="mb-3 flex flex-wrap gap-4 text-xs text-slate-400">
        <span>
          Aperçu VT: <span className="font-mono text-turquoise">{preview.vt.toFixed(2)} min</span>
        </span>
        <span>
          Aperçu DT: <span className="font-mono text-turquoise">{Math.round(preview.dt)}</span>
        </span>
      </div>
      <div className="space-y-2">
        {lines.map((line, i) => (
          <div key={i} className="grid grid-cols-[2rem_1fr_6rem_5rem_2rem] items-center gap-2">
            <span className="text-center font-mono text-xs text-slate-500">{i + 1}</span>
            <input
              value={line.operation}
              onChange={(e) => updateLine(i, { operation: e.target.value })}
              placeholder="Opération"
              className="rounded border border-slate-700 bg-navy-900 px-2 py-1.5 text-sm text-slate-200 focus:border-turquoise focus:outline-none"
            />
            <select
              value={line.machine}
              onChange={(e) => updateLine(i, { machine: e.target.value })}
              className="rounded border border-slate-700 bg-navy-900 px-2 py-1.5 text-sm text-slate-200 focus:border-turquoise focus:outline-none"
            >
              {MACHINES.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
            <input
              type="number"
              value={line.tps}
              onChange={(e) => updateLine(i, { tps: e.target.value })}
              placeholder="TPS (s)"
              className="rounded border border-slate-700 bg-navy-900 px-2 py-1.5 text-sm text-slate-200 focus:border-turquoise focus:outline-none"
            />
            <button onClick={() => removeLine(i)} className="text-slate-500 hover:text-status-bad">
              ✕
            </button>
          </div>
        ))}
      </div>
      <button onClick={addLine} className="mt-3 text-sm text-turquoise hover:underline">
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
      <div className="mb-3 text-sm text-slate-400">
        ND total: <span className="font-mono text-turquoise">{nd}</span>
      </div>
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6">
        {SPECIALTIES.map((sp) => (
          <div key={sp}>
            <label className="mb-1 block text-center font-mono text-xs text-slate-500">{sp}</label>
            <input
              type="number"
              min="0"
              value={effectif[sp] ?? 0}
              onChange={(e) => setEffectif({ ...effectif, [sp]: e.target.value })}
              className="w-full rounded border border-slate-700 bg-navy-900 px-2 py-1.5 text-center text-sm text-slate-200 focus:border-turquoise focus:outline-none"
            />
          </div>
        ))}
      </div>
      <div className="mt-4">
        <SaveButton onClick={submit} saving={saving} saved={saved} />
      </div>
    </GlowCard>
  )
}

function TextField({ label, value, onChange, type = 'text', required }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs uppercase tracking-wide text-slate-500">{label}</span>
      <input
        type={type}
        value={value}
        required={required}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-slate-700 bg-navy-900 px-3 py-2 text-sm text-slate-200 focus:border-turquoise focus:outline-none"
      />
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
      className="col-span-full rounded-md border border-turquoise bg-turquoise/10 px-4 py-2 font-medium text-turquoise shadow-glow-sm hover:bg-turquoise/20 disabled:opacity-50"
    >
      {saving ? 'Enregistrement…' : saved ? 'Enregistré ✓' : 'Enregistrer'}
    </button>
  )
}
