import pg from 'pg'
import { SPECIALTY_MIGRATION_MAP } from '../constants.js'

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
  if (!schemaReady) {
    schemaReady = run(SCHEMA_SQL).then(migrateSpecialtyNames).then(migrateProductionHistoryUniqueKey)
  }
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
-- predict.js) — a separate counter, unrelated to the factory tracker's
-- Ask Atlas feature.
CREATE TABLE IF NOT EXISTS predict_analysis_usage (
  date TEXT PRIMARY KEY,
  count INTEGER NOT NULL DEFAULT 0
);

-- Shared cache for football-data.org responses (free tier: 10 requests/
-- minute, system-wide). A plain in-memory cache doesn't work here — Vercel
-- doesn't guarantee the same warm instance handles the next request, so two
-- requests seconds apart can land on different cold instances with no
-- shared memory. Postgres is the one thing every instance actually shares.
-- Keyed by a descriptive string (e.g. "match:12345", "standings:PL") built
-- in predict.js; predict.js also owns the TTL check against fetched_at.
CREATE TABLE IF NOT EXISTS predict_football_cache (
  cache_key TEXT PRIMARY KEY,
  data JSONB NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL
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
-- Couleur/Variante support: a variant is a normal models row (its own
-- qte_totale + production_totals + production_history entries) except it
-- carries parent_model_id — never re-enters gamme/effectif, since VT/DT/ND
-- are the shared line's, not per-color; a variant only ever exists to give
-- Agent Production a second (third, ...) model_id to log the same hour's
-- output against for a different color. Only a root model (parent_model_id
-- IS NULL) can itself have variants — no nesting. ON DELETE CASCADE so
-- deleting a root also removes its variants, same as any other child row.
ALTER TABLE models ADD COLUMN IF NOT EXISTS parent_model_id TEXT REFERENCES models(id) ON DELETE CASCADE;
ALTER TABLE models ADD COLUMN IF NOT EXISTS variant_label TEXT;

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

CREATE TABLE IF NOT EXISTS production_totals (
  model_id TEXT PRIMARY KEY REFERENCES models(id) ON DELETE CASCADE,
  total_entree INTEGER DEFAULT 0,
  total_sortie INTEGER DEFAULT 0,
  updated_at TEXT
);

-- Permanent record of every hourly entry, keyed by chain (not model) so a
-- history query for "Chaîne 1" still spans correctly across a model change
-- mid-range, and by date so Agent Production can go back and enter/correct
-- any previous day — not just today. This is the ONLY source of truth for
-- hourly production data: today's live dashboard reads it filtered to
-- today's date, exactly the same way Historique reads any other date, so
-- there is never a second "current" copy that could drift out of sync.
-- (An earlier hourly_production table played that live-snapshot role;
-- it's retired in favor of always reading this one.)
-- Unique key includes model_id (not just chain_number, date, slot_index) so
-- a Couleur/Variante chain can log a real second entry for the very same
-- hour — one row per color, e.g. 5 pieces of color "800" and 10 of color
-- "681" at the same hour — instead of one color's save overwriting the
-- other's. See migrateProductionHistoryUniqueKey() below for how an
-- existing (pre-variant) 3-column constraint is widened to 4 in place.
CREATE TABLE IF NOT EXISTS production_history (
  id TEXT PRIMARY KEY,
  model_id TEXT NOT NULL REFERENCES models(id) ON DELETE CASCADE,
  chain_number INTEGER NOT NULL,
  date TEXT NOT NULL,
  slot_index INTEGER NOT NULL,
  qty INTEGER DEFAULT 0,
  created_at TEXT,
  updated_at TEXT
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

-- Permanent hourly record of "Pièces retouche" (pieces needing rework),
-- keyed by chain/date/slot exactly like production_history — same
-- architecture, so Quality can go back and correct any previous day too.
-- Qualité% is never stored here or anywhere: it's always computed live from
-- this table's piece_retouche against Agent Production's real qty for the
-- same chain/date/slot (see computeQualityPct() in calc.js and
-- fullDashboard() in routes/public.js). "percentage" above is legacy from
-- the old manual-slider Quality screen and is no longer written to.
CREATE TABLE IF NOT EXISTS quality_history (
  id TEXT PRIMARY KEY,
  model_id TEXT NOT NULL REFERENCES models(id) ON DELETE CASCADE,
  chain_number INTEGER NOT NULL,
  date TEXT NOT NULL,
  slot_index INTEGER NOT NULL,
  piece_retouche INTEGER DEFAULT 0,
  created_at TEXT,
  updated_at TEXT,
  UNIQUE (chain_number, date, slot_index)
);
CREATE INDEX IF NOT EXISTS idx_quality_history_chain_date ON quality_history (chain_number, date);

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

-- "Temps de lancement" — one row per model/launch. started_at/stopped_at
-- are the only timestamps kept; the running countdown, the red overrun
-- state, and the final elapsed/overrun durations are all derived live from
-- these two plus objectif_heures (see calc.js/methodeLaunch.js) — never a
-- separately stored "elapsed time" that could drift from the real clock.
-- responsible/reason_code/reason_comment are set only when Agent Méthode
-- stops the timer after it already went into overrun; NULL otherwise.
CREATE TABLE IF NOT EXISTS launch_timer (
  model_id TEXT PRIMARY KEY REFERENCES models(id) ON DELETE CASCADE,
  objectif_heures DOUBLE PRECISION DEFAULT 0,
  groupe_lancement TEXT,
  agent_methode TEXT,
  mecanicien TEXT,
  electriciens TEXT,
  agent_quality TEXT,
  chef_chaine TEXT,
  started_at TEXT,
  stopped_at TEXT,
  responsible TEXT,
  reason_code TEXT,
  reason_comment TEXT,
  updated_at TEXT
);

-- Finale's own per-specialty headcount — same shape as rh_attendance
-- (current live snapshot per chain's active model), but a separate table
-- since Finale's job roles (FINALE_SPECIALTIES) are entirely different from
-- the 13 chain specialties. No historical table: "État des effectifs" only
-- ever needs today's live total, not a backdated trail, for Finale.
CREATE TABLE IF NOT EXISTS finale_attendance (
  model_id TEXT NOT NULL REFERENCES models(id) ON DELETE CASCADE,
  specialty TEXT NOT NULL,
  present INTEGER DEFAULT 0,
  updated_at TEXT,
  PRIMARY KEY (model_id, specialty)
);

ALTER TABLE depot ADD COLUMN IF NOT EXISTS effectif_total INTEGER DEFAULT 0;

-- Personnel administratif / Encadrement — a single company-wide headcount
-- (not per chain/model, unlike everything else in this file), entered by RH
-- (primary) or Patron (backup): whichever saves a given date last is what
-- reads back, exactly like rh_attendance's RH/Méthode split. One permanent
-- row per calendar day (never overwritten across days) is the sole source
-- of truth — "today" is just today's row, "cumulative" is the sum across
-- every recorded day — same architecture as production_history/
-- quality_history, no separate "live" table to drift out of sync.
CREATE TABLE IF NOT EXISTS personnel_admin_history (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL UNIQUE,
  total INTEGER DEFAULT 0,
  created_at TEXT,
  updated_at TEXT
);
`

// One-time (per old specialty code), idempotent specialty rename/merge
// migration — see SPECIALTY_MIGRATION_MAP in constants.js for the full old→
// new mapping. Idempotent because each step only acts on rows still bearing
// the OLD code: once migrated (and deleted), a repeat run finds nothing to
// do for that code. Applied identically to effectif_requis and
// rh_attendance (current values, keyed by model_id) and to
// rh_attendance_history (the permanent per-day record, keyed by chain_number
// + date) — a merge (e.g. 301/502/504/516 -> Machinistes) sums the values
// per group instead of overwriting, so no headcount is lost when several old
// codes collapse into one new specialty.
async function migrateSpecialtyNames() {
  for (const [oldName, newName] of Object.entries(SPECIALTY_MIGRATION_MAP)) {
    await run(
      `INSERT INTO effectif_requis (model_id, specialty, required)
       SELECT model_id, $2, SUM(required) FROM effectif_requis WHERE specialty = $1 GROUP BY model_id
       ON CONFLICT (model_id, specialty) DO UPDATE SET required = effectif_requis.required + excluded.required`,
      [oldName, newName]
    )
    await run('DELETE FROM effectif_requis WHERE specialty = $1', [oldName])

    await run(
      `INSERT INTO rh_attendance (model_id, specialty, present, updated_at)
       SELECT model_id, $2, SUM(present), MAX(updated_at) FROM rh_attendance WHERE specialty = $1 GROUP BY model_id
       ON CONFLICT (model_id, specialty) DO UPDATE SET
         present = rh_attendance.present + excluded.present,
         updated_at = GREATEST(rh_attendance.updated_at, excluded.updated_at)`,
      [oldName, newName]
    )
    await run('DELETE FROM rh_attendance WHERE specialty = $1', [oldName])

    await run(
      `INSERT INTO rh_attendance_history (id, model_id, chain_number, specialty, date, present, created_at, updated_at)
       SELECT 'rah_mig_' || chain_number || '_' || date || '_' || $2, MAX(model_id), chain_number, $2, date,
              SUM(present), MIN(created_at), MAX(updated_at)
       FROM rh_attendance_history WHERE specialty = $1 GROUP BY chain_number, date
       ON CONFLICT (chain_number, specialty, date) DO UPDATE SET
         present = rh_attendance_history.present + excluded.present,
         model_id = excluded.model_id,
         updated_at = excluded.updated_at`,
      [oldName, newName]
    )
    await run('DELETE FROM rh_attendance_history WHERE specialty = $1', [oldName])
  }
}

// Widens production_history's unique key from (chain_number, date,
// slot_index) to (chain_number, date, slot_index, model_id) — needed so a
// Couleur/Variante chain can log a real second row for the same hour (one
// per color) instead of one color's save overwriting another's. Idempotent:
// drops whichever pre-existing UNIQUE constraint isn't already the new
// 4-column one (a fresh database has none to drop — CREATE TABLE above no
// longer declares one inline), then adds the 4-column one only if it
// isn't already there. Safe to widen unconditionally: existing rows were
// never in conflict under the old, narrower key, so they can't conflict
// under a wider one either.
async function migrateProductionHistoryUniqueKey() {
  await run(`
    DO $$
    DECLARE r RECORD;
    BEGIN
      FOR r IN
        SELECT conname FROM pg_constraint
        WHERE conrelid = 'production_history'::regclass AND contype = 'u'
          AND conname <> 'production_history_unique_slot'
      LOOP
        EXECUTE 'ALTER TABLE production_history DROP CONSTRAINT ' || quote_ident(r.conname);
      END LOOP;

      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'production_history_unique_slot') THEN
        ALTER TABLE production_history ADD CONSTRAINT production_history_unique_slot
          UNIQUE (chain_number, date, slot_index, model_id);
      END IF;
    END $$;
  `)
}

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
