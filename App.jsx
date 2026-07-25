import { Routes, Route } from 'react-router-dom'
import AppLayout from './layouts/AppLayout.jsx'
import Dashboard from './pages/Dashboard.jsx'
import Products from './pages/Products.jsx'
import TechnicalDossiers from './pages/TechnicalDossiers.jsx'
import Gammes from './pages/Gammes.jsx'
import Modules from './pages/Modules.jsx'
import Planning from './pages/Planning.jsx'
import Production from './pages/Production.jsx'
import Quality from './pages/Quality.jsx'
import Reports from './pages/Reports.jsx'
import Settings from './pages/Settings.jsx'

export default function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/products" element={<Products />} />
        <Route path="/dossiers" element={<TechnicalDossiers />} />
        <Route path="/gammes" element={<Gammes />} />
        <Route path="/modules" element={<Modules />} />
        <Route path="/planning" element={<Planning />} />
        <Route path="/production" element={<Production />} />
        <Route path="/quality" element={<Quality />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/settings" element={<Settings />} />
      </Route>
    </Routes>
  )
}
