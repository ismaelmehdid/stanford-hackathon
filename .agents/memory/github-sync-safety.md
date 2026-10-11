---
name: GitHub sync safety
description: Preserve remote changes and verify repository identity after automated merges.
---

Before syncing GitHub, verify that Git's reported top-level directory is the
intended checkout and fetch the latest remote baseline. Prefer an independent
clone for a repository with a different history from the managed workspace.

**Why:** After an automated merge, a previously created worktree lost its `.git`
marker. Git commands in that directory silently found the ancestor workspace
repository instead. Meanwhile, the remote received new homepage and campaign
features while push authentication was blocked.

**How to apply:** Check `git rev-parse --show-toplevel` before staging or pushing.
Do not rely on an ignored worktree's Git metadata surviving automated workspace
reconciliation. Preserve existing remote features instead of reapplying an old
homepage replacement or force-pushing the Replit history.
