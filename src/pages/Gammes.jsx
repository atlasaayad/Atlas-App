import { useState } from 'react'
import { Factory, Plus, Clock, ArrowRight } from 'lucide-react'

const gammesData = [
  {
    id: 1,
    product: 'قميص رجالي كلاسيك',
    code: 'SH-2024-001',
    steps: [
      { name: 'قص القماش', time: 15, machine: 'ماكينة القص', order: 1 },
      { name: 'خياطة الأكتاف', time: 25, machine: 'ماكينة خياطة', order: 2 },
      { name: 'تركيب الأزرار', time: 10, machine: 'ماكينة أزرار', order: 3 },
      { name: 'كي وتعبئة', time: 8, machine: 'مكواة', order: 4 },
    ],
  },
  {
    id: 2,
    product: 'بنطلون جينز',
    code: 'JN-2024-045',
    steps: [
      { name: 'قص الجيوب', time: 20, machine: 'ماكينة القص', order: 1 },
      { name: 'خياطة الساقين', time: 35, machine: 'ماكينة خياطة', order: 2 },
      { name: 'تركيب السحاب', time: 15, machine: 'ماكينة سحاب', order: 3 },
      { name: 'غسيل وتجهيز', time: 45, machine: 'غسالة صناعية', order: 4 },
    ],
  },
]

export default function Gammes() {
  const [expanded, setExpanded] = useState(1)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-800">تفصيل العمليات الإنتاجية</h3>
        <button className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">
          <Plus size={18} />
          عملية جديدة
        </button>
      </div>

      <div className="space-y-4">
        {gammesData.map((gamme) => (
          <div key={gamme.id} className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <button
              onClick={() => setExpanded(expanded === gamme.id ? null : gamme.id)}
              className="w-full p-5 flex items-center justify-between hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-purple-50 rounded-lg flex items-center justify-center text-purple-600">
                  <Factory size={20} />
                </div>
                <div className="text-right">
                  <h4 className="font-semibold text-gray-800">{gamme.product}</h4>
                  <p className="text-xs text-gray-400">{gamme.code}</p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <span className="text-sm text-gray-500">
                  {gamme.steps.length} خطوات
                </span>
                <ArrowRight
                  size={18}
                  className={`text-gray-400 transition-transform ${expanded === gamme.id ? 'rotate-90' : ''}`}
                />
              </div>
            </button>

            {expanded === gamme.id && (
              <div className="px-5 pb-5">
                <div className="border-r-2 border-blue-200 mr-4 space-y-4">
                  {gamme.steps.map((step, idx) => (
                    <div key={idx} className="relative mr-6">
                      <div className="absolute -right-[29px] top-1 w-4 h-4 bg-blue-500 rounded-full border-4 border-white shadow-sm" />
                      <div className="bg-gray-50 rounded-lg p-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium text-gray-800">{step.name}</p>
                            <p className="text-xs text-gray-400 mt-1">{step.machine}</p>
                          </div>
                          <div className="flex items-center gap-1 text-gray-500">
                            <Clock size={14} />
                            <span className="text-sm">{step.time} دقيقة</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-4 mr-4 flex items-center gap-2 text-sm text-gray-500">
                  <Clock size={16} />
                  <span>الوقت الإجمالي: {gamme.steps.reduce((acc, s) => acc + s.time, 0)} دقيقة</span>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

