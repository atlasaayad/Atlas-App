import { Router } from 'express'
import { all, get } from '../db/index.js'
import { verifyPin, issueToken } from '../auth.js'
import { DEPARTMENTS, CHAIN_NUMBERS, GENERIC_POSTE_DEPARTMENTS } from '../constants.js'
import { getPersonnelAdmin } from '../attendanceShared.js'
import { getOpenModelsForChain, getAllOpenModels } from '../openModels.js'
import { getPlanVsReel } from '../planning.js'
import { getSpecialties } from '../specialties.js'
import { getWorkHours } from '../workHours.js'
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
    'SELECT id, client, dessin, chain_number, active FROM models WHERE active = 1 AND parent_model_id IS NULL ORDER BY chain_number'
  )
  res.json(rows)
})

publicRouter.get('/chains', async (req, res) => {
  // Chain overlap: a chain can have more than one open root model at once
  // (see openModels.js) — `models` carries every one of them (oldest
  // first), `model` stays the first/primary one alone so every existing
  // caller that only ever reads `.model` (chain pickers, ChainPicker.jsx,
  // etc.) keeps working unchanged for the common single-model case.
  const openModels = await getAllOpenModels()
  const byChain = {}
  for (const m of openModels) (byChain[m.chain_number] ??= []).push(m)

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
    CHAIN_NUMBERS.map((n) => {
      const models = byChain[n] || []
      return {
        chainNumber: n,
        model: models[0] || null,
        models,
        lastActivityToday: lastActivityByChain[n] || null,
      }
    })
  )
})

publicRouter.get('/models/:id', async (req, res) => {
  const model = await get('SELECT * FROM models WHERE id = $1', [req.params.id])
  if (!model) return res.status(404).json({ error: 'not_found' })
  const [gamme, effectifRows, launchTimerRow, chainSpecialties] = await Promise.all([
    all('SELECT * FROM gamme_lines WHERE model_id = $1 ORDER BY seq_no', [model.id]),
    all('SELECT * FROM effectif_requis WHERE model_id = $1', [model.id]),
    get('SELECT * FROM launch_timer WHERE model_id = $1', [model.id]),
    getSpecialties('chain'),
  ])
  const effectif = Object.fromEntries(chainSpecialties.map((s) => [s, 0]))
  // Only overlays a specialty still in the CURRENT list — effectif_requis
  // can carry an orphaned row for a specialty deleted since (deleting only
  // removes it from specialty_defs, on purpose — see specialties.js), and
  // that must never leak back into a live entry screen.
  for (const r of effectifRows) if (r.specialty in effectif) effectif[r.specialty] = r.required
  res.json({ ...model, gamme, effectif, launchTimer: formatLaunchTimer(launchTimerRow) })
})

// Raw config + timestamps only — the ticking countdown/overrun display is
// derived from these client-side (every second) using the same
// computeLaunchTimerState() formula, not recomputed by the server on a
// polling cadence that would make the seconds jump.
function formatLaunchTimer(row) {
  if (!row) return null
  return {
    objectifHeures: row.objectif_heures,
    groupeLancement: row.groupe_lancement,
    agentMethode: row.agent_methode,
    mecanicien: row.mecanicien,
    electriciens: row.electriciens,
    agentQuality: row.agent_quality,
    chefChaine: row.chef_chaine,
    startedAt: row.started_at,
    stoppedAt: row.stopped_at,
    responsible: row.responsible,
    reasonCode: row.reason_code,
    reasonComment: row.reason_comment,
  }
}

// One color's own numbers — its own hourly (today), its own whole-life
// totalSortie, its own totalEntree, and its own remaining-vs-target. Used
// for every entry in fullDashboard()'s `colors` array (the root itself
// included) — never combined with any other color, unlike every other
// figure in fullDashboard(), which is the chain-wide combined total across
// all colors.
//
// totalSortie sums EVERY recorded row for this exact model_id, capped at
// `date <= today` (excludes a future/mistaken entry) — deliberately NOT
// bounded below by Début: Début is an optional field on the model (it can
// be left blank), and bounding by `debut || today` used to silently
// collapse this "whole-life" sum down to "today only" whenever it was
// blank, hiding any real production already recorded — model_id already
// does the actual isolation (see the "models" table comment), so a lower
// date bound was never required for correctness, only redundant.
async function computeColorBreakdown(colorModel, today, dt, workHours) {
  const [hourlyRows, cumulativeRow, totalsRow] = await Promise.all([
    all('SELECT slot_index, qty FROM production_history WHERE model_id = $1 AND date = $2', [colorModel.id, today]),
    get('SELECT COALESCE(SUM(qty), 0) AS total FROM production_history WHERE model_id = $1 AND date <= $2', [
      colorModel.id,
      today,
    ]),
    get('SELECT total_entree FROM production_totals WHERE model_id = $1', [colorModel.id]),
  ])
  const hourlyMap = Object.fromEntries(hourlyRows.map((r) => [r.slot_index, r.qty]))
  // pct mirrors the combined hourly's own calculation (qty ÷ the shared
  // DT), so this color's bar reads as its own contribution toward the
  // hour's shared target — the same HourlyBarChart component renders
  // either array unmodified.
  const hourly = workHours.map((s) => {
    const qty = hourlyMap[s.index] || 0
    return { ...s, qty, pct: dt > 0 ? Math.round((qty / dt) * 100) : 0 }
  })
  const totalSortie = Number(cumulativeRow.total)
  return {
    id: colorModel.id,
    label: colorModel.variant_label || null,
    qteTotale: colorModel.qte_totale || 0,
    totalEntree: totalsRow?.total_entree || 0,
    totalSortie,
    leReste: Math.max((colorModel.qte_totale || 0) - totalSortie, 0),
    hourly,
  }
}

export async function fullDashboard(model) {
  const today = todayInFactoryTZ()

  // Couleur/Variante — a root model (parent_model_id IS NULL) may have one
  // or more active variants sharing its chain_number, each with its own
  // qte_totale/production_totals/production_history entries (see the
  // "models" table comment in db/index.js). A variant itself never has
  // variants, so this is empty when `model` is itself a variant.
  const variantRows = model.parent_model_id
    ? []
    : await all('SELECT * FROM models WHERE parent_model_id = $1 AND active = 1 ORDER BY created_at', [model.id])
  const colorModels = [model, ...variantRows]
  const colorModelIds = colorModels.map((m) => m.id)
  const workHours = await getWorkHours()

  // All lookups below are independent (keyed only by model.id/chain_number)
  // and none depends on another's result, so they're fired together instead
  // of awaited one at a time — on a real network hop to Postgres (Neon),
  // sequential round trips vs. one parallel batch is the difference between
  // a dashboard load that visibly hangs and one that doesn't.
  const [
    effectifRows,
    hourlyRows,
    totalsRows,
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
    launchTimerRow,
    finaleAttendanceRows,
    colorData,
    planning,
    chainSpecialties,
    finaleSpecialtiesList,
    earliestActivityRow,
  ] = await Promise.all([
      all('SELECT * FROM effectif_requis WHERE model_id = $1', [model.id]),
      // Today's hourly data comes from production_history — the single
      // source of truth for hourly production, today included (see the
      // comment on that table). Restricted to this model's own colour
      // family (model_id = ANY(colorModelIds): the root plus its active
      // Couleur/Variante variants) — chain_number alone isn't enough to
      // identify "this model's own production", since a chain can be
      // reassigned to a brand-new model at any time and the old (now
      // inactive) model's rows stay in this same table forever, sharing the
      // same chain_number. Once a Couleur/Variante chain has more than one
      // color logging the same hour, this naturally returns one row per
      // color — summed below into the chain's combined total, exactly as
      // before when there was only ever one row per hour.
      all('SELECT slot_index, qty FROM production_history WHERE chain_number = $1 AND date = $2 AND model_id = ANY($3)', [
        model.chain_number,
        today,
        colorModelIds,
      ]),
      // "Total entré" (Bilan de la chaîne) is the combined figure across
      // every color sharing this chain — a plain SUM across 1 row when there
      // are no variants, so this is unchanged in the common case.
      all('SELECT total_entree FROM production_totals WHERE model_id = ANY($1)', [colorModelIds]),
      all('SELECT * FROM rh_attendance WHERE model_id = $1', [model.id]),
      get('SELECT * FROM quality WHERE model_id = $1', [model.id]),
      get('SELECT * FROM finale WHERE model_id = $1', [model.id]),
      get('SELECT * FROM depot WHERE model_id = $1', [model.id]),
      all('SELECT * FROM logistics_exports WHERE model_id = $1 ORDER BY date', [model.id]),
      all('SELECT * FROM poste_status WHERE model_id = $1', [model.id]),
      // "Total sortie" (below) is the chain's whole-life output — combined
      // across every color — so it sums EVERY production_history row ever
      // recorded for this model family, capped at `date <= today` (excludes
      // a future/mistaken entry). Deliberately NOT bounded below by Début:
      // Début is optional on the model (can be left blank), and a
      // `date >= model.debut || today` lower bound used to silently
      // collapse this whole-life sum down to "today only" whenever it was
      // blank — showing "Total sortie = 0" even with real production
      // already recorded. model_id = ANY(colorModelIds) already does the
      // actual isolation from a previous, unrelated model on the same
      // chain_number (see the "models" table comment in db/index.js) — a
      // lower date bound was never required for correctness, only
      // redundant and, when Début was blank, actively harmful.
      get('SELECT COALESCE(SUM(qty), 0) AS total FROM production_history WHERE chain_number = $1 AND date <= $2 AND model_id = ANY($3)', [
        model.chain_number,
        today,
        colorModelIds,
      ]),
      // Qualité% (below) is computed from these two "Pièces retouche" sums
      // against the production sums above — today's and whole-life — never
      // stored anywhere itself (see computeQualityPct() in calc.js). Quality
      // reports retouche per chain/hour, never per color (quality_history
      // has no per-color dimension — see the Couleur/Variante README note),
      // but still needs the same model_id scoping as production above to
      // stay out of a previous, unrelated model's retouche counts.
      get('SELECT COALESCE(SUM(piece_retouche), 0) AS total FROM quality_history WHERE chain_number = $1 AND date = $2 AND model_id = ANY($3)', [
        model.chain_number,
        today,
        colorModelIds,
      ]),
      // Same "sum everything, no Début lower bound" fix as Total sortie
      // above — this pairs with totalSortie in computeQualityPct(), so it
      // must cover the exact same whole-life window or the cumulative
      // Qualité% would be computed against mismatched numerators/
      // denominators.
      get('SELECT COALESCE(SUM(piece_retouche), 0) AS total FROM quality_history WHERE chain_number = $1 AND date <= $2 AND model_id = ANY($3)', [
        model.chain_number,
        today,
        colorModelIds,
      ]),
      // Per-slot (not summed) today's "Pièces retouche" — needed to compute
      // Qualité% for just the single most-recently-recorded hour, for the
      // "hourly" Rendement level below.
      all('SELECT slot_index, piece_retouche FROM quality_history WHERE chain_number = $1 AND date = $2 AND model_id = ANY($3)', [
        model.chain_number,
        today,
        colorModelIds,
      ]),
      get('SELECT * FROM launch_timer WHERE model_id = $1', [model.id]),
      all('SELECT specialty, present FROM finale_attendance WHERE model_id = $1', [model.id]),
      // Per-color breakdown (own hourly/totals, never combined with any
      // other color) — root is always colorData[0], so "no variants" means
      // this is a single-element array and the client can treat it as
      // optional. See computeColorBreakdown() below.
      Promise.all(colorModels.map((m) => computeColorBreakdown(m, today, model.dt, workHours))),
      // Planning — Plan vs Réel, always scoped to the ROOT model alone
      // (never per-color): a plan is entered once for the whole launch,
      // same ownership as VT/DT/gamme, not a per-variant thing. Returns
      // `{hasPlan:false}` when Agent Méthode never entered one, so a normal
      // model's dashboard carries no extra weight for this.
      getPlanVsReel(model),
      getSpecialties('chain'),
      getSpecialties('finale'),
      // Fallback for cumulativeDays below when Début is blank — the
      // earliest date this model family has ANY real recorded activity,
      // so the Rendement cumulative% denominator still reflects reality
      // instead of collapsing to "1 day" (today only).
      get('SELECT MIN(date) AS min_date FROM production_history WHERE model_id = ANY($1)', [colorModelIds]),
    ])

  const effectifRequis = Object.fromEntries(chainSpecialties.map((s) => [s, 0]))
  // Same guard as GET /models/:id — never let an orphaned row for a
  // deleted specialty leak back into the live dashboard.
  for (const r of effectifRows) if (r.specialty in effectifRequis) effectifRequis[r.specialty] = r.required

  // Summed (not overwritten) per slot — with a Couleur/Variante chain, two
  // or more rows can now share the same slot_index (one per color); this is
  // what turns "5 pieces of color 800 + 10 of color 681 at hour 5" into a
  // correct combined 15 for the chain's own hourly bar/Objectif/Rendement,
  // without changing any of the calculations themselves.
  const hourlyMap = {}
  for (const r of hourlyRows) hourlyMap[r.slot_index] = (hourlyMap[r.slot_index] || 0) + r.qty
  const hourly = workHours.map((s) => ({
    ...s,
    qty: hourlyMap[s.index] || 0,
    pct: model.dt > 0 ? Math.round(((hourlyMap[s.index] || 0) / model.dt) * 100) : 0,
  }))

  const totalEntreeCombined = totalsRows.reduce((sum, r) => sum + (r.total_entree || 0), 0)
  const demande = Math.round(computeObjectifJour(model.dt, workHours.length))
  const produit = prodAMaintenant(hourlyMap, workHours)
  const restant = Math.max(demande - produit, 0)
  // "Total sortie" (Bilan de la chaîne) is the model's whole-life output —
  // every hour ever recorded for this chain from Début to today, not just
  // today's — auto-computed, never a manual entry. This is deliberately a
  // different number from "produit"/"Prod à maintenant" above, which stay
  // today-only: those drive "Objectif atteint %" and the "Restant" (today's
  // target) field, and must keep doing so unchanged.
  const totalSortie = Number(cumulativeRow.total)
  // En cours = what's been fed into the chain so far minus what's come out
  // so far — both whole-life, combined-across-colors figures now, so this
  // is what's still mid-process on the line since Début.
  const enCours = totalEntreeCombined - totalSortie
  // Le reste (Bilan de la chaîne) = how much of the WHOLE order (this
  // model's own Qté totale plus every variant's own — each variant's qty is
  // a portion of the same overall order, not on top of it) is still left to
  // produce, based on the combined whole-life Total sortie above — distinct
  // from the daily "Restant" field (demande - produit) elsewhere on Home,
  // which stays about today's target.
  const qteTotaleCombined = (model.qte_totale || 0) + variantRows.reduce((s, v) => s + (v.qte_totale || 0), 0)
  const leResteCommande = Math.max(qteTotaleCombined - totalSortie, 0)

  const present = Object.fromEntries(chainSpecialties.map((s) => [s, 0]))
  for (const r of rhRows) if (r.specialty in present) present[r.specialty] = r.present
  const effectifs = chainSpecialties.map((s) => ({ specialty: s, present: present[s] || 0, required: effectifRequis[s] || 0 }))
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

  const dailyRendementProdPct = computeRendementProduction(produit, samMinutes, ouvriersPresents, workHours.length * 60)
  const dailyScoreRendement = computeScoreRendement(dailyRendementProdPct, qualityDailyPct)

  const cumulativeDays = daysBetweenInclusive(model.debut || earliestActivityRow?.min_date || today, today)
  const cumulativeRendementProdPct = computeRendementProduction(
    totalSortie,
    samMinutes,
    ouvriersPresents,
    cumulativeDays * workHours.length * 60
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
  const depot = depotRow || { total_pieces: 0, effectif_total: 0 }
  const finaleAttendanceMap = Object.fromEntries(finaleSpecialtiesList.map((s) => [s, 0]))
  for (const r of finaleAttendanceRows) if (r.specialty in finaleAttendanceMap) finaleAttendanceMap[r.specialty] = r.present
  const finaleAttendance = finaleSpecialtiesList.map((s) => ({ specialty: s, present: finaleAttendanceMap[s] || 0 }))
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
      imageUrl: model.image_url || null,
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
      totalEntree: totalEntreeCombined,
      totalSortie,
      leReste: leResteCommande,
      enCours,
    },
    // Couleur/Variante — colors[0] is always the model itself (root), each
    // with its OWN qty/totals (never combined with the others), for Home's
    // optional "view a single color" toggle. A model with no active
    // variants gets a single-element array here — the client only needs to
    // check colors.length > 1 to decide whether to show anything extra at
    // all, so a normal model's Home experience is unaffected.
    qteTotaleCombined,
    colors: colorData,
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
    depotEffectif: depot.effectif_total,
    finaleAttendance,
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
    launchTimer: formatLaunchTimer(launchTimerRow),
    planning,
  }
}

publicRouter.get('/models/:id/dashboard', async (req, res) => {
  const model = await get('SELECT * FROM models WHERE id = $1', [req.params.id])
  if (!model) return res.status(404).json({ error: 'not_found' })
  res.json(await fullDashboard(model))
})

// Chain overlap: when exactly one root model is open on this chain, the
// response is IDENTICAL to before (a single fullDashboard() object) — every
// existing caller (Home, Ask Atlas, Classement) keeps working unchanged.
// Only when two (or more) roots are genuinely open at once — see
// openModels.js — does the shape change, to `{ multi: true, dashboards:
// [...] }`, one COMPLETE, independent fullDashboard() per open model, never
// merged into one misleading combined number (they don't share a gamme, so
// there's no meaningful "combined VT/DT/Rendement" the way Couleur/Variante
// colors have). Home.jsx is the one caller that understands `multi`.
publicRouter.get('/chains/:chainNumber/dashboard', async (req, res) => {
  const openModels = await getOpenModelsForChain(Number(req.params.chainNumber))
  if (openModels.length === 0) return res.status(404).json({ error: 'no_active_model' })
  if (openModels.length === 1) return res.json(await fullDashboard(openModels[0]))
  const dashboards = await Promise.all(openModels.map(fullDashboard))
  res.json({ multi: true, dashboards })
})

// 🏆 Classement des chaînes — every chain (1-8), ranked by today's
// Score_Rendement. Reuses fullDashboard() per chain (run in parallel) so
// this is always computed live from the same real-time figures shown on
// each chain's own dashboard — no separate cached leaderboard state.
publicRouter.get('/chains/ranking', async (req, res) => {
  // Chain overlap: ranked by the chain's primary (oldest) open model only —
  // same convention as everywhere else a screen wasn't asked to become
  // multi-model-aware (see openModels.js) — rather than inventing a
  // combined score across two models that don't share a gamme. A finished
  // model (see isModelFinished()) now correctly drops out of the ranking
  // entirely instead of lingering as "active".
  const openModels = await getAllOpenModels()
  const byChain = {}
  for (const m of openModels) (byChain[m.chain_number] ??= []).push(m)

  const entries = await Promise.all(
    CHAIN_NUMBERS.map(async (chainNumber) => {
      const model = byChain[chainNumber]?.[0]
      if (!model) return { chainNumber, model: null, rendement: null }
      const dash = await fullDashboard(model)
      return {
        chainNumber,
        model: { client: model.client, dessin: model.dessin },
        rendement: { daily: dash.rendement.daily, cumulative: dash.rendement.cumulative },
      }
    })
  )

  // Sort key: chains with a real daily score first (best to worst), then
  // chains with an active model but no score yet (not enough data to
  // compute Rendement today), then chains with no active model at all —
  // never silently dropped, always shown, always at the bottom in that order.
  function tier(e) {
    if (!e.model) return 2
    if (e.rendement.daily.score === null) return 1
    return 0
  }
  entries.sort((a, b) => {
    const ta = tier(a)
    const tb = tier(b)
    if (ta !== tb) return ta - tb
    if (ta === 0) return b.rendement.daily.score - a.rendement.daily.score
    return a.chainNumber - b.chainNumber
  })

  res.json(entries.map((e, i) => ({ rank: i + 1, ...e })))
})

// Personnel administratif — read side, shared by RH's/Patron's own entry
// screens and the "État des effectifs" overview page below. Write side is
// gated per-department (routes/rh.js primary, routes/patron.js backup).
publicRouter.get('/personnel-admin', async (req, res) => {
  const date = req.query.date || todayInFactoryTZ()
  res.json(await getPersonnelAdmin(date))
})

// État des effectifs — a company-wide headcount overview: every chain's 13
// specialties + subtotal, Finale's 8 specialties + subtotal (summed across
// every chain's Finale entry — Finale is shown as ONE section here, not
// repeated per chain), Dépôt's single total (summed across every chain's
// Dépôt entry), Personnel administratif's today figure, and a grand total
// that is the sum of all of the above. Everything here is "right now" — the
// same live rh_attendance/finale_attendance/depot snapshot every
// department's own screen reads from, never a separately cached number that
// could drift. An empty chain (no active model) still appears, subtotal 0,
// with no specialty breakdown — never silently dropped.
publicRouter.get('/effectifs/overview', async (req, res) => {
  // Chain overlap: unlike Rendement/VT/DT (which never combine across
  // different-gamme models — see openModels.js), a headcount is a plain
  // additive count regardless of which model each worker is entered under,
  // so a chain's specialty totals here are the SUM across every one of its
  // open models, not just the primary one — the true number of people
  // actually on that physical chain right now.
  const active = await getAllOpenModels()
  const byChain = {}
  for (const m of active) (byChain[m.chain_number] ??= []).push(m)

  const [rhRows, finaleRows, depotRows, personnelAdmin, chainSpecialties, finaleSpecialtiesList] = await Promise.all([
    active.length
      ? all(`SELECT model_id, specialty, present FROM rh_attendance WHERE model_id = ANY($1)`, [active.map((m) => m.id)])
      : [],
    active.length
      ? all(`SELECT model_id, specialty, present FROM finale_attendance WHERE model_id = ANY($1)`, [active.map((m) => m.id)])
      : [],
    active.length ? all(`SELECT model_id, effectif_total FROM depot WHERE model_id = ANY($1)`, [active.map((m) => m.id)]) : [],
    getPersonnelAdmin(todayInFactoryTZ()),
    getSpecialties('chain'),
    getSpecialties('finale'),
  ])

  const rhByModel = {}
  for (const r of rhRows) (rhByModel[r.model_id] ??= {})[r.specialty] = r.present

  const chains = CHAIN_NUMBERS.map((chainNumber) => {
    const models = byChain[chainNumber] || []
    if (models.length === 0) {
      return { chainNumber, model: null, specialties: [], subtotal: 0 }
    }
    const specialties = chainSpecialties.map((s) => ({
      specialty: s,
      present: models.reduce((sum, m) => sum + (rhByModel[m.id]?.[s] || 0), 0),
    }))
    const subtotal = specialties.reduce((sum, s) => sum + s.present, 0)
    const primary = models[0]
    return { chainNumber, model: { client: primary.client, dessin: primary.dessin }, specialties, subtotal }
  })
  const chainsTotal = chains.reduce((sum, c) => sum + c.subtotal, 0)

  const finaleTotals = Object.fromEntries(finaleSpecialtiesList.map((s) => [s, 0]))
  for (const r of finaleRows) finaleTotals[r.specialty] = (finaleTotals[r.specialty] || 0) + r.present
  const finaleSpecialties = finaleSpecialtiesList.map((s) => ({ specialty: s, present: finaleTotals[s] || 0 }))
  const finaleSubtotal = finaleSpecialties.reduce((sum, s) => sum + s.present, 0)

  const depotTotal = depotRows.reduce((sum, r) => sum + (r.effectif_total || 0), 0)

  const grandTotal = chainsTotal + finaleSubtotal + depotTotal + personnelAdmin.total

  res.json({
    chains,
    chainsTotal,
    finale: { specialties: finaleSpecialties, subtotal: finaleSubtotal },
    depot: { total: depotTotal },
    personnelAdmin,
    grandTotal,
  })
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
