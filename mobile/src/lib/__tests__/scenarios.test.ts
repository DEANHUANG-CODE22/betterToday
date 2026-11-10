/// <reference types="node" />
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dailyAdvice } from '../advice.ts';
import { buildScenarios } from '../scenarios.ts';

/**
 * 演练场景的验收。
 *
 * 每个场景的 `expect` 写的是**PRD 的应该**，不是代码的现状。
 * 如果这里红了：先查代码，再查场景数据——不要改 expect 去迁就实现
 * （这条和 return/confidence/robustness 三个文件同一条规矩）。
 */

const TODAY = '2026-11-05';

for (const scenario of buildScenarios(TODAY)) {
  test(`场景：${scenario.title}`, () => {
    const advice = dailyAdvice(scenario.dataset, TODAY);
    assert.equal(advice.kind, scenario.expect.kind, `${scenario.why}（实际：${advice.title}）`);
    assert.equal(advice.confidence, scenario.expect.confidence, scenario.why);
  });
}

test('每个场景都自证：id 唯一、都带期望值', () => {
  const list = buildScenarios(TODAY);
  assert.ok(list.length >= 8, '场景太少，覆盖不到主要分支');
  assert.equal(new Set(list.map((s) => s.id)).size, list.length, '场景 id 不能重复');
  for (const s of list) {
    assert.ok(s.expect.kind, `${s.id} 少了 kind`);
    assert.ok(s.expect.confidence, `${s.id} 少了 confidence`);
  }
});
