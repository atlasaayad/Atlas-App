// Vercel serverless entry point. Every /api/* request is rewritten here
// (see vercel.json) and dispatched internally by the same Express app used
// for local dev (server/src/app.js) — its own route definitions still
// decide what matches what.
import { app } from '../server/src/app.js'
import { runSeed } from '../server/src/db/seed.js'

// Runs once per cold start (top-level await executes on module load; a warm
// invocation reuses the already-initialized module). Creates tables and
// default data on a fresh Postgres database — logged, not thrown, so a bad
// DATABASE_URL surfaces as a normal request error instead of the function
// refusing to load at all.
try {
  await runSeed({ log: true })
} catch (err) {
  console.error('runSeed failed on cold start:', err)
}

export default app
