import { useState } from 'react'
import { Calendar, Plus, Clock } from 'lucide-react'

const plansData = [
  { id: 1, order: 'ORD-2024-089', product: 'قميص رجالي كلاسيك', qty: 1200, start: '2024-08-01', end: '2024-08-15', line: 'الخط الأول', status: 'قيد التنفيذ', progress: 65 },
  { id: 2, order: 'ORD-2024-088', product: 'بنطلون جينز', qty: 850, start: '2024-08-05', end: '2024-08-20', line: 'الخط الثاني', status: 'قيد التنفيذ', progress: 40 },
  { id: 3, order: 'ORD-2024-090', product: 'تيشيرت قطني', qty: 2100, start: '2024-08-10', end: '2024-08-25', line: 'الخط الأول', status: 'مجدول', progress: 0 },
  { id: 4, order: 'ORD-2024-087', product: 'فستان نسائي صيفي', qty: 430, start: '2024-08-01', end: '2024-08-12', line: 'الخط الثالث', status: 'متأخر', progress: 80 },
]

const statusColors = {
  'قيد التنفيذ': 'bg-blue-50 text-blue-700',
  'مجدول': 'bg-gray-50 text-gray-600',
  'متأخر': 'bg-red-50 text-red-700',
  'مكتمل': 'bg-green-50 text-green-700',
}

export default function Planning() {
  const [view, setView] = useState('list')

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-800">التخطيط الإنتاجي</h3>
        <div className="flex gap-3">
          <div className="flex bg-gray-100 rounded-lg p-1">
            <button
              onClick={() => setView('list')}
              className={`px-3 py-1.5 text-xs rounded-md transition-colors ${view === 'list' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500'}`}
            >
              قائمة
            </button>
            <button
              onClick={() => setView('calendar')}
              className={`px-3 py-1.5 text-xs rounded-md transition-colors ${view === 'calendar' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500'}`}
            >
              تقويم
            </button>
          </div>
          <button className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">
            <Plus size={18} />
            خطة جديدة
          </button>
        </div>
      </div>

      {view === 'list' ? (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500">
              <tr>
                <th className="text-right px-5 py-3 font-medium">الطلب</th>
                <th className="text-right px-5 py-3 font-medium">المنتج</th>
                <th className="text-right px-5 py-3 font-medium">الكمية</th>
                <th className="text-right px-5 py-3 font-medium">خط الإنتاج</th>
                <th className="text-right px-5 py-3 font-medium">المدة</th>
                <th className="text-right px-5 py-3 font-medium">التقدم</th>
                <th className="text-right px-5 py-3 font-medium">الحالة</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {plansData.map((plan) => (
                <tr key={plan.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-5 py-3 font-medium text-gray-800">{plan.order}</td>
                  <td className="px-5 py-3 text-gray-600">{plan.product}</td>
                  <td className="px-5 py-3 text-gray-600">{plan.qty.toLocaleString()}</td>
                  <td className="px-5 py-3 text-gray-600">{plan.line}</td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-1 text-gray-500">
                      <Clock size={14} />
                      <span className="text-xs">{plan.start} → {plan.end}</span>
                    </div>
                  </td>
                  <td className="px-5 py-3 w-40">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${plan.status === 'متأخر' ? 'bg-red-500' : 'bg-blue-500'}`}
                          style={{ width: `${plan.progress}%` }}
                        />
                      </div>
                      <span className="text-xs text-gray-500">{plan.progress}%</span>
                    </div>
                  </td>
                  <td className="px-5 py-3">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${statusColors[plan.status]}`}>
                      {plan.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="bg-white p-8 rounded-xl border border-gray-100 shadow-sm text-center">
          <Calendar size={48} className="mx-auto text-gray-300 mb-4" />
          <h4 className="font-semibold text-gray-600">عرض التقويم</h4>
          <p className="text-gray-400 mt-2">سيتم إضافة عرض التقويم التفاعلي قريباً</p>
        </div>
      )}
    </div>
  )
}
