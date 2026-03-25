# Timbal Codegen — CLI Reference

## Overview

Timbal codegen is a CLI tool for programmatically modifying Timbal agent and workflow source files. It uses libcst for safe, formatting-preserving Python code transformations.

```bash
timbal-codegen [--path <workspace>] [--dry-run] <operation> [options]
```

| Option | Default | Description |
|--------|---------|-------------|
| `--path` | `.` | Workspace directory containing `timbal.yaml` |
| `--dry-run` | off | Print transformed code to stdout without writing to disk |

### Workspace structure

Every workspace must have a `timbal.yaml` with a fully-qualified entry point:

```yaml
fqn: "workflow.py::workflow"
```

The entry point can be an `Agent` or a `Workflow`. Operations are scoped to the entry point type — e.g. `add-step` only works on Workflows, `convert-to-workflow` only works on Agents. The CLI will reject mismatches.

---

## Adding a tool: the full workflow

When the user wants to add a tool (e.g. "add Gmail", "I need Slack integration"), follow this sequence:

### Step 1: Discover the tool type via `get-tools`

```bash
# Option A: Search directly if you have a keyword
timbal-codegen get-tools --search "gmail"
# → Returns: GmailSend, GmailSearch, GmailReply, GmailAddLabel, GmailListLabels, GmailRemoveLabel

# Option B: Two-tier — first list providers, then drill into one
timbal-codegen get-tools
# → {"providers": [{"name": "gmail", "tool_count": 6}, {"name": "slack", "tool_count": 27}, ...]}

timbal-codegen get-tools --provider gmail
# → Returns all Gmail tools with their class names
```

The `type` field in the response is the class name you pass to `add-tool`.

### Step 2: Add the tool

```bash
timbal-codegen add-tool --type GmailSend
```

This generates:

```python
from timbal.tools import GmailSend

gmail_send = GmailSend()

workflow = Agent(name="my_agent", model="openai/gpt-4o", tools=[gmail_send])
```

### Step 3 (optional): Configure it

```bash
timbal-codegen set-config --name web_search \
  --config '{"allowed_domains": ["docs.timbal.ai", "github.com"]}'
```

### Same approach for models

Use `get-models` to discover model IDs — never hardcode them:

```bash
timbal-codegen get-models
# → {"providers": [{"name": "openai", "model_count": 24}, {"name": "anthropic", "model_count": 12}, ...]}

timbal-codegen get-models --provider anthropic
# → Returns models with id, display_name, description, pricing, capabilities

timbal-codegen set-config --config '{"model": "anthropic/claude-sonnet-4-6"}'
```

Model IDs use `provider/model` format (e.g. `anthropic/claude-opus-4-6`, `openai/gpt-4o`).

---

## Discovery operations

### `get-tools` — Browse and search tools (preferred)

Two-tier discovery with pagination. Always use this instead of `list-tools` — there are 700+ tools.

```bash
timbal-codegen get-tools                                          # list providers
timbal-codegen get-tools --provider slack                         # all Slack tools
timbal-codegen get-tools --search "send message"                  # search across all
timbal-codegen get-tools --provider zendesk --search invoice --limit 10 --offset 20
```

| Argument | Default | Description |
|----------|---------|-------------|
| `--provider` | none | Filter by provider name (`"system"` for tools with no provider) |
| `--search` | none | Case-insensitive substring search on name, type, description |
| `--limit` | 50 | Max tools to return |
| `--offset` | 0 | Number of tools to skip |

### `get-models` — Browse and search LLM models (preferred)

Same two-tier pattern as `get-tools`.

```bash
timbal-codegen get-models                                         # list providers
timbal-codegen get-models --provider anthropic                    # all Anthropic models
timbal-codegen get-models --search "vision"                       # search across all
```

| Argument | Default | Description |
|----------|---------|-------------|
| `--provider` | none | Filter by provider name |
| `--search` | none | Case-insensitive substring search on id, display_name, description |
| `--limit` | 50 | Max models to return |
| `--offset` | 0 | Number of models to skip |

### `list-tools` — Deprecated

Dumps all 700+ tools as a flat JSON array. Slow — use `get-tools` instead.

---

## Code transformation operations

### `add-tool` — Add a tool to an Agent

**Requires**: Agent entry point, or Workflow entry point when using `--step`.

```bash
# Framework tool (use get-tools to find the class name first!)
timbal-codegen add-tool --type GmailSend

# Framework tool with custom runtime name
timbal-codegen add-tool --type WebSearch --name my_search

# Add a tool to a specific step in a Workflow
timbal-codegen add-tool --type SlackReadMessages --step agent_a
```

| Argument | Required | Description |
|----------|----------|-------------|
| `--type` | yes | Tool class name from `get-tools` (e.g. `GmailSend`, `WebSearch`, `Bash`) or `Custom` |
| `--definition` | Custom only | Full function definition as a string |
| `--name` | no | Override the default runtime name |
| `--step` | no | Target step name within a Workflow |

What it does:
- Adds the import (`from timbal.tools import GmailSend`)
- Creates a variable assignment (`gmail_send = GmailSend()`)
- Adds the variable to the Agent's `tools=[...]` list

#### Custom tools

For custom tools, pass a function definition. Use `pydantic.Field()` for parameter descriptions only when the name alone isn't clear enough:

```bash
# Custom tool: make an HTTP request
timbal-codegen add-tool --type Custom --definition '
async def fetch_url(
    url: str,
    method: str = "GET",
    headers: dict[str, str] | None = None,
    body: str | None = None,
) -> dict:
    import httpx
    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.request(method, url, headers=headers, content=body)
        return {"status": response.status_code, "body": response.text}
'

# Custom tool: get current time
timbal-codegen add-tool --type Custom --definition '
def get_current_time(
    timezone: str = Field("UTC", description="IANA timezone name, e.g. America/New_York"),
) -> str:
    from datetime import datetime
    from zoneinfo import ZoneInfo
    return datetime.now(ZoneInfo(timezone)).isoformat()
'

# Custom tool: delay execution
timbal-codegen add-tool --type Custom --definition '
async def delay(seconds: float) -> str:
    import asyncio
    await asyncio.sleep(seconds)
    return f"Waited {seconds} seconds"
'
```

Custom tools are wrapped in `Tool(handler=func_name)` from `timbal.core`. The function signature is what the LLM sees — use `Field()` only when the parameter name alone isn't self-explanatory.

### `remove-tool` — Remove a tool from an Agent

**Requires**: Agent entry point, or Workflow entry point when using `--step`.

```bash
timbal-codegen remove-tool --name gmail_send
timbal-codegen remove-tool --name web_search --step agent_a
```

Removes the tool reference from `tools=[...]`. Unused variables, functions, and imports are cleaned up automatically.

### `set-config` — Configure an Agent, tool, or workflow step

Unified configuration operation. Behavior depends on whether `--name` is provided:

```bash
# Configure the Agent entry point (no --name)
timbal-codegen set-config \
  --config '{"model": "anthropic/claude-sonnet-4-6", "system_prompt": "You are a helpful assistant.", "max_tokens": 4096, "max_iter": 5}'

# Configure a tool on the Agent (--name = tool runtime name)
timbal-codegen set-config --name web_search \
  --config '{"allowed_domains": ["docs.timbal.ai"], "blocked_domains": ["example.com"]}'

# Configure a workflow step (--name = step name)
timbal-codegen set-config --name agent_b --config '{"model": "openai/gpt-4o"}'

# Remove a field (set to null)
timbal-codegen set-config --config '{"system_prompt": null}'
```

Valid Agent fields: `name`, `description`, `model`, `system_prompt`, `max_iter`, `max_tokens`, `temperature`, `base_url`, `api_key`, `model_params`, `skills_path`.

**Important:** Anthropic models **require** `max_tokens` to be set explicitly — they will fail without it. Always include `max_tokens` when configuring an agent with an `anthropic/` model.

#### Extended thinking

Enable thinking via `model_params`. The thinking mode depends on the model:

```bash
# Opus 4.6 — adaptive only (no budget_tokens)
timbal-codegen set-config \
  --config '{"model": "anthropic/claude-opus-4-6", "max_tokens": 16000, "model_params": {"thinking": {"type": "adaptive"}}}'

# Sonnet 4.6 — manual or adaptive
timbal-codegen set-config \
  --config '{"model": "anthropic/claude-sonnet-4-6", "max_tokens": 16000, "model_params": {"thinking": {"type": "enabled", "budget_tokens": 10000}}}'

# Other Anthropic models (Sonnet 4.5, Opus 4.5, Haiku 4.5, etc.) — manual
timbal-codegen set-config \
  --config '{"model": "anthropic/claude-sonnet-4-5", "max_tokens": 16000, "model_params": {"thinking": {"type": "enabled", "budget_tokens": 10000}}}'
```

| Model | Supported modes | Notes |
|---|---|---|
| `claude-opus-4-6` | `adaptive` only | `budget_tokens` not accepted |
| `claude-sonnet-4-6` | `enabled` or `adaptive` | `budget_tokens` required for `enabled` |
| `claude-opus-4-5`, `claude-opus-4-1`, `claude-opus-4` | `enabled` | `budget_tokens` required |
| `claude-sonnet-4-5`, `claude-sonnet-4` | `enabled` | `budget_tokens` required |
| `claude-haiku-4-5` | `enabled` | `budget_tokens` required |

**Key rule:** `budget_tokens` must be less than `max_tokens`.

Tool config fields are validated against the tool's schema. Supported configurable tools: `WebSearch`, `CalaSearch`, `Tool` (custom).

### `add-step` — Add a step to a Workflow

**Requires**: Workflow entry point.

```bash
# Agent step (--config must include "name")
timbal-codegen add-step --type Agent \
  --config '{"name": "summarizer", "model": "anthropic/claude-sonnet-4-6", "system_prompt": "Summarize.", "max_tokens": 512}'

# Framework tool as a step
timbal-codegen add-step --type GmailSearch

# Custom function step
timbal-codegen add-step --type Custom --definition '
def format_results(items: list[dict], max_items: int = 10) -> str:
    return "\n".join(f"- {item.get(\"title\", \"Untitled\")}" for item in items[:max_items])
'
```

For `--type Agent`, valid `--config` fields are: `name`, `description`, `model`, `system_prompt`, `max_iter`, `max_tokens`, `temperature`, `base_url`, `api_key`, `model_params`, `skills_path`. **`metadata` is not valid here** — use `set-position` after adding the step if you need canvas coordinates.

For `--type <FrameworkTool>` (e.g. `GmailSearch`), use `get-tools` to find the class name first. Tool config can be set afterwards with `set-config --name <tool_name>`.

What it does:
- Adds necessary imports
- Creates the variable assignment or function definition
- Appends a `workflow.step(...)` call after the last existing step

### `remove-step` — Remove a step from a Workflow

**Requires**: Workflow entry point.

```bash
timbal-codegen remove-step --name summarizer
```

Removes the `workflow.step(...)` call. Unused variables, functions, and imports are cleaned up automatically.

### `set-param` — Wire parameters between workflow steps

**Requires**: Workflow entry point. Two modes: **map** wires from another step's output, **value** sets a static literal.

```bash
# Map from another step's output
timbal-codegen set-param --target agent_b --name prompt --type map --source agent_a

# Map with dot-notation key path
timbal-codegen set-param --target agent_b --name prompt --type map --source agent_a --key output.cleaned

# Set a static value
timbal-codegen set-param --target agent_a --name prompt --type value --value '"Hello world"'

# Remove a param
timbal-codegen set-param --target agent_b --name prompt --type value --value 'null'
```

| Argument | Required | Description |
|----------|---------|-------------|
| `--target` | yes | Target step name |
| `--name` | yes | Parameter name to set |
| `--type` | yes | `map` or `value` |
| `--source` | map only | Source step name |
| `--key` | no | Dot-notation path into the source output |
| `--value` | value only | JSON literal (`null` to remove) |

Key path syntax — numeric segments become index access, string segments become attribute access:

| Key path | Generated Python |
|----------|-----------------|
| `output.cleaned` | `.output.cleaned` |
| `output.0.items` | `.output[0].items` |
| `output.0.data.name.2` | `.output[0].data.name[2]` |

Under the hood, `map` generates a lambda that reads from `get_run_context().step_span("source").output`.

### `add-edge` / `remove-edge` — Manage execution ordering

**Requires**: Workflow entry point. For wiring data, use `set-param` instead — edges are for ordering only.

```bash
# Pure ordering dependency
timbal-codegen add-edge --source agent_a --target agent_b

# Conditional edge
timbal-codegen add-edge --source agent_a --target agent_b \
  --when 'lambda: get_run_context().step_span("agent_a").output.content != ""'

# Remove an edge
timbal-codegen remove-edge --source agent_a --target agent_b
```

### `set-position` — Set canvas position for a node

```bash
timbal-codegen set-position --x 100 --y 200              # Agent entry point
timbal-codegen set-position --name agent_a --x 150 --y 250  # Workflow step
```

Upserts `metadata={"position": {"x": ..., "y": ...}}` on the constructor, preserving existing metadata keys.

### `convert-to-workflow` — Convert an Agent to a Workflow

**Requires**: Agent entry point.

```bash
timbal-codegen convert-to-workflow
timbal-codegen convert-to-workflow --name my_pipeline
```

**Before:**
```python
from timbal import Agent

workflow = Agent(name="agent_a", model="openai/gpt-4o-mini")
```

**After:**
```python
from timbal import Agent, Workflow

agent_a = Agent(name="agent_a", model="openai/gpt-4o-mini")

workflow = Workflow(name="workflow")
workflow.step(agent_a)
```

The entry point variable name stays the same (so `timbal.yaml` doesn't need updating). The Agent is moved to a new variable named after its `name` kwarg.

---

## Read-only operations

### `get-flow` — Print the execution graph

```bash
timbal-codegen get-flow
```

Outputs JSON with `nodes` and `edges`. Each node includes a `position` and `data.params.properties` with OpenAPI-style schema fields plus a `value` describing how the param is set:

- **Map**: `{"type": "map", "source": "agent_a"}` with optional `"key"` for dot-notation path
- **Static**: `{"type": "value", "value": <json_value>}`
- **Absent**: param has no value set

Config fields referencing the model registry use `"x-timbal-ref": "models"` — call `get-models` to resolve available options.

### `test` — Run the entry point

```bash
timbal-codegen test
timbal-codegen test --input '{"query": "hello"}'
timbal-codegen test --stream
timbal-codegen test --context '{"id": "my-run-id"}'
```

| Argument | Default | Description |
|----------|---------|-------------|
| `--input`, `-i` | `{}` | Input parameters as JSON |
| `--context`, `-c` | none | RunContext fields as JSON |
| `--stream`, `-s` | off | Print every event instead of only the final output |

---

## Key properties

- **Idempotent**: all operations produce the same result when run multiple times
- **Dead code elimination**: unused variables, functions, and imports are automatically cleaned up
- **Pipeline**: `timbal.yaml` → parse FQN → load source → parse CST → apply transformer → remove unused code → format with ruff → write (or stdout with `--dry-run`)
- **Error handling**: operations fail with non-zero exit code and stderr message when `timbal.yaml` is missing, entry point type mismatches the operation, required arguments are missing, config fields are invalid, or JSON is malformed
