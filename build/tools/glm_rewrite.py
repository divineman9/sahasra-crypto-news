"""PRIVATE worker for EXPLAIN_REWRITE_CMD (P5 spec 4.5). Never copy to the public repo (uses agents.py keys).

stdin : JSON {"facts": {...}, "text": {"why", "tradeoffs", "scenarios": [{"title", "condition"}]}}
stdout: JSON {"why", "tradeoffs", "scenarios": [{"title", "condition"}]}   (same scenario count/order)
The Node side validates the output with the number guard; anything it rejects falls back to the template.
"""
import json
import re
import sys

sys.path.insert(0, r"D:\claude projects")
from agents import ask_glm  # noqa: E402

SYSTEM = (
    "You rewrite short crypto-news explanations in plain words for a 12-year-old. "
    "Do not add or change any number, date or coin name. Do not give advice: never say buy, sell, long, short, "
    "target, or predict a price. No markdown, no URLs, no lists. Keep each sentence about the same length as the "
    "original. Use 'trade' or 'cash out' instead of sell, and never use the words buy, sell, long, short, target, dump, moon. Reply with ONLY a JSON object."
)


def main() -> int:
    sys.stdin.reconfigure(encoding="utf-8")
    sys.stdout.reconfigure(encoding="utf-8")
    data = json.loads(sys.stdin.read())
    facts, text = data["facts"], data["text"]
    prompt = (
        "Facts (the only source of numbers and names):\n" + json.dumps(facts, ensure_ascii=False)[:3000]
        + "\n\nRewrite these fields in simpler words. Keep the meaning, keep every number exactly as written, "
        "keep the same number of scenarios in the same order.\n"
        + json.dumps(text, ensure_ascii=False)
        + '\n\nReturn exactly: {"why": "...", "tradeoffs": "...", "scenarios": [{"title": "...", "condition": "..."}, ...]}'
    )
    out = ask_glm(prompt, SYSTEM, max_tokens=1500, turbo=True)
    out = out.strip()
    out = re.sub(r"^```(?:json)?\s*", "", out)
    out = re.sub(r"\s*```$", "", out)
    json.loads(out)  # fail loudly (non-zero exit) if it is not JSON; Node falls back to the template
    sys.stdout.write(out)
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as e:  # noqa: BLE001
        sys.stderr.write(f"glm_rewrite error: {e}\n")
        sys.exit(1)
