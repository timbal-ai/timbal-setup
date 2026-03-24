---
name: timbal
description: "Build AI applications with Timbal — knowledge bases (vector/FTS/hybrid search via SQL), multi-step workflows (timbal.yaml), and MCP server integration. Use this skill whenever the user wants to query a knowledge base, search Timbal documentation, inspect project settings, create or edit timbal.yaml workflows, or build any AI application on the Timbal platform. Also trigger when the user mentions Timbal, knowledge bases, vector search, hybrid search, or timbal.yaml — even if they don't explicitly say 'Timbal'."
---

# Building AI Applications with Timbal

## What is Timbal?

Timbal is a platform for building and deploying AI applications. It provides:

- **Workflow Engine** — define multi-step AI workflows in Python using `Agent` and `Workflow` classes, with a codegen CLI (`timbal-codegen`) for safe code transformations
- **Knowledge Bases** — vector search, full-text search (FTS), and hybrid search over your documents and data, all accessible via SQL with special search functions
- **MCP Server** — a Model Context Protocol server at `https://api.dev.timbal.ai/mcp` exposing all Timbal capabilities as callable tools

## Workflow rules — follow these exactly

- **Always use `timbal-codegen` for any workflow modification.** Never use Edit or Write on workflow.py directly — that is an absolute last resort only if the codegen CLI cannot accomplish the task.
- **Never do a dry-run** before applying codegen changes. Apply directly.
- **Never verify after applying changes.** No re-reading workflow.py, no get-flow, no post-change checks. timbal-codegen is atomic and will error on failure — trust it.
- **Never read `references/codegen.md`** for common operations — only read it for rare operations not covered here.
- **Read workflow.py** to understand the current state when needed. Do not use `get-flow` for this — it returns verbose JSON that wastes tokens.
- **Chain independent CLI commands with `&&`** in a single Bash call when possible.

## Codegen operations (local CLI)

Use `timbal-codegen` directly — no MCP setup needed. See `references/codegen.md` for the full reference.

```bash
timbal-codegen [--path <workspace>] <operation> [options]
```

Key operations: `add-tool`, `remove-tool`, `add-step`, `remove-step`, `set-config`, `set-param`, `add-edge`, `remove-edge`, `get-flow`, `get-tools`, `get-models`, `convert-to-workflow`.

**Anthropic models require `max_tokens`** — always set it when using any `anthropic/` model (e.g. `"max_tokens": 4096`). They will fail without it.

**Extended thinking** — supported on Anthropic models via `model_params`. See `references/codegen.md` for per-model thinking modes and examples. Key rule: Opus 4.6 uses `"type": "adaptive"` only; all others use `"type": "enabled"` with `budget_tokens` (must be < `max_tokens`).

## Knowledge base queries (MCP tools)

1. **Set context first** — call `set_project_context` with the git remote URL
2. **Understand the schema** — call `get_knowledge_base_schema`
3. **Query data** — use `query_knowledge_base` with SQL

All MCP tools are prefixed with `mcp__timbal__`. Available tools:

- **`set_project_context`** — required before `get_project`, `get_knowledge_base_schema`, or `query_knowledge_base`. Parameter: `git_remote_url`.
- **`whoami`** — current authenticated user. No setup needed.
- **`get_project`** — project details. Requires `set_project_context`.
- **`get_knowledge_base_schema`** — returns SQL DDL for KB tables. Requires `set_project_context`.
- **`query_knowledge_base`** — execute SQL against the KB. Requires `set_project_context`.
  - `sql` (string) — use `$1`, `$2` for placeholders
  - `params` (array, optional) — strings are auto-embedded into vectors
  - Search functions: `vector_search('table', $1, limit)`, `fts_search('table', $1, limit)`, `hybrid_search('table', $1, $2, limit)`

Use hybrid search by default. Use plain SQL for aggregation/analytics.

## Documentation lookups

Use this skill and `references/` first. Only fall back to web search on `docs.timbal.ai` if the answer isn't here.

## References

- Knowledge base query patterns: see `references/knowledge-bases.md`
- Codegen CLI (add tools, steps, configure agents): see `references/codegen.md`
- Migrating n8n workflows to Timbal: see `references/n8n-to-timbal.md`
- Migrating LangChain / LangGraph to Timbal: see `references/langchain-to-timbal.md`
- Migrating CrewAI to Timbal: see `references/crewai-to-timbal.md`
- Migrating Make (Integromat) to Timbal: see `references/make-to-timbal.md`
- Timbal documentation: https://docs.timbal.ai
- MCP server: https://api.dev.timbal.ai/mcp
