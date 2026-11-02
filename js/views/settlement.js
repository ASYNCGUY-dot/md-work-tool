// 매출 정산 대사: 통합관리(사방넷 등)·플랫폼 정산·회계 자료를 주문번호로 교차 확인
(function () {
  const U = MD.util;
  const SRC = [['hub', '통합관리 주문 (사방넷 등)'], ['platform', '플랫폼 정산 내역'], ['account', '회계 매출 자료']];
  const ALIAS = {
    order: ['주문번호', '주문 번호', '주문no', 'order_no', 'orderno', '상품주문번호', '주문코드'],
    channel: ['채널', '쇼핑몰', '쇼핑몰명', '판매처', 'channel', '몰'],
    amount: ['금액', '결제금액', '판매금액', '정산대상금액', '매출액', '공급가', 'amount', '실결제금액'],
    date: ['주문일', '주문일자', '결제일', '날짜', 'date'],
  };
  let files = { hub: null, platform: null, account: null };
  let tol = U.store.get('settleTol', 10);
  let onlyIssues = true;
  let dupSum = U.store.get('settleDupSum', false);

  function pick(row, key) {
    const k = Object.keys(row).find((c) => ALIAS[key].some((a) => c.replace(/\s/g, '').toLowerCase() === a.replace(/\s/g, '').toLowerCase()));
    return k ? row[k] : undefined;
  }
  function normalize(rows) {
    return rows.map((r) => {
      const rawAmt = String(pick(r, 'amount') ?? '').replace(/[,원\s]/g, '');
      const amount = Number(rawAmt);
      const rawDate = String(pick(r, 'date') ?? '').trim();
      return {
        order: String(pick(r, 'order') ?? '').trim(),
        channel: String(pick(r, 'channel') ?? '').trim(),
        // 숫자로 읽히지 않는 금액은 0원으로 바꾸지 않고 '금액 오류'로 표시한다
        amount: /\d/.test(rawAmt) && Number.isFinite(amount) ? amount : null,
        date: U.normDate(rawDate) || rawDate.slice(0, 10),
      };
    }).filter((r) => r.order);
  }

  // 예시: 최근 한 달 판매 데이터에서 주문 목록을 만들고 일부러 오류를 섞는다
  function sampleFiles() {
    const d = MD.data, end = d.maxDate, start = U.addDays(end, -29);
    const rows = MD.calc.inRange(d.sales, start, end);
    const hub = rows.map((r, i) => ({ order: `${r.date.replace(/-/g, '')}-${String(i + 1).padStart(5, '0')}`, channel: r.channel, amount: r.sales, date: r.date }));
    const platform = [], account = [];
    hub.forEach((h, i) => {
      if (i !== 5 && i !== 77) platform.push({ ...h, amount: i === 12 || i === 140 ? h.amount - 30000 : h.amount }); // 5·77: 플랫폼 누락(취소 반영 지연 등), 12·140: 쿠폰 부담 차이
      if (i !== 33) account.push({ ...h, amount: i === 90 ? h.amount + 1000 : h.amount }); // 33: 회계 누락, 90: 입력 오차
    });
    account.push({ order: '20990101-EXTRA', channel: '11번가', amount: 158000, date: end }); // 회계에만 있는 건
    return { hub, platform, account };
  }

  const srcName = (k) => SRC.find((s) => s[0] === k)[1].split(' ')[0];

  // 같은 주문번호가 한 자료에 여러 행이면: 기본은 '중복'으로 표시(마지막 행으로 덮지 않음),
  // 상품별 행 자료라고 사용자가 확인하면(dupSum) 금액을 합산한다. 행 금액이 주문 총액의 반복일 수도 있어 자동 합산하지 않는다.
  // 대사 키는 주문번호만 쓴다 — 자료마다 채널 표기가 달라(예: '스마트스토어' vs '네이버 스마트스토어') 채널을 키에 넣으면 같은 주문이 갈라진다.
  function reconcile() {
    const maps = {}, dups = {};
    for (const [k] of SRC) {
      maps[k] = new Map(); dups[k] = 0;
      for (const r of files[k] || []) {
        const g = maps[k].get(r.order);
        if (!g) maps[k].set(r.order, { ...r, n: 1, bad: r.amount == null });
        else { g.n++; g.bad = g.bad || r.amount == null; g.amount = (g.amount ?? 0) + (r.amount ?? 0); if (g.n === 2) dups[k]++; }
      }
    }
    const loaded = SRC.filter(([k]) => files[k]).map(([k]) => k);
    const all = new Set(); for (const k of loaded) for (const o of maps[k].keys()) all.add(o);
    const out = [];
    for (const o of all) {
      const g = { hub: maps.hub.get(o), platform: maps.platform.get(o), account: maps.account.get(o) };
      const base = g.hub || g.platform || g.account;
      const present = loaded.filter((k) => g[k]);
      const missing = loaded.filter((k) => !g[k]).map(srcName);
      const badAmt = present.filter((k) => g[k].bad).map(srcName);
      const dup = dupSum ? [] : present.filter((k) => g[k].n > 1).map(srcName);
      const amts = present.filter((k) => !g[k].bad).map((k) => g[k].amount);
      // 누락 건은 빠진 금액 전체를 차이로 본다
      const spread = !amts.length ? 0 : missing.length ? Math.max(...amts) : Math.max(...amts) - Math.min(...amts);
      const probs = [...badAmt.map((m) => m + ' 금액 오류'), ...dup.map((m) => m + ' 중복 주문번호'), ...missing.map((m) => m + ' 누락')];
      if (!probs.length && spread > tol) probs.push('금액 불일치');
      const status = probs.length ? probs.join(', ') : '일치';
      const amt = (k) => (g[k] && !g[k].bad ? g[k].amount : null);
      out.push({ order: o, channel: base.channel, date: base.date, hub: amt('hub'), platform: amt('platform'), account: amt('account'), diff: spread, status, ok: status === '일치' });
    }
    out.dups = dups;
    return out;
  }

  MD.views.settlement = function (el) {
    tol = Math.max(0, Number(U.store.get('settleTol', 10)) || 0); dupSum = U.store.get('settleDupSum', false); // 백업 복원 뒤에도 저장된 값으로 (Codex 기능 L R2-01과 같은 문제)
    const loadedN = SRC.filter(([k]) => files[k]).length;
    el.innerHTML = `
      <div class="card">
        <div class="card-head"><h2>자료 올리기</h2><button class="btn small" id="sSample">예시 자료로 해보기</button></div>
        <div class="grid g3">${SRC.map(([k, l]) => `<div class="drop" data-k="${k}"><b>${l}</b><br><span class="muted">${files[k] ? `${U.num(files[k].length)}건 불러옴` : 'CSV·엑셀 파일을 끌어다 놓거나 선택'}</span><br><input type="file" accept=".csv,.xlsx,.xls" data-f="${k}" style="margin-top:8px;max-width:100%"></div>`).join('')}</div>
        <div class="note">필요한 열: 주문번호, 채널(쇼핑몰), 금액. 열 이름은 “상품주문번호·결제금액·쇼핑몰명” 같은 흔한 이름을 자동 인식합니다. 두 개 이상 올리면 대사가 시작됩니다.</div>
        <div class="row" style="margin-top:8px"><label>금액 허용 오차 <input type="number" id="sTol" min="0" value="${tol}" style="width:90px"> 원</label></div>
      </div>
      <div id="sResult"></div>`;

    const loadFile = async (k, f) => {
      try { files[k] = normalize(await U.readTable(f)); if (!files[k].length) U.toast('주문번호 열을 찾지 못했습니다.', 'bad'); MD.rerender(); }
      catch (e) { U.toast('읽기 실패: ' + e.message, 'bad'); }
    };
    el.querySelectorAll('[data-f]').forEach((i) => (i.onchange = (e) => e.target.files[0] && loadFile(i.dataset.f, e.target.files[0])));
    el.querySelectorAll('.drop').forEach((z) => {
      z.ondragover = (e) => { e.preventDefault(); z.classList.add('over'); };
      z.ondragleave = () => z.classList.remove('over');
      z.ondrop = (e) => { e.preventDefault(); z.classList.remove('over'); const f = e.dataTransfer.files[0]; if (f) loadFile(z.dataset.k, f); };
    });
    el.querySelector('#sSample').onclick = () => {
      if (!MD.data.maxDate) { U.toast('예시 대사 자료는 판매 데이터에서 만듭니다. 판매 데이터가 없습니다.', 'bad'); return; }
      files = sampleFiles(); MD.rerender();
    };
    // 허용 오차는 0 이상만 — 음수면 같은 금액도 불일치로 판정된다 (Codex 개선 6단계 R1-02)
    el.querySelector('#sTol').onchange = (e) => {
      const v = Number(e.target.value);
      if (!Number.isFinite(v) || v < 0) { U.toast('허용 오차는 0 이상의 금액으로 입력하세요.', 'bad'); e.target.value = tol; return; }
      tol = v; U.store.set('settleTol', tol); MD.rerender();
    };

    if (loadedN < 2) return;
    const res = reconcile();
    const issues = res.filter((r) => !r.ok);
    const byCh = [...U.groupBy(res, (r) => r.channel || '(채널 없음)').entries()].map(([ch, rs]) => ({
      channel: ch, n: rs.length, issues: rs.filter((r) => !r.ok).length,
      hub: rs.reduce((a, r) => a + (r.hub || 0), 0), platform: rs.reduce((a, r) => a + (r.platform || 0), 0), account: rs.reduce((a, r) => a + (r.account || 0), 0),
    })).map((r) => ({ ...r, gapP: r.platform - r.hub, gapA: r.account - r.hub }));

    const dupTotal = Object.values(res.dups).reduce((a, b) => a + b, 0);
    const dupNote = dupTotal || dupSum ? `<div class="card" style="margin-top:16px"><ul class="insights"><li class="warn">
        같은 주문번호가 여러 행인 주문: ${SRC.filter(([k]) => res.dups[k]).map(([k]) => `${srcName(k)} ${res.dups[k]}건`).join(', ') || '없음'}.
        상품별로 행이 나뉜 자료라면 합산해야 맞고, 행마다 주문 총액이 반복된 자료라면 합산하면 안 됩니다. 원본 자료를 확인한 뒤 선택하세요.
        <label style="display:block;margin-top:6px"><input type="checkbox" id="dupSum" ${dupSum ? 'checked' : ''}> 같은 주문번호 행의 금액을 합산 (상품별 행 자료)</label>
      </li></ul></div>` : '';
    const box = el.querySelector('#sResult');
    box.innerHTML = `${dupNote}
      <div class="grid g4" style="margin-top:16px">
        <div class="kpi"><div class="k">대사 주문 수</div><div class="v">${U.num(res.length)}</div></div>
        <div class="kpi"><div class="k">일치</div><div class="v">${U.num(res.length - issues.length)}</div><div class="s">${U.pct((res.length - issues.length) / (res.length || 1))}</div></div>
        <div class="kpi"><div class="k">확인 필요</div><div class="v" style="color:var(${issues.length ? '--bad' : '--good'})">${U.num(issues.length)}건</div><div class="s">${[...new Set(issues.map((i) => i.status))].join(' · ') || '없음'}</div></div>
        <div class="kpi"><div class="k">차이 금액 합계</div><div class="v">${U.won(issues.reduce((a, r) => a + r.diff, 0))}</div><div class="s">누락 건은 해당 주문 금액</div></div>
      </div>
      <div class="card" style="margin-top:16px"><div class="card-head"><h2>채널별 합계 대조</h2></div><div id="tC"></div></div>
      <div class="card"><div class="card-head"><h2>주문별 대사 결과</h2><label><input type="checkbox" id="only" ${onlyIssues ? 'checked' : ''}> 확인 필요 건만</label></div><div id="tO"></div></div>`;

    MD.table(box.querySelector('#tC'), {
      cols: [
        { key: 'channel', label: '채널' }, { key: 'n', label: '주문', num: true, fmt: (v) => U.num(v) },
        { key: 'hub', label: '통합관리', num: true, fmt: (v) => U.won(v) }, { key: 'platform', label: '플랫폼', num: true, fmt: (v) => U.won(v) }, { key: 'account', label: '회계', num: true, fmt: (v) => U.won(v) },
        { key: 'gapP', label: '플랫폼−통합', num: true, html: true, fmt: (v) => `<span class="delta ${Math.abs(v) > tol ? 'bad' : 'flat'}">${U.won(v)}</span>`, xfmt: (v) => v },
        { key: 'gapA', label: '회계−통합', num: true, html: true, fmt: (v) => `<span class="delta ${Math.abs(v) > tol ? 'bad' : 'flat'}">${U.won(v)}</span>`, xfmt: (v) => v },
        { key: 'issues', label: '확인 필요', num: true, html: true, fmt: (v) => (v ? `<span class="tag bad">${v}건</span>` : '<span class="tag good">0</span>'), xfmt: (v) => v },
      ],
      rows: byCh, sortKey: 'issues', exportName: '정산대사_채널합계',
    });
    const draw = () => MD.table(box.querySelector('#tO'), {
      cols: [
        { key: 'status', label: '상태', html: true, fmt: (v, r) => `<span class="tag ${r.ok ? 'good' : 'bad'}">${U.esc(v)}</span>`, xfmt: (v) => v },
        { key: 'order', label: '주문번호' }, { key: 'channel', label: '채널' }, { key: 'date', label: '주문일' },
        { key: 'hub', label: '통합관리', num: true, fmt: (v) => (v == null ? '—' : U.won(v)), xfmt: (v) => v },
        { key: 'platform', label: '플랫폼', num: true, fmt: (v) => (v == null ? '—' : U.won(v)), xfmt: (v) => v },
        { key: 'account', label: '회계', num: true, fmt: (v) => (v == null ? '—' : U.won(v)), xfmt: (v) => v },
        { key: 'diff', label: '차이', num: true, fmt: (v) => (v ? U.won(v) : '-'), xfmt: (v) => v },
      ],
      rows: onlyIssues ? issues : res, sortKey: 'diff', exportName: onlyIssues ? '정산대사_확인필요' : '정산대사_전체', maxRows: 300,
    });
    draw();
    box.querySelector('#only').onchange = (e) => { onlyIssues = e.target.checked; draw(); };
    const ds = box.querySelector('#dupSum');
    if (ds) ds.onchange = (e) => { dupSum = e.target.checked; U.store.set('settleDupSum', dupSum); MD.rerender(); };
  };
})();
