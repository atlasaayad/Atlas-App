const KEYS = {
  matches: 'atlasPredict.matches.v1',
  lessons: 'atlasPredict.lessons.v1',
  lang: 'atlasPredict.lang.v1',
}

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : fallback
  } catch {
    return fallback
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // localStorage unavailable (private mode / quota) — fail silently, app
    // still works for the current session, just without persistence.
  }
}

export const store = {
  loadMatches: () => read(KEYS.matches, []),
  saveMatches: (matches) => write(KEYS.matches, matches),
  loadLessons: () => read(KEYS.lessons, null),
  saveLessons: (lessons) => write(KEYS.lessons, lessons),
  loadLang: () => read(KEYS.lang, 'fr'),
  saveLang: (lang) => write(KEYS.lang, lang),
}

export function uid() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}
