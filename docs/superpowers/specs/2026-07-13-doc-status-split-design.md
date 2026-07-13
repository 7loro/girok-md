# Design: Split dashboard doc status `pending` into `new` / `modified`

Date: 2026-07-13
Status: Approved

## Problem

The dashboard Documents page derives a single `pending` status for two distinct
situations: a publishable doc that has never been synced, and a previously
synced doc whose source was modified afterwards. Users cannot tell "waiting for
first publish" apart from "published but edited since".

## Decision

Replace `pending` with two statuses. `synced` and `built` stay separate
(user-confirmed).

| Status | Condition | Meaning |
|---|---|---|
| `draft` | `publish: false` | unchanged |
| `new` | publishable, not in output dir | awaiting first sync |
| `modified` | publishable, in output dir, source `modified` > `publish_sync_at` | published but edited since |
| `synced` | unchanged | synced, not yet built |
| `built` | unchanged | synced and built |
| `orphaned` | unchanged | unpublished/removed source leftover |

An output file missing `publish_sync_at` makes `checkShouldSync` return
`shouldSync: true`, so it classifies as `modified` — acceptable, since it needs
a re-sync either way.

## Changes

1. `dashboard/server/services/docStatus.ts` — `DocStatus` union; `deriveStatus`
   branches: `!inOutput → 'new'`, `inOutput && !upToDate → 'modified'`.
   `StatusInput` already carries `inOutput`/`upToDate`; no signature change.
2. `dashboard/server/app.ts` — `/api/overview` counts record gains the two new
   keys, drops `pending`.
3. `dashboard/web/src/api.ts` — `DocStatus` union type.
4. `dashboard/web/src/pages/Documents.tsx` — filter chips
   `all / draft / new / modified / synced / built / orphaned`, each showing its
   doc count (`modified (3)`; `all` shows total).
5. `dashboard/web/src/pages/Overview.tsx` — `STATUS_ORDER` gains both statuses.
6. `dashboard/web/src/components/StatusBadge.tsx` — `new` keeps pending's warn
   (yellow) style; `modified` gets an orange style.
7. `dashboard/server/__tests__/docStatus.test.ts` — the two former pending
   cases assert `new` and `modified` respectively.

## Testing

Unit tests via `deriveStatus` cover the split. Manual verification: run the
dashboard, confirm filter counts and badges against a vault with docs in each
state.
