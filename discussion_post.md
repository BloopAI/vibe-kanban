# Feature Proposal: Add Kimi CLI Executor Support

## Overview

I would like to propose adding support for [Moonshot AI's Kimi CLI](https://github.com/MoonshotAI/kimi-cli) as a new coding agent executor in Vibe Kanban. Kimi CLI is a powerful AI coding assistant that supports the Agent Client Protocol (ACP), making it a great fit for Vibe Kanban's architecture.

## Motivation

Kimi CLI is gaining popularity among developers, particularly in the Chinese-speaking community, as a capable alternative to other AI coding agents. Adding support for Kimi would:

1. **Expand user choice** - Give users more options for AI coding agents
2. **Leverage ACP protocol** - Kimi supports ACP mode, enabling seamless integration with Vibe Kanban's existing architecture
3. **Support for Kimi models** - Access to kimi-k2, kimi-k2.5 and future models
4. **Community growth** - Attract users who prefer Kimi CLI

## Implementation

I have implemented a working prototype with the following features:

### Core Features
- ✅ **ACP Mode Support** - Uses `kimi acp` for programmatic interaction
- ✅ **Configuration Options**:
  - Model selection (kimi-k2, kimi-k2.5)
  - Agent type (default, okabe, custom)
  - Skills loading
  - Custom agent file
  - YOLO mode (auto-approve)
- ✅ **Availability Detection** - Automatically detects if Kimi CLI is installed and authenticated
- ✅ **Session Management** - Uses AcpAgentHarness with "kimi_sessions" namespace
- ✅ **MCP Support** - Reads MCP config from `~/.kimi/mcp.json`

### Files Added/Modified
```
crates/executors/src/executors/kimi.rs          # New: Kimi executor implementation
crates/executors/src/executors/mod.rs           # Modified: Register Kimi executor
crates/executors/src/mcp_config.rs              # Modified: Add Kimi to MCP config
crates/executors/default_profiles.json          # Modified: Add default Kimi profile
crates/server/src/bin/generate_types.rs         # Modified: Add Kimi type generation
frontend/src/components/agents/AgentIcon.tsx    # Modified: Add Kimi icon support
frontend/public/agents/kimi-light.svg           # New: Kimi light mode icon
frontend/public/agents/kimi-dark.svg            # New: Kimi dark mode icon
shared/schemas/kimi.json                        # New: Kimi JSON schema
```

### Technical Details

**Command Structure:**
```rust
// Uses ACP mode similar to Gemini
kimi acp
```

**Availability Detection:**
- Checks for `kimi` binary in PATH
- Verifies authentication via `~/.kimi/credentials/` directory

**Session Management:**
- Uses `AcpAgentHarness` for standardized session handling
- Session namespace: `"kimi_sessions"`
- Supports session forking and resumption

**Configuration:**
```json
{
  "KIMI": {
    "model": "kimi-k2",
    "agent": "default",
    "skills": ["skill1", "skill2"],
    "agent_file": "/path/to/custom/agent.yaml",
    "yolo": true
  }
}
```

## Testing

I have tested the implementation locally:

1. ✅ **Compilation** - `cargo check -p executors` passes
2. ✅ **Clippy** - No warnings
3. ✅ **Tests** - All 35 executor tests pass
4. ✅ **API Endpoints**:
   - `GET /api/agents/check-availability?executor=KIMI` - Returns `LOGIN_DETECTED`
   - `GET /api/agents/preset-options?executor=KIMI` - Returns correct defaults
5. ✅ **Frontend** - Kimi appears in agent selector with icons

## Screenshots

*Will attach screenshots of the Kimi integration in action*

## Future Enhancements

Potential improvements that could be added in follow-up PRs:

1. **Multi-Kimi Collaboration** - Support for multiple Kimi instances with different roles (architect, backend, frontend)
2. **Advanced Configuration** - UI for configuring Kimi-specific options (skills, agent files)
3. **Documentation** - User guide for setting up Kimi CLI with Vibe Kanban

## References

- [Kimi CLI GitHub](https://github.com/MoonshotAI/kimi-cli)
- [Kimi CLI Documentation](https://moonshotai.github.io/kimi-cli/)
- [ACP Protocol](https://github.com/agentclientprotocol/agent-client-protocol)

## PR Status

I have the implementation ready in my fork: `https://github.com/Leeelics/vibe-kanban/tree/feat/kimi-cli-integration`

Would love to get feedback from the core team on this proposal before submitting the PR.

---

**Related:** This follows the same pattern as other executor additions like Droid (#1318) and Copilot.
