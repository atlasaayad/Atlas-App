import { useState } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts'
import { Download, FileText } from 'lucide-react'

const monthlyData = [
  { month: 'يناير', production: 42000, defects: 520 },
  { month: 'فبراير', production: 45000, defects: 480 },
  { month: 'مارس', production: 48000, defects: 410 },
  { month: 'أبريل', production: 51000, defects: 390 },
  { month: 'مايو', production: 49000, defects: 450 },
  { month: 'يونيو', production: 55000, defects: 380 },
  { month: 'يوليو', production: 58000, defects: 350 },
]

const reportsList = [
  { id: 1, name: 'تقرير الإنتاج الشهري - يوليو 2024', date: '2024-08-01', type: 'إنتاج', size: '2.4 MB' },
  { id: 2, name: 'تقرير الجودة الأسبوعي', date: '2024-07-28', type: 'جودة', size: '1.8 MB' },
  { id: 3, name: 'تحليل كفاءة خطوط الإنتاج', date: '2024-07-25', type: 'كفاءة', size: '3.1 MB' },
  { id: 4, name: 'تقرير العيوب والمخالفات', date: '2024-07-20', type: 'جودة', size: '1.2 MB' },
]

export default function Reports() {
  const [chartType, setChartType] = useState('production')

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-800">التقارير والإحصائيات</h3>
        <button className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">
          <Download size={18} />
          تصدير التقرير
        </button>
      </div>

      <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
        <div className="flex items-center justify-between mb-6">
          <h4 className="font-semibold text-gray-800">الأداء الشهري</h4>
          <div className="flex bg-gray-100 rounded-lg p-1">
            <button
              onClick={() => setChartType('production')}
              className={`px-3 py-1.5 text-xs rounded-md transition-colors ${chartType === 'production' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500'}`}
            >
              الإنتاج
            </button>
            <button
              onClick={() => setChartType('defects')}
              className={`px-3 py-1.5 text-xs rounded-md transition-colors ${chartType === 'defects' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500'}`}
            >
              العيوب
            </button>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={300}>
          {chartType === 'production' ? (
            <BarChart data={monthlyData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
              <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: '#9ca3af', fontSize: 12 }} />
              <YAxis axisLine={false} tickLine={false} tick={{ fill: '#9ca3af', fontSize: 12 }} />
              <Tooltip contentStyle={{ borderRadius: 8, border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
              <Bar dataKey="production" fill="#3b82f6" radius={[6, 6, 0, 0]} name="الإنتاج" />
            </BarChart>
          ) : (
            <LineChart data={monthlyData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
              <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: '#9ca3af', fontSize: 12 }} />
              <YAxis axisLine={false} tickLine={false} tick={{ fill: '#9ca3af', fontSize: 12 }} />
              <Tooltip contentStyle={{ borderRadius: 8, border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
              <Line type="monotone" dataKey="defects" stroke="#ef4444" strokeWidth={3} dot={{ r: 4, fill: '#ef4444' }} name="العيوب" />
            </LineChart>
          )}
        </ResponsiveContainer>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-gray-100">
          <h4 className="font-semibold text-gray-800">التقارير المحفوظة</h4>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500">
            <tr>
              <th className="text-right px-5 py-3 font-medium">التقرير</th>
              <th className="text-right px-5 py-3 font-medium">النوع</th>
              <th className="text-right px-5 py-3 font-medium">التاريخ</th>
              <th className="text-right px-5 py-3 font-medium">الحجم</th>
              <th className="text-right px-5 py-3 font-medium">تحميل</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {reportsList.map((report) => (
              <tr key={report.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-5 py-3">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 bg-blue-50 rounded-lg flex items-center justify-center text-blue-600">
                      <FileText size={18} />
                    </div>
                    <span className="font-medium text-gray-800">{report.name}</span>
                  </div>
                </td>
                <td className="px-5 py-3 text-gray-600">{report.type}</td>
                <td className="px-5 py-3 text-gray-500">{report.date}</td>
                <td className="px-5 py-3 text-gray-500">{report.size}</td>
                <td className="px-5 py-3">
                  <button className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                    <Download size={16} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
