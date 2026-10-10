# Stanford Hackathon

Next.js 16 (App Router) + React 19 + TypeScript + Tailwind CSS 4, managed with pnpm.

## Prerequisites

- Node.js 24 (see `.nvmrc`; anything `>=22` works). With nvm: `nvm use`.
- pnpm 11. Easiest via Corepack, which reads the pinned version from `package.json`:

  ```bash
  corepack enable
  ```

## Getting started

```bash
pnpm install
cp .env.example .env.local   # then fill in values
pnpm dev
```

Open http://localhost:3000.

## Scripts

| Command             | What it does                                    |
| ------------------- | ----------------------------------------------- |
| `pnpm dev`          | Start the dev server (Turbopack)                |
| `pnpm build`        | Production build                                |
| `pnpm start`        | Serve the production build                      |
| `pnpm lint`         | ESLint (Next.js core-web-vitals + TypeScript)   |
| `pnpm typecheck`    | Generate route types, then run `tsc --noEmit`   |
| `pnpm format`       | Format everything with Prettier                 |
| `pnpm format:check` | Check formatting without writing (what CI runs) |

## Project structure

```
src/
  app/          # Routes, layouts, and route handlers (App Router)
  components/   # Shared UI components (create as needed)
  lib/          # Shared utilities, clients, and helpers (create as needed)
```

Import from `src/` with the `@/` alias, e.g. `import { Button } from "@/components/button"`.

## Collaboration workflow

1. Pull the latest `main` and branch off it: `git checkout -b feat/short-description`.
2. Keep pull requests small and focused on one feature or fix.
3. Before pushing, run `pnpm format && pnpm lint && pnpm typecheck`.
4. Open a pull request against `main`. CI (`.github/workflows/ci.yml`) runs format check, lint, typecheck, and build; it must pass before merging.
5. Use [Conventional Commits](https://www.conventionalcommits.org/) for commit messages (`feat:`, `fix:`, `chore:`, `docs:`, `refactor:`).
6. Write all code, comments, commit messages, and docs in English.

## Environment variables

- Add every new variable to `.env.example` with a short comment, without the real value.
- Keep real values in `.env.local`. It is git-ignored.
- Only variables prefixed with `NEXT_PUBLIC_` reach the browser. Never put secrets in them.

## Notes on Next.js 16

- `cacheComponents` and `partialPrefetching` are enabled in `next.config.ts`. Data fetching and caching work differently from older Next.js versions. Read the docs before adding data fetching.
- Version-matched docs ship in `node_modules/next/dist/docs/`. `AGENTS.md` (and `CLAUDE.md`, which imports it) point coding agents there.
- `pnpm-workspace.yaml` keeps install scripts for `sharp` and `unrs-resolver` disabled, the create-next-app default. Prebuilt binaries cover normal use.

## Part 1 — Influencer video analysis

Finds a hair care brand's influencer videos on Instagram, tiers them, and analyzes why they work.

1. Add `APIFY_TOKEN` and `OPENAI_API_KEY` to `.env`.
2. Run `pnpm dev`, open http://localhost:3000/analyze, paste a brand URL, and start.
   Or from the terminal: `pnpm analyze https://www.instagram.com/headandshoulders --creators 5`.

Each influencer video is compared with the median of the brand page's and the creator's other videos (views, likes, comments):

- **Amplify**: beats both pages.
- **Observe**: beats one page.
- **Stop**: beats neither.

Output for Part 2: `.data/runs/<runId>/analysis.json`, also downloadable from the run page. Its shape is `BrandAnalysisSchema` in `src/lib/analysis/schema.ts`. `conclusions.replicationBriefs` is the input for script generation.

Everything is cached in `.data/` (git-ignored), so re-running a brand reuses finished scrapes and AI calls. Design: `docs/superpowers/specs/2026-10-10-video-analysis-design.md`.
