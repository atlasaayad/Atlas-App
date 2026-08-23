import pg from 'pg'

const { Pool } = pg

const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL
if (!connectionString) {
  throw new Error('DATABASE_URL (or POSTGRES_URL) env var is required — set it to your Neon Postgres connection string.')
}

// max: 1 — each serverless function instance gets its own single connection;
// Neon's pooled endpoint (pgbouncer) handles fanning that out across many
// concurrent function instances. Safe for local Postgres too (just less
// relevant there since there's no serverless fan-out).
export const pool = new Pool({
  connectionString,
  ssl: connectionString.includes('localhost') ? false : { rejectUnauthorized: false },
  max: 1,
})

export async function all(text, params = []) {
  const { rows } = await pool.query(text, params)
  return rows
}

export async function get(text, params = []) {
  const { rows } = await pool.query(text, params)
  return rows[0]
}

export async function run(text, params = []) {
  return pool.query(text, params)
}

let schemaReady = null

// Idempotent, cheap (CREATE TABLE IF NOT EXISTS). Called lazily before the
// first query of each cold start rather than at import time, so a bad
// DATABASE_URL surfaces as a normal request error instead of crashing the
// whole function on load.
export function ensureSchema() {
  if (!schemaReady) schemaReady = run(SCHEMA_SQL)
  return schemaReady
}

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS config (
  key TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS departments (
  key TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  icon TEXT NOT NULL,
  pin_hash TEXT NOT NULL,
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until TEXT
);

-- ADD COLUMN IF NOT EXISTS so this reaches the departments table that
-- already exists on a deployed database, not just a fresh one.
ALTER TABLE departments ADD COLUMN IF NOT EXISTS failed_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE departments ADD COLUMN IF NOT EXISTS locked_until TEXT;

-- One row per factory-local day, counting "اسأل أطلس" calls system-wide —
-- caps the daily Anthropic API spend. Keyed by date (Africa/Casablanca, see
-- todayInFactoryTZ) rather than a rolling window, so the cap always resets
-- cleanly at local midnight.
CREATE TABLE IF NOT EXISTS ask_usage (
  date TEXT PRIMARY KEY,
  count INTEGER NOT NULL DEFAULT 0
);

-- Same shape and purpose as ask_usage above, but for ATLAS PREDICT's
-- "تحليل وتوقعات" report generation (client/src/predict, server/src/routes/
-- predict.js) — a separate counter since it's a heavier claude-sonnet-5
-- call and unrelated to the factory tracker's Ask Atlas feature.
CREATE TABLE IF NOT EXISTS predict_analysis_usage (
  date TEXT PRIMARY KEY,
  count INTEGER NOT NULL DEFAULT 0
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
  vt DOUBLE PRECISION DEFAULT 0,
  dt DOUBLE PRECISION DEFAULT 0,
  created_at TEXT,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS gamme_lines (
  id TEXT PRIMARY KEY,
  model_id TEXT NOT NULL REFERENCES models(id) ON DELETE CASCADE,
  seq_no INTEGER NOT NULL,
  operation TEXT,
  machine TEXT,
  tps DOUBLE PRECISION DEFAULT 0
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

-- Permanent record of every hourly entry, keyed by chain (not model) so a
-- history query for "Chaîne 1" still spans correctly across a model change
-- mid-range. hourly_production above stays as the live "today" view that
-- gets overwritten in place; this table only ever grows, and is what
-- Historique's day/range/month aggregates are computed from.
CREATE TABLE IF NOT EXISTS production_history (
  id TEXT PRIMARY KEY,
  model_id TEXT NOT NULL REFERENCES models(id) ON DELETE CASCADE,
  chain_number INTEGER NOT NULL,
  date TEXT NOT NULL,
  slot_index INTEGER NOT NULL,
  qty INTEGER DEFAULT 0,
  created_at TEXT,
  updated_at TEXT,
  UNIQUE (chain_number, date, slot_index)
);
CREATE INDEX IF NOT EXISTS idx_production_history_chain_date ON production_history (chain_number, date);

CREATE TABLE IF NOT EXISTS rh_attendance (
  model_id TEXT NOT NULL REFERENCES models(id) ON DELETE CASCADE,
  specialty TEXT NOT NULL,
  present INTEGER DEFAULT 0,
  updated_at TEXT,
  PRIMARY KEY (model_id, specialty)
);

-- Permanent daily attendance record, separate from rh_attendance above
-- (which is just "today's" live snapshot and gets overwritten in place).
-- Keyed by chain (not model) for the same reason as production_history:
-- an audit report for "Chaîne X" must stay correct even across a model
-- change mid-period. This is what the BSCI/SMETA audit report reads from.
CREATE TABLE IF NOT EXISTS rh_attendance_history (
  id TEXT PRIMARY KEY,
  model_id TEXT NOT NULL REFERENCES models(id) ON DELETE CASCADE,
  chain_number INTEGER NOT NULL,
  specialty TEXT NOT NULL,
  date TEXT NOT NULL,
  present INTEGER DEFAULT 0,
  created_at TEXT,
  updated_at TEXT,
  UNIQUE (chain_number, specialty, date)
);
CREATE INDEX IF NOT EXISTS idx_rh_attendance_history_chain_date ON rh_attendance_history (chain_number, date);

CREATE TABLE IF NOT EXISTS quality (
  model_id TEXT PRIMARY KEY REFERENCES models(id) ON DELETE CASCADE,
  percentage DOUBLE PRECISION DEFAULT 100,
  reprises INTEGER DEFAULT 0,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS finale (
  model_id TEXT PRIMARY KEY REFERENCES models(id) ON DELETE CASCADE,
  en_cours INTEGER DEFAULT 0,
  updated_at TEXT
);
-- CREATE TABLE IF NOT EXISTS is a no-op on an already-seeded database, so
-- the 9 Détails Finale fields (added after the table already existed in
-- production) need explicit ALTER TABLE statements to actually land there.
ALTER TABLE finale ADD COLUMN IF NOT EXISTS piece_retouche INTEGER DEFAULT 0;
ALTER TABLE finale ADD COLUMN IF NOT EXISTS piece_terminee INTEGER DEFAULT 0;
ALTER TABLE finale ADD COLUMN IF NOT EXISTS piece_2eme INTEGER DEFAULT 0;
ALTER TABLE finale ADD COLUMN IF NOT EXISTS encours_special INTEGER DEFAULT 0;
ALTER TABLE finale ADD COLUMN IF NOT EXISTS encours_repassage INTEGER DEFAULT 0;
ALTER TABLE finale ADD COLUMN IF NOT EXISTS encours_controle INTEGER DEFAULT 0;
ALTER TABLE finale ADD COLUMN IF NOT EXISTS moyenne_prod_special INTEGER DEFAULT 0;
ALTER TABLE finale ADD COLUMN IF NOT EXISTS moyenne_prod_repassage_final INTEGER DEFAULT 0;
ALTER TABLE finale ADD COLUMN IF NOT EXISTS moyenne_prod_controle_final INTEGER DEFAULT 0;

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
  percentage DOUBLE PRECISION DEFAULT 100,
  note TEXT,
  updated_at TEXT,
  PRIMARY KEY (model_id, dept_key)
);

CREATE TABLE IF NOT EXISTS patron_finance (
  model_id TEXT PRIMARY KEY REFERENCES models(id) ON DELETE CASCADE,
  cout_modele DOUBLE PRECISION DEFAULT 0,
  cout_ouvriers DOUBLE PRECISION DEFAULT 0,
  autres_depenses DOUBLE PRECISION DEFAULT 0,
  prix_vente_unitaire DOUBLE PRECISION DEFAULT 0,
  updated_at TEXT
);

-- Coût ouvriers can be entered directly, or derived from (nombre d'ouvriers
-- × salaire moyen) — cout_ouvriers_mode picks which one is authoritative;
-- the other pair of columns is kept so the form can be re-opened in the
-- right mode. autres_depenses_items holds the itemized (libellé, montant)
-- lines as JSON; autres_depenses itself stays as their pre-computed sum so
-- withProfit() doesn't need to parse JSON to total the cost.
ALTER TABLE patron_finance ADD COLUMN IF NOT EXISTS cout_ouvriers_mode TEXT DEFAULT 'manual';
ALTER TABLE patron_finance ADD COLUMN IF NOT EXISTS nombre_ouvriers DOUBLE PRECISION DEFAULT 0;
ALTER TABLE patron_finance ADD COLUMN IF NOT EXISTS salaire_moyen DOUBLE PRECISION DEFAULT 0;
ALTER TABLE patron_finance ADD COLUMN IF NOT EXISTS autres_depenses_items TEXT DEFAULT '[]';

CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  dept_key TEXT,
  model_id TEXT,
  action TEXT,
  details TEXT,
  created_at TEXT
);
`

export async function logAudit({ deptKey, modelId, action, details }) {
  await run(
    `INSERT INTO audit_log (id, dept_key, model_id, action, details, created_at) VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      `aud_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      deptKey || null,
      modelId || null,
      action,
      details ? JSON.stringify(details) : null,
      new Date().toISOString(),
    ]
  )
}
