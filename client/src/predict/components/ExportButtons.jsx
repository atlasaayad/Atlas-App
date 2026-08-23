import { useLang } from '../lib/i18n'
import { exportMatchesCsv, exportMatchesPdf } from '../lib/export'

export default function ExportButtons({ matches }) {
  const { t, lang } = useLang()
  const disabled = matches.length === 0

  return (
    <div className="flex gap-2">
      <button
        disabled={disabled}
        onClick={() => exportMatchesCsv(matches)}
        className="rounded-md border border-gold/25 px-2.5 py-1.5 text-xs font-medium text-gold hover:bg-gold/10 disabled:opacity-30"
      >
        {t('exportCsv')}
      </button>
      <button
        disabled={disabled}
        onClick={() => exportMatchesPdf(matches, lang)}
        className="rounded-md border border-gold/25 px-2.5 py-1.5 text-xs font-medium text-gold hover:bg-gold/10 disabled:opacity-30"
      >
        {t('exportPdf')}
      </button>
    </div>
  )
}
