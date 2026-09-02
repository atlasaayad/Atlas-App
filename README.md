# ATLAS — Production Tracking Platform

Real-time production tracking for a garment/textile factory floor (tenant:
**Casual**). A public home dashboard shows live status per Module/Chaîne (no
login), an "Ask Atlas" AI assistant answers questions about that same live
data (no login either), and each department (Agent Méthode, Agent
Production, RH, Quality, Finale, Dépôt, Logistics, La Coupe, Magasin,
Mécanicien, Échantillon, Patron) enters its own data behind a 4-digit PIN.
Bottom nav: **Accueil** (dashboard) · **Départements** (PIN-gated forms) ·
**Ask Atlas** (AI Q&A, public).

Visual identity: dark navy background with glowing turquoise corner
brackets, inspired by JACK Smart Factory Kanban displays. Space Grotesk for
numbers/titles, Inter for body text, JetBrains Mono for technical detail.

## Structure

```
api/      Vercel serverless entry point — imports server/src/app.js as-is.
server/   Express app + Postgres (pg). Routes, PIN auth, calculations, schema/seed.
client/   Vite + React + Tailwind. Public dashboard + PIN-gated department forms.
```

The whole app deploys as **one Vercel project**: `client/` builds to a static
SPA, and `server/`'s Express app is re-exported from `api/index.js` as a
single serverless function that Vercel routes every `/api/*` request to (see
`vercel.json`). Same origin, so the client just calls relative `/api/...`
paths — no CORS, no separate host to stand up.

Data lives in Postgres (built and tested against both a local Postgres and
[Neon](https://neon.tech)'s free tier, which is what powers Vercel's native
Postgres integration). SQLite was the original choice but doesn't survive on
serverless hosts (no persistent disk), so the DB layer (`server/src/db/`)
talks to Postgres over `pg`, async throughout.

## Getting started (local dev)

Needs a Postgres database — either `docker run -p 5432:5432 -e POSTGRES_PASSWORD=postgres postgres:16`
or any local/hosted instance.

```bash
# 1. API deps (project root — these are what api/index.js's serverless
#    function needs; client/ has its own separate package.json)
npm install
cp .env.example .env   # set DATABASE_URL to your Postgres instance
npm run dev:server     # http://localhost:4000 — creates tables + seeds demo data on first boot

# 2. Client (http://localhost:5173, proxies /api to the server)
cd client
npm install
npm run dev
```

Open http://localhost:5173 — the home dashboard, Départements grid, and PIN
entry all work against the demo data seeded above.

Run the automated tests with `npm test` (repo root) — see Automated Tests
below.

### Default department PINs

Printed on every boot. Override per-department via env vars
(`PIN_METHODE`, `PIN_PRODUCTION`, …) — see `.env.example`. Unlike the rest
of the seed data, PINs are re-synced on every boot, so changing one of
these (in `server/src/db/seed.js`'s `DEFAULT_PINS`, or via the env var) and
redeploying is enough to rotate it, even on an already-seeded database.

| Department | PIN |
|---|---|
| Agent Méthode | 1111 |
| Agent Production | 2222 |
| Patron | 3333 |
| Mécanicien | 4444 |
| Magasin | 5555 |
| Logistics | 6666 |
| Quality | 7777 |
| RH | 8888 |
| La Coupe | 9999 |
| Dépôt | 1010 |
| Finale | 1313 |
| Échantillon | 1212 |

## How it fits together

- **Agent Méthode** creates a model, assigns it to a chain (1-8), builds the
  **gamme de montage** (operation list with machine + TPS in seconds), and
  sets required headcount per specialty. The server computes **VT**
  (= Σ TPS ÷ 60), **DT** (Objectif/heure = ND × 3600 ÷ Σ TPS) and
  **Objectif/jour** (= DT × 9h) — never entered by hand.
- **Agent Production** enters actual output for each of the 9 fixed hourly
  slots (6:30-16:00, including the 11:30-13:00 slot that spans the lunch
  break) plus running Total entré / Total sortie for the chain.
- **RH** enters daily headcount present for the 15 specialties (301, 502,
  504, 516, Main, Sp, M/sp, Finition, Control, Stg, Fer, Mach retouche,
  Trns, Chef, Robot); required headcount comes from Agent Méthode.
- **Quality, Finale, Dépôt** each own one metric (quality % + reprises,
  en-cours finale, pièces sur dépôt).
- **Logistics** appends rows to the export program (description, quantité,
  date) — client/mod come from the model.
- **La Coupe, Magasin, Mécanicien, Échantillon** each report a single daily
  "État du poste %" + optional note; these drive the three-color (green /
  yellow / red) status grid on the home dashboard.
- **Patron** enters per-model cost/price inputs (see the Patron Finance
  Screen feature below) and gets computed cost total, revenue and profit %
  — visible to Patron only, never on the public dashboard or to Ask Atlas.

All writes are journaled to `audit_log` (who / what / when) via the
department's PIN-derived identity. The public home dashboard polls
`/api/chains/:n/dashboard` every ~12s for near-real-time updates across
devices.

## Features

Documented here as they're added — see each subsection for what it does,
who uses it, and which fields/tables it touches. Keep this current: every
new major feature gets its own entry.

### Backdated Production Entry (Agent Production)

A date picker above "Production par heure" (`ProductionForm.jsx`,
`GET/PUT /api/production/models/:id/hourly`) lets Agent Production go back
and enter or correct any previous day's hourly output — not just today —
bounded to `[model.debut, today]` and validated on both client and server.

- **Single source of truth**: hourly production has no separate "today"
  table — `production_history` (permanent, keyed by chain/date/slot) is
  read for today exactly the same way it's read for any other date. This
  is what guarantees a backdated correction shows up immediately and
  everywhere: the live dashboard (when the edited date is today),
  Historique's day/range/month aggregates, the early-warning agent, and
  Patron's full-data export — none of them hold a second, potentially
  stale copy. An earlier `hourly_production` table played that live-cache
  role; it's retired.
- **Audit trail**: every save is logged with the affected `date`; a save to
  any date other than today is additionally flagged `isBackdated: true` and
  shown with an explicit "🕒 تعديل بأثر رجعي" marker in Patron's Journal des
  modifications — distinct from routine same-day entry, so a later review
  (BSCI/SMETA or otherwise) can see exactly where a retroactive change was
  made.
- **"Total entré"** is unaffected by the date picker — it's a single daily
  figure entered once by Agent Production and always refers to today.

### Early Warning Agent (Home dashboard, public)

Proactive alert banner (`EarlyWarningBanner` component, `GET
/api/early-warnings`) that watches the *trend* of hourly production per
active chain, not just the current snapshot — the existing red/yellow/green
system stays exactly as it was, this is an earlier, additional signal.

- **Detection**: `detectDeclineTrend()` in `server/src/calc.js` walks
  backward from the most recently recorded hour and flags a chain once it
  has **3 or more consecutive hours** (genuinely consecutive slot indices,
  no gaps) of strictly decreasing output. A single bad hour, a dip that
  recovers, or a gap in reporting never triggers it.
- **Real data only**: reads `production_history` (the single source of
  truth for hourly data — see Backdated Production Entry above) filtered to
  today. Fewer than 3 hours actually recorded today means no alert, never a
  guess.
- **Auto-clears**: nothing is persisted as "an active alert" — it's
  recomputed from live data on every poll (every 20s), so a chain that
  posts a better hour next simply stops appearing, no manual dismissal.
- Shown at the top of Home, above the dashboard body, in a distinct amber
  card (`amber` Tailwind color, separate from `status.warn`) with multiple
  concurrent chains listed if more than one is affected. In-app only for
  now — no external notifications.

### Ask Atlas (`💬 Ask Atlas` tab, public, no PIN)

Chat UI (`client/src/pages/Ask.jsx`) backed by `POST /api/ask`
(`server/src/routes/ask.js`), calling the Claude API
(`claude-haiku-4-5-20251001` — cheap enough for simple data lookups, no
deep reasoning needed). Answers
questions in Arabic/Darija/French using only real current DB data
(production, RH, quality — the same fields the public dashboard shows); if
the data isn't there, it says so instead of guessing.

- **Financial exclusion is structural, not prompt-based**: `buildContext()`
  in `ask.js` never queries `patron_finance` or the `config.cpm` key — there
  is no code path that could put a cost/profit/CPM number into what gets
  sent to the model, so no phrasing of a question can leak one.
- **Daily rate limit**: `ask_usage` table caps calls to `ASK_DAILY_LIMIT`
  (default 100) per factory-local day, checked before the Anthropic call so
  a capped day costs nothing further. Resets at local midnight
  (`todayInFactoryTZ`, Africa/Casablanca).
- **Voice input**: every department's numeric fields get an optional
  "🎙️ Parler" mode (`client/src/hooks/useSpeechToNumber.js`,
  `VoiceModeToggle`/`VoiceMicButton` components) via the Web Speech API.
  Speaking a number always shows an explicit confirmation ("فهمت: 130 …
  صح؟") before it's saved — never auto-commits. Hidden automatically on
  browsers without SpeechRecognition support.
- Needs `ANTHROPIC_API_KEY` set (see Environment variables below); without
  it the route returns `503 ai_not_configured` and the UI says so instead
  of erroring.

### BSCI/SMETA Audit-Readiness Report (Patron + RH)

"تصدير تقرير جاهزية التدقيق" button (`AuditReportCard` component,
`GET /api/audit/report`) generates an `.xlsx` for a chosen date range: daily
attendance per specialty, hours of production actually documented, gaps vs.
required headcount, and a real timestamp per record. Any day with no data
recorded shows an explicit "AUCUNE DONNÉE ENREGISTRÉE" row instead of being
silently skipped. Backed by `rh_attendance_history` (permanent, one row per
chain/specialty/day — the live `rh_attendance` table only holds today).

### Instant Quote — CPM + Devis (Agent Méthode + Patron only)

Patron sets a factory-wide **CPM** (cost per minute, `config.cpm` key,
Patron-only screen). Agent Méthode's model summary and Patron's own model
finance card both get a "💰 Générer un devis" button
(`client/src/components/DevisCard.jsx`, `GET /api/devis/:modelId`) that
computes **CMT (cost per piece) = VT × CPM** — raw production cost, no
margin added. Shows a clear message instead of a number if Patron hasn't
set CPM yet. No other department, and not Ask Atlas, can reach this route.

### Patron Finance Screen (Patron only)

Per-model finance card (`ModelFinanceCard` in `PatronForm.jsx`,
`PUT/GET /api/patron/models/:id`, `patron_finance` table):

- **Coût modèle** — manual number (matières/tissu).
- **Coût ouvriers** — toggle between a manual number or *nombre d'ouvriers ×
  salaire moyen*; both value pairs are kept in storage so switching modes
  never loses data.
- **Autres dépenses** — itemized list (libellé + montant), add/remove any
  number of lines; the total is the sum, computed automatically.
- **Revenu prévisionnel** — `prix de vente unitaire × quantité`, where the
  quantity is the **real exported quantity** (`SUM(logistics_exports.quantite)`)
  when any exists, falling back to the ordered quantity (`qte_totale`) as an
  estimate otherwise — the UI states explicitly which basis is in use.
- **Coût total / Revenu / Profit / Profit %** — all computed server-side,
  never entered by hand.

Entirely Patron-only: no other department's route, and no field Ask Atlas's
`buildContext()` touches, ever reads `patron_finance`.

### Automated Tests

`server/src/calc.test.js` — unit tests for the VT/DT/Objectif-jour chain
(known numbers + a regression check against the real seeded demo model).
`server/tests/integration.test.js` — spins up the real Express app on an
ephemeral port against a real Postgres DB and exercises it over HTTP: PIN
login (success/failure/lockout), gamme/effectif → ND/VT/DT, a department
save reflecting on the public dashboard, Patron's profit calc, and the Ask
Atlas daily limit. Every test cleans up its own data and restores any
shared state (an active chain slot, a day's usage counter) it touched.

Run with **`npm test`** from the repo root (loads `.env` automatically if
present). Not exhaustive — covers the critical paths above; extend it as
new critical logic is added.

### PR + Preview Workflow

Any change that touches app behavior or sensitive data goes through a pull
request with a Vercel preview deployment link, reviewed and explicitly
approved before merging to `main` — not merged straight from a local
branch. Purely additive, zero-runtime-impact changes (like the test suite
itself) may be merged directly, with the reasoning stated in the PR. GitHub
branch protection on `main` enforces this at the repo level.

## Deploying (Vercel + Neon, both free, no credit card)

One Vercel project serves everything — no second host needed.

1. **Import the repo into Vercel** — vercel.json at the root already builds
   `client/` and wires `/api/*` to the serverless function, so no project
   setting changes are required.
2. **Add Postgres** — in the Vercel project, **Storage → Create Database →
   Neon (Postgres)**. This provisions a free Neon database and auto-injects
   `DATABASE_URL`/`POSTGRES_URL` into the project's environment variables —
   no manual connection string copying.
3. **Deploy / redeploy.** On first request, the API creates its tables and
   seeds departments/a demo model automatically. Safe to run on every cold
   start: the demo model and schema are only created once, while
   departments' label/icon/PIN are re-synced from `server/src/db/seed.js`
   (or the `PIN_<DEPT>` env vars) every time — so redeploying after
   changing a PIN there is enough to rotate it.
4. Open the Vercel URL — that's the working app.

Both Vercel's Hobby plan and Neon's free tier are genuinely free with no
card required (verified directly against their current pricing pages, not
assumed) — see the tradeoffs below before relying on either for real
factory data:

> Neon's free tier: no card, never expires, 0.5 GB storage. Fine for this
> app's data volume. Vercel's Hobby plan is officially for personal,
> non-commercial projects — using it for an internal factory tool is a gray
> area worth being aware of if this grows past a pilot; Vercel Pro removes
> that restriction.

### Environment variables (Vercel Project Settings)

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | Yes | Auto-set by the Neon integration; a `POSTGRES_URL` from Vercel's own Postgres integration works too |
| `JWT_SECRET` | **Yes, hard requirement** | The app refuses to start without it (no insecure fallback). Generate one with `openssl rand -hex 32` |
| `COMPANY_NAME` | No | Defaults to `Casual` |
| `PIN_<DEPT>` | No | Override a department's PIN — re-synced on every boot, so it can be rotated later too |
| `ANTHROPIC_API_KEY` | No | Enables Ask Atlas. Without it, `/api/ask` returns `503 ai_not_configured` and the UI degrades gracefully |
| `ASK_DAILY_LIMIT` | No | Ask Atlas questions allowed per factory-local day, system-wide. Defaults to `100` |

## Customizing for another factory

- **Company name**: `config` table, seeded from `COMPANY_NAME` env var,
  served at `/api/config` and shown in the header.
- **Departments, icons, specialties, machines**: `server/src/constants.js`
  and the matching `client/src/lib/constants.js`.
- **Colors**: `client/tailwind.config.js` (`navy`, `turquoise`, `status`).

## Notes

- To start over locally, drop and recreate the tables (`DROP SCHEMA public
  CASCADE; CREATE SCHEMA public;` against your Postgres instance) and
  restart the server — it re-seeds automatically.
- **`JWT_SECRET` is mandatory** — the app throws at startup if it's unset
  or left as one of the known placeholder values, rather than silently
  signing tokens with a secret anyone could read in this public repo (see
  `.env.example`). Tokens also embed a fingerprint of the department's
  current PIN hash, so rotating a PIN immediately invalidates any token
  issued under the old one, instead of leaving it valid until it expires.
