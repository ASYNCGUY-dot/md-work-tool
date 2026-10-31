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

test('collection save failure warns about backup and retains both saved data and unsaved edits', () => {
  for (const errorName of ['QuotaExceededError', 'SecurityError']) {
    const { md, saved, notices } = setup({ fail: ['mdwt:channels'], errorName });
    const original = saved.get('mdwt:channels');
    assert.equal(md.store.save(['channels']), false, errorName);
    backupWarning(notices);
    assert.equal(saved.get('mdwt:channels'), original);
    assert.equal(md.data.channels[0].name, '수정 채널', 'unsaved edits remain available for backup');
    md.store.load();
    assert.equal(md.data.channels[0].name, '기존 채널', 'reload recovers the last successful value');
  }
});

test('metadata save failure warns and preserves saved sales plus unsaved in-memory edits', () => {
  // With storage full, changing isSample:true to false needs one more character.
  // Replacing the old sales row with an equally sized real row still fits.
  const { md, saved, notices } = setup({ quotaAtInitialSize: true, isSample: true });
  const originalMeta = saved.get('mdwt:meta');
  const originalSales = saved.get('mdwt:sales');
  assert.equal(md.store.save(['sales']), false, 'failed mode metadata must not be reported as a successful save');
  backupWarning(notices);
  assert.equal(saved.get('mdwt:meta'), originalMeta);
  assert.equal(saved.get('mdwt:sales'), originalSales, 'metadata failure must stop collection writes');
  assert.equal(md.data.sales[0].sales, 200, 'the unsaved edit must remain available for backup');
});
