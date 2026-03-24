# Converting Zapier Zaps to Timbal

## Overview

This reference maps Zapier concepts to Timbal equivalents and provides codegen command sequences for common migration patterns. Use it when a user provides a Zapier Zap JSON export, shares their Zap configuration, or describes a Zap they want to rebuild in Timbal.

**Important:** Zapier's export is limited compared to n8n or Make. The Zapfile.json (account data export) is available only on **Team and Enterprise plans** and its format is poorly documented. If the user doesn't have a JSON export, ask them to describe their Zap — trigger, actions, filters, and field mappings — and work from that description.

---

## Parsing Zapier JSON

Users may provide JSON from two sources: the account data export (Zapfile.json) or the Workflow API v2 format. The Workflow API format is better documented.

### Structure (Workflow API v2)

```json
{
  "type": "zap",
  "id": "033cc069-f2d3-4d63-8666-10c07ab38dac",
  "title": "Slack saved message to Google Sheets",
  "is_enabled": true,
  "steps": [
    {
      "action": "core:9QKqnTZ54VnrL2opYbkJJKveKEr2GJ",
      "authentication": "Vx4PEEeV",
      "inputs": {},
      "title": "New Saved Message in Slack",
      "alias": "slack_trigger"
    },
    {
      "action": "core:2oY5MSxlgML1jb43A0nroedgjdnVM",
      "authentication": "k0QBMMDK",
      "inputs": {
        "spreadsheet": "1hINj1kFA0FExGcpYh8DVwRMTL3JITlPZOtx0lwQJHY8",
        "COL$A": "{{slack_trigger.user__real_name}}",
        "COL$B": "{{slack_trigger.text}}"
      },
      "title": "Add Row to Google Sheets",
      "alias": "sheets_step"
    }
  ]
}
```

### How to read it

1. **Walk `steps[]`** — steps execute in order. The first step is always the **trigger** (data source). Remaining steps are **actions** (things to do with that data).
2. **Identify the app** — the `action` field is an opaque ID (e.g., `core:9QKq...`). Use the step's `title` to identify which app and operation it represents (e.g., "New Saved Message in Slack", "Add Row to Google Sheets").
3. **Read `inputs`** — this is the step's configuration. Keys are field IDs, values are either static strings or data references using `{{step_alias.field_id}}` syntax.
4. **Trace data flow** — scan `inputs` for `{{alias.field}}` patterns. Double underscores represent nested fields: `{{slack_trigger.user__real_name}}` = `user.real_name`.
5. **Ignore `authentication`** — these are opaque credential IDs. Note which services need auth so you can tell the user to configure credentials in Timbal.
6. **Ignore `action` IDs** — these are internal Zapier identifiers. Use the `title` field to determine what the step does.

### Filters in JSON

Filters appear as steps with specific input fields:

```json
{
  "action": "core:filter_action_id",
  "authentication": null,
  "inputs": {
    "filter_criteria_count": 2,
    "boolean_operator": "and",
    "filter_criteria_1_key": "{{slack_trigger.channel}}",
    "filter_criteria_1_match": "exactly matches",
    "filter_criteria_1_value": "general",
    "filter_criteria_2_key": "{{slack_trigger.text}}",
    "filter_criteria_2_match": "contains",
    "filter_criteria_2_value": "urgent"
  },
  "alias": null,
  "title": null
}
```

Filter conditions use numbered fields: `filter_criteria_{n}_key`, `filter_criteria_{n}_match`, `filter_criteria_{n}_value`. The `boolean_operator` is `"and"` (all must match) or `"or"` (any must match).

### Paths (branching)

**Paths are not represented in the Zapier JSON export or API.** If the user's Zap uses Paths, they'll need to describe each branch and its conditions manually. Then convert each path branch to conditional edges in Timbal.

### Conversion process

1. Parse the JSON (or read the user's description)
2. Build a step list — note each step's `title` (to identify the app/operation), `alias`, and `inputs`
3. Trace data references in `inputs` by scanning for `{{alias.field}}` patterns
4. Identify filter steps (steps with `filter_criteria_*` inputs) — these become conditional edges
5. Ask the user about Paths if mentioned (not in JSON)
6. Decide Agent vs Workflow (see decision table below)
7. Convert each step using the concept mapping table
8. Wire data flow with `set-param`

---

## Concept mapping

| Zapier concept | What it does | Timbal equivalent | Codegen command |
|---|---|---|---|
| **Trigger** (first step) | Starts the Zap on an event | Workflow input params — data is passed at invocation time | N/A (inputs are defined by step params) |
| **Action** (Gmail, Slack, Sheets, etc.) | Calls an external service | Framework tool or workflow step | `add-tool --type GmailSend` or `add-step --type GmailSend` |
| **Filter** | Stops the Zap if conditions aren't met | Conditional edge | `add-edge --source A --target B --when 'lambda: ...'` |
| **Paths** | Branches into multiple conditional paths | Multiple conditional edges from the same source | Multiple `add-edge --when` calls |
| **Formatter** (text, number, date) | Transforms data | Custom step | `add-step --type Custom --definition '...'` |
| **Webhooks by Zapier** | Sends/receives HTTP requests | Custom tool with `httpx` | `add-tool --type Custom --definition '...'` |
| **Code by Zapier** (JS/Python) | Runs custom code | Custom tool or custom step | `add-tool --type Custom --definition '...'` |
| **Delay by Zapier** | Waits before continuing | Custom async step | `add-step --type Custom --definition 'async def delay(...)'` |
| **Looping by Zapier** | Iterates over items | Custom step with a Python loop | `add-step --type Custom --definition '...'` |
| **Sub-Zap** | Calls another Zap | Separate Workflow used as a step | `add-step --type Workflow` or nest in code |
| **`{{alias.field}}`** data references | Passes data between steps | `set-param --type map` | `set-param --target B --name input --type map --source A` |
| **Static input values** | Hardcoded values in inputs | `set-param --type value` | `set-param --target X --name Y --type value --value '"..."'` |

### Key difference: linear pipeline vs explicit wiring

Zapier runs steps **strictly in order** — each step can reference any earlier step's output via `{{alias.field}}`. There's no parallel execution (except within Paths).

Timbal uses **explicit wiring** — each step declares where its inputs come from using `set-param`. Steps without dependencies between them run in parallel by default.

---

## Decision: Agent vs Workflow

| Zap shape | Timbal entry point | Why |
|---|---|---|
| Single action after trigger (2 steps) | **Agent** with tools if AI-related, or **Workflow** with one step | Simple pipeline |
| Linear chain of actions | **Workflow** | Multiple steps in sequence |
| Zap with Filters | **Workflow** | Need conditional edges |
| Zap with Paths | **Workflow** | Need conditional branching |
| Code by Zapier calling an LLM | **Agent** | LLM + custom logic |

---

## Migration patterns

### Pattern 1: Linear Zap (Trigger → Action → Action)

**Zapier:** New Email in Gmail → Add Row to Google Sheets → Send Slack Message

**Timbal:**
```bash
timbal-codegen add-step --type GmailSearch

timbal-codegen add-step --type SlackPostMessage

# Wire data flow
timbal-codegen set-param --target slack_post_message --name text --type map --source gmail_search
timbal-codegen set-param --target slack_post_message --name channel --type value --value '"#notifications"'

# Ordering
timbal-codegen add-edge --source gmail_search --target slack_post_message
```

**What changed:**
- Trigger (New Email) → workflow input (data passed at invocation) or a search/fetch step
- Actions → framework tools or steps discovered via `get-tools --search "..."`
- `{{gmail_trigger.subject}}` references → `set-param --type map --source step_name`

### Pattern 2: Zap with Filter

**Zapier:** New Slack Message → Filter (channel = "general" AND contains "urgent") → Send Email

**Timbal:**
```bash
timbal-codegen add-step --type Custom --definition '
def check_message(channel: str, text: str) -> dict:
    return {"channel": channel, "text": text}
'

timbal-codegen add-step --type GmailSend

# Filter becomes a conditional edge
timbal-codegen add-edge --source check_message --target gmail_send \
  --when 'lambda: get_run_context().step_span("check_message").output["channel"] == "general" and "urgent" in get_run_context().step_span("check_message").output["text"]'

timbal-codegen set-param --target gmail_send --name body --type map --source check_message
```

### Pattern 3: Zap with Paths (branching)

**Zapier:** New Form Submission → Path A (if priority = "high" → Slack + Email) / Path B (if priority = "low" → just Slack)

**Timbal:**
```bash
timbal-codegen add-step --type SlackPostMessage
timbal-codegen add-step --type GmailSend

# Path A: high priority → both Slack and Email
timbal-codegen add-edge --source input --target slack_post_message \
  --when 'lambda: get_run_context().step_span("input").output.priority == "high"'
timbal-codegen add-edge --source input --target gmail_send \
  --when 'lambda: get_run_context().step_span("input").output.priority == "high"'

# Path B: low priority → just Slack
# (already covered by the Slack edge above if you adjust the condition)
# Or use a more explicit approach:
timbal-codegen add-edge --source input --target slack_post_message \
  --when 'lambda: True'  # Slack always fires

timbal-codegen add-edge --source input --target gmail_send \
  --when 'lambda: get_run_context().step_span("input").output.priority == "high"'
```

### Pattern 4: Webhooks + Code by Zapier

**Zapier:** Webhook (Catch Hook) → Code by Zapier (Python: transform data) → POST Webhook (send to API)

**Timbal:**
```bash
# Transform step (from Code by Zapier)
timbal-codegen add-step --type Custom --definition '
def transform(data: dict) -> dict:
    return {
        "name": data.get("first_name", "") + " " + data.get("last_name", ""),
        "email": data.get("email", "").lower(),
    }
'

# HTTP request step (from Webhooks by Zapier POST)
timbal-codegen add-step --type Custom --definition '
async def send_to_api(payload: dict) -> dict:
    import httpx
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post("https://api.example.com/contacts", json=payload)
        return {"status": resp.status_code, "body": resp.text}
'

timbal-codegen set-param --target send_to_api --name payload --type map --source transform
timbal-codegen add-edge --source transform --target send_to_api
```

### Pattern 5: AI-powered Zap → Timbal Agent

**Zapier:** New Email → ChatGPT (Conversation) → Send Reply Email

**Timbal:**
```bash
# This is best modeled as an Agent with tools
timbal-codegen set-config --config '{
  "model": "openai/gpt-4o",
  "max_tokens": 4096,
  "system_prompt": "You are an email assistant. Read incoming emails and draft helpful replies."
}'

timbal-codegen add-tool --type GmailSend
```

If there's pre/post-processing around the AI step:
```bash
timbal-codegen convert-to-workflow

timbal-codegen add-step --type Custom --definition '
def format_reply(draft: str, original_sender: str) -> dict:
    return {"to": original_sender, "body": draft}
'

timbal-codegen set-param --target format_reply --name draft --type map --source agent
```

---

## Translating Zapier filter operators

| Zapier match operator | Meaning | Timbal lambda pattern |
|---|---|---|
| `exactly matches` | Equals | `== "value"` |
| `does not exactly match` | Not equals | `!= "value"` |
| `contains` | Substring match | `"value" in ...` |
| `does not contain` | No substring match | `"value" not in ...` |
| `starts with` | Starts with | `.startswith("value")` |
| `ends with` | Ends with | `.endswith("value")` |
| `is greater than` | Numeric greater | `> value` |
| `is less than` | Numeric less | `< value` |
| `exists` | Field is not empty | `is not None and len(...) > 0` |
| `does not exist` | Field is empty | `is None or len(...) == 0` |
| `is true` | Boolean true | `is True` or `== "true"` |
| `is false` | Boolean false | `is False` or `== "false"` |

---

## Common Zapier apps → Timbal tool search

```bash
# Gmail
timbal-codegen get-tools --search "gmail"

# Slack
timbal-codegen get-tools --search "slack"

# Google Sheets
timbal-codegen get-tools --search "sheets"

# Google Drive
timbal-codegen get-tools --search "drive"

# Webhooks by Zapier — use a custom tool with httpx
# See Pattern 4 above

# Code by Zapier — convert the JS/Python to a custom tool or step
# add-tool --type Custom --definition '...' or add-step --type Custom --definition '...'

# ChatGPT / OpenAI — use an Agent step
# add-step --type Agent --config '{...}'

# Formatter by Zapier — use a custom step for the transformation
# add-step --type Custom --definition '...'
```

For any Zapier app, try `get-tools --search "<app name>"` first. If nothing matches, write a custom tool.

---

## Step-by-step migration process

1. **Get the Zap definition** — parse JSON if available, otherwise ask the user to describe: trigger app, action apps (in order), filters, paths, and field mappings
2. **Build the step list** — note each step's app, operation, and configured inputs
3. **Trace data flow** — identify `{{alias.field}}` references or ask the user which fields connect where
4. **Identify filters and paths** — filters become conditional edges, paths become branching edges
5. **Choose entry point** — Agent (AI-centric Zap) or Workflow (multi-step pipeline). See the decision table
6. **Map each step** — use the concept mapping table to find the Timbal equivalent
7. **Discover tools** — run `get-tools --search "..."` for each app. Use custom tools for Webhooks, Code, and Formatter steps
8. **Wire data flow** — use `set-param` to connect outputs to inputs
9. **Add ordering and conditions** — `add-edge` for sequential flow, `add-edge --when` for filter/path conditions
10. **Test** — run `timbal-codegen test --input '{...}'` to verify

---

## Things that don't map directly

| Zapier feature | Timbal approach |
|---|---|
| **Trigger (polling or instant)** | Timbal workflows are invoked via API — deploy and call the endpoint. Use external scheduling for polling equivalents |
| **Credentials / authentication** | Use environment variables or Timbal's managed credentials (configured in the platform, not in code) |
| **Formatter by Zapier** | Write a custom step with the transformation logic in Python |
| **Delay by Zapier** | Custom async step with `asyncio.sleep` |
| **Looping by Zapier** | Custom step with a Python loop |
| **Digest by Zapier** | Custom step that accumulates and formats data |
| **Paths** (branching) | Conditional edges with `add-edge --when` |
| **Sub-Zaps** | Separate Timbal Workflow used as a step |
| **Zap versioning** | Use git for version control |
| **Task History** | Timbal platform provides run history and observability |
| **Auto-replay** | Timbal handles retries at the platform level |
