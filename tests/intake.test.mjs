import test from 'node:test';
import assert from 'node:assert/strict';
import { taskIntakeMarker, parseTaskIntake } from '../lib/task-intake.mjs';
import { initializeProjectTasks } from '../scripts/initialize-project-tasks.mjs';

const config = { owner: 'alice', repo: 'hub', repositories: ['alice/rl'], project: { owner: 'alice', number: 1 } };
const issue = (number, phase = 'train', status = 'Ready') => ({ number, node_id: `ISSUE_${number}`, title: '训练任务', state: 'open', labels: [], body: taskIntakeMarker(phase, status) });
function fixture(initialItems = [], issues = [issue(1)]) {
  const items = initialItems;
  const mutations = [];
  const fields = [
    { id: 'PHASE', name: 'Phase', options: [{ id: 'P1', name: '01 让鸭子动起来' }, { id: 'P2', name: '02 理解，再训练' }] },
    { id: 'STATUS', name: 'Status', options: [{ id: 'S1', name: 'Backlog' }, { id: 'S2', name: 'Ready' }, { id: 'S3', name: 'Done' }] }
  ];
  const github = {
    rest: { repos: { get: async () => ({ data: { private: false } }) }, issues: { listForRepo: async ({ repo }) => ({ data: repo === 'rl' ? issues : [] }) } },
    graphql: async (query, variables) => {
      if (query.startsWith('query')) return { user: { projectV2: { id: 'PROJECT', public: true, fields: { nodes: fields }, items: { nodes: items, pageInfo: { hasNextPage: false } } } } };
      mutations.push(variables);
      if (query.includes('addProjectV2ItemById')) {
        const number = Number(variables.issue.split('_')[1]);
        const item = { id: `ITEM_${number}`, content: { number, repository: { nameWithOwner: 'alice/rl', isPrivate: false } }, fieldValues: { nodes: [] } };
        items.push(item);
        return { addProjectV2ItemById: { item: { id: item.id } } };
      }
      const item = items.find(item => item.id === variables.item);
      const field = fields.find(field => field.id === variables.field);
      const value = field.options.find(option => option.id === variables.option);
      item.fieldValues.nodes = item.fieldValues.nodes.filter(value => value.field.name !== field.name);
      item.fieldValues.nodes.push({ field: { name: field.name }, name: value.name });
      return { updateProjectV2ItemFieldValue: { projectV2Item: { id: item.id } } };
    }
  };
  return { github, mutations, items };
}

test('intake accepts only one versioned request with known phase and status options', () => {
  const marker = taskIntakeMarker('train', 'In progress');
  assert.deepEqual(parseTaskIntake(`正文\n${marker}`), { phase: 'train', status: 'In progress' });
  assert.throws(() => taskIntakeMarker('invalid', 'Ready'));
  assert.throws(() => taskIntakeMarker('train', 'Waiting'));
  for (const body of ['', '<!-- phase:train -->', '<!-- duck-lab-task:{"phase":"train"} -->', marker + marker, '<!-- duck-lab-task:{"version":1,"phase":"train","status":"$(malicious)"} -->']) assert.equal(parseTaskIntake(body), null);
});

test('new cross-repository intake adds Issue, writes Status then Phase, and is idempotent', async () => {
  const { github, mutations } = fixture();
  const result = await initializeProjectTasks({ github, config });
  assert.deepEqual(result.initialized, [{ issue: 'alice/rl#1', phase: '02 理解，再训练', status: 'Ready' }]);
  assert.deepEqual(mutations.map(change => change.field || 'ADD'), ['ADD', 'STATUS', 'PHASE']);
  assert.equal((await initializeProjectTasks({ github, config })).initialized.length, 0);
  assert.equal(mutations.length, 3);
});

test('auto-added tasks can replace a default Status before Phase is initialized', async () => {
  const item = { id: 'EXISTING', content: { number: 1, repository: { nameWithOwner: 'alice/rl', isPrivate: false } }, fieldValues: { nodes: [{ field: { name: 'Status' }, name: 'Backlog' }] } };
  const { github, mutations } = fixture([item]);
  await initializeProjectTasks({ github, config });
  assert.deepEqual(mutations.map(change => change.field), ['STATUS', 'PHASE']);
});

test('manual Project changes, archived tasks and unmarked discussions are preserved', async () => {
  const item = (number, archived, phase) => ({ id: `ITEM_${number}`, isArchived: archived, content: { number, repository: { nameWithOwner: 'alice/rl', isPrivate: false } }, fieldValues: { nodes: phase ? [{ field: { name: 'Phase' }, name: phase }] : [] } });
  const { github, mutations } = fixture([item(1, false, '01 让鸭子动起来'), item(2, true)], [issue(1), issue(2), { ...issue(3), body: '没有初始化请求' }, { ...issue(4), title: '[讨论] 旧交流' }]);
  assert.deepEqual((await initializeProjectTasks({ github, config })).initialized, []);
  assert.deepEqual(mutations, []);
});

test('closed intake tasks use Done, and preview never performs mutations', async () => {
  const { github, mutations } = fixture([], [{ ...issue(1), state: 'closed' }]);
  assert.equal((await initializeProjectTasks({ github, config, dryRun: true })).initialized[0].status, 'Done');
  assert.equal(mutations.length, 0);
  await initializeProjectTasks({ github, config });
  assert.equal(mutations.find(change => change.field === 'STATUS').option, 'S3');
});

test('private repositories and missing Project options do not cause arbitrary writes', async () => {
  const { github, mutations } = fixture([], [issue(1, 'expand')]);
  assert.equal((await initializeProjectTasks({ github, config })).skipped.length, 1);
  assert.equal(mutations.length, 0);
  github.rest.repos.get = async () => ({ data: { private: true } });
  await assert.rejects(initializeProjectTasks({ github, config }), /public repositories/);
  assert.equal(mutations.length, 0);
});

test('a failure between field writes is safely retried', async () => {
  const { github, mutations } = fixture();
  const original = github.graphql;
  let failed = false;
  github.graphql = async (query, variables) => {
    if (variables.field === 'PHASE' && !failed) { failed = true; throw new Error('temporary error'); }
    return original(query, variables);
  };
  await assert.rejects(initializeProjectTasks({ github, config }), /temporary error/);
  const result = await initializeProjectTasks({ github, config });
  assert.equal(result.initialized.length, 1);
  assert.equal(mutations.filter(change => change.issue).length, 1);
});
