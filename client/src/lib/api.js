const BASE = import.meta.env?.VITE_API_BASE_URL || '/api'

function tokenKey(deptKey) {
  return `atlas_token_${deptKey}`
}

// sessionStorage, not localStorage: the PIN is entered once and the
// department stays logged in while this tab stays open (reloads included);
// closing the tab ends the session. The server renews the token while it
// is used (sliding 24 h, see server/src/auth.js) — renewals are swapped in
// silently by request() below.
export function getDeptToken(deptKey) {
  return sessionStorage.getItem(tokenKey(deptKey))
}

export function setDeptToken(deptKey, token) {
  sessionStorage.setItem(tokenKey(deptKey), token)
}

export function clearDeptToken(deptKey) {
  sessionStorage.removeItem(tokenKey(deptKey))
}

// Expired session (401 on a call that SENT a token: 24 h without any use,
// 7-day maximum reached, or the department's PIN was changed). The token is dropped and every listener
// (DeptGate / SettingsGate) is told, so the PIN pad of that same department
// comes back on top of the form — without unmounting it, so nothing the
// user typed is lost. Public calls never send a token, so the factory TV
// screens can never trigger this, and nothing here retries, so it can't loop.
const sessionExpiredListeners = new Set()

export function onSessionExpired(listener) {
  sessionExpiredListeners.add(listener)
  return () => sessionExpiredListeners.delete(listener)
}

export function deptKeyForToken(token) {
  for (let i = 0; i < sessionStorage.length; i++) {
    const key = sessionStorage.key(i)
    if (key?.startsWith('atlas_token_') && sessionStorage.getItem(key) === token) return key.slice('atlas_token_'.length)
  }
  return null
}

function notifySessionExpired(token) {
  const deptKey = deptKeyForToken(token)
  if (deptKey) clearDeptToken(deptKey)
  for (const listener of sessionExpiredListeners) listener(deptKey)
}

// Any department's token currently held by this browser tab — for the
// endpoints open to whoever is logged in right now, whatever their
// department (Ask Atlas). null when no department has entered its PIN yet.
export function getAnyDeptToken(preferredDeptKeys = []) {
  for (const deptKey of preferredDeptKeys) {
    const token = getDeptToken(deptKey)
    if (token) return token
  }
  for (let i = 0; i < sessionStorage.length; i++) {
    const key = sessionStorage.key(i)
    if (key?.startsWith('atlas_token_')) return sessionStorage.getItem(key)
  }
  return null
}

// The latest token of the department `token` belongs to — screens keep
// the token they got at login in their state, while the server keeps
// handing out renewed ones; every call uses the newest.
function currentToken(token) {
  if (!token) return token
  const deptKey = deptKeyForToken(token) || renewedFrom.get(token)
  return (deptKey && getDeptToken(deptKey)) || token
}
const renewedFrom = new Map() // old token → deptKey, after a renewal

function storeRenewedToken(usedToken, renewed) {
  const deptKey = deptKeyForToken(usedToken) || renewedFrom.get(usedToken)
  if (!deptKey || !renewed) return
  renewedFrom.set(usedToken, deptKey)
  setDeptToken(deptKey, renewed)
}

// Timeout per attempt. A cold start (new Vercel instance + database wake-up)
// can take several seconds; 25 s leaves room for it while Vercel itself
// stops a request at 60 s.
const REQUEST_TIMEOUT_MS = 25000
const SLOW_NOTICE_AFTER_MS = 6000
let retryDelayMs = 1500
let defaultTimeoutMs = REQUEST_TIMEOUT_MS
export function __setRetryDelayForTests(ms, timeoutMs = REQUEST_TIMEOUT_MS) {
  retryDelayMs = ms
  defaultTimeoutMs = timeoutMs
}

// "Connexion lente, nouvel essai…" — how many requests are currently slow
// (pending for more than SLOW_NOTICE_AFTER_MS, or being retried).
const slowListeners = new Set()
let slowCount = 0
export function onSlowRequests(listener) {
  slowListeners.add(listener)
  listener(slowCount)
  return () => slowListeners.delete(listener)
}
function changeSlow(delta) {
  slowCount = Math.max(0, slowCount + delta)
  for (const listener of slowListeners) listener(slowCount)
}

function isOffline() {
  return typeof navigator !== 'undefined' && navigator.onLine === false
}

// Why a request failed BEFORE any HTTP answer (see lib/errors.js):
//   offline     — the device itself has no connection
//   timeout     — no answer within REQUEST_TIMEOUT_MS (slow / waking server)
//   unreachable — online, but the request couldn't get through (blocked,
//                 dropped, DNS…) — never reported as "no connection"
function failureBeforeResponse(err) {
  const kind = isOffline() ? 'offline' : err?.name === 'AbortError' ? 'timeout' : 'unreachable'
  const error = new Error(kind === 'timeout' ? 'request_timeout' : 'network_error')
  error.kind = kind
  error.timedOut = kind === 'timeout'
  return error
}

// Statuses that mean "the server (or the platform in front of it) is not
// ready yet" — waking up, overloaded, or its database not reachable yet.
const WAKING_STATUSES = new Set([502, 503, 504])
const RETRYABLE_KINDS = new Set(['offline', 'timeout', 'unreachable', 'waking'])

// One automatic retry, only for requests that can safely run twice: reads,
// PUT/DELETE (they set a value / remove one), and POSTs explicitly marked
// `retry: true` (closing a model, starting a timer… — all idempotent).
// A POST that creates something is NEVER retried (no duplicates).
// `blob: true` returns the body as a Blob (file downloads) with the same
// error handling as every JSON call.
async function request(path, { method = 'GET', body, token, timeoutMs = defaultTimeoutMs, blob = false, retry } = {}) {
  const canRetry = retry ?? method !== 'POST'
  let slowTimer = null
  let markedSlow = false
  const markSlow = () => {
    if (!markedSlow) {
      markedSlow = true
      changeSlow(1)
    }
  }
  slowTimer = setTimeout(markSlow, SLOW_NOTICE_AFTER_MS)
  try {
    try {
      return await attempt(path, { method, body, token, timeoutMs, blob })
    } catch (err) {
      if (!canRetry || !RETRYABLE_KINDS.has(err.kind)) throw err
      markSlow()
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs))
      return await attempt(path, { method, body, token, timeoutMs, blob })
    }
  } finally {
    clearTimeout(slowTimer)
    if (markedSlow) changeSlow(-1)
  }
}

async function attempt(path, { method, body, token: givenToken, timeoutMs, blob }) {
  const token = currentToken(givenToken)
  const headers = {}
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (token) headers['Authorization'] = `Bearer ${token}`

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

  let res
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    })
  } catch (err) {
    throw failureBeforeResponse(err)
  } finally {
    clearTimeout(timeoutId)
  }

  if (token) storeRenewedToken(token, res.headers.get('X-Atlas-Token'))

  if (blob && res.ok) return res.blob()

  let data = null
  try {
    data = await res.json()
  } catch {
    // no body, or not JSON (e.g. a platform error page)
  }
  if (!res.ok) {
    const error = new Error(data?.error || `request_failed_${res.status}`)
    error.status = res.status
    error.data = data
    error.kind = errorKindForStatus(res.status)
    if (res.status === 401 && token) notifySessionExpired(token)
    throw error
  }
  return data
}

// Fiche Modèle document upload: 1) Atlas authorizes it and picks the
// storage pathname, 2) the file goes STRAIGHT from the browser to the
// private Blob store with a short-lived presigned PUT (never through the
// Atlas API — Vercel's function body limit is ~4.5 MB), 3) Atlas checks
// what really landed there before recording it. The Blob SDK is loaded on
// demand, so the public dashboards never download it.
async function uploadFicheDocument(token, modelId, file, mimeType, onProgress) {
  const { ticket, pathname } = await request(`/models/${modelId}/documents/upload-request`, {
    method: 'POST',
    body: { filename: file.name, mimeType, sizeBytes: file.size },
    token,
    retry: true, // only issues a ticket, creates nothing
  })
  const { uploadPresigned } = await import('@vercel/blob/client')
  await uploadPresigned(pathname, file, {
    access: 'private',
    contentType: mimeType,
    handleUploadUrl: `${BASE}/models/${modelId}/documents/presign`,
    clientPayload: ticket,
    headers: { Authorization: `Bearer ${currentToken(token)}` },
    onUploadProgress: onProgress ? ({ percentage }) => onProgress(percentage) : undefined,
  })
  return request(`/models/${modelId}/documents`, { method: 'POST', body: { ticket }, token, timeoutMs: 30000, retry: true }) // idempotent (same ticket = same document)
}

function errorKindForStatus(status) {
  if (WAKING_STATUSES.has(status)) return 'waking'
  if (status === 401) return 'session'
  if (status === 403) return 'forbidden'
  if (status === 404) return 'not_found'
  if (status === 409) return 'conflict'
  if (status === 423) return 'locked'
  if (status >= 400 && status < 500) return 'invalid'
  return 'server'
}

export const api = {
  getConfig: () => request('/config'),
  getDepartments: () => request('/departments'),
  login: (deptKey, pin) => request(`/auth/${deptKey}/login`, { method: 'POST', body: { pin }, retry: true }),
  getModels: () => request('/models'),
  getChains: () => request('/chains'),
  getEnvironment: () => request('/environment'),
  getRanking: () => request('/chains/ranking'),
  getPersonnelAdmin: (token, date) => request(`/personnel-admin?date=${date}`, { token }),
  getEffectifsOverview: () => request('/effectifs/overview'),
  // Full detail (gamme, effectif, launch team) needs a login; without a
  // token the server returns only the public identity fields.
  getModel: (token, id) => request(`/models/${id}`, { token }),
  getDashboard: (id) => request(`/models/${id}/dashboard`),
  getDashboardByChain: (chainNumber) => request(`/chains/${chainNumber}/dashboard`),
  getChainOpenModels: (chainNumber, kind) =>
    request(`/chains/${chainNumber}/open-models${kind ? `?kind=${kind}` : ''}`),
  lifecycle: {
    getClosePrompts: (token, chainNumber) => request(`/chains/${chainNumber}/close-prompts`, { token }),
    closeModel: (token, id) => request(`/models/${id}/close`, { method: 'POST', token, retry: true }),
    dismissClosePrompt: (token, id) => request(`/models/${id}/close-prompt/dismiss`, { method: 'POST', token, retry: true }),
  },
  getEarlyWarnings: () => request('/early-warnings'),
  history: {
    day: (chainNumber, date) => request(`/chains/${chainNumber}/history/day?date=${date}`),
    range: (chainNumber, from, to) => request(`/chains/${chainNumber}/history/range?from=${from}&to=${to}`),
    months: (chainNumber, fromYear, fromMonth, toYear, toMonth) =>
      request(`/chains/${chainNumber}/history/months?fromYear=${fromYear}&fromMonth=${fromMonth}&toYear=${toYear}&toMonth=${toMonth}`),
  },

  // Longer timeout: this hits Claude synchronously and a normal reply can
  // take well past the default request timeout.
  ask: (question, chainNumber) =>
    request('/ask', { method: 'POST', body: { question, chainNumber }, token: getAnyDeptToken(), timeoutMs: 45000 }),

  methode: {
    createModel: (token, payload) => request('/methode/models', { method: 'POST', body: payload, token }),
    updateModel: (token, id, payload) => request(`/methode/models/${id}`, { method: 'PUT', body: payload, token }),
    getGarmentTypes: (token) => request('/methode/garment-types', { token }),
    addGarmentType: (token, name) => request('/methode/garment-types', { method: 'POST', body: { name }, token }),
    updateGamme: (token, id, lines) => request(`/methode/models/${id}/gamme`, { method: 'PUT', body: { lines }, token }),
    updateEffectif: (token, id, effectif) => request(`/methode/models/${id}/effectif`, { method: 'PUT', body: { effectif }, token }),
    getAttendance: (token, id, date) => request(`/methode/models/${id}/attendance?date=${date}`, { token }),
    updateAttendance: (token, id, attendance, date) =>
      request(`/methode/models/${id}/attendance`, { method: 'PUT', body: { attendance, date }, token }),
    updateLaunchTimer: (token, id, config) => request(`/methode/models/${id}/launch-timer`, { method: 'PUT', body: config, token }),
    startLaunchTimer: (token, id) => request(`/methode/models/${id}/launch-timer/start`, { method: 'POST', token, retry: true }),
    stopLaunchTimer: (token, id, payload) => request(`/methode/models/${id}/launch-timer/stop`, { method: 'POST', body: payload, token, retry: true }),
    addVariant: (token, id, label, qteTotale) =>
      request(`/methode/models/${id}/variants`, { method: 'POST', body: { label, qteTotale }, token }),
    updateVariant: (token, id, variantId, label, qteTotale) =>
      request(`/methode/models/${id}/variants/${variantId}`, { method: 'PUT', body: { label, qteTotale }, token }),
    getPlanning: (token, id) => request(`/methode/models/${id}/planning/all`, { token }),
    updatePlanning: (token, id, date, hourly) =>
      request(`/methode/models/${id}/planning/${date}`, { method: 'PUT', body: { hourly }, token }),
    addPlanningDay: (token, id, date) => request(`/methode/models/${id}/planning/days`, { method: 'POST', body: { date }, token }),
    deletePlanningDay: (token, id, date) => request(`/methode/models/${id}/planning/days/${date}`, { method: 'DELETE', token }),
    uploadModelImage: (token, id, imageBase64) =>
      request(`/methode/models/${id}/image`, { method: 'PUT', body: { imageBase64 }, token, timeoutMs: 30000 }),
    deleteModelImage: (token, id) => request(`/methode/models/${id}/image`, { method: 'DELETE', token }),
  },
  production: {
    getHourly: (token, id, date) => request(`/production/models/${id}/hourly?date=${date}`, { token }),
    updateHourly: (token, id, slotIndex, qty, date, targetModelId) =>
      request(`/production/models/${id}/hourly/${slotIndex}`, { method: 'PUT', body: { qty, date, targetModelId }, token }),
    updateTotals: (token, id, totalEntree) => request(`/production/models/${id}/totals`, { method: 'PUT', body: { totalEntree }, token }),
  },
  rh: {
    getAttendance: (token, id, date) => request(`/rh/models/${id}/attendance?date=${date}`, { token }),
    updateAttendance: (token, id, attendance, date) =>
      request(`/rh/models/${id}/attendance`, { method: 'PUT', body: { attendance, date }, token }),
    updatePersonnelAdmin: (token, date, total) => request('/rh/personnel-admin', { method: 'PUT', body: { date, total }, token }),
  },
  quality: {
    updateReprises: (token, id, reprises) => request(`/quality/models/${id}`, { method: 'PUT', body: { reprises }, token }),
    getHourly: (token, id, date) => request(`/quality/models/${id}/hourly?date=${date}`, { token }),
    updateHourly: (token, id, slotIndex, pieceRetouche, date, targetModelId) =>
      request(`/quality/models/${id}/hourly/${slotIndex}`, { method: 'PUT', body: { pieceRetouche, date, targetModelId }, token }),
  },
  finale: {
    update: (token, id, payload) => request(`/finale/models/${id}`, { method: 'PUT', body: payload, token }),
    updateEffectif: (token, id, effectif) => request(`/finale/models/${id}/effectif`, { method: 'PUT', body: { effectif }, token }),
  },
  depot: {
    update: (token, id, totalPieces, effectifTotal) =>
      request(`/depot/models/${id}`, { method: 'PUT', body: { totalPieces, effectifTotal }, token }),
  },
  logistics: {
    addExport: (token, id, payload) => request(`/logistics/models/${id}/exports`, { method: 'POST', body: payload, token }),
    deleteExport: (token, exportId) => request(`/logistics/exports/${exportId}`, { method: 'DELETE', token }),
  },
  poste: {
    update: (token, id, percentage, note) => request(`/poste/models/${id}`, { method: 'PUT', body: { percentage, note }, token }),
  },
  patron: {
    getModels: (token) => request('/patron/models', { token }),
    update: (token, id, payload) => request(`/patron/models/${id}`, { method: 'PUT', body: payload, token }),
    getAuditLog: (token) => request('/patron/audit-log', { token }),
    getCpm: (token) => request('/patron/cpm', { token }),
    updateCpm: (token, cpm) => request('/patron/cpm', { method: 'PUT', body: { cpm }, token }),
    updatePersonnelAdmin: (token, date, total) => request('/patron/personnel-admin', { method: 'PUT', body: { date, total }, token }),
    exportData: (token) => request('/patron/export', { token, blob: true, timeoutMs: 60000 }),
  },
  devis: {
    get: (token, modelId) => request(`/devis/${modelId}`, { token }),
  },
  audit: {
    exportReport: (token, chainNumber, from, to) =>
      request(`/audit/report?chainNumber=${chainNumber}&from=${from}&to=${to}`, { token, blob: true, timeoutMs: 60000 }),
  },
  settings: {
    getSpecialties: (token, groupKey) => request(`/settings/specialties/${groupKey}`, { token }),
    addSpecialty: (token, groupKey, name) =>
      request(`/settings/specialties/${groupKey}`, { method: 'POST', body: { name }, token }),
    renameSpecialty: (token, groupKey, name, newName) =>
      request(`/settings/specialties/${groupKey}/${encodeURIComponent(name)}`, { method: 'PUT', body: { name: newName }, token }),
    deleteSpecialty: (token, groupKey, name) =>
      request(`/settings/specialties/${groupKey}/${encodeURIComponent(name)}`, { method: 'DELETE', token }),
    getFeedback: (token) => request('/settings/feedback', { token }),
    getWorkHours: (token) => request('/settings/work-hours', { token }),
    addWorkHour: (token, start, end) => request('/settings/work-hours', { method: 'POST', body: { start, end }, token }),
    updateWorkHour: (token, id, start, end) =>
      request(`/settings/work-hours/${id}`, { method: 'PUT', body: { start, end }, token }),
    deleteWorkHour: (token, id) => request(`/settings/work-hours/${id}`, { method: 'DELETE', token }),
  },
  fiche: {
    get: (token, modelId) => request(`/models/${modelId}/fiche`, { token }),
    saveComposition: (token, modelId, rows) =>
      request(`/models/${modelId}/composition`, { method: 'PUT', body: { rows }, token }),
    uploadDocument: uploadFicheDocument,
    openDocument: (token, modelId, docId) => request(`/models/${modelId}/documents/${docId}/open`, { method: 'POST', token, retry: true }),
    deleteDocument: (token, modelId, docId) => request(`/models/${modelId}/documents/${docId}`, { method: 'DELETE', token }),
    getFactory: (token) => request('/factory-info', { token }),
    saveFactory: (token, factory) => request('/factory-info', { method: 'PUT', body: factory, token }),
  },
  feedback: {
    submit: (token, message) => request('/settings/feedback', { method: 'POST', body: { message }, token }),
  },
}
