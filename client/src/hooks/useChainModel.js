import { useEffect, useState, useCallback } from 'react'
import { api } from '../lib/api'

// Resolves which model is currently active on a chain, for department forms
// that only need the model id (and a light dashboard snapshot to prefill).
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
    if (info?.model) {
      setModelId(info.model.id)
      const dash = await api.getDashboardByChain(chainNumber)
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

  // Silent post-save refresh: the active model on this chain essentially
  // never changes between a field save and its refresh, so this skips the
  // getChains() round trip fetchData() needs on first load and just
  // re-reads the dashboard — one request instead of two on every single
  // hourly-slot or totals save, which matters on a slow factory connection.
  const refresh = useCallback(async () => {
    if (!modelId) return fetchData()
    const dash = await api.getDashboardByChain(chainNumber)
    setDashboard(dash)
  }, [chainNumber, modelId, fetchData])

  return { modelId, dashboard, loading, refresh }
}
