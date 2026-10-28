import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, writeFile, readFile, rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {Store} from '../src/store.mjs';
import {fiveHourUsage} from '../src/usage.mjs';

test('five-hour quota uses remaining percentage and ignores weekly windows', () => {
  const result = fiveHourUsage({rateLimits: {primary: {windowDurationMins: 300, usedPercent: 5}}, rateLimitsByLimitId: {codex: {primary: {windowDurationMins: 300, usedPercent: 26}, secondary: {windowDurationMins: 10080, usedPercent: 90}}}}, 10);
  assert.equal(result.windows.length, 1); assert.equal(result.windows[0].remainingPercent, 74); assert.equal(result.checkedAt, 10);
});
test('missing and non-finite quotas are unavailable, not 100 percent', () => {
  for (const usedPercent of [null, undefined, NaN, Infinity, '25']) assert.equal(fiveHourUsage({rateLimits: {primary: {windowDurationMins: 300, usedPercent}}}).status, 'unavailable');
  assert.equal(fiveHourUsage({rateLimits: {primary: {windowDurationMins: 10080, usedPercent: 20}}}).status, 'unavailable');
});
test('secondary 300 minute window and bounds', () => {
  assert.equal(fiveHourUsage({rateLimits: {secondary: {windowDurationMins: 300, usedPercent: 103}}}).windows[0].remainingPercent, 0);
  assert.equal(fiveHourUsage({rateLimits: {primary: {windowDurationMins: 300, usedPercent: -5}}}).windows[0].remainingPercent, 100);
});
test('notes survive edits, concurrent saves, reload and corruption recovery', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'board-store-'));
  try {
    const store = new Store(dir); const first = await store.save({text: 'first'});
    await Promise.all(Array.from({length: 20}, (_, i) => store.save({text: String(i)})));
    assert.equal((await store.read()).length, 21);
    const edited = await store.save({...first, text: 'edited', done: true});
    assert.equal(edited.createdAt, first.createdAt); assert.equal(edited.done, true);
    assert.equal((await new Store(dir).read()).length, 21);
    await writeFile(store.path, 'corrupt'); assert.equal((await store.read()).length, 21);
    await store.save({text: 'recovered'}); assert.equal((await store.read()).length, 22);
    await store.remove(first.id); assert.equal((await store.read()).length, 21);
  } finally { await rm(dir, {recursive: true, force: true}); }
});
test('rejects invalid or oversized note attachments and titles', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'board-validation-')); const store = new Store(dir);
  try {
    for (const value of [{text: ''}, {text: 'x'.repeat(4001)}, {text: 'x', title: 'x'.repeat(81)}, {text: 'x', images: ['javascript:alert(1)']}, {text: 'x', images: Array(7).fill('data:image/webp;base64,AA==')}]) assert.throws(() => store.save(value));
  } finally { await rm(dir, {recursive: true, force: true}); }
});
test('separate windows serialize writes to the same data directory', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'board-multi-'));
  try {
    const a = new Store(dir), b = new Store(dir);
    await Promise.all(Array.from({length: 12}, (_, i) => (i % 2 ? a : b).save({text: String(i)})));
    assert.equal((await a.read()).length, 12);
  } finally { await rm(dir, {recursive: true, force: true}); }
});
