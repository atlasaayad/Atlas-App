import { nanoid } from 'nanoid'
import { all, get, run } from './db/index.js'

// Live, admin-editable specialty lists (⚙️ Réglages, Agent Méthode/Patron
// only — see routes/settings.js) — replaces the old hardcoded SPECIALTIES/
// FINALE_SPECIALTIES constants everywhere they used to be imported
// directly. Always queried live (a handful of rows, cheap) — same "never
// cache what a human might have just edited" philosophy as everything
// else in ATLAS. `groupKey` is 'chain' (the 13 default chain specialties,
// feeding effectif_requis/rh_attendance/rh_attendance_history) or 'finale'
// (feeding finale_attendance).
export async function getSpecialties(groupKey) {
  const rows = await all('SELECT name FROM specialty_defs WHERE group_key = $1 ORDER BY sort_order, name', [groupKey])
  return rows.map((r) => r.name)
}

export async function addSpecialty(groupKey, name) {
  const trimmed = String(name || '').trim()
  if (!trimmed) throw Object.assign(new Error('name_required'), { code: 'name_required' })
  const maxRow = await get('SELECT COALESCE(MAX(sort_order), -1) AS m FROM specialty_defs WHERE group_key = $1', [groupKey])
  const now = new Date().toISOString()
  await run(
    `INSERT INTO specialty_defs (id, group_key, name, sort_order, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $5)
     ON CONFLICT (group_key, name) DO NOTHING`,
    [`spc_${nanoid(10)}`, groupKey, trimmed, Number(maxRow.m) + 1, now]
  )
}

// Historical/current data for this specialty stays exactly as-is under its
// old name — never touched here. Deleting only removes it from
// specialty_defs, so it simply stops appearing on the live entry forms
// (which always render from the CURRENT list); Historique/audit exports
// for past dates still show it correctly under the name it was recorded
// with.
export async function deleteSpecialty(groupKey, name) {
  await run('DELETE FROM specialty_defs WHERE group_key = $1 AND name = $2', [groupKey, name])
}

// Same merge-on-conflict cascade as the old one-time migrateSpecialtyNames()
// in db/index.js, reused here for an admin-triggered rename instead of a
// hardcoded one: sums into the target name's existing rows where a
// (model_id/chain_number+date, specialty) key would otherwise collide,
// rather than leaving two rows or silently dropping one side.
async function cascadeRenameChain(oldName, newName) {
  await run(
    `INSERT INTO effectif_requis (model_id, specialty, required)
     SELECT model_id, $2, required FROM effectif_requis WHERE specialty = $1
     ON CONFLICT (model_id, specialty) DO UPDATE SET required = effectif_requis.required + excluded.required`,
    [oldName, newName]
  )
  await run('DELETE FROM effectif_requis WHERE specialty = $1', [oldName])

  await run(
    `INSERT INTO rh_attendance (model_id, specialty, present, updated_at)
     SELECT model_id, $2, present, updated_at FROM rh_attendance WHERE specialty = $1
     ON CONFLICT (model_id, specialty) DO UPDATE SET
       present = rh_attendance.present + excluded.present,
       updated_at = GREATEST(rh_attendance.updated_at, excluded.updated_at)`,
    [oldName, newName]
  )
  await run('DELETE FROM rh_attendance WHERE specialty = $1', [oldName])

  await run(
    `INSERT INTO rh_attendance_history (id, model_id, chain_number, specialty, date, present, created_at, updated_at)
     SELECT 'rah_ren_' || chain_number || '_' || date || '_' || $2, MAX(model_id), chain_number, $2, date,
            SUM(present), MIN(created_at), MAX(updated_at)
     FROM rh_attendance_history WHERE specialty = $1 GROUP BY chain_number, date
     ON CONFLICT (chain_number, specialty, date) DO UPDATE SET
       present = rh_attendance_history.present + excluded.present,
       model_id = excluded.model_id,
       updated_at = excluded.updated_at`,
    [oldName, newName]
  )
  await run('DELETE FROM rh_attendance_history WHERE specialty = $1', [oldName])
}

async function cascadeRenameFinale(oldName, newName) {
  await run(
    `INSERT INTO finale_attendance (model_id, specialty, present, updated_at)
     SELECT model_id, $2, present, updated_at FROM finale_attendance WHERE specialty = $1
     ON CONFLICT (model_id, specialty) DO UPDATE SET
       present = finale_attendance.present + excluded.present,
       updated_at = GREATEST(finale_attendance.updated_at, excluded.updated_at)`,
    [oldName, newName]
  )
  await run('DELETE FROM finale_attendance WHERE specialty = $1', [oldName])
}

export async function renameSpecialty(groupKey, oldName, newName) {
  const trimmed = String(newName || '').trim()
  if (!trimmed) throw Object.assign(new Error('name_required'), { code: 'name_required' })
  if (trimmed === oldName) return

  const now = new Date().toISOString()
  // Renaming onto an already-existing specialty in this group merges into
  // it (cascade below sums the historical data) instead of leaving two
  // specialty_defs rows with the same name.
  const existing = await get('SELECT id FROM specialty_defs WHERE group_key = $1 AND name = $2', [groupKey, trimmed])
  if (existing) {
    await run('DELETE FROM specialty_defs WHERE group_key = $1 AND name = $2', [groupKey, oldName])
  } else {
    await run('UPDATE specialty_defs SET name = $1, updated_at = $2 WHERE group_key = $3 AND name = $4', [
      trimmed,
      now,
      groupKey,
      oldName,
    ])
  }

  if (groupKey === 'chain') await cascadeRenameChain(oldName, trimmed)
  else if (groupKey === 'finale') await cascadeRenameFinale(oldName, trimmed)
}
