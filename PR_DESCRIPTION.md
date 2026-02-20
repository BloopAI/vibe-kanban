## Description

Add support for [Moonshot AI's Kimi CLI](https://github.com/MoonshotAI/kimi-cli) as a new coding agent executor.

Kimi CLI is a powerful AI coding assistant that supports the Agent Client Protocol (ACP), enabling seamless integration with Vibe Kanban's existing architecture.

## Features

- **ACP Mode Support** - Uses `kimi acp` for programmatic interaction (similar to Gemini)
- **Configuration Options**:
  - Model selection (kimi-k2, kimi-k2.5)
  - Agent type (default, okabe, custom)
  - Skills loading
  - Custom agent file
  - YOLO mode (auto-approve)
- **Availability Detection** - Automatically detects if Kimi CLI is installed and authenticated via `~/.kimi/credentials/`
- **Session Management** - Uses `AcpAgentHarness` with "kimi_sessions" namespace
- **MCP Support** - Reads MCP config from `~/.kimi/mcp.json`

## Changes

### New Files
- `crates/executors/src/executors/kimi.rs` - Kimi executor implementation
- `frontend/public/agents/kimi-light.svg` - Kimi icon (light mode)
- `frontend/public/agents/kimi-dark.svg` - Kimi icon (dark mode)
- `shared/schemas/kimi.json` - JSON schema for Kimi configuration

### Modified Files
- `crates/executors/src/executors/mod.rs` - Register Kimi executor
- `crates/executors/src/mcp_config.rs` - Add Kimi to MCP config
- `crates/executors/default_profiles.json` - Add default Kimi profile
- `crates/server/src/bin/generate_types.rs` - Add Kimi type generation
- `frontend/src/components/agents/AgentIcon.tsx` - Add Kimi icon support

## Testing

- [x] `cargo check -p executors` passes
- [x] `cargo clippy -p executors` passes (no warnings)
- [x] `cargo test -p executors` passes (35 tests)
- [x] API endpoints work correctly:
  - `GET /api/agents/check-availability?executor=KIMI` returns `LOGIN_DETECTED`
  - `GET /api/agents/preset-options?executor=KIMI` returns correct defaults
- [x] Frontend displays Kimi in agent selector with icons

## Technical Details

**Command Structure:**
```rust
// Uses ACP mode
kimi acp
```

**Availability Detection:**
- Checks for `kimi` binary in PATH
- Verifies authentication via `~/.kimi/credentials/` directory

**Default Configuration:**
```json
{
  "KIMI": {
    "model": "kimi-k2",
    "yolo": true
  }
}
```

## References

- [Kimi CLI GitHub](https://github.com/MoonshotAI/kimi-cli)
- [Kimi CLI Documentation](https://moonshotai.github.io/kimi-cli/)
- [ACP Protocol](https://github.com/agentclientprotocol/agent-client-protocol)

## Related

Follows the same pattern as other executor additions like Droid (#1318) and Copilot.

---

**Checklist:**
- [x] Code follows project style guidelines (`cargo fmt`, `cargo clippy`)
- [x] Tests pass (`cargo test --workspace`)
- [x] TypeScript types generated (`pnpm run generate-types`)
- [x] JSON schema added (`shared/schemas/kimi.json`)
- [x] Frontend icons added
- [x] Default profile configured
