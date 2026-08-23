import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { LangProvider, useLang } from './lib/i18n'
import { store, uid } from './lib/storage'
import { computePrediction, evaluateMatch } from './lib/engine'
import { REFERENCE_LESSONS, diagnoseMiss } from './lib/lessons'
import MatchForm from './components/MatchForm'
import MatchCard from './components/MatchCard'
import Dashboard from './components/Dashboard'
import LiveMatches from './components/LiveMatches'
import ComboBuilder from './components/ComboBuilder'
import Tracker from './components/Tracker'
import Lessons from './components/Lessons'
import ExportButtons from './components/ExportButtons'

const TABS = ['dashboard', 'live', 'new', 'matches', 'combo', 'tracker', 'lessons']
const TAB_LABEL_KEY = {
  dashboard: 'tabDashboard',
  live: 'tabLive',
  new: 'tabNew',
  matches: 'tabMatches',
  combo: 'tabCombo',
  tracker: 'tabTracker',
  lessons: 'tabLessons',
}

function computeStreak(settledSorted) {
  if (settledSorted.length === 0) return { type: null, count: 0 }
  let count = 0
  const type = settledSorted[settledSorted.length - 1].evaluation.hit ? 'win' : 'loss'
  for (let i = settledSorted.length - 1; i >= 0; i--) {
    const isHit = settledSorted[i].evaluation.hit
    if ((type === 'win' && isHit) || (type === 'loss' && !isHit)) count += 1
    else break
  }
  return { type, count }
}

function Shell() {
  const { t, dir, lang, setLang } = useLang()
  const [tab, setTab] = useState('dashboard')
  const [matches, setMatches] = useState([])
  const [lessons, setLessons] = useState([])
  const [editing, setEditing] = useState(null)

  useEffect(() => {
    setMatches(store.loadMatches())
    const savedLessons = store.loadLessons()
    setLessons(savedLessons && savedLessons.length ? savedLessons : REFERENCE_LESSONS)
  }, [])

  function persistMatches(next) {
    setMatches(next)
    store.saveMatches(next)
  }

  function persistLessons(next) {
    setLessons(next)
    store.saveLessons(next)
  }

  function handleSubmitMatch(m) {
    const prediction = computePrediction(m)
    if (m.id) {
      persistMatches(matches.map((x) => (x.id === m.id ? { ...m, prediction, evaluation: x.evaluation } : x)))
    } else {
      const withId = { ...m, id: uid(), prediction, evaluation: null }
      persistMatches([withId, ...matches])
    }
    setEditing(null)
    setTab('matches')
  }

  function handleEdit(m) {
    setEditing(m)
    setTab('new')
  }

  function handleDelete(id) {
    persistMatches(matches.filter((m) => m.id !== id))
  }

  function handleSettle(id, homeGoals, awayGoals) {
    const match = matches.find((m) => m.id === id)
    if (!match) return
    const result = { homeGoals: Number(homeGoals), awayGoals: Number(awayGoals) }
    const updated = { ...match, result }
    const evaluation = evaluateMatch(updated)
    const settled = { ...updated, evaluation }
    persistMatches(matches.map((m) => (m.id === id ? settled : m)))

    if (evaluation && !evaluation.hit) {
      const lesson = diagnoseMiss(settled, evaluation)
      persistLessons([lesson, ...lessons])
    }
  }

  const settledSorted = useMemo(
    () =>
      matches
        .filter((m) => m.evaluation)
        .sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`)),
    [matches],
  )

  const accuracy = settledSorted.length
    ? (settledSorted.filter((m) => m.evaluation.hit).length / settledSorted.length) * 100
    : null

  const streak = useMemo(() => computeStreak(settledSorted), [settledSorted])

  const allMatchesSorted = useMemo(
    () => [...matches].sort((a, b) => `${b.date}${b.time}`.localeCompare(`${a.date}${a.time}`)),
    [matches],
  )

  return (
    <div dir={dir} className="min-h-screen bg-app-gradient text-slate-200">
      <header className="sticky top-0 z-30 border-b border-[#D4AF37]/15 bg-navy-950/90 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
          <div>
            <div className="font-display text-lg font-bold tracking-wide text-[#D4AF37] glow-number">⚽ {t('appName')}</div>
            <div className="hidden text-[11px] text-slate-500 sm:block">{t('tagline')}</div>
          </div>
          <div className="flex items-center gap-2">
            <ExportButtons matches={allMatchesSorted} />
            <button
              onClick={() => setLang(lang === 'ar' ? 'fr' : 'ar')}
              className="rounded-md border border-[#D4AF37]/25 px-2.5 py-1.5 text-xs font-medium text-[#D4AF37] hover:bg-[#D4AF37]/10"
            >
              {t('langToggle')}
            </button>
          </div>
        </div>
        <nav className="mx-auto mt-3 flex max-w-5xl gap-1 overflow-x-auto">
          {TABS.map((tabKey) => (
            <button
              key={tabKey}
              onClick={() => {
                setTab(tabKey)
                if (tabKey !== 'new') setEditing(null)
              }}
              className={`shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                tab === tabKey ? 'bg-[#D4AF37] text-navy-950 shadow-glow-sm' : 'text-slate-400 hover:text-[#D4AF37]'
              }`}
            >
              {t(TAB_LABEL_KEY[tabKey])}
            </button>
          ))}
        </nav>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6">
        {tab === 'dashboard' && (
          <Dashboard matches={matches} onEdit={handleEdit} onDelete={handleDelete} accuracy={accuracy} streak={streak} />
        )}

        {tab === 'live' && <LiveMatches />}

        {tab === 'new' && (
          <div className="mx-auto max-w-2xl">
            <h2 className="mb-4 font-display text-lg font-semibold text-[#D4AF37]">{editing ? t('edit') : t('tabNew')}</h2>
            <MatchForm
              initial={editing}
              onSubmit={handleSubmitMatch}
              onCancel={
                editing
                  ? () => {
                      setEditing(null)
                      setTab('matches')
                    }
                  : null
              }
            />
          </div>
        )}

        {tab === 'matches' && (
          <div className="space-y-3">
            <h2 className="font-display text-lg font-semibold text-[#D4AF37]">{t('allMatches')}</h2>
            {allMatchesSorted.length === 0 ? (
              <p className="text-sm text-slate-500">{t('comboEmpty')}</p>
            ) : (
              allMatchesSorted.map((m) => <MatchCard key={m.id} match={m} onEdit={handleEdit} onDelete={handleDelete} />)
            )}
          </div>
        )}

        {tab === 'combo' && <ComboBuilder matches={allMatchesSorted} />}

        {tab === 'tracker' && <Tracker matches={allMatchesSorted} onSettle={handleSettle} accuracy={accuracy} streak={streak} />}

        {tab === 'lessons' && <Lessons lessons={lessons} />}
      </main>

      <footer className="mx-auto max-w-5xl px-4 pb-8 pt-2 text-center">
        <Link to="/" className="text-xs text-slate-500 hover:text-[#D4AF37]">
          {t('backToFactory')}
        </Link>
      </footer>
    </div>
  )
}

export default function PredictApp() {
  return (
    <LangProvider>
      <Shell />
    </LangProvider>
  )
}
