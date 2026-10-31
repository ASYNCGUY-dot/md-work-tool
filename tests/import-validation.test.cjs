const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
function setup() {
  const saved = new Map();
  const c = vm.createContext({ console, localStorage: { getItem: k => saved.get(k) || null, setItem: (k, v) => saved.set(k, v), removeItem: k => saved.delete(k) } });
  vm.runInContext('window=globalThis; MD={views:{}};', c);
  for (const file of ['js/util.js', 'js/data.js', 'js/views/datamgmt.js']) {
    let text = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
    if (file.endsWith('datamgmt.js')) { const end = text.lastIndexOf('})();'); assert.ok(end >= 0); text = text.slice(0, end) + 'MD.testImport={mapRows,applyImport,SPECS};\n' + text.slice(end); }
    vm.runInContext(text, c, { filename: file });
  }
  c.MD.data = { isSample: false, channels: [], products: [], sales: [], traffic: [], promotions: [], vendors: [], pos: [], candidates: [] };
  c.MD.buildIndex();
  return c.MD;
}
const row = overrides => ({ date: '2026-10-01', channel: 'A', sku: 'S', qty: 1, sales: '1,000원', ...overrides });
test('rejects impossible dates, malformed amounts and explicit nonpositive quantities', () => {
  const m = setup(), d = m.testImport;
  for (const bad of [{ date: '2026-02-31' }, { sales: 'oops' }, { sales: 'Infinity' }, { sales: '' }, { qty: 0 }, { qty: -1 }]) {
    const result = d.mapRows(d.SPECS.sales, [row(bad)]);
    assert.equal(result.rows.length, 0, JSON.stringify(bad)); assert.equal(result.bad, 1);
  }
  assert.equal(d.mapRows(d.SPECS.sales, [row({ date: '2024-02-29' })]).rows.length, 1);
});
test('preserves valid zero revenue and formats percentage fees correctly', () => {
  const m = setup(), d = m.testImport;
  assert.equal(d.mapRows(d.SPECS.sales, [row({ sales: '0' })]).rows[0].sales, 0);
  for (const [input, expected] of [['1%', 0.01], ['0.5%', 0.005], ['12', 0.12], ['0.12', 0.12]]) {
    assert.equal(d.mapRows(d.SPECS.channels, [{ name: 'A', fee: input }]).rows[0].fee, expected);
  }
});
test('aggregates duplicates in one upload and repeat import stays idempotent', () => {
  const m = setup(), d = m.testImport;
  for (const mode of ['replace', 'merge']) {
    const rows = d.mapRows(d.SPECS.sales, [row({ sales: 100 }), row({ sales: 200 })]).rows;
    d.applyImport('sales', rows, mode);
    assert.equal(m.data.sales.length, 1); assert.equal(m.data.sales[0].sales, 300); assert.equal(m.data.sales[0].qty, 2);
  }
});
