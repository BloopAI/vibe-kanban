#!/usr/bin/env bash
# ─ load up your Rust/Cargo from ~/.cargo/env ─
if [ -f "$HOME/.cargo/env" ]; then
  # this is where `cargo` typically lives 
  source "$HOME/.cargo/env"
fi

# now run both checks
cargo check --workspace --message-format=json "$@"
cargo check --workspace --message-format=json --features cloud "$@"

# Add this to .vscode/settings.json to lint both cloud and non-cloud
# {
#     // rust-analyzer will still do its usual code‑lens, inlay, etc. based
#     // on whatever "cargo.features" you pick here (can be [] for no-features,
#     // or ["foo"] for a specific feature).
#     "rust-analyzer.cargo.features": [],
#     // overrideCommand must emit JSON diagnostics. We're just calling our
#     // script which in turn calls cargo twice.
#     "rust-analyzer.check.overrideCommand": [
#         "${workspaceFolder}/check-both.sh"
#     ]
# }