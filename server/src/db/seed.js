import bcrypt from 'bcryptjs'
import { get, run, ensureSchema, logAudit } from './index.js'
import { DEPARTMENTS, SPECIALTIES, FINALE_SPECIALTIES } from '../constants.js'
import { computeVTMinutes, computeDT, todayInFactoryTZ } from '../calc.js'

// Default 4-digit PINs, one per department. Override per-deployment via env
// vars (PIN_METHODE, PIN_PRODUCTION, ...). Unlike the rest of the seed data,
// these are re-synced on every boot (see seedDepartments below) rather than
// only set once, so changing a value here and redeploying is enough to
// rotate a department's PIN on an already-seeded database.
const DEFAULT_PINS = {
  methode: '1111',
  production: '2222',
  patron: '3333',
  mecanicien: '4444',
  magasin: '5555',
  logistics: '6666',
  quality: '7777',
  rh: '8888',
  coupe: '9999',
  depot: '1010',
  finale: '1313',
  echantillon: '1212',
}

async function seedDepartments() {
  for (const dept of DEPARTMENTS) {
    const pin = process.env[`PIN_${dept.key.toUpperCase()}`] || DEFAULT_PINS[dept.key]
    const pinHash = bcrypt.hashSync(pin, 10)
    await run(
      `INSERT INTO departments (key, label, icon, pin_hash) VALUES ($1, $2, $3, $4)
       ON CONFLICT (key) DO UPDATE SET label = excluded.label, icon = excluded.icon, pin_hash = excluded.pin_hash`,
      [dept.key, dept.label, dept.icon, pinHash]
    )
  }
}

async function seedConfig() {
  // Re-synced on every boot, like department PINs — so changing COMPANY_NAME
  // (or the default below) and redeploying takes effect on an already-seeded
  // database too, not just a fresh one.
  await run(
    `INSERT INTO config (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = excluded.value`,
    ['company_name', process.env.COMPANY_NAME || 'Casual']
  )
}

async function seedDemoModel() {
  const already = await get('SELECT COUNT(*) c FROM models')
  if (Number(already.c) > 0) return

  const now = new Date().toISOString()
  const modelId = 'mdl_demo_1'

  await run(
    `INSERT INTO models (id, client, qte_totale, debut, fin_prevue, dessin, commande, chain_number, active, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 1, $9, $9)`,
    [modelId, 'Zara Home', 10000, '2026-08-01', '2026-08-30', 'DSN-2451', 10000, 1, now]
  )

  const gamme = [
    { op: 'Coulisser col', machine: '301', tps: 18 },
    { op: 'Rep col', machine: '502', tps: 22 },
    { op: 'Surp col', machine: '504', tps: 15 },
    { op: 'Montage manche', machine: '516', tps: 30 },
    { op: 'Assemblage côtés', machine: 'main', tps: 25 },
    { op: 'Ourlet bas', machine: 'sp', tps: 20 },
    { op: 'Repassage', machine: 'fer', tps: 35 },
    { op: 'Contrôle final', machine: 'rz/stg', tps: 12 },
  ]
  for (let i = 0; i < gamme.length; i++) {
    const g = gamme[i]
    await run(
      `INSERT INTO gamme_lines (id, model_id, seq_no, operation, machine, tps) VALUES ($1, $2, $3, $4, $5, $6)`,
      [`gml_demo_${i}`, modelId, i + 1, g.op, g.machine, g.tps]
    )
  }

  const effectifs = {
    Machinistes: 7, 'Machiniste stagiaire': 1, 'Stagiaire fer': 0, 'Repassage préparation': 2, Traçage: 4,
    Transport: 1, Chef: 1, Robot: 1, 'Machine spéciale': 2, 'Manuel spécial / Traçage spécial': 1,
    'Contrôle chaîne': 1, Retouche: 1, Finition: 2,
  }
  let nd = 0
  for (const spec of SPECIALTIES) {
    const req = effectifs[spec] || 0
    nd += req
    await run('INSERT INTO effectif_requis (model_id, specialty, required) VALUES ($1, $2, $3)', [modelId, spec, req])
  }

  const totalTps = gamme.reduce((s, g) => s + g.tps, 0)
  const vt = computeVTMinutes(gamme.map((g) => ({ tps: g.tps })))
  const dt = computeDT(nd, totalTps)
  await run('UPDATE models SET nd = $1, vt = $2, dt = $3, updated_at = $4 WHERE id = $5', [nd, vt, dt, now, modelId])

  const demoQty = [385, 402, 390, 360, 410, 520, 395, 388, 0]
  const today = todayInFactoryTZ()
  for (let idx = 0; idx < demoQty.length; idx++) {
    await run(
      `INSERT INTO production_history (id, model_id, chain_number, date, slot_index, qty, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $7)`,
      [`ph_demo_${idx}`, modelId, 1, today, idx, demoQty[idx], now]
    )
  }

  await run(
    `INSERT INTO production_totals (model_id, total_entree, total_sortie, updated_at) VALUES ($1, $2, $3, $4)`,
    [modelId, 3420, 2980, now]
  )

  const presentDemo = {
    Machinistes: 6, 'Machiniste stagiaire': 1, 'Stagiaire fer': 0, 'Repassage préparation': 1, Traçage: 3,
    Transport: 0, Chef: 1, Robot: 1, 'Machine spéciale': 2, 'Manuel spécial / Traçage spécial': 1,
    'Contrôle chaîne': 1, Retouche: 1, Finition: 2,
  }
  for (const spec of SPECIALTIES) {
    await run('INSERT INTO rh_attendance (model_id, specialty, present, updated_at) VALUES ($1, $2, $3, $4)', [
      modelId,
      spec,
      presentDemo[spec] || 0,
      now,
    ])
  }

  await run(`INSERT INTO quality (model_id, reprises, updated_at) VALUES ($1, $2, $3)`, [modelId, 14, now])
  // Demo "Pièces retouche" per hour — Qualité% for the demo model is
  // computed live from these against demoQty above, never stored itself.
  const demoRetouche = [12, 15, 10, 8, 14, 20, 11, 9, 0]
  for (let idx = 0; idx < demoRetouche.length; idx++) {
    await run(
      `INSERT INTO quality_history (id, model_id, chain_number, date, slot_index, piece_retouche, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $7)`,
      [`qh_demo_${idx}`, modelId, 1, today, idx, demoRetouche[idx], now]
    )
  }
  await run(
    `INSERT INTO finale (
       model_id, en_cours, piece_retouche, piece_terminee, piece_2eme,
       encours_special, encours_repassage, encours_controle,
       moyenne_prod_special, moyenne_prod_repassage_final, moyenne_prod_controle_final,
       updated_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
    [modelId, 96, 8, 210, 3, 22, 15, 12, 45, 38, 40, now]
  )
  await run(
    `INSERT INTO depot (model_id, total_pieces, effectif_total, updated_at) VALUES ($1, $2, $3, $4)`,
    [modelId, 780, 3, now]
  )

  const finaleEffectifDemo = {
    'Repassage Finale': 2, 'Contrôle Finale': 2, Stagiaire: 1, Main: 1, Transport: 1, Nettoyage: 1, Mesure: 1, Machiniste: 3,
  }
  for (const spec of FINALE_SPECIALTIES) {
    await run('INSERT INTO finale_attendance (model_id, specialty, present, updated_at) VALUES ($1, $2, $3, $4)', [
      modelId,
      spec,
      finaleEffectifDemo[spec] || 0,
      now,
    ])
  }

  // Personnel administratif — company-wide, not tied to any model. Today's
  // row (used live everywhere) plus one from a few days back, so the
  // "cumulative" figure has more than a single day to actually sum.
  await run(
    `INSERT INTO personnel_admin_history (id, date, total, created_at, updated_at) VALUES ($1, $2, $3, $4, $4)
     ON CONFLICT (date) DO UPDATE SET total = excluded.total, updated_at = excluded.updated_at`,
    ['pah_demo_today', today, 18, now]
  )

  await run(
    `INSERT INTO logistics_exports (id, model_id, description, quantite, date, created_at) VALUES ($1, $2, $3, $4, $5, $6)`,
    ['exp_demo_1', modelId, 'Chemises homme manches longues', 3000, '2026-08-20', now]
  )
  await run(
    `INSERT INTO logistics_exports (id, model_id, description, quantite, date, created_at) VALUES ($1, $2, $3, $4, $5, $6)`,
    ['exp_demo_2', modelId, 'Chemises homme manches longues', 4000, '2026-08-25', now]
  )

  const postes = [
    ['coupe', 92, ''],
    ['magasin', 88, ''],
    ['mecanicien', 65, 'Panne machine 504'],
    ['echantillon', 100, ''],
  ]
  for (const [deptKey, pct, note] of postes) {
    await run(
      `INSERT INTO poste_status (model_id, dept_key, percentage, note, updated_at) VALUES ($1, $2, $3, $4, $5)`,
      [modelId, deptKey, pct, note, now]
    )
  }

  await logAudit({ deptKey: 'system', modelId, action: 'seed_demo_model', details: { client: 'Zara Home' } })
}

// Idempotent — safe to call on every cold start (departments/config are only
// inserted if missing, the demo model only if the table is empty). This is
// what makes the app self-initializing against a fresh Postgres database
// with no manual migration step.
export async function runSeed({ log = false } = {}) {
  await ensureSchema()
  await seedDepartments()
  await seedConfig()
  await seedDemoModel()

  if (log) {
    console.log('Seed complete.')
    console.log('Default department PINs (change via PIN_<DEPT> env vars before seeding a fresh database):')
    for (const [key, pin] of Object.entries(DEFAULT_PINS)) {
      console.log(`  ${key.padEnd(12)} ${pin}`)
    }
  }
}

const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`
if (isMain) {
  runSeed({ log: true })
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err)
      process.exit(1)
    })
}
