import bcrypt from 'bcryptjs'
import { db, logAudit } from './index.js'
import { DEPARTMENTS, SPECIALTIES } from '../constants.js'
import { computeVTMinutes, computeDT } from '../calc.js'

// Default 4-digit PINs, one per department. Override per-deployment via env
// vars (PIN_METHODE, PIN_PRODUCTION, ...) before running `npm run seed`.
const DEFAULT_PINS = {
  methode: '1001',
  production: '1002',
  patron: '1003',
  mecanicien: '1004',
  magasin: '1005',
  logistics: '1006',
  quality: '1007',
  rh: '1008',
  coupe: '1009',
  depot: '1010',
  finale: '1011',
  echantillon: '1012',
}

function seedDepartments() {
  const insert = db.prepare(
    `INSERT INTO departments (key, label, icon, pin_hash) VALUES (@key, @label, @icon, @pin_hash)
     ON CONFLICT(key) DO UPDATE SET label = excluded.label, icon = excluded.icon`
  )
  const existing = db.prepare('SELECT key FROM departments').all().map((r) => r.key)
  const tx = db.transaction(() => {
    for (const dept of DEPARTMENTS) {
      if (existing.includes(dept.key)) continue
      const pin = process.env[`PIN_${dept.key.toUpperCase()}`] || DEFAULT_PINS[dept.key]
      insert.run({ ...dept, pin_hash: bcrypt.hashSync(pin, 10) })
    }
  })
  tx()
}

function seedConfig() {
  const insert = db.prepare(
    `INSERT INTO config (key, value) VALUES (?, ?) ON CONFLICT(key) DO NOTHING`
  )
  insert.run('company_name', process.env.COMPANY_NAME || 'ATLAS')
}

function seedDemoModel() {
  const already = db.prepare('SELECT COUNT(*) c FROM models').get()
  if (already.c > 0) return

  const now = new Date().toISOString()
  const modelId = 'mdl_demo_1'

  db.prepare(
    `INSERT INTO models (id, client, qte_totale, debut, fin_prevue, dessin, commande, chain_number, active, created_at, updated_at)
     VALUES (@id, @client, @qte_totale, @debut, @fin_prevue, @dessin, @commande, @chain_number, 1, @now, @now)`
  ).run({
    id: modelId,
    client: 'Zara Home',
    qte_totale: 10000,
    debut: '2026-08-01',
    fin_prevue: '2026-08-30',
    dessin: 'DSN-2451',
    commande: 10000,
    chain_number: 1,
    now,
  })

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
  const insertGamme = db.prepare(
    `INSERT INTO gamme_lines (id, model_id, seq_no, operation, machine, tps) VALUES (?, ?, ?, ?, ?, ?)`
  )
  gamme.forEach((g, i) => {
    insertGamme.run(`gml_demo_${i}`, modelId, i + 1, g.op, g.machine, g.tps)
  })

  const effectifs = { '301': 2, '502': 2, '504': 1, '516': 2, Main: 4, Sp: 2, 'M/sp': 1, Finition: 2, Control: 1, Stg: 1, Fer: 2 }
  const insertEff = db.prepare(
    `INSERT INTO effectif_requis (model_id, specialty, required) VALUES (?, ?, ?)`
  )
  let nd = 0
  for (const spec of SPECIALTIES) {
    const req = effectifs[spec] || 0
    nd += req
    insertEff.run(modelId, spec, req)
  }

  const totalTps = gamme.reduce((s, g) => s + g.tps, 0)
  const vt = computeVTMinutes(gamme.map((g) => ({ tps: g.tps })))
  const dt = computeDT(nd, totalTps)
  db.prepare('UPDATE models SET nd = ?, vt = ?, dt = ?, updated_at = ? WHERE id = ?').run(nd, vt, dt, now, modelId)

  const insertHourly = db.prepare(
    `INSERT INTO hourly_production (model_id, slot_index, qty, updated_at) VALUES (?, ?, ?, ?)`
  )
  const demoQty = [385, 402, 390, 360, 410, 520, 395, 388, 0]
  demoQty.forEach((qty, idx) => insertHourly.run(modelId, idx, qty, now))

  db.prepare(
    `INSERT INTO production_totals (model_id, total_entree, total_sortie, updated_at) VALUES (?, ?, ?, ?)`
  ).run(modelId, 3420, 2980, now)

  const insertRh = db.prepare(
    `INSERT INTO rh_attendance (model_id, specialty, present, updated_at) VALUES (?, ?, ?, ?)`
  )
  const presentDemo = { '301': 2, '502': 1, '504': 1, '516': 2, Main: 3, Sp: 2, 'M/sp': 1, Finition: 2, Control: 1, Stg: 1, Fer: 1 }
  for (const spec of SPECIALTIES) insertRh.run(modelId, spec, presentDemo[spec] || 0, now)

  db.prepare(`INSERT INTO quality (model_id, percentage, reprises, updated_at) VALUES (?, ?, ?, ?)`).run(modelId, 96.5, 14, now)
  db.prepare(`INSERT INTO finale (model_id, en_cours, updated_at) VALUES (?, ?, ?)`).run(modelId, 96, now)
  db.prepare(`INSERT INTO depot (model_id, total_pieces, updated_at) VALUES (?, ?, ?)`).run(modelId, 780, now)

  const insertExport = db.prepare(
    `INSERT INTO logistics_exports (id, model_id, description, quantite, date, created_at) VALUES (?, ?, ?, ?, ?, ?)`
  )
  insertExport.run('exp_demo_1', modelId, 'Chemises homme manches longues', 3000, '2026-08-20', now)
  insertExport.run('exp_demo_2', modelId, 'Chemises homme manches longues', 4000, '2026-08-25', now)

  const insertPoste = db.prepare(
    `INSERT INTO poste_status (model_id, dept_key, percentage, note, updated_at) VALUES (?, ?, ?, ?, ?)`
  )
  insertPoste.run(modelId, 'coupe', 92, '', now)
  insertPoste.run(modelId, 'magasin', 88, '', now)
  insertPoste.run(modelId, 'mecanicien', 65, 'Panne machine 504', now)
  insertPoste.run(modelId, 'echantillon', 100, '', now)

  logAudit({ deptKey: 'system', modelId, action: 'seed_demo_model', details: { client: 'Zara Home' } })
}

// Idempotent — safe to call on every server boot (departments/config are
// only inserted if missing, the demo model only if the table is empty).
// This is what makes the app self-initializing on hosts with an ephemeral
// filesystem (e.g. Render's free tier, where the SQLite file doesn't
// survive a restart).
export function runSeed({ log = false } = {}) {
  seedDepartments()
  seedConfig()
  seedDemoModel()

  if (log) {
    console.log('Seed complete.')
    console.log('Default department PINs (change via PIN_<DEPT> env vars before seeding on a fresh DB):')
    for (const [key, pin] of Object.entries(DEFAULT_PINS)) {
      console.log(`  ${key.padEnd(12)} ${pin}`)
    }
  }
}

const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`
if (isMain) {
  runSeed({ log: true })
}
