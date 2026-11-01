const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function setup({ fail = [], errorName = 'QuotaExceededError', isSample = false, quotaAtInitialSize = false } = {}) {
  const meta = { isSample, savedAt: '2026-10-01T00:00:00.000Z' };
  const saved = new Map([
    ['mdwt:meta', JSON.stringify(meta)],
    ['mdwt:channels', JSON.stringify([{ name: '기존 채널', fee: 0.05 }])],
    ['mdwt:sales', JSON.stringify([{ date: '2026-10-01', channel: '기존 채널', sku: 'S', sales: 100, qty: 1, orders: 1 }])],
  ]);
  const initialSize = [...saved.values()].reduce((n, value) => n + value.length, 0);
  const notices = [];
  const c = vm.createContext({
    localStorage: {
      getItem: k => saved.get(k) || null,
      setItem(k, v) {
        const nextSize = [...saved.values()].reduce((n, value) => n + value.length, 0) - (saved.get(k) || '').length + v.length;
        if (fail.includes(k) || (quotaAtInitialSize && nextSize > initialSize)) { const e = new Error(errorName); e.name = errorName; throw e; }
        saved.set(k, v);
      },
      removeItem: k => saved.delete(k),
    },
    document: {
      createElement: () => ({ classList: { add() {}, remove() {} }, remove() {} }),
      body: { appendChild: el => notices.push(el) },
    },
    setTimeout() {},
  });
  vm.runInContext('window=globalThis; MD={views:{}};', c);
  for (const file of ['js/util.js', 'js/data.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), c, { filename: file });
  }
  c.MD.data = {
    isSample: false, channels: [{ name: '수정 채널', fee: 0.1 }], products: [],
    sales: [{ date: '2026-10-02', channel: '수정 채널', sku: 'S', sales: 200, qty: 1, orders: 1 }],
    traffic: [], promotions: [], vendors: [], pos: [], candidates: [], targets: [], ads: [], closes: {}, compete: [], events: [],
  };
  c.MD.buildIndex();
  return { md: c.MD, saved, notices };
}

function backupWarning(notices) {
  assert.ok(notices.some(n => /bad/.test(n.className) && /저장/.test(n.textContent) && /백업/.test(n.textContent)),
    'a failed save must insert an error notice with backup guidance');
}

test('storage write errors return false without erasing the previously stored value', () => {
  for (const errorName of ['QuotaExceededError', 'SecurityError']) {
    const { md, saved } = setup({ fail: ['mdwt:channels'], errorName });
    const original = saved.get('mdwt:channels');
    assert.equal(md.util.store.set('channels', md.data.channels), false, errorName);
    assert.equal(saved.get('mdwt:channels'), original, 'failed replacement must retain existing saved data');
  }
});

test('collection save failure warns about backup and retains both saved data and unsaved edits', async () => {
  for (const errorName of ['QuotaExceededError', 'SecurityError']) {
    const { md, saved, notices } = setup({ fail: ['mdwt:channels'], errorName });
    const original = saved.get('mdwt:channels');
    assert.equal(await md.store.save(['channels']), false, errorName);
    assert.equal(await md.store.saving, false);
    backupWarning(notices);
    assert.equal(saved.get('mdwt:channels'), original);
    assert.equal(md.data.channels[0].name, '수정 채널', 'unsaved edits remain available for backup');
    await md.store.load();
    assert.equal(md.data.channels[0].name, '기존 채널', 'reload recovers the last successful value');
  }
});

test('metadata save failure rolls collections back to their original strings and clears the pending marker', async () => {
  for (const errorName of ['QuotaExceededError', 'SecurityError']) {
    // No IndexedDB is provided: this targets the localStorage rollback path.
    // Only meta fails, so pending creation and collection writes can succeed.
    const { md, saved, notices } = setup({ fail: ['mdwt:meta'], errorName, isSample: true });
    // Whitespace makes reparsing/reserializing different from exact raw rollback.
    for (const [key, value] of saved) saved.set(key, JSON.stringify(JSON.parse(value), null, 2) + '\n');
    const original = new Map(saved);
    assert.equal(md.store.backend(), 'localStorage');
    assert.equal(await md.store.save(['channels', 'sales']), false, errorName);
    assert.equal(await md.store.saving, false);
    assert.equal(md.store.lastSave.failed, 'meta', 'this regression must reach the metadata failure stage');
    assert.equal(md.store.lastSave.ok, false);
    assert.deepEqual(Array.from(md.store.lastSave.notRestored), [], 'every written collection must be restored');
    backupWarning(notices);
    for (const [key, value] of original) assert.equal(saved.get(key), value, key + ' must retain the exact original string');
    assert.equal(saved.has('mdwt:pending'), false, 'complete rollback must remove this save\'s pending marker');
    assert.equal(md.store.interrupted, null, 'complete rollback must not report mixed saved data');
    assert.equal(md.data.sales[0].sales, 200, 'the unsaved sales edit must remain available for backup');
    assert.equal(md.data.channels[0].name, '수정 채널', 'the unsaved channel edit must remain available for backup');
  }
});

test('pending marker failure is distinct from metadata failure and leaves saved data untouched', async () => {
  const cases = [
    { fail: ['mdwt:pending'], errorName: 'QuotaExceededError' },
    { fail: ['mdwt:pending'], errorName: 'SecurityError' },
    // Preserve the original full-capacity fixture as its actual failure stage.
    { quotaAtInitialSize: true, isSample: true },
  ];
  for (const options of cases) {
    const { md, saved, notices } = setup(options);
    const original = new Map(saved);
    assert.equal(md.store.backend(), 'localStorage');
    assert.equal(await md.store.save(['channels', 'sales']), false);
    assert.equal(await md.store.saving, false);
    assert.equal(md.store.lastSave.failed, 'pending');
    assert.equal(md.store.lastSave.ok, false);
    assert.deepEqual(Array.from(md.store.lastSave.notRestored), []);
    backupWarning(notices);
    for (const [key, value] of original) assert.equal(saved.get(key), value, key + ' must stay unchanged before any collection write');
    assert.equal(saved.has('mdwt:pending'), false);
    assert.equal(md.store.interrupted, null);
    assert.equal(md.data.sales[0].sales, 200, 'pending failure must preserve the edit for backup');
    assert.equal(md.data.channels[0].name, '수정 채널');
  }
});
