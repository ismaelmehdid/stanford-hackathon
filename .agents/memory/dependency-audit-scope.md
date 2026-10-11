---
name: Dependency audit scope
description: Archived dependencies can produce security findings despite deployment exclusions.
---

Workspace dependency audits scan archived lockfiles, not just the active pnpm workspace. Deployment exclusions do not exclude a directory from security scanning.

**Why:** An unused pre-migration lockfile continued reporting an unpatched dependency after the active dependency graph was clean.

**How to apply:** When a finding persists but the active lockfile and dependency tree are clean, inspect archived lockfiles. Retain archived source code; remove obsolete lockfiles only when the archive is not an independently maintained application. Historical lockfiles remain recoverable through version history.
