import { Router } from 'express'
import { nanoid } from 'nanoid'
import { get, run, logAudit } from '../db/index.js'
import { requireDept } from '../auth.js'
import { SPECIALTIES } from '../constants.js'
import { todayInFactoryTZ } from '../calc.js'

export const rhRouter = Router()
rhRouter.use(requireDept('rh'))

// Bulk update: { attendance: { "301": 2, "Main": 4, ... } }
rhRouter.put('/models/:id/attendance', async (req, res) => {
  const { id } = req.params
  const attendance = req.body?.attendance || {}
  const now = new Date().toISOString()
  const model = await get('SELECT chain_number FROM models WHERE id = $1', [id])
  const today = todayInFactoryTZ()

  for (const spec of SPECIALTIES) {
    if (!(spec in attendance)) continue
    const present = Number(attendance[spec]) || 0
    await run(
      `INSERT INTO rh_attendance (model_id, specialty, present, updated_at) VALUES ($1, $2, $3, $4)
       ON CONFLICT (model_id, specialty) DO UPDATE SET present = excluded.present, updated_at = excluded.updated_at`,
      [id, spec, present, now]
    )

    // Permanent daily record for the BSCI/SMETA audit report — never
    // overwritten by a different day, only corrected in place if this same
    // specialty is re-submitted later today.
    if (model) {
      await run(
        `INSERT INTO rh_attendance_history (id, model_id, chain_number, specialty, date, present, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $7)
         ON CONFLICT (chain_number, specialty, date)
           DO UPDATE SET present = excluded.present, model_id = excluded.model_id, updated_at = excluded.updated_at`,
        [`rah_${nanoid(10)}`, id, model.chain_number, spec, today, present, now]
      )
    }
  }

  await logAudit({ deptKey: 'rh', modelId: id, action: 'update_attendance', details: attendance })
  res.json({ ok: true })
})
