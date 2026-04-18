# 2026-04-18 Adversarial Review

Excluding `crates/remote`, these are the findings left:

- **Token-in-query-string auth still remains** for local log websocket access. The server supports `?token=` in [crates/server/src/routes/execution_processes.rs](/data/Code/vk-swarm/crates/server/src/routes/execution_processes.rs:61), and the frontend builds those URLs in [frontend/src/lib/api/logs.ts](/data/Code/vk-swarm/frontend/src/lib/api/logs.ts:61). Impact: token leakage via URLs/logs/history. Best practice: headers/cookies or websocket subprotocol, not URL params.

- **Terminal tmux support is effectively unfinished/disabled.** [crates/services/src/services/terminal_session.rs](/data/Code/vk-swarm/crates/services/src/services/terminal_session.rs:166) hard-disables tmux because capture is broken. Impact: advertised persistence path is not actually live; behavior is fallback-only. Best practice: either fully wire and test tmux, or remove it as a supported mode.

- **Committed internal environment URLs/IPs** still exist in repo docs at [.claude/commands/cc/start.md](/data/Code/vk-swarm/.claude/commands/cc/start.md:85). Impact: internal topology leakage and poor repo hygiene. Best practice: replace with placeholders or move to local-only docs.

- **Feature degradation via env misconfiguration is too soft.** [crates/local-deployment/src/lib.rs](/data/Code/vk-swarm/crates/local-deployment/src/lib.rs:274) and [same file](/data/Code/vk-swarm/crates/local-deployment/src/lib.rs:307) disable important features when env is incomplete. Impact: partial deployments can look “up” but have broken cross-node/auth behavior. Best practice: fail fast on invalid config or expose hard health failures.

- **Some public model fields are still placeholders/non-wired.** Examples: [crates/services/src/services/hive_sync.rs](/data/Code/vk-swarm/crates/services/src/services/hive_sync.rs:355) sets `executor_variant: None`, and [crates/db/src/models/task/queries.rs](/data/Code/vk-swarm/crates/db/src/models/task/queries.rs:125) hardcodes `has_merged_attempt: false`. Impact: incorrect API/UI state. Best practice: either wire the field end-to-end or remove it until supported.

So after removing `crates/remote`, the biggest remaining issues are URL-based token auth, unfinished terminal infrastructure, committed internal ops data, soft-fail config handling, and placeholder API fields.
