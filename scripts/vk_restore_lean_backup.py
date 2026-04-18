#!/usr/bin/env python3
import argparse
import json
import shutil
import subprocess
import tarfile
from pathlib import Path

def run(cmd, cwd=None, check=False):
    result = subprocess.run(cmd, cwd=cwd, text=True, capture_output=True)
    if check and result.returncode != 0:
        raise RuntimeError(f"command failed: {' '.join(cmd)}\n{result.stdout}\n{result.stderr}")
    return result

def write_text(path: Path, content: str):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content)

def extract_if_needed(src: Path, work_root: Path) -> Path:
    if src.is_dir():
        return src
    if src.suffixes[-2:] == [".tar", ".gz"]:
        with tarfile.open(src, "r:gz") as tar:
            tar.extractall(work_root)
        return work_root / src.name[:-7]
    raise RuntimeError(f"unsupported backup input: {src}")

def apply_diff(repo_path: Path, diff_path: Path, staged=False):
    if not diff_path.exists() or diff_path.stat().st_size == 0:
        return
    cmd = ["git", "apply", "--whitespace=nowarn"]
    if staged:
        cmd.insert(2, "--index")
    cmd.append(str(diff_path))
    run(cmd, cwd=str(repo_path), check=True)

def ensure_repo(path: Path, remote_url: str):
    if path.exists() and (path / ".git").exists():
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    run(["git", "clone", remote_url, str(path)], check=True)

def main():
    parser = argparse.ArgumentParser(description="Restore VK from a lean backup plus GitHub.")
    parser.add_argument("backup", help="Backup directory or .tar.gz archive")
    parser.add_argument("--work-root", default="/home/mcp/backups/restore-work")
    args = parser.parse_args()

    backup_src = Path(args.backup)
    work_root = Path(args.work_root)
    work_root.mkdir(parents=True, exist_ok=True)
    backup_dir = extract_if_needed(backup_src, work_root)

    share_dir = Path("/home/mcp/.local/share/vibe-kanban")
    systemd_dir = Path("/home/mcp/.config/systemd/user")
    bin_dir = Path("/home/mcp/.local/bin")

    run(["systemctl", "--user", "stop", "vibe-kanban.service"], check=True)

    share_dir.mkdir(parents=True, exist_ok=True)
    for name in ["db.v2.sqlite", "config.json", "server_ed25519_signing_key"]:
        src = backup_dir / "share-vibe-kanban" / name
        if src.exists():
            shutil.copy2(src, share_dir / name)
    sessions = backup_dir / "share-vibe-kanban" / "sessions"
    if sessions.exists():
        if (share_dir / "sessions").exists():
            shutil.rmtree(share_dir / "sessions")
        shutil.copytree(sessions, share_dir / "sessions")

    service_file = backup_dir / "systemd" / "vibe-kanban.service"
    if service_file.exists():
        systemd_dir.mkdir(parents=True, exist_ok=True)
        shutil.copy2(service_file, systemd_dir / "vibe-kanban.service")
    service_dropins = backup_dir / "systemd" / "vibe-kanban.service.d"
    if service_dropins.exists():
        dst = systemd_dir / "vibe-kanban.service.d"
        if dst.exists():
            shutil.rmtree(dst)
        shutil.copytree(service_dropins, dst)

    if (backup_dir / "bin").exists():
        bin_dir.mkdir(parents=True, exist_ok=True)
        for file_path in (backup_dir / "bin").iterdir():
            if file_path.is_file():
                shutil.copy2(file_path, bin_dir / file_path.name)

    manifest = json.loads((backup_dir / "meta" / "workspace-git-manifest.json").read_text())
    grouped = {}
    for item in manifest:
        grouped.setdefault(item["common_dir"], []).append(item)

    for common_dir, items in grouped.items():
        base_repo = Path(common_dir).parent
        representative = items[0]
        meta_dir = backup_dir / representative["meta_dir"]
        remotes = (meta_dir / "remotes.txt").read_text().splitlines()
        fetch_url = ""
        for line in remotes:
            parts = line.split()
            if len(parts) >= 3 and parts[2] == "(fetch)":
                fetch_url = parts[1]
                break
        if fetch_url:
            ensure_repo(base_repo, fetch_url)
            run(["git", "fetch", "--all", "--tags"], cwd=str(base_repo), check=True)

        bundle_rel = representative.get("bundle") or ""
        if bundle_rel:
            bundle_path = backup_dir / bundle_rel
            if bundle_path.exists():
                run(["git", "fetch", str(bundle_path), "refs/*:refs/*"], cwd=str(base_repo), check=True)

        for item in items:
            repo_path = Path(item["path"])
            branch = item["branch"]
            head = item["head"]
            meta = backup_dir / item["meta_dir"]
            repo_path.parent.mkdir(parents=True, exist_ok=True)

            if repo_path != base_repo and not repo_path.exists():
                exists = run(["git", "show-ref", "--verify", f"refs/heads/{branch}"], cwd=str(base_repo))
                if exists.returncode == 0:
                    run(["git", "worktree", "add", str(repo_path), branch], cwd=str(base_repo), check=True)
                else:
                    run(["git", "worktree", "add", "-b", branch, str(repo_path), head], cwd=str(base_repo), check=True)

            if repo_path.exists():
                untracked_dir = meta / "untracked"
                if untracked_dir.exists():
                    for src in untracked_dir.rglob("*"):
                        if src.is_file():
                            rel = src.relative_to(untracked_dir)
                            dst = repo_path / rel
                            dst.parent.mkdir(parents=True, exist_ok=True)
                            shutil.copy2(src, dst)
                apply_diff(repo_path, meta / "staged.diff", staged=True)
                apply_diff(repo_path, meta / "working.diff", staged=False)

    run(["systemctl", "--user", "daemon-reload"], check=True)
    run(["systemctl", "--user", "start", "vibe-kanban.service"], check=True)
    write_text(work_root / "last-vk-restore.txt", f"restored_from={backup_dir}\n")
    print(backup_dir)

if __name__ == "__main__":
    main()
