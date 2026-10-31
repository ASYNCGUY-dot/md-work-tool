// 광고 성과: 플랫폼 광고 리포트(광고비·광고 매출)로 광고 ROAS를 보고, 자료에 열이 더 있으면 분석을 더 보여 준다
//  - 광고비 + 광고 매출          → 광고 ROAS, 광고 매출 비중(광고 매출 ÷ 전체 매출), 일별 추이, 채널별 비교
//  - + 노출 / + 클릭             → CPM, CTR(클릭 ÷ 노출), CPC(광고비 ÷ 클릭)
//  - + 전환수                    → 클릭 전환율(전환 ÷ 클릭), CPA(광고비 ÷ 전환), 전환당 광고 매출
//  - + 캠페인                    → 캠페인별 표와 ROAS 기준 미달 캠페인
// 지표는 그 지표에 필요한 값이 모두 있는 행만으로 계산하고, 빠진 행이 있으면 몇 행을 뺐는지 밝힌다
(function () {
  const U = MD.util, C = MD.calc;
  let chFilter = '';

  // 행 묶음 → 지표. need: 지표마다 필요한 항목이 빠진 행은 그 지표에서만 뺀다
  function metrics(rows) {
    const has = (r, f) => r[f] != null && !(r.miss || []).includes(f);
    const sum = (list, f) => list.reduce((a, r) => a + (r[f] || 0), 0);
    const z = { rows: rows.length, spend: sum(rows, 'spend') };
    const rv = rows.filter((r) => has(r, 'revenue'));
    z.revRows = rv.length; z.revenue = sum(rv, 'revenue'); z.roas = sum(rv, 'spend') ? z.revenue / sum(rv, 'spend') : null;
    const im = rows.filter((r) => has(r, 'imp'));
    z.impRows = im.length; z.imp = sum(im, 'imp'); z.cpm = z.imp ? (sum(im, 'spend') / z.imp) * 1000 : null;
    const ck = rows.filter((r) => has(r, 'clicks'));
    z.clickRows = ck.length; z.clicks = sum(ck, 'clicks'); z.cpc = z.clicks ? sum(ck, 'spend') / z.clicks : null;
    const ic = rows.filter((r) => has(r, 'imp') && has(r, 'clicks'));
    z.ctr = sum(ic, 'imp') ? sum(ic, 'clicks') / sum(ic, 'imp') : null;
    const cv = rows.filter((r) => has(r, 'conv'));
    z.convRows = cv.length; z.conv = sum(cv, 'conv'); z.cpa = z.conv ? sum(cv, 'spend') / z.conv : null;
    const cc = rows.filter((r) => has(r, 'clicks') && has(r, 'conv'));
    z.ccvr = sum(cc, 'clicks') ? sum(cc, 'conv') / sum(cc, 'clicks') : null;
    const rc = rows.filter((r) => has(r, 'revenue') && has(r, 'conv'));
    z.rpc = sum(rc, 'conv') ? sum(rc, 'revenue') / sum(rc, 'conv') : null;
    return z;
  }

  MD.views.ads = function (el) {
    const d = MD.data, st = MD.state;
    if (!d.ads.length) {
      el.innerHTML = `<div class="card"><div class="card-head"><h2>광고 성과</h2></div>
        <p>플랫폼 광고 리포트를 올리면 광고 ROAS(광고 매출 ÷ 광고비)를 계산합니다. 노출·클릭·전환수·캠페인 열이 있으면 CTR·CPC·CPA·캠페인별 분석이 자동으로 추가됩니다.</p>
        <a class="btn primary" href="#data">데이터 관리에서 광고 리포트 올리기</a></div>`;
      return;
    }
    const [cs, ce] = C.compareRange(st.start, st.end, st.cmp);
    const pick = (list) => (chFilter ? list.filter((r) => r.channel === chFilter) : list);
    const cur = pick(C.inRange(d.ads, st.start, st.end)), prev = pick(C.inRange(d.ads, cs, ce));
    const a = metrics(cur), b = metrics(prev);
    const allSales = pick(C.inRange(d.sales, st.start, st.end)).reduce((x, r) => x + r.sales, 0);
    // 어떤 항목이 들어왔는지 — 이 범위 자료 기준
    const avail = { revenue: a.revRows > 0, imp: a.impRows > 0, clicks: a.clickRows > 0, conv: a.convRows > 0, campaign: cur.some((r) => r.campaign) };
    const partial = (n, label) => (n && n < a.rows ? ` <span class="tag hold" title="이 항목이 빈 행은 이 지표에서 뺐습니다">${label} 빈 행 ${a.rows - n}개 제외</span>` : '');
    const tile = (k, v, sub) => `<div class="kpi"><div class="k">${k}</div><div class="v">${v}</div><div class="s">${sub || ''}</div></div>`;
    const dl = (x, y, inv) => U.deltaHtml(U.delta(x, y), inv);
    const chs = [...new Set(d.ads.map((r) => r.channel))];
    const known = new Set(d.channels.map((c) => c.name));
    const unconf = chs.filter((c) => { const cl = C.closeOf(c, 'ads'); return !cl || cl < st.end; });

    const tiles = [
      tile('광고비', U.krw(a.spend) + '원', `${dl(a.spend, b.spend, true)} ${MD.cmpLabel()} ${U.krw(b.spend)}`),
      avail.revenue ? tile('광고 매출', U.krw(a.revenue) + '원', `${dl(a.revenue, b.revenue)}${partial(a.revRows, '광고 매출')}`) : '',
      avail.revenue ? tile('광고 ROAS', a.roas == null ? '-' : U.pct(a.roas, 0), `${MD.cmpLabel()} ${b.roas == null ? '-' : U.pct(b.roas, 0)} · 기준 ${U.pct(MD.settings.roasMin, 0)}`) : '',
      avail.revenue && allSales ? tile('광고 매출 비중', U.pct(a.revenue / allSales), `전체 매출 ${U.krw(allSales)}원 중 · 플랫폼 기여 기준이 달라 100%를 넘을 수 있음`) : '',
      avail.imp ? tile('노출 · CPM', U.num(a.imp), `CPM ${a.cpm == null ? '-' : U.won(a.cpm)}${partial(a.impRows, '노출')}`) : '',
      avail.clicks ? tile('클릭 · CTR', U.num(a.clicks), `CTR ${a.ctr == null ? '-' : U.pct(a.ctr, 2)} · CPC ${a.cpc == null ? '-' : U.won(a.cpc)}${partial(a.clickRows, '클릭')}`) : '',
      avail.conv ? tile('전환 · CPA', U.num(a.conv), `CPA ${a.cpa == null ? '-' : U.won(a.cpa)} · 클릭 전환율 ${a.ccvr == null ? '-' : U.pct(a.ccvr, 2)}${partial(a.convRows, '전환')}`) : '',
    ].filter(Boolean);
    // 아직 열리지 않은 분석: 어떤 열을 넣으면 무엇이 보이는지
    const locked = [
      !avail.revenue && ['광고 매출(전환 매출)', '광고 ROAS·광고 매출 비중'],
      !avail.imp && ['노출', 'CPM·CTR'],
      !avail.clicks && ['클릭', 'CTR·CPC·클릭 전환율'],
      !avail.conv && ['전환수', 'CPA·클릭 전환율·전환당 매출'],
      !avail.campaign && ['캠페인', '캠페인별 성과와 효율 낮은 캠페인'],
    ].filter(Boolean);

    el.innerHTML = `
      <div class="row" style="margin-bottom:12px">
        <select id="adCh"><option value="">전체 채널</option>${chs.map((c) => `<option ${c === chFilter ? 'selected' : ''}>${U.esc(c)}</option>`).join('')}</select>
        <span class="muted">${st.start} ~ ${st.end} · 비교 ${cs} ~ ${ce} · 광고 리포트 기준(플랫폼 귀속 매출)</span>
        ${unconf.length ? `<a class="badge bad" href="#data" title="데이터 관리 → 자료 마감 확인">광고 리포트 마감 미확인 ${unconf.length}개 채널</a>` : ''}
      </div>
      <div class="kpis">${tiles.join('')}</div>
      ${locked.length ? `<div class="card" style="margin-top:16px"><div class="card-head"><h2>자료를 더 넣으면 보이는 분석</h2><span class="muted">광고 리포트에 아래 열을 추가해 다시 올리세요 (같은 일자·채널·캠페인은 덮어씀)</span></div>
        <ul class="checklist">${locked.map(([col, what]) => `<li><b>${col}</b> 열 → ${what}</li>`).join('')}</ul></div>` : ''}
      <div class="grid g3" style="margin-top:16px">
        <div class="card span2"><div class="card-head"><h2>일별 광고비 ${avail.revenue ? '· 광고 매출' : ''}</h2></div>
          ${MD.legend([{ label: '광고비', color: MD.colorOf(1) }, ...(avail.revenue ? [{ label: '광고 매출', color: MD.colorOf(0) }] : [])])}
          <div class="chart-box"><canvas id="adTrend"></canvas></div></div>
        <div class="card"><div class="card-head"><h2>점검할 곳</h2></div><ul class="insights" id="adIns"></ul></div>
      </div>
      <div class="card"><div class="card-head"><h2>채널별</h2></div><div id="adChT"></div></div>
      ${avail.campaign ? '<div class="card"><div class="card-head"><h2>캠페인별</h2><span class="muted">광고비 큰 순</span></div><div id="adCpT"></div></div>' : ''}
      <div class="note">광고 ROAS는 플랫폼이 광고에 귀속한 매출 기준이라 플랫폼마다 귀속 기간·방식이 다릅니다. 채널 간 비교는 같은 기준끼리만 하세요. 유입 파일의 광고비와 광고 리포트의 광고비가 다르면 대시보드의 '매출÷광고비'와 이 화면의 값이 다를 수 있습니다.</div>`;

    el.querySelector('#adCh').onchange = (e) => { chFilter = e.target.value; MD.rerender(); };

    // 일별 추이
    const days = U.dateRange(st.start, st.end);
    const by = (f) => { const m = new Map(); for (const r of cur) if (f === 'spend' || !(r.miss || []).includes(f)) m.set(r.date, (m.get(r.date) || 0) + (r[f] || 0)); return days.map((x) => m.get(x) || 0); };
    MD.charts.line(el.querySelector('#adTrend'), days.map((x) => x.slice(5).replace('-', '/')), [
      { label: '광고비', data: by('spend'), color: MD.colorOf(1) },
      ...(avail.revenue ? [{ label: '광고 매출', data: by('revenue'), color: MD.colorOf(0) }] : []),
    ], U.krw);

    // 채널·캠페인 표: 들어온 항목의 열만 보여 준다
    const cols = (first) => [first,
      { key: 'spend', label: '광고비', num: true, money: true, fmt: (v) => U.krw(v), xfmt: (v) => Math.round(v) },
      ...(avail.revenue ? [{ key: 'revenue', label: '광고 매출', num: true, money: true, fmt: (v) => U.krw(v), xfmt: (v) => Math.round(v) },
        { key: 'roas', label: '광고 ROAS', num: true, html: true, fmt: (v) => (v == null ? '-' : `<span class="delta ${v < MD.settings.roasMin ? 'bad' : ''}">${U.pct(v, 0)}</span>`), xfmt: (v) => v },
        { key: 'dRoas', label: 'ROAS 변화', num: true, fmt: (v) => (v == null ? '-' : `${v >= 0 ? '+' : ''}${(v * 100).toFixed(0)}%p`), xfmt: (v) => v }] : []),
      ...(avail.imp ? [{ key: 'imp', label: '노출', num: true, fmt: (v) => U.num(v) }] : []),
      ...(avail.clicks ? [{ key: 'clicks', label: '클릭', num: true, fmt: (v) => U.num(v) }, { key: 'ctr', label: 'CTR', num: true, fmt: (v) => (v == null ? '-' : U.pct(v, 2)), xfmt: (v) => v }, { key: 'cpc', label: 'CPC', num: true, fmt: (v) => (v == null ? '-' : U.won(v)), xfmt: (v) => v }] : []),
      ...(avail.conv ? [{ key: 'conv', label: '전환', num: true, fmt: (v) => U.num(v) }, { key: 'cpa', label: 'CPA', num: true, fmt: (v) => (v == null ? '-' : U.won(v)), xfmt: (v) => v }] : []),
    ];
    const group = (list, keyFn) => { const m = U.groupBy(list, keyFn); return m; };
    const prevBy = (keyFn) => { const m = new Map(); for (const [k, rs] of group(prev, keyFn)) m.set(k, metrics(rs)); return m; };
    const pc = prevBy((r) => r.channel);
    const chRows = [...group(cur, (r) => r.channel).entries()].map(([k, rs]) => { const z = metrics(rs), p = pc.get(k); return { name: k, ...z, dRoas: z.roas != null && p && p.roas != null ? z.roas - p.roas : null }; });
    MD.table(el.querySelector('#adChT'), {
      cols: cols({ key: 'name', label: '채널', html: true, fmt: (v) => (known.has(v) ? `<a href="#channels" data-ch="${U.esc(v)}">${U.esc(v)}</a>` : `${U.esc(v)} <span class="tag warn">채널 목록에 없음</span>`), xfmt: (v) => v }),
      rows: chRows, sortKey: 'spend', exportName: `광고성과_채널_${st.start}_${st.end}`,
    });
    el.querySelector('#adChT').addEventListener('click', (e) => { const x = e.target.closest('a[data-ch]'); if (x) { e.preventDefault(); MD.focusChannel(x.dataset.ch); } });
    let cpRows = [];
    if (avail.campaign) {
      const pp = prevBy((r) => r.channel + '|' + (r.campaign || '(캠페인 없음)'));
      cpRows = [...group(cur, (r) => r.channel + '|' + (r.campaign || '(캠페인 없음)')).entries()].map(([k, rs]) => { const z = metrics(rs), p = pp.get(k); const [ch, cp] = k.split('|'); return { name: cp, channel: ch, ...z, dRoas: z.roas != null && p && p.roas != null ? z.roas - p.roas : null }; });
      MD.table(el.querySelector('#adCpT'), {
        cols: [{ key: 'channel', label: '채널' }, ...cols({ key: 'name', label: '캠페인' })],
        rows: cpRows, sortKey: 'spend', exportName: `광고성과_캠페인_${st.start}_${st.end}`, maxRows: 100,
      });
    }

    // 점검할 곳: 숫자로 확인되는 것만
    const ins = [];
    const lowCh = chRows.filter((r) => r.roas != null && r.roas < MD.settings.roasMin).sort((x, y) => y.spend - x.spend);
    if (lowCh.length) ins.push(['warn', `광고 ROAS 기준(${U.pct(MD.settings.roasMin, 0)}) 미달 채널: ${lowCh.slice(0, 3).map((r) => `<b>${U.esc(r.name)}</b> ${U.pct(r.roas, 0)}`).join(', ')}`]);
    const lowCp = cpRows.filter((r) => r.roas != null && r.roas < MD.settings.roasMin).sort((x, y) => y.spend - x.spend);
    if (lowCp.length) ins.push(['warn', `기준 미달 캠페인 광고비 ${U.krw(lowCp.reduce((x, r) => x + r.spend, 0))}원 (${lowCp.length}개) — 상위: ${lowCp.slice(0, 2).map((r) => `${U.esc(r.channel)} ${U.esc(r.name)} ${U.pct(r.roas, 0)}`).join(', ')}`]);
    const drop = chRows.filter((r) => r.dRoas != null && r.dRoas <= -0.5).sort((x, y) => x.dRoas - y.dRoas);
    if (drop.length) ins.push(['bad', `ROAS가 ${MD.cmpLabel()}보다 50%p 이상 떨어진 채널: ${drop.slice(0, 3).map((r) => `<b>${U.esc(r.name)}</b> ${(r.dRoas * 100).toFixed(0)}%p`).join(', ')}`]);
    if (avail.clicks && a.ctr != null && b.ctr != null && a.ctr < b.ctr * 0.8) ins.push(['warn', `CTR ${U.pct(a.ctr, 2)} — ${MD.cmpLabel()} ${U.pct(b.ctr, 2)}보다 20% 이상 낮음: 소재·노출 위치 점검`]);
    if (avail.conv && a.cpa != null && b.cpa != null && a.cpa > b.cpa * 1.2) ins.push(['warn', `CPA ${U.won(a.cpa)} — ${MD.cmpLabel()} ${U.won(b.cpa)}보다 20% 이상 높음: 상세페이지·가격·재고 점검`]);
    const unk = chs.filter((c) => !known.has(c));
    if (unk.length) ins.push(['warn', `채널 목록에 없는 광고 채널 ${unk.length}개(${unk.slice(0, 3).map(U.esc).join(', ')}) — 판매 채널 이름과 맞춰야 채널 목표에 반영됩니다`]);
    el.querySelector('#adIns').innerHTML = (ins.length ? ins : [['good', '기준 미달·급락 항목이 없습니다.']]).map(([k, t]) => `<li class="${k}">${t}</li>`).join('');
  };
})();
