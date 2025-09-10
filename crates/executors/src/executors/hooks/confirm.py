#!/usr/bin/env python3
import json
import sys
import time
import urllib.error
import urllib.request

TIMEOUT_SECONDS = 30
POLL_INTERVAL = 5

BACKEND_URL = "http://127.0.0.1:3002"
CREATE_URL = f"{BACKEND_URL}/api/approvals/create"


def json_error(reason: str) -> None:
    """Emit a deny PreToolUse JSON to stdout and exit(0)."""
    payload = {
        "hookSpecificOutput": {
            "hookEventName": "PreToolUse",
            "permissionDecision": "deny",
            "permissionDecisionReason": reason,
        }
    }
    print(json.dumps(payload, ensure_ascii=False))
    sys.exit(0)


def json_success() -> None:
    """Emit an allow PreToolUse JSON (plus suppressOutput) to stdout and exit(0)."""
    payload = {
        "hookSpecificOutput": {
            "hookEventName": "PreToolUse",
            "permissionDecision": "allow",
        },
        "suppressOutput": True,
    }
    print(json.dumps(payload, ensure_ascii=False))
    sys.exit(0)


def http_post_json(url: str, body: dict) -> dict:
    data = json.dumps(body).encode("utf-8")
    req = urllib.request.Request(
        url, data=data, headers={"Content-Type": "application/json"}, method="POST"
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            return json.loads(resp.read().decode("utf-8") or "{}")
    except (
        urllib.error.HTTPError,
        urllib.error.URLError,
        TimeoutError,
        json.JSONDecodeError,
    ) as e:
        json_error(
            f"Failed to create approval request. Backend may be unavailable. ({e})"
        )
        raise  # unreachable


def http_get_json(url: str) -> dict:
    req = urllib.request.Request(url, method="GET")
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            return json.loads(resp.read().decode("utf-8") or "{}")
    except (
        urllib.error.HTTPError,
        urllib.error.URLError,
        TimeoutError,
        json.JSONDecodeError,
    ) as e:
        json_error(f"Lost connection to approval backend: {e}")
        raise  # unreachable


def main():
    try:
        raw_payload = sys.stdin.read()
        incoming = json.loads(raw_payload or "{}")
    except json.JSONDecodeError:
        json_error("Invalid JSON payload on stdin")

    tool_name = incoming.get("tool_name")
    tool_input = incoming.get("tool_input")
    session_id = incoming.get("session_id", "unknown")

    create_payload = {
        "tool_name": tool_name,
        "tool_input": tool_input,
        "session_id": session_id,
    }

    response = http_post_json(CREATE_URL, create_payload)
    approval_id = response.get("id")

    print(
        f"Approval request created: {approval_id}. Waiting for user response...",
        file=sys.stderr,
    )

    if not approval_id:
        json_error("Invalid response from approval backend")

    status_url = f"{BACKEND_URL}/api/approvals/{approval_id}/status"

    elapsed = 1
    while elapsed < TIMEOUT_SECONDS:
        result = http_get_json(status_url)
        status = result.get("status")

        if status == "approved":
            json_success()
        elif status == "denied":
            reason = result.get("reason") or "User denied"
            json_error(reason)
        elif status == "timed_out":
            json_error(f"Approval request timed out after {TIMEOUT_SECONDS} seconds")
        elif status == "pending":
            time.sleep(POLL_INTERVAL)
            elapsed += POLL_INTERVAL
        else:
            json_error(f"Unknown approval status: {status}")

    json_error(f"Approval request timed out after {TIMEOUT_SECONDS} seconds")


if __name__ == "__main__":
    main()
