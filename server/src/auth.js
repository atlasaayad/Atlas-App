import crypto from 'node:crypto'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { get, run } from './db/index.js'

const INSECURE_DEFAULTS = new Set(['atlas-dev-secret-change-me', 'change-me-in-production', ''])
const JWT_SECRET = process.env.JWT_SECRET

if (!JWT_SECRET || INSECURE_DEFAULTS.has(JWT_SECRET)) {
  // No silent fallback: a guessable/shared secret lets anyone forge a valid
  // "logged in as any department" token without ever knowing a PIN. Fail
  // loudly instead — see .env.example for how to set a real one.
  throw new Error(
    'JWT_SECRET env var is not set (or is using a known placeholder value). ' +
      'Set it to a real random secret — see .env.example.'
  )
}

const TOKEN_TTL = '12h'

// A short fingerprint of a department's current pin_hash, embedded in every
// token issued for it. Rotating a PIN changes pin_hash, which changes this
// fingerprint, which invalidates every token issued under the old PIN —
// without it, a token issued right before a PIN rotation would stay valid
// for up to TOKEN_TTL regardless of the rotation.
function pinFingerprint(pinHash) {
  return crypto.createHash('sha256').update(pinHash).digest('hex').slice(0, 16)
}

const MAX_ATTEMPTS = 5
const LOCKOUT_MINUTES = 10

// Result shapes:
//   { ok: true, dept }
//   { ok: false, reason: 'locked', retryAfterSeconds }
//   { ok: false, reason: 'invalid', attemptsRemaining }
export async function verifyPin(deptKey, pin) {
  const dept = await get('SELECT * FROM departments WHERE key = $1', [deptKey])
  // Department keys aren't secret (the whole list is public via
  // /api/departments) — treat "no such department" as just another wrong
  // PIN rather than a distinct case, so there's nothing to enumerate.
  if (!dept) return { ok: false, reason: 'invalid', attemptsRemaining: MAX_ATTEMPTS - 1 }

  if (dept.locked_until) {
    const remainingMs = new Date(dept.locked_until).getTime() - Date.now()
    if (remainingMs > 0) {
      return { ok: false, reason: 'locked', retryAfterSeconds: Math.ceil(remainingMs / 1000) }
    }
  }

  if (bcrypt.compareSync(String(pin), dept.pin_hash)) {
    if (dept.failed_attempts > 0 || dept.locked_until) {
      await run('UPDATE departments SET failed_attempts = 0, locked_until = NULL WHERE key = $1', [deptKey])
    }
    return { ok: true, dept }
  }

  const attempts = (dept.failed_attempts || 0) + 1
  if (attempts >= MAX_ATTEMPTS) {
    const lockedUntil = new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000).toISOString()
    await run('UPDATE departments SET failed_attempts = 0, locked_until = $1 WHERE key = $2', [lockedUntil, deptKey])
    return { ok: false, reason: 'locked', retryAfterSeconds: LOCKOUT_MINUTES * 60 }
  }

  await run('UPDATE departments SET failed_attempts = $1 WHERE key = $2', [attempts, deptKey])
  return { ok: false, reason: 'invalid', attemptsRemaining: MAX_ATTEMPTS - attempts }
}

export function issueToken(deptKey, pinHash) {
  return jwt.sign({ dept: deptKey, pv: pinFingerprint(pinHash) }, JWT_SECRET, {
    expiresIn: TOKEN_TTL,
    algorithm: 'HS256',
  })
}

// Express middleware: requires a valid Bearer token scoped to `deptKey`
// (or to any of `deptKeys` when an array is passed), issued under the
// department's *current* PIN.
export function requireDept(deptKeyOrKeys) {
  const allowed = Array.isArray(deptKeyOrKeys) ? deptKeyOrKeys : [deptKeyOrKeys]
  return async (req, res, next) => {
    const header = req.headers.authorization || ''
    const token = header.startsWith('Bearer ') ? header.slice(7) : null
    if (!token) return res.status(401).json({ error: 'missing_token' })

    let payload
    try {
      payload = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] })
    } catch {
      return res.status(401).json({ error: 'invalid_token' })
    }
    if (!allowed.includes(payload.dept)) return res.status(403).json({ error: 'wrong_department' })

    const dept = await get('SELECT pin_hash FROM departments WHERE key = $1', [payload.dept])
    if (!dept || pinFingerprint(dept.pin_hash) !== payload.pv) {
      return res.status(401).json({ error: 'pin_rotated' })
    }

    req.dept = payload.dept
    next()
  }
}
