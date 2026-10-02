// Integration tests: start the real Express app against the real Postgres
// DB pointed to by DATABASE_URL (local dev DB — never point this at
// production data) and exercise it over HTTP, the same way a browser would.
// Every test that creates state cleans it up in an `after` hook, and tests
// that touch a shared resource (login attempts, an active chain slot)
// restore whatever was there before the test ran.
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import bcrypt from 'bcryptjs'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import ExcelJS from 'exceljs'
import { app } from '../src/app.js'
import { isOriginAllowed } from '../src/cors.js'
import jwt from 'jsonwebtoken'
import crypto from 'node:crypto'
import { presignUrl } from '@vercel/blob'
import { setDocumentStorageForTests, DOCUMENT_MAX_BYTES } from '../src/documentStorage.js'
import { runSeed, productionPinWarning } from '../src/db/seed.js'
import { get, run, all, pool, migrateModelStatus, dropRemovedPredictTables } from '../src/db/index.js'
import { incrementDailyUsage, DAILY_LIMIT } from '../src/routes/ask.js'
import { todayInFactoryTZ, prodAMaintenant, computeQualityPct, computeRendementProduction, computeScoreRendement } from '../src/calc.js'
import { SPECIALTIES, HOURLY_SLOTS } from '../src/constants.js'

// Matches exactly what seedWorkHours() seeds a fresh DB with (from the same
// HOURLY_SLOTS constant) — used only to independently recompute an expected
// prodAMaintenant() value in assertions below, mirroring the live
// work_hours table's shape (getWorkHours()'s {index, label, start, end}).
const TEST_WORK_HOURS = HOURLY_SLOTS.map((s, i) => {
  const [start, end] = s.label.split('-')
  return { index: i, label: s.label, start, end }
})

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
      ...(opts.headers || {}),
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
  await run('DELETE FROM login_attempts WHERE dept_key = $1', [deptKey])
  t.after(async () => {
    await run('DELETE FROM departments WHERE key = $1', [deptKey])
    await run('DELETE FROM login_attempts WHERE dept_key = $1', [deptKey])
  })

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
    await run('DELETE FROM login_attempts WHERE dept_key = $1', [deptKey])
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
      body: { effectif: { Machinistes: 24 } },
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

  await t.test('وكيل الإنذار المبكر: لا إنذار مع بيانات جزئية، يظهر مع تراجع حقيقي، ويختفي تلقائياً عند التحسّن', async () => {
    async function putHourly(slotIndex, qty) {
      const res = await call(`/production/models/${modelId}/hourly/${slotIndex}`, {
        method: 'PUT',
        token: productionToken,
        body: { qty },
      })
      assert.equal(res.status, 200)
    }
    async function warningForTestChain() {
      const res = await call('/early-warnings')
      assert.equal(res.status, 200)
      return res.data.warnings.find((w) => w.chainNumber === TEST_CHAIN)
    }

    // ساعة واحدة فقط مسجلة — بيانات ناقصة، ما يظهر أي إنذار.
    await putHourly(0, 140)
    assert.equal(await warningForTestChain(), undefined)

    // ساعتان — لسه ناقصة (يحتاج 3 على الأقل).
    await putHourly(1, 120)
    assert.equal(await warningForTestChain(), undefined)

    // 3 ساعات متتالية بتراجع حقيقي وصريح (140 → 120 → 90).
    await putHourly(2, 90)
    const warning = await warningForTestChain()
    assert.ok(warning)
    assert.equal(warning.hoursDeclining, 3)
    assert.equal(warning.startQty, 140)
    assert.equal(warning.currentQty, 90)

    // الإنتاج يتحسّن بالساعة التالية — الإنذار يختفي تلقائياً بدون أي إلغاء يدوي.
    await putHourly(3, 200)
    assert.equal(await warningForTestChain(), undefined)
  })
})

test('منتقي التاريخ لـAgent Production: تعديل يوم سابق، التحقق من النطاق، وانعكاس فوري على كل مكان', async (t) => {
  const TEST_CHAIN = 8
  const methodeToken = await login('methode', '1111')
  const productionToken = await login('production', '2222')

  const previouslyActive = await get('SELECT id FROM models WHERE chain_number = $1 AND active = 1', [TEST_CHAIN])

  function daysAgo(n) {
    const d = new Date()
    d.setUTCDate(d.getUTCDate() - n)
    return d.toISOString().slice(0, 10)
  }
  const today = todayInFactoryTZ()
  const yesterday = daysAgo(1)
  const debut = daysAgo(5)
  const beforeDebut = daysAgo(6)
  const tomorrow = daysAgo(-1)

  const created = await call('/methode/models', {
    method: 'POST',
    token: methodeToken,
    body: { client: 'TEST_DATEPICKER', qteTotale: 5000, dessin: 'TEST-DP', chainNumber: TEST_CHAIN, debut },
  })
  assert.equal(created.status, 201)
  const modelId = created.data.id

  t.after(async () => {
    await run('DELETE FROM models WHERE id = $1', [modelId]) // cascades, including production_history
    await run('DELETE FROM audit_log WHERE model_id = $1', [modelId])
    if (previouslyActive) await run('UPDATE models SET active = 1 WHERE id = $1', [previouslyActive.id])
  })

  await t.test('لا بيانات ليوم سابق بعد → كل الساعات صفر', async () => {
    const res = await call(`/production/models/${modelId}/hourly?date=${yesterday}`, { token: productionToken })
    assert.equal(res.status, 200)
    assert.equal(res.data.date, yesterday)
    assert.ok(res.data.hourly.every((h) => h.qty === 0))
  })

  await t.test('حفظ ساعة ليوم سابق: يُقبل، يُعلَّم كتعديل بأثر رجعي، وينحفظ فعلياً', async () => {
    const put = await call(`/production/models/${modelId}/hourly/0`, {
      method: 'PUT',
      token: productionToken,
      body: { qty: 130, date: yesterday },
    })
    assert.equal(put.status, 200)
    assert.equal(put.data.date, yesterday)
    assert.equal(put.data.isBackdated, true)

    const reloaded = await call(`/production/models/${modelId}/hourly?date=${yesterday}`, { token: productionToken })
    assert.equal(reloaded.data.hourly.find((h) => h.index === 0).qty, 130)

    const log = await get(
      `SELECT details FROM audit_log WHERE model_id = $1 AND action = 'update_hourly' ORDER BY created_at DESC LIMIT 1`,
      [modelId]
    )
    const details = JSON.parse(log.details)
    assert.equal(details.date, yesterday)
    assert.equal(details.isBackdated, true)
  })

  await t.test('تعديل رقم موجود أصلاً بيوم سابق ينعكس فوراً', async () => {
    await call(`/production/models/${modelId}/hourly/0`, {
      method: 'PUT',
      token: productionToken,
      body: { qty: 999, date: yesterday },
    })
    const reloaded = await call(`/production/models/${modelId}/hourly?date=${yesterday}`, { token: productionToken })
    assert.equal(reloaded.data.hourly.find((h) => h.index === 0).qty, 999)
  })

  await t.test('أرشيف Historique ليوم الأمس يعكس القيمة الجديدة فوراً', async () => {
    const hist = await call(`/chains/${TEST_CHAIN}/history/day?date=${yesterday}`)
    assert.equal(hist.status, 200)
    assert.equal(hist.data.total, 999)
    assert.equal(hist.data.recordsCount, 1)
  })

  await t.test('تعديل يوم سابق ما يؤثر على لوحة اليوم الحالي', async () => {
    const dashboard = await call(`/chains/${TEST_CHAIN}/dashboard`)
    assert.equal(dashboard.status, 200)
    assert.ok(dashboard.data.hourly.every((h) => h.qty === 0)) // اليوم لسه ما فيه أي إدخال
  })

  await t.test('حفظ ساعة لليوم الحالي فعلاً ينعكس على اللوحة الحية (production_history هو مصدر الحقيقة الوحيد)', async () => {
    const put = await call(`/production/models/${modelId}/hourly/2`, {
      method: 'PUT',
      token: productionToken,
      body: { qty: 250, date: today },
    })
    assert.equal(put.status, 200)
    assert.equal(put.data.isBackdated, false)

    const dashboard = await call(`/chains/${TEST_CHAIN}/dashboard`)
    assert.equal(dashboard.data.hourly.find((h) => h.index === 2).qty, 250)
    // prodAMaintenant تحسب من نفس المصدر، لكن حسب الساعة الحالية فعلياً (لو
    // الاختبار اشتغل قبل بداية الدوام 6:30، الناتج صفر بشكل صحيح) — نحسب
    // القيمة المتوقعة بنفس الدالة الحقيقية بدل افتراض توقيت ثابت.
    assert.equal(dashboard.data.produit, prodAMaintenant({ 2: 250 }, TEST_WORK_HOURS))
  })

  await t.test('Total sortie/Le reste/En cours بـBilan de la chaîne يجمعون كل الأيام من Début — مو يوم واحد فقط', async () => {
    // Yesterday already has slot 0 = 999 (from the earlier subtest); add one
    // more hour so "yesterday" has real two-hour data, same as today below.
    await call(`/production/models/${modelId}/hourly/1`, {
      method: 'PUT',
      token: productionToken,
      body: { qty: 50, date: yesterday },
    })
    // Today already has slot 2 = 250; add a second hour.
    await call(`/production/models/${modelId}/hourly/3`, {
      method: 'PUT',
      token: productionToken,
      body: { qty: 75, date: today },
    })
    await call(`/production/models/${modelId}/totals`, {
      method: 'PUT',
      token: productionToken,
      body: { totalEntree: 2000 },
    })

    const dashboard = await call(`/chains/${TEST_CHAIN}/dashboard`)
    assert.equal(dashboard.status, 200)
    // Total sortie = all four recorded hours combined: yesterday's
    // 999 + 50 plus today's 250 + 75 = 1374 — not just today's 325.
    assert.equal(dashboard.data.bilan.totalSortie, 1374)
    assert.equal(dashboard.data.bilan.totalEntree, 2000)
    assert.equal(dashboard.data.bilan.enCours, 2000 - 1374) // 626
    assert.equal(dashboard.data.bilan.leReste, 5000 - 1374) // 3626, based on qte_totale
    // "Prod à maintenant" / "Produit" must stay today-only, unaffected by
    // the whole-life Total sortie fix above. Computed dynamically (not
    // hardcoded to 325) so this doesn't depend on what time of day the
    // test happens to run — before 6:30 the real app also legitimately
    // reports 0, no matter what's recorded.
    assert.equal(dashboard.data.produit, prodAMaintenant({ 2: 250, 3: 75 }, TEST_WORK_HOURS))
  })

  await t.test('رفض تاريخ مستقبلي', async () => {
    const put = await call(`/production/models/${modelId}/hourly/0`, {
      method: 'PUT',
      token: productionToken,
      body: { qty: 50, date: tomorrow },
    })
    assert.equal(put.status, 400)
    assert.equal(put.data.error, 'date_in_future')
  })

  await t.test('رفض تاريخ قبل Début الموديل', async () => {
    const put = await call(`/production/models/${modelId}/hourly/0`, {
      method: 'PUT',
      token: productionToken,
      body: { qty: 50, date: beforeDebut },
    })
    assert.equal(put.status, 400)
    assert.equal(put.data.error, 'date_before_debut')
  })
})

// Régression: "Total sortie = 0" malgré une vraie production déjà
// enregistrée. Cause exacte: Début est un champ OPTIONNEL sur le modèle
// (le formulaire de création ne l'exige pas) — l'ancien code bornait la
// somme "toute la vie" de Total sortie par `date >= model.debut || today`,
// ce qui, quand Début était vide, réduisait silencieusement cette fenêtre
// à "aujourd'hui seulement", cachant toute production déjà enregistrée un
// jour précédent. Le fix (routes/public.js's fullDashboard() et
// computeColorBreakdown()) retire cette borne inférieure par Début — seul
// `model_id = ANY(colorModelIds)` fait réellement l'isolation, une borne
// de date inférieure n'a jamais été nécessaire pour l'exactitude.
test('Régression "Total sortie = 0": Début vide ne doit jamais cacher une production déjà enregistrée', async (t) => {
  const TEST_CHAIN = 8
  const methodeToken = await login('methode', '1111')
  const productionToken = await login('production', '2222')

  function daysAgo(n) {
    const d = new Date()
    d.setUTCDate(d.getUTCDate() - n)
    return d.toISOString().slice(0, 10)
  }
  const yesterday = daysAgo(1)

  const previouslyActive = await get('SELECT id FROM models WHERE chain_number = $1 AND active = 1', [TEST_CHAIN])
  // Délibérément SANS `debut` — reproduit exactement le cas réel signalé.
  const created = await call('/methode/models', {
    method: 'POST',
    token: methodeToken,
    body: { client: 'TEST_NO_DEBUT', qteTotale: 500, dessin: 'TEST-ND', chainNumber: TEST_CHAIN },
  })
  assert.equal(created.status, 201)
  const modelId = created.data.id
  const model = await get('SELECT debut FROM models WHERE id = $1', [modelId])
  assert.equal(model.debut, null) // confirme le scénario exact du bug

  t.after(async () => {
    await run('DELETE FROM models WHERE id = $1', [modelId])
    await run('DELETE FROM audit_log WHERE model_id = $1', [modelId])
    if (previouslyActive) await run('UPDATE models SET active = 1 WHERE id = $1', [previouslyActive.id])
  })

  await t.test('production enregistrée hier (Début toujours vide) → Total sortie la compte, jamais 0', async () => {
    const put = await call(`/production/models/${modelId}/hourly/0`, {
      method: 'PUT',
      token: productionToken,
      body: { qty: 100, date: yesterday },
    })
    assert.equal(put.status, 200) // aucune borne Début à violer quand il est vide

    const dashboard = await call(`/chains/${TEST_CHAIN}/dashboard`)
    assert.equal(dashboard.status, 200)
    assert.equal(dashboard.data.bilan.totalSortie, 100) // et surtout pas 0
  })

  await t.test('Couleur/Variante: la répartition par couleur reste correcte sans Début', async () => {
    const variant = await call(`/methode/models/${modelId}/variants`, {
      method: 'POST',
      token: methodeToken,
      body: { label: 'V1', qteTotale: 100 },
    })
    assert.equal(variant.status, 201)
    const variantId = variant.data.id

    await call(`/production/models/${modelId}/hourly/1`, {
      method: 'PUT',
      token: productionToken,
      body: { qty: 30, date: yesterday, targetModelId: variantId },
    })

    const dashboard = await call(`/chains/${TEST_CHAIN}/dashboard`)
    const colors = dashboard.data.colors
    assert.equal(colors.find((c) => c.id === modelId).totalSortie, 100)
    assert.equal(colors.find((c) => c.id === variantId).totalSortie, 30)
  })
})

test('Quality: جدول Pièces retouche بالساعة، Qualité% محسوب تلقائياً من إنتاج Agent Production الحقيقي', async (t) => {
  const TEST_CHAIN = 8
  const methodeToken = await login('methode', '1111')
  const productionToken = await login('production', '2222')
  const qualityToken = await login('quality', '7777')

  const previouslyActive = await get('SELECT id FROM models WHERE chain_number = $1 AND active = 1', [TEST_CHAIN])

  const today = todayInFactoryTZ()
  function daysAgo(n) {
    const d = new Date()
    d.setUTCDate(d.getUTCDate() - n)
    return d.toISOString().slice(0, 10)
  }
  const yesterday = daysAgo(1)
  const debut = daysAgo(5)
  const tomorrow = daysAgo(-1)

  const created = await call('/methode/models', {
    method: 'POST',
    token: methodeToken,
    body: { client: 'TEST_QUALITY', qteTotale: 1000, dessin: 'TEST-Q', chainNumber: TEST_CHAIN, debut },
  })
  assert.equal(created.status, 201)
  const modelId = created.data.id

  t.after(async () => {
    await run('DELETE FROM models WHERE id = $1', [modelId]) // cascades, including quality_history
    await run('DELETE FROM audit_log WHERE model_id = $1', [modelId])
    if (previouslyActive) await run('UPDATE models SET active = 1 WHERE id = $1', [previouslyActive.id])
  })

  await t.test('بدون أي بيانات: القسمة على صفر لا تحدث، والقيمة null (غير محسوب)', async () => {
    const dashboard = await call(`/chains/${TEST_CHAIN}/dashboard`)
    assert.equal(dashboard.data.quality.percentage, null)
    assert.equal(dashboard.data.quality.dailyPercentage, null)
  })

  await t.test('مثال المستخدم بالضبط: إنتاج=100، Pièces retouche=10 → Qualité%=90', async () => {
    const prod = await call(`/production/models/${modelId}/hourly/0`, {
      method: 'PUT',
      token: productionToken,
      body: { qty: 100, date: today },
    })
    assert.equal(prod.status, 200)

    const retouche = await call(`/quality/models/${modelId}/hourly/0`, {
      method: 'PUT',
      token: qualityToken,
      body: { pieceRetouche: 10, date: today },
    })
    assert.equal(retouche.status, 200)
    assert.equal(retouche.data.isBackdated, false)

    const hourly = await call(`/quality/models/${modelId}/hourly?date=${today}`, { token: qualityToken })
    const slot0 = hourly.data.hourly.find((h) => h.index === 0)
    assert.equal(slot0.qty, 100)
    assert.equal(slot0.pieceRetouche, 10)
    assert.equal(slot0.qualityPct, 90)

    const dashboard = await call(`/chains/${TEST_CHAIN}/dashboard`)
    // dailyPercentage se base sur "produit" (prodAMaintenant), qui dépend de
    // l'heure réelle actuelle — avant 6:30 il est légitimement 0 (donc
    // dailyPercentage null), peu importe ce qui est enregistré. On calcule
    // la valeur attendue avec la même fonction que l'app plutôt que de
    // supposer une heure fixe.
    const expectedDailyPct = computeQualityPct(prodAMaintenant({ 0: 100 }, TEST_WORK_HOURS), 10)
    assert.equal(dashboard.data.quality.dailyPercentage, expectedDailyPct)
    assert.equal(dashboard.data.quality.percentage, 90) // cumulatif (Total sortie) n'est jamais borné par l'heure actuelle
    assert.equal(dashboard.data.quality.pieceRetoucheToday, 10)
    assert.equal(dashboard.data.quality.pieceRetoucheCumulative, 10)

    const log = await get(
      `SELECT details FROM audit_log WHERE model_id = $1 AND action = 'update_quality_hourly' ORDER BY created_at DESC LIMIT 1`,
      [modelId]
    )
    assert.deepEqual(JSON.parse(log.details), { slotIndex: 0, pieceRetouche: 10, date: today, isBackdated: false })
  })

  await t.test('تعديل بأثر رجعي ليوم سابق: يُعلَّم isBackdated، ويُعاد حساب التراكمي بشكل صحيح', async () => {
    await call(`/production/models/${modelId}/hourly/1`, {
      method: 'PUT',
      token: productionToken,
      body: { qty: 200, date: yesterday },
    })
    const put = await call(`/quality/models/${modelId}/hourly/1`, {
      method: 'PUT',
      token: qualityToken,
      body: { pieceRetouche: 20, date: yesterday },
    })
    assert.equal(put.status, 200)
    assert.equal(put.data.isBackdated, true)

    const dashboard = await call(`/chains/${TEST_CHAIN}/dashboard`)
    // Cumulatif: (100 + 200) produites, (10 + 20) retouche → (300-30)/300*100 = 90
    assert.equal(dashboard.data.quality.percentage, 90)
    assert.equal(dashboard.data.quality.pieceRetoucheCumulative, 30)
    // Journalier (aujourd'hui uniquement) reste inchangé — la correction d'hier ne le touche pas.
    assert.equal(dashboard.data.quality.dailyPercentage, computeQualityPct(prodAMaintenant({ 0: 100 }, TEST_WORK_HOURS), 10))
    assert.equal(dashboard.data.quality.pieceRetoucheToday, 10)
  })

  await t.test('Reprises: رقم تراكمي منفصل تماماً، لا يؤثر على Qualité% ولا يتأثر به', async () => {
    const put = await call(`/quality/models/${modelId}`, {
      method: 'PUT',
      token: qualityToken,
      body: { reprises: 7 },
    })
    assert.equal(put.status, 200)
    const dashboard = await call(`/chains/${TEST_CHAIN}/dashboard`)
    assert.equal(dashboard.data.quality.reprises, 7)
    assert.equal(dashboard.data.quality.percentage, 90) // inchangé
  })

  await t.test('رفض تاريخ مستقبلي ورفض تاريخ قبل Début', async () => {
    const future = await call(`/quality/models/${modelId}/hourly/0`, {
      method: 'PUT',
      token: qualityToken,
      body: { pieceRetouche: 5, date: tomorrow },
    })
    assert.equal(future.status, 400)
    assert.equal(future.data.error, 'date_in_future')

    const beforeDebutQ = daysAgo(6)
    const early = await call(`/quality/models/${modelId}/hourly/0`, {
      method: 'PUT',
      token: qualityToken,
      body: { pieceRetouche: 5, date: beforeDebutQ },
    })
    assert.equal(early.status, 400)
    assert.equal(early.data.error, 'date_before_debut')
  })
})

test('Rendement: Rendement_Production% (SAM-based) + Score_Rendement = moyenne avec Qualité%, aux 3 niveaux', async (t) => {
  const TEST_CHAIN = 8
  const methodeToken = await login('methode', '1111')
  const productionToken = await login('production', '2222')
  const qualityToken = await login('quality', '7777')
  const rhToken = await login('rh', '8888')

  const previouslyActive = await get('SELECT id FROM models WHERE chain_number = $1 AND active = 1', [TEST_CHAIN])
  const today = todayInFactoryTZ()

  const created = await call('/methode/models', {
    method: 'POST',
    token: methodeToken,
    body: { client: 'TEST_RENDEMENT', qteTotale: 1000, dessin: 'TEST-R', chainNumber: TEST_CHAIN, debut: today },
  })
  assert.equal(created.status, 201)
  const modelId = created.data.id

  t.after(async () => {
    await run('DELETE FROM models WHERE id = $1', [modelId])
    await run('DELETE FROM audit_log WHERE model_id = $1', [modelId])
    if (previouslyActive) await run('UPDATE models SET active = 1 WHERE id = $1', [previouslyActive.id])
  })

  // Gamme totalisant 300s de TPS → SAM (VT) = 300/60 = 5 minutes exactement,
  // pour matcher l'exemple de test de l'utilisateur (SAM=5 minutes).
  const gamme = await call(`/methode/models/${modelId}/gamme`, {
    method: 'PUT',
    token: methodeToken,
    body: { lines: [{ operation: 'A', machine: '301', tps: 300 }] },
  })
  assert.equal(gamme.status, 200)
  assert.equal(gamme.data.vt, 5)

  await t.test('Agent Méthode entre 10 ouvriers présents (Machinistes) — nouvel endpoint, mêmes lignes rh_attendance que RH', async () => {
    const put = await call(`/methode/models/${modelId}/attendance`, {
      method: 'PUT',
      token: methodeToken,
      body: { attendance: { Machinistes: 10 } },
    })
    assert.equal(put.status, 200)
    const dashboard = await call(`/chains/${TEST_CHAIN}/dashboard`)
    assert.equal(dashboard.data.ouvriers.presents, 10)
  })

  await t.test('RH peut écraser la même valeur (dernier enregistrement, peu importe le département, qui compte)', async () => {
    const put = await call(`/rh/models/${modelId}/attendance`, {
      method: 'PUT',
      token: rhToken,
      body: { attendance: { Machinistes: 12 } },
    })
    assert.equal(put.status, 200)
    const dashboard = await call(`/chains/${TEST_CHAIN}/dashboard`)
    assert.equal(dashboard.data.ouvriers.presents, 12) // RH's more recent save wins
  })

  await t.test("remet 10 (valeur utilisée pour le reste du test, exemple utilisateur)", async () => {
    await call(`/methode/models/${modelId}/attendance`, {
      method: 'PUT',
      token: methodeToken,
      body: { attendance: { Machinistes: 10 } },
    })
  })

  await t.test('exemple exact de l\'utilisateur: qty=100, SAM=5min, ouvriers=10, minutes(jour complet)=540 → Rendement_Production%≈9.3, Score=moyenne avec Qualité%', async () => {
    const prod = await call(`/production/models/${modelId}/hourly/0`, {
      method: 'PUT',
      token: productionToken,
      body: { qty: 100, date: today },
    })
    assert.equal(prod.status, 200)
    const retouche = await call(`/quality/models/${modelId}/hourly/0`, {
      method: 'PUT',
      token: qualityToken,
      body: { pieceRetouche: 10, date: today },
    })
    assert.equal(retouche.status, 200)

    const dashboard = await call(`/chains/${TEST_CHAIN}/dashboard`)
    assert.equal(dashboard.status, 200)

    // Cumulatif: Début = aujourd'hui → 1 seul jour écoulé → minutes = 1*9*60 = 540,
    // exactement l'exemple de l'utilisateur. totalSortie/pieceRetoucheCumulative
    // ne dépendent jamais de l'heure actuelle (contrairement à "produit").
    assert.equal(dashboard.data.bilan.totalSortie, 100)
    // (100*5)/(10*540)*100 = 9.259... → 9.3
    assert.equal(dashboard.data.rendement.cumulative.productionPct, 9.3)
    assert.equal(dashboard.data.rendement.cumulative.qualityPct, 90) // (100-10)/100*100
    // Score_Rendement = (9.3 + 90) / 2 = 49.65 → 49.7 (moyenne exacte, arrondie)
    assert.equal(dashboard.data.rendement.cumulative.score, 49.7)

    // Heure — la seule heure enregistrée aujourd'hui (slot 0), minutes fixes = 60,
    // indépendant de l'heure actuelle réelle.
    assert.equal(dashboard.data.rendement.hourly.slotIndex, 0)
    // (100*5)/(10*60)*100 = 83.33... → 83.3
    assert.equal(dashboard.data.rendement.hourly.productionPct, 83.3)
    assert.equal(dashboard.data.rendement.hourly.qualityPct, 90)
    assert.equal(dashboard.data.rendement.hourly.score, 86.7) // (83.3+90)/2 = 86.65 → 86.7

    // Journalier: dépend de "produit" (prodAMaintenant), qui dépend de l'heure
    // actuelle réelle — on calcule la valeur attendue avec la même fonction
    // que l'app plutôt que de supposer une heure fixe (avant 6:30 "produit"
    // est légitimement 0, peu importe ce qui est enregistré).
    const expectedProduit = prodAMaintenant({ 0: 100 }, TEST_WORK_HOURS)
    const expectedDailyProdPct = computeRendementProduction(expectedProduit, 5, 10, 9 * 60)
    const expectedDailyQualityPct = computeQualityPct(expectedProduit, 10)
    const expectedDailyScore = computeScoreRendement(expectedDailyProdPct, expectedDailyQualityPct)
    assert.equal(dashboard.data.rendement.daily.productionPct, expectedDailyProdPct)
    assert.equal(dashboard.data.rendement.daily.qualityPct, expectedDailyQualityPct)
    assert.equal(dashboard.data.rendement.daily.score, expectedDailyScore)
  })
})

test('🏆 Classement des chaînes: كل السلاسل الثمانية تظهر دائماً، الفارغة بآخر الترتيب، والترتيب صحيح تنازلياً', async (t) => {
  const res = await call('/chains/ranking')
  assert.equal(res.status, 200)
  const ranking = res.data

  // كل السلاسل الثمانية موجودة بالضبط مرة وحدة، ومرقّمة 1..8 بالترتيب —
  // ما فيه سلسلة مُستبعدة بصمت.
  assert.equal(ranking.length, 8)
  assert.deepEqual(ranking.map((e) => e.chainNumber).slice().sort((a, b) => a - b), [1, 2, 3, 4, 5, 6, 7, 8])
  assert.deepEqual(ranking.map((e) => e.rank), [1, 2, 3, 4, 5, 6, 7, 8])

  // معيار الترتيب: سلاسل بها Score حقيقي اليوم (تنازلي فيما بينها) أولاً،
  // ثم سلاسل بها موديل نشط لكن بدون بيانات كافية اليوم (score=null)، ثم
  // السلاسل الفارغة (بدون موديل) بآخر الترتيب — أبداً ما ينعكس هذا الترتيب،
  // بغض النظر عن الوقت الحالي أو حالة البيانات الحقيقية وقت الاختبار.
  function tier(e) {
    if (!e.model) return 2
    if (e.rendement.daily.score === null) return 1
    return 0
  }
  let prevTier = -1
  let prevScore = Infinity
  for (const e of ranking) {
    const t = tier(e)
    assert.ok(t >= prevTier, `الترتيب انعكس عند Chaîne ${e.chainNumber}: ${JSON.stringify(ranking.map((x) => [x.chainNumber, tier(x)]))}`)
    if (t !== prevTier) prevScore = Infinity
    if (t === 0) {
      assert.ok(e.rendement.daily.score <= prevScore, `النتيجة يجب تكون تنازلية داخل نفس الفئة عند Chaîne ${e.chainNumber}`)
      prevScore = e.rendement.daily.score
    }
    prevTier = t
  }

  // Chaîne 6 ما استُخدمت بأي اختبار آخر — يجب تظهر بوضوح model: null، مو مستبعدة.
  const emptyEntry = ranking.find((e) => e.chainNumber === 6)
  assert.ok(emptyEntry)
  assert.equal(emptyEntry.model, null)
  assert.equal(emptyEntry.rendement, null)
})

test('Temps de lancement: Démarrer/Arrêter، هدف تحقق بدون سبب، وتجاوز يتطلب مسؤول وسبب إجبارياً', async (t) => {
  const TEST_CHAIN = 8
  const methodeToken = await login('methode', '1111')
  const previouslyActive = await get('SELECT id FROM models WHERE chain_number = $1 AND active = 1', [TEST_CHAIN])
  const modelIds = []

  t.after(async () => {
    for (const id of modelIds) {
      await run('DELETE FROM models WHERE id = $1', [id])
      await run('DELETE FROM audit_log WHERE model_id = $1', [id])
    }
    if (previouslyActive) await run('UPDATE models SET active = 1 WHERE id = $1', [previouslyActive.id])
  })

  const created = await call('/methode/models', {
    method: 'POST',
    token: methodeToken,
    body: { client: 'TEST_LAUNCH_1', qteTotale: 1000, dessin: 'TL1', chainNumber: TEST_CHAIN },
  })
  assert.equal(created.status, 201)
  const modelId = created.data.id
  modelIds.push(modelId)

  await t.test('بدون تهيئة Objectif بعد، Démarrer يُرفض', async () => {
    const start = await call(`/methode/models/${modelId}/launch-timer/start`, { method: 'POST', token: methodeToken })
    assert.equal(start.status, 400)
    assert.equal(start.data.error, 'launch_timer_not_configured')
  })

  await t.test('تهيئة Objectif (heures) + أسماء الفريق', async () => {
    const put = await call(`/methode/models/${modelId}/launch-timer`, {
      method: 'PUT',
      token: methodeToken,
      body: {
        objectifHeures: 2,
        groupeLancement: 'G1',
        agentMethode: 'Ali',
        mecanicien: 'Omar',
        electriciens: 'Said',
        agentQuality: 'Rim',
        chefChaine: 'Nabil',
      },
    })
    assert.equal(put.status, 200)
    const model = await call(`/models/${modelId}`, { token: methodeToken })
    assert.equal(model.data.launchTimer.objectifHeures, 2)
    assert.equal(model.data.launchTimer.agentMethode, 'Ali')
    assert.equal(model.data.launchTimer.startedAt, null)
  })

  await t.test('▶️ Démarrer ينجح، وتكرار الضغط يُرفض (already_started)', async () => {
    const start = await call(`/methode/models/${modelId}/launch-timer/start`, { method: 'POST', token: methodeToken })
    assert.equal(start.status, 200)
    assert.ok(start.data.startedAt)

    const startAgain = await call(`/methode/models/${modelId}/launch-timer/start`, { method: 'POST', token: methodeToken })
    assert.equal(startAgain.status, 400)
    assert.equal(startAgain.data.error, 'already_started')
  })

  await t.test('⏹ Arrêter قبل بلوغ الهدف: 🎯 Objectif atteint، بدون طلب مسؤول أو سبب', async () => {
    // نحاكي مرور 30 دقيقة فقط من أصل هدف ساعتين، بتعديل started_at مباشرة.
    const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString()
    await run('UPDATE launch_timer SET started_at = $1 WHERE model_id = $2', [thirtyMinAgo, modelId])

    const stop = await call(`/methode/models/${modelId}/launch-timer/stop`, { method: 'POST', token: methodeToken, body: {} })
    assert.equal(stop.status, 200)
    assert.equal(stop.data.overrun, false)

    const model = await call(`/models/${modelId}`, { token: methodeToken })
    assert.equal(model.data.launchTimer.responsible, null)
    assert.equal(model.data.launchTimer.reasonCode, null)

    const stopAgain = await call(`/methode/models/${modelId}/launch-timer/stop`, { method: 'POST', token: methodeToken, body: {} })
    assert.equal(stopAgain.status, 400)
    assert.equal(stopAgain.data.error, 'already_stopped')
  })

  // Deuxième lancement (nouveau modèle sur la même chaîne) pour le scénario
  // de dépassement — chaque lancement a son propre enregistrement.
  const created2 = await call('/methode/models', {
    method: 'POST',
    token: methodeToken,
    body: { client: 'TEST_LAUNCH_2', qteTotale: 1000, dessin: 'TL2', chainNumber: TEST_CHAIN },
  })
  assert.equal(created2.status, 201)
  const modelId2 = created2.data.id
  modelIds.push(modelId2)

  await call(`/methode/models/${modelId2}/launch-timer`, {
    method: 'PUT',
    token: methodeToken,
    body: { objectifHeures: 1, agentMethode: 'Ali', mecanicien: 'Omar' },
  })
  await call(`/methode/models/${modelId2}/launch-timer/start`, { method: 'POST', token: methodeToken })
  // نحاكي مرور ساعتين على هدف ساعة واحدة → تجاوز ساعة كاملة.
  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()
  await run('UPDATE launch_timer SET started_at = $1 WHERE model_id = $2', [twoHoursAgo, modelId2])

  await t.test('تجاوز الهدف: الإيقاف يُرفض بدون مسؤول وسبب', async () => {
    const stop = await call(`/methode/models/${modelId2}/launch-timer/stop`, { method: 'POST', token: methodeToken, body: {} })
    assert.equal(stop.status, 400)
    assert.equal(stop.data.error, 'responsible_and_reason_required')
  })

  await t.test('تجاوز الهدف: كود سبب غير صحيح يُرفض', async () => {
    const stop = await call(`/methode/models/${modelId2}/launch-timer/stop`, {
      method: 'POST',
      token: methodeToken,
      body: { responsible: 'Ali (Agent méthode)', reasonCode: 'not_a_real_reason' },
    })
    assert.equal(stop.status, 400)
    assert.equal(stop.data.error, 'invalid_reason_code')
  })

  await t.test('تجاوز الهدف: بمسؤول وسبب صحيحين ينجح، ويُسجَّل بسجل التعديلات', async () => {
    const stop = await call(`/methode/models/${modelId2}/launch-timer/stop`, {
      method: 'POST',
      token: methodeToken,
      body: { responsible: 'Omar (Mécanicien)', reasonCode: 'machine_breakdown', reasonComment: 'Panne moteur' },
    })
    assert.equal(stop.status, 200)
    assert.equal(stop.data.overrun, true)

    const model = await call(`/models/${modelId2}`, { token: methodeToken })
    assert.equal(model.data.launchTimer.responsible, 'Omar (Mécanicien)')
    assert.equal(model.data.launchTimer.reasonCode, 'machine_breakdown')
    assert.equal(model.data.launchTimer.reasonComment, 'Panne moteur')

    // ~1h de dépassement (60 min ± quelques secondes de marge d'exécution du test).
    const elapsedMinutes = (new Date(model.data.launchTimer.stoppedAt) - new Date(model.data.launchTimer.startedAt)) / 60000
    assert.ok(elapsedMinutes > 119 && elapsedMinutes < 121, `elapsed inattendu: ${elapsedMinutes}min`)

    const log = await get(
      `SELECT details FROM audit_log WHERE model_id = $1 AND action = 'stop_launch_timer' ORDER BY created_at DESC LIMIT 1`,
      [modelId2]
    )
    const details = JSON.parse(log.details)
    assert.equal(details.overrun, true)
    assert.equal(details.responsible, 'Omar (Mécanicien)')
    assert.equal(details.reasonCode, 'machine_breakdown')

    // Chain 8 now has two open models at once (modelId + modelId2 — creating
    // a second model no longer retires the first, see the "chain overlap"
    // feature below), so /chains/:n/dashboard would return the new `multi`
    // shape here; querying modelId2 directly is what this test actually
    // wants regardless.
    const dashboard = await call(`/models/${modelId2}/dashboard`)
    assert.equal(dashboard.data.launchTimer.responsible, 'Omar (Mécanicien)')
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

test('État des effectifs: Finale/Dépôt/Personnel administratif se sauvegardent et se lisent correctement', async (t) => {
  const TEST_CHAIN = 8
  const methodeToken = await login('methode', '1111')
  const finaleToken = await login('finale', '1313')
  const depotToken = await login('depot', '1010')

  const previouslyActive = await get('SELECT id FROM models WHERE chain_number = $1 AND active = 1', [TEST_CHAIN])
  const today = todayInFactoryTZ()

  const created = await call('/methode/models', {
    method: 'POST',
    token: methodeToken,
    body: { client: 'TEST_EFFECTIFS', qteTotale: 500, dessin: 'TEST-E', chainNumber: TEST_CHAIN, debut: today },
  })
  assert.equal(created.status, 201)
  const modelId = created.data.id

  t.after(async () => {
    await run('DELETE FROM models WHERE id = $1', [modelId])
    await run('DELETE FROM audit_log WHERE model_id = $1', [modelId])
    if (previouslyActive) await run('UPDATE models SET active = 1 WHERE id = $1', [previouslyActive.id])
  })

  await t.test('Finale: effectif par spécialité se sauvegarde et se lit via le dashboard', async () => {
    const put = await call(`/finale/models/${modelId}/effectif`, {
      method: 'PUT',
      token: finaleToken,
      body: { effectif: { 'Repassage Finale': 2, 'Contrôle Finale': 1, Machiniste: 3 } },
    })
    assert.equal(put.status, 200)
    const dashboard = await call(`/chains/${TEST_CHAIN}/dashboard`)
    const byName = Object.fromEntries(dashboard.data.finaleAttendance.map((e) => [e.specialty, e.present]))
    assert.equal(byName['Repassage Finale'], 2)
    assert.equal(byName['Contrôle Finale'], 1)
    assert.equal(byName.Machiniste, 3)
    assert.equal(byName.Stagiaire, 0) // jamais soumis — reste à 0, pas d'erreur
  })

  await t.test('Dépôt: effectif (un seul total, sans détail) se sauvegarde et se lit via le dashboard', async () => {
    const put = await call(`/depot/models/${modelId}`, {
      method: 'PUT',
      token: depotToken,
      body: { totalPieces: 250, effectifTotal: 4 },
    })
    assert.equal(put.status, 200)
    const dashboard = await call(`/chains/${TEST_CHAIN}/dashboard`)
    assert.equal(dashboard.data.depotTotal, 250)
    assert.equal(dashboard.data.depotEffectif, 4)
  })
})

test('Personnel administratif: RH (primaire) + Patron (secours) sur la même ligne, correction rétroactive, total cumulé', async (t) => {
  const rhToken = await login('rh', '8888')
  const patronToken = await login('patron', '3333')
  const today = todayInFactoryTZ()
  const pastDate = '2026-01-15' // une date antérieure, jamais touchée ailleurs dans cette suite

  const beforeToday = await get('SELECT total FROM personnel_admin_history WHERE date = $1', [today])
  const beforePast = await get('SELECT total FROM personnel_admin_history WHERE date = $1', [pastDate])

  t.after(async () => {
    if (beforeToday) await run('UPDATE personnel_admin_history SET total = $1 WHERE date = $2', [beforeToday.total, today])
    else await run('DELETE FROM personnel_admin_history WHERE date = $1', [today])
    if (beforePast) await run('UPDATE personnel_admin_history SET total = $1 WHERE date = $2', [beforePast.total, pastDate])
    else await run('DELETE FROM personnel_admin_history WHERE date = $1', [pastDate])
  })

  await t.test("RH enregistre 20 aujourd'hui", async () => {
    const put = await call('/rh/personnel-admin', { method: 'PUT', token: rhToken, body: { date: today, total: 20 } })
    assert.equal(put.status, 200)
    const read = await call(`/personnel-admin?date=${today}`, { token: rhToken })
    assert.equal(read.data.total, 20)
  })

  await t.test("Patron écrase avec 25 — dernier enregistrement (peu importe le département) qui compte", async () => {
    const put = await call('/patron/personnel-admin', { method: 'PUT', token: patronToken, body: { date: today, total: 25 } })
    assert.equal(put.status, 200)
    const read = await call(`/personnel-admin?date=${today}`, { token: rhToken })
    assert.equal(read.data.total, 25)
  })

  await t.test('correction rétroactive sur une date passée + total cumulé = somme exacte des deux jours', async () => {
    const put = await call('/rh/personnel-admin', { method: 'PUT', token: rhToken, body: { date: pastDate, total: 7 } })
    assert.equal(put.status, 200)

    const readPast = await call(`/personnel-admin?date=${pastDate}`, { token: rhToken })
    assert.equal(readPast.data.total, 7)
    // cumulativeTotal = somme de TOUS les jours enregistrés, pas seulement
    // celui demandé — donc identique quelle que soit la date interrogée.
    assert.equal(readPast.data.cumulativeTotal, 25 + 7)

    const readToday = await call(`/personnel-admin?date=${today}`, { token: rhToken })
    assert.equal(readToday.data.total, 25) // inchangé par la correction du jour passé
    assert.equal(readToday.data.cumulativeTotal, 25 + 7)
  })
})

test("État des effectifs: l'endpoint /effectifs/overview additionne correctement chaque section et le total général", async (t) => {
  const TEST_CHAIN = 8
  const EMPTY_CHAIN = 6 // jamais touché ailleurs dans cette suite — reste sans modèle actif
  const methodeToken = await login('methode', '1111')
  const finaleToken = await login('finale', '1313')
  const depotToken = await login('depot', '1010')
  const rhToken = await login('rh', '8888')
  const today = todayInFactoryTZ()

  const previouslyActive = await get('SELECT id FROM models WHERE chain_number = $1 AND active = 1', [TEST_CHAIN])
  const beforePersonnel = await get('SELECT total FROM personnel_admin_history WHERE date = $1', [today])

  const before = await call('/effectifs/overview')
  assert.equal(before.status, 200)

  const created = await call('/methode/models', {
    method: 'POST',
    token: methodeToken,
    body: { client: 'TEST_OVERVIEW', qteTotale: 100, dessin: 'TEST-O', chainNumber: TEST_CHAIN, debut: today },
  })
  assert.equal(created.status, 201)
  const modelId = created.data.id

  t.after(async () => {
    await run('DELETE FROM models WHERE id = $1', [modelId])
    await run('DELETE FROM audit_log WHERE model_id = $1', [modelId])
    if (previouslyActive) await run('UPDATE models SET active = 1 WHERE id = $1', [previouslyActive.id])
    if (beforePersonnel) await run('UPDATE personnel_admin_history SET total = $1 WHERE date = $2', [beforePersonnel.total, today])
    else await run('DELETE FROM personnel_admin_history WHERE date = $1', [today])
  })

  // 13 valeurs connues, une par spécialité de chaîne — somme = 1+2+...+13 = 91.
  const chainAttendance = {}
  SPECIALTIES.forEach((sp, i) => (chainAttendance[sp] = i + 1))
  const expectedChainSubtotal = Object.values(chainAttendance).reduce((s, v) => s + v, 0)
  assert.equal(expectedChainSubtotal, 91)
  const attPut = await call(`/methode/models/${modelId}/attendance`, {
    method: 'PUT',
    token: methodeToken,
    body: { attendance: chainAttendance },
  })
  assert.equal(attPut.status, 200)

  // Finale: 2 spécialités connues, somme = 5.
  const finalePut = await call(`/finale/models/${modelId}/effectif`, {
    method: 'PUT',
    token: finaleToken,
    body: { effectif: { 'Repassage Finale': 2, Machiniste: 3 } },
  })
  assert.equal(finalePut.status, 200)

  // Dépôt: un seul total connu = 6.
  const depotPut = await call(`/depot/models/${modelId}`, { method: 'PUT', token: depotToken, body: { totalPieces: 0, effectifTotal: 6 } })
  assert.equal(depotPut.status, 200)

  // Personnel administratif aujourd'hui = 9 (valeur connue, écrase toute valeur précédente).
  const paPut = await call('/rh/personnel-admin', { method: 'PUT', token: rhToken, body: { date: today, total: 9 } })
  assert.equal(paPut.status, 200)

  const after = await call('/effectifs/overview')
  assert.equal(after.status, 200)

  await t.test('la chaîne testée: sous-total = somme exacte des 13 valeurs saisies', async () => {
    const chainRow = after.data.chains.find((c) => c.chainNumber === TEST_CHAIN)
    assert.ok(chainRow, 'la chaîne testée doit apparaître dans la réponse')
    assert.equal(chainRow.subtotal, expectedChainSubtotal)
    for (const [sp, val] of Object.entries(chainAttendance)) {
      const row = chainRow.specialties.find((s) => s.specialty === sp)
      assert.equal(row.present, val, `${sp}: attendu ${val}`)
    }
  })

  await t.test('chaîne vide: apparaît avec sous-total 0 et aucun détail de spécialités — jamais exclue silencieusement', async () => {
    const emptyRow = after.data.chains.find((c) => c.chainNumber === EMPTY_CHAIN)
    assert.ok(emptyRow, 'la chaîne vide doit quand même apparaître')
    assert.equal(emptyRow.model, null)
    assert.equal(emptyRow.subtotal, 0)
    assert.deepEqual(emptyRow.specialties, [])
  })

  await t.test("chainsTotal augmente exactement du sous-total de la chaîne testée (le reste des chaînes est inchangé)", async () => {
    assert.equal(after.data.chainsTotal - before.data.chainsTotal, expectedChainSubtotal)
  })

  await t.test('Finale: le sous-total augmente exactement de 2 + 3 = 5', async () => {
    assert.equal(after.data.finale.subtotal - before.data.finale.subtotal, 5)
    const repassage = after.data.finale.specialties.find((s) => s.specialty === 'Repassage Finale')
    assert.equal(repassage.present - (before.data.finale.specialties.find((s) => s.specialty === 'Repassage Finale')?.present || 0), 2)
  })

  await t.test('Dépôt: le total augmente exactement de 6', async () => {
    assert.equal(after.data.depot.total - before.data.depot.total, 6)
  })

  await t.test("Personnel administratif aujourd'hui = 9 exactement (valeur connue, pas cumulée dans le total général)", async () => {
    assert.equal(after.data.personnelAdmin.total, 9)
  })

  await t.test('Total général = somme exacte de toutes les sections ci-dessus — vérifié mathématiquement, pas approximé', async () => {
    const expectedGrandTotal =
      after.data.chainsTotal + after.data.finale.subtotal + after.data.depot.total + after.data.personnelAdmin.total
    assert.equal(after.data.grandTotal, expectedGrandTotal)

    // Et l'augmentation du total général depuis "before" correspond exactement
    // à la somme de ce qui a été ajouté dans ce test (91 + 5 + 6 + Δpersonnel).
    const personnelDelta = after.data.personnelAdmin.total - before.data.personnelAdmin.total
    assert.equal(after.data.grandTotal - before.data.grandTotal, expectedChainSubtotal + 5 + 6 + personnelDelta)
  })
})

test('Couleur/Variante: variante hérite VT/DT sans ressaisie, deux couleurs saisissent la même heure séparément, total combiné exact', async (t) => {
  const TEST_CHAIN = 8
  const methodeToken = await login('methode', '1111')
  const productionToken = await login('production', '2222')
  const today = todayInFactoryTZ()

  const previouslyActive = await get('SELECT id FROM models WHERE chain_number = $1 AND active = 1', [TEST_CHAIN])

  const created = await call('/methode/models', {
    method: 'POST',
    token: methodeToken,
    body: { client: 'TEST_VARIANTE', qteTotale: 1000, dessin: 'TEST-V', chainNumber: TEST_CHAIN, debut: today },
  })
  assert.equal(created.status, 201)
  const rootId = created.data.id

  t.after(async () => {
    await run('DELETE FROM models WHERE id = $1', [rootId]) // cascades to the variant too
    await run('DELETE FROM audit_log WHERE model_id = $1', [rootId])
    if (previouslyActive) await run('UPDATE models SET active = 1 WHERE id = $1', [previouslyActive.id])
  })

  // Gamme totalisant 300s de TPS → SAM (VT) = 5 minutes exactement — le
  // root seul a un vrai VT/DT, la variante n'en saisit jamais.
  const gamme = await call(`/methode/models/${rootId}/gamme`, {
    method: 'PUT',
    token: methodeToken,
    body: { lines: [{ operation: 'A', machine: 'x', tps: 300 }] },
  })
  assert.equal(gamme.status, 200)
  assert.equal(gamme.data.vt, 5)

  await t.test("un modèle normal (sans variante) a colors = [lui-même] seul, comportement inchangé", async () => {
    const dash = await call(`/chains/${TEST_CHAIN}/dashboard`)
    assert.equal(dash.data.colors.length, 1)
    assert.equal(dash.data.colors[0].id, rootId)
    assert.equal(dash.data.colors[0].label, null)
  })

  let variantId
  await t.test("ajouter une variante de couleur ('800', qté 300) hérite VT/DT du root sans ressaisie", async () => {
    const variant = await call(`/methode/models/${rootId}/variants`, {
      method: 'POST',
      token: methodeToken,
      body: { label: '800', qteTotale: 300 },
    })
    assert.equal(variant.status, 201)
    variantId = variant.data.id

    const dash = await call(`/chains/${TEST_CHAIN}/dashboard`)
    // Le root garde exactement son propre VT/DT (jamais recalculé à cause
    // d'une variante) — c'est la variante qui n'en a simplement jamais.
    assert.equal(dash.data.vt, 5)
    assert.equal(dash.data.colors.length, 2)
    const colorEntry = dash.data.colors.find((c) => c.id === variantId)
    assert.equal(colorEntry.label, '800')
    assert.equal(colorEntry.qteTotale, 300)
    assert.equal(colorEntry.totalSortie, 0) // rien produit encore pour cette couleur
  })

  await t.test('deux couleurs saisissent la même heure séparément (5 pièces couleur racine + 10 pièces couleur 800)', async () => {
    const putRoot = await call(`/production/models/${rootId}/hourly/4`, {
      method: 'PUT',
      token: productionToken,
      body: { qty: 5, date: today },
    })
    assert.equal(putRoot.status, 200)

    const putVariant = await call(`/production/models/${rootId}/hourly/4`, {
      method: 'PUT',
      token: productionToken,
      body: { qty: 10, date: today, targetModelId: variantId },
    })
    assert.equal(putVariant.status, 200)

    // Les deux lignes existent bien séparément en base (aucune n'a écrasé l'autre).
    const rows = await all(
      'SELECT model_id, qty FROM production_history WHERE chain_number = $1 AND date = $2 AND slot_index = 4',
      [TEST_CHAIN, today]
    )
    assert.equal(rows.length, 2)
    const byModel = Object.fromEntries(rows.map((r) => [r.model_id, r.qty]))
    assert.equal(byModel[rootId], 5)
    assert.equal(byModel[variantId], 10)
  })

  await t.test("l'entrée hourly de Agent Production renvoie un byModel par couleur pour cette heure", async () => {
    const hourly = await call(`/production/models/${rootId}/hourly?date=${today}`, { token: productionToken })
    assert.equal(hourly.status, 200)
    assert.equal(hourly.data.variants.length, 1)
    assert.equal(hourly.data.variants[0].id, variantId)
    const slot4 = hourly.data.hourly.find((s) => s.index === 4)
    assert.equal(slot4.qty, 15) // 5 + 10 combiné
    const byModel = Object.fromEntries(slot4.byModel.map((c) => [c.modelId, c.qty]))
    assert.equal(byModel[rootId], 5)
    assert.equal(byModel[variantId], 10)
  })

  await t.test('le total combiné (Prod à maintenant / hourly) = somme exacte des deux couleurs pour cette heure', async () => {
    const dash = await call(`/chains/${TEST_CHAIN}/dashboard`)
    const slot4 = dash.data.hourly.find((s) => s.index === 4)
    assert.equal(slot4.qty, 15)
    assert.equal(dash.data.prodAMaintenant, 15) // rien d'autre saisi cette journée sur ce test

    // Le "Le reste" combiné utilise Qté totale racine + variante (1000 + 300),
    // moins le total sortie combiné (15) — pas seulement le Qté totale racine.
    assert.equal(dash.data.qteTotaleCombined, 1300)
    assert.equal(dash.data.bilan.totalSortie, 15)
    assert.equal(dash.data.bilan.leReste, 1300 - 15)

    // Chaque couleur garde son PROPRE total, jamais combiné avec l'autre.
    const rootColor = dash.data.colors.find((c) => c.id === rootId)
    const variantColor = dash.data.colors.find((c) => c.id === variantId)
    assert.equal(rootColor.totalSortie, 5)
    assert.equal(variantColor.totalSortie, 10)
  })

  await t.test("modifier le label/qté d'une variante existante", async () => {
    const put = await call(`/methode/models/${rootId}/variants/${variantId}`, {
      method: 'PUT',
      token: methodeToken,
      body: { label: '681', qteTotale: 500 },
    })
    assert.equal(put.status, 200)
    const dash = await call(`/chains/${TEST_CHAIN}/dashboard`)
    const colorEntry = dash.data.colors.find((c) => c.id === variantId)
    assert.equal(colorEntry.label, '681')
    assert.equal(colorEntry.qteTotale, 500)
  })

  await t.test('une variante ne peut pas elle-même avoir de sous-variante (pas de nesting)', async () => {
    const nested = await call(`/methode/models/${variantId}/variants`, {
      method: 'POST',
      token: methodeToken,
      body: { label: 'nested', qteTotale: 1 },
    })
    assert.equal(nested.status, 400)
    assert.equal(nested.data.error, 'cannot_nest_variants')
  })
})

// Bug found during a real week-long data-entry exercise: reassigning a chain
// to a brand-new model (a chain finishing one order and starting another —
// completely ordinary factory operation) used to leak the OLD, now-inactive
// model's production_history/quality_history rows into the new model's live
// figures, because fullDashboard()'s chain-wide queries filtered only by
// chain_number/date, never by which model actually owns those rows.
// A model created on a chain that already has one active no longer retires
// the old one (see the "chain overlap" feature test below) — each model's
// OWN dashboard (fetched by its own id, GET /models/:id/dashboard) must
// still never mix in the other's figures, exactly as before.
test("un nouveau modèle sur une chaîne déjà occupée n'écrase ni ne contamine l'ancien (consultés chacun par leur propre id)", async (t) => {
  const TEST_CHAIN = 8
  const methodeToken = await login('methode', '1111')
  const productionToken = await login('production', '2222')
  const qualityToken = await login('quality', '7777')
  const today = todayInFactoryTZ()

  const previouslyActive = await get('SELECT id FROM models WHERE chain_number = $1 AND active = 1', [TEST_CHAIN])

  const oldModel = await call('/methode/models', {
    method: 'POST',
    token: methodeToken,
    body: { client: 'TEST_OLD', qteTotale: 500, dessin: 'TEST-OLD', chainNumber: TEST_CHAIN, debut: today },
  })
  assert.equal(oldModel.status, 201)
  const oldId = oldModel.data.id

  let newId
  t.after(async () => {
    await run('DELETE FROM models WHERE id = $1', [oldId])
    if (newId) await run('DELETE FROM models WHERE id = $1', [newId])
    await run('DELETE FROM audit_log WHERE model_id = $1', [oldId])
    if (newId) await run('DELETE FROM audit_log WHERE model_id = $1', [newId])
    if (previouslyActive) await run('UPDATE models SET active = 1 WHERE id = $1', [previouslyActive.id])
  })

  // The old model logs real production/quality today.
  await call(`/production/models/${oldId}/hourly/0`, {
    method: 'PUT',
    token: productionToken,
    body: { qty: 500, date: today },
  })
  await call(`/quality/models/${oldId}/hourly/0`, {
    method: 'PUT',
    token: qualityToken,
    body: { pieceRetouche: 50, date: today },
  })
  await call(`/production/models/${oldId}/totals`, { method: 'PUT', token: productionToken, body: { totalEntree: 1000 } })

  // A brand-new model is created on the exact same chain, same day — it no
  // longer retires the old one (the old one still has 500 En cours, nowhere
  // near finished either way).
  const created = await call('/methode/models', {
    method: 'POST',
    token: methodeToken,
    body: { client: 'TEST_NEW', qteTotale: 300, dessin: 'TEST-NEW', chainNumber: TEST_CHAIN, debut: today },
  })
  assert.equal(created.status, 201)
  newId = created.data.id

  await t.test("le nouveau modèle (consulté par son propre id) démarre à zéro — rien de l'ancien ne fuite dedans", async () => {
    const dash = await call(`/models/${newId}/dashboard`)
    assert.ok(dash.data.hourly.every((h) => h.qty === 0))
    assert.equal(dash.data.bilan.totalSortie, 0)
    assert.equal(dash.data.objectifAtteintPct, 0)
    assert.equal(dash.data.quality.pieceRetoucheToday, 0)
    assert.equal(dash.data.quality.pieceRetoucheCumulative, 0)
  })

  await t.test("la propre production du nouveau modèle (consultée par son propre id) s'affiche correctement, sans mélange", async () => {
    await call(`/production/models/${newId}/hourly/1`, {
      method: 'PUT',
      token: productionToken,
      body: { qty: 20, date: today },
    })
    const dash = await call(`/models/${newId}/dashboard`)
    assert.equal(dash.data.hourly.find((h) => h.index === 1).qty, 20)
    assert.equal(dash.data.bilan.totalSortie, 20)
  })

  await t.test("l'ancien modèle (toujours interrogeable directement par id) garde ses propres chiffres intacts", async () => {
    const oldDash = await call(`/models/${oldId}/dashboard`)
    assert.equal(oldDash.data.hourly.find((h) => h.index === 0).qty, 500)
    assert.equal(oldDash.data.bilan.totalSortie, 500)
  })
})

// The chain-overlap feature itself — the real, ordinary factory scenario a
// UX review surfaced: a model's Entré reaches its target while it's still
// mid-process/exiting, and a new model starts being fed into the SAME
// chain at the same time. Covers the exact 4 points asked for: (1) the new
// model gets its own fully independent gamme/VT/DT, (2) both can log a real
// qty for the very same hour, (3) the old one drops out of the
// hourly-entry selector on its own once it's genuinely finished (no manual
// "close" action anywhere), (4) Home's chain-dashboard shows both clearly
// while they overlap, and goes back to a single dashboard once the old one
// finishes.
test('Fin de série / Démarrage: deux modèles sur la même chaîne, saisie par modèle, Rendement chaîne, clôture confirmée', async (t) => {
  const TEST_CHAIN = 8
  const methodeToken = await login('methode', '1111')
  const patronToken = await login('patron', '3333')
  const productionToken = await login('production', '2222')
  const rhToken = await login('rh', '8888')
  const today = todayInFactoryTZ()

  const created = []
  t.after(async () => {
    for (const id of created) {
      await run('DELETE FROM models WHERE id = $1', [id])
      await run('DELETE FROM audit_log WHERE model_id = $1', [id])
    }
  })

  async function createModel(body) {
    const res = await call('/methode/models', { method: 'POST', token: methodeToken, body: { chainNumber: TEST_CHAIN, debut: today, ...body } })
    if (res.status === 201) created.push(res.data.id)
    return res
  }

  // Old model (fin de série): gamme 200s -> VT = 200/60 min, Qté totale 100.
  const oldRes = await createModel({ client: 'TEST_OVERLAP_OLD', qteTotale: 100, dessin: 'OV-OLD' })
  assert.equal(oldRes.status, 201)
  const oldId = oldRes.data.id
  await call(`/methode/models/${oldId}/gamme`, { method: 'PUT', token: methodeToken, body: { lines: [{ operation: 'A', machine: 'x', tps: 200 }] } })
  let newId

  await t.test("un nouveau modèle (démarrage) peut être créé SANS clôturer l'ancien — chacun sa propre gamme", async () => {
    const res = await createModel({ client: 'TEST_OVERLAP_NEW', qteTotale: 200, dessin: 'OV-NEW' })
    assert.equal(res.status, 201)
    newId = res.data.id
    const gamme = await call(`/methode/models/${newId}/gamme`, { method: 'PUT', token: methodeToken, body: { lines: [{ operation: 'B', machine: 'y', tps: 400 }] } })
    assert.equal(gamme.data.vt, 400 / 60)
    const old = await get('SELECT status FROM models WHERE id = $1', [oldId])
    assert.equal(old.status, 'active')
  })

  await t.test('un 3e modèle est refusé tant que les deux sont ouverts (chain_full)', async () => {
    const res = await createModel({ client: 'TEST_OVERLAP_THIRD', qteTotale: 10, dessin: 'OV-3' })
    assert.equal(res.status, 409)
    assert.equal(res.data.error, 'chain_full')
  })

  await t.test('chaque modèle saisit sa propre production pour la MÊME heure, sans mélange ni écrasement', async () => {
    assert.equal((await call(`/production/models/${oldId}/hourly/4`, { method: 'PUT', token: productionToken, body: { qty: 5, date: today } })).status, 200)
    assert.equal((await call(`/production/models/${newId}/hourly/4`, { method: 'PUT', token: productionToken, body: { qty: 10, date: today } })).status, 200)

    const rows = await all('SELECT model_id, qty FROM production_history WHERE chain_number = $1 AND date = $2 AND slot_index = 4', [TEST_CHAIN, today])
    const byModel = Object.fromEntries(rows.map((r) => [r.model_id, r.qty]))
    assert.equal(byModel[oldId], 5)
    assert.equal(byModel[newId], 10)

    // Each model's hourly screen shows ONLY its own hours — no interleaving.
    const oldHourly = await call(`/production/models/${oldId}/hourly?date=${today}`, { token: productionToken })
    assert.equal(oldHourly.data.hourly.find((s) => s.index === 4).qty, 5)
    assert.equal(oldHourly.data.hourly[0].byModel, undefined)
    const newHourly = await call(`/production/models/${newId}/hourly?date=${today}`, { token: productionToken })
    assert.equal(newHourly.data.hourly.find((s) => s.index === 4).qty, 10)
  })

  await t.test('le sélecteur de modèle: [fin de série, démarrage] avec le nombre d’heures saisies aujourd’hui', async () => {
    const res = await call(`/chains/${TEST_CHAIN}/open-models?kind=production`)
    assert.equal(res.status, 200)
    assert.deepEqual(res.data.models.map((m) => [m.id, m.role, m.filledSlots]), [
      [oldId, 'fin_de_serie', 1],
      [newId, 'demarrage', 1],
    ])
    assert.equal(res.data.totalSlots, TEST_WORK_HOURS.length)
  })

  await t.test('Home: deux dashboards (démarrage en premier, chacun ses propres chiffres) + Rendement de la chaîne', async () => {
    // One shared workforce: 10 workers entered on the chain.
    const rh = await call(`/rh/models/${oldId}/attendance`, { method: 'PUT', token: rhToken, body: { attendance: { Machinistes: 10 }, date: today } })
    assert.equal(rh.status, 200)

    const multi = await call(`/chains/${TEST_CHAIN}/dashboard`)
    assert.equal(multi.status, 200)
    assert.equal(multi.data.multi, true)
    assert.deepEqual(multi.data.dashboards.map((d) => [d.id, d.role]), [
      [newId, 'demarrage'],
      [oldId, 'fin_de_serie'],
    ])
    assert.equal(multi.data.dashboards.find((d) => d.id === oldId).bilan.totalSortie, 5)
    assert.equal(multi.data.dashboards.find((d) => d.id === newId).bilan.totalSortie, 10)

    // Σ(qty × VT) / (effectif × minutes): last hour = (5 × 200/60 + 10 × 400/60) / (10 × 60) × 100
    const chain = multi.data.chainRendement
    assert.equal(chain.modelsCount, 2)
    assert.equal(chain.effectif, 10)
    assert.equal(chain.hourly.productionPct, computeRendementProduction(1, 5 * (200 / 60) + 10 * (400 / 60), 10, 60))
    assert.equal(chain.hourly.productionPct, 13.9)
    assert.equal(chain.hourly.qualityPct, 100)
    const earnedToday =
      prodAMaintenant({ 4: 5 }, TEST_WORK_HOURS) * (200 / 60) + prodAMaintenant({ 4: 10 }, TEST_WORK_HOURS) * (400 / 60)
    assert.equal(chain.daily.productionPct, computeRendementProduction(1, earnedToday, 10, TEST_WORK_HOURS.length * 60))

    // Classement ranks the chain on that same combined figure.
    const ranking = await call('/chains/ranking')
    const entry = ranking.data.find((e) => e.chainNumber === TEST_CHAIN)
    assert.equal(entry.modelsCount, 2)
    assert.deepEqual(entry.rendement.daily, chain.daily)
  })

  await t.test('Qté atteinte → proposition de clôture à Méthode (jamais automatique), "ماشي دابا" la reporte', async () => {
    let prompts = await call(`/chains/${TEST_CHAIN}/close-prompts`, { token: methodeToken })
    assert.equal(prompts.status, 200)
    assert.equal(prompts.data.prompts.length, 0) // 5/100, not yet

    await call(`/production/models/${oldId}/hourly/5`, { method: 'PUT', token: productionToken, body: { qty: 95, date: today } })
    prompts = await call(`/chains/${TEST_CHAIN}/close-prompts`, { token: methodeToken })
    assert.equal(prompts.data.prompts.length, 1)
    assert.equal(prompts.data.prompts[0].id, oldId)
    assert.equal(prompts.data.prompts[0].totalSortie, 100)
    assert.equal(prompts.data.prompts[0].qteTotale, 100)

    // Reaching the target never closes anything by itself.
    assert.equal((await get('SELECT status FROM models WHERE id = $1', [oldId])).status, 'active')

    assert.equal((await call(`/chains/${TEST_CHAIN}/close-prompts`, { token: productionToken })).status, 403)
    const dismiss = await call(`/models/${oldId}/close-prompt/dismiss`, { method: 'POST', token: methodeToken })
    assert.equal(dismiss.status, 200)
    prompts = await call(`/chains/${TEST_CHAIN}/close-prompts`, { token: methodeToken })
    assert.equal(prompts.data.prompts.length, 0) // back tomorrow
    assert.equal((await get('SELECT status FROM models WHERE id = $1', [oldId])).status, 'active')
  })

  await t.test('clôture confirmée: disparaît de la saisie et de Home, toutes ses données restent', async () => {
    assert.equal((await call(`/models/${oldId}/close`, { method: 'POST', token: productionToken })).status, 403)

    const close = await call(`/models/${oldId}/close`, { method: 'POST', token: patronToken })
    assert.equal(close.status, 200)
    assert.equal(close.data.status, 'closed')
    assert.ok(close.data.closedAt)
    assert.equal((await call(`/models/${oldId}/close`, { method: 'POST', token: methodeToken })).status, 409)

    const open = await call(`/chains/${TEST_CHAIN}/open-models`)
    assert.deepEqual(open.data.models.map((m) => [m.id, m.role]), [[newId, null]])

    const single = await call(`/chains/${TEST_CHAIN}/dashboard`)
    assert.equal(single.data.multi, undefined)
    assert.equal(single.data.id, newId)

    // Nothing deleted: the closed model is still fully readable by id.
    const oldDash = await call(`/models/${oldId}/dashboard`)
    assert.equal(oldDash.status, 200)
    assert.equal(oldDash.data.bilan.totalSortie, 100)
    const rows = await all('SELECT qty FROM production_history WHERE model_id = $1', [oldId])
    assert.equal(rows.length, 2)
  })

  await t.test('"Clôturer le modèle" manuel, même sans avoir atteint la quantité', async () => {
    const res = await createModel({ client: 'TEST_OVERLAP_MANUAL', qteTotale: 500, dessin: 'OV-MAN' })
    assert.equal(res.status, 201) // one slot free again since the old one closed
    const close = await call(`/models/${res.data.id}/close`, { method: 'POST', token: methodeToken })
    assert.equal(close.status, 200)
    const open = await call(`/chains/${TEST_CHAIN}/open-models`)
    assert.deepEqual(open.data.models.map((m) => m.id), [newId])
  })
})

test('Migration status: les modèles existants restent exactement comme avant (fini → closed, le reste → active)', async (t) => {
  const now = new Date().toISOString()
  const ids = { finished: 'mdl_mig_fin', running: 'mdl_mig_run', inactive: 'mdl_mig_off', variant: 'mdl_mig_var' }
  t.after(async () => {
    await run('DELETE FROM models WHERE id = ANY($1)', [Object.values(ids)])
  })
  const insert = (id, active, qte, parent = null) =>
    run(
      `INSERT INTO models (id, client, qte_totale, chain_number, active, parent_model_id, status, created_at, updated_at)
       VALUES ($1, 'TEST_MIG', $2, 7, $3, $4, 'active', $5, $5)`,
      [id, qte, active, parent, now]
    )
  // Before this feature, "finished" = Entré reached Qté totale AND En cours = 0.
  await insert(ids.finished, 1, 50)
  await run('INSERT INTO production_totals (model_id, total_entree, updated_at) VALUES ($1, 50, $2)', [ids.finished, now])
  await run(`INSERT INTO production_history (id, model_id, chain_number, date, slot_index, qty) VALUES ('ph_mig_1', $1, 7, '2026-01-10', 0, 50)`, [ids.finished])
  await insert(ids.variant, 1, 10, ids.finished)
  await insert(ids.running, 1, 100)
  await run('INSERT INTO production_totals (model_id, total_entree, updated_at) VALUES ($1, 50, $2)', [ids.running, now])
  await insert(ids.inactive, 0, 100)

  const flag = await get('SELECT value FROM config WHERE key = $1', ['models_status_backfilled'])
  await run('DELETE FROM config WHERE key = $1', ['models_status_backfilled'])
  try {
    await migrateModelStatus()
  } finally {
    if (flag) await run(`INSERT INTO config (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = excluded.value`, ['models_status_backfilled', flag.value])
  }

  const status = Object.fromEntries((await all('SELECT id, status FROM models WHERE id = ANY($1)', [Object.values(ids)])).map((r) => [r.id, r.status]))
  assert.equal(status[ids.finished], 'closed')
  assert.equal(status[ids.variant], 'closed')
  assert.equal(status[ids.inactive], 'closed')
  assert.equal(status[ids.running], 'active') // still running before → still open after
  assert.ok(await get('SELECT id FROM production_history WHERE model_id = $1', [ids.finished])) // data untouched
})

// Bug found in the same exercise: Présence (rh_attendance/rh_attendance_history)
// had no date parameter at all — every save landed on "today" regardless of
// intent, unlike Agent Production's/Quality's hourly entry which both support
// a real date picker. saveAttendance() now takes an explicit date: the
// permanent history row always targets it, but the LIVE rh_attendance
// snapshot (what Rendement/Home/Classement read) is only touched when that
// date is actually today.
test('Présence (Agent Méthode/RH): correction rétroactive par date, sans jamais modifier le direct du jour', async (t) => {
  const TEST_CHAIN = 8
  const methodeToken = await login('methode', '1111')
  const rhToken = await login('rh', '8888')

  const previouslyActive = await get('SELECT id FROM models WHERE chain_number = $1 AND active = 1', [TEST_CHAIN])

  function daysAgo(n) {
    const d = new Date()
    d.setUTCDate(d.getUTCDate() - n)
    return d.toISOString().slice(0, 10)
  }
  const today = todayInFactoryTZ()
  const yesterday = daysAgo(1)
  const debut = daysAgo(5)
  const beforeDebut = daysAgo(6)
  const tomorrow = daysAgo(-1)

  const created = await call('/methode/models', {
    method: 'POST',
    token: methodeToken,
    body: { client: 'TEST_PRESENCE_DATE', qteTotale: 1000, dessin: 'TEST-PD', chainNumber: TEST_CHAIN, debut },
  })
  assert.equal(created.status, 201)
  const modelId = created.data.id

  t.after(async () => {
    await run('DELETE FROM models WHERE id = $1', [modelId])
    await run('DELETE FROM audit_log WHERE model_id = $1', [modelId])
    await run('DELETE FROM rh_attendance_history WHERE chain_number = $1 AND date IN ($2, $3)', [TEST_CHAIN, yesterday, today])
    if (previouslyActive) await run('UPDATE models SET active = 1 WHERE id = $1', [previouslyActive.id])
  })

  await t.test("aucune donnée pour hier pour l'instant → tout à zéro", async () => {
    const res = await call(`/methode/models/${modelId}/attendance?date=${yesterday}`, { token: methodeToken })
    assert.equal(res.status, 200)
    assert.equal(res.data.date, yesterday)
    assert.ok(SPECIALTIES.every((sp) => res.data.attendance[sp] === 0))
  })

  await t.test("sauvegarde pour hier: acceptée, marquée rétroactive, réellement enregistrée — et NE touche PAS le direct du jour", async () => {
    const put = await call(`/methode/models/${modelId}/attendance`, {
      method: 'PUT',
      token: methodeToken,
      body: { attendance: { Machinistes: 15 }, date: yesterday },
    })
    assert.equal(put.status, 200)
    assert.equal(put.data.date, yesterday)
    assert.equal(put.data.isBackdated, true)

    const reloaded = await call(`/methode/models/${modelId}/attendance?date=${yesterday}`, { token: methodeToken })
    assert.equal(reloaded.data.attendance.Machinistes, 15)

    // Le direct du jour (ce que Rendement/Home lisent) reste à zéro — une
    // correction rétroactive ne doit jamais changer "aujourd'hui" en silence.
    const dashboard = await call(`/chains/${TEST_CHAIN}/dashboard`)
    assert.equal(dashboard.data.ouvriers.presents, 0)
    const todayAttendance = await call(`/methode/models/${modelId}/attendance?date=${today}`, { token: methodeToken })
    assert.ok(SPECIALTIES.every((sp) => todayAttendance.data.attendance[sp] === 0))
  })

  await t.test("sauvegarde pour aujourd'hui: non rétroactive, et reflétée immédiatement sur le direct", async () => {
    const put = await call(`/methode/models/${modelId}/attendance`, {
      method: 'PUT',
      token: methodeToken,
      body: { attendance: { Machinistes: 12 }, date: today },
    })
    assert.equal(put.status, 200)
    assert.equal(put.data.isBackdated, false)

    const dashboard = await call(`/chains/${TEST_CHAIN}/dashboard`)
    assert.equal(dashboard.data.ouvriers.presents, 12)

    // Hier reste inchangé (15) — les deux dates sont indépendantes.
    const yesterdayAttendance = await call(`/methode/models/${modelId}/attendance?date=${yesterday}`, { token: methodeToken })
    assert.equal(yesterdayAttendance.data.attendance.Machinistes, 15)
  })

  await t.test('RH utilise exactement le même mécanisme (endpoint séparé, même stockage)', async () => {
    const put = await call(`/rh/models/${modelId}/attendance`, {
      method: 'PUT',
      token: rhToken,
      body: { attendance: { Machinistes: 20 }, date: yesterday },
    })
    assert.equal(put.status, 200)
    assert.equal(put.data.isBackdated, true)
    const reloaded = await call(`/rh/models/${modelId}/attendance?date=${yesterday}`, { token: rhToken })
    assert.equal(reloaded.data.attendance.Machinistes, 20)
    // Toujours sans toucher au direct du jour (resté à 12 du subtest précédent).
    const dashboard = await call(`/chains/${TEST_CHAIN}/dashboard`)
    assert.equal(dashboard.data.ouvriers.presents, 12)
  })

  await t.test('rejette une date future', async () => {
    const put = await call(`/methode/models/${modelId}/attendance`, {
      method: 'PUT',
      token: methodeToken,
      body: { attendance: { Machinistes: 1 }, date: tomorrow },
    })
    assert.equal(put.status, 400)
    assert.equal(put.data.error, 'date_in_future')
  })

  await t.test('rejette une date avant Début du modèle', async () => {
    const put = await call(`/methode/models/${modelId}/attendance`, {
      method: 'PUT',
      token: methodeToken,
      body: { attendance: { Machinistes: 1 }, date: beforeDebut },
    })
    assert.equal(put.status, 400)
    assert.equal(put.data.error, 'date_before_debut')
  })
})

// Bug found in the same exercise: quality_history's unique key had no
// model_id, so a Couleur/Variante chain with two colours reporting "Pièces
// retouche" for the SAME hour silently overwrote one colour's row with the
// other's — and GET /quality/models/:id/hourly built its qty lookup with
// Object.fromEntries() (last row wins), so even Agent Production's correct,
// separate qty per colour got collapsed to just one colour's number.
test('Quality: deux couleurs saisissent "Pièces retouche" à la même heure séparément, Qualité% correct par couleur et combiné', async (t) => {
  const TEST_CHAIN = 8
  const methodeToken = await login('methode', '1111')
  const productionToken = await login('production', '2222')
  const qualityToken = await login('quality', '7777')
  const today = todayInFactoryTZ()

  const previouslyActive = await get('SELECT id FROM models WHERE chain_number = $1 AND active = 1', [TEST_CHAIN])

  const created = await call('/methode/models', {
    method: 'POST',
    token: methodeToken,
    body: { client: 'TEST_QCOLOR', qteTotale: 1000, dessin: 'TEST-QC', chainNumber: TEST_CHAIN, debut: today },
  })
  assert.equal(created.status, 201)
  const rootId = created.data.id

  t.after(async () => {
    await run('DELETE FROM models WHERE id = $1', [rootId]) // cascades to the variant too
    await run('DELETE FROM audit_log WHERE model_id = $1', [rootId])
    if (previouslyActive) await run('UPDATE models SET active = 1 WHERE id = $1', [previouslyActive.id])
  })

  const variant = await call(`/methode/models/${rootId}/variants`, {
    method: 'POST',
    token: methodeToken,
    body: { label: '800', qteTotale: 300 },
  })
  assert.equal(variant.status, 201)
  const variantId = variant.data.id

  // Production for both colours at the same hour (slot 4): root=5, variant=10.
  await call(`/production/models/${rootId}/hourly/4`, { method: 'PUT', token: productionToken, body: { qty: 5, date: today } })
  await call(`/production/models/${rootId}/hourly/4`, {
    method: 'PUT',
    token: productionToken,
    body: { qty: 10, date: today, targetModelId: variantId },
  })

  await t.test('Quality peut saisir "Pièces retouche" séparément pour chaque couleur, sans écraser l\'autre', async () => {
    const putRoot = await call(`/quality/models/${rootId}/hourly/4`, {
      method: 'PUT',
      token: qualityToken,
      body: { pieceRetouche: 1, date: today },
    })
    assert.equal(putRoot.status, 200)
    const putVariant = await call(`/quality/models/${rootId}/hourly/4`, {
      method: 'PUT',
      token: qualityToken,
      body: { pieceRetouche: 2, date: today, targetModelId: variantId },
    })
    assert.equal(putVariant.status, 200)

    const rows = await all(
      'SELECT model_id, piece_retouche FROM quality_history WHERE chain_number = $1 AND date = $2 AND slot_index = 4',
      [TEST_CHAIN, today]
    )
    assert.equal(rows.length, 2) // les deux lignes existent, aucune n'a écrasé l'autre
    const byModel = Object.fromEntries(rows.map((r) => [r.model_id, r.piece_retouche]))
    assert.equal(byModel[rootId], 1)
    assert.equal(byModel[variantId], 2)
  })

  await t.test("GET hourly renvoie le qty/retouche/Qualité% combinés, ET le détail correct par couleur", async () => {
    const hourly = await call(`/quality/models/${rootId}/hourly?date=${today}`, { token: qualityToken })
    assert.equal(hourly.status, 200)
    const slot4 = hourly.data.hourly.find((s) => s.index === 4)

    // Combiné: qty = 5 + 10 = 15, retouche = 1 + 2 = 3, Qualité% = (15-3)/15*100 = 80.
    assert.equal(slot4.qty, 15)
    assert.equal(slot4.pieceRetouche, 3)
    assert.equal(slot4.qualityPct, computeQualityPct(15, 3))
    assert.equal(slot4.qualityPct, 80)

    // Détail par couleur: chacune garde son propre Qualité%, jamais mélangé.
    const byModel = Object.fromEntries(slot4.byModel.map((c) => [c.modelId, c]))
    assert.equal(byModel[rootId].qty, 5)
    assert.equal(byModel[rootId].pieceRetouche, 1)
    assert.equal(byModel[rootId].qualityPct, computeQualityPct(5, 1))
    assert.equal(byModel[variantId].qty, 10)
    assert.equal(byModel[variantId].pieceRetouche, 2)
    assert.equal(byModel[variantId].qualityPct, computeQualityPct(10, 2))
  })

  await t.test('le dashboard combiné (Qualité% du jour) reflète bien les deux couleurs ensemble, pas une seule', async () => {
    const dash = await call(`/chains/${TEST_CHAIN}/dashboard`)
    assert.equal(dash.data.quality.pieceRetoucheToday, 3)
    assert.equal(dash.data.quality.dailyPercentage, computeQualityPct(dash.data.produit, 3))
  })
})

function addDaysStr(dateStr, n) {
  const d = new Date(`${dateStr}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

test('Planning: Agent Méthode planifie heure par heure, comparé automatiquement au Réel (Plan vs Réel)', async (t) => {
  const TEST_CHAIN = 8
  const methodeToken = await login('methode', '1111')
  const productionToken = await login('production', '2222')

  const today = todayInFactoryTZ()
  const tomorrow = addDaysStr(today, 1)
  const yesterday = addDaysStr(today, -1)

  const previouslyActive = await get('SELECT id FROM models WHERE chain_number = $1 AND active = 1', [TEST_CHAIN])
  const created = await call('/methode/models', {
    method: 'POST',
    token: methodeToken,
    body: { client: 'PLAN_TEST', qteTotale: 200, debut: today, dessin: 'PLN-1', chainNumber: TEST_CHAIN },
  })
  assert.equal(created.status, 201)
  const modelId = created.data.id

  t.after(async () => {
    await run('DELETE FROM models WHERE id = $1', [modelId])
    await run('DELETE FROM audit_log WHERE model_id = $1', [modelId])
    if (previouslyActive) await run('UPDATE models SET active = 1 WHERE id = $1', [previouslyActive.id])
  })

  await t.test("aucun plan saisi → GET /planning/all renvoie un objet 'days' vide et le dashboard public omet 'planning'", async () => {
    const planning = await call(`/methode/models/${modelId}/planning/all`, { token: methodeToken })
    assert.equal(planning.status, 200)
    assert.deepEqual(planning.data.days, {})
    assert.equal(planning.data.debut, today)
    assert.equal(planning.data.totalPlanned, 0)
    assert.equal(planning.data.expectedFinishDate, null)
    assert.equal(planning.data.hourlySlots.length, 9)

    const dash = await call(`/models/${modelId}/dashboard`)
    assert.equal(dash.data.planning.hasPlan, false)
  })

  await t.test("rejette une date avant Début du modèle", async () => {
    const res = await call(`/methode/models/${modelId}/planning/${yesterday}`, {
      method: 'PUT',
      token: methodeToken,
      body: { hourly: [{ index: 0, qty: 10 }] },
    })
    assert.equal(res.status, 400)
    assert.equal(res.data.error, 'date_before_debut')
  })

  await t.test("saisie du plan sur 2 jours → total cumulé correct et date de fin prévue calculée automatiquement", async () => {
    const putToday = await call(`/methode/models/${modelId}/planning/${today}`, {
      method: 'PUT',
      token: methodeToken,
      body: { hourly: [{ index: 0, qty: 50 }, { index: 1, qty: 60 }, { index: 2, qty: 60 }] }, // 170
    })
    assert.equal(putToday.status, 200)
    assert.equal(putToday.data.totalPlanned, 170)
    assert.equal(putToday.data.expectedFinishDate, null) // 170 < 200, pas encore atteint

    // Demain: +40 → cumulé 210 >= 200 (qteTotale) → la fin prévue tombe demain.
    const putTomorrow = await call(`/methode/models/${modelId}/planning/${tomorrow}`, {
      method: 'PUT',
      token: methodeToken,
      body: { hourly: [{ index: 0, qty: 40 }] },
    })
    assert.equal(putTomorrow.status, 200)
    assert.equal(putTomorrow.data.totalPlanned, 210)
    assert.equal(putTomorrow.data.expectedFinishDate, tomorrow)
  })

  await t.test("GET /planning/all renvoie exactement les heures saisies pour chaque jour, rien d'autre (jamais un faux 0)", async () => {
    const planning = await call(`/methode/models/${modelId}/planning/all`, { token: methodeToken })
    assert.equal(planning.data.days[today]['0'], 50)
    assert.equal(planning.data.days[today]['1'], 60)
    assert.equal(planning.data.days[today]['2'], 60)
    assert.equal(planning.data.days[today]['3'], undefined) // pas de ligne du tout, pas un faux 0
    assert.equal(planning.data.days[tomorrow]['0'], 40)
  })

  await t.test("Plan vs Réel sur le dashboard: production réelle logée aujourd'hui comparée heure par heure et jour par jour", async () => {
    const prod = await call(`/production/models/${modelId}/hourly/0`, {
      method: 'PUT',
      token: productionToken,
      body: { qty: 45 },
    })
    assert.equal(prod.status, 200)

    const dash = await call(`/models/${modelId}/dashboard`)
    const planning = dash.data.planning
    assert.equal(planning.hasPlan, true)
    assert.equal(planning.totalPlanned, 210)
    assert.equal(planning.expectedFinishDate, tomorrow)

    const slot0 = planning.todayHourly.find((s) => s.index === 0)
    assert.equal(slot0.planQty, 50)
    assert.equal(slot0.realQty, 45)
    const slot1 = planning.todayHourly.find((s) => s.index === 1)
    assert.equal(slot1.planQty, 60)
    assert.equal(slot1.realQty, 0)

    assert.equal(planning.daily.length, 2) // aujourd'hui + demain (la fin prévue)
    const dayToday = planning.daily.find((d) => d.date === today)
    assert.equal(dayToday.planQty, 170)
    assert.equal(dayToday.realQty, 45)
    assert.equal(dayToday.planCumulative, 170)
    assert.equal(dayToday.realCumulative, 45)
    const dayTomorrow = planning.daily.find((d) => d.date === tomorrow)
    assert.equal(dayTomorrow.planQty, 40)
    assert.equal(dayTomorrow.realQty, 0)
    assert.equal(dayTomorrow.planCumulative, 210)
    assert.equal(dayTomorrow.realCumulative, 45)
  })

  await t.test("effacer une heure déjà planifiée (qty: null) la supprime réellement, sans laisser un faux 0", async () => {
    const clear = await call(`/methode/models/${modelId}/planning/${today}`, {
      method: 'PUT',
      token: methodeToken,
      body: { hourly: [{ index: 2, qty: null }] },
    })
    assert.equal(clear.status, 200)
    assert.equal(clear.data.totalPlanned, 150) // 210 - 60

    const planning = await call(`/methode/models/${modelId}/planning/all`, { token: methodeToken })
    assert.equal(planning.data.days[today]['2'], undefined)

    const row = await get('SELECT id FROM planning_hourly WHERE model_id = $1 AND date = $2 AND slot_index = 2', [modelId, today])
    assert.equal(row, undefined) // la ligne a été supprimée, pas mise à 0
  })
})

test('⚙️ Réglages: gestion des spécialités (ajout/renommage/suppression) et le journal de feedback', async (t) => {
  const TEST_CHAIN = 8
  const methodeToken = await login('methode', '1111')
  const patronToken = await login('patron', '3333')
  const productionToken = await login('production', '2222')
  const TMP = `TEST_SPEC_${Date.now()}`
  const TMP_RENAMED = `${TMP}_RENAMED`

  t.after(async () => {
    // Idempotent cleanup regardless of which step the test reached.
    await run('DELETE FROM specialty_defs WHERE name = ANY($1)', [[TMP, TMP_RENAMED]])
    await run('DELETE FROM effectif_requis WHERE specialty = ANY($1)', [[TMP, TMP_RENAMED]])
  })

  await t.test("un token d'un autre département (ex. Production) ne peut ni lire ni modifier les spécialités", async () => {
    const getRes = await call('/settings/specialties/chain', { token: productionToken })
    assert.equal(getRes.status, 403)
    const postRes = await call('/settings/specialties/chain', { method: 'POST', token: productionToken, body: { name: TMP } })
    assert.equal(postRes.status, 403)
  })

  await t.test('groupe invalide → 400', async () => {
    const res = await call('/settings/specialties/bogus', { token: methodeToken })
    assert.equal(res.status, 400)
  })

  let settingsModelId
  await t.test('Agent Méthode ajoute une nouvelle spécialité → apparaît immédiatement dans la liste ET sur un nouveau modèle', async () => {
    const add = await call('/settings/specialties/chain', { method: 'POST', token: methodeToken, body: { name: TMP } })
    assert.equal(add.status, 201)
    assert.ok(add.data.specialties.includes(TMP))

    const previouslyActive = await get('SELECT id FROM models WHERE chain_number = $1 AND active = 1', [TEST_CHAIN])
    const created = await call('/methode/models', {
      method: 'POST',
      token: methodeToken,
      body: { client: 'SETTINGS_TEST', qteTotale: 100, dessin: 'SET-1', chainNumber: TEST_CHAIN },
    })
    assert.equal(created.status, 201)
    settingsModelId = created.data.id
    t.after(async () => {
      await run('DELETE FROM models WHERE id = $1', [settingsModelId])
      await run('DELETE FROM audit_log WHERE model_id = $1', [settingsModelId])
      if (previouslyActive) await run('UPDATE models SET active = 1 WHERE id = $1', [previouslyActive.id])
    })

    const model = await call(`/models/${settingsModelId}`, { token: methodeToken })
    assert.equal(model.data.effectif[TMP], 0) // la nouvelle spécialité apparaît, requis = 0 par défaut
  })

  // Le Patron (autre département autorisé) peut aussi renommer/supprimer.
  await t.test('renommer fusionne les données existantes (même mécanisme que la migration historique)', async () => {
    const putEffectif = await call(`/methode/models/${settingsModelId}/effectif`, {
      method: 'PUT',
      token: methodeToken,
      body: { effectif: { [TMP]: 7 } },
    })
    assert.equal(putEffectif.status, 200)

    const rename = await call(`/settings/specialties/chain/${encodeURIComponent(TMP)}`, {
      method: 'PUT',
      token: patronToken,
      body: { name: TMP_RENAMED },
    })
    assert.equal(rename.status, 200)
    assert.ok(rename.data.specialties.includes(TMP_RENAMED))
    assert.ok(!rename.data.specialties.includes(TMP))

    const row = await get('SELECT required FROM effectif_requis WHERE model_id = $1 AND specialty = $2', [settingsModelId, TMP_RENAMED])
    assert.equal(row.required, 7) // la valeur a suivi le renommage, pas perdue
  })

  await t.test("supprimer une spécialité l'enlève de la liste live, SANS toucher aux données déjà enregistrées", async () => {
    const del = await call(`/settings/specialties/chain/${encodeURIComponent(TMP_RENAMED)}`, {
      method: 'DELETE',
      token: methodeToken,
    })
    assert.equal(del.status, 200)
    assert.ok(!del.data.specialties.includes(TMP_RENAMED))

    // La ligne historique reste intacte — seule la liste "live" a changé.
    const row = await get('SELECT required FROM effectif_requis WHERE model_id = $1 AND specialty = $2', [settingsModelId, TMP_RENAMED])
    assert.equal(row.required, 7)

    const modelAfter = await call(`/models/${settingsModelId}`, { token: methodeToken })
    assert.equal(TMP_RENAMED in modelAfter.data.effectif, false) // n'apparaît plus sur un écran de saisie live
  })

  await t.test('📩 feedback: ouvert à tout département connecté, mais la lecture reste Méthode/Patron', async () => {
    const submit = await call('/settings/feedback', {
      method: 'POST',
      token: productionToken,
      body: { message: 'TEST_FEEDBACK_MESSAGE' },
    })
    assert.equal(submit.status, 201)

    const deniedRead = await call('/settings/feedback', { token: productionToken })
    assert.equal(deniedRead.status, 403)

    const read = await call('/settings/feedback', { token: methodeToken })
    assert.equal(read.status, 200)
    const found = read.data.reports.find((r) => r.message === 'TEST_FEEDBACK_MESSAGE')
    assert.ok(found)
    assert.equal(found.dept_key, 'production')

    t.after(async () => run('DELETE FROM feedback_reports WHERE id = $1', [found.id]))
  })

  await t.test('message vide → 400', async () => {
    const res = await call('/settings/feedback', { method: 'POST', token: methodeToken, body: { message: '   ' } })
    assert.equal(res.status, 400)
  })
})

test('Planning: contrôle manuel des jours ("+ إضافة يوم" / suppression) — planning_days', async (t) => {
  const TEST_CHAIN = 8
  const methodeToken = await login('methode', '1111')

  const today = todayInFactoryTZ()
  const skipAhead = addDaysStr(today, 3) // simulates skipping a holiday — not the next-in-line date
  const yesterday = addDaysStr(today, -1)

  const previouslyActive = await get('SELECT id FROM models WHERE chain_number = $1 AND active = 1', [TEST_CHAIN])
  const created = await call('/methode/models', {
    method: 'POST',
    token: methodeToken,
    body: { client: 'PLAN_DAYS_TEST', qteTotale: 100, debut: today, dessin: 'PLD-1', chainNumber: TEST_CHAIN },
  })
  assert.equal(created.status, 201)
  const modelId = created.data.id

  t.after(async () => {
    await run('DELETE FROM models WHERE id = $1', [modelId])
    await run('DELETE FROM audit_log WHERE model_id = $1', [modelId])
    if (previouslyActive) await run('UPDATE models SET active = 1 WHERE id = $1', [previouslyActive.id])
  })

  await t.test('un modèle tout juste créé est auto-amorcé avec exactement une ligne, à Début', async () => {
    const planning = await call(`/methode/models/${modelId}/planning/all`, { token: methodeToken })
    assert.deepEqual(planning.data.plannedDates, [today])
  })

  await t.test("+ إضافة يوم : ajoute une date au choix, même hors séquence (saute des jours) — triée à l'affichage", async () => {
    const res = await call(`/methode/models/${modelId}/planning/days`, {
      method: 'POST',
      token: methodeToken,
      body: { date: skipAhead },
    })
    assert.equal(res.status, 201)

    const planning = await call(`/methode/models/${modelId}/planning/all`, { token: methodeToken })
    assert.deepEqual(planning.data.plannedDates, [today, skipAhead])
  })

  await t.test('ré-ajouter la même date est un no-op idempotent (pas de doublon)', async () => {
    const res = await call(`/methode/models/${modelId}/planning/days`, {
      method: 'POST',
      token: methodeToken,
      body: { date: skipAhead },
    })
    assert.equal(res.status, 201)

    const planning = await call(`/methode/models/${modelId}/planning/all`, { token: methodeToken })
    assert.deepEqual(planning.data.plannedDates, [today, skipAhead])
  })

  await t.test('rejette une date avant Début du modèle', async () => {
    const res = await call(`/methode/models/${modelId}/planning/days`, {
      method: 'POST',
      token: methodeToken,
      body: { date: yesterday },
    })
    assert.equal(res.status, 400)
    assert.equal(res.data.error, 'date_before_debut')
  })

  await t.test('format de date invalide → 400', async () => {
    const res = await call(`/methode/models/${modelId}/planning/days`, {
      method: 'POST',
      token: methodeToken,
      body: { date: '03/09/2026' },
    })
    assert.equal(res.status, 400)
    assert.equal(res.data.error, 'invalid_date')
  })

  await t.test('supprimer un jour enlève la ligne ET efface les heures qui y étaient saisies (jamais de données orphelines)', async () => {
    const put = await call(`/methode/models/${modelId}/planning/${skipAhead}`, {
      method: 'PUT',
      token: methodeToken,
      body: { hourly: [{ index: 0, qty: 30 }] },
    })
    assert.equal(put.status, 200)
    assert.equal(put.data.totalPlanned, 30)

    const del = await call(`/methode/models/${modelId}/planning/days/${skipAhead}`, {
      method: 'DELETE',
      token: methodeToken,
    })
    assert.equal(del.status, 200)
    assert.equal(del.data.totalPlanned, 0) // la ligne supprimée emporte ses heures avec elle

    const planning = await call(`/methode/models/${modelId}/planning/all`, { token: methodeToken })
    assert.deepEqual(planning.data.plannedDates, [today])
    assert.equal(planning.data.days[skipAhead], undefined)

    const orphanRow = await get('SELECT id FROM planning_hourly WHERE model_id = $1 AND date = $2', [modelId, skipAhead])
    assert.equal(orphanRow, undefined)
  })
})

test('⏰ ساعات العمل: source unique des shifts (Planning/Production/Quality/Home) — ajout en fin de liste, suppression du dernier seulement', async (t) => {
  const methodeToken = await login('methode', '1111')
  const productionToken = await login('production', '2222')

  const before = await call('/settings/work-hours', { token: methodeToken })
  assert.equal(before.status, 200)
  const originalCount = before.data.workHours.length
  assert.ok(originalCount > 0)
  const firstSlot = before.data.workHours[0]

  await t.test("un token d'un autre département ne peut ni lire ni modifier les heures", async () => {
    assert.equal((await call('/settings/work-hours', { token: productionToken })).status, 403)
    assert.equal(
      (await call('/settings/work-hours', { method: 'POST', token: productionToken, body: { start: '16:00', end: '17:00' } })).status,
      403
    )
  })

  await t.test('heure invalide → 400', async () => {
    const res = await call('/settings/work-hours', { method: 'POST', token: methodeToken, body: { start: 'pas une heure', end: '17:00' } })
    assert.equal(res.status, 400)
  })

  let addedId
  await t.test('ajouter une shift → toujours en fin de liste (jamais insérée au milieu)', async () => {
    const res = await call('/settings/work-hours', { method: 'POST', token: methodeToken, body: { start: '16:00', end: '17:00' } })
    assert.equal(res.status, 201)
    assert.equal(res.data.workHours.length, originalCount + 1)
    const last = res.data.workHours[res.data.workHours.length - 1]
    assert.equal(last.index, originalCount)
    assert.equal(last.label, '16:00-17:00')
    addedId = last.id
  })
  t.after(async () => run('DELETE FROM work_hours WHERE id = $1', [addedId]))

  await t.test('supprimer une shift qui n\'est PAS la dernière → 400 (ne casserait pas les slot_index déjà enregistrés)', async () => {
    const res = await call(`/settings/work-hours/${firstSlot.id}`, { method: 'DELETE', token: methodeToken })
    assert.equal(res.status, 400)
    assert.equal(res.data.error, 'can_only_delete_last')
  })

  await t.test("modifier l'heure d'une shift existante en place reste toujours autorisé (sa position ne bouge pas)", async () => {
    const res = await call(`/settings/work-hours/${firstSlot.id}`, {
      method: 'PUT',
      token: methodeToken,
      body: { start: firstSlot.start, end: firstSlot.end },
    })
    assert.equal(res.status, 200)
    const stillFirst = res.data.workHours[0]
    assert.equal(stillFirst.id, firstSlot.id)
    assert.equal(stillFirst.label, firstSlot.label)
  })

  await t.test('supprimer la dernière shift (celle qu\'on vient d\'ajouter) → autorisé, revient à la liste initiale', async () => {
    const res = await call(`/settings/work-hours/${addedId}`, { method: 'DELETE', token: methodeToken })
    assert.equal(res.status, 200)
    assert.equal(res.data.workHours.length, originalCount)
    addedId = null
  })
})

test('📷 صورة الموديل: upload/delete gated to Agent Méthode, degrades cleanly without Blob storage configured', async (t) => {
  const TEST_CHAIN = 8
  const methodeToken = await login('methode', '1111')

  const previouslyActive = await get('SELECT id FROM models WHERE chain_number = $1 AND active = 1', [TEST_CHAIN])
  const created = await call('/methode/models', {
    method: 'POST',
    token: methodeToken,
    body: { client: 'IMAGE_TEST', qteTotale: 10, debut: todayInFactoryTZ(), dessin: 'IMG-1', chainNumber: TEST_CHAIN },
  })
  assert.equal(created.status, 201)
  const modelId = created.data.id

  t.after(async () => {
    await run('DELETE FROM models WHERE id = $1', [modelId])
    await run('DELETE FROM audit_log WHERE model_id = $1', [modelId])
    if (previouslyActive) await run('UPDATE models SET active = 1 WHERE id = $1', [previouslyActive.id])
  })

  await t.test('sans BLOB_READ_WRITE_TOKEN configuré (cas de ce test local) → 503 storage_not_configured, jamais un crash', async () => {
    assert.equal(process.env.BLOB_READ_WRITE_TOKEN, undefined)
    const res = await call(`/methode/models/${modelId}/image`, {
      method: 'PUT',
      token: methodeToken,
      body: { imageBase64: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=' },
    })
    assert.equal(res.status, 503)
    assert.equal(res.data.error, 'storage_not_configured')

    const model = await call(`/models/${modelId}`)
    assert.equal(model.data.image_url, null) // jamais partiellement enregistré
  })

  await t.test('modèle introuvable → 404', async () => {
    const res = await call('/methode/models/mdl_does_not_exist/image', {
      method: 'PUT',
      token: methodeToken,
      body: { imageBase64: 'data:image/png;base64,AAAA' },
    })
    assert.equal(res.status, 404)
  })

  await t.test('supprimer une image quand il n\'y en a pas déjà → ok (no-op), jamais une erreur', async () => {
    const res = await call(`/methode/models/${modelId}/image`, { method: 'DELETE', token: methodeToken })
    assert.equal(res.status, 200)
  })
})

// ---------------------------------------------------------------------------
// Phase 1 hardening — regression tests for each fix in that batch.
// ---------------------------------------------------------------------------

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

function listSourceFiles(dir) {
  const out = []
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'dist') continue
    const full = path.join(dir, name)
    if (statSync(full).isDirectory()) out.push(...listSourceFiles(full))
    else if (/\.(js|jsx|json|html)$/.test(name)) out.push(full)
  }
  return out
}

test('Predict (football) supprimé: aucun fichier, route, import ni config restant', async (t) => {
  await t.test('les dossiers/fichiers Predict n’existent plus', () => {
    assert.equal(existsSync(path.join(REPO_ROOT, 'client/src/predict')), false)
    assert.equal(existsSync(path.join(REPO_ROOT, 'server/src/routes/predict.js')), false)
  })

  await t.test('aucune référence football/Predict dans le code, la config ou le déploiement', () => {
    const files = [
      ...listSourceFiles(path.join(REPO_ROOT, 'client/src')),
      ...listSourceFiles(path.join(REPO_ROOT, 'server/src')),
      ...listSourceFiles(path.join(REPO_ROOT, 'api')),
      path.join(REPO_ROOT, 'client/index.html'),
      path.join(REPO_ROOT, 'vercel.json'),
      path.join(REPO_ROOT, '.env.example'),
      path.join(REPO_ROOT, 'package.json'),
      path.join(REPO_ROOT, 'client/package.json'),
    ]
    // The one allowed mention: db/index.js's clean-up that drops Predict's
    // two old tables (dropRemovedPredictTables) — nothing else may remain.
    const withoutCleanup = (f) =>
      readFileSync(f, 'utf8')
        .replace(/\/\/ The football "Predict" app was removed[\s\S]*?\n}\n/, '')
        .replace('.then(dropRemovedPredictTables)', '')
    const offenders = files.filter((f) => /predict|football|FOOTBALL_DATA_KEY/i.test(withoutCleanup(f)))
    assert.deepEqual(offenders.map((f) => path.relative(REPO_ROOT, f)), [])
  })

  await t.test('les anciennes routes /api/predict/* ne répondent plus (404)', async () => {
    assert.equal((await call('/predict/leagues')).status, 404)
    assert.equal((await call('/predict/matches')).status, 404)
    assert.equal((await call('/predict/analyze', { method: 'POST', body: { matchId: 1 } })).status, 404)
  })
})

test('/api/ask exige une connexion département (requireAnyDept)', async (t) => {
  const today = todayInFactoryTZ()
  const usage = async () => Number((await get('SELECT count FROM ask_usage WHERE date = $1', [today]))?.count || 0)

  await t.test('sans token → 401, et le quota journalier n’est PAS consommé', async () => {
    const before = await usage()
    const res = await call('/ask', { method: 'POST', body: { question: 'test' } })
    assert.equal(res.status, 401)
    assert.equal(res.data.error, 'missing_token')
    assert.equal(await usage(), before)
  })

  await t.test('token invalide → 401', async () => {
    const res = await call('/ask', { method: 'POST', token: 'not-a-real-token', body: { question: 'test' } })
    assert.equal(res.status, 401)
  })

  await t.test('n’importe quel département connecté passe l’authentification', async () => {
    for (const [dept, pin] of [['production', '2222'], ['quality', '7777']]) {
      const res = await call('/ask', { method: 'POST', token: await login(dept, pin), body: { question: 'test' } })
      assert.notEqual(res.status, 401)
      assert.notEqual(res.status, 403)
      // Test DB has no ANTHROPIC_API_KEY: past auth, the route's own
      // "not configured" answer is exactly what comes back.
      if (!process.env.ANTHROPIC_API_KEY) {
        assert.equal(res.status, 503)
        assert.equal(res.data.error, 'ai_not_configured')
      }
    }
  })

  await t.test('question vide toujours refusée (400) une fois authentifié', async () => {
    const res = await call('/ask', { method: 'POST', token: await login('production', '2222'), body: { question: '' } })
    assert.equal(res.status, 400)
  })
})

test('Modèle courant = status active: un modèle clôturé (active=1) n’est plus pris pour le modèle en cours', async (t) => {
  const TEST_CHAIN = 8
  const methodeToken = await login('methode', '1111')
  const patronToken = await login('patron', '3333')
  const rhToken = await login('rh', '8888')
  const today = todayInFactoryTZ()

  const openBefore = await call(`/chains/${TEST_CHAIN}/open-models`)
  assert.equal(openBefore.data.models.length, 0, `chaîne ${TEST_CHAIN} doit être libre pour ce test`)

  const created = []
  t.after(async () => {
    for (const id of created) {
      await run('DELETE FROM audit_log WHERE model_id = $1', [id])
      await run('DELETE FROM models WHERE id = $1', [id])
    }
  })
  async function createModel(client) {
    const res = await call('/methode/models', { method: 'POST', token: methodeToken, body: { chainNumber: TEST_CHAIN, debut: today, client, qteTotale: 100, dessin: client } })
    assert.equal(res.status, 201)
    created.push(res.data.id)
    return res.data.id
  }
  async function auditReportModelLine() {
    const res = await fetch(`${base}/audit/report?chainNumber=${TEST_CHAIN}&from=${today}&to=${today}`, {
      headers: { Authorization: `Bearer ${rhToken}` },
    })
    assert.equal(res.status, 200)
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(Buffer.from(await res.arrayBuffer()))
    return String(wb.getWorksheet('Résumé').getRow(3).getCell(2).value)
  }
  const modelIdsInList = async () => (await call('/models')).data.map((m) => m.id)

  const oldId = await createModel('TEST_STATUS_OLD')
  const newId = await createModel('TEST_STATUS_NEW')

  await t.test('deux modèles ouverts: le plus ancien reste le modèle de référence (comportement inchangé)', async () => {
    assert.match(await auditReportModelLine(), /TEST_STATUS_OLD/)
    const ids = await modelIdsInList()
    assert.ok(ids.includes(oldId) && ids.includes(newId))
  })

  await t.test('après clôture de l’ancien: audit, GET /models et /chains ne le prennent plus', async () => {
    const close = await call(`/models/${oldId}/close`, { method: 'POST', token: patronToken })
    assert.equal(close.status, 200)

    // Lifecycle unchanged: closed but still active = 1 (kept, readable).
    const row = await get('SELECT active, status FROM models WHERE id = $1', [oldId])
    assert.equal(row.active, 1)
    assert.equal(row.status, 'closed')
    assert.equal((await call(`/models/${oldId}/dashboard`)).status, 200)

    assert.match(await auditReportModelLine(), /TEST_STATUS_NEW/)
    const ids = await modelIdsInList()
    assert.ok(!ids.includes(oldId))
    assert.ok(ids.includes(newId))

    const chain = (await call('/chains')).data.find((c) => c.chainNumber === TEST_CHAIN)
    assert.deepEqual(chain.models.map((m) => m.id), [newId])
    assert.ok(chain.lastActivityToday) // the open model's own activity today
    const dash = await call(`/chains/${TEST_CHAIN}/dashboard`)
    assert.equal(dash.data.id, newId)
  })

  await t.test('les deux clôturés: plus aucun modèle courant, et leur activité ne marque plus la chaîne comme active', async () => {
    assert.equal((await call(`/models/${newId}/close`, { method: 'POST', token: methodeToken })).status, 200)
    assert.match(await auditReportModelLine(), /^Chaîne 8$/)
    const ids = await modelIdsInList()
    assert.ok(!ids.includes(oldId) && !ids.includes(newId))
    const chain = (await call('/chains')).data.find((c) => c.chainNumber === TEST_CHAIN)
    assert.equal(chain.model, null)
    assert.equal(chain.lastActivityToday, null)
  })
})

test('Verrouillage PIN par département + IP', async (t) => {
  const deptKey = 'test_lock_ip_dept'
  await run(
    `INSERT INTO departments (key, label, icon, pin_hash) VALUES ($1, 'Test', '🧪', $2)
     ON CONFLICT (key) DO UPDATE SET pin_hash = excluded.pin_hash`,
    [deptKey, bcrypt.hashSync('0000', 10)]
  )
  const previousVercel = process.env.VERCEL
  t.after(async () => {
    if (previousVercel === undefined) delete process.env.VERCEL
    else process.env.VERCEL = previousVercel
    await run('DELETE FROM login_attempts WHERE dept_key = $1', [deptKey])
    await run('DELETE FROM departments WHERE key = $1', [deptKey])
  })
  const tryPin = (pin, ip) =>
    call(`/auth/${deptKey}/login`, { method: 'POST', body: { pin }, headers: ip ? { 'x-vercel-forwarded-for': ip } : {} })

  await t.test('sur Vercel: même département + même IP → verrouillé après 5 échecs', async () => {
    process.env.VERCEL = '1'
    let last
    for (let i = 0; i < 5; i++) last = await tryPin('9999', '203.0.113.10')
    assert.equal(last.status, 423)
    assert.equal(last.data.error, 'locked')
    assert.equal((await tryPin('0000', '203.0.113.10')).status, 423) // even the right PIN
  })

  await t.test('même département + autre IP → pas bloqué', async () => {
    process.env.VERCEL = '1'
    const wrong = await tryPin('9999', '198.51.100.20')
    assert.equal(wrong.status, 401)
    assert.equal(wrong.data.attemptsRemaining, 4) // its own, fresh counter
    const ok = await tryPin('0000', '198.51.100.21')
    assert.equal(ok.status, 200)
    assert.ok(ok.data.token)
  })

  await t.test('le verrouillage expire: après 10 min, le bon code repasse et le compteur repart à zéro', async () => {
    process.env.VERCEL = '1'
    await run(`UPDATE login_attempts SET locked_until = $1 WHERE dept_key = $2 AND ip = $3`, [
      new Date(Date.now() - 1000).toISOString(),
      deptKey,
      '203.0.113.10',
    ])
    const ok = await tryPin('0000', '203.0.113.10')
    assert.equal(ok.status, 200)
    assert.equal(await get('SELECT 1 FROM login_attempts WHERE dept_key = $1 AND ip = $2', [deptKey, '203.0.113.10']), undefined)
  })

  await t.test('un succès remet le compteur à zéro pour cette IP', async () => {
    process.env.VERCEL = '1'
    await tryPin('9999', '192.0.2.30')
    await tryPin('9999', '192.0.2.30')
    assert.equal((await tryPin('0000', '192.0.2.30')).status, 200)
    const again = await tryPin('9999', '192.0.2.30')
    assert.equal(again.data.attemptsRemaining, 4)
  })

  await t.test('hors Vercel, un en-tête X-Forwarded-For/X-Vercel-* forgé est ignoré (pas de contournement)', async () => {
    delete process.env.VERCEL
    await run('DELETE FROM login_attempts WHERE dept_key = $1', [deptKey])
    let last
    for (let i = 0; i < 5; i++) {
      last = await call(`/auth/${deptKey}/login`, {
        method: 'POST',
        body: { pin: '9999' },
        headers: { 'x-vercel-forwarded-for': `10.0.0.${i}`, 'x-forwarded-for': `10.1.0.${i}`, 'x-real-ip': `10.2.0.${i}` },
      })
    }
    assert.equal(last.status, 423)
  })
})

test('CORS: origine Atlas de production + previews Atlas autorisées, le reste refusé', async (t) => {
  const saved = {
    VERCEL: process.env.VERCEL,
    CORS_ALLOWED_ORIGINS: process.env.CORS_ALLOWED_ORIGINS,
    CORS_PREVIEW_ORIGIN_PATTERN: process.env.CORS_PREVIEW_ORIGIN_PATTERN,
  }
  t.after(() => {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k]
      else process.env[k] = v
    }
  })
  const withOrigin = (origin, method = 'GET') =>
    fetch(`${base}/config`, { method, headers: { Origin: origin, ...(method === 'OPTIONS' ? { 'Access-Control-Request-Method': 'POST' } : {}) } })

  await t.test('production https://atlas-app-smoky.vercel.app → autorisée', async () => {
    process.env.VERCEL = '1'
    const res = await withOrigin('https://atlas-app-smoky.vercel.app')
    assert.equal(res.status, 200)
    assert.equal(res.headers.get('access-control-allow-origin'), 'https://atlas-app-smoky.vercel.app')
    const preflight = await withOrigin('https://atlas-app-smoky.vercel.app', 'OPTIONS')
    assert.equal(preflight.status, 204)
  })

  await t.test('previews Vercel réelles des deux projets Atlas → autorisées', async () => {
    process.env.VERCEL = '1'
    for (const origin of [
      'https://atlas-app-git-claude-atlas-producti-aa17b3-atlasaayads-projects.vercel.app',
      'https://atlas-app-kfr5-git-claude-atlas-pro-6bdc8f-atlasaayads-projects.vercel.app',
      'https://atlas-app-abc123xyz-atlasaayads-projects.vercel.app',
    ]) {
      const res = await withOrigin(origin)
      assert.equal(res.status, 200, origin)
      assert.equal(res.headers.get('access-control-allow-origin'), origin)
    }
  })

  await t.test('origines sans rapport → refusées (403), y compris d’autres *.vercel.app', async () => {
    process.env.VERCEL = '1'
    for (const origin of [
      'https://evil.example.com',
      'https://atlas-app-evil.vercel.app',
      'https://some-other-project.vercel.app',
      'https://atlas-app-git-x-otherteam-projects.vercel.app',
      'http://atlas-app-smoky.vercel.app', // http, not https
      'http://localhost:5173', // localhost only outside Vercel
    ]) {
      const res = await withOrigin(origin)
      assert.equal(res.status, 403, origin)
      assert.equal(res.headers.get('access-control-allow-origin'), null)
    }
    const preflight = await withOrigin('https://evil.example.com', 'OPTIONS')
    assert.equal(preflight.status, 403)
  })

  await t.test('même domaine (Origin = Host) et requêtes sans Origin → toujours autorisées', () => {
    process.env.VERCEL = '1'
    assert.equal(isOriginAllowed('https://atlas-custom.example.com', 'atlas-custom.example.com'), true)
    assert.equal(isOriginAllowed(undefined, 'anything'), true)
  })

  await t.test('configurable par variables d’environnement', () => {
    process.env.VERCEL = '1'
    process.env.CORS_ALLOWED_ORIGINS = 'https://atlas.example.com, https://tv.example.com/'
    process.env.CORS_PREVIEW_ORIGIN_PATTERN = '^https://preview-[a-z0-9]+\\.example\\.com$'
    assert.equal(isOriginAllowed('https://tv.example.com'), true)
    assert.equal(isOriginAllowed('https://preview-42.example.com'), true)
    assert.equal(isOriginAllowed('https://atlas-app-smoky.vercel.app'), false) // replaced, not merged
    delete process.env.CORS_ALLOWED_ORIGINS
    delete process.env.CORS_PREVIEW_ORIGIN_PATTERN
  })

  await t.test('développement local (hors Vercel): localhost autorisé', () => {
    delete process.env.VERCEL
    assert.equal(isOriginAllowed('http://localhost:5173', 'localhost:4000'), true)
  })
})

test('/api/personnel-admin réservé à RH et Patron', async (t) => {
  const date = todayInFactoryTZ()
  await t.test('sans token → 401', async () => {
    assert.equal((await call(`/personnel-admin?date=${date}`)).status, 401)
  })
  await t.test('RH → 200', async () => {
    const res = await call(`/personnel-admin?date=${date}`, { token: await login('rh', '8888') })
    assert.equal(res.status, 200)
    assert.equal(res.data.date, date)
  })
  await t.test('Patron → 200', async () => {
    assert.equal((await call(`/personnel-admin?date=${date}`, { token: await login('patron', '3333') })).status, 200)
  })
  await t.test('autre département (Production, Méthode) → 403', async () => {
    assert.equal((await call(`/personnel-admin?date=${date}`, { token: await login('production', '2222') })).status, 403)
    assert.equal((await call(`/personnel-admin?date=${date}`, { token: await login('methode', '1111') })).status, 403)
  })
})

test('Écrans publics (TV usine) toujours accessibles sans connexion', async () => {
  for (const p of ['/config', '/departments', '/chains', '/chains/1/dashboard', '/chains/1/open-models', '/chains/ranking', '/early-warnings', '/effectifs/overview', '/chains/1/history/day?date=' + todayInFactoryTZ()]) {
    const res = await call(p)
    assert.equal(res.status, 200, p)
  }
})

test('Avertissement PIN_* manquants en production', async (t) => {
  const ALL_PINS = Object.fromEntries(
    ['methode', 'production', 'patron', 'mecanicien', 'magasin', 'logistics', 'quality', 'rh', 'coupe', 'depot', 'finale', 'echantillon'].map((k) => [`PIN_${k.toUpperCase()}`, 'x'])
  )
  await t.test('production + PIN_* manquants → avertissement listant les variables', () => {
    const warning = productionPinWarning({ VERCEL_ENV: 'production', PIN_RH: '1' })
    assert.ok(warning)
    assert.match(warning, /PIN_METHODE/)
    assert.match(warning, /PIN_PATRON/)
    assert.doesNotMatch(warning, /PIN_RH\b/)
    assert.match(warning, /default\/fallback PINs/)
  })
  await t.test('NODE_ENV=production seul suffit aussi', () => {
    assert.ok(productionPinWarning({ NODE_ENV: 'production' }))
  })
  await t.test('production + tous les PIN_* définis → aucun avertissement', () => {
    assert.equal(productionPinWarning({ VERCEL_ENV: 'production', ...ALL_PINS }), null)
  })
  await t.test('développement local → aucun avertissement (comportement inchangé)', () => {
    assert.equal(productionPinWarning({}), null)
    assert.equal(productionPinWarning({ VERCEL_ENV: 'preview', NODE_ENV: 'development' }), null)
  })
})

test('ESLint: `npm run lint` passe (0 erreur)', { skip: !existsSync(path.join(REPO_ROOT, 'client/node_modules/eslint')) && 'client deps not installed' }, () => {
  // Throws (non-zero exit) on any lint error; warnings are allowed.
  execFileSync('npm', ['run', 'lint'], { cwd: REPO_ROOT, stdio: 'pipe' })
})

// ---------------------------------------------------------------------------
// Fiche Modèle — documents (private storage), composition, factory info,
// manufacturing timeline. Storage is a fake in-memory adapter here (there
// is no real Blob store in tests); the real private-Blob path is verified
// manually on the Vercel preview.
// ---------------------------------------------------------------------------

function fakeDocumentStorage() {
  const objects = new Map()
  const calls = { presign: [], read: [], remove: [] }
  return {
    objects,
    calls,
    async presignUpload(args) {
      calls.presign.push(args)
      return { type: 'blob.generate-presigned-url', presignedUrlPayload: { fake: true } }
    },
    async stat(pathname) {
      return objects.get(pathname) || null
    },
    async remove(pathname) {
      calls.remove.push(pathname)
      objects.delete(pathname)
    },
    async signedReadUrl(pathname, validUntil) {
      calls.read.push({ pathname, validUntil })
      return `https://fake-private-blob.test/${pathname}?until=${validUntil}`
    },
  }
}

test('Fiche Modèle', async (t) => {
  const TEST_CHAIN = 8
  const methodeToken = await login('methode', '1111')
  const patronToken = await login('patron', '3333')
  const productionToken = await login('production', '2222')
  const qualityToken = await login('quality', '7777')
  const coupeToken = await login('coupe', '9999')
  const logisticsToken = await login('logistics', '6666')
  const today = todayInFactoryTZ()

  const openBefore = await call(`/chains/${TEST_CHAIN}/open-models`)
  assert.equal(openBefore.data.models.length, 0, `chaîne ${TEST_CHAIN} doit être libre pour ce test`)

  const storage = fakeDocumentStorage()
  setDocumentStorageForTests(storage)
  const savedEnv = { token: process.env.DOCS_BLOB_READ_WRITE_TOKEN }
  process.env.DOCS_BLOB_READ_WRITE_TOKEN = 'test-docs-token'
  const savedFactory = await get("SELECT value FROM config WHERE key = 'factory_info'")

  const created = []
  t.after(async () => {
    setDocumentStorageForTests(null)
    if (savedEnv.token === undefined) delete process.env.DOCS_BLOB_READ_WRITE_TOKEN
    else process.env.DOCS_BLOB_READ_WRITE_TOKEN = savedEnv.token
    if (savedFactory) await run("UPDATE config SET value = $1 WHERE key = 'factory_info'", [savedFactory.value])
    else await run("DELETE FROM config WHERE key = 'factory_info'")
    for (const id of [...created].reverse()) {
      await run('DELETE FROM audit_log WHERE model_id = $1', [id])
      await run('DELETE FROM models WHERE id = $1', [id])
    }
  })

  async function createModel(client, qteTotale = 100) {
    const res = await call('/methode/models', { method: 'POST', token: methodeToken, body: { chainNumber: TEST_CHAIN, debut: today, client, qteTotale, dessin: client } })
    assert.equal(res.status, 201)
    created.push(res.data.id)
    return res.data.id
  }
  const modelA = await createModel('TEST_FICHE_A', 50)
  const modelB = await createModel('TEST_FICHE_B', 80)
  const variantRes = await call(`/methode/models/${modelA}/variants`, { method: 'POST', token: methodeToken, body: { label: 'Rouge', qteTotale: 20 } })
  assert.equal(variantRes.status, 201)
  const variantA = variantRes.data.id
  created.push(variantA)

  // Full 3-step upload as the browser does it; returns the confirm response.
  async function upload(modelId, token, { filename = 'tech-pack.pdf', mimeType = 'application/pdf', sizeBytes = 8 * 1024 * 1024, stored } = {}) {
    const reqRes = await call(`/models/${modelId}/documents/upload-request`, { method: 'POST', token, body: { filename, mimeType, sizeBytes } })
    if (reqRes.status !== 200) return { step: 'request', ...reqRes }
    const { ticket, pathname } = reqRes.data
    const presign = await call(`/models/${modelId}/documents/presign`, {
      method: 'POST',
      token,
      body: { type: 'blob.generate-presigned-url', payload: { pathname, clientPayload: ticket, multipart: false } },
    })
    if (presign.status !== 200) return { step: 'presign', ...presign }
    storage.objects.set(pathname, stored || { size: sizeBytes, contentType: mimeType }) // the "direct browser upload"
    const confirm = await call(`/models/${modelId}/documents`, { method: 'POST', token, body: { ticket } })
    return { step: 'confirm', pathname, ticket, ...confirm }
  }

  // --- Documents: authorization & storage -----------------------------------

  let docA
  await t.test('Méthode téléverse un PDF (~8 Mo) en 3 étapes; aucune URL ni chemin de stockage renvoyé', async () => {
    const res = await upload(modelA, methodeToken)
    assert.equal(res.status, 201)
    docA = res.data.document
    assert.equal(docA.filename, 'tech-pack.pdf')
    assert.equal(docA.mimeType, 'application/pdf')
    assert.equal(docA.sizeBytes, 8 * 1024 * 1024)
    assert.equal(docA.uploadedBy, 'methode')
    assert.ok(!JSON.stringify(res.data).includes('model-docs/'))
    // The presigned PUT was scoped to that one pathname, type and size, 5 min.
    const p = storage.calls.presign.at(-1)
    assert.match(p.pathname, new RegExp(`^model-docs/${modelA}/[A-Za-z0-9_-]{32}\\.pdf$`))
    assert.equal(p.contentType, 'application/pdf')
    assert.equal(p.sizeBytes, 8 * 1024 * 1024)
    assert.ok(p.validUntil > Date.now() && p.validUntil <= Date.now() + 5 * 60 * 1000 + 2000)
    const row = await get('SELECT * FROM model_documents WHERE id = $1', [docA.id])
    assert.equal(row.model_id, modelA)
    assert.equal(row.storage_pathname, p.pathname)
    const audit = await get("SELECT dept_key FROM audit_log WHERE model_id = $1 AND action = 'upload_document'", [modelA])
    assert.equal(audit.dept_key, 'methode')
  })

  await t.test('Patron téléverse (JPG, PNG) et supprime', async () => {
    const jpg = await upload(modelA, patronToken, { filename: 'page1.JPG', mimeType: 'image/jpeg', sizeBytes: 300000 })
    assert.equal(jpg.status, 201)
    const png = await upload(modelA, patronToken, { filename: 'page2.png', mimeType: 'image/png', sizeBytes: 200000 })
    assert.equal(png.status, 201)
    const del = await call(`/models/${modelA}/documents/${png.data.document.id}`, { method: 'DELETE', token: patronToken })
    assert.equal(del.status, 200)
    assert.ok(!storage.objects.has(png.pathname)) // private object removed too
    assert.equal(await get('SELECT 1 FROM model_documents WHERE id = $1', [png.data.document.id]), undefined)
    assert.ok(await get("SELECT 1 FROM audit_log WHERE model_id = $1 AND action = 'delete_document' AND dept_key = 'patron'", [modelA]))
  })

  await t.test('Méthode supprime', async () => {
    const res = await upload(modelA, methodeToken, { filename: 'old.pdf', sizeBytes: 1000 })
    assert.equal(res.status, 201)
    assert.equal((await call(`/models/${modelA}/documents/${res.data.document.id}`, { method: 'DELETE', token: methodeToken })).status, 200)
  })

  await t.test('déconnecté: ni liste, ni ouverture, ni téléversement (401)', async () => {
    assert.equal((await call(`/models/${modelA}/fiche`)).status, 401)
    assert.equal((await call(`/models/${modelA}/documents/${docA.id}/open`, { method: 'POST' })).status, 401)
    assert.equal((await call(`/models/${modelA}/documents/upload-request`, { method: 'POST', body: { filename: 'a.pdf', mimeType: 'application/pdf', sizeBytes: 10 } })).status, 401)
    assert.equal((await call(`/models/${modelA}/documents/${docA.id}`, { method: 'DELETE' })).status, 401)
  })

  await t.test('tout département connecté peut lister et ouvrir (URL signée de 2 min, auditée)', async () => {
    for (const token of [productionToken, qualityToken, coupeToken, methodeToken, patronToken]) {
      const fiche = await call(`/models/${modelA}/fiche`, { token })
      assert.equal(fiche.status, 200)
      assert.ok(fiche.data.documents.some((d) => d.id === docA.id))
      assert.ok(!JSON.stringify(fiche.data).includes('model-docs/')) // metadata only
    }
    const before = Date.now()
    const open = await call(`/models/${modelA}/documents/${docA.id}/open`, { method: 'POST', token: productionToken })
    assert.equal(open.status, 200)
    assert.ok(open.data.url.startsWith('https://fake-private-blob.test/model-docs/'))
    assert.ok(open.data.expiresAt >= before + 2 * 60 * 1000 && open.data.expiresAt <= Date.now() + 2 * 60 * 1000)
    assert.equal(storage.calls.read.at(-1).validUntil, open.data.expiresAt)
    assert.ok(await get("SELECT 1 FROM audit_log WHERE model_id = $1 AND action = 'open_document' AND dept_key = 'production'", [modelA]))
  })

  await t.test('autres départements: ni téléversement ni suppression (403)', async () => {
    for (const token of [productionToken, qualityToken, coupeToken, logisticsToken]) {
      assert.equal((await call(`/models/${modelA}/documents/upload-request`, { method: 'POST', token, body: { filename: 'a.pdf', mimeType: 'application/pdf', sizeBytes: 10 } })).status, 403)
      assert.equal((await call(`/models/${modelA}/documents/presign`, { method: 'POST', token, body: {} })).status, 403)
      assert.equal((await call(`/models/${modelA}/documents`, { method: 'POST', token, body: {} })).status, 403)
      assert.equal((await call(`/models/${modelA}/documents/${docA.id}`, { method: 'DELETE', token })).status, 403)
    }
    assert.ok(await get('SELECT 1 FROM model_documents WHERE id = $1', [docA.id]))
  })

  await t.test('type MIME, extension et cohérence type/extension vérifiés côté serveur', async () => {
    const bad = (body) => call(`/models/${modelA}/documents/upload-request`, { method: 'POST', token: methodeToken, body: { sizeBytes: 1000, ...body } })
    assert.equal((await bad({ filename: 'x.exe', mimeType: 'application/x-msdownload' })).data.error, 'unsupported_type')
    assert.equal((await bad({ filename: 'x.docx', mimeType: 'application/pdf' })).data.error, 'unsupported_extension')
    assert.equal((await bad({ filename: 'noext', mimeType: 'application/pdf' })).data.error, 'unsupported_extension')
    assert.equal((await bad({ filename: 'x.png', mimeType: 'application/pdf' })).data.error, 'type_extension_mismatch')
    assert.equal((await bad({ filename: 'x.pdf', mimeType: 'image/jpeg' })).data.error, 'type_extension_mismatch')
    assert.equal((await bad({ filename: 'x.jpeg', mimeType: 'image/jpeg' })).status, 200)
  })

  await t.test('taille: 10 Mo exactement et juste en dessous acceptés, juste au-dessus refusé', async () => {
    assert.equal(DOCUMENT_MAX_BYTES, 10 * 1024 * 1024)
    const exact = await upload(modelB, methodeToken, { filename: 'exact.pdf', sizeBytes: DOCUMENT_MAX_BYTES })
    assert.equal(exact.status, 201)
    const below = await upload(modelB, methodeToken, { filename: 'below.pdf', sizeBytes: DOCUMENT_MAX_BYTES - 1 })
    assert.equal(below.status, 201)
    const above = await upload(modelB, methodeToken, { filename: 'above.pdf', sizeBytes: DOCUMENT_MAX_BYTES + 1 })
    assert.equal(above.step, 'request')
    assert.equal(above.status, 400)
    assert.equal(above.data.error, 'file_too_large')
    const way = await upload(modelB, methodeToken, { filename: 'big.pdf', sizeBytes: 50 * 1024 * 1024 })
    assert.equal(way.data.error, 'file_too_large')
  })

  await t.test('confirmation: fichier réellement stocké différent du ticket (taille/type) → refusé et supprimé du stockage', async () => {
    const bigger = await upload(modelB, methodeToken, { filename: 'lie.pdf', sizeBytes: 1000, stored: { size: 11 * 1024 * 1024, contentType: 'application/pdf' } })
    assert.equal(bigger.status, 400)
    assert.equal(bigger.data.error, 'upload_mismatch')
    assert.ok(!storage.objects.has(bigger.pathname))
    const html = await upload(modelB, methodeToken, { filename: 'lie2.pdf', sizeBytes: 1000, stored: { size: 1000, contentType: 'text/html' } })
    assert.equal(html.data.error, 'upload_mismatch')
    assert.equal(await get("SELECT 1 FROM model_documents WHERE filename IN ('lie.pdf', 'lie2.pdf')"), undefined)
    // Nothing uploaded at all → no row.
    const r = await call(`/models/${modelB}/documents/upload-request`, { method: 'POST', token: methodeToken, body: { filename: 'ghost.pdf', mimeType: 'application/pdf', sizeBytes: 10 } })
    const ghost = await call(`/models/${modelB}/documents`, { method: 'POST', token: methodeToken, body: { ticket: r.data.ticket } })
    assert.equal(ghost.data.error, 'upload_not_found')
  })

  await t.test('presign: seul le chemin choisi par le serveur est signable', async () => {
    const r = await call(`/models/${modelA}/documents/upload-request`, { method: 'POST', token: methodeToken, body: { filename: 'a.pdf', mimeType: 'application/pdf', sizeBytes: 10 } })
    const other = await call(`/models/${modelA}/documents/presign`, {
      method: 'POST',
      token: methodeToken,
      body: { type: 'blob.generate-presigned-url', payload: { pathname: `model-docs/${modelA}/chosen-by-client.pdf`, clientPayload: r.data.ticket } },
    })
    assert.equal(other.data.error, 'pathname_mismatch')
    const completed = await call(`/models/${modelA}/documents/presign`, { method: 'POST', token: methodeToken, body: { type: 'blob.upload-completed', payload: {} } })
    assert.equal(completed.data.error, 'invalid_event')
  })

  await t.test('ticket expiré, falsifié, ou réutilisé sur un autre modèle → refusé', async () => {
    const r = await call(`/models/${modelA}/documents/upload-request`, { method: 'POST', token: methodeToken, body: { filename: 'a.pdf', mimeType: 'application/pdf', sizeBytes: 10 } })
    const { ticket, pathname } = r.data
    storage.objects.set(pathname, { size: 10, contentType: 'application/pdf' })

    const onB = await call(`/models/${modelB}/documents`, { method: 'POST', token: methodeToken, body: { ticket } })
    assert.equal(onB.data.error, 'ticket_model_mismatch')
    const presignOnB = await call(`/models/${modelB}/documents/presign`, {
      method: 'POST',
      token: methodeToken,
      body: { type: 'blob.generate-presigned-url', payload: { pathname, clientPayload: ticket } },
    })
    assert.equal(presignOnB.data.error, 'ticket_model_mismatch')

    const [h, p, sig] = ticket.split('.')
    const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(p, 'base64url')), sz: 1 })).toString('base64url')
    assert.equal((await call(`/models/${modelA}/documents`, { method: 'POST', token: methodeToken, body: { ticket: `${h}.${forged}.${sig}` } })).data.error, 'invalid_ticket')
    assert.equal((await call(`/models/${modelA}/documents`, { method: 'POST', token: methodeToken, body: { ticket: ticket.slice(0, -2) + 'xx' } })).data.error, 'invalid_ticket')

    const expired = jwt.sign(
      { typ: 'fiche_doc_upload', mid: modelA, p: pathname, fn: 'a.pdf', ct: 'application/pdf', sz: 10, by: 'methode', exp: Math.floor(Date.now() / 1000) - 5 },
      process.env.JWT_SECRET
    )
    assert.equal((await call(`/models/${modelA}/documents`, { method: 'POST', token: methodeToken, body: { ticket: expired } })).data.error, 'ticket_expired')

    // A login token is not an upload ticket (and vice versa).
    assert.equal((await call(`/models/${modelA}/documents`, { method: 'POST', token: methodeToken, body: { ticket: methodeToken } })).data.error, 'invalid_ticket')
    assert.equal((await call(`/models/${modelA}/fiche`, { token: ticket })).status, 401)
  })

  await t.test('isolation: un document du modèle A est introuvable via le modèle B', async () => {
    assert.equal((await call(`/models/${modelB}/documents/${docA.id}/open`, { method: 'POST', token: productionToken })).status, 404)
    assert.equal((await call(`/models/${modelB}/documents/${docA.id}`, { method: 'DELETE', token: methodeToken })).status, 404)
    const ficheB = await call(`/models/${modelB}/fiche`, { token: productionToken })
    assert.ok(!ficheB.data.documents.some((d) => d.id === docA.id))
    assert.ok(await get('SELECT 1 FROM model_documents WHERE id = $1', [docA.id]))
  })

  await t.test('les URL de lecture signées expirent: le SDK refuse de signer une délégation expirée', async () => {
    const pathname = `model-docs/${modelA}/x.pdf`
    const delegation = (validUntil) =>
      `${Buffer.from(JSON.stringify({ storeId: 'store_testfiche', pathname, operations: ['get'], validUntil })).toString('base64url')}.sig`
    const ok = await presignUrl(
      { delegationToken: delegation(Date.now() + 120000), clientSigningToken: 'k' },
      { operation: 'get', pathname, access: 'private' }
    )
    assert.match(ok.presignedUrl, /private\.blob\.vercel-storage\.com\/model-docs\//)
    await assert.rejects(
      presignUrl({ delegationToken: delegation(Date.now() - 1000), clientSigningToken: 'k' }, { operation: 'get', pathname, access: 'private' }),
      /expired/
    )
  })

  await t.test('écrans publics: aucune donnée de document (métadonnées, chemins, URL)', async () => {
    const ficheA = await call(`/models/${modelA}/fiche`, { token: methodeToken })
    const secrets = ['model-docs/', 'fake-private-blob', 'tech-pack.pdf', docA.id]
    for (const p of [`/chains/${TEST_CHAIN}/dashboard`, `/models/${modelA}/dashboard`, `/models/${modelA}`, '/chains', '/models', `/chains/${TEST_CHAIN}/open-models`, '/chains/ranking', '/early-warnings', '/effectifs/overview']) {
      const res = await call(p)
      assert.equal(res.status, 200, p)
      const body = JSON.stringify(res.data)
      for (const s of secrets) assert.ok(!body.includes(s), `${p} leaks ${s}`)
    }
    assert.ok(ficheA.data.documents.length > 0)
  })

  await t.test('DOCS_BLOB_READ_WRITE_TOKEN absent: pas de plantage, 503 clair, le reste de la Fiche fonctionne', async () => {
    delete process.env.DOCS_BLOB_READ_WRITE_TOKEN
    try {
      const fiche = await call(`/models/${modelA}/fiche`, { token: productionToken })
      assert.equal(fiche.status, 200)
      assert.equal(fiche.data.documentsStorageConfigured, false)
      assert.ok(Array.isArray(fiche.data.timeline))
      const up = await call(`/models/${modelA}/documents/upload-request`, { method: 'POST', token: methodeToken, body: { filename: 'a.pdf', mimeType: 'application/pdf', sizeBytes: 10 } })
      assert.equal(up.status, 503)
      assert.equal(up.data.error, 'documents_storage_not_configured')
      assert.equal((await call(`/models/${modelA}/documents/${docA.id}/open`, { method: 'POST', token: productionToken })).status, 503)
    } finally {
      process.env.DOCS_BLOB_READ_WRITE_TOKEN = 'test-docs-token'
    }
  })

  // --- Composition ----------------------------------------------------------

  const putComposition = (modelId, rows, token = methodeToken) => call(`/models/${modelId}/composition`, { method: 'PUT', token, body: { rows } })

  await t.test('composition: total d’une partie < 100 ou > 100 refusé', async () => {
    const low = await putComposition(modelA, [{ part: 'Principal', fiber: 'Coton', percentage: 95 }, { part: 'Principal', fiber: 'Élasthanne', percentage: 2 }])
    assert.equal(low.status, 400)
    assert.equal(low.data.error, 'part_total_invalid')
    assert.deepEqual(low.data.totals, { Principal: 97 })
    const high = await putComposition(modelA, [{ part: 'Principal', fiber: 'Coton', percentage: 95 }, { part: 'Principal', fiber: 'Élasthanne', percentage: 5.01 }])
    assert.equal(high.data.error, 'part_total_invalid')
    assert.equal((await putComposition(modelA, [{ part: 'Principal', fiber: 'Coton', percentage: 100.001 }])).data.error, 'invalid_percentage')
    assert.equal((await putComposition(modelA, [{ part: 'Principal', fiber: 'Coton', percentage: 0 }])).data.error, 'invalid_percentage')
    assert.equal((await putComposition(modelA, [{ part: 'Principal', fiber: 'Coton', percentage: 33.333 }])).data.error, 'invalid_percentage')
  })

  await t.test('composition: 100% exact et plusieurs parties indépendantes acceptés (2 décimales)', async () => {
    const ok = await putComposition(modelA, [
      { part: 'Principal', fiber: 'Coton', percentage: 95 },
      { part: 'Principal', fiber: 'Élasthanne', percentage: 5 },
      { part: 'Doublure', fiber: 'Polyester', percentage: 100 },
      { part: 'Poches', fiber: 'Coton', percentage: 33.33 },
      { part: 'Poches', fiber: 'Polyester', percentage: 66.67 },
    ])
    assert.equal(ok.status, 200)
    assert.deepEqual(ok.data.composition.map((r) => [r.part, r.fiber, r.percentage]), [
      ['Principal', 'Coton', 95],
      ['Principal', 'Élasthanne', 5],
      ['Doublure', 'Polyester', 100],
      ['Poches', 'Coton', 33.33],
      ['Poches', 'Polyester', 66.67],
    ])
  })

  await t.test('composition: normalisation des parties/fibres (casse, espaces) + Autre personnalisé', async () => {
    const res = await putComposition(modelA, [
      { part: ' principal ', fiber: 'coton', percentage: 60 },
      { part: 'PRINCIPAL', fiber: 'POLYESTER', percentage: 40 },
      { part: 'Col  roulé', fiber: 'Fibre   de bambou', percentage: 50 },
      { part: 'col ROULÉ', fiber: 'fibre de BAMBOU ', percentage: 50 },
    ])
    // Same custom fiber twice in the same part → duplicate after normalization.
    assert.equal(res.data.error, 'duplicate_fiber')
    const ok = await putComposition(modelA, [
      { part: ' principal ', fiber: 'coton', percentage: 60 },
      { part: 'PRINCIPAL', fiber: 'POLYESTER', percentage: 40 },
      { part: 'Col  roulé', fiber: 'Fibre   de bambou', percentage: 50 },
      { part: 'col ROULÉ', fiber: 'élasthanne', percentage: 50 },
      { part: '', fiber: 'x', percentage: 1 },
    ])
    assert.equal(ok.data.error, 'part_total_invalid') // '' → Principal → 101%
    const good = await putComposition(modelA, [
      { part: ' principal ', fiber: 'coton', percentage: 60 },
      { part: 'PRINCIPAL', fiber: 'POLYESTER', percentage: 40 },
      { part: 'Col  roulé', fiber: 'Fibre   de bambou', percentage: 50 },
      { part: 'col ROULÉ', fiber: 'élasthanne', percentage: 50 },
    ])
    assert.equal(good.status, 200)
    assert.deepEqual(good.data.composition.map((r) => [r.part, r.fiber]), [
      ['Principal', 'Coton'],
      ['Principal', 'Polyester'],
      ['Col roulé', 'Fibre de bambou'],
      ['Col roulé', 'Élasthanne'],
    ])
    assert.equal((await putComposition(modelA, [{ part: 'Autre', fiber: 'Coton', percentage: 100 }])).data.error, 'part_custom_required')
    assert.equal((await putComposition(modelA, [{ part: 'Principal', fiber: 'autre', percentage: 100 }])).data.error, 'fiber_custom_required')
    assert.equal((await putComposition(modelA, [{ part: 'Principal', fiber: '', percentage: 100 }])).data.error, 'fiber_required')
  })

  await t.test('composition: Méthode et Patron modifient, les autres non; vider = retirer', async () => {
    assert.equal((await putComposition(modelA, [{ part: 'Principal', fiber: 'Lin', percentage: 100 }], productionToken)).status, 403)
    assert.equal((await putComposition(modelA, [{ part: 'Principal', fiber: 'Lin', percentage: 100 }])).status, 200)
    assert.equal((await call(`/models/${modelA}/composition`, { method: 'PUT', body: { rows: [] } })).status, 401)
    const patron = await putComposition(modelA, [{ part: 'Principal', fiber: 'Coton', percentage: 95 }, { part: 'Principal', fiber: 'Élasthanne', percentage: 5 }], patronToken)
    assert.equal(patron.status, 200)
    const fiche = await call(`/models/${modelA}/fiche`, { token: qualityToken })
    assert.equal(fiche.data.composition.length, 2)
    assert.equal(fiche.data.permissions.canEditComposition, false)
  })

  // --- Colour variants: shared Fiche, own timeline ---------------------------

  await t.test('couleur: documents et composition hérités du modèle principal', async () => {
    const fiche = await call(`/models/${variantA}/fiche`, { token: productionToken })
    assert.equal(fiche.status, 200)
    assert.equal(fiche.data.model.isVariant, true)
    assert.equal(fiche.data.model.owner.id, modelA)
    assert.ok(fiche.data.documents.some((d) => d.id === docA.id))
    assert.equal(fiche.data.composition.length, 2)
    const open = await call(`/models/${variantA}/documents/${docA.id}/open`, { method: 'POST', token: productionToken })
    assert.equal(open.status, 200)
    // An upload from a colour's Fiche lands on the main model.
    const up = await upload(variantA, methodeToken, { filename: 'colour-sheet.pdf', sizeBytes: 5000 })
    assert.equal(up.status, 201)
    assert.equal((await get('SELECT model_id FROM model_documents WHERE id = $1', [up.data.document.id])).model_id, modelA)
    assert.deepEqual(fiche.data.colours.map((c) => c.id), [modelA, variantA])
  })

  // --- Factory information --------------------------------------------------

  await t.test('usine: lecture par tout département connecté, modification Patron seulement, une seule valeur config', async () => {
    await run("DELETE FROM config WHERE key = 'factory_info'")
    const empty = await call('/factory-info', { token: productionToken })
    assert.equal(empty.status, 200)
    assert.equal(empty.data.factory, null)
    assert.equal(empty.data.canEdit, false)
    assert.equal((await call('/factory-info')).status, 401)

    const body = { legalName: 'Atlas Manufacturing SARL', ice: '001234567000089', address: '12 Zone Franche', city: 'Tanger', country: '' }
    assert.equal((await call('/factory-info', { method: 'PUT', token: methodeToken, body })).status, 403)
    assert.equal((await call('/factory-info', { method: 'PUT', token: productionToken, body })).status, 403)
    assert.equal((await call('/factory-info', { method: 'PUT', body })).status, 401)
    assert.equal((await call('/factory-info', { method: 'PUT', token: patronToken, body: { ...body, ice: '12AB' } })).data.error, 'invalid_ice')

    const saved = await call('/factory-info', { method: 'PUT', token: patronToken, body })
    assert.equal(saved.status, 200)
    assert.equal(saved.data.factory.country, 'Maroc') // default
    const rows = await all("SELECT value FROM config WHERE key = 'factory_info'")
    assert.equal(rows.length, 1)
    assert.deepEqual(JSON.parse(rows[0].value), { ...body, country: 'Maroc' })

    const read = await call('/factory-info', { token: methodeToken })
    assert.equal(read.data.factory.legalName, 'Atlas Manufacturing SARL')
    assert.equal(read.data.canEdit, false)
    assert.equal((await call('/factory-info', { token: patronToken })).data.canEdit, true)
    const fiche = await call(`/models/${modelB}/fiche`, { token: qualityToken })
    assert.equal(fiche.data.factory.city, 'Tanger')
  })

  // --- Timeline -------------------------------------------------------------

  const stage = async (modelId, key) => (await call(`/models/${modelId}/fiche`, { token: productionToken })).data.timeline.find((s) => s.key === key)

  await t.test('timeline: sans activité → Non commencée partout (Planning: Non planifié)', async () => {
    const timeline = (await call(`/models/${modelB}/fiche`, { token: productionToken })).data.timeline
    const byKey = Object.fromEntries(timeline.map((s) => [s.key, s.status]))
    assert.deepEqual(byKey, {
      lancement: 'non_commencee',
      planning: 'non_planifie',
      coupe: 'non_commencee',
      magasin: 'non_commencee',
      mecanicien: 'non_commencee',
      echantillon: 'non_commencee',
      production: 'non_commencee',
      qualite: 'non_commencee',
      finale: 'non_commencee', // pre-created zero row is NOT activity
      depot: 'non_commencee',
      export: 'non_commencee',
    })
    assert.ok(timeline.every((s) => s.start === null && s.end === null))
  })

  await t.test('timeline: Lancement terminé seulement quand le chronomètre est arrêté', async () => {
    await call(`/methode/models/${modelA}/launch-timer`, { method: 'PUT', token: methodeToken, body: { objectifHeures: 2 } })
    assert.equal((await stage(modelA, 'lancement')).status, 'non_commencee')
    await call(`/methode/models/${modelA}/launch-timer/start`, { method: 'POST', token: methodeToken })
    const running = await stage(modelA, 'lancement')
    assert.equal(running.status, 'en_cours')
    assert.equal(running.start, today)
    assert.equal(running.end, null)
    await call(`/methode/models/${modelA}/launch-timer/stop`, { method: 'POST', token: methodeToken, body: {} })
    const done = await stage(modelA, 'lancement')
    assert.equal(done.status, 'terminee')
    assert.equal(done.end, today)
  })

  await t.test('timeline: activité sans signal de fin → En cours (postes, finale, dépôt, export — jamais Terminée même à 100% exporté)', async () => {
    await call(`/poste/models/${modelA}`, { method: 'PUT', token: coupeToken, body: { percentage: 100, note: '' } })
    const coupe = await stage(modelA, 'coupe')
    assert.equal(coupe.status, 'en_cours')
    assert.equal(coupe.start, today)
    await call(`/logistics/models/${modelA}/exports`, { method: 'POST', token: logisticsToken, body: { description: 'Lot 1', quantite: 50, date: today } })
    const exp = await stage(modelA, 'export')
    assert.equal(exp.status, 'en_cours')
    assert.deepEqual(exp.detail, { exported: 50, target: 50 })
    await call(`/methode/models/${modelA}/planning/days`, { method: 'POST', token: methodeToken, body: { date: today } })
    const planning = await stage(modelA, 'planning')
    assert.equal(planning.status, 'planifie')
    assert.equal(planning.start, today)
  })

  await t.test('timeline: Production & Qualité par couleur (pas de mélange), Qualité jamais « Terminée » à la clôture', async () => {
    assert.equal((await call(`/production/models/${variantA}/hourly/0`, { method: 'PUT', token: productionToken, body: { qty: 7, date: today } })).status, 200)
    assert.equal((await call(`/quality/models/${variantA}/hourly/0`, { method: 'PUT', token: qualityToken, body: { pieceRetouche: 1, date: today } })).status, 200)

    const vProd = await stage(variantA, 'production')
    assert.equal(vProd.status, 'en_cours')
    assert.deepEqual(vProd.detail, { produced: 7, target: 20 })
    assert.equal((await stage(variantA, 'qualite')).status, 'en_cours')
    // The main model's own colour has no production yet: not mixed in.
    assert.equal((await stage(modelA, 'production')).status, 'non_commencee')
    assert.equal((await stage(modelA, 'qualite')).status, 'non_commencee')
    // Stages Atlas only records on the main model: said so on a colour.
    assert.equal((await stage(variantA, 'lancement')).status, 'suivi_modele_principal')
    assert.equal((await stage(variantA, 'export')).status, 'suivi_modele_principal')

    assert.equal((await call(`/production/models/${modelA}/hourly/1`, { method: 'PUT', token: productionToken, body: { qty: 3, date: today } })).status, 200)
    assert.deepEqual((await stage(modelA, 'production')).detail, { produced: 3, target: 50 })

    // Close the model (existing lifecycle route, unchanged).
    assert.equal((await call(`/models/${modelA}/close`, { method: 'POST', token: methodeToken })).status, 200)
    assert.equal((await stage(modelA, 'production')).status, 'terminee')
    assert.equal((await stage(variantA, 'production')).status, 'terminee')
    assert.equal((await stage(variantA, 'qualite')).status, 'en_cours') // closure is NOT a quality signal
    assert.equal((await stage(modelA, 'qualite')).status, 'non_commencee')
    assert.equal((await stage(modelA, 'coupe')).status, 'donnees_insuffisantes')
    assert.equal((await stage(modelA, 'export')).status, 'donnees_insuffisantes')
    assert.equal((await stage(modelA, 'finale')).status, 'non_commencee')
    assert.equal((await stage(modelA, 'lancement')).status, 'terminee')
  })

  // --- Compatibility --------------------------------------------------------

  await t.test('ancien modèle sans données Fiche: la Fiche et le tableau de bord public se chargent', async () => {
    const legacyId = 'mdl_test_fiche_legacy'
    const now = new Date().toISOString()
    await run(
      `INSERT INTO models (id, client, qte_totale, chain_number, active, status, created_at, updated_at)
       VALUES ($1, 'TEST_LEGACY', 10, 7, 0, 'active', $2, $2)`,
      [legacyId, now]
    )
    created.push(legacyId)
    const fiche = await call(`/models/${legacyId}/fiche`, { token: productionToken })
    assert.equal(fiche.status, 200)
    assert.deepEqual(fiche.data.documents, [])
    assert.deepEqual(fiche.data.composition, [])
    assert.ok(fiche.data.timeline.length > 0)
    assert.equal((await call(`/models/${legacyId}/dashboard`)).status, 200)
    assert.equal((await call('/models/does-not-exist/fiche', { token: productionToken })).status, 404)
  })
})

test('Ask Atlas: bouton « Connexion » vers /departements quand la connexion est requise', () => {
  const src = readFileSync(path.join(REPO_ROOT, 'client/src/pages/Ask.jsx'), 'utf8')
  assert.match(src, /to="\/departements"/)
  assert.match(src, />\s*Connexion\s*</)
})

test('Tables Predict supprimées, sans toucher aux tables Atlas', async () => {
  const atlasTablesBefore = (await all("SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename NOT LIKE 'predict%' ORDER BY tablename")).map((r) => r.tablename)
  // Simulate a database that still has them (as production did).
  await run('CREATE TABLE IF NOT EXISTS predict_analysis_usage (date TEXT PRIMARY KEY, count INTEGER NOT NULL DEFAULT 0)')
  await run('CREATE TABLE IF NOT EXISTS predict_football_cache (cache_key TEXT PRIMARY KEY, data JSONB NOT NULL, fetched_at TIMESTAMPTZ NOT NULL)')
  const modelsBefore = await get('SELECT COUNT(*) AS n FROM models')

  await dropRemovedPredictTables()
  await dropRemovedPredictTables() // idempotent

  const left = await get("SELECT to_regclass('predict_analysis_usage') AS a, to_regclass('predict_football_cache') AS b")
  assert.equal(left.a, null)
  assert.equal(left.b, null)
  const atlasTablesAfter = (await all("SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename")).map((r) => r.tablename)
  assert.deepEqual(atlasTablesAfter, atlasTablesBefore)
  assert.equal((await get('SELECT COUNT(*) AS n FROM models')).n, modelsBefore.n)
})

// ---------------------------------------------------------------------------
// Batch B — server-side validation (400 + bilingual message). Only new input
// is checked; nothing existing is modified.
// ---------------------------------------------------------------------------

test('Validation serveur: valeurs impossibles refusées avec un message AR/FR', async (t) => {
  const TEST_CHAIN = 8
  const today = todayInFactoryTZ()
  const methodeToken = await login('methode', '1111')
  const productionToken = await login('production', '2222')
  const qualityToken = await login('quality', '7777')
  const finaleToken = await login('finale', '1313')
  const depotToken = await login('depot', '1010')
  const logisticsToken = await login('logistics', '6666')
  const rhToken = await login('rh', '8888')
  const patronToken = await login('patron', '3333')
  assert.equal((await call(`/chains/${TEST_CHAIN}/open-models`)).data.models.length, 0)

  const created = []
  t.after(async () => {
    for (const id of created.reverse()) {
      await run('DELETE FROM audit_log WHERE model_id = $1', [id])
      await run('DELETE FROM models WHERE id = $1', [id])
    }
  })
  const expect400 = (res, code) => {
    assert.equal(res.status, 400, JSON.stringify(res.data))
    assert.equal(res.data.error, code)
    assert.ok(res.data.message?.ar && res.data.message?.fr, 'bilingual message')
  }

  await t.test('modèle: Qté totale / Commande négatives et Fin prévue avant Début refusées (création et modification)', async () => {
    const base = { client: 'TEST_VALID', chainNumber: TEST_CHAIN, debut: today }
    expect400(await call('/methode/models', { method: 'POST', token: methodeToken, body: { ...base, qteTotale: -50 } }), 'negative_value')
    expect400(await call('/methode/models', { method: 'POST', token: methodeToken, body: { ...base, commande: -1 } }), 'negative_value')
    expect400(await call('/methode/models', { method: 'POST', token: methodeToken, body: { ...base, debut: '2026-10-10', finPrevue: '2026-10-01' } }), 'fin_before_debut')
    const ok = await call('/methode/models', { method: 'POST', token: methodeToken, body: { ...base, qteTotale: 100, finPrevue: today } })
    assert.equal(ok.status, 201) // same day is fine
    created.push(ok.data.id)
    const put = (body) => call(`/methode/models/${ok.data.id}`, { method: 'PUT', token: methodeToken, body: { client: 'TEST_VALID', qteTotale: 100, debut: today, ...body } })
    expect400(await put({ qteTotale: -5 }), 'negative_value')
    expect400(await put({ finPrevue: '2000-01-01' }), 'fin_before_debut')
    expect400(await put({ client: '  ' }), 'client_required')
    assert.equal((await put({ qteTotale: 150 })).status, 200)
    expect400(await call(`/methode/models/${ok.data.id}/variants`, { method: 'POST', token: methodeToken, body: { label: 'Rouge', qteTotale: -3 } }), 'negative_value')
  })

  await t.test('gamme: temps ≤ 0 refusé avec le numéro de ligne; temps valides acceptés', async () => {
    const id = created[0]
    const bad = await call(`/methode/models/${id}/gamme`, { method: 'PUT', token: methodeToken, body: { lines: [{ operation: 'A', tps: 30 }, { operation: 'B', tps: 0 }] } })
    expect400(bad, 'invalid_operation_time')
    assert.equal(bad.data.line, 2)
    expect400(await call(`/methode/models/${id}/gamme`, { method: 'PUT', token: methodeToken, body: { lines: [{ operation: 'A', tps: -30 }] } }), 'invalid_operation_time')
    assert.equal((await call(`/methode/models/${id}/gamme`, { method: 'PUT', token: methodeToken, body: { lines: [{ operation: 'A', tps: 30 }] } })).status, 200)
  })

  await t.test('quantités négatives refusées partout (production, qualité, finale, dépôt, logistique, effectif, présence, planning, personnel)', async () => {
    const id = created[0]
    const cases = [
      [`/production/models/${id}/hourly/0`, productionToken, { qty: -5, date: today }],
      [`/production/models/${id}/totals`, productionToken, { totalEntree: -1 }],
      [`/quality/models/${id}/hourly/0`, qualityToken, { pieceRetouche: -2, date: today }],
      [`/quality/models/${id}`, qualityToken, { reprises: -1 }],
      [`/finale/models/${id}`, finaleToken, { enCours: 10, pieceTerminee: -4 }],
      [`/finale/models/${id}/effectif`, finaleToken, { effectif: { Machiniste: -1 } }],
      [`/depot/models/${id}`, depotToken, { totalPieces: -8, effectifTotal: 2 }],
      [`/methode/models/${id}/effectif`, methodeToken, { effectif: { Machinistes: -3 } }],
      [`/methode/models/${id}/attendance`, methodeToken, { attendance: { Machinistes: -1 }, date: today }],
      [`/rh/models/${id}/attendance`, rhToken, { attendance: { Machinistes: -1 }, date: today }],
      [`/methode/models/${id}/planning/${today}`, methodeToken, { hourly: [{ index: 0, qty: -10 }] }],
      ['/rh/personnel-admin', rhToken, { date: today, total: -1 }],
      ['/patron/personnel-admin', patronToken, { date: today, total: -1 }],
    ]
    for (const [path, token, body] of cases) expect400(await call(path, { method: 'PUT', token, body }), 'negative_value')
    const logi = await call(`/logistics/models/${id}/exports`, { method: 'POST', token: logisticsToken, body: { description: 'x', quantite: -10, date: today } })
    expect400(logi, 'negative_value')
    // Nothing was written by the refused calls.
    assert.equal(await get('SELECT 1 FROM production_history WHERE model_id = $1', [id]), undefined)
    assert.equal(await get('SELECT 1 FROM logistics_exports WHERE model_id = $1', [id]), undefined)
  })

  await t.test('avertissement seulement (pas de blocage): retouches > production, grandes valeurs, zéro', async () => {
    const id = created[0]
    assert.equal((await call(`/quality/models/${id}/hourly/0`, { method: 'PUT', token: qualityToken, body: { pieceRetouche: 500, date: today } })).status, 200)
    assert.equal((await call(`/finale/models/${id}`, { method: 'PUT', token: finaleToken, body: { enCours: 250000 } })).status, 200)
    assert.equal((await call(`/production/models/${id}/totals`, { method: 'PUT', token: productionToken, body: { totalEntree: 0 } })).status, 200)
  })
})

test('Validation serveur: heures de travail (fin ≤ début, chevauchement) et spécialités quasi identiques', async (t) => {
  const methodeToken = await login('methode', '1111')
  const before = (await call('/settings/work-hours', { token: methodeToken })).data.workHours
  const last = before[before.length - 1]
  const specialtiesBefore = (await call('/settings/specialties/chain', { token: methodeToken })).data.specialties
  t.after(async () => {
    // Restore: drop any slot this test appended, and any test specialty.
    let wh = (await call('/settings/work-hours', { token: methodeToken })).data.workHours
    while (wh.length > before.length) {
      await call(`/settings/work-hours/${wh[wh.length - 1].id}`, { method: 'DELETE', token: methodeToken })
      wh = (await call('/settings/work-hours', { token: methodeToken })).data.workHours
    }
    await run("DELETE FROM specialty_defs WHERE name ILIKE 'qa brod%'")
  })
  const add = (start, end) => call('/settings/work-hours', { method: 'POST', token: methodeToken, body: { start, end } })

  await t.test('fin ≤ début refusée; chevauchement refusé (création et modification); bout-à-bout accepté', async () => {
    let r = await add('18:00', '17:00')
    assert.equal(r.status, 400)
    assert.equal(r.data.error, 'end_before_start')
    assert.ok(r.data.message.ar && r.data.message.fr)
    assert.equal((await add('17:00', '17:00')).data.error, 'end_before_start')
    const [h, m] = before[0].start.split(':').map(Number)
    const inside = `${String(h).padStart(2, '0')}:${String(m + 10).padStart(2, '0')}`
    r = await add(inside, before[0].end)
    assert.equal(r.data.error, 'overlapping_slot')
    assert.equal(r.data.clash, `${before[0].start}-${before[0].end}`)
    // Touching the last slot's end is fine.
    const [eh, em] = last.end.split(':').map(Number)
    const next = `${String(eh + 1).padStart(2, '0')}:${String(em).padStart(2, '0')}`
    r = await add(last.end, next)
    assert.equal(r.status, 201)
    const appended = r.data.workHours[r.data.workHours.length - 1]
    // Moving it onto an existing slot is refused; changing it to itself is fine.
    assert.equal((await call(`/settings/work-hours/${appended.id}`, { method: 'PUT', token: methodeToken, body: { start: last.start, end: next } })).data.error, 'overlapping_slot')
    assert.equal((await call(`/settings/work-hours/${appended.id}`, { method: 'PUT', token: methodeToken, body: { start: last.end, end: next } })).status, 200)
    // Existing order and slots untouched.
    const after = (await call('/settings/work-hours', { token: methodeToken })).data.workHours
    assert.deepEqual(after.slice(0, before.length), before)
  })

  await t.test('spécialité: même nom à la casse / aux espaces / aux accents près refusée; nom nouveau accepté', async () => {
    const existing = specialtiesBefore[0] // e.g. "Machinistes"
    for (const variant of [existing.toLowerCase(), `  ${existing.toUpperCase()}  `, existing.replace(/e/, 'é')]) {
      const r = await call('/settings/specialties/chain', { method: 'POST', token: methodeToken, body: { name: variant } })
      assert.equal(r.status, 400, variant)
      assert.equal(r.data.error, 'similar_specialty_exists')
      assert.equal(r.data.existing, existing)
    }
    const r = await call('/settings/specialties/chain', { method: 'POST', token: methodeToken, body: { name: 'QA Brodeuse' } })
    assert.equal(r.status, 201)
    // Renaming onto a near-duplicate of ANOTHER specialty is refused…
    const ren = await call('/settings/specialties/chain/QA%20Brodeuse', { method: 'PUT', token: methodeToken, body: { name: existing.toLowerCase() } })
    assert.equal(ren.data.error, 'similar_specialty_exists')
    // …fixing its own capitals is fine.
    assert.equal((await call('/settings/specialties/chain/QA%20Brodeuse', { method: 'PUT', token: methodeToken, body: { name: 'QA BRODEUSE' } })).status, 200)
    const now = (await call('/settings/specialties/chain', { token: methodeToken })).data.specialties
    assert.deepEqual(now.filter((n) => !/^qa brod/i.test(n)), specialtiesBefore) // nothing existing changed
  })
})

// ---------------------------------------------------------------------------
// Batch E — /api/models/:id: public = identity only; logged in = full detail.
// ---------------------------------------------------------------------------

test('/api/models/:id: sans connexion, seulement l’identité; connecté, le détail complet', async (t) => {
  const methodeToken = await login('methode', '1111')
  const productionToken = await login('production', '2222')
  const today = todayInFactoryTZ()
  assert.equal((await call('/chains/8/open-models')).data.models.length, 0)
  const res = await call('/methode/models', { method: 'POST', token: methodeToken, body: { client: 'TEST_PUBLIC_MODEL', dessin: 'PUB-1', chainNumber: 8, qteTotale: 300, commande: 4521, debut: today } })
  const id = res.data.id
  t.after(async () => {
    await run('DELETE FROM audit_log WHERE model_id = $1', [id])
    await run('DELETE FROM models WHERE id = $1', [id])
  })
  await call(`/methode/models/${id}/gamme`, { method: 'PUT', token: methodeToken, body: { lines: [{ operation: 'Montage col secret', machine: '301', tps: 45 }] } })
  await call(`/methode/models/${id}/launch-timer`, { method: 'PUT', token: methodeToken, body: { objectifHeures: 2, agentMethode: 'Ali', chefChaine: 'Samira' } })

  await t.test('public: pas de gamme, opérations, machines, commande, équipe de lancement ni effectif requis', async () => {
    const pub = await call(`/models/${id}`)
    assert.equal(pub.status, 200)
    for (const k of ['gamme', 'commande', 'launchTimer', 'effectif', 'close_prompt_dismissed_on']) assert.equal(k in pub.data, false, k)
    const body = JSON.stringify(pub.data)
    for (const secret of ['Montage col secret', '301', '4521', 'Ali', 'Samira']) assert.ok(!body.includes(secret), secret)
    assert.equal(pub.data.client, 'TEST_PUBLIC_MODEL')
    assert.equal(pub.data.dessin, 'PUB-1')
    assert.equal(pub.data.chain_number, 8)
    assert.equal(pub.data.qte_totale, 300)
    assert.equal(pub.data.status, 'active')
    assert.equal(pub.data.vt, 0.75)
  })

  await t.test('connecté (n’importe quel département): détail complet comme avant', async () => {
    for (const token of [methodeToken, productionToken]) {
      const full = await call(`/models/${id}`, { token })
      assert.equal(full.status, 200)
      assert.equal(full.data.gamme[0].operation, 'Montage col secret')
      assert.equal(full.data.commande, 4521)
      assert.equal(full.data.launchTimer.agentMethode, 'Ali')
      assert.ok('effectif' in full.data)
    }
  })

  await t.test('jeton envoyé mais invalide/expiré → 401 (jamais une vue réduite silencieuse)', async () => {
    assert.equal((await call(`/models/${id}`, { token: 'expired.invalid.token' })).status, 401)
    assert.equal((await call('/models/does-not-exist')).status, 404)
  })

  await t.test('écrans publics inchangés sans connexion', async () => {
    for (const p of ['/chains', `/chains/8/dashboard`, `/models/${id}/dashboard`, '/chains/ranking', '/early-warnings', '/effectifs/overview', '/models']) {
      assert.equal((await call(p)).status, 200, p)
    }
    const dash = await call('/chains/8/dashboard')
    assert.equal(dash.data.identity.client, 'TEST_PUBLIC_MODEL')
  })
})

// ---------------------------------------------------------------------------
// Session policy (trial bug A): a cold start must never log anyone out;
// sessions renew while used; only inactivity, the 7-day cap or a changed PIN
// end them.
// ---------------------------------------------------------------------------

test('Session: survit aux démarrages à froid, renouvellement glissant, expiration', async (t) => {
  const savedPin = process.env.PIN_METHODE
  t.after(async () => {
    if (savedPin === undefined) delete process.env.PIN_METHODE
    else process.env.PIN_METHODE = savedPin
    await runSeed() // back to the default PIN
  })
  const token = await login('methode', '1111')
  const authed = (tk) => fetch(`${base}/settings/feedback`, { headers: { Authorization: `Bearer ${tk}` } })

  await t.test('un nouveau démarrage (autre instance Vercel) ne change pas le hash du PIN et ne coupe pas la session', async () => {
    const before = (await get("SELECT pin_hash FROM departments WHERE key = 'methode'")).pin_hash
    await runSeed()
    await runSeed()
    assert.equal((await get("SELECT pin_hash FROM departments WHERE key = 'methode'")).pin_hash, before)
    assert.equal((await authed(token)).status, 200)
  })

  await t.test('PIN changé dans Vercel → toutes les sessions de ce département se ferment (401 pin_rotated), le nouveau PIN marche', async () => {
    process.env.PIN_METHODE = '4321'
    await runSeed()
    const r = await authed(token)
    assert.equal(r.status, 401)
    assert.equal((await r.json()).error, 'pin_rotated')
    assert.equal((await call('/auth/methode/login', { method: 'POST', body: { pin: '4321' } })).status, 200)
    process.env.PIN_METHODE = '1111'
    await runSeed()
  })

  const pinHash = async () => (await get("SELECT pin_hash FROM departments WHERE key = 'methode'")).pin_hash
  const now = () => Math.floor(Date.now() / 1000)
  const sign = async (claims, opts = {}) => jwt.sign({ dept: 'methode', pv: crypto.createHash('sha256').update(await pinHash()).digest('hex').slice(0, 16), ...claims }, process.env.JWT_SECRET, { algorithm: 'HS256', ...opts })

  await t.test('jeton récent (< 10 min) : pas de renouvellement', async () => {
    const fresh = await login('methode', '1111')
    const r = await authed(fresh)
    assert.equal(r.status, 200)
    assert.equal(r.headers.get('x-atlas-token'), null)
  })

  await t.test('jeton utilisé après 10 min : un nouveau jeton est renvoyé (X-Atlas-Token), valable, même début de session', async () => {
    const start = now() - 3 * 3600
    const old = await sign({ s: start, iat: now() - 20 * 60 }, { expiresIn: '24h' })
    const r = await authed(old)
    assert.equal(r.status, 200)
    const renewed = r.headers.get('x-atlas-token')
    assert.ok(renewed)
    const payload = jwt.decode(renewed)
    assert.equal(payload.s, start)
    assert.equal(payload.dept, 'methode')
    assert.ok(payload.exp - now() > 23 * 3600) // a full new 24 h window
    assert.equal((await authed(renewed)).status, 200)
  })

  await t.test('24 h sans activité → 401 session_expired; plus de 7 jours au total → 401 même si utilisé', async () => {
    const idle = await sign({ s: now() - 30 * 3600, iat: now() - 25 * 3600, exp: now() - 3600 })
    let r = await authed(idle)
    assert.equal(r.status, 401)
    assert.equal((await r.json()).error, 'session_expired')
    const tooLong = await sign({ s: now() - 8 * 24 * 3600 }, { expiresIn: '24h' })
    r = await authed(tooLong)
    assert.equal(r.status, 401)
    assert.equal((await r.json()).error, 'session_expired')
  })

  await t.test('mauvais département → 403 (pas une session expirée)', async () => {
    const r = await call('/patron/cpm', { token: await login('methode', '1111') })
    assert.equal(r.status, 403)
    assert.equal(r.data.error, 'wrong_department')
  })
})
