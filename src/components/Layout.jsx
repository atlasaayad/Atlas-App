import { Outlet, Link, useLocation } from 'react-router-dom'
import {
  LayoutDashboard,
  Package,
  FileText,
  Settings as SettingsIcon,
  Factory,
  Calendar,
  BarChart3,
  ShieldCheck,
  LineChart,
  Sparkles,
  Bell,
  Search,
  Menu,
  X
} from 'lucide-react'
import { useState } from 'react'

const navItems = [
  { path: '/', label: 'لوحة التحكم', icon: LayoutDashboard },
  { path: '/products', label: 'المنتجات', icon: Package },
  { path: '/dossiers', label: 'الملفات التقنية', icon: FileText },
  { path: '/gammes', label: 'تفصيل العمليات', icon: Factory },
  { path: '/modules', label: 'خطوط الإنتاج', icon: Factory },
  { path: '/planning', label: 'التخطيط', icon: Calendar },
  { path: '/production', label: 'متابعة الإنتاج', icon: BarChart3 },
  { path: '/quality', label: 'الجودة', icon: ShieldCheck },
  { path: '/reports', label: 'التقارير', icon: LineChart },
  { path: '/ai-copilot', label: 'المساعد الذكي', icon: Sparkles },
  { path: '/settings', label: 'الإعدادات', icon: SettingsIcon },
]

export default function Layout() {
  const location = useLocation()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <div className="flex h-screen bg-gray-50" dir="rtl">
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        className={`fixed lg:static inset-y-0 right-0 z-50 w-72 bg-white border-l border-gray-200 flex flex-col transform transition-transform duration-300 lg:transform-none ${
          sidebarOpen ? 'translate-x-0' : 'translate-x-full lg:translate-x-0'
        }`}
      >
        <div className="p-6 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-blue-700">Atlas App</h1>
            <p className="text-xs text-gray-400 mt-1">إدارة إنتاج الملابس</p>
          </div>
          <button
            className="lg:hidden p-2 text-gray-400"
            onClick={() => setSidebarOpen(false)}
          >
            <X size={20} />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto p-4 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon
            const isActive = location.pathname === item.path
            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => setSidebarOpen(false)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                <Icon size={18} />
                {item.label}
              </Link>
            )
          })}
        </nav>

        <div className="p-4 border-t border-gray-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 text-sm font-bold">
              م
            </div>
            <div>
              <p className="text-sm font-medium">مدير المصنع</p>
              <p className="text-xs text-gray-400">متصل الآن</p>
            </div>
          </div>
        </div>
      </aside>

      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-4 lg:px-8 shrink-0">
          <div className="flex items-center gap-4">
            <button
              className="lg:hidden p-2 text-gray-400 hover:text-gray-600"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu size={20} />
            </button>
            <h2 className="text-lg font-semibold text-gray-800">
              {navItems.find((i) => i.path === location.pathname)?.label || 'Atlas App'}
            </h2>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden md:flex items-center bg-gray-100 rounded-lg px-3 py-1.5">
              <Search size={16} className="text-gray-400" />
              <input
                type="text"
                placeholder="بحث..."
                className="bg-transparent border-none outline-none text-sm mr-2 w-48"
              />
            </div>
            <button className="relative p-2 text-gray-400 hover:text-gray-600">
              <Bell size={20} />
              <span className="absolute top-1 left-1 w-2 h-2 bg-red-500 rounded-full" />
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-auto p-4 lg:p-8">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
