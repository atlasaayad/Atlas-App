// Server-side input checks shared by every route. A refusal is always
// 400 { error: <code>, message: { ar, fr } } — the client shows `message`
// as-is (client/src/lib/errors.js). Only NEW input is checked: existing
// rows are never modified or cleaned here.

export function reject(res, code, ar, fr, extra = {}) {
  res.status(400).json({ error: code, message: { ar, fr }, ...extra })
  return true
}

function asNumber(value) {
  if (value === undefined || value === null || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

// `fields`: [[label, value], ...]. Rejects the first value below zero.
// Empty / non-numeric values are left to each route's existing handling.
export function rejectNegative(res, fields) {
  for (const [label, value] of fields) {
    const n = asNumber(value)
    if (n !== null && n < 0) {
      return reject(
        res,
        'negative_value',
        `${label}: الرقم ما يمكنش يكون ناقص (أقل من 0)`,
        `${label} : la valeur ne peut pas être négative`,
        { field: label }
      )
    }
  }
  return false
}

// Same, for a { name: count } map (effectif / présence per specialty).
export function rejectNegativeMap(res, map) {
  return rejectNegative(res, Object.entries(map || {}))
}

export function rejectFinBeforeDebut(res, debut, finPrevue) {
  if (debut && finPrevue && String(finPrevue) < String(debut)) {
    return reject(res, 'fin_before_debut', 'Fin prévue ما يمكنش تكون قبل Début', 'La fin prévue ne peut pas être avant le début')
  }
  return false
}

// "Machinistes", " machinistes ", "MACHINISTES", "Machinistés" are the same.
export function normalizeName(name) {
  return String(name || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

function minutes(hhmm) {
  const [h, m] = String(hhmm).split(':').map(Number)
  return h * 60 + m
}

// Work-hour slot: end strictly after start, and no overlap with any other
// existing slot (touching end-to-start is fine: 07:30-08:30 then 08:30-…).
// Validation only — ordering and storage stay exactly as in workHours.js.
export function rejectBadWorkHour(res, start, end, others) {
  const s = minutes(start)
  const e = minutes(end)
  if (!(e > s)) return reject(res, 'end_before_start', 'وقت النهاية خاص يكون بعد وقت البداية', "L'heure de fin doit être après l'heure de début")
  const clash = others.find((o) => s < minutes(o.end) && minutes(o.start) < e)
  if (clash) {
    return reject(
      res,
      'overlapping_slot',
      `هاد الشريحة كتداخل مع ${clash.start}-${clash.end}`,
      `Ce créneau chevauche ${clash.start}-${clash.end}`,
      { clash: `${clash.start}-${clash.end}` }
    )
  }
  return false
}
