// One place for every user-facing error message (Arabic first, French
// below — the app has no language switch yet, so both are always shown).
// `err` is what lib/api.js throws: `kind` tells WHY it failed, `data` is
// the server's JSON body. Server-side validation errors (400/409) carry
// their own bilingual `message: { ar, fr }`, which always wins.

export const MESSAGES = {
  network: { ar: 'لم يتم الحفظ — ما كاينش الاتصال، عاود', fr: 'Non enregistré — pas de connexion, réessayez' },
  network_plain: { ar: 'ما كاينش الاتصال — عاود', fr: 'Pas de connexion — réessayez' },
  network_load: { ar: 'ما قدرناش نجيبو البيانات — ما كاينش الاتصال، عاود', fr: 'Chargement impossible — pas de connexion, réessayez' },
  // Online, but the server didn't answer in time / couldn't be reached /
  // is starting up — never called "no connection" (see lib/api.js).
  timeout: { ar: 'الخادم ما جاوبش فالوقت — عاود', fr: 'Le serveur ne répond pas — réessayez' },
  unreachable: { ar: 'ما قدرناش نوصلو للخادم — عاود', fr: 'Serveur injoignable — réessayez' },
  waking: { ar: 'الخادم كيتشغّل — عاود من بعد شوية', fr: 'Le serveur démarre — réessayez dans un instant' },
  slow: { ar: 'الاتصال بطيء، كنعاود…', fr: 'Connexion lente, nouvel essai…' },
  session: { ar: 'انتهت الجلسة — دخّل الرمز من جديد', fr: 'Session expirée — entrez le code' },
  server: { ar: 'خطأ في الخادم — عاود من بعد شوية', fr: 'Erreur serveur — réessayez' },
  forbidden: { ar: 'هاد العملية ماشي من صلاحية هاد القسم', fr: 'Action non autorisée pour ce département' },
  not_found: { ar: 'ما لقيناش هاد العنصر — حدّث الصفحة', fr: 'Introuvable — actualisez la page' },
  invalid: { ar: 'البيانات غير صحيحة — تحقق وعاود', fr: 'Données invalides — vérifiez et réessayez' },
  conflict: { ar: 'ما يمكنش دابا — حدّث الصفحة وعاود', fr: 'Impossible pour le moment — actualisez et réessayez' },
}

function join({ ar, fr }) {
  return `${ar}\n${fr}`
}

// `codes` lets a screen keep its own wording for a specific server error
// code (e.g. chain_full) — used only when the server sent no message.
// `load`: the failure was reading data, not saving; `plain`: neither
// (e.g. entering the PIN) — changes only the no-connection wording.
export function errorMessage(err, { load = false, plain = false, codes = {} } = {}) {
  const serverMessage = err?.data?.message
  if (serverMessage?.ar || serverMessage?.fr) return join({ ar: serverMessage.ar || '', fr: serverMessage.fr || '' })
  const code = err?.data?.error
  if (code && codes[code]) return typeof codes[code] === 'string' ? codes[code] : join(codes[code])
  // "offline" (real: the device has no connection) and the older generic
  // "network" kind get the "no connection" wording; everything else says
  // what really happened.
  const kind = err?.kind || (err?.timedOut ? 'timeout' : 'server')
  if (kind === 'offline' || kind === 'network') return join(plain ? MESSAGES.network_plain : load ? MESSAGES.network_load : MESSAGES.network)
  return join(MESSAGES[kind] || MESSAGES.server)
}
