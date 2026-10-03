import { useEffect, useState } from 'react'
import { api } from '../lib/api'

// Permanent safety bar for every non-production deployment (previews,
// local). The server decides — it compares this deployment's database with
// the one production recorded (server/src/environment.js) and only returns
// a status + a 6-character hint, never the database URL. Production: no bar.
const MESSAGES = {
  test: { big: false, text: "⚠️ BASE DE TEST — rien ici ne touche l'usine" },
  production_db: { big: true, text: "⚠️ ATTENTION : cette version de test écrit dans la vraie base de l'usine" },
  unverified: {
    big: true,
    text: "⚠️ ATTENTION : base non vérifiée — considérez que cette version de test écrit dans la vraie base de l'usine",
  },
}

export default function EnvironmentBanner() {
  const [status, setStatus] = useState(null)

  useEffect(() => {
    let cancelled = false
    api
      .getEnvironment()
      .then((s) => !cancelled && setStatus(s))
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  const message = status && MESSAGES[status.database]
  if (!message) return null
  return (
    <div
      role="alert"
      data-testid="environment-banner"
      className={`sticky top-0 z-50 w-full bg-red-700 px-3 text-center font-semibold text-white ${
        message.big ? 'py-3 text-base' : 'py-1.5 text-sm'
      }`}
    >
      {message.text}
      {status.hint && <span className="ml-2 font-mono text-[11px] font-normal opacity-80">DB {status.hint}</span>}
    </div>
  )
}
