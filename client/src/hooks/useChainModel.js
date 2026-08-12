import { useEffect, useState, useCallback } from 'react'
import { api } from '../lib/api'

// Resolves which model is currently active on a chain, for department forms
// that only need the model id (and a light dashboard snapshot to prefill).
export function useChainModel(chainNumber) {
  const [modelId, setModelId] = useState(null)
  const [dashboard, setDashboard] = useState(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
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
    } finally {
      setLoading(false)
    }
  }, [chainNumber])

  useEffect(() => {
    load()
  }, [load])

  return { modelId, dashboard, loading, refresh: load }
}
