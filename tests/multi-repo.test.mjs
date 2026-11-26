import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeConfig, mergeTasks, filterTasks, issueUrl, discussionUrl, snapshotMatches, issueStatus, isTaskIssue } from '../lib/core.mjs';
import { readLiveIssues } from '../lib/live.mjs';
import { buildIssueSnapshot } from '../scripts/snapshot.mjs';

const config = normalizeConfig({ owner: 'alice', repo: 'hub', repositories: ['ALICE/hub', 'alice/runtime', 'alice/rl'] });
const issue = (repository, number = 1) => ({ repository, number, title: '[任务] 检查接口', labels: ['task'], body: '<!-- phase:create -->', state: 'open', updated_at: '2026-11-26T00:00:00Z' });
const githubFixture = () => ({ rest: {
  repos: { get: async () => ({ data: { private: false } }) },
  issues: { listLabelsForRepo: async ({ repo }) => ({ data: [{ name: repo }] }), listForRepo: async ({ repo }) => ({ data: [issue(`alice/${repo}`)] }) }
} });

test('repository identities are validated, deduplicated, and constrained when creating issues', () => {
  assert.equal(config.repositories.length, 3);
  for (const entry of ['alice/repo/extra', 'alice/..', '/repo', 'alice/repo?token=bad']) assert.throws(() => normalizeConfig({ repositories: [entry] }));
  assert.equal(new URL(issueUrl(config, 'task', '', '', { repository: 'alice/rl' })).pathname, '/alice/rl/issues/new');
  assert.equal(issueUrl(config, 'task', '', '', { repository: 'alice/unconfigured' }), '');
});

test('task creation preselects the configured Project independently of the target repository', () => {
  const withProject = normalizeConfig({ ...config, project: { owner: 'alice', number: 7 } });
  for (const repository of ['alice/hub', 'alice/runtime', 'alice/rl']) {
    const url = new URL(issueUrl(withProject, 'task', '', '', { repository }));
    assert.equal(url.searchParams.get('projects'), 'alice/7');
  }
  assert.equal(new URL(issueUrl(withProject, 'help')).searchParams.has('projects'), false);
  assert.equal(new URL(issueUrl(config, 'task')).searchParams.has('projects'), false);
});

test('plain issues keep distinct identities and ignore phase labels and body metadata', () => {
  const tasks = mergeTasks([], [issue('alice/runtime'), issue('alice/rl')]);
  assert.equal(new Set(tasks.map(task => task.id)).size, 2);
  assert.deepEqual(filterTasks(tasks, { repository: 'ALICE/RL' }).map(task => task.id), ['alice/rl#1']);
  assert.ok(tasks.every(task => task.phase === 'unassigned'));
  const plain = { ...issue('alice/runtime'), title: '加载训练策略', labels: ['phase:train'] };
  assert.equal(isTaskIssue(plain), true);
  assert.equal(mergeTasks([], [plain])[0].phase, 'unassigned');
});

test('Project fields override old labels and body metadata, while closed issues remain done', () => {
  const task = { ...issue('alice/runtime'), labels: ['doing', 'phase:start'], project: { phase: 'train', status: 'ready' } };
  assert.equal(mergeTasks([], [task])[0].phase, 'train');
  assert.equal(issueStatus(task), 'ready');
  assert.equal(issueStatus({ ...task, state: 'closed' }), 'done');
  assert.equal(mergeTasks([], [{ ...task, project: {} }])[0].phase, 'unassigned');
});

test('legacy discussion issues in a Project retain their discussion role', () => {
  const record = { ...issue('alice/hub'), title: '[记录] 一次实验', labels: [], project: { status: 'backlog' } };
  assert.equal(isTaskIssue(record), false);
  assert.equal(mergeTasks([], [record]).length, 0);
  assert.equal(isTaskIssue({ ...record, title: '部署训练策略' }), true);
  assert.equal(isTaskIssue({ ...record, labels: ['task'] }), true);
});

test('discussion drafts preserve Chinese content and category in Discussions URLs', () => {
  const url = new URL(discussionUrl(config, 'IMU & 舵机？', '### 背景\n#1 + #2', 'q-a'));
  assert.equal(url.pathname, '/alice/hub/discussions/new');
  assert.equal(url.searchParams.get('title'), 'IMU & 舵机？');
  assert.equal(url.searchParams.get('body'), '### 背景\n#1 + #2');
  assert.equal(url.searchParams.get('category'), 'q-a');
});

test('snapshot only reads configured repositories and preserves source-specific labels', async () => {
  const github = githubFixture();
  const visited = [];
  github.rest.repos.get = async input => { visited.push(input.repo); return { data: { private: false } }; };
  const snapshot = await buildIssueSnapshot({ github, config });
  assert.deepEqual(visited, ['hub', 'runtime', 'rl']);
  assert.equal(new Set(snapshot.issues.map(item => `${item.repository}#${item.number}`)).size, 3);
  assert.deepEqual(snapshot.repositories[2].labels, ['rl']);
  assert.equal(snapshotMatches(snapshot, config), true);
  assert.equal(snapshotMatches(snapshot, normalizeConfig({ ...config, repositories: ['alice/other'] })), false);
  assert.equal(snapshotMatches(snapshot, normalizeConfig({ ...config, discussions: { enabled: true } })), false);
});

test('a private secondary repository is rejected before its issues can be read', async () => {
  const github = githubFixture();
  github.rest.repos.get = async ({ repo }) => ({ data: { private: repo === 'runtime' } });
  let privateReads = 0;
  github.rest.issues.listForRepo = async ({ repo }) => { if (repo === 'runtime') privateReads++; return { data: [] }; };
  await assert.rejects(buildIssueSnapshot({ github, config }), /public repository/);
  assert.equal(privateReads, 0);
});

test('live refresh keeps cached Project fields without confusing same-number issues across repositories', async () => {
  const calls = [];
  const snapshot = { issues: [{ ...issue('alice/runtime'), project: { phase: 'train', status: 'doing' } }] };
  const fetcher = async (url, options) => {
    calls.push({ url, options });
    return { ok: true, json: async () => url.includes('/labels?') ? [{ name: 'hardware' }] : [issue('ignored')] };
  };
  const live = await readLiveIssues(config, { snapshot, fetcher });
  assert.equal(live.issues.find(item => item.repository === 'alice/runtime').project.phase, 'train');
  assert.equal(live.issues.find(item => item.repository === 'alice/rl').project, undefined);
  assert.ok(calls.every(call => call.options.credentials === 'omit' && !call.options.headers.Authorization));
  await assert.rejects(readLiveIssues(config, { fetcher: async () => ({ ok: false, status: 403 }) }), /限流/);
});

test('Project pagination resolves fields while omitting private, draft and archived items', async () => {
  const projectConfig = normalizeConfig({ ...config, project: { owner: 'alice', number: 2 } });
  const github = githubFixture();
  let calls = 0;
  github.graphql = async (_query, variables) => {
    calls++;
    const content = { number: 1, repository: { nameWithOwner: 'alice/runtime', isPrivate: false } };
    const fields = { nodes: [{ name: '02 理解，再训练', field: { name: 'Phase' } }, { name: 'Ready', field: { name: 'Status' } }] };
    return { user: { projectV2: { public: true, title: 'MicroDuck', url: 'https://github.com/users/alice/projects/2', items: {
      pageInfo: { hasNextPage: !variables.after, endCursor: 'next' },
      nodes: variables.after ? [{ content, fieldValues: fields }] : [{ content: null }, { isArchived: true, content }, { content: { ...content, repository: { nameWithOwner: 'alice/secret', isPrivate: true } } }]
    } } } };
  };
  const snapshot = await buildIssueSnapshot({ github, config: projectConfig });
  assert.equal(calls, 2);
  assert.deepEqual(snapshot.issues.find(item => item.repository === 'alice/runtime').project, { phase: 'train', status: 'ready', rawPhase: '02 理解，再训练', rawStatus: 'Ready' });
  assert.equal(snapshot.issues.find(item => item.repository === 'alice/rl').project, undefined);
});

test('Discussions API failures keep the old discussion timestamp instead of publishing a false empty list', async () => {
  const enabled = normalizeConfig({ ...config, discussions: { enabled: true } });
  const github = githubFixture();
  github.graphql = async () => { throw new Error('temporarily unavailable'); };
  await assert.rejects(buildIssueSnapshot({ github, config: enabled }), /Discussions/);
  const previous = { repository: 'alice/hub', discussionsUpdatedAt: '2026-11-25T00:00:00Z', discussions: [{ number: 8, title: '保留讨论' }] };
  const snapshot = await buildIssueSnapshot({ github, config: enabled, previous });
  assert.equal(snapshot.discussions[0].number, 8);
  assert.equal(snapshot.discussionsUpdatedAt, previous.discussionsUpdatedAt);
  assert.match(snapshot.warnings[0], /保留/);
});

test('Project status names from the GitHub team planning template match regardless of capitalization', async () => {
  const projectConfig = normalizeConfig({ owner: 'alice', repo: 'hub', project: { owner: 'alice', number: 2 } });
  const github = githubFixture();
  github.rest.issues.listForRepo = async () => ({ data: ['Backlog', 'Ready', 'In progress', 'Done'].map((status, index) => issue('alice/hub', index + 1)) });
  github.graphql = async () => ({ user: { projectV2: { public: true, title: 'Learning', url: 'https://github.com/users/alice/projects/2', items: { pageInfo: { hasNextPage: false }, nodes: ['Backlog', 'Ready', 'In progress', 'Done'].map((name, index) => ({ content: { number: index + 1, repository: { nameWithOwner: 'alice/hub', isPrivate: false } }, fieldValues: { nodes: [{ name, field: { name: 'Status' } }, { name: '01 让鸭子动起来', field: { name: 'Phase' } }] } })) } } } });
  const snapshot = await buildIssueSnapshot({ github, config: projectConfig });
  assert.deepEqual(snapshot.issues.map(issue => issue.project.status), ['backlog', 'ready', 'doing', 'done']);
  assert.deepEqual(snapshot.warnings, []);
});
