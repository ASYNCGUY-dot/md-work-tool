// 앱 뼈대: 화면 전환, 기간 선택, 차트·표 공통 컴포넌트
(function () {
  const U = MD.util;
  MD.views = MD.views || {};

  const NAV = [
    ['시작하기', [['guide', '사용 가이드·월초 체크']]],
    ['성과 분석', [['dashboard', '매출 대시보드'], ['goals', '목표·KPI 달성'], ['insight', '매출 변동 분석·개선 제안'], ['channels', '채널·유입·전환'], ['ads', '광고 성과'], ['compete', '경쟁 상품 비교'], ['ranks', '검색 순위'], ['products', '상품 성과·재고'], ['promotions', '프로모션·타임딜']]],
    ['기획·가격', [['pricing', '원가·마진·판매가'], ['sourcing', '상품 선정·소싱']]],
    ['운영 관리', [['settlement', '매출 정산 대사'], ['vendors', '거래처·계약'], ['orders', '발주·입고 일정'], ['checklist', '오픈·기획전 체크리스트']]],
    ['보고', [['report', '보고서 자동 작성']]],
    ['설정', [['data', '데이터 관리']]],
  ];
  const USES_PERIOD = ['dashboard', 'insight', 'channels', 'products', 'ads', 'compete', 'report'];

  MD.state = { view: 'dashboard', start: null, end: null, cmp: U.store.get('cmp', 'prev'), preset: U.store.get('preset', '28') };

  function setPreset(p) {
    const d = MD.data, end = d.maxDate || U.today();
    MD.state.preset = p; U.store.set('preset', p);
    // 주는 월~일. '이번 주'는 자료 기준일이 속한 주의 월요일부터 기준일까지
    const monday = (s) => U.addDays(s, -((U.toDate(s).getUTCDay() + 6) % 7));
    if (p === '7' || p === '28' || p === '90') { MD.state.end = end; MD.state.start = U.addDays(end, -(Number(p) - 1)); }
    else if (p === 'wtd') { MD.state.end = end; MD.state.start = monday(end); }
    else if (p === 'lw') { MD.state.start = U.addDays(monday(end), -7); MD.state.end = U.addDays(MD.state.start, 6); }
    else if (p === 'mtd') { MD.state.end = end; MD.state.start = end.slice(0, 8) + '01'; }
    else if (p === 'lm') {
      const first = end.slice(0, 8) + '01';
      MD.state.end = U.addDays(first, -1); MD.state.start = MD.state.end.slice(0, 8) + '01';
    }
  }

  function renderNav() {
    const nav = document.getElementById('nav');
    nav.innerHTML = NAV.map(([g, items]) =>
      `<div class="nav-group">${g}</div>` + items.map(([id, label]) => `<a href="#${id}" data-id="${id}">${label}</a>`).join('')
    ).join('');
  }

  // 자료 신선도: 판매·유입 자료의 마지막 날. 오늘보다 4일 이상 늦으면 경고
  function fresh(d) {
    if (!d.maxDate) return '';
    const lag = U.diffDays(d.maxDate, U.today());
    const tMax = d.traffic.length ? d.traffic[d.traffic.length - 1].date : null;
    const tip = `판매 자료 ${d.minDate} ~ ${d.maxDate}${tMax ? ` · 유입·광고비 ~ ${tMax}` : ' · 유입·광고비 없음'}`;
    return `<span class="badge ${lag > 3 ? 'bad' : 'neutral'}" title="${tip}">자료 ~${d.maxDate.slice(5).replace('-', '/')}${lag > 0 ? ` (${lag}일 전)` : ''}</span>`;
  }

  // 저장 상태: 저장됨(시각) / 저장 안 됨(화면에만 반영 — 백업 필요). 예시 데이터는 판매 등을 저장하지 않으므로 표시하지 않는다
  function saveBadge() {
    const d = MD.data, s = MD.store.lastSave;
    if (MD.store.backendError) return `<a class="badge bad" href="#data" title="${U.esc(MD.store.backendError)}">저장소 열기 실패 · 저장 안 함</a>`;
    if (MD.store.staleBy) return '<a class="badge bad" href="javascript:location.reload()" title="다른 탭(창)에서 자료를 저장했습니다. 새로고침하면 최신 자료를 봅니다. 이 탭에서 저장하려 하면 덮어쓰기 방지로 거부됩니다.">다른 탭에서 변경됨 · 새로고침</a>';
    if (MD.store.interrupted) return `<a class="badge bad" href="#data" title="지난 저장이 ${MD.store.interrupted.at.slice(0, 16).replace('T', ' ')}(UTC)에 끝나지 못했습니다">저장 불완전 · 확인 필요</a>`;
    if (d.isSample || !s) return '';
    // 저장 시각은 ISO(UTC)로 남기므로 화면에는 이 PC의 현지 시각으로 바꿔 보여 준다
    const lt = new Date(s.at), p2 = (n) => String(n).padStart(2, '0');
    const t = `${p2(lt.getHours())}:${p2(lt.getMinutes())}`, full = `${lt.getFullYear()}-${p2(lt.getMonth() + 1)}-${p2(lt.getDate())} ${t}`;
    return s.ok
      ? `<span class="badge neutral" title="마지막 저장 성공 ${full}">저장됨 ${t}</span>`
      : `<a class="badge bad" href="#data" title="${s.failed === 'meta' ? '모드 정보' : s.failed} 저장 실패${s.notRestored && s.notRestored.length ? ` · 되돌리지 못한 키: ${s.notRestored.join(', ')}` : ''}">저장 안 됨 · 백업 받기</a>`;
  }
  MD.saveStateChanged = () => { const b = document.getElementById('saveBadge'); if (b) b.innerHTML = saveBadge(); };

  // 테마: auto(시스템 설정)·light·dark. 차트는 그릴 때 CSS 색을 읽으므로 바꾼 뒤 다시 그린다
  const THEMES = { auto: '시스템 설정', light: '밝게', dark: '어둡게' };
  const theme = () => U.store.get('theme', 'auto');
  function setTheme(t) {
    U.store.set('theme', t);
    if (t === 'auto') delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = t;
  }

  function renderTopbar() {
    const s = MD.state, d = MD.data;
    const label = NAV.flatMap((g) => g[1]).find((x) => x[0] === s.view);
    const bar = document.getElementById('topbar');
    const per = USES_PERIOD.includes(s.view);
    bar.innerHTML = `
      <button class="btn menu-btn" id="menuBtn" aria-label="메뉴">☰</button>
      <div class="title">${label ? label[1] : ''}</div>
      ${per ? `
      <div class="seg" id="presets">
        ${[['wtd', '이번 주'], ['lw', '지난 주'], ['mtd', '이번 달'], ['lm', '지난 달'], ['7', '7일'], ['28', '28일'], ['90', '90일']].map(([k, l]) => `<button data-p="${k}" class="${s.preset === k ? 'on' : ''}">${l}</button>`).join('')}
      </div>
      <input type="date" id="dStart" value="${s.start}" aria-label="시작일"> ~ <input type="date" id="dEnd" value="${s.end}" aria-label="종료일">
      <select id="cmpSel" aria-label="비교 기준">
        <option value="prev" ${s.cmp === 'prev' ? 'selected' : ''}>비교: 직전 동일기간</option>
        <option value="mom" ${s.cmp === 'mom' ? 'selected' : ''}>비교: 전월 동기간</option>
        <option value="yoy" ${s.cmp === 'yoy' ? 'selected' : ''}>비교: 전년 동기</option>
      </select>` : ''}
      ${fresh(d)}
      <span id="saveBadge">${saveBadge()}</span>
      <span class="badge ${d.isSample ? '' : 'real'}" title="${d.isSample ? '가상의 예시 데이터입니다. [데이터 관리]에서 실제 데이터를 올리세요.' : ''}">${d.isSample ? '예시 데이터' : '내 데이터'}</span>
      <button class="btn small" id="themeBtn" title="화면 테마: ${THEMES[theme()]}" aria-label="화면 테마 바꾸기 (지금 ${THEMES[theme()]})">${theme() === 'dark' ? '☾' : theme() === 'light' ? '☀' : '◐'}</button>`;
    bar.querySelector('#menuBtn').onclick = () => document.querySelector('.side').classList.toggle('open');
    bar.querySelector('#themeBtn').onclick = () => { const order = ['auto', 'light', 'dark']; setTheme(order[(order.indexOf(theme()) + 1) % 3]); render(); };
    if (!per) return;
    bar.querySelectorAll('#presets button').forEach((b) => (b.onclick = () => { setPreset(b.dataset.p); render(); }));
    const onDate = () => {
      const a = bar.querySelector('#dStart').value, b = bar.querySelector('#dEnd').value;
      if (!a || !b) return;
      MD.state.start = a <= b ? a : b; MD.state.end = a <= b ? b : a; MD.state.preset = 'custom'; render();
    };
    bar.querySelector('#dStart').onchange = onDate;
    bar.querySelector('#dEnd').onchange = onDate;
    bar.querySelector('#cmpSel').onchange = (e) => { MD.state.cmp = e.target.value; U.store.set('cmp', e.target.value); render(); };
  }

  function render() {
    const id = MD.state.view;
    document.querySelectorAll('#nav a').forEach((a) => a.classList.toggle('active', a.dataset.id === id));
    document.querySelector('.side').classList.remove('open');
    renderTopbar();
    MD.charts.destroyAll();
    const el = document.getElementById('content');
    const view = MD.views[id];
    const needsSales = ['dashboard', 'insight', 'channels', 'products', 'promotions', 'report'].includes(id);
    if (needsSales && !MD.data.sales.length) {
      el.innerHTML = `<div class="card empty">아직 판매 데이터가 없습니다.<br><br><a class="btn primary" href="#data">데이터 관리에서 올리기</a></div>`;
      return;
    }
    try { view ? view(el) : (el.innerHTML = '<div class="empty">준비 중</div>'); }
    catch (e) { console.error(e); el.innerHTML = `<div class="card empty">화면을 그리는 중 오류가 났습니다: ${U.esc(e.message)}</div>`; }
  }

  function route() {
    const id = location.hash.replace('#', '') || 'dashboard';
    MD.state.view = id;
    render();
    window.scrollTo(0, 0);
  }

  // 현재 기간·비교 기간 데이터
  MD.current = function (filter) {
    const s = MD.state;
    const [cs, ce] = MD.calc.compareRange(s.start, s.end, s.cmp);
    return { cur: MD.calc.period(s.start, s.end, filter), prev: MD.calc.period(cs, ce, filter), cs, ce };
  };
  MD.cmpLabel = () => (MD.state.cmp === 'yoy' ? '전년 동기' : MD.state.cmp === 'mom' ? '전월 동기간' : '직전 기간');

  // ---------- 차트 ----------
  const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  const SERIES = ['--s1', '--s2', '--s3', '--s4', '--s5', '--s6', '--s7', '--s8'];
  MD.colorOf = (i) => css(SERIES[i % SERIES.length]);

  MD.charts = {
    list: [],
    destroyAll() { this.list.forEach((c) => c.destroy()); this.list = []; },
    base(yFmt) {
      const ink2 = css('--ink-2'), muted = css('--muted'), grid = css('--line');
      return {
        responsive: true, maintainAspectRatio: false, animation: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: css('--surface'), titleColor: css('--ink'), bodyColor: ink2, borderColor: css('--line-strong'), borderWidth: 1,
            padding: 10, boxPadding: 4, usePointStyle: true,
            callbacks: { label: (c) => ` ${c.dataset.label}: ${yFmt ? yFmt(c.parsed.y ?? c.parsed.x) : c.formattedValue}` },
          },
        },
        scales: {
          x: { grid: { display: false }, border: { color: css('--line-strong') }, ticks: { color: muted, maxRotation: 0, autoSkipPadding: 12 } },
          y: { grid: { color: grid }, border: { display: false }, ticks: { color: muted, callback: (v) => (yFmt ? yFmt(v) : v) }, beginAtZero: true },
        },
      };
    },
    make(canvas, cfg) {
      if (!window.Chart) { canvas.parentElement.innerHTML = '<div class="empty">차트 라이브러리를 불러오지 못했습니다 (인터넷 연결 확인). 표는 정상 표시됩니다.</div>'; return null; }
      const c = new Chart(canvas, cfg); this.list.push(c); return c;
    },
    // series: [{label, data, color, dashed}]
    line(canvas, labels, series, yFmt) {
      return this.make(canvas, {
        type: 'line',
        data: { labels, datasets: series.map((s) => ({ label: s.label, data: s.data, borderColor: s.color, backgroundColor: s.color, borderWidth: 2, borderDash: s.dashed ? [5, 4] : [], pointRadius: 0, pointHoverRadius: 4, tension: 0.25 })) },
        options: this.base(yFmt),
      });
    },
    bar(canvas, labels, series, yFmt, opts = {}) {
      const o = this.base(yFmt);
      if (opts.horizontal) {
        o.indexAxis = 'y';
        const tmp = o.scales.x; o.scales.x = o.scales.y; o.scales.y = tmp;
        o.scales.x.ticks.callback = (v) => (yFmt ? yFmt(v) : v);
        o.scales.y.ticks.callback = function (v) { const s = this.getLabelForValue(v); return s.length > 18 ? s.slice(0, 17) + '…' : s; };
        o.scales.y.ticks.autoSkip = false;
        o.interaction = { mode: 'nearest', axis: 'y', intersect: false };
      }
      if (opts.stacked) { o.scales.x.stacked = true; o.scales.y.stacked = true; }
      return this.make(canvas, {
        type: 'bar',
        data: { labels, datasets: series.map((s) => ({ label: s.label, data: s.data, backgroundColor: s.colors || s.color, borderRadius: 4, borderSkipped: 'start', borderColor: css('--surface'), borderWidth: opts.stacked ? { top: 2 } : 0, maxBarThickness: 28, categoryPercentage: 0.75, barPercentage: 0.9 })) },
        options: o,
      });
    },
  };

  MD.legend = (items) => `<div class="legend">${items.map((i) => `<span><i class="${i.dashed ? 'dash' : ''}" style="background:${i.color}"></i>${U.esc(i.label)}</span>`).join('')}</div>`;

  // ---------- 표 ----------
  // cols: [{key, label, fmt(v,row), num, html}]
  MD.table = function (el, { cols, rows, total, sortKey, sortDir = -1, exportName, maxRows }) {
    let sk = sortKey, sd = sortDir;
    function draw() {
      const data = sk ? [...rows].sort((a, b) => {
        const x = a[sk], y = b[sk];
        if (x == null) return 1; if (y == null) return -1;
        return (x > y ? 1 : x < y ? -1 : 0) * sd;
      }) : rows;
      const shown = maxRows ? data.slice(0, maxRows) : data;
      const cell = (c, r) => {
        const v = r[c.key];
        const out = c.fmt ? c.fmt(v, r) : v ?? '';
        const tip = c.money && typeof v === 'number' ? ` title="${U.won(v)}"` : '';
        return `<td class="${c.num ? 'num' : ''}"${tip}>${c.html ? out : U.esc(out)}</td>`;
      };
      el.innerHTML = `${exportName ? `<div class="row no-print" style="justify-content:flex-end;margin-bottom:6px"><button class="btn small" data-x>엑셀로 받기</button></div>` : ''}
        <div class="table-wrap"><table>
        <thead><tr>${cols.map((c) => `<th class="${c.num ? 'num' : ''} ${c.nosort ? '' : 'sortable'}" data-k="${c.key}">${c.label}${sk === c.key ? (sd > 0 ? ' ↑' : ' ↓') : ''}</th>`).join('')}</tr></thead>
        <tbody>${shown.map((r) => `<tr>${cols.map((c) => cell(c, r)).join('')}</tr>`).join('') || `<tr><td colspan="${cols.length}" class="muted" style="text-align:center;padding:20px">데이터 없음</td></tr>`}</tbody>
        ${total ? `<tfoot><tr class="total">${cols.map((c) => cell(c, total)).join('')}</tr></tfoot>` : ''}
        </table></div>${maxRows && data.length > maxRows ? `<div class="note">상위 ${maxRows}개 표시 (전체 ${data.length}개는 엑셀로 받기)</div>` : ''}`;
      el.querySelectorAll('th.sortable').forEach((th) => (th.onclick = () => { const k = th.dataset.k; sd = sk === k ? -sd : -1; sk = k; draw(); }));
      const x = el.querySelector('[data-x]');
      if (x) x.onclick = () => {
        const plain = (c, r) => { const v = r[c.key]; return c.xfmt ? c.xfmt(v, r) : typeof v === 'number' ? Math.round(v * 10000) / 10000 : v; };
        const out = data.map((r) => Object.fromEntries(cols.filter((c) => !c.noexport).map((c) => [c.label, plain(c, r)])));
        if (total) out.push(Object.fromEntries(cols.filter((c) => !c.noexport).map((c) => [c.label, plain(c, total)])));
        U.exportXlsx(exportName + '.xlsx', { 데이터: out });
      };
    }
    draw();
  };

  // 공통 열 정의
  MD.cols = {
    sales: { key: 'sales', label: '매출', num: true, money: true, fmt: (v) => U.krw(v), xfmt: (v) => Math.round(v) },
    share: { key: 'share', label: '비중', num: true, fmt: (v) => U.pct(v), xfmt: (v) => v },
    dSales: { key: 'dSales', label: '매출 증감', num: true, html: true, fmt: (v) => U.deltaHtml(v), xfmt: (v) => v },
    gross: { key: 'gross', label: '매출총이익', num: true, money: true, fmt: (v) => U.krw(v), xfmt: (v) => Math.round(v) },
    margin: { key: 'margin', label: '이익률', num: true, fmt: (v) => U.pct(v), xfmt: (v) => v },
    ad: { key: 'adSpend', label: '광고비(리포트)', num: true, money: true, fmt: (v) => U.krw(v), xfmt: (v) => Math.round(v) },
    roas: { key: 'roas', label: '광고 ROAS', num: true, fmt: (v) => (v == null ? '-' : U.pct(v, 0)), xfmt: (v) => v },
    cvr: { key: 'cvr', label: '전환율', num: true, fmt: (v) => U.pct(v, 2), xfmt: (v) => v },
    aov: { key: 'aov', label: '객단가', num: true, fmt: (v) => U.won(v), xfmt: (v) => Math.round(v || 0) },
    qty: { key: 'qty', label: '수량', num: true, fmt: (v) => U.num(v) },
    visits: { key: 'visits', label: '유입', num: true, fmt: (v) => U.num(v) },
    orders: { key: 'orders', label: '주문', num: true, fmt: (v) => U.num(v) },
  };

  // 일별 시계열 (현재 vs 비교 기간을 같은 x축 위치에 겹친다)
  MD.dailySeries = function (cur, prev, s, e, cs, valueFn = (r) => r.sales) {
    const days = U.dateRange(s, e);
    const sum = (rows) => { const m = new Map(); for (const r of rows) m.set(r.date, (m.get(r.date) || 0) + valueFn(r)); return m; };
    const a = sum(cur), b = sum(prev);
    const len = days.length;
    const bucket = len > 120 ? 7 : 1; // 기간이 길면 주 단위로 묶는다
    const labels = [], cv = [], pv = [];
    for (let i = 0; i < len; i += bucket) {
      let x = 0, y = 0;
      for (let j = i; j < Math.min(len, i + bucket); j++) { x += a.get(days[j]) || 0; y += b.get(U.addDays(cs, j)) || 0; }
      labels.push(days[i].slice(5).replace('-', '/') + (bucket === 1 && len <= 31 ? `(${U.weekday(days[i])})` : ''));
      cv.push(x); pv.push(y);
    }
    return { labels, cv, pv, bucket };
  };

  function init() {
    setTheme(theme());
    // IndexedDB에서 읽거나 처음 이전하는 경우 load가 Promise를 돌려준다 — 다 읽은 뒤 화면을 그린다
    document.getElementById('content').innerHTML = '<div class="empty">자료를 불러오는 중…</div>';
    Promise.resolve(MD.store.load()).then(() => {
      setPreset(MD.state.preset === 'custom' ? '28' : MD.state.preset);
      renderNav();
      window.addEventListener('hashchange', route);
      route();
      // 이전은 백그라운드에서 끝난다 — 끝나면 알리고 저장 상태 표시를 갱신
      if (MD.store.migrating) MD.store.migrating.then(() => {
        const m = MD.store.migration;
        if (m && m.ok && m.keys) U.toast(`저장 방식을 IndexedDB로 옮겼습니다(자료 ${m.keys}종 대조 일치). 저장 한도가 크게 늘었습니다.`);
        if (MD.saveStateChanged) MD.saveStateChanged();
        if (m && m.recopied) MD.refresh(); // 이전 중 다른 탭 저장으로 최신 자료를 다시 옮겼다 — 화면 전체를 새 자료로 (R4-01)
        else if (MD.state.view === 'data') MD.rerender(); // 저장 방식·이전 결과 표시 갱신
      });
    });
  }
  // 데이터가 바뀐 뒤: 기간을 새 데이터의 마지막 날짜 기준으로 다시 잡는다
  // 직접 고른 기간은 그대로 둔다 (자료를 추가해도 보던 보고 기간이 바뀌지 않게)
  MD.refresh = function () { if (MD.state.preset !== 'custom' || !MD.state.start) setPreset(MD.state.preset === 'custom' ? '28' : MD.state.preset); render(); };
  MD.rerender = render;

  document.addEventListener('DOMContentLoaded', init);
})();
