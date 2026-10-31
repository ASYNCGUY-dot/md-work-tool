const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function setup() {
  const c = vm.createContext({ localStorage: { getItem: () => null, setItem() {}, removeItem() {} } });
  vm.runInContext('window=globalThis; MD={views:{}};', c);
  for (const file of ['js/util.js', 'js/data.js', 'js/views/promotions.js', 'js/views/insight.js']) {
    let source = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
    if (file.endsWith('insight.js')) {
      const end = source.lastIndexOf('})();');
      assert.ok(end >= 0, 'the insight closure must be available to the VM-only test hook');
      source = source.slice(0, end) + 'MD.testInsight={factors};\n' + source.slice(end);
    }
    vm.runInContext(source, c, { filename: file });
  }
  c.MD.data = {
    isSample: false, channels: [{ name: 'A', fee: 0 }], products: [], sales: [], traffic: [],
    ads: [], promotions: [], vendors: [], pos: [], candidates: [], targets: [], closes: {}, compete: [], events: [],
  };
  return c.MD;
}

const sale = (date, sales = 100) => ({ date, channel: 'A', sku: 'S', sales, qty: 1, orders: 1 });
function factor(m, name, start, end, cs, ce) {
  m.buildIndex();
  const cur = m.calc.period(start, end), prev = m.calc.period(cs, ce);
  const result = m.testInsight.factors({ start, end }, cs, ce, cur, prev).find(f => f.name === name);
  assert.ok(result, name + ' must remain available as a factor');
  return result;
}

test('R13 unknown advertising revenue does not become a measured decline or strong impact', () => {
  const m = setup();
  m.data.sales = [sale('2026-10-01'), sale('2026-10-02')];
  m.data.ads = [
    { date: '2026-10-01', channel: 'A', spend: 10, revenue: 100 },
    { date: '2026-10-02', channel: 'A', spend: 10, revenue: null, miss: ['revenue'] },
  ];
  const result = factor(m, '광고 집행', '2026-10-02', '2026-10-02', '2026-10-01', '2026-10-01');
  assert.equal(result.est, null, 'an unobserved revenue value cannot support a monetary change estimate');
  assert.notEqual(result.level, 'high');
  assert.doesNotMatch(result.text, /광고 매출\s*[−-]100원/);
  assert.match(result.text, /누락|미입력|미확인|확인.{0,4}불가|비교.{0,4}보류|판단.{0,4}보류|계산.{0,4}불가/);
});

test('R13 explicitly reported zero advertising revenue still produces the measured 100-won decline', () => {
  const m = setup();
  m.data.sales = [sale('2026-10-01'), sale('2026-10-02')];
  m.data.ads = [
    { date: '2026-10-01', channel: 'A', spend: 10, revenue: 100 },
    { date: '2026-10-02', channel: 'A', spend: 10, revenue: 0 },
  ];
  const result = factor(m, '광고 집행', '2026-10-02', '2026-10-02', '2026-10-01', '2026-10-01');
  assert.equal(result.est, -100, 'confirmed zero must remain distinct from missing revenue');
  assert.match(result.text, /광고 매출\s*[−-]100원/);
});

test('R14 a partial promotion uses only selected-day sales with the original promotion baseline', () => {
  const m = setup();
  m.data.sales = [sale('2026-09-30'), sale('2026-10-01'), sale('2026-10-02', 10000)];
  m.data.promotions = [{ id: 'P', name: '2일 행사', channel: 'A', type: '기획전', start: '2026-10-01', end: '2026-10-02', discount: 0, budget: 0, categories: [] }];
  const result = factor(m, '행사·타임딜', '2026-10-01', '2026-10-01', '2026-09-30', '2026-09-30');
  // Original 14-day pre-promotion baseline = 100 / 14 won per day.
  // Selected-day increment = 100 - 100 / 14, not both days' 10,085.714 won.
  assert.ok(Math.abs(result.est - 92.85714285714286) < 1e-8, 'expected selected-day estimate 92.85714285714286, got ' + result.est);
});
