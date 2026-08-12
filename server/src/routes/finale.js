import { Router } from 'express'
import { run, logAudit } from '../db/index.js'
import { requireDept } from '../auth.js'

export const finaleRouter = Router()
finaleRouter.use(requireDept('finale'))

finaleRouter.put('/models/:id', async (req, res) => {
  const { id } = req.params
  const enCours = Math.max(0, Number(req.body?.enCours) || 0)
  const now = new Date().toISOString()
  await run(
    `INSERT INTO finale (model_id, en_cours, updated_at) VALUES ($1, $2, $3)
     ON CONFLICT (model_id) DO UPDATE SET en_cours = excluded.en_cours, updated_at = excluded.updated_at`,
    [id, enCours, now]
  )
  await logAudit({ deptKey: 'finale', modelId: id, action: 'update_finale', details: { enCours } })
  res.json({ ok: true })
})
