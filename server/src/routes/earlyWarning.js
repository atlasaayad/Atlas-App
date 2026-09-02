import { Router } from 'express'
import { all } from '../db/index.js'
import { todayInFactoryTZ, detectDeclineTrend } from '../calc.js'

export const earlyWarningRouter = Router()

// Public, no auth — shown on the home dashboard the same way the rest of
// it is. Reads production_history (permanent, one row per chain/date/slot
// actually saved by Agent Production — the single source of truth for
// hourly data), so a correction made through the date picker is reflected
// here on the very next check, same as everywhere else.
earlyWarningRouter.get('/early-warnings', async (req, res) => {
  const today = todayInFactoryTZ()
  const activeModels = await all(
    'SELECT client, dessin, chain_number FROM models WHERE active = 1 ORDER BY chain_number'
  )

  // One query per active chain, all fired together — a sequential loop here
  // would mean the whole banner (and the Home page load that includes it)
  // gets slower every time a new chain becomes active.
  const rowsByModel = await Promise.all(
    activeModels.map((model) =>
      all(
        'SELECT slot_index, qty FROM production_history WHERE chain_number = $1 AND date = $2 ORDER BY slot_index ASC',
        [model.chain_number, today]
      )
    )
  )

  const warnings = []
  activeModels.forEach((model, i) => {
    const trend = detectDeclineTrend(rowsByModel[i].map((r) => ({ slotIndex: r.slot_index, qty: r.qty })))
    if (trend) {
      warnings.push({
        chainNumber: model.chain_number,
        client: model.client,
        dessin: model.dessin,
        ...trend,
      })
    }
  })

  res.json({ warnings })
})
