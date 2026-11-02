const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function setup() {
  const context = vm.createContext({
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
  });
  vm.runInContext('window=globalThis; MD={views:{}};', context);
  for (const file of ['js/util.js', 'js/data.js', 'js/views/vendors.js', 'js/views/datamgmt.js']) {
    let source = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
    if (file.endsWith('datamgmt.js')) {
      const end = source.lastIndexOf('})();');
      assert.ok(end >= 0);
      source = source.slice(0, end) + 'MD.phase0={checkBackup,previewStats,statsHtml};\n' + source.slice(end);
    }
    vm.runInContext(source, context, { filename: file });
  }
  return context;
}

const plain = (value) => JSON.parse(JSON.stringify(value));
const contract = (id, end, noticeDays = 30) => ({ id, status: '유효', end, noticeDays });

test('phase0 distinguishes overdue, today, upcoming and expired contract notices', () => {
  const { MD: m } = setup();
  const result = m.vendorContracts({ contracts: [
    contract('late', '2026-11-20'),
    contract('today', '2026-12-01'),
    contract('soon', '2026-12-10'),
    contract('far', '2027-01-01'),
    contract('expired', '2026-10-31'),
    { ...contract('terminated', '2026-11-20'), status: '해지' },
  ] }, '2026-11-01');
  assert.deepEqual(plain(result.lateNotice.map(x => [x.c.id, x.by, x.state])), [['late', '2026-10-21', 'late']]);
  assert.deepEqual(plain(result.soonNotice.map(x => [x.c.id, x.by, x.state])), [
    ['today', '2026-11-01', 'today'], ['soon', '2026-11-10', 'soon'],
  ]);
  assert.deepEqual(plain(result.expired.map(x => x.id)), ['expired']);
  assert.equal(result.end, '2026-11-20');
});

test('phase0 validates contract notice day boundaries before restoring a backup', () => {
  const { MD: m } = setup();
  const errors = value => Array.from(m.phase0.checkBackup({ sales: [], vendors: [
    { name: '계약 검증', contracts: [contract('C', '2026-12-01', value)] },
  ] }));
  for (const value of [0, 1, 30, 3650]) assert.deepEqual(errors(value), [], String(value));
  for (const value of [-1, 0.5, 3651, 1e20, Infinity]) {
    assert.ok(errors(value).length > 0, 'must reject ' + value);
  }
});

test('phase0 contract summaries tolerate invalid legacy notice day values', () => {
  const { MD: m } = setup();
  const row = { contracts: [-1, 0, 0.5, 3651, 1e20, Infinity].map((n, i) => contract('bad' + i, '2026-12-01', n)) };
  let result;
  assert.doesNotThrow(() => { result = m.vendorContracts(row, '2026-11-01'); });
  assert.equal(result.notices.length, 0);
  row.contracts.push(contract('valid', '2026-12-01', 30));
  result = m.vendorContracts(row, '2026-11-01');
  assert.deepEqual(plain(result.soonNotice.map(x => x.c.id)), ['valid']);
});

// Execute the actual nested simulator closure. Only its numeric result is
// observed in the VM copy; the production formula and formatting run unchanged.
function simulator(context) {
  const source = fs.readFileSync(path.join(__dirname, '../js/views/promotions.js'), 'utf8');
  const start = source.indexOf('const sim = () => {');
  const end = source.indexOf("el.querySelectorAll('#sim input')", start);
  assert.ok(start >= 0 && end > start);
  const original = source.slice(start, end);
  const observed = original.replace(/(const expGain = [^\n]+;)/, '$1\nMD.phase0SimResult = {expGain, expSales, unitM};');
  assert.notEqual(observed, original, 'numeric observation must attach to the real simulator');
  const nodes = new Map();
  context.el = { querySelector(id) { if (!nodes.has(id)) nodes.set(id, {}); return nodes.get(id); } };
  context.U = context.MD.util;
  vm.runInContext(observed + '\nMD.runPhase0Sim=sim;', context);
  return (discount, margin = 30) => {
    for (const [id, value] of Object.entries({ '#sBase': 110000, '#sM': margin, '#sD': discount, '#sC': 0, '#sN': 1, '#sU': 0 })) {
      context.el.querySelector(id).value = String(value);
    }
    context.MD.phase0SimResult = null;
    context.MD.runPhase0Sim();
    return { result: context.MD.phase0SimResult, html: context.el.querySelector('#sOut').innerHTML };
  };
}

test('phase0 simulator preserves hand-calculated gain and rejects invalid discounts', () => {
  const run = simulator(setup());
  assert.ok(Math.abs(run(0).result.expGain) < 1e-8);
  const ten = run(10);
  assert.ok(Math.abs(ten.result.expGain - (-10000)) < 1e-8);
  assert.ok(Math.abs(ten.result.expSales - 99000) < 1e-8);
  assert.ok(Math.abs(run(0, 0).result.expGain) < 1e-8, 'zero margin must remain zero');
  for (const value of [-1, 100, Infinity]) {
    const rejected = run(value);
    assert.equal(rejected.result, null, String(value));
    assert.match(rejected.html, /0 이상 100% 미만/);
  }
});

test('phase0 partial-file warning aggregates matching keys and distinguishes merge from replace', () => {
  const { MD: m } = setup();
  const key = { date: '2026-11-01', channel: 'A', sku: 'S' };
  m.data = { isSample: false, channels: [{ name: 'A' }], products: [{ sku: 'S' }],
    sales: [{ ...key, sales: 131600 }], traffic: [{ ...key, visits: 100, ad: 1000 }],
    ads: [{ ...key, campaign: 'C', spend: 1000, revenue: 5000 }],
  };
  const rows = [{ ...key, sales: 30000 }, { ...key, sales: 35800 }];
  const st = m.phase0.previewStats('sales', rows, 'merge');
  assert.deepEqual(plain(st.shrink), { f: 'sales', label: '매출', n: 1, amt: 65800 });
  const html = m.phase0.statsHtml('sales', st, { rows, bad: 0 });
  assert.match(html, /65,800/);
  assert.match(html, /그날 주문의 일부만 담은 파일/);
  const replacement = m.phase0.previewStats('sales', rows, 'replace');
  assert.equal(replacement.shrink, null);
  assert.doesNotMatch(m.phase0.statsHtml('sales', replacement, { rows, bad: 0 }), /그날 주문의 일부만 담은 파일/);
  assert.equal(m.phase0.previewStats('sales', [{ ...key, sku: 'NEW', sales: 1 }], 'merge').shrink.n, 0);
  assert.equal(m.phase0.previewStats('sales', [{ ...key, sales: 131600 }], 'merge').shrink.n, 0);
  assert.equal(m.phase0.previewStats('traffic', [{ ...key, visits: 40 }], 'merge').shrink.amt, 60);
  assert.equal(m.phase0.previewStats('traffic', [{ ...key, visits: 100, ad: 1 }], 'merge').shrink.n, 0);
  assert.equal(m.phase0.previewStats('ads', [{ ...key, campaign: 'C', spend: 500 }], 'merge').shrink.amt, 500);
  assert.equal(m.phase0.previewStats('ads', [{ ...key, campaign: 'C', spend: 1000, revenue: 1 }], 'merge').shrink.n, 0);
});
