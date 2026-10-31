// Diagnostic reproduction only. Private helpers are exposed in VM memory.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const saved = new Map();
const c = vm.createContext({ console, localStorage: { getItem: k => saved.get(k) || null, setItem: (k, v) => saved.set(k, v), removeItem: k => saved.delete(k) } });
vm.runInContext('window=globalThis; MD={views:{}};', c);
function load(file, expose = '') {
  let text = fs.readFileSync(path.join(root, file), 'utf8');
  if (expose) { const end = text.lastIndexOf('})();'); if (end < 0) throw new Error('Source hook changed'); text = text.slice(0, end) + expose + '\n' + text.slice(end); }
  vm.runInContext(text, c, { filename: file });
}
load('js/util.js'); load('js/data.js'); load('js/views/dashboard.js');
load('js/views/datamgmt.js', 'MD.importDiagnostic={mapRows,applyImport,SPECS};');
load('js/views/settlement.js', 'MD.settleDiagnostic={normalize,reconcile,setFiles(v){files=v;}};');
const m = c.MD;
function empty(sample = false) {
  m.data = { isSample: sample, channels: [{ name: 'A', fee: 0.1, target: 0 }], products: [{ sku: 'S', cost: 200 }], sales: [], traffic: [], promotions: [], vendors: [], pos: [], candidates: [] };
  m.buildIndex();
}
function out(issue, observed) { console.log(JSON.stringify({ issue, observed })); }
empty(true);
m.importDiagnostic.applyImport('sales', [{ date: '2026-10-01', channel: 'A', sku: 'S', qty: 1, orders: 1, sales: 1000 }], 'merge');
out('edited master reset on first real import', { fee: m.data.channelMap.A.fee, cost: m.data.productMap.S.cost });
empty();
m.importDiagnostic.applyImport('sales', [500000, 500000].map(sales => ({ date: '2026-10-01', channel: 'A', sku: 'S', qty: 1, orders: 1, sales })), 'merge');
out('duplicate key in one file', { count: m.data.sales.length, sales: m.calc.summarize(m.data.sales, []).sales });
m.settleDiagnostic.setFiles({ hub: [{ order: 'O1', amount: 30000 }, { order: 'O1', amount: 20000 }], platform: [{ order: 'O1', amount: 50000 }], account: null });
out('same order multiple lines', m.settleDiagnostic.reconcile());
out('unpadded date', m.importDiagnostic.mapRows(m.importDiagnostic.SPECS.sales, [{ date: '2026-1-5', channel: 'A', sku: 'S', sales: 1000 }]));
empty(); m.data.channels = []; m.data.sales = [{ date: '2026-10-01', channel: 'A', sku: 'S', qty: 1, orders: 1, sales: 1000 }]; m.buildIndex();
m.state = { start: '2026-10-01', end: '2026-10-01' };
const current = m.calc.period('2026-10-01', '2026-10-01');
const previous = { sales: [], traffic: [], sum: m.calc.summarize([], []) };
out('deleted channel totals disagree', { total: current.sum.sales, rows: m.channelRows(current, previous) });
