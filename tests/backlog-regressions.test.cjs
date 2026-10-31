const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
function setup() {
  const saved = new Map();
  const c = vm.createContext({ localStorage: { getItem: k => saved.get(k) || null, setItem: (k, v) => saved.set(k, v), removeItem: k => saved.delete(k) } });
  vm.runInContext('window=globalThis;MD={views:{}};', c);
  for (const f of ['js/util.js', 'js/data.js', 'js/views/dashboard.js', 'js/views/settlement.js']) {
    let text = fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
    if (f.endsWith('settlement.js')) {
      const end = text.lastIndexOf('})();'); assert.ok(end >= 0);
      text = text.slice(0, end) + 'MD.testSettle={normalize,reconcile,set(v,sum){files=v;dupSum=sum;}};\n' + text.slice(end);
    }
    vm.runInContext(text, c, { filename: f });
  }
  return c.MD;
}
test('first real import keeps user-set masters and removes untouched examples', () => {
  const m = setup();
  m.data = { isSample: true, channels: [{ name: 'Mine', fee: 0.1, userSet: true }, { name: 'Sample', fee: 0.99 }], products: [{ sku: 'S', cost: 200, userSet: true }, { sku: 'EX', cost: 999 }] };
  m.store.ensureReal();
  assert.equal(m.data.isSample, false);
  assert.equal(m.data.channels.length, 1); assert.equal(m.data.channels[0].fee, 0.1);
  assert.equal(m.data.products.length, 1); assert.equal(m.data.products[0].cost, 200);
});
test('duplicate settlement orders need confirmation before summing; bad amounts stay errors', () => {
  const m = setup(), d = m.testSettle;
  const data = { hub: [{ order: 'O1', amount: 30000 }, { order: 'O1', amount: 20000 }], platform: [{ order: 'O1', amount: 50000 }], account: null };
  d.set(data, false);
  assert.match(d.reconcile()[0].status, /중복/); assert.equal(d.reconcile()[0].ok, false);
  d.set(data, true);
  assert.equal(d.reconcile()[0].status, '일치'); assert.equal(d.reconcile()[0].hub, 50000);
  const bad = d.normalize([{ order_no: 'O2', amount: '원' }]);
  assert.equal(bad[0].amount, null);
  d.set({ hub: bad, platform: [{ order: 'O2', amount: 0 }], account: null }, true);
  assert.match(d.reconcile()[0].status, /금액 오류/);
});
test('deleted masters retain historical sales in channel and product totals', () => {
  const m = setup();
  m.data = { isSample: false, channels: [], products: [], traffic: [], sales: [{ date: '2026-10-01', channel: 'A', sku: 'S', qty: 1, orders: 1, sales: 1500 }] };
  m.buildIndex(); m.state = { start: '2026-10-01', end: '2026-10-01' };
  const current = m.calc.period(m.state.start, m.state.end);
  const previous = { sales: [], traffic: [], sum: m.calc.summarize([], []) };
  const channels = m.channelRows(current, previous), products = m.productRows(current, previous);
  assert.equal(channels.reduce((n, r) => n + r.sales, 0), current.sum.sales);
  assert.equal(products.reduce((n, r) => n + r.sales, 0), current.sum.sales);
  assert.match(channels[0].channel, /미등록/); assert.match(products[0].name, /미등록/);
});
