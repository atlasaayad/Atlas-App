import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts'
import { PageHeader, StatusBadge } from '../components/PageHeader.jsx'
import { qualityBatches, defectTypes } from '../data/mockData.js'

export default function Quality() {
  return (
    <div>
      <PageHeader
        eyebrow="Inspection"
        title="Quality"
        description="AQL batch inspections and the defect types driving rejections."
      />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">
        <div className="card overflow-hidden xl:col-span-3">
          <div className="overflow-x-auto">
            <table className="table-shell">
              <thead>
                <tr>
                  <th>Batch</th>
                  <th>Product</th>
                  <th>Inspected</th>
                  <th>Defects</th>
                  <th>Level</th>
                  <th>Result</th>
                </tr>
              </thead>
              <tbody>
                {qualityBatches.map((b) => (
                  <tr key={b.batch}>
                    <td className="font-mono text-xs text-indigo-700">{b.batch}</td>
                    <td className="text-ink">{b.product}</td>
                    <td className="text-ink-soft">{b.inspected}</td>
                    <td className="text-ink-soft">{b.defects}</td>
                    <td className="text-ink-soft">{b.level}</td>
                    <td>
                      <StatusBadge status={b.aql} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card p-5 xl:col-span-2">
          <h3 className="font-display font-semibold text-ink mb-1">Defects by type</h3>
          <p className="text-xs text-ink-faint mb-4">Last 7 days, all lines</p>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={defectTypes} layout="vertical" margin={{ left: 8 }}>
              <CartesianGrid stroke="#E4E3DD" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 11, fill: '#8A90A0' }} axisLine={false} tickLine={false} />
              <YAxis
                type="category"
                dataKey="type"
                width={110}
                tick={{ fontSize: 11, fill: '#4A5163' }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip contentStyle={{ borderRadius: 10, borderColor: '#E4E3DD', fontSize: 13 }} />
              <Bar dataKey="count" fill="#C6493F" radius={[0, 6, 6, 0]} barSize={16} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}
