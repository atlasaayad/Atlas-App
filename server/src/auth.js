import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { get } from './db/index.js'

const JWT_SECRET = process.env.JWT_SECRET || 'atlas-dev-secret-change-me'
const TOKEN_TTL = '12h'

export async function verifyPin(deptKey, pin) {
  const dept = await get('SELECT * FROM departments WHERE key = $1', [deptKey])
  if (!dept) return null
  if (!bcrypt.compareSync(String(pin), dept.pin_hash)) return null
  return dept
}

export function issueToken(deptKey) {
  return jwt.sign({ dept: deptKey }, JWT_SECRET, { expiresIn: TOKEN_TTL })
}

// Express middleware: requires a valid Bearer token scoped to `deptKey`
// (or to any of `deptKeys` when an array is passed).
export function requireDept(deptKeyOrKeys) {
  const allowed = Array.isArray(deptKeyOrKeys) ? deptKeyOrKeys : [deptKeyOrKeys]
  return (req, res, next) => {
    const header = req.headers.authorization || ''
    const token = header.startsWith('Bearer ') ? header.slice(7) : null
    if (!token) return res.status(401).json({ error: 'missing_token' })
    try {
      const payload = jwt.verify(token, JWT_SECRET)
      if (!allowed.includes(payload.dept)) return res.status(403).json({ error: 'wrong_department' })
      req.dept = payload.dept
      next()
    } catch {
      return res.status(401).json({ error: 'invalid_token' })
    }
  }
}
