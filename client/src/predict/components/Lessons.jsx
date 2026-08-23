import { useLang } from '../lib/i18n'

export default function Lessons({ lessons }) {
  const { t, lang } = useLang()

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-display text-lg font-semibold text-gold">{t('lessonsTitle')}</h2>
        <p className="text-sm text-slate-400">{t('lessonsDesc')}</p>
        <p className="mt-1 text-xs text-slate-500">
          <span className="font-semibold text-gold">{t('referenceSet')}:</span> {t('referenceNote')}
        </p>
      </div>

      {lessons.length === 0 ? (
        <p className="text-sm text-slate-500">{t('noLessons')}</p>
      ) : (
        <div className="space-y-3">
          {lessons.map((lesson) => (
            <div key={lesson.id} className="rounded-xl border border-gold/15 bg-navy-900/50 p-4">
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-display text-sm font-semibold text-slate-100">{lesson.title[lang] || lesson.title.fr}</h3>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                    lesson.kind === 'reference' ? 'bg-gold/15 text-gold' : 'bg-status-bad/15 text-status-bad'
                  }`}
                >
                  {lesson.kind === 'reference' ? '📚 WC2026' : `⚠️ ${t('autoLogged')}`}
                </span>
              </div>
              <p className="mt-1.5 text-sm text-slate-400">{lesson.text[lang] || lesson.text.fr}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
