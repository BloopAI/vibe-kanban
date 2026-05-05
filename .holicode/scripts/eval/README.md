# HoliCode Eval Harness

Self-improvement loop for HoliCode spec-driven workflows. Runs agentic
spec generation with varying prompt quality, scores the output across
multiple layers, and keeps the best-performing prompt variant.

## Architecture

```
improve.sh
  ├─ variant N prompt → claude (outside Docker)
  │   └─ produces .holicode/specs/stories/ + tasks/
  ├─ score.py (Layer 0-3 scorer)
  │   └─ writes reward.json + reward.txt
  └─ keep/discard decision based on score

harbor-run.sh (Docker pipeline)
  ├─ docker build holicode-poc-task-tracker:latest (from repo root)
  ├─ harbor run --path ... --agent oracle
  │   ├─ solution/solve.sh (agent entrypoint, runs in Docker)
  │   └─ tests/test.sh → score.py (verifier, runs in Docker)
  └─ DooD bridge: docker run alpine to read HOST reward files
```

**Working architecture:** The self-improvement loop (`improve.sh`) runs
agents outside Docker via `env -u CLAUDECODE env -u CLAUDE_CODE_ENTRYPOINT claude`.

The Harbor Docker pipeline runs end-to-end via `harbor-run.sh` with the
oracle agent and `solution/solve.sh`. The verifier container produces
`reward.json` correctly; a DooD bridge reads it since the bind-mount
path differs between host and eval container.

## Score Layers

| Layer | What it measures | Weight (no LLM) | Weight (with LLM) |
|-------|-----------------|------------------|-------------------|
| **0-1** | Structural: required files, sections, fields, EARS/GWT patterns | 57% | 40% |
| **2** | NLP heuristics: weasel words, measurable ACs, sentence complexity, duplicate ACs, substantive content | 43% | 30% |
| **3** | LLM-as-judge: AC completeness, testability, value clarity (opt-in via `ENABLE_LLM_JUDGE=1`) | — | 30% |

### Layer 2 Sub-scores

1. **Weasel word density** — penalizes "appropriate", "suitable", "flexible", "various", "etc.", "possibly", "might", "could". Score 1.0 if density < 0.5%, 0.0 if > 3%.
2. **Measurable outcome detection** — checks each AC line for numbers, quoted strings, HTTP codes, error names, specific states. Score = fraction of ACs with concrete signals.
3. **Sentence complexity** — flags sentences > 40 words. Score 1.0 if none, 0.0 if > 20% of sentences are long.
4. **Cross-story duplicate AC detection** — TF-IDF cosine similarity between AC blocks. Score 1.0 if max sim < 0.7, 0.0 if > 0.9.
5. **Substantive content check** — counts non-boilerplate words per section. Score 1.0 if avg > 15 substantive words, 0.0 if < 5.

**Validated score range:**
| Prompt quality | L0-1 | L2 | Total |
|----------------|------|----|-------|
| Minimal/hollow | ~1.0 | 0.5 | ~0.65 |
| Negative cases | ~1.0 | 0.97 | ~0.85 |
| Full rubric | ~1.0 | 0.97+ | ~0.99 |

### Layer 3 (LLM-as-Judge)

When `ENABLE_LLM_JUDGE=1`, calls Claude to rate stories on:
- **AC Completeness**: happy + negative + boundary + error coverage
- **Testability**: deterministic pass/fail criteria
- **Value Clarity**: specific user outcomes vs generic capabilities

Layer 3 confirmed working in the eval container (scored hollow spec 0.12
with reasoning: "only two happy-path ACs, 'appropriate feedback' is
subjective and untestable, 'manage my work' is generic").

## How to Run

### Self-improvement loop (5 prompt variants × N iterations)

```bash
# From repo root, Layer 0-2 only
./scripts/eval/improve.sh 3

# With LLM-as-judge (Layer 3)
ENABLE_LLM_JUDGE=1 ./scripts/eval/improve.sh 3
```

Results: `.holicode/analysis/reports/eval-improve-*.json`
Per-variant details: `.holicode/analysis/reports/eval-details/`

### Harbor Docker pipeline

```bash
# From inside holicode-eval container
cd /home/coder/workspace
bash scripts/eval/harbor-run.sh --agent oracle
bash scripts/eval/harbor-run.sh --agent oracle --llm-judge
```

The script rebuilds the Docker image before each run (Harbor removes it
after teardown with `--rmi all`) and applies the DooD bridge.

### Score a pre-existing output directory

```bash
STORIES_DIR=/path/to/stories \
TASKS_DIR=/path/to/tasks \
LOGS_DIR=/tmp/score-output \
python3 test-resources/harbor-tasks/holicode-poc-task-tracker/tests/score.py
```

## Prompt Variants (Quality Gradient)

| Variant | Strategy | Expected L2 Score |
|---------|----------|-------------------|
| 0 | Minimal — just "run the workflow" | 0.50-0.65 |
| 1 | EARS keywords + min 3 ACs | 0.65-0.75 |
| 2 | Negative/error case requirement | 0.75-0.82 |
| 3 | Measurability — concrete values required | 0.80-0.87 |
| 4 | Full rubric-aware — all quality dimensions | 0.88-0.95 |

## Dependencies

- Python 3.10+
- `scikit-learn` (for TF-IDF in Layer 2 duplicate detection)
- `claude` CLI (for agent runs and Layer 3 LLM judge)

## Known Limitations & Architecture Notes

### Harbor Docker Pipeline — DooD Path Mismatch

When Harbor runs inside the `holicode-eval` container (DooD), it passes
container-internal paths (e.g. `/home/coder/workspace/jobs/...`) as Docker
bind-mount sources to `docker compose`. Docker on the HOST mounts the HOST's
`/home/coder/workspace/jobs/...`, which is a different physical location than
the eval container's docker-volume path.

**Effect:** Verifier writes `reward.json` to HOST path; Harbor reads from
eval container path → `RewardFileNotFoundError`. The `reward.json` IS
produced and correct; it just appears in the wrong place from Harbor's view.

**Workaround in `harbor-run.sh`:** After Harbor runs, use `docker run alpine`
to read the HOST-written reward files and display the score. The full pipeline
works end-to-end; only Harbor's internal score tracking is broken.

**Confirmed:** The score is `0.0` because `solve.sh`'s claude invocation
fails (oracle agent doesn't install claude, unlike the `claude-code` agent).
Once claude is available in the container, the pipeline will produce
meaningful scores.

**Next step:** Either (a) pre-install Claude Code in the Dockerfile and
configure auth, or (b) accept Option C (external `improve.sh` loop) as
the working self-improvement architecture and use Harbor only for task
format and verifier scoring.

### Harbor `claude-code` Agent — Empty Output

The `claude-code` built-in agent installs Claude Code via `curl | bash` then
runs `claude --permission-mode=bypassPermissions --print -- {instruction}`.
Inside a fresh Docker container with only `ANTHROPIC_API_KEY` set (OAuth
token format `sk-ant-oat01-*`), claude produces empty stdout. Root cause
unclear (may require `--dangerously-skip-permissions` or account pre-login).

### SWE-bench — Not Available in Harbor Registry

`harbor datasets download swe-bench-verified` returns "Dataset not found".
`swe-bench-verified@0.1` and `swe-bench` are both absent from the Harbor
registry (registry.harborframework.com/datasets has 74 datasets, none
SWE-bench). Harbor 0.3.0 may require a different registry URL or the
dataset was not yet published.

**Next step:** Check https://registry.harborframework.com/datasets for the
correct dataset name, or use Harbor's `--registry-path` flag with a local
dataset download.

### DooD Image Builds

Regular `docker build` works from inside the eval container via DooD. Only
`unshare`-based operations (rootless build, some security contexts) fail.

### OAuth Token as API Key

`sk-ant-oat01-*` OAuth access tokens work as `ANTHROPIC_API_KEY` for direct
API calls (verified HTTP 200 from `/v1/messages`). Harbor's `--ae` flag
passes them correctly to the claude-code agent environment.

## Files

| Path | Purpose |
|------|---------|
| `scripts/eval/improve.sh` | Self-improvement loop (5 variants × N iterations) |
| `scripts/eval/harbor-run.sh` | Harbor Docker pipeline wrapper (builds image + DooD bridge) |
| `test-resources/harbor-tasks/holicode-poc-task-tracker/tests/score.py` | Multi-layer scorer (L0-3) |
| `test-resources/harbor-tasks/holicode-poc-task-tracker/tests/test.sh` | Harbor verifier entry point |
| `test-resources/harbor-tasks/holicode-poc-task-tracker/solution/solve.sh` | Oracle agent solver script |
| `test-resources/harbor-tasks/holicode-poc-task-tracker/task.toml` | Harbor task definition (prebuilt image) |
| `test-resources/harbor-tasks/holicode-poc-task-tracker/environment/Dockerfile` | Task Docker image (python3, sklearn, node, claude) |
| `test-resources/harbor-tasks/holicode-poc-task-tracker/instruction.md` | Harbor claude-code agent instruction |
