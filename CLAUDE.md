# Atlas — instructions for Claude

1. **Before any task**, read `docs/ATLAS_CONTEXT.md` (project context, infrastructure, decisions, backlog).
2. **Apply the working rules in section 3** of that file — in particular: branch + Pull Request, never merge until Mohamed says "merge", only approved additive database changes, `npm test` / `npm run build` / `npm run lint` must pass, and manual preview/phone tests are done by Mohamed.
3. **At the end of every PR**, update sections **4** (key decisions), **6** (change log) and **7** (known issues / backlog) of `docs/ATLAS_CONTEXT.md`, and the "Last update" line.

Never write secrets (PINs, tokens, keys, passwords) in this repository.
