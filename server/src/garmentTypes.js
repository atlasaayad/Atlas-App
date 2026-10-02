import { nanoid } from 'nanoid'
import { all, get, run } from './db/index.js'
import { normalizeName } from './validation.js'

// Optional garment type of a model (Méthode → Identité). The default list is
// fixed here; types added with "+ Ajouter un autre type" are stored in
// `garment_types`. Two names that differ only by capitals/spaces/accents
// are the same type (same rule as specialties).
export const DEFAULT_GARMENT_TYPES = [
  'T-shirt', 'Polo', 'Chemise', 'Veste', 'Gilet', 'Pantalon', 'Short', 'Jupe', 'Robe', 'Sweat', 'Manteau',
]

export async function getGarmentTypes() {
  const rows = await all('SELECT name FROM garment_types ORDER BY created_at, name')
  return [...DEFAULT_GARMENT_TYPES, ...rows.map((r) => r.name)]
}

// The list's own spelling of `name`, or null when it isn't in the list.
export async function findGarmentType(name) {
  const key = normalizeName(name)
  if (!key) return null
  return (await getGarmentTypes()).find((t) => normalizeName(t) === key) || null
}

// Adds a new type. Returns { name } or { duplicate: <existing name> }.
export async function addGarmentType(name) {
  const trimmed = String(name || '').replace(/\s+/g, ' ').trim()
  const existing = await findGarmentType(trimmed)
  if (existing) return { duplicate: existing }
  await run('INSERT INTO garment_types (id, name, created_at) VALUES ($1, $2, $3) ON CONFLICT (name) DO NOTHING', [
    `gty_${nanoid(10)}`,
    trimmed,
    new Date().toISOString(),
  ])
  return { name: trimmed }
}

// A variant has no type of its own: it always shows its parent's.
export async function garmentTypeOf(model) {
  if (!model) return null
  if (!model.parent_model_id) return model.garment_type || null
  const parent = await get('SELECT garment_type FROM models WHERE id = $1', [model.parent_model_id])
  return parent?.garment_type || null
}
