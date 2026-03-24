# Converting n8n Workflows to Timbal

## Overview

This reference maps n8n workflow concepts to Timbal equivalents and provides codegen command sequences for common migration patterns. Use it when a user provides an n8n workflow JSON export or describes an n8n workflow they want to rebuild in Timbal.

---

## Parsing n8n workflow JSON

Users can export n8n workflows as JSON files. When a user provides one, parse these key fields:

### Structure

```json
{
  "name": "My Workflow",
  "nodes": [
    {
      "id": "uuid",
      "name": "Human-readable name",
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 1,
      "position": [250, 300],
      "parameters": {
        "url": "https://api.example.com/data",
        "method": "GET"
      },
      "credentials": {
        "httpBasicAuth": { "id": "cred-id", "name": "My API Key" }
      }
    }
  ],
  "connections": {
    "Source Node Name": {
      "main": [
        [
          { "node": "Target Node Name", "type": "main", "index": 0 }
        ]
      ]
    }
  }
}
```

### How to read it

1. **Walk `nodes[]`** — each entry is a step to convert. The `type` field tells you what kind of node it is (see mapping table below). The `parameters` object has the node's configuration.
2. **Walk `connections{}`** — keys are source node names. Each source maps to an array of output ports (`main[0]` = first output, `main[1]` = second output for IF/Switch nodes). Each port lists downstream nodes. This gives you the execution graph.
3. **Ignore `credentials`** — secrets aren't included in exports. Note which services need auth so you can tell the user to configure credentials in Timbal.

### Common node type strings

| n8n `type` value | What it is |
|---|---|
| `n8n-nodes-base.httpRequest` | HTTP Request |
| `n8n-nodes-base.gmail` / `.gmailTrigger` | Gmail action / trigger |
| `n8n-nodes-base.slack` | Slack |
| `n8n-nodes-base.code` | Code (JS/Python) |
| `n8n-nodes-base.if` | IF condition |
| `n8n-nodes-base.switch` | Switch (multi-branch) |
| `n8n-nodes-base.merge` | Merge parallel branches |
| `n8n-nodes-base.set` | Set/transform fields |
| `n8n-nodes-base.webhook` | Webhook trigger |
| `n8n-nodes-base.scheduleTrigger` | Cron/schedule trigger |
| `@n8n/n8n-nodes-langchain.agent` | AI Agent (LangChain) |

Node types always start with `n8n-nodes-base.` for built-in nodes or `@n8n/n8n-nodes-langchain.` for AI nodes.

### Conversion process from JSON

1. Parse the JSON
2. Build a node list from `nodes[]` — note each node's `name`, `type`, and `parameters`
3. Build the edge graph from `connections{}`
4. For IF/Switch nodes: `main[0]` = true/first branch, `main[1]` = false/second branch — convert to conditional edges
5. Decide Agent vs Workflow (see decision table below)
6. Convert each node using the concept mapping table
7. Wire data flow with `set-param` based on the connections graph
8. Use `parameters` values to inform tool configs and static values

---

## Concept mapping

| n8n Concept | What it does | Timbal Equivalent | Codegen command |
|---|---|---|---|
| **Trigger node** (Webhook, Schedule, etc.) | Starts the workflow on an event | Workflow input params — data is passed at invocation time | N/A (inputs are defined by step params) |
| **Action node** (Gmail, Slack, HTTP Request) | Calls an external service | Framework tool or workflow step | `add-tool --type GmailSend` or `add-step --type GmailSend` |
| **Code node** | Runs custom JS/Python | Custom tool or custom step | `add-tool --type Custom --definition '...'` or `add-step --type Custom --definition '...'` |
| **IF node** | Branches based on a condition | Conditional edge | `add-edge --source A --target B --when 'lambda: ...'` |
| **Switch node** | Routes to one of many branches | Multiple conditional edges from the same source | Multiple `add-edge --when` calls |
| **Merge node** | Combines data from parallel branches | Step that depends on multiple sources via `set-param` | `set-param --target merge_step --name input_a --type map --source branch_a` |
| **Set node** | Sets/transforms data fields | Static param or custom step | `set-param --target X --name Y --type value --value '"..."'` |
| **HTTP Request node** | Makes an API call | Custom tool with `httpx` | `add-tool --type Custom --definition '...'` |
| **Sub-workflow** | Calls another n8n workflow | A separate Workflow used as a step | `add-step --type Workflow` or nest in code |
| **Wait node** | Pauses execution | Custom async step with `asyncio.sleep` | `add-step --type Custom --definition 'async def delay(...)'` |
| **AI Agent node** | LLM with tools | Agent (the core Timbal primitive) | `add-step --type Agent --config '{"name": "...", "model": "..."}'` |

### Key difference: push vs pull

n8n **pushes** data along connections — each node receives the output of the previous node automatically. Timbal **pulls** — each step declares where its inputs come from using `set-param`. This means you need to explicitly wire data between steps.

---

## Decision: Agent vs Workflow

Before converting, decide the Timbal entry point type:

| n8n workflow shape | Timbal entry point | Why |
|---|---|---|
| Single AI Agent node with tools | **Agent** | One LLM with tools is exactly what `Agent` is |
| Linear chain of action nodes | **Workflow** | Multiple steps that run in sequence |
| Branching / parallel paths | **Workflow** | Need conditional edges or parallel steps |
| Agent + pre/post-processing steps | **Workflow** | Agent becomes one step among others |

Start with an **Agent** if the n8n workflow is centered on an AI Agent node. Use `convert-to-workflow` later if you need to add pre/post-processing steps around it.

---

## Migration patterns

### Pattern 1: Linear chain (A → B → C)

**n8n**: Trigger → HTTP Request → Code (transform) → Slack Message

**Timbal**:
```bash
# Start with a workflow
# (assuming workflow.py already has a Workflow entry point)

# Step 1: HTTP request as a custom step
timbal-codegen add-step --type Custom --definition '
async def fetch_data(url: str) -> dict:
    import httpx
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.get(url)
        return {"status": resp.status_code, "body": resp.json()}
'

# Step 2: Transform the data
timbal-codegen add-step --type Custom --definition '
def transform(data: dict) -> str:
    items = data.get("body", {}).get("items", [])
    return "\n".join(f"- {i[\"name\"]}: {i[\"value\"]}" for i in items)
'

# Step 3: Send to Slack
timbal-codegen add-step --type SlackPostMessage

# Wire the data flow
timbal-codegen set-param --target transform --name data --type map --source fetch_data
timbal-codegen set-param --target slack_post_message --name text --type map --source transform
timbal-codegen set-param --target slack_post_message --name channel --type value --value '"#general"'

# Order is implicit from set-param here, but you can be explicit:
timbal-codegen add-edge --source fetch_data --target transform
timbal-codegen add-edge --source transform --target slack_post_message
```

### Pattern 2: Branching (IF node)

**n8n**: Agent → IF (has_results?) → Yes: Gmail Send / No: Slack Notify

**Timbal**:
```bash
# Add the agent step
timbal-codegen add-step --type Agent \
  --config '{"name": "researcher", "model": "anthropic/claude-sonnet-4-6"}'

# Add both branches
timbal-codegen add-step --type GmailSend
timbal-codegen add-step --type SlackPostMessage

# Conditional edges replace the IF node
timbal-codegen add-edge --source researcher --target gmail_send \
  --when 'lambda: len(get_run_context().step_span("researcher").output.content) > 0'

timbal-codegen add-edge --source researcher --target slack_post_message \
  --when 'lambda: len(get_run_context().step_span("researcher").output.content) == 0'

# Wire data into each branch
timbal-codegen set-param --target gmail_send --name body --type map --source researcher --key output.content
timbal-codegen set-param --target slack_post_message --name text --type value --value '"No results found"'
```

### Pattern 3: Parallel execution + merge

**n8n**: Trigger → [Search A, Search B] → Merge → Summarize

**Timbal**:
```bash
# Two parallel search steps (no edge between them = parallel)
timbal-codegen add-step --type Custom --definition '
async def search_a(query: str) -> str:
    import httpx
    async with httpx.AsyncClient() as c:
        r = await c.get("https://api-a.example.com/search", params={"q": query})
        return r.text
'

timbal-codegen add-step --type Custom --definition '
async def search_b(query: str) -> str:
    import httpx
    async with httpx.AsyncClient() as c:
        r = await c.get("https://api-b.example.com/search", params={"q": query})
        return r.text
'

# Summarizer depends on both — this creates the "merge"
timbal-codegen add-step --type Agent \
  --config '{"name": "summarizer", "model": "anthropic/claude-sonnet-4-6"}'

timbal-codegen set-param --target summarizer --name prompt --type map --source search_a
timbal-codegen set-param --target summarizer --name context --type map --source search_b
```

### Pattern 4: AI Agent with tools

**n8n**: AI Agent node with Calculator, Wikipedia, and HTTP Request tools

**Timbal**:
```bash
# This maps directly to a Timbal Agent — the simplest case
# Start from an Agent entry point, then add tools

timbal-codegen add-tool --type WebSearch
timbal-codegen add-tool --type Custom --definition '
def calculate(expression: str) -> str:
    """Evaluate a math expression safely."""
    import ast
    return str(ast.literal_eval(expression))
'
timbal-codegen add-tool --type Custom --definition '
async def http_request(
    url: str,
    method: str = "GET",
    headers: dict[str, str] | None = None,
    body: str | None = None,
) -> dict:
    import httpx
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.request(method, url, headers=headers, content=body)
        return {"status": resp.status_code, "body": resp.text}
'

# Configure the agent
timbal-codegen set-config --config '{"model": "anthropic/claude-sonnet-4-6", "system_prompt": "You are a helpful research assistant."}'
```

---

## Step-by-step migration process

1. **Read the n8n workflow** — identify all nodes, their types, and how they connect
2. **Choose entry point** — Agent (single LLM + tools) or Workflow (multi-step pipeline). See the decision table above
3. **Map each node** — use the concept mapping table to find the Timbal equivalent
4. **Discover tools** — run `timbal-codegen get-tools --search "..."` to find framework tools that match n8n action nodes. Use custom tools for anything not covered
5. **Build the steps/tools** — add them with codegen commands
6. **Wire data flow** — use `set-param` to connect outputs to inputs. This is the biggest mental shift from n8n — you must explicitly declare data dependencies
7. **Add ordering** — use `add-edge` for execution order that isn't already implied by `set-param`. Use `--when` for conditional branches
8. **Configure** — set models, system prompts, and tool configs with `set-config`
9. **Test** — run `timbal-codegen test --input '{"key": "value"}'` to verify

---

## Common n8n nodes → Timbal tool search

When you encounter these n8n nodes, search for the equivalent Timbal tool:

```bash
# Gmail nodes
timbal-codegen get-tools --search "gmail"

# Slack nodes
timbal-codegen get-tools --search "slack"

# Google Sheets
timbal-codegen get-tools --search "sheets"

# HTTP Request — use a custom tool (no direct equivalent)
# See Pattern 4 above for the httpx template

# Database nodes (Postgres, MySQL) — check if a knowledge base fits
# Otherwise use a custom tool with the appropriate Python driver
```

For any n8n node, try `get-tools --search "<service name>"` first. If nothing matches, write a custom tool.

---

## Things that don't map directly

| n8n feature | Timbal approach |
|---|---|
| **Credentials** | Use environment variables or Timbal's managed credentials (configured in the platform, not in code) |
| **Error trigger** | Handle errors in custom tool code with try/except |
| **Retry on fail** | Implement retry logic in custom tools (e.g., `tenacity` library) |
| **Webhook trigger** | Timbal workflows are invoked via API — deploy and call the endpoint |
| **Cron/Schedule trigger** | Use external scheduling (cron, cloud scheduler) to call the deployed workflow |
| **Sticky notes** | Use Python comments in workflow.py |
| **Manual execution with test data** | `timbal-codegen test --input '{...}'` |
