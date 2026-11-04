# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Flare AI is an open-source AI chatbot platform (inspired by ChatGPT, Claude, Grok, and Gemini) built with Next.js 15 and Vercel AI SDK. It supports multi-LLM providers (OpenAI, Anthropic, Google Gemini, xAI, Ollama, OpenRouter), MCP protocol tool integration, custom agents, visual workflows, voice chat, image generation, and collaborative sharing.

## Critical Workflow

Before making any code, config, or docs change:
1. Read `context.md` completely — it contains prior decisions, constraints, and recent diffs.
2. Do not edit files until `context.md` has been reviewed.
3. After every meaningful action batch, append a new timestamped entry to `context.md` with request summary, actions, files edited, diff summary, and validation results. Never delete or rewrite older entries.

## Important Architectural Patterns

**Model Fallback Routing**: `src/lib/ai/models.ts` contains a `getFallbackForModel()` helper that routes failures per-model. Claude Opus → GLM 5 (zai), Gemini 3.1 Pro → GLM 5, Gemini Flash → Llama 4 Scout. All other models → GPT-OSS 120B (groq). The fallback is completely invisible to the user.

**Chat Message Persistence**: Messages are saved to the DB before streaming starts, not only on `onFinish`. This ensures Build and long-running tool calls don't result in empty threads on refresh/interrupt.

**Community Feature**: The Community page (`src/app/(chat)/community/page.tsx`) uses the Firebase Web SDK directly in the browser for reads/writes, with a server-side SSE bridge (`/api/community/stream`) for Firebase Realtime Database event streaming. Firebase credentials are split: public config via `NEXT_PUBLIC_COMMUNITY_FIREBASE_*` env vars, private auth token via `COMMUNITY_FIREBASE_AUTH_TOKEN`.

**MCP OAuth**: Base URL for OAuth redirect URIs is resolved from `FLARE_AUTH_URL` → `NEXT_PUBLIC_BASE_URL` → Vercel env vars → local fallback. MCP OAuth requires a properly configured public HTTPS URL in production.

**Embedded Browser Agent**: Browser sessions are cached per `(userId, threadId)` so each chat thread gets one persistent Firecrawl browser. The agent observes the current page state before each command so it resumes correctly after user handoff.

## Build, Test, and Development Commands

```bash
pnpm dev              # Dev server with hot-reload (http://localhost:3000)
pnpm dev:turbopack    # Dev with Turbopack
pnpm build            # Production build (6GB heap limit)
pnpm build:local      # Local production build (no HTTPS)
pnpm start            # Run production build

pnpm lint             # ESLint + Biome lint
pnpm lint:fix         # ESLint + Biome autofix
pnpm format           # Biome format only
pnpm check-types      # TypeScript type check
pnpm check            # lint + types + tests (full CI check)

pnpm test             # Unit tests (Vitest)
pnpm test:watch       # Unit tests in watch mode

# E2E tests (requires: PostgreSQL, at least one LLM API key, BETTER_AUTH_SECRET)
pnpm test:e2e         # All Playwright E2E tests
pnpm test:e2e:ui      # Playwright with UI mode
pnpm test:e2e -- tests/agents/agent-visibility.spec.ts --headed  # Single test debug

# Database (Drizzle + PostgreSQL)
pnpm db:push          # Push schema to DB
pnpm db:migrate       # Run migrations
pnpm db:studio        # Drizzle Studio
pnpm db:generate      # Generate migrations
pnpm db:reset         # Drop and recreate

# Docker
pnpm docker-compose:up    # Start all services (app + Postgres)
pnpm docker-compose:down  # Stop all services
pnpm docker:pg            # Start Postgres only
```

## Architecture

### Tech Stack
- **Framework**: Next.js 15 (App Router, React 19, TypeScript)
- **AI SDK**: Vercel AI SDK (`ai` package) with provider SDKs for OpenAI, Anthropic, Google, xAI, Groq, Ollama, OpenRouter, ZAI (Flare)
- **Database**: PostgreSQL via Drizzle ORM (schema in `src/lib/db/pg/schema.pg.ts`)
- **Auth**: Better Auth (`better-auth` package)
- **State**: Zustand for global client state (`src/app/store/index.ts`)
- **Styling**: Tailwind CSS v4 + shadcn/ui components + Radix UI primitives
- **Realtime Voice**: OpenAI Realtime API
- **Workflows**: React Flow (`@xyflow/react`)
- **File Storage**: Vercel Blob (default), S3 (configurable)
- **Caching**: Upstash Redis, Redis, or in-memory (swappable adapter)
- **Code Execution**: Web Workers for sandboxed JS/Python execution
- **MCP**: Model Context Protocol via `@modelcontextprotocol/sdk`
- **Email**: Resend
- **i18n**: next-intl with message files in `messages/` directory
- **Sandbox**: E2B for cloud compute (Build feature)
- **Browser Automation**: Firecrawl Browser Agent for embedded browser control
- **Community**: Firebase Realtime Database (Web SDK for client reads/writes, SSE bridge for streaming)

### Directory Structure

```
src/
├── app/                    # Next.js App Router
│   ├── (auth)/            # Auth routes (sign-in, sign-up)
│   ├── (chat)/            # Main chat UI routes
│   │   ├── community/     # Firebase-backed Community page
│   │   └── chat/[thread]/ # Individual chat thread pages
│   ├── (public)/          # Public pages (landing, about)
│   ├── api/               # API route handlers
│   │   ├── admin/         # Admin endpoints (user management)
│   │   ├── agent/         # Agent CRUD + AI execution
│   │   ├── chat/          # Core chat + streaming + models
│   │   ├── community/     # Community feed, posts, reactions, media
│   │   ├── mcp/           # MCP server management + OAuth
│   │   ├── sandbox/       # E2B sandbox APIs (Build feature)
│   │   ├── storage/       # File upload/ingestion
│   │   ├── user/          # User preferences, notes, usage
│   │   ├── voice/         # Voice chat endpoints
│   │   ├── workflow/      # Workflow CRUD + tool execution
│   │   └── canvas/        # Canvas PPT export
│   └── store/             # Zustand stores (global app state + workflow)
├── components/            # UI components (PascalCase)
│   ├── agent/             # Agent creation/management UI
│   ├── auth/              # Sign-in, sign-up, OAuth
│   ├── builder/           # Build workspace (Code, Computer, Preview tabs)
│   ├── canvas/            # Canvas workspace (presentation/HTML output)
│   ├── chat-bot.tsx       # Core chat component (streaming, tools)
│   ├── chat-bot-voice.tsx # Voice chat component
│   ├── layouts/           # Sidebar, header, theme provider
│   ├── markdown.tsx       # Markdown renderer
│   ├── mcp-*.tsx          # MCP server management UI
│   ├── tool-invocation/   # Tool output renderers (Canvas, Build, BrowserAgent, etc.)
│   └── ui/                # Shared shadcn/ui primitives
├── lib/                   # Shared utilities and business logic
│   ├── ai/                # AI core logic
│   │   ├── models.ts      # Model registry + fallback routing
│   │   ├── prompts.ts     # System prompts
│   │   ├── agent/         # Custom agent logic
│   │   ├── browser/       # Firecrawl browser agent
│   │   ├── canvas/        # Canvas generation (presentations, HTML)
│   │   ├── image/         # Image generation (OpenAI, Gemini, xAI)
│   │   ├── mcp/           # MCP client wrapper and tool conversion
│   │   ├── skills/        # Built-in skills (web search, code executor)
│   │   ├── speech/        # Voice/Speech providers
│   │   ├── tools/         # Tool definitions (memory, sanitization)
│   │   └── workflow/      # Workflow execution
│   ├── auth/              # Better Auth setup, permissions, roles
│   ├── cache/             # Cache abstraction (Redis, Upstash, memory)
│   ├── code-runner/       # Sandboxed JS/Python execution in workers
│   ├── community/         # Firebase client + server repository
│   ├── db/                # Drizzle ORM schema + repository
│   ├── email/             # Resend email templates
│   ├── file-storage/      # Storage drivers (Vercel Blob, S3)
│   ├── rate-limit/        # Usage tracking and rate limiting
│   ├── sandbox/          # E2B sandbox manager
│   ├── security/          # Request guards, device parser, security events
│   └── validations/       # Zod schemas for user input
├── hooks/                 # React hooks
├── types/                 # TypeScript type definitions
└── i18n/                  # Internationalization
```

### State Management
- **Server State**: SWR for data fetching and caching
- **Client State**: Zustand stores in `src/app/store/` — `index.ts` holds global app state (threads, MCP servers, agents, workflows, tool choices); `workflow.store.ts` holds workflow builder state
- **Auth State**: Better Auth session

### Key Patterns

**API Routes**: All server-side logic lives in `src/app/api/`. Auth is enforced via Better Auth session checks. Database access goes through `src/lib/db/repository.ts`.

**MCP Integration**: MCP servers are managed via the SDK in `src/lib/ai/mcp/`. Tools from MCP servers are sanitized and converted to AI SDK tool format. The MCP dashboard (`mcp-dashboard.tsx`) and editor (`mcp-editor.tsx`) provide the UI.

**Chat Streaming**: The core chat loop is in `chat-bot.tsx`. It handles streaming responses, tool calls (both MCP and built-in), @mentions for agents/workflows/temporary chats, and voice input. Messages are persisted to the DB before streaming starts.

**Database**: All data models are defined with Drizzle in `src/lib/db/pg/schema.pg.ts`. The repository pattern (`src/lib/db/repository.ts`) abstracts DB access.

**Community**: Uses Firebase Web SDK directly in the browser for reads/writes, with a server-side SSE bridge (`/api/community/stream`) for Firebase Realtime Database event streaming. Credentials are split: public config via `NEXT_PUBLIC_COMMUNITY_FIREBASE_*` env vars, private auth token via `COMMUNITY_FIREBASE_AUTH_TOKEN`.

**Embedded Browser Agent**: Browser sessions are cached per `(userId, threadId)` in `src/lib/ai/tools/browser/browser-agent.ts` so each chat thread gets one persistent Firecrawl browser. The agent observes the current page state before each command to resume after user handoff.

## Coding Style

- TypeScript everywhere; use `zod` for input validation
- Format with Biome (2 spaces, LF, line width 80, double quotes)
- Components: `PascalCase.tsx`; hooks/utilities: `camelCase.ts`
- No class components; prefer functional components with hooks
- Server-only code uses `server-only` package
- Use `src/lib` for shared logic; avoid circular dependencies
- Prefer co-located tests (`*.test.ts`) next to the module

## Testing

- **Unit tests**: Vitest, colocated or in `tests/` dir, `*.test.ts(x)`
- **Single test file**: `pnpm test -- src/lib/ai/models.test.ts`
- **E2E tests**: Playwright under `tests/`, `*.spec.ts`
- **Coverage expectations**: New features and bug fixes require tests (happy path + one failure mode)
- **Before opening PR**: `pnpm check` (lint + types + unit tests) must pass

## Commit & PR Guidelines

- PR titles follow Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`, etc.)
- Squash merge is used — only the PR title is used for changelog and versioning
- Branch naming: `feat/...`, `fix/...`, `chore/...`
- **UI changes**: Include before/after screenshots; use screen recordings for interactive features
- **Feature requests**: Include reference mockups or screenshots from similar apps

## Environment Variables

Copy `.env.example` to `.env`. Key required vars: `BETTER_AUTH_SECRET`, at least one LLM provider API key, and `POSTGRES_URL`. For local dev without HTTPS use `NO_HTTPS=1` or `pnpm build:local`. See README.md for the full env var reference.
