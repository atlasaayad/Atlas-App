import { Router } from 'express'
import ExcelJS from 'exceljs'
import { all, get, run, logAudit } from '../db/index.js'
import { requireDept } from '../auth.js'

export const patronRouter = Router()
patronRouter.use(requireDept('patron'))

// One sheet per table. `departments` intentionally excludes pin_hash and the
// lockout columns — those are operational/security state, not factory data,
// and have no reason to ever leave the server even in an export the Patron
// requested themselves.
const EXPORT_TABLES = [
  { sheet: 'Modeles', table: 'models', orderBy: 'chain_number' },
  { sheet: 'Gamme', table: 'gamme_lines', orderBy: 'model_id, seq_no' },
  { sheet: 'Effectif Requis', table: 'effectif_requis', orderBy: 'model_id, specialty' },
  { sheet: 'Production Horaire', table: 'hourly_production', orderBy: 'model_id, slot_index' },
  { sheet: 'Totaux Production', table: 'production_totals', orderBy: 'model_id' },
  { sheet: 'Presence RH', table: 'rh_attendance', orderBy: 'model_id, specialty' },
  { sheet: 'Qualite', table: 'quality', orderBy: 'model_id' },
  { sheet: 'Finale', table: 'finale', orderBy: 'model_id' },
  { sheet: 'Depot', table: 'depot', orderBy: 'model_id' },
  { sheet: 'Exports Logistics', table: 'logistics_exports', orderBy: 'model_id, date' },
  { sheet: 'Etat des Postes', table: 'poste_status', orderBy: 'model_id, dept_key' },
  { sheet: 'Finance Patron', table: 'patron_finance', orderBy: 'model_id' },
  { sheet: 'Departements', table: 'departments', columns: ['key', 'label', 'icon'] },
  { sheet: 'Journal des Modifications', table: 'audit_log', orderBy: 'created_at DESC', limit: 5000 },
]

patronRouter.get('/audit-log', async (req, res) => {
  const rows = await all(
    `SELECT a.id, a.dept_key, a.model_id, a.action, a.details, a.created_at, m.client, m.dessin
     FROM audit_log a
     LEFT JOIN models m ON m.id = a.model_id
     ORDER BY a.created_at DESC
     LIMIT 50`
  )
  res.json(
    rows.map((r) => ({
      id: r.id,
      deptKey: r.dept_key,
      action: r.action,
      details: r.details ? JSON.parse(r.details) : null,
      modelClient: r.client,
      modelDessin: r.dessin,
      createdAt: r.created_at,
    }))
  )
})

patronRouter.get('/export', async (req, res) => {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'ATLAS'
  workbook.created = new Date()

  for (const { sheet, table, columns, orderBy, limit } of EXPORT_TABLES) {
    const columnList = columns ? columns.join(', ') : '*'
    const orderClause = orderBy ? ` ORDER BY ${orderBy}` : ''
    const limitClause = limit ? ` LIMIT ${limit}` : ''
    const rows = await all(`SELECT ${columnList} FROM ${table}${orderClause}${limitClause}`)

    const ws = workbook.addWorksheet(sheet)
    if (rows.length === 0) continue

    const headers = Object.keys(rows[0])
    ws.columns = headers.map((h) => ({ header: h, key: h, width: Math.max(12, h.length + 2) }))
    for (const row of rows) {
      const flat = {}
      for (const h of headers) {
        const v = row[h]
        flat[h] = v && typeof v === 'object' ? JSON.stringify(v) : v
      }
      ws.addRow(flat)
    }
    ws.getRow(1).font = { bold: true }
  }

  const filename = `atlas-export-${new Date().toISOString().slice(0, 10)}.xlsx`
  await logAudit({ deptKey: 'patron', action: 'export_data', details: { filename } })

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
  await workbook.xlsx.write(res)
  res.end()
})

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
