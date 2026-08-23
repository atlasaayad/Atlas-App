import { useLang } from '../lib/i18n'

export default function LeagueSelector({ leagues, selected, onSelect }) {
  const { t, lang } = useLang()

  return (
    <div>
      <div className="mb-2 text-xs text-slate-400">{t('selectLeague')}</div>
      <div className="flex flex-wrap gap-2">
        {leagues.map((league) => {
          const label = lang === 'ar' ? league.labelAr : league.labelFr
          const isSelected = selected === league.id
          return (
            <button
              key={league.id}
              type="button"
              disabled={!league.available}
              title={!league.available ? t('leagueUnavailableNote') : undefined}
              onClick={() => onSelect(league.id)}
              className={`rounded-full border px-3 py-1.5 text-sm font-medium transition ${
                !league.available
                  ? 'cursor-not-allowed border-slate-700/50 text-slate-600'
                  : isSelected
                    ? 'border-[#D4AF37] bg-[#D4AF37] text-navy-950'
                    : 'border-[#D4AF37]/25 text-[#D4AF37] hover:bg-[#D4AF37]/10'
              }`}
            >
              {label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
