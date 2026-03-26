# Timbal UI Reference — React + Vite + Shadcn Chat Application

Read this reference whenever you are modifying or building frontend UI code in a Timbal app — pages, components, styles, animations, theming, chat interface, or any file under `ui/src/`.

---

## Runtime Environment

The Timbal hosted environment has **no package manager** (`bun`, `npm`, `yarn`, `pnpm` are all unavailable). Only `node` is present.

- **Do not try to install packages.** No `bun add`, `npm install`, `yarn add`, or `pnpm add` — they will all fail with "command not found".
- **If you need a new dependency:** add it to `package.json` manually and tell the user to reinstall locally, OR implement the functionality from scratch (preferred for small utilities like confetti, animations, etc.).
- **Existing `node_modules` are pre-installed** from the lockfile. Check `node_modules/<package>` before assuming something isn't available.
- **Adding Shadcn components** (`npx shadcn@latest add ...`) is also unavailable in the runtime. Instead, create the component file manually following Shadcn patterns (Radix UI + Tailwind + `cn()` helper).

---

## Critical UI Rules

1. **Route everything through the API.** The UI calls `/api/*` for all Timbal operations. It never imports or uses the Timbal SDK (`@timbal-ai/timbal-sdk`) directly. Even thin pass-throughs go through the API — this keeps the platform boundary in one place.
2. **Never make direct workforce calls from the frontend.** The UI calls `POST /api/workforce/{id}/stream`, which the API proxies to the Timbal platform via the SDK.
3. **Never modify the auth system.** The files in `src/auth/` are complete — OAuth (Google, GitHub, Microsoft), magic links, token management (access + refresh), automatic 401 retry, session validation, and project-scoped authorization. Use the auth utilities (`authFetch`, `useSession`, `isAuthEnabled`) but do not edit them.
4. **Use `authFetch` for all authenticated API calls.** It attaches the Bearer token and handles 401 refresh automatically. Do not use raw `fetch` for `/api/*` endpoints.

---

## Tech Stack

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

---

## Project Structure

```
ui/src/
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

---

## Vite Proxy Configuration

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

---

## Shadcn/UI Setup

**Configuration** (`components.json`): new-york style, neutral base, CSS variables, lucide icons, `rsc: false`.

**Path aliases:** `@/components`, `@/components/ui`, `@/lib`, `@/hooks`.

---

## Calling the API

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

If the API route doesn't exist yet, create it on the API side first (see `references/integration.md`), then call it from the UI.

---

## Chat Interface — TimbalRuntimeProvider

The core chat runtime wraps the thread in an `AssistantRuntimeProvider` from `@assistant-ui/react`. It manages message state, streaming, conversation threading, and abort handling.

```tsx
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

---

## Chat Interface — Thread Component

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

---

## Streaming Protocol

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

**Conversation threading:** Each response produces a `run_id` (from the top-level START event). When the user sends the next message, the previous assistant's `run_id` is sent as `context.parent_id`.

---

## Styling & Theming

**Tailwind CSS v4** with `@theme inline` for design tokens. All colors use **OKLCH** for perceptual uniformity. Light and dark themes are CSS custom properties on `:root` and `.dark`.

**Theme switching** via `next-themes` with class-based strategy:
```tsx
<ThemeProvider defaultTheme="system" storageKey="timbal-theme" attribute="class">
```

**Font:** configurable in `index.css` (imported via Google Fonts or Fontshare). **Custom animations:** `animate-ai-breathe`, `animate-ai-ring-glow`, `animate-ai-pulse-ring` (AI icon), `animate-border-flow` (login), `animate-slide` (logo slider).

---

## Environment Variables (UI)

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

---

## Adding New UI Features

**New page:** Create `src/pages/MyPage.tsx`, add route in `App.tsx` wrapped in `<AuthGuard requireAuth>`.

**New API call:** Always use `authFetch` and `/api/*`. If the API route doesn't exist yet, create it on the API side first (see `references/integration.md`).

**New Shadcn component:** Since `npx shadcn` is unavailable in the runtime, create the component file manually in `src/components/ui/` following Shadcn patterns (Radix primitive + Tailwind classes + `cn()` + `cva()` for variants).

**Customize chat welcome:** Edit `ThreadWelcome` in `src/components/assistant-ui/thread.tsx`.

**New message content type:** Define the type, add parsing in `streamAssistantResponse()` in `timbal-runtime.tsx`, add rendering component in `MessagePrimitive.Parts`.

**When renaming CSS classes or utility classes:** grep for usage across all `.tsx` files before renaming to avoid silent breakage.
