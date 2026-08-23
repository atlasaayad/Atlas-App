import { useMemo, useState } from 'react'
import { useLang } from '../lib/i18n'

const OUTCOME_LABEL = { 1: '1', X: 'X', 2: '2', '1X': '1X', X2: 'X2', 12: '12' }

function combinations(arr, size) {
  const results = []
  function pick(start, combo) {
    if (combo.length === size) {
      results.push([...combo])
      return
    }
    for (let i = start; i < arr.length; i++) {
      combo.push(arr[i])
      pick(i + 1, combo)
      combo.pop()
    }
  }
  pick(0, [])
  return results
}

function legProbability(match) {
  return match.prediction.outcome.probability
}

export default function ComboBuilder({ matches }) {
  const { t } = useLang()
  const [selected, setSelected] = useState([])

  const withPrediction = useMemo(() => matches.filter((m) => m.prediction), [matches])

  function toggle(id) {
    setSelected((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id)
      if (prev.length >= 4) return prev
      return [...prev, id]
    })
  }

  const selectedMatches = withPrediction.filter((m) => selected.includes(m.id))
  const combinedProbability = selectedMatches.reduce((acc, m) => acc * legProbability(m), 1)
  const combinedOdds = selectedMatches.length ? selectedMatches.reduce((acc, m) => acc * (1 / legProbability(m)), 1) : 0

  function suggestOptimal() {
    const pool = [...withPrediction].sort((a, b) => legProbability(b) - legProbability(a)).slice(0, 12)
    let best = null
    for (const size of [4, 3, 2]) {
      if (pool.length < size) continue
      for (const combo of combinations(pool, size)) {
        const prob = combo.reduce((acc, m) => acc * legProbability(m), 1)
        if (prob >= 0.7 && (!best || prob > best.prob)) best = { combo, prob }
      }
      if (best) break
    }
    if (!best && pool.length >= 2) {
      let bestPair = null
      for (const combo of combinations(pool, 2)) {
        const prob = combo.reduce((acc, m) => acc * legProbability(m), 1)
        if (!bestPair || prob > bestPair.prob) bestPair = { combo, prob }
      }
      best = bestPair
    }
    setSelected(best ? best.combo.map((m) => m.id) : [])
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-display text-lg font-semibold text-gold">{t('comboTitle')}</h2>
        <p className="text-sm text-slate-400">{t('comboDesc')}</p>
      </div>

      {withPrediction.length === 0 ? (
        <p className="text-sm text-slate-500">{t('comboEmpty')}</p>
      ) : (
        <>
          <button
            onClick={suggestOptimal}
            className="rounded-lg border border-gold/30 bg-gold-soft px-3 py-2 text-sm font-semibold text-gold hover:bg-gold/20"
          >
            {t('comboSuggest')}
          </button>

          <div className="space-y-2">
            {withPrediction.map((m) => (
              <label
                key={m.id}
                className={`flex cursor-pointer items-center justify-between gap-3 rounded-lg border p-3 text-sm transition ${
                  selected.includes(m.id) ? 'border-gold/50 bg-gold-soft' : 'border-gold/10 bg-navy-900/50'
                }`}
              >
                <div className="flex items-center gap-3">
                  <input type="checkbox" checked={selected.includes(m.id)} onChange={() => toggle(m.id)} />
                  <div>
                    <div className="font-medium text-slate-100">
                      {m.homeTeam} vs {m.awayTeam}
                    </div>
                    <div className="text-xs text-slate-500">
                      {m.league} · {m.date}
                    </div>
                  </div>
                </div>
                <div className="text-end">
                  <div className="font-mono text-sm font-bold text-gold">{OUTCOME_LABEL[m.prediction.outcome.pick]}</div>
                  <div className="text-xs text-slate-400">{(legProbability(m) * 100).toFixed(1)}%</div>
                </div>
              </label>
            ))}
          </div>

          {selectedMatches.length > 0 && (
            <div className="rounded-xl border border-gold/20 bg-navy-900/60 p-4">
              <div className="mb-2 text-xs text-slate-400">
                {t('comboSelected')}: {selectedMatches.length} {t('comboLegOf')} 4
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs text-slate-400">{t('comboProbability')}</div>
                  <div className={`font-display text-2xl font-bold ${combinedProbability >= 0.7 ? 'text-status-good' : 'text-status-bad'}`}>
                    {(combinedProbability * 100).toFixed(1)}%
                  </div>
                </div>
                <div className="text-end">
                  <div className="text-xs text-slate-400">{t('comboOdds')}</div>
                  <div className="font-display text-2xl font-bold text-gold">{combinedOdds.toFixed(2)}x</div>
                </div>
              </div>
              {combinedProbability < 0.7 && (
                <div className="mt-3 rounded-lg border border-status-bad/30 bg-status-bad/10 px-3 py-2 text-xs text-status-bad">
                  {t('comboWarningLow')}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
