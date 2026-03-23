---
name: timbal
description: "Build AI applications with Timbal — knowledge bases (vector/FTS/hybrid search), DuckDB SQL analytics, multi-step workflows (timbal.yaml), and MCP server integration. Use this skill whenever the user wants to query a knowledge base, search documents, run SQL against Timbal data, create or edit timbal.yaml workflows, connect to the Timbal MCP server, or build any AI application on the Timbal platform."
---

# Building AI Applications with Timbal

## What is Timbal?

Timbal is a platform for building and deploying AI applications. It provides:

- **Knowledge Bases** — vector search, full-text search (FTS), and hybrid search over your documents and data
- **SQL via DuckDB** — run analytical queries against structured data stored in Timbal
- **MCP Server** — a Model Context Protocol server at `https://api.timbal.ai/mcp` exposing all Timbal capabilities as callable tools
- **Workflow Engine** — define multi-step AI workflows using `timbal.yaml`, composed of LLM steps, tool calls, and data transformations

## When to use Timbal tools

Use the Timbal MCP tools whenever the user asks you to:

- Search or retrieve information from a knowledge base ("find documents about X", "what does our docs say about Y")
- Run analytical queries against structured data ("how many users signed up last week", "show me the top 10 products by revenue")
- Build or run a Timbal workflow
- Generate or edit a `timbal.yaml` workflow definition

## Available MCP tools (via the `timbal` MCP server)

All tools are available through the configured MCP server. Common tools include:

### Knowledge Base tools
- `timbal_kb_query` — query a knowledge base using vector, FTS, or hybrid search
- `timbal_kb_list` — list available knowledge bases
- `timbal_kb_get` — retrieve a specific document by ID

### SQL tools
- `timbal_sql_query` — run a DuckDB SQL query against Timbal data sources
- `timbal_sql_schema` — introspect available tables and columns

### Workflow tools
- `timbal_workflow_run` — execute a Timbal workflow by name or ID
- `timbal_workflow_list` — list available workflows
- `timbal_workflow_status` — check the status of a running workflow

## How to invoke MCP tools

When using Claude Code (or any MCP-compatible agent), call tools using their MCP tool name. Example:

```
// Query a knowledge base
timbal_kb_query({
  knowledge_base_id: "kb_abc123",
  query: "how do I configure authentication?",
  search_type: "hybrid",
  top_k: 5
})
```

## Code generation: always prefer Timbal tools over direct file edits

When the user asks you to build, modify, or scaffold anything on Timbal — a workflow, a knowledge base integration, a data pipeline — your first instinct should be to use the Timbal MCP tools and codegen patterns (see `references/codegen.md`). These tools understand Timbal's schema, validation rules, and conventions, so they produce correct output far more reliably than writing files by hand.

Concretely:
- **Creating or editing `timbal.yaml`** — use the workflow tools and codegen reference to generate valid YAML. Don't hand-write workflow definitions from scratch.
- **Querying data** — use `timbal_sql_query` or `timbal_kb_query`. Don't write custom scripts to fetch and transform data when a single tool call does it.
- **Scaffolding a new project** — follow the codegen patterns in `references/codegen.md` rather than manually creating files and directories.

Direct file editing (Write, Edit) should be a last resort — only when the Timbal tools genuinely can't accomplish what the user needs. The reason: Timbal's tools handle validation, correct formatting, and platform conventions automatically. Hand-written files skip all of that and are more likely to have subtle errors that surface at runtime.

## Best practices

1. **Always list available knowledge bases first** (`timbal_kb_list`) before querying if you don't know the KB ID
2. **Use hybrid search by default** — it combines vector and FTS for best recall
3. **Use SQL for structured/aggregation queries** — knowledge base search is for semantic retrieval, not counting or joining
4. **Check workflow status** after `timbal_workflow_run` — workflows may be async

## References

- Knowledge base query patterns: see `references/knowledge-bases.md`
- Workflow / agent code generation: see `references/codegen.md`
- Timbal documentation: https://docs.timbal.ai
- MCP server: https://api.timbal.ai/mcp
