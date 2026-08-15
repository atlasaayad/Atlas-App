import { Router } from 'express'
import { get } from '../db/index.js'
import { requireDept } from '../auth.js'

export const devisRouter = Router()

// Only Méthode and Patron — this is tied to CPM, a sensitive financial
// figure, so no other department gets this route at all.
devisRouter.get('/devis/:modelId', requireDept(['methode', 'patron']), async (req, res) => {
  const model = await get('SELECT vt FROM models WHERE id = $1', [req.params.modelId])
  if (!model) return res.status(404).json({ error: 'not_found' })

  const cpmRow = await get('SELECT value FROM config WHERE key = $1', ['cpm'])
  if (!cpmRow?.value) {
    return res.json({ cmt: null })
  }

  const cpm = Number(cpmRow.value)
  const cmt = model.vt * cpm
  res.json({ cmt })
})
