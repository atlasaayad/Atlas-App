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
- **"Total entré"** is unaffected by the date picker — it's a single figure
  entered by Agent Production; it isn't reset per day, since nothing resets
  it, so in practice it tracks the running total fed into the chain.

### Quality screen — hourly "Pièces retouche" + auto-computed Qualité% (Quality)

The Quality screen no longer has a manual Qualité% slider. It has an hourly
table (`QualityForm.jsx`, `GET/PUT /api/quality/models/:id/hourly`) — same
date-picker/backdated-entry pattern as Agent Production's "Production par
heure" — where Quality enters **"Pièces retouche"**: how many pieces from
that hour need rework. This is a separate field from **"Reprises"** (a
single running figure, unaffected by the date picker, entered via its own
form below the hourly table).

- **Qualité% is never entered manually or stored** — it's always computed
  live: `(qty − pièces retouche) / qty × 100` for whatever period is being
  shown (`computeQualityPct()` in `server/src/calc.js`), where `qty` is
  Agent Production's real recorded output for the same chain/date/slot. A
  zero-production hour/day/model shows "غير محسوب" (null), never a fake 0%
  or 100%.
- **Single source of truth**: `quality_history` (permanent, chain/date/slot
  — same architecture as `production_history`) holds every "Pièces
  retouche" entry ever saved, today's included. Home's "Qualité" card shows
  both the cumulative percentage (since the model's `debut`, pairing with
  the whole-life "Total sortie") and today's percentage (pairing with
  "Prod à maintenant") — each computed from its own SUM query on every
  read, never cached.
- **Backdated entry**: identical date bounds/audit-log flagging as
  production's hourly entry (`isBackdated`, `date_in_future`,
  `date_before_debut`) — see Backdated Production Entry above.

### Rendement — composite efficiency+quality score (Home dashboard)

"Rendement" (`computeRendementProduction()`/`computeScoreRendement()` in
`server/src/calc.js`) is a different metric from "Objectif atteint %":
Objectif compares quantity produced against a target; Rendement measures how
efficiently work time was actually used, combined with quality. Home shows
it at 3 scopes side by side — hourly (last recorded hour), daily (today),
cumulative (since the model's `debut`) — each independently computed on
every dashboard read, never cached.

- **Rendement_Production%** = standard SAM-based line-efficiency formula:
  `(qty produced × SAM) / (workers present × attendance minutes) × 100`.
  SAM is "VT" from Agent Méthode's gamme (in minutes). Attendance minutes
  are fixed per scope: 60 for one hour, `WORK_HOURS_PER_DAY × 60` (540) for
  a full day, and `(days from Début to today, inclusive) × 540` for the
  cumulative scope — the same headcount is assumed for every day, since
  there's no historical daily-headcount record to look up a past day's
  real count.
- **Score_Rendement** = simple 50/50 average of Rendement_Production% and
  Qualité% (see the Quality section above) at the same scope. Null (never a
  misleading average) if either side hasn't been computed yet.
- **"Présence" — who enters headcount**: Agent Méthode is now the primary
  owner of the actual daily headcount per specialty (`PUT
  /api/methode/models/:id/attendance`, a new "Présence" tab on Méthode's
  screen) — previously RH-only. **RH keeps the exact same field** as a
  backup entry point (`PUT /api/rh/models/:id/attendance`); both write the
  identical `rh_attendance` rows, so whichever department saved most
  recently is automatically what Rendement uses — no separate
  "which department wins" logic needed.

### 🏆 Classement des chaînes (Home dashboard, public)

A "🏆 Classement des chaînes" button next to the Chaîne selector on
Home opens a modal (`ClassementModal.jsx`, `GET /api/chains/ranking`) ranking
all 8 chains by today's Score_Rendement — reusing `fullDashboard()` per
chain (run in parallel) so it's always the same live figures as each
chain's own dashboard, never a separately cached leaderboard.

- **Sort order**: chains with a real daily score first (best to worst),
  then chains with an active model but not enough data today to compute one
  (`score: null`), then chains with no active model at all — every one of
  the 8 chains always appears, in that order, never silently dropped.
- Each row shows both the daily score (the sort key) and the cumulative
  one (since the model's `debut`) independently — a chain can have a
  meaningful cumulative Rendement while today alone doesn't have enough
  recorded hours yet, and vice versa; neither hides the other.

### Temps de lancement — launch countdown with team + accountable overrun (Agent Méthode)

A "Temps de lancement" tab on Agent Méthode's screen (`launch_timer` table,
one row per model/launch) lets Méthode set an "Objectif (heures)" for a new
launch, plus documentary team fields (Groupe de lancement, Agent méthode,
Mécanicien, Électriciens, Agent Quality, Chef de chaîne — free text, not new
calculation inputs). Only Agent Méthode can start or stop it.

- **Nothing is stored except two timestamps**: `started_at` and
  `stopped_at`. The running countdown, the red overrun flip, and the final
  elapsed/overrun durations are all derived live from those two plus
  Objectif (`computeLaunchTimerState()` in `server/src/calc.js`, mirrored
  client-side in `client/src/lib/calc.js` for the per-second UI tick) —
  never a separately stored "elapsed time" that could drift from the real
  clock.
- **Objectif is entered as an alarm-clock-style HH:MM picker**
  (`<input type="time">` — a native wheel/clock UI on mobile), not a
  decimal number of hours; `hoursToHHMM()`/`hhmmToHours()` in
  `client/src/lib/calc.js` convert to/from the decimal-hours value the API
  still stores and expects.
- **▶️ Démarrer** starts the countdown. While the elapsed time is still
  under Objectif it shows a normal (turquoise) countdown; once it passes
  Objectif with no stop yet, it flips red and counts *up* from zero
  (`+H:MM:SS` overtime) — still ticking live, seconds included at every
  scale (an earlier version dropped seconds once hours were involved,
  which made a running timer look frozen for up to 59 seconds at a time).
  Clicking Démarrer always saves whatever Objectif/équipe is currently
  typed first, then starts — the server rejects starting on an unsaved or
  zero Objectif, so typing the time and going straight for Démarrer (a
  natural workflow, without a separate "Enregistrer" click first) can
  never silently fail; any genuine failure (e.g. a lost connection) now
  shows a visible error instead of doing nothing.
- **⏹ Arrêter / Première pièce terminée**: if stopped before the overrun
  flip, records "🎯 Objectif atteint" with the actual elapsed time, no
  extra fields. If stopped after the flip, the person responsible (chosen
  from the real names entered above, tagged with their role — e.g. "Ahmed
  (Mécanicien)" — not a bare role label) and a reason (a fixed list:
  parts shortage, machine breakdown, worker shortage, quality issue,
  external stoppage, other — plus an optional free comment) are **required
  by the server**, not just the UI — the stop request is rejected
  (`responsible_and_reason_required` / `invalid_reason_code`) without them,
  so this can never be skipped from a scripted or malformed request either.
- The final result (elapsed time, target-met/exceeded status, and — on an
  overrun — who's responsible and why) is shown permanently on the
  "Identité du modèle" card on Home, visible to everyone, and the
  responsible/reason are also written to the audit log
  (`stop_launch_timer` action) for later BSCI/SMETA-style review.

### Couleur/Variante — multiple colors of the same model (Agent Méthode + Agent Production)

A rare but real scenario: the exact same model (same design, same gamme) is
manufactured in more than one color, each with its own reference number
(e.g. model "8500/795/800" and a second color "8500/795/681" — same piece,
different color/reference) — sometimes both colors are produced in the same
hour on the same chain.

- **Adding a variant** — a new "Couleurs / Variantes" tab on Agent Méthode's
  screen (`POST /methode/models/:id/variants`) asks only for the color's own
  name/reference and its own Qté totale (a portion of the same overall
  order, not on top of it) — **never gamme/effectif again**: a variant is a
  normal `models` row with `parent_model_id` set, but it never gets its own
  `gamme_lines`/`effectif_requis` — VT/DT/ND stay the root's alone, since the
  manufacturing process and the shared line don't change per color. Only a
  root model can have variants (no nesting); creating a brand-new model on a
  chain deactivates the old root **and** all of its variants together — a
  variant never outlives its parent.
- **Hourly entry (Agent Production)** — when a chain's model has active
  variants, its "Production par heure" screen shows one input per color for
  every hour (root labeled "Défaut" + each variant) instead of one combined
  field, so two colors can both log a real, separate qty for the very same
  hour (`targetModelId` in the PUT body — defaults to the root itself, so a
  normal model's request is unchanged). `production_history`'s unique key
  was widened from `(chain_number, date, slot_index)` to include `model_id`
  (an idempotent migration in `db/index.js`) to make this possible — two
  rows can now share an hour, one per color, instead of one overwriting the
  other. Quality's own hourly screen ("Pièces retouche") got the identical
  widening and `targetModelId` support — see "Field-tested bug fixes" below.
- **Home dashboard** — every combined figure (hourly bar chart, Prod à
  maintenant, Objectif atteint%, Rendement, Qualité%, Bilan de la chaîne)
  is the sum across every color sharing the chain, computed by summing
  `production_history` rows per slot instead of assuming one row per hour —
  the calculations themselves are unchanged, only what they sum over. The
  Identité card additionally shows a small list of active colors (name,
  target qty, actual output so far) with a pill selector ("Tous (combiné)"
  + one per color) that swaps the hourly chart and "Bilan de la chaîne"
  circles to show a single color's own numbers alone — never its Rendement/
  Qualité%/Objectif%, which stay chain-wide (shared workforce/gamme, so they
  don't split meaningfully per color).
- **A model with no variants is completely unaffected** — `fullDashboard()`
  always returns a `colors` array (root itself included), just a
  single-element one when there's nothing else, so the client only shows
  anything extra when `colors.length > 1`.

### Fin de série / Démarrage — two models on one chain during a changeover (Agent Méthode + entry screens + Home)

While a chain switches models, it really runs two at once: the old one
finishing (**fin de série**) and the new one starting (**démarrage**). Each
is a fully independent root model — its own `model_id`, gamme, VT/DT,
production, Planning, photo — unrelated to Couleur/Variante (colors of ONE
model via `parent_model_id`).

- **Explicit status** — `models.status` (`active` / `closed`) + `closed_at`.
  A chain holds at most **2** open models (`MAX_OPEN_PER_CHAIN`,
  `server/src/openModels.js`); creating a third returns `409 chain_full` and
  Agent Méthode sees "خاصك تسد واحد من الموديلات قبل". The newest open model
  is the démarrage. One-time migration (`migrateModelStatus()`,
  `db/index.js`): models the old computed rule already treated as finished
  (Entré ≥ Qté totale and En cours = 0) or deactivated are marked `closed`,
  everything else stays `active` — so exactly the same models are open right
  after deploy as before.
- **Closing is never automatic.** When a model's combined Sortie reaches its
  combined Qté totale, Agent Méthode gets "الموديل X وصل للكمية المطلوبة —
  واش نسدوه؟" (`GET /chains/:n/close-prompts`): **تأكيد** closes it, **ماشي
  دابا** hides the prompt until tomorrow (`close_prompt_dismissed_on`). A
  manual **"Clôturer le modèle"** button is always there (target reached or
  not). Close/dismiss are Agent Méthode / Patron only
  (`server/src/routes/lifecycle.js`). A closed model disappears from every
  entry screen and from Home, but nothing is deleted — its production,
  Planning, quality and photo stay in history, exports and reports.
- **Entry screens** — with two open models, Production and Quality (and
  Finale, Dépôt, Logistics, the poste screens) show a model switcher at the
  top (`ModelSwitcher.jsx`, `useChainModel({ selectable })`), defaulting to
  the démarrage; Production/Quality buttons show today's filled hours
  (`3/9h`, `GET /chains/:n/open-models?kind=`). Each model's hours are
  entered on their own — never interleaved. With one model the screens look
  exactly as before. RH stays chain-level (one workforce).
- **Home** — two stacked cards, 🟢 DÉMARRAGE on top and 🟠 FIN DE SÉRIE
  below, each with its own Sortie/dates/photo; tapping one opens its full
  dashboard (Plan vs Réel etc.). Once the old model closes, only the new one
  remains, without a badge.
- **Chain Rendement** — both models share one effectif, so Rendement can't
  be computed per model on the same workers. During a changeover it's
  computed for the chain (`computeChainRendement()`, `routes/public.js`):
  `Σ(qty_model × VT_model) / (effectif × minutes) × 100`, hourly and daily,
  combined with the chain's Qualité% into the usual score — shown on Home
  and used by Classement des chaînes. With one model this is the same
  number as before.

### Planning — Plan vs Réel (Agent Méthode + Home)

A new "📊 Planning" tab on Agent Méthode's screen, next to "Gamme de
montage", lets Agent Méthode enter the model's hourly production PLAN
ahead of real production — day by day, hour by hour — so Home can show,
automatically, how the real output compares to what was planned.

- **`planning_hourly`** (new table, `server/src/planning.js`) — one row per
  `(model_id, date, slot_index)`, same shape as `production_history` but
  entirely its own table: a plan and its real outcome are two separate
  facts about the same hour, never mixed. Scoped to the ROOT model alone,
  same ownership as VT/DT/gamme — during a chain overlap (see above), each
  open model has its own independent plan, never combined; a Couleur/
  Variante variant has no plan of its own either, same as it has no gamme
  of its own. An hour with no row means "not planned" — the client always
  shows it blank ("غير مخطط"), never a fake 0, and clearing a previously
  planned hour actually deletes its row rather than writing a 0.
- **Entering the plan — one continuous table, manually controlled rows** —
  a row per day, a column per hour; Agent Méthode just types straight into
  the grid, each day with its own free-form values (a slow start, a faster
  middle — no fixed-DT-per-hour assumption). Which days appear is now
  explicit and user-controlled (**`planning_days`**, one `(model_id,
  date)` row per shown day — separate from `planning_hourly`, the actual
  entered qty) rather than auto-extending: a "+ إضافة يوم" date-picker adds
  any date at all — out of sequence, skipping a holiday — and every row has
  its own 🗑 delete button (which also clears whatever hourly data was
  entered for that day, never leaving an orphaned row behind). A brand-new
  model still starts with exactly one row, at its own Début, seeded lazily
  on first load; an already-deployed database's existing plans are
  backfilled once into `planning_days` from their `planning_hourly` dates
  (`migratePlanningDaysBackfill()`, `db/index.js`) so nothing entered
  before this shipped becomes invisible. `GET
  /methode/models/:id/planning/all` returns every day's data, the live
  `plannedDates` list, and the current hour-slot labels (see ⏰ ساعات العمل
  below) in one shot so the whole table renders at once; the table itself
  scrolls (day-label column and hour-label row both sticky) rather than
  paging between screens. Each cell auto-saves on blur — one real request
  per hour actually touched (`PUT /methode/models/:id/planning/:date` with
  a single-slot `hourly` array), no page-wide "Enregistrer". A live "Total
  planifié: X / Qté totale" (turns amber past the target) sits above the
  grid the whole time; once the planned cumulative reaches Qté totale, a
  banner names that exact day — purely informational now, since row
  add/delete is manual, so it never blocks adding further days past it.
- **Home — "Planning — Plan vs Réel"** — a new card, shown only when a
  plan actually exists (`planning.hasPlan`; a model nobody ever planned
  looks exactly like it did before this feature). Three levels at once,
  matching Agent Méthode's own spec: a hand-rolled SVG line chart of the
  cumulative Plan vs Réel curve from Début through whichever is later of
  today or the plan's own expected finish date; today's hourly Plan/Réel
  as a small dual-bar chart; and a per-day table with the exact gap in
  BOTH pieces and % (`diffQty`, `diffPct` — no monetary figure anywhere,
  by design). Plan is always rendered in the same violet used for Agent
  Méthode's "🎯 Effectif" tab (a fixed, planned-ahead number); Réel in the
  app's usual turquoise (live, real data) — reusing that existing color
  language rather than inventing a new one.

### 🖼️ Model photo on the identity card (Agent Méthode + Home)

Home's identity card (the top card showing client/dessin/Qté totale/Début/Fin
prévue) can now show a thumbnail of the actual garment/piece next to that
text — entirely optional; a model nobody ever added a photo for renders
exactly like it did before this feature.

- Uploaded from Agent Méthode's Identité tab (`ModelImageUploader`,
  `client/src/pages/dept/MethodeForm.jsx`) — a file input reads the picked
  image client-side (`FileReader.readAsDataURL`) and sends it as a base64
  data URI in a normal JSON `PUT /methode/models/:id/image` request (5MB
  client-side cap, 6MB decoded server-side), rather than a multipart
  upload — simpler given the rest of the API is JSON-only, and small enough
  at these caps that the app's global JSON body limit only needed raising
  to 8mb (`server/src/app.js`), not switched to a different parser.
- **Storage: Vercel Blob** (`server/src/imageUpload.js`, `@vercel/blob`) —
  the decoded image is re-uploaded there (never proxied as-is) as a public
  object; only its URL is stored, on `models.image_url`. Requires
  `BLOB_READ_WRITE_TOKEN` (auto-injected once a Blob store is connected
  under Vercel's Storage tab — see `.env.example`); without it, upload
  returns `503 storage_not_configured` and the Identité tab shows a clear
  message instead of erroring — model creation/editing itself is
  completely unaffected either way, matching the same "optional API key,
  clean degradation" pattern as Ask Atlas/ATLAS PREDICT.
- Replacing or deleting an image best-effort deletes the old Blob object
  too (`deleteModelImage()`), but a failed delete there never blocks
  clearing/replacing the DB reference — the card always reflects
  `models.image_url` correctly either way.

### ⚙️ Réglages — editable specialties, work hours, feedback log, per-device language (Agent Méthode + Patron)

A new "⚙️ الإعدادات" tile on the Départements page, alongside the normal
PIN-gated department tiles but not itself a real department — it reuses
whichever of Agent Méthode's or Patron's own existing PIN the person
already has (`client/src/pages/SettingsGate.jsx`; server-side
`requireDept(['methode', 'patron'])`, `server/src/routes/settings.js`).
Three sections:

- **Specialty management** — the 13 chain specialties (Effectif/Présence)
  and Finale's own 8 are no longer hardcoded in `constants.js`; they now
  live in a new `specialty_defs` table (`server/src/specialties.js`),
  add/renamable/deletable from this screen with no code change and no
  redeploy. Every server route that used to import `SPECIALTIES`/
  `FINALE_SPECIALTIES` directly now calls `getSpecialties('chain'
  |'finale')` live instead (`constants.js`'s arrays are kept only as
  `seedSpecialtyDefs()`'s one-time seed for a brand-new database, read
  exactly once). Adding one needs no backfill — every table that reads a
  specialty list already defaults a missing row to 0. **Deleting one never
  touches `effectif_requis`/`rh_attendance`/`rh_attendance_history`/
  `finale_attendance`** — it only stops appearing on the current list
  those live entry screens render from (each overlay loop explicitly
  guards `if (r.specialty in <the current list>)` so an orphaned row for a
  deleted specialty can never leak back onto a live form); the audit
  report is the one deliberate exception — a BSCI/SMETA compliance report
  must never silently drop real recorded data, so it renders the union of
  the current list and whatever specialties actually have a row in the
  requested date range, even if since deleted. **Renaming** cascades
  across those same tables with the identical merge-on-conflict pattern
  `migrateSpecialtyNames()` already used for the old hardcoded rename —
  reused, not reinvented, just triggered on demand instead of once at
  deploy.
- **⏰ ساعات العمل — one centralized shift layout for the whole system** —
  the 9 hourly slots (`6:30-7:30` … `15:00-16:00`) used to be hardcoded in
  `constants.js` (`HOURLY_SLOTS`/`WORK_HOURS_PER_DAY`); they now live in a
  new `work_hours` table (`server/src/workHours.js`'s `getWorkHours()`),
  editable from this screen with no code change and no redeploy. Every
  screen/route that used to import those constants directly — Planning,
  Agent Production's/Quality's hourly entry, Home's dashboard/charts, the
  audit report — now calls `getWorkHours()` live instead, so a change here
  takes effect everywhere at once. **The catch**: `work_hours`' ascending
  `sort_order` **is** the `slot_index` every hourly table
  (`production_history`/`quality_history`/`planning_hourly`) keys its
  historical data by — deleting or reordering a middle slot would silently
  reinterpret every OTHER slot's already-recorded data under a different
  time range. So editing is deliberately constrained: a new slot always
  **appends** at the end (never inserted in the middle), and only the
  **last** slot may be deleted (attempting any other returns `400
  can_only_delete_last`) — editing an existing slot's own start/end time in
  place is always safe (its position never moves) and unrestricted. Seeded
  once from the old `HOURLY_SLOTS` (`seedWorkHours()` in `db/seed.js`) so
  an already-deployed database's layout doesn't change on the day this
  ships.
- **📩 Reporting a problem** — open to any logged-in department, not just
  Méthode/Patron: a small 📩 button on every department screen's own top
  bar (`FeedbackButton.jsx`, rendered from `DeptGate.jsx`'s `BackBar`, so
  every existing screen gets it with no changes of its own) posts to
  `feedback_reports` (`requireAnyDept()` in `auth.js` — like
  `requireDept()` but accepts a valid token from any department, not an
  allow-list, since this is the one endpoint genuinely meant for whoever's
  logged in right now). Reviewing the log — plain chronological, newest
  first, no status/resolved flag — stays Méthode/Patron-only, inside
  Réglages itself.
- **🌐 Language preference — personal to this device only** — a small
  localStorage-backed toggle (`client/src/lib/languagePreference.js`), never
  sent to the server or shared across devices: each tablet/phone/computer
  keeps its own choice. This ships the storage + the toggle UI only — ATLAS
  has no translation catalog anywhere else in the app (every screen's text
  is still hardcoded exactly as written), so this doesn't yet retranslate
  anything; wiring real translations through every screen is separate,
  larger follow-up work.

### État des effectifs (bottom-nav tab, public)

A fourth bottom-nav tab, between Départements and Ask Atlas — no PIN, same
as Accueil/Ask Atlas — giving one central, always-current headcount view of
the whole factory: every chain, Finale, Dépôt, and Personnel administratif,
summed into one grand total (`GET /api/effectifs/overview`,
`client/src/pages/EffectifsOverview.jsx`). Every section is collapsed by
default (a chain/Finale's 8-13-specialty breakdown is one tap away via
`components/Collapsible.jsx`) but its **subtotal is always visible**,
collapsed or not — same for the grand total at the bottom.

Chains with no active model are additionally grouped into a single "N
سلاسل فارغة" row (still one tap away via the same `Collapsible`) instead of
each rendering its own full-width "لا يوجد نشاط / 0" line — on a factory
running only 1 of its 8 chains, that used to mean 7 identical empty rows
before the first real number (Finale/Dépôt/Personnel admin) appeared.

- **Per chain** (1-8): the 13 chain specialties (see the rename below) with
  today's present count each, from the exact same `rh_attendance` row Agent
  Méthode/RH's own "Présence" screens read/write — never a second copy. An
  empty chain (no active model) still appears, subtotal 0, specialties
  omitted — never silently dropped.
- **Finale**: shown as ONE section here (not repeated per chain) — its own
  8 specialties (`FINALE_SPECIALTIES`, entered per chain by the Finale
  department itself, on a new "Effectif Finale" section of its own screen),
  summed across every chain's Finale entry.
- **Dépôt**: a single total (no specialty breakdown) — a new "Effectif
  Dépôt" field on the Dépôt department's own screen, per chain, summed
  across every chain here.
- **Personnel administratif / Encadrement**: a genuinely new category,
  entirely separate from production workers (office/supervisory staff) —
  and the only one here that is company-wide rather than per-chain. RH is
  the primary entry point, Patron a backup (`PersonnelAdminCard`, shown on
  both screens) — both write to the same `personnel_admin_history` row for
  a given date, so whichever department saves last wins, exactly like the
  existing Méthode/RH "Présence" split. Supports going back and correcting
  a previous day (same date-picker pattern as Quality's hourly entry) and
  shows both "today" and a cumulative total (sum across every day ever
  recorded) — only "today" feeds into the grand total below.
- **Grand total**: chains + Finale + Dépôt + Personnel administratif
  (today), all summed live from the same numbers each section shows —
  never a separately cached figure that could drift.

**Specialty rename (13 chain specialties)** — the old 15-code shorthand
(introduced when effectifs were first built) is renamed to clear French
names, with two changes beyond a plain rename, both carried over by a
one-time idempotent migration in `server/src/db/index.js`
(`migrateSpecialtyNames`) run on every cold start (a no-op once complete,
since it only acts on rows still bearing an old code):

| Old code | New name | Note |
|---|---|---|
| `301`, `502`, `504`, `516` | **Machinistes** | merged — 4 old specialties become 1, values summed |
| `Stg` | **Machiniste stagiaire** | see assumption below |
| — | **Stagiaire fer** | brand new, starts empty |
| `Main` | Traçage | plain rename |
| `Sp` | Machine spéciale | plain rename |
| `M/sp` | Manuel spécial / Traçage spécial | plain rename |
| `Control` | Contrôle chaîne | plain rename |
| `Fer` | Repassage préparation | plain rename |
| `Mach retouche` | Retouche | plain rename |
| `Trns` | Transport | plain rename |
| `Chef`, `Robot`, `Finition` | unchanged | same name, no action |

**Assumption to flag**: the old `Stg` code didn't distinguish a machinist
trainee from a fer (pressing) trainee, so its entire historical value moved
to **Machiniste stagiaire**; **Stagiaire fer** starts at empty/zero rather
than guessing a split. If real historical fer-trainee headcounts need to be
reconstructed for a past period, that needs a manual, one-off correction —
this migration cannot infer it from the old data.

### UX audit fixes — Effectif/Présence, Home selector

Three fixes from a field UX review (a fresh-eyes walkthrough of every
screen), applied to the highest-impact findings:

- **Effectif vs Présence, visually distinguished (Agent Méthode).** Both
  tabs render the exact same 13-specialty stepper grid — the only
  difference used to be a few words of label text, which meant a real risk
  of entering today's headcount (Présence) into the fixed target field
  (Effectif) or vice versa, silently corrupting ND/DT/Rendement for the
  whole chain. Each tab now gets its own color identity end to end: 🎯
  Effectif is violet (`tailwind.config.js` → `target`, "fixed target, does
  not change day to day"), 📅 Présence is sky blue (`daily`, "changes every
  day") — carried through the tab button itself, a colored badge at the top
  of each tab's card, and (Présence only) a soft inline warning — not a
  blocker, since real over-staffing happens — when a specialty's entered
  attendance is both more than double AND at least 3 above its Effectif
  target, the one shape of mistake this exists to catch. RH's own
  attendance screen has the identical look-alike risk but was left
  unchanged — out of scope for this pass.
- **"N سلاسل فارغة" grouping** — see État des effectifs above; same
  underlying finding (a repeated empty state drowning out real numbers),
  applied there too.
- **Chaîne + Module merged into one selector (Home dashboard).** The two
  dropdowns both ever did the same thing — a chain has at most one active
  model, so picking either was only ever picking a chain — just labeled
  differently (one by chain number, one by dessin). Merged into the single
  "Chaîne" selector, whose option label now carries everything either list
  showed alone: chain number, client, and dessin together
  (`Chaîne 1 — Zara Home (DSN-2451)`). No functionality lost — there is no
  scenario where a model can be selected independently of its chain.

### Field-tested bug fixes — chain reassignment, Présence backdating, Quality per-colour

Found by actually entering a real week of factory data end to end (through
the real UI/API, not synthetic seeding) and checking every resulting number
by hand:

- **A chain's live figures no longer leak a previous model's data.**
  Reassigning a chain to a brand-new model — an order finishing and a new
  one starting on the same chain, completely ordinary factory operation —
  used to leave the *old*, now-inactive model's `production_history`/
  `quality_history` rows bleeding into the *new* model's "today" hourly bar,
  Total sortie, Objectif atteint %, Rendement, and 🏆 Classement, because
  every one of those queries filtered by `chain_number`/`date` alone, with
  nothing to say which model actually owns a given row. Visible consequence
  when this was found: "Objectif atteint 802%" and a negative "En cours" on
  a chain that had produced nothing yet that day. Fixed everywhere it
  occurred — `fullDashboard()` (`routes/public.js`), the early-warning
  banner (`routes/earlyWarning.js`), and Agent Production's/Quality's own
  `GET /hourly` screens (`routes/production.js`, `routes/quality.js`) — by
  scoping every one of these chain-wide reads to the model's own colour
  family (itself + its active Couleur/Variante variants) instead of every
  row ever logged against that chain number. `POST /methode/models`'s own
  chain-reassignment behavior (deactivate whatever was active, insert the
  new model) is unchanged and still the intended way to start a new
  model — there just isn't a client UI button for it yet (only reachable
  when a chain has no active model at all, via `CreateModelForm`); the
  fix protects correctness regardless of how a reassignment happens.
  Historical, arbitrary-date-range reports (`📅 Historique`, the BSCI/SMETA
  audit export) are deliberately left chain-scoped, not model-scoped — those
  are meant to span a model change within the picked range, not exclude it.
- **Présence (Agent Méthode/RH) can now be corrected for a past day.**
  `saveAttendance()` (`attendanceShared.js`) previously had no `date`
  parameter at all — every save always landed on the real server "today",
  no matter which day was actually intended, unlike Agent Production's/
  Quality's hourly entry (both already had a working date picker). Both
  Présence tabs now carry the exact same date-picker/backdating-banner
  pattern. A specific date can be targeted: `rh_attendance_history` (the
  permanent record, same architecture as `production_history`) always
  writes to that date, but the LIVE `rh_attendance` snapshot — what
  Rendement/Home/État des effectifs/Classement all read as "today's"
  headcount — is only touched when the target date is actually today, so a
  backdated correction can never silently change what "today" reads as. A
  new `GET /models/:id/attendance?date=` (on both `methode.js` and `rh.js`)
  reads a specific day's 13 specialty values back from
  `rh_attendance_history`, the same "get for date X" shape Production's and
  Quality's own hourly endpoints already use.
- **Quality can log "Pièces retouche" separately per colour.** On a
  Couleur/Variante chain, `quality_history`'s unique key had no `model_id`
  (`(chain_number, date, slot_index)` only), so two colours reporting
  retouche for the same hour didn't just risk one overwriting the other —
  there was no way to represent both values at all. Widened to
  `(chain_number, date, slot_index, model_id)` the same way
  `production_history` already was for Couleur/Variante (see
  `migrateQualityHistoryUniqueKey()`, `db/index.js`). Quality's hourly PUT
  now takes the same `targetModelId` as Agent Production's, and its GET now
  returns the same `byModel` breakdown shape — each colour's own qty,
  pieceRetouche, and Qualité%, alongside the correct chain-wide combined
  figures (previously wrong too: the qty lookup used `Object.fromEntries()`
  over possibly-multiple rows per slot, which silently kept only the last
  one and dropped the rest — a second, compounding bug in the same code
  path, same root cause pattern as the chain-reassignment leak above).

### Bilan de la chaîne — whole-life totals (Home dashboard)

The four "Bilan de la chaîne" circles (Total entré, Total sortie, Le reste,
En cours) describe the chain's cumulative balance for the active model, from
its `debut` through today — not a single day. This is a different scope from
"Objectif atteint %" / "Prod à maintenant" / "Restant" elsewhere on Home,
which stay strictly about *today's* target and are computed separately so
this section never affects them:

- **Total sortie** = `SUM(production_history.qty)` for the chain, bounded to
  `[model.debut, today]` — every hour ever recorded for this model, not just
  today's. Recomputed on every dashboard read, so a correction made through
  the Backdated Production Entry date picker (above) — to today or any
  earlier day — changes this number immediately, with no caching in between.
- **En cours** = Total entré − Total sortie: pieces fed into the chain but
  not yet finished, since Début.
- **Le reste** = `qte_totale − Total sortie` (floored at 0): how much of the
  whole order is still left to produce — distinct from the "Restant" field
  next to "Demandé"/"Produit", which is `demande (today's target) − produit
  (today's output)`.

### Save confirmation & request timeouts

Every write (`client/src/lib/api.js`) is wrapped in a bounded timeout
(`AbortController`, 15s by default; the AI-backed "اسأل أطلس" call gets 45s)
so a dropped or hanging connection — common on a factory floor's WiFi — never
leaves a save spinner running forever with no explanation. It always
resolves, within a bounded time, into either a visible success state or a
distinct "انتهت مهلة الاتصال" (connection timeout) error, never silence.
Agent Production's hourly-slot and Total entré saves show a spinning
indicator while in flight (replacing a plain "…" label) for a clearer
in-progress cue. Server-side, the hourly-slot and totals PUT routes
(`server/src/routes/production.js`) fire their `production_history`/
`production_totals` write and the audit-log write in parallel instead of
sequentially, since neither depends on the other's result.

The same guarantee used to have a gap on the *read* side: the hourly-slots
load in Agent Production and Agent Quality (`ProductionForm.jsx` /
`QualityForm.jsx`) had no `.catch()` on the initial fetch, so a failed or
timed-out request (a slow factory connection, a serverless cold start) left
the "Chargement…" spinner spinning forever with no error and no way to
retry short of leaving the page. Both now catch the failure, stop the
spinner, and show "فشل تحميل بيانات الساعات — تحقق من الاتصال." with an
"إعادة المحاولة" (retry) button that re-fires the same request.

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

### Cache headers — every deploy must actually reach every phone

`vercel.json` sets `Cache-Control: public, max-age=0, must-revalidate` on
every path except `/assets/*` (Vite's content-hashed JS/CSS, which gets a
long `immutable` cache — safe, since a new build always produces new
hashed filenames). Without this, a phone's browser can keep serving an
old cached `index.html` (and therefore the old JS bundle it references)
for a while after a fix is deployed and merged — someone can retest a
just-shipped fix and still see the old broken behavior, which looks
identical to the fix not having worked at all. If a report says a
just-merged fix "still doesn't work," first rule out a stale cached page
(hard refresh / clear site data) before re-diagnosing the code.

### Environment variables (Vercel Project Settings)

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | Yes | Auto-set by the Neon integration; a `POSTGRES_URL` from Vercel's own Postgres integration works too |
| `JWT_SECRET` | **Yes, hard requirement** | The app refuses to start without it (no insecure fallback). Generate one with `openssl rand -hex 32` |
| `COMPANY_NAME` | No | Defaults to `Casual` |
| `PIN_<DEPT>` | No | Override a department's PIN — re-synced on every boot, so it can be rotated later too |
| `ANTHROPIC_API_KEY` | No | Enables Ask Atlas. Without it, `/api/ask` returns `503 ai_not_configured` and the UI degrades gracefully |
| `ASK_DAILY_LIMIT` | No | Ask Atlas questions allowed per factory-local day, system-wide. Defaults to `100` |
| `BLOB_READ_WRITE_TOKEN` | No | Enables the model-photo upload. Auto-set once a Blob store is connected (Vercel Project → Storage). Without it, upload returns `503 storage_not_configured` and the identity card just renders without a photo |

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
