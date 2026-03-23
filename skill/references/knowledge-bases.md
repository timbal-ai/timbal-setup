# Timbal Knowledge Bases — Query Reference

## Overview

Timbal knowledge bases support three search modes:

| Mode | When to use |
|------|-------------|
| `vector` | Semantic / conceptual similarity ("find documents about authentication patterns") |
| `fts` | Keyword / exact phrase matching ("find documents containing the exact string 'OAuth2'") |
| `hybrid` | Best of both worlds — use this as the default for most queries |

---

## MCP Tool: `timbal_kb_query`

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `knowledge_base_id` | string | yes | ID of the knowledge base to search |
| `query` | string | yes | The search query text |
| `search_type` | `"vector"` \| `"fts"` \| `"hybrid"` | no | Default: `"hybrid"` |
| `top_k` | integer | no | Number of results to return. Default: 5, max: 50 |
| `filters` | object | no | Metadata filters (see below) |
| `min_score` | float | no | Minimum relevance score threshold (0.0–1.0) |

### Basic vector search

```json
{
  "tool": "timbal_kb_query",
  "arguments": {
    "knowledge_base_id": "kb_abc123",
    "query": "how do I reset my password?",
    "search_type": "vector",
    "top_k": 5
  }
}
```

### Full-text search (fts_search)

Use FTS when you need exact keyword matching:

```json
{
  "tool": "timbal_kb_query",
  "arguments": {
    "knowledge_base_id": "kb_abc123",
    "query": "SAML SSO configuration",
    "search_type": "fts",
    "top_k": 10
  }
}
```

### Hybrid search (recommended default)

```json
{
  "tool": "timbal_kb_query",
  "arguments": {
    "knowledge_base_id": "kb_abc123",
    "query": "authentication best practices",
    "search_type": "hybrid",
    "top_k": 8,
    "min_score": 0.4
  }
}
```

---

## Metadata filtering

Use `filters` to narrow results by document metadata. Filters use a simple key/value or comparison syntax:

### Exact match

```json
{
  "filters": {
    "category": "security",
    "language": "en"
  }
}
```

### Range / comparison

```json
{
  "filters": {
    "published_at": { "gte": "2024-01-01" },
    "version": { "lte": "3.0" }
  }
}
```

### Array / IN filter

```json
{
  "filters": {
    "tags": { "in": ["authentication", "oauth", "sso"] }
  }
}
```

---

## Pagination

Use `offset` and `top_k` together to paginate through results:

```json
{
  "tool": "timbal_kb_query",
  "arguments": {
    "knowledge_base_id": "kb_abc123",
    "query": "deployment guide",
    "search_type": "hybrid",
    "top_k": 10,
    "offset": 20
  }
}
```

---

## DuckDB SQL queries against knowledge base data

Use `timbal_sql_query` to run analytical SQL over indexed data:

### List all documents in a knowledge base

```json
{
  "tool": "timbal_sql_query",
  "arguments": {
    "query": "SELECT id, title, created_at FROM kb_documents WHERE knowledge_base_id = 'kb_abc123' ORDER BY created_at DESC LIMIT 20"
  }
}
```

### Count documents by category

```json
{
  "tool": "timbal_sql_query",
  "arguments": {
    "query": "SELECT metadata->>'category' AS category, COUNT(*) AS doc_count FROM kb_documents WHERE knowledge_base_id = 'kb_abc123' GROUP BY 1 ORDER BY 2 DESC"
  }
}
```

### Find recently updated documents

```json
{
  "tool": "timbal_sql_query",
  "arguments": {
    "query": "SELECT id, title, updated_at FROM kb_documents WHERE knowledge_base_id = 'kb_abc123' AND updated_at > NOW() - INTERVAL '7 days' ORDER BY updated_at DESC"
  }
}
```

---

## Response format

`timbal_kb_query` returns an array of result objects:

```json
[
  {
    "id": "doc_xyz789",
    "score": 0.87,
    "content": "To reset your password, navigate to Settings > Security...",
    "metadata": {
      "title": "Password Reset Guide",
      "category": "support",
      "url": "https://docs.example.com/password-reset"
    }
  }
]
```

---

## Common patterns

### "What does the docs say about X?"
Use hybrid search with `top_k: 5`. Present the top results with their `content` and `metadata.url`.

### "Find all docs tagged with Y"
Use metadata filtering with `tags: { in: ["Y"] }` combined with a broad query.

### "How many documents cover topic Z?"
Use `timbal_sql_query` with a COUNT + vector-indexed column, or run a search and count the results.

### "Give me a summary of the knowledge base contents"
Use `timbal_sql_query` to aggregate by category/tag, then present the breakdown.
