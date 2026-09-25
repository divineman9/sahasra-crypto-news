"""Driver: glm_multibuild for a feature spec file with a longer GLM timeout."""
import sys, functools
sys.path.insert(0, r"D:\claude projects")
import agents, glm_multibuild
_orig = agents._post_json
@functools.wraps(_orig)
def _long(url, headers, body, timeout=180):
    return _orig(url, headers, body, timeout=900)
agents._post_json = _long
spec_path, goal = sys.argv[1], sys.argv[2]
files = glm_multibuild.build_project(
    title="Crypto News Terminal - feature", goal=goal,
    master_spec=open(spec_path, encoding="utf-8").read(), tests_md="",
    code_dir=r"D:\claude projects\crypto-news-terminal\app", model="glm", extend_existing=True)
print(f"FEATURE DONE: {len(files)} files")
