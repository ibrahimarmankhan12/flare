# Session Summary — July 27, 2026

## Objective
Integrate missing better-chatbot features into flare, keep flare-sh.tech running, and fix live issues reported during testing.

## Host & Infrastructure
- **Server:** ubuntu@18.61.237.147
- **App:** flare.service running Next.js v15.5.19 from /home/ubuntu/zip-main
- **Node:** v26.5.0
- **Tunnel:** cloudflared, named tunnel d790d503-95ff-41be-af43-52db1b0bc
- **DB:** PostgreSQL PG16 on 5432, PG18 on 5433

## What Was Done

### 1. Code Mode Feature (PR #370)
Integrated the full Code Mode tool into the chat interface:
- Created src/lib/ai/codemode/executor.ts — NodeVMExecutor + getCodemodeExecutor
- Created src/lib/ai/codemode/create-codemode-tool.ts — buildCodemodeTools (explore + execute)
- Updated src/types/chat.ts — added "codemode" to toolChoice type and Zod enum
- Updated src/app/store/index.ts — added "codemode" to toolChoice union
- Updated src/app/api/chat/route.ts — conditional codemode tool wrapping
- Updated src/components/admin/config/general-tab.tsx — codemode radio option
- Added @cloudflare/codemode to package.json
- Added i18n keys to messages/en.json

### 2. Tool Mode Dropdown & UI
- Added visible tool mode button in tool-mode-dropdown.tsx (cycle auto, manual, none, codemode)
- Added tool mode selector in ToolSetupMenuContent within tool-select-dropdown.tsx

### 3. Bug Fix: React Error #185
- Root cause: tool-mode-dropdown.tsx subscribed to appStore without useShallow, causing infinite re-render loop
- Fix: wrapped store selector with useShallow from zustand/shallow

### 4. Groq API Key Invalid — All Fallbacks Rerouted to Flare DeepSeek V4 Flash
- GROQ_API_KEY was expired/invalid, causing artifact creation and model fallbacks to fail
- Changed all three hardcoded fallback models in src/lib/ai/models.ts from groq to flare DeepSeek V4 Flash
- Updated hiddenFailureFallbackModel, glm5FallbackModel, llama4ScoutFallbackModel

### 5. Artifact Creator — Output Sanitization Fix
- sanitizeHtmlOutput only stripped fences if entire response was a fenced block
- Model often prepended commentary before/after code block
- Fix: regex now matches fences anywhere, not just anchored at start/end
- Added fallback to extract HTML via <!doctype html>... tags

### 6. Canvas Tool Fixes
- Switched from generateObject to generateText for complex interactive HTML
- CanvasPanel was never rendered in any layout — added CanvasPanelWrapper to chat layout
- Cloudflare 524 timeout: added 85-second AbortSignal timeout to prevent connection drops

### 7. Prebuilt Agents & Marketplace
- Seeded 6 prebuilt agents (Code Assistant, Writing Companion, Research Analyst, Data Visualizer, Creative Partner, DevOps Engineer)
- Gallery at /gallery/agents displays published agents with Install buttons

## Remaining Work (High-Priority PRs)
- MCP per-user auth (#354, #359, #364, #363)
- Rate limiting (#358)
- Expo mobile app (#384)
- Admin dashboard (#389, #390)
- Marketing URL rewrite (#391)

## Key Files Modified
| File | Change |
|------|--------|
| src/lib/ai/models.ts | All Groq fallbacks to Flare DeepSeek V4 Flash |
| src/lib/ai/tools/artifacts/artifact-creator.ts | sanitizeHtmlOutput regex fix, description |
| src/lib/ai/tools/canvas/ppt-maker.ts | generateObject to generateText, timeout, prompts |
| src/components/canvas/canvas-panel-wrapper.tsx | New — wraps CanvasPanel for layout |
| src/app/(chat)/layout.tsx | Added CanvasPanelWrapper with right-panel layout |
| src/components/tool-mode-dropdown.tsx | Added useShallow, code mode button |
| src/components/tool-select-dropdown.tsx | Mode selector in ToolSetupMenuContent |
| src/types/chat.ts | codemode in toolChoice |
| src/app/store/index.ts | codemode in toolChoice union |
| scripts/seed-agents.mjs | New — 6 prebuilt agent seeds |
