import sys, functools
sys.path.insert(0, r"D:\claude projects")
import agents, glm_multibuild
_orig = agents._post_json
@functools.wraps(_orig)
def _long(url, headers, body, timeout=180):
    return _orig(url, headers, body, timeout=900)
agents._post_json = _long
files = glm_multibuild.build_project(title="ShivaShakthi news chip", goal='Write ONLY one file: news_chip.js (it goes directly in the output directory). File header on its own line exactly like ===FILE: news_chip.js===',
    master_spec=open(r"D:\claude projects\crypto-news-terminal\build\p1_contract_chip.md", encoding="utf-8").read(), tests_md="",
    code_dir=r"D:\claude projects\crypto\screener", model="glm", extend_existing=True)
print("CHIP DONE", files)
