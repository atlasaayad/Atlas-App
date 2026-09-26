import { all, get, run } from './db/index.js'
import { todayInFactoryTZ } from './calc.js'

// Fin de série / Démarrage: a chain can run up to MAX_OPEN_PER_CHAIN root
// models at once — the old one finishing (fin de série) and the new one
// starting (démarrage). Two independent roots (own gamme, own VT/DT/ND,
// own production rows keyed by model_id) — unrelated to Couleur/Variante,
// where variants are colors of ONE root (parent_model_id). A root is open
// while models.status = 'active'; it only ever closes through an explicit,
// confirmed action by Agent Méthode or the Patron (closeModel() below) —
// never automatically.
export const MAX_OPEN_PER_CHAIN = 2

const OPEN_ROOTS_WHERE = "active = 1 AND parent_model_id IS NULL AND status = 'active'"

// Every open root on a chain, oldest first — index 0 is the fin de série
// when two overlap, the last one the démarrage. [] when nothing is open.
// The single source of truth for "what is this chain working on right now":
// Home, the hourly-entry screens, Classement and the early-warning banner
// all resolve through it.
export async function getOpenModelsForChain(chainNumber) {
  return all(`SELECT * FROM models WHERE chain_number = $1 AND ${OPEN_ROOTS_WHERE} ORDER BY created_at ASC`, [chainNumber])
}

// Same, across every chain at once (one query instead of one per chain).
export async function getAllOpenModels() {
  return all(`SELECT * FROM models WHERE ${OPEN_ROOTS_WHERE} ORDER BY chain_number, created_at ASC`)
}

// 'demarrage' for the newest open root, 'fin_de_serie' for the older one,
// null when the chain runs a single model (no label shown at all then).
export function roleInChain(openModels, modelId) {
  if (openModels.length < 2) return null
  return openModels[openModels.length - 1].id === modelId ? 'demarrage' : 'fin_de_serie'
}

// The root itself plus its active Couleur/Variante colors — every model_id
// whose production counts toward this root's own totals.
export async function getFamilyIds(root) {
  const variants = await all('SELECT id FROM models WHERE parent_model_id = $1 AND active = 1 ORDER BY created_at', [root.id])
  return [root.id, ...variants.map((v) => v.id)]
}

// Selectable targets for a root's hourly-entry screens (Agent Production's
// "Production par heure", Quality's "Pièces retouche par heure"): the root
// itself (label null, rendered "Défaut") plus its own Couleur/Variante
// colors. Deliberately NOT the other open root on the same chain — during a
// fin de série / démarrage overlap the client picks which model it is
// entering for (see GET /chains/:n/open-models), then enters that model's
// hours on their own, instead of both models being interleaved per hour.
export async function getHourlyEntryTargets(root) {
  const variants = await all('SELECT id, variant_label FROM models WHERE parent_model_id = $1 AND active = 1 ORDER BY created_at', [root.id])
  return [{ modelId: root.id, label: null }, ...variants.map((v) => ({ modelId: v.id, label: v.variant_label }))]
}

// Combined whole-life Sortie vs combined Qté totale (root + its colors) —
// exactly the "Bilan de la chaîne" figures on the model's dashboard. Used to
// decide when to ask Agent Méthode whether the model can be closed.
export async function getTargetProgress(root) {
  const familyIds = await getFamilyIds(root)
  const today = todayInFactoryTZ()
  const [sortieRow, qteRow] = await Promise.all([
    get('SELECT COALESCE(SUM(qty), 0) AS total FROM production_history WHERE model_id = ANY($1) AND date <= $2', [familyIds, today]),
    get('SELECT COALESCE(SUM(qte_totale), 0) AS total FROM models WHERE id = ANY($1)', [familyIds]),
  ])
  const totalSortie = Number(sortieRow.total)
  const qteTotale = Number(qteRow.total)
  return { totalSortie, qteTotale, reached: qteTotale > 0 && totalSortie >= qteTotale }
}

// Closes a root (and its colors). Nothing is deleted — every row keyed by
// these model ids stays exactly where it is for history, exports and audit.
export async function closeModel(root) {
  const now = new Date().toISOString()
  await run(
    `UPDATE models SET status = 'closed', closed_at = $1, updated_at = $1
     WHERE (id = $2 OR parent_model_id = $2) AND status = 'active'`,
    [now, root.id]
  )
}
