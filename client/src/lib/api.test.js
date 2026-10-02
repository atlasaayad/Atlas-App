// Unit tests for the request layer (lib/api.js): error classification,
// automatic retry rules, renewed-token swap. Runs in Node with fetch,
// sessionStorage and navigator replaced by small fakes.
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'

const store = new Map()
globalThis.sessionStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
  key: (i) => [...store.keys()][i] ?? null,
  get length() {
    return store.size
  },
}
let online = true
Object.defineProperty(globalThis, 'navigator', { value: { get onLine() { return online } }, configurable: true })

let calls = []
let script = [] // one entry per fetch call: Response | Error | 'hang'
globalThis.fetch = async (url, init) => {
  calls.push({ url, method: init.method, auth: init.headers.Authorization })
  const next = script.shift()
  if (next === 'hang') {
    return new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))))
  }
  if (next instanceof Error) throw next
  return next
}
const json = (status, body, headers = {}) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } })
const html = (status) => new Response('<html>Bad gateway</html>', { status, headers: { 'content-type': 'text/html' } })

const { api, setDeptToken, getDeptToken, __setRetryDelayForTests } = await import('./api.js')
const { errorMessage } = await import('./errors.js')
__setRetryDelayForTests(5, 300)

beforeEach(() => {
  calls = []
  script = []
  online = true
  store.clear()
})

test('classement: hors ligne → "pas de connexion"; en ligne → jamais "pas de connexion"', async () => {
  online = false
  script = [new TypeError('Failed to fetch'), new TypeError('Failed to fetch')]
  let err = await api.getChains().catch((e) => e)
  assert.equal(err.kind, 'offline')
  assert.match(errorMessage(err), /pas de connexion/)

  online = true
  script = [new TypeError('Failed to fetch'), new TypeError('Failed to fetch')] // CORS / blocked / dropped while online
  err = await api.getChains().catch((e) => e)
  assert.equal(err.kind, 'unreachable')
  assert.doesNotMatch(errorMessage(err), /pas de connexion|ما كاينش الاتصال/)
  assert.match(errorMessage(err), /Serveur injoignable/)

  for (const status of [502, 503, 504]) {
    script = [html(status), html(status)] // platform error page, not JSON
    err = await api.getChains().catch((e) => e)
    assert.equal(err.kind, 'waking', String(status))
    assert.match(errorMessage(err), /Le serveur démarre/)
  }

  script = [json(500, { error: 'internal_error' })]
  err = await api.getChains().catch((e) => e)
  assert.equal(err.kind, 'server')
  assert.match(errorMessage(err), /Erreur serveur/)
})

test('délai dépassé (serveur lent / démarrage à froid) → "ne répond pas", pas "pas de connexion"', async () => {
  script = ['hang', 'hang']
  const err = await api.methode.updateGamme('tk', 'm1', []).catch((e) => e)
  assert.equal(err.kind, 'timeout')
  assert.match(errorMessage(err), /ne répond pas/)
  assert.doesNotMatch(errorMessage(err), /pas de connexion/)
})

test('une seule nouvelle tentative pour GET / PUT / DELETE et POST idempotents', async () => {
  script = [html(504), json(200, [{ chainNumber: 1 }])]
  assert.deepEqual(await api.getChains(), [{ chainNumber: 1 }])
  assert.equal(calls.length, 2)

  calls = []
  script = [new TypeError('x'), json(200, { ok: true })]
  await api.depot.update('tk', 'm1', 5, 1)
  assert.equal(calls.length, 2)
  assert.equal(calls[1].method, 'PUT')

  calls = []
  script = [html(503), json(200, { ok: true, status: 'closed' })]
  await api.lifecycle.closeModel('tk', 'm1')
  assert.equal(calls.length, 2)

  calls = []
  script = [html(502), html(502), json(200, {})] // never more than one retry
  await assert.rejects(api.getChains())
  assert.equal(calls.length, 2)
})

test('jamais de doublon: un POST qui crée (modèle, couleur, export, retour) n’est pas relancé', async () => {
  for (const run of [
    () => api.methode.createModel('tk', { client: 'X' }),
    () => api.methode.addVariant('tk', 'm1', 'Rouge', 10),
    () => api.logistics.addExport('tk', 'm1', { quantite: 1 }),
    () => api.feedback.submit('tk', 'msg'),
    () => api.settings.addWorkHour('tk', '16:00', '17:00'),
  ]) {
    calls = []
    script = [html(504), json(201, { id: 'dup' })]
    await assert.rejects(run())
    assert.equal(calls.length, 1)
  }
  // Real errors are never retried either.
  calls = []
  script = [json(400, { error: 'negative_value', message: { ar: 'x', fr: 'y' } })]
  await assert.rejects(api.depot.update('tk', 'm1', -1, 0))
  assert.equal(calls.length, 1)
})

test('session: le jeton renouvelé par le serveur remplace l’ancien, même pour un écran qui garde l’ancien', async () => {
  setDeptToken('methode', 'old-token')
  script = [json(200, { ok: true }, { 'X-Atlas-Token': 'new-token' }), json(200, { ok: true })]
  await api.methode.updateGamme('old-token', 'm1', [])
  assert.equal(getDeptToken('methode'), 'new-token')
  await api.methode.updateGamme('old-token', 'm1', []) // the screen still holds the old one
  assert.equal(calls[1].auth, 'Bearer new-token')
})

test('session: seul un 401 sur un appel authentifié efface le jeton (pas 403, 500, délai, hors ligne)', async () => {
  setDeptToken('production', 'tk')
  for (const r of [json(403, { error: 'wrong_department' }), json(500, {}), html(502)]) {
    script = [r, r]
    await assert.rejects(api.production.updateTotals('tk', 'm1', 1))
    assert.equal(getDeptToken('production'), 'tk')
  }
  online = false
  script = [new TypeError('x'), new TypeError('x')]
  await assert.rejects(api.production.updateTotals('tk', 'm1', 1))
  assert.equal(getDeptToken('production'), 'tk')
  online = true
  script = [json(401, { error: 'pin_rotated' })]
  const err = await api.production.updateTotals('tk', 'm1', 1).catch((e) => e)
  assert.equal(err.kind, 'session')
  assert.equal(getDeptToken('production'), null)
})
