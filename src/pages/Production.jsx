import { BarChart3, Clock, Package, TrendingUp, AlertTriangle } from 'lucide-react'

const trackingData = [
  { id: 1, line: 'الخط الأول', product: 'قميص رجالي', target: 500, actual: 450, defect: 12, efficiency: 90 },
  { id: 2, line: 'الخط الثاني', product: 'بنطلون جينز', target: 350, actual: 320, defect: 8, efficiency: 91 },
  { id: 3, line: 'الخط الثالث', product: 'فستان نسائي', target: 200, actual: 0, defect: 0, efficiency: 0 },
  { id: 4, line: 'الخط الرابع', product: 'تيشيرت قطني', target: 300, actual: 280, defect: 5, efficiency: 93 },
]

export default function Production() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-800">متابعة الإنتاج لحظياً</h3>
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Clock size={16} />
          <span>آخر تحديث: منذ 5 دقائق</span>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center text-blue-600">
              <Package size={20} />
            </div>
            <div>
              <p className="text-sm text-gray-400">الإنتاج الفعلي اليوم</p>
              <p className="text-xl font-bold text-gray-800">1,050 قطعة</p>
            </div>
          </div>
        </div>
        <div className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-green-50 rounded-lg flex items-center justify-center text-green-600">
              <TrendingUp size={20} />
            </div>
            <div>
              <p className="text-sm text-gray-400">متوسط الكفاءة</p>
              <p className="text-xl font-bold text-gray-800">91.3%</p>
            </div>
          </div>
        </div>
        <div className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-red-50 rounded-lg flex items-center justify-center text-red-600">
              <AlertTriangle size={20} />
            </div>
            <div>
              <p className="text-sm text-gray-400">إجمالي العيوب</p>
              <p className="text-xl font-bold text-gray-800">25 قطعة</p>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500">
            <tr>
              <th className="text-right px-5 py-3 font-medium">خط الإنتاج</th>
              <th className="text-right px-5 py-3 font-medium">المنتج الحالي</th>
              <th className="text-right px-5 py-3 font-medium">الهدف</th>
              <th className="text-right px-5 py-3 font-medium">الفعلي</th>
              <th className="text-right px-5 py-3 font-medium">العيوب</th>
              <th className="text-right px-5 py-3 font-medium">الكفاءة</th>
              <th className="text-right px-5 py-3 font-medium">التقدم</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {trackingData.map((line) => (
              <tr key={line.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-5 py-3 font-medium text-gray-800">{line.line}</td>
                <td className="px-5 py-3 text-gray-600">{line.product}</td>
                <td className="px-5 py-3 text-gray-600">{line.target}</td>
                <td className="px-5 py-3 text-gray-600 font-semibold">{line.actual}</td>
                <td className="px-5 py-3">
                  <span className={`${line.defect > 10 ? 'text-red-600' : 'text-gray-600'}`}>
                    {line.defect}
                  </span>
                </td>
                <td className="px-5 py-3">
                  <span className={`font-semibold ${line.efficiency >= 90 ? 'text-green-600' : line.efficiency >= 70 ? 'text-yellow-600' : 'text-red-600'}`}>
                    {line.efficiency}%
                  </span>
                </td>
                <td className="px-5 py-3 w-32">
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${line.efficiency >= 90 ? 'bg-green-500' : line.efficiency >= 70 ? 'bg-yellow-500' : 'bg-red-500'}`}
                      style={{ width: `${Math.min((line.actual / line.target) * 100, 100)}%` }}
                    />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

