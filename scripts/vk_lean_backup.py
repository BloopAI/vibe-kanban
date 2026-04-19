#!/usr/bin/env python3
import argparse
import datetime
import hashlib
import json
import os
import re
import shutil
import sqlite3
import subprocess
import tarfile
from pathlib import Path

DEFAULT_VK_SHARE = Path("/home/mcp/.local/share/vibe-kanban")
DEFAULT_VK_CODEX_HOME = DEFAULT_VK_SHARE / "codex-home"
DEFAULT_BACKUP_ROOT = Path("/home/mcp/backups")
DEFAULT_EXPORT_ZIP = Path("/home/mcp/backups/vibe-kanban-export-2026-04-18.zip")
DEFAULT_DESKTOP_TARGET = "desktop:Desktop/vk-backups"
BACKUP_BASENAME = "vk-lean-restore"
LATEST_DIR_NAME = f"{BACKUP_BASENAME}-latest"
LATEST_TAR_NAME = f"{BACKUP_BASENAME}-latest.tar.gz"
TIMESTAMP_RE = re.compile(rf"^{BACKUP_BASENAME}-(\d{{8}}T\d{{6}}Z)(\.tar\.gz)?$")
UTC = datetime.timezone.utc
MIN_RECENT_SNAPSHOTS = 3
RETENTION_POLICY = {
    "hourly_for_days": 1,
    "every_6_hours_for_days": 1,
    "every_12_hours_for_days": 1,
    "daily_for_days": 7,
    "weekly_for_weeks": 8,
    "monthly_for_months": 12,
    "always_keep_newest": MIN_RECENT_SNAPSHOTS,
}


def run(cmd, cwd=None, check=False):
    result = subprocess.run(cmd, cwd=cwd, text=True, capture_output=True)
    if check and result.returncode != 0:
        raise RuntimeError(
            f"command failed: {' '.join(cmd)}\n{result.stdout}\n{result.stderr}"
        )
    return result


def write_text(path: Path, content: str):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content)


def copy_if_exists(src: Path, dst: Path):
    if src.is_file():
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, dst)
    elif src.is_dir():
        shutil.copytree(src, dst, dirs_exist_ok=True)


def collect_vk_thread_ids(vk_share: Path):
    thread_ids = set()
    sessions_root = vk_share / "sessions"
    if not sessions_root.exists():
        return thread_ids
    for path in sessions_root.rglob("processes/*.jsonl"):
        try:
            lines = path.read_text(errors="replace").splitlines()
        except Exception:
            continue
        for line in lines:
            try:
                outer = json.loads(line)
            except Exception:
                continue
            if not isinstance(outer, dict):
                continue
            for key in ("Stdout", "Stderr"):
                payload = outer.get(key)
                if not payload:
                    continue
                for inner_line in str(payload).splitlines():
                    try:
                        inner = json.loads(inner_line)
                    except Exception:
                        continue
                    if not isinstance(inner, dict):
                        continue
                    params = inner.get("params")
                    if not isinstance(params, dict):
                        continue
                    thread_id = params.get("threadId")
                    if thread_id:
                        thread_ids.add(thread_id)
    return thread_ids


def copy_vk_codex_state(vk_share: Path, vk_codex_home: Path, dest: Path):
    thread_ids = collect_vk_thread_ids(vk_share)
    for name in (
        "auth.json",
        "config.toml",
        "version.json",
        "history.jsonl",
        "session_index.jsonl",
        "state_5.sqlite",
        "state_5.sqlite-shm",
        "state_5.sqlite-wal",
        "logs_2.sqlite",
        "logs_2.sqlite-shm",
        "logs_2.sqlite-wal",
    ):
        copy_if_exists(vk_codex_home / name, dest / name)
    if thread_ids:
        session_files = []
        for thread_id in sorted(thread_ids):
            session_files.extend(vk_codex_home.joinpath("sessions").rglob(f"*{thread_id}*.jsonl"))
            session_files.extend(vk_codex_home.joinpath("shell_snapshots").glob(f"{thread_id}.*.sh"))
        for src in sorted({p for p in session_files if p.exists()}):
            rel = src.relative_to(vk_codex_home)
            dst = dest / rel
            dst.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(src, dst)
    write_text(dest / "thread_ids.json", json.dumps(sorted(thread_ids), indent=2) + "\n")


def git_ok(path: Path) -> bool:
    return run(["git", "rev-parse", "--is-inside-work-tree"], cwd=str(path)).returncode == 0


def bundle_local_only(path: Path, bundle_path: Path):
    remotes = run(["git", "remote"], cwd=str(path)).stdout.strip()
    if remotes:
        return run(
            [
                "git",
                "bundle",
                "create",
                str(bundle_path),
                "--branches",
                "--tags",
                "--not",
                "--remotes",
            ],
            cwd=str(path),
        )
    return run(["git", "bundle", "create", str(bundle_path), "--all"], cwd=str(path))


def backup_sqlite(src: Path, dst: Path):
    src_conn = sqlite3.connect(str(src))
    dst_conn = sqlite3.connect(str(dst))
    src_conn.backup(dst_conn)
    dst_conn.close()
    src_conn.close()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def archive_dir(src_dir: Path, tar_path: Path):
    with tarfile.open(tar_path, "w:gz") as tar:
        tar.add(src_dir, arcname=src_dir.name)


def utcnow() -> datetime.datetime:
    return datetime.datetime.now(UTC)


def parse_timestamp(ts: str) -> datetime.datetime:
    return datetime.datetime.strptime(ts, "%Y%m%dT%H%M%SZ").replace(tzinfo=UTC)


def extract_timestamp(name: str):
    match = TIMESTAMP_RE.match(name)
    return match.group(1) if match else None


def retention_bucket(ts: datetime.datetime, now: datetime.datetime):
    age = now - ts
    if age < datetime.timedelta(0):
        return ("future", ts.year, ts.month, ts.day, ts.hour, ts.minute)
    if age < datetime.timedelta(days=RETENTION_POLICY["hourly_for_days"]):
        return ("hourly", ts.year, ts.month, ts.day, ts.hour)
    if age < datetime.timedelta(days=RETENTION_POLICY["hourly_for_days"] + RETENTION_POLICY["every_6_hours_for_days"]):
        return ("six_hour", ts.year, ts.month, ts.day, ts.hour // 6)
    if age < datetime.timedelta(days=RETENTION_POLICY["hourly_for_days"] + RETENTION_POLICY["every_6_hours_for_days"] + RETENTION_POLICY["every_12_hours_for_days"]):
        return ("twelve_hour", ts.year, ts.month, ts.day, ts.hour // 12)
    if age < datetime.timedelta(days=RETENTION_POLICY["hourly_for_days"] + RETENTION_POLICY["every_6_hours_for_days"] + RETENTION_POLICY["every_12_hours_for_days"] + RETENTION_POLICY["daily_for_days"]):
        return ("daily", ts.year, ts.month, ts.day)
    if age < datetime.timedelta(days=RETENTION_POLICY["hourly_for_days"] + RETENTION_POLICY["every_6_hours_for_days"] + RETENTION_POLICY["every_12_hours_for_days"] + RETENTION_POLICY["daily_for_days"] + (RETENTION_POLICY["weekly_for_weeks"] * 7)):
        iso = ts.isocalendar()
        return ("weekly", iso.year, iso.week)
    if age < datetime.timedelta(days=RETENTION_POLICY["hourly_for_days"] + RETENTION_POLICY["every_6_hours_for_days"] + RETENTION_POLICY["every_12_hours_for_days"] + RETENTION_POLICY["daily_for_days"] + (RETENTION_POLICY["weekly_for_weeks"] * 7) + (RETENTION_POLICY["monthly_for_months"] * 31)):
        return ("monthly", ts.year, ts.month)
    return ("yearly", ts.year)


def select_retained_timestamps(timestamps, now: datetime.datetime):
    if not timestamps:
        return set()
    buckets = {}
    for ts in sorted(set(timestamps)):
        bucket = retention_bucket(parse_timestamp(ts), now)
        current = buckets.get(bucket)
        if current is None or ts > current:
            buckets[bucket] = ts
    keep = set(buckets.values())
    keep.update(sorted(set(timestamps))[-MIN_RECENT_SNAPSHOTS:])
    return keep


def replace_latest_pointer(pointer: Path, target: Path):
    if pointer.is_symlink() or pointer.exists():
        pointer.unlink()
    pointer.symlink_to(target)


def collect_local_backup_sets(backup_root: Path):
    sets = {}
    for path in backup_root.iterdir():
        if path.name in {LATEST_DIR_NAME, LATEST_TAR_NAME}:
            continue
        ts = extract_timestamp(path.name)
        if not ts:
            continue
        entry = sets.setdefault(ts, {})
        if path.name.endswith(".tar.gz"):
            entry["tar"] = path
        elif path.is_dir():
            entry["dir"] = path
    return sets


def prune_local_backups(backup_root: Path, now: datetime.datetime):
    sets = collect_local_backup_sets(backup_root)
    keep = select_retained_timestamps(list(sets.keys()), now)
    removed = []
    for ts, parts in sorted(sets.items()):
        if ts in keep:
            continue
        for kind in ("dir", "tar"):
            path = parts.get(kind)
            if not path:
                continue
            if path.is_dir() and not path.is_symlink():
                shutil.rmtree(path)
            elif path.exists() and not path.is_symlink():
                path.unlink()
            removed.append(str(path))
    return keep, removed


def parse_desktop_target(target: str):
    if ":" not in target:
        return None, None
    host, remote_dir = target.split(":", 1)
    remote_dir = remote_dir.rstrip("/\\")
    return host, remote_dir


def windows_remote_dir(remote_dir: str) -> str:
    return remote_dir.replace("/", "\\")


def windows_remote_full_dir(remote_dir: str) -> str:
    remote_dir_win = windows_remote_dir(remote_dir)
    return f"%USERPROFILE%\\{remote_dir_win}"


def ensure_remote_desktop_dir(host: str, remote_dir: str):
    remote_full_dir = windows_remote_full_dir(remote_dir)
    run(["ssh", host, "cmd", "/c", f'if not exist "{remote_full_dir}" mkdir "{remote_full_dir}"'], check=True)


def list_remote_desktop_archives(host: str, remote_dir: str):
    remote_full_dir = windows_remote_full_dir(remote_dir)
    result = run(
        [
            "ssh",
            host,
            "cmd",
            "/c",
            f'if exist "{remote_full_dir}" (dir /b "{remote_full_dir}\\{BACKUP_BASENAME}-*.tar.gz") else exit 0',
        ]
    )
    if result.returncode != 0:
        return []
    names = []
    for line in result.stdout.splitlines():
        line = line.strip()
        if not line or line == LATEST_TAR_NAME:
            continue
        if extract_timestamp(line):
            names.append(line)
    return names


def prune_remote_desktop_archives(host: str, remote_dir: str, now: datetime.datetime):
    names = list_remote_desktop_archives(host, remote_dir)
    timestamps = [extract_timestamp(name) for name in names]
    timestamps = [ts for ts in timestamps if ts]
    keep = select_retained_timestamps(timestamps, now)
    removed = []
    remote_full_dir = windows_remote_full_dir(remote_dir)
    for name in names:
        ts = extract_timestamp(name)
        if not ts or ts in keep:
            continue
        result = run(["ssh", host, "cmd", "/c", f'del /q "{remote_full_dir}\\{name}"'])
        if result.returncode == 0:
            removed.append(name)
    return keep, removed


def main():
    parser = argparse.ArgumentParser(description="Create a lean VK restore backup.")
    parser.add_argument("--backup-root", default=str(DEFAULT_BACKUP_ROOT))
    parser.add_argument("--vk-share", default=str(DEFAULT_VK_SHARE))
    parser.add_argument("--vk-codex-home", default=str(DEFAULT_VK_CODEX_HOME))
    parser.add_argument("--export-zip", default=str(DEFAULT_EXPORT_ZIP))
    parser.add_argument("--desktop-target", default=DEFAULT_DESKTOP_TARGET)
    parser.add_argument("--mirror-desktop", action="store_true")
    args = parser.parse_args()

    backup_root = Path(args.backup_root)
    vk_share = Path(args.vk_share)
    vk_codex_home = Path(args.vk_codex_home)
    export_zip = Path(args.export_zip)
    backup_root.mkdir(parents=True, exist_ok=True)

    ts = utcnow().strftime("%Y%m%dT%H%M%SZ")
    dest = backup_root / f"{BACKUP_BASENAME}-{ts}"
    (dest / "meta").mkdir(parents=True, exist_ok=True)
    (dest / "share-vibe-kanban").mkdir(parents=True, exist_ok=True)
    (dest / "systemd").mkdir(parents=True, exist_ok=True)
    (dest / "bin").mkdir(parents=True, exist_ok=True)
    (dest / "codex-home").mkdir(parents=True, exist_ok=True)
    (dest / "exports").mkdir(parents=True, exist_ok=True)
    (dest / "git").mkdir(parents=True, exist_ok=True)

    backup_sqlite(vk_share / "db.v2.sqlite", dest / "share-vibe-kanban" / "db.v2.sqlite")
    copy_if_exists(vk_share / "config.json", dest / "share-vibe-kanban" / "config.json")
    copy_if_exists(vk_share / "server_ed25519_signing_key", dest / "share-vibe-kanban" / "server_ed25519_signing_key")
    copy_if_exists(vk_share / "sessions", dest / "share-vibe-kanban" / "sessions")

    copy_vk_codex_state(vk_share, vk_codex_home, dest / "codex-home")

    copy_if_exists(Path("/home/mcp/.config/systemd/user/vibe-kanban.service"), dest / "systemd" / "vibe-kanban.service")
    copy_if_exists(Path("/home/mcp/.config/systemd/user/vibe-kanban.service.d"), dest / "systemd" / "vibe-kanban.service.d")
    for name in ("vibe-kanban-serve", "vibe-kanban-server-cleanfix", "vibe-kanban-server"):
        copy_if_exists(Path("/home/mcp/.local/bin") / name, dest / "bin" / name)

    if export_zip.exists():
        copy_if_exists(export_zip, dest / "exports" / export_zip.name)

    conn = sqlite3.connect(str(vk_share / "db.v2.sqlite"))
    cur = conn.cursor()
    projects = list(cur.execute("SELECT lower(hex(id)), name, COALESCE(default_agent_working_dir,'') FROM projects ORDER BY name"))
    workspaces = list(cur.execute("SELECT lower(hex(id)), COALESCE(name,''), COALESCE(container_ref,''), COALESCE(branch,''), COALESCE(lower(hex(task_id)),'') FROM workspaces WHERE archived=0 ORDER BY name"))
    task_count = cur.execute("SELECT COUNT(*) FROM tasks").fetchone()[0]
    conn.close()

    inventory = ["PROJECTS"]
    inventory.extend("|".join(map(str, row)) for row in projects)
    inventory.append("WORKSPACES")
    inventory.extend("|".join(map(str, row)) for row in workspaces)
    inventory.append("TASK_COUNT")
    inventory.append(str(task_count))
    write_text(dest / "meta" / "db-inventory.txt", "\n".join(inventory) + "\n")

    paths = set()
    for _, _, path in projects:
        if path:
            paths.add(path)
    for _, _, path, _, _ in workspaces:
        if path:
            paths.add(path)

    common_dir_bundles = {}
    manifest = []
    for raw_path in sorted(paths):
        repo_path = Path(raw_path)
        if not repo_path.exists() or not git_ok(repo_path):
            continue
        slug = raw_path.strip("/").replace("/", "__")
        meta_dir = dest / "git" / slug
        meta_dir.mkdir(parents=True, exist_ok=True)

        def git_out(name, cmd):
            result = run(cmd, cwd=str(repo_path))
            content = result.stdout
            if result.stderr:
                content += "\nERR:\n" + result.stderr
            write_text(meta_dir / name, content)
            return result

        head = git_out("head.txt", ["git", "rev-parse", "HEAD"]).stdout.strip()
        branch = git_out("branch.txt", ["git", "rev-parse", "--abbrev-ref", "HEAD"]).stdout.strip()
        common_dir_raw = run(["git", "rev-parse", "--git-common-dir"], cwd=str(repo_path)).stdout.strip()
        common_dir_path = Path(common_dir_raw)
        if not common_dir_path.is_absolute():
            common_dir_path = (repo_path / common_dir_path).resolve()
        common_dir = str(common_dir_path)
        write_text(meta_dir / "common-dir.txt", common_dir + "\n")
        git_out("show-toplevel.txt", ["git", "rev-parse", "--show-toplevel"])
        git_out("status.txt", ["git", "status", "--short", "--branch"])
        git_out("remotes.txt", ["git", "remote", "-v"])
        git_out("stash.txt", ["git", "stash", "list"])
        git_out("worktree-list.txt", ["git", "worktree", "list", "--porcelain"])
        write_text(meta_dir / "working.diff", run(["git", "diff", "--binary"], cwd=str(repo_path)).stdout)
        write_text(meta_dir / "staged.diff", run(["git", "diff", "--cached", "--binary"], cwd=str(repo_path)).stdout)

        untracked = run(["git", "ls-files", "--others", "--exclude-standard", "-z"], cwd=str(repo_path)).stdout
        if untracked:
            untracked_dir = meta_dir / "untracked"
            untracked_dir.mkdir(exist_ok=True)
            for rel in [p for p in untracked.split("\x00") if p]:
                src = repo_path / rel
                dst = untracked_dir / rel
                dst.parent.mkdir(parents=True, exist_ok=True)
                if src.is_file():
                    shutil.copy2(src, dst)

        stash_lines = run(["git", "stash", "list"], cwd=str(repo_path)).stdout.strip().splitlines()
        if stash_lines:
            stash_dir = meta_dir / "stash"
            stash_dir.mkdir(exist_ok=True)
            for idx, line in enumerate(stash_lines):
                ref = line.split(":", 1)[0]
                patch = run(["git", "stash", "show", "-p", ref], cwd=str(repo_path)).stdout
                safe_ref = ref.replace("/", "_").replace(":", "_")
                write_text(stash_dir / f"{idx:02d}-{safe_ref}.patch", patch)

        if common_dir not in common_dir_bundles:
            bundle_slug = common_dir.strip("/").replace("/", "__")
            bundle_path = dest / "git" / f"{bundle_slug}.local-only.bundle"
            result = bundle_local_only(repo_path, bundle_path)
            if result.returncode != 0 or not bundle_path.exists() or bundle_path.stat().st_size == 0:
                if bundle_path.exists():
                    bundle_path.unlink()
                write_text(dest / "git" / f"{bundle_slug}.bundle.log", (result.stdout or "") + (result.stderr or ""))
                common_dir_bundles[common_dir] = ""
            else:
                common_dir_bundles[common_dir] = str(bundle_path.relative_to(dest))

        manifest.append({
            "path": raw_path,
            "head": head,
            "branch": branch,
            "common_dir": common_dir,
            "meta_dir": str(meta_dir.relative_to(dest)),
            "bundle": common_dir_bundles.get(common_dir, ""),
        })

    write_text(dest / "meta" / "workspace-git-manifest.json", json.dumps(manifest, indent=2) + "\n")
    write_text(dest / "meta" / "manifest.txt", "\n".join([
        "backup_type=vk-lean-restore",
        f"created_utc={ts}",
        "description=Local VK state, isolated VK Codex continuity state, plus local-only git/workspace recovery data; excludes full repo copies and build caches assumed recoverable from GitHub",
    ]) + "\n")

    files = []
    for root, _, names in os.walk(dest):
        for name in names:
            files.append(Path(root) / name)
    files.sort()
    with open(dest / "meta" / "SHA256SUMS", "w") as out:
        for file_path in files:
            if file_path.name == "SHA256SUMS":
                continue
            out.write(f"{sha256_file(file_path)}  {file_path}\n")

    tar_path = backup_root / f"{dest.name}.tar.gz"
    archive_dir(dest, tar_path)
    write_text(dest / "meta" / "archive.txt", str(tar_path) + "\n")

    replace_latest_pointer(backup_root / LATEST_DIR_NAME, dest)
    replace_latest_pointer(backup_root / LATEST_TAR_NAME, tar_path)

    if args.mirror_desktop:
        host, remote_dir = parse_desktop_target(args.desktop_target)
        if not host or not remote_dir:
            raise RuntimeError(f"invalid desktop target: {args.desktop_target}")
        ensure_remote_desktop_dir(host, remote_dir)
        mirror = run(["scp", "-q", str(tar_path), f"{host}:{remote_dir}/{tar_path.name}"])
        if mirror.returncode != 0:
            raise RuntimeError(f"desktop mirror failed:\n{mirror.stderr}")
        mirror_latest = run(["scp", "-q", str(tar_path), f"{host}:{remote_dir}/{LATEST_TAR_NAME}"])
        if mirror_latest.returncode != 0:
            raise RuntimeError(f"desktop latest mirror failed:\n{mirror_latest.stderr}")
        remote_keep, remote_removed = prune_remote_desktop_archives(host, remote_dir, utcnow())
        write_text(dest / "meta" / "desktop-retention.txt", json.dumps({
            "policy": RETENTION_POLICY,
            "kept_timestamps": sorted(remote_keep),
            "removed_archives": remote_removed,
        }, indent=2) + "\n")

    local_keep, local_removed = prune_local_backups(backup_root, utcnow())
    write_text(dest / "meta" / "retention.txt", json.dumps({
        "policy": RETENTION_POLICY,
        "kept_timestamps": sorted(local_keep),
        "removed_paths": local_removed,
    }, indent=2) + "\n")

    print(dest)
    print(tar_path)


if __name__ == "__main__":
    main()
