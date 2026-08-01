import { Menu, Search, Bell, Sparkles } from 'lucide-react'

export default function Topbar({ title, subtitle, onMenuClick, onAskAI }) {
  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-line bg-surface/90 backdrop-blur px-4 sm:px-6">
      <button
        onClick={onMenuClick}
        className="rounded-lg p-2 text-ink-soft hover:bg-paper lg:hidden"
        aria-label="Open navigation"
      >
        <Menu size={20} />
      </button>

      <div className="min-w-0">
        <h1 className="truncate font-display text-lg font-semibold leading-tight text-ink">{title}</h1>
        {subtitle && <p className="truncate text-xs text-ink-faint">{subtitle}</p>}
      </div>

      <div className="ml-auto flex items-center gap-2">
        <div className="hidden md:flex items-center gap-2 rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink-faint w-64">
          <Search size={16} />
          <span>Search orders, products, gammes…</span>
        </div>
        <button className="relative rounded-lg p-2 text-ink-soft hover:bg-paper" aria-label="Notifications">
          <Bell size={19} />
          <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-signal-bad" />
        </button>
        <button onClick={onAskAI} className="btn-primary">
          <Sparkles size={16} />
          <span className="hidden sm:inline">Ask AI</span>
        </button>
      </div>
    </header>
  )
}
