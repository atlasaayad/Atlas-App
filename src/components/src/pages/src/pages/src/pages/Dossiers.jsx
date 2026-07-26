import { useState } from 'react'
import { FileText, Plus, Search } from 'lucide-react'

const dossiersData = [
  { id: 1, name: 'بطاقة تقنية - قميص كلاسيك', code: 'BT-001', version: 'v2.1', date: '2024-07-20', status: 'معتمد' },
  { id: 2, name: 'بطاقة تقنية - بنطلون جينز', code: 'BT-045', version: 'v1.3', date: '2024-07-18', status: 'قيد المراجعة' },
  { id: 3, name: 'بطاقة تقنية - فستان صيفي', code: 'BT-112', version: 'v1.0', date: '2024-07-15', status: 'مسودة' },
  { id: 4, name: 'بطاقة تقنية - جاكيت شتوي', code: 'BT-023', version: 'v3.0', date: '2024-07-10', status: 'معتمد' },
]

const statusColors = {
  'معتمد': 'bg-green-50 text-green-700',
  'قيد المراجعة': 'bg-yellow-50 text-yellow-700',
  'مسودة': 'bg-gray-50 text-gray-600',
}

export default function Dossiers() {
  const [search, setSearch] = useState('')

  const filtered = dossiersData.filter((d) =>
    d.name.includes(search) || d.code.includes(search)
  )

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div className="relative w-full sm:w-96">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
          <input
            type="text"
            placeholder="البحث في البطاقات التقنية..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pr-10 pl-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-blue-500"
          />
        </div>
        <button className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">
          <Plus size={18} />
          بطاقة جديدة
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500">
            <tr>
              <th className="text-right px-5 py-3 font-medium">البطاقة التقنية</th>
              <th className="text-right px-5 py-3 font-medium">الكود</th>
              <th className="text-right px-5 py-3 font-medium">الإصدار</th>
              <th className="text-right px-5 py-3 font-medium">آخر تحديث</th>
              <th className="text-right px-5 py-3 font-medium">الحالة</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.map((d) => (
              <tr key={d.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-5 py-3">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 bg-blue-50 rounded-lg flex items-center justify-center text-blue-600">
                      <FileText size={18} />
                    </div>
                    <span className="font-medium text-gray-800">{d.name}</span>
                  </div>
                </td>
                <td className="px-5 py-3 text-gray-500 font-mono text-xs">{d.code}</td>
                <td className="px-5 py-3 text-gray-600">{d.version}</td>
                <td className="px-5 py-3 text-gray-500">{d.date}</td>
                <td className="px-5 py-3">
                  <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${statusColors[d.status]}`}>
                    {d.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
