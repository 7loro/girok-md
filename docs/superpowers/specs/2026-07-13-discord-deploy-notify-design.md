# Design: Discord notification on blog deploy

Date: 2026-07-13
Status: Approved

## Problem

Blog deploys run in the instance repo (`7loro/7loro.github.io`, a copy of this
codebase) via its Pages workflow. Nothing announces success or failure, so a
broken deploy goes unnoticed until someone visits the site.

## Decision

Follow coupleKanban's `firebase-deploy.yml` notification pattern: a Discord
webhook step driven by a `DISCORD_WEBHOOK_URL` repo secret (registered by the
user), silently skipping when the secret is absent. Applied to both repos
(user-confirmed):

- **girok-md** commits `.github/workflows/deploy.yml` as the template. Every
  job carries `if: github.repository != '7loro/girok-md'` (directly on
  `build`/`notify`; `deploy` inherits it through `needs`), because girok-md's
  own Pages hosts the docs site (`docs` branch) and running this workflow here
  would clobber it. Identical file path and content in both repos keeps the
  template and the live workflow in sync.
- **7loro/7loro.github.io** gets the same file pushed to `main` (triggers one
  harmless rebuild).

## Workflow shape

Existing `build` → `deploy` jobs stay as they are. A third `notify` job with
`needs: [build, deploy]` and `if: always()` fires even when build or deploy
fails — a notify *step* inside `deploy` would be skipped entirely on build
failure (coupleKanban is single-job, so a step sufficed there).

Status mapping from `needs.*.result`: deploy success → ✅ green; either job
cancelled → ⚪ grey; anything else → ❌ red. The embed carries repo, short SHA +
commit message (jq-escaped, multi-line safe), author, site link (from the
deploy job's `page_url` output when present), and the Actions run URL.
`workflow_dispatch` runs have no `head_commit`; fall back to "manual run".

## Testing

YAML validated locally; real verification is the first push to the instance
repo (expected: notify job skips with a log message until the secret exists,
then posts an embed once registered).
