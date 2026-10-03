import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { run, pool } from '../src/db/index.js'
import { databaseEndpoint, recordProductionDatabase, environmentStatus } from '../src/environment.js'

const PROD = 'postgres://owner:s3cret@ep-quiet-sun-a1b2c3-pooler.eu-central-1.aws.neon.tech/neondb?sslmode=require'
const PROD_DIRECT = 'postgres://owner:s3cret@ep-quiet-sun-a1b2c3.eu-central-1.aws.neon.tech/neondb'
const BRANCH = 'postgres://owner:s3cret@ep-misty-moon-z9y8x7-pooler.eu-central-1.aws.neon.tech/neondb'

after(async () => {
  await run("DELETE FROM config WHERE key = 'production_db_fingerprint'")
  await pool.end()
})

test('environnement: point de terminaison de la base (pooler = direct, local, invalide)', () => {
  assert.equal(databaseEndpoint(PROD), 'ep-quiet-sun-a1b2c3')
  assert.equal(databaseEndpoint(PROD_DIRECT), 'ep-quiet-sun-a1b2c3')
  assert.equal(databaseEndpoint('postgres://u:p@localhost:5432/atlas'), 'local')
  assert.equal(databaseEndpoint('not a url'), '')
})

test('environnement: preview sur la base usine → alerte; sur une branche → base de test; jamais l’URL', async () => {
  await run("DELETE FROM config WHERE key = 'production_db_fingerprint'")
  const preview = (url) => environmentStatus({ VERCEL_ENV: 'preview', DATABASE_URL: url })

  // Production never recorded its database yet → cannot be verified.
  assert.equal((await preview(PROD)).database, 'unverified')

  // Only the production deployment records; a preview never does.
  await recordProductionDatabase({ VERCEL_ENV: 'preview', DATABASE_URL: BRANCH })
  assert.equal((await preview(PROD)).database, 'unverified')
  await recordProductionDatabase({ VERCEL_ENV: 'production', DATABASE_URL: PROD })

  assert.equal((await preview(PROD)).database, 'production_db')
  assert.equal((await preview(PROD_DIRECT)).database, 'production_db')
  assert.equal((await preview(BRANCH)).database, 'test')
  assert.equal((await environmentStatus({ VERCEL_ENV: 'production', DATABASE_URL: PROD })).database, 'production')
  assert.equal((await environmentStatus({ DATABASE_URL: 'postgres://u:p@localhost/atlas' })).database, 'test')

  for (const url of [PROD, BRANCH]) {
    const json = JSON.stringify(await preview(url))
    for (const secret of ['s3cret', 'owner', 'neon.tech', 'quiet-sun', 'misty-moon', 'postgres']) {
      assert.ok(!json.includes(secret), `${secret} leaked: ${json}`)
    }
  }
  assert.equal((await preview(BRANCH)).hint, '…z9y8x7')
})
