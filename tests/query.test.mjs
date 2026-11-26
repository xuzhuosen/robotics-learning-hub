import test from 'node:test';
import assert from 'node:assert/strict';
import { parseTaskQuery, setTaskQueryFilter, filterTasks } from '../lib/core.mjs';

test('GitHub-style queries combine free text, quoted status, repository, domain and people', () => {
  const query = '策略 label:rl status:"In progress" repo:alice/rl phase:train author:@Alice assignee:bob';
  const tasks = [{ id: 'alice/rl#1', title: '导出策略', repository: 'alice/rl', status: 'doing', phase: 'train', issue: { state: 'open', labels: ['rl'], user: { login: 'alice' }, assignees: [{ login: 'bob' }] } }, { id: 'alice/rl#2', title: '策略', status: 'done', phase: 'train' }];
  assert.equal(parseTaskQuery(query).query, '策略');
  assert.deepEqual(filterTasks(tasks, { query }).map(task => task.id), ['alice/rl#1']);
  assert.equal(filterTasks(tasks, { query: 'is:open' }).length, 2);
  assert.equal(filterTasks(tasks, { query: 'is:closed' }).length, 0);
  assert.equal(filterTasks(tasks, { query: 'label:hardware' }).length, 0);
});

test('menu selection replaces only its qualifier and keeps other query text', () => {
  const query = '导出 repo:alice/rl label:rl status:Ready';
  const next = setTaskQueryFilter(query, 'status', 'In progress');
  assert.equal(parseTaskQuery(next).qualifiers.status, 'In progress');
  assert.equal(parseTaskQuery(next).qualifiers.label, 'rl');
  assert.equal(parseTaskQuery(next).query, '导出');
  assert.equal(setTaskQueryFilter(next, 'status', 'all'), '导出 repo:alice/rl label:rl');
  assert.equal(parseTaskQuery(setTaskQueryFilter('repo:a repo:b', 'repository', 'alice/rl')).qualifiers.repository, 'alice/rl');
  assert.equal(parseTaskQuery('status:"In progress"').query, '');
});
