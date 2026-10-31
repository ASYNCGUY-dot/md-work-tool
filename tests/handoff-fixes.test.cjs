const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
function context(globals = {}, initial = {}) {
  const saved = new Map(Object.entries(initial).map(([k, v]) => ['mdwt:' + k, JSON.stringify(v)]));
  const c = vm.createContext({ Date, ...globals, localStorage: {
    getItem: k => saved.get(k) || null,
    setItem: (k, v) => saved.set(k, v),
    removeItem: k => saved.delete(k),
  } });
  vm.runInContext('window=globalThis; MD={views:{}};', c);
  vm.runInContext(fs.readFileSync(path.join(root, 'js/util.js'), 'utf8'), c, { filename: 'js/util.js' });
  return c;
}

// SheetJS boundary fixture: typed dates carry a misleading two-digit display
// year, while amounts/percentages carry useful formatting. The product's real
// readTable must choose the date value without replacing other formatted cells.
function spreadsheetBoundary() {
  const sheet = { '!ref': 'A1:E3' };
  ['날짜', '매출', '수수료', '빈 칸', '입력메모'].forEach((v, c) => {
    sheet[String.fromCharCode(65 + c) + '1'] = { t: 's', v, w: v };
  });
  Object.assign(sheet, {
    A2: { t: 'd', v: new Date(2026, 9, 1), w: '10/1/26', z: 'm/d/yy' },
    A3: { t: 'd', v: new Date(2026, 9, 2), w: '10/2/26', z: 'm/d/yy' },
    B2: { t: 'n', v: 1230000, w: '1,230,000원', z: '#,##0"원"' },
    B3: { t: 'n', v: 300000, w: '300,000원', z: '#,##0"원"' },
    C2: { t: 'n', v: 0.055, w: '5.5%', z: '0.0%' },
    C3: { t: 'n', v: 0.01, w: '1.0%', z: '0.0%' },
    E2: { t: 's', v: '10/1/26', w: '10/1/26' },
  });
  const encode_cell = ({ r, c }) => String.fromCharCode(65 + c) + (r + 1);
  const decode_cell = address => ({ c: address.charCodeAt(0) - 65, r: Number(address.slice(1)) - 1 });
  const decode_range = range => {
    const [a, b = a] = range.split(':');
    return { s: decode_cell(a), e: decode_cell(b) };
  };
  const format_cell = cell => cell.w === undefined ? String(cell.v) : cell.w;
  const XLSX = {
    read: () => ({ SheetNames: ['판매', '무시할 시트'], Sheets: { '판매': sheet, '무시할 시트': { '!ref': 'A1:A1', A1: { t: 's', v: '수입 금지' } } } }),
    utils: { encode_cell, decode_cell, decode_range, format_cell,
      sheet_to_json(ws, opts = {}) {
        const range = decode_range(ws['!ref']);
        const value = (r, c) => {
          const cell = ws[encode_cell({ r, c })];
          return cell ? (opts.raw === false ? format_cell(cell) : cell.v) : (opts.defval ?? '');
        };
        const head = Array.from({ length: range.e.c + 1 }, (_, c) => value(range.s.r, c));
        const rows = [];
        for (let r = range.s.r + (opts.header === 1 ? 0 : 1); r <= range.e.r; r++) {
          const cells = head.map((_, c) => value(r, c));
          const row = opts.header === 1 ? cells : Object.fromEntries(head.map((h, c) => [h, cells[c]]));
          Object.defineProperty(row, '__rowNum__', { value: r });
          rows.push(row);
        }
        return rows;
      },
    },
  };
  class FileReader {
    readAsArrayBuffer() { this.result = new ArrayBuffer(0); this.onload(); }
    readAsText(file) { this.result = file.content; this.onload(); }
  }
  return { XLSX, FileReader };
}

test('R7 typed Excel dates become ISO dates without losing formatted values or empty columns', async () => {
  const c = context(spreadsheetBoundary());
  const rows = await c.MD.util.readTable({ name: '판매_날짜셀.xlsx' });
  assert.deepEqual(JSON.parse(JSON.stringify(rows)), [
    { '날짜': '2026-10-01', '매출': '1,230,000원', '수수료': '5.5%', '빈 칸': '', '입력메모': '10/1/26' },
    { '날짜': '2026-10-02', '매출': '300,000원', '수수료': '1.0%', '빈 칸': '', '입력메모': '' },
  ]);
  assert.equal(c.MD.util.normDate(rows[0]['입력메모']), null, 'ambiguous text dates must still be rejected');
});

// This is only the DOM surface used by the sourcing view. The real view creates
// its markup, normalizes storage and binds/executes its weight-input handlers.
function sourcing(weights) {
  const c = context({}, { weights });
  c.MD.data = { candidates: [{ name: '검증 후보', popularity: 1, lastYearQty: 10, outlook: 1, margin: 0.35 }] };
  c.MD.store = { save() {} };
  c.MD.util.toast = () => {};
  vm.runInContext(fs.readFileSync(path.join(root, 'js/views/sourcing.js'), 'utf8'), c, { filename: 'js/views/sourcing.js' });
  const nodes = new Map();
  const node = selector => {
    if (!nodes.has(selector)) nodes.set(selector, { innerHTML: '', textContent: '', addEventListener() {} });
    return nodes.get(selector);
  };
  const inputs = [];
  const el = {
    get innerHTML() { return this.html || ''; },
    set innerHTML(html) {
      this.html = html;
      inputs.length = 0;
      for (const match of html.matchAll(/<input\b[^>]*data-w="([^"]+)"[^>]*>/g)) {
        const value = match[0].match(/\bvalue="([^"]*)"/);
        inputs.push({ dataset: { w: match[1] }, value: value ? value[1] : '' });
      }
    },
    querySelector: node,
    querySelectorAll: selector => selector === '[data-w]' ? inputs : [],
  };
  c.MD.views.sourcing(el);
  return {
    md: c.MD,
    inputs,
    table: () => node('#cTbl').innerHTML,
    text: () => [el.innerHTML, ...Array.from(nodes.values(), n => n.innerHTML + ' ' + n.textContent)].join(' ').replace(/<[^>]*>/g, ' '),
  };
}

function boundedScore(view) {
  const matches = [...view.table().matchAll(/<td\b[^>]*>\s*<b>([^<]+)<\/b>/g)];
  assert.equal(matches.length, 1, 'the candidate must have one visible numeric score');
  const value = Number(matches[0][1]);
  assert.ok(Number.isFinite(value) && value >= 0 && value <= 100, 'visible score must be finite and within 0..100: ' + matches[0][1]);
  return value;
}

test('R10 corrupt stored weights cannot produce negative, nonfinite or inflated scores', () => {
  for (const popularity of [-30, 'Infinity', 'NaN']) {
    const view = sourcing({ popularity, lastYear: 0, outlook: 0, margin: 25 });
    boundedScore(view);
    for (const input of view.inputs) {
      assert.ok(Number.isFinite(Number(input.value)) && Number(input.value) >= 0, 'loaded weights must be usable finite nonnegative values');
    }
  }
});

test('R10 input validation keeps invalid weights out of persisted scoring state', () => {
  for (const value of ['-30', 'Infinity', 'NaN']) {
    const view = sourcing({ popularity: 30, lastYear: 0, outlook: 0, margin: 25 });
    const input = view.inputs.find(i => i.dataset.w === 'popularity');
    input.value = value;
    input.oninput();
    boundedScore(view);
    const saved = view.md.util.store.get('weights', {});
    for (const [key, weight] of Object.entries(saved)) {
      assert.ok(typeof weight === 'number' && Number.isFinite(weight) && weight >= 0, key + ' must not persist an invalid weight');
    }
  }
});

test('R10 zero total weight explains its policy and cannot recommend a candidate', () => {
  const view = sourcing({ popularity: 0, lastYear: 0, outlook: 0, margin: 0 });
  assert.doesNotMatch(view.table(), /도입 추천|테스트 발주|NaN|Infinity/);
  assert.match(view.text(), /합계.{0,30}0|가중치.{0,30}(모두|0|없)|평가 불가|산정 불가|계산 불가/);
});

test('R10 margin-only weighting scores a candidate at target times 1.4 as 100', () => {
  const view = sourcing({ popularity: 0, lastYear: 0, outlook: 0, margin: 100 });
  assert.equal(boundedScore(view), 100);
  assert.match(view.table(), /도입 추천/);
});

test('R10 finite very large weights cannot overflow into a NaN score', () => {
  const view = sourcing({ popularity: 1e308, lastYear: 1e308, outlook: 1e308, margin: 1e308 });
  assert.equal(boundedScore(view), 60, 'equal weights retain the hand-calculated average (20 + 100 + 20 + 100) / 4');
});
