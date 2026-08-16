const ARABIC_INDIC_DIGITS = '٠١٢٣٤٥٦٧٨٩'

function extractNumber(transcript) {
  const normalized = transcript.replace(/[٠-٩]/g, (d) => String(ARABIC_INDIC_DIGITS.indexOf(d)))
  const match = normalized.match(/\d+/)
  return match ? Number(match[0]) : null
}

export function isSpeechRecognitionSupported() {
  return typeof window !== 'undefined' && !!(window.SpeechRecognition || window.webkitSpeechRecognition)
}

// Wraps the Web Speech API to listen once and resolve to a number parsed
// from the transcript (or null if no digits were understood). The caller
// still confirms the parsed value before using it — this hook only turns
// speech into a candidate number.
export function listenForNumber({ lang = 'ar-MA' } = {}) {
  return new Promise((resolve, reject) => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognition) {
      reject(new Error('not_supported'))
      return
    }
    const recognition = new SpeechRecognition()
    recognition.lang = lang
    recognition.maxAlternatives = 1
    recognition.interimResults = false

    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript
      resolve({ transcript, number: extractNumber(transcript) })
    }
    recognition.onerror = (event) => reject(new Error(event.error || 'speech_error'))
    recognition.onend = () => {}

    recognition.start()
  })
}
