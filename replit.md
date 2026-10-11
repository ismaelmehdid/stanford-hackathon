# GrowthOS

GrowthOS is “GitHub for marketing”: a workspace for building marketing pipelines, versioning campaign repositories, reusing briefs, and reviewing changes.

## Current product scope

- Overview with real repository counts, review states, planned budget, and recent activity.
- Campaign repositories across Paid, Content, Social, Email, SEO, and Brand.
- Search by campaign name, summary, objective, or owner; status and channel filters.
- Editable briefs with objectives, audiences, budgets, content, and experiment hypotheses.
- Append-only campaign history, field comparisons, restoring a previous brief as a new draft, and forking campaigns for reuse.
- Draft → in review → approved → manually marked live.
- Review notes and request-changes decisions.
- Leadership dashboard and analytics for current planned budget by channel and workflow stage, funding gaps, and dated workflow activity.
- Budget allocation drafts with a total envelope, six channel allocations, notes, balance validation, and saved plans. Saving a draft does not update campaign budgets or marketing platforms.

This is a shared prototype workspace, **not an authenticated enterprise service**. Workspace membership, access control, external publishing, automated pipeline execution, measured experiment results, and connected performance analytics are not implemented. The UI must not imply that an internal status change publishes to marketing tools.

Meta Ads was selected as the intended performance source, but the user chose to continue without authorizing it. Analytics must show actual spend, conversions, CPA, and ROAS as unavailable, not zero or synthetic data. Current planning totals include labeled example repositories. Date filters apply to workflow activity in UTC, not historical spending; planned budgets are a current snapshot. Budget planning drafts are workspace-wide.

## Run and check

- Web workflow: `artifacts/stanford-hackathon: web`, preview `/`.
- API workflow: `artifacts/api-server: API Server`, routes `/api`.
- `pnpm install`
- `pnpm run typecheck`
- `pnpm --filter @workspace/stanford-hackathon test` — repeatable read-only browser smoke checks.
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API client and validation schemas.
- `pnpm --filter @workspace/db run push` — apply development schema changes.

Artifact workflows supply `PORT` and `BASE_PATH`. The API uses the existing managed PostgreSQL database via `DATABASE_URL`. Publishing applies managed database schema changes; do not add startup DDL or custom production migration scripts.

## Sources of truth

- `artifacts/stanford-hackathon/src/` — frontend routes, components, styling.
- `lib/api-spec/openapi.yaml` — API contract.
- `lib/db/src/schema/campaigns.ts` — campaigns, version snapshots, activity.
- `lib/db/src/schema/budget-plans.ts` — saved allocation drafts.
- `artifacts/api-server/src/routes/campaigns.ts` — transaction-backed campaign workflow.
- `artifacts/api-server/src/routes/analytics.ts` — planning aggregates and balanced budget drafts.
- `.migration-backup/` — original Next.js starter, retained for reference and excluded from publishing.

## GitHub frontend integration

The GitHub repository has a separate Next.js influencer-analysis implementation
that must be preserved when syncing this Replit frontend. Do not force-push this
workspace's divergent history over it.

`scripts/export-growthos.mjs <github-checkout>` exports the frontend, supporting
campaign/budget API, and shared contracts into an isolated `growthos/` workspace.
It excludes credentials, database records, Replit artifact metadata, and build
outputs. Use a checkout of the latest GitHub main as the baseline for integration.
The integrated Next.js application serves the built frontend at `/growthos/`,
keeps its existing `/analyze`, `/api/runs`, and `/api/media` implementation,
and proxies only the GrowthOS campaign/budget routes to the companion API.
The frontend's optional `VITE_ANALYSIS_URL` is set at build time for navigation.
See the GitHub checkout's README for its installation, schema, and run commands.

## Workflow rules

- Saving an edited or restored brief returns it to draft; approvals do not transfer to changed content.
- Restoring creates a new revision rather than deleting or replacing history.
- Campaign row locks keep revision numbering and workflow transitions atomic.
- Editors submit the last-loaded timestamp to prevent overwriting a newer saved brief.
- Seeded example campaigns are labeled as examples, not actual channel deployments or performance data.
