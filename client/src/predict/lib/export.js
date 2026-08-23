function download(filename, content, mime) {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

function csvCell(v) {
  const s = String(v ?? '')
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

const OUTCOME_LABEL = { 1: '1', X: 'X', 2: '2', '1X': '1X', X2: 'X2', 12: '12' }

export function exportMatchesCsv(matches) {
  const headers = [
    'Date', 'Time', 'League', 'Home', 'Away',
    'xG Home', 'xG Away',
    'P(Home)', 'P(Draw)', 'P(Away)',
    'Confidence %', 'Tier',
    'Recommended Market', 'Market Probability %',
    'Over/Under 2.5', 'BTTS', 'Asian Handicap',
    'Result Home', 'Result Away', 'Hit',
  ]
  const rows = matches.map((m) => {
    const p = m.prediction
    const r = m.result
    return [
      m.date, m.time, m.league, m.homeTeam, m.awayTeam,
      m.xgHome, m.xgAway,
      p ? (p.pHome * 100).toFixed(1) : '',
      p ? (p.pDraw * 100).toFixed(1) : '',
      p ? (p.pAway * 100).toFixed(1) : '',
      p ? p.confidence : '',
      p ? p.tier : '',
      p ? OUTCOME_LABEL[p.outcome.pick] : '',
      p ? (p.outcome.probability * 100).toFixed(1) : '',
      p ? `${p.overUnder.pick} (${(p.overUnder.probability * 100).toFixed(0)}%)` : '',
      p ? `${p.btts.pick} (${(p.btts.probability * 100).toFixed(0)}%)` : '',
      p ? `${p.asianHandicap.side} ${p.asianHandicap.line}` : '',
      r?.homeGoals ?? '',
      r?.awayGoals ?? '',
      m.evaluation ? (m.evaluation.hit ? 'HIT' : 'MISS') : '',
    ]
  })
  const csv = [headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\n')
  download(`atlas-predict-${new Date().toISOString().slice(0, 10)}.csv`, csv, 'text/csv;charset=utf-8')
}

export function exportMatchesPdf(matches, lang) {
  const dir = lang === 'ar' ? 'rtl' : 'ltr'
  const rows = matches
    .map((m) => {
      const p = m.prediction
      if (!p) return ''
      return `
        <tr>
          <td>${m.date || ''} ${m.time || ''}</td>
          <td>${m.homeTeam} vs ${m.awayTeam}</td>
          <td>${m.league || ''}</td>
          <td>${(p.pHome * 100).toFixed(0)}% / ${(p.pDraw * 100).toFixed(0)}% / ${(p.pAway * 100).toFixed(0)}%</td>
          <td class="tier-${p.tier}">${p.confidence}%</td>
          <td>${OUTCOME_LABEL_STR(p.outcome.pick)}</td>
          <td>${p.overUnder.pick} — ${(p.overUnder.probability * 100).toFixed(0)}%</td>
          <td>${p.btts.pick} — ${(p.btts.probability * 100).toFixed(0)}%</td>
        </tr>`
    })
    .join('')

  const html = `<!doctype html>
<html dir="${dir}" lang="${lang}">
<head>
<meta charset="utf-8" />
<title>ATLAS PREDICT — Report</title>
<style>
  body { font-family: 'Segoe UI', Arial, sans-serif; background: #fff; color: #111; padding: 24px; }
  h1 { color: #8A6E1E; margin-bottom: 4px; }
  .sub { color: #555; margin-bottom: 20px; font-size: 13px; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th, td { border: 1px solid #ccc; padding: 6px 8px; text-align: start; }
  th { background: #f2f2f2; }
  .tier-green { color: #0a7a3d; font-weight: 700; }
  .tier-yellow { color: #9a7a00; font-weight: 700; }
  .tier-red { color: #b3261e; font-weight: 700; }
  @media print { body { padding: 0; } }
</style>
</head>
<body>
  <h1>ATLAS PREDICT</h1>
  <div class="sub">Generated ${new Date().toLocaleString()} — ${matches.length} match(es)</div>
  <table>
    <thead>
      <tr>
        <th>Date</th><th>Match</th><th>League</th><th>1X2</th>
        <th>Confidence</th><th>Market</th><th>O/U 2.5</th><th>BTTS</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
  <script>window.onload = () => setTimeout(() => window.print(), 200)</script>
</body>
</html>`

  const w = window.open('', '_blank')
  if (!w) return
  w.document.open()
  w.document.write(html)
  w.document.close()
}

function OUTCOME_LABEL_STR(pick) {
  return OUTCOME_LABEL[pick] || pick
}
