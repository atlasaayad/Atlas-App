import cors from 'cors'

// Which browser origins may call the API cross-origin. Both lists can be
// overridden per deployment without a code change:
//   CORS_ALLOWED_ORIGINS        comma-separated exact origins
//   CORS_PREVIEW_ORIGIN_PATTERN one regular expression for preview URLs
// The defaults are the production Atlas URL and this Vercel team's preview
// deployments of its two Atlas projects (atlas-app, atlas-app-kfr5), whose
// URLs look like
//   https://atlas-app-git-<branch>-atlasaayads-projects.vercel.app
//   https://atlas-app-kfr5-<hash>-atlasaayads-projects.vercel.app
// — deliberately NOT every *.vercel.app, which any Vercel user can deploy to.
const DEFAULT_ALLOWED_ORIGINS = ['https://atlas-app-smoky.vercel.app']
const DEFAULT_PREVIEW_ORIGIN_PATTERN = '^https://atlas-app(-kfr5)?-[a-z0-9-]+-atlasaayads-projects\\.vercel\\.app$'

function allowedOrigins() {
  const raw = process.env.CORS_ALLOWED_ORIGINS
  if (!raw) return DEFAULT_ALLOWED_ORIGINS
  return raw
    .split(',')
    .map((o) => o.trim().replace(/\/$/, ''))
    .filter(Boolean)
}

function previewPattern() {
  return new RegExp(process.env.CORS_PREVIEW_ORIGIN_PATTERN || DEFAULT_PREVIEW_ORIGIN_PATTERN)
}

// `host` is the request's own Host header: a page calling the API on the
// same domain it was served from is always allowed (browsers still send an
// Origin header on same-origin POST/PUT/DELETE), so every domain Vercel
// serves Atlas on keeps working even if it isn't listed above.
export function isOriginAllowed(origin, host) {
  if (!origin) return true // not a browser cross-origin request (curl, server-to-server, same-origin GET)
  let url
  try {
    url = new URL(origin)
  } catch {
    return false
  }
  if (host && url.host === host) return true
  if (allowedOrigins().includes(origin)) return true
  if (previewPattern().test(origin)) return true
  // Local development only (Vite on :5173 proxying to the API) — never on
  // Vercel, where a "localhost" origin can only be someone else's machine.
  if (!process.env.VERCEL && (url.hostname === 'localhost' || url.hostname === '127.0.0.1')) return true
  return false
}

// A disallowed origin is refused outright (403) rather than just served
// without CORS headers, so a cross-origin request from an unrelated site
// never reaches a route handler at all.
export function corsMiddleware() {
  const allowCors = cors({ origin: true })
  return (req, res, next) => {
    if (!isOriginAllowed(req.headers.origin, req.headers.host)) {
      return res.status(403).json({ error: 'origin_not_allowed' })
    }
    allowCors(req, res, next)
  }
}
