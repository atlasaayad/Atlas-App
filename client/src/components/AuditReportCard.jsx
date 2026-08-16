import { useEffect, useState } from 'react'
import GlowCard from './GlowCard'
import { api } from '../lib/api'
import { CHAIN_NUMBERS } from '../lib/constants'

export default function AuditReportCard({ token }) {
  const [chains, setChains] = useState([])
  const [chainNumber, setChainNumber] = useState(null)
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState(false)

  useEffect(() => {
    api.getChains().then((data) => {
      setChains(data)
      const firstActive = data.find((c) => c.model)
      if (firstActive) setChainNumber(firstActive.chainNumber)
    })
  }, [])

  async function handleExport() {
    if (!chainNumber || !from || !to) return
    setExporting(true)
    setError(false)
    try {
      const blob = await api.audit.exportReport(token, chainNumber, from, to)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `atlas-audit-chaine${chainNumber}-${from}-${to}.xlsx`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch {
      setError(true)
    } finally {
      setExporting(false)
    }
  }

  return (
    <GlowCard>
      <div className="font-display text-sm font-semibold text-slate-100">📋 Rapport de préparation audit (BSCI/SMETA)</div>
      <p className="mt-1 text-xs text-slate-500">
        سجل حضور يومي حقيقي، ساعات الإنتاج الموثقة، والفجوات — لفترة تختارها بنفسك.
      </p>
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <label className="block">
          <span className="mb-1 block text-xs uppercase tracking-wide text-slate-500">Chaîne</span>
          <select
            value={chainNumber || ''}
            onChange={(e) => setChainNumber(Number(e.target.value))}
            className="h-11 w-full rounded-md border border-slate-700 bg-navy-900 px-2 text-sm text-slate-200 focus:border-turquoise focus:outline-none"
          >
            <option value="" disabled>
              Chaîne
            </option>
            {CHAIN_NUMBERS.map((n) => {
              const info = chains.find((c) => c.chainNumber === n)
              return (
                <option key={n} value={n}>
                  Chaîne {n} {info?.model ? `— ${info.model.client}` : '(vide)'}
                </option>
              )
            })}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs uppercase tracking-wide text-slate-500">من</span>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="h-11 w-full rounded-md border border-slate-700 bg-navy-900 px-2 text-sm text-slate-200 focus:border-turquoise focus:outline-none"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs uppercase tracking-wide text-slate-500">إلى</span>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="h-11 w-full rounded-md border border-slate-700 bg-navy-900 px-2 text-sm text-slate-200 focus:border-turquoise focus:outline-none"
          />
        </label>
      </div>
      <button
        onClick={handleExport}
        disabled={exporting || !chainNumber || !from || !to}
        className="mt-3 w-full rounded-md border border-turquoise bg-turquoise/10 py-3 text-sm font-medium text-turquoise shadow-glow-sm active:bg-turquoise/20 disabled:opacity-50 sm:w-auto sm:px-6"
      >
        {exporting ? 'Génération…' : '⬇ Exporter (.xlsx)'}
      </button>
      {error && <div className="mt-2 text-sm text-status-bad">Échec de l'export, réessayez.</div>}
    </GlowCard>
  )
}
