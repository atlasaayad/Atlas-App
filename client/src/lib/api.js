const BASE = import.meta.env.VITE_API_BASE_URL || '/api'

function tokenKey(deptKey) {
  return `atlas_token_${deptKey}`
}

// sessionStorage, not localStorage: a department stays "logged in" while its
// browser tab/window stays open (no PIN re-prompt on every click), but
// closing the browser clears it — reopening later, even the same day,
// requires the PIN again. The server-side token itself is still valid for
// its full TOKEN_TTL either way; this only controls how long the *browser*
// remembers it.
export function getDeptToken(deptKey) {
  return sessionStorage.getItem(tokenKey(deptKey))
}

export function setDeptToken(deptKey, token) {
  sessionStorage.setItem(tokenKey(deptKey), token)
}

export function clearDeptToken(deptKey) {
  sessionStorage.removeItem(tokenKey(deptKey))
}

// A dropped/hanging connection (common on a factory floor's WiFi) would
// otherwise leave `fetch` pending indefinitely — the caller's "…" saving
// state never resolving into either a confirmation or an error, which reads
// to the user as the app being frozen. Aborting after REQUEST_TIMEOUT_MS
// guarantees every save settles one way or the other within a bounded time.
const REQUEST_TIMEOUT_MS = 15000

async function request(path, { method = 'GET', body, token, timeoutMs = REQUEST_TIMEOUT_MS } = {}) {
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
    const error = new Error(err.name === 'AbortError' ? 'request_timeout' : 'network_error')
    error.timedOut = err.name === 'AbortError'
    throw error
  } finally {
    clearTimeout(timeoutId)
  }

  let data = null
  try {
    data = await res.json()
  } catch {
    // no body
  }
  if (!res.ok) {
    const error = new Error(data?.error || `request_failed_${res.status}`)
    error.status = res.status
    error.data = data
    throw error
  }
  return data
}

export const api = {
  getConfig: () => request('/config'),
  getDepartments: () => request('/departments'),
  login: (deptKey, pin) => request(`/auth/${deptKey}/login`, { method: 'POST', body: { pin } }),
  getModels: () => request('/models'),
  getChains: () => request('/chains'),
  getModel: (id) => request(`/models/${id}`),
  getDashboard: (id) => request(`/models/${id}/dashboard`),
  getDashboardByChain: (chainNumber) => request(`/chains/${chainNumber}/dashboard`),
  getEarlyWarnings: () => request('/early-warnings'),
  history: {
    day: (chainNumber, date) => request(`/chains/${chainNumber}/history/day?date=${date}`),
    range: (chainNumber, from, to) => request(`/chains/${chainNumber}/history/range?from=${from}&to=${to}`),
    months: (chainNumber, fromYear, fromMonth, toYear, toMonth) =>
      request(`/chains/${chainNumber}/history/months?fromYear=${fromYear}&fromMonth=${fromMonth}&toYear=${toYear}&toMonth=${toMonth}`),
  },

  // Longer timeout: this hits Claude synchronously and a normal reply can
  // take well past the default request timeout.
  ask: (question, chainNumber) => request('/ask', { method: 'POST', body: { question, chainNumber }, timeoutMs: 45000 }),

  methode: {
    createModel: (token, payload) => request('/methode/models', { method: 'POST', body: payload, token }),
    updateModel: (token, id, payload) => request(`/methode/models/${id}`, { method: 'PUT', body: payload, token }),
    updateGamme: (token, id, lines) => request(`/methode/models/${id}/gamme`, { method: 'PUT', body: { lines }, token }),
    updateEffectif: (token, id, effectif) => request(`/methode/models/${id}/effectif`, { method: 'PUT', body: { effectif }, token }),
  },
  production: {
    getHourly: (token, id, date) => request(`/production/models/${id}/hourly?date=${date}`, { token }),
    updateHourly: (token, id, slotIndex, qty, date) =>
      request(`/production/models/${id}/hourly/${slotIndex}`, { method: 'PUT', body: { qty, date }, token }),
    updateTotals: (token, id, totalEntree) => request(`/production/models/${id}/totals`, { method: 'PUT', body: { totalEntree }, token }),
  },
  rh: {
    updateAttendance: (token, id, attendance) => request(`/rh/models/${id}/attendance`, { method: 'PUT', body: { attendance }, token }),
  },
  quality: {
    updateReprises: (token, id, reprises) => request(`/quality/models/${id}`, { method: 'PUT', body: { reprises }, token }),
    getHourly: (token, id, date) => request(`/quality/models/${id}/hourly?date=${date}`, { token }),
    updateHourly: (token, id, slotIndex, pieceRetouche, date) =>
      request(`/quality/models/${id}/hourly/${slotIndex}`, { method: 'PUT', body: { pieceRetouche, date }, token }),
  },
  finale: {
    update: (token, id, payload) => request(`/finale/models/${id}`, { method: 'PUT', body: payload, token }),
  },
  depot: {
    update: (token, id, totalPieces) => request(`/depot/models/${id}`, { method: 'PUT', body: { totalPieces }, token }),
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
    exportData: async (token) => {
      const res = await fetch(`${BASE}/patron/export`, { headers: { Authorization: `Bearer ${token}` } })
      if (!res.ok) throw new Error(`export_failed_${res.status}`)
      return res.blob()
    },
  },
  devis: {
    get: (token, modelId) => request(`/devis/${modelId}`, { token }),
  },
  audit: {
    exportReport: async (token, chainNumber, from, to) => {
      const res = await fetch(`${BASE}/audit/report?chainNumber=${chainNumber}&from=${from}&to=${to}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error(`export_failed_${res.status}`)
      return res.blob()
    },
  },
}
