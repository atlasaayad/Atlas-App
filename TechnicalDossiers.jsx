import { useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { Plus, FileText, Image as ImageIcon, Video, Building2, Hash, CalendarDays, Sparkles } from 'lucide-react'
import { PageHeader, StatusBadge } from '../components/PageHeader.jsx'
import { dossiers } from '../data/mockData.js'

export default function TechnicalDossiers() {
  const { openAI } = useOutletContext()
  const [selectedId, setSelectedId] = useState(dossiers[0].id)
  const active = dossiers.find((d) => d.id === selectedId) || dossiers[0]

  return (
    <div>
      <PageHeader
        eyebrow="Product development"
        title="Technical Dossiers"
        description="One dossier per style: client, PO and season, fabric and trims, plus the reference PDF, photos and videos sewing teams work from."
        actions={
          <button className="btn-primary">
            <Plus size={16} /> New dossier
          </button>
        }
      />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">
        <div className="card overflow-hidden xl:col-span-2">
          <div className="overflow-x-auto max-h-[560px] overflow-y-auto">
            <table className="table-shell">
              <thead>
                <tr>
                  <th>Dossier</th>
                  <th>Product</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {dossiers.map((d) => (
                  <tr
                    key={d.id}
                    onClick={() => setSelectedId(d.id)}
                    className={`cursor-pointer ${d.id === selectedId ? 'bg-indigo-50/60' : ''}`}
                  >
                    <td className="font-mono text-xs text-indigo-700">{d.id}</td>
                    <td>
                      <p className="text-ink font-medium">{d.product}</p>
                      <p className="text-xs text-ink-faint">{d.client} · {d.season}</p>
                    </td>
                    <td>
                      <StatusBadge status={d.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card p-5 xl:col-span-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="font-display font-semibold text-ink">{active.product}</h3>
              <p className="font-mono text-xs text-ink-faint mt-0.5">{active.id} · updated {active.updated}</p>
            </div>
            <StatusBadge status={active.status} />
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <InfoTile icon={Building2} label="Client" value={active.client} />
            <InfoTile icon={Hash} label="Purchase order" value={active.po} mono />
            <InfoTile icon={CalendarDays} label="Season" value={active.season} />
          </div>

          <div className="mt-2 stitch-line text-line" />

          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-faint mb-2">Fabric</p>
              <div className="rounded-lg border border-line p-3.5 text-sm space-y-1.5">
                <p className="font-medium text-ink">{active.fabric.name}</p>
                <p className="text-ink-soft">{active.fabric.composition}</p>
                <p className="text-ink-soft">Color: {active.fabric.color}</p>
                <p className="text-ink-faint text-xs">Consumption: {active.fabric.consumption}</p>
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-faint mb-2">Trims</p>
              <ul className="rounded-lg border border-line p-3.5 text-sm space-y-1.5 text-ink-soft">
                {active.trims.map((t) => (
                  <li key={t} className="flex items-start gap-2">
                    <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-indigo-500" />
                    {t}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="mt-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-faint mb-2">Reference files</p>
            <div className="flex flex-wrap gap-2">
              <FileChip icon={FileText} label={`${active.files.pdf} PDF`} />
              <FileChip icon={ImageIcon} label={`${active.files.photos} photos`} />
              <FileChip icon={Video} label={`${active.files.videos} video${active.files.videos === 1 ? '' : 's'}`} disabled={active.files.videos === 0} />
            </div>
          </div>

          <div className="mt-5 flex items-start gap-2.5 rounded-lg border border-dashed border-indigo-300 bg-indigo-50/50 p-3.5">
            <Sparkles size={16} className="mt-0.5 shrink-0 text-indigo-600" />
            <p className="text-xs text-ink-soft leading-relaxed">
              The AI Copilot can read this dossier to suggest an operation sequence and estimate SMV for a new gamme.
              <button onClick={openAI} className="ml-1 font-medium text-indigo-700 hover:underline">Generate gamme draft →</button>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

function InfoTile({ icon: Icon, label, value, mono }) {
  return (
    <div className="rounded-lg border border-line p-3">
      <div className="flex items-center gap-1.5 text-ink-faint">
        <Icon size={13} />
        <span className="text-[11px] font-medium uppercase tracking-wide">{label}</span>
      </div>
      <p className={`mt-1 text-sm text-ink ${mono ? 'font-mono' : 'font-medium'}`}>{value}</p>
    </div>
  )
}

function FileChip({ icon: Icon, label, disabled }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium ${
        disabled ? 'border-line text-ink-faint' : 'border-line text-ink-soft hover:bg-paper cursor-pointer'
      }`}
    >
      <Icon size={14} />
      {label}
    </span>
  )
}
