import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts'
import { PageHeader } from '../components/PageHeader.jsx'
import { productionLines } from '../data/mockData.js'

export default function Production() {
  return (
    <div>
      <PageHeader
        eyebrow="Live floor"
        title="Production"
        description="Target versus actual output by line, updated hourly from workstation scans."
      />

      <div className="card p-5 mb-4">
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={productionLines} barGap={6}>
            <CartesianGrid stroke="#E4E3DD" vertical={false} />
            <XAxis dataKey="line" tick={{ fontSize: 12, fill: '#8A90A0' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 12, fill: '#8A90A0' }} axisLine={false} tickLine={false} width={40} />
            <Tooltip contentStyle={{ borderRadius: 10, borderColor: '#E4E3DD', fontSize: 13 }} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="target" name="Target" fill="#D6E0F2" radius={[6, 6, 0, 0]} />
            <Bar dataKey="actual" name="Actual" fill="#2B4C7E" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="table-shell">
            <thead>
              <tr>
                <th>Line</th>
                <th>Current order</th>
                <th>Target (today)</th>
                <th>Actual</th>
                <th>Efficiency</th>
              </tr>
            </thead>
            <tbody>
              {productionLines.map((l) => (
                <tr key={l.line}>
                  <td className="font-medium text-ink">{l.line}</td>
                  <td className="font-mono text-xs text-indigo-700">{l.order}</td>
                  <td className="text-ink-soft">{l.target.toLocaleString()}</td>
                  <td className="text-ink-soft">{l.actual.toLocaleString()}</td>
                  <td>
                    <span
                      className={`badge ${
                        l.efficiency >= 85 ? 'badge-good' : l.efficiency >= 75 ? 'badge-warn' : 'badge-bad'
                      }`}
                    >
                      {l.efficiency}%
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
