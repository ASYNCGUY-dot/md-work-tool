const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function setup() {
  const c = vm.createContext({ localStorage: { getItem: () => null, setItem() {}, removeItem() {} } });
  vm.runInContext('window=globalThis; MD={views:{}};', c);
  for (const file of ['js/util.js', 'js/data.js', 'js/views/datamgmt.js', 'js/views/ranks.js']) {
    let source = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
    if (file.endsWith('datamgmt.js')) {
      const end = source.lastIndexOf('})();');
      assert.ok(end >= 0, 'the backup test hook must remain inside the VM-only closure');
      source = source.slice(0, end) + 'MD.testRankBackup={checkBackup};\n' + source.slice(end);
    }
    vm.runInContext(source, c, { filename: file });
  }
  return c.MD;
}

function observation(overrides = {}) {
  return {
    id: 'R1', at: '2026-10-31T10:00', platform: '네이버', keyword: '세라믹 프라이팬', sku: 'S1',
    type: '자연', rank: 3, scopeN: 40, device: '모바일', memo: '', ...overrides,
  };
}

function pair(m, prevRank, lastRank, lastOverrides = {}) {
  const prev = observation({ rank: prevRank });
  const last = observation({ id: 'R2', at: '2026-10-31T11:00', rank: lastRank, ...lastOverrides });
  const series = m.rankSeries([last, prev]); // Input order must not determine which observation is newest.
  assert.equal(series.length, 1);
  return series[0];
}

test('O rank 3 to rank 12 is a nine-place decline in observation-time order', () => {
  const m = setup(), result = pair(m, 3, 12);
  assert.equal(result.prev.id, 'R1');
  assert.equal(result.last.id, 'R2');
  assert.equal(result.change, 9);
  assert.equal(pair(m, 12, 3).change, -9, 'a lower rank number is an improvement');
});

test('O null ranks stay outside the observed range and do not become rank zero or numeric changes', () => {
  const m = setup();
  const cases = [
    { prev: null, last: null, note: '계속 범위 밖' },
    { prev: 3, last: null, note: '범위 밖으로 하락' },
    { prev: null, last: 12, note: '범위 안 진입' },
  ];
  for (const row of cases) {
    const result = pair(m, row.prev, row.last);
    assert.equal(result.change, null, 'outside-range observations have no measured numeric rank difference');
    assert.equal(result.note, row.note);
    assert.deepEqual(Array.from(result.list, r => r.rank), [row.prev, row.last]);
  }
});

test('O device and observation-scope changes are identified as different comparison conditions', () => {
  const m = setup();
  assert.equal(pair(m, 3, 12).diffCond, false);
  assert.equal(pair(m, 3, 12, { device: 'PC' }).diffCond, true);
  assert.equal(pair(m, 3, 12, { scopeN: 100 }).diffCond, true);
});

test('O backup rejects zero, out-of-range or fractional ranks and impossible observation dates', () => {
  const m = setup();
  const cases = [
    [{ rank: 0 }, /순위 값 오류/],
    [{ rank: 41 }, /순위 값 오류/],
    [{ rank: 1.5 }, /순위 값 오류/],
    [{ scopeN: 0 }, /관측 범위 값 오류/],
    [{ scopeN: 1.5 }, /관측 범위 값 오류/],
    [{ at: '2026-02-30T10:00' }, /관측 시각 값 오류/],
    [{ at: '2026-02-29T10:00' }, /관측 시각 값 오류/],
    [{ at: '2026-10-32T10:00' }, /관측 시각 값 오류/],
  ];
  for (const [overrides, expected] of cases) {
    const errors = m.testRankBackup.checkBackup({ isSample: false, sales: [], ranks: [observation(overrides)] });
    assert.ok(errors.some(error => expected.test(error)), JSON.stringify(overrides));
  }
});

test('O backup accepts null and valid integer boundary ranks while preserving their meaning', () => {
  const m = setup();
  const cases = [
    { overrides: { rank: null }, rank: null, date: '2026-10-31' },
    { overrides: { rank: 1 }, rank: 1, date: '2026-10-31' },
    { overrides: { rank: 40, type: '광고' }, rank: 40, date: '2026-10-31' },
    { overrides: { rank: 12, at: '2024-02-29T08:30' }, rank: 12, date: '2024-02-29' },
  ];
  for (const row of cases) {
    const backup = { isSample: false, sales: [], ranks: [observation(row.overrides)] };
    assert.deepEqual(Array.from(m.testRankBackup.checkBackup(backup)), []);
    assert.equal(backup.ranks[0].rank, row.rank);
    assert.equal(backup.ranks[0].date, row.date, 'missing date is filled from the accepted observation timestamp');
  }
});

test('O backup rejects impossible observation hours and minutes', () => {
  const m = setup();
  for (const at of ['2026-10-31T25:00', '2026-10-31T10:99']) {
    const errors = m.testRankBackup.checkBackup({ isSample: false, sales: [], ranks: [observation({ at })] });
    assert.ok(errors.some(error => /관측 시각 값 오류/.test(error)), 'must reject impossible observation timestamp: ' + at);
  }
});
