from datetime import datetime, timedelta, timezone

from telegram import Update
from telegram.ext import ContextTypes

from . import storage

WELCOME_TEXT = (
    "أهلاً! أنا بوت توقعات كرة القدم ⚽\n\n"
    "أرسل تلقائياً لهذه المحادثة:\n"
    "• تحليلاً وتوقعاً قبل كل مباراة بساعتين (تشكيلة، غيابات، نتيجة متوقعة)\n"
    "• النتيجة الحقيقية والحكم على التوقع بعد كل مباراة\n"
    "• إحصاءات دقة أسبوعية كل إثنين صباحاً\n\n"
    "البطولات المتابَعة حالياً: الدوري الإنجليزي، دوري أبطال أوروبا، الدوري الإسباني.\n\n"
    "الأوامر المتاحة:\n"
    "/stats — إحصاءات آخر 7 أيام\n"
    "/help — هذه الرسالة"
)


async def start_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    await update.message.reply_text(WELCOME_TEXT)


async def stats_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    config = context.bot_data["config"]
    since = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()
    stats = storage.get_stats_since(config.db_path, since)
    total = sum(stats.values())

    if total == 0:
        await update.message.reply_text("لا توجد مباريات مُحكوم عليها هذا الأسبوع بعد.")
        return

    accuracy = round((stats["correct"] + 0.5 * stats["partial"]) / total * 100, 1)
    await update.message.reply_text(
        "📊 آخر 7 أيام\n"
        f"إجمالي: {total}\n"
        f"✅ {stats['correct']}   ⚡ {stats['partial']}   ❌ {stats['wrong']}\n"
        f"دقة تقريبية: {accuracy}%"
    )
