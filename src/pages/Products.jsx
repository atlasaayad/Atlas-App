import { useState } from 'react'
import { Search, Plus } from 'lucide-react'

const productsData = [
  { id: 1, name: 'قميص رجالي كلاسيك', code: 'SH-2024-001', category: 'قمصان', price: 120, stock: 1200, status: 'نشط' },
  { id: 2, name: 'بنطلون جينز', code: 'JN-2024-045', category: 'بناطيل', price: 180, stock: 850, status: 'قيد التصنيع' },
  { id: 3, name: 'فستان نسائي صيفي', code: 'DR-2024-112', category: 'فساتين', price: 250, stock: 430, status: 'جديد' },
  { id: 4, name: 'جاكيت شتوي', code: 'JK-2024-023', category: 'جواكيت', price: 350, stock: 600, status: 'نشط' },
  { id: 5, name: 'تيشيرت قطني', code: 'TS-2024-067', category: 'تيشيرتات', price: 80, stock: 2100, status: 'نشط' },
]

const statusColors = {
  'نشط': 'bg-green-50 text-green-700',
  'قيد التصنيع': 'bg-yellow-50 text-yellow-700',
  'جديد': 'bg-blue-50 text-blue-700',
}

export default function Products() {
  const [search, setSearch] = useState('')

  const filtered = productsData.filter((p) =>
    p.name.includes(search) || p.code.includes(search)
  )

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div className="relative w-full sm:w-96">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
          <input
            type="text"
            placeholder="البحث في المنتجات..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pr-10 pl-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-blue-500"
          />
        </div>
        <button className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">
          <Plus size={18} />
          منتج جديد
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500">
            <tr>
              <th className="text-right px-5 py-3 font-medium">المنتج</th>
              <th className="text-right px-5 py-3 font-medium">الكود</th>
              <th className="text-right px-5 py-3 font-medium">الفئة</th>
              <th className="text-right px-5 py-3 font-medium">السعر</th>
              <th className="text-right px-5 py-3 font-medium">المخزون</th>
              <th className="text-right px-5 py-3 font-medium">الحالة</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.map((product) => (
              <tr key={product.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-5 py-3 font-medium text-gray-800">{product.name}</td>
                <td className="px-5 py-3 text-gray-500 font-mono text-xs">{product.code}</td>
                <td className="px-5 py-3 text-gray-600">{product.category}</td>
                <td className="px-5 py-3 text-gray-600">{product.price} د.م</td>
                <td className="px-5 py-3 text-gray-600">{product.stock}</td>
                <td className="px-5 py-3">
                  <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${statusColors[product.status]}`}>
                    {product.status}
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
