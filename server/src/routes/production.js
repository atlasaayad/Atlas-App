import { Router } from 'express'
import { nanoid } from 'nanoid'
import { get, all, run, logAudit } from '../db/index.js'
import { requireDept } from '../auth.js'
import { todayInFactoryTZ } from '../calc.js'
import { getWorkHours } from '../workHours.js'
import { getHourlyEntryTargets } from '../openModels.js'

export const productionRouter = Router()
productionRouter.use(requireDept('production'))

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

// A specific day's hourly slots (defaults to today) — lets Agent Production
// load a previous day's entries for review/correction, not just today's.
// Selectable entries for this chain: this model's own Couleur/Variante
// variants PLUS, since a chain overlap is real (see openModels.js), any
// OTHER root model still open on the same chain (and that root's own
// variants too) — the exact same `byModel`/one-input-per-entry mechanism
// generalized from "this model's colors" to "everything this chain is
// currently working on". Omitted entirely when there's only one entry, so
// a normal (single-model, no-color) chain's response is completely
// unchanged.
productionRouter.get('/models/:id/hourly', async (req, res) => {
  const model = await get('SELECT id, chain_number FROM models WHERE id = $1', [req.params.id])
  if (!model) return res.status(404).json({ error: 'not_found' })

  const date = String(req.query.date || todayInFactoryTZ())
  if (!DATE_RE.test(date)) return res.status(400).json({ error: 'invalid_date' })

  const [entries, workHours] = await Promise.all([getHourlyEntryTargets(model), getWorkHours()])
  const hasEntries = entries.length > 1

  // Restricted to exactly this chain's current entries (model_id = ANY(...))
  // — chain_number alone would also pick up a previous, now-finished/
  // unrelated model's leftover rows on the same chain (see the identical
  // fix in fullDashboard(), routes/public.js).
  const rows = await all(
    'SELECT slot_index, model_id, qty FROM production_history WHERE chain_number = $1 AND date = $2 AND model_id = ANY($3)',
    [model.chain_number, date, entries.map((e) => e.modelId)]
  )

  const hourlyMap = {}
  const byModelMap = {} // slot_index -> { model_id: qty }
  for (const r of rows) {
    hourlyMap[r.slot_index] = (hourlyMap[r.slot_index] || 0) + r.qty
    if (hasEntries) {
      byModelMap[r.slot_index] ??= {}
      byModelMap[r.slot_index][r.model_id] = r.qty
    }
  }

  const hourly = workHours.map((s) => {
    const base = { ...s, qty: hourlyMap[s.index] || 0 }
    if (!hasEntries) return base
    const present = byModelMap[s.index] || {}
    return {
      ...base,
      byModel: entries.map((e) => ({ modelId: e.modelId, label: e.label, qty: present[e.modelId] || 0 })),
    }
  })
  res.json({ date, hourly, variants: entries.slice(1).map((e) => ({ id: e.modelId, label: e.label })) })
})

// Every hourly entry — today's or a previous day's — is written straight to
// production_history, the single source of truth for hourly data (see the
// comment on that table). There is no separate "today" table to also keep
// in sync, so a corrected past day is immediately reflected everywhere that
// reads production data: the live dashboard (when the edited date is
// today), Historique, exports, and the early-warning agent.
productionRouter.put('/models/:id/hourly/:slotIndex', async (req, res) => {
  const { id, slotIndex } = req.params
  const qty = Number(req.body?.qty) || 0
  const idx = Number(slotIndex)

  const model = await get('SELECT chain_number, debut FROM models WHERE id = $1', [id])
  if (!model) return res.status(404).json({ error: 'not_found' })

  const workHours = await getWorkHours()
  if (idx < 0 || idx >= workHours.length) return res.status(400).json({ error: 'invalid_slot' })

  // An entry can target ANY other model sharing this chain — its own
  // Couleur/Variante variants, or (a chain overlap — see openModels.js) a
  // completely independent sibling root model that's also open on this
  // chain, or that sibling's own variants — not just its own family.
  // Defaults to the root itself, so a normal (single-model) chain's request
  // is completely unchanged. The target's OWN début is what's validated
  // below (not `:id`'s) — an overlapping model can genuinely start later
  // than whatever's already running on the same chain.
  const targetModelId = req.body?.targetModelId || id
  let targetModel = model
  if (targetModelId !== id) {
    targetModel = await get('SELECT debut FROM models WHERE id = $1 AND chain_number = $2', [targetModelId, model.chain_number])
    if (!targetModel) return res.status(400).json({ error: 'invalid_target_model' })
  }

  const today = todayInFactoryTZ()
  const date = String(req.body?.date || today)
  if (!DATE_RE.test(date)) return res.status(400).json({ error: 'invalid_date' })
  if (date > today) return res.status(400).json({ error: 'date_in_future' })
  if (targetModel.debut && date < targetModel.debut) return res.status(400).json({ error: 'date_before_debut' })

  const now = new Date().toISOString()
  // Backdated edits (any date other than today) get flagged explicitly in
  // the audit trail, distinct from ordinary same-day entry — an auditor
  // (BSCI/SMETA or otherwise) needs to see exactly where a retroactive
  // change was made, not just that "production was updated".
  const isBackdated = date !== today
  // The history write and the audit-log write are independent inserts (the
  // audit entry doesn't need the history row to exist first) — firing them
  // together instead of one after another halves this route's DB round
  // trips, which matters on every keystroke-triggered save from the factory
  // floor, often over a slow/cold connection.
  await Promise.all([
    run(
      `INSERT INTO production_history (id, model_id, chain_number, date, slot_index, qty, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $7)
       ON CONFLICT (chain_number, date, slot_index, model_id)
         DO UPDATE SET qty = excluded.qty, updated_at = excluded.updated_at`,
      [`ph_${nanoid(10)}`, targetModelId, model.chain_number, date, idx, qty, now]
    ),
    logAudit({
      deptKey: 'production',
      modelId: targetModelId,
      action: 'update_hourly',
      details: { slotIndex: idx, qty, date, isBackdated },
    }),
  ])
  res.json({ ok: true, date, isBackdated })
})

// Total sortie is never written here — it is auto-computed on read from
// production_history (a whole-life sum from Début to today, see
// fullDashboard() in routes/public.js — not the same scope as "Prod à
// maintenant", which stays today-only). Total entré is the only manual
// figure, and isn't reset per day either — the date picker above the hourly
// table doesn't apply to it.
productionRouter.put('/models/:id/totals', async (req, res) => {
  const { id } = req.params
  const totalEntree = Number(req.body?.totalEntree) || 0
  const now = new Date().toISOString()
  await Promise.all([
    run(
      `INSERT INTO production_totals (model_id, total_entree, updated_at) VALUES ($1, $2, $3)
       ON CONFLICT (model_id) DO UPDATE SET total_entree = excluded.total_entree, updated_at = excluded.updated_at`,
      [id, totalEntree, now]
    ),
    logAudit({ deptKey: 'production', modelId: id, action: 'update_totals', details: { totalEntree } }),
  ])
  res.json({ ok: true })
})
