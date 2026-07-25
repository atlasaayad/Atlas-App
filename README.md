# Atlas-App

Production management dashboard for garment factories — built with **React 18**, **Vite**, **Tailwind CSS**, **React Router**, **Recharts** and **lucide-react**.

Atlas-App is built around real garment-factory workflows, not generic admin-panel widgets: a style doesn't exist without a **technical dossier** (client, PO, season, fabric, trims), a dossier drives a **gamme** (operation-by-operation routing with machine, operator, SMV and reference media), a gamme runs on a **module** (workforce, hourly target/actual, downtime, absences), and the **Dashboard** is the control room that surfaces what's behind plan right now.

## Sections

| Route         | Purpose                                                                          |
|---------------|-----------------------------------------------------------------------------------|
| `/`           | **Control room** — live KPIs, alerts, delayed modules, exports due today, output trend, module efficiency |
| `/products`   | Product catalog, each linked to its technical dossier and gamme                  |
| `/dossiers`   | **Technical Dossiers** — client, PO, season, fabric, trims, and PDF/photo/video references |
| `/gammes`     | Operation routings: operation number, machine, operator, SMV, reference photo/video per step |
| `/modules`    | Workforce present/absent, hourly target vs. actual, efficiency, downtime         |
| `/planning`   | Order scheduling across lines, with progress                                     |
| `/production` | Live target vs. actual output per line                                           |
| `/quality`    | AQL batch inspections and defect breakdown                                       |
| `/reports`    | Scheduled/on-demand reports                                                      |
| `/settings`   | Factory profile, team access, integrations                                       |

## Getting started

```bash
npm install
npm run dev
```

Build for production:

```bash
npm run build
npm run preview
```

## Project structure

```
src/
  components/   Reusable UI: Sidebar, Topbar, AIPanel, StatCard, PageHeader
  layouts/      AppLayout — the shell every route renders inside
  pages/        One file per section listed above
  data/         Mock data — swap for real API calls / a data layer as the backend lands
```

## Design system

- **Palette** — warehouse white background, graphite ink, denim indigo as the primary accent, amber/green/red for status. Defined as Tailwind tokens in `tailwind.config.js`.
- **Type** — Space Grotesk (display), Inter (body), IBM Plex Mono (codes, references, quantities).
- **Signature motif** — a stitched seam line (`.stitch-line` / `.stitch-line-v` in `src/index.css`), used for active nav states and the gamme operation timeline, nodding to the product this app manages.
- Responsive down to mobile (collapsible sidebar), visible focus rings, and `prefers-reduced-motion` respected.

## Wiring in AI

The Copilot's four target capabilities are already scaffolded as quick actions in `src/components/AIPanel.jsx` — wire `dispatch()` to a real inference endpoint and each one has a concrete data source to work from:

1. **Technical dossier analysis** — read fabric, trims, construction notes from `src/data/mockData.js` → `dossiers` and flag gaps or inconsistencies.
2. **Operation sequence suggestion** — given a dossier, propose a gamme (`gammeOperations` shape: operation, machine, SMV) by pattern-matching against existing gammes for similar garments.
3. **SMV estimation** — estimate standard minute values for a new style from its dossier plus comparable historical gammes.
4. **Line balancing** — use live `modules` data (hourly target/actual, workforce, downtime) to recommend rebalancing when a module bottlenecks, as flagged on the Dashboard.

Also in place:
- The "Ask AI" button in the Topbar opens the panel from anywhere in the app; a contextual prompt on the Technical Dossiers and Gammes pages links straight into it.
- `.env.example` — copy to `.env.local` and set `VITE_API_BASE_URL` / `VITE_AI_PROVIDER` / `VITE_AI_API_KEY` once a backend exists.

## Notes

- All data is currently mocked in `src/data/mockData.js` — replace with real API calls (or a data-fetching library like TanStack Query) as the backend comes online.
- Icons via [lucide-react](https://lucide.dev), charts via [Recharts](https://recharts.org).
