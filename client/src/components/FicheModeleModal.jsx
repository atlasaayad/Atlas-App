import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api, getAnyDeptToken, deptKeyForToken } from '../lib/api'
import LoginPrompt from './LoginPrompt'
import { errorMessage } from '../lib/errors'

// Fiche Modèle — opened from a model's card on Home (public). Everything
// inside requires a department login: without one, only a "Connexion"
// prompt is shown and nothing is fetched. Documents never have a permanent
// URL: "Ouvrir" asks the API for a 2-minute signed link each time.

const PARTS = ['Principal', 'Doublure', 'Poches', 'Col', 'Manche', 'Ceinture']
const FIBERS = ['Coton', 'Polyester', 'Élasthanne', 'Polyamide', 'Viscose', 'Modal', 'Lin', 'Laine', 'Acrylique', 'Soie']
const OTHER = 'Autre'
const MAX_BYTES = 10 * 1024 * 1024
const MIME_BY_EXT = { pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png' }
const TYPE_LABEL = { 'application/pdf': 'PDF', 'image/jpeg': 'JPG', 'image/png': 'PNG' }

const STATUS = {
  terminee: { label: '✓ Terminée', cls: 'border-emerald-500/50 text-emerald-300' },
  en_cours: { label: '● En cours', cls: 'border-turquoise/60 text-turquoise' },
  non_commencee: { label: 'Non commencée', cls: 'border-slate-700 text-slate-400' },
  donnees_insuffisantes: { label: 'Données insuffisantes', cls: 'border-amber-500/50 text-amber-300' },
  planifie: { label: 'Planifié', cls: 'border-sky-500/50 text-sky-300' },
  non_planifie: { label: 'Non planifié', cls: 'border-slate-700 text-slate-400' },
  suivi_modele_principal: { label: 'Suivi sur le modèle principal', cls: 'border-slate-700 text-slate-400' },
}

const ERRORS = {
  unsupported_type: 'Type de fichier non autorisé (PDF, JPG ou PNG uniquement).',
  unsupported_extension: 'Extension non autorisée (.pdf, .jpg, .jpeg, .png).',
  type_extension_mismatch: "L'extension ne correspond pas au type du fichier.",
  file_too_large: 'Fichier trop volumineux (10 Mo maximum).',
  documents_storage_not_configured: 'Stockage des documents non configuré',
  upload_mismatch: 'Le fichier reçu ne correspond pas au fichier déclaré — téléversement annulé.',
  upload_not_found: "Le fichier n'est pas arrivé dans le stockage — réessayez.",
  ticket_expired: 'Autorisation expirée — réessayez.',
  part_total_invalid: 'Chaque partie doit totaliser exactement 100%.',
  duplicate_fiber: 'Une même fibre apparaît deux fois dans la même partie.',
  invalid_percentage: 'Pourcentage invalide (entre 0 et 100, 2 décimales max).',
  part_custom_required: 'Précisez le nom de la partie « Autre ».',
  fiber_custom_required: 'Précisez le nom de la fibre « Autre ».',
  fiber_required: 'Choisissez une fibre pour chaque ligne.',
  storage_error: 'Erreur du stockage des documents — réessayez.',
}

// Fiche-specific codes keep their precise wording; everything else (no
// connection, session expired, server error…) uses the shared messages.
// Errors thrown by the Blob SDK during the direct upload have no HTTP kind.
function errorText(err) {
  if (ERRORS[err?.data?.error]) return ERRORS[err.data.error]
  if (String(err?.name || '').startsWith('Blob')) return ERRORS.storage_error
  return errorMessage(err)
}

function formatDate(value) {
  if (!value) return ''
  const [y, m, d] = String(value).slice(0, 10).split('-')
  return d && m && y ? `${d}/${m}/${y}` : String(value)
}

function formatSize(bytes) {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} Mo`
  return `${Math.max(1, Math.round(bytes / 1024))} Ko`
}

function cleanName(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ')
}

// Same normalization as the server (routes/fiche.js): predefined values are
// matched case-insensitively; custom names are merged case-insensitively.
function groupKey(name) {
  return cleanName(name).toLocaleLowerCase('fr')
}

function toCents(value) {
  const n = Number(String(value ?? '').replace(',', '.'))
  if (String(value ?? '').trim() === '' || !Number.isFinite(n)) return null
  const cents = Math.round(n * 100)
  return Math.abs(cents - n * 100) > 1e-6 ? null : cents
}

export default function FicheModeleModal({ modelId, title, onClose }) {
  const [token, setToken] = useState(() => getAnyDeptToken(['patron', 'methode']))
  const [lastDept, setLastDept] = useState(() => deptKeyForToken(getAnyDeptToken(['patron', 'methode'])))
  const [fiche, setFiche] = useState(null)
  const [error, setError] = useState('')
  // null | 'login' (never logged in on this tab) | 'expired' (a 401 here)
  const [loginReason, setLoginReason] = useState(token ? null : 'login')

  // Any 401 — while loading OR from an action inside the Fiche — opens the
  // PIN pad right here; after login the Fiche reloads by itself.
  const sessionLost = useCallback(() => {
    setFiche(null)
    setLoginReason('expired')
  }, [])

  const load = useCallback(async () => {
    if (!token) return
    try {
      setFiche(await api.fiche.get(token, modelId))
      setError('')
    } catch (err) {
      if (err.status === 401) sessionLost()
      else setError(errorText(err))
    }
  }, [token, modelId, sessionLost])

  useEffect(() => {
    load()
  }, [load])

  function loggedIn(dept, newToken) {
    setLastDept(dept)
    setError('')
    setLoginReason(null)
    setToken(newToken) // → load() runs again
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center sm:p-4" onClick={onClose}>
      <div
        className="max-h-[92vh] w-full max-w-2xl overflow-y-auto overflow-x-hidden rounded-t-lg border border-turquoise/30 bg-navy-900 p-4 sm:rounded-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="font-display text-lg font-semibold text-slate-100">📋 Fiche Modèle</div>
            <div className="break-words text-xs text-slate-400">{fiche ? `${fiche.model.client || ''} · ${fiche.model.dessin || ''}` : title}</div>
          </div>
          <button onClick={onClose} className="flex h-10 w-10 shrink-0 items-center justify-center rounded text-slate-400 active:bg-navy-800" aria-label="Fermer">
            ✕
          </button>
        </div>

        {loginReason ? (
          <LoginPrompt
            preferredDept={loginReason === 'expired' ? lastDept : null}
            expired={loginReason === 'expired'}
            intro="La Fiche Modèle est réservée aux départements connectés. Choisissez votre département et entrez son code PIN."
            onLoggedIn={loggedIn}
          />
        ) : error ? (
          <div className="whitespace-pre-line rounded-md border border-red-500/40 p-3 text-sm text-red-300">{error}</div>
        ) : !fiche ? (
          <div className="py-10 text-center text-sm text-slate-400">Chargement…</div>
        ) : (
          <div className="space-y-4">
            {fiche.model.isVariant && (
              <div className="rounded-md border border-slate-800 bg-navy-950/60 p-3 text-xs text-slate-400">
                Couleur « {fiche.model.variantLabel} » — documents et composition partagés avec le modèle principal (
                {fiche.model.owner.client} · {fiche.model.owner.dessin}).
              </div>
            )}
            <DocumentsSection token={token} fiche={fiche} onChanged={load} onSessionLost={sessionLost} />
            <CompositionSection token={token} fiche={fiche} onSaved={load} onSessionLost={sessionLost} />
            <FactorySection factory={fiche.factory} />
            <TimelineSection token={token} fiche={fiche} onSessionLost={sessionLost} />
          </div>
        )}
      </div>
    </div>
  )
}

function Section({ title, children, action }) {
  return (
    <section className="rounded-md border border-slate-800 bg-navy-950/40 p-3">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-display text-sm font-semibold uppercase tracking-wide text-slate-200">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  )
}

// ---------------------------------------------------------------------------
// 1. Documents techniques client
// ---------------------------------------------------------------------------

function DocumentsSection({ token, fiche, onChanged, onSessionLost }) {
  const inputRef = useRef(null)
  const [busy, setBusy] = useState(null) // 'upload' | doc id
  const [progress, setProgress] = useState(null)
  const [message, setMessage] = useState('')
  const modelId = fiche.model.id
  const configured = fiche.documentsStorageConfigured
  const canManage = fiche.permissions.canManageDocuments

  async function onFile(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setMessage('')
    const ext = /\.([A-Za-z0-9]+)$/.exec(file.name)?.[1]?.toLowerCase()
    const mimeType = MIME_BY_EXT[ext]
    if (!mimeType) return setMessage(ERRORS.unsupported_extension)
    if (file.type && file.type !== mimeType) return setMessage(ERRORS.type_extension_mismatch)
    if (file.size > MAX_BYTES) return setMessage(ERRORS.file_too_large)
    if (file.size === 0) return setMessage('Fichier vide.')

    setBusy('upload')
    setProgress(0)
    try {
      await api.fiche.uploadDocument(token, modelId, file, mimeType, setProgress)
      await onChanged()
    } catch (err) {
      if (err.status === 401) return onSessionLost()
      setMessage(errorText(err))
    } finally {
      setBusy(null)
      setProgress(null)
    }
  }

  async function open(doc) {
    setMessage('')
    // Opened synchronously (inside the click) so the browser doesn't block
    // it as a popup; pointed at the short-lived signed URL once it arrives.
    const tab = window.open('', '_blank')
    try {
      const { url } = await api.fiche.openDocument(token, modelId, doc.id)
      if (tab) {
        tab.opener = null
        tab.location.href = url
      } else window.location.href = url
    } catch (err) {
      tab?.close()
      if (err.status === 401) return onSessionLost()
      setMessage(errorText(err))
    }
  }

  async function remove(doc) {
    if (!window.confirm(`Supprimer définitivement « ${doc.filename} » ?`)) return
    setBusy(doc.id)
    setMessage('')
    try {
      await api.fiche.deleteDocument(token, modelId, doc.id)
      await onChanged()
    } catch (err) {
      if (err.status === 401) return onSessionLost()
      setMessage(errorText(err))
    } finally {
      setBusy(null)
    }
  }

  return (
    <Section
      title="Documents techniques client"
      action={
        canManage &&
        configured && (
          <>
            <input ref={inputRef} type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" className="hidden" onChange={onFile} />
            <button
              onClick={() => inputRef.current?.click()}
              disabled={busy === 'upload'}
              className="h-10 rounded-md border border-turquoise/50 px-4 text-sm font-medium text-turquoise active:bg-turquoise/10 disabled:opacity-50"
            >
              {busy === 'upload' ? `Envoi… ${progress ?? 0}%` : '+ Ajouter un document'}
            </button>
          </>
        )
      }
    >
      {!configured && <p className="mb-2 text-sm text-amber-300">Stockage des documents non configuré</p>}
      {canManage && configured && <p className="mb-2 text-xs text-slate-500">PDF, JPG ou PNG — 10 Mo maximum par fichier.</p>}
      {message && <p className="mb-2 whitespace-pre-line text-sm text-red-300">{message}</p>}
      {fiche.documents.length === 0 ? (
        <p className="text-sm text-slate-500">Aucun document</p>
      ) : (
        <ul className="space-y-2">
          {fiche.documents.map((doc) => (
            <li key={doc.id} className="flex flex-col gap-2 rounded-md border border-slate-800 p-2.5 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <div className="break-all text-sm text-slate-100">
                  {doc.mimeType === 'application/pdf' ? '📄' : '🖼️'} {doc.filename}
                </div>
                <div className="mt-0.5 text-xs text-slate-500">
                  {TYPE_LABEL[doc.mimeType]} · {formatSize(doc.sizeBytes)} · {formatDate(doc.createdAt)}
                </div>
              </div>
              <div className="flex shrink-0 gap-2">
                <button
                  onClick={() => open(doc)}
                  disabled={!configured}
                  className="h-10 flex-1 rounded-md border border-turquoise/50 px-4 text-sm text-turquoise active:bg-turquoise/10 disabled:opacity-40 sm:flex-none"
                >
                  Ouvrir
                </button>
                {canManage && configured && (
                  <button
                    onClick={() => remove(doc)}
                    disabled={busy === doc.id}
                    className="h-10 flex-1 rounded-md border border-red-500/40 px-4 text-sm text-red-300 active:bg-red-500/10 disabled:opacity-40 sm:flex-none"
                  >
                    Supprimer
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Section>
  )
}

// ---------------------------------------------------------------------------
// 2. Composition
// ---------------------------------------------------------------------------

function partTotals(rows) {
  const totals = new Map()
  for (const r of rows) {
    const key = groupKey(r.part) || 'principal'
    const entry = totals.get(key) || { label: cleanName(r.part) || 'Principal', cents: 0, invalid: false }
    const cents = toCents(r.percentage)
    if (cents === null || cents <= 0 || cents > 10000) entry.invalid = true
    else entry.cents += cents
    totals.set(key, entry)
  }
  return [...totals.values()]
}

function CompositionView({ composition }) {
  const groups = useMemo(() => {
    const byPart = new Map()
    for (const r of composition) {
      if (!byPart.has(r.part)) byPart.set(r.part, [])
      byPart.get(r.part).push(r)
    }
    return [...byPart.entries()]
  }, [composition])

  if (composition.length === 0) return <p className="text-sm text-slate-500">Composition non renseignée</p>
  return (
    <div className="space-y-3">
      {groups.map(([part, rows]) => (
        <div key={part}>
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">{part}</div>
          <ul className="space-y-0.5">
            {rows.map((r) => (
              <li key={r.fiber} className="flex justify-between gap-3 text-sm text-slate-200">
                <span className="break-words">{r.fiber}</span>
                <span className="font-mono text-turquoise">{String(r.percentage).replace('.', ',')}%</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}

function toEditorRow(r) {
  const part = PARTS.includes(r.part) ? r.part : OTHER
  const fiber = FIBERS.includes(r.fiber) ? r.fiber : OTHER
  return {
    key: Math.random().toString(36).slice(2),
    part,
    partCustom: part === OTHER ? r.part : '',
    fiber,
    fiberCustom: fiber === OTHER ? r.fiber : '',
    percentage: String(r.percentage ?? '').replace('.', ','),
  }
}

function CompositionSection({ token, fiche, onSaved, onSessionLost }) {
  const [editing, setEditing] = useState(false)
  const [rows, setRows] = useState([])
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  function startEditing() {
    setRows(fiche.composition.length ? fiche.composition.map(toEditorRow) : [toEditorRow({ part: 'Principal', fiber: 'Coton', percentage: '' })])
    setMessage('')
    setEditing(true)
  }

  const resolved = rows.map((r) => ({
    part: r.part === OTHER ? cleanName(r.partCustom) : r.part,
    fiber: r.fiber === OTHER ? cleanName(r.fiberCustom) : r.fiber,
    percentage: r.percentage,
  }))
  const totals = partTotals(resolved)
  const missingCustom = rows.some((r) => (r.part === OTHER && !cleanName(r.partCustom)) || (r.fiber === OTHER && !cleanName(r.fiberCustom)))
  const allValid = !missingCustom && totals.every((t) => !t.invalid && t.cents === 10000)

  function update(key, patch) {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)))
  }

  async function save() {
    setSaving(true)
    setMessage('')
    try {
      await api.fiche.saveComposition(
        token,
        fiche.model.id,
        resolved.map((r) => ({ ...r, percentage: String(r.percentage).replace(',', '.') }))
      )
      await onSaved()
      setEditing(false)
    } catch (err) {
      if (err.status === 401) return onSessionLost()
      setMessage(errorText(err))
    } finally {
      setSaving(false)
    }
  }

  const inputCls = 'h-10 w-full min-w-0 rounded-md border border-slate-700 bg-navy-900 px-2 text-sm text-slate-200 focus:border-turquoise focus:outline-none'

  return (
    <Section
      title="Composition"
      action={
        fiche.permissions.canEditComposition &&
        !editing && (
          <button onClick={startEditing} className="h-10 rounded-md border border-turquoise/50 px-4 text-sm text-turquoise active:bg-turquoise/10">
            Modifier
          </button>
        )
      }
    >
      {!editing ? (
        <CompositionView composition={fiche.composition} />
      ) : (
        <div className="space-y-3">
          {rows.map((r) => (
            <div key={r.key} className="grid grid-cols-2 gap-2 rounded-md border border-slate-800 p-2 sm:grid-cols-[1fr_1fr_6rem_2.5rem]">
              <div className="space-y-1">
                <select value={r.part} onChange={(e) => update(r.key, { part: e.target.value })} className={inputCls} aria-label="Partie">
                  {[...PARTS, OTHER].map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
                {r.part === OTHER && (
                  <input value={r.partCustom} onChange={(e) => update(r.key, { partCustom: e.target.value })} placeholder="Nom de la partie" className={inputCls} />
                )}
              </div>
              <div className="space-y-1">
                <select value={r.fiber} onChange={(e) => update(r.key, { fiber: e.target.value })} className={inputCls} aria-label="Fibre">
                  {[...FIBERS, OTHER].map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </select>
                {r.fiber === OTHER && (
                  <input value={r.fiberCustom} onChange={(e) => update(r.key, { fiberCustom: e.target.value })} placeholder="Nom de la fibre" className={inputCls} />
                )}
              </div>
              <div className="flex items-start gap-1">
                <input
                  value={r.percentage}
                  onChange={(e) => update(r.key, { percentage: e.target.value })}
                  inputMode="decimal"
                  placeholder="%"
                  className={`${inputCls} text-right font-mono`}
                  aria-label="Pourcentage"
                />
                <span className="pt-2.5 text-sm text-slate-500">%</span>
              </div>
              <button
                onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}
                className="h-10 rounded-md border border-red-500/40 text-red-300 active:bg-red-500/10"
                aria-label="Supprimer la ligne"
              >
                ✕
              </button>
            </div>
          ))}

          <button
            onClick={() => setRows((rs) => [...rs, toEditorRow({ part: rs.at(-1)?.part === OTHER ? rs.at(-1).partCustom : rs.at(-1)?.part || 'Principal', fiber: 'Coton', percentage: '' })])}
            className="h-10 w-full rounded-md border border-dashed border-slate-600 text-sm text-slate-300 active:bg-navy-800"
          >
            + Ajouter une fibre
          </button>

          {totals.length > 0 && (
            <ul className="space-y-1 text-sm">
              {totals.map((t) => {
                const ok = !t.invalid && t.cents === 10000
                return (
                  <li key={t.label} className={ok ? 'text-emerald-300' : 'text-amber-300'}>
                    {t.label}: {String(t.cents / 100).replace('.', ',')}% {ok ? '✓' : '⚠'}
                    {t.invalid && ' (pourcentage invalide)'}
                  </li>
                )
              })}
            </ul>
          )}
          {missingCustom && <p className="text-sm text-amber-300">Précisez le nom pour chaque « Autre ».</p>}
          {message && <p className="whitespace-pre-line text-sm text-red-300">{message}</p>}

          <div className="flex gap-2">
            <button
              onClick={save}
              disabled={saving || !allValid}
              className="h-11 flex-1 rounded-md bg-turquoise/90 text-sm font-semibold text-navy-950 disabled:opacity-40"
            >
              {saving ? 'Enregistrement…' : 'Enregistrer'}
            </button>
            <button onClick={() => setEditing(false)} className="h-11 flex-1 rounded-md border border-slate-700 text-sm text-slate-300 active:bg-navy-800">
              Annuler
            </button>
          </div>
        </div>
      )}
    </Section>
  )
}

// ---------------------------------------------------------------------------
// 3. Informations usine (read-only here; edited by Patron in ⚙️ Réglages)
// ---------------------------------------------------------------------------

function FactorySection({ factory }) {
  const fields = [
    ['Raison sociale', factory?.legalName],
    ['ICE', factory?.ice],
    ['Adresse', factory?.address],
    ['Ville', factory?.city],
    ['Pays', factory?.country],
  ]
  const empty = !factory || fields.every(([, v]) => !v)
  return (
    <Section title="Informations usine">
      {empty ? (
        <p className="text-sm text-slate-500">Configuration usine non renseignée</p>
      ) : (
        <dl className="grid grid-cols-1 gap-x-4 gap-y-2 text-sm sm:grid-cols-2">
          {fields.map(([label, value]) => (
            <div key={label} className="min-w-0">
              <dt className="text-xs text-slate-500">{label}</dt>
              <dd className="break-words text-slate-200">{value || '—'}</dd>
            </div>
          ))}
        </dl>
      )}
    </Section>
  )
}

// ---------------------------------------------------------------------------
// 4. Étapes de fabrication
// ---------------------------------------------------------------------------

function stageDetail(stage) {
  const d = stage.detail
  if (!d) return null
  if (stage.key === 'production') return `${d.produced.toLocaleString('fr-FR')}${d.target ? ` / ${d.target.toLocaleString('fr-FR')}` : ''} pièces produites`
  if (stage.key === 'export') return `${d.exported.toLocaleString('fr-FR')}${d.target ? ` / ${d.target.toLocaleString('fr-FR')}` : ''} pièces exportées`
  if (stage.key === 'depot') return `${d.pieces.toLocaleString('fr-FR')} pièces au dépôt`
  return null
}

function TimelineSection({ token, fiche, onSessionLost }) {
  const [colourId, setColourId] = useState(fiche.model.id)
  const [timeline, setTimeline] = useState(fiche.timeline)
  const [loading, setLoading] = useState(false)
  const [pickError, setPickError] = useState('')

  useEffect(() => {
    setTimeline(fiche.timeline)
    setColourId(fiche.model.id)
  }, [fiche])

  async function pick(id) {
    setColourId(id)
    if (id === fiche.model.id) return setTimeline(fiche.timeline)
    setLoading(true)
    setPickError('')
    try {
      setTimeline((await api.fiche.get(token, id)).timeline)
    } catch (err) {
      if (err.status === 401) return onSessionLost()
      setPickError(errorText(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <Section title="Étapes de fabrication">
      {fiche.colours.length > 1 && (
        <div className="mb-3 flex flex-wrap gap-2">
          {fiche.colours.map((c) => (
            <button
              key={c.id}
              onClick={() => pick(c.id)}
              className={`h-9 rounded-full border px-3 text-xs ${colourId === c.id ? 'border-turquoise bg-turquoise/10 text-turquoise' : 'border-slate-700 text-slate-400'}`}
            >
              {c.label}
            </button>
          ))}
        </div>
      )}
      {pickError && <p className="mb-2 whitespace-pre-line text-sm text-red-300">{pickError}</p>}
      {loading ? (
        <div className="py-4 text-center text-sm text-slate-400">Chargement…</div>
      ) : (
        <ol className="space-y-2">
          {timeline.map((s) => {
            const status = STATUS[s.status] || STATUS.non_commencee
            const detail = stageDetail(s)
            const dates = s.start ? (s.end && s.end !== s.start ? `${formatDate(s.start)} → ${formatDate(s.end)}` : s.end ? formatDate(s.start) : `depuis le ${formatDate(s.start)}`) : null
            return (
              <li key={s.key} className="rounded-md border border-slate-800 p-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-medium text-slate-100">{s.label}</span>
                  <span className={`rounded-full border px-2.5 py-0.5 text-xs ${status.cls}`}>{status.label}</span>
                </div>
                {(dates || detail) && (
                  <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-slate-400">
                    {dates && <span className="font-mono">{dates}</span>}
                    {detail && <span>{detail}</span>}
                  </div>
                )}
              </li>
            )
          })}
        </ol>
      )}
      <p className="mt-3 text-xs text-slate-500">
        Les dates indiquent la première et la dernière activité enregistrée. « Terminée » n’apparaît que lorsqu’Atlas l’a explicitement confirmé.
      </p>
    </Section>
  )
}
