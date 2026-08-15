import { Router } from 'express'
import ExcelJS from 'exceljs'
import { all, get } from '../db/index.js'
import { requireDept } from '../auth.js'
import { SPECIALTIES, HOURLY_SLOTS } from '../constants.js'

export const auditRouter = Router()
// Both Patron and RH can pull this — RH because they're the ones who
// actually enter the daily attendance the report is built from.
auditRouter.use(requireDept(['patron', 'rh']))

function dateRange(from, to) {
  const dates = []
  let d = new Date(`${from}T00:00:00Z`)
  const end = new Date(`${to}T00:00:00Z`)
  while (d <= end) {
    dates.push(d.toISOString().slice(0, 10))
    d = new Date(d.getTime() + 24 * 60 * 60 * 1000)
  }
  return dates
}

auditRouter.get('/audit/report', async (req, res) => {
  const chainNumber = Number(req.query.chainNumber)
  const from = String(req.query.from || '')
  const to = String(req.query.to || '')
  if (!chainNumber || !/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to) {
    return res.status(400).json({ error: 'invalid_range' })
  }

  const model = await get('SELECT * FROM models WHERE chain_number = $1 AND active = 1', [chainNumber])

  const requiredRows = model
    ? await all('SELECT specialty, required FROM effectif_requis WHERE model_id = $1', [model.id])
    : []
  const requiredMap = Object.fromEntries(SPECIALTIES.map((s) => [s, 0]))
  for (const r of requiredRows) requiredMap[r.specialty] = r.required

  const attendanceRows = await all(
    `SELECT date, specialty, present, updated_at FROM rh_attendance_history
     WHERE chain_number = $1 AND date >= $2 AND date <= $3 ORDER BY date, specialty`,
    [chainNumber, from, to]
  )
  const attendanceByDate = {}
  for (const r of attendanceRows) {
    if (!attendanceByDate[r.date]) attendanceByDate[r.date] = []
    attendanceByDate[r.date].push(r)
  }

  const hourlyRows = await all(
    `SELECT date, COUNT(*) AS slots FROM production_history
     WHERE chain_number = $1 AND date >= $2 AND date <= $3 GROUP BY date`,
    [chainNumber, from, to]
  )
  const hoursByDate = Object.fromEntries(hourlyRows.map((r) => [r.date, Number(r.slots)]))

  const allDates = dateRange(from, to)
  let daysWithData = 0
  let pctSum = 0
  let pctCount = 0

  for (const date of allDates) {
    const rows = attendanceByDate[date]
    if (rows && rows.length > 0) {
      daysWithData++
      for (const r of rows) {
        const required = requiredMap[r.specialty] || 0
        if (required > 0) {
          pctSum += Math.min(100, (r.present / required) * 100)
          pctCount++
        }
      }
    }
  }
  const daysWithGaps = allDates.length - daysWithData
  const avgAttendancePct = pctCount > 0 ? Math.round((pctSum / pctCount) * 10) / 10 : null

  const companyRow = await get('SELECT value FROM config WHERE key = $1', ['company_name'])
  const workbook = new ExcelJS.Workbook()
  workbook.creator = companyRow?.value || 'Casual'
  workbook.created = new Date()

  // --- Résumé ---
  const summary = workbook.addWorksheet('Résumé')
  summary.columns = [{ width: 34 }, { width: 40 }]
  const summaryRows = [
    ['Rapport de préparation audit', 'BSCI / SMETA'],
    ['Entreprise', companyRow?.value || 'Casual'],
    ['Chaîne', `Chaîne ${chainNumber}${model ? ` — ${model.client} (${model.dessin})` : ''}`],
    ['Période', `${from} au ${to}`],
    ['Généré le', new Date().toISOString()],
    [],
    ['Nombre de jours dans la période', allDates.length],
    ['Jours avec présence enregistrée', daysWithData],
    ['Jours SANS aucune donnée enregistrée (⚠ lacune)', daysWithGaps],
    ['Moyenne de présence (par rapport à l\'effectif requis actuel)', avgAttendancePct === null ? 'Aucune donnée' : `${avgAttendancePct}%`],
  ]
  summaryRows.forEach((row, i) => {
    const excelRow = summary.addRow(row)
    if (i === 0) excelRow.font = { bold: true, size: 14 }
    if (row[0]?.toString().includes('lacune') && daysWithGaps > 0) {
      excelRow.getCell(2).font = { bold: true, color: { argb: 'FFCC3333' } }
    }
  })
  summary.getColumn(1).font = { bold: true }

  // --- Présence journalière ---
  const daily = workbook.addWorksheet('Présence journalière')
  daily.columns = [
    { header: 'Date', key: 'date', width: 12 },
    { header: 'Spécialité', key: 'specialty', width: 16 },
    { header: 'Présents', key: 'present', width: 10 },
    { header: 'Requis', key: 'required', width: 10 },
    { header: 'Écart', key: 'gap', width: 10 },
    { header: 'Enregistré à (horodatage réel)', key: 'timestamp', width: 26 },
  ]
  daily.getRow(1).font = { bold: true }

  for (const date of allDates) {
    const rows = attendanceByDate[date]
    if (!rows || rows.length === 0) {
      const r = daily.addRow({ date, specialty: '— AUCUNE DONNÉE ENREGISTRÉE POUR CE JOUR —', present: '', required: '', gap: '', timestamp: '' })
      r.font = { italic: true, color: { argb: 'FFCC3333' } }
      continue
    }
    for (const spec of SPECIALTIES) {
      const r = rows.find((x) => x.specialty === spec)
      const required = requiredMap[spec] || 0
      if (!r) {
        daily.addRow({ date, specialty: spec, present: '—', required, gap: '—', timestamp: '' })
        continue
      }
      daily.addRow({
        date,
        specialty: spec,
        present: r.present,
        required,
        gap: r.present - required,
        timestamp: r.updated_at,
      })
    }
  }

  // --- Heures documentées ---
  const hours = workbook.addWorksheet('Heures documentées')
  hours.columns = [
    { header: 'Date', key: 'date', width: 12 },
    { header: `Heures de production enregistrées (sur ${HOURLY_SLOTS.length})`, key: 'slots', width: 36 },
  ]
  hours.getRow(1).font = { bold: true }
  for (const date of allDates) {
    const slots = hoursByDate[date] || 0
    const r = hours.addRow({ date, slots })
    if (slots === 0) r.font = { italic: true, color: { argb: 'FFCC3333' } }
  }

  const filename = `atlas-audit-chaine${chainNumber}-${from}-${to}.xlsx`
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
  await workbook.xlsx.write(res)
  res.end()
})
