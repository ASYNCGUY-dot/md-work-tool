const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const TODAY = '2026-10-31';

function setup() {
  const c = vm.createContext({
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    setTimeout() {}, // The detail click schedules only scrollIntoView after rendering.
  });
  vm.runInContext('window=globalThis; MD={views:{}};', c);
  for (const file of ['js/util.js', 'js/views/vendors.js', 'js/views/datamgmt.js']) {
    let source = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
    const hook = file.endsWith('vendors.js') ? 'MD.testVendorDetail=detail;' : file.endsWith('datamgmt.js') ? 'MD.testVendorBackup=checkBackup;' : null;
    if (hook) {
      const end = source.lastIndexOf('})();');
      assert.ok(end >= 0, 'private hooks exist only in the VM copy');
      source = source.slice(0, end) + hook + '\n' + source.slice(end);
    }
    vm.runInContext(source, c, { filename: file });
  }
  c.MD.store = { save: () => Promise.resolve(true) };
  c.MD.rerender = () => {};
  return c.MD;
}

function contract(overrides = {}) {
  return {
    id: 'C1', kind: '판권·라이선스', title: '독립 검증 계약', territory: '한국 온라인',
    start: '2026-10-01', end: '2026-12-10', terms: '분기 정산', royalty: 0.08,
    minimum: 50000000, renewal: '협의 갱신', noticeDays: 30, status: '유효', link: 'https://example.com/contract',
    ...overrides,
  };
}

function vendor(overrides = {}) {
  return {
    id: 'V1', name: '검증 거래처', type: '판권·라이선스', status: '협의중',
    last: '', due: '', contractEnd: '2027-01-31', contracts: [contract()], history: [],
    ...overrides,
  };
}

function backup(row) { return { sales: [], vendors: [row] }; }
function errors(m, row) { return Array.from(m.testVendorBackup(backup(row))); }

// The real MD.crud draws the table and binds its change handler. Only the DOM
// surface is replaced; contract/list change callbacks and history logic run.
function surface() {
  const nodes = new Map();
  const node = (selector) => {
    if (!nodes.has(selector)) {
      const listeners = new Map();
      nodes.set(selector, {
        innerHTML: '', querySelector: node, querySelectorAll: () => [],
        addEventListener(type, listener) { listeners.set(type, listener); },
        dispatch(type, event) {
          assert.ok(listeners.has(type), 'the real view must bind the ' + type + ' listener');
          return listeners.get(type)(event);
        },
      });
    }
    return nodes.get(selector);
  };
  return { root: node('root'), node };
}

function edit(el, key, value) {
  return el.onchange({ target: { dataset: { i: '0', k: key }, value } });
}

test('N only effective contracts contribute to the count and earliest expiry', () => {
  const m = setup();
  const row = vendor({ contracts: [
    contract({ id: 'late', end: '2026-12-20' }),
    contract({ id: 'first', end: '2026-12-10' }),
    contract({ id: 'open', end: '' }),
    contract({ id: 'negotiating', status: '협의중', end: '2026-11-01' }),
    contract({ id: 'expired', status: '만료', end: '2026-11-02' }),
    contract({ id: 'terminated', status: '해지', end: '2026-11-03' }),
  ] });
  const result = m.vendorContracts(row, TODAY);
  assert.equal(result.active, 3);
  assert.equal(result.end, '2026-12-10');
  assert.ok(result.notices.every(item => item.c.status === '유효'));
});

test('N expiry in 40 days with 30-day notice is D10, and notices include today through D30 only', () => {
  const m = setup();
  const result = m.vendorContracts(vendor({ contracts: [
    contract({ id: 'ten', end: '2026-12-10', noticeDays: 30 }),
    contract({ id: 'today', end: '2026-11-30', noticeDays: 30 }),
    contract({ id: 'thirty', end: '2026-12-30', noticeDays: 30 }),
    contract({ id: 'thirty-one', end: '2026-12-31', noticeDays: 30 }),
    contract({ id: 'past', end: '2026-11-29', noticeDays: 30 }),
    contract({ id: 'zero', end: '2026-12-10', noticeDays: 0 }),
    contract({ id: 'inactive', status: '만료', end: '2026-12-10', noticeDays: 30 }),
  ] }), TODAY);
  const ten = result.notices.find(item => item.c.id === 'ten');
  assert.equal(ten.by, '2026-11-10');
  assert.equal(m.util.diffDays(TODAY, ten.by), 10);
  assert.deepEqual(Array.from(result.soonNotice, item => [item.c.id, item.by]), [
    ['today', '2026-10-31'], ['ten', '2026-11-10'], ['thirty', '2026-11-30'],
  ]);
  assert.ok(!result.notices.some(item => ['zero', 'inactive'].includes(item.c.id)));
});

test('N the list expiry remains the fallback when there is no effective dated contract', () => {
  const m = setup();
  for (const contracts of [undefined, [], [contract({ status: '협의중' })], [contract({ status: '해지' })]]) {
    const result = m.vendorContracts(vendor({ contracts }), TODAY);
    assert.equal(result.active, 0);
    assert.equal(result.end, '2027-01-31');
    assert.equal(result.notices.length, 0);
  }
  assert.equal(m.vendorContracts(vendor({ contracts: [], contractEnd: '' }), TODAY).end, null);
});

test('N list status and expiry edits record previous and new values exactly once', async () => {
  const m = setup(), row = vendor(), dom = surface();
  m.data = { vendors: [row] };
  m.views.vendors(dom.root);
  edit(dom.node('#vT'), 'status', '거래중');
  edit(dom.node('#vT'), 'status', '거래중');
  edit(dom.node('#vT'), 'contractEnd', '2027-02-28');
  edit(dom.node('#vT'), 'next', '갱신 조건 확인');
  await Promise.resolve();
  assert.equal(row.history.length, 2);
  assert.equal(row.history[0].text, '상태: 협의중 → 거래중');
  assert.equal(row.history[1].text, '계약·판권 만료: 2027-01-31 → 2027-02-28');
  for (const entry of row.history) {
    assert.equal(entry.kind, '조건 변경');
    assert.match(entry.date, /^\d{4}-\d{2}-\d{2}$/);
  }
});

test('N detailed contract status, expiry and terms edits create the corresponding history', async () => {
  const m = setup(), row = vendor({ contracts: [contract({ status: '협의중', end: '', terms: '선결제' })] }), dom = surface();
  m.testVendorDetail(dom.root, { vendors: [row] }, row, TODAY, () => Promise.resolve(true));
  edit(dom.node('#dContracts'), 'status', '유효');
  edit(dom.node('#dContracts'), 'end', '2026-12-10');
  edit(dom.node('#dContracts'), 'terms', '분기 정산');
  edit(dom.node('#dContracts'), 'terms', '분기 정산');
  await Promise.resolve();
  assert.deepEqual(row.history.map(entry => [entry.date, entry.kind, entry.text]), [
    [TODAY, '계약', '독립 검증 계약 계약 상태: 협의중 → 유효'],
    [TODAY, '조건 변경', '독립 검증 계약 만료일: (없음) → 2026-12-10'],
    [TODAY, '조건 변경', '독립 검증 계약 조건: 선결제 → 분기 정산'],
  ]);
});

test('N genuine contracts/history and optional empty dates pass the real backup validator', () => {
  const m = setup();
  const row = vendor({ history: [{ id: 'H1', date: '2024-02-29', kind: '계약', text: '윤일 계약 협의' }] });
  assert.deepEqual(errors(m, row), []);
  assert.deepEqual(errors(m, vendor({ contracts: [contract({ start: '', end: '', royalty: 0, minimum: 0, noticeDays: 0 })] })), []);
  assert.deepEqual(errors(m, { name: '이전 형식 거래처' }), []);
});

test('N contract backup numeric fields reject nonnumeric and nonfinite values', () => {
  const m = setup();
  for (const key of ['royalty', 'minimum', 'noticeDays']) {
    for (const value of ['abc', '30', true, {}, [], NaN, Infinity, -Infinity]) {
      const result = errors(m, vendor({ contracts: [contract({ [key]: value })] }));
      assert.ok(result.some(error => /vendors.*계약 값 오류/.test(error)), key + ' must reject ' + String(value));
    }
  }
});

test('N contract and history backups reject impossible dates and malformed nested rows', () => {
  const m = setup();
  for (const key of ['start', 'end']) {
    for (const value of ['2026-02-29', '2026-02-31', '2026-13-01', 20261031]) {
      assert.ok(errors(m, vendor({ contracts: [contract({ [key]: value })] })).some(error => /계약 값 오류/.test(error)));
    }
  }
  for (const history of [
    {}, [null], [{ date: '2026-02-31', text: '불가능한 날짜' }],
    [{ date: '2026-10-31', text: 123 }], [{ date: '2026-10-31', text: '기록', kind: [] }],
  ]) {
    assert.ok(errors(m, vendor({ history })).some(error => /이력 값 오류/.test(error)), JSON.stringify(history));
  }
  for (const contracts of [{}, [null], [contract({ title: {} })]]) {
    assert.ok(errors(m, vendor({ contracts })).some(error => /계약 값 오류/.test(error)), JSON.stringify(contracts));
  }
});

test('N failed asynchronous contract save restores contract terms and the existing history', async () => {
  const m = setup(), row = vendor({ history: [{ id: 'H0', date: TODAY, kind: '연락', text: '기존 정상 이력' }] }), dom = surface();
  m.data = { vendors: [row] };
  const before = JSON.parse(JSON.stringify(m.data.vendors));
  let saves = 0;
  m.testVendorDetail(dom.root, m.data, row, TODAY, () => { saves++; return Promise.resolve(false); });
  await edit(dom.node('#dContracts'), 'terms', '저장 실패 계약조건');
  await new Promise(setImmediate);
  assert.equal(saves, 1, 'the real contract callback must attempt its save');
  assert.deepEqual(JSON.parse(JSON.stringify(m.data.vendors)), before, 'a failed contract save must restore both terms and generated history');
});

test('N failed asynchronous list save restores vendor status and the existing history', async () => {
  const m = setup(), row = vendor({ status: '거래중', history: [{ id: 'H0', date: TODAY, kind: '연락', text: '기존 정상 이력' }] }), dom = surface();
  m.data = { vendors: [row] };
  const before = JSON.parse(JSON.stringify(m.data.vendors));
  let saves = 0;
  m.store.save = () => { saves++; return Promise.resolve(false); };
  m.views.vendors(dom.root);
  await edit(dom.node('#vT'), 'status', '보류');
  await new Promise(setImmediate);
  assert.equal(saves, 1, 'the real list callback must attempt its save');
  assert.deepEqual(JSON.parse(JSON.stringify(m.data.vendors)), before, 'a failed list save must restore both status and generated history');
});

test('N synchronous successful localStorage saves do not throw in list or contract change callbacks', async () => {
  const runtimeErrors = [];
  for (const mode of ['list', 'contract']) {
    const m = setup(), row = vendor(), dom = surface();
    m.data = { vendors: [row] };
    const persisted = new Map();
    const save = () => { persisted.set('vendors', JSON.stringify(m.data.vendors)); return true; };
    m.store.save = save;
    m.views.vendors(dom.root);
    if (mode === 'contract') {
      // Open detail through the real list click and view rerender. Production
      // passes its normalized save wrapper into detail; the storage boundary
      // above must still return raw Boolean true, as localStorage does.
      m.rerender = () => m.views.vendors(dom.root);
      dom.node('#vT').dispatch('click', { target: { dataset: { detail: row.id } } });
      assert.equal(typeof dom.node('#dContracts').onchange, 'function', 'the list must wire its detail contract editor');
    }
    try {
      if (mode === 'list') await edit(dom.node('#vT'), 'status', '거래중');
      else await edit(dom.node('#dContracts'), 'terms', '동기 저장 계약조건');
      await new Promise(setImmediate);
    } catch (error) { runtimeErrors.push(mode + ': ' + error.message); }
    const saved = JSON.parse(persisted.get('vendors'))[0];
    if (mode === 'list') assert.equal(saved.status, '거래중');
    else assert.equal(saved.contracts[0].terms, '동기 저장 계약조건');
    assert.equal(saved.history.length, 1, 'a successful synchronous save preserves its generated history');
  }
  assert.deepEqual(runtimeErrors, [], 'the supported boolean save result must not be treated as a Promise');
});
