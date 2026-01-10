# Task: hideThinkingBlock UI Toggle

## Overview

Implement a UI toggle in vibe-kanban to control the `hideThinkingBlock` setting in PI agent, allowing users to show/hide thinking/reasoning output in the agent's responses.

## Background

### Investigation Findings

1. **PI CLI options**: Has `--thinking <level>` (off, minimal, low, medium, high) but NO `--hide-thinking-block` option
2. **ACP Protocol**: Exposes `set_session_mode` for thinking level but NOT `hideThinkingBlock`
3. **PI Settings**: `hideThinkingBlock` is only controlled via `~/.pi/agent/settings.json` using `SettingsManager.setHideThinkingBlock()` method

### Current Behavior

- Setting location: `~/.pi/agent/settings.json`
- Key: `"hideThinkingBlock": false` (default shows thinking blocks)
- When `true`: Agent's internal reasoning is hidden from output
- When `false`: Agent's internal reasoning is displayed

## Implementation Options

### Option A: Write Directly to settings.json (Recommended)

**Pros:**
- Simpler implementation
- No changes required to PI or ACP protocol
- Works immediately for all PI sessions

**Cons:**
- Affects global PI settings (not just vibe-kanban sessions)
- Requires file system access from vibe-kanban backend

### Option B: Extend ACP Protocol

**Pros:**
- Per-session control
- Proper API design

**Cons:**
- Requires changes to agent-client-protocol crate
- Requires changes to PI codebase
- More complex, longer timeline

## Proposed Implementation (Option A)

### Backend Changes

1. **Create PI Settings Service** (`crates/services/src/services/pi_settings.rs`)
   ```rust
   pub struct PiSettingsService {
       settings_path: PathBuf,
   }
   
   impl PiSettingsService {
       pub fn new() -> Result<Self, Error> {
           let settings_path = dirs::home_dir()
               .ok_or(Error::NoHomeDir)?
               .join(".pi/agent/settings.json");
           Ok(Self { settings_path })
       }
       
       pub fn get_hide_thinking_block(&self) -> Result<bool, Error>;
       pub fn set_hide_thinking_block(&self, value: bool) -> Result<(), Error>;
   }
   ```

2. **Create API Endpoint** (`crates/server/src/routes/pi_settings.rs`)
   - `GET /api/pi-settings/hide-thinking-block` - Get current value
   - `PUT /api/pi-settings/hide-thinking-block` - Set value

### Frontend Changes

1. **Add Toggle to Settings UI**
   - Location: Similar to existing thinking level dropdown
   - Component: Switch/Toggle for "Show Thinking Blocks"
   - API Hook: `usePiSettings()` for get/set operations

2. **Reference Files**:
   - `frontend/src/components/dialogs/settings/CreateConfigurationDialog.tsx`
   - `frontend/src/components/NormalizedConversation/DisplayConversationEntry.tsx` (handles `thinking` entry type)

### TypeScript Types

```typescript
interface PiSettings {
  hideThinkingBlock: boolean;
}
```

## Files to Modify/Create

| File | Action | Description |
|------|--------|-------------|
| `crates/services/src/services/pi_settings.rs` | CREATE | PI settings service |
| `crates/services/src/services/mod.rs` | MODIFY | Export pi_settings module |
| `crates/server/src/routes/pi_settings.rs` | CREATE | API routes |
| `crates/server/src/routes/mod.rs` | MODIFY | Mount pi_settings routes |
| `frontend/src/lib/api.ts` | MODIFY | Add API client methods |
| `frontend/src/hooks/usePiSettings.ts` | CREATE | React hook for settings |
| `frontend/src/components/dialogs/settings/*.tsx` | MODIFY | Add toggle UI |

## Notes

- Toggle label suggestion: "Show Thinking Blocks" (inverted from `hideThinkingBlock`)
- Consider adding a tooltip explaining what thinking blocks are
- Changes take effect on next agent interaction (existing sessions may not reflect change immediately)

## Status

- [ ] Backend: Create PI settings service
- [ ] Backend: Create API endpoints
- [ ] Frontend: Create API client methods
- [ ] Frontend: Create usePiSettings hook
- [ ] Frontend: Add toggle to settings UI
- [ ] Testing: Verify toggle works correctly
