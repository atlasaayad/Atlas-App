import logging

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from telegram.ext import Application, ApplicationBuilder, CommandHandler

from . import storage
from .config import Config
from .handlers import start_cmd, stats_cmd
from .predictor import COMPETITIONS, PredictionJobs

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s"
)
logger = logging.getLogger(__name__)


async def on_startup(application: Application) -> None:
    config: Config = application.bot_data["config"]
    storage.init_db(config.db_path)

    jobs = PredictionJobs(application.bot, config)
    application.bot_data["jobs"] = jobs

    scheduler = AsyncIOScheduler(timezone=config.tz)
    # فحص المباريات القادمة والمنتهية كل 10 دقائق — هامش النافذة الزمنية في
    # Config يضمن عدم تفويت أي مباراة حتى لو تأخرت مهمة عن موعدها قليلاً.
    scheduler.add_job(
        jobs.check_upcoming_matches, "interval", minutes=10, id="check_upcoming", max_instances=1
    )
    scheduler.add_job(
        jobs.check_finished_matches, "interval", minutes=10, id="check_finished", max_instances=1
    )
    scheduler.add_job(
        jobs.weekly_stats, "cron", day_of_week="mon", hour=8, minute=0, id="weekly_stats"
    )
    scheduler.start()
    application.bot_data["scheduler"] = scheduler

    logger.info(
        "تم تشغيل الجدولة (توقيت %s) — البطولات: %s",
        config.timezone_name,
        ", ".join(COMPETITIONS.values()),
    )


def main() -> None:
    config = Config()

    application = (
        ApplicationBuilder().token(config.telegram_token).post_init(on_startup).build()
    )
    application.bot_data["config"] = config

    application.add_handler(CommandHandler("start", start_cmd))
    application.add_handler(CommandHandler("help", start_cmd))
    application.add_handler(CommandHandler("stats", stats_cmd))

    logger.info("بدء تشغيل بوت التوقعات...")
    application.run_polling(allowed_updates=["message"])


if __name__ == "__main__":
    main()
