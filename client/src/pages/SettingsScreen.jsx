import { useEffect, useState } from 'react'
import GlowCard from '../components/GlowCard'
import { api } from '../lib/api'
import { AVAILABLE_LANGUAGES, getLanguagePreference, setLanguagePreference } from '../lib/languagePreference'

export default function SettingsScreen({ token, onBack }) {
  return (
    <div className="space-y-4">
      <div className="mb-1 flex items-center justify-between">
        <button onClick={onBack} className="text-sm text-turquoise hover:underline">
          ← Retour
        </button>
        <div className="font-display text-sm font-medium text-slate-300">⚙️ الإعدادات</div>
      </div>

      <SpecialtiesCard token={token} />
      <WorkHoursCard token={token} />
      <FeedbackCard token={token} />
      <LanguageCard />
    </div>
  )
}

const GROUPS = [
  { key: 'chain', label: 'تخصصات السلسلة (Effectif / Présence)' },
  { key: 'finale', label: 'تخصصات Finale' },
]

// إدارة التخصصات — إضافة/حذف/تعديل بلا رجوع للكود (server/src/specialties.js
// و specialty_defs). الحذف ما كيمسحش البيانات القديمة — غير كيوقّف ظهور
// التخصص بشاشات الإدخال الحية؛ إعادة التسمية كتدمج البيانات القديمة تلقائياً
// (نفس آلية migrateSpecialtyNames الموجودة أصلاً بالتطبيق).
function SpecialtiesCard({ token }) {
  const [groupKey, setGroupKey] = useState('chain')
  const [specialties, setSpecialties] = useState([])
  const [loading, setLoading] = useState(true)
  const [newName, setNewName] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')
    api.settings
      .getSpecialties(token, groupKey)
      .then((r) => {
        if (!cancelled) setSpecialties(r.specialties)
      })
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [token, groupKey])

  async function addOne(e) {
    e.preventDefault()
    if (!newName.trim()) return
    setSaving(true)
    setError('')
    try {
      const r = await api.settings.addSpecialty(token, groupKey, newName.trim())
      setSpecialties(r.specialties)
      setNewName('')
    } catch (err) {
      setError(err.data?.error === 'already_exists' ? 'هاد التخصص موجود من قبل.' : 'فشل الإضافة.')
    } finally {
      setSaving(false)
    }
  }

  async function rename(oldName, next) {
    if (!next.trim() || next.trim() === oldName) return
    const r = await api.settings.renameSpecialty(token, groupKey, oldName, next.trim())
    setSpecialties(r.specialties)
  }

  async function remove(name) {
    if (!confirm(`حذف "${name}"؟ البيانات القديمة بيه تبقى محفوظة بالتاريخ، غير كيختفي من شاشات الإدخال الجديدة.`)) return
    const r = await api.settings.deleteSpecialty(token, groupKey, name)
    setSpecialties(r.specialties)
  }

  return (
    <GlowCard title="إدارة التخصصات">
      <p className="mb-3 text-sm text-slate-400">
        إضافة/حذف/تعديل قائمة التخصصات بلا رجوع للكود — تظهر فوراً بشاشات Effectif وPrésence (وFinale لتخصصاتها
        الخاصة).
      </p>
      <div className="mb-3 flex gap-2">
        {GROUPS.map((g) => (
          <button
            key={g.key}
            onClick={() => setGroupKey(g.key)}
            className={`rounded-md border px-3 py-2 text-sm font-medium ${
              groupKey === g.key ? 'border-turquoise bg-turquoise/10 text-turquoise' : 'border-slate-700 text-slate-400'
            }`}
          >
            {g.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="py-6 text-center text-sm text-slate-500">Chargement…</div>
      ) : (
        <div className="space-y-2">
          {specialties.map((sp) => (
            <SpecialtyRow key={sp} name={sp} onRename={(next) => rename(sp, next)} onDelete={() => remove(sp)} />
          ))}
        </div>
      )}

      <form onSubmit={addOne} className="mt-3 flex gap-2">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="اسم تخصص جديد"
          className="h-11 flex-1 rounded-md border border-slate-700 bg-navy-900 px-3 text-sm text-slate-200 focus:border-turquoise focus:outline-none"
        />
        <button
          type="submit"
          disabled={saving}
          className="h-11 shrink-0 rounded-md border border-turquoise bg-turquoise/10 px-4 text-sm font-medium text-turquoise disabled:opacity-50"
        >
          + إضافة
        </button>
      </form>
      {error && <div className="mt-2 text-sm text-status-bad">{error}</div>}
    </GlowCard>
  )
}

function SpecialtyRow({ name, onRename, onDelete }) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(name)

  if (editing) {
    return (
      <div className="flex items-center gap-2">
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          autoFocus
          className="h-10 flex-1 rounded border border-turquoise/50 bg-navy-900 px-2.5 text-sm text-slate-200 focus:outline-none"
        />
        <button
          onClick={async () => {
            await onRename(value)
            setEditing(false)
          }}
          className="h-10 shrink-0 rounded border border-turquoise/50 px-3 text-xs text-turquoise"
        >
          حفظ
        </button>
        <button onClick={() => { setValue(name); setEditing(false) }} className="h-10 shrink-0 rounded border border-slate-700 px-3 text-xs text-slate-400">
          إلغاء
        </button>
      </div>
    )
  }

  return (
    <div className="flex items-center justify-between rounded-md border border-slate-800 bg-navy-900/40 px-3 py-2">
      <span className="text-sm text-slate-200">{name}</span>
      <div className="flex gap-1.5">
        <button onClick={() => setEditing(true)} className="rounded px-2 py-1 text-xs text-turquoise active:bg-turquoise/10">
          تعديل
        </button>
        <button onClick={onDelete} className="rounded px-2 py-1 text-xs text-status-bad active:bg-status-bad/10">
          حذف
        </button>
      </div>
    </div>
  )
}

// ⏰ ساعات العمل — المصدر الوحيد لشرائح الساعات بكامل النظام (Planning،
// Production، Quality، لوحة القيادة، تقرير Audit) — أي تعديل هنا كيتبدل
// أوتوماتيكياً فكل الشاشات بلا الحاجة يبدلو واحد واحد (server/src/
// workHours.js). الإضافة دائماً فآخر اللائحة، والحذف مسموح غير للشريحة
// الأخيرة — تفادياً لأي تبديل فترتيب الشرائح يفسد بيانات قديمة مسجلة
// بشرائح سابقة (شوف التعليق فوق جدول work_hours فـ db/index.js).
function WorkHoursCard({ token }) {
  const [workHours, setWorkHours] = useState([])
  const [loading, setLoading] = useState(true)
  const [newStart, setNewStart] = useState('')
  const [newEnd, setNewEnd] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    api.settings
      .getWorkHours(token)
      .then((r) => {
        if (!cancelled) setWorkHours(r.workHours)
      })
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [token])

  async function addOne(e) {
    e.preventDefault()
    if (!newStart || !newEnd) return
    setSaving(true)
    setError('')
    try {
      const r = await api.settings.addWorkHour(token, newStart, newEnd)
      setWorkHours(r.workHours)
      setNewStart('')
      setNewEnd('')
    } catch {
      setError('فشلت الإضافة — تحقق من الوقت.')
    } finally {
      setSaving(false)
    }
  }

  async function update(id, start, end) {
    const r = await api.settings.updateWorkHour(token, id, start, end)
    setWorkHours(r.workHours)
  }

  async function remove(id) {
    if (!confirm('حذف آخر شريحة ساعة؟')) return
    const r = await api.settings.deleteWorkHour(token, id)
    setWorkHours(r.workHours)
  }

  return (
    <GlowCard title="⏰ ساعات العمل">
      <p className="mb-3 text-sm text-slate-400">
        شرائح الساعات المستعملة فكل شاشات النظام (Planning، Production، Quality، لوحة القيادة). تعديل الوقت لشريحة
        موجودة آمن دائماً؛ الإضافة كتزاد فآخر اللائحة، والحذف مسموح غير للشريحة الأخيرة — باش ما تتبدلش بيانات قديمة
        مسجلة بشرائح سابقة.
      </p>
      {loading ? (
        <div className="py-6 text-center text-sm text-slate-500">Chargement…</div>
      ) : (
        <div className="space-y-2">
          {workHours.map((wh, i) => (
            <WorkHourRow
              key={wh.id}
              workHour={wh}
              isLast={i === workHours.length - 1}
              onUpdate={(start, end) => update(wh.id, start, end)}
              onDelete={() => remove(wh.id)}
            />
          ))}
        </div>
      )}
      <form onSubmit={addOne} className="mt-3 flex flex-wrap items-center gap-2">
        <input
          type="time"
          value={newStart}
          onChange={(e) => setNewStart(e.target.value)}
          className="h-11 rounded-md border border-slate-700 bg-navy-900 px-3 text-sm text-slate-200 focus:border-turquoise focus:outline-none"
        />
        <span className="text-slate-500">—</span>
        <input
          type="time"
          value={newEnd}
          onChange={(e) => setNewEnd(e.target.value)}
          className="h-11 rounded-md border border-slate-700 bg-navy-900 px-3 text-sm text-slate-200 focus:border-turquoise focus:outline-none"
        />
        <button
          type="submit"
          disabled={saving}
          className="h-11 shrink-0 rounded-md border border-turquoise bg-turquoise/10 px-4 text-sm font-medium text-turquoise disabled:opacity-50"
        >
          + إضافة شريحة
        </button>
      </form>
      {error && <div className="mt-2 text-sm text-status-bad">{error}</div>}
    </GlowCard>
  )
}

function WorkHourRow({ workHour, isLast, onUpdate, onDelete }) {
  const [editing, setEditing] = useState(false)
  const [start, setStart] = useState(workHour.start)
  const [end, setEnd] = useState(workHour.end)

  if (editing) {
    return (
      <div className="flex items-center gap-2">
        <input
          type="time"
          value={start}
          onChange={(e) => setStart(e.target.value)}
          autoFocus
          className="h-10 rounded border border-turquoise/50 bg-navy-900 px-2 text-sm text-slate-200 focus:outline-none"
        />
        <span className="text-slate-500">—</span>
        <input
          type="time"
          value={end}
          onChange={(e) => setEnd(e.target.value)}
          className="h-10 rounded border border-turquoise/50 bg-navy-900 px-2 text-sm text-slate-200 focus:outline-none"
        />
        <button
          onClick={async () => {
            await onUpdate(start, end)
            setEditing(false)
          }}
          className="h-10 shrink-0 rounded border border-turquoise/50 px-3 text-xs text-turquoise"
        >
          حفظ
        </button>
        <button
          onClick={() => {
            setStart(workHour.start)
            setEnd(workHour.end)
            setEditing(false)
          }}
          className="h-10 shrink-0 rounded border border-slate-700 px-3 text-xs text-slate-400"
        >
          إلغاء
        </button>
      </div>
    )
  }

  return (
    <div className="flex items-center justify-between rounded-md border border-slate-800 bg-navy-900/40 px-3 py-2">
      <span className="font-mono text-sm text-slate-200">{workHour.label}</span>
      <div className="flex gap-1.5">
        <button onClick={() => setEditing(true)} className="rounded px-2 py-1 text-xs text-turquoise active:bg-turquoise/10">
          تعديل
        </button>
        <button
          onClick={onDelete}
          disabled={!isLast}
          title={isLast ? '' : 'يمكن حذف الشريحة الأخيرة فقط'}
          className="rounded px-2 py-1 text-xs text-status-bad active:bg-status-bad/10 disabled:opacity-30"
        >
          حذف
        </button>
      </div>
    </div>
  )
}

// مراجعة الملاحظات — القراءة فقط، الأحدث أولاً. الكتابة متاحة لأي قسم من
// شاشته هو (زر 📩 بشريط DeptGate.jsx العلوي)، هنا غير المراجعة.
function FeedbackCard({ token }) {
  const [reports, setReports] = useState(null)

  useEffect(() => {
    api.settings.getFeedback(token).then((r) => setReports(r.reports))
  }, [token])

  return (
    <GlowCard title="📩 ملاحظات ومشاكل مُبلَّغة">
      {reports === null ? (
        <div className="py-4 text-center text-sm text-slate-500">Chargement…</div>
      ) : reports.length === 0 ? (
        <p className="py-2 text-sm text-slate-500">لا توجد ملاحظات بعد.</p>
      ) : (
        <div className="max-h-80 space-y-2 overflow-y-auto">
          {reports.map((r) => (
            <div key={r.id} className="rounded-md border border-slate-800 bg-navy-900/40 p-3">
              <div className="mb-1 flex items-center justify-between text-xs text-slate-500">
                <span className="font-medium text-turquoise">{r.dept_key}</span>
                <span>{new Date(r.created_at).toLocaleString('fr-FR')}</span>
              </div>
              <p className="whitespace-pre-wrap text-sm text-slate-200">{r.message}</p>
            </div>
          ))}
        </div>
      )}
    </GlowCard>
  )
}

// تفضيل اللغة — شخصي لهاد الجهاز فقط (localStorage)، بلا أي علاقة بقاعدة
// البيانات المشتركة. يحفظ الاختيار فقط الآن — إعادة ترجمة نصوص التطبيق
// نفسها مشروع منفصل أكبر (أطلس ما عندوش نظام ترجمة حالياً).
function LanguageCard() {
  const [language, setLanguage] = useState(getLanguagePreference)

  function choose(code) {
    setLanguagePreference(code)
    setLanguage(code)
  }

  return (
    <GlowCard title="🌐 لغة العرض — خاصة بهاد الجهاز">
      <p className="mb-3 text-sm text-slate-400">
        كل جهاز (تابلت، هاتف، حاسوب) عندو التفضيل الخاص بيه — التغيير هنا ما كيأثرش على الأجهزة الأخرى.
      </p>
      <div className="flex gap-2">
        {AVAILABLE_LANGUAGES.map((l) => (
          <button
            key={l.code}
            onClick={() => choose(l.code)}
            className={`rounded-md border px-4 py-2.5 text-sm font-medium ${
              language === l.code ? 'border-turquoise bg-turquoise/10 text-turquoise' : 'border-slate-700 text-slate-400'
            }`}
          >
            {l.label}
          </button>
        ))}
      </div>
    </GlowCard>
  )
}
