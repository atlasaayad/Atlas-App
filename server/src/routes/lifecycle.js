import { Router } from 'express'
import { get, run, logAudit } from '../db/index.js'
import { requireDept } from '../auth.js'
import { todayInFactoryTZ } from '../calc.js'
import { getOpenModelsForChain, getTargetProgress, closeModel, roleInChain } from '../openModels.js'

export const lifecycleRouter = Router()

// Closing a model (and answering the "target reached" prompt) is Agent
// Méthode's or the Patron's call only — the same two PIN tokens as ⚙️ Réglages.
const requireMethodeOrPatron = requireDept(['methode', 'patron'])

// Open models on a chain whose combined Sortie has reached their combined
// Qté totale and that nobody already answered "ماشي دابا" for today — each
// one becomes a "واش نسدوه؟" prompt on Agent Méthode's screen. Never closes
// anything by itself.
lifecycleRouter.get('/chains/:chainNumber/close-prompts', requireMethodeOrPatron, async (req, res) => {
  const today = todayInFactoryTZ()
  const open = await getOpenModelsForChain(Number(req.params.chainNumber))
  const prompts = []
  for (const m of open) {
    if (m.close_prompt_dismissed_on === today) continue
    const progress = await getTargetProgress(m)
    if (!progress.reached) continue
    prompts.push({
      id: m.id,
      client: m.client,
      dessin: m.dessin,
      role: roleInChain(open, m.id),
      totalSortie: progress.totalSortie,
      qteTotale: progress.qteTotale,
    })
  }
  res.json({ prompts })
})

// "Clôturer le modèle" — both the prompt's [تأكيد] and the always-available
// manual button (target reached or not: fabric shortage, reduced order...).
lifecycleRouter.post('/models/:id/close', requireMethodeOrPatron, async (req, res) => {
  const model = await get('SELECT * FROM models WHERE id = $1', [req.params.id])
  if (!model) return res.status(404).json({ error: 'not_found' })
  if (model.parent_model_id) return res.status(400).json({ error: 'not_a_root_model' })
  if (model.status === 'closed') return res.status(409).json({ error: 'already_closed' })

  const progress = await getTargetProgress(model)
  await closeModel(model)
  await logAudit({
    deptKey: req.dept,
    modelId: model.id,
    action: 'close_model',
    details: { totalSortie: progress.totalSortie, qteTotale: progress.qteTotale, targetReached: progress.reached },
  })
  const closed = await get('SELECT status, closed_at FROM models WHERE id = $1', [model.id])
  res.json({ ok: true, status: closed.status, closedAt: closed.closed_at })
})

// "ماشي دابا" — keep the model open (e.g. retouches still in progress); the
// prompt comes back tomorrow, at most once a day.
lifecycleRouter.post('/models/:id/close-prompt/dismiss', requireMethodeOrPatron, async (req, res) => {
  const model = await get('SELECT id FROM models WHERE id = $1', [req.params.id])
  if (!model) return res.status(404).json({ error: 'not_found' })
  const today = todayInFactoryTZ()
  await run('UPDATE models SET close_prompt_dismissed_on = $1 WHERE id = $2', [today, model.id])
  await logAudit({ deptKey: req.dept, modelId: model.id, action: 'dismiss_close_prompt', details: { date: today } })
  res.json({ ok: true })
})
