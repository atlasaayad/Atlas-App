import { useEffect, useState } from 'react'
import GlowCard from '../components/GlowCard'
import Collapsible from '../components/Collapsible'
import { api } from '../lib/api'
import { useCompany } from '../lib/CompanyContext'
import { POLL_INTERVAL_MS } from '../lib/constants'

// Central, company-wide headcount page — every chain's 13 specialties,
// Finale's 8, Dépôt's single total, and Personnel administratif, all summed
// into one grand total. Public, no PIN, same as Accueil/Ask Atlas. Polls on
// the same cadence as Accueil so it never shows a stale number for long.
export default function EffectifsOverview() {
  const { companyName } = useCompany()
  const [data, setData] = useState(null)

  useEffect(() => {
    let cancelled = false
    function load() {
      api.getEffectifsOverview().then((r) => {
        if (!cancelled) setData(r)
      })
    }
    load()
    const id = setInterval(load, POLL_INTERVAL_MS)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [])

  if (!data) return <div className="py-10 text-center text-slate-400">Chargement…</div>

  return (
    <div className="space-y-4 pb-4">
      <div>
        <div className="font-display text-xl font-semibold text-slate-100">État des effectifs</div>
        <div className="text-xs text-slate-500">صورة شاملة لكل عمال ومسؤولي الشركة بمكان واحد — محدّثة الآن</div>
      </div>

      {data.chains.map((chain) => (
        <Collapsible
          key={chain.chainNumber}
          title={
            <>
              Chaîne {chain.chainNumber}
              {chain.model && <span className="text-slate-500"> — {chain.model.client} ({chain.model.dessin})</span>}
            </>
          }
          subtitle={!chain.model ? 'لا يوجد نشاط' : undefined}
          right={<Subtotal value={chain.subtotal} />}
        >
          {chain.specialties.length === 0 ? (
            <div className="text-sm text-slate-600">لا يوجد موديل نشط بهذه السلسلة حالياً.</div>
          ) : (
            <SpecialtyGrid rows={chain.specialties} />
          )}
        </Collapsible>
      ))}

      <Collapsible title="Finale" right={<Subtotal value={data.finale.subtotal} />}>
        <SpecialtyGrid rows={data.finale.specialties} />
        <p className="mt-2 text-xs text-slate-500">مجموع كل السلاسل مع بعض — عرض واحد للـFinale، مو مكرر لكل سلسلة.</p>
      </Collapsible>

      <GlowCard title="Dépôt">
        <div className="flex items-center justify-between">
          <span className="text-sm text-slate-400">إجمالي العمال بالدépôt (كل السلاسل)</span>
          <span className="font-display text-2xl font-bold text-turquoise glow-number">{data.depot.total}</span>
        </div>
      </GlowCard>

      <GlowCard title="Personnel administratif / Encadrement">
        <div className="grid grid-cols-2 gap-4 text-center">
          <div>
            <div className="text-[10px] uppercase tracking-wide text-slate-500">اليوم</div>
            <div className="mt-1 font-display text-2xl font-bold text-turquoise glow-number">{data.personnelAdmin.total}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wide text-slate-500">تراكمي</div>
            <div className="mt-1 font-display text-lg font-semibold text-slate-300">{data.personnelAdmin.cumulativeTotal}</div>
          </div>
        </div>
        <p className="mt-3 text-xs text-slate-500">
          موظفون إداريون/إشرافيون — منفصلون تماماً عن عمال الإنتاج. يُدخله RH أساسياً، أو Patron كنسخة احتياطية.
        </p>
      </GlowCard>

      <GlowCard className="border-turquoise/40 shadow-glow-sm">
        <div className="text-center">
          <div className="font-display text-sm uppercase tracking-widest text-turquoise/80">
            Total général — {companyName}
          </div>
          <div className="mt-1 font-display text-4xl font-bold text-turquoise glow-number">{data.grandTotal}</div>
          <div className="mt-1 text-xs text-slate-500">
            {data.chainsTotal} (سلاسل) + {data.finale.subtotal} (Finale) + {data.depot.total} (Dépôt) + {data.personnelAdmin.total} (Personnel admin.)
          </div>
        </div>
      </GlowCard>
    </div>
  )
}

function Subtotal({ value }) {
  return (
    <div className="shrink-0 text-right">
      <div className="font-mono text-lg font-semibold text-turquoise">{value}</div>
      <div className="text-[10px] text-slate-500">مجموع</div>
    </div>
  )
}

function SpecialtyGrid({ rows }) {
  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
      {rows.map((r) => (
        <div key={r.specialty} className="rounded-md border border-slate-700/70 bg-navy-900/50 p-2 text-center">
          <div className="font-mono text-[11px] text-slate-400">{r.specialty}</div>
          <div className="font-display text-base font-semibold text-turquoise">{r.present}</div>
        </div>
      ))}
    </div>
  )
}
