import { useEffect, useState } from 'react'
import GlowCard from '../../components/GlowCard'
import AuditReportCard from '../../components/AuditReportCard'
import DevisCard from '../../components/DevisCard'
import PersonnelAdminCard from '../../components/PersonnelAdminCard'
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
          ['personnel', 'Personnel administratif'],
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
          <CpmCard token={token} />
          <ExportCard token={token} />
          <AuditReportCard token={token} />
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

      {tab === 'personnel' && <PersonnelAdminCard token={token} updateFn={api.patron.updatePersonnelAdmin} />}

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
  update_finale_effectif: 'Effectif Finale mis à jour',
  update_depot: 'Dépôt mis à jour',
  update_personnel_admin: 'Personnel administratif mis à jour',
  add_export: 'Expédition ajoutée',
  delete_export: 'Expédition supprimée',
  update_poste_status: "État du poste mis à jour",
  update_finance: 'Finances du modèle modifiées',
  update_cpm: 'Coût par minute (CPM) modifié',
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
                {e.details?.isBackdated && (
                  <div className="mt-1 inline-block rounded border border-amber bg-amber-soft px-1.5 py-0.5 text-xs text-amber">
                    🕒 تعديل بأثر رجعي — بيانات يوم {e.details.date}
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

function CpmCard({ token }) {
  const [cpm, setCpm] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    api.patron.getCpm(token).then((r) => {
      setCpm(r.cpm === null ? '' : String(r.cpm))
      setLoading(false)
    })
  }, [token])

  async function submit(e) {
    e.preventDefault()
    setSaving(true)
    try {
      await api.patron.updateCpm(token, Number(cpm) || 0)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } finally {
      setSaving(false)
    }
  }

  return (
    <GlowCard>
      <div className="font-display text-sm font-semibold text-slate-100">Coût par minute (CPM)</div>
      <p className="mt-1 text-xs text-slate-500">
        رقم واحد خاص بيك — تكلفة دقيقة الإنتاج الواحدة بمصنعك. يُستخدم بس لحساب "عرض السعر الفوري" اللي يشوفه Agent
        Méthode (تكلفة القطعة بس، بدون هامش ربح). ما يظهر لأي قسم ثاني ولا لـ"اسأل أطلس".
      </p>
      {loading ? (
        <div className="mt-3 text-sm text-slate-500">Chargement…</div>
      ) : (
        <form onSubmit={submit} className="mt-3 flex items-end gap-3">
          <label className="block flex-1">
            <span className="mb-1 block text-xs uppercase tracking-wide text-slate-500">CPM (Dh / min)</span>
            <input
              type="number"
              step="0.01"
              inputMode="decimal"
              value={cpm}
              onChange={(e) => setCpm(e.target.value)}
              placeholder="مثال: 0.85"
              className="h-11 w-full rounded-md border border-slate-700 bg-navy-900 px-3 text-base text-slate-200 focus:border-turquoise focus:outline-none"
            />
          </label>
          <button
            type="submit"
            disabled={saving}
            className="h-11 shrink-0 rounded-md border border-turquoise bg-turquoise/10 px-6 text-sm font-medium text-turquoise shadow-glow-sm active:bg-turquoise/20 disabled:opacity-50"
          >
            {saving ? '…' : saved ? 'Enregistré ✓' : 'Enregistrer'}
          </button>
        </form>
      )}
    </GlowCard>
  )
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
  const [form, setForm] = useState(() => formFromModel(model))
  const [saving, setSaving] = useState(false)

  // Re-sync the form whenever a fresh save comes back from the server (e.g.
  // after another tab/session edited the same model) — but only while this
  // card is closed, so we never clobber what the user is actively typing.
  useEffect(() => {
    if (!open) setForm(formFromModel(model))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model, open])

  async function submit(e) {
    e.preventDefault()
    setSaving(true)
    try {
      const saved = await api.patron.update(token, model.id, form)
      setForm(formFromModel({ ...model, ...saved }))
      onSaved()
    } finally {
      setSaving(false)
    }
  }

  function addDepenseItem() {
    setForm({ ...form, autresDepensesItems: [...form.autresDepensesItems, { libelle: '', montant: '' }] })
  }
  function updateDepenseItem(i, patch) {
    const items = form.autresDepensesItems.map((it, idx) => (idx === i ? { ...it, ...patch } : it))
    setForm({ ...form, autresDepensesItems: items })
  }
  function removeDepenseItem(i) {
    setForm({ ...form, autresDepensesItems: form.autresDepensesItems.filter((_, idx) => idx !== i) })
  }

  const autresDepensesTotal = form.autresDepensesItems.reduce((sum, it) => sum + (Number(it.montant) || 0), 0)
  const coutOuvriersPreview =
    form.coutOuvriersMode === 'calculated'
      ? (Number(form.nombreOuvriers) || 0) * (Number(form.salaireMoyen) || 0)
      : Number(form.coutOuvriersManuel) || 0

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
        <>
          <form onSubmit={submit} className="mt-4 space-y-4 border-t border-slate-800 pt-4">
            <NumField label="Coût modèle (matières/tissu)" value={form.coutModele} onChange={(v) => setForm({ ...form, coutModele: v })} />

            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <span className="text-xs uppercase tracking-wide text-slate-500">Coût ouvriers</span>
                <div className="flex gap-1.5">
                  {[
                    ['manual', 'Manuel'],
                    ['calculated', 'Nb ouvriers × salaire'],
                  ].map(([mode, label]) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setForm({ ...form, coutOuvriersMode: mode })}
                      className={`rounded border px-2 py-1 text-[11px] ${
                        form.coutOuvriersMode === mode
                          ? 'border-turquoise bg-turquoise/10 text-turquoise'
                          : 'border-slate-700 text-slate-500'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              {form.coutOuvriersMode === 'manual' ? (
                <NumField value={form.coutOuvriersManuel} onChange={(v) => setForm({ ...form, coutOuvriersManuel: v })} />
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <NumField label="Nombre d'ouvriers" value={form.nombreOuvriers} onChange={(v) => setForm({ ...form, nombreOuvriers: v })} />
                  <NumField label="Salaire moyen" value={form.salaireMoyen} onChange={(v) => setForm({ ...form, salaireMoyen: v })} />
                </div>
              )}
              <div className="mt-1 text-xs text-slate-500">
                Total coût ouvriers : <span className="font-mono text-slate-300">{Math.round(coutOuvriersPreview).toLocaleString('fr-FR')}</span>
              </div>
            </div>

            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <span className="text-xs uppercase tracking-wide text-slate-500">Autres dépenses</span>
                <button
                  type="button"
                  onClick={addDepenseItem}
                  className="rounded border border-turquoise/50 px-2 py-1 text-[11px] text-turquoise"
                >
                  + Ajouter un poste
                </button>
              </div>
              {form.autresDepensesItems.length === 0 ? (
                <div className="text-xs text-slate-600">Aucun poste de dépense ajouté.</div>
              ) : (
                <div className="space-y-2">
                  {form.autresDepensesItems.map((item, i) => (
                    <div key={i} className="flex gap-2">
                      <input
                        type="text"
                        value={item.libelle}
                        onChange={(e) => updateDepenseItem(i, { libelle: e.target.value })}
                        placeholder="Libellé (ex: transport)"
                        className="h-10 min-w-0 flex-1 rounded-md border border-slate-700 bg-navy-900 px-2.5 text-sm text-slate-200 focus:border-turquoise focus:outline-none"
                      />
                      <input
                        type="number"
                        inputMode="numeric"
                        value={item.montant}
                        onChange={(e) => updateDepenseItem(i, { montant: e.target.value })}
                        placeholder="Montant"
                        className="h-10 w-28 shrink-0 rounded-md border border-slate-700 bg-navy-900 px-2.5 text-sm text-slate-200 focus:border-turquoise focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => removeDepenseItem(i)}
                        className="h-10 w-10 shrink-0 rounded-md border border-slate-700 text-slate-500 active:bg-navy-800"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div className="mt-1.5 text-xs text-slate-500">
                Total autres dépenses : <span className="font-mono text-slate-300">{Math.round(autresDepensesTotal).toLocaleString('fr-FR')}</span>
              </div>
            </div>

            <NumField
              label="Prix de vente unitaire"
              value={form.prixVenteUnitaire}
              onChange={(v) => setForm({ ...form, prixVenteUnitaire: v })}
            />
            <div className="text-xs text-slate-500">
              Revenu prévisionnel basé sur{' '}
              {model.revenuBasis === 'exportee' ? (
                <>la quantité <span className="text-slate-300">réellement expédiée</span> ({model.qteExportee.toLocaleString('fr-FR')} pièces, Logistics)</>
              ) : (
                <>la quantité <span className="text-slate-300">commandée</span> ({model.qteCommandee.toLocaleString('fr-FR')} pièces — estimation, aucune expédition enregistrée pour le moment)</>
              )}
              .
            </div>

            <div className="grid grid-cols-3 gap-3 rounded-md bg-navy-900/60 p-3 text-sm">
              <Stat label="Coût total" value={model.coutTotal} />
              <Stat label="Revenu" value={model.revenu} />
              <Stat label="Profit" value={model.profit} accent={profitPositive} />
            </div>

            <button
              type="submit"
              disabled={saving}
              className="w-full rounded-md border border-turquoise bg-turquoise/10 py-3.5 text-base font-medium text-turquoise shadow-glow-sm active:bg-turquoise/20 disabled:opacity-50"
            >
              {saving ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          </form>
          <DevisCard token={token} modelId={model.id} />
        </>
      )}
    </GlowCard>
  )
}

function formFromModel(model) {
  return {
    coutModele: model.coutModele,
    coutOuvriersMode: model.coutOuvriersMode || 'manual',
    coutOuvriersManuel: model.coutOuvriersManuel,
    nombreOuvriers: model.nombreOuvriers,
    salaireMoyen: model.salaireMoyen,
    autresDepensesItems: (model.autresDepensesItems || []).map((it) => ({ libelle: it.libelle, montant: it.montant })),
    prixVenteUnitaire: model.prixVenteUnitaire,
  }
}

function NumField({ label, value, onChange }) {
  return (
    <label className="block">
      {label && <span className="mb-1 block text-xs uppercase tracking-wide text-slate-500">{label}</span>}
      <input
        type="number"
        inputMode="numeric"
        value={value || ''}
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
