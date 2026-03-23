# Timbal Knowledge Bases — Query Reference

## Overview

Timbal knowledge bases are queried via SQL using the `query_knowledge_base` MCP tool. Three special search functions are available for semantic retrieval:

| Function | When to use |
|----------|-------------|
| `vector_search('table', query, limit)` | Semantic / conceptual similarity ("find documents about authentication patterns") |
| `fts_search('table', query, limit)` | Keyword / exact phrase matching ("find documents containing 'OAuth2'") |
| `hybrid_search('table', query, query, limit)` | Best of both worlds — use this as the default for most queries |

All search queries go through `query_knowledge_base`. String parameters in search positions are automatically embedded into vectors.

---

## Setup: always do this first

Before any query, you must set the project context and inspect the schema:

```
// 1. Set project context
mcp__timbal__set_project_context({ git_remote_url: "<git-remote-url>" })

// 2. Get the schema so you know table names and columns
mcp__timbal__get_knowledge_base_schema()
```

The schema returns `CREATE TABLE` statements — use these to understand available tables, columns, and types before writing queries.

---

## MCP Tool: `query_knowledge_base`

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `sql` | string | yes | SQL query. Use `$1`, `$2`, etc. for parameter placeholders |
| `params` | array | no | Positional parameters. Strings in search positions are auto-embedded |

---

## Search examples

### Vector search (semantic similarity)

```json
{
  "sql": "SELECT * FROM vector_search('documents', $1, 5)",
  "params": ["how do I reset my password?"]
}
```

### Full-text search (BM25 keyword matching)

```json
{
  "sql": "SELECT * FROM fts_search('documents', $1, 10)",
  "params": ["SAML SSO configuration"]
}
```

### Hybrid search (recommended default)

Hybrid search takes two query parameters — one for vector search, one for full-text search. Typically you pass the same string for both:

```json
{
  "sql": "SELECT * FROM hybrid_search('documents', $1, $2, 8)",
  "params": ["authentication best practices", "authentication best practices"]
}
```

---

## Combining search with SQL

Because search functions return result sets, you can use them in standard SQL — filter, join, aggregate:

### Search with WHERE filter

```json
{
  "sql": "SELECT * FROM hybrid_search('documents', $1, $2, 20) WHERE category = 'security'",
  "params": ["access control", "access control"]
}
```

### Search and select specific columns

```json
{
  "sql": "SELECT title, content, score FROM vector_search('documents', $1, 5)",
  "params": ["deployment guide"]
}
```

---

## Analytical SQL queries

Use plain SQL (no search functions) for structured queries:

### Count documents by category

```json
{
  "sql": "SELECT category, COUNT(*) AS doc_count FROM documents GROUP BY category ORDER BY doc_count DESC"
}
```

### List recently updated documents

```json
{
  "sql": "SELECT id, title, updated_at FROM documents ORDER BY updated_at DESC LIMIT 20"
}
```

### Aggregate by metadata field

```json
{
  "sql": "SELECT metadata->>'author' AS author, COUNT(*) AS cnt FROM documents GROUP BY author ORDER BY cnt DESC LIMIT 10"
}
```

---

## Common patterns

### "What does the docs say about X?"
Use hybrid search with a limit of 5. Present the top results with their content.

```json
{
  "sql": "SELECT * FROM hybrid_search('documents', $1, $2, 5)",
  "params": ["X", "X"]
}
```

### "Find all docs tagged with Y"
Use plain SQL with a WHERE clause on metadata:

```json
{
  "sql": "SELECT * FROM documents WHERE tags @> ARRAY[$1]",
  "params": ["Y"]
}
```

### "How many documents cover topic Z?"
Use SQL COUNT:

```json
{
  "sql": "SELECT COUNT(*) FROM documents WHERE category = $1",
  "params": ["Z"]
}
```

### "Give me a summary of the knowledge base contents"
Aggregate by category or tag to get an overview:

```json
{
  "sql": "SELECT category, COUNT(*) AS cnt FROM documents GROUP BY category ORDER BY cnt DESC"
}
```

---

## Important notes

- Always call `get_knowledge_base_schema` first to learn the actual table and column names — don't assume they're called `documents`
- The `params` array uses positional binding: `$1` is `params[0]`, `$2` is `params[1]`, etc.
- String params in vector/hybrid search positions are automatically embedded — you don't need to handle embeddings yourself
- For hybrid search, pass two params (one for vector, one for FTS) — usually the same query string for both
