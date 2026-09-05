import { useState } from 'react'

// A GlowCard-styled section whose header (with a subtotal that's ALWAYS
// visible, collapsed or not) toggles a body of detail rows — used by the
// État des effectifs overview page so the default view stays short (one
// line per chain/section) while any section's full breakdown is one tap
// away, never hidden data.
export default function Collapsible({ title, subtitle, right, defaultOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="relative rounded-md border border-slate-700/70 bg-navy-800/50">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <div className="flex items-center gap-2">
          <span className={`text-xs text-turquoise transition-transform ${open ? 'rotate-90' : ''}`}>▶</span>
          <div>
            <div className="text-sm font-medium text-slate-200">{title}</div>
            {subtitle && <div className="text-xs text-slate-500">{subtitle}</div>}
          </div>
        </div>
        {right}
      </button>
      {open && <div className="border-t border-slate-800 px-4 py-3">{children}</div>}
    </div>
  )
}
