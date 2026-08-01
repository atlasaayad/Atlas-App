import { useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { Plus, Image as ImageIcon, Video, Sparkles, User } from 'lucide-react'
import { PageHeader } from '../components/PageHeader.jsx'
import { gammes, gammeOperations } from '../data/mockData.js'

export default function Gammes() {
  const { openAI } = useOutletContext()
  const [selectedCode, setSelectedCode] = useState(gammes[0].code)
  const active = gammes.find((g) => g.code === selectedCode) || gammes[0]
  const totalSmv = gammeOperations.reduce((s, o) => s + o.smv, 0).toFixed(1)

  return (
    <div>
      <PageHeader
        eyebrow="Operation routings"
        title="Gammes"
        description="Standard operation sequences (gammes opératoires): operation number, machine, operator, SMV and reference media for every step."
        actions={
          <button className="btn-primary">
            <Plus size={16} /> New gamme
          </button>
        }
      />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">
        <div className="card overflow-hidden xl:col-span-2 xl:self-start">
          <div className="overflow-x-auto">
            <table className="table-shell">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Product</th>
                  <th>Ops</th>
                  <th>SMV</th>
                </tr>
              </thead>
              <tbody>
                {gammes.map((g) => (
                  <tr
                    key={g.code}
                    onClick={() => setSelectedCode(g.code)}
                    className={`cursor-pointer ${g.code === selectedCode ? 'bg-indigo-50/60' : ''}`}
                  >
                    <td className="font-mono text-xs text-indigo-700">{g.code}</td>
                    <td className="text-ink">{g.product}</td>
                    <td className="text-ink-soft">{g.operations}</td>
                    <td className="font-mono text-xs text-ink-soft">{g.smv}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card p-5 xl:col-span-3">
          <div className="flex items-center justify-between mb-1">
            <h3 className="font-display font-semibold text-ink">{active.product}</h3>
            <span className="font-mono text-xs text-ink-faint">{active.code} · {active.revision}</span>
          </div>
          <p className="text-xs text-ink-faint mb-1">
            Linked dossier <span className="font-mono text-indigo-700">{active.dossier}</span> · updated {active.updated}
          </p>
          <p className="text-xs text-ink-faint mb-5">
            {gammeOperations.length} operations · {totalSmv} SMV total
          </p>

          <ol className="relative ml-3">
            {gammeOperations.map((op, idx) => (
              <li key={op.opNo} className="relative flex gap-4 pb-6 last:pb-0">
                <div className="flex flex-col items-center">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-indigo-600 font-mono text-[11px] font-semibold text-white">
                    {op.opNo}
                  </span>
                  {idx < gammeOperations.length - 1 && (
                    <span className="mt-1 flex-1 stitch-line-v text-line" />
                  )}
                </div>
                <div className="min-w-0 flex-1 pt-0.5 pb-1">
                  <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
                    <p className="text-sm font-medium text-ink">{op.operation}</p>
                    <span className="font-mono text-xs text-ink-soft shrink-0">{op.smv.toFixed(1)} SMV</span>
                  </div>
                  <p className="text-xs text-ink-faint mt-0.5">{op.machine}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-1 rounded-full bg-paper px-2 py-0.5 text-[11px] text-ink-soft">
                      <User size={11} /> {op.operator}
                    </span>
                    {op.image && (
                      <span className="inline-flex items-center gap-1 rounded-full border border-line px-2 py-0.5 text-[11px] text-ink-soft">
                        <ImageIcon size={11} /> Reference photo
                      </span>
                    )}
                    {op.video && (
                      <span className="inline-flex items-center gap-1 rounded-full border border-line px-2 py-0.5 text-[11px] text-ink-soft">
                        <Video size={11} /> How-to video
                      </span>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ol>

          <button
            onClick={openAI}
            className="mt-1 flex w-full items-start gap-2.5 rounded-lg border border-dashed border-indigo-300 bg-indigo-50/50 p-3.5 text-left hover:bg-indigo-50 transition-colors"
          >
            <Sparkles size={16} className="mt-0.5 shrink-0 text-indigo-600" />
            <p className="text-xs text-ink-soft leading-relaxed">
              Ask the AI Copilot to re-sequence these operations or re-estimate SMV after a fabric or trim change.
            </p>
          </button>
        </div>
      </div>
    </div>
  )
}
