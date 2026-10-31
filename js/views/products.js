// 상품 성과(ABC·포지션) + 재고 소진 예상
(function () {
  const U = MD.util;
  let cat = '';

  MD.views.products = function (el) {
    const d = MD.data, st = MD.state;
    const cats = [...new Set(d.products.map((p) => p.category))];
    const { cur, prev } = MD.current();
    let rows = MD.productRows(cur, prev);
    // 이익률 기준선은 원가가 있는 상품만으로 계산한다 (원가 0 상품이 섞이면 평균이 부풀어 정상 상품이 '마진 점검'으로 밀림)
    const costed = rows.filter((r) => !r.noCost && r.sales > 0);
    const costedNet = costed.reduce((a, r) => a + r.sales / 1.1, 0);
    const avgMargin = costedNet ? costed.reduce((a, r) => a + r.gross, 0) / costedNet : 0;
    if (cat) rows = rows.filter((r) => r.category === cat);

    // ABC 등급: 매출 누적 비중 70% 이내 A, 90% 이내 B, 나머지 C
    const total = rows.reduce((a, r) => a + r.sales, 0) || 1;
    let acc = 0;
    [...rows].sort((a, b) => b.sales - a.sales).forEach((r) => { acc += r.sales; r.abc = r.sales <= 0 ? 'C' : acc / total <= 0.7 || acc - r.sales === 0 ? 'A' : acc / total <= 0.9 ? 'B' : 'C'; });
    // 포지션: 매출 중앙값 × 평균 이익률 기준 4분면
    const sold = rows.filter((r) => r.sales > 0 && !r.noCost);
    const medSales = sold.length ? [...sold].sort((a, b) => a.sales - b.sales)[Math.floor(sold.length / 2)].sales : 0;
    for (const r of rows) {
      if (!r.sales) { r.pos = '판매 없음'; continue; }
      if (r.noCost) { r.pos = '원가 미입력'; continue; }
      const hiS = r.sales >= medSales, hiM = (r.margin || 0) >= avgMargin;
      r.pos = hiS && hiM ? '핵심 상품' : hiS ? '볼륨형(마진 점검)' : hiM ? '육성 후보' : '정리 검토';
    }
    const cover = Object.fromEntries(MD.coverRows().map((c) => [c.sku, c]));
    // 마스터에서 지운 SKU(미등록 행)는 재고 정보가 없으므로 재고 일수를 '계산 불가'로 둔다
    for (const r of rows) { const c = cover[r.sku] || { cover: null, daily: 0, inbound: 0, stockout: null }; r.cover = c.cover; r.daily = c.daily; r.inbound = c.inbound; r.stockout = c.stockout; }

    const counts = {};
    rows.forEach((r) => (counts[r.pos] = (counts[r.pos] || 0) + 1));
    const POS = [['핵심 상품', 'good', '매출·이익률 모두 높음 → 재고 확보·노출 유지'], ['볼륨형(마진 점검)', 'warn', '매출은 높지만 이익률이 평균 미만 → 할인·채널 수수료 점검'], ['육성 후보', 'neutral', '이익률은 높고 매출이 낮음 → 기획전·노출 확대 후보'], ['정리 검토', 'bad', '매출·이익률 모두 낮음 → 재고 소진·단종 검토']];

    el.innerHTML = `
      <div class="row" style="margin-bottom:14px">
        <div class="seg" id="catSeg"><button data-c="" class="${!cat ? 'on' : ''}">전체</button>${cats.map((c) => `<button data-c="${U.esc(c)}" class="${c === cat ? 'on' : ''}">${U.esc(c)}</button>`).join('')}</div>
      </div>
      <div class="grid g4">${POS.map(([k, t, desc]) => `<div class="kpi"><div class="k"><span class="tag ${t}">${k}</span></div><div class="v">${counts[k] || 0}개</div><div class="s">${desc}</div></div>`).join('')}</div>
      <div class="card" style="margin-top:16px">
        <div class="card-head"><h2>상품별 매출 상위 15</h2><span class="muted">막대 = 이번 기간 매출</span></div>
        <div class="chart-box tall"><canvas id="cTop"></canvas></div>
      </div>
      <div class="card"><div class="card-head"><h2>상품 성과 표</h2><span class="muted">ABC: 매출 누적 70%까지 A, 90%까지 B · 포지션 기준: 매출 중앙값 ${U.krw(medSales)}, 평균 이익률 ${U.pct(avgMargin)}</span></div><div id="tP"></div></div>
      <div class="card"><div class="card-head"><h2>재고 소진 예상</h2><span class="muted">최근 28일 일평균 판매량 기준 · 경고 기준 ${MD.settings.coverDays}일</span><a class="btn small" href="#orders">발주 관리</a></div><div id="tS"></div></div>`;

    el.querySelectorAll('#catSeg button').forEach((b) => (b.onclick = () => { cat = b.dataset.c; MD.rerender(); }));

    const top = [...rows].sort((a, b) => b.sales - a.sales).slice(0, 15);
    MD.charts.bar(el.querySelector('#cTop'), top.map((r) => r.name), [{ label: '매출', data: top.map((r) => r.sales), color: MD.colorOf(0) }], U.krw, { horizontal: true });

    const posTag = (v) => { const p = POS.find((x) => x[0] === v); return `<span class="tag ${p ? p[1] : 'neutral'}">${U.esc(v)}</span>`; };
    MD.table(el.querySelector('#tP'), {
      cols: [
        { key: 'sku', label: 'SKU' }, { key: 'name', label: '상품명' }, { key: 'category', label: '카테고리' },
        { key: 'abc', label: 'ABC' }, { key: 'pos', label: '포지션', html: true, fmt: posTag, xfmt: (v) => v },
        MD.cols.sales, MD.cols.dSales, MD.cols.share, MD.cols.qty, MD.cols.gross, MD.cols.margin,
        { key: 'discount', label: '할인액', num: true, fmt: (v) => U.krw(v), xfmt: (v) => Math.round(v) },
      ],
      rows, sortKey: 'sales', exportName: `상품성과_${st.start}_${st.end}`,
    });

    const stockRows = rows.filter((r) => r.daily > 0 || r.stock > 0);
    const coverTag = (v, r) => {
      if (v == null) return r.stock > 0 ? '<span class="tag neutral">판매 없음</span>' : '-';
      const t = v < MD.settings.coverDays ? 'bad' : v > 120 ? 'warn' : 'good';
      const label = v < MD.settings.coverDays ? '발주 필요' : v > 120 ? '과재고' : '적정';
      return `<span class="tag ${t}">${label}</span>${Math.floor(v)}일`;
    };
    MD.table(el.querySelector('#tS'), {
      cols: [
        { key: 'sku', label: 'SKU' }, { key: 'name', label: '상품명' },
        { key: 'stock', label: '현재고', num: true, fmt: (v) => U.num(v) },
        { key: 'daily', label: '일평균 판매', num: true, fmt: (v) => U.num(v, 2) },
        { key: 'cover', label: '재고 일수', num: true, html: true, fmt: coverTag, xfmt: (v) => (v == null ? '' : Math.floor(v)) },
        { key: 'stockout', label: '소진 예상일', fmt: (v) => v || '-' },
        { key: 'inbound', label: '입고 예정', num: true, fmt: (v) => (v ? U.num(v) : '-') },
      ],
      rows: stockRows, sortKey: 'cover', sortDir: 1, exportName: '재고소진예상',
    });
  };
})();
