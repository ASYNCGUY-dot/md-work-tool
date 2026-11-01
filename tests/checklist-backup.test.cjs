const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function setup() {
  const c = vm.createContext({ localStorage: { getItem: () => null, setItem() {}, removeItem() {} } });
  vm.runInContext('window=globalThis; MD={views:{}};', c);
  for (const file of ['js/util.js', 'js/data.js', 'js/views/promotions.js', 'js/views/datamgmt.js', 'js/views/checklist.js']) {
    let source = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
    if (file.endsWith('datamgmt.js')) {
      const end = source.lastIndexOf('})();');
      assert.ok(end >= 0, 'the backup test hook belongs inside the in-memory closure');
      source = source.slice(0, end) + 'MD.testChecklistBackup={checkBackup,trialBackup};\n' + source.slice(end);
    }
    vm.runInContext(source, c, { filename: file });
  }
  c.MD.data = backup(false, checklist());
  c.MD.buildIndex();
  return c.MD;
}

function checklist(overrides = {}) {
  return {
    id: 'CL1', title: '독립 검증 체크리스트', kind: '기타', base: '2026-10-31', promoId: '', skus: [],
    items: [{ id: 'I1', text: '자료 확인', due: '2026-11-01', done: false, link: '' }],
    ...overrides,
  };
}

function backup(isSample, row) {
  return {
    isSample, channels: [], products: [], sales: [], traffic: [], promotions: [], vendors: [], pos: [],
    candidates: [], targets: [], ads: [], closes: {}, compete: [], events: [], reports: [], checklists: [row], ranks: [],
  };
}

// Only the element surface used while initially rendering the real view. No
// input handlers are invoked and no storage or checklist behavior is replaced.
function render(m) {
  const nodes = new Map();
  const el = {
    innerHTML: '',
    querySelector(selector) { if (!nodes.has(selector)) nodes.set(selector, {}); return nodes.get(selector); },
    querySelectorAll: () => [],
  };
  m.views.checklist(el);
  return el.innerHTML;
}

test('M R2-01 rejects HTML and impossible checklist base dates for real and sample backups', () => {
  const m = setup(), originalData = m.data;
  for (const isSample of [false, true]) {
    for (const base of ['<img src=x onerror=alert(1)>', '2026-02-31', '2026-02-29', '2024-02-30', '2026-13-01']) {
      const errors = m.testChecklistBackup.checkBackup(backup(isSample, checklist({ base })));
      assert.ok(errors.some(error => /checklists.*기준일 값 오류/.test(error)), 'must reject invalid base: ' + base);
      assert.equal(m.data, originalData, 'checking a rejected backup must not replace current data');
    }
  }
});

test('M R2-01 rejects nonstring promo IDs and nonlist or nonstring SKU values', () => {
  const m = setup();
  const cases = [
    [{ promoId: 1 }, /연결 행사 값 오류/],
    [{ promoId: {} }, /연결 행사 값 오류/],
    [{ promoId: [] }, /연결 행사 값 오류/],
    [{ skus: 'SKU1' }, /SKU 목록 값 오류/],
    [{ skus: {} }, /SKU 목록 값 오류/],
    [{ skus: ['SKU1', 2] }, /SKU 목록 값 오류/],
    [{ skus: [null] }, /SKU 목록 값 오류/],
  ];
  for (const isSample of [false, true]) {
    for (const [overrides, expected] of cases) {
      const errors = m.testChecklistBackup.checkBackup(backup(isSample, checklist(overrides)));
      assert.ok(errors.some(error => expected.test(error)), JSON.stringify(overrides));
    }
  }
});

test('M empty and genuine calendar base dates pass backup checks, trial calculation and checklist rendering', () => {
  const m = setup();
  for (const isSample of [false, true]) {
    for (const base of ['', '2024-02-29', '2026-10-31']) {
      const cand = backup(isSample, checklist({ base, promoId: 'P1', skus: ['SKU1', 'SKU2'] }));
      cand.promotions = [{ id: 'P1', name: '연결 행사', channel: 'A', start: '2026-10-31', end: '2026-11-01', categories: [] }];
      assert.deepEqual(Array.from(m.testChecklistBackup.checkBackup(cand)), []);
      assert.doesNotThrow(() => m.testChecklistBackup.trialBackup(cand));
      const html = render(m);
      assert.match(html, /독립 검증 체크리스트/);
      assert.match(html, /SKU1, SKU2/);
      assert.match(html, /연결 행사/);
      if (base) assert.ok(html.includes('기준일 ' + base));
      else assert.doesNotMatch(html, /· 기준일 /);
    }
  }
});

test('M checklist rendering escapes date text even for malformed legacy in-memory values', () => {
  const m = setup();
  // These values intentionally bypass backup validation to exercise the view's
  // independent escaping of data already present in memory or old storage.
  const base = '<img src=x onerror=base()>', due = '<svg onload=due()>', start = '<b>start</b>', end = '<i>end</i>';
  m.data = backup(false, checklist({ base, promoId: 'P1', items: [{ id: 'I1', text: '자료 확인', due, done: false, link: '' }] }));
  m.data.promotions = [{ id: 'P1', name: '연결 행사', channel: 'A', start, end }];
  m.buildIndex();
  const html = render(m);
  for (const [raw, escaped] of [
    [base, '&lt;img src=x onerror=base()&gt;'],
    [due, '&lt;svg onload=due()&gt;'],
    [start, '&lt;b&gt;start&lt;/b&gt;'],
    [end, '&lt;i&gt;end&lt;/i&gt;'],
  ]) {
    assert.equal(html.includes(raw), false, 'the raw date payload must never be emitted as HTML: ' + raw);
    assert.ok(html.includes(escaped), 'the date payload must remain visible as escaped text');
  }
});
