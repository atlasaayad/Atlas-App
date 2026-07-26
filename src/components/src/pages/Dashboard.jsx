import { useState } from 'react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
} from 'recharts'
import { TrendingUp, TrendingDown, Package, AlertTriangle, CheckCircle } from 'lucide-react'

const weeklyData = [
  { day: 'السبت', production: 420 },
  { day: 'الأحد', production: 380 },
  { day: 'الإثنين', production: 510 },
  { day: 'الثلاثاء', production: 470 },
  { day: 'الأربعاء', production: 620 },
  { day: 'الخميس', production: 580 },
  { day: 'الجمعة', production: 350 },
]

const statusData = [
  { name: 'قيد التنفيذ', value: 65, color: '#3b82f6' },
  { name: 'مكتمل', value: 25, color: '#22c55e' },
  { name: 'متأخر', value: 10, color: '#ef4444' },
]

const efficiencyData = [
  { hour: '08:00', line1: 82, line2: 78 },
  { hour: '10:00', line1: 88, line2: 85 },
  { hour: '12:00', line1: 91, line2: 89 },
  { hour: '14:00', line1: 87, line2: 92 },
  { hour: '16:00', line1: 85, line2: 88 },
  { hour: '18:00', line1: 79, line2: 82 },
]

const stats = [
  {
    label: 'الإنتاج اليومي',
    value: '2,450',
    unit: 'قطعة',
    change: '+12%',
    trend: 'up',
    icon: Package,
    color: 'bg-blue-500',
  },
  {
    label: 'كفاءة الخط',
    value: '87.3',
    unit: '%',
    change: '+3.2%',
    trend: 'up',
    icon: CheckCircle,
    color: 'bg-green-500',
  },
  {
    label: 'معدل العيوب',
    value: '1.2',
    unit: '%',
    change: '+0.3%',
    trend: 'down',
    icon: AlertTriangle,
    color: 'bg-red-500',
  },
  {
    label: 'الطلبات النشطة',
    value: '18',
    unit: 'طلب',
    change: '3 جديدة',
    trend: 'up',
    icon: Package,
    color: 'bg-purple-500',
  },
]

export default function Dashboard() {
  const [period, setPeriod] = useState('week')

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat, idx) => {
          const Icon = stat.icon
          const TrendIcon = stat.trend === 'up' ? TrendingUp : TrendingDown
          const trendColor = stat.trend === 'up' ? 'text-green-600' : 'text-red-500'
          return (
            <div
              key={idx}
              className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-gray-400">{stat.label}</p>
                  <p className="text-2xl font-bold text-gray-800 mt-1">
                    {stat.value}
                    <span className="text-sm font-normal text-gray-400 mr-1">{stat.unit}</span>
                  </p>
                </div>
                <div className={`w-10 h-10 ${stat.color} rounded-lg flex items-center justify-center text-white`}>
                  <Icon size={20} />
                </div>
              </div>
              <div className={`flex items-center gap-1 mt-3 text-xs ${trendColor}`}>
                <TrendIcon size={14} />
                <span>{stat.change}</span>
                <span className="text-gray-400 mr-1">عن الفترة السابقة</span>
              </div>
            </div>
          )
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <h3 className="font-semibold text-gray-800">الإنتاج الأسبوعي</h3>
            <div className="flex bg-gray-100 rounded-lg p-1">
              {['day', 'week', 'month'].map((p) => (
                <button
                  key={p}
                  onClick={() => setPeriod(p)}
                  className={`px-3 py-1 text-xs rounded-md transition-colors ${
                    period === p ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500'
                  }`}
                >
                  {p === 'day' ? 'يومي' : p === 'week' ? 'أسبوعي' : 'شهري'}
                </button>
              ))}
            </div>
          </div>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={weeklyData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
              <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fill: '#9ca3af', fontSize: 12 }} />
              <YAxis axisLine={false} tickLine={false} tick={{ fill: '#9ca3af', fontSize: 12 }} />
              <Tooltip
                contentStyle={{ borderRadius: 8, border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
              />
              <Bar dataKey="production" fill="#3b82f6" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
          <h3 className="font-semibold text-gray-800 mb-6">حالة الطلبات</h3>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie
                data={statusData}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={80}
                paddingAngle={4}
                dataKey="value"
              >
                {statusData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
          <div className="space-y-3 mt-4">
            {statusData.map((item) => (
              <div key={item.name} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }} />
                  <span className="text-sm text-gray-600">{item.name}</span>
                </div>
                <span className="text-sm font-semibold">{item.value}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
        <h3 className="font-semibold text-gray-800 mb-6">كفاءة خطوط الإنتاج</h3>
        <ResponsiveContainer width="100%" height={250}>
          <LineChart data={efficiencyData}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
            <XAxis dataKey="hour" axisLine={false} tickLine={false} tick={{ fill: '#9ca3af', fontSize: 12 }} />
            <YAxis axisLine={false} tickLine={false} tick={{ fill: '#9ca3af', fontSize: 12 }} domain={[60, 100]} />
            <Tooltip
              contentStyle={{ borderRadius: 8, border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
            />
            <Line type="monotone" dataKey="line1" stroke="#3b82f6" strokeWidth={3} dot={{ r: 4, fill: '#3b82f6' }} name="الخط الأول" />
            <Line type="monotone" dataKey="line2" stroke="#22c55e" strokeWidth={3} dot={{ r: 4, fill: '#22c55e' }} name="الخط الثاني" />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
