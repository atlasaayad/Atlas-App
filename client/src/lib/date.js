// Client-side mirror of server/src/calc.js's todayInFactoryTZ — used only
// for date-input bounds/defaults (display), never for anything that
// actually decides what's "today" for saved data; the server is always the
// authority on that (it revalidates every date server-side too).
export function todayInFactoryTZ(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Casablanca',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)
  const y = parts.find((p) => p.type === 'year').value
  const m = parts.find((p) => p.type === 'month').value
  const d = parts.find((p) => p.type === 'day').value
  return `${y}-${m}-${d}`
}
