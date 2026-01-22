# Vibe Kanban k3d Runbook

This README documents the local k3d setup used to run Vibe Kanban with an
OpenCode executor. It captures the exact manifests, mounts, and workflows
required to reproduce the environment.

## Scope
- Local k3d cluster (OrbStack)
- Vibe Kanban running in namespace `vibe-kanban`
- OpenCode installed via init container and exposed to the app container
- Local repositories mounted into the pod for worktree creation

## Prerequisites
- k3d cluster named `pet`
- `kubectl` configured to use the `k3d-pet` context
- Docker image `vibe-kanban:local` built from repo root
- Host directories mounted into the k3d node

## Key paths
Host paths (k3d node mounts):
- `/var/lib/rancher/k3s/persist/opencode-config`
- `/var/lib/rancher/k3s/persist/opencode-data`
- `/var/lib/rancher/k3s/persist/vk-repos`

Pod paths:
- OpenCode binary: `/opt/opencode/bin/opencode`
- Vibe Kanban data: `/home/appuser/.local/share/vibe-kanban`
- OpenCode config: `/mnt/xdg-config/opencode` (read-only)
- OpenCode data: `/mnt/xdg-data/opencode` (read-write)
- Repos: `/repos`

## Deployment manifest
The captured deployment is committed here:
- `k3d/vibe-kanban-deployment.yaml`

Apply it with:
```bash
kubectl apply -f k3d/vibe-kanban-deployment.yaml
```

## Build + deploy
Use the Make targets from repo root:
```bash
make vk-rebuild
```

Targets:
- `vk-build`: build `vibe-kanban:local`
- `vk-import`: import image into k3d
- `vk-restart`: restart deployment
- `vk-rebuild`: build + import + restart

## OpenCode executor
OpenCode is installed in an init container and wrapped so Vibe Kanban can
invoke it as a local binary.

Wrapper behavior:
- Sets XDG paths used by OpenCode
- Executes `/opt/opencode/bin/opencode-real`

Profiles override:
- Stored at `/home/appuser/.local/share/vibe-kanban/profiles.json`
- Use `base_command_override` to ensure VK calls `/opt/opencode/bin/opencode`

Example:
```json
{
  "executors": {
    "OPENCODE": {
      "DEFAULT": {
        "OPENCODE": {
          "base_command_override": "/opt/opencode/bin/opencode"
        }
      }
    }
  }
}
```

## Repo management
Repos must exist inside the container for worktrees.

Workflow:
1) Clone or copy repos into `/var/lib/rancher/k3s/persist/vk-repos/<name>`
2) Add the repo in the UI using `/repos/<name>`

Example:
```bash
cp -R /path/to/repo /var/lib/rancher/k3s/persist/vk-repos/my-repo
```

## API quick checks
```bash
curl -s http://vibe-kanban.localtest.me/api/projects
curl -s http://vibe-kanban.localtest.me/api/profiles
```

## Troubleshooting
- Worktree failures: ensure `git` is installed in the runtime image.
- Executor failures: verify `/api/profiles` shows `base_command_override`.
- Missing repos: confirm `/repos/<name>` exists in the pod.

## Notes
- OpenCode config is read-only, data is read-write.
- OAuth credentials are not stored in VK by default; check your OpenCode data
  directory if you need auth continuity.
