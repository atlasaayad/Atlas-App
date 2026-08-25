import json

import anthropic

SYSTEM_PROMPT = (
    "أنت محلل كرة قدم محترف يعمل داخل بوت تيليجرام. مهمتك:\n"
    "1) استخدم أداة البحث على الويب للعثور على آخر الأخبار عن التشكيلة "
    "المتوقعة والغيابات (إصابات/إيقافات) لكلا الفريقين، وشكلهما في آخر "
    "5 مباريات، وأي معطيات مهمة (أهمية المباراة، المواجهات المباشرة).\n"
    "2) بناءً على ما وجدته، أصدر توقعاً واقعياً لنتيجة المباراة مع نسبة ثقة "
    "منطقية — لا تبالغ في الثقة، معظم مباريات كرة القدم تقع بين 40% و70% ثقة.\n"
    "إن لم تجد معلومات مؤكدة عن التشكيلة، اذكر ذلك صراحة بدل التخمين. "
    "اكتب كل الحقول النصية بالعربية الفصحى المبسطة."
)

PREDICTION_SCHEMA = {
    "type": "object",
    "properties": {
        "predicted_home_goals": {"type": "integer", "minimum": 0, "maximum": 9},
        "predicted_away_goals": {"type": "integer", "minimum": 0, "maximum": 9},
        "confidence_percent": {"type": "integer", "minimum": 1, "maximum": 99},
        "lineup_summary": {
            "type": "string",
            "description": "ملخص قصير للتشكيلة المتوقعة لكلا الفريقين",
        },
        "injuries_summary": {
            "type": "string",
            "description": "ملخص الغيابات والإصابات المؤثرة لكلا الفريقين",
        },
        "key_reasons": {
            "type": "array",
            "items": {"type": "string"},
            "minItems": 1,
            "maxItems": 5,
            "description": "أهم 3-5 أسباب اعتمد عليها التوقع",
        },
    },
    "required": [
        "predicted_home_goals",
        "predicted_away_goals",
        "confidence_percent",
        "lineup_summary",
        "injuries_summary",
        "key_reasons",
    ],
    "additionalProperties": False,
}


class AIAnalyst:
    def __init__(self, api_key: str, model: str) -> None:
        self.client = anthropic.Anthropic(api_key=api_key)
        self.model = model

    def analyze_match(
        self, competition_name: str, home_team: str, away_team: str, kickoff_local: str
    ) -> dict:
        """Blocking call — run via asyncio.to_thread from async code."""
        user_prompt = (
            f"مباراة: {home_team} ضد {away_team}\n"
            f"البطولة: {competition_name}\n"
            f"موعد المباراة (بالتوقيت المحلي): {kickoff_local}\n\n"
            "ابحث الآن عن آخر أخبار التشكيلة المتوقعة والغيابات لكلا الفريقين "
            "قبل هذه المباراة، ثم أعطني توقعك."
        )
        response = self.client.messages.create(
            model=self.model,
            max_tokens=4096,
            system=SYSTEM_PROMPT,
            tools=[
                {
                    "type": "web_search_20260209",
                    "name": "web_search",
                    "max_uses": 6,
                }
            ],
            output_config={
                "format": {"type": "json_schema", "schema": PREDICTION_SCHEMA}
            },
            messages=[{"role": "user", "content": user_prompt}],
        )
        text = next(block.text for block in response.content if block.type == "text")
        return json.loads(text)
