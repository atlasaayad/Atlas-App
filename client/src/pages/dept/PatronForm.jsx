import { useEffect, useState } from 'react'
import GlowCard from '../../components/GlowCard'
import { api } from '../../lib/api'

export default function PatronForm({ token }) {
  const [models, setModels] = useState(null)
  const [openId, setOpenId] = useState(null)

  async function load() {
    setModels(await api.patron.getModels(token))
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!models) return <div className="py-10 text-center text-slate-400">Chargement…</div>
  if (models.length === 0) return <div className="py-10 text-center text-slate-400">Aucun modèle enregistré.</div>

  return (
    <div className="space-y-3">
      {models.map((m) => (
        <ModelFinanceCard
          key={m.id}
          token={token}
          model={m}
          open={openId === m.id}
          onToggle={() => setOpenId(openId === m.id ? null : m.id)}
          onSaved={load}
        />
      ))}
    </div>
  )
}

function ModelFinanceCard({ token, model, open, onToggle, onSaved }) {
  const [form, setForm] = useState({
    coutModele: model.coutModele,
    coutOuvriers: model.coutOuvriers,
    autresDepenses: model.autresDepenses,
    prixVenteUnitaire: model.prixVenteUnitaire,
  })
  const [saving, setSaving] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setSaving(true)
    try {
      await api.patron.update(token, model.id, form)
      onSaved()
    } finally {
      setSaving(false)
    }
  }

  const profitPositive = model.profit >= 0

  return (
    <GlowCard>
      <button onClick={onToggle} className="flex w-full items-center justify-between text-left">
        <div>
          <div className="font-display text-sm font-semibold text-slate-100">
            {model.client} <span className="text-slate-500">· {model.dessin}</span>
          </div>
          <div className="text-xs text-slate-500">
            {model.active ? `Chaîne ${model.chainNumber}` : 'Inactif'}
          </div>
        </div>
        <div className={`font-mono text-lg font-semibold ${profitPositive ? 'text-status-good' : 'text-status-bad'}`}>
          {model.profitPct}%
        </div>
      </button>

      {open && (
        <form onSubmit={submit} className="mt-4 grid grid-cols-1 gap-3 border-t border-slate-800 pt-4 sm:grid-cols-2">
          <NumField label="Coût modèle" value={form.coutModele} onChange={(v) => setForm({ ...form, coutModele: v })} />
          <NumField label="Coût ouvriers" value={form.coutOuvriers} onChange={(v) => setForm({ ...form, coutOuvriers: v })} />
          <NumField label="Autres dépenses" value={form.autresDepenses} onChange={(v) => setForm({ ...form, autresDepenses: v })} />
          <NumField
            label="Prix de vente unitaire"
            value={form.prixVenteUnitaire}
            onChange={(v) => setForm({ ...form, prixVenteUnitaire: v })}
          />

          <div className="col-span-full grid grid-cols-3 gap-3 rounded-md bg-navy-900/60 p-3 text-sm">
            <Stat label="Coût total" value={model.coutTotal} />
            <Stat label="Revenu" value={model.revenu} />
            <Stat label="Profit" value={model.profit} accent={profitPositive} />
          </div>

          <button
            type="submit"
            disabled={saving}
            className="col-span-full rounded-md border border-turquoise bg-turquoise/10 py-2.5 font-medium text-turquoise shadow-glow-sm hover:bg-turquoise/20 disabled:opacity-50"
          >
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </form>
      )}
    </GlowCard>
  )
}

function NumField({ label, value, onChange }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs uppercase tracking-wide text-slate-500">{label}</span>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-slate-700 bg-navy-900 px-3 py-2 text-sm text-slate-200 focus:border-turquoise focus:outline-none"
      />
    </label>
  )
}

function Stat({ label, value, accent }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`font-mono font-medium ${accent === undefined ? 'text-slate-200' : accent ? 'text-status-good' : 'text-status-bad'}`}>
        {Math.round(value).toLocaleString('fr-FR')}
      </div>
    </div>
  )
}
