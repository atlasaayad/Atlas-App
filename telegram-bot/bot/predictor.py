import asyncio
import logging
from datetime import datetime, timedelta, timezone

from telegram import Bot
from telegram.constants import ParseMode

from . import storage
from .ai_analyst import AIAnalyst
from .config import Config
from .football_api import FootballDataClient

logger = logging.getLogger(__name__)

# البطولات المطلوبة بالأولوية، برموزها في football-data.org
COMPETITIONS = {
    "PL": "الدوري الإنجليزي الممتاز",
    "CL": "دوري أبطال أوروبا",
    "PD": "الدوري الإسباني",
}

VERDICT_EMOJI = {"correct": "✅", "partial": "⚡", "wrong": "❌"}
VERDICT_LABEL = {
    "correct": "توقع صحيح — أصبنا النتيجة بالضبط",
    "partial": "توقع جزئي — الفائز صحيح لكن النتيجة الدقيقة مختلفة",
    "wrong": "توقع خاطئ",
}


def _to_local(utc_date: str, tz) -> str:
    dt = datetime.fromisoformat(utc_date.replace("Z", "+00:00")).astimezone(tz)
    return dt.strftime("%Y-%m-%d %H:%M")


def _outcome(home_goals: int, away_goals: int) -> str:
    if home_goals > away_goals:
        return "home"
    if away_goals > home_goals:
        return "away"
    return "draw"


class PredictionJobs:
    def __init__(self, bot: Bot, config: Config) -> None:
        self.bot = bot
        self.config = config
        self.football = FootballDataClient(config.football_data_key)
        self.ai = AIAnalyst(config.anthropic_api_key, config.analysis_model)

    async def check_upcoming_matches(self) -> None:
        now = datetime.now(timezone.utc)
        for code, name_ar in COMPETITIONS.items():
            try:
                matches = await asyncio.to_thread(self.football.get_upcoming, code)
            except Exception:
                logger.exception("فشل جلب مباريات %s القادمة", code)
                continue

            for match in matches:
                await self._maybe_announce(match, code, name_ar, now)

    async def _maybe_announce(self, match: dict, code: str, name_ar: str, now: datetime) -> None:
        match_id = match["id"]
        kickoff = datetime.fromisoformat(match["utcDate"].replace("Z", "+00:00"))
        minutes_to_kickoff = (kickoff - now).total_seconds() / 60
        if not (
            self.config.pre_match_window_start_min
            <= minutes_to_kickoff
            <= self.config.pre_match_window_end_min
        ):
            return

        existing = await asyncio.to_thread(storage.get_prediction, self.config.db_path, match_id)
        if existing is not None:
            return

        home = match["homeTeam"]["name"]
        away = match["awayTeam"]["name"]
        kickoff_local = _to_local(match["utcDate"], self.config.tz)

        try:
            prediction = await asyncio.to_thread(
                self.ai.analyze_match, name_ar, home, away, kickoff_local
            )
        except Exception:
            logger.exception("فشل تحليل مباراة %s ضد %s", home, away)
            return

        await asyncio.to_thread(
            storage.save_prediction,
            self.config.db_path,
            match_id,
            code,
            name_ar,
            home,
            away,
            match["utcDate"],
            prediction,
        )
        await self._send_prediction_message(name_ar, home, away, kickoff_local, prediction)

    async def check_finished_matches(self) -> None:
        for code, name_ar in COMPETITIONS.items():
            try:
                matches = await asyncio.to_thread(self.football.get_recently_finished, code)
            except Exception:
                logger.exception("فشل جلب نتائج %s", code)
                continue

            for match in matches:
                await self._maybe_verdict(match)

    async def _maybe_verdict(self, match: dict) -> None:
        match_id = match["id"]
        row = await asyncio.to_thread(storage.get_prediction, self.config.db_path, match_id)
        if row is None or row["verdicted_at"] is not None:
            return

        full_time = match.get("score", {}).get("fullTime", {})
        actual_home, actual_away = full_time.get("home"), full_time.get("away")
        if actual_home is None or actual_away is None:
            return

        if (
            row["predicted_home_goals"] == actual_home
            and row["predicted_away_goals"] == actual_away
        ):
            verdict = "correct"
        elif _outcome(row["predicted_home_goals"], row["predicted_away_goals"]) == _outcome(
            actual_home, actual_away
        ):
            verdict = "partial"
        else:
            verdict = "wrong"

        await asyncio.to_thread(
            storage.mark_verdict, self.config.db_path, match_id, actual_home, actual_away, verdict
        )
        await self._send_verdict_message(row, actual_home, actual_away, verdict)

    async def weekly_stats(self) -> None:
        since = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()
        stats = await asyncio.to_thread(storage.get_stats_since, self.config.db_path, since)
        total = sum(stats.values())

        if total == 0:
            text = "📊 *إحصاءات الأسبوع*\n\nلا توجد مباريات مُحكوم عليها هذا الأسبوع."
        else:
            accuracy = round((stats["correct"] + 0.5 * stats["partial"]) / total * 100, 1)
            text = (
                "📊 *إحصاءات الأسبوع*\n\n"
                f"عدد التوقعات المُحكوم عليها: {total}\n"
                f"✅ صحيح: {stats['correct']}\n"
                f"⚡ جزئي: {stats['partial']}\n"
                f"❌ خطأ: {stats['wrong']}\n\n"
                f"🎯 معدل الدقة التقريبي: {accuracy}%"
            )

        await self.bot.send_message(
            chat_id=self.config.chat_id, text=text, parse_mode=ParseMode.MARKDOWN
        )

    async def _send_prediction_message(
        self, competition_name: str, home: str, away: str, kickoff_local: str, prediction: dict
    ) -> None:
        reasons = "\n".join(f"• {r}" for r in prediction["key_reasons"])
        text = (
            "⚽ *تحليل قبل المباراة*\n"
            f"🏆 {competition_name}\n"
            f"🆚 *{home}* × *{away}*\n"
            f"🕒 موعد المباراة: {kickoff_local}\n\n"
            f"📋 *التشكيلة المتوقعة:*\n{prediction['lineup_summary']}\n\n"
            f"🚑 *الغيابات والإصابات:*\n{prediction['injuries_summary']}\n\n"
            f"🔮 *التوقع:* {home} {prediction['predicted_home_goals']} - "
            f"{prediction['predicted_away_goals']} {away}\n"
            f"📊 *نسبة الثقة:* {prediction['confidence_percent']}%\n\n"
            f"*أسباب التوقع:*\n{reasons}"
        )
        await self.bot.send_message(
            chat_id=self.config.chat_id, text=text, parse_mode=ParseMode.MARKDOWN
        )

    async def _send_verdict_message(
        self, row, actual_home: int, actual_away: int, verdict: str
    ) -> None:
        text = (
            f"{VERDICT_EMOJI[verdict]} *نتيجة المباراة*\n"
            f"🏆 {row['competition_name']}\n"
            f"🆚 *{row['home_team']}* {actual_home} - {actual_away} *{row['away_team']}*\n\n"
            f"توقعنا: {row['home_team']} {row['predicted_home_goals']} - "
            f"{row['predicted_away_goals']} {row['away_team']} (ثقة {row['confidence']}%)\n\n"
            f"الحكم: {VERDICT_LABEL[verdict]}"
        )
        await self.bot.send_message(
            chat_id=self.config.chat_id, text=text, parse_mode=ParseMode.MARKDOWN
        )
