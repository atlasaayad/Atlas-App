export function PageHeader({ eyebrow, title, description, actions }) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between mb-6">
      <div>
        {eyebrow && (
          <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600 mb-1">{eyebrow}</p>
        )}
        <h2 className="font-display text-xl font-semibold text-ink">{title}</h2>
        {description && <p className="mt-1 text-sm text-ink-soft max-w-2xl">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  )
}

const styles = {
  Active: 'badge-good',
  Running: 'badge-good',
  Pass: 'badge-good',
  'On track': 'badge-good',
  Completed: 'badge-good',
  Draft: 'badge-info',
  Scheduled: 'badge-info',
  'In progress': 'badge-info',
  Idle: 'badge-info',
  'At risk': 'badge-warn',
  Bottleneck: 'badge-warn',
  Delayed: 'badge-bad',
  Discontinued: 'badge-bad',
  Fail: 'badge-bad',
  Approved: 'badge-good',
  'In review': 'badge-warn',
  Archived: 'badge-info',
  Understaffed: 'badge-warn',
}

export function StatusBadge({ status }) {
  return <span className={`badge ${styles[status] || 'badge-info'}`}>{status}</span>
}
