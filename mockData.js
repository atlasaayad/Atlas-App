// Mock data for Atlas-App. Replace with live API calls once the backend
// (and later, AI services) are wired in.

// ---------------------------------------------------------------------------
// DASHBOARD — production control room
// ---------------------------------------------------------------------------

export const controlKpis = [
  { label: "Today's output", value: '6,412', unit: 'pcs', delta: '-8.3%', trend: 'down', hint: 'vs. plan of 6,990' },
  { label: 'Global efficiency', value: '81.2', unit: '%', delta: '-2.4%', trend: 'down', hint: 'across 5 modules' },
  { label: 'Absenteeism', value: '6.1', unit: '%', delta: '+1.8%', trend: 'down', hint: '11 operators absent' },
  { label: 'On-time shipment', value: '93.5', unit: '%', delta: '+1.2%', trend: 'up', hint: 'rolling 30 days' },
]

export const alerts = [
  { id: 1, level: 'critical', text: 'Module C (Sewing — Shirts) is 2.3 h behind plan on PO-8812', time: '9 min ago' },
  { id: 2, level: 'critical', text: 'Export PO-8790 to Hamburg leaves at 17:00 — 340 pcs still in finishing', time: '22 min ago' },
  { id: 3, level: 'warning', text: '6 operators absent on Module B this morning, no cover assigned', time: '41 min ago' },
  { id: 4, level: 'warning', text: 'AQL batch A-2292 failed inspection — 22 defects on collar attach', time: '1 h ago' },
  { id: 5, level: 'info', text: 'Technical dossier TD-0231 approved by client Northfield & Co.', time: '2 h ago' },
]

export const delayedModules = [
  { module: 'Module C — Sewing (Shirts)', order: 'PO-8812', line: 'Line B', delay: '2.3 h', reason: 'Missing trims (buttons) delivered late' },
  { module: 'Module D — Finishing & Press', order: 'PO-8790', line: 'Line C', delay: '1.1 h', reason: 'Press station #3 under maintenance' },
  { module: 'Module B — Sewing (Jackets)', order: 'PO-8801', line: 'Line A', delay: '0.6 h', reason: 'Absenteeism — 6 operators out' },
]

export const exportsToday = [
  { po: 'PO-8790', client: 'Northfield & Co.', product: 'Puffer Vest — Insulated', qty: 1200, destination: 'Hamburg, DE', time: '17:00', status: 'At risk' },
  { po: 'PO-8756', client: 'Meridian Retail', product: 'Cargo Trouser — Regular', qty: 2400, destination: 'Rotterdam, NL', time: '19:30', status: 'On track' },
  { po: 'PO-8770', client: 'Harborline Apparel', product: 'Oxford Shirt — Slim', qty: 1800, destination: 'Casablanca, MA', time: '21:00', status: 'On track' },
]

export const productionTrend = [
  { day: 'Mon', planned: 7200, actual: 6890 },
  { day: 'Tue', planned: 7200, actual: 7105 },
  { day: 'Wed', planned: 7400, actual: 7020 },
  { day: 'Thu', planned: 7400, actual: 7380 },
  { day: 'Fri', planned: 7600, actual: 7510 },
  { day: 'Sat', planned: 5200, actual: 5090 },
  { day: 'Sun', planned: 0, actual: 0 },
]

export const moduleEfficiency = [
  { module: 'Mod. A', value: 92 },
  { module: 'Mod. B', value: 74 },
  { module: 'Mod. C', value: 63 },
  { module: 'Mod. D', value: 85 },
  { module: 'Mod. E', value: 68 },
]

export const orderStatus = [
  { name: 'On track', value: 22, color: '#2F9E64' },
  { name: 'At risk', value: 9, color: '#D4901F' },
  { name: 'Delayed', value: 4, color: '#C6493F' },
  { name: 'Completed', value: 31, color: '#2B4C7E' },
]

export const activity = [
  { id: 1, text: 'Gamme "Denim Jacket — Classic Fit" revised to 24 operations', time: '12 min ago', kind: 'gamme' },
  { id: 2, text: 'Module C reported 45 min downtime — needle machine #14', time: '38 min ago', kind: 'production' },
  { id: 3, text: 'QC batch A-2291 passed AQL inspection (Level II)', time: '1 h ago', kind: 'quality' },
  { id: 4, text: 'Planning: Order PO-8823 rescheduled to Line B', time: '2 h ago', kind: 'planning' },
  { id: 5, text: 'Technical dossier TD-0231 approved by client Northfield & Co.', time: '2 h ago', kind: 'dossier' },
]

// ---------------------------------------------------------------------------
// PRODUCTS
// ---------------------------------------------------------------------------

export const products = [
  { ref: 'PRD-1042', name: 'Denim Jacket — Classic Fit', category: 'Outerwear', gamme: 'GM-114', dossier: 'TD-0231', status: 'Active', season: 'FW26' },
  { ref: 'PRD-1043', name: 'Oxford Shirt — Slim', category: 'Shirts', gamme: 'GM-098', dossier: 'TD-0198', status: 'Active', season: 'SS26' },
  { ref: 'PRD-1044', name: 'Cargo Trouser — Regular', category: 'Bottoms', gamme: 'GM-121', dossier: 'TD-0244', status: 'Draft', season: 'FW26' },
  { ref: 'PRD-1045', name: 'Puffer Vest — Insulated', category: 'Outerwear', gamme: 'GM-133', dossier: 'TD-0251', status: 'Active', season: 'FW26' },
  { ref: 'PRD-1046', name: 'Polo — Pique Cotton', category: 'Shirts', gamme: 'GM-076', dossier: 'TD-0142', status: 'Discontinued', season: 'SS25' },
  { ref: 'PRD-1047', name: 'Chino Short', category: 'Bottoms', gamme: 'GM-101', dossier: 'TD-0207', status: 'Active', season: 'SS26' },
]

// ---------------------------------------------------------------------------
// TECHNICAL DOSSIERS — client, PO, season, fabric, trims, files
// ---------------------------------------------------------------------------

export const dossiers = [
  {
    id: 'TD-0231',
    product: 'Denim Jacket — Classic Fit',
    client: 'Northfield & Co.',
    po: 'PO-8801',
    season: 'FW26',
    status: 'Approved',
    fabric: { name: '11oz Cotton Denim', composition: '98% Cotton / 2% Elastane', color: 'Indigo Rinse', consumption: '1.85 m / pc' },
    trims: ['YKK metal zipper 6"', 'Rivets — antique brass ×8', 'Woven main label', 'Button — shank, denim wash ×5'],
    files: { pdf: 2, photos: 6, videos: 1 },
    updated: '2026-07-16',
  },
  {
    id: 'TD-0198',
    product: 'Oxford Shirt — Slim',
    client: 'Harborline Apparel',
    po: 'PO-8770',
    season: 'SS26',
    status: 'Approved',
    fabric: { name: 'Oxford Cotton Poplin', composition: '100% Cotton', color: 'Sky Blue', consumption: '1.35 m / pc' },
    trims: ['Mother-of-pearl buttons ×9', 'Woven care label', 'Collar stays — plastic ×2'],
    files: { pdf: 3, photos: 5, videos: 0 },
    updated: '2026-06-30',
  },
  {
    id: 'TD-0244',
    product: 'Cargo Trouser — Regular',
    client: 'Meridian Retail',
    po: 'PO-8830',
    season: 'FW26',
    status: 'In review',
    fabric: { name: 'Cotton Ripstop', composition: '97% Cotton / 3% Elastane', color: 'Olive Drab', consumption: '1.6 m / pc' },
    trims: ['YKK zipper fly', 'Cargo pocket flaps ×2', 'D-ring webbing tab', 'Metal snap buttons ×3'],
    files: { pdf: 1, photos: 4, videos: 0 },
    updated: '2026-07-11',
  },
  {
    id: 'TD-0251',
    product: 'Puffer Vest — Insulated',
    client: 'Northfield & Co.',
    po: 'PO-8790',
    season: 'FW26',
    status: 'Approved',
    fabric: { name: 'Nylon Ripstop + 80g Fill', composition: '100% Nylon shell', color: 'Black', consumption: '1.1 m / pc' },
    trims: ['Two-way zipper', 'Cord lock ×2', 'Reflective heat-transfer logo'],
    files: { pdf: 2, photos: 7, videos: 1 },
    updated: '2026-07-15',
  },
  {
    id: 'TD-0142',
    product: 'Polo — Pique Cotton',
    client: 'Solstice Brands',
    po: 'PO-8590',
    season: 'SS25',
    status: 'Archived',
    fabric: { name: 'Cotton Pique', composition: '100% Cotton', color: 'White', consumption: '1.05 m / pc' },
    trims: ['Buttons — pearlescent ×3', 'Rib knit collar & cuffs'],
    files: { pdf: 1, photos: 3, videos: 0 },
    updated: '2025-11-02',
  },
  {
    id: 'TD-0207',
    product: 'Chino Short',
    client: 'Meridian Retail',
    po: 'PO-8841',
    season: 'SS26',
    status: 'In review',
    fabric: { name: 'Cotton Twill', composition: '98% Cotton / 2% Elastane', color: 'Khaki', consumption: '0.9 m / pc' },
    trims: ['Metal button + zipper fly', 'Woven brand label', 'Belt loops ×5'],
    files: { pdf: 1, photos: 3, videos: 0 },
    updated: '2026-07-08',
  },
]

// ---------------------------------------------------------------------------
// GAMMES — operation routings with machine, SMV, operator, media
// ---------------------------------------------------------------------------

export const gammes = [
  { code: 'GM-114', product: 'Denim Jacket — Classic Fit', dossier: 'TD-0231', operations: 24, smv: 38.2, revision: 'v3', updated: '2026-07-10' },
  { code: 'GM-098', product: 'Oxford Shirt — Slim', dossier: 'TD-0198', operations: 19, smv: 24.6, revision: 'v5', updated: '2026-06-28' },
  { code: 'GM-121', product: 'Cargo Trouser — Regular', dossier: 'TD-0244', operations: 21, smv: 27.1, revision: 'v1', updated: '2026-07-02' },
  { code: 'GM-133', product: 'Puffer Vest — Insulated', dossier: 'TD-0251', operations: 16, smv: 20.4, revision: 'v2', updated: '2026-07-15' },
]

export const gammeOperations = [
  { opNo: 1, operation: 'Cut front panel', machine: 'Straight knife cutter', operator: 'Rachid A.', smv: 1.2, image: true, video: false },
  { opNo: 2, operation: 'Overlock side seams', machine: 'Overlock 5-thread', operator: 'Fatima Z.', smv: 2.4, image: true, video: true },
  { opNo: 3, operation: 'Attach collar band', machine: 'Single needle lockstitch', operator: 'Hassan M.', smv: 3.1, image: true, video: false },
  { opNo: 4, operation: 'Set sleeve', machine: 'Single needle lockstitch', operator: 'Naima K.', smv: 4.0, image: false, video: true },
  { opNo: 5, operation: 'Topstitch placket', machine: 'Single needle lockstitch', operator: 'Hassan M.', smv: 2.8, image: true, video: false },
  { opNo: 6, operation: 'Set rivets', machine: 'Rivet press', operator: 'Youssef T.', smv: 1.4, image: true, video: false },
  { opNo: 7, operation: 'Buttonhole', machine: 'Buttonholer', operator: 'Fatima Z.', smv: 1.6, image: false, video: false },
  { opNo: 8, operation: 'Final press & fold', machine: 'Steam press station', operator: 'Amal B.', smv: 2.2, image: true, video: true },
]

// ---------------------------------------------------------------------------
// MODULES — workforce, hourly target/actual, efficiency, downtime, absences
// ---------------------------------------------------------------------------

export const modules = [
  {
    id: 'MOD-A',
    name: 'Module A — Cutting',
    line: 'Line A',
    workforcePresent: 12,
    workforceTotal: 12,
    absent: 0,
    hourlyTarget: 225,
    hourlyActual: 232,
    efficiency: 92,
    downtimeMin: 0,
    status: 'Running',
  },
  {
    id: 'MOD-B',
    name: 'Module B — Sewing (Jackets)',
    line: 'Line A',
    workforcePresent: 22,
    workforceTotal: 28,
    absent: 6,
    hourlyTarget: 119,
    hourlyActual: 88,
    efficiency: 74,
    downtimeMin: 15,
    status: 'Understaffed',
  },
  {
    id: 'MOD-C',
    name: 'Module C — Sewing (Shirts)',
    line: 'Line B',
    workforcePresent: 23,
    workforceTotal: 24,
    absent: 1,
    hourlyTarget: 138,
    hourlyActual: 87,
    efficiency: 63,
    downtimeMin: 40,
    status: 'Bottleneck',
  },
  {
    id: 'MOD-D',
    name: 'Module D — Finishing & Press',
    line: 'Line B',
    workforcePresent: 14,
    workforceTotal: 14,
    absent: 0,
    hourlyTarget: 300,
    hourlyActual: 255,
    efficiency: 85,
    downtimeMin: 20,
    status: 'Running',
  },
  {
    id: 'MOD-E',
    name: 'Module E — Packing',
    line: 'Line C',
    workforcePresent: 9,
    workforceTotal: 10,
    absent: 1,
    hourlyTarget: 375,
    hourlyActual: 255,
    efficiency: 68,
    downtimeMin: 5,
    status: 'Idle',
  },
]

// ---------------------------------------------------------------------------
// PLANNING
// ---------------------------------------------------------------------------

export const planningRows = [
  { po: 'PO-8801', product: 'Denim Jacket — Classic Fit', line: 'Line A', qty: 4200, start: '2026-07-14', end: '2026-07-24', status: 'In progress' },
  { po: 'PO-8812', product: 'Oxford Shirt — Slim', line: 'Line B', qty: 6600, start: '2026-07-15', end: '2026-07-22', status: 'In progress' },
  { po: 'PO-8823', product: 'Puffer Vest — Insulated', line: 'Line B', qty: 3100, start: '2026-07-21', end: '2026-07-30', status: 'Scheduled' },
  { po: 'PO-8830', product: 'Cargo Trouser — Regular', line: 'Line C', qty: 5400, start: '2026-07-18', end: '2026-07-27', status: 'At risk' },
  { po: 'PO-8841', product: 'Chino Short', line: 'Line A', qty: 2800, start: '2026-07-25', end: '2026-08-02', status: 'Scheduled' },
]

// ---------------------------------------------------------------------------
// PRODUCTION
// ---------------------------------------------------------------------------

export const productionLines = [
  { line: 'Line A', order: 'PO-8801', target: 900, actual: 845, efficiency: 88 },
  { line: 'Line B', order: 'PO-8812', target: 1100, actual: 869, efficiency: 79 },
  { line: 'Line C', order: 'PO-8830', target: 780, actual: 655, efficiency: 84 },
  { line: 'Line D', order: 'PO-8756', target: 640, actual: 454, efficiency: 71 },
  { line: 'Line E', order: 'PO-8790', target: 1200, actual: 1080, efficiency: 90 },
]

// ---------------------------------------------------------------------------
// QUALITY
// ---------------------------------------------------------------------------

export const qualityBatches = [
  { batch: 'A-2291', product: 'Denim Jacket — Classic Fit', inspected: 320, defects: 8, aql: 'Pass', level: 'II' },
  { batch: 'A-2292', product: 'Oxford Shirt — Slim', inspected: 500, defects: 22, aql: 'Fail', level: 'II' },
  { batch: 'A-2293', product: 'Cargo Trouser — Regular', inspected: 280, defects: 6, aql: 'Pass', level: 'I' },
  { batch: 'A-2294', product: 'Puffer Vest — Insulated', inspected: 210, defects: 4, aql: 'Pass', level: 'II' },
]

export const defectTypes = [
  { type: 'Skipped stitch', count: 14 },
  { type: 'Misaligned seam', count: 11 },
  { type: 'Fabric flaw', count: 8 },
  { type: 'Broken button', count: 5 },
  { type: 'Color shading', count: 4 },
]

// ---------------------------------------------------------------------------
// REPORTS
// ---------------------------------------------------------------------------

export const reportPresets = [
  { name: 'Weekly production summary', cadence: 'Weekly', lastRun: '2026-07-19' },
  { name: 'Module efficiency & downtime', cadence: 'Daily', lastRun: '2026-07-20' },
  { name: 'AQL quality audit', cadence: 'Weekly', lastRun: '2026-07-18' },
  { name: 'Order fulfillment vs. plan', cadence: 'Monthly', lastRun: '2026-07-01' },
  { name: 'Absenteeism by module', cadence: 'Daily', lastRun: '2026-07-20' },
]
