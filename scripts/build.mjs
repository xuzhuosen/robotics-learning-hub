import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { normalizeConfig } from '../lib/core.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
const out = new URL('../dist/', import.meta.url);
normalizeConfig(JSON.parse(await readFile(new URL('../config.json', import.meta.url), 'utf8')));
const data = JSON.parse(await readFile(new URL('../data/space.json', import.meta.url), 'utf8'));
if (!data.phases?.length || !data.tasks?.length) throw new Error('学习路线和起步任务不能为空。');
await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
for (const file of ['index.html', 'styles.css', 'app.mjs', 'config.json', 'assets', 'data', 'lib']) {
  await cp(new URL(`../${file}`, import.meta.url), new URL(file, out), { recursive: true });
}
await writeFile(new URL('.nojekyll', out), '');
console.log(`Built ${root}dist (static site, no dependencies).`);
