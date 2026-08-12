import { useEffect, useState } from 'react'
import GlowCard from './GlowCard'
import { CHAIN_NUMBERS } from '../lib/constants'
import { api } from '../lib/api'

export default function ChainPicker({ deptLabel, deptKey, onSelect }) {
  const [chains, setChains] = useState(null)

  useEffect(() => {
    api.getChains().then(setChains).catch(() => setChains([]))
  }, [])

  return (
    <div>
      <div className="mb-4 text-center text-sm text-slate-400">
        {deptLabel} — choisissez la chaîne à mettre à jour
      </div>
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
