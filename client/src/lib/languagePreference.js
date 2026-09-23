// Language preference — purely personal to THIS device/browser
// (localStorage), never sent to the server or shared across devices. Each
// worker picks whatever reads best on their own tablet/phone/computer,
// independent of everyone else's. This is the storage + a small React hook
// only — it doesn't yet retranslate the app's own text (ATLAS has no
// translation catalog today; every screen's text is still hardcoded as
// written). Wiring real translations through every screen is separate,
// larger follow-up work.
const STORAGE_KEY = 'atlas_language_preference'
const DEFAULT_LANGUAGE = 'ar'

export const AVAILABLE_LANGUAGES = [
  { code: 'ar', label: 'العربية' },
  { code: 'fr', label: 'Français' },
]

export function getLanguagePreference() {
  try {
    return localStorage.getItem(STORAGE_KEY) || DEFAULT_LANGUAGE
  } catch {
    // Private browsing / storage blocked — falls back to the default every
    // time; never a hard failure.
    return DEFAULT_LANGUAGE
  }
}

export function setLanguagePreference(code) {
  try {
    localStorage.setItem(STORAGE_KEY, code)
  } catch {
    // Same as above — the in-memory state (via the hook below) still
    // updates for this tab, it just won't survive a reload on this device.
  }
}
