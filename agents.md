# AGENTS.md

This file provides guidance for AI agents working in this repository.

## Critical Workflow

Before making any code, config, or docs change:
1. Read `context.md` completely — it contains prior decisions, constraints, and recent diffs.
2. Do not edit files until `context.md` has been reviewed.
3. After every meaningful action batch, append a new timestamped entry to `context.md` with request summary, actions, files edited, diff summary, and validation results. Never delete or rewrite older entries.

## Session Memory System

Claude has a persistent memory system at `/home/ubuntu/.claude/projects/-home-ubuntu-Flare-main/memory/`. After every session:
- Save key user preferences, feedback, project facts, and reference pointers to the memory directory.
- Update `MEMORY.md` index with new entries.
- Load relevant memories at the start of each session.

## Deployment

- **DO NOT use Docker** for this project — deployment is via `flare.service` (systemd) on port 4000.
- Service env file: `/etc/flare.env` (separate from `.env` in the repo root).
- Deploy: `sudo systemctl restart flare.service`
- Check: `sudo journalctl -u flare.service --no-pager -n 50`
- The site runs behind Cloudflare Tunnel (`cloudflared-tunnel.service`) serving `flare-sh.tech` → `localhost:4000`.

## Admin Panel Patterns

### Model Selector
- `ModelSelector` and `FallbackModelSelector` in `src/components/admin/ui/model-selector.tsx` fetch from three endpoints in parallel: `/api/chat/models`, `/api/admin/providers`, `/api/admin/config`.
- They read the enabled/disabled state of providers from the admin config and filter disabled providers' models from the dropdown.
- Model names are stored as UI display names (e.g., "Claude Opus 4.6"), NOT API IDs (e.g., "flare/claude-opus-4.6").

### Dynamic Provider CRUD
- `GET /api/admin/providers` — list dynamic providers from `site_config` DB table (key: "models", field: `dynamicProviders`).
- `POST /api/admin/providers` — add/update dynamic provider. Auto-generates slug from `name` if `id` not provided. Encrypts API key with `ENCRYPTION_MASTER_KEY` before storing.
- `DELETE /api/admin/providers?id=...` — remove dynamic provider.
- Encrypted keys are stored in `site_config` (key: "models") and mirrored to `site_config` (key: "tools") under `apiKeysSecrets[dyn_${slug}]`.

### Encryption
- API keys are encrypted with AES-256-GCM via `lib/security/encryption.ts`.
- `ENCRYPTION_MASTER_KEY` env var (32 chars) must be set in `/etc/flare.env`.
- `isEncryptionAvailable()` checks if the key is configured before attempting encryption.

### Provider Test Connection
- `POST /api/admin/providers/test` tests provider connectivity.
- Static providers use hardcoded configs from env vars.
- Dynamic providers: reads `apiKey` from `site_config.models.dynamicProviders[${id}]`, tries to decrypt directly, falls back to `apiKeysSecrets[dyn_${id}]`.

### Model Name Format
- Admin stores model name as UI display string (e.g., "Claude Opus 4.6").
- Fallback model is stored as `"provider/model"` string (e.g., "groq/Llama 4 17b Scout").
- `updateProviderModel` in the admin models page handles both formats: string for defaultModel, `{ provider, model }` for fallbackModel.

## Known Issues (2026-05-31)

- Duplicate dynamic provider block in `models.ts` was removed — only one definition at line ~487.
- `ModelSelector` provider filter uses lowercase ID matching. API returns provider names like "Flare" → transformed to "flare" via `.toLowerCase().replace(/\s+/g, "-")`. This matches the `providerId` prop used in admin cards.
- Dynamic provider models in the chat UI need to be registered via `registerDynamicProvider()` in `models.ts` at runtime — currently the models are fetched from discovery but the runtime model resolution may not include them unless the provider is added to `allModels`.
- `Flare`/`flare` duplicate: Both static `flare` provider and dynamic `flare` entry produce the same slug. Deduplication in `modelsInfo` prefers the static `flare` provider. Dynamic providers with the same slug as a static provider are filtered out to prevent duplicate model entries.

## Site Config DB Table Structure

The `site_config` table stores configuration under different `key` values:

| key field | Purpose | Sub-fields |
|-----------|---------|------------|
| `"models"` | Model/provider config | `providers[]`, `dynamicProviders{}`, `defaultModel`, `fallbackModel` |
| `"tools"` | Tool config | `apiKeysSecrets{}` (mirrored from dynamic provider keys), `enabledCategories[]` |
| `"canvas"` | Canvas config | `model` (model name string) |
| `"artifacts"` | Artifacts config | `model` (model name string) |
| `"general"` | General config | `featureFlags{}`, `theme`, etc. |

## Deduplication Logic in modelsInfo

`modelsInfo` deduplicates models using `deduplicateModels()` which:
1. Groups models by normalized `providerId` (lowercase, spaces to hyphens).
2. For each group with multiple entries, keeps the first entry with that `providerId`.
3. For the specific `flare`/`Flare` case: prefers the static `flare` provider (created directly in `models.ts`) over the dynamic `flare` entry (created via `createOpenAICompatibleModels` from `OPENAI_COMPATIBLE_DATA`).
4. This prevents the same model (e.g., "Claude Opus 4.6") from appearing twice with both "flare" and "Flare" provider IDs.

## Default Config Fallback Pattern

`buildDefaultModelsConfig()` returns:
```ts
{ providers: [], dynamicProviders: {}, defaultModel: undefined, fallbackModel: undefined }
```
This ensures that when no config exists in the DB, the merge `mergeWithDefaults(existing, buildDefaultModelsConfig())` has real arrays/objects to spread into, not undefined. The same pattern applies to canvas (`buildDefaultCanvasConfig()` returns `{ model: "GPT 5.5" }`) and artifacts (`buildDefaultArtifactsConfig()` returns `{ model: "gemini-2.5-flash-lite" }`).

## Environment Variables Reference

Key production vars in `/etc/flare.env`:
- `ENCRYPTION_MASTER_KEY` — 32-char key for AES-256-GCM API key encryption
- `FIRECRAWL_API_KEY` — for browser agent sandbox
- `FLARE_API_KEY` / `KORE_API_KEY` — for Flare LLM provider
- `GROQ_API_KEY`, `GROQ_BASE_URL` — for Groq provider
- `ZAI_API_KEY`, `ZAI_BASE_URL` — for Z AI (GLM) provider
- `POSTGRES_URL` — database connection
- `BETTER_AUTH_SECRET` — auth session secret
- `NEXT_PUBLIC_BASE_URL` — public URL for OAuth callbacks

## Before Opening PR

1. `pnpm check` — lint + types + unit tests must pass
2. `pnpm build` — production build must succeed
3. `sudo systemctl restart flare.service` — deploy and verify
4. Check `curl -s -o /dev/null -w "%{http_code}" http://localhost:4000/` returns 200
5. Update `context.md` with a timestamped entry of all changes made