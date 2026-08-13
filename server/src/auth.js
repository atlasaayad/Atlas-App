import crypto from 'node:crypto'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { get } from './db/index.js'

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

export async function verifyPin(deptKey, pin) {
  const dept = await get('SELECT * FROM departments WHERE key = $1', [deptKey])
  if (!dept) return null
  if (!bcrypt.compareSync(String(pin), dept.pin_hash)) return null
  return dept
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
