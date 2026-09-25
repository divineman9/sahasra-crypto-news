"""Driver: run one glm_multibuild batch against the build contract with a longer GLM timeout."""
import sys, functools
sys.path.insert(0, r"D:\claude projects")
import agents
import glm_multibuild

_orig = agents._post_json

@functools.wraps(_orig)
def _post_json_long(url, headers, body, timeout=180):
    return _orig(url, headers, body, timeout=900)

agents._post_json = _post_json_long

batch, goal_file = sys.argv[1], sys.argv[2]
contract = open(r"D:\claude projects\crypto-news-terminal\build\contract.md", encoding="utf-8").read()
goal = open(goal_file, encoding="utf-8").read()
files = glm_multibuild.build_project(
    title=f"Crypto News Terminal - batch {batch}",
    goal=goal,
    master_spec=contract,
    tests_md="",
    code_dir=r"D:\claude projects\crypto-news-terminal\app",
    model="glm",
    extend_existing=True,
)
print(f"BATCH {batch} DONE: {len(files)} files")
