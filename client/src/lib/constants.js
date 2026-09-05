export const DEPARTMENT_META = {
  methode: { label: 'Agent Méthode', icon: '⏱️' },
  production: { label: 'Agent Production', icon: '⚙️' },
  patron: { label: 'Patron', icon: '👤' },
  mecanicien: { label: 'Mécanicien', icon: '🔧' },
  magasin: { label: 'Magasin', icon: '📦' },
  logistics: { label: 'Logistics', icon: '🚚' },
  quality: { label: 'Quality', icon: '✅' },
  rh: { label: 'RH', icon: '🧑‍💼' },
  coupe: { label: 'La Coupe', icon: '🧵' },
  depot: { label: 'Dépôt', icon: '🏭' },
  finale: { label: 'Finale', icon: '🏁' },
  echantillon: { label: 'Échantillon', icon: '🧪' },
}

export const GENERIC_POSTE_DEPARTMENTS = ['coupe', 'magasin', 'mecanicien', 'echantillon']

// Renamed from the old 15-code shorthand — see server/src/constants.js for
// the full old→new mapping and the migration that carried historical values
// over (301/502/504/516 merged into "Machinistes"; "Stg" moved wholesale
// into "Machiniste stagiaire").
export const SPECIALTIES = [
  'Machinistes', 'Machiniste stagiaire', 'Repassage préparation', 'Stagiaire fer', 'Traçage',
  'Transport', 'Chef', 'Robot', 'Machine spéciale', 'Manuel spécial / Traçage spécial',
  'Contrôle chaîne', 'Retouche', 'Finition',
]

// Finale's own headcount specialties — separate from the 13 chain
// specialties above.
export const FINALE_SPECIALTIES = [
  'Repassage Finale', 'Contrôle Finale', 'Stagiaire', 'Main', 'Transport', 'Nettoyage', 'Mesure', 'Machiniste',
]

export const MACHINES = ['301', '502', '504', '516', 'robot', 'fer', 'main', 'sp', 'rz/stg']

export const CHAIN_NUMBERS = [1, 2, 3, 4, 5, 6, 7, 8]

export const POLL_INTERVAL_MS = 12000

// Ready-made reasons for a "Temps de lancement" overrun — picked when Agent
// Méthode stops the countdown after it has already gone red (past Objectif).
export const DELAY_REASONS = [
  { code: 'parts_shortage', label: 'نقص قطع غيار' },
  { code: 'machine_breakdown', label: 'عطل آلة' },
  { code: 'worker_shortage', label: 'نقص عمال' },
  { code: 'quality_issue', label: 'مشكلة جودة' },
  { code: 'external_stoppage', label: 'إضراب/توقف خارجي' },
  { code: 'other', label: 'سبب آخر' },
]
