// 채널·유입·전환 분석
(function () {
  const U = MD.util, C = MD.calc;
  let selected = null;
  // 다른 화면에서 채널 이름을 누르면 그 채널을 골라 이 화면으로 온다 (기간·비교 기준은 유지)
  MD.focusChannel = (name) => { selected = name; if (location.hash === '#channels') MD.rerender(); else location.hash = '#channels'; };
  let metric = 'sales';

  const METRICS = {
    sales: { label: '매출', fmt: U.krw, val: (z) => z.sales },
    gross: { label: '매출총이익', fmt: U.krw, val: (z) => z.gross },
    visits: { label: '유입', fmt: (v) => U.num(v), val: (z) => z.visits },
    cvr: { label: '전환율', fmt: (v) => U.pct(v, 2), val: (z) => z.cvr },
    roas: { label: '광고 ROAS', fmt: (v) => U.pct(v, 0), val: (z) => z.roas },
    aov: { label: '객단가', fmt: U.won, val: (z) => z.aov },
  };

  MD.views.channels = function (el) {
    const chs = MD.data.channels.map((c) => c.name);
    if (selected && !chs.includes(selected)) selected = null;
    const filter = selected ? { sale: (r) => r.channel === selected, traffic: (t) => t.channel === selected } : null;
    const { cur, prev, cs } = MD.current(filter);
    const st = MD.state;
    const s = cur.sum, p = prev.sum;

    el.innerHTML = `
      <div class="row" style="margin-bottom:14px">
        <select id="chSel"><option value="">전체 채널</option>${chs.map((c) => `<option ${c === selected ? 'selected' : ''}>${U.esc(c)}</option>`).join('')}</select>
        <span class="muted">채널을 고르면 그 채널만의 유입→주문 흐름과 지표 추이를 봅니다.</span>
      </div>
      <div class="grid g4">
        ${[
          ['유입', U.num(s.visits), U.deltaHtml(U.delta(s.visits, p.visits))],
          ['주문', U.num(s.orders), U.deltaHtml(U.delta(s.orders, p.orders))],
          ['전환율 (주문÷유입)', U.pct(s.cvr, 2), `${MD.cmpLabel()} ${U.pct(p.cvr, 2)}`],
          ['광고 ROAS (광고 매출÷광고비)', s.roas == null ? '-' : U.pct(s.roas, 0), s.adRows ? `광고비(리포트) ${U.krw(s.adSpend)}` : '광고 리포트 없음'],
        ].map(([k, v, sub]) => `<div class="kpi"><div class="k">${k}</div><div class="v">${v}</div><div class="s">${sub}</div></div>`).join('')}
      </div>
      <div class="card" style="margin-top:16px">
        <div class="card-head"><h2>지표 추이</h2>
          <div class="seg" id="mSeg">${Object.entries(METRICS).map(([k, m]) => `<button data-m="${k}" class="${k === metric ? 'on' : ''}">${m.label}</button>`).join('')}</div>
        </div>
        ${MD.legend([{ label: '이번 기간', color: MD.colorOf(0) }, { label: MD.cmpLabel(), color: 'var(--compare)', dashed: true }])}
        <div class="chart-box"><canvas id="cM"></canvas></div>
        <div class="note">전환율·ROAS·객단가는 일별 값을 그대로 이으므로 하루 단위 변동이 큽니다. 판단은 기간 합계 기준 표를 우선하세요.</div>
      </div>
      <div class="card"><div class="card-head"><h2>채널별 유입·전환·광고 효율</h2><span class="muted">ROAS 기준 ${U.pct(MD.settings.roasMin, 0)} · 변경은 데이터 관리</span></div><div id="tFun"></div></div>
      <div class="card"><div class="card-head"><h2>채널 진단</h2></div><ul class="insights" id="diag"></ul></div>`;

    el.querySelector('#chSel').onchange = (e) => { selected = e.target.value || null; MD.rerender(); };
    el.querySelectorAll('#mSeg button').forEach((b) => (b.onclick = () => { metric = b.dataset.m; MD.rerender(); }));

    // 일별 지표 계산
    const days = U.dateRange(st.start, st.end);
    const daySum = (sales, traffic, ads, d0) => {
      const sg = U.groupBy(sales, (r) => r.date), tg = U.groupBy(traffic, (t) => t.date), ag = U.groupBy(ads, (a) => a.date);
      return (i) => { const d = U.addDays(d0, i); return C.summarize(sg.get(d) || [], tg.get(d) || [], ag.get(d) || []); };
    };
    const fa = daySum(cur.sales, cur.traffic, cur.ads, st.start), fb = daySum(prev.sales, prev.traffic, prev.ads, cs);
    const M = METRICS[metric];
    const labels = days.map((d) => d.slice(5).replace('-', '/'));
    MD.charts.line(el.querySelector('#cM'), labels, [
      { label: '이번 기간', data: days.map((_, i) => M.val(fa(i))), color: MD.colorOf(0) },
      { label: MD.cmpLabel(), data: days.map((_, i) => M.val(fb(i))), color: getComputedStyle(document.documentElement).getPropertyValue('--compare').trim(), dashed: true },
    ], M.fmt);

    const all = MD.current();
    const rows = MD.channelRows(all.cur, all.prev);
    const pp = (a, b) => (a == null || b == null ? '<span class="delta flat">-</span>' : `<span class="delta ${a >= b ? 'good' : 'bad'}">${a >= b ? '+' : ''}${((a - b) * 100).toFixed(2)}%p</span>`);
    MD.table(el.querySelector('#tFun'), {
      cols: [
        { key: 'channel', label: '채널' }, { key: 'type', label: '유형' },
        MD.cols.visits, MD.cols.orders, MD.cols.cvr,
        { key: 'dCvr', label: '전환율 변화', num: true, html: true, fmt: (v, r) => pp(r.cvr, r.prevCvr), xfmt: (v, r) => (r.cvr != null && r.prevCvr != null ? r.cvr - r.prevCvr : '') },
        MD.cols.aov, MD.cols.sales, MD.cols.ad, MD.cols.roas,
        { key: 'contrib', label: '공헌이익', num: true, money: true, fmt: (v) => U.krw(v), xfmt: (v) => Math.round(v) },
      ],
      rows: rows.map((r) => ({ ...r, dCvr: r.cvr != null && r.prevCvr != null ? r.cvr - r.prevCvr : null })),
      sortKey: 'sales', exportName: `채널_유입전환_${st.start}_${st.end}`,
    });

    // 진단 규칙: 매출 변동을 유입·전환율·객단가로 분해 (매출 ≈ 유입 × 전환율 × 객단가)
    const diag = [];
    for (const r of rows) {
      if (!r.prevSales || !r.sales) continue;
      const parts = [];
      const dv = U.delta(r.visits, r.prevVisits), dc = U.delta(r.cvr, r.prevCvr), da = U.delta(r.aov, r.prevAov);
      if (r.dSales == null || Math.abs(r.dSales) < 0.1) continue;
      const comp = [['유입', dv], ['전환율', dc], ['객단가', da]].filter((x) => x[1] != null).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
      if (!comp.length) continue;
      parts.push(`주요 요인은 <b>${comp[0][0]}</b> ${U.deltaHtml(comp[0][1])}`);
      const hint = r.dSales < 0
        ? comp[0][0] === '유입' ? '노출·광고·검색 순위 점검' : comp[0][0] === '전환율' ? '가격 경쟁력·상세페이지·리뷰 점검' : '고단가 상품 노출 축소 여부 확인'
        : comp[0][0] === '유입' ? '유입 증가 요인(기획전·광고)을 다른 채널에 적용 검토' : '전환 개선 요인 정리';
      diag.push({ kind: r.dSales < 0 ? 'bad' : 'good', text: `<b>${U.esc(r.channel)}</b> 매출 ${U.deltaHtml(r.dSales)} — ${parts.join(', ')} → ${hint}`, abs: Math.abs(r.diff) });
    }
    diag.sort((a, b) => b.abs - a.abs);
    el.querySelector('#diag').innerHTML = diag.slice(0, 6).map((d) => `<li class="${d.kind}">${d.text}</li>`).join('') || '<li>10% 이상 변동한 채널이 없습니다.</li>';
  };
})();
