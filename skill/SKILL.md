---
name: timbal
description: "Build AI applications with Timbal — knowledge bases (vector/FTS/hybrid search via SQL), multi-step workflows (timbal.yaml), MCP server integration, and frontend UIs (React + Vite + Shadcn chat apps). Use this skill whenever the user wants to: query a knowledge base; create or edit timbal.yaml workflows; modify workflow.py or any workforce file; add/remove agents, tools, steps, or edges in a workflow; build any AI application on the Timbal platform; modify frontend UI code (components, pages, styles, animations, themes, fonts, CSS, the chat interface, welcome screen, or anything under ui/src/); add or change API routes; or inspect project settings. Also trigger when the user mentions Timbal, knowledge bases, vector search, hybrid search, timbal.yaml, workforce, streaming, chat UI, assistant-ui, Shadcn, Radix, Tailwind theming, or index.css — even if they don't explicitly say 'Timbal'. When the user's request touches UI files, read references/ui.md first — it contains critical runtime environment constraints (no package manager available) and architectural rules."
---

# Building AI Applications with Timbal

## What is Timbal?

Timbal is a platform for building and deploying AI applications. It provides:

- **Workflow Engine** — define multi-step AI workflows in Python using `Agent` and `Workflow` classes, with a codegen CLI (`timbal-codegen`) for safe code transformations
- **Knowledge Bases** — vector search, full-text search (FTS), and hybrid search over your documents and data, powered by DuckDB and accessible via SQL with special search functions
- **MCP Server** — a Model Context Protocol server at `https://api.dev.timbal.ai/mcp` exposing all Timbal capabilities as callable tools

## Workflow rules — follow these exactly

- **Always use `timbal-codegen` for any workflow modification.** Never use Edit or Write on workflow.py under any circumstances — if you think codegen can't do it, you haven't read `references/codegen.md` yet. Read it first.
- **Never do a dry-run** before applying codegen changes. Apply directly.
- **Read `references/codegen.md`** before using the codegen CLI — it has exact syntax, valid fields, and examples for every operation.
- **Use `timbal-codegen get-flow --format compact`** to understand and verify workflow state — it executes the Python, validates the graph at runtime, and can surface import/configuration errors. Always pass `--format compact` for LLM consumption (16x smaller than the default JSON). Only read workflow.py when you need to inspect raw Python logic that get-flow doesn't expose.
- **Chain independent CLI commands with `&&`** in a single Bash call when possible.

## Codegen operations (local CLI)

Use `timbal-codegen` directly — no MCP setup needed. See `references/codegen.md` for the full reference.

```bash
timbal-codegen [--path <workspace>] <operation> [options]
```

**Always pass `--path <workforce-dir>`** (e.g. `--path workforce/jolly-ferret`) unless your shell's working directory is already inside the workforce folder. Without `--path`, codegen silently no-ops — it produces no output and makes no changes, with no error.

Key operations: `add-tool`, `remove-tool`, `add-step`, `remove-step`, `set-config`, `set-param`, `add-edge`, `remove-edge`, `get-flow`, `get-tools`, `get-models`, `convert-to-workflow`.

**Anthropic models require `max_tokens`** — always set it when using any `anthropic/` model (e.g. `"max_tokens": 4096`). They will fail without it.

**Extended thinking** — supported on Anthropic models via `model_params`. See `references/codegen.md` for per-model thinking modes and examples. Key rule: Opus 4.6 uses `"type": "adaptive"` only; all others use `"type": "enabled"` with `budget_tokens` (must be < `max_tokens`).

## Knowledge base queries (MCP tools)

1. **Set context first** — call `set_project_context` with a `project_ref` (git remote URL, filesystem path, or project ID)
2. **Understand the schema** — call `get_knowledge_base_schema`
3. **Query data** — use `query_knowledge_base` with SQL

All MCP tools are prefixed with `mcp__timbal__`. They are **registered tool calls in your tool list — not bash commands.** Never attempt to invoke them via Bash. If they don't appear in your available tools, the MCP server is not configured in this session.

Available tools:

- **`set_project_context`** — required before `get_project`, `get_knowledge_base_schema`, or `query_knowledge_base`. Parameter: `project_ref` — accepts a git remote URL, a git worktree path, a filesystem path, or a Timbal project ID. The working directory path (e.g. `/mnt/efs/timbal/orgs/1/projects/255/main`) always works — prefer it over trying to find a git remote.
- **`whoami`** — current authenticated user. No setup needed.
- **`get_project`** — org/environment/KB metadata and repository URL. Only call this when you specifically need that metadata — not as a routine step before KB queries.
- **`get_knowledge_base_schema`** — returns SQL DDL for KB tables. Call this when you are about to query or modify KB data. Skip it for workflow or UI tasks.
- **`query_knowledge_base`** — execute SQL against the KB. Requires `set_project_context`.
  - `sql` (string) — use `$1`, `$2` for placeholders
  - `params` (array, optional) — strings are auto-embedded into vectors
  - Search functions: `vector_search('table', $1, limit)`, `fts_search('table', $1, limit)`, `hybrid_search('table', $1, $2, limit)`

Use hybrid search by default. Use plain SQL for aggregation/analytics. Knowledge bases run on DuckDB — use DuckDB syntax, not PostgreSQL (e.g. `list_contains()` not `@>`).

## Documentation lookups

Use this skill and `references/` first. Only fall back to web search on `docs.timbal.ai` if the answer isn't here.

## What are you building?

| Goal | Reference |
|------|-----------|
| AI workflow or agent | `references/codegen.md` |
| Knowledge base queries | `references/knowledge-bases.md` |
| API routes (Elysia + Timbal SDK) | `references/integration.md` |
| Frontend UI (React, Vite, Shadcn, chat, styling) | `references/ui.md` |
| Full-stack app (API + UI) | `references/integration.md` + `references/ui.md` |
| Migrating from another platform | See migration guides below |

## References

- **Frontend UI** (React, Vite, Shadcn, chat interface, styling, runtime constraints): see `references/ui.md`
- **API Integration** (Elysia routes + Timbal SDK): see `references/integration.md`
- Knowledge base query patterns: see `references/knowledge-bases.md`
- Codegen CLI (add tools, steps, configure agents): see `references/codegen.md`
- Migrating n8n workflows to Timbal: see `references/n8n-to-timbal.md`
- Migrating LangChain / LangGraph to Timbal: see `references/langchain-to-timbal.md`
- Migrating CrewAI to Timbal: see `references/crewai-to-timbal.md`
- Migrating Make (Integromat) to Timbal: see `references/make-to-timbal.md`
- Migrating Zapier to Timbal: see `references/zapier-to-timbal.md`
- Timbal documentation: https://docs.timbal.ai
- MCP server: https://api.dev.timbal.ai/mcp
