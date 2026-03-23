# @timbal-ai/timbal-setup

Configure any AI coding agent with the Timbal MCP server and skill files.

## Quick start

```bash
npx @timbal-ai/timbal-setup --token t2_your_token_here
```

## Installation options

```bash
# Use a token from ~/.timbal/credentials (default profile)
npx @timbal-ai/timbal-setup

# Use a specific profile
npx @timbal-ai/timbal-setup --profile staging

# Target a specific agent only
npx @timbal-ai/timbal-setup --agent claude-code

# Force reinstall of skill files (even if already up to date)
npx @timbal-ai/timbal-setup --force
```

## Token resolution order

1. `--token <value>` CLI flag
2. `TIMBAL_API_KEY` environment variable
3. `TIMBAL_API_TOKEN` environment variable
4. `~/.timbal/credentials` INI file (respects `--profile` or `TIMBAL_PROFILE` env var, defaults to `[default]`)

## Status and uninstall

```bash
# Show what's currently installed
npx @timbal-ai/timbal-setup --status

# Remove all timbal config from all agents
npx @timbal-ai/timbal-setup --uninstall
```

## Supported agents (Phase 1)

- **Claude Code** — writes MCP config to `~/.claude/settings.json` and installs skill files to `~/.claude/skills/timbal/`

## What gets configured

### MCP server

Merges the following into `~/.claude/settings.json` (existing entries are never clobbered):

```json
{
  "mcpServers": {
    "timbal": {
      "url": "https://api.dev.timbal.ai/mcp",
      "type": "http",
      "headers": {
        "Authorization": "Bearer <your-token>"
      }
    }
  }
}
```

### Skill files

Copies the bundled `skill/` directory to `~/.claude/skills/timbal/`. A `.version` file tracks the installed version; re-runs only update if a newer version is available (use `--force` to override).

## License

MIT
