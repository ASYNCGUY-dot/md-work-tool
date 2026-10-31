const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
function context() {
  const c = vm.createContext({ window: {}, localStorage: { getItem: () => null, setItem() {}, removeItem() {} }, console });
  vm.runInContext('window = globalThis; MD = { views: {} };', c);
  for (const f of ['js/util.js', 'js/data.js', 'js/views/pricing.js', 'js/views/promotions.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', f), 'utf8'), c, { filename: f });
  c.MD.data = { channels: [{ name: 'A', fee: 0.055, target: 3100 }], products: [{ sku: 'S', cost: 100 }], sales: [], traffic: [] };
  c.MD.buildIndex(); return c.MD;
}
test('recommended price meets the target after rounding', () => {
  const m = context();
  // The handoff's 1,367,000 expectation includes 5,000 domestic shipping.
  assert.equal(m.priceFor(858600, 0.055, 0.25), 1359000);
  assert.equal(m.priceFor(858600, 0.055, 0.25, 0, 5000), 1367000);
  assert.ok(m.profitAt(1367000, 858600, 0.055, 0, 5000).margin >= 0.25);
  assert.equal(m.priceFor(100, 0.8, 0.25), null);
});
test('leap day comparison is clamped and previous period has equal days', () => {
  const m = context();
  assert.equal(JSON.stringify(m.calc.compareRange('2024-02-01', '2024-02-29', 'yoy')), '["2023-02-01","2023-02-28"]');
  assert.equal(JSON.stringify(m.calc.compareRange('2026-10-01', '2026-10-03', 'prev')), '["2026-09-28","2026-09-30"]');
});
test('VAT, fee, costs and advertising use the stated accounting assumptions', () => {
  const m = context();
  const z = m.calc.summarize([{ date: '2026-01-01', channel: 'A', sku: 'S', sales: 1100, qty: 2, orders: 1 }], [{ visits: 100, ad: 110 }]);
  assert.ok(Math.abs(z.net - 1000) < 1e-9);
  assert.ok(Math.abs(z.fee - 55) < 1e-9);
  assert.equal(z.cogs, 200);
  assert.ok(Math.abs(z.gross - 745) < 1e-9);
  assert.ok(Math.abs(z.contrib - 645) < 1e-9);
  assert.equal(z.salesPerAd, 10);
  assert.equal(z.roas, null);
  assert.equal(z.cvr, 0.01);
  assert.equal(m.calc.monthTarget('A', '2026-01-01', '2026-01-10'), 1000);
});
test('ROAS uses attributed advertising revenue and report spend while contribution uses traffic spend', () => {
  const m = context();
  const z = m.calc.summarize(
    [{ date: '2026-01-01', channel: 'A', sku: 'S', sales: 1100, qty: 2, orders: 1 }],
    [{ visits: 100, ad: 110 }],
    [{ spend: 110, revenue: 440 }, { spend: 220, revenue: 220 }]
  );
  // Report ROAS is (440 + 220) / (110 + 220) = 2, not an average of row ratios.
  assert.equal(z.adSpend, 330);
  assert.equal(z.adRev, 660);
  assert.equal(z.adRevSpend, 330);
  assert.equal(z.roas, 2);
  assert.equal(z.salesPerAd, 10);
  assert.ok(Math.abs(z.contrib - 645) < 1e-9);
});
test('ROAS excludes missing advertising revenue with its spend and includes confirmed zero revenue', () => {
  const m = context();
  const missing = [{ spend: 100 }, { spend: 200, revenue: null }, { spend: 300, revenue: 0, miss: ['revenue'] }];
  const z = m.calc.summarize([], [], [...missing, { spend: 110, revenue: 440 }, { spend: 110, revenue: 0 }]);
  // The three missing rows add 600 to reported spend but not to the ROAS denominator.
  assert.equal(z.adSpend, 820);
  assert.equal(z.adRev, 440);
  assert.equal(z.adRevSpend, 220);
  assert.equal(z.adRows, 5);
  assert.equal(z.adRevMiss, 3);
  assert.equal(z.roas, 2);
  assert.equal(m.calc.summarize([], [], missing).roas, null);
  assert.equal(m.calc.summarize([], [], [{ spend: 0, revenue: 440 }]).roas, null);
});
test('period filtering and channel grouping retain advertising attribution including ad-only channels', () => {
  const m = context();
  m.data.sales = [
    { date: '2026-01-01', channel: 'A', sku: 'S', sales: 1100, qty: 2, orders: 1 },
    { date: '2026-01-01', channel: 'B', sku: 'S', sales: 2200, qty: 1, orders: 1 }
  ];
  m.data.traffic = [
    { date: '2026-01-01', channel: 'A', visits: 100, ad: 110 },
    { date: '2026-01-01', channel: 'B', visits: 100, ad: 220 }
  ];
  m.data.ads = [
    { date: '2026-01-02', channel: 'A', spend: 1000, revenue: 1000 },
    { date: '2026-01-01', channel: 'B', spend: 100, revenue: 900 },
    { date: '2026-01-01', channel: 'A', spend: 50, revenue: 200 },
    { date: '2026-01-01', channel: 'C', spend: 40, revenue: 0 }
  ];
  m.buildIndex();
  const p = m.calc.period('2026-01-01', '2026-01-01');
  assert.equal(p.ads.length, 3);
  assert.equal(p.sum.roas, 1100 / 190);
  const channelA = (row) => row.channel === 'A';
  const a = m.calc.period('2026-01-01', '2026-01-01', { sale: channelA, traffic: channelA });
  assert.equal(a.ads.length, 1);
  assert.equal(a.sum.roas, 4);
  assert.equal(a.sum.salesPerAd, 10);
  const grouped = m.calc.by(p.sales, p.traffic, (row) => row.channel, (row) => row.channel, p.ads);
  assert.equal(grouped.get('A').roas, 4);
  assert.equal(grouped.get('B').roas, 9);
  assert.equal(grouped.get('C').roas, 0);
  assert.equal(grouped.get('C').salesPerAd, null);
});
test('CSV preserves BOM, quoted commas, quotes and embedded newlines', () => {
  const m = context();
  const rows = m.util.parseCSV('\ufeff이름,금액\r\n"가방, A","1,200"\r\n"줄\n바꿈","""인용"""');
  assert.equal(rows[0]['이름'], '가방, A'); assert.equal(rows[0]['금액'], '1,200');
  assert.equal(rows[1]['이름'], '줄\n바꿈'); assert.equal(rows[1]['금액'], '"인용"');
});
