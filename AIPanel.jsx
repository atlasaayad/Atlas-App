import { X, Sparkles, Send, FileSearch, Route, Timer, Scale } from 'lucide-react'
import { useState } from 'react'

// This panel is intentionally decoupled from any model provider.
// Wire `handleSend` (and the quick actions below) to your inference
// endpoint — Claude via the Anthropic API, or an internal service that
// has access to dossiers, gammes and live module data. The four quick
// actions map to the Copilot's planned core capabilities:
//   1. Technical dossier analysis  (fabric, trims, construction notes)
//   2. Operation sequence suggestion for a new gamme
//   3. SMV estimation from a dossier or similar past styles
//   4. Line balancing recommendations from live module throughput
const quickActions = [
  { icon: FileSearch, label: 'Analyze a technical dossier', prompt: 'Analyze technical dossier TD-0244 and flag any missing construction details.' },
  { icon: Route, label: 'Suggest an operation sequence', prompt: 'Suggest an operation sequence for the Cargo Trouser — Regular based on similar gammes.' },
  { icon: Timer, label: 'Estimate SMV', prompt: 'Estimate the SMV for this style from its dossier and comparable products.' },
  { icon: Scale, label: 'Recommend line balancing', prompt: "Module C is bottlenecked — recommend a line balancing fix using today's module data." },
]

export default function AIPanel({ open, onClose }) {
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      text: "Hi, I'm the Atlas-App copilot. Once connected, I'll read technical dossiers, suggest operation sequences for new gammes, estimate SMV, and recommend line balancing from live module data. Ask me anything, or start from a quick action below.",
    },
  ])
  const [draft, setDraft] = useState('')

  const dispatch = (text) => {
    if (!text.trim()) return
    setMessages((m) => [
      ...m,
      { role: 'user', text },
      { role: 'assistant', text: 'AI responses are not connected yet — this is a UI placeholder ready for integration with a model and your production data.' },
    ])
    setDraft('')
  }

  return (
    <>
      {open && <div className="fixed inset-0 z-40 bg-ink/30" onClick={onClose} aria-hidden="true" />}
      <aside
        className={`fixed z-50 inset-y-0 right-0 w-full max-w-sm border-l border-line bg-surface transition-transform duration-200 flex flex-col ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="flex items-center gap-2.5 border-b border-line px-4 h-16 shrink-0">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-white">
            <Sparkles size={16} />
          </div>
          <div>
            <p className="font-display font-semibold text-sm leading-tight">AI Copilot</p>
            <p className="text-[11px] text-ink-faint leading-tight">Preview · not yet connected</p>
          </div>
          <button onClick={onClose} className="ml-auto rounded-lg p-2 text-ink-soft hover:bg-paper" aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
          {messages.map((m, i) => (
            <div
              key={i}
              className={`max-w-[85%] rounded-xl px-3.5 py-2.5 text-sm leading-relaxed ${
                m.role === 'assistant'
                  ? 'bg-paper text-ink'
                  : 'ml-auto bg-indigo-600 text-white'
              }`}
            >
              {m.text}
            </div>
          ))}
        </div>

        {messages.length === 1 && (
          <div className="px-4 pb-3 shrink-0 grid grid-cols-1 gap-2">
            {quickActions.map((qa) => (
              <button
                key={qa.label}
                onClick={() => dispatch(qa.prompt)}
                className="flex items-center gap-2.5 rounded-lg border border-line bg-paper px-3 py-2.5 text-left text-xs font-medium text-ink-soft hover:border-indigo-300 hover:bg-indigo-50/60 hover:text-indigo-700 transition-colors"
              >
                <qa.icon size={15} className="shrink-0" />
                {qa.label}
              </button>
            ))}
          </div>
        )}

        <div className="border-t border-line p-3 shrink-0">
          <div className="flex items-center gap-2 rounded-lg border border-line bg-paper px-3 py-2">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && dispatch(draft)}
              placeholder="Ask about dossiers, gammes, SMV, balancing…"
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-ink-faint"
            />
            <button onClick={() => dispatch(draft)} className="text-indigo-600 hover:text-indigo-700" aria-label="Send">
              <Send size={17} />
            </button>
          </div>
        </div>
      </aside>
    </>
  )
}
