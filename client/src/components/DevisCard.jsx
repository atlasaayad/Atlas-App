import { useState } from 'react'
import { api } from '../lib/api'

// Only rendered from Méthode's and Patron's own screens — both already
// gated to those two departments' tokens by their route/auth flow, so this
// component doesn't need its own access check.
export default function DevisCard({ token, modelId }) {
  const [state, setState] = useState('idle') // idle | loading | result | not_set
  const [cmt, setCmt] = useState(null)

  async function generate() {
    setState('loading')
    const res = await api.devis.get(token, modelId)
    if (res.cmt === null) {
      setState('not_set')
      return
    }
    setCmt(res.cmt)
    setState('result')
  }

  return (
    <div className="mt-3 border-t border-slate-800 pt-3">
      <button
        type="button"
        onClick={generate}
        disabled={state === 'loading'}
        className="rounded-md border border-turquoise/50 px-4 py-2 text-sm font-medium text-turquoise active:bg-turquoise/10 disabled:opacity-50"
      >
        {state === 'loading' ? '…' : '💰 Générer un devis'}
      </button>
      {state === 'result' && (
        <div className="mt-2 text-sm text-slate-300">
          التكلفة التقديرية للقطعة: <span className="font-mono text-lg font-semibold text-turquoise">{cmt.toFixed(2)}</span> درهم
          <div className="text-xs text-slate-500">(تكلفة إنتاج خام، بدون هامش ربح — Patron يضيفه لاحقاً حسب تقديره)</div>
        </div>
      )}
      {state === 'not_set' && (
        <div className="mt-2 text-sm text-status-warn">لازم Patron يدخل تكلفة الدقيقة أولاً من شاشته.</div>
      )}
    </div>
  )
}
