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
server/   Express API + SQLite (better-sqlite3). Owns all data, PIN auth, calculations.
client/   Vite + React + Tailwind. Public dashboard + PIN-gated department forms.
```

## Getting started

Two processes, run from two terminals:

```bash
# 1. API (http://localhost:4000)
cd server
npm install
npm run seed   # creates tables, department PINs, and one demo model on Chaîne 1
npm run dev

# 2. Client (http://localhost:5173, proxies /api to the server)
cd client
npm install
npm run dev
```

Open http://localhost:5173 — the home dashboard, Départements grid, and PIN
entry all work against the demo data seeded above.

### Default department PINs (change before going to production)

Printed by `npm run seed`. Override per-department via env vars
(`PIN_METHODE`, `PIN_PRODUCTION`, …) before the first seed on a fresh
database — see `server/.env.example`.

| Department | PIN |
|---|---|
| Agent Méthode | 1001 |
| Agent Production | 1002 |
| Patron | 1003 |
| Mécanicien | 1004 |
| Magasin | 1005 |
| Logistics | 1006 |
| Quality | 1007 |
| RH | 1008 |
| La Coupe | 1009 |
| Dépôt | 1010 |
| Finale | 1011 |
| Échantillon | 1012 |

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

## Deploying (Vercel + Glitch)

The client and server deploy separately since the server is a stateful
Express process (not a good fit for Vercel's serverless functions).

### 1. Backend → Glitch (free, no credit card)

The repo root has a `package.json` whose `install`/`start` scripts delegate
into `server/`, specifically so hosts that expect a root `package.json`
(like Glitch) can run the API without touching `client/`.

1. On https://glitch.com, **New Project → Import from GitHub**, paste this
   repo's URL.
2. Glitch installs (`npm install` → delegates to `server/`) and starts
   (`npm start` → `node src/index.js`) automatically, listening on the
   `PORT` Glitch assigns.
3. The server seeds itself on first boot (departments/PINs/demo model), so
   no manual seed step is needed. Once it's up, the API is reachable at
   `https://<your-project-name>.glitch.me`.

> Free Glitch projects sleep after 5 min with no traffic — the first
> request after that takes a few seconds to wake. Project storage
> (including `server/data/atlas.db`) persists across sleep/restarts, just
> not guaranteed forever on the free tier — treat it as good enough to try
> the app, not as the system of record for real factory data.

An alternative `render.yaml` (Render Blueprint) is also included if you'd
rather use Render later — Render's free tier now requires a card for
verification, which Glitch doesn't.

### 2. Frontend → Vercel

The repo root has a `vercel.json` that builds `client/` and serves
`client/dist` as a SPA, so no project-setting changes are required — just
import the repo. Then, in the Vercel project's **Settings → Environment
Variables**, add:

```
VITE_API_BASE_URL = https://<your-project-name>.glitch.me/api
```

and redeploy (env vars are baked in at build time, so a redeploy is
required after adding/changing this one). The resulting Vercel URL is the
one to open and use.

## Customizing for another factory

- **Company name**: `config` table, seeded from `COMPANY_NAME` env var,
  served at `/api/config` and shown in the header.
- **Departments, icons, specialties, machines**: `server/src/constants.js`
  and the matching `client/src/lib/constants.js`.
- **Colors**: `client/tailwind.config.js` (`navy`, `turquoise`, `status`).

## Notes

- SQLite file lives at `server/data/atlas.db` (gitignored). Delete the
  `server/data/` directory and re-run `npm run seed` to start over.
- `JWT_SECRET` in `server/.env` should be set to a real secret before any
  non-local deployment (see `server/.env.example`).
