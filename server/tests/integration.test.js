// Integration tests: start the real Express app against the real Postgres
// DB pointed to by DATABASE_URL (local dev DB — never point this at
// production data) and exercise it over HTTP, the same way a browser would.
// Every test that creates state cleans it up in an `after` hook, and tests
// that touch a shared resource (login attempts, an active chain slot)
// restore whatever was there before the test ran.
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import bcrypt from 'bcryptjs'
import { app } from '../src/app.js'
import { runSeed } from '../src/db/seed.js'
import { get, run, pool } from '../src/db/index.js'
import { incrementDailyUsage, DAILY_LIMIT } from '../src/routes/ask.js'
import { todayInFactoryTZ } from '../src/calc.js'

let server
let base

before(async () => {
  await runSeed()
  server = app.listen(0)
  await new Promise((resolve) => server.once('listening', resolve))
  base = `http://localhost:${server.address().port}/api`
})

after(async () => {
  await new Promise((resolve) => server.close(resolve))
  await pool.end()
})

async function call(path, opts = {}) {
  const res = await fetch(`${base}${path}`, {
    method: opts.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  })
  const data = await res.json().catch(() => null)
  return { status: res.status, data }
}

async function login(deptKey, pin) {
  const { data } = await call(`/auth/${deptKey}/login`, { method: 'POST', body: { pin } })
  return data.token
}

test('connexion par PIN — code correct, code faux, verrouillage après 5 échecs', async (t) => {
  const deptKey = 'test_login_dept'
  const pinHash = bcrypt.hashSync('0000', 10)
  await run(
    `INSERT INTO departments (key, label, icon, pin_hash, failed_attempts, locked_until) VALUES ($1, $2, $3, $4, 0, NULL)
     ON CONFLICT (key) DO UPDATE SET pin_hash = excluded.pin_hash, failed_attempts = 0, locked_until = NULL`,
    [deptKey, 'Test', '🧪', pinHash]
  )
  t.after(async () => run('DELETE FROM departments WHERE key = $1', [deptKey]))

  await t.test('code correct connecte et renvoie un token', async () => {
    const { status, data } = await call(`/auth/${deptKey}/login`, { method: 'POST', body: { pin: '0000' } })
    assert.equal(status, 200)
    assert.ok(typeof data.token === 'string' && data.token.length > 0)
  })

  await t.test('code faux refusé (401)', async () => {
    const { status, data } = await call(`/auth/${deptKey}/login`, { method: 'POST', body: { pin: '9999' } })
    assert.equal(status, 401)
    assert.equal(data.error, 'invalid_pin')
  })

  await t.test('5 échecs verrouillent le compte, même le bon code est refusé ensuite', async () => {
    await run('UPDATE departments SET failed_attempts = 0, locked_until = NULL WHERE key = $1', [deptKey])
    let last
    for (let i = 0; i < 5; i++) {
      last = await call(`/auth/${deptKey}/login`, { method: 'POST', body: { pin: '9999' } })
    }
    assert.equal(last.status, 423)
    assert.equal(last.data.error, 'locked')

    const correctWhileLocked = await call(`/auth/${deptKey}/login`, { method: 'POST', body: { pin: '0000' } })
    assert.equal(correctWhileLocked.status, 423)
  })
})

test('gamme/effectif → ND/VT/DT, sauvegarde production → reflet sur le dashboard, finance Patron', async (t) => {
  const TEST_CHAIN = 8
  const methodeToken = await login('methode', '1111')
  const productionToken = await login('production', '2222')
  const patronToken = await login('patron', '3333')

  const previouslyActive = await get('SELECT id FROM models WHERE chain_number = $1 AND active = 1', [TEST_CHAIN])

  const created = await call('/methode/models', {
    method: 'POST',
    token: methodeToken,
    body: { client: 'TEST_CLIENT', qteTotale: 1000, dessin: 'TEST-1', chainNumber: TEST_CHAIN },
  })
  assert.equal(created.status, 201)
  const modelId = created.data.id

  t.after(async () => {
    await run('DELETE FROM models WHERE id = $1', [modelId]) // cascades to every child table
    await run('DELETE FROM audit_log WHERE model_id = $1', [modelId])
    if (previouslyActive) await run('UPDATE models SET active = 1 WHERE id = $1', [previouslyActive.id])
  })

  await t.test('la gamme + effectif recalculent ND/VT/DT correctement (chiffres connus)', async () => {
    const gamme = await call(`/methode/models/${modelId}/gamme`, {
      method: 'PUT',
      token: methodeToken,
      body: { lines: [{ operation: 'A', machine: 'x', tps: 60 }, { operation: 'B', machine: 'y', tps: 120 }, { operation: 'C', machine: 'z', tps: 180 }] },
    })
    assert.equal(gamme.status, 200)
    assert.ok(Math.abs(gamme.data.vt - 6) < 1e-9) // 360s / 60 = 6 min

    const effectif = await call(`/methode/models/${modelId}/effectif`, {
      method: 'PUT',
      token: methodeToken,
      body: { effectif: { '301': 24 } },
    })
    assert.equal(effectif.status, 200)
    assert.equal(effectif.data.nd, 24)
    assert.ok(Math.abs(effectif.data.dt - 240) < 1e-9) // 24*3600/360 = 240
  })

  await t.test('la production sauvegardée par Agent Production se reflète sur le dashboard public', async () => {
    const put = await call(`/production/models/${modelId}/totals`, {
      method: 'PUT',
      token: productionToken,
      body: { totalEntree: 777 },
    })
    assert.equal(put.status, 200)

    const dashboard = await call(`/chains/${TEST_CHAIN}/dashboard`)
    assert.equal(dashboard.status, 200)
    assert.equal(dashboard.data.bilan.totalEntree, 777)
  })

  await t.test('le calcul de profit/perte Patron est mathématiquement correct', async () => {
    const put = await call(`/patron/models/${modelId}`, {
      method: 'PUT',
      token: patronToken,
      body: {
        coutModele: 10000,
        coutOuvriersMode: 'calculated',
        nombreOuvriers: 5,
        salaireMoyen: 2000,
        autresDepensesItems: [{ libelle: 'Test', montant: 3000 }],
        prixVenteUnitaire: 30,
      },
    })
    assert.equal(put.status, 200)
    // coutTotal = 10000 (modèle) + 5*2000 (ouvriers) + 3000 (autres) = 23000
    assert.equal(put.data.coutTotal, 23000)
    // aucune expédition enregistrée pour ce modèle test → base = qte commandée (1000)
    assert.equal(put.data.revenuBasis, 'commandee')
    assert.equal(put.data.revenu, 30000) // 30 * 1000
    assert.equal(put.data.profit, 7000) // 30000 - 23000
    assert.equal(put.data.profitPct, 23.3) // round(7000/30000 * 1000) / 10
  })
})

// The full /api/ask route can't be driven past the daily-limit check in this
// environment (no real ANTHROPIC_API_KEY means it 503s before ever reaching
// it), so this exercises the counting/limiting logic directly — it's the
// same function and the same DAILY_LIMIT the route enforces.
test('اسأل أطلس: الحد اليومي يوقف الطلبات بعد تجاوزه', async (t) => {
  const date = todayInFactoryTZ()
  const before = await get('SELECT count FROM ask_usage WHERE date = $1', [date])

  t.after(async () => {
    if (before) await run('UPDATE ask_usage SET count = $1 WHERE date = $2', [before.count, date])
    else await run('DELETE FROM ask_usage WHERE date = $1', [date])
  })

  // Reset to a known baseline so the assertions below are exact regardless
  // of how many real questions were already asked today.
  await run(
    `INSERT INTO ask_usage (date, count) VALUES ($1, 0) ON CONFLICT (date) DO UPDATE SET count = 0`,
    [date]
  )

  let last
  for (let i = 1; i <= DAILY_LIMIT; i++) {
    last = await incrementDailyUsage()
    assert.equal(last, i)
  }
  assert.equal(last, DAILY_LIMIT) // pile au plafond — encore autorisé (route: usedToday > DAILY_LIMIT)

  const overLimit = await incrementDailyUsage()
  assert.equal(overLimit, DAILY_LIMIT + 1) // dépasse le plafond — la route renverrait 429 ici
})
