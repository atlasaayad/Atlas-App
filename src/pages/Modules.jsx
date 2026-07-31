import { Factory, Plus, Users, TrendingUp, AlertCircle } from 'lucide-react'

const modulesData = [
  { id: 1, name: 'الخط الأول - قص وخياطة', workers: 12, efficiency: 92, status: 'يعمل', output: 450, target: 500 },
  { id: 2, name: 'الخط الثاني - تجميع', workers: 8, efficiency: 87, status: 'يعمل', output: 320, target: 350 },
  { id: 3, name: 'الخط الثالث - تجهيز نهائي', workers: 6, efficiency: 78, status: 'صيانة', output: 0, target: 200 },
  { id: 4, name: 'الخط الرابع - تطريز', workers: 10, efficiency: 95, status: 'يعمل', output: 280, target: 300 },
]

const statusColors = {
  'يعمل': 'bg-green-50 text-green-700',
  'صيانة': 'bg-red-50 text-red-700',
  'متوقف': 'bg-gray-50 text-gray-600',
}

export default function Modules() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-800">خطوط الإنتاج</h3>
        <button className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">
          <Plus size={18} />
          خط جديد
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {modulesData.map((module) => (
          <div key={module.id} className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-orange-50 rounded-lg flex items-center justify-center text-orange-600">
                  <Factory size={20} />
                </div>
                <div>
                  <h4 className="font-semibold text-gray-800">{module.name}</h4>
                  <span className={`inline-block mt-1 px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[module.status]}`}>
                    {module.status}
                  </span>
                </div>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-3 gap-3">
              <div className="text-center">
                <div className="flex items-center justify-center gap-1 text-gray-400 mb-1">
                  <Users size={14} />
                </div>
                <p className="text-lg font-bold text-gray-800">{module.workers}</p>
                <p className="text-xs text-gray-400">عامل</p>
              </div>
              <div className="text-center">
                <div className="flex items-center justify-center gap-1 text-gray-400 mb-1">
                  <TrendingUp size={14} />
                </div>
                <p className="text-lg font-bold text-gray-800">{module.efficiency}%</p>
                <p className="text-xs text-gray-400">كفاءة</p>
              </div>
              <div className="text-center">
                <div className="flex items-center justify-center gap-1 text-gray-400 mb-1">
                  <Factory size={14} />
                </div>
                <p className="text-lg font-bold text-gray-800">{module.output}</p>
                <p className="text-xs text-gray-400">إنتاج</p>
              </div>
            </div>

            {module.status === 'يعمل' && (
              <div className="mt-4">
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-gray-500">التقدم نحو الهدف</span>
                  <span className="font-medium">{Math.round((module.output / module.target) * 100)}%</span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-500 rounded-full transition-all"
                    style={{ width: `${Math.min((module.output / module.target) * 100, 100)}%` }}
                  />
                </div>
              </div>
            )}

            {module.status === 'صيانة' && (
              <div className="mt-4 flex items-center gap-2 p-3 bg-red-50 rounded-lg text-red-700 text-sm">
                <AlertCircle size={16} />
                <span>الخط متوقف للصيانة الدورية</span>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

