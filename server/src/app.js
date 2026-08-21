import express from 'express'
import cors from 'cors'
import { publicRouter } from './routes/public.js'
import { askRouter } from './routes/ask.js'
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

export const app = express()
app.use(cors())
app.use(express.json())

app.use('/api', publicRouter)
app.use('/api', askRouter)
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

app.get('/api/health', (req, res) => res.json({ ok: true }))

app.use((err, req, res, next) => {
  console.error(err)
  res.status(500).json({ error: 'internal_error' })
})
