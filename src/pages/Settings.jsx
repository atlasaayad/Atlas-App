import { useState } from 'react'
import { Save, Factory, Bell, Shield, Palette } from 'lucide-react'

export default function Settings() {
  const [activeTab, setActiveTab] = useState('general')

  const tabs = [
    { id: 'general', label: 'عام', icon: Factory },
    { id: 'notifications', label: 'الإشعارات', icon: Bell },
    { id: 'security', label: 'الأمان', icon: Shield },
    { id: 'appearance', label: 'المظهر', icon: Palette },
  ]

  return (
    <div className="max-w-3xl">
      <h3 className="text-lg font-semibold text-gray-800 mb-6">إعدادات النظام</h3>

      <div className="flex gap-6">
        <div className="w-48 shrink-0 space-y-1">
          {tabs.map((tab) => {
            const Icon = tab.icon
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors text-right ${
                  activeTab === tab.id
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                <Icon size={18} />
                {tab.label}
              </button>
            )
          })}
        </div>

        <div className="flex-1 bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
          {activeTab === 'general' && (
            <div className="space-y-5">
              <h4 className="font-semibold text-gray-800">إعدادات المصنع</h4>
              <div>
                <label className="block text-sm text-gray-600 mb-1.5">اسم المصنع</label>
                <input
                  type="text"
                  defaultValue="مصنع الأطلس للملابس"
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1.5">العنوان</label>
                <input
                  type="text"
                  defaultValue="الدار البيضاء، المغرب"
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-blue-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-600 mb-1.5">المنطقة الزمنية</label>
                  <select className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-blue-500">
                    <option>توقيت الرباط (GMT+1)</option>
                    <option>توقيت غرينتش (GMT)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1.5">اللغة</label>
                  <select className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-blue-500">
                    <option>العربية</option>
                    <option>English</option>
                    <option>Français</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'notifications' && (
            <div className="space-y-5">
              <h4 className="font-semibold text-gray-800">إعدادات الإشعارات</h4>
              {[
                { label: 'تنبيهات الإنتاج المنخفض', desc: 'إشعار عند انخفاض الإنتاج عن المستهدف' },
                { label: 'تنبيهات الجودة', desc: 'إشعار عند ارتفاع نسبة العيوب' },
                { label: 'تنبيهات المواعيد النهائية', desc: 'إشعار قبل موعد التسليم بـ 48 ساعة' },
                { label: 'تقارير يومية', desc: 'إرسال ملخص يومي عبر البريد' },
              ].map((item, idx) => (
                <div key={idx} className="flex items-center justify-between py-2">
                  <div>
                    <p className="text-sm font-medium text-gray-800">{item.label}</p>
                    <p className="text-xs text-gray-400">{item.desc}</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" defaultChecked className="sr-only peer" />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:right-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600" />
                  </label>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'security' && (
            <div className="space-y-5">
              <h4 className="font-semibold text-gray-800">الأمان</h4>
              <div>
                <label className="block text-sm text-gray-600 mb-1.5">كلمة المرور الحالية</label>
                <input type="password" className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-blue-500" />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1.5">كلمة المرور الجديدة</label>
                <input type="password" className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-blue-500" />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1.5">تأكيد كلمة المرور</label>
                <input type="password" className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-blue-500" />
              </div>
            </div>
          )}

          {activeTab === 'appearance' && (
            <div className="space-y-5">
              <h4 className="font-semibold text-gray-800">المظهر</h4>
              <div>
                <label className="block text-sm text-gray-600 mb-3">السمة</label>
                <div className="flex gap-3">
                  <button className="flex-1 p-4 border-2 border-blue-500 rounded-xl bg-white">
                    <div className="w-full h-8 bg-white border border-gray-200 rounded mb-2" />
                    <span className="text-sm">فاتح</span>
                  </button>
                  <button className="flex-1 p-4 border border-gray-200 rounded-xl bg-gray-50 opacity-50">
                    <div className="w-full h-8 bg-gray-800 rounded mb-2" />
                    <span className="text-sm">داكن</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          <div className="mt-6 pt-4 border-t border-gray-100">
            <button className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">
              <Save size={18} />
              حفظ التغييرات
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
