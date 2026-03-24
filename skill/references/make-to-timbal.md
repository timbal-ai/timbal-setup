# Converting Make (Integromat) Scenarios to Timbal

## Overview

This reference maps Make.com scenario concepts to Timbal equivalents and provides codegen command sequences for common migration patterns. Use it when a user provides a Make blueprint JSON export or describes a Make scenario they want to rebuild in Timbal.

---

## Parsing Make blueprint JSON

Users can export Make scenarios as blueprint JSON files (three-dot menu → "Export Blueprint" in the scenario editor). When a user provides one, parse these key fields:

### Structure

```json
{
  "name": "My Scenario",
  "flow": [
    {
      "id": 1,
      "module": "google-sheets:TriggerWatchRows",
      "version": 2,
      "parameters": {
        "__IMTCONN__": 148576
      },
      "mapper": {
        "sheetId": "Sheet1",
        "spreadsheetId": "/1abc..."
      },
      "metadata": {
        "designer": { "x": 0, "y": 0 },
        "expect": [ /* input field definitions */ ],
        "interface": [ /* output field definitions */ ]
      }
    },
    {
      "id": 2,
      "module": "slack:ActionPostMessage",
      "mapper": {
        "channel": "C12345",
        "text": "New row: {{1.col_A}}"
      }
    }
  ],
  "metadata": {
    "instant": false,
    "version": 1
  }
}
```

### How to read it

1. **Walk `flow[]`** — modules execute in array order. Each entry is a step to convert. The `module` field tells you what kind of module it is (see naming table below). The `mapper` object has the user's configured values.
2. **Implicit connections** — unlike n8n, Make has no explicit `connections` object. Modules execute sequentially in `flow[]` array order unless a `builtin:BasicRouter` splits the flow into branches.
3. **Data references** — look for `{{moduleId.field}}` syntax in `mapper` values. For example, `{{1.col_A}}` references module 1's `col_A` output. This tells you which step depends on which.
4. **Routers** — a `builtin:BasicRouter` module contains a `routes` array, each with its own `flow[]` of modules. This is how Make handles branching.
5. **Filters** — placed on the first module of each route as a `filter` object with `conditions`. The conditions use `a` (left), `b` (right), `o` (operator) format.
6. **Ignore `parameters`** — `__IMTCONN__` and `__IMTHOOK__` are numeric IDs referencing Make account credentials/webhooks. They aren't included in exports. Note which services need auth so you can tell the user to configure credentials in Timbal.

### Module type naming convention

Module types follow the pattern `appSlug:ActionName`:

| Make `module` value | What it is |
|---|---|
| `gateway:CustomWebHook` | Webhook trigger |
| `builtin:Schedule` | Schedule trigger |
| `http:ActionSendData` | HTTP request |
| `http:ActionSendDataAPIKeyAuth` | HTTP request with API key |
| `gmail:ActionSendEmail` | Gmail send |
| `gmail:TriggerWatchEmails` | Gmail trigger |
| `slack:ActionPostMessage` | Slack post message |
| `slack:TriggerWatchMessages` | Slack trigger |
| `google-sheets:ActionAddRow` | Google Sheets add row |
| `google-sheets:TriggerWatchRows` | Google Sheets trigger |
| `google-sheets:SearchRows` | Google Sheets search |
| `google-drive:ActionUploadFile` | Google Drive upload |
| `openai:ActionCreateCompletion` | OpenAI completion |
| `openai-gpt-3:CreateChatCompletion` | OpenAI chat (older) |
| `builtin:BasicRouter` | Router (branching) |
| `builtin:BasicAggregator` | Aggregator (merge) |
| `builtin:BasicIterator` | Iterator (loop over array) |
| `builtin:SetVariable` | Set variable |
| `builtin:Compose` | Compose/transform text |
| `builtin:Sleep` | Delay/wait |
| `json:ParseJSON` | Parse JSON |
| `json:TransformToJSON` | Create JSON |

**Naming patterns:** Triggers use `Trigger` or `Watch` prefix. Actions use `Action` prefix. Searches use `Search` prefix. Older blueprints may use different names (e.g., `createAnEvent` vs `ActionCreateEvent`).

### Conversion process from JSON

1. Parse the JSON
2. Walk `flow[]` and build a module list — note each module's `id`, `module` type, and `mapper` values
3. Trace data references by scanning `mapper` values for `{{moduleId.field}}` patterns — this gives you the dependency graph
4. For `builtin:BasicRouter` modules: each entry in `routes[]` is a branch. Check `filter.conditions` on the first module of each route to determine the condition
5. Decide Agent vs Workflow (see decision table below)
6. Convert each module using the concept mapping table
7. Wire data flow with `set-param` based on the data references you found
8. Use `mapper` values to inform tool configs and static values

---

## Concept mapping

| Make concept | What it does | Timbal equivalent | Codegen command |
|---|---|---|---|
| **Trigger module** (Webhook, Schedule, Watch) | Starts the scenario on an event | Workflow input params — data is passed at invocation time | N/A (inputs are defined by step params) |
| **Action module** (Gmail, Slack, Sheets) | Calls an external service | Framework tool or workflow step | `add-tool --type GmailSend` or `add-step --type GmailSend` |
| **HTTP module** | Makes an API call | Custom tool with `httpx` | `add-tool --type Custom --definition '...'` |
| **OpenAI module** | LLM completion | Agent step | `add-step --type Agent --config '{...}'` |
| **Router** (`builtin:BasicRouter`) | Branches into parallel/conditional paths | Conditional edges or parallel steps | `add-edge --when` for filtered routes |
| **Filter** (on route entry) | Conditions for entering a route | Conditional edge | `add-edge --source A --target B --when 'lambda: ...'` |
| **Aggregator** (`builtin:BasicAggregator`) | Combines multiple items/branches | Step that depends on multiple sources via `set-param` | `set-param` from multiple sources |
| **Iterator** (`builtin:BasicIterator`) | Loops over array items | Custom step with a loop | `add-step --type Custom --definition '...'` |
| **Set Variable** | Sets a value for later use | Static param or custom step | `set-param --target X --name Y --type value --value '...'` |
| **Compose** | Transforms/formats text | Custom step | `add-step --type Custom --definition '...'` |
| **Sleep** | Delays execution | Custom async step with `asyncio.sleep` | `add-step --type Custom --definition 'async def delay(...)'` |
| **JSON Parse/Create** | Converts to/from JSON | Custom step | `add-step --type Custom --definition '...'` |
| **`{{moduleId.field}}`** data references | Passes data between modules | `set-param --type map` | `set-param --target B --name input --type map --source A` |

### Key difference: implicit flow vs explicit wiring

Make uses **implicit sequential flow** — modules execute in array order, and data flows via `{{id.field}}` template references that are resolved at runtime. Any module can reference any earlier module's output.

Timbal uses **explicit wiring** — each step declares where its inputs come from using `set-param`. There is no implicit ordering from array position. You must explicitly declare both data dependencies (`set-param`) and execution order (`add-edge`).

---

## Decision: Agent vs Workflow

| Make scenario shape | Timbal entry point | Why |
|---|---|---|
| Single OpenAI module with no other logic | **Agent** | One LLM call is what Agent does |
| OpenAI module + tools/HTTP calls around it | **Agent** with tools | LLM + tool-calling loop |
| Linear chain of action modules | **Workflow** | Multiple steps in sequence |
| Router with branches | **Workflow** | Need conditional edges |
| Multiple OpenAI modules in sequence | **Workflow** | Multi-agent pipeline |

---

## Migration patterns

### Pattern 1: Linear chain (Trigger → Action → Action)

**Make:** Watch Rows → HTTP Request → Slack Message

**Timbal:**
```bash
# Step 1: HTTP request as a custom step
timbal-codegen add-step --type Custom --definition '
async def fetch_data(url: str) -> dict:
    import httpx
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.get(url)
        return {"status": resp.status_code, "body": resp.json()}
'

# Step 2: Send to Slack
timbal-codegen add-step --type SlackPostMessage

# Wire data flow
timbal-codegen set-param --target slack_post_message --name text --type map --source fetch_data
timbal-codegen set-param --target slack_post_message --name channel --type value --value '"#general"'

# Ordering
timbal-codegen add-edge --source fetch_data --target slack_post_message
```

### Pattern 2: Router with filters (branching)

**Make:** HTTP Request → Router → [Filter: status=200 → Slack] / [Filter: status≠200 → Gmail]

**Timbal:**
```bash
timbal-codegen add-step --type Custom --definition '
async def api_call(url: str) -> dict:
    import httpx
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.get(url)
        return {"status": resp.status_code, "body": resp.text}
'

timbal-codegen add-step --type SlackPostMessage
timbal-codegen add-step --type GmailSend

# Router filters become conditional edges
timbal-codegen add-edge --source api_call --target slack_post_message \
  --when 'lambda: get_run_context().step_span("api_call").output["status"] == 200'

timbal-codegen add-edge --source api_call --target gmail_send \
  --when 'lambda: get_run_context().step_span("api_call").output["status"] != 200'

# Wire data into each branch
timbal-codegen set-param --target slack_post_message --name text --type map --source api_call
timbal-codegen set-param --target gmail_send --name body --type map --source api_call
```

### Pattern 3: OpenAI chat + tools

**Make:** Webhook → OpenAI Chat Completion → HTTP Request (API call) → Compose (format) → Slack

**Timbal:**
```bash
# If the OpenAI module is the core and HTTP/Compose are supporting it,
# this maps to an Agent with tools

timbal-codegen set-config --config '{
  "model": "openai/gpt-4o",
  "max_tokens": 4096,
  "system_prompt": "You are a helpful assistant."
}'

timbal-codegen add-tool --type Custom --definition '
async def call_api(url: str, method: str = "GET") -> dict:
    import httpx
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.request(method, url)
        return {"status": resp.status_code, "body": resp.text}
'

# If there's post-processing after the agent, convert to workflow first:
# timbal-codegen convert-to-workflow
# Then add post-processing steps
```

### Pattern 4: Parallel branches + aggregator

**Make:** Trigger → Router (no filters) → [Search A, Search B] → Aggregator → Compose

**Timbal:**
```bash
# Unfiltered router branches = parallel steps
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

# Aggregator + Compose → a step that merges results
timbal-codegen add-step --type Custom --definition '
def combine(result_a: str, result_b: str) -> str:
    return f"Results A:\n{result_a}\n\nResults B:\n{result_b}"
'

timbal-codegen set-param --target combine --name result_a --type map --source search_a
timbal-codegen set-param --target combine --name result_b --type map --source search_b
```

### Pattern 5: Multi-step AI pipeline

**Make:** Webhook → OpenAI (research) → OpenAI (draft) → OpenAI (review) → Slack

**Timbal:**
```bash
timbal-codegen add-step --type Agent --config '{
  "name": "researcher",
  "model": "openai/gpt-4o",
  "max_tokens": 4096,
  "system_prompt": "Research the given topic thoroughly and provide key findings."
}'

timbal-codegen add-step --type Agent --config '{
  "name": "drafter",
  "model": "openai/gpt-4o",
  "max_tokens": 4096,
  "system_prompt": "Write a draft based on the provided research."
}'

timbal-codegen add-step --type Agent --config '{
  "name": "reviewer",
  "model": "openai/gpt-4o",
  "max_tokens": 4096,
  "system_prompt": "Review and improve the provided draft."
}'

timbal-codegen add-step --type SlackPostMessage

# Wire data flow
timbal-codegen set-param --target drafter --name prompt --type map --source researcher
timbal-codegen set-param --target reviewer --name prompt --type map --source drafter
timbal-codegen set-param --target slack_post_message --name text --type map --source reviewer
timbal-codegen set-param --target slack_post_message --name channel --type value --value '"#content"'

# Ordering
timbal-codegen add-edge --source researcher --target drafter
timbal-codegen add-edge --source drafter --target reviewer
timbal-codegen add-edge --source reviewer --target slack_post_message
```

---

## Translating Make filter conditions

Make filter conditions use `a` (left), `b` (right), `o` (operator) format. Map these to Timbal conditional edge lambdas:

| Make operator (`o`) | Meaning | Timbal lambda pattern |
|---|---|---|
| `text:equal` | Equals (case-sensitive) | `== "value"` |
| `text:equal:ci` | Equals (case-insensitive) | `.lower() == "value"` |
| `not_equal` | Not equals | `!= "value"` |
| `exist` | Field exists / is not empty | `is not None and len(...) > 0` |
| `text:startsWith` | Starts with | `.startswith("value")` |
| `text:contains` | Contains | `"value" in ...` |

The `a` value will contain `{{moduleId.field}}` — map this to `get_run_context().step_span("step_name").output.field` in the lambda.

---

## Common Make modules → Timbal tool search

```bash
# Gmail modules
timbal-codegen get-tools --search "gmail"

# Slack modules
timbal-codegen get-tools --search "slack"

# Google Sheets modules
timbal-codegen get-tools --search "sheets"

# Google Drive modules
timbal-codegen get-tools --search "drive"

# HTTP modules — use a custom tool (no direct equivalent)
# See Pattern 1 above for the httpx template

# OpenAI modules — use an Agent step instead
# timbal-codegen add-step --type Agent --config '{...}'
```

For any Make module, try `get-tools --search "<service name>"` first. If nothing matches, write a custom tool.

---

## Step-by-step migration process

1. **Read the blueprint** — parse the JSON or read the user's description
2. **Build the module list** — walk `flow[]` noting each module's `id`, `module` type, and `mapper`
3. **Trace data flow** — scan `mapper` values for `{{id.field}}` references to build the dependency graph
4. **Identify routers** — `builtin:BasicRouter` modules split into branches. Check filters on each route's first module
5. **Choose entry point** — Agent (single OpenAI module + tools) or Workflow (multi-step). See the decision table
6. **Map each module** — use the concept mapping table to find the Timbal equivalent
7. **Discover tools** — run `get-tools --search "..."` for service modules. Use custom tools for HTTP and utility modules
8. **Wire data flow** — use `set-param` to connect outputs to inputs based on the `{{id.field}}` references you traced
9. **Add ordering and conditions** — `add-edge` for sequential flow, `add-edge --when` for router filter conditions
10. **Test** — run `timbal-codegen test --input '{...}'` to verify

---

## Things that don't map directly

| Make feature | Timbal approach |
|---|---|
| **Credentials** (`__IMTCONN__`) | Use environment variables or Timbal's managed credentials (configured in the platform, not in code) |
| **Webhook trigger** | Timbal workflows are invoked via API — deploy and call the endpoint |
| **Schedule trigger** | Use external scheduling (cron, cloud scheduler) to call the deployed workflow |
| **Iterator** (`builtin:BasicIterator`) | Use a custom step with a Python loop |
| **Aggregator** (`builtin:BasicAggregator`) | Use a custom step that receives multiple inputs via `set-param` |
| **Error handlers** (`Break`, `Rollback`, `Ignore`, `Resume`) | Handle errors in custom tool/step code with try/except |
| **Data stores** | Use Timbal knowledge bases or external databases |
| **Variables** (`SetVariable`, `GetVariable`) | Use `set-param --type value` for static values, or wire between steps |
| **Scenario scheduling** (interval, cron) | Use external scheduling to call the deployed workflow |
| **Incomplete executions / retry queue** | Timbal handles retries at the platform level |
