import { all, get } from './db/index.js'
import { todayInFactoryTZ } from './calc.js'

// A chain overlap: the real, ordinary factory scenario where a model's
// "Entré" (pieces fed into the chain) reaches its target quantity and a new
// model starts being fed into the SAME chain, while the old model's pieces
// are still mid-process or exiting — two independent root models (own
// gamme, own VT/DT/ND, no shared identity at all, unlike Couleur/Variante
// colors which share the root's gamme) both genuinely "running" on one
// chain_number at the same time. `active` on a root model is no longer
// exclusive per chain (see POST /methode/models) — a root stays `active=1`
// forever once created; whether it's still "open" (still relevant to pick
// for new hourly entries, still shown on Home) is a computed property, not
// a stored flag, matching this app's standing rule to never store what can
// be derived live.

// A root model is finished — no longer "open" — once its own Entré has
// reached its own Qté totale AND everything that entered has now exited
// (En cours = 0). Both conditions matter: requiring `totalEntree > 0` and
// `>= qteTotale` keeps a brand-new model (0 entré, 0 sortie, so En cours is
// also 0) from looking "finished" before it has even started; requiring En
// cours = 0 on top keeps a model that's merely between deliveries (WIP
// temporarily empty, but nowhere near its target yet) from closing early.
export async function isModelFinished(model) {
  const today = todayInFactoryTZ()
  const [totalsRow, cumulativeRow] = await Promise.all([
    get('SELECT total_entree FROM production_totals WHERE model_id = $1', [model.id]),
    get('SELECT COALESCE(SUM(qty), 0) AS total FROM production_history WHERE model_id = $1 AND date >= $2 AND date <= $3', [
      model.id,
      model.debut || today,
      today,
    ]),
  ])
  const totalEntree = totalsRow?.total_entree || 0
  const totalSortie = Number(cumulativeRow.total)
  return totalEntree > 0 && totalEntree >= (model.qte_totale || 0) && totalEntree - totalSortie <= 0
}

// Every root model still open on a chain — active and not yet finished —
// oldest first, so index 0 is consistently "the original/older one" when
// two overlap. A chain with nothing running (or everything on it finished)
// returns []. This is the single source of truth for "what's this chain
// currently working on" — Home, the hourly-entry screens, and the
// early-warning banner all resolve through it instead of assuming exactly
// one active root per chain.
export async function getOpenModelsForChain(chainNumber) {
  const roots = await all(
    'SELECT * FROM models WHERE chain_number = $1 AND active = 1 AND parent_model_id IS NULL ORDER BY created_at ASC',
    [chainNumber]
  )
  if (roots.length === 0) return []
  const finishedFlags = await Promise.all(roots.map(isModelFinished))
  return roots.filter((_, i) => !finishedFlags[i])
}

// Same, across every chain at once (one bulk query instead of CHAIN_NUMBERS
// separate round trips) — for callers that need every open model
// system-wide, like the early-warning banner.
export async function getAllOpenModels() {
  const roots = await all('SELECT * FROM models WHERE active = 1 AND parent_model_id IS NULL ORDER BY chain_number, created_at ASC')
  if (roots.length === 0) return []
  const finishedFlags = await Promise.all(roots.map(isModelFinished))
  return roots.filter((_, i) => !finishedFlags[i])
}

// Every selectable target for a chain's hourly-entry screens (Agent
// Production's "Production par heure", Quality's "Pièces retouche par
// heure") — the exact same mechanism Couleur/Variante already uses
// (`byModel`/`variants` in the response), generalized from "this root's own
// colors" to "every open root on this chain, plus each root's own active
// colors". `requestedRoot` (the id the client asked for) is always entry 0
// — labelled null, rendered as "Défaut" client-side — so a normal,
// non-overlapping chain's response is byte-identical to before. Any other
// entry (a sibling root, or a variant of one) gets a real label: a true
// Couleur/Variante gets its own `variant_label`; a sibling root (a
// genuinely different order, not a color of the same one) is labelled by
// its own dessin/client so it reads as "a different model", not a color.
export async function getHourlyEntryTargets(requestedRoot) {
  const openRoots = await getOpenModelsForChain(requestedRoot.chain_number)
  const others = openRoots.filter((m) => m.id !== requestedRoot.id)
  const allRoots = [requestedRoot, ...others]

  const variantRowsByRoot = await Promise.all(
    allRoots.map((r) => all('SELECT id, variant_label FROM models WHERE parent_model_id = $1 AND active = 1 ORDER BY created_at', [r.id]))
  )

  const entries = []
  allRoots.forEach((r, i) => {
    entries.push({ modelId: r.id, label: i === 0 ? null : r.dessin || r.client })
    for (const v of variantRowsByRoot[i]) entries.push({ modelId: v.id, label: v.variant_label })
  })
  return entries
}
