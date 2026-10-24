// Stamps the git sha of this build into app/index.html (the build meta and the footer).
// Run it on a clean app/index.html (`git checkout -- app/index.html` first), then deploy.
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const sha = execSync('git rev-parse HEAD', { cwd: root }).toString().trim();
const path = fileURLToPath(new URL('../app/index.html', import.meta.url));
const html = readFileSync(path, 'utf8');

if (!html.includes('__BUILD_SHA__')) {
  console.error('app/index.html has no __BUILD_SHA__ placeholder: run `git checkout -- app/index.html` first');
  process.exit(1);
}

writeFileSync(path, html.replaceAll('__BUILD_SHA__', sha));
console.log(sha);
