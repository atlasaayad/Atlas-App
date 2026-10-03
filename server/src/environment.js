import crypto from 'node:crypto'
import { get, run } from './db/index.js'

// "Which database is this deployment writing to?" — answered server-side
// only. Nothing here ever leaves the server except a status and a short,
// non-secret hint (the last 6 characters of the database endpoint name),
// never the URL, user or password.
//
// Production records the fingerprint of its own database in `config`
// (key below) at every cold start. A preview then compares:
//   - same fingerprint as production       → it writes to the factory DB
//   - a different one (a Neon branch copy) → test database
//   - no record at all                     → cannot be verified
// A Neon branch is a copy of production, so it carries production's record
// — but its own endpoint (host) is different, which is what is compared.

const CONFIG_KEY = 'production_db_fingerprint'

function connectionString(env = process.env) {
  return env.DATABASE_URL || env.POSTGRES_URL || ''
}

// Neon: "ep-cool-name-123456-pooler.eu-central-1.aws.neon.tech" and the
// direct "ep-cool-name-123456.eu-central-1…" are the same database.
export function databaseEndpoint(url = connectionString()) {
  try {
    const host = new URL(url).hostname.toLowerCase()
    if (host === 'localhost' || host === '127.0.0.1' || host === '::1' || !host.includes('.')) return 'local'
    return host.split('.')[0].replace(/-pooler$/, '')
  } catch {
    return ''
  }
}

export function fingerprint(endpoint) {
  return crypto.createHash('sha256').update(`atlas-db:${endpoint}`).digest('hex').slice(0, 16)
}

export function deploymentEnv(env = process.env) {
  return env.VERCEL_ENV || (env.NODE_ENV === 'production' ? 'production' : 'development')
}

// Called at cold start (runSeed). Only the production deployment writes.
export async function recordProductionDatabase(env = process.env) {
  if (deploymentEnv(env) !== 'production') return
  const endpoint = databaseEndpoint(connectionString(env))
  if (!endpoint || endpoint === 'local') return
  await run(
    `INSERT INTO config (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = excluded.value`,
    [CONFIG_KEY, fingerprint(endpoint)]
  )
}

// { env, database: 'production' | 'test' | 'production_db' | 'unverified', hint }
//   production    → the production deployment itself (no banner)
//   test          → not production, separate database
//   production_db → NOT production, but connected to the factory database
//   unverified    → not production, and production never recorded its DB
export async function environmentStatus(env = process.env) {
  const deployment = deploymentEnv(env)
  const endpoint = databaseEndpoint(connectionString(env))
  const hint = endpoint && endpoint !== 'local' ? `…${endpoint.slice(-6)}` : endpoint
  if (deployment === 'production') return { env: deployment, database: 'production', hint }
  if (endpoint === 'local') return { env: deployment, database: 'test', hint }
  const row = await get('SELECT value FROM config WHERE key = $1', [CONFIG_KEY])
  if (!row?.value) return { env: deployment, database: 'unverified', hint }
  return { env: deployment, database: row.value === fingerprint(endpoint) ? 'production_db' : 'test', hint }
}
