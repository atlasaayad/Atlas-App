import { isSpeechRecognitionSupported } from '../hooks/useSpeechToNumber'

// Top-of-form toggle switching between typing and voice entry. Renders
// nothing (no error message either) when the browser has no Web Speech API —
// per spec, the mic option should just silently not exist there.
export default function VoiceModeToggle({ voiceMode, setVoiceMode }) {
  if (!isSpeechRecognitionSupported()) return null

  return (
    <div className="mb-3 inline-flex rounded-md border border-turquoise/30 p-0.5 text-xs">
      <button
        type="button"
        onClick={() => setVoiceMode(false)}
        className={`rounded px-3 py-1.5 font-medium ${!voiceMode ? 'bg-turquoise/15 text-turquoise' : 'text-slate-400'}`}
      >
        ✍️ Écrire
      </button>
      <button
        type="button"
        onClick={() => setVoiceMode(true)}
        className={`rounded px-3 py-1.5 font-medium ${voiceMode ? 'bg-turquoise/15 text-turquoise' : 'text-slate-400'}`}
      >
        🎙️ Parler
      </button>
    </div>
  )
}
