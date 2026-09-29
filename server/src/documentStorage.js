import { issueSignedToken, presignUrl, head, del, BlobNotFoundError } from '@vercel/blob'
import { handleUploadPresigned } from '@vercel/blob/client'

// Fiche Modèle — customer technical documents (confidential), stored in the
// PRIVATE atlas-documents Blob store. Completely separate from the public
// atlas-images store used for model photos (imageUpload.js /
// BLOB_READ_WRITE_TOKEN), which this module never touches.
//
// Nothing here ever hands a credential to the browser. The browser only
// ever receives, per operation:
//   - upload: a presigned PUT payload scoped to ONE server-generated
//     pathname, one content type, the exact declared size, valid 5 minutes
//     (via @vercel/blob/client's uploadPresigned handshake — the file goes
//     straight from the browser to Blob, never through this function, so
//     Vercel's ~4.5 MB function body limit doesn't apply);
//   - read: a presigned GET URL for ONE blob, valid 2 minutes.
// DOCS_BLOB_READ_WRITE_TOKEN only ever signs those, server-side.

export const DOCUMENT_MAX_BYTES = 10 * 1024 * 1024
export const DOCUMENT_EXTENSIONS = {
  'application/pdf': ['pdf'],
  'image/jpeg': ['jpg', 'jpeg'],
  'image/png': ['png'],
}
export const UPLOAD_WINDOW_MS = 5 * 60 * 1000
export const READ_URL_TTL_MS = 2 * 60 * 1000

export function isDocumentStorageConfigured() {
  return Boolean(process.env.DOCS_BLOB_READ_WRITE_TOKEN)
}

function blobToken() {
  return process.env.DOCS_BLOB_READ_WRITE_TOKEN
}

const vercelBlobStorage = {
  // Answers @vercel/blob/client's uploadPresigned() handshake
  // ('blob.generate-presigned-url'). The caller (routes/fiche.js) has
  // already checked the upload ticket and that `pathname` is the one it
  // generated. No completion webhook is used: the upload is confirmed by an
  // authenticated Atlas call instead (confirm route), so the webhook key
  // below is only there because the SDK requires one to be present.
  async presignUpload({ body, request, pathname, contentType, sizeBytes, validUntil }) {
    return handleUploadPresigned({
      body,
      request,
      webhookPublicKey: process.env.DOCS_BLOB_WEBHOOK_PUBLIC_KEY || 'unused-no-completion-webhook',
      getSignedToken: async () => ({
        token: await issueSignedToken({
          token: blobToken(),
          pathname,
          operations: ['put'],
          validUntil,
          allowedContentTypes: [contentType],
          maximumSizeInBytes: sizeBytes,
        }),
      }),
    })
  },

  // What actually landed in the store at `pathname` — null when nothing did.
  async stat(pathname) {
    try {
      const blob = await head(pathname, { token: blobToken() })
      return { size: blob.size, contentType: blob.contentType }
    } catch (err) {
      if (err instanceof BlobNotFoundError) return null
      throw err
    }
  },

  async remove(pathname) {
    await del(pathname, { token: blobToken() })
  },

  async signedReadUrl(pathname, validUntil) {
    const signed = await issueSignedToken({ token: blobToken(), pathname, operations: ['get'], validUntil })
    const { presignedUrl } = await presignUrl(signed, { operation: 'get', pathname, access: 'private', validUntil })
    return presignedUrl
  },
}

let storage = vercelBlobStorage

export function documentStorage() {
  return storage
}

// Tests only: there is no real Blob store in the test environment.
export function setDocumentStorageForTests(fake) {
  storage = fake || vercelBlobStorage
}
