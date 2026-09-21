import { useEffect, useState, useCallback } from 'react'
import { api } from '../lib/api'

// Resolves which model is currently active on a chain, for department forms
// that only need ONE model id (and a light dashboard snapshot to prefill) —
// RH, Quality's own non-hourly fields, Dépôt, Finale, Logistics, the generic
// poste screens. A chain can have more than one model open at once (a chain
// overlap — an old model finishing while a new one starts on the same
// chain, see openModels.js server-side); these screens weren't asked to
// become multi-model-aware, so this hook always resolves to the chain's
// PRIMARY (oldest/first) open model, consistently, via the per-model
// dashboard endpoint (GET /models/:id/dashboard) rather than the chain-wide
// one (which can return the `{multi:true, dashboards:[...]}` shape Home.jsx
// alone understands). Agent Production's and Quality's own hourly-entry
// screens don't use this hook for their hourly data — they resolve every
// open model on the chain server-side, generalized from Couleur/Variante
// (see getHourlyEntryTargets(), openModels.js) — only this hook's single-
// model simplification is deliberately scoped to the other screens.
//
// `loading` only ever flips around the initial fetch (mount / chain switch).
// `refresh()` re-runs the same fetch silently, without touching `loading` —
// a form that shows `if (loading) return <Spinner />` would otherwise
// unmount its entire input tree on every single per-field save, discarding
// whatever the user is mid-typing into any other field on the page.
export function useChainModel(chainNumber) {
  const [modelId, setModelId] = useState(null)
  const [dashboard, setDashboard] = useState(null)
  const [loading, setLoading] = useState(true)

  // Full resolve: which model (if any) is active on this chain, then its
  // dashboard. Needed on mount/chain switch, since modelId isn't known yet.
  const fetchData = useCallback(async () => {
    const chains = await api.getChains()
    const info = chains.find((c) => c.chainNumber === chainNumber)
    const primary = info?.models?.[0] || info?.model || null
    if (primary) {
      setModelId(primary.id)
      const dash = await api.getDashboard(primary.id)
      setDashboard(dash)
    } else {
      setModelId(null)
      setDashboard(null)
    }
  }, [chainNumber])

  useEffect(() => {
    setLoading(true)
    fetchData().finally(() => setLoading(false))
  }, [fetchData])

  // Silent post-save refresh: the primary model on this chain essentially
  // never changes between a field save and its refresh, so this skips the
  // getChains() round trip fetchData() needs on first load and just
  // re-reads its dashboard — one request instead of two on every single
  // hourly-slot or totals save, which matters on a slow factory connection.
  const refresh = useCallback(async () => {
    if (!modelId) return fetchData()
    const dash = await api.getDashboard(modelId)
    setDashboard(dash)
  }, [modelId, fetchData])

  return { modelId, dashboard, loading, refresh }
}
