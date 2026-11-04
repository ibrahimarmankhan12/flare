# Cross-thread memory

Flare can remember facts about you across every chat. Tell it once — your name, your stack, the project you're shipping, the way you like code review comments — and it carries that context into new threads automatically.

## What it does

After every assistant reply, a small LLM pass scans the message for facts worth remembering. The model returns up to five structured candidates; each candidate is classified by category and assigned a confidence score. Candidates with high enough confidence are saved to your memory store and become available to every future chat.

The next time you open a thread, the model only sees the **top 20 memories most relevant to your current message**, not your whole history. Relevance is computed by cosine similarity in a 1536-dimensional embedding space (pgvector HNSW index, sub-50ms at 100k vectors). This is what makes the feature feel useful: the model genuinely remembers you, but its context window is not flooded with stale or unrelated trivia.

## How it works

The pipeline runs entirely in the background. There is no setting to flip.

1. **Extraction** (`src/lib/ai/memory/extract-memories.ts`) — a cheap, fast model (`flare / Gemini 3 Flash`) reads the just-finished user message and assistant reply, then returns 0–5 memory candidates. The schema enforces a category (identity, career, projects, preferences, instructions, context), a scope (user, agent, thread), a confidence (0–1), and a content string (1–500 chars, third-person factual).
2. **Persistence** (`src/lib/ai/memory/extract-and-store.ts`) — candidates with `confidence >= 0.6` are saved. The schema's `vector(1536)` column is populated by an embedding call against the same message. Duplicates are de-duplicated by cosine distance within the same user.
3. **Retrieval** (`src/lib/db/pg/repositories/memory-repository.pg.ts`) — when a new chat starts, the user's last message is embedded and the repository returns the top 20 memories by cosine similarity, optionally filtered by agent or thread scope.
4. **Injection** (`src/lib/ai/prompts.ts` → `buildUserSystemPromptWithMemory`) — the top 20 memories are formatted as a `<user_memories>` block and prepended to the system prompt. The model is told to use them silently, not to announce that it is reading from memory.

The model is told not to mention it is reading from memory unless the user asks. This keeps the experience feeling like a continuous conversation rather than a database lookup.

## Categories

Each memory belongs to one of six categories. Categories help you triage and review what has been saved.

| Category      | What goes here                                           |
| ------------- | -------------------------------------------------------- |
| `identity`    | Name, location, family, languages, age, education        |
| `career`      | Current/past roles, companies, skill areas               |
| `projects`    | What you're building, status, key decisions              |
| `preferences` | Opinions, tastes, working-style preferences              |
| `instructions`| Explicit rules: "always X", "never Y", corrections      |
| `context`     | Transient but useful — a flight next week, current focus |

You can change a memory's category at any time in the memory panel.

## Scopes

Each memory has a scope that controls where it is visible to the model.

- `user` (default) — surfaces in every thread, with every agent. Most facts live here.
- `agent` — only surfaces when a specific agent is active. Use for agent-specific instructions ("when using the code-review agent, always check for SQL injection").
- `thread` — only surfaces in the thread it was created in. Use for conversation-local context that you do not want to leak elsewhere.

The retrieval layer filters by scope automatically. The model never sees a memory whose scope does not match the current context.

## Privacy

Memories are scoped per user. The model in a thread only ever sees the memories attached to the signed-in user running that thread. There is no cross-user leakage: the `userId` is enforced in every query path.

The model only sees the top 20 most-relevant memories per message, not the full store. Even if you have 5,000 memories, the system prompt never grows unbounded. Memories are also not exposed to the model verbatim in the assistant output — they are read silently.

The source message that produced a memory is tracked in the schema (`sourceMessageId`) but is not exposed to the model. It is only used to let you, the user, jump back to the original conversation in the memory panel.

A `confidence` column records how sure the extraction model was. You can sort by confidence in the panel to find the most reliable memories.

## How to view, edit, or delete memories

Open the user popover (top-right of the chat) and look for the **Memory** card. It loads every memory tied to your account.

From the card you can:

- **Search** by content (case-insensitive substring).
- **Edit** a memory's content or category inline. Edits are persisted immediately and replace the old version on the next retrieval.
- **Pin** a memory so it is always included in the system prompt regardless of relevance score. Useful for hard rules ("always use 2-space indentation").
- **Unpin** to return to relevance-only retrieval.
- **Delete** a memory. The source message in the original thread is untouched; only the memory entry is removed.
- **Add** a memory manually. Useful for storing a fact the model did not pick up automatically.
- **Undo** a delete within the toast window.
- **Export** all memories as a markdown blob via the **Import** dialog. The export follows a fixed category order (Instructions → Identity → Career → Projects → Preferences) and includes a date prefix on each entry.

The card is implemented in `src/components/user/user-detail/memory-settings-card.tsx`. The underlying API is `GET/PATCH/DELETE /api/user/memory` and `POST /api/user/memory` for manual adds.

## How to disable

The memory feature is opt-out per user. Two controls exist:

1. **Pause extraction for a single thread.** Open the thread's settings menu and toggle "Save memories from this thread." Extraction is suppressed for the thread's messages; the rest of your account is unaffected.
2. **Disable globally.** Open the memory panel and click "Disable memory." All extraction stops immediately. Existing memories are retained but not surfaced to the model. Re-enabling resumes retrieval; the memories are not deleted.

To permanently wipe everything, use the "Delete all" button in the panel header. This is irreversible.

## Cost

The extraction pass uses `flare / Gemini 3 Flash` (cheap model) regardless of the model you are chatting with. Cost is bounded to one LLM call per finished assistant reply, with at most 5 candidates returned. There is no debouncing yet for free-tier users; the call happens after every reply. Embedding is one call per saved memory. At typical usage (10–30 saves/day) the marginal cost is well under a cent per day.

## See also

- `src/lib/ai/memory/extract-memories.ts` — the extraction LLM pass
- `src/lib/ai/memory/extract-and-store.ts` — persistence and dedup
- `src/lib/ai/memory/embed.ts` — embedding wrapper
- `src/lib/ai/memory/backfill.ts` — one-off script to extract memories from existing threads (`pnpm tsx scripts/backfill-memories.ts`)
- `src/lib/db/pg/repositories/memory-repository.pg.ts` — vector search + scope queries
- `src/components/user/user-detail/memory-settings-card.tsx` — the memory panel UI
