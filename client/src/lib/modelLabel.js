// Model names shown to users, with the optional garment type. Accepts both
// API shapes (`garmentType` from dashboards/Patron, `garment_type` from raw
// model rows). Empty parts are skipped, so an old model without type (or
// without Dessin) never shows "()" or a dangling "·".
export function garmentTypeOf(m) {
  return (m && (m.garmentType ?? m.garment_type)) || ''
}

// "Denllo · Veste · 2500"
export function modelName(m) {
  if (!m) return ''
  return [m.client, garmentTypeOf(m), m.dessin].filter(Boolean).join(' · ')
}

// "Denllo · Veste (2500)" — the Home chain selector.
export function modelOptionLabel(m) {
  if (!m) return ''
  const head = [m.client, garmentTypeOf(m)].filter(Boolean).join(' · ')
  return m.dessin ? `${head} (${m.dessin})` : head
}
