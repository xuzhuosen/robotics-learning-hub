import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import * as core from '../lib/core.mjs';
import * as live from '../lib/live.mjs';
import { taskIntakeMarker, parseTaskIntake } from '../lib/task-intake.mjs';

async function mount(saved = null) {
  const rawConfig = { owner: 'alice', repo: 'hub', repositories: ['alice/runtime', 'alice/rl'], project: { owner: 'alice', number: 1 }, discussions: { enabled: true } };
  const config = core.normalizeConfig(rawConfig);
  const space = JSON.parse(await readFile(new URL('../data/space.json', import.meta.url), 'utf8'));
  const snapshot = { repository: 'alice/hub', updatedAt: '2026-11-26T00:00:00Z', repositories: config.repositories.map(item => ({ repository: `${item.owner}/${item.repo}`, labels: ['software', 'hardware', 'rl', 'simulation', 'platform'] })), project: { config: config.project }, discussionsEnabled: true,
    issues: [...['alice/runtime', 'alice/rl'].map(repository => ({ repository, number: 1, title: `[任务] ${repository}`, body: '<!-- phase:train -->', labels: ['task'], state: 'open', user: { login: 'alice' } })), { repository: 'alice/hub', number: 9, title: '[讨论] 不再展示的历史讨论', body: '旧交流', labels: [] }],
    discussions: [{ source: 'discussion', repository: 'alice/hub', number: 2, title: '训练方向讨论', comments: 3, state: 'open', category: { name: '问答', slug: 'q-a' } }], discussionCategories: ['announcements', 'general', 'ideas', 'polls', 'q-a', 'show-and-tell'].map(slug => ({ slug, name: slug }))
  };
  const elements = new Map();
  const element = selector => {
    if (!elements.has(selector)) elements.set(selector, { innerHTML: '', textContent: '', classList: { add() {}, remove() {} }, focus() {}, addEventListener() {}, showModal() { this.open = true; }, close() { this.open = false; } });
    return elements.get(selector);
  };
  const events = {}, windowEvents = {}, opened = [];
  const location = { pathname: '/', hash: '#home' };
  const files = { './config.json': rawConfig, './data/space.json': space, './data/records.json': [], './data/issue-snapshot.json': snapshot };
  const source = (await readFile(new URL('../app.mjs', import.meta.url), 'utf8')).replace(/^import .*;\r?\n/gm, '');
  const imports = `const { ${Object.keys(core).join(', ')} } = core; const e = escapeHtml; const { readLiveIssues } = live;\n`;
  const context = vm.createContext({ core, live, taskIntakeMarker, console, Intl, Date, URL, URLSearchParams, AbortController, Blob, location,
    setTimeout: () => 0, clearTimeout() {},
    localStorage: { getItem: () => saved && JSON.stringify(saved) },
    document: { querySelector: element, querySelectorAll: () => [], addEventListener: (name, callback) => { events[name] = callback; } },
    window: { addEventListener: (name, callback) => { windowEvents[name] = callback; }, scrollTo() {}, open: url => opened.push(url) },
    FormData: class { constructor(target) { this.values = target.values; } get(key) { return this.values[key] ?? null; } getAll(key) { const value = this.values[key]; return Array.isArray(value) ? value : value ? [value] : []; } },
    fetch: async url => { assert.ok(url in files, `Unexpected network request: ${url}`); return { ok: true, json: async () => files[url] }; }
  });
  await vm.runInContext(imports + source, context);
  const route = id => { location.hash = `#${id}`; windowEvents.hashchange(); return element('#main').innerHTML; };
  const click = action => events.click({ target: { closest: () => ({ dataset: { action }, classList: { contains: () => false } }) } });
  const submit = (id, values) => events.submit({ target: { id, values }, preventDefault() {} });
  const selectFilter = (key, value) => events.click({ target: { closest: () => ({ dataset: { taskFilter: key, filterValue: value } }) } });
  return { element, route, click, submit, opened, selectFilter };
}

test('application renders the four MicroDuck phases, cross-repository board and Discussions from one snapshot', async () => {
  const app = await mount();
  assert.match(app.element('#main').innerHTML, /MicroDuck 四阶段/);
  const board = app.route('board');
  assert.match(board, /alice\/runtime#1/);
  assert.match(board, /alice\/rl#1/);
  assert.match(board, /data-task-filter="repository"/);
  assert.match(board, /class="task-filter-popover"/);
  for (const label of ['Repository', 'Labels', 'Author', 'Assignee']) assert.ok(board.includes(`>${label}<`));
  assert.doesNotMatch(board, /按负责人筛选|查找负责人|>仓库<|>领域<|>发布者</);
  assert.match(board, /class="task-card-heading"><h3>/);
  assert.doesNotMatch(board, /class="task-card-top"/);
  assert.doesNotMatch(board, /<select|class="task-repository"/);
  assert.equal((board.match(/class="kanban-column"/g) || []).length, 4);
  for (const name of ['Backlog', 'Ready', 'In progress', 'Done']) assert.ok(board.includes(name));
  assert.doesNotMatch(board, /In review|Waiting|待验收/);
  const activity = app.route('activity');
  assert.match(activity, /训练方向讨论/);
  assert.doesNotMatch(activity, /不再展示的历史讨论|历史 Issue/);
  assert.match(app.route('roadmap'), /阶段成果：/);
  app.click('new-task');
  assert.match(app.element('#modal').innerHTML, /alice\/runtime/);
  assert.match(app.element('#modal').innerHTML, /name="title"[^>]*required/);
  assert.match(app.element('#modal').innerHTML, /class="modal-chrome">[\s\S]*close-modal[\s\S]*<\/button><\/div><div class="modal-content">/);
  assert.equal(app.element('#modal').className, 'publish-dialog');
  assert.doesNotMatch(app.element('#modal').innerHTML, /提交后自动加入/);
  assert.equal((app.element('#modal').innerHTML.match(/name="labels"/g) || []).length, 5);
  app.submit('task-form', { title: '  导出策略 & 验证 IMU  ', repository: 'alice/rl', phase: 'train', status: 'Ready', labels: ['simulation', 'phase:improve', 'task'] });
  const task = new URL(app.opened[0]);
  assert.equal(app.element('#modal').open, false);
  assert.equal(task.pathname, '/alice/rl/issues/new');
  assert.equal(task.searchParams.get('projects'), 'alice/1');
  assert.match(task.searchParams.get('body'), /验收标准/);
  assert.equal(task.searchParams.get('labels'), 'simulation');
  assert.equal(task.searchParams.get('title'), '导出策略 & 验证 IMU');
  assert.doesNotMatch(task.searchParams.get('body'), /<!-- phase:/);
  assert.deepEqual(parseTaskIntake(task.searchParams.get('body')), { phase: 'train', status: 'Ready' });
  const visibleBody = task.searchParams.get('body').replace(/<!--.*?-->/gs, '');
  assert.doesNotMatch(visibleBody, /Initial Project settings|Project:|Phase:|Status:/);
  assert.match(app.element('#modal').innerHTML, /name="phase"/);
  assert.match(app.element('#modal').innerHTML, /name="status"/);
  assert.doesNotMatch(app.element('#modal').innerHTML, /area:|value="task"/);
  app.click('help');
  assert.equal(app.element('#modal').className, 'publish-dialog');
  assert.equal(app.element('#modal').open, true);
  const discussionModal = app.element('#modal').innerHTML;
  const categoryOptions = discussionModal.match(/<select name="category">([\s\S]*?)<\/select>/)[1];
  assert.equal((categoryOptions.match(/<option /g) || []).length, 3);
  assert.match(categoryOptions, /value="general" selected/);
  assert.match(categoryOptions, /Q&amp;A/);
  assert.match(categoryOptions, /Ideas/);
  assert.doesNotMatch(categoryOptions, /announcements|polls|show-and-tell|在 GitHub 选择/);
  app.submit('record-form', { kind: 'help', title: '测试讨论', body: '讨论背景', category: 'q-a' });
  const discussion = new URL(app.opened[1]);
  assert.equal(app.element('#modal').open, false);
  assert.equal(discussion.pathname, '/alice/hub/discussions/new');
  assert.equal(discussion.searchParams.get('category'), 'q-a');
});

test('filter menus add query qualifiers and removing a chip restores matching tasks', async () => {
  const app = await mount();
  app.route('board');
  app.selectFilter('repository', 'alice/rl');
  assert.match(app.element('#main').innerHTML, /repo:alice\/rl/);
  assert.match(app.element('#main').innerHTML, /1 \/ 2 tasks/);
  assert.match(app.element('#main').innerHTML, /class="task-filter-chip"/);
  app.selectFilter('repository', 'all');
  assert.match(app.element('#main').innerHTML, /2 \/ 2 tasks/);
  app.click('new-task');
  app.submit('task-form', { title: '测试任务', repository: 'alice/rl', phase: 'unknown', status: 'Ready' });
  assert.equal(app.opened.length, 0);
  assert.match(app.element('#task-form-error').textContent, /请选择有效/);
  assert.equal(app.element('#modal').open, true);
  app.submit('task-form', { title: '  ', repository: 'alice/rl', phase: 'train', status: 'Ready' });
  assert.equal(app.opened.length, 0);
  assert.match(app.element('#task-form-error').textContent, /请填写任务标题/);
});

test('legacy local preferences retain the newly configured repository sources and discussion mode', async () => {
  const app = await mount({ owner: 'alice', repo: 'hub', siteName: '我的学习站' });
  assert.match(app.element('#app').innerHTML, /我的学习站/);
  assert.match(app.route('board'), /alice\/rl#1/);
  app.click('help');
  assert.match(app.element('#modal').innerHTML, /GitHub Discussions/);
});
