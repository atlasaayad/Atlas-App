import { Router } from 'express'
import { all, get } from '../db/index.js'
import { verifyPin, issueToken } from '../auth.js'
import { DEPARTMENTS, CHAIN_NUMBERS, HOURLY_SLOTS, SPECIALTIES, GENERIC_POSTE_DEPARTMENTS, WORK_HOURS_PER_DAY } from '../constants.js'
import {
  computeObjectifJour,
  prodAMaintenant,
  todayInFactoryTZ,
  computeQualityPct,
  computeRendementProduction,
  computeScoreRendement,
  daysBetweenInclusive,
} from '../calc.js'

export const publicRouter = Router()

publicRouter.get('/config', async (req, res) => {
  const row = await get('SELECT value FROM config WHERE key = $1', ['company_name'])
  res.json({ companyName: row?.value || 'Casual' })
})

publicRouter.get('/departments', (req, res) => {
  res.json(DEPARTMENTS)
})

publicRouter.post('/auth/:deptKey/login', async (req, res) => {
  const { deptKey } = req.params
  const { pin } = req.body || {}
  if (!pin) return res.status(400).json({ error: 'pin_required' })

  const result = await verifyPin(deptKey, pin)
  if (!result.ok) {
    if (result.reason === 'locked') {
      return res.status(423).json({ error: 'locked', retryAfterSeconds: result.retryAfterSeconds })
    }
    return res.status(401).json({ error: 'invalid_pin', attemptsRemaining: result.attemptsRemaining })
  }

  const token = issueToken(deptKey, result.dept.pin_hash)
  res.json({ token, dept: deptKey })
})

publicRouter.get('/models', async (req, res) => {
  const rows = await all(
    'SELECT id, client, dessin, chain_number, active FROM models WHERE active = 1 ORDER BY chain_number'
  )
  res.json(rows)
})

publicRouter.get('/chains', async (req, res) => {
  const active = await all('SELECT id, client, dessin, chain_number FROM models WHERE active = 1')
  const byChain = Object.fromEntries(active.map((m) => [m.chain_number, m]))

  // "Most recent real activity today" per chain, so the client can default
  // Home to whichever chain someone actually worked on today instead of a
  // fixed/arbitrary one. Pulls a generous 48h window (comfortably covering
  // any UTC/local skew) and filters to "today" in JS with todayInFactoryTZ
  // — the same helper every other date-boundary decision in this app uses
  // — rather than reproducing that logic in SQL against a UTC column.
  const since = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()
  const recentLogs = await all(
    `SELECT a.created_at, m.chain_number FROM audit_log a
     JOIN models m ON m.id = a.model_id
     WHERE a.created_at >= $1 AND m.active = 1 AND a.dept_key <> 'system'
     ORDER BY a.created_at DESC`,
    [since]
  )
  const today = todayInFactoryTZ()
  const lastActivityByChain = {}
  for (const row of recentLogs) {
    if (lastActivityByChain[row.chain_number]) continue // rows are DESC — first hit per chain is the most recent
    if (todayInFactoryTZ(new Date(row.created_at)) === today) {
      lastActivityByChain[row.chain_number] = row.created_at
    }
  }

  res.json(
    CHAIN_NUMBERS.map((n) => ({
      chainNumber: n,
      model: byChain[n] || null,
      lastActivityToday: lastActivityByChain[n] || null,
    }))
  )
})

publicRouter.get('/models/:id', async (req, res) => {
  const model = await get('SELECT * FROM models WHERE id = $1', [req.params.id])
  if (!model) return res.status(404).json({ error: 'not_found' })
  const gamme = await all('SELECT * FROM gamme_lines WHERE model_id = $1 ORDER BY seq_no', [model.id])
  const effectifRows = await all('SELECT * FROM effectif_requis WHERE model_id = $1', [model.id])
  const effectif = Object.fromEntries(SPECIALTIES.map((s) => [s, 0]))
  for (const r of effectifRows) effectif[r.specialty] = r.required
  res.json({ ...model, gamme, effectif })
})

export async function fullDashboard(model) {
  // All 9 lookups below are independent (keyed only by model.id) and none
  // depends on another's result, so they're fired together instead of
  // awaited one at a time — on a real network hop to Postgres (Neon), 9
  // sequential round trips vs. 1 parallel batch is the difference between a
  // dashboard load that visibly hangs and one that doesn't.
  const today = todayInFactoryTZ()
  const [
    effectifRows,
    hourlyRows,
    totalsRow,
    rhRows,
    qualityRow,
    finaleRow,
    depotRow,
    exportRows,
    postes,
    cumulativeRow,
    retoucheTodayRow,
    retoucheCumulativeRow,
    qualityHourlyRows,
  ] = await Promise.all([
      all('SELECT * FROM effectif_requis WHERE model_id = $1', [model.id]),
      // Today's hourly data comes from production_history — the single
      // source of truth for hourly production, today included (see the
      // comment on that table). A correction Agent Production makes to
      // today's hours, via the date picker or otherwise, lands here and is
      // reflected on this dashboard on the very next read.
      all('SELECT slot_index, qty FROM production_history WHERE chain_number = $1 AND date = $2', [
        model.chain_number,
        today,
      ]),
      get('SELECT * FROM production_totals WHERE model_id = $1', [model.id]),
      all('SELECT * FROM rh_attendance WHERE model_id = $1', [model.id]),
      get('SELECT * FROM quality WHERE model_id = $1', [model.id]),
      get('SELECT * FROM finale WHERE model_id = $1', [model.id]),
      get('SELECT * FROM depot WHERE model_id = $1', [model.id]),
      all('SELECT * FROM logistics_exports WHERE model_id = $1 ORDER BY date', [model.id]),
      all('SELECT * FROM poste_status WHERE model_id = $1', [model.id]),
      // "Total sortie" (below) is the chain's whole-life output for THIS
      // model, so it sums production_history across every day from the
      // model's Début through today — not just today. Bounding by Début
      // (rather than summing all of the chain's history unconditionally)
      // keeps a previous, unrelated model that used to run on this same
      // chain_number out of the current model's total.
      get('SELECT COALESCE(SUM(qty), 0) AS total FROM production_history WHERE chain_number = $1 AND date >= $2 AND date <= $3', [
        model.chain_number,
        model.debut || today,
        today,
      ]),
      // Qualité% (below) is computed from these two "Pièces retouche" sums
      // against the production sums above — today's and whole-life — never
      // stored anywhere itself (see computeQualityPct() in calc.js).
      get('SELECT COALESCE(SUM(piece_retouche), 0) AS total FROM quality_history WHERE chain_number = $1 AND date = $2', [
        model.chain_number,
        today,
      ]),
      get('SELECT COALESCE(SUM(piece_retouche), 0) AS total FROM quality_history WHERE chain_number = $1 AND date >= $2 AND date <= $3', [
        model.chain_number,
        model.debut || today,
        today,
      ]),
      // Per-slot (not summed) today's "Pièces retouche" — needed to compute
      // Qualité% for just the single most-recently-recorded hour, for the
      // "hourly" Rendement level below.
      all('SELECT slot_index, piece_retouche FROM quality_history WHERE chain_number = $1 AND date = $2', [
        model.chain_number,
        today,
      ]),
    ])

  const effectifRequis = Object.fromEntries(SPECIALTIES.map((s) => [s, 0]))
  for (const r of effectifRows) effectifRequis[r.specialty] = r.required

  const hourlyMap = Object.fromEntries(hourlyRows.map((r) => [r.slot_index, r.qty]))
  const hourly = HOURLY_SLOTS.map((s) => ({
    ...s,
    qty: hourlyMap[s.index] || 0,
    pct: model.dt > 0 ? Math.round(((hourlyMap[s.index] || 0) / model.dt) * 100) : 0,
  }))

  const totals = totalsRow || { total_entree: 0 }
  const demande = Math.round(computeObjectifJour(model.dt))
  const produit = prodAMaintenant(hourlyMap)
  const restant = Math.max(demande - produit, 0)
  // "Total sortie" (Bilan de la chaîne) is the model's whole-life output —
  // every hour ever recorded for this chain from Début to today, not just
  // today's — auto-computed, never a manual entry. This is deliberately a
  // different number from "produit"/"Prod à maintenant" above, which stay
  // today-only: those drive "Objectif atteint %" and the "Restant" (today's
  // target) field, and must keep doing so unchanged.
  const totalSortie = Number(cumulativeRow.total)
  // En cours = what's been fed into the chain so far minus what's come out
  // so far — both whole-life figures now, so this is what's still
  // mid-process on the line since Début.
  const enCours = totals.total_entree - totalSortie
  // Le reste (Bilan de la chaîne) = how much of the WHOLE order is still
  // left to produce, based on the corrected whole-life Total sortie above —
  // distinct from the daily "Restant" field (demande - produit) elsewhere
  // on Home, which stays about today's target.
  const leResteCommande = Math.max((model.qte_totale || 0) - totalSortie, 0)

  const present = Object.fromEntries(SPECIALTIES.map((s) => [s, 0]))
  for (const r of rhRows) present[r.specialty] = r.present
  const effectifs = SPECIALTIES.map((s) => ({ specialty: s, present: present[s] || 0, required: effectifRequis[s] || 0 }))
  const ouvriersPresents = effectifs.reduce((s, e) => s + e.present, 0)

  // No row yet means Quality hasn't reported "Reprises" for this model — null
  // (rendered as "not reported yet"), not a fake 0. Qualité% itself is never
  // stored (see computeQualityPct() below) so there's no "row missing" case
  // for it — the null-when-no-production case is handled by
  // computeQualityPct returning null on a zero denominator.
  const quality = qualityRow || { reprises: null }
  const pieceRetoucheToday = Number(retoucheTodayRow.total)
  const pieceRetoucheCumulative = Number(retoucheCumulativeRow.total)
  // Today's Qualité% pairs with "produit" (today-only production); the
  // cumulative one pairs with the whole-life "totalSortie" above — same
  // scoping split as Total sortie vs. Prod à maintenant.
  const qualityDailyPct = computeQualityPct(produit, pieceRetoucheToday)
  const qualityCumulativePct = computeQualityPct(totalSortie, pieceRetoucheCumulative)

  // Rendement = standard SAM-based line efficiency (computeRendementProduction)
  // averaged 50/50 with Qualité% into a single Score_Rendement, at 3 scopes:
  // one hour, today, and the model's whole life. SAM is "VT" from Agent
  // Méthode's gamme; "workers present" is today's live headcount
  // (rh_attendance, sum across specialties — Agent Méthode or RH, whichever
  // saved most recently) applied to every scope alike, since there's no
  // historical daily-headcount record to look up a past day's real count.
  const samMinutes = model.vt
  const qualityHourlyMap = Object.fromEntries(qualityHourlyRows.map((r) => [r.slot_index, r.piece_retouche]))
  const lastHourEntry = hourlyRows.reduce((max, r) => (!max || r.slot_index > max.slot_index ? r : max), null)
  const hourlyQty = lastHourEntry ? lastHourEntry.qty : null
  const hourlyQualityPct = lastHourEntry ? computeQualityPct(hourlyQty, qualityHourlyMap[lastHourEntry.slot_index] || 0) : null
  const hourlyRendementProdPct = lastHourEntry ? computeRendementProduction(hourlyQty, samMinutes, ouvriersPresents, 60) : null
  const hourlyScoreRendement = computeScoreRendement(hourlyRendementProdPct, hourlyQualityPct)

  const dailyRendementProdPct = computeRendementProduction(produit, samMinutes, ouvriersPresents, WORK_HOURS_PER_DAY * 60)
  const dailyScoreRendement = computeScoreRendement(dailyRendementProdPct, qualityDailyPct)

  const cumulativeDays = daysBetweenInclusive(model.debut || today, today)
  const cumulativeRendementProdPct = computeRendementProduction(
    totalSortie,
    samMinutes,
    ouvriersPresents,
    cumulativeDays * WORK_HOURS_PER_DAY * 60
  )
  const cumulativeScoreRendement = computeScoreRendement(cumulativeRendementProdPct, qualityCumulativePct)

  const finale = finaleRow || {
    en_cours: 0,
    piece_retouche: 0,
    piece_terminee: 0,
    piece_2eme: 0,
    encours_special: 0,
    encours_repassage: 0,
    encours_controle: 0,
    moyenne_prod_special: 0,
    moyenne_prod_repassage_final: 0,
    moyenne_prod_controle_final: 0,
  }
  const depot = depotRow || { total_pieces: 0 }
  const exports = exportRows.map((e) => ({ ...e, client: model.client, mod: model.dessin }))

  const posteMap = Object.fromEntries(postes.map((p) => [p.dept_key, p]))
  // No status row yet means that department has never reported anything for
  // this model — that must never be shown as a fake "100% good", so it gets
  // its own "unreported" state instead of a real percentage/status.
  const etatDesPostes = GENERIC_POSTE_DEPARTMENTS.map((key) => {
    const p = posteMap[key]
    if (!p) return { deptKey: key, percentage: null, note: '', status: 'unreported' }
    const pct = p.percentage
    const status = pct >= 90 ? 'good' : pct >= 70 ? 'warn' : 'bad'
    return { deptKey: key, percentage: pct, note: p.note || '', status }
  })

  const objectifAtteintPct = demande > 0 ? Math.round((produit / demande) * 100) : 0

  return {
    id: model.id,
    chainNumber: model.chain_number,
    identity: {
      client: model.client,
      qteTotale: model.qte_totale,
      debut: model.debut,
      finPrevue: model.fin_prevue,
      dessin: model.dessin,
      commande: model.commande,
    },
    dt: model.dt,
    vt: model.vt,
    nd: model.nd,
    hourly,
    prodAMaintenant: produit,
    ouvriers: { presents: ouvriersPresents, requis: model.nd },
    demande,
    produit,
    restant,
    bilan: {
      totalEntree: totals.total_entree,
      totalSortie,
      leReste: leResteCommande,
      enCours,
    },
    finaleEnCours: finale.en_cours,
    finaleDetails: {
      pieceRetouche: finale.piece_retouche,
      pieceTerminee: finale.piece_terminee,
      piece2eme: finale.piece_2eme,
      encoursSpecial: finale.encours_special,
      encoursRepassage: finale.encours_repassage,
      encoursControle: finale.encours_controle,
      moyenneProdSpecial: finale.moyenne_prod_special,
      moyenneProdRepassageFinal: finale.moyenne_prod_repassage_final,
      moyenneProdControleFinal: finale.moyenne_prod_controle_final,
    },
    depotTotal: depot.total_pieces,
    exports,
    objectifAtteintPct,
    quality: {
      percentage: qualityCumulativePct,
      dailyPercentage: qualityDailyPct,
      reprises: quality.reprises,
      pieceRetoucheToday,
      pieceRetoucheCumulative,
    },
    rendement: {
      hourly: { productionPct: hourlyRendementProdPct, qualityPct: hourlyQualityPct, score: hourlyScoreRendement, slotIndex: lastHourEntry?.slot_index ?? null },
      daily: { productionPct: dailyRendementProdPct, qualityPct: qualityDailyPct, score: dailyScoreRendement },
      cumulative: { productionPct: cumulativeRendementProdPct, qualityPct: qualityCumulativePct, score: cumulativeScoreRendement },
    },
    etatDesPostes,
    effectifs,
  }
}

publicRouter.get('/models/:id/dashboard', async (req, res) => {
  const model = await get('SELECT * FROM models WHERE id = $1', [req.params.id])
  if (!model) return res.status(404).json({ error: 'not_found' })
  res.json(await fullDashboard(model))
})

publicRouter.get('/chains/:chainNumber/dashboard', async (req, res) => {
  const model = await get('SELECT * FROM models WHERE chain_number = $1 AND active = 1', [Number(req.params.chainNumber)])
  if (!model) return res.status(404).json({ error: 'no_active_model' })
  res.json(await fullDashboard(model))
})

// Historique — everything computed live from production_history, nothing
// assumed or hardcoded. recordsCount is the number of hourly records
// actually stored for the window (not an assumed 9/day), so the average is
// always total ÷ real records logged. total/average are null (not 0) when
// there's no data at all for the window, so the client can show "no data"
// instead of a fake zero.
async function historyAggregate(chainNumber, fromDate, toDate) {
  const row = await get(
    `SELECT COALESCE(SUM(qty), 0) AS total, COUNT(*) AS records
     FROM production_history WHERE chain_number = $1 AND date >= $2 AND date <= $3`,
    [chainNumber, fromDate, toDate]
  )
  const records = Number(row.records)
  const total = Number(row.total)
  return {
    from: fromDate,
    to: toDate,
    total: records > 0 ? total : null,
    recordsCount: records,
    average: records > 0 ? total / records : null,
  }
}

publicRouter.get('/chains/:chainNumber/history/day', async (req, res) => {
  const { date } = req.query
  if (!date) return res.status(400).json({ error: 'date_required' })
  const result = await historyAggregate(Number(req.params.chainNumber), date, date)
  res.json({ date, total: result.total, recordsCount: result.recordsCount })
})

publicRouter.get('/chains/:chainNumber/history/range', async (req, res) => {
  const { from, to } = req.query
  if (!from || !to) return res.status(400).json({ error: 'from_and_to_required' })
  res.json(await historyAggregate(Number(req.params.chainNumber), from, to))
})

publicRouter.get('/chains/:chainNumber/history/months', async (req, res) => {
  const fromYear = Number(req.query.fromYear)
  const fromMonth = Number(req.query.fromMonth)
  const toYear = Number(req.query.toYear)
  const toMonth = Number(req.query.toMonth)
  if (!fromYear || !fromMonth || !toYear || !toMonth) {
    return res.status(400).json({ error: 'from_and_to_year_month_required' })
  }
  const fromDate = `${fromYear}-${String(fromMonth).padStart(2, '0')}-01`
  const lastDay = new Date(Date.UTC(toYear, toMonth, 0)).getUTCDate()
  const toDate = `${toYear}-${String(toMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
  res.json(await historyAggregate(Number(req.params.chainNumber), fromDate, toDate))
})
