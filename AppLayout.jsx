import { useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import Sidebar from '../components/Sidebar.jsx'
import Topbar from '../components/Topbar.jsx'
import AIPanel from '../components/AIPanel.jsx'

const titles = {
  '/': { title: 'Control Room', subtitle: 'Live floor status — all lines, right now' },
  '/products': { title: 'Products', subtitle: 'Catalog of styles and their linked gammes' },
  '/dossiers': { title: 'Technical Dossiers', subtitle: 'Client, PO, season, fabric, trims and reference files' },
  '/gammes': { title: 'Gammes', subtitle: 'Operation routings, machines, operators, SMV and media' },
  '/modules': { title: 'Modules', subtitle: 'Workforce, hourly output, efficiency, downtime and absences' },
  '/planning': { title: 'Planning', subtitle: 'Order scheduling across lines' },
  '/production': { title: 'Production', subtitle: 'Live output vs. target by line' },
  '/quality': { title: 'Quality', subtitle: 'AQL inspections and defect tracking' },
  '/reports': { title: 'Reports', subtitle: 'Scheduled and on-demand reporting' },
  '/settings': { title: 'Settings', subtitle: 'Workspace, users and integrations' },
}

export default function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [aiOpen, setAiOpen] = useState(false)
  const { pathname } = useLocation()
  const meta = titles[pathname] || { title: 'Atlas-App' }

  return (
    <div className="flex min-h-screen bg-paper">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          title={meta.title}
          subtitle={meta.subtitle}
          onMenuClick={() => setSidebarOpen(true)}
          onAskAI={() => setAiOpen(true)}
        />
        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <Outlet context={{ openAI: () => setAiOpen(true) }} />
        </main>
      </div>

      <AIPanel open={aiOpen} onClose={() => setAiOpen(false)} />
    </div>
  )
}
