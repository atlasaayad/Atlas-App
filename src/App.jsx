import { Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import Products from './pages/Products'
import Dossiers from './pages/Dossiers'
import Gammes from './pages/Gammes'
import Modules from './pages/Modules'
import Planning from './pages/Planning'
import Production from './pages/Production'
import Quality from './pages/Quality'
import Reports from './pages/Reports'
import Settings from './pages/Settings'
import AICopilot from './pages/AICopilot'

function App() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="products" element={<Products />} />
        <Route path="dossiers" element={<Dossiers />} />
        <Route path="gammes" element={<Gammes />} />
        <Route path="modules" element={<Modules />} />
        <Route path="planning" element={<Planning />} />
        <Route path="production" element={<Production />} />
        <Route path="quality" element={<Quality />} />
        <Route path="reports" element={<Reports />} />
        <Route path="settings" element={<Settings />} />
        <Route path="ai-copilot" element={<AICopilot />} />
      </Route>
    </Routes>
  )
}

export default App
