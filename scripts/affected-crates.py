#!/usr/bin/env python3
"""Print -p flags for workspace crates affected by a set of changed files.

Usage:
    affected-crates.py FILE [FILE ...]
    git diff --name-only | affected-crates.py --stdin

Exit codes:
    0  — printed -p flags (possibly none)
    1  — error
    2  — full workspace run needed (Cargo.lock, rust-toolchain.toml, etc.)

When exit code is 2 the caller should run cargo commands with --workspace.
"""
from __future__ import annotations

import json
import subprocess
import sys
from collections import deque
from pathlib import PurePosixPath


def _cargo_metadata() -> dict:
    raw = subprocess.check_output(
        ["cargo", "metadata", "--format-version", "1"],
        stderr=subprocess.DEVNULL,
    )
    return json.loads(raw)


def _build_maps(meta: dict) -> tuple[str, dict[str, str], dict[str, set[str]]]:
    """Return (workspace_root, path_prefix->pkg_name, pkg->set of rdeps)."""
    ws_root = meta["workspace_root"]
    ws_member_ids = set(meta["workspace_members"])

    # Map crate directory (relative to ws root) -> package name.
    dir_to_pkg: dict[str, str] = {}
    for pkg in meta["packages"]:
        if pkg["id"] not in ws_member_ids:
            continue
        manifest = pkg["manifest_path"]
        rel = manifest.replace(ws_root + "/", "").removesuffix("/Cargo.toml")
        dir_to_pkg[rel] = pkg["name"]

    # Build reverse-dependency adjacency list (workspace packages only).
    id_to_name = {p["id"]: p["name"] for p in meta["packages"]}
    ws_names = {id_to_name[mid] for mid in ws_member_ids}
    rdeps: dict[str, set[str]] = {name: set() for name in ws_names}
    for node in meta["resolve"]["nodes"]:
        if node["id"] not in ws_member_ids:
            continue
        depender = id_to_name[node["id"]]
        for dep in node.get("deps", []):
            dep_name = id_to_name[dep["pkg"]]
            if dep_name in ws_names:
                rdeps.setdefault(dep_name, set()).add(depender)

    return ws_root, dir_to_pkg, rdeps


# Files whose change means we must check every crate.
_GLOBAL_TRIGGERS = {
    "Cargo.lock",
    "Cargo.toml",
    "rust-toolchain.toml",
    "rust-toolchain",
    ".cargo/config.toml",
}


def affected_packages(
    changed_files: list[str],
    dir_to_pkg: dict[str, str],
    rdeps: dict[str, set[str]],
) -> set[str] | None:
    """Return affected package names, or None for full-workspace run."""
    direct: set[str] = set()

    for f in changed_files:
        if f in _GLOBAL_TRIGGERS:
            return None  # full workspace

        # Walk up path segments to find the containing crate.
        parts = PurePosixPath(f).parts
        for i in range(len(parts), 0, -1):
            prefix = "/".join(parts[:i])
            if prefix in dir_to_pkg:
                direct.add(dir_to_pkg[prefix])
                break

    # BFS for transitive reverse dependents.
    affected = set(direct)
    queue = deque(direct)
    while queue:
        pkg = queue.popleft()
        for rdep in rdeps.get(pkg, set()):
            if rdep not in affected:
                affected.add(rdep)
                queue.append(rdep)

    return affected


def main() -> int:
    if "--stdin" in sys.argv:
        files = [line.strip() for line in sys.stdin if line.strip()]
    else:
        files = sys.argv[1:]

    if not files:
        return 0

    meta = _cargo_metadata()
    _, dir_to_pkg, rdeps = _build_maps(meta)

    result = affected_packages(files, dir_to_pkg, rdeps)

    if result is None:
        return 2  # caller should use --workspace

    if result:
        print(" ".join(f"-p {name}" for name in sorted(result)))

    return 0


if __name__ == "__main__":
    sys.exit(main())
