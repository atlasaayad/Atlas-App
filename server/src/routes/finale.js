import { Router } from 'express'
import { db, logAudit } from '../db/index.js'
import { requireDept } from '../auth.js'

export const finaleRouter = Router()
finaleRouter.use(requireDept('finale'))

finaleRouter.put('/models/:id', (req, res) => {
  const { id } = req.params
  const enCours = Math.max(0, Number(req.body?.enCours) || 0)
  const now = new Date().toISOString()
  db.prepare(
    `INSERT INTO finale (model_id, en_cours, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(model_id) DO UPDATE SET en_cours = excluded.en_cours, updated_at = excluded.updated_at`
  ).run(id, enCours, now)
  logAudit({ deptKey: 'finale', modelId: id, action: 'update_finale', details: { enCours } })
  res.json({ ok: true })
})
