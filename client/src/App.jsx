import { Routes, Route } from 'react-router-dom'
import BottomNav from './components/BottomNav'
import { CompanyProvider, useCompany } from './lib/CompanyContext'
import Home from './pages/Home'
import Departments from './pages/Departments'
import DeptGate from './pages/DeptGate'
import EffectifsOverview from './pages/EffectifsOverview'
import Ask from './pages/Ask'
import PredictApp from './predict/PredictApp'

function Header() {
  const { companyName } = useCompany()
  return (
    <header className="sticky top-0 z-30 border-b border-turquoise/15 bg-navy-950/90 px-4 py-3 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between">
        <div className="font-display text-lg font-semibold tracking-wide text-turquoise glow-number">
          {companyName}
        </div>
        <div className="font-mono text-[11px] text-slate-500">Production Tracking</div>
      </div>
    </header>
  )
}

function FactoryApp() {
  return (
    <CompanyProvider>
      <div className="flex min-h-screen flex-col pb-20">
        <Header />
        <main className="mx-auto w-full max-w-6xl flex-1 px-3 py-4 sm:px-6">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/departements" element={<Departments />} />
            <Route path="/departements/:deptKey" element={<DeptGate />} />
            <Route path="/effectifs" element={<EffectifsOverview />} />
            <Route path="/ask" element={<Ask />} />
          </Routes>
        </main>
        <BottomNav />
      </div>
    </CompanyProvider>
  )
}

export default function App() {
  return (
    <Routes>
      <Route path="/predict/*" element={<PredictApp />} />
      <Route path="/*" element={<FactoryApp />} />
    </Routes>
  )
}
