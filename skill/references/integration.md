# Timbal App Integration — API + UI Reference

The blueprint stack: **Elysia API** (Bun) proxies all Timbal operations via `@timbal-ai/timbal-sdk`, **React UI** (Vite) consumes the API. The UI never calls the Timbal platform directly — every request goes through the API at `/api`. Authentication is already handled — never modify auth code.

---

## Architecture

```
UI (React + Vite)          API (Elysia + Bun)              Timbal Platform
─────────────────          ──────────────────              ────────────────
fetch("/api/...")  ──────→  routes ──→ timbal SDK ────────→  KBs, Workforces,
                            (all platform access)            Apps, Files
```

The UI has no SDK dependency and no direct platform access. Every operation — KB queries, workforce calls, app runs, file uploads, session info — goes through the API. Even if a route feels like a thin pass-through, it still goes through the API. This keeps the platform boundary in one place (the API), makes auth and logging consistent, and means the UI only needs to know about `/api`.

---

## API — Elysia Patterns

### Project structure

```
src/
├── index.ts              # App setup, plugins, error handler, mount at / and /api
├── auth/
│   ├── middleware.ts      # Token resolution + scoped SDK — DO NOT MODIFY
│   └── routes.ts         # OAuth, magic link, tokens — DO NOT MODIFY
└── routes/
    ├── healthcheck.ts    # GET /healthcheck
    ├── session.ts        # GET /me
    └── workforce.ts      # Workforce proxy routes
```

### SDK initialization

The SDK is initialized once in `auth/middleware.ts` and scoped per-request:

```typescript
import Timbal from "@timbal-ai/timbal-sdk";

// Singleton — initialized from env vars
export const timbal = new Timbal();

// In middleware, scoped to the authenticated user's token:
const scopedTimbal = token ? timbal.as(token) : timbal;
// This `scopedTimbal` is injected into every route handler as `timbal`
```

The auth middleware uses `.derive()` to inject `token` and `timbal` (scoped) into all route handlers. Every route receives the authenticated, scoped SDK instance automatically.

### Adding a new route file

1. Create `src/routes/my-feature.ts`:

```typescript
import { Elysia, t } from "elysia";
import { authMiddleware } from "../auth/middleware";

export const myFeatureRoutes = new Elysia({ prefix: "/my-feature" })
  .use(authMiddleware)
  .get(
    "/",
    async ({ timbal }) => {
      // `timbal` is already scoped to the authenticated user
      return await timbal.someMethod();
    },
    {
      detail: {
        summary: "Description for docs",
        tags: ["MyFeature"],
      },
    },
  );
```

2. Register in `src/index.ts`:

```typescript
import { myFeatureRoutes } from "./routes/my-feature";

const coreApp = new Elysia()
  .use(authRoutes)
  .use(authMiddleware)
  // ... existing routes
  .use(myFeatureRoutes);  // add here
```

### Key conventions

- **Always `.use(authMiddleware)`** in route files — this gives you `timbal` and `token` in handlers
- **Use `t.Object()` / `t.String()` / `t.Any()`** from Elysia for body/params validation
- **Add `detail` objects** with `summary`, `description`, and `tags` for auto-generated Swagger docs
- **Dual mount**: `coreApp` is mounted at both `/` and `/api` — routes work under both prefixes

### Error handling

The global error handler in `index.ts` catches `TimbalApiError` from the SDK and maps it to HTTP responses:

```typescript
.onError({ as: "global" }, ({ error, set }) => {
  if (error instanceof TimbalApiError) {
    set.status = error.statusCode >= 400 ? error.statusCode : 502;
    return { error: error.message };
  }
})
```

SDK errors propagate naturally — don't wrap every call in try/catch unless you need custom handling.

### Proxying workforce calls

The standard pattern — sync and streaming:

```typescript
// Sync call
.post("/:id", async ({ params, body, timbal }) => {
  return await timbal.callWorkforce(params.id, body ?? {});
})

// SSE streaming
.post("/:id/stream", async ({ params, body, timbal }) => {
  return await timbal.streamWorkforce(params.id, body ?? {});
})
```

### Exposing KB queries as API routes

Even though the SDK call is a one-liner, KB access goes through the API like everything else:

```typescript
export const kbRoutes = new Elysia({ prefix: "/kb" })
  .use(authMiddleware)
  .post(
    "/query",
    async ({ body, timbal }) => {
      return await timbal.query(body);
    },
    {
      body: t.Object({ sql: t.String(), params: t.Optional(t.Array(t.String())) }),
      detail: { summary: "Query the knowledge base", tags: ["KB"] },
    },
  );
```

### SDK methods available in route handlers

Through the scoped `timbal` instance:

| Method | Description |
|--------|-------------|
| `timbal.getSession()` | Current user info |
| `timbal.getProject()` | Project details |
| `timbal.listWorkforces()` | All running workforce components |
| `timbal.callWorkforce(id, payload)` | Sync workforce invocation |
| `timbal.streamWorkforce(id, payload)` | SSE streaming from workforce |
| `timbal.query({ sql, params })` | KB query (vector/FTS/hybrid search) |

### Environment variables (API)

| Variable | Description |
|----------|-------------|
| `PORT` | Server port (default: 3000) |
| `NODE_ENV` | `development` or `production` |
| `TIMBAL_PROJECT_ID` | Project ID (if unset, auth is skipped for local dev) |
| `TIMBAL_ORG_ID` | Organization ID |
| `TIMBAL_API_HOST` | SDK endpoint |
| `TIMBAL_PROJECT_ENV_ID` | Environment identifier |

---

## UI — Brief Overview

The UI calls the API at `/api` for everything. It has no Timbal SDK dependency and no direct platform access.

### Calling the API

```typescript
// KB query
const res = await fetch("/api/kb/query", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ sql: "SELECT * FROM hybrid_search('docs', $1, $2, 5)", params: ["query", "query"] }),
});
const data = await res.json();

// Workforce call
const res = await fetch("/api/workforce/my-component", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ input: "hello" }),
});

// Session info
const res = await fetch("/api/me");
const user = await res.json();
```

### SSE streaming from the API

```typescript
const res = await fetch("/api/workforce/my-component/stream", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ input: "hello" }),
});

const reader = res.body.getReader();
const decoder = new TextDecoder();

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  const chunk = decoder.decode(value, { stream: true });
  // Parse SSE events from chunk
}
```

### Event types (from SSE streams)

| Type | When | Key fields |
|------|------|------------|
| `START` | Step begins | `status_text` (optional UI label) |
| `OUTPUT` | Step completes | `input`, `output`, `error`, `status`, `t0`, `t1` |
| `DELTA` | Streaming content | `item` — union of `text_delta`, `tool_use`, `thinking_delta`, etc. |

### Auth integration

The `SessionProvider` manages tokens and injects them into API requests automatically. Use `useSession()` for user state, `useAuth()` for login actions. Auth is fully wired — don't modify it.

---

## Data Flow

Every request follows the same path:

```
UI: fetch("/api/...") → API route → timbal SDK → Timbal Platform → response back through
```

There are no exceptions. The UI never imports or uses the Timbal SDK.

| Operation | API Route | SDK call |
|-----------|-----------|----------|
| KB query | `POST /api/kb/query` | `timbal.query({ sql, params })` |
| Workforce (sync) | `POST /api/workforce/:id` | `timbal.callWorkforce(id, body)` |
| Workforce (stream) | `POST /api/workforce/:id/stream` | `timbal.streamWorkforce(id, body)` |
| Session | `GET /api/me` | `timbal.getSession()` |
| List workforces | `GET /api/workforce` | `timbal.listWorkforces()` |
| File upload | `POST /api/upload` | `timbal.upload(file)` |
