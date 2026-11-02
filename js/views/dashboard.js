// 매출 대시보드 + 자동 인사이트 (보고서 화면과 공유)
(function () {
  const U = MD.util, C = MD.calc;

  MD.settings = {
    get roasMin() { return Number(U.store.get('roasMin', 3)); },
    get coverDays() { return Number(U.store.get('coverDays', 14)); },
  };

  // 채널별 현재/비교 집계 행
  MD.channelRows = function (cur, prev) {
    const a = C.by(cur.sales, cur.traffic, (r) => r.channel, (t) => t.channel, cur.ads);
    const b = C.by(prev.sales, prev.traffic, (r) => r.channel, (t) => t.channel, prev.ads);
    const total = cur.sum.sales || 1;
    // 마스터에서 지운 채널도 실적이 있으면 '미등록'으로 남겨 전체 합계와 채널별 합계를 맞춘다 (수수료는 0으로 계산됨)
    const known = new Set(MD.data.channels.map((c) => c.name));
    const orphans = [...new Set([...a.keys(), ...b.keys()])].filter((n) => !known.has(n)).map((n) => ({ name: n, type: '미등록', orphan: true }));
    return [...MD.data.channels, ...orphans].map((c, i) => {
      const x = a.get(c.name) || C.summarize([], []), y = b.get(c.name) || C.summarize([], []);
      const target = c.orphan ? 0 : C.monthTarget(c.name, MD.state.start, MD.state.end);
      return { channel: c.orphan ? `${c.name} (미등록)` : c.name, type: c.type, idx: i, ...x, prevSales: y.sales, dSales: U.delta(x.sales, y.sales), diff: x.sales - y.sales, share: x.sales / total, target, achieve: target ? x.sales / target : null, prevMargin: y.margin, prevRoas: y.roas, prevCvr: y.cvr, prevVisits: y.visits, prevAov: y.aov };
    });
  };

  MD.productRows = function (cur, prev) {
    const a = C.by(cur.sales, [], (r) => r.sku), b = C.by(prev.sales, [], (r) => r.sku);
    const total = cur.sum.sales || 1;
    const known = new Set(MD.data.products.map((p) => p.sku));
    const orphans = [...new Set([...a.keys(), ...b.keys()])].filter((s) => !known.has(s)).map((s) => ({ sku: s, name: `${s} (미등록)`, brand: '', category: '미분류', stock: 0 }));
    return [...MD.data.products, ...orphans].map((p) => {
      const x = a.get(p.sku) || C.summarize([], []), y = b.get(p.sku) || C.summarize([], []);
      // 원가가 없으면(미등록·자동 등록 SKU) 이익이 매출 전액처럼 잡히므로 이익률을 표시하지 않는다
      const noCost = !(Number(p.cost) > 0);
      return { sku: p.sku, name: p.name, brand: p.brand, category: p.category, stock: p.stock, ...x, margin: noCost ? null : x.margin, noCost, prevSales: y.sales, prevQty: y.qty, dSales: U.delta(x.sales, y.sales), diff: x.sales - y.sales, share: x.sales / total };
    });
  };

  // 재고 소진 예상 (최근 28일 판매 속도 기준)
  MD.coverRows = function () {
    const d = MD.data, end = d.maxDate;
    // 판매 자료가 없으면 판매 속도를 알 수 없으므로 재고 일수는 계산 불가(null)로 둔다
    const recent = end ? C.inRange(d.sales, U.addDays(end, -27), end) : [];
    const q = new Map();
    for (const r of recent) q.set(r.sku, (q.get(r.sku) || 0) + r.qty);
    const inbound = new Map();
    for (const po of d.pos) if (po.status !== '입고완료' && po.status !== '취소') inbound.set(po.sku, (inbound.get(po.sku) || 0) + (Number(po.qty) - Number(po.received || 0)));
    return d.products.map((p) => {
      const daily = (q.get(p.sku) || 0) / 28;
      const cover = daily ? p.stock / daily : null;
      return { ...p, daily, cover, inbound: inbound.get(p.sku) || 0, stockout: cover != null ? U.addDays(end, Math.floor(cover)) : null };
    });
  };

  MD.insights = function (cur, prev) {
    const out = [];
    const s = cur.sum, p = prev.sum, lab = MD.cmpLabel();
    const target = C.monthTarget(null, MD.state.start, MD.state.end);
    const d = U.delta(s.sales, p.sales);
    out.push({
      kind: d == null ? '' : d >= 0 ? 'good' : 'bad',
      text: `기간 매출 <b>${U.krw(s.sales)}원</b>, ${lab} 대비 ${U.deltaHtml(d)}${target ? ` · 기간 목표 대비 <b>${U.pct(s.sales / target)}</b>` : ''}`,
      plain: `기간 매출 ${U.krw(s.sales)}원 (${lab} 대비 ${d == null ? '비교 불가' : (d >= 0 ? '+' : '') + (d * 100).toFixed(1) + '%'})${target ? `, 기간 목표 대비 ${U.pct(s.sales / target)}` : ''}`,
    });

    const ch = MD.channelRows(cur, prev).filter((r) => r.sales || r.prevSales || r.adRows); // 광고만 집행한 채널도 효율 경고 대상
    const up = [...ch].sort((a, b) => b.diff - a.diff)[0];
    const down = [...ch].sort((a, b) => a.diff - b.diff)[0];
    if (up && up.diff > 0) out.push({ kind: 'good', text: `증가 기여 1위 채널: <b>${U.esc(up.channel)}</b> ${U.krw(up.diff)}원 증가 (${U.deltaHtml(up.dSales)})`, plain: `증가 기여 1위: ${up.channel} +${U.krw(up.diff)}원` });
    if (down && down.diff < 0) out.push({ kind: 'bad', text: `감소 기여 1위 채널: <b>${U.esc(down.channel)}</b> ${U.krw(-down.diff)}원 감소 (${U.deltaHtml(down.dSales)}) — 원인 점검 필요`, plain: `감소 기여 1위: ${down.channel} -${U.krw(-down.diff)}원, 원인 점검 필요` });

    if (s.margin != null && p.margin != null && Math.abs(s.margin - p.margin) >= 0.01) {
      const dm = (s.margin - p.margin) * 100;
      out.push({ kind: dm > 0 ? 'good' : 'warn', text: `이익률 ${U.pct(s.margin)} (${lab} ${U.pct(p.margin)}, ${dm > 0 ? '+' : ''}${dm.toFixed(1)}%p)${dm < 0 ? ' — 할인·채널 믹스 확인' : ''}`, plain: `이익률 ${U.pct(s.margin)} (${dm > 0 ? '+' : ''}${dm.toFixed(1)}%p)` });
    }

    const lowRoas = ch.filter((r) => r.adSpend > 0 && r.roas != null && r.roas < MD.settings.roasMin).sort((a, b) => a.roas - b.roas);
    if (lowRoas.length) out.push({ kind: 'warn', text: `광고 ROAS 기준(${U.pct(MD.settings.roasMin, 0)}) 미달: ${lowRoas.slice(0, 3).map((r) => `<b>${U.esc(r.channel)}</b> ${U.pct(r.roas, 0)}`).join(', ')}`, plain: `광고 ROAS 기준 미달: ${lowRoas.slice(0, 3).map((r) => `${r.channel} ${U.pct(r.roas, 0)}`).join(', ')}` });

    const pr = MD.productRows(cur, prev).filter((r) => r.prevSales > 0 || r.sales > 0);
    const hot = pr.filter((r) => r.sales > s.sales * 0.01).sort((a, b) => b.diff - a.diff)[0];
    if (hot && hot.diff > 0) out.push({ kind: 'good', text: `상승 상품: <b>${U.esc(hot.name)}</b> ${U.krw(hot.diff)}원 증가 — 재고·추가 노출 검토`, plain: `상승 상품: ${hot.name} +${U.krw(hot.diff)}원` });

    const noCost = pr.filter((r) => r.noCost && r.sales > 0);
    if (noCost.length) out.push({ kind: 'warn', text: `원가 미입력 상품 ${noCost.length}개 매출 ${U.krw(noCost.reduce((a, r) => a + r.sales, 0))}원 — 이 매출은 원가 0으로 계산돼 이익이 실제보다 큽니다. 데이터 관리에서 원가를 입력하세요.`, plain: `원가 미입력 상품 ${noCost.length}개 (이익 과대 계산)` });

    const cover = MD.coverRows().filter((r) => r.cover != null && r.cover < MD.settings.coverDays && r.daily > 0).sort((a, b) => a.cover - b.cover);
    if (cover.length) out.push({ kind: 'warn', text: `재고 ${MD.settings.coverDays}일 내 소진 예상 ${cover.length}개: ${cover.slice(0, 3).map((r) => `<b>${U.esc(r.name)}</b>(${Math.floor(r.cover)}일)`).join(', ')}${cover.length > 3 ? ' 외' : ''}`, plain: `재고 소진 임박 ${cover.length}개 SKU (${cover.slice(0, 3).map((r) => r.name).join(', ')})` });
    return out;
  };

  MD.kpiTiles = function (cur, prev) {
    const s = cur.sum, p = prev.sum, lab = MD.cmpLabel();
    const target = C.monthTarget(null, MD.state.start, MD.state.end);
    const ach = target ? s.sales / target : null;
    const pp = (a, b) => (a == null || b == null ? '' : `${a - b >= 0 ? '+' : ''}${((a - b) * 100).toFixed(1)}%p`);
    const tiles = [
      { k: '매출 (VAT 포함)', exact: s.sales, v: U.krw(s.sales) + '원', sub: `${U.deltaHtml(U.delta(s.sales, p.sales))} ${lab} ${U.krw(p.sales)}` },
      { k: '기간 목표 대비', v: ach == null ? '-' : U.pct(ach), sub: `선택 기간에 배분된 목표 ${U.krw(target)} · <a href="#goals">월 목표 현황</a>`, bar: ach },
      { k: '매출총이익', exact: s.gross, v: U.krw(s.gross) + '원', sub: `${U.deltaHtml(U.delta(s.gross, p.gross))} 이익률 ${U.pct(s.margin)}` },
      { k: '이익률', v: U.pct(s.margin), sub: `${lab} ${U.pct(p.margin)} <b>${pp(s.margin, p.margin)}</b>` },
      { k: '광고 ROAS', v: s.roas == null ? '-' : U.pct(s.roas, 0), sub: s.adRows ? `광고 매출 ÷ 광고비 · 광고비 ${U.krw(s.adSpend)} ${U.deltaHtml(U.delta(s.adSpend, p.adSpend), true)} · <a href="#ads">광고 성과</a>` : '광고 리포트 없음 · <a href="#data">올리기</a>' },
      { k: '전환율', v: U.pct(s.cvr, 2), sub: `유입 ${U.num(s.visits)} · ${lab} ${U.pct(p.cvr, 2)}${MD.calc.cvrNote(s) ? `<br><span class="muted">${MD.calc.cvrNote(s)}</span>` : ''}` },
      { k: '주문 수', v: U.num(s.orders), sub: U.deltaHtml(U.delta(s.orders, p.orders)) },
      { k: '객단가', v: U.won(s.aov), sub: U.deltaHtml(U.delta(s.aov, p.aov)) },
    ];
    return `<div class="kpis">${tiles.map((t) => `<div class="kpi"><div class="k">${t.k}</div><div class="v"${t.exact != null ? ` title="${U.won(t.exact)}"` : ''}>${t.v}</div><div class="s">${t.sub}</div>${t.bar != null ? `<div class="bar-track"><div class="bar-fill" style="width:${Math.min(100, t.bar * 100)}%"></div></div>` : ''}</div>`).join('')}</div>`;
  };

  MD.views.dashboard = function (el) {
    const { cur, prev, cs, ce } = MD.current();
    const st = MD.state;
    el.innerHTML = `
      ${MD.setupBanner ? MD.setupBanner() : ''}
      <div class="row" style="margin-bottom:12px"><span class="muted">${st.start} ~ ${st.end} (${U.diffDays(st.start, st.end) + 1}일) · 비교 ${cs} ~ ${ce}</span></div>
      ${MD.kpiTiles(cur, prev)}
      <div class="grid g3" style="margin-top:16px">
        <div class="card span2">
          <div class="card-head"><h2>일별 매출 추이</h2><span class="muted" id="bucketNote"></span></div>
          ${MD.legend([{ label: '이번 기간', color: MD.colorOf(0) }, { label: MD.cmpLabel(), color: 'var(--compare)', dashed: true }])}
          <div class="chart-box"><canvas id="cTrend"></canvas></div>
        </div>
        <div class="card">
          <div class="card-head"><h2>핵심 요약</h2><a href="#report" class="btn small">보고서로</a></div>
          <ul class="insights">${MD.insights(cur, prev).map((i) => `<li class="${i.kind}">${i.text}</li>`).join('')}</ul>
        </div>
      </div>
      <div class="grid g2">
        <div class="card"><div class="card-head"><h2>채널별 매출</h2></div>
          ${MD.legend([{ label: '이번 기간', color: MD.colorOf(0) }, { label: MD.cmpLabel(), color: 'var(--compare)' }])}
          <div class="chart-box tall"><canvas id="cCh"></canvas></div></div>
        <div class="card"><div class="card-head"><h2>카테고리별 매출·이익률</h2></div><div id="tCat"></div></div>
      </div>
      <div class="card" style="margin-top:16px"><div class="card-head"><h2>채널 성과 비교</h2><a href="#channels" class="btn small">상세 분석</a></div><div id="tCh"></div></div>`;

    const ser = MD.dailySeries(cur.sales, prev.sales, st.start, st.end, cs);
    if (ser.bucket > 1) el.querySelector('#bucketNote').textContent = '주 단위 합계';
    MD.charts.line(el.querySelector('#cTrend'), ser.labels, [
      { label: '이번 기간', data: ser.cv, color: MD.colorOf(0) },
      { label: MD.cmpLabel(), data: ser.pv, color: getComputedStyle(document.documentElement).getPropertyValue('--compare').trim(), dashed: true },
    ], U.krw);

    const rows = MD.channelRows(cur, prev).sort((a, b) => b.sales - a.sales);
    MD.charts.bar(el.querySelector('#cCh'), rows.map((r) => r.channel), [
      { label: '이번 기간', data: rows.map((r) => r.sales), color: MD.colorOf(0) },
      { label: MD.cmpLabel(), data: rows.map((r) => r.prevSales), color: getComputedStyle(document.documentElement).getPropertyValue('--compare').trim() },
    ], U.krw, { horizontal: true });

    const cat = C.by(cur.sales, [], (r) => (MD.data.productMap[r.sku] || {}).category || '미분류');
    const catPrev = C.by(prev.sales, [], (r) => (MD.data.productMap[r.sku] || {}).category || '미분류');
    const catRows = [...cat.entries()].map(([k, v]) => ({ category: k, ...v, share: v.sales / (cur.sum.sales || 1), dSales: U.delta(v.sales, (catPrev.get(k) || {}).sales) }));
    MD.table(el.querySelector('#tCat'), {
      cols: [{ key: 'category', label: '카테고리' }, MD.cols.sales, MD.cols.share, MD.cols.dSales, MD.cols.margin, MD.cols.qty],
      rows: catRows, sortKey: 'sales',
    });

    const tot = { channel: '합계', ...cur.sum, dSales: U.delta(cur.sum.sales, prev.sum.sales), share: 1, target: C.monthTarget(null, st.start, st.end) };
    tot.achieve = tot.target ? tot.sales / tot.target : null;
    MD.table(el.querySelector('#tCh'), {
      cols: [
        { key: 'channel', label: '채널', html: true, fmt: (v, r) => (!MD.data.channelMap[v] ? U.esc(v) : `<a href="#channels" data-ch="${U.esc(v)}" title="채널 상세로">${U.esc(v)}</a>`), xfmt: (v) => v },
        MD.cols.sales, MD.cols.dSales, MD.cols.share,
        { key: 'achieve', label: '기간 목표 대비율', num: true, fmt: (v) => U.pct(v), xfmt: (v) => v },
        MD.cols.gross, MD.cols.margin, MD.cols.ad, MD.cols.roas, MD.cols.cvr,
      ],
      rows, total: tot, sortKey: 'sales', exportName: `채널성과_${st.start}_${st.end}`,
    });
    // 표를 다시 정렬해도 동작하도록 위임
    el.addEventListener('click', (e) => { const a = e.target.closest('a[data-ch]'); if (a) { e.preventDefault(); MD.focusChannel(a.dataset.ch); } });
  };
})();
