from datetime import date, timedelta

import requests

BASE_URL = "https://api.football-data.org/v4"


class FootballDataClient:
    """Thin wrapper around football-data.org's free-tier REST API.
    All methods are synchronous (requests) — call via asyncio.to_thread
    from async code so the event loop isn't blocked."""

    def __init__(self, api_key: str) -> None:
        self.session = requests.Session()
        self.session.headers.update({"X-Auth-Token": api_key})

    def _get_matches(
        self, competition_code: str, date_from: date, date_to: date, status: str
    ) -> list[dict]:
        url = f"{BASE_URL}/competitions/{competition_code}/matches"
        params = {
            "dateFrom": date_from.isoformat(),
            "dateTo": date_to.isoformat(),
            "status": status,
        }
        resp = self.session.get(url, params=params, timeout=15)
        resp.raise_for_status()
        return resp.json().get("matches", [])

    def get_upcoming(self, competition_code: str, days_ahead: int = 3) -> list[dict]:
        today = date.today()
        return self._get_matches(
            competition_code, today, today + timedelta(days=days_ahead), "SCHEDULED"
        )

    def get_recently_finished(
        self, competition_code: str, days_back: int = 1
    ) -> list[dict]:
        today = date.today()
        return self._get_matches(
            competition_code, today - timedelta(days=days_back), today, "FINISHED"
        )
