import { useEffect, useState, useCallback, useRef } from 'react'
import { api } from '../lib/api'

// Resolves which model a department entry screen is working on for a chain,
// plus a light dashboard snapshot of it to prefill from.
//
// A chain runs either one open model or, during a fin de série / démarrage
// overlap, two (see openModels.js server-side). With `selectable`, the
// screen gets `openModels` + `selectModel(id)` to render a ModelSwitcher,
// and defaults to the démarrage (newest) model; without it (RH — the
// chain's headcount isn't split per model) it always resolves to the
// chain's oldest open model, exactly as before. `badgeKind` ('production' |
// 'quality') additionally fetches how many of today's hours each model
// already has an entry for, shown on the switcher.
//
// `loading` flips on the initial fetch (mount / chain switch) and on an
// explicit model switch — never on `refresh()`, which re-reads silently so a
// per-field save never unmounts the form the user is typing into.
export function useChainModel(chainNumber, { selectable = false, badgeKind = null } = {}) {
  const [openModels, setOpenModels] = useState([])
  const [totalSlots, setTotalSlots] = useState(0)
  const [modelId, setModelId] = useState(null)
  const [dashboard, setDashboard] = useState(null)
  const [loading, setLoading] = useState(true)
  const selectedRef = useRef(null)

  const loadList = useCallback(async () => {
    const r = await api.getChainOpenModels(chainNumber, badgeKind)
    setOpenModels(r.models)
    setTotalSlots(r.totalSlots)
    return r.models
  }, [chainNumber, badgeKind])

  const fetchData = useCallback(async () => {
    const models = await loadList()
    const kept = models.find((m) => m.id === selectedRef.current)
    const pick = kept || (selectable ? models[models.length - 1] : models[0]) || null
    if (pick) {
      selectedRef.current = pick.id
      setModelId(pick.id)
      setDashboard(await api.getDashboard(pick.id))
    } else {
      selectedRef.current = null
      setModelId(null)
      setDashboard(null)
    }
  }, [loadList, selectable])

  useEffect(() => {
    selectedRef.current = null
    setLoading(true)
    fetchData().finally(() => setLoading(false))
  }, [fetchData])

  const refresh = useCallback(async () => {
    const id = selectedRef.current
    if (!id) return fetchData()
    const [dash] = await Promise.all([api.getDashboard(id), badgeKind ? loadList() : null])
    if (selectedRef.current === id) setDashboard(dash)
  }, [fetchData, loadList, badgeKind])

  const selectModel = useCallback(async (id) => {
    if (id === selectedRef.current) return
    selectedRef.current = id
    setModelId(id)
    setLoading(true)
    try {
      const dash = await api.getDashboard(id)
      if (selectedRef.current === id) setDashboard(dash)
    } finally {
      if (selectedRef.current === id) setLoading(false)
    }
  }, [])

  return { modelId, dashboard, loading, refresh, openModels, totalSlots, selectModel }
}
