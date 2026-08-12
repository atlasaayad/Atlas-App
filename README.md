# ATLAS — Production Tracking Platform

Real-time production tracking for a garment/textile factory floor. A public
home dashboard shows live status per Module/Chaîne (no login), and each
department (Agent Méthode, Agent Production, RH, Quality, Finale, Dépôt,
Logistics, La Coupe, Magasin, Mécanicien, Échantillon, Patron) enters its own
data behind a 4-digit PIN.

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
- **RH** enters daily headcount present for the 11 specialties (301, 502,
  504, 516, Main, Sp, M/sp, Finition, Control, Stg, Fer); required headcount
  comes from Agent Méthode.
- **Quality, Finale, Dépôt** each own one metric (quality % + reprises,
  en-cours finale, pièces sur dépôt).
- **Logistics** appends rows to the export program (description, quantité,
  date) — client/mod come from the model.
- **La Coupe, Magasin, Mécanicien, Échantillon** each report a single daily
  "État du poste %" + optional note; these drive the three-color (green /
  yellow / red) status grid on the home dashboard.
- **Patron** (built last, per the brief) enters cost/price inputs per model
  and gets computed cost total, revenue and profit % — kept separate from
  the public dashboard.

All writes are journaled to `audit_log` (who / what / when) via the
department's PIN-derived identity. The public home dashboard polls
`/api/chains/:n/dashboard` every ~12s for near-real-time updates across
devices.

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
| `JWT_SECRET` | Yes | Set to a real random secret before real use — defaults to a dev value otherwise |
| `COMPANY_NAME` | No | Defaults to `ATLAS` |
| `PIN_<DEPT>` | No | Override a department's PIN — re-synced on every boot, so it can be rotated later too |

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
- `JWT_SECRET` should be set to a real secret before any non-local
  deployment (see `.env.example`).
