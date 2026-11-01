const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function setup() {
  const saved = new Map(), writes = [], notices = [], downloads = [];
  const localStorage = {
    get length() { return saved.size; },
    key: index => [...saved.keys()][index] ?? null,
    getItem: key => saved.get(String(key)) ?? null,
    setItem(key, value) { saved.set(String(key), String(value)); writes.push([String(key), String(value)]); },
    removeItem: key => saved.delete(String(key)),
  };
  const c = vm.createContext({ localStorage, confirm: () => true });
  vm.runInContext('window=globalThis; MD={views:{}};', c);
  for (const file of ['js/util.js', 'js/data.js', 'js/views/vendors.js', 'js/views/datamgmt.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), c, { filename: file });
  }
  const m = c.MD;
  // Use the actual util.store, data persistence, validator, trial calculation
  // and bound #rs/#bk handlers. Only visible UI and download output are captured.
  m.util.toast = (message, kind) => notices.push({ message, kind });
  m.util.download = (name, content, type) => downloads.push({ name, content, type });
  m.store.startEmpty();
  assert.equal(m.store.backend(), 'localStorage', 'this VM exercises the real localStorage fallback; native IndexedDB is verified separately');
  m.settings = { roasMin: 3, coverDays: 30 };
  m.current = () => ({ cur: m.calc.period('2026-10-01', '2026-10-31') });
  const nodes = new Map();
  const node = selector => {
    if (!nodes.has(selector)) nodes.set(selector, { innerHTML: '', value: '', querySelector: node, querySelectorAll: () => [] });
    return nodes.get(selector);
  };
  const el = node('root');
  m.refresh = m.rerender = () => m.views.data(el);
  m.views.data(el);
  const restore = async data => {
    await node('#rs').onchange({ target: { files: [{ text: async () => JSON.stringify(data) }] } });
  };
  const exportBackup = () => {
    node('#bk').onclick();
    assert.equal(downloads.length, 1, 'the real export handler must produce one download');
    assert.equal(downloads[0].type, 'application/json');
    return JSON.parse(downloads[0].content);
  };
  return { m, localStorage, saved, writes, notices, restore, exportBackup };
}

function realBackup(keys) {
  const data = Object.fromEntries(keys.map(key => [key, key === 'closes' ? {} : []]));
  return {
    ...data, isSample: false,
    channels: [{ name: 'A', fee: 0.055, target: 3100 }],
    products: [{ sku: 'S', name: '검증 상품', price: 1100, cost: 100, stock: 3 }],
    sales: [{ date: '2026-10-01', channel: 'A', sku: 'S', sales: 1100, qty: 1, orders: 1, discount: 0 }],
  };
}

test('R4-01 real restore ignores internal/business extras while preserving the raw backend marker and restoring report settings', async () => {
  const h = setup(), keys = Array.from(h.m.store.KEYS);
  h.localStorage.setItem('mdwt:backend', 'idb'); // Internal marker is deliberately not JSON-encoded.
  const reportMeta = { team: '검증팀', author: '지수' };
  const data = realBackup(keys);
  data.extras = {
    ...Object.fromEntries(keys.map(key => [key, { injected: key }])),
    backend: 'idb', meta: { isSample: true, injected: true }, pending: { keys: ['sales'], injected: true }, reportMeta,
  };
  h.writes.length = 0;
  await h.restore(data);

  assert.ok(h.notices.some(notice => /복원·저장했습니다/.test(notice.message)), 'the actual restore must complete successfully');
  assert.ok(!h.notices.some(notice => notice.kind === 'bad'), JSON.stringify(h.notices));
  assert.equal(h.localStorage.getItem('mdwt:backend'), 'idb', 'extras must not turn the raw marker into JSON-quoted idb');
  assert.equal(h.writes.filter(([key]) => key === 'mdwt:backend').length, 0);
  const meta = JSON.parse(h.localStorage.getItem('mdwt:meta'));
  assert.equal(meta.isSample, false);
  assert.equal(meta.injected, undefined);
  assert.equal(h.localStorage.getItem('mdwt:pending'), null, 'the successful real save clears pending; extras must not recreate it');
  for (const key of keys) {
    assert.deepEqual(JSON.parse(h.localStorage.getItem('mdwt:' + key)), data[key], 'business key must come from the backup body, not extras: ' + key);
  }
  assert.deepEqual(JSON.parse(h.localStorage.getItem('mdwt:reportMeta')), reportMeta);
  const ignored = h.notices.find(notice => /무시했습니다/.test(notice.message));
  assert.ok(ignored, 'ignored reserved names must be reported');
  for (const key of ['backend', 'meta', 'pending', ...keys]) assert.ok(ignored.message.includes(key), 'ignored name must be reported: ' + key);
});

test('R4-01 real export omits internal/business keys from extras and retains ordinary settings', () => {
  // Both the genuine raw marker and a JSON-readable legacy/malformed marker
  // must be excluded explicitly, rather than relying on a JSON parse failure.
  for (const marker of ['idb', JSON.stringify('idb')]) {
    const h = setup(), keys = Array.from(h.m.store.KEYS);
    const reportMeta = { team: '검증팀', author: '지수' }, weights = { margin: 25 };
    h.localStorage.setItem('mdwt:backend', marker);
    h.localStorage.setItem('mdwt:meta', JSON.stringify({ isSample: false, gen: 27 }));
    h.localStorage.setItem('mdwt:pending', JSON.stringify({ at: '2026-10-31T00:00:00Z', keys: ['sales'] }));
    for (const key of keys) h.localStorage.setItem('mdwt:' + key, JSON.stringify({ injected: key }));
    h.localStorage.setItem('mdwt:reportMeta', JSON.stringify(reportMeta));
    h.localStorage.setItem('mdwt:weights', JSON.stringify(weights));
    h.localStorage.setItem('another-app:setting', JSON.stringify({ external: true }));
    const data = h.exportBackup();

    assert.deepEqual(data.extras, { reportMeta, weights });
    for (const key of ['backend', 'meta', 'pending', ...keys]) assert.equal(Object.hasOwn(data.extras, key), false, key);
    for (const key of keys) assert.deepEqual(data[key], JSON.parse(JSON.stringify(h.m.data[key])), 'business data remains in the main backup body: ' + key);
    assert.equal(h.localStorage.getItem('mdwt:backend'), marker, 'export must not modify the storage marker');
  }
});
