#!/usr/bin/env bash
# Harbor run wrapper for HoliCode task.
#
# Harbor removes all Docker images after each run (--rmi all).
# This script rebuilds the image immediately before running Harbor.
#
# Usage (from inside holicode-eval container or workspace with Docker socket):
#   ./scripts/eval/harbor-run.sh [--agent oracle|claude-code] [--llm-judge]
#
# The Docker image is built from the repo root so all COPY paths resolve.
# The OAuth token is extracted from ~/.claude/.credentials.json automatically.

set -euo pipefail

REPO=$(git rev-parse --show-toplevel)
AGENT="${HARBOR_AGENT:-claude-code}"
LLM_JUDGE="${ENABLE_LLM_JUDGE:-0}"

# Parse args
while [[ $# -gt 0 ]]; do
    case $1 in
        --agent) AGENT="$2"; shift 2 ;;
        --llm-judge) LLM_JUDGE="1"; shift ;;
        *) echo "Unknown arg: $1"; exit 1 ;;
    esac
done

# Extract OAuth token
CREDS="$HOME/.claude/.credentials.json"
if [ ! -f "$CREDS" ]; then
    CREDS="$HOME/.claude/credentials.json"
fi
TOKEN=$(python3 -c "import json; d=json.load(open('$CREDS')); print(d['claudeAiOauth']['accessToken'])" 2>/dev/null || echo "")
if [ -z "$TOKEN" ]; then
    echo "ERROR: Could not extract OAuth token from $CREDS"
    exit 1
fi
echo "Token extracted: ${TOKEN:0:20}..."

# Rebuild Docker image (Harbor removes it after each run with --rmi all)
IMAGE_TAG="holicode-poc-task-tracker:latest"
echo "Building $IMAGE_TAG from repo root..."
cd "$REPO"
docker build \
    -t "$IMAGE_TAG" \
    -f test-resources/harbor-tasks/holicode-poc-task-tracker/environment/Dockerfile \
    . 2>&1 | tail -5
echo "Image built."

# Resolve jobs dir: when running inside a DooD container, Harbor passes
# /home/coder/workspace/jobs/... to docker compose as the HOST bind-mount path.
# Docker on the real host mounts HOST:/home/coder/workspace/jobs/..., which is
# a DIFFERENT physical location than the eval container's /home/coder/workspace/jobs/
# (the docker volume). We must use the docker volume host path so both Harbor and
# the task container see the same files.
#
# Detect if running inside DooD: check if the docker volume path exists on the host.
DOCKER_VOLUME_BASE="/var/lib/docker/volumes/holicode-eval-home/_data"
if [ -d "$DOCKER_VOLUME_BASE" ]; then
    # Running on the host (Docker daemon accessible) — use volume path for jobs dir
    JOBS_DIR="$DOCKER_VOLUME_BASE/workspace/jobs"
    mkdir -p "$JOBS_DIR"
    echo "Using docker volume jobs dir: $JOBS_DIR"
else
    # Running inside the eval container (DooD case) — use default relative path
    # NOTE: This causes DooD path mismatch for reward files. See README for details.
    JOBS_DIR=""
fi

# Run Harbor
echo "Starting Harbor run (agent=$AGENT)..."
JOBS_DIR_FLAG=""
[ -n "$JOBS_DIR" ] && JOBS_DIR_FLAG="--jobs-dir $JOBS_DIR"

EXTRA_AE=""
[ "$LLM_JUDGE" = "1" ] && EXTRA_AE="--ae ENABLE_LLM_JUDGE=1"

harbor run \
    --path test-resources/harbor-tasks/holicode-poc-task-tracker \
    --agent "$AGENT" \
    --model claude-sonnet-4-6 \
    --ae ANTHROPIC_API_KEY="$TOKEN" \
    --ae CLAUDE_CODE_OAUTH_TOKEN="$TOKEN" \
    $EXTRA_AE \
    $JOBS_DIR_FLAG \
    -y 2>&1 || true  # DooD path mismatch causes RewardFileNotFoundError; handled below

# DooD bridge: when running inside eval container (DooD), Harbor writes reward
# files to HOST /home/coder/workspace/jobs/... via docker volume bind-mount.
# But Harbor reads from the eval container's docker-volume path, which is different.
# Bridge: use `docker run` (via DooD) to read the HOST-written reward files.
if [ -z "$JOBS_DIR" ]; then
    # Find the latest job dir on the HOST via docker run (alpine has ls)
    LATEST_HOST_JOB=$(docker run --rm \
        -v /home/coder/workspace/jobs:/jobs:ro \
        alpine:latest \
        sh -c 'ls -td /jobs/2*/ 2>/dev/null | head -1' 2>/dev/null || echo "")
    if [ -n "$LATEST_HOST_JOB" ]; then
        echo ""
        echo "=== DooD bridge: reading reward files from host path ==="
        # Find all trial verifier dirs
        TRIAL_DIRS=$(docker run --rm \
            -v "/home/coder/workspace/jobs:/jobs:ro" \
            alpine:latest \
            sh -c "ls -d ${LATEST_HOST_JOB}*/verifier/ 2>/dev/null" 2>/dev/null || echo "")
        for trial_dir in $TRIAL_DIRS; do
            job_basename=$(basename "$(dirname "$(dirname "$trial_dir")")")
            trial_basename=$(basename "$(dirname "$trial_dir")")
            local_verif_dir="$REPO/jobs/${job_basename}/${trial_basename}/verifier"
            mkdir -p "$local_verif_dir"
            # Read reward files from HOST via docker run
            docker run --rm -v "/home/coder/workspace/jobs:/jobs:ro" alpine:latest \
                sh -c "cat ${trial_dir}reward.json 2>/dev/null" \
                > "$local_verif_dir/reward.json" 2>/dev/null || true
            docker run --rm -v "/home/coder/workspace/jobs:/jobs:ro" alpine:latest \
                sh -c "cat ${trial_dir}reward.txt 2>/dev/null" \
                > "$local_verif_dir/reward.txt" 2>/dev/null || true
        done
        LATEST_REWARD=$(find "$REPO/jobs" -name "reward.txt" -newer "$REPO/jobs" 2>/dev/null | head -1)
        if [ -f "$LATEST_REWARD" ]; then
            echo "Harbor task score: $(cat "$LATEST_REWARD")"
            REWARD_JSON="${LATEST_REWARD%.txt}.json"
            [ -f "$REWARD_JSON" ] && echo "reward.json saved at: $REWARD_JSON"
        fi
    fi
fi
