<p align="center">
  <a href="https://vibekanban.com">
    <picture>
      <source srcset="frontend/public/vibe-kanban-logo-dark.svg" media="(prefers-color-scheme: dark)">
      <source srcset="frontend/public/vibe-kanban-logo.svg" media="(prefers-color-scheme: light)">
      <img src="frontend/public/vibe-kanban-logo.svg" alt="Vibe Kanban Logo">
    </picture>
  </a>
</p>

<p align="center">Get 10X more out of Claude Code, Gemini CLI, Codex, Amp and other coding agents...</p>

> **This is a fork of [BloopAI/vibe-kanban](https://github.com/BloopAI/vibe-kanban)** with additional enhancements for Claude Code settings configuration.
>
> For installation, documentation, and general usage, see the [original README](https://github.com/BloopAI/vibe-kanban#readme).

## Fork Enhancements

This fork adds the following features for Claude Code:

### LOCAL Profile

Import settings from your `~/.claude/settings.json` automatically:

```json
{
  "CLAUDE_CODE": {
    "LOCAL": {
      "CLAUDE_CODE": {
        "dangerously_skip_permissions": true,
        "use_local_settings": true
      }
    }
  }
}
```

- Profile settings take precedence over local settings
- Deny lists are **combined** from both sources

### Settings Configuration

Configure permissions and deny rules directly in profiles:

```json
{
  "CLAUDE_CODE": {
    "SAFE": {
      "CLAUDE_CODE": {
        "settings": {
          "permissions": {
            "allowedTools": ["Read", "Glob", "Grep"],
            "deny": ["Bash(rm *)", "Read(.env*)"]
          }
        }
      }
    }
  }
}
```

Settings are written to `.claude/settings.local.json` in the workspace when the agent starts.

## Development

```bash
pnpm i
pnpm run dev
```

See the [original repo](https://github.com/BloopAI/vibe-kanban#development) for full development instructions.
