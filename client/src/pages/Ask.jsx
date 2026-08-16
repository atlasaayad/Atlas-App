import { useEffect, useRef, useState } from 'react'
import GlowCard from '../components/GlowCard'
import { api } from '../lib/api'
import { CHAIN_NUMBERS } from '../lib/constants'

const SUGGESTED_QUESTIONS = [
  'قداش وصلنا من الهدف اليومي؟',
  'شحال باقي غياب اليوم؟',
  'شنو حالة الجودة بالسلسلة؟',
  "Combien reste-t-il à produire aujourd'hui ?",
]

export default function Ask() {
  const [chains, setChains] = useState([])
  const [chainNumber, setChainNumber] = useState(null)
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef(null)

  useEffect(() => {
    api.getChains().then((data) => {
      setChains(data)
      const firstActive = data.find((c) => c.model)
      if (firstActive) setChainNumber(firstActive.chainNumber)
    })
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  async function send(question) {
    const q = (question ?? input).trim()
    if (!q || loading) return
    setInput('')
    setMessages((m) => [...m, { role: 'user', text: q }])
    setLoading(true)
    try {
      const res = await api.ask(q, chainNumber)
      setMessages((m) => [...m, { role: 'assistant', text: res.answer }])
    } catch (err) {
      const text =
        err?.data?.error === 'ai_not_configured'
          ? 'ميزة "اسأل أطلس" غير مفعّلة حالياً بهذا السيرفر.'
          : err?.data?.error === 'daily_limit_reached'
            ? 'تم الوصول للحد اليومي، جرب بكرة 🙏'
            : 'صار خطأ، حاول مرة ثانية.'
      setMessages((m) => [...m, { role: 'assistant', text }])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex h-[calc(100vh-9.5rem)] flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <div className="font-display text-lg font-semibold text-slate-100">💬 اسأل أطلس</div>
        <select
          value={chainNumber || ''}
          onChange={(e) => setChainNumber(Number(e.target.value))}
          className="rounded-md border border-turquoise/30 bg-navy-800 px-2 py-1.5 text-xs text-slate-200 focus:border-turquoise focus:outline-none"
        >
          <option value="" disabled>
            Chaîne
          </option>
          {CHAIN_NUMBERS.map((n) => {
            const info = chains.find((c) => c.chainNumber === n)
            return (
              <option key={n} value={n} disabled={!info?.model}>
                Chaîne {n} {info?.model ? `— ${info.model.client}` : '(vide)'}
              </option>
            )
          })}
        </select>
      </div>

      <GlowCard className="flex flex-1 flex-col overflow-hidden">
        <div className="flex-1 space-y-3 overflow-y-auto pr-1">
          {messages.length === 0 && (
            <div className="space-y-3">
              <p className="text-sm text-slate-500">
                اسأل عن أي بيانات إنتاج حقيقية بالتطبيق — الأرقام تُجاب لحظياً من قاعدة البيانات.
              </p>
              <div className="flex flex-wrap gap-2">
                {SUGGESTED_QUESTIONS.map((q) => (
                  <button
                    key={q}
                    onClick={() => send(q)}
                    className="rounded-full border border-turquoise/40 px-3 py-1.5 text-xs text-turquoise active:bg-turquoise/10"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                  m.role === 'user'
                    ? 'bg-turquoise/15 text-slate-100'
                    : 'border border-slate-700/70 bg-navy-900/50 text-slate-200'
                }`}
              >
                {m.text}
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex justify-start">
              <div className="rounded-lg border border-slate-700/70 bg-navy-900/50 px-3 py-2 text-sm text-slate-500">
                يكتب…
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault()
            send()
          }}
          className="mt-3 flex gap-2 border-t border-slate-800 pt-3"
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="اكتب سؤالك…"
            className="h-11 flex-1 rounded-md border border-slate-700 bg-navy-900 px-3 text-sm text-slate-200 focus:border-turquoise focus:outline-none"
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="h-11 shrink-0 rounded-md border border-turquoise/50 px-4 text-sm font-medium text-turquoise active:bg-turquoise/10 disabled:opacity-50"
          >
            إرسال
          </button>
        </form>
      </GlowCard>
    </div>
  )
}
