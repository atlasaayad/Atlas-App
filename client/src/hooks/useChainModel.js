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

  return { modelId, dashboard, loading, refresh: fetchData }
}
