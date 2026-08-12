// Card with glowing turquoise corner brackets — the JACK Kanban signature motif,
// used instead of a plain border around every panel on the dashboard.
export default function GlowCard({ title, className = '', children, dim = false }) {
  return (
    <div className={`relative rounded-md bg-navy-800/50 p-4 ${dim ? 'opacity-70' : ''} ${className}`}>
      <Corner position="top-left" />
      <Corner position="top-right" />
      <Corner position="bottom-left" />
      <Corner position="bottom-right" />
      {title && (
        <div className="mb-2 font-display text-xs font-medium uppercase tracking-widest text-turquoise/80">
          {title}
        </div>
      )}
      {children}
    </div>
  )
}

function Corner({ position }) {
  const base = 'absolute h-4 w-4 border-turquoise shadow-glow-sm pointer-events-none'
  const map = {
    'top-left': 'top-0 left-0 border-t-2 border-l-2 rounded-tl-md',
    'top-right': 'top-0 right-0 border-t-2 border-r-2 rounded-tr-md',
    'bottom-left': 'bottom-0 left-0 border-b-2 border-l-2 rounded-bl-md',
    'bottom-right': 'bottom-0 right-0 border-b-2 border-r-2 rounded-br-md',
  }
  return <span className={`${base} ${map[position]}`} />
}
