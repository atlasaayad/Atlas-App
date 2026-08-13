import { useEffect, useState } from 'react'
import GlowCard from '../../components/GlowCard'
import { api } from '../../lib/api'
import { DEPARTMENT_META } from '../../lib/constants'

export default function PatronForm({ token }) {
  const [tab, setTab] = useState('finances')
  const [models, setModels] = useState(null)
  const [openId, setOpenId] = useState(null)

  async function load() {
    setModels(await api.patron.getModels(token))
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {[
          ['finances', 'Finances'],
          ['journal', 'Journal des modifications'],
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

      {tab === 'finances' && (
        <div className="space-y-3">
          <ExportCard token={token} />
          {!models ? (
            <div className="py-10 text-center text-slate-400">Chargement…</div>
          ) : models.length === 0 ? (
            <div className="py-10 text-center text-slate-400">Aucun modèle enregistré.</div>
          ) : (
            models.map((m) => (
              <ModelFinanceCard
                key={m.id}
                token={token}
                model={m}
                open={openId === m.id}
                onToggle={() => setOpenId(openId === m.id ? null : m.id)}
                onSaved={load}
              />
            ))
          )}
        </div>
      )}

      {tab === 'journal' && <AuditLogTab token={token} />}
    </div>
  )
}

const ACTION_LABELS = {
  create_model: 'Nouveau modèle créé',
  update_identity: 'Identité du modèle modifiée',
  update_gamme: 'Gamme de montage modifiée',
  update_effectif: 'Effectif requis modifié',
  update_hourly: 'Production horaire saisie',
  update_totals: 'Totaux entrée/sortie modifiés',
  update_attendance: 'Présence RH mise à jour',
  update_quality: 'Qualité mise à jour',
  update_finale: 'Finale mise à jour',
  update_depot: 'Dépôt mis à jour',
  add_export: 'Expédition ajoutée',
  delete_export: 'Expédition supprimée',
  update_poste_status: "État du poste mis à jour",
  update_finance: 'Finances du modèle modifiées',
  export_data: 'Export des données téléchargé',
  seed_demo_model: 'Modèle de démonstration créé',
}

function AuditLogTab({ token }) {
  const [entries, setEntries] = useState(null)

  useEffect(() => {
    api.patron.getAuditLog(token).then(setEntries)
  }, [token])

  if (!entries) return <div className="py-10 text-center text-slate-400">Chargement…</div>
  if (entries.length === 0) return <div className="py-10 text-center text-slate-400">Aucune activité enregistrée.</div>

  return (
    <GlowCard>
      <div className="mb-1 text-xs uppercase tracking-wide text-slate-500">Les 50 dernières modifications</div>
      <div className="divide-y divide-slate-800">
        {entries.map((e) => {
          const meta = DEPARTMENT_META[e.deptKey]
          return (
            <div key={e.id} className="flex items-start justify-between gap-3 py-2.5">
              <div className="min-w-0">
                <div className="text-sm text-slate-200">
                  {meta?.icon} <span className="font-medium">{meta?.label || e.deptKey}</span>
                  <span className="text-slate-500"> — {ACTION_LABELS[e.action] || e.action}</span>
                </div>
                {(e.modelClient || e.modelDessin) && (
                  <div className="truncate text-xs text-slate-500">
                    {e.modelClient} {e.modelDessin && `· ${e.modelDessin}`}
                  </div>
                )}
              </div>
              <div className="shrink-0 whitespace-nowrap font-mono text-xs text-slate-500">
                {formatDateTime(e.createdAt)}
              </div>
            </div>
          )
        })}
      </div>
    </GlowCard>
  )
}

function formatDateTime(iso) {
  try {
    return new Date(iso).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })
  } catch {
    return iso
  }
}

function ExportCard({ token }) {
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState(false)

  async function handleExport() {
    setExporting(true)
    setError(false)
    try {
      const blob = await api.patron.exportData(token)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `atlas-export-${new Date().toISOString().slice(0, 10)}.xlsx`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch {
      setError(true)
    } finally {
      setExporting(false)
    }
  }

  return (
    <GlowCard>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="font-display text-sm font-semibold text-slate-100">Exporter toutes les données</div>
          <div className="text-xs text-slate-500">
            Fichier Excel (.xlsx) — tous les modèles, la production, RH, qualité, logistique et le journal des
            modifications, un onglet par table.
          </div>
        </div>
        <button
          onClick={handleExport}
          disabled={exporting}
          className="rounded-md border border-turquoise bg-turquoise/10 px-4 py-2 text-sm font-medium text-turquoise shadow-glow-sm hover:bg-turquoise/20 disabled:opacity-50"
        >
          {exporting ? 'Export en cours…' : '⬇ Exporter (.xlsx)'}
        </button>
      </div>
      {error && <div className="mt-2 text-sm text-status-bad">Échec de l'export, réessayez.</div>}
    </GlowCard>
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
            className="col-span-full rounded-md border border-turquoise bg-turquoise/10 py-3.5 text-base font-medium text-turquoise shadow-glow-sm active:bg-turquoise/20 disabled:opacity-50"
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
        inputMode="numeric"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-12 w-full rounded-md border border-slate-700 bg-navy-900 px-3 text-base text-slate-200 focus:border-turquoise focus:outline-none"
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
