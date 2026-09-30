import { Router } from 'express'
import jwt from 'jsonwebtoken'
import { nanoid } from 'nanoid'
import { all, get, run, logAudit } from '../db/index.js'
import { requireDept, requireAnyDept } from '../auth.js'
import { GENERIC_POSTE_DEPARTMENTS } from '../constants.js'
import { todayInFactoryTZ } from '../calc.js'
import {
  documentStorage,
  isDocumentStorageConfigured,
  DOCUMENT_MAX_BYTES,
  DOCUMENT_EXTENSIONS,
  UPLOAD_WINDOW_MS,
  READ_URL_TTL_MS,
} from '../documentStorage.js'

// Fiche Modèle — everything here requires a department login; nothing is
// ever added to the public dashboard responses (routes/public.js).
//
// Couleur/Variante: documents and composition belong to the MAIN model and
// are shared by its colours (a colour is resolved to its parent — the
// "owner" — on every request, server-side). The manufacturing timeline is
// NOT shared: it is always computed for the exact model id requested, so
// one colour's production/quality activity never appears on another's.
export const ficheRouter = Router()

const DOCUMENT_MANAGERS = ['methode', 'patron']
const COMPOSITION_EDITORS = ['methode', 'patron']
const FACTORY_EDITORS = ['patron']

// Canonical values (French, to match the rest of the UI). "Autre" is a UI
// choice only: picking it means typing a custom name, which is what gets
// stored — a bare "Autre" is rejected.
export const COMPOSITION_PARTS = ['Principal', 'Doublure', 'Poches', 'Col', 'Manche', 'Ceinture']
export const COMPOSITION_FIBERS = ['Coton', 'Polyester', 'Élasthanne', 'Polyamide', 'Viscose', 'Modal', 'Lin', 'Laine', 'Acrylique', 'Soie']
const MAX_COMPOSITION_ROWS = 50
const MAX_NAME_LENGTH = 40

function httpError(status, code, extra = {}) {
  return Object.assign(new Error(code), { status, code, extra })
}

function sendError(res, err) {
  if (err.status) return res.status(err.status).json({ error: err.code, ...err.extra })
  throw err
}

// The requested model plus its Fiche "owner" (itself, or its parent when
// it is a Couleur/Variante). 404 when the model doesn't exist at all.
async function loadModel(id) {
  const model = await get(
    'SELECT id, client, dessin, qte_totale, status, parent_model_id, variant_label FROM models WHERE id = $1',
    [id]
  )
  if (!model) throw httpError(404, 'not_found')
  return { model, ownerId: model.parent_model_id || model.id }
}

// ---------------------------------------------------------------------------
// Composition
// ---------------------------------------------------------------------------

function cleanName(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ')
}

// Canonical spelling for a predefined value (case-insensitive), otherwise
// the custom name; custom names are de-duplicated case-insensitively too
// (first spelling seen wins), so "doublure" / "DOUBLURE " / "Doublure"
// are one part, and so are "maille" / "Maille".
function canonicalizer(predefined) {
  const byLower = new Map(predefined.map((v) => [v.toLocaleLowerCase('fr'), v]))
  return (name) => {
    const key = name.toLocaleLowerCase('fr')
    if (!byLower.has(key)) byLower.set(key, name)
    return byLower.get(key)
  }
}

function toCents(value) {
  const n = typeof value === 'number' ? value : Number(String(value ?? '').replace(',', '.'))
  if (!Number.isFinite(n)) return null
  const cents = Math.round(n * 100)
  if (Math.abs(cents - n * 100) > 1e-6) return null // more than 2 decimals
  return cents
}

// Throws httpError(400, ...) on anything invalid; returns normalized rows
// (percentage in cents) otherwise. Validation is PER PART: every part used
// must total exactly 100%, independently of the others.
export function normalizeComposition(rows) {
  if (!Array.isArray(rows)) throw httpError(400, 'invalid_composition')
  if (rows.length > MAX_COMPOSITION_ROWS) throw httpError(400, 'too_many_rows')
  const partOf = canonicalizer(COMPOSITION_PARTS)
  const fiberOf = canonicalizer(COMPOSITION_FIBERS)

  const out = []
  rows.forEach((row, index) => {
    const rawPart = cleanName(row?.part) || 'Principal'
    const rawFiber = cleanName(row?.fiber)
    if (rawPart.toLocaleLowerCase('fr') === 'autre') throw httpError(400, 'part_custom_required', { row: index })
    if (!rawFiber) throw httpError(400, 'fiber_required', { row: index })
    if (rawFiber.toLocaleLowerCase('fr') === 'autre') throw httpError(400, 'fiber_custom_required', { row: index })
    if (rawPart.length > MAX_NAME_LENGTH || rawFiber.length > MAX_NAME_LENGTH) throw httpError(400, 'name_too_long', { row: index })
    const cents = toCents(row?.percentage)
    if (cents === null || cents <= 0 || cents > 10000) throw httpError(400, 'invalid_percentage', { row: index })
    out.push({ part: partOf(rawPart), fiber: fiberOf(rawFiber), cents })
  })

  const totals = {}
  const seen = new Set()
  for (const r of out) {
    const key = `${r.part}\u0000${r.fiber}`
    if (seen.has(key)) throw httpError(400, 'duplicate_fiber', { part: r.part, fiber: r.fiber })
    seen.add(key)
    totals[r.part] = (totals[r.part] || 0) + r.cents
  }
  const invalid = Object.entries(totals).filter(([, cents]) => cents !== 10000)
  if (invalid.length > 0) {
    throw httpError(400, 'part_total_invalid', {
      totals: Object.fromEntries(Object.entries(totals).map(([p, c]) => [p, c / 100])),
      invalidParts: invalid.map(([p]) => p),
    })
  }
  return out
}

async function getComposition(ownerId) {
  const rows = await all(
    'SELECT part, fiber, percentage FROM model_composition WHERE model_id = $1 ORDER BY sort_order, created_at',
    [ownerId]
  )
  return rows.map((r) => ({ part: r.part, fiber: r.fiber, percentage: Number(r.percentage) }))
}

ficheRouter.put('/models/:id/composition', requireDept(COMPOSITION_EDITORS), async (req, res) => {
  try {
    const { ownerId } = await loadModel(req.params.id)
    const rows = normalizeComposition(req.body?.rows)
    const now = new Date().toISOString()

    // Replace the whole list in ONE statement (a data-modifying CTE), so a
    // failure can never leave the model with half its old composition.
    const params = [ownerId]
    const values = rows.map((r, i) => {
      params.push(`cmp_${nanoid(12)}`, r.part, r.fiber, (r.cents / 100).toFixed(2), i, now)
      const b = params.length - 6
      return `($${b + 1}, $1, $${b + 2}, $${b + 3}, $${b + 4}::numeric, $${b + 5}, $${b + 6}, $${b + 6})`
    })
    if (values.length === 0) {
      await run('DELETE FROM model_composition WHERE model_id = $1', [ownerId])
    } else {
      await run(
        `WITH removed AS (DELETE FROM model_composition WHERE model_id = $1)
         INSERT INTO model_composition (id, model_id, part, fiber, percentage, sort_order, created_at, updated_at)
         VALUES ${values.join(', ')}`,
        params
      )
    }
    await logAudit({
      deptKey: req.dept,
      modelId: ownerId,
      action: 'update_composition',
      details: { rows: rows.map((r) => ({ part: r.part, fiber: r.fiber, percentage: r.cents / 100 })) },
    })
    res.json({ ok: true, composition: await getComposition(ownerId) })
  } catch (err) {
    sendError(res, err)
  }
})

// ---------------------------------------------------------------------------
// Factory information — one JSON value in config('factory_info')
// ---------------------------------------------------------------------------

const FACTORY_FIELDS = { legalName: 120, ice: 15, address: 200, city: 80, country: 80 }

async function getFactoryInfo() {
  const row = await get('SELECT value FROM config WHERE key = $1', ['factory_info'])
  if (!row?.value) return null
  try {
    return JSON.parse(row.value)
  } catch {
    return null
  }
}

ficheRouter.get('/factory-info', requireAnyDept(), async (req, res) => {
  res.json({ factory: await getFactoryInfo(), canEdit: FACTORY_EDITORS.includes(req.dept) })
})

ficheRouter.put('/factory-info', requireDept(FACTORY_EDITORS), async (req, res) => {
  const body = req.body || {}
  const factory = {}
  for (const [field, max] of Object.entries(FACTORY_FIELDS)) {
    const value = cleanName(body[field])
    if (value.length > max) return res.status(400).json({ error: 'field_too_long', field })
    factory[field] = value
  }
  if (factory.ice && !/^\d{15}$/.test(factory.ice)) return res.status(400).json({ error: 'invalid_ice' })
  if (!factory.country) factory.country = 'Maroc'

  await run(
    `INSERT INTO config (key, value) VALUES ('factory_info', $1) ON CONFLICT (key) DO UPDATE SET value = excluded.value`,
    [JSON.stringify(factory)]
  )
  await logAudit({ deptKey: req.dept, action: 'update_factory_info', details: factory })
  res.json({ ok: true, factory })
})

// ---------------------------------------------------------------------------
// Manufacturing timeline — computed from existing data, never stored.
// ---------------------------------------------------------------------------

export const STAGE_STATUS = {
  NOT_STARTED: 'non_commencee',
  IN_PROGRESS: 'en_cours',
  DONE: 'terminee',
  INSUFFICIENT: 'donnees_insuffisantes',
  PLANNED: 'planifie',
  NOT_PLANNED: 'non_planifie',
  PARENT_LEVEL: 'suivi_modele_principal',
}

function toDate(isoOrDate) {
  if (!isoOrDate) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(isoOrDate)) return isoOrDate
  const d = new Date(isoOrDate)
  return Number.isNaN(d.getTime()) ? null : todayInFactoryTZ(d)
}

function span(dates) {
  const clean = dates.map(toDate).filter(Boolean).sort()
  return clean.length ? { start: clean[0], end: clean[clean.length - 1] } : null
}

// Stages with no explicit completion signal in Atlas: activity => "En
// cours" while the model is open; once it is closed we genuinely can't
// tell whether the stage finished, so "Données insuffisantes" — never
// "Terminée".
function noSignalStatus(activity, model) {
  if (!activity) return STAGE_STATUS.NOT_STARTED
  return model.status === 'closed' ? STAGE_STATUS.INSUFFICIENT : STAGE_STATUS.IN_PROGRESS
}

async function auditDates(modelId, deptKey, actions) {
  const rows = await all(
    'SELECT created_at FROM audit_log WHERE model_id = $1 AND dept_key = $2 AND action = ANY($3)',
    [modelId, deptKey, actions]
  )
  return rows.map((r) => r.created_at)
}

export async function computeTimeline(model) {
  const id = model.id
  const isVariant = Boolean(model.parent_model_id)
  const deptLabels = Object.fromEntries((await all('SELECT key, label FROM departments')).map((d) => [d.key, d.label]))
  const stages = []

  // Stages Atlas only ever records on the MAIN model (the department forms
  // pick the main model, never a colour) — for a colour, say so instead of
  // showing the parent's data or a misleading "Non commencée".
  const parentLevel = (key, label) => ({ key, label, status: STAGE_STATUS.PARENT_LEVEL, start: null, end: null })

  // Lancement — launch_timer: completion = stopped_at (explicit).
  if (isVariant) stages.push(parentLevel('lancement', 'Lancement'))
  else {
    const t = await get('SELECT started_at, stopped_at FROM launch_timer WHERE model_id = $1', [id])
    if (!t?.started_at) stages.push({ key: 'lancement', label: 'Lancement', status: STAGE_STATUS.NOT_STARTED, start: null, end: null })
    else
      stages.push({
        key: 'lancement',
        label: 'Lancement',
        status: t.stopped_at ? STAGE_STATUS.DONE : STAGE_STATUS.IN_PROGRESS,
        start: toDate(t.started_at),
        end: t.stopped_at ? toDate(t.stopped_at) : null,
      })
  }

  // Planning — planned days, not a completion stage.
  if (isVariant) stages.push(parentLevel('planning', 'Planning'))
  else {
    const days = await all('SELECT date FROM planning_days WHERE model_id = $1', [id])
    const s = span(days.map((d) => d.date))
    stages.push({ key: 'planning', label: 'Planning', status: s ? STAGE_STATUS.PLANNED : STAGE_STATUS.NOT_PLANNED, start: s?.start ?? null, end: s?.end ?? null })
  }

  // Coupe / Magasin / Mécanicien / Échantillon — "État du poste %" is the
  // post's health, not progress: activity only, never completion.
  for (const deptKey of GENERIC_POSTE_DEPARTMENTS) {
    const label = deptLabels[deptKey] || deptKey
    if (isVariant) {
      stages.push(parentLevel(deptKey, label))
      continue
    }
    const poste = await get('SELECT updated_at FROM poste_status WHERE model_id = $1 AND dept_key = $2', [id, deptKey])
    const s = span([poste?.updated_at, ...(await auditDates(id, deptKey, ['update_poste_status']))])
    stages.push({ key: deptKey, label, status: noSignalStatus(s, model), start: s?.start ?? null, end: s?.end ?? null })
  }

  // Production — this model's own hourly entries (qty > 0). Completion =
  // the model was closed (Méthode/Patron confirmed the series is finished).
  {
    const r = await get(
      'SELECT MIN(date) AS first, MAX(date) AS last, COALESCE(SUM(qty), 0) AS total FROM production_history WHERE model_id = $1 AND qty > 0',
      [id]
    )
    const active = Boolean(r?.first)
    stages.push({
      key: 'production',
      label: 'Production',
      status: !active ? STAGE_STATUS.NOT_STARTED : model.status === 'closed' ? STAGE_STATUS.DONE : STAGE_STATUS.IN_PROGRESS,
      start: r?.first ?? null,
      end: r?.last ?? null,
      detail: active ? { produced: Number(r.total), target: Number(model.qte_totale) || null } : null,
    })
  }

  // Qualité — this model's own hourly quality entries. Atlas has no
  // explicit quality completion signal, and closing the model is NOT one:
  // activity => "En cours", always.
  {
    const r = await get('SELECT MIN(date) AS first, MAX(date) AS last FROM quality_history WHERE model_id = $1', [id])
    stages.push({
      key: 'qualite',
      label: 'Qualité',
      status: r?.first ? STAGE_STATUS.IN_PROGRESS : STAGE_STATUS.NOT_STARTED,
      start: r?.first ?? null,
      end: r?.last ?? null,
    })
  }

  // Finale (repassage + contrôle live inside it). The finale row itself is
  // pre-created (all zeros) with the model, so its existence is NOT
  // activity: only Finale's own saves, or non-zero entered values, are.
  if (isVariant) stages.push(parentLevel('finale', deptLabels.finale || 'Finale'))
  else {
    const f = await get(
      `SELECT updated_at, (en_cours + piece_retouche + piece_terminee + piece_2eme + encours_special + encours_repassage + encours_controle) AS entered
       FROM finale WHERE model_id = $1`,
      [id]
    )
    const s = span([Number(f?.entered) > 0 ? f.updated_at : null, ...(await auditDates(id, 'finale', ['update_finale', 'update_finale_effectif']))])
    stages.push({ key: 'finale', label: deptLabels.finale || 'Finale', status: noSignalStatus(s, model), start: s?.start ?? null, end: s?.end ?? null })
  }

  // Dépôt — same rule as Finale (pre-created row).
  if (isVariant) stages.push(parentLevel('depot', deptLabels.depot || 'Dépôt'))
  else {
    const d = await get('SELECT updated_at, total_pieces, effectif_total FROM depot WHERE model_id = $1', [id])
    const entered = Number(d?.total_pieces) > 0 || Number(d?.effectif_total) > 0
    const s = span([entered ? d.updated_at : null, ...(await auditDates(id, 'depot', ['update_depot']))])
    stages.push({
      key: 'depot',
      label: deptLabels.depot || 'Dépôt',
      status: noSignalStatus(s, model),
      start: s?.start ?? null,
      end: s?.end ?? null,
      detail: s ? { pieces: Number(d?.total_pieces) || 0 } : null,
    })
  }

  // Export — logistics_exports. Pieces exported vs. total is shown as a
  // fact, never turned into "Terminée".
  if (isVariant) stages.push(parentLevel('export', 'Export'))
  else {
    const r = await get(
      'SELECT MIN(date) AS first, MAX(date) AS last, COALESCE(SUM(quantite), 0) AS total, COUNT(*) AS n FROM logistics_exports WHERE model_id = $1',
      [id]
    )
    const hasExports = Number(r?.n) > 0
    const s = span([r?.first, r?.last])
    stages.push({
      key: 'export',
      label: 'Export',
      status: noSignalStatus(hasExports, model),
      start: s?.start ?? null,
      end: s?.end ?? null,
      detail: hasExports ? { exported: Number(r.total), target: Number(model.qte_totale) || null } : null,
    })
  }

  return stages
}

// ---------------------------------------------------------------------------
// Fiche (read) — any logged-in department
// ---------------------------------------------------------------------------

function documentView(d) {
  // Metadata only — never the storage pathname or any URL.
  return { id: d.id, filename: d.filename, mimeType: d.mime_type, sizeBytes: d.size_bytes, uploadedBy: d.uploaded_by, createdAt: d.created_at }
}

ficheRouter.get('/models/:id/fiche', requireAnyDept(), async (req, res) => {
  try {
    const { model, ownerId } = await loadModel(req.params.id)
    const owner = ownerId === model.id ? model : await get('SELECT id, client, dessin FROM models WHERE id = $1', [ownerId])
    const [documents, composition, factory, timeline, colours] = await Promise.all([
      all('SELECT * FROM model_documents WHERE model_id = $1 ORDER BY created_at DESC', [ownerId]),
      getComposition(ownerId),
      getFactoryInfo(),
      computeTimeline(model),
      all('SELECT id, variant_label FROM models WHERE parent_model_id = $1 AND active = 1 ORDER BY created_at', [ownerId]),
    ])
    res.json({
      model: {
        id: model.id,
        client: model.client,
        dessin: model.dessin,
        status: model.status,
        isVariant: Boolean(model.parent_model_id),
        variantLabel: model.variant_label || null,
        owner: { id: owner.id, client: owner.client, dessin: owner.dessin },
      },
      // The main model + its colours, for the timeline's colour picker.
      colours: [{ id: ownerId, label: 'Principal' }, ...colours.map((c) => ({ id: c.id, label: c.variant_label || c.id }))],
      documents: documents.map(documentView),
      documentsStorageConfigured: isDocumentStorageConfigured(),
      composition,
      factory,
      timeline,
      permissions: {
        canManageDocuments: DOCUMENT_MANAGERS.includes(req.dept),
        canEditComposition: COMPOSITION_EDITORS.includes(req.dept),
        canEditFactory: FACTORY_EDITORS.includes(req.dept),
      },
    })
  } catch (err) {
    sendError(res, err)
  }
})

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------

const TICKET_TYPE = 'fiche_doc_upload'

function extensionOf(filename) {
  const m = /\.([A-Za-z0-9]+)$/.exec(filename)
  return m ? m[1].toLowerCase() : null
}

function requireStorage() {
  if (!isDocumentStorageConfigured()) throw httpError(503, 'documents_storage_not_configured')
}

// The ticket ties one upload to one model, one server-generated pathname,
// one declared filename/type/size, for UPLOAD_WINDOW_MS. Signed with the
// app's JWT secret (never sent anywhere but back to this API), and typed so
// it can never be mistaken for a login token (it has no `dept`/`pv`).
function signTicket(payload) {
  return jwt.sign({ typ: TICKET_TYPE, ...payload }, process.env.JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: Math.floor(UPLOAD_WINDOW_MS / 1000),
  })
}

function verifyTicket(ticket, ownerId) {
  let payload
  try {
    payload = jwt.verify(String(ticket || ''), process.env.JWT_SECRET, { algorithms: ['HS256'] })
  } catch (err) {
    throw httpError(400, err?.name === 'TokenExpiredError' ? 'ticket_expired' : 'invalid_ticket')
  }
  if (payload.typ !== TICKET_TYPE) throw httpError(400, 'invalid_ticket')
  if (payload.mid !== ownerId) throw httpError(400, 'ticket_model_mismatch')
  return payload
}

// Step 1 — authorize an upload. Validates everything the browser declared
// and hands back a ticket + the pathname the server chose.
ficheRouter.post('/models/:id/documents/upload-request', requireDept(DOCUMENT_MANAGERS), async (req, res) => {
  try {
    requireStorage()
    const { ownerId } = await loadModel(req.params.id)
    const filename = cleanName(req.body?.filename).slice(0, 200)
    const mimeType = String(req.body?.mimeType || '')
    const sizeBytes = Number(req.body?.sizeBytes)
    if (!filename) throw httpError(400, 'filename_required')
    if (!DOCUMENT_EXTENSIONS[mimeType]) throw httpError(400, 'unsupported_type')
    const ext = extensionOf(filename)
    if (!ext || !Object.values(DOCUMENT_EXTENSIONS).flat().includes(ext)) throw httpError(400, 'unsupported_extension')
    if (!DOCUMENT_EXTENSIONS[mimeType].includes(ext)) throw httpError(400, 'type_extension_mismatch')
    if (!Number.isInteger(sizeBytes) || sizeBytes <= 0) throw httpError(400, 'invalid_size')
    if (sizeBytes > DOCUMENT_MAX_BYTES) throw httpError(400, 'file_too_large', { maxBytes: DOCUMENT_MAX_BYTES })

    const pathname = `model-docs/${ownerId}/${nanoid(32)}.${DOCUMENT_EXTENSIONS[mimeType][0]}`
    const expiresAt = Date.now() + UPLOAD_WINDOW_MS
    const ticket = signTicket({ mid: ownerId, p: pathname, fn: filename, ct: mimeType, sz: sizeBytes, by: req.dept })
    res.json({ ticket, pathname, expiresAt })
  } catch (err) {
    sendError(res, err)
  }
})

// Step 2 — the handshake route @vercel/blob/client's uploadPresigned()
// calls (handleUploadUrl). Only 'blob.generate-presigned-url' is accepted,
// only for the ticket's own pathname, and the presigned PUT is limited to
// the ticket's content type and exact size and expires with the ticket.
ficheRouter.post('/models/:id/documents/presign', requireDept(DOCUMENT_MANAGERS), async (req, res) => {
  try {
    requireStorage()
    const { ownerId } = await loadModel(req.params.id)
    const body = req.body || {}
    if (body.type !== 'blob.generate-presigned-url') throw httpError(400, 'invalid_event')
    const ticket = verifyTicket(body.payload?.clientPayload, ownerId)
    if (body.payload?.pathname !== ticket.p) throw httpError(400, 'pathname_mismatch')
    if (body.payload?.multipart) throw httpError(400, 'multipart_not_supported')

    const result = await documentStorage().presignUpload({
      body,
      request: req,
      pathname: ticket.p,
      contentType: ticket.ct,
      sizeBytes: ticket.sz,
      validUntil: ticket.exp * 1000,
    })
    res.json(result)
  } catch (err) {
    if (!err.status) console.error('document presign failed:', err)
    if (!err.status) return res.status(502).json({ error: 'storage_error' })
    sendError(res, err)
  }
})

// Step 3 — confirm. Only now does a row exist, and only if what is really
// in the store matches the ticket; anything else is deleted from storage.
ficheRouter.post('/models/:id/documents', requireDept(DOCUMENT_MANAGERS), async (req, res) => {
  try {
    requireStorage()
    const { ownerId } = await loadModel(req.params.id)
    const ticket = verifyTicket(req.body?.ticket, ownerId)

    let stored
    try {
      stored = await documentStorage().stat(ticket.p)
    } catch (err) {
      console.error('document confirm: storage lookup failed:', err)
      return res.status(502).json({ error: 'storage_error' })
    }
    if (!stored) throw httpError(400, 'upload_not_found')
    const storedType = String(stored.contentType || '').split(';')[0].trim()
    if (stored.size !== ticket.sz || stored.size > DOCUMENT_MAX_BYTES || storedType !== ticket.ct) {
      await documentStorage()
        .remove(ticket.p)
        .catch((err) => console.error('document confirm: cleanup of rejected upload failed:', err))
      throw httpError(400, 'upload_mismatch')
    }

    const existing = await get('SELECT * FROM model_documents WHERE storage_pathname = $1', [ticket.p])
    if (existing) {
      if (existing.model_id !== ownerId) throw httpError(400, 'ticket_model_mismatch')
      return res.json({ ok: true, document: documentView(existing) }) // same confirm retried
    }

    const id = `doc_${nanoid(16)}`
    const now = new Date().toISOString()
    await run(
      `INSERT INTO model_documents (id, model_id, filename, storage_pathname, mime_type, size_bytes, uploaded_by, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [id, ownerId, ticket.fn, ticket.p, ticket.ct, ticket.sz, req.dept, now]
    )
    await logAudit({ deptKey: req.dept, modelId: ownerId, action: 'upload_document', details: { documentId: id, filename: ticket.fn, sizeBytes: ticket.sz } })
    const doc = await get('SELECT * FROM model_documents WHERE id = $1', [id])
    res.status(201).json({ ok: true, document: documentView(doc) })
  } catch (err) {
    sendError(res, err)
  }
})

async function loadDocument(req) {
  const { ownerId } = await loadModel(req.params.id)
  // Looked up by (document id, owner model id) TOGETHER: another model's
  // document id is simply "not found" here.
  const doc = await get('SELECT * FROM model_documents WHERE id = $1 AND model_id = $2', [req.params.docId, ownerId])
  if (!doc) throw httpError(404, 'document_not_found')
  return { ownerId, doc }
}

// Open/read — a presigned GET URL for this one file, valid READ_URL_TTL_MS.
ficheRouter.post('/models/:id/documents/:docId/open', requireAnyDept(), async (req, res) => {
  try {
    requireStorage()
    const { ownerId, doc } = await loadDocument(req)
    const expiresAt = Date.now() + READ_URL_TTL_MS
    let url
    try {
      url = await documentStorage().signedReadUrl(doc.storage_pathname, expiresAt)
    } catch (err) {
      console.error('document open: signing failed:', err)
      return res.status(502).json({ error: 'storage_error' })
    }
    await logAudit({ deptKey: req.dept, modelId: ownerId, action: 'open_document', details: { documentId: doc.id } })
    res.json({ url, expiresAt })
  } catch (err) {
    sendError(res, err)
  }
})

// Delete — storage first; the row is only removed once the file is gone,
// so a storage failure leaves a retryable row rather than an orphan file.
ficheRouter.delete('/models/:id/documents/:docId', requireDept(DOCUMENT_MANAGERS), async (req, res) => {
  try {
    requireStorage()
    const { ownerId, doc } = await loadDocument(req)
    try {
      await documentStorage().remove(doc.storage_pathname)
    } catch (err) {
      console.error('document delete: storage removal failed:', err)
      return res.status(502).json({ error: 'storage_error' })
    }
    await run('DELETE FROM model_documents WHERE id = $1 AND model_id = $2', [doc.id, ownerId])
    await logAudit({ deptKey: req.dept, modelId: ownerId, action: 'delete_document', details: { documentId: doc.id, filename: doc.filename } })
    res.json({ ok: true })
  } catch (err) {
    sendError(res, err)
  }
})
