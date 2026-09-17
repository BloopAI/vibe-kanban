# crates/remote/starter

Opinionated one-command bootstrap for running a local self-hosted Vibe Kanban
remote (Postgres + Electric + remote-server) on top of
`crates/remote/docker-compose.yml`, with a frontend app pointed at it.

Single-user, local-only. Bootstrap admin login (no OAuth wiring required).
Layered on top of upstream compose via `-f` overrides — does not modify the
base `docker-compose.yml`.

## Prerequisites

- Docker Engine with the `compose` plugin (Docker Desktop, OrbStack, Colima,
  Rancher Desktop, or a plain `docker.io` install). `docker compose version`
  should print `v2.x`.
- `make`, `bash`, `git`, `openssl`, `sed`, `grep` — standard on Linux and
  macOS, available via your package manager.
- Windows: run from WSL.

## Quickstart

```bash
cd crates/remote/starter
make start
```

`make start` detects there's no `.env.remote` yet, prompts to run setup,
generates secrets, brings docker up, and launches the frontend app pointed at
your local backend. First build is ~10-15 min (Rust + Vite frontend); restarts
are seconds.

When it's up you'll have:

- **Backend** at `http://localhost:13000` (configurable). Bootstrap admin
  credentials are printed to the terminal and persisted in `<repo>/.env.remote`.
- **Frontend app** at `http://localhost:13333` (configurable), running in the
  foreground. Ctrl+C exits the app; docker stays up. `make stop` to take the
  backend down.
- **Postgres + Electric** data bind-mounted to `~/vibe-kanban-data` (or
  wherever you pointed `SELFHOST_DATA_DIR`).

## Defaults

Defaults are picked to avoid common port conflicts. Hyper-V / WSL2 can
dynamically reserve `3000-3009` and `5432-5433` at boot, so the starter
defaults to ports outside those ranges:

| | default |
|---|---|
| Backend host port | `13000` |
| Frontend host port | `13333` |
| Postgres host port | `15433` |
| Data dir | `$HOME/vibe-kanban-data` |
| Admin email | `admin@local` |
| Admin password | randomly generated, in `.env.remote` |

Everything is overridable interactively at setup time or by editing
`.env.remote` after the fact.

## Make targets

| target | what it does |
|---|---|
| `make setup` | Prompts for ports / data dir / admin email. Generates JWT + admin password. Writes `<repo>/.env.remote`. Idempotent — preserves existing secrets. |
| `make start` | `up` + launch the frontend app in the foreground. Prompts to run setup first if needed. |
| `make up` | Bring docker up only. Useful from a second terminal. |
| `make stop` | `docker compose down` |
| `make restart` | stop + up (docker only, doesn't re-spawn the frontend app) |
| `make rebuild` | `up -d --build` — picks up upstream code or compose changes |
| `make logs` | tail `remote-server` logs |
| `make status` | `docker compose ps` |
| `make backup` | `pg_dump` into `$SELFHOST_DATA_DIR/backups/backup-<timestamp>.sql` |
| `make clean` | Destroy volumes + data dir + `.env.remote` (asks for confirmation) |

`./setup.sh -y` skips all prompts and uses defaults — handy for CI or
re-provisioning.

## Files in this directory

| file | purpose |
|---|---|
| `Makefile` | User-facing entry point. Layers the four compose files for every docker call. |
| `setup.sh` | One-shot configurator. Writes `<repo>/.env.remote` and runs `docker compose config` to validate the merge. |
| `env.remote.template` | Template with `__PLACEHOLDERS__` filled in by `setup.sh`. |
| `docker-compose.override.yml` | Bind-mounts `postgres/` and `electric/` data dirs under `SELFHOST_DATA_DIR`. |
| `docker-compose.ports.yml` | Pins host ports to safer defaults via `REMOTE_SERVER_PORT`, `REMOTE_DB_PORT`. |
| `docker-compose.no-ssh.yml` | Removes upstream's build-time SSH agent forwarding — not needed when `FEATURES` is empty, and fails on machines without an SSH agent. |

## Caveats

- **No OAuth.** Single shared bootstrap credential pair. Configure OAuth in
  `.env.remote` if you need multi-user.
- **No relay / tunnel.** The frontend app on `FRONTEND_PORT` talks to the
  backend on `REMOTE_SERVER_PORT` directly. Other machines on your network
  cannot reach your instance.
- **Attachments disabled.** The Azurite profile is not enabled here. Issue
  attachments won't work until you enable that profile and add the env vars.

## Troubleshooting

**Electric can't connect on first boot.** Expected — the remote server creates
the `electric_sync` Postgres role on first startup, Electric retries until it
succeeds. Wait ~30s or `make logs` and watch.

**Frontend app shows the hosted-cloud data instead of local.** Sign out of the
old cloud account first, quit the app. `make start` always launches with
`VK_SHARED_API_BASE` pointed at your local backend.

**Want a fresh start.** `make clean` tears everything down (asks first), then
`make start` re-provisions from scratch.

**Existing port collision.** Edit `REMOTE_SERVER_PORT`, `FRONTEND_PORT`, or
`REMOTE_DB_PORT` in `.env.remote` and `make restart`.
