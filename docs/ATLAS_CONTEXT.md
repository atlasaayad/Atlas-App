# ATLAS — PROJECT CONTEXT
> Single shared reference for everyone working on Atlas (Mohamed, Claude Code, Claude strategist, GPT reviewer).
> Read this file before any task. Update it at the end of every merged PR (sections 4, 6 and 7).
> Never write secrets here (PINs, tokens, keys, passwords).

Last update: 2026-10-02 (PR #48 open — trial bugs A–D: session, connection errors, Fiche login, 2-model Home)

---

## 1. What Atlas is
- Production-tracking web app for garment factories (confection). First factory: **Casual** (Morocco).
- Owner / product lead: **Mohamed** (Responsable Méthodes & Planning at Casual). Final decisions are his.
- Goal: stable in-house use at Casual, then sell to other Moroccan garment factories.
- Production URL: https://atlas-app-smoky.vercel.app
- UI languages: French + Arabic/Darija. Users work mostly on **phones and tablets**.

## 2. Infrastructure (current, verified)
| Item | Value |
|---|---|
| Repo | github.com/atlasaayad/Atlas-App — `main` = production |
| Hosting | Vercel, team `atlasaayads-projects`, project **atlas-app** (the only project; `atlas-app-kfr5` was deleted — never recreate it) |
| Database | Neon Postgres, raw `pg`, no ORM. **Preview and Production share the same database.** |
| Schema | `ensureSchema()` in `server/src/db/index.js`, runs on every cold start (idempotent). No migration tool. |
| Stack | React 18 + Vite + Tailwind + React Router (client) · Express as one Vercel function (`api/index.js`) |
| Auth | 12 departments, one PIN each (4 digits) → JWT (24h idle, sliding renewal, 7-day max). PINs live in Vercel env `PIN_*` (Production + Preview, same values). |
| Blob `atlas-images` | **Public**, fra1 — model photos only (`BLOB_READ_WRITE_TOKEN`) |
| Blob `atlas-documents` | **Private**, fra1 — customer technical documents (`DOCS_BLOB_*`) |
| AI | `ANTHROPIC_API_KEY` — Ask Atlas only |
| Tests | `node:test`, 245 tests (`npm test`, needs a local Postgres test database — `DATABASE_URL` in `.env`), run by hand (no CI yet) |

## 3. Working rules (mandatory)
1. **Branch + Pull Request.** Never commit directly to `main`. **Never merge until Mohamed says "merge"** (or explicitly authorises a conditional merge).
2. **Database:** only additive changes (`CREATE TABLE/INDEX IF NOT EXISTS`) and only after Mohamed approves the exact SQL. Any ALTER / DROP / UPDATE / DELETE on existing data → **STOP and ask**. Remember: a preview starting = the SQL runs on the production database.
3. **Do not touch without explicit request:** `openModels.js` and changeover logic, production calculations, `production_history` / `quality_history` unique keys, `work_hours` ordering, `imageUpload.js`, authentication.
4. Before declaring done: `npm test`, `npm run build`, `npm run lint` must pass. Report exact numbers.
5. **Claude Code cannot open `*.vercel.app` and has no phone.** Real-device / preview tests are done by Mohamed. Never claim a manual test passed unless Mohamed reported it. Always end with a short manual checklist.
6. Read-only analysis first for any non-trivial feature; stop and report before architectural decisions.
7. Secrets only in Vercel env vars — never in code, chat, prompts or this file.
8. Keep the UI simple and mobile-first. The feature name shown to users must be understandable by shop-floor staff.

## 4. Key decisions (do not re-debate without Mohamed)
- **Max 2 open models per chain** (`fin de série` + `démarrage`; shown to users as **"Fin d'entrée"** — internal code/DB names stay `fin_de_serie`). Third → 409 `chain_full`. Closing via `status='closed'` (row keeps `active=1` — `active` and `status` are NOT equivalent; use `status='active'` only where "current open model" is meant).
- **Chain rendement** = Σ(qty × VT) / (effectif × minutes) × 100 — correct with 2 models in the same hour.
- Colour variants (`parent_model_id`): documents + composition shared from parent; production/quality/timeline stay per variant.
- **Public (no login, factory TV):** Home, chain dashboards, Classement, Historique, État des effectifs, early warnings. Everything else needs a PIN.
- `/api/ask` requires a department login. `/api/personnel-admin` requires RH or Patron.
- Lockout: 5 wrong PINs per (department + IP) → 10 min.
- CORS: allowlist (production domain + atlas-app previews + same origin), configurable via env (`CORS_ALLOWED_ORIGINS`, `CORS_PREVIEW_ORIGIN_PATTERN`).
- **Fiche Modèle:** fully behind login. Customer documents are confidential: private Blob, direct browser upload (≤ 10 MB, upload link valid 5 min), signed read links (2 min). Upload/delete = Méthode + Patron; read = any logged-in department.
- Composition: must total exactly **100 % per part** (Principal, Doublure…), validated front + back. Edit = Méthode + Patron.
- Factory info (legal name, ICE, address…) = one JSON under `config.factory_info`; **edit = Patron only**.
- Timeline: never infer "Terminée" from the last activity date. Only explicit signals (launch timer stopped; production = model closed). Qualité is never "Terminée" from model closure alone.
- Model photos compressed on the phone: JPEG/PNG/WebP ≤ 2.2 MB are uploaded unchanged; anything larger → 1600 px, JPEG 0.85 (lowered to 0.75 / 0.65 only if still too big).
- Football/Predict app removed completely (code + tables). Never reintroduce.
- **Errors (client):** every save/load goes through `lib/api.js` (error `kind`) + `lib/errors.js` (the ONE bilingual AR/FR message catalogue) + `useSaveStatus` / `ErrorNote`. A failed save stays red until the next attempt, never hidden by an older "Enregistré ✓", and never clears what was typed. Server messages (`message: {ar, fr}`) are shown as-is.
- **Expired session:** a 401 on a call that sent a token clears that department's token and shows its PIN pad on top of the form (form stays mounted, values kept). Public screens never send a token → never affected. No retry, no loop.
- **Session policy (PR #48):** PIN once per tab opening (token in `sessionStorage`). Token idle lifetime 24 h; any authenticated request older than 10 min gets a renewed token in the `X-Atlas-Token` response header (client swaps it in). Absolute maximum 7 days from the PIN entry (`s` claim). PIN asked again only on: new tab / tab closed, Déconnexion, PIN changed in Vercel (`pin_rotated`), 24 h idle or 7 days. Cold starts never re-hash an unchanged PIN (config `pin_stamps`), so tokens stay valid across instances. A 403 (wrong department) never clears a token — only a 401 does.
- **Connection errors (PR #48):** `lib/api.js` classifies: `offline` (device has no network — the only case that says "pas de connexion"), `timeout`, `unreachable` (online but request failed), `waking` (502/503/504 — server starting), then by status (session/forbidden/not_found/conflict/locked/invalid/server).
- **Timeout / retry (PR #48):** 25 s per attempt; ONE automatic retry after 1.5 s on timeout / unreachable / waking, for GET/PUT/DELETE and idempotent POSTs flagged `retry:true` (login, close, dismiss, timers, document upload-request/confirm/open). Creating POSTs (new rows, hourly entries) are never retried → no duplicates. A request still running after 6 s shows the amber bar "الاتصال بطيء، كنعاود… / Connexion lente, nouvel essai…".
- **Login inside modals (PR #48):** a 401 in the Fiche Modèle (or Ask) shows the department choice + PIN pad in place, then reloads. A failed load never shows an empty state ("Aucun …") — it shows the real error.
- **Home with 2 open models (PR #48):** two buttons under the chain selector (🟢 Démarrage · model / 🟠 Fin d'entrée · model), default Démarrage, choice remembered per device (`localStorage`). Everything below is filtered to the selected model; only Ouvriers (présents summed, requis = max) and Rendement chaîne are chain-level, labelled "Chaîne". "Aucun modèle actif" only on a real 404.
- **Server validation** (`server/src/validation.js`, 400 + AR/FR message, new input only, existing rows never modified): no negative quantities anywhere; gamme TPS > 0; Fin prévue ≥ Début; work hours end > start and no overlap (ordering/storage unchanged); specialties differing only by capitals/spaces/accents refused (exact-name rename merge kept).
- **Warnings (confirm only, never blocking)** in `client/src/lib/warnings.js`: retouches > that hour's production; > 2,000 pieces/hour; Total entré, Qté totale, Commande > 1,000,000; Finale, Dépôt, export > 100,000; operation > 1,800 s; personnel administratif > 1,000.
- **`/api/models/:id`:** without a token → identity/quantities/VT only (no gamme, machines, Commande, launch team, required headcount); valid token → full detail; token sent but invalid → 401 (never a reduced view).
- Language option hidden in Réglages until real FR/AR + RTL exists.
- **No DPP / QR / EU integration yet.** EU textile DPP delegated act expected ~2027, mandatory ~2028-2029. Fiche Modèle (composition, factory identity, stage dates) is the groundwork. Do not display "DPP" or "Passeport numérique" in the UI.

## 5. Modules in production
Models & variants (photo, gamme/VT, launch timer) · Planning (manual days, Plan vs Réel) · Hourly production · Quality (retouche) · RH attendance & effectifs · Finale · Dépôt · Logistics/export · Patron (finance, CPM, devis, Excel export, audit report) · Generic postes (Coupe, Magasin, Mécanicien, Échantillon) · Settings (specialties, work hours, factory info, feedback, language) · Fin de série / Démarrage changeover · Fiche Modèle · Ask Atlas.

## 6. Change log (merged PRs)
| PR | Content |
|---|---|
| #38 | Planning redesign (single continuous table) |
| #39 | Settings: editable specialties, feedback, per-device language |
| #40 | Model photo, centralised work hours, manual planning days |
| #41 | Fix "Total sortie = 0" when Début is empty |
| #42 | Fin de série / Démarrage (2 models per chain) |
| #43 | Hardening: Predict code removed, Ask auth, personnel-admin auth, lockout dept+IP, CORS, PIN warning, ESLint 9 |
| #44 | Fiche Modèle (documents, composition, factory info, timeline) + Ask "Connexion" button |
| #45 | Client-side photo compression (small images unchanged) + drop Predict tables |
| #46 | Shared project context: `docs/ATLAS_CONTEXT.md` + root `CLAUDE.md` |
| #47 | Pre-trial fixes: clear AR/FR errors + expired-session re-login (A), server validation + warnings (B), public `/api/models/:id` restricted (E), typed counters / Patron fits phone / confirm export delete / language hidden (D part) |
| #48 | Trial bugs: session no longer expires on cold starts + sliding renewal (A); correct offline/slow/server-starting errors, 25 s timeout + 1 safe retry, slow bar, kfr5 removed from CORS default (B); PIN pad inside Fiche Modèle / Ask (C); Home per-model view with 2 open models, "Fin d'entrée" label (D) — **open, not merged** |

## 7. Known issues / backlog (small, not started)
- A test depends on the time of day ("Couleur/Variante … total combiné exact" fails before ~12:00 factory time) → make it time-independent.
- Downloaded documents get the random storage name → serve with the original filename (Content-Disposition).
- Language: real FR/AR translation + right-to-left layout (option hidden for now) — QA #8, #18.
- Patron model list: colour variant shown as a duplicate model name without colour; closed models not marked (QA #12).
- "Client · Dessin" labels: empty "()" when no Dessin; model pickers mix dessin/client (QA #13).
- Excel export is a raw database dump (technical columns, ids, UTC timestamps) → readable export (QA #15).
- Journal shows some raw action codes (e.g. `update_quality_hourly`) (QA #16).
- Coupe/postes % wording ("نسبة إنجاز") vs Fiche timeline meaning (health) → one meaning (QA #17).
- Typos mixing scripts ("بالدépôt"); native grey browser confirm dialogs (QA #19).
- Public dashboard response still includes `identity.commande` (not displayed) → consider removing.
- Server code is not linted (ESLint only in `client/`); 24 old style warnings in `client/`.
- Production data: during the trial the Fin d'entrée model on the Denllo chain may have a wrong Total entré (150, written by bug D) → Mohamed re-enters the real value in Production (no SQL).
- Fin d'entrée / Démarrage: Classement shows the chain rendement ("2 modèles"); per-model ranking not planned.
- No CI (GitHub Actions) — tests only run by hand.
- One shared PIN per department; no individual user accounts.
- No client entity (client = text field on the model); no materials, suppliers, invoicing.
- Single-factory deployment (no multi-tenant yet) — required before selling to other factories.

## 8. Ideas for later (not approved for build)
Proactive WhatsApp summary for the Patron · Delivery-risk prediction per model · Anonymous cross-factory benchmark · Gamification / chain leaderboard · Absenteeism forecast · Heat-stress alert · Plan vs Réel for fabric consumption · Earned wage access (via partner) · Verified production report for banks · Read-only client portal · Worker skill passport · Verified capacity marketplace · DPP service (after EU textile act).

## 9. Current priority (Oct 2026)
**Real daily use at Casual** over new features: real models (photo, gamme, planning, fiche), hourly production entered every day on at least 2–3 chains, so the Patron sees real numbers. New features only if they remove friction for daily use.
