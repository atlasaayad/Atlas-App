import { useEffect, useState } from 'react'
import { useLang } from '../lib/i18n'

const TIER_COLOR = {
  green: '#34D399',
  yellow: '#FBBF24',
  red: '#F87171',
}

export default function ConfidenceMeter({ confidence, tier, size = 96 }) {
  const { t } = useLang()
  const [animated, setAnimated] = useState(0)

  useEffect(() => {
    const raf = requestAnimationFrame(() => setAnimated(confidence))
    return () => cancelAnimationFrame(raf)
  }, [confidence])

  const radius = size / 2 - 8
  const circumference = 2 * Math.PI * radius
  const offset = circumference * (1 - animated / 100)
  const color = TIER_COLOR[tier] || TIER_COLOR.red
  const label =
    tier === 'green' ? t('confidenceHigh') : tier === 'yellow' ? t('confidenceMedium') : t('confidenceLow')

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="rgba(148,163,184,0.15)" strokeWidth="8" />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            style={{ transition: 'stroke-dashoffset 700ms ease-out', filter: `drop-shadow(0 0 6px ${color}aa)` }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-display text-xl font-bold" style={{ color }}>
            {confidence}%
          </span>
        </div>
      </div>
      <span className="text-[11px] font-medium uppercase tracking-wide" style={{ color }}>
        {tier === 'green' ? '🟢' : tier === 'yellow' ? '🟡' : '🔴'} {label}
      </span>
    </div>
  )
}
