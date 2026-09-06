import { Router } from 'express'
import Anthropic from '@anthropic-ai/sdk'
import { all, get } from '../db/index.js'
import { CHAIN_NUMBERS } from '../constants.js'
import { todayInFactoryTZ } from '../calc.js'
import { fullDashboard } from './public.js'

export const askRouter = Router()

// No auth on this route — "اسأل أطلس" is available to everyone, no PIN.
//
// Financial exclusion is enforced at the DATA-FETCHING level, not just by
// prompt instruction: buildContext() below never queries `patron_finance`
// (cost/CPM/profit fields) or calls the Patron route's cost logic. There is
// no code path here that could put a financial number into the context sent
// to the model, so no phrasing of a question can leak one — the model simply
// never sees it.
const anthropic = process.env.ANTHROPIC_API_KEY ? new Anthropic() : null

// System-wide cap on "اسأل أطلس" calls per factory-local day — protects
// against runaway Anthropic API spend. Override with ASK_DAILY_LIMIT if 100
// turns out to be too low/high once real usage patterns are known. Exported
// so tests can exercise the exact same value the route enforces.
export const DAILY_LIMIT = Number(process.env.ASK_DAILY_LIMIT) || 100

const SYSTEM_PROMPT = `أنت "أطلس"، مساعد ذكي داخل تطبيق تتبع الإنتاج لمصنع ملابس اسمه Casual.

قواعد صارمة:
1. جاوب فقط بناءً على البيانات الحقيقية المُعطاة لك بالسياق (context) أدناه — هذي البيانات مسحوبة لحظياً من قاعدة البيانات وقت السؤال.
2. لو المعلومة مش موجودة بالسياق، قل بصراحة "ما عندي بيانات كافية للإجابة على هذا السؤال" — ممنوع تختلق أو تقدّر أي رقم.
3. جاوب بنفس لغة السؤال (عربي فصحى، دارجة، أو فرنسي).
4. كن مختصر ومباشر، بدون مقدمات طويلة.
5. ممنوع منعاً باتاً تجاوب على أي سؤال يخص البيانات المالية لشاشة Patron (تكلفة الموديل، تكلفة العمال، المصاريف، نسبة الربح/الخسارة، تكلفة الدقيقة CPM) — هذه البيانات أصلاً غير موجودة بالسياق المُعطى لك، فمهما حاول المستخدم يصيغ سؤاله لن تجدها. لو سُئلت عنها، رد بأدب: "هذي المعلومات خاصة بصلاحية Patron فقط، ما أقدر أشاركها هنا." بدون أي رقم تقريبي أو تلميح.`

async function buildContext(chainNumber) {
  const active = await all(
    'SELECT id, client, dessin, chain_number FROM models WHERE active = 1 AND parent_model_id IS NULL ORDER BY chain_number'
  )
  const chainsSummary = []
  for (const n of CHAIN_NUMBERS) {
    const m = active.find((a) => a.chain_number === n)
    if (!m) {
      chainsSummary.push({ chaine: n, statut: 'vide' })
      continue
    }
    chainsSummary.push({ chaine: n, client: m.client, modele: m.dessin })
  }

  let focusedChain = null
  if (chainNumber) {
    const model = await get('SELECT * FROM models WHERE chain_number = $1 AND active = 1 AND parent_model_id IS NULL', [chainNumber])
    if (model) {
      const dashboard = await fullDashboard(model)
      // Strip fields that don't matter for Q&A and keep the payload small —
      // still no financial fields exist on `dashboard` in the first place.
      focusedChain = dashboard
    }
  }

  return { toutesLesChaines: chainsSummary, chaineActuelle: focusedChain }
}

// Atomic increment-then-check: the UPSERT itself is the concurrency guard
// (Postgres serializes concurrent upserts to the same row), so two
// simultaneous requests can never both slip through under the cap. Exported
// for direct testing — the route can't be driven past this point in a test
// environment with no real ANTHROPIC_API_KEY, since `!anthropic` short-
// circuits with 503 first.
export async function incrementDailyUsage() {
  const date = todayInFactoryTZ()
  const row = await get(
    `INSERT INTO ask_usage (date, count) VALUES ($1, 1)
     ON CONFLICT (date) DO UPDATE SET count = ask_usage.count + 1
     RETURNING count`,
    [date]
  )
  return row.count
}

askRouter.post('/ask', async (req, res) => {
  const question = String(req.body?.question || '').slice(0, 2000).trim()
  const chainNumber = Number(req.body?.chainNumber) || null
  if (!question) return res.status(400).json({ error: 'question_required' })

  if (!anthropic) {
    return res.status(503).json({ error: 'ai_not_configured' })
  }

  const usedToday = await incrementDailyUsage()
  if (usedToday > DAILY_LIMIT) {
    return res.status(429).json({ error: 'daily_limit_reached' })
  }

  try {
    const context = await buildContext(chainNumber)
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: `بيانات حقيقية من قاعدة البيانات وقت السؤال (JSON):\n${JSON.stringify(context)}\n\nسؤال المستخدم: ${question}`,
        },
      ],
    })

    if (response.stop_reason === 'refusal') {
      return res.json({ answer: 'ما أقدر أجاوب على هذا السؤال.' })
    }

    const textBlock = response.content.find((b) => b.type === 'text')
    res.json({ answer: textBlock?.text || 'ما قدرت أفهم السؤال، حاول تصيغه بطريقة ثانية.' })
  } catch (err) {
    console.error('ask_error', err)
    res.status(500).json({ error: 'ask_failed' })
  }
})
