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

## UI — React + Vite + Shadcn Chat Application

The UI calls the API at `/api` for everything. It has no Timbal SDK dependency and no direct platform access. Authentication is fully wired — never modify auth code.

### Critical UI Rules

1. **Route everything through the API.** The UI calls `/api/*` for all Timbal operations. It never imports or uses the Timbal SDK (`@timbal-ai/timbal-sdk`) directly.
2. **Never make direct workforce calls from the frontend.** Workforce endpoints live behind the API layer. The UI calls `POST /api/workforce/{id}/stream`, which the API proxies to the Timbal platform via the SDK.
3. **Never modify the auth system.** The files in `src/auth/` are complete — OAuth (Google, GitHub, Microsoft), magic links, token management (access + refresh), automatic 401 retry, session validation, and project-scoped authorization are all handled. Use the auth utilities (`authFetch`, `useSession`, `isAuthEnabled`) but do not edit them.
4. **Use `authFetch` for all authenticated API calls.** It automatically attaches the Bearer token and handles 401 refresh. Do not use raw `fetch` for `/api/*` endpoints.

### UI Tech Stack

| Package | Purpose |
|---------|---------|
| `react` ^19.2, `react-router-dom` ^7.9 | UI framework + routing |
| `vite` ^7.2, `typescript` ~5.8 | Build tool + types |
| `tailwindcss` ^4.1 + `@tailwindcss/vite` | Styling (v4 with `@theme inline`, OKLCH colors) |
| Radix UI (`@radix-ui/react-*`) | Headless accessible components |
| `class-variance-authority`, `clsx`, `tailwind-merge` | Component variants + `cn()` helper |
| `lucide-react` | SVG icons |
| `next-themes` | Dark/light theme switching |
| `@assistant-ui/react` ^0.12 | Thread/message primitives, chat runtime |
| `@assistant-ui/react-markdown` ^0.12 | Markdown rendering in messages |
| `remark-gfm`, `remark-math`, `rehype-katex`, `katex` | GFM + math rendering |
| `shiki` | Syntax highlighting (dual-theme) |
| `react-hook-form`, `zod` | Forms + validation |
| `zustand` | Lightweight state management |
| `motion` | Animations |
| `sonner` | Toast notifications |

Install and run with `bun install` / `bun run dev`.

### UI Project Structure

```
src/
├── auth/                    # Auth system — DO NOT MODIFY
│   ├── config.ts            # OAuth providers, env-based config
│   ├── tokens.ts            # Token storage, authFetch, refresh logic
│   ├── provider.tsx         # SessionProvider context + useSession hook
│   ├── AuthGuard.tsx        # Route protection component
│   ├── AuthCallback.tsx     # OAuth/magic-link callback handler
│   └── AuthRoutes.tsx       # Auth route definitions
├── components/
│   ├── ui/                  # Shadcn/UI components (buttons, dialogs, etc.)
│   ├── assistant-ui/        # Chat-specific components
│   │   ├── timbal-runtime.tsx   # TimbalRuntimeProvider — streaming + state
│   │   ├── thread.tsx           # Thread, Composer, messages UI
│   │   ├── markdown-text.tsx    # Markdown rendering (GFM, math, syntax)
│   │   ├── syntax-highlighter.tsx # Shiki dual-theme code highlighting
│   │   ├── tool-fallback.tsx    # Tool call rendering
│   │   ├── tooltip-icon-button.tsx
│   │   └── attachment.tsx       # File attachment handling
│   └── mode-toggle.tsx      # Dark/light theme toggle
├── pages/
│   ├── Home.tsx             # Main chat page with workforce selector
│   └── NotFound.tsx         # 404 page
├── timbal/
│   └── client.ts            # Timbal SDK client (used only for session sync)
├── hooks/                   # Custom React hooks
├── lib/
│   └── utils.ts             # cn() utility for className merging
├── App.tsx                  # Root: ThemeProvider + SessionProvider + Router
├── main.tsx                 # React entry point
└── index.css                # Global styles, theme variables, animations
```

### Vite Proxy Configuration

```typescript
// vite.config.ts — the /api proxy routes all frontend API calls to the backend
server: {
  proxy: {
    "/api": {
      target: env.VITE_API_PROXY_TARGET || "http://localhost:3000",
      changeOrigin: true,
    },
  },
},
resolve: {
  alias: { "@": path.resolve(__dirname, "./src") },
},
```

In production, configure your reverse proxy (nginx, Caddy, etc.) to route `/api/*` to the API server.

### Shadcn/UI Setup

**Configuration** (`components.json`): new-york style, neutral base, CSS variables, lucide icons, `rsc: false`.

**Path aliases:** `@/components`, `@/components/ui`, `@/lib`, `@/hooks`.

**Adding components:** `npx shadcn@latest add <component-name>` — places in `src/components/ui/`.

### Calling the API

Always use `authFetch` from `@/auth/tokens`:

```typescript
import { authFetch } from "@/auth/tokens";

// KB query
const res = await authFetch("/api/kb/query", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ sql: "SELECT * FROM hybrid_search('docs', $1, $2, 5)", params: ["query", "query"] }),
});
const data = await res.json();

// Workforce call (sync)
const res = await authFetch("/api/workforce/my-agent", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ input: "hello" }),
});

// Session info
const res = await authFetch("/api/me");
const user = await res.json();
```

### Chat Interface — TimbalRuntimeProvider

The core chat runtime wraps the thread in an `AssistantRuntimeProvider` from `@assistant-ui/react`. It manages message state, streaming, conversation threading, and abort handling.

```tsx
// Usage in a page
<TimbalRuntimeProvider workforceId={selectedWorkforceId}>
  <Thread />
</TimbalRuntimeProvider>
```

**Message types:**
```typescript
type ContentPart = TextContentPart | ToolCallContentPart;
type TextContentPart = { type: "text"; text: string };
type ToolCallContentPart = {
  type: "tool-call"; toolCallId: string; toolName: string; argsText: string; result?: unknown;
};

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: ContentPart[];
  runId?: string;  // Links to conversation threading
}
```

### Chat Interface — Thread Component

Uses `@assistant-ui/react` primitives:

```tsx
<ThreadPrimitive.Root>
  <ThreadPrimitive.Viewport>
    <AuiIf condition={(s) => s.thread.isEmpty}>
      <ThreadWelcome />
    </AuiIf>
    <ThreadPrimitive.Messages
      components={{ UserMessage, EditComposer, AssistantMessage }}
    />
    <ThreadPrimitive.ViewportFooter>
      <ThreadScrollToBottom />
      <Composer />
    </ThreadPrimitive.ViewportFooter>
  </ThreadPrimitive.Viewport>
</ThreadPrimitive.Root>
```

**Key primitives:** `ThreadPrimitive.*` (layout), `ComposerPrimitive.*` (input/send/cancel), `MessagePrimitive.*` (rendering), `ActionBarPrimitive.*` (copy/reload/edit), `SuggestionPrimitive.*` (welcome suggestions), `AuiIf` (conditional rendering).

**Markdown rendering:** Messages support GFM (tables, task lists), math (`$...$` / `$$...$$` via KaTeX), and syntax highlighting (Shiki dual-theme with line numbers).

### Streaming Protocol

The UI streams responses via `POST /api/workforce/{workforceId}/stream`:

```typescript
const res = await authFetch(`/api/workforce/${workforceId}/stream`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    prompt: input,
    context: { parent_id: parentId },
  }),
  signal, // AbortController signal for cancellation
});
```

**Newline-delimited JSON events:**

| Event | When | Key Fields |
|-------|------|------------|
| `START` | Run begins | `run_id`, `path` — capture `run_id` from the top-level START (path without ".") for conversation threading |
| `DELTA` | Incremental content | `item.type`: `text_delta`, `tool_use`, `tool_use_delta` |
| `CHUNK` | Raw text chunk | `chunk` (string) — legacy, prefer DELTA |
| `OUTPUT` | Step completes | `output` — may contain `content[]` array with text/tool_use blocks |

**Conversation threading:** Each response produces a `run_id` (from the top-level START event). When the user sends the next message, the previous assistant's `run_id` is sent as `context.parent_id`, telling the backend which conversation turn to continue from.

### Styling & Theming

**Tailwind CSS v4** with `@theme inline` for design tokens. All colors use **OKLCH** for perceptual uniformity. Light and dark themes are CSS custom properties on `:root` and `.dark`.

**Theme switching** via `next-themes` with class-based strategy:
```tsx
<ThemeProvider defaultTheme="system" storageKey="timbal-theme" attribute="class">
```

**Font:** Satoshi (from fontshare.com). **Custom animations:** `animate-ai-breathe`, `animate-ai-ring-glow`, `animate-ai-pulse-ring` (AI icon), `animate-border-flow` (login), `animate-slide` (logo slider).

### Environment Variables (UI)

All prefixed with `VITE_` (Vite requirement for client-side access):

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `VITE_APP_TITLE` | No | — | Browser tab title |
| `VITE_APP_PORT` | No | `5173` | Dev server port |
| `VITE_API_PROXY_TARGET` | No | `http://localhost:3000` | Backend API URL for Vite proxy |
| `VITE_AUTH_ENABLED` | No | auto | Enable auth (auto-enabled when project ID is set) |
| `VITE_AUTH_TIMBAL_IAM` | No | `true` | Use Timbal IAM for auth tokens |
| `VITE_TIMBAL_BASE_URL` | Yes* | — | Timbal API base URL (for auth flows) |
| `VITE_TIMBAL_API_KEY` | No | — | API key (alternative to OAuth) |
| `VITE_TIMBAL_ORG_ID` | Yes* | — | Organization ID for access control |
| `VITE_TIMBAL_PROJECT_ID` | Yes* | — | Project ID for access control |

*Required when auth is enabled.

### Adding New UI Features

**New page:** Create `src/pages/MyPage.tsx`, add route in `App.tsx` wrapped in `<AuthGuard requireAuth>`.

**New API call:** Always use `authFetch` and `/api/*`. If the API route doesn't exist yet, create it on the API side first (see API section above), then call it from the UI.

**New Shadcn component:** `npx shadcn@latest add button dialog select` — import from `@/components/ui/<component>`.

**Customize chat welcome:** Edit `ThreadWelcome` in `src/components/assistant-ui/thread.tsx`.

**New message content type:** Define the type, add parsing in `streamAssistantResponse()` in `timbal-runtime.tsx`, add rendering component in `MessagePrimitive.Parts`.

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
