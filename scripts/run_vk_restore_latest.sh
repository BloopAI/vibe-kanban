#!/usr/bin/env bash
set -euo pipefail
cd /home/mcp/_vibe_kanban_repo
python3 scripts/vk_restore_lean_backup.py /home/mcp/backups/vk-lean-restore-latest.tar.gz
