import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

const weeklyData = [
  { day: 'السبت', production: 420 },
  { day: 'الأحد', production: 380 },
  { day: 'الإثنين', production: 510 },
  { day: 'الثلاثاء', production: 470 },
  { day: 'الأربعاء', production: 620 },
  { day: 'الخميس', production: 580 },
  { day: 'الجمعة', production: 350 },
]

export default function Dashboard() {
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-gray-900 mb-6">لوحة التحكم</h2>
      
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'الإنتاج اليومي', value: '2,450', unit: 'قطعة', color: 'bg-blue-500' },
          { label: 'كفاءة الخط', value: '87.3%', color: 'bg-green-500' },
          { label: 'معدل العيوب', value: '1.2%', color: 'bg-red-500' },
          { label: 'الطلبات النشطة', value: '18', color: 'bg-purple-500' },
        ].map((stat) => (
          <div key={stat.label} className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm">
            <div className={`w-3 h-3 rounded-full ${stat.color} mb-3`} />
            <p className="text-sm text-gray-400">{stat.label}</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{stat.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
        <h3 className="font-semibold mb-4">الإنتاج الأسبوعي</h3>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={weeklyData}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
            <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fill: '#9ca3af', fontSize: 12 }} />
            <YAxis axisLine={false} tickLine={false} tick={{ fill: '#9ca3af', fontSize: 12 }} />
            <Tooltip contentStyle={{ borderRadius: 8, border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
            <Bar dataKey="production" fill="#3b82f6" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

