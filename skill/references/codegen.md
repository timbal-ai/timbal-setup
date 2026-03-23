# Timbal Workflow & Agent Code Generation Reference

## Overview

Timbal workflows are defined in `timbal.yaml`. A workflow is a directed acyclic graph (DAG) of **steps**, where each step is:
- An **LLM call** (using a model like GPT-4o, Claude, Gemini, etc.)
- A **tool call** (calling an MCP tool, a Python function, or a Timbal built-in)
- A **data transformation** (map, filter, template rendering)
- A **subworkflow** invocation

---

## timbal.yaml structure

```yaml
# timbal.yaml
name: my-workflow
version: "1.0"
description: "A short description of what this workflow does"

# Optional: default model settings applied to all LLM steps unless overridden
defaults:
  model: gpt-4o
  temperature: 0.2
  max_tokens: 2048

# Entry point: the name of the first step to execute
entry: classify_request

# Steps: the nodes in the workflow DAG
steps:
  classify_request:
    type: llm
    model: gpt-4o-mini        # overrides default
    temperature: 0
    system: |
      You are a request classifier. Given a user request, output one of:
      "knowledge_base", "sql_query", or "general"
    input:
      user_message: "{{ inputs.user_message }}"
    output: classification
    next:
      - when: "{{ classification == 'knowledge_base' }}"
        step: search_kb
      - when: "{{ classification == 'sql_query' }}"
        step: run_sql
      - default: respond_general

  search_kb:
    type: tool
    tool: timbal_kb_query
    args:
      knowledge_base_id: "{{ inputs.kb_id }}"
      query: "{{ inputs.user_message }}"
      search_type: hybrid
      top_k: 5
    output: kb_results
    next: synthesize_response

  run_sql:
    type: tool
    tool: timbal_sql_query
    args:
      query: "{{ inputs.sql_query }}"
    output: sql_results
    next: synthesize_response

  synthesize_response:
    type: llm
    model: gpt-4o
    system: |
      You are a helpful assistant. Synthesize the retrieved data into a clear answer.
    input:
      user_message: "{{ inputs.user_message }}"
      data: "{{ kb_results | default(sql_results) }}"
    output: final_answer
    next: __end__

  respond_general:
    type: llm
    model: gpt-4o
    system: "You are a helpful assistant."
    input:
      user_message: "{{ inputs.user_message }}"
    output: final_answer
    next: __end__

# Inputs schema (validated at runtime)
inputs:
  user_message:
    type: string
    required: true
  kb_id:
    type: string
    default: "kb_default"
  sql_query:
    type: string
    required: false

# Outputs
outputs:
  answer: "{{ final_answer }}"
```

---

## Step types

### `type: llm`

Calls a language model.

| Field | Type | Description |
|-------|------|-------------|
| `model` | string | Model ID (e.g. `gpt-4o`, `claude-3-5-sonnet-20241022`, `gemini-1.5-pro`) |
| `temperature` | float | 0.0–2.0 |
| `max_tokens` | integer | Maximum output tokens |
| `system` | string | System prompt (supports Jinja2 templating) |
| `input` | object | Key/value pairs passed as the user message context |
| `output` | string | Variable name to store the model's text output |
| `tools` | list | MCP tool names to make available to the model |

### `type: tool`

Calls an MCP tool or built-in function.

| Field | Type | Description |
|-------|------|-------------|
| `tool` | string | Tool name (e.g. `timbal_kb_query`, `timbal_sql_query`) |
| `args` | object | Arguments passed to the tool (supports templating) |
| `output` | string | Variable name to store the tool's return value |

### `type: transform`

Applies a data transformation inline.

```yaml
normalize_results:
  type: transform
  input: "{{ kb_results }}"
  expression: "items | map(attribute='content') | list"
  output: content_list
  next: summarize
```

### `type: subworkflow`

Invokes another Timbal workflow.

```yaml
call_sub:
  type: subworkflow
  workflow: "my-other-workflow"
  inputs:
    query: "{{ inputs.user_message }}"
  output: sub_result
  next: __end__
```

---

## Tool wiring

To give an LLM step access to MCP tools, list them under `tools`:

```yaml
agent_step:
  type: llm
  model: gpt-4o
  system: "You are an agent. Use the available tools to answer the user's question."
  input:
    user_message: "{{ inputs.user_message }}"
  tools:
    - timbal_kb_query
    - timbal_sql_query
    - timbal_kb_list
  output: agent_response
  next: __end__
```

The model will autonomously decide when and how to call the tools. Tool results are automatically fed back into the conversation loop until the model produces a final response.

---

## Model settings

### Supported model identifiers

| Provider | Model IDs |
|----------|-----------|
| OpenAI | `gpt-4o`, `gpt-4o-mini`, `gpt-4-turbo`, `o1`, `o3-mini` |
| Anthropic | `claude-3-5-sonnet-20241022`, `claude-3-5-haiku-20241022`, `claude-3-opus-20240229` |
| Google | `gemini-1.5-pro`, `gemini-1.5-flash`, `gemini-2.0-flash` |
| Mistral | `mistral-large-latest`, `mistral-small-latest` |

### Model defaults block

```yaml
defaults:
  model: gpt-4o
  temperature: 0.1
  max_tokens: 4096
  top_p: 1.0
```

Individual steps can override any default:

```yaml
steps:
  fast_step:
    type: llm
    model: gpt-4o-mini    # cheaper/faster than default
    temperature: 0        # deterministic
```

---

## Entry points

The `entry` field must match a step name. When the workflow is invoked (via `timbal_workflow_run` or the CLI), execution begins at the entry step.

```yaml
entry: my_first_step
```

Use `next: __end__` to terminate the workflow from any step.

---

## Templating

Timbal uses **Jinja2** syntax for dynamic values:

```yaml
# Reference workflow inputs
query: "{{ inputs.user_message }}"

# Reference a previous step's output
data: "{{ kb_results }}"

# Conditional / default
value: "{{ some_var | default('fallback') }}"

# Filters
titles: "{{ results | map(attribute='title') | list }}"

# Conditional expression
greeting: "{{ 'Hello' if inputs.formal else 'Hey' }}"
```

---

## Running a workflow via MCP

```json
{
  "tool": "timbal_workflow_run",
  "arguments": {
    "workflow": "my-workflow",
    "inputs": {
      "user_message": "What are our Q4 revenue figures?",
      "kb_id": "kb_financials"
    }
  }
}
```

Check status for async workflows:

```json
{
  "tool": "timbal_workflow_status",
  "arguments": {
    "run_id": "run_abc123"
  }
}
```

---

## Common patterns

### Simple RAG workflow
1. `search_kb` (type: tool) → retrieve relevant chunks
2. `synthesize` (type: llm) → generate answer from chunks

### Agentic loop
Single LLM step with `tools` list — the model loops tool calls until it has a final answer.

### Classify-and-route
LLM step with `temperature: 0` outputs a classification label; `next` conditions branch to different steps.

### SQL + narrative
`timbal_sql_query` → data table → LLM step that narrates the data as prose.
