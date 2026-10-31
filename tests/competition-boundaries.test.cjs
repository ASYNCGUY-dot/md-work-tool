const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function competition(ourPrice, compete, sales = []) {
  const c = vm.createContext({ console, localStorage: {
    getItem: () => null, setItem() {}, removeItem() {},
  } });
  vm.runInContext('window = globalThis; MD = { views: {} };', c);
  for (const file of ['js/util.js', 'js/data.js', 'js/views/compete.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), c, { filename: file });
  }
  const m = c.MD;
  m.data = {
    channels: [{ name: 'A', fee: 0.055 }],
    products: [{ sku: 'S', name: '검증 상품', price: ourPrice, cost: 50 }],
    sales, traffic: [], compete,
  };
  m.buildIndex();
  m.state = { start: '2026-10-01', end: '2026-10-02', cmp: 'prev' };
  const signals = m.competeSignals('2026-10-01', '2026-10-02', '2026-09-29', '2026-09-30');

  // Keep the product's real signal and view calculations. Only the DOM/table/
  // chart surfaces are replaced so the rendered KPI can be checked in Node.
  const nodes = new Map();
  const el = { innerHTML: '', querySelector(selector) {
    if (!nodes.has(selector)) nodes.set(selector, { innerHTML: '' });
    return nodes.get(selector);
  } };
  m.cmpLabel = () => '직전 동일 기간';
  const gapCells = [];
  m.table = (_node, options) => {
    const gapColumn = options.cols.find((column) => column.key === 'gap');
    if (gapColumn) gapCells.push(...options.rows.map((row) => gapColumn.fmt(row.gap)));
  };
  m.cols = {};
  m.colorOf = () => '#000';
  m.legend = () => '';
  m.charts = { line: () => null };
  m.views.compete(el);
  return { signals, html: el.innerHTML, insights: nodes.get('#cpIns')?.innerHTML || '', gapCells };
}

function excessivePriceCount(result) {
  const value = result.html.match(/경쟁 최저가보다 10% 넘게 비싼 상품<\/div>\s*<div class="v"[^>]*>(\d+)개/);
  if (!value && result.signals.rv.length === 0) return 0;
  assert.ok(value, 'the real competition view must render the price-threshold KPI');
  return Number(value[1]);
}

test('R12 exactly 10% above the competitor price does not exceed the 10% threshold', () => {
  const result = competition(110, [{ date: '2026-10-01', sku: 'S', rival: 'R', price: 100 }]);
  assert.ok(Math.abs(result.signals.bySku[0].gap - 0.1) < 1e-12);
  assert.equal(excessivePriceCount(result), 0);
  assert.doesNotMatch(result.insights, /경쟁 최저가보다 .* 비쌈/);
  assert.equal(result.gapCells.length, 1, 'the real table formatter must render the price gap');
  assert.doesNotMatch(result.gapCells[0], /class="[^"]*\bbad\b[^"]*"/, 'exactly 10% must not receive excessive-price table styling');
});

test('R12 a price strictly above 10% still triggers the real competition-view threshold', () => {
  const result = competition(110.01, [{ date: '2026-10-01', sku: 'S', rival: 'R', price: 100 }]);
  assert.ok(Math.abs(result.signals.bySku[0].gap - 0.1001) < 1e-12);
  assert.equal(excessivePriceCount(result), 1);
  assert.match(result.insights, /경쟁 최저가보다 .* 비쌈/);
  assert.equal(result.gapCells.length, 1, 'the real table formatter must render the price gap');
  assert.match(result.gapCells[0], /class="[^"]*\bbad\b[^"]*"/, 'strictly above 10% must retain excessive-price table styling');
});

test('R12 zero competitor price cannot produce an infinite ratio or a false excessive-price signal', () => {
  const result = competition(120, [{ date: '2026-10-01', sku: 'S', rival: 'R', price: 0 }]);
  for (const row of result.signals.bySku) {
    assert.ok(row.gap == null || Number.isFinite(row.gap), 'zero competitor price must not yield Infinity/NaN');
  }
  assert.equal(excessivePriceCount(result), 0);
  assert.doesNotMatch(result.insights, /경쟁 최저가보다 .* 비쌈/);
});

test('R12 a normal comparison preserves the independently calculated 56.25% price gap', () => {
  const result = competition(999, [
    { date: '2026-10-01', sku: 'S', rival: 'R1', price: 100 },
    { date: '2026-10-02', sku: 'S', rival: 'R1', price: 80, ourPrice: 125 },
    { date: '2026-10-02', sku: 'S', rival: 'R2', price: 180 },
  ], [{ date: '2026-10-02', channel: 'A', sku: 'S', sales: 180, qty: 2, orders: 1 }]);
  const row = result.signals.bySku[0];
  assert.equal(row.ourPrice, 125, 'survey price takes precedence over the master price');
  assert.equal(row.minRival, 80);
  assert.equal(row.avgRival, 130);
  assert.equal(row.gap, 0.5625); // 125 / 80 - 1
  assert.equal(row.asp, 90); // 180 / 2
  assert.equal(excessivePriceCount(result), 1);
});
