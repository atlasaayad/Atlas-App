import { useEffect, useState } from 'react'
import GlowCard from './GlowCard'
import { CHAIN_NUMBERS } from '../lib/constants'
import { api } from '../lib/api'
import { errorMessage } from '../lib/errors'
import ErrorNote from './ErrorNote'

export default function ChainPicker({ deptLabel, deptKey, onSelect }) {
  const [chains, setChains] = useState(null)
  const [loadError, setLoadError] = useState(null)
  const [retryTick, setRetryTick] = useState(0)

  // On failure, say so (with a retry) instead of showing every chain as
  // "Vide" — that would read as "no model anywhere".
  useEffect(() => {
    setLoadError(null)
    api.getChains().then(setChains).catch(setLoadError)
  }, [retryTick])

  return (
    <div>
      <div className="mb-4 text-center text-sm text-slate-400">
        {deptLabel} — choisissez la chaîne à mettre à jour
      </div>
      {loadError && (
        <div className="mb-4 flex flex-col items-center gap-2 text-center">
          <ErrorNote message={errorMessage(loadError, { load: true })} />
          <button
            onClick={() => setRetryTick((t) => t + 1)}
            className="rounded border border-turquoise/50 px-4 py-2 text-sm font-medium text-turquoise active:bg-turquoise/10"
          >
            إعادة المحاولة
          </button>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {CHAIN_NUMBERS.map((n) => {
          const info = chains?.find((c) => c.chainNumber === n)
          const hasModel = !!info?.model
          const disabled = !hasModel && deptKey !== 'methode'
          return (
            <button key={n} onClick={() => !disabled && onSelect(n)} disabled={disabled} className={disabled ? 'cursor-not-allowed opacity-40' : ''}>
              <GlowCard className="flex h-24 flex-col items-center justify-center gap-1">
                <span className="font-display text-xl font-semibold text-turquoise glow-number">Chaîne {n}</span>
                <span className="text-xs text-slate-400">{hasModel ? info.model.client : 'Vide'}</span>
              </GlowCard>
            </button>
          )
        })}
      </div>
    </div>
  )
}
