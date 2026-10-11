---
name: pnpm version settings
description: Avoid implicit reinstalls when pnpm 11 meets installs and settings from pnpm 10.
---

pnpm 11's non-registry configuration belongs in `pnpm-workspace.yaml`, not just
`.npmrc`. In particular, use `nodeLinker`, `verifyDepsBeforeRun`, and `allowBuilds`
there. Do not assume `.npmrc` flags or an old `onlyBuiltDependencies` list will
control pnpm 11 automation.

**Why:** The GitHub project pins pnpm 11 while this environment also provides
pnpm 10. A version switch enabled implicit dependency verification/installation
before script execution, which caused headless module-purge prompts and stopped
managed workflows. Configuring only `.npmrc` did not prevent it. A fresh pnpm 11
CI install also rejected esbuild's build script until `allowBuilds` was explicit.
An opaque pnpm worker exit during module-directory recreation can also mean the
installer was running from a local dependency that the install itself removed,
rather than a memory or network failure.

**How to apply:** Keep the workspace's linker setting aligned with its installed
layout, install dependencies explicitly before automation, and configure
dependency verification and permitted builds in the workspace YAML. Validate
fresh installs with the package-manager version declared by the target project.
For headless setup, run the installer from an environment tool outside the
project's replaceable `node_modules` tree and explicitly enable non-interactive
CI mode.
