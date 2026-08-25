import json
import sqlite3
from contextlib import closing
from datetime import datetime, timezone
from pathlib import Path


def _connect(db_path: str) -> sqlite3.Connection:
    Path(db_path).parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    return conn


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def init_db(db_path: str) -> None:
    with closing(_connect(db_path)) as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS predictions (
                match_id INTEGER PRIMARY KEY,
                competition_code TEXT NOT NULL,
                competition_name TEXT NOT NULL,
                home_team TEXT NOT NULL,
                away_team TEXT NOT NULL,
                utc_date TEXT NOT NULL,
                predicted_home_goals INTEGER NOT NULL,
                predicted_away_goals INTEGER NOT NULL,
                confidence INTEGER NOT NULL,
                lineup_summary TEXT,
                injuries_summary TEXT,
                key_reasons TEXT,
                created_at TEXT NOT NULL,
                verdicted_at TEXT,
                actual_home_goals INTEGER,
                actual_away_goals INTEGER,
                verdict TEXT
            )
            """
        )
        conn.commit()


def save_prediction(
    db_path: str,
    match_id: int,
    competition_code: str,
    competition_name: str,
    home_team: str,
    away_team: str,
    utc_date: str,
    prediction: dict,
) -> None:
    with closing(_connect(db_path)) as conn:
        conn.execute(
            """
            INSERT OR REPLACE INTO predictions (
                match_id, competition_code, competition_name, home_team, away_team,
                utc_date, predicted_home_goals, predicted_away_goals, confidence,
                lineup_summary, injuries_summary, key_reasons, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                match_id,
                competition_code,
                competition_name,
                home_team,
                away_team,
                utc_date,
                prediction["predicted_home_goals"],
                prediction["predicted_away_goals"],
                prediction["confidence_percent"],
                prediction["lineup_summary"],
                prediction["injuries_summary"],
                json.dumps(prediction["key_reasons"], ensure_ascii=False),
                _now_iso(),
            ),
        )
        conn.commit()


def get_prediction(db_path: str, match_id: int) -> sqlite3.Row | None:
    with closing(_connect(db_path)) as conn:
        return conn.execute(
            "SELECT * FROM predictions WHERE match_id = ?", (match_id,)
        ).fetchone()


def mark_verdict(
    db_path: str,
    match_id: int,
    actual_home_goals: int,
    actual_away_goals: int,
    verdict: str,
) -> None:
    with closing(_connect(db_path)) as conn:
        conn.execute(
            """
            UPDATE predictions
            SET actual_home_goals = ?, actual_away_goals = ?, verdict = ?, verdicted_at = ?
            WHERE match_id = ?
            """,
            (actual_home_goals, actual_away_goals, verdict, _now_iso(), match_id),
        )
        conn.commit()


def get_stats_since(db_path: str, since_iso: str) -> dict:
    with closing(_connect(db_path)) as conn:
        rows = conn.execute(
            """
            SELECT verdict, COUNT(*) AS c FROM predictions
            WHERE verdicted_at IS NOT NULL AND verdicted_at >= ?
            GROUP BY verdict
            """,
            (since_iso,),
        ).fetchall()
    stats = {"correct": 0, "partial": 0, "wrong": 0}
    for row in rows:
        if row["verdict"] in stats:
            stats[row["verdict"]] = row["c"]
    return stats
