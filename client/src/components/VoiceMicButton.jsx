import { useState } from 'react'
import { listenForNumber } from '../hooks/useSpeechToNumber'

// A mic button for one specific field. Tapping it listens for a spoken
// number, then shows an explicit confirmation ("فهمت: 130 بحقل X. صح؟")
// before the value is ever written into the field — nothing is committed
// on speech alone, only after the user taps "تأكيد".
export default function VoiceMicButton({ label, onConfirm }) {
  const [state, setState] = useState('idle') // idle | listening | confirm | error
  const [parsed, setParsed] = useState(null)

  async function start() {
    setState('listening')
    try {
      const { number } = await listenForNumber()
      if (number === null) {
        setState('error')
        return
      }
      setParsed(number)
      setState('confirm')
    } catch {
      setState('error')
    }
  }

  function confirm() {
    onConfirm(parsed)
    setState('idle')
    setParsed(null)
  }

  return (
    <div className="inline-block">
      <button
        type="button"
        onClick={start}
        disabled={state === 'listening'}
        className={`flex h-9 w-9 items-center justify-center rounded-md border text-sm ${
          state === 'listening'
            ? 'animate-pulse-soft border-turquoise bg-turquoise/20 text-turquoise'
            : 'border-turquoise/40 text-turquoise active:bg-turquoise/10'
        }`}
        aria-label={`Parler pour ${label}`}
      >
        🎙️
      </button>

      {state === 'confirm' && (
        <div className="mt-2 w-56 rounded-md border border-turquoise/40 bg-navy-900 p-2.5 text-xs">
          <div className="mb-2 text-slate-300">
            فهمت: <span className="font-mono font-semibold text-turquoise">{parsed}</span> بحقل{' '}
            <span className="text-slate-200">{label}</span>. صح؟
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={confirm}
              className="flex-1 rounded border border-turquoise/50 py-1.5 text-turquoise active:bg-turquoise/10"
            >
              ✓ تأكيد
            </button>
            <button
              type="button"
              onClick={start}
              className="flex-1 rounded border border-slate-600 py-1.5 text-slate-300 active:bg-navy-800"
            >
              ✗ إعادة المحاولة
            </button>
          </div>
        </div>
      )}

      {state === 'error' && (
        <div className="mt-2 w-56 rounded-md border border-status-bad/40 bg-navy-900 p-2.5 text-xs">
          <div className="mb-2 text-status-bad">ما قدرت أفهم رقم، حاول مرة ثانية.</div>
          <button
            type="button"
            onClick={start}
            className="w-full rounded border border-slate-600 py-1.5 text-slate-300 active:bg-navy-800"
          >
            إعادة المحاولة
          </button>
        </div>
      )}
    </div>
  )
}
