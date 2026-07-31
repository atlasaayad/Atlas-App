import { ShieldCheck, AlertTriangle, CheckCircle, XCircle } from 'lucide-react'

const inspectionsData = [
  { id: 1, batch: 'BT-001-A', product: 'قميص رجالي', qty: 200, passed: 195, failed: 5, status: 'مقبول' },
  { id: 2, batch: 'BT-045-B', product: 'بنطلون جينز', qty: 150, passed: 142, failed: 8, status: 'مقبول بشروط' },
  { id: 3, batch: 'BT-112-A', product: 'فستان نسائي', qty: 100, passed: 88, failed: 12, status: 'مرفوض' },
  { id: 4, batch: 'BT-023-C', product: 'جاكيت شتوي', qty: 120, passed: 118, failed: 2, status: 'مقبول' },
]

const statusColors = {
  'مقبول': 'bg-green-50 text-green-700',
  'مقبول بشروط': 'bg-yellow-50 text-yellow-700',
  'مرفوض': 'bg-red-50 text-red-700',
}

const defectTypes = [
  { type: 'خياطة غير منتظمة', count: 15, severity: 'عالي' },
  { type: 'لون غير متطابق', count: 8, severity: 'متوسط' },
  { type: 'قياس غير صحيح', count: 6, severity: 'عالي' },
  { type: 'بقع قماش', count: 4, severity: 'منخفض' },
]

export default function Quality() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-800">مراقبة الجودة</h3>
        <button className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">
          <ShieldCheck size={18} />
          فحص جديد
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-green-50 rounded-lg flex items-center justify-center text-green-600">
              <CheckCircle size={20} />
            </div>
            <div>
              <p className="text-sm text-gray-400">نسبة القبول</p>
              <p className="text-xl font-bold text-gray-800">94.2%</p>
            </div>
          </div>
        </div>
        <div className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-red-50 rounded-lg flex items-center justify-center text-red-600">
              <XCircle size={20} />
            </div>
            <div>
              <p className="text-sm text-gray-400">القطع المرفوضة</p>
              <p className="text-xl font-bold text-gray-800">27</p>
            </div>
          </div>
        </div>
        <div className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-yellow-50 rounded-lg flex items-center justify-center text-yellow-600">
              <AlertTriangle size={20} />
            </div>
            <div>
              <p className="text-sm text-gray-400">فحوصات اليوم</p>
              <p className="text-xl font-bold text-gray-800">12</p>
            </div>
          </div>
        </div>
        <div className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center text-blue-600">
              <ShieldCheck size={20} />
            </div>
            <div>
              <p className="text-sm text-gray-400">تقارير الجودة</p>
              <p className="text-xl font-bold text-gray-800">48</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="p-5 border-b border-gray-100">
            <h4 className="font-semibold text-gray-800">آخر الفحوصات</h4>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500">
              <tr>
                <th className="text-right px-5 py-3 font-medium">الدفعة</th>
                <th className="text-right px-5 py-3 font-medium">المنتج</th>
                <th className="text-right px-5 py-3 font-medium">الكمية</th>
                <th className="text-right px-5 py-3 font-medium">مقبول/مرفوض</th>
                <th className="text-right px-5 py-3 font-medium">الحالة</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {inspectionsData.map((insp) => (
                <tr key={insp.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-5 py-3 font-medium text-gray-800">{insp.batch}</td>
                  <td className="px-5 py-3 text-gray-600">{insp.product}</td>
                  <td className="px-5 py-3 text-gray-600">{insp.qty}</td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <span className="text-green-600 text-xs">{insp.passed}✓</span>
                      <span className="text-red-500 text-xs">{insp.failed}✗</span>
                    </div>
                  </td>
                  <td className="px-5 py-3">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${statusColors[insp.status]}`}>
                      {insp.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm">
          <h4 className="font-semibold text-gray-800 mb-4">أنواع العيوب</h4>
          <div className="space-y-4">
            {defectTypes.map((defect, idx) => (
              <div key={idx}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-gray-700">{defect.type}</span>
                  <span className="font-semibold text-gray-800">{defect.count}</span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${
                      defect.severity === 'عالي' ? 'bg-red-500' : defect.severity === 'متوسط' ? 'bg-yellow-500' : 'bg-blue-400'
                    }`}
                    style={{ width: `${(defect.count / 20) * 100}%` }}
                  />
                </div>
                <span className={`text-xs mt-0.5 inline-block ${
                  defect.severity === 'عالي' ? 'text-red-600' : defect.severity === 'متوسط' ? 'text-yellow-600' : 'text-blue-500'
                }`}>
                  خطورة: {defect.severity}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
