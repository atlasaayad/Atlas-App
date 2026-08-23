import { useState } from 'react'
import { useLang } from '../lib/i18n'
import { emptyMatch } from '../lib/defaults'
import FormPicker from './FormPicker'

const inputCls =
  'w-full rounded-lg border border-gold/15 bg-navy-900/70 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-gold/50 focus:outline-none focus:ring-1 focus:ring-gold/30'
const labelCls = 'mb-1 block text-xs text-slate-400'

function Field({ label, children }) {
  return (
    <label className="block">
      <span className={labelCls}>{label}</span>
      {children}
    </label>
  )
}

function StatPair({ label, homeKey, awayKey, value, onChange, min = 0, max, step = 1, tHome, tAway }) {
  return (
    <div>
      <div className="mb-1 text-xs text-slate-400">{label}</div>
      <div className="grid grid-cols-2 gap-2">
        <input
          type="number"
          className={inputCls}
          placeholder={tHome}
          min={min}
          max={max}
          step={step}
          value={value[homeKey]}
          onChange={(e) => onChange(homeKey, e.target.value)}
        />
        <input
          type="number"
          className={inputCls}
          placeholder={tAway}
          min={min}
          max={max}
          step={step}
          value={value[awayKey]}
          onChange={(e) => onChange(awayKey, e.target.value)}
        />
      </div>
    </div>
  )
}

function Section({ title, children }) {
  return (
    <div className="space-y-3 rounded-xl border border-gold/10 bg-navy-900/40 p-4">
      <h3 className="font-display text-sm font-semibold tracking-wide text-gold">{title}</h3>
      {children}
    </div>
  )
}

export default function MatchForm({ initial, onSubmit, onCancel }) {
  const { t } = useLang()
  const [m, setM] = useState(() => initial || emptyMatch())

  function set(key, value) {
    setM((prev) => ({ ...prev, [key]: value }))
  }

  function setNum(key, value) {
    setM((prev) => ({ ...prev, [key]: value === '' ? '' : Number(value) }))
  }

  function submit(e) {
    e.preventDefault()
    if (!m.homeTeam.trim() || !m.awayTeam.trim() || !m.league.trim() || !m.date) return
    onSubmit(m)
  }

  const isEdit = !!m.id

  return (
    <form onSubmit={submit} className="space-y-4">
      <Section title={t('matchDetails')}>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('homeTeam')}>
            <input className={inputCls} value={m.homeTeam} onChange={(e) => set('homeTeam', e.target.value)} required />
          </Field>
          <Field label={t('awayTeam')}>
            <input className={inputCls} value={m.awayTeam} onChange={(e) => set('awayTeam', e.target.value)} required />
          </Field>
          <Field label={t('league')}>
            <input className={inputCls} value={m.league} onChange={(e) => set('league', e.target.value)} required />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label={t('date')}>
              <input type="date" className={inputCls} value={m.date} onChange={(e) => set('date', e.target.value)} required />
            </Field>
            <Field label={t('time')}>
              <input type="time" className={inputCls} value={m.time} onChange={(e) => set('time', e.target.value)} />
            </Field>
          </div>
        </div>
        <p className="text-[11px] text-slate-500">{t('requiredFieldsNote')}</p>
      </Section>

      <Section title={t('keyStats')}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <StatPair label={t('xg')} homeKey="xgHome" awayKey="xgAway" value={m} onChange={setNum} step={0.1} max={6} tHome={t('home')} tAway={t('away')} />
          <StatPair label={t('possession')} homeKey="possessionHome" awayKey="possessionAway" value={m} onChange={setNum} max={100} tHome={t('home')} tAway={t('away')} />
          <StatPair label={t('shotsOnTarget')} homeKey="sotHome" awayKey="sotAway" value={m} onChange={setNum} max={30} tHome={t('home')} tAway={t('away')} />
          <StatPair label={t('bigChances')} homeKey="bigChancesHome" awayKey="bigChancesAway" value={m} onChange={setNum} max={15} tHome={t('home')} tAway={t('away')} />
          <StatPair label={t('corners')} homeKey="cornersHome" awayKey="cornersAway" value={m} onChange={setNum} max={20} tHome={t('home')} tAway={t('away')} />
          <StatPair label={t('passAccuracy')} homeKey="passAccHome" awayKey="passAccAway" value={m} onChange={setNum} max={100} tHome={t('home')} tAway={t('away')} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <FormPicker label={`${t('recentForm')} — ${t('home')}`} value={m.formHome} onChange={(v) => set('formHome', v)} />
          <FormPicker label={`${t('recentForm')} — ${t('away')}`} value={m.formAway} onChange={(v) => set('formAway', v)} />
        </div>
      </Section>

      <Section title={t('h2h')}>
        <Field label={t('h2hNotes')}>
          <textarea className={inputCls} rows={2} value={m.h2h} onChange={(e) => set('h2h', e.target.value)} />
        </Field>
        <Field label={t('h2hEdge')}>
          <select className={inputCls} value={m.h2hEdge} onChange={(e) => set('h2hEdge', e.target.value)}>
            <option value="even">{t('even')}</option>
            <option value="home">{t('home')}</option>
            <option value="away">{t('away')}</option>
          </select>
        </Field>
      </Section>

      <Section title={t('injuries')}>
        <Field label={t('injuriesNotes')}>
          <textarea className={inputCls} rows={2} value={m.injuries} onChange={(e) => set('injuries', e.target.value)} />
        </Field>
        <Field label={t('injuriesImpact')}>
          <select className={inputCls} value={m.injuriesImpact} onChange={(e) => set('injuriesImpact', e.target.value)}>
            <option value="none">{t('none')}</option>
            <option value="home">{t('home')}</option>
            <option value="away">{t('away')}</option>
            <option value="both">{t('both')}</option>
          </select>
        </Field>
      </Section>

      <Section title={t('context')}>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('motivationHome')}>
            <select className={inputCls} value={m.motivationHome} onChange={(e) => set('motivationHome', e.target.value)}>
              <option value="must_win">{t('mustWin')}</option>
              <option value="comfortable">{t('comfortable')}</option>
              <option value="resting">{t('resting')}</option>
            </select>
          </Field>
          <Field label={t('motivationAway')}>
            <select className={inputCls} value={m.motivationAway} onChange={(e) => set('motivationAway', e.target.value)}>
              <option value="must_win">{t('mustWin')}</option>
              <option value="comfortable">{t('comfortable')}</option>
              <option value="resting">{t('resting')}</option>
            </select>
          </Field>
          <Field label={t('eliteGK')}>
            <select className={inputCls} value={m.eliteGK} onChange={(e) => set('eliteGK', e.target.value)}>
              <option value="none">{t('none')}</option>
              <option value="home">{t('home')}</option>
              <option value="away">{t('away')}</option>
              <option value="both">{t('both')}</option>
            </select>
          </Field>
          <Field label={t('rotationRisk')}>
            <select className={inputCls} value={m.rotationRisk} onChange={(e) => set('rotationRisk', e.target.value)}>
              <option value="none">{t('none')}</option>
              <option value="home">{t('home')}</option>
              <option value="away">{t('away')}</option>
              <option value="both">{t('both')}</option>
            </select>
          </Field>
          <Field label={t('revengeFactor')}>
            <select className={inputCls} value={m.revengeFactor} onChange={(e) => set('revengeFactor', e.target.value)}>
              <option value="none">{t('none')}</option>
              <option value="home">{t('home')}</option>
              <option value="away">{t('away')}</option>
            </select>
          </Field>
          <Field label={t('opponentPromoted')}>
            <select className={inputCls} value={m.opponentPromoted} onChange={(e) => set('opponentPromoted', e.target.value)}>
              <option value="none">{t('none')}</option>
              <option value="home">{t('home')}</option>
              <option value="away">{t('away')}</option>
            </select>
          </Field>
        </div>
        <div className="flex flex-wrap gap-4 pt-1">
          <label className="flex items-center gap-2 text-sm text-slate-300">
            <input type="checkbox" checked={m.isKnockout} onChange={(e) => set('isKnockout', e.target.checked)} />
            {t('isKnockout')}
          </label>
          {m.isKnockout && (
            <label className="flex items-center gap-2 text-sm text-slate-300">
              <input type="checkbox" checked={m.couldGoToPenalties} onChange={(e) => set('couldGoToPenalties', e.target.checked)} />
              {t('couldGoToPenalties')}
            </label>
          )}
          <label className="flex items-center gap-2 text-sm text-slate-300">
            <input type="checkbox" checked={m.bothBenefitFromDraw} onChange={(e) => set('bothBenefitFromDraw', e.target.checked)} />
            {t('bothBenefitFromDraw')}
          </label>
        </div>
      </Section>

      <div className="flex gap-3">
        <button type="submit" className="flex-1 rounded-lg bg-gold py-2.5 font-semibold text-navy-950 shadow-glow transition hover:bg-gold-bright">
          {isEdit ? t('update') : t('save')}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} className="rounded-lg border border-gold/20 px-4 py-2.5 text-sm text-slate-300 hover:border-gold/40">
            {t('cancel')}
          </button>
        )}
      </div>
    </form>
  )
}
