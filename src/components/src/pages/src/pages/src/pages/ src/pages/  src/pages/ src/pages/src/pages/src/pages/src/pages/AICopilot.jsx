import { useState, useRef, useEffect } from 'react'
import { Sparkles, Send, Bot, User, Loader2 } from 'lucide-react'

const initialMessages = [
  {
    id: 1,
    role: 'assistant',
    content: 'مرحباً! أنا مساعد Atlas الذكي. كيف يمكنني مساعدتك في إدارة الإنتاج اليوم؟ يمكنني مساعدتك في:\n• تحليل بيانات الإنتاج\n• تقديم توصيات لتحسين الكفاءة\n• الإجابة عن استفساراتك التقنية\n• توليد تقارير سريعة',
  },
]

const quickQuestions = [
  'ما كفاءة الإنتاج اليوم؟',
  'أعطني نصائح لتحسين الجودة',
  'متى ينتهي طلب ORD-2024-089؟',
  'أنشئ تقريراً عن العيوب',
]

export default function AICopilot() {
  const [messages, setMessages] = useState(initialMessages)
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const scrollRef = useRef(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages])

  const handleSend = async (text = input) => {
    if (!text.trim()) return

    const userMsg = { id: Date.now(), role: 'user', content: text }
    setMessages((prev) => [...prev, userMsg])
    setInput('')
    setLoading(true)

    setTimeout(() => {
      const replies = [
        'بناءً على آخر تحديث، كفاءة الخط الأول تبلغ 92% والخط الثاني 87%. الإنتاج اليومي حتى الآن 1,050 قطعة.',
        'أنصحك بمراجعة إعدادات ماكينة القص في الخط الأول، حيث لوحث ارتفاع طفيف في نسبة العيوب إلى 1.8%.',
        'طلب ORD-2024-089 (قميص رجالي كلاسيك) متوقع الانتهاء منه في 15 أغسطس. التقدم الحالي 65%.',
        'لقد حللت بيانات العيوب لهذا الشهر. النتيجة: معظم العيوب (42%) ناتجة عن خياطة غير منتظمة. أنصح بمراجعة إبر الماكينات.',
        'يمكنني مساعدتك في جدولة طلب جديد. هل تريد أن أقترح خط إنتاج مناسب بناءً على التحميل الحالي؟',
      ]
      const reply = replies[Math.floor(Math.random() * replies.length)]
      setMessages((prev) => [...prev, { id: Date.now() + 1, role: 'assistant', content: reply }])
      setLoading(false)
    }, 1500)
  }

  return (
    <div className="max-w-3xl mx-auto h-[calc(100vh-140px)] flex flex-col">
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm flex flex-col h-full overflow-hidden">
        <div className="p-4 border-b border-gray-100 flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl flex items-center justify-center text-white">
            <Sparkles size={20} />
          </div>
          <div>
            <h3 className="font-semibold text-gray-800">مساعد Atlas الذكي</h3>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 bg-green-500 rounded-full" />
              <span className="text-xs text-gray-400">متصل و جاهز للمساعدة</span>
            </div>
          </div>
        </div>

        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}
            >
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                  msg.role === 'user'
                    ? 'bg-blue-100 text-blue-700'
                    : 'bg-gradient-to-br from-blue-500 to-purple-600 text-white'
                }`}
              >
                {msg.role === 'user' ? <User size={16} /> : <Bot size={16} />}
              </div>
              <div
                className={`max-w-[80%] p-3 rounded-2xl text-sm leading-relaxed ${
                  msg.role === 'user'
                    ? 'bg-blue-600 text-white rounded-tr-none'
                    : 'bg-gray-50 text-gray-700 rounded-tl-none'
                }`}
              >
                {msg.content.split('\n').map((line, i) => (
                  <p key={i} className={i > 0 ? 'mt-1' : ''}>{line}</p>
                ))}
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white">
                <Bot size={16} />
              </div>
              <div className="bg-gray-50 p-3 rounded-2xl rounded-tl-none">
                <Loader2 size={18} className="animate-spin text-gray-400" />
              </div>
            </div>
          )}
        </div>

        <div className="px-4 py-2 border-t border-gray-100 flex gap-2 overflow-x-auto">
          {quickQuestions.map((q, idx) => (
            <button
              key={idx}
              onClick={() => handleSend(q)}
              className="shrink-0 px-3 py-1.5 bg-gray-50 hover:bg-blue-50 text-gray-600 hover:text-blue-600 rounded-full text-xs transition-colors border border-gray-200"
            >
              {q}
            </button>
          ))}
        </div>

        <div className="p-4 border-t border-gray-100">
          <div className="flex gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              placeholder="اكتب رسالتك هنا..."
              className="flex-1 px-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-blue-500"
            />
            <button
              onClick={() => handleSend()}
              disabled={loading || !input.trim()}
              className="px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <Send size={18} />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
