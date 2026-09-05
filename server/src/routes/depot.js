import { Router } from 'express'
import { run, logAudit } from '../db/index.js'
import { requireDept } from '../auth.js'

export const depotRouter = Router()
depotRouter.use(requireDept('depot'))

depotRouter.put('/models/:id', async (req, res) => {
  const { id } = req.params
  const totalPieces = Math.max(0, Number(req.body?.totalPieces) || 0)
  // effectifTotal — headcount present at this chain's Dépôt, a single number
  // (no specialty breakdown), feeding the "État des effectifs" overview
  // page's Dépôt total (summed across every chain's Dépôt entry there).
  const effectifTotal = Math.max(0, Number(req.body?.effectifTotal) || 0)
  const now = new Date().toISOString()
  await run(
    `INSERT INTO depot (model_id, total_pieces, effectif_total, updated_at) VALUES ($1, $2, $3, $4)
     ON CONFLICT (model_id) DO UPDATE SET
       total_pieces = excluded.total_pieces, effectif_total = excluded.effectif_total, updated_at = excluded.updated_at`,
    [id, totalPieces, effectifTotal, now]
  )
  await logAudit({ deptKey: 'depot', modelId: id, action: 'update_depot', details: { totalPieces, effectifTotal } })
  res.json({ ok: true })
})
