---
name: timbal
description: "Build AI applications with Timbal — knowledge bases (vector/FTS/hybrid search via SQL), multi-step workflows (timbal.yaml), and MCP server integration. Use this skill whenever the user wants to query a knowledge base, search Timbal documentation, inspect project settings, create or edit timbal.yaml workflows, or build any AI application on the Timbal platform. Also trigger when the user mentions Timbal, knowledge bases, vector search, hybrid search, or timbal.yaml — even if they don't explicitly say 'Timbal'."
---

# Building AI Applications with Timbal

## What is Timbal?

Timbal is a platform for building and deploying AI applications. It provides:

- **Knowledge Bases** — vector search, full-text search (FTS), and hybrid search over your documents and data, all accessible via SQL with special search functions
- **MCP Server** — a Model Context Protocol server at `https://api.dev.timbal.ai/mcp` exposing all Timbal capabilities as callable tools
- **Workflow Engine** — define multi-step AI workflows in Python using `Agent` and `Workflow` classes, with a codegen CLI (`python -m timbal.codegen`) for safe code transformations

## When to use Timbal tools

Use the Timbal MCP tools whenever the user asks you to:

- Search or retrieve information from a knowledge base ("find documents about X", "what does our docs say about Y")
- Run analytical SQL queries against knowledge base data ("how many documents cover topic Z", "list all entries tagged with Y")
- Look up Timbal documentation, examples, or API references
- Inspect the current project's settings or KB schema
- Build or edit a Timbal agent or workflow (using the codegen CLI)

## Available MCP tools

All tools are prefixed with `mcp__timbal__` when called. Here are the 5 available tools:

### Setup & context
- **`set_project_context`** — Detect the org and project from a git remote URL. **Must be called before using `get_project`, `get_knowledge_base_schema`, or `query_knowledge_base`.** Not needed for `whoami` or local CLI tools like `timbal-codegen`.
  - Parameter: `git_remote_url` (string, required)

### User & project info
- **`whoami`** — Get information about the currently authenticated user. No parameters.
- **`get_project`** — Get details of the current project (name, workforce items, settings). Requires `set_project_context` first. No parameters.

### Knowledge base
- **`get_knowledge_base_schema`** — Get the schema of the knowledge base linked to the current project. Returns SQL DDL (`CREATE TABLE` statements) describing tables, columns, indexes, and constraints. Use this to understand the data structure before writing queries. Requires `set_project_context` first. No parameters.
- **`query_knowledge_base`** — Execute a SQL query against the knowledge base. This is the primary tool for all data retrieval — both search and analytics. Requires `set_project_context` first.
  - Parameter: `sql` (string, required) — SQL query with `$1`, `$2`, etc. for parameter placeholders
  - Parameter: `params` (array, optional) — positional parameters; strings in search positions are auto-embedded into vectors
  - Supports three special search functions:
    - `vector_search('table', $1, limit)` — semantic similarity
    - `fts_search('table', $1, limit)` — full-text BM25
    - `hybrid_search('table', $1, $2, limit)` — combined vector + text

### Documentation
If this skill and its references don't cover what you need, search `docs.timbal.ai` via web search as a last resort. Prefer using the information in this skill and `references/` first — it's faster and more reliable than a web lookup.

## Workflow for using Timbal tools

### For knowledge base queries (MCP tools)
1. **Set context first** — call `set_project_context` with the git remote URL
2. **Understand the schema** — call `get_knowledge_base_schema` to see available tables and columns
3. **Query data** — use `query_knowledge_base` with SQL (and search functions for semantic retrieval)

### For codegen operations (local CLI)
Use `timbal-codegen` directly — no MCP setup needed. See `references/codegen.md`.

### For documentation lookups
Use this skill and `references/` first. Only if the answer isn't covered here, fall back to web search on `docs.timbal.ai`.

## How to invoke MCP tools

Call tools using the `mcp__timbal__` prefix. Examples:

```
// Set project context (always do this first)
mcp__timbal__set_project_context({ git_remote_url: "https://github.com/acme/my-agent.git" })

// Get KB schema
mcp__timbal__get_knowledge_base_schema()

// Hybrid search
mcp__timbal__query_knowledge_base({
  sql: "SELECT * FROM hybrid_search('documents', $1, $2, 5)",
  params: ["authentication best practices", "authentication best practices"]
})

// Standard SQL analytics
mcp__timbal__query_knowledge_base({
  sql: "SELECT category, COUNT(*) as cnt FROM documents GROUP BY category ORDER BY cnt DESC"
})
```

## Best practices

1. **Call `set_project_context` before KB queries** — `get_project`, `get_knowledge_base_schema`, and `query_knowledge_base` require it; `whoami` and `timbal-codegen` do not
2. **Always call `get_knowledge_base_schema` before querying** — so you know the actual table names and columns
3. **Use hybrid search by default** — it combines vector and FTS for best recall
4. **Use plain SQL for structured/aggregation queries** — search functions are for semantic retrieval, not counting or joining
5. **For platform questions** — use this skill and its references first; only fall back to web search on `docs.timbal.ai` if the answer isn't here

## References

- Knowledge base query patterns: see `references/knowledge-bases.md`
- Codegen CLI (add tools, steps, configure agents): see `references/codegen.md`
- Timbal documentation: https://docs.timbal.ai
- MCP server: https://api.dev.timbal.ai/mcp
