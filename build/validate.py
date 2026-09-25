"""Opus ship-gate validation of the rebuilt app against the build contract."""
import sys, re
from pathlib import Path
sys.path.insert(0, r"D:\claude projects")
from agents import ask_claude

ROOT = Path(r"D:\claude projects\crypto-news-terminal")
APP = ROOT / "app"
SKIP_DIRS = {"node_modules", ".next"}
EXTS = {".js", ".ts", ".tsx", ".mjs", ".prisma", ".css", ".json", ".md"}

files = []
for f in sorted(APP.rglob("*")):
    rel = f.relative_to(APP)
    if not f.is_file() or set(rel.parts) & SKIP_DIRS or f.name in (".env", "package-lock.json", "next-env.d.ts"):
        continue
    if f.suffix in EXTS or f.name in (".env.example", ".gitignore"):
        files.append(f"### {rel.as_posix()}\n```\n{f.read_text(encoding='utf-8', errors='replace')}\n```")

code = "\n\n".join(files)
contract = (ROOT / "build" / "contract.md").read_text(encoding="utf-8")
original = Path(r"C:\Users\sidda\Downloads\Architecture Specification.md").read_text(encoding="utf-8")
evidence = (ROOT / "build" / "verification_evidence.md").read_text(encoding="utf-8")

prompt = f"""You are the final ship-gate validator for this project. Review the COMPLETE source below.

ORIGINAL USER SPEC (section 6 steps 1-5 are the required scope; Python workers/Twitter are explicitly out of scope for this build):
{original}

BUILD CONTRACT (authoritative implementation spec derived from the user spec; user chose PostgreSQL + Redis):
{contract}

LIVE VERIFICATION ALREADY PERFORMED BY THE ORCHESTRATOR (real runs on this machine):
{evidence}

FULL SOURCE ({len(files)} files):
{code}

Validate: 1) matches user spec steps 1-5 and the contract? 2) real bugs (logic, races, React issues, Redis/WS reliability) 3) security 4) error handling 5) would it work as a local app.
Only report issues you can point to in the code (file + what is wrong). Do not report files as missing if they are present above.

Output:
## Validation Score: X/10
## Passed Checks
## Failed Checks
## Critical Issues (must fix before shipping)
## Nice-to-have Improvements
## Ship Decision: SHIP / SHIP WITH FIXES / DO NOT SHIP"""

print(f"files={len(files)} prompt_chars={len(prompt)}", file=sys.stderr)
report = ask_claude(prompt, max_tokens=4000, model="claude-opus-5-5")
(ROOT / "build" / "validation_report_v2.md").write_text(f"# Validation Report v2\n\n{report}", encoding="utf-8")
score = re.search(r"Validation Score:\s*(\d+)/10", report)
decision = re.search(r"Ship Decision:\s*(.*)", report)
print(f"SCORE={score.group(1) if score else '?'} DECISION={decision.group(1).strip() if decision else '?'}")
