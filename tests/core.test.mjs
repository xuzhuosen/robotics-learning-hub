import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { normalizeConfig, repoUrl, issueUrl, recordBody, classifyIssue, issueStatus, mergeTasks, filterTasks, safeUrl, escapeHtml, shortDate, STATUSES } from '../lib/core.mjs';

test('repository configuration rejects path injection and incomplete repository identities', () => {
  for (const value of [{ owner: 'alice', repo: '' }, { owner: '', repo: 'lab' }, { owner: '../alice', repo: 'lab' }, { owner: 'alice', repo: '../../lab' }, { owner: 'alice', repo: '..' }]) {
    assert.throws(() => normalizeConfig(value));
  }
  assert.equal(repoUrl(normalizeConfig({ owner: ' alice ', repo: 'duck-lab' })), 'https://github.com/alice/duck-lab');
  assert.equal(repoUrl(normalizeConfig()), '');
});
test('workspace keeps personal defaults and supports a configurable member list', () => {
  const config = normalizeConfig({ members: [
    { name: 'A', github: 'alice', focus: '硬件' },
    { name: 'B', github: 'bob', focus: '仿真' },
    { name: 'C', github: 'carol', focus: '记录' }
  ] });
  assert.equal(config.siteName, 'Duck Lab');
  assert.deepEqual(config.members.map(member => member.name), ['A', 'B', 'C']);
  assert.equal(normalizeConfig({ members: [] }).members.length, 2);
  assert.equal(normalizeConfig({ members: Array.from({ length: 10 }, (_, i) => ({ name: String(i) })) }).members.length, 8);
});
test('Chinese record text and special characters survive a prefilled GitHub issue link', () => {
  const config = normalizeConfig({ owner: 'alice', repo: 'duck-lab' });
  const body = '### 下一步\n检查 IMU & 舵机\n```\n$HOME + #1\n```';
  const url = new URL(issueUrl(config, 'help', '方向不对？+ & #', body));
  assert.equal(url.origin, 'https://github.com');
  assert.equal(url.pathname, '/alice/duck-lab/issues/new');
  assert.equal(url.searchParams.get('title'), '[求助] 方向不对？+ & #');
  assert.equal(url.searchParams.get('body'), body);
  assert.equal(issueUrl(normalizeConfig(), 'help', 'x', body), '');
  assert.equal(issueUrl(config, 'unknown', 'x', body), '');
});
test('task and experiment templates preserve context and require evidence', () => {
  assert.match(recordBody('progress', { task: 'T03', next: '检查 IMU 方向' }), /关联任务：T03/);
  assert.match(recordBody('task'), /发布者：由 GitHub 自动关联/);
  assert.match(recordBody('progress', { next: '检查 IMU 方向' }), /### 下一步\n检查 IMU 方向/);
  assert.match(recordBody('experiment'), /停止条件与恢复方式/);
  assert.match(recordBody('experiment'), /结果与适用范围/);
});
test('closed state wins over in-progress label and reopened issues resume their label state', () => {
  assert.equal(issueStatus({ state: 'closed', labels: [{ name: 'doing' }] }), 'done');
  assert.equal(issueStatus({ state: 'open', labels: [{ name: 'doing' }] }), 'doing');
  assert.equal(issueStatus({ state: 'open', labels: ['waiting'] }), 'waiting');
  assert.equal(classifyIssue({ title: '[实验] 测试', labels: [] }), 'experiment');
  assert.equal(classifyIssue({ title: '测试', labels: [{ name: 'idea' }] }), 'idea');
});
test('newest task issue controls a planned task without mutating source data; PRs do not count', () => {
  const planned = [{ id: 'T01', title: '硬件', status: 'ready', owner: 0 }];
  const issues = [
    { number: 1, title: '[任务] T01 核对', state: 'closed', updated_at: '2026-11-01T00:00:00Z', labels: [] },
    { number: 2, title: '[任务] T01 核对', state: 'open', updated_at: '2026-11-02T00:00:00Z', labels: ['doing'], matchedOwner: 1 },
    { number: 3, title: '[任务] T02 假 PR', state: 'open', labels: [], pull_request: {} },
    { number: 4, title: '[进展] 今天完成', state: 'open', labels: [] }
  ];
  const result = mergeTasks(planned, issues);
  assert.equal(result.length, 1);
  assert.equal(result[0].status, 'doing');
  assert.equal(result[0].owner, 1);
  assert.equal(result[0].issue.number, 2);
  assert.equal(planned[0].status, 'ready');
  assert.equal(planned[0].owner, 0);
});
test('unlinked GitHub task is visible and inherits its recognized assignee', () => {
  const result = mergeTasks([], [{ number: 42, title: '[任务] 记录新问题', state: 'open', labels: ['ready'], body: '说明', matchedOwner: 0 }]);
  assert.equal(result[0].id, '#42');
  assert.equal(result[0].title, '记录新问题');
  assert.equal(result[0].owner, 0);
  assert.equal(result[0].status, 'ready');
});

test('task filters combine issue-style fields and publisher identity', () => {
  const tasks = [
    { id: 'T01', title: '训练步态', status: 'doing', phase: 'train', tag: '训练', assigneeLogin: 'bob', issue: { number: 7, body: 'PPO baseline', user: { login: 'alice' }, assignees: [{ login: 'bob' }], labels: ['doing', 'gpu'] } },
    { id: 'T02', title: '检查舵机', status: 'ready', phase: 'start', tag: '硬件', assigneeLogin: '' }
  ];
  assert.deepEqual(filterTasks(tasks, { query: 'ppo', status: 'doing', phase: 'train', label: 'gpu', author: 'Alice', assignee: 'BOB' }).map(t => t.id), ['T01']);
  assert.deepEqual(filterTasks(tasks, { assignee: 'none' }).map(t => t.id), ['T02']);
  assert.deepEqual(filterTasks(tasks, { author: 'bob' }), []);
});
test('untrusted content is escaped and executable link protocols are rejected', () => {
  assert.equal(safeUrl('javascript:alert(1)'), '');
  assert.equal(safeUrl('data:text/html,test'), '');
  assert.equal(safeUrl('https://github.com/alice/lab/issues/1'), 'https://github.com/alice/lab/issues/1');
  assert.equal(escapeHtml('<img src=x onerror="alert(1)">&'), '&lt;img src=x onerror=&quot;alert(1)&quot;&gt;&amp;');
});
test('display dates consistently use Asia/Shanghai', () => {
  assert.equal(shortDate('2026-11-17T20:00:00Z'), '11/18');
  assert.equal(shortDate('bad-date'), '');
});
test('initial learning content has no fabricated completion and all references resolve', async () => {
  const data = JSON.parse(await readFile(new URL('../data/space.json', import.meta.url), 'utf8'));
  const phases = new Set(data.phases.map(p => p.id));
  const ids = new Set();
  for (const task of data.tasks) {
    assert.ok(!ids.has(task.id)); ids.add(task.id);
    assert.ok(phases.has(task.phase));
    assert.ok(STATUSES.some(s => s.id === task.status));
    assert.notEqual(task.status, 'done');
    assert.ok(task.acceptance && task.next);
  }
  for (const course of data.courses) { assert.ok(phases.has(course.phase)); assert.ok(safeUrl(course.url)); }
  assert.equal(data.tasks.length, 10);
});
test('information architecture centers the current project and removes duplicate top-level sections', async () => {
  const app = await readFile(new URL('../app.mjs', import.meta.url), 'utf8');
  assert.match(app, /const nav = \[\['home', '首页'\], \['board', '任务'\], \['activity', '记录与讨论'\], \['roadmap', '学习路径'\]\]/);
  assert.doesNotMatch(app, /const nav = .*探索日志/);
  assert.doesNotMatch(app, /我们的首页|同频/);
});
