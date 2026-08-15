import { Router } from 'express'
import { run, logAudit } from '../db/index.js'
import { requireDept } from '../auth.js'

export const finaleRouter = Router()
finaleRouter.use(requireDept('finale'))

const DETAIL_FIELDS = [
  'pieceRetouche',
  'pieceTerminee',
  'piece2eme',
  'encoursSpecial',
  'encoursRepassage',
  'encoursControle',
  'moyenneProdSpecial',
  'moyenneProdRepassageFinal',
  'moyenneProdControleFinal',
]

finaleRouter.put('/models/:id', async (req, res) => {
  const { id } = req.params
  const enCours = Math.max(0, Number(req.body?.enCours) || 0)
  const details = Object.fromEntries(DETAIL_FIELDS.map((f) => [f, Math.max(0, Number(req.body?.[f]) || 0)]))
  const now = new Date().toISOString()
  await run(
    `INSERT INTO finale (
       model_id, en_cours, piece_retouche, piece_terminee, piece_2eme,
       encours_special, encours_repassage, encours_controle,
       moyenne_prod_special, moyenne_prod_repassage_final, moyenne_prod_controle_final,
       updated_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     ON CONFLICT (model_id) DO UPDATE SET
       en_cours = excluded.en_cours,
       piece_retouche = excluded.piece_retouche,
       piece_terminee = excluded.piece_terminee,
       piece_2eme = excluded.piece_2eme,
       encours_special = excluded.encours_special,
       encours_repassage = excluded.encours_repassage,
       encours_controle = excluded.encours_controle,
       moyenne_prod_special = excluded.moyenne_prod_special,
       moyenne_prod_repassage_final = excluded.moyenne_prod_repassage_final,
       moyenne_prod_controle_final = excluded.moyenne_prod_controle_final,
       updated_at = excluded.updated_at`,
    [
      id,
      enCours,
      details.pieceRetouche,
      details.pieceTerminee,
      details.piece2eme,
      details.encoursSpecial,
      details.encoursRepassage,
      details.encoursControle,
      details.moyenneProdSpecial,
      details.moyenneProdRepassageFinal,
      details.moyenneProdControleFinal,
      now,
    ]
  )
  await logAudit({ deptKey: 'finale', modelId: id, action: 'update_finale', details: { enCours, ...details } })
  res.json({ ok: true })
})
