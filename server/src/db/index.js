import Database from 'better-sqlite3'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dataDir = path.join(__dirname, '..', '..', 'data')
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true })

const dbPath = process.env.DB_PATH || path.join(dataDir, 'atlas.db')
export const db = new Database(dbPath)
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

db.exec(`
CREATE TABLE IF NOT EXISTS config (
  key TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS departments (
  key TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  icon TEXT NOT NULL,
  pin_hash TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS models (
  id TEXT PRIMARY KEY,
  client TEXT,
  qte_totale INTEGER DEFAULT 0,
  debut TEXT,
  fin_prevue TEXT,
  dessin TEXT,
  commande INTEGER DEFAULT 0,
  chain_number INTEGER,
  active INTEGER DEFAULT 1,
  nd INTEGER DEFAULT 0,
  vt REAL DEFAULT 0,
  dt REAL DEFAULT 0,
  created_at TEXT,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS gamme_lines (
  id TEXT PRIMARY KEY,
  model_id TEXT NOT NULL REFERENCES models(id) ON DELETE CASCADE,
  seq_no INTEGER NOT NULL,
  operation TEXT,
  machine TEXT,
  tps REAL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS effectif_requis (
  model_id TEXT NOT NULL REFERENCES models(id) ON DELETE CASCADE,
  specialty TEXT NOT NULL,
  required INTEGER DEFAULT 0,
  PRIMARY KEY (model_id, specialty)
);

CREATE TABLE IF NOT EXISTS hourly_production (
  model_id TEXT NOT NULL REFERENCES models(id) ON DELETE CASCADE,
  slot_index INTEGER NOT NULL,
  qty INTEGER DEFAULT 0,
  updated_at TEXT,
  PRIMARY KEY (model_id, slot_index)
);

CREATE TABLE IF NOT EXISTS production_totals (
  model_id TEXT PRIMARY KEY REFERENCES models(id) ON DELETE CASCADE,
  total_entree INTEGER DEFAULT 0,
  total_sortie INTEGER DEFAULT 0,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS rh_attendance (
  model_id TEXT NOT NULL REFERENCES models(id) ON DELETE CASCADE,
  specialty TEXT NOT NULL,
  present INTEGER DEFAULT 0,
  updated_at TEXT,
  PRIMARY KEY (model_id, specialty)
);

CREATE TABLE IF NOT EXISTS quality (
  model_id TEXT PRIMARY KEY REFERENCES models(id) ON DELETE CASCADE,
  percentage REAL DEFAULT 100,
  reprises INTEGER DEFAULT 0,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS finale (
  model_id TEXT PRIMARY KEY REFERENCES models(id) ON DELETE CASCADE,
  en_cours INTEGER DEFAULT 0,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS depot (
  model_id TEXT PRIMARY KEY REFERENCES models(id) ON DELETE CASCADE,
  total_pieces INTEGER DEFAULT 0,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS logistics_exports (
  id TEXT PRIMARY KEY,
  model_id TEXT NOT NULL REFERENCES models(id) ON DELETE CASCADE,
  description TEXT,
  quantite INTEGER DEFAULT 0,
  date TEXT,
  created_at TEXT
);

CREATE TABLE IF NOT EXISTS poste_status (
  model_id TEXT NOT NULL REFERENCES models(id) ON DELETE CASCADE,
  dept_key TEXT NOT NULL,
  percentage REAL DEFAULT 100,
  note TEXT,
  updated_at TEXT,
  PRIMARY KEY (model_id, dept_key)
);

CREATE TABLE IF NOT EXISTS patron_finance (
  model_id TEXT PRIMARY KEY REFERENCES models(id) ON DELETE CASCADE,
  cout_modele REAL DEFAULT 0,
  cout_ouvriers REAL DEFAULT 0,
  autres_depenses REAL DEFAULT 0,
  prix_vente_unitaire REAL DEFAULT 0,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  dept_key TEXT,
  model_id TEXT,
  action TEXT,
  details TEXT,
  created_at TEXT
);
`)

export function logAudit({ deptKey, modelId, action, details }) {
  db.prepare(
    `INSERT INTO audit_log (id, dept_key, model_id, action, details, created_at) VALUES (?, ?, ?, ?, ?, ?)`
  ).run(
    `aud_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    deptKey || null,
    modelId || null,
    action,
    details ? JSON.stringify(details) : null,
    new Date().toISOString()
  )
}
