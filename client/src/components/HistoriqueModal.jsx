import { useState } from 'react'
import { api } from '../lib/api'

const MONTH_NAMES = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
]

const CURRENT_YEAR = new Date().getFullYear()
const YEARS = [CURRENT_YEAR - 2, CURRENT_YEAR - 1, CURRENT_YEAR, CURRENT_YEAR + 1]

export default function HistoriqueModal({ chainNumber, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center sm:p-4" onClick={onClose}>
      <div
        className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-lg border border-turquoise/30 bg-navy-900 p-4 sm:rounded-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <div className="font-display text-lg font-semibold text-slate-100">📅 Historique de production</div>
          <button onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded text-slate-400 active:bg-navy-800">
            ✕
          </button>
        </div>
        <p className="mb-4 text-xs text-slate-500">
          كل رقم هنا يُحسب لحظياً من السجلات الفعلية المخزّنة — ما فيه أرقام افتراضية. الأقسام الثلاثة مستقلة عن
          بعضها.
        </p>
        <DaySection chainNumber={chainNumber} />
        <RangeSection chainNumber={chainNumber} />
        <MonthsSection chainNumber={chainNumber} />
      </div>
    </div>
  )
}

function ResultBlock({ loading, empty, emptyText, children }) {
  if (loading) return <div className="mt-3 text-center text-sm text-slate-500">Calcul…</div>
  if (empty) return <div className="mt-3 text-center text-sm text-slate-500">{emptyText}</div>
  return <div className="mt-3 text-center">{children}</div>
}

function DaySection({ chainNumber }) {
  const [date, setDate] = useState('')
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)

  async function check() {
    if (!date) return
    setLoading(true)
    setResult(null)
    try {
      setResult(await api.history.day(chainNumber, date))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mb-5 border-b border-slate-800 pb-5">
      <div className="mb-2 text-sm font-medium text-turquoise">1. يوم محدد</div>
      <div className="flex gap-2">
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="h-11 flex-1 rounded-md border border-slate-700 bg-navy-800 px-3 text-sm text-slate-200 focus:border-turquoise focus:outline-none"
        />
        <button
          onClick={check}
          disabled={!date || loading}
          className="h-11 shrink-0 rounded-md border border-turquoise/50 px-4 text-sm text-turquoise active:bg-turquoise/10 disabled:opacity-50"
        >
          Voir
        </button>
      </div>
      {result && (
        <ResultBlock loading={loading} empty={result.total === null} emptyText="لا توجد بيانات مسجلة لهذا اليوم">
          <div className="font-mono text-2xl font-semibold text-turquoise glow-number">
            {result.total?.toLocaleString('fr-FR')}
          </div>
          <div className="text-xs text-slate-500">
            إجمالي إنتاج {result.date} ({result.recordsCount} ساعة مسجلة)
          </div>
        </ResultBlock>
      )}
    </div>
  )
}

function RangeSection({ chainNumber }) {
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)

  async function check() {
    if (!from || !to) return
    setLoading(true)
    setResult(null)
    try {
      setResult(await api.history.range(chainNumber, from, to))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mb-5 border-b border-slate-800 pb-5">
      <div className="mb-2 text-sm font-medium text-turquoise">2. معدل مدى أيام (تختاره بنفسك)</div>
      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="mb-1 block text-xs text-slate-500">من</span>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="h-11 w-full rounded-md border border-slate-700 bg-navy-800 px-3 text-sm text-slate-200 focus:border-turquoise focus:outline-none"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-slate-500">إلى</span>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="h-11 w-full rounded-md border border-slate-700 bg-navy-800 px-3 text-sm text-slate-200 focus:border-turquoise focus:outline-none"
          />
        </label>
      </div>
      <button
        onClick={check}
        disabled={!from || !to || loading}
        className="mt-2 h-11 w-full rounded-md border border-turquoise/50 text-sm text-turquoise active:bg-turquoise/10 disabled:opacity-50"
      >
        Calculer la moyenne
      </button>
      {result && (
        <ResultBlock loading={loading} empty={result.average === null} emptyText="لا توجد بيانات مسجلة بهذا المدى">
          <div className="font-mono text-2xl font-semibold text-turquoise glow-number">
            {Math.round(result.average || 0).toLocaleString('fr-FR')} / ساعة
          </div>
          <div className="text-xs text-slate-500">
            {result.recordsCount} ساعة مسجلة بالمدى · إجمالي {result.total?.toLocaleString('fr-FR')}
          </div>
        </ResultBlock>
      )}
    </div>
  )
}

function MonthsSection({ chainNumber }) {
  const [fromYear, setFromYear] = useState(String(CURRENT_YEAR))
  const [fromMonth, setFromMonth] = useState('')
  const [toYear, setToYear] = useState(String(CURRENT_YEAR))
  const [toMonth, setToMonth] = useState('')
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)

  async function check() {
    if (!fromMonth || !toMonth) return
    setLoading(true)
    setResult(null)
    try {
      setResult(await api.history.months(chainNumber, fromYear, fromMonth, toYear, toMonth))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <div className="mb-2 text-sm font-medium text-turquoise">3. معدل مدى شهور (تختاره بنفسك)</div>
      <div className="grid grid-cols-2 gap-2">
        <div className="grid grid-cols-2 gap-1">
          <MonthSelect value={fromMonth} onChange={setFromMonth} label="من (شهر)" />
          <YearSelect value={fromYear} onChange={setFromYear} label="من (سنة)" />
        </div>
        <div className="grid grid-cols-2 gap-1">
          <MonthSelect value={toMonth} onChange={setToMonth} label="إلى (شهر)" />
          <YearSelect value={toYear} onChange={setToYear} label="إلى (سنة)" />
        </div>
      </div>
      <button
        onClick={check}
        disabled={!fromMonth || !toMonth || loading}
        className="mt-2 h-11 w-full rounded-md border border-turquoise/50 text-sm text-turquoise active:bg-turquoise/10 disabled:opacity-50"
      >
        Calculer la moyenne
      </button>
      {result && (
        <ResultBlock loading={loading} empty={result.average === null} emptyText="لا توجد بيانات مسجلة بهذا المدى">
          <div className="font-mono text-2xl font-semibold text-turquoise glow-number">
            {Math.round(result.average || 0).toLocaleString('fr-FR')} / ساعة
          </div>
          <div className="text-xs text-slate-500">
            {result.recordsCount} ساعة مسجلة بالمدى · إجمالي {result.total?.toLocaleString('fr-FR')}
          </div>
        </ResultBlock>
      )}
    </div>
  )
}

function MonthSelect({ value, onChange, label }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-slate-500">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-11 w-full rounded-md border border-slate-700 bg-navy-800 px-1 text-xs text-slate-200 focus:border-turquoise focus:outline-none"
      >
        <option value="" disabled>
          --
        </option>
        {MONTH_NAMES.map((m, i) => (
          <option key={m} value={i + 1}>
            {m}
          </option>
        ))}
      </select>
    </label>
  )
}

function YearSelect({ value, onChange, label }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-slate-500">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-11 w-full rounded-md border border-slate-700 bg-navy-800 px-1 text-xs text-slate-200 focus:border-turquoise focus:outline-none"
      >
        {YEARS.map((y) => (
          <option key={y} value={y}>
            {y}
          </option>
        ))}
      </select>
    </label>
  )
}
