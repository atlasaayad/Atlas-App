export const DEPARTMENTS = [
  { key: 'methode', label: 'Agent Méthode', icon: '⏱️' },
  { key: 'production', label: 'Agent Production', icon: '⚙️' },
  { key: 'patron', label: 'Patron', icon: '👤' },
  { key: 'mecanicien', label: 'Mécanicien', icon: '🔧' },
  { key: 'magasin', label: 'Magasin', icon: '📦' },
  { key: 'logistics', label: 'Logistics', icon: '🚚' },
  { key: 'quality', label: 'Quality', icon: '✅' },
  { key: 'rh', label: 'RH', icon: '🧑‍💼' },
  { key: 'coupe', label: 'La Coupe', icon: '🧵' },
  { key: 'depot', label: 'Dépôt', icon: '🏭' },
  { key: 'finale', label: 'Finale', icon: '🏁' },
  { key: 'echantillon', label: 'Échantillon', icon: '🧪' },
]

// Departments whose only input is a generic "État du poste %" slider + note.
export const GENERIC_POSTE_DEPARTMENTS = ['coupe', 'magasin', 'mecanicien', 'echantillon']

// Renamed from the old 15-code shorthand (301/502/504/516/Main/Sp/M-sp/
// Control/Stg/Fer/"Mach retouche"/Trns) to clear French names. 301/502/504/
// 516 merged into one "Machinistes" specialty (their values summed); the old
// "Stg" code split conceptually into two new specialties, but since it never
// distinguished machinist vs. fer trainees, its historical values all moved
// to "Machiniste stagiaire" — "Stagiaire fer" starts empty from this
// deploy's data. See the DB migration in db/index.js and README "État des
// effectifs" for the full mapping and this assumption.
export const SPECIALTIES = [
  'Machinistes', 'Machiniste stagiaire', 'Repassage préparation', 'Stagiaire fer', 'Traçage',
  'Transport', 'Chef', 'Robot', 'Machine spéciale', 'Manuel spécial / Traçage spécial',
  'Contrôle chaîne', 'Retouche', 'Finition',
]

// Old (pre-rename) specialty code -> new name, used once by the DB migration
// in db/index.js to carry historical effectif_requis/rh_attendance(_history)
// values over to the new names without losing or double-counting anything.
export const SPECIALTY_MIGRATION_MAP = {
  '301': 'Machinistes',
  '502': 'Machinistes',
  '504': 'Machinistes',
  '516': 'Machinistes',
  Stg: 'Machiniste stagiaire',
  Main: 'Traçage',
  Sp: 'Machine spéciale',
  'M/sp': 'Manuel spécial / Traçage spécial',
  Control: 'Contrôle chaîne',
  Fer: 'Repassage préparation',
  'Mach retouche': 'Retouche',
  Trns: 'Transport',
}

// Finale's own headcount specialties — separate from the 13 chain
// specialties above (Finale is a distinct finishing stage with different
// job roles), entered per chain by the Finale department itself.
export const FINALE_SPECIALTIES = [
  'Repassage Finale', 'Contrôle Finale', 'Stagiaire', 'Main', 'Transport', 'Nettoyage', 'Mesure', 'Machiniste',
]

export const MACHINES = ['301', '502', '504', '516', 'robot', 'fer', 'main', 'sp', 'rz/stg']

export const HOURLY_SLOTS = [
  { index: 0, label: '6:30-7:30' },
  { index: 1, label: '7:30-8:30' },
  { index: 2, label: '8:30-9:30' },
  { index: 3, label: '9:30-10:30' },
  { index: 4, label: '10:30-11:30' },
  { index: 5, label: '11:30-13:00' },
  { index: 6, label: '13:00-14:00' },
  { index: 7, label: '14:00-15:00' },
  { index: 8, label: '15:00-16:00' },
]

export const WORK_HOURS_PER_DAY = 9

export const CHAIN_NUMBERS = [1, 2, 3, 4, 5, 6, 7, 8]

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
