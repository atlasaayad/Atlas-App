import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { errorMessage } from '../lib/errors'
import ErrorNote from './ErrorNote'

const ADD = '__add__'

// Méthode → Identité: optional garment type. The list comes from the server
// (defaults + types added here). "+ Ajouter un autre type" opens a text
// input in place; the new type is saved right away and selected, and it is
// in the list next time. A near-duplicate ("veste ", "Vesté") is refused by
// the server, which names the existing type — that one is selected instead.
export default function GarmentTypeField({ token, value, onChange, readOnly }) {
  const [types, setTypes] = useState(null)
  const [loadError, setLoadError] = useState(null)
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')
  const [saving, setSaving] = useState(false)
  const [addError, setAddError] = useState(null)

  useEffect(() => {
    if (readOnly) return
    let cancelled = false
    api.methode
      .getGarmentTypes(token)
      .then((list) => !cancelled && setTypes(list))
      .catch((err) => !cancelled && setLoadError(errorMessage(err)))
    return () => {
      cancelled = true
    }
  }, [token, readOnly])

  if (readOnly) {
    return (
      <div>
        <span className="mb-1 block text-xs uppercase tracking-wide text-slate-500">Type</span>
        <div className="rounded-md border border-slate-800 px-3 py-3 text-sm text-slate-400">{value || '—'}</div>
        <span className="mt-1 block text-xs text-slate-500">نفس النوع ديال الموديل الأصلي</span>
      </div>
    )
  }

  // A saved type that is no longer in the list still shows as selected.
  const options = types ? (value && !types.includes(value) ? [...types, value] : types) : value ? [value] : []

  async function add() {
    const name = newName.trim()
    if (!name) return
    setSaving(true)
    setAddError(null)
    try {
      const res = await api.methode.addGarmentType(token, name)
      setTypes(res.types)
      onChange(res.name)
      setAdding(false)
      setNewName('')
    } catch (err) {
      if (err?.data?.existing) {
        onChange(err.data.existing)
        setAdding(false)
        setNewName('')
      }
      setAddError(errorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <label className="block">
        <span className="mb-1 block text-xs uppercase tracking-wide text-slate-500">Type</span>
        <select
          value={adding ? ADD : value || ''}
          onChange={(e) => {
            setAddError(null)
            if (e.target.value === ADD) {
              setAdding(true)
              return
            }
            setAdding(false)
            onChange(e.target.value)
          }}
          className="w-full rounded-md border border-slate-700 bg-navy-900 px-3 py-3 text-sm text-slate-200 focus:border-turquoise focus:outline-none"
        >
          <option value="">— Sans type —</option>
          {options.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
          {types && <option value={ADD}>+ Ajouter un autre type</option>}
        </select>
      </label>
      {adding && (
        <div className="mt-2 flex gap-2">
          <input
            type="text"
            autoFocus
            value={newName}
            maxLength={40}
            placeholder="Nouveau type"
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                add()
              }
            }}
            className="min-w-0 flex-1 rounded-md border border-slate-700 bg-navy-900 px-3 py-3 text-sm text-slate-200 focus:border-turquoise focus:outline-none"
          />
          <button
            type="button"
            onClick={add}
            disabled={saving || !newName.trim()}
            className="h-12 shrink-0 rounded-md border border-turquoise/50 px-4 text-sm font-medium text-turquoise active:bg-turquoise/10 disabled:opacity-50"
          >
            {saving ? '…' : 'Ajouter'}
          </button>
          <button
            type="button"
            onClick={() => {
              setAdding(false)
              setNewName('')
              setAddError(null)
            }}
            className="h-12 w-12 shrink-0 rounded-md border border-slate-700 text-slate-400"
            aria-label="Annuler"
          >
            ✕
          </button>
        </div>
      )}
      <ErrorNote message={addError || loadError} className="mt-1" />
    </div>
  )
}
