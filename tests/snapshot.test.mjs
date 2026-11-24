import test from 'node:test';
import assert from 'node:assert/strict';
import { buildIssueSnapshot } from '../scripts/snapshot.mjs';
const context = { repo: { owner: 'Alice', repo: 'duck-lab' } };
const config = { owner: 'alice', repo: 'duck-lab' };
const issue = number => ({ number, title: `[进展] ${number}`, body: '中文记录', state: 'open', html_url: `https://github.com/Alice/duck-lab/issues/${number}`, updated_at: '2026-11-18T00:00:00Z', comments: 2, labels: [{ name: 'progress' }], assignees: [{ login: 'Bob', other: 'excluded' }], user: { login: 'Alice', email: 'not-published@example.test' }, internal: 'excluded' });

test('snapshot paginates public records, omits PRs, and publishes only required fields', async () => {
  const pages = [];
  const github = { rest: {
    repos: { get: async () => ({ data: { private: false } }) },
    issues: { listLabelsForRepo: async () => ({ data: [{ name: 'hardware' }, { name: 'task' }] }), listForRepo: async input => {
      pages.push(input.page);
      return { data: input.page === 1 ? [issue(1), ...Array.from({ length: 99 }, (_, i) => ({ ...issue(100 + i), pull_request: {} }))] : [issue(2)] };
    } }
  } };
  const result = await buildIssueSnapshot({ github, context, config, now: () => '2026-11-18T01:00:00Z' });
  assert.deepEqual(pages, [1, 2]);
  assert.equal(result.repository, 'Alice/duck-lab');
  assert.equal(result.issues.length, 2);
  assert.equal(result.updatedAt, '2026-11-18T01:00:00Z');
  assert.deepEqual(result.issues[0].user, { login: 'Alice' });
  assert.deepEqual(result.issues[0].labels, ['progress']);
  assert.deepEqual(result.labels, ['hardware', 'task']);
  assert.equal(result.issues[0].internal, undefined);
  assert.equal(result.limited, false);
});

test('snapshot refuses to publish private repository contents', async () => {
  let reads = 0;
  const github = { rest: { repos: { get: async () => ({ data: { private: true } }) }, issues: { listLabelsForRepo: async () => ({ data: [] }), listForRepo: async () => { reads++; return { data: [issue(1)] }; } } } };
  await assert.rejects(buildIssueSnapshot({ github, context, config }), /public repository/);
  assert.equal(reads, 0);
});

test('blank configuration or another repository does not use workflow authorization', async () => {
  const github = {};
  for (const candidate of [{ owner: '', repo: '' }, { owner: 'Other', repo: 'duck-lab' }]) {
    const result = await buildIssueSnapshot({ github, context, config: candidate });
    assert.equal(result.repository, ''); assert.equal(result.updatedAt, null); assert.deepEqual(result.issues, []);
  }
});

test('snapshot caps pagination and explicitly marks a truncated result', async () => {
  let reads = 0;
  const github = { rest: { repos: { get: async () => ({ data: { private: false } }) }, issues: { listLabelsForRepo: async () => ({ data: [] }), listForRepo: async () => { reads++; return { data: Array.from({ length: 100 }, (_, i) => issue(i + reads * 100)) }; } } } };
  const result = await buildIssueSnapshot({ github, context, config });
  assert.equal(reads, 3); assert.equal(result.issues.length, 300); assert.equal(result.limited, true);
});
