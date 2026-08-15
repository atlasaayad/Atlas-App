import { useEffect, useMemo, useState } from 'react'
import GlowCard from '../components/GlowCard'
import StatCircle from '../components/StatCircle'
import HourlyBarChart from '../components/HourlyBarChart'
import ExportTable from '../components/ExportTable'
import PosteStatusGrid from '../components/PosteStatusGrid'
import EffectifsGrid from '../components/EffectifsGrid'
import LiveIndicator from '../components/LiveIndicator'
import HistoriqueModal from '../components/HistoriqueModal'
import DetailsFinaleModal from '../components/DetailsFinaleModal'
import { usePolling } from '../hooks/usePolling'
import { api } from '../lib/api'
import { CHAIN_NUMBERS } from '../lib/constants'

export default function Home() {
  const [chains, setChains] = useState([])
  const [chainNumber, setChainNumber] = useState(null)
  const [lastUpdated, setLastUpdated] = useState(null)

  useEffect(() => {
    api.getChains().then((data) => {
      setChains(data)
      const firstActive = data.find((c) => c.model)
      if (firstActive) setChainNumber(firstActive.chainNumber)
    })
    const id = setInterval(() => api.getChains().then(setChains).catch(() => {}), 20000)
    return () => clearInterval(id)
  }, [])

  const { data, error } = usePolling(
    () => (chainNumber ? api.getDashboardByChain(chainNumber) : Promise.resolve(null)),
    [chainNumber]
  )

  useEffect(() => {
    if (data) setLastUpdated(Date.now())
  }, [data])

  const moduleOptions = useMemo(() => chains.filter((c) => c.model), [chains])

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-xl font-semibold text-slate-100">Tableau de bord</h1>
          <div className="mt-1">
            <LiveIndicator lastUpdated={lastUpdated} />
          </div>
        </div>
        <div className="flex gap-2">
          <select
            value={chainNumber || ''}
            onChange={(e) => setChainNumber(Number(e.target.value))}
            className="rounded-md border border-turquoise/30 bg-navy-800 px-3 py-2 text-sm text-slate-200 focus:border-turquoise focus:outline-none"
          >
            <option value="" disabled>
              Chaîne
            </option>
            {CHAIN_NUMBERS.map((n) => {
              const info = chains.find((c) => c.chainNumber === n)
              return (
                <option key={n} value={n} disabled={!info?.model}>
                  Chaîne {n} {info?.model ? `— ${info.model.client}` : '(vide)'}
                </option>
              )
            })}
          </select>
          <select
            value={chainNumber || ''}
            onChange={(e) => setChainNumber(Number(e.target.value))}
            className="rounded-md border border-turquoise/30 bg-navy-800 px-3 py-2 text-sm text-slate-200 focus:border-turquoise focus:outline-none"
          >
            <option value="" disabled>
              Module
            </option>
            {moduleOptions.map((c) => (
              <option key={c.chainNumber} value={c.chainNumber}>
                {c.model.dessin} — {c.model.client}
              </option>
            ))}
          </select>
        </div>
      </div>

      {!chainNumber && (
        <GlowCard>
          <div className="py-10 text-center text-slate-400">
            Aucune chaîne active pour le moment. Sélectionnez un module ou une chaîne.
          </div>
        </GlowCard>
      )}

      {chainNumber && error && (
        <GlowCard>
          <div className="py-10 text-center text-slate-400">Aucun modèle actif sur la Chaîne {chainNumber}.</div>
        </GlowCard>
      )}

      {chainNumber && data && <DashboardBody data={data} />}
    </div>
  )
}

function DashboardBody({ data }) {
  const [showHistorique, setShowHistorique] = useState(false)
  const [showDetailsFinale, setShowDetailsFinale] = useState(false)
  const today = new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'Africa/Casablanca',
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
  }).format(new Date())

  return (
    <div className="space-y-4">
      {/* 1. Identity card */}
      <GlowCard>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="font-display text-lg font-semibold text-slate-100">
              {data.identity.client} <span className="text-slate-500">· {data.identity.dessin}</span>
            </div>
            <div className="text-xs text-slate-500">Chaîne {data.chainNumber}</div>
          </div>
          <div className="flex flex-wrap gap-6 text-sm">
            <Field label="Qté totale" value={data.identity.qteTotale?.toLocaleString('fr-FR')} />
            <Field label="Début" value={data.identity.debut} />
            <Field label="Fin prévue" value={data.identity.finPrevue} />
          </div>
        </div>
      </GlowCard>

      {/* 2. Hourly chart + side stats — Objectif/heure and Objectif atteint live in the header, modest size */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_220px]">
        <GlowCard>
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
            <div className="font-display text-xs font-medium uppercase tracking-widest text-turquoise/80">
              Production horaire — aujourd'hui <span className="text-slate-500 normal-case">({today})</span>
            </div>
            <div className="flex items-baseline gap-5">
              <HeaderMetric label="Objectif/heure" value={Math.round(data.dt)} />
              <HeaderMetric label="Objectif atteint" value={`${data.objectifAtteintPct}%`} />
              <button
                onClick={() => setShowHistorique(true)}
                className="self-center rounded-md border border-turquoise/40 px-2.5 py-1.5 text-xs text-turquoise active:bg-turquoise/10"
              >
                📅 Historique
              </button>
            </div>
          </div>
          <HourlyBarChart hourly={data.hourly} />
          {showHistorique && (
            <HistoriqueModal chainNumber={data.chainNumber} onClose={() => setShowHistorique(false)} />
          )}
          <div className="mt-4 grid grid-cols-3 gap-3 border-t border-slate-800 pt-3 text-center">
            <Field label="Demandé" value={data.demande.toLocaleString('fr-FR')} block />
            <Field label="Produit" value={data.produit.toLocaleString('fr-FR')} accent block />
            <Field label="Restant" value={data.restant.toLocaleString('fr-FR')} block />
          </div>
        </GlowCard>
        <div className="flex flex-row gap-3 lg:flex-col">
          <GlowCard className="flex-1">
            <div className="text-xs uppercase tracking-wide text-slate-500">Prod à maintenant</div>
            <div className="mt-1 font-display text-2xl font-semibold text-turquoise glow-number">
              {data.prodAMaintenant.toLocaleString('fr-FR')}
            </div>
          </GlowCard>
          <GlowCard className="flex-1">
            <div className="text-xs uppercase tracking-wide text-slate-500">Ouvriers</div>
            <div className="mt-1 flex flex-col gap-0.5">
              <span className="font-mono text-sm text-slate-300">Présents: {data.ouvriers.presents}</span>
              <span className="font-mono text-sm text-slate-300">Requis: {data.ouvriers.requis}</span>
            </div>
          </GlowCard>
        </div>
      </div>

      {/* 3. Bilan de la chaîne */}
      <GlowCard title="Bilan de la chaîne">
        <div className="flex flex-wrap justify-around gap-4">
          <StatCircle label="Total entré" value={data.bilan.totalEntree} size="lg" />
          <StatCircle label="Total sortie" value={data.bilan.totalSortie} size="lg" />
          <StatCircle label="Le reste" value={data.bilan.leReste} size="lg" />
          <StatCircle label="En cours" value={data.bilan.enCours} size="lg" />
        </div>
      </GlowCard>

      {/* Quality indicators */}
      <div className="grid grid-cols-2 gap-4">
        <GlowCard className="text-center">
          <div className="text-xs uppercase tracking-wide text-slate-500">Qualité</div>
          <div className={`mt-1 font-display font-semibold ${data.quality.percentage === null ? 'text-sm text-slate-500' : 'text-xl text-turquoise glow-number'}`}>
            {data.quality.percentage === null ? 'Non renseigné' : `${data.quality.percentage}%`}
          </div>
        </GlowCard>
        <GlowCard className="text-center">
          <div className="text-xs uppercase tracking-wide text-slate-500">Reprises</div>
          <div className={`mt-1 font-display font-semibold ${data.quality.reprises === null ? 'text-sm text-slate-500' : 'text-xl text-slate-200'}`}>
            {data.quality.reprises === null ? 'Non renseigné' : data.quality.reprises}
          </div>
        </GlowCard>
      </div>

      {/* 4. Post-chain stages */}
      <GlowCard title="Post-chaîne">
        <div className="flex flex-wrap justify-around gap-4">
          <div className="flex flex-col items-center gap-2">
            <StatCircle label="↓ En cours Finale" value={data.finaleEnCours} />
            <button
              onClick={() => setShowDetailsFinale(true)}
              className="rounded-md border border-turquoise/40 px-2.5 py-1.5 text-xs text-turquoise active:bg-turquoise/10"
            >
              🔍 Détails Finale
            </button>
          </div>
          <StatCircle label="↓ Total pièces sur dépôt" value={data.depotTotal} />
        </div>
      </GlowCard>
      {showDetailsFinale && (
        <DetailsFinaleModal details={data.finaleDetails} onClose={() => setShowDetailsFinale(false)} />
      )}

      {/* 5. Export program */}
      <GlowCard>
        <div className="mb-3 font-display text-base font-semibold text-turquoise glow-number">
          Programme d'export
        </div>
        <ExportTable exports={data.exports} />
      </GlowCard>

      {/* 6. État des postes */}
      <GlowCard title="État des postes">
        <PosteStatusGrid postes={data.etatDesPostes} />
      </GlowCard>

      {/* 7. État des effectifs — last, least urgent */}
      <GlowCard title="État des effectifs">
        <EffectifsGrid effectifs={data.effectifs} />
      </GlowCard>
    </div>
  )
}

function HeaderMetric({ label, value }) {
  return (
    <div className="text-right">
      <div className="text-[10px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className="font-mono text-base font-semibold text-turquoise">{value}</div>
    </div>
  )
}

function Field({ label, value, accent, block }) {
  return (
    <div className={block ? '' : 'flex flex-col'}>
      <div className="text-[11px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`font-mono text-sm font-medium ${accent ? 'text-turquoise' : 'text-slate-200'}`}>{value ?? '—'}</div>
    </div>
  )
}
