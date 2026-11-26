import { readFile, writeFile, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { normalizeConfig, DOMAIN_LABELS } from '../lib/core.mjs';
const exec = promisify(execFile);
const executable = process.env.GH_EXECUTABLE || 'gh';
const config = normalizeConfig(JSON.parse(await readFile(new URL('../config.json', import.meta.url), 'utf8')));
const prune = process.argv.includes('--prune');
const previous = [];
// Check every target and save the definitions before the first mutation.
for (const repository of config.repositories) {
  const name = `${repository.owner}/${repository.repo}`;
  const { stdout } = await exec(executable, ['api', `repos/${name}`, '--jq', '.private']);
  if (stdout.trim() !== 'false') throw new Error(`${name} must be public.`);
  const labels = JSON.parse((await exec(executable, ['label', 'list', '--repo', name, '--limit', '1000', '--json', 'name,color,description'])).stdout);
  if (prune) {
    const { stdout } = await exec(executable, ['api', `repos/${name}/issues?state=all&per_page=100`, '--paginate', '--slurp']);
    const assigned = JSON.parse(stdout).flat().filter(issue => !issue.pull_request).flatMap(issue => issue.labels.map(label => label.name));
    if (assigned.some(label => !DOMAIN_LABELS.some(domain => domain.name === label))) throw new Error(`${name}: migrate assigned labels before pruning.`);
  }
  previous.push({ repository: name, labels });
}
if (prune) {
  const directory = await mkdtemp(join(tmpdir(), 'duck-lab-label-backup-'));
  const backup = join(directory, 'labels.json');
  await writeFile(backup, JSON.stringify(previous, null, 2) + '\n');
  console.log(`Label definitions saved: ${backup}`);
}
if (config.discussions.enabled) await exec(executable, ['repo', 'edit', `${config.owner}/${config.repo}`, '--enable-discussions']);
for (const repository of config.repositories) {
  const name = `${repository.owner}/${repository.repo}`;
  for (const { name: label, color, description } of DOMAIN_LABELS) await exec(executable, ['label', 'create', label, '--repo', name, '--color', color, '--description', description, '--force']);
  let removed = 0;
  if (prune) for (const label of previous.find(source => source.repository === name).labels) {
    if (DOMAIN_LABELS.some(domain => domain.name === label.name)) continue;
    await exec(executable, ['label', 'delete', label.name, '--repo', name, '--yes']);
    removed++;
  }
  console.log(`Synchronized ${DOMAIN_LABELS.length} domain labels, removed ${removed}: ${name}`);
}
