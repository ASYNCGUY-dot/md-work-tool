// 경쟁 상품 비교: 정기 조사한 경쟁 상품 가격(필수)·순위·리뷰·평점(선택)을 우리 상품 판매가·실판매가·매출 변화와 나란히 본다
//  - 우리 판매가 = 조사 자료의 '우리 판매가'가 있으면 그 값, 없으면 상품 마스터 판매가
//  - 실판매가 = 기간 매출 ÷ 수량 (할인·쿠폰이 반영된 평균 결제 단가)
//  - 가격 격차 = 우리 판매가 ÷ 경쟁 최저가 − 1 (양수면 우리가 비쌈)
//  - 경쟁가 변화 = 기간 안 마지막 조사가 ÷ 첫 조사가 − 1
(function () {
  const U = MD.util, C = MD.calc;
  let selSku = '';

  // 기간 안 조사 자료를 경쟁 상품별로 정리 (첫·마지막 조사값)
  function rivals(rows) {
    const g = U.groupBy(rows, (r) => JSON.stringify([r.sku, r.rival, r.channel || '']));
    return [...g.values()].map((rs) => {
      rs = [...rs].sort((a, b) => (a.date < b.date ? -1 : 1));
      const f = rs[0], l = rs[rs.length - 1];
      return { sku: l.sku, rival: l.rival, brand: l.rivalBrand || '', channel: l.channel || '', first: f, last: l, n: rs.length,
        price: l.price, dPrice: f.price ? l.price / f.price - 1 : null, rank: l.rank ?? null, dRank: l.rank != null && f.rank != null ? l.rank - f.rank : null,
        reviews: l.reviews ?? null, rating: l.rating ?? null, ourPrice: l.ourPrice ?? null };
    });
  }

  // 상품별 요약 + 신호 (매출 변동 분석에서도 쓴다)
  MD.competeSignals = function (s, e, cs, ce) {
    const d = MD.data;
    const ok = (r) => Number(r.price) > 0; // 0원 조사가는 격차 계산 불가 — 업로드에서도 거부
    const cur = C.inRange(d.compete, s, e).filter(ok), prev = C.inRange(d.compete, cs, ce).filter(ok);
    const rv = rivals(cur), rvPrev = new Map(rivals(prev).map((r) => [JSON.stringify([r.sku, r.rival, r.channel]), r]));
    const sales = C.by(C.inRange(d.sales, s, e), [], (r) => r.sku), salesP = C.by(C.inRange(d.sales, cs, ce), [], (r) => r.sku);
    const bySku = [...U.groupBy(rv, (r) => r.sku).entries()].map(([sku, rs]) => {
      const p = d.productMap[sku] || {}, a = sales.get(sku), b = salesP.get(sku);
      const ourList = rs.find((r) => r.ourPrice != null)?.ourPrice ?? (Number(p.price) || null);
      const minR = Math.min(...rs.map((r) => r.price)), avgR = rs.reduce((x, r) => x + r.price, 0) / rs.length;
      // 경쟁가 인하: 기간 안 첫 조사 대비 또는 비교 기간 마지막 조사 대비 중 더 크게 내린 쪽 (기간 시작 전에 내린 경우도 잡는다)
      const chg = (r) => { const q = rvPrev.get(JSON.stringify([r.sku, r.rival, r.channel])); const vp = q && q.price ? r.price / q.price - 1 : null; return [r.dPrice, vp].filter((x) => x != null); };
      const cut = rs.filter((r) => chg(r).some((x) => x <= -0.05));
      const vsPrev = rs.map((r) => { const q = rvPrev.get(JSON.stringify([r.sku, r.rival, r.channel])); return q ? r.price / q.price - 1 : null; }).filter((x) => x != null);
      return {
        sku, name: p.name || `${sku} (미등록)`, rivals: rs.length, ourPrice: ourList, minRival: minR, avgRival: avgR,
        gap: ourList ? ourList / minR - 1 : null, asp: a && a.qty ? a.sales / a.qty : null,
        sales: a ? a.sales : 0, prevSales: b ? b.sales : 0, dSales: U.delta(a ? a.sales : 0, b ? b.sales : 0),
        rivalCut: cut.length, rivalCutMax: cut.length ? Math.min(...cut.map((r) => Math.min(...chg(r)))) : null,
        rivalVsPrev: vsPrev.length ? vsPrev.reduce((x, v) => x + v, 0) / vsPrev.length : null,
        rankUp: rs.filter((r) => r.dRank != null && r.dRank < 0).length,
      };
    });
    return { rv, bySku, has: { rank: cur.some((r) => r.rank != null), reviews: cur.some((r) => r.reviews != null), rating: cur.some((r) => r.rating != null), ourPrice: cur.some((r) => r.ourPrice != null) } };
  };

  MD.views.compete = function (el) {
    const d = MD.data, st = MD.state;
    if (!d.compete.length) {
      el.innerHTML = `<div class="card"><div class="card-head"><h2>경쟁 상품 비교</h2></div>
        <p>경쟁 상품의 가격을 정기적으로 조사해 올리면(날짜·우리 SKU·경쟁 상품·경쟁가), 우리 판매가와의 격차, 경쟁가 인하와 우리 매출 변화를 함께 보여 줍니다. 순위·리뷰수·평점 열을 더 넣으면 순위 변화와 리뷰 격차도 봅니다.</p>
        <div class="row"><a class="btn primary" href="#data">데이터 관리에서 올리기</a><button class="btn" id="cpTpl">통합 양식 받기</button></div>
        <div class="note">같은 상품을 같은 요일에 주 1회 조사하면 변화 비교가 정확해집니다. 쿠폰·카드 할인 후 가격인지 정가인지 한 가지로 통일해 적으세요.</div></div>`;
      el.querySelector('#cpTpl').onclick = () => MD.downloadUnifiedTemplate && MD.downloadUnifiedTemplate();
      return;
    }
    const [cs, ce] = C.compareRange(st.start, st.end, st.cmp);
    const sig = MD.competeSignals(st.start, st.end, cs, ce);
    if (!sig.rv.length) {
      el.innerHTML = `<div class="card empty">선택한 기간(${st.start} ~ ${st.end})에 경쟁 조사 자료가 없습니다. 조사 자료 기간: ${d.compete[0].date} ~ ${d.compete[d.compete.length - 1].date}</div>`;
      return;
    }
    const skus = sig.bySku.map((r) => r.sku);
    if (!skus.includes(selSku)) selSku = [...sig.bySku].sort((a, b) => b.sales - a.sales)[0].sku;
    const pricey = sig.bySku.filter((r) => r.gap != null && r.gap > 0.1 + 1e-9); // 정확히 10%는 '초과'가 아님 (부동소수 오차 허용)
    const cutDrop = sig.bySku.filter((r) => r.rivalCut && r.dSales != null && r.dSales < 0);

    el.innerHTML = `
      <div class="kpis">
        <div class="kpi"><div class="k">비교 상품 / 경쟁 상품</div><div class="v">${sig.bySku.length} / ${sig.rv.length}</div><div class="s">${st.start} ~ ${st.end} 조사 기준</div></div>
        <div class="kpi"><div class="k">경쟁 최저가보다 10% 넘게 비싼 상품</div><div class="v" style="color:var(${pricey.length ? '--bad' : '--good'})">${pricey.length}개</div><div class="s">${pricey.slice(0, 2).map((r) => U.esc(r.name)).join(', ') || '없음'}</div></div>
        <div class="kpi"><div class="k">경쟁가 5% 이상 인하 + 우리 매출 감소</div><div class="v" style="color:var(${cutDrop.length ? '--bad' : '--good'})">${cutDrop.length}개</div><div class="s">${MD.cmpLabel()} 대비 · 원인 후보(확정 아님)</div></div>
      </div>
      <div class="card" style="margin-top:16px"><div class="card-head"><h2>상품별 가격 위치</h2><span class="muted">가격 격차 = 우리 판매가 ÷ 경쟁 최저가 − 1</span></div><div id="cpSku"></div></div>
      <div class="grid g3">
        <div class="card span2"><div class="card-head"><h2>가격 추이</h2>
          <select id="cpSel">${sig.bySku.map((r) => `<option value="${U.esc(r.sku)}" ${r.sku === selSku ? 'selected' : ''}>${U.esc(r.name)}</option>`).join('')}</select></div>
          <div id="cpLeg"></div><div class="chart-box"><canvas id="cpChart"></canvas></div>
          <div class="note">우리 실판매가 = 그날 매출 ÷ 수량(할인 반영). 경쟁가는 조사한 날만 점으로 이어집니다.</div></div>
        <div class="card"><div class="card-head"><h2>점검할 곳</h2></div><ul class="insights" id="cpIns"></ul></div>
      </div>
      <div class="card"><div class="card-head"><h2>경쟁 상품 상세</h2></div><div id="cpRv"></div></div>`;

    MD.table(el.querySelector('#cpSku'), {
      cols: [
        { key: 'name', label: '우리 상품' },
        { key: 'ourPrice', label: '우리 판매가', num: true, fmt: (v) => (v == null ? '-' : U.won(v)), xfmt: (v) => v },
        { key: 'asp', label: '실판매가', num: true, fmt: (v) => (v == null ? '-' : U.won(v)), xfmt: (v) => (v == null ? '' : Math.round(v)) },
        { key: 'minRival', label: '경쟁 최저가', num: true, fmt: (v) => U.won(v), xfmt: (v) => v },
        { key: 'gap', label: '가격 격차', num: true, html: true, fmt: (v) => (v == null ? '-' : `<span class="delta ${v > 0.1 + 1e-9 ? 'bad' : v < 0 ? 'good' : ''}">${v >= 0 ? '+' : ''}${U.pct(v)}</span>`), xfmt: (v) => v },
        { key: 'rivals', label: '경쟁 수', num: true },
        { key: 'rivalVsPrev', label: '경쟁가 변화', num: true, fmt: (v) => (v == null ? '-' : `${v >= 0 ? '+' : ''}${U.pct(v)}`), xfmt: (v) => v },
        MD.cols.sales, MD.cols.dSales,
      ],
      rows: sig.bySku, sortKey: 'sales', exportName: `경쟁비교_상품_${st.start}_${st.end}`,
    });
    MD.table(el.querySelector('#cpRv'), {
      cols: [
        { key: 'sku', label: 'SKU' }, { key: 'rival', label: '경쟁 상품' }, { key: 'brand', label: '브랜드' }, { key: 'channel', label: '채널' },
        { key: 'price', label: '최근 경쟁가', num: true, fmt: (v) => U.won(v), xfmt: (v) => v },
        { key: 'dPrice', label: '기간 중 변화', num: true, html: true, fmt: (v) => (v == null ? '-' : `<span class="delta ${v <= -0.05 ? 'bad' : ''}">${v >= 0 ? '+' : ''}${U.pct(v)}</span>`), xfmt: (v) => v },
        ...(sig.has.rank ? [{ key: 'rank', label: '순위', num: true, fmt: (v) => (v == null ? '-' : v) }, { key: 'dRank', label: '순위 변화', num: true, fmt: (v) => (v == null ? '-' : v < 0 ? `▲${-v}` : v > 0 ? `▼${v}` : '-'), xfmt: (v) => v }] : []),
        ...(sig.has.reviews ? [{ key: 'reviews', label: '리뷰수', num: true, fmt: (v) => (v == null ? '-' : U.num(v)) }] : []),
        ...(sig.has.rating ? [{ key: 'rating', label: '평점', num: true, fmt: (v) => (v == null ? '-' : v) }] : []),
        { key: 'n', label: '조사 횟수', num: true },
      ],
      rows: sig.rv, sortKey: 'sku', sortDir: 1, exportName: `경쟁비교_상세_${st.start}_${st.end}`,
    });

    // 선택 상품 가격 추이
    const days = U.dateRange(st.start, st.end);
    const mine = U.groupBy(C.inRange(d.sales, st.start, st.end).filter((r) => r.sku === selSku), (r) => r.date);
    const series = [{ label: '우리 실판매가', data: days.map((x) => { const rs = mine.get(x); if (!rs) return null; const q = rs.reduce((a, r) => a + r.qty, 0); return q ? rs.reduce((a, r) => a + r.sales, 0) / q : null; }), color: MD.colorOf(0) }];
    sig.rv.filter((r) => r.sku === selSku).slice(0, 5).forEach((r, i) => {
      const m = new Map(C.inRange(d.compete, st.start, st.end).filter((x) => x.sku === r.sku && x.rival === r.rival && (x.channel || '') === r.channel).map((x) => [x.date, x.price]));
      series.push({ label: `${r.rival}${r.channel ? ` (${r.channel})` : ''}`, data: days.map((x) => m.get(x) ?? null), color: MD.colorOf(i + 1), dashed: true });
    });
    el.querySelector('#cpLeg').innerHTML = MD.legend(series.map((x) => ({ label: x.label, color: x.color, dashed: x.dashed })));
    const ch = MD.charts.line(el.querySelector('#cpChart'), days.map((x) => x.slice(5).replace('-', '/')), series, U.won);
    if (ch) { ch.data.datasets.forEach((ds) => { ds.spanGaps = true; ds.pointRadius = ds.borderDash && ds.borderDash.length ? 3 : 0; }); ch.update(); }
    el.querySelector('#cpSel').onchange = (e) => { selSku = e.target.value; MD.rerender(); };

    const ins = [];
    cutDrop.sort((a, b) => a.rivalCutMax - b.rivalCutMax).slice(0, 3).forEach((r) => ins.push(['bad', `<b>${U.esc(r.name)}</b>: 경쟁가 최대 ${U.pct(-r.rivalCutMax)} 인하, 우리 매출 ${U.deltaHtml(r.dSales)} — 가격 대응·쿠폰 또는 차별점(구성·리뷰) 노출 검토`]));
    pricey.sort((a, b) => b.gap - a.gap).slice(0, 3).forEach((r) => ins.push(['warn', `<b>${U.esc(r.name)}</b>: 경쟁 최저가보다 ${U.pct(r.gap)} 비쌈${r.dSales != null ? ` (매출 ${U.deltaHtml(r.dSales)})` : ''} — 매출이 유지되면 가격 방어 근거, 줄고 있으면 가격·혜택 점검`]));
    if (sig.has.rank) sig.bySku.filter((r) => r.rankUp).slice(0, 2).forEach((r) => ins.push(['warn', `<b>${U.esc(r.name)}</b>: 순위가 오른 경쟁 상품 ${r.rankUp}개 — 노출 경쟁 심화 가능성`]));
    el.querySelector('#cpIns').innerHTML = (ins.length ? ins : [['good', '가격 격차·인하 신호가 큰 상품이 없습니다.']]).map(([k, t]) => `<li class="${k}">${t}</li>`).join('');
  };
})();
