import { useCallback, useEffect, useRef, useState } from 'react'
import { errorMessage } from '../lib/errors'

// Shared save lifecycle for every form: saving → saved (2 s) or error.
// A failed save stays visible (red) until the next save attempt — it is
// never replaced by an older "Enregistré ✓", and `run` never throws, so a
// failure can't turn into a silent unhandled promise rejection. The form's
// own state (what the user typed) is left untouched on failure.
export function useSaveStatus() {
  const [state, setState] = useState({ status: 'idle', message: '' })
  const timer = useRef(null)
  useEffect(() => () => clearTimeout(timer.current), [])

  const run = useCallback(async (fn, options) => {
    clearTimeout(timer.current)
    setState({ status: 'saving', message: '' })
    try {
      const result = await fn()
      setState({ status: 'saved', message: '' })
      timer.current = setTimeout(() => setState((s) => (s.status === 'saved' ? { status: 'idle', message: '' } : s)), 2000)
      return { ok: true, result }
    } catch (err) {
      setState({ status: 'error', message: errorMessage(err, options) })
      return { ok: false, error: err }
    }
  }, [])

  return {
    saving: state.status === 'saving',
    saved: state.status === 'saved',
    error: state.status === 'error' ? state.message : '',
    run,
  }
}
