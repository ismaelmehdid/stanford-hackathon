---
name: GitHub authentication flow
description: Distinguish Git-provider authentication from ordinary connected integrations.
---

A healthy-looking GitHub integration is not proof that workspace Git commands
have write authentication. Verify an actual push and its remote ref before
reporting that code reached GitHub.

**Why:** The provider reported an active healthy OAuth connection while Git
rejected push authentication and `gh` had no authenticated account. Generic
integration attachment/reconnection also failed to open a valid Git-provider
authorization form.

**How to apply:** For this mismatch, consult the current Replit Git documentation
and use the account settings' **Git Providers** connection flow, rather than
repeatedly proposing the ordinary integration. Never ask for inline tokens or
copy raw credentials into Git remotes. Preserve the prepared commits while
authorization is blocked.
