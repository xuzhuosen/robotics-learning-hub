import { readFile, writeFile } from 'node:fs/promises';
import { buildIssueSnapshot } from './snapshot.mjs';
import { githubCliClient } from './github-client.mjs';

const github = githubCliClient();
const config = JSON.parse(await readFile(new URL('../config.json', import.meta.url), 'utf8'));
let previous;
try { previous = JSON.parse(await readFile(new URL('../data/issue-snapshot.json', import.meta.url), 'utf8')); } catch {}
const snapshot = await buildIssueSnapshot({ github, config, previous });
await writeFile(new URL('../data/issue-snapshot.json', import.meta.url), JSON.stringify(snapshot, null, 2) + '\n');
console.log(`Updated ${snapshot.repositories.length} repositories, ${snapshot.issues.length} issues, ${snapshot.discussions.length} discussions.`);
for (const warning of snapshot.warnings) console.warn(warning);
