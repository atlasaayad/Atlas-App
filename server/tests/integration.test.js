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
import { get, run, all, pool } from '../src/db/index.js'
import { incrementDailyUsage, DAILY_LIMIT } from '../src/routes/ask.js'
import { todayInFactoryTZ, prodAMaintenant, computeQualityPct, computeRendementProduction, computeScoreRendement } from '../src/calc.js'
import { SPECIALTIES } from '../src/constants.js'

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
    assert.equal(dashboard.data.produit, prodAMaintenant({ 2: 250 }))
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
    assert.equal(dashboard.data.produit, prodAMaintenant({ 2: 250, 3: 75 }))
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
    const expectedDailyPct = computeQualityPct(prodAMaintenant({ 0: 100 }), 10)
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
    assert.equal(dashboard.data.quality.dailyPercentage, computeQualityPct(prodAMaintenant({ 0: 100 }), 10))
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
    const expectedProduit = prodAMaintenant({ 0: 100 })
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
    const model = await call(`/models/${modelId}`)
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

    const model = await call(`/models/${modelId}`)
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

    const model = await call(`/models/${modelId2}`)
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

    const dashboard = await call(`/chains/${TEST_CHAIN}/dashboard`)
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
    const read = await call(`/personnel-admin?date=${today}`)
    assert.equal(read.data.total, 20)
  })

  await t.test("Patron écrase avec 25 — dernier enregistrement (peu importe le département) qui compte", async () => {
    const put = await call('/patron/personnel-admin', { method: 'PUT', token: patronToken, body: { date: today, total: 25 } })
    assert.equal(put.status, 200)
    const read = await call(`/personnel-admin?date=${today}`)
    assert.equal(read.data.total, 25)
  })

  await t.test('correction rétroactive sur une date passée + total cumulé = somme exacte des deux jours', async () => {
    const put = await call('/rh/personnel-admin', { method: 'PUT', token: rhToken, body: { date: pastDate, total: 7 } })
    assert.equal(put.status, 200)

    const readPast = await call(`/personnel-admin?date=${pastDate}`)
    assert.equal(readPast.data.total, 7)
    // cumulativeTotal = somme de TOUS les jours enregistrés, pas seulement
    // celui demandé — donc identique quelle que soit la date interrogée.
    assert.equal(readPast.data.cumulativeTotal, 25 + 7)

    const readToday = await call(`/personnel-admin?date=${today}`)
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
