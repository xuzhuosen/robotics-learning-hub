import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRecord } from '../scripts/records.mjs';

test('Markdown records expose only stable article metadata', () => {
  const record = parseRecord(`---
title: 第一次跑通仿真
date: 2026-11-24
phase: train
tags: [MuJoCo, PPO]
author: alice
excerpt: 保留环境与关键步骤。
---

# 第一次跑通仿真

正文内容。`, 'records/2026-11-24-sim.md');
  assert.deepEqual(record, {
    title: '第一次跑通仿真', date: '2026-11-24', phase: 'train', tags: ['MuJoCo', 'PPO'],
    author: 'alice', excerpt: '保留环境与关键步骤。', path: 'records/2026-11-24-sim.md'
  });
});

test('Markdown records require a title and an unambiguous date', () => {
  assert.throws(() => parseRecord('plain text', 'records/bad.md'), /front matter/);
  assert.throws(() => parseRecord('---\ntitle: test\ndate: today\n---\nbody', 'records/bad.md'), /YYYY-MM-DD/);
});
