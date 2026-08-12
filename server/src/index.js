// Local development entry point only. In production the app is deployed as
// a Vercel serverless function — see /api/index.js at the repo root, which
// imports the same `app` from ./app.js.
import 'dotenv/config'
import { app } from './app.js'
import { runSeed } from './db/seed.js'

await runSeed({ log: true })

const PORT = process.env.PORT || 4000
app.listen(PORT, () => {
  console.log(`ATLAS API listening on port ${PORT}`)
})
