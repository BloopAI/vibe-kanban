# Baseline Regression Artifacts (2025-09-21)

## Commands Captured
- `cargo test --workspace` → `docs/regression/logs/cargo-test-workspace.log`
- `pnpm run check` → `docs/regression/logs/pnpm-run-check.log`
- `pnpm install` → `docs/regression/logs/pnpm-install.log`
- `pnpm run build:npx` → `docs/regression/logs/pnpm-run-build-npx.log`
- `pnpm run build` *(expected failure: missing script)* → `docs/regression/logs/pnpm-run-build.log`

All commands executed from repo root on branch `restructure/upstream-as-library-migration` at commit `781fc66c117f11a7e68ef97eab1fb22e1fd3a7ad`.

## Snapshot Assets
- Repository fixtures copied to `dev_assets_seed/forge-snapshot/from_repo/`
- Personal snapshot **not** committed; populate `dev_assets_seed/forge-snapshot/from_home/` locally via `./scripts/collect-forge-snapshot.sh` (defaults to `~/.automagik-forge`). The directory stays git-ignored to avoid secrets and large binaries.

See `docs/regression/baseline/checksums.txt` for SHA256 fingerprints of the committed artifacts. Compute hashes for your local snapshot as needed once copied.
