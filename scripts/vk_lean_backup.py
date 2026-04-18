#!/usr/bin/env python3
import argparse
import datetime
import hashlib
import json
import os
import shutil
import sqlite3
import subprocess
import tarfile
from pathlib import Path

DEFAULT_VK_SHARE = Path("/home/mcp/.local/share/vibe-kanban")
DEFAULT_BACKUP_ROOT = Path("/home/mcp/backups")
DEFAULT_EXPORT_ZIP = Path("/home/mcp/backups/vibe-kanban-export-2026-04-18.zip")
DEFAULT_DESKTOP_TARGET = "desktop:Desktop/vk-backups/"

def run(cmd, cwd=None, check=False):
    result = subprocess.run(cmd, cwd=cwd, text=True, capture_output=True)
    if check and result.returncode != 0:
        raise RuntimeError(f"command failed: {' '.join(cmd)}\n{result.stdout}\n{result.stderr}")
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

def git_ok(path: Path) -> bool:
    return run(["git", "rev-parse", "--is-inside-work-tree"], cwd=str(path)).returncode == 0

def bundle_local_only(path: Path, bundle_path: Path):
    remotes = run(["git", "remote"], cwd=str(path)).stdout.strip()
    if remotes:
        return run(["git", "bundle", "create", str(bundle_path), "--branches", "--tags", "--not", "--remotes"], cwd=str(path))
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

def main():
    parser = argparse.ArgumentParser(description="Create a lean VK restore backup.")
    parser.add_argument("--backup-root", default=str(DEFAULT_BACKUP_ROOT))
    parser.add_argument("--vk-share", default=str(DEFAULT_VK_SHARE))
    parser.add_argument("--export-zip", default=str(DEFAULT_EXPORT_ZIP))
    parser.add_argument("--desktop-target", default=DEFAULT_DESKTOP_TARGET)
    parser.add_argument("--mirror-desktop", action="store_true")
    args = parser.parse_args()

    backup_root = Path(args.backup_root)
    vk_share = Path(args.vk_share)
    export_zip = Path(args.export_zip)

    ts = datetime.datetime.utcnow().strftime("%Y%m%dT%H%M%SZ")
    dest = backup_root / f"vk-lean-restore-{ts}"
    (dest / "meta").mkdir(parents=True, exist_ok=True)
    (dest / "share-vibe-kanban").mkdir(parents=True, exist_ok=True)
    (dest / "systemd").mkdir(parents=True, exist_ok=True)
    (dest / "bin").mkdir(parents=True, exist_ok=True)
    (dest / "exports").mkdir(parents=True, exist_ok=True)
    (dest / "git").mkdir(parents=True, exist_ok=True)

    backup_sqlite(vk_share / "db.v2.sqlite", dest / "share-vibe-kanban" / "db.v2.sqlite")
    copy_if_exists(vk_share / "config.json", dest / "share-vibe-kanban" / "config.json")
    copy_if_exists(vk_share / "server_ed25519_signing_key", dest / "share-vibe-kanban" / "server_ed25519_signing_key")
    copy_if_exists(vk_share / "sessions", dest / "share-vibe-kanban" / "sessions")

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
        "description=Local VK state plus local-only git/workspace recovery data; excludes full repo copies and build caches assumed recoverable from GitHub",
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

    if args.mirror_desktop:
        run(["ssh", "desktop", "cmd", "/c", "if", "not", "exist", "C:\\Users\\mcp.ART-IN-FLIGHT-D\\Desktop\\vk-backups", "mkdir", "C:\\Users\\mcp.ART-IN-FLIGHT-D\\Desktop\\vk-backups"])
        mirror = run(["scp", "-q", str(tar_path), args.desktop_target])
        if mirror.returncode != 0:
            raise RuntimeError(f"desktop mirror failed:\n{mirror.stderr}")

    print(dest)
    print(tar_path)

if __name__ == "__main__":
    main()
