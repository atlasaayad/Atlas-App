import { all } from './db/index.js'
import { getWorkHours } from './workHours.js'
import { todayInFactoryTZ } from './calc.js'

function addDays(dateStr, n) {
  const d = new Date(`${dateStr}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

// Total planned qty ever entered for a model, and the expected finish date
// (the first day whose planned cumulative reaches qteTotale) — both
// computed live from planning_hourly, same "never stored" philosophy as
// VT/DT/Rendement. `hasPlan: false` when nothing has been entered yet, so
// callers can omit the whole Planning section instead of showing an empty
// chart or a misleading 0.
export async function getPlanningSummary(model) {
  const rows = await all(
    'SELECT date, slot_index, qty FROM planning_hourly WHERE model_id = $1 ORDER BY date, slot_index',
    [model.id]
  )
  if (rows.length === 0) return { hasPlan: false, totalPlanned: 0, expectedFinishDate: null }

  let totalPlanned = 0
  let running = 0
  let expectedFinishDate = null
  const qteTotale = model.qte_totale || 0
  for (const r of rows) {
    totalPlanned += r.qty
    running += r.qty
    if (expectedFinishDate === null && qteTotale > 0 && running >= qteTotale) {
      expectedFinishDate = r.date
    }
  }
  return { hasPlan: true, totalPlanned, expectedFinishDate }
}

// Full Plan vs Réel comparison for Home: today's hourly breakdown (a second
// series alongside the existing real hourly chart) plus a day-by-day
// comparison across the model's whole span — from Début through whichever
// is later of today or the plan's own expected finish date, so a chain
// running behind schedule still shows its complete plan, not just however
// far today happens to reach. Diffs (pieces + %) are left for the client to
// compute from planQty/realQty — never a monetary figure, by design.
export async function getPlanVsReel(model) {
  const [planRows, realRows, workHours] = await Promise.all([
    all('SELECT date, slot_index, qty FROM planning_hourly WHERE model_id = $1 ORDER BY date, slot_index', [model.id]),
    all('SELECT date, slot_index, qty FROM production_history WHERE model_id = $1', [model.id]),
    getWorkHours(),
  ])
  if (planRows.length === 0) return { hasPlan: false }

  const today = todayInFactoryTZ()
  const qteTotale = model.qte_totale || 0

  const planByDateSlot = {}
  const planByDate = {}
  let totalPlanned = 0
  let running = 0
  let expectedFinishDate = null
  for (const r of planRows) {
    planByDateSlot[`${r.date}:${r.slot_index}`] = r.qty
    planByDate[r.date] = (planByDate[r.date] || 0) + r.qty
    totalPlanned += r.qty
    running += r.qty
    if (expectedFinishDate === null && qteTotale > 0 && running >= qteTotale) {
      expectedFinishDate = r.date
    }
  }

  const realByDateSlot = {}
  const realByDate = {}
  for (const r of realRows) {
    const key = `${r.date}:${r.slot_index}`
    realByDateSlot[key] = (realByDateSlot[key] || 0) + r.qty
    realByDate[r.date] = (realByDate[r.date] || 0) + r.qty
  }

  const startDate = model.debut || today
  const endDate = expectedFinishDate && expectedFinishDate > today ? expectedFinishDate : today
  const spanDays = Math.max(0, Math.round((new Date(`${endDate}T00:00:00Z`) - new Date(`${startDate}T00:00:00Z`)) / 86400000))

  const daily = []
  let planCumulative = 0
  let realCumulative = 0
  for (let i = 0; i <= spanDays; i++) {
    const date = addDays(startDate, i)
    const planQty = planByDate[date] || 0
    const realQty = realByDate[date] || 0
    // A future day with nothing planned yet is skipped entirely (no fake
    // 0-row) — a past/today day always renders, even at 0, since that's a
    // real fact (nothing was planned/produced that day).
    if (planQty === 0 && realQty === 0 && date > today) continue
    planCumulative += planQty
    realCumulative += realQty
    daily.push({ date, planQty, realQty, planCumulative, realCumulative })
  }

  const todayHourly = workHours.map((s) => ({
    ...s,
    planQty: planByDateSlot[`${today}:${s.index}`] || 0,
    realQty: realByDateSlot[`${today}:${s.index}`] || 0,
  }))

  return { hasPlan: true, totalPlanned, expectedFinishDate, todayHourly, daily }
}
