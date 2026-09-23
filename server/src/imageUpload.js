import { put, del } from '@vercel/blob'

// Model photos only — optional, uploaded by Agent Méthode from the
// Identité tab, shown as a thumbnail on Home's identity card (see
// routes/methode.js's PUT/DELETE /models/:id/image and public.js's
// `identity.imageUrl`). Kept generous but bounded: a factory-floor photo
// taken on a phone can easily be a few MB.
const MAX_BYTES = 6 * 1024 * 1024
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp'])
const EXT_BY_MIME = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }

function err(code) {
  return Object.assign(new Error(code), { code })
}

// `dataUri` is a full "data:<mime>;base64,<...>" string, as produced by the
// client's FileReader.readAsDataURL(). Decoded and re-uploaded to Vercel
// Blob rather than proxied as-is, so the stored object is always exactly
// what was declared (mime sniffed from the prefix, size checked against the
// DECODED byte length, not the longer base64 string).
export async function uploadModelImage(modelId, dataUri) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) throw err('storage_not_configured')

  const match = /^data:([^;]+);base64,(.+)$/.exec(String(dataUri || ''))
  if (!match) throw err('invalid_image')
  const [, mime, base64] = match
  if (!ALLOWED_MIME.has(mime)) throw err('unsupported_type')

  const buffer = Buffer.from(base64, 'base64')
  if (buffer.length === 0) throw err('invalid_image')
  if (buffer.length > MAX_BYTES) throw err('image_too_large')

  const blob = await put(`model-images/${modelId}-${Date.now()}.${EXT_BY_MIME[mime]}`, buffer, {
    access: 'public',
    contentType: mime,
  })
  return blob.url
}

// Best-effort — an already-deleted or unreachable blob must never block
// clearing the DB reference (the card degrades to "no image" either way).
export async function deleteModelImage(url) {
  if (!url || !process.env.BLOB_READ_WRITE_TOKEN) return
  try {
    await del(url)
  } catch {
    // ignore — see comment above
  }
}
