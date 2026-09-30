// "Are you sure?" thresholds — WARN ONLY: the user can always confirm and
// save. The server independently refuses only impossible values (negative
// numbers, operation time ≤ 0, end before start…, see server/src/validation.js).
// All thresholds live here, in one place.
export const WARNING_LIMITS = {
  productionPerHour: 2000, // pieces entered for ONE hour on one chain
  totalEntree: 1000000,
  finaleValue: 100000, // any Finale field
  depotPieces: 100000,
  exportQuantity: 100000,
  qteTotale: 1000000, // model / colour Qté totale and Commande
  operationSeconds: 1800, // one gamme operation (TPS), 30 min
  personnelAdmin: 1000,
}

function ask(ar, fr) {
  return window.confirm(`${ar}\n${fr}\n\nواش متأكد؟ / Confirmer ?`)
}

// `value` above `limit` → ask; true = go ahead and save.
export function confirmIfLarge(label, value, limit) {
  const n = Number(value) || 0
  if (n <= limit) return true
  return ask(`${label}: ${n.toLocaleString('fr-FR')} — رقم كبير بزاف (أكثر من ${limit.toLocaleString('fr-FR')})`, `${label} : ${n.toLocaleString('fr-FR')} — valeur inhabituelle (plus de ${limit.toLocaleString('fr-FR')})`)
}

// Retouches can legitimately exceed that hour's production (quality entered
// before production, or pieces from an earlier hour) — so only a warning.
export function confirmRetouche(retouche, production) {
  const r = Number(retouche) || 0
  const p = Number(production) || 0
  if (r <= p) return true
  return ask(`Pièces retouche (${r}) أكثر من إنتاج هاد الساعة (${p})`, `Pièces retouche (${r}) supérieures à la production de cette heure (${p})`)
}
