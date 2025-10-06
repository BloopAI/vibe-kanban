#!/usr/bin/env python3
import argparse
import json
import sys
import time
import urllib.error
import urllib.request
from typing import Optional


def json_error(reason: Optional[str], feedback_marker: Optional[str] = None) -> None:
    """Emit a deny PreToolUse JSON to stdout and exit(0)."""
    # Prefix user feedback with marker for extraction if provided
    formatted_reason = reason
    if reason and feedback_marker:
        formatted_reason = f"{feedback_marker}{reason}"

    payload = {
        "hookSpecificOutput": {
            "hookEventName": "PreToolUse",
            "permissionDecision": "deny",
            "permissionDecisionReason": formatted_reason,
        }
    }
    print(json.dumps(payload, ensure_ascii=False))
    sys.exit(0)


def json_success() -> None:
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
        raise


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="PreToolUse approval gate. All parameters are passed via CLI."
    )
    parser.add_argument(
        "-t",
        "--timeout-seconds",
        type=int,
        required=True,
        help="Maximum time to wait for approval before timing out (seconds).",
    )
    parser.add_argument(
        "-p",
        "--poll-interval",
        type=int,
        required=True,
        help="Seconds between polling the backend for status.",
    )
    parser.add_argument(
        "-b",
        "--backend-port",
        type=int,
        required=True,
        help="Port of the approval backend running on 127.0.0.1.",
    )
    parser.add_argument(
        "-m",
        "--feedback-marker",
        type=str,
        required=True,
        help="Marker prefix for user feedback messages.",
    )
    args = parser.parse_args()

    if args.timeout_seconds <= 0:
        parser.error("--timeout-seconds must be a positive integer")
    if args.poll_interval <= 0:
        parser.error("--poll-interval must be a positive integer")
    if args.poll_interval > args.timeout_seconds:
        parser.error("--poll-interval cannot be greater than --timeout-seconds")

    return args


def main():
    args = parse_args()
    port = args.backend_port

    url = f"http://127.0.0.1:{port}"
    create_endpoint = f"{url}/api/approvals/create"

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

    response = http_post_json(create_endpoint, create_payload)
    approval_id = response.get("id")
    if not approval_id:
        json_error("Invalid response from approval backend")

    print(
        f"Approval request created: {approval_id}. Waiting for user response...",
        file=sys.stderr,
    )

    elapsed = 0
    while elapsed < args.timeout_seconds:
        result = http_get_json(f"{url}/api/approvals/{approval_id}/status")
        status = result.get("status")

        if status == "approved":
            json_success()
        elif status == "denied":
            reason = result.get("reason")
            json_error(reason, args.feedback_marker)
        elif status == "timed_out":
            # concat to avoid triggering the watchkill script
            json_error(
                "Approval request" + f" timed out after {args.timeout_seconds} seconds"
            )
        elif status == "pending":
            time.sleep(args.poll_interval)
            elapsed += args.poll_interval
        else:
            json_error(f"Unknown approval status: {status}")

    # concat to avoid triggering the watchkill script
    json_error("Approval request"+ f" timed out after {args.timeout_seconds} seconds")


if __name__ == "__main__":
    main()
