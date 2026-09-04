import { useEffect, useState } from 'react'
import { api } from '../lib/api'

export default function ClassementModal({ onClose }) {
  const [ranking, setRanking] = useState(null)

  useEffect(() => {
    api.getRanking().then(setRanking)
  }, [])

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center sm:p-4" onClick={onClose}>
      <div
        className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-lg border border-turquoise/30 bg-navy-900 p-4 sm:rounded-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <div className="font-display text-lg font-semibold text-slate-100">🏆 Classement des chaînes</div>
          <button onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded text-slate-400 active:bg-navy-800">
            ✕
          </button>
        </div>
        <p className="mb-4 text-xs text-slate-500">
          مرتبة حسب Score اليومي (كفاءة الإنتاج + الجودة) — من الأفضل للأدنى. السلاسل بدون موديل نشط أو بدون بيانات
          كافية اليوم تظهر بآخر الترتيب بوضوح، مو مستبعدة بصمت.
        </p>
        {!ranking && <div className="py-10 text-center text-sm text-slate-500">Chargement…</div>}
        {ranking && (
          <div className="space-y-2.5">
            {ranking.map((entry) => (
              <RankingRow key={entry.chainNumber} entry={entry} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function RankingRow({ entry }) {
  const { rank, chainNumber, model, rendement } = entry
  const noModel = !model
  // "noScore" only gates the ranking position (sort key = daily score) — it
  // never hides the cumulative figures, which are computed independently
  // and can be meaningful even when today alone doesn't have enough data
  // yet (e.g. early in the shift, or a fresh model with no hours today).
  const noScore = model && rendement.daily.score === null

  return (
    <div className={`rounded-md border p-3 ${noModel ? 'border-slate-800 bg-navy-950/40' : 'border-slate-700 bg-navy-800/40'}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-turquoise/40 font-mono text-xs text-turquoise">
            {rank}
          </span>
          <div>
            <div className="text-sm font-medium text-slate-200">
              Chaîne {chainNumber}
              {model && <span className="text-slate-500"> — {model.client} ({model.dessin})</span>}
            </div>
            {noModel && <div className="text-xs text-slate-500">لا يوجد نشاط</div>}
          </div>
        </div>
        {!noModel && (
          <div className="text-right">
            <div className={`font-mono text-lg font-semibold ${noScore ? 'text-sm text-slate-500' : 'text-turquoise glow-number'}`}>
              {noScore ? 'غير محسوب' : `${rendement.daily.score}%`}
            </div>
            <div className="text-[10px] text-slate-500">اليوم</div>
          </div>
        )}
      </div>
      {!noModel && (
        <div className="mt-2 grid grid-cols-2 gap-2 border-t border-slate-800 pt-2 text-xs">
          <div>
            <div className="text-slate-500">اليوم</div>
            {noScore ? (
              <div className="text-slate-600">لا توجد بيانات كافية اليوم</div>
            ) : (
              <div className="font-mono text-slate-300">
                Prod: {rendement.daily.productionPct}% · Qualité: {rendement.daily.qualityPct === null ? '—' : `${rendement.daily.qualityPct}%`}
              </div>
            )}
          </div>
          <div>
            <div className="text-slate-500">
              تراكمي {rendement.cumulative.score === null ? '' : `(${rendement.cumulative.score}%)`}
            </div>
            {rendement.cumulative.score === null ? (
              <div className="text-slate-600">لا توجد بيانات كافية</div>
            ) : (
              <div className="font-mono text-slate-300">
                Prod: {rendement.cumulative.productionPct}% · Qualité: {rendement.cumulative.qualityPct}%
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
