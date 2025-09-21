# Forge Snapshot Seed

`from_repo/` contains seed data safe to commit (default config + lightweight DB used by tests).

`from_home/` is intentionally excluded from version control because it may hold large SQLite files and personal secrets. Populate it locally before running the regression harness by executing `scripts/collect-forge-snapshot.sh`.

```
# copies ~/.automagik-forge into dev_assets_seed/forge-snapshot/from_home/
./scripts/collect-forge-snapshot.sh
```

The regression docs reference SHA256 hashes for the committed assets. For your local snapshot, run `shasum -a 256` (or `sha256sum`) if you need to compare against recorded values.
