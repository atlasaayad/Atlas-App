import { useState } from 'react'
import { api } from '../lib/api'

// 📩 الإبلاغ عن مشكلة — available on every logged-in department's screen
// (rendered from DeptGate.jsx's BackBar), so whoever hits a real problem
// can report it from wherever they are. Reviewing what's been reported
// stays Méthode/Patron-only, inside ⚙️ Réglages (SettingsScreen.jsx).
export default function FeedbackButton({ token }) {
  const [open, setOpen] = useState(false)
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)
  const [sent, setSent] = useState(false)

  async function submit(e) {
    e.preventDefault()
    if (!message.trim()) return
    setSaving(true)
    try {
      await api.feedback.submit(token, message.trim())
      setSent(true)
      setMessage('')
      setTimeout(() => {
        setSent(false)
        setOpen(false)
      }, 1200)
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <button onClick={() => setOpen(true)} className="text-xs text-slate-500 hover:text-turquoise" title="الإبلاغ عن مشكلة">
        📩
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-950/80 p-4" onClick={() => !saving && setOpen(false)}>
          <div
            className="w-full max-w-sm rounded-md border border-turquoise/30 bg-navy-800 p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-2 font-display text-sm font-semibold text-slate-100">📩 الإبلاغ عن مشكلة</div>
            <p className="mb-3 text-xs text-slate-400">اكتب ملاحظتك أو المشكل اللي واجهتك — كيوصل لمسؤول المناهج/الباطرون.</p>
            <form onSubmit={submit}>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={4}
                autoFocus
                placeholder="اكتب هنا…"
                className="w-full rounded-md border border-slate-700 bg-navy-900 px-3 py-2 text-sm text-slate-200 focus:border-turquoise focus:outline-none"
              />
              <div className="mt-3 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  disabled={saving}
                  className="rounded-md border border-slate-700 px-4 py-2 text-sm text-slate-400 disabled:opacity-50"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={saving || !message.trim()}
                  className="rounded-md border border-turquoise bg-turquoise/10 px-4 py-2 text-sm font-medium text-turquoise disabled:opacity-50"
                >
                  {saving ? '...' : sent ? 'تم الإرسال ✓' : 'إرسال'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
