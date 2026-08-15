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

export const SPECIALTIES = [
  '301', '502', '504', '516', 'Main', 'Sp', 'M/sp', 'Finition', 'Control', 'Stg', 'Fer',
  'Mach retouche', 'Trns', 'Chef', 'Robot',
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
