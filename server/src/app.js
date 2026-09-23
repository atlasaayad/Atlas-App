import express from 'express'
import cors from 'cors'
import { ensureSchema } from './db/index.js'
import { publicRouter } from './routes/public.js'
import { askRouter } from './routes/ask.js'
import { predictRouter } from './routes/predict.js'
import { auditRouter } from './routes/audit.js'
import { devisRouter } from './routes/devis.js'
import { earlyWarningRouter } from './routes/earlyWarning.js'
import { methodeRouter } from './routes/methode.js'
import { productionRouter } from './routes/production.js'
import { rhRouter } from './routes/rh.js'
import { qualityRouter } from './routes/quality.js'
import { finaleRouter } from './routes/finale.js'
import { depotRouter } from './routes/depot.js'
import { logisticsRouter } from './routes/logistics.js'
import { posteRouter } from './routes/poste.js'
import { patronRouter } from './routes/patron.js'
import { settingsRouter } from './routes/settings.js'

export const app = express()
app.use(cors())
// 8mb, not the default 100kb — the model-image upload (PUT
// /methode/models/:id/image) sends the photo as a base64 data URI in the
// JSON body (~33% larger than the raw file; see imageUpload.js's own
// MAX_BYTES=6MB cap on the decoded image itself). Every other route's
// payload is tiny, so this costs nothing in the normal case.
app.use(express.json({ limit: '8mb' }))

// Cold start already calls runSeed() (which awaits this) once, at module
// load (see /api/index.js) — but if that single attempt fails (e.g. Neon's
// serverless compute being cold and timing out on the very first query
// right after a deploy), nothing else was ever calling ensureSchema()
// again, so every route needing a table it hadn't created yet would hang
// until the client's own timeout, forever, for the rest of that warm
// instance's life. This middleware makes every request retry it lazily
// instead: once resolved, awaiting the cached promise is a no-op (a
// microtask tick), so this costs nothing in the normal case; on a genuine
// DB outage it fails fast with a real error instead of a silent hang.
app.use(async (req, res, next) => {
  try {
    await ensureSchema()
    next()
  } catch (err) {
    console.error('ensureSchema failed:', err)
    res.status(503).json({ error: 'database_unavailable' })
  }
})

app.use('/api', publicRouter)
app.use('/api', askRouter)
app.use('/api', predictRouter)
app.use('/api', auditRouter)
app.use('/api', devisRouter)
app.use('/api', earlyWarningRouter)
app.use('/api/methode', methodeRouter)
app.use('/api/production', productionRouter)
app.use('/api/rh', rhRouter)
app.use('/api/quality', qualityRouter)
app.use('/api/finale', finaleRouter)
app.use('/api/depot', depotRouter)
app.use('/api/logistics', logisticsRouter)
app.use('/api/poste', posteRouter)
app.use('/api/patron', patronRouter)
app.use('/api', settingsRouter)

app.get('/api/health', (req, res) => res.json({ ok: true }))

app.use((err, req, res, next) => {
  console.error(err)
  res.status(500).json({ error: 'internal_error' })
})
