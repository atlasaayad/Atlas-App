import { Router } from 'express'
import { all, get, run, logAudit } from '../db/index.js'
import { requireDept } from '../auth.js'

export const patronRouter = Router()
patronRouter.use(requireDept('patron'))

function withProfit(model, finance) {
  const coutTotal = finance.cout_modele + finance.cout_ouvriers + finance.autres_depenses
  const revenu = finance.prix_vente_unitaire * (model.qte_totale || 0)
  const profit = revenu - coutTotal
  const profitPct = revenu > 0 ? Math.round((profit / revenu) * 1000) / 10 : 0
  return {
    coutModele: finance.cout_modele,
    coutOuvriers: finance.cout_ouvriers,
    autresDepenses: finance.autres_depenses,
    prixVenteUnitaire: finance.prix_vente_unitaire,
    coutTotal,
    revenu,
    profit,
    profitPct,
  }
}

patronRouter.get('/models', async (req, res) => {
  const models = await all('SELECT * FROM models ORDER BY active DESC, chain_number')
  const result = []
  for (const model of models) {
    const finance = (await get('SELECT * FROM patron_finance WHERE model_id = $1', [model.id])) || {
      cout_modele: 0,
      cout_ouvriers: 0,
      autres_depenses: 0,
      prix_vente_unitaire: 0,
    }
    result.push({
      id: model.id,
      client: model.client,
      dessin: model.dessin,
      chainNumber: model.chain_number,
      active: !!model.active,
      ...withProfit(model, finance),
    })
  }
  res.json(result)
})

patronRouter.put('/models/:id', async (req, res) => {
  const { id } = req.params
  const model = await get('SELECT * FROM models WHERE id = $1', [id])
  if (!model) return res.status(404).json({ error: 'not_found' })
  const coutModele = Math.max(0, Number(req.body?.coutModele) || 0)
  const coutOuvriers = Math.max(0, Number(req.body?.coutOuvriers) || 0)
  const autresDepenses = Math.max(0, Number(req.body?.autresDepenses) || 0)
  const prixVenteUnitaire = Math.max(0, Number(req.body?.prixVenteUnitaire) || 0)
  const now = new Date().toISOString()
  await run(
    `INSERT INTO patron_finance (model_id, cout_modele, cout_ouvriers, autres_depenses, prix_vente_unitaire, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (model_id) DO UPDATE SET cout_modele = excluded.cout_modele, cout_ouvriers = excluded.cout_ouvriers,
       autres_depenses = excluded.autres_depenses, prix_vente_unitaire = excluded.prix_vente_unitaire, updated_at = excluded.updated_at`,
    [id, coutModele, coutOuvriers, autresDepenses, prixVenteUnitaire, now]
  )
  await logAudit({ deptKey: 'patron', modelId: id, action: 'update_finance', details: { coutModele, coutOuvriers, autresDepenses, prixVenteUnitaire } })
  res.json(
    withProfit(model, {
      cout_modele: coutModele,
      cout_ouvriers: coutOuvriers,
      autres_depenses: autresDepenses,
      prix_vente_unitaire: prixVenteUnitaire,
    })
  )
})
