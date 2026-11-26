import { readFile } from 'node:fs/promises';
import { githubCliClient } from './github-client.mjs';
import { initializeProjectTasks } from './initialize-project-tasks.mjs';
const config = JSON.parse(await readFile(new URL('../config.json', import.meta.url), 'utf8'));
const apply = process.argv.includes('--apply');
const result = await initializeProjectTasks({ github: githubCliClient(), config, dryRun: !apply });
console.log(JSON.stringify({ mode: apply ? 'applied' : 'preview', ...result }, null, 2));
