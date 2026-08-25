import os
from zoneinfo import ZoneInfo


def _require(name: str) -> str:
    value = os.getenv(name)
    if not value:
        raise RuntimeError(f"متغير البيئة {name} مطلوب ولم يتم ضبطه — راجع .env.example")
    return value


class Config:
    """Reads all configuration from environment variables — never hardcode
    secrets in code, set them as Railway/​.env variables instead."""

    def __init__(self) -> None:
        self.telegram_token = _require("TELEGRAM_BOT_TOKEN")
        self.chat_id = _require("TELEGRAM_CHAT_ID")
        self.football_data_key = _require("FOOTBALL_DATA_KEY")
        self.anthropic_api_key = _require("ANTHROPIC_API_KEY")

        self.analysis_model = os.getenv("ANALYSIS_MODEL", "claude-opus-5")
        self.timezone_name = os.getenv("TIMEZONE", "Africa/Cairo")
        self.tz = ZoneInfo(self.timezone_name)

        data_dir = os.getenv("DATA_DIR", "./data")
        self.db_path = os.getenv("DB_PATH", os.path.join(data_dir, "predictions.db"))

        # نافذة الإرسال قبل المباراة: نعتبر المباراة "قريبة" عندما يتبقى لها
        # بين هذين الحدين (بالدقائق) — النافذة أعرض من فاصل الفحص (10 دقائق)
        # حتى لا تفوت أي مباراة لو تأخر تشغيل مهمة.
        self.pre_match_window_start_min = 100
        self.pre_match_window_end_min = 130
