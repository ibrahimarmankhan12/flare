# Teams and seats

Flare has teams. A team is a group of users who share access to
agents, MCP servers, workflows, collections, bookmarks, and chat
threads. Every user has a personal team they own by default — the
"personal scope" — and can create additional teams, invite members,
and switch the active team context from the header. Team plans
(`free | pro | team | business`) are wired to Stripe so the seat
count maps to a real subscription.

The feature is built on the Better Auth `organization` plugin, with
a thin Flare layer for the per-user personal team and the
Stripe-side `subscription` table that backs the `user.tier` enum.

## What a team is

A team is a row in the `team` table with:

- A **name** and a unique **slug** (the URL-friendly identifier).
- An **owner** (FK to `user`). The owner is the only person who can
  delete the team or change its slug. Ownership transfer is a future
  flow.
- A **plan** (`free | team | business`) — the team's pricing tier,
  separate from each member's personal `user.tier`.
- Stripe linkage columns (`stripe_customer_id`,
  `stripe_subscription_id`) populated by the webhook.

Membership lives in a separate `team_member` table with four roles:

| Role       | What they can do                                    |
| ---------- | --------------------------------------------------- |
| `owner`    | Everything. The unique owner; cannot be demoted.    |
| `admin`    | Manage members, change roles (except owner).       |
| `member`   | Read and write team resources.                      |
| `viewer`   | Read-only access to team resources.                 |

`UNIQUE (team_id, user_id)` prevents double-adds; a second add of
the same user is an idempotent upsert that updates the role.

## Auto-provision: every user gets a personal team

The first time a user signs up, the
`onUserCreateCreatePersonalTeam` hook in
`src/lib/auth/org-hooks.ts` fires as part of the Better Auth
`databaseHooks.user.create.after` pipeline. The hook:

1. Mints a slug of the form `<userId>-personal`. The slug is unique
   by construction because the userId is a uuid, so a UNIQUE
   constraint violation is impossible on first creation.
2. Calls `teamRepository.createTeam({ name: "<user display name>'s
   personal team", slug }, userId)`. The repository inserts the
   `team` row and then, in a second insert, a `team_member` row
   with `role = 'owner'` so the membership query has at least one
   row.
3. Returns. Subsequent sign-ins are no-ops (the hook only fires on
   user creation).

A new user therefore has a `team` they own from their very first
session. All of the new `org_id` columns on `chat_thread`,
`chat_message`, `agent`, `mcp_server`, `workflow`, `collection`,
`bookmark`, and `user_memory` start as `NULL`, which is the
"personal scope" sentinel — the row belongs to the user, not the
team. The `scopedWhere` helper below maps `NULL` to a `userId`
filter so existing personal-scope queries continue to work
unchanged.

The hook creates the two rows through the repository (`team` then
`team_member`). `teamRepository.createTeam` already inserts the owner
membership, and the hook calls `addTeamMember` again as an idempotent
upsert. Errors are logged and swallowed so a transient team-write
failure does not block signup; a backfill or future sign-in hook can
repair a missing personal team.

## The `scopedWhere` helper

Every repository that reads or writes a per-user resource should
use `buildOrgScopedWhere(table, { userId, orgId })` from
`src/lib/auth/scoped-where.ts` to generate the SQL fragment. The
helper centralises the rule "personal rows are `userId`-scoped,
team rows are `orgId`-scoped" so it does not have to be re-derived
in every query:

```ts
import { buildOrgScopedWhere } from "lib/auth/scoped-where";

const where = buildOrgScopedWhere(ChatThreadTable, {
  userId: session.user.id,
  orgId: session.session.activeOrgId ?? null,
});
```

When `orgId` is `null` (personal scope), the helper returns
`eq(table.userId, userId)`. When `orgId` is set, it returns
`eq(table.orgId, orgId)`. Membership is deliberately checked outside
this helper with `isOrgMember(userId, orgId)` before the query runs, so
list queries stay simple indexed lookups.

The helper is the single chokepoint for "which rows can the
caller see right now?" — any new repository should import it
rather than writing ad-hoc `eq(table.userId, userId)` checks. The
old queries in the codebase are being migrated over time; new
repositories must use it from the start. For combined list views,
`buildPersonalOrOrgWhere(table, scope)` exists, but its current shape
matches both `userId` and `orgId` together rather than a broad
`personal OR org` query.

## Switching the active team

The active team is stored on the Better Auth session as
`session.activeOrgId`. A future "Active team" picker in the
header will write the chosen team id to the session; until that
lands, every session is implicitly on the user's personal team
(the auto-provisioned one), and the `scopedWhere` helper resolves
to a personal-scope query.

In practice this means: in Phase 4, every read and write goes to
personal scope. The data layer is ready for team scope (the
columns, the helper, the repositories all accept `orgId`); the
header picker is the missing UI piece.

## Tier system and Stripe

The `subscription` table is the audit log of every Stripe
subscription the app has ever seen. Each row carries:

- `user_id` — the personal-scope owner of the subscription. NOT NULL.
- `org_id` — the team id, if the subscription is team-scoped. NULL
  for personal subscriptions.
- `stripe_subscription_id` — UNIQUE; the natural key from Stripe.
- `stripe_customer_id` — FK reference back to the team or user.
- `status` — `active | past_due | canceled | incomplete | trialing`.
- `tier` — `free | pro | team | business`. Matches the
  `user.tier` enum so the two stay in sync.
- `current_period_start` / `current_period_end` /
  `cancel_at_period_end` — for displaying "renews on …" in the
  billing UI.

The `user.tier` column is a denormalized cache: it is the field
every hot-path code branch reads to decide rate limits and
feature flags. The webhook handler
(`src/app/api/stripe/webhook/route.ts`) writes to both:

1. `subscriptionRepository.createSubscription` /
   `updateSubscription` / `cancelSubscription` — the audit log.
2. A direct `UserTable.tier` update — the cache.

Reading `user.tier` is O(1); reading the latest subscription is a
query. The duplication is intentional so the hot path does not
need a join. The Stripe helper maps Phase 4's billing tiers onto the
existing Flare user-tier values: `free -> free`, `pro -> flare-pro`,
`team -> flare-enterprises`, and `business -> flare-enterprises-max`.

### The webhook

`POST /api/stripe/webhook` accepts:

- `customer.subscription.created` →
  `subscriptionRepository.createSubscription` + `user.tier = '<mapped tier>'`
- `customer.subscription.updated` →
  `subscriptionRepository.updateSubscription` + `user.tier = '<mapped tier>'`
- `customer.subscription.deleted` →
  `subscriptionRepository.cancelSubscription` + `user.tier = 'free'`
- `invoice.payment_failed` →
  `subscriptionRepository.updateSubscription(..., { status: 'past_due' })`
- `checkout.session.completed` →
  creates the subscription row and syncs `user.tier` when checkout finishes
  before Stripe's separate subscription event arrives

The route **must** verify the Stripe signature against
`STRIPE_WEBHOOK_SECRET` on every request and reject anything
unverified. The check is mandatory, not optional, because
unverified webhooks would let any external party rewrite a
user's tier. `stripe.webhooks.constructEvent(rawBody, sig,
secret)` is the only signature-valid code path; do not introduce
a second one.

The handler is idempotent: the
`stripeSubscriptionId` UNIQUE constraint makes
`createSubscription` a no-op on redelivery, and
`updateSubscription` is a patch — re-applying the same patch is
a no-op. If a subscription event cannot be mapped back to a Flare
user, the route logs and acknowledges the event so Stripe does not
retry forever.

### Tier mapping

`subscription.tier` matches the `user.tier` enum exactly:
`free | pro | team | business`. The webhook is responsible for
mapping the Stripe price id to one of these four values. The
mapping itself is configured with environment variables
`STRIPE_PRICE_PRO`, `STRIPE_PRICE_TEAM`, and `STRIPE_PRICE_BUSINESS`.
Unknown non-empty price ids throw so a misconfigured deployment is caught
at webhook time instead of silently granting or revoking access.

## Limits and risks

- **10 orgs per user.** This is the Better Auth `organization`
  plugin's default cap. A user can be a member of (or own) at
  most 10 teams. The auto-provisioned personal team counts
  toward the cap. If a user has reached the cap, the personal
  team is one of those 10 — they cannot create more.
- **Free tier is the default.** Until Stripe is configured
  (no `STRIPE_SECRET_KEY` set), every new user is `free` and
  every team is `plan = 'free'`. The webhook simply never
  fires.
- **Owner cannot be demoted.** `teamRepository.removeTeamMember`
  and `teamRepository.updateTeamMemberRole` both refuse to
  remove or demote the owner. Ownership transfer is a future
  flow that will require its own dedicated route.
- **`/api/mcp/installed` and `/api/agent/installed` filter by
  `activeOrgId` when present.** If the Better Auth session does not
  expose `activeOrgId`, they gracefully fall back to personal scope.
  The header/team switcher UI is still the missing product layer for
  changing that session value.
- **Encryption-at-rest is not yet wired for Stripe ids.**
  `team.stripe_customer_id`, `team.stripe_subscription_id`,
  and `subscription.stripe_*` columns are plain text. This
  matches the existing `dodo_subscription` precedent and is on
  the Phase 5 hardening list.
- **`onUserCreateCreatePersonalTeam` is non-blocking.** The hook logs
  and swallows failures so signup can continue. That keeps auth
  availability high, but it means a failed team insert needs a future
  backfill/sign-in repair path.

## See also

- `src/lib/auth/config.ts` — Better Auth config (the
  `organization` plugin is enabled here)
- `src/lib/auth/org-hooks.ts` — the `onUserCreateCreatePersonalTeam`
  hook that auto-provisions a personal team
- `src/lib/auth/scoped-where.ts` — the `buildOrgScopedWhere`
  helper that all repositories use
- `src/lib/db/pg/repositories/team-repository.pg.ts` —
  `createTeam` / `addTeamMember` / `updateTeamMemberRole` /
  `removeTeamMember` (and the owner-invariant guards)
- `src/lib/db/pg/repositories/subscription-repository.pg.ts`
  — the Stripe-side audit log
- `src/app/api/stripe/webhook/route.ts` — the webhook handler
  (signature verification, event dispatch, `user.tier` write)
- `src/app/api/stripe/checkout/route.ts` and
  `src/app/api/stripe/portal/route.ts` — the customer-facing
  routes that start a checkout session and open the
  billing portal
- `src/lib/payments/stripe.ts` — the Stripe SDK wrapper (price
  → tier mapping, customer create, etc)
- `src/lib/db/migrations/pg/0025_amber_assembly.sql` — the
  schema migration that adds `team`, `team_member`,
  `subscription`, and the `org_id` columns on every
  shareable resource table
