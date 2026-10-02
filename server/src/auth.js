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

// A short fingerprint of a department's current pin_hash, embedded in every
// token issued for it. Rotating a PIN changes pin_hash, which changes this
// fingerprint, which invalidates every token issued under the old PIN —
// without it, a token issued right before a PIN rotation would stay valid
// for its whole validity regardless of the rotation.
function pinFingerprint(pinHash) {
  return crypto.createHash('sha256').update(pinHash).digest('hex').slice(0, 16)
}

const MAX_ATTEMPTS = 5
const LOCKOUT_MINUTES = 10

// The client IP a failed-PIN counter is keyed on (together with the
// department). On Vercel, the platform's own edge sets x-vercel-forwarded-for
// / x-real-ip to the real client address and overwrites whatever the client
// sent, so those are trustworthy there — and ONLY there: anywhere else (local
// dev, tests, any other host) a client could forge them, so the raw socket
// address is used instead and forwarded headers are ignored entirely.
export function clientIp(req) {
  if (process.env.VERCEL) {
    const forwarded = req.headers['x-vercel-forwarded-for'] || req.headers['x-real-ip'] || ''
    const ip = String(forwarded).split(',')[0].trim()
    if (ip) return ip
  }
  return req.socket?.remoteAddress || 'unknown'
}

// Failed attempts are counted per (department, client IP) in login_attempts
// — not per department alone — so one device hammering wrong PINs locks
// only itself out of that department, never every legitimate device on the
// floor along with it.
//
// Result shapes:
//   { ok: true, dept }
//   { ok: false, reason: 'locked', retryAfterSeconds }
//   { ok: false, reason: 'invalid', attemptsRemaining }
export async function verifyPin(deptKey, pin, ip = 'unknown') {
  const dept = await get('SELECT * FROM departments WHERE key = $1', [deptKey])
  // Department keys aren't secret (the whole list is public via
  // /api/departments) — treat "no such department" as just another wrong
  // PIN rather than a distinct case, so there's nothing to enumerate.
  if (!dept) return { ok: false, reason: 'invalid', attemptsRemaining: MAX_ATTEMPTS - 1 }

  const attempt = await get('SELECT * FROM login_attempts WHERE dept_key = $1 AND ip = $2', [deptKey, ip])
  if (attempt?.locked_until) {
    const remainingMs = new Date(attempt.locked_until).getTime() - Date.now()
    if (remainingMs > 0) {
      return { ok: false, reason: 'locked', retryAfterSeconds: Math.ceil(remainingMs / 1000) }
    }
  }

  if (bcrypt.compareSync(String(pin), dept.pin_hash)) {
    if (attempt) await run('DELETE FROM login_attempts WHERE dept_key = $1 AND ip = $2', [deptKey, ip])
    return { ok: true, dept }
  }

  // An expired lock starts a fresh count rather than carrying the old one.
  const previous = attempt?.locked_until ? 0 : attempt?.failed_attempts || 0
  const attempts = previous + 1
  if (attempts >= MAX_ATTEMPTS) {
    const lockedUntil = new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000).toISOString()
    await run(
      `INSERT INTO login_attempts (dept_key, ip, failed_attempts, locked_until) VALUES ($1, $2, 0, $3)
       ON CONFLICT (dept_key, ip) DO UPDATE SET failed_attempts = 0, locked_until = excluded.locked_until`,
      [deptKey, ip, lockedUntil]
    )
    return { ok: false, reason: 'locked', retryAfterSeconds: LOCKOUT_MINUTES * 60 }
  }

  await run(
    `INSERT INTO login_attempts (dept_key, ip, failed_attempts, locked_until) VALUES ($1, $2, $3, NULL)
     ON CONFLICT (dept_key, ip) DO UPDATE SET failed_attempts = excluded.failed_attempts, locked_until = NULL`,
    [deptKey, ip, attempts]
  )
  return { ok: false, reason: 'invalid', attemptsRemaining: MAX_ATTEMPTS - attempts }
}

// Session policy (Mohamed's decision): the PIN is entered once; the session
// then lasts as long as it is used. Each token is valid SESSION_IDLE_TTL
// after it was issued, and any authenticated request made with a token older
// than RENEW_AFTER_SECONDS gets a fresh one in the X-Atlas-Token response
// header (the client swaps it in silently) — so only SESSION_IDLE_TTL of
// inactivity, closing the tab (sessionStorage), Déconnexion, or the PIN
// being changed (fingerprint below) ends a session. `s` (session start)
// survives renewals and caps one session at SESSION_MAX_SECONDS overall.
const SESSION_IDLE_TTL = '24h'
const RENEW_AFTER_SECONDS = 10 * 60
const SESSION_MAX_SECONDS = 7 * 24 * 60 * 60
export const RENEWED_TOKEN_HEADER = 'X-Atlas-Token'

export function issueToken(deptKey, pinHash, sessionStart = Math.floor(Date.now() / 1000)) {
  return jwt.sign({ dept: deptKey, pv: pinFingerprint(pinHash), s: sessionStart }, JWT_SECRET, {
    expiresIn: SESSION_IDLE_TTL,
    algorithm: 'HS256',
  })
}

// Shared by requireDept / requireAnyDept. Responds itself (401/403) and
// returns null on refusal; otherwise returns the department key.
async function authenticate(req, res, allowed) {
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : null
  if (!token) {
    res.status(401).json({ error: 'missing_token' })
    return null
  }

  let payload
  try {
    payload = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] })
  } catch (err) {
    res.status(401).json({ error: err?.name === 'TokenExpiredError' ? 'session_expired' : 'invalid_token' })
    return null
  }
  if (!payload.dept) {
    res.status(401).json({ error: 'invalid_token' })
    return null
  }
  if (allowed && !allowed.includes(payload.dept)) {
    res.status(403).json({ error: 'wrong_department' })
    return null
  }

  const nowSeconds = Math.floor(Date.now() / 1000)
  const sessionStart = payload.s ?? payload.iat
  if (nowSeconds - sessionStart > SESSION_MAX_SECONDS) {
    res.status(401).json({ error: 'session_expired' })
    return null
  }

  const dept = await get('SELECT pin_hash FROM departments WHERE key = $1', [payload.dept])
  if (!dept || pinFingerprint(dept.pin_hash) !== payload.pv) {
    res.status(401).json({ error: 'pin_rotated' })
    return null
  }

  if (nowSeconds - payload.iat > RENEW_AFTER_SECONDS) {
    res.setHeader(RENEWED_TOKEN_HEADER, issueToken(payload.dept, dept.pin_hash, sessionStart))
  }
  return payload.dept
}

// Express middleware: requires a valid Bearer token scoped to `deptKey`
// (or to any of `deptKeys` when an array is passed), issued under the
// department's *current* PIN.
export function requireDept(deptKeyOrKeys) {
  const allowed = Array.isArray(deptKeyOrKeys) ? deptKeyOrKeys : [deptKeyOrKeys]
  return async (req, res, next) => {
    const dept = await authenticate(req, res, allowed)
    if (!dept) return
    req.dept = dept
    next()
  }
}

// Like requireDept(), but accepts a valid token from ANY department (📩
// feedback, Ask Atlas, Fiche Modèle reads…).
export function requireAnyDept() {
  return async (req, res, next) => {
    const dept = await authenticate(req, res, null)
    if (!dept) return
    req.dept = dept
    next()
  }
}
