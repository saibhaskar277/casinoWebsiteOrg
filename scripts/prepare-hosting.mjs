import { cpSync, mkdirSync, rmSync, writeFileSync, readFileSync, existsSync } from 'fs';
import { execSync } from 'child_process';

const rev = execSync('git rev-parse --short HEAD').toString().trim();
rmSync('dist', { recursive: true, force: true });
mkdirSync('dist', { recursive: true });

for (const f of ['index.html', 'island-scene.js', 'casino-hero.js']) {
  cpSync(f, `dist/${f}`);
}
cpSync('assets', 'dist/assets', { recursive: true });
cpSync('plugins', 'dist/plugins', { recursive: true });
cpSync('site-agent', 'dist/site-agent', { recursive: true });

for (const f of ['index.html', 'island-scene.js', 'casino-hero.js']) {
  const p = `dist/${f}`;
  writeFileSync(p, readFileSync(p, 'utf8').replaceAll('__DEPLOY_REV__', rev));
}

const stale = [
  'dist/assets/scene/web-layout.jpg',
  'dist/assets/ui/web-layout.jpg',
];
for (const p of stale) {
  if (existsSync(p)) rmSync(p);
}

writeFileSync('dist/deploy-rev.txt', `${rev} ${new Date().toISOString()}\n`);
console.log(`Prepared dist/ rev ${rev}`);
