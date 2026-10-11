// Export app source into an additive, independent workspace in the GitHub repo.
// Never copy database records, credentials, Replit metadata, or build outputs.
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const source = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const destination = process.argv[2];
if (!destination) throw new Error('Usage: node scripts/export-growthos.mjs <checked-out-github-repo>');
const target = path.resolve(destination, 'growthos');
if (target === source || source.startsWith(`${target}${path.sep}`)) throw new Error('Unsafe export destination');
await mkdir(target, { recursive: true });
const omitted = new Set(['node_modules', 'dist', '.replit-artifact', '.git', 'test-results', 'playwright-report']);
for (const directory of [
  'artifacts/stanford-hackathon', 'artifacts/api-server',
  'lib/api-client-react', 'lib/api-zod', 'lib/api-spec', 'lib/db',
]) {
  await cp(path.join(source, directory), path.join(target, directory), {
    recursive: true,
    filter: entry => !omitted.has(path.basename(entry)) && !entry.endsWith('.tsbuildinfo'),
  });
}
for (const file of ['tsconfig.json', 'tsconfig.base.json', 'pnpm-lock.yaml']) {
  await cp(path.join(source, file), path.join(target, file));
}
// Replit's Linux-only binary exclusions must not prevent installs on teammates'
// macOS/Windows machines. Preserve the security overrides, not platform pruning.
let workspace = await readFile(path.join(source, 'pnpm-workspace.yaml'), 'utf8');
workspace = workspace.replace('  - lib/integrations/*\n', '').replace('  - scripts\n', '');
workspace = workspace.split('\n').filter(line => !/:\s*["']-["']\s*$/.test(line)).join('\n');
workspace = workspace.replace(/^onlyBuiltDependencies:\n((?:[ \t]+.+\n)*)/m, (_section, entries) =>
  'allowBuilds:\n' + entries.split('\n').filter(Boolean).map(line => {
    const dependency = line.trim().replace(/^-\s*/, '').replace(/^['"]|['"]$/g, '');
    return `  ${JSON.stringify(dependency)}: true\n`;
  }).join(''));
await writeFile(path.join(target, 'pnpm-workspace.yaml'), workspace);
await writeFile(path.join(target, '.npmrc'), 'auto-install-peers=false\nstrict-peer-dependencies=false\nmanage-package-manager-versions=false\nnode-linker=hoisted\nverify-deps-before-run=false\n');
await writeFile(path.join(target, '.gitignore'), 'node_modules/\ndist/\n*.tsbuildinfo\n.env*\n!.env.example\ntest-results/\nplaywright-report/\n');
await writeFile(path.join(target, 'package.json'), JSON.stringify({
  name: 'growthos-workspace', private: true,
  scripts: {
    'typecheck:libs': 'tsc --build',
    typecheck: 'pnpm run typecheck:libs && pnpm --filter @workspace/api-server --filter @workspace/stanford-hackathon run typecheck',
    build: 'pnpm run typecheck && pnpm --filter @workspace/api-server --filter @workspace/stanford-hackathon run build',
    'db:push': 'pnpm --filter @workspace/db run push',
    codegen: 'pnpm --filter @workspace/api-spec run codegen',
  },
  devDependencies: { typescript: '~5.9.3', prettier: '^3.9.6' },
}, null, 2) + '\n');
console.log('Exported GrowthOS source and API contracts; no database data or secrets copied.');
