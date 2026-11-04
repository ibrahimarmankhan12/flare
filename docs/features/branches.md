# Thread branching

Any assistant reply can become the seed of a brand-new conversation. Forking a thread copies everything up to the chosen message into a fresh thread, leaves the original intact, and lets you take the conversation in a different direction without losing the work that came before.

## What forking is

A **fork** is a copy of a thread's messages up to (and including) a chosen assistant reply. The copy is a new thread that:

- has the same title, suffixed with `(branch)` (or a custom label you provide)
- is owned by you, like any other thread
- has its own `parentThreadId` and `forkFromMessageId` metadata so the relationship is recoverable
- contains an exact copy of the selected messages with new IDs and a stripped `usage` block (no stale billing data is carried over)

The original thread is never modified. You can keep chatting in it, fork it again from a different point, or delete it — none of those actions affect the branch.

## When to use it

Forking is useful when:

- **The assistant gave you two valid options** and you want to see how each plays out in parallel.
- **You want to explore a tangent** ("what if I rewrote this in Rust instead?") without polluting the main thread.
- **You hit a wrong turn** and want to retry from an earlier message with a different prompt. Forking beats deleting messages because the original is preserved and you can navigate back to it.
- **You want to share a specific point in a conversation** with someone. Forking gives them a clean thread that starts where you wanted them to start.

## How to fork

1. Open the thread you want to branch from.
2. Hover over any assistant message and click the action menu (the three-dot or kebab button on the right edge of the message).
3. Click **"Fork from here"**.
4. The new thread opens immediately. It is a private copy — only you can see it.

If you provide a custom `branchLabel` (in the API: `POST /api/thread/[id]/fork`), the label is appended to the title so you can distinguish multiple branches of the same source. The label is capped at 100 characters.

The "Fork from here" affordance is wired up in `src/components/message-parts.tsx` and posts to `POST /api/thread/[id]/fork` (`src/app/api/thread/[id]/fork/route.ts`). The route is rate-limited per user; a runaway client cannot create unbounded branches.

## What happens to the original

Nothing. The original thread keeps its title, its messages, its bookmark state, and its position in your sidebar. Forks are independent of the source after creation: editing a message in the fork does not edit it in the source, and vice versa. They share no live state.

The schema records the relationship so you can walk back:

- `chat_thread.parentThreadId` — the source thread, or `null` if the thread is not a branch.
- `chat_thread.forkFromMessageId` — the message the fork was anchored on.
- `chat_thread.branchLabel` — the optional label you provided.

These columns are populated at fork time. They are never updated after the fact.

## How to navigate back to the source

Each branch shows a "Forked from" crumb near the thread title in the chat header. Click it to jump to the source thread at the anchored message.

You can also list all branches of a given source via the API. The thread detail endpoint returns `parentThreadId` and `forkFromMessageId`; combined with a list call, you can reconstruct the entire fork tree.

For now, the UI surfaces the parent link on the branch only. A future iteration will add a "branches of this thread" view on the source.

## Plan limits and quotas

Forking does not consume extra quota beyond what the assistant replies already cost. The source messages were already generated and paid for; forking only reuses the saved text. There is no per-fork charge.

A forked thread can itself be forked, up to a depth of 5 by default. Deeper chains are rejected with HTTP 400. This prevents pathological fork trees (a thread that was forked 100 times would otherwise explode the message copy cost).

## Cross-branch insights (planned)

A future feature, not yet shipped: when you have multiple branches of the same source, Flare will offer a "Compare branches" view that:

- Lines up the divergent assistant replies side by side.
- Surfaces the differences in approach, code, or recommendation.
- Lets you "merge" the better answer back into the source thread as a new message.

The schema already supports this: each branch has its own `summary`/`decisions`/`actionItems` columns (added in 0022) which can be generated independently. The compare UI is a Phase 2+ item.

Until then, the most reliable way to compare branches is to open them in two tabs and read them side by side.

## API reference

```
POST /api/thread/[id]/fork
Content-Type: application/json
Authorization: required (signed-in user)

Body:
{
  "forkFromMessageId": "<uuid of the assistant message to fork from>",
  "branchLabel": "<optional, max 100 chars>"
}

Responses:
  200 — { ...full ChatThread object for the new branch }
  400 — missing forkFromMessageId, or branchLabel too long
  401 — not signed in
  404 — source thread not found, or you don't own it
  500 — unexpected (logged)
```

The response is a full `ChatThread` so the client can navigate to the new thread immediately (`router.push(\`/chat/${newThread.id}\`)`).

## See also

- `src/app/api/thread/[id]/fork/route.ts` — the fork route handler
- `src/lib/chat/fork-thread.ts` — client-side helper (`buildForkBody`, `forkThread`)
- `src/lib/db/pg/repositories/chat-repository.pg.ts` — `forkThread` repository method
- `src/components/message-parts.tsx` — the "Fork from here" affordance
- `src/types/chat.ts` — `ForkThreadInput` and the `forkThread` method on `ChatRepository`
