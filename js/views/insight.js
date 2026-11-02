// 매출 변동 분석·개선 제안
//  1) 분해 A — 매출 = 유입 × 전환율 × 객단가. 로그 평균(LMDI)으로 세 요인 기여의 합이 실제 변화액과 정확히 같게 나눈다
//  2) 분해 B — 가격·수량·구성(믹스)·신규·단종. 두 기간 모두 팔린 SKU로 가격·수량·믹스를, 한쪽에만 있는 SKU로 신규·단종을 계산
//  3) 요인 점검 — 내부(행사·광고·할인·품절 의심·채널 성과)와 외부(계절성·요일·공휴일·경쟁 가격·이슈 기록)를 근거 숫자와 함께.
//     인과를 단정하지 않는다: '영향 가능성'으로만 표시하고, 추정 금액은 다른 조건이 같다는 가정의 단순 계산이다
//  4) 개선 제안 — 월 목표 부족분을 유입·전환·객단가 중 무엇을 얼마나 올리면 메우는지, 데이터에서 찾은 조치를 추정 효과 순으로
(function () {
  const U = MD.util, C = MD.calc;

  const L = (a, b) => (a === b ? a : (a - b) / (Math.log(a) - Math.log(b)));
  // 분해 A: S = V × (O/V) × (S/O). 판매 자료 주문수를 쓰므로 V×C×A = S가 정확히 성립한다
  function decompA(x, y) {
    if (!(x.visits > 0 && y.visits > 0 && x.orders > 0 && y.orders > 0 && x.sales > 0 && y.sales > 0)) return null;
    const w = L(x.sales, y.sales);
    const v = w * Math.log(x.visits / y.visits), c = w * Math.log((x.orders / x.visits) / (y.orders / y.visits)), a = w * Math.log((x.sales / x.orders) / (y.sales / y.orders));
    return { v, c, a, total: x.sales - y.sales };
  }
  // 분해 B: 가격·수량·믹스·신규·단종 (합 = 매출 변화)
  function decompB(cur, prev) {
    const a = C.by(cur, [], (r) => r.sku), b = C.by(prev, [], (r) => r.sku);
    let S1K = 0, S0K = 0, Q1K = 0, Q0K = 0, price = 0, q1p0 = 0, add = 0, lost = 0;
    const addList = [], lostList = [], priceList = [];
    for (const [k, x] of a) {
      const y = b.get(k);
      if (!y || !y.qty) { add += x.sales; addList.push({ sku: k, v: x.sales }); continue; }
      const p1 = x.sales / x.qty, p0 = y.sales / y.qty;
      S1K += x.sales; S0K += y.sales; Q1K += x.qty; Q0K += y.qty;
      price += (p1 - p0) * x.qty; q1p0 += x.qty * p0;
      priceList.push({ sku: k, v: (p1 - p0) * x.qty, p1, p0 });
    }
    for (const [k, y] of b) if (!a.has(k) || !a.get(k).qty) { lost -= y.sales; lostList.push({ sku: k, v: -y.sales }); }
    const P0 = Q0K ? S0K / Q0K : 0;
    const volume = (Q1K - Q0K) * P0, mix = q1p0 - Q1K * P0;
    return { price, volume, mix, add, lost, total: price + volume + mix + add + lost, addList, lostList, priceList, Q1K, Q0K };
  }
  const weekendDays = (s, e) => U.dateRange(s, e).filter((x) => { const w = U.toDate(x).getUTCDay(); return w === 0 || w === 6; }).length;
  const holidaysIn = (s, e) => {
    const d = MD.data, extra = (d.events || []).filter((ev) => ev.kind === '공휴일');
    return U.dateRange(s, e).filter((x) => MD.HOLIDAYS[x] || extra.some((ev) => ev.date <= x && x <= (ev.end || ev.date)));
  };
  const won = (v) => `${v >= 0 ? '+' : '−'}${U.krw(Math.abs(v))}원`;

  // 요인 점검 (text는 HTML로 그리므로 사용자 입력 문자열은 U.esc로 감싼다). 반환: [{ side: '내부'|'외부', name, text, est(원, 추정·없으면 null), level: 'high'|'mid'|'low' }]
  function factors(st, cs, ce, cur, prev) {
    const d = MD.data, out = [], x = cur.sum, y = prev.sum, diff = x.sales - y.sales;
    const len = U.diffDays(st.start, st.end) + 1;
    // 내부: 행사
    const pr = (s, e) => d.promotions.filter((p) => p.start <= e && p.end >= s);
    const pc = pr(st.start, st.end), pp = pr(cs, ce);
    if (pc.length || pp.length) {
      const inc = pc.reduce((sum, p) => {
        const r = MD.promoResult(p);
        if (r.dailyB == null) return sum; // 시작 전 행사
        const a = p.start > st.start ? p.start : st.start, b0 = p.end < st.end ? p.end : st.end, b = d.maxDate && d.maxDate < b0 ? d.maxDate : b0;
        if (a > b) return sum;
        const match = (x) => x.channel === p.channel && (!p.categories || !p.categories.length || p.categories.includes((d.productMap[x.sku] || {}).category));
        const s = C.inRange(d.sales, a, b).filter(match).reduce((t, x) => t + x.sales, 0);
        return sum + s - r.dailyB * (U.diffDays(a, b) + 1);
      }, 0);
      out.push({ side: '내부', name: '행사·타임딜', text: `이번 기간 ${pc.length}건(${pc.slice(0, 3).map((p) => U.esc(p.name)).join(', ')}${pc.length > 3 ? ' 외' : ''}) · 비교 기간 ${pp.length}건. 선택 기간에 겹친 행사일의 증분 매출 추정 ${won(inc)}(행사 직전 14일 일평균 기준선, 기간 밖 행사일 제외)`, est: inc || null, level: Math.abs(inc) > Math.abs(diff) * 0.3 ? 'high' : pc.length !== pp.length ? 'mid' : 'low' });
    }
    // 내부: 광고
    if (x.adRows || y.adRows) {
      const ds = x.adSpend - y.adSpend;
      // 광고 매출이 빈(미입력) 행이 한쪽이라도 있으면 0원으로 보지 않고 변화액을 계산하지 않는다 (확인된 0원과 구분)
      const miss = (x.adRevMiss || 0) + (y.adRevMiss || 0);
      if (miss) {
        out.push({ side: '내부', name: '광고 집행', text: `광고비 ${won(ds)}(${U.deltaHtml(U.delta(x.adSpend, y.adSpend), true)}). 광고 매출 미입력 행 ${miss}개(이번 ${x.adRevMiss || 0} · 비교 ${y.adRevMiss || 0})가 있어 광고 매출 변화는 계산 불가 — 광고 리포트에 전환 매출을 채워 다시 올리세요`, est: null, level: 'mid' });
      } else {
        const dr = x.adRev - y.adRev;
        out.push({ side: '내부', name: '광고 집행', text: `광고비 ${won(ds)}(${U.deltaHtml(U.delta(x.adSpend, y.adSpend), true)}), 광고 매출 ${won(dr)} · 광고 ROAS ${y.roas == null ? '-' : U.pct(y.roas, 0)} → ${x.roas == null ? '-' : U.pct(x.roas, 0)}`, est: dr, level: Math.abs(dr) > Math.abs(diff) * 0.3 ? 'high' : Math.abs(dr) > Math.abs(diff) * 0.1 ? 'mid' : 'low' });
      }
    } else if (x.ad || y.ad) {
      out.push({ side: '내부', name: '광고 집행', text: `광고비(유입 파일) ${won(x.ad - y.ad)}. 광고 리포트를 올리면 광고 매출 변화로 영향을 더 정확히 봅니다`, est: null, level: 'mid' });
    }
    // 내부: 할인·가격
    const dr0 = y.sales + y.discount ? y.discount / (y.sales + y.discount) : 0, dr1 = x.sales + x.discount ? x.discount / (x.sales + x.discount) : 0;
    if (Math.abs(dr1 - dr0) >= 0.01) out.push({ side: '내부', name: '할인율', text: `평균 할인율 ${U.pct(dr0)} → ${U.pct(dr1)} (${((dr1 - dr0) * 100).toFixed(1)}%p). 할인이 늘면 수량은 늘고 객단가·이익률은 낮아집니다`, est: null, level: Math.abs(dr1 - dr0) >= 0.03 ? 'high' : 'mid' });
    // 내부: 품절 의심 (재고 이력이 없어 '현재 재고 0 + 판매 급감'으로만 추정)
    const pa = C.by(cur.sales, [], (r) => r.sku), pb = C.by(prev.sales, [], (r) => r.sku);
    const oos = d.products.filter((p) => Number(p.stock) <= 0 && (pb.get(p.sku) || {}).sales > 0 && ((pa.get(p.sku) || {}).sales || 0) < (pb.get(p.sku).sales * 0.5));
    if (oos.length) { const loss = oos.reduce((a, p) => a + (pb.get(p.sku).sales - ((pa.get(p.sku) || {}).sales || 0)), 0); out.push({ side: '내부', name: '품절 의심', text: `현재 재고 0이면서 매출이 절반 아래로 줄어든 상품 ${oos.length}개(${oos.slice(0, 3).map((p) => U.esc(p.name)).join(', ')}) · 감소액 ${won(-loss)} (재고 이력이 없어 품절 시점은 확인 불가)`, est: -loss, level: loss > Math.abs(diff) * 0.2 ? 'high' : 'mid' }); }
    // 외부: 계절성 (작년 같은 두 기간의 변화율)
    const ly = (s) => U.addYears(s, -1);
    if (d.minDate && d.minDate <= ly(cs)) {
      const a1 = C.inRange(d.sales, ly(st.start), ly(st.end)).reduce((a, r) => a + r.sales, 0), a0 = C.inRange(d.sales, ly(cs), ly(ce)).reduce((a, r) => a + r.sales, 0);
      if (a0 > 0) { const g = a1 / a0 - 1; out.push({ side: '외부', name: '계절성(작년 같은 시기)', text: `작년 같은 두 기간에도 매출이 ${U.pct(g)} 변했습니다(올해 ${U.pct(y.sales ? x.sales / y.sales - 1 : 0)}). 계절 요인을 빼면 올해 고유 변화는 약 ${U.pct((y.sales ? x.sales / y.sales : 1) / (1 + g) - 1)}`, est: y.sales * g, level: Math.abs(g) > 0.1 ? 'high' : Math.abs(g) > 0.03 ? 'mid' : 'low' }); }
    } else out.push({ side: '외부', name: '계절성', text: '작년 같은 시기 자료가 없어 계절 요인을 분리하지 못했습니다(1년 이상 자료가 쌓이면 자동 계산)', est: null, level: 'low' });
    // 외부: 요일 구성
    const w1 = weekendDays(st.start, st.end), w0 = weekendDays(cs, ce);
    if (w1 !== w0) {
      const win = C.inRange(d.sales, cs, st.end), byDay = U.groupBy(win, (r) => r.date);
      const avg = (we) => { const ds = U.dateRange(cs, st.end).filter((dd) => { const w = U.toDate(dd).getUTCDay(); return (w === 0 || w === 6) === we; }); return ds.length ? ds.reduce((a, dd) => a + (byDay.get(dd) || []).reduce((s, r) => s + r.sales, 0), 0) / ds.length : 0; };
      const gap = avg(true) - avg(false);
      out.push({ side: '외부', name: '요일 구성', text: `주말 ${w0}일 → ${w1}일. 이 기간 주말 일평균이 평일보다 ${won(gap)} → 요일 차이 효과 추정 ${won(gap * (w1 - w0))}`, est: gap * (w1 - w0), level: Math.abs(gap * (w1 - w0)) > Math.abs(diff) * 0.2 ? 'high' : 'mid' });
    }
    // 외부: 공휴일
    const h1 = holidaysIn(st.start, st.end), h0 = holidaysIn(cs, ce);
    if (h1.length || h0.length) out.push({ side: '외부', name: '공휴일·연휴', text: `이번 기간 ${h1.length}일(${h1.slice(0, 4).map((x) => `${x.slice(5)} ${MD.HOLIDAYS[x] || '기록'}`).join(', ')}) · 비교 기간 ${h0.length}일. 연휴는 상품군에 따라 매출을 올리거나(선물) 낮춥니다(배송 지연)`, est: null, level: h1.length !== h0.length ? 'mid' : 'low' });
    // 외부: 경쟁 가격
    if (d.compete.length && MD.competeSignals) {
      const sig = MD.competeSignals(st.start, st.end, cs, ce), hit = sig.bySku.filter((r) => r.rivalCut && r.dSales != null && r.dSales < 0);
      if (sig.rv.length) out.push({ side: '외부', name: '경쟁 가격', text: hit.length ? `경쟁가 5% 이상 인하 후 우리 매출이 줄어든 상품 ${hit.length}개: ${hit.slice(0, 3).map((r) => U.esc(r.name)).join(', ')} (감소 ${won(hit.reduce((a, r) => a + r.sales - r.prevSales, 0))})` : `조사한 ${sig.bySku.length}개 상품에서 경쟁가 인하와 매출 감소가 겹친 경우가 없습니다`, est: hit.length ? hit.reduce((a, r) => a + r.sales - r.prevSales, 0) : null, level: hit.length ? 'mid' : 'low' });
    } else out.push({ side: '외부', name: '경쟁 가격', text: '경쟁 상품 조사 자료가 없어 확인하지 못했습니다(경쟁 상품 비교 화면 참고)', est: null, level: 'low' });
    // 이슈 기록
    const ev = (s, e) => (d.events || []).filter((v) => v.kind !== '공휴일' && v.date <= e && (v.end || v.date) >= s);
    ev(st.start, st.end).forEach((v) => out.push({ side: v.kind === '내부' ? '내부' : '외부', name: `이슈 기록: ${v.title}`, text: `${v.date}${v.end && v.end !== v.date ? ` ~ ${v.end}` : ''}${v.channel ? ` · ${U.esc(v.channel)}` : ''} (직접 기록한 사건 — 수치 영향은 계산하지 않음)`, est: null, level: 'mid' }));
    return out;
  }

  // 개선 제안: [{ title, why, est, how }] 추정 효과 큰 순
  function suggestions(st, cur, prev) {
    const d = MD.data, x = cur.sum, out = [];
    const ch = MD.channelRows(cur, prev).filter((r) => r.sales || r.adRows);
    // 1. 광고 재배분: 기준 미달 채널 광고비를 ROAS 최고 채널로 옮긴다고 가정
    const roasCh = ch.filter((r) => r.roas != null && r.adSpend > 0).sort((a, b) => b.roas - a.roas);
    if (roasCh.length >= 2) {
      const best = roasCh[0], low = roasCh.filter((r) => r.roas < MD.settings.roasMin && r !== best);
      if (low.length) { const mv = low.reduce((a, r) => a + r.adSpend * 0.2, 0), gain = low.reduce((a, r) => a + r.adSpend * 0.2 * (best.roas - r.roas), 0);
        out.push({ title: '광고 예산 재배분', why: `광고 ROAS 기준(${U.pct(MD.settings.roasMin, 0)}) 미달: ${low.map((r) => `${r.channel} ${U.pct(r.roas, 0)}`).join(', ')} / 최고 ${best.channel} ${U.pct(best.roas, 0)}`, est: gain, how: `미달 채널 광고비의 20%(${U.krw(mv)}원)를 ${best.channel}로 옮기면 광고 매출 약 ${won(gain)} (추정 — 예산을 늘리면 ROAS가 떨어지는 효과는 반영 안 함). 미달 채널은 키워드·소재부터 정리` }); }
    }
    // 2. 전환율 낮은 채널: 전사 평균 전환율까지 올리면
    if (x.visits && x.orders) {
      const avg = x.orders / x.visits;
      ch.filter((r) => r.visits > 1000 && r.cvr != null && r.cvr < avg * 0.85).forEach((r) => {
        const gain = r.visits * (avg - r.cvr) * (r.aov || 0);
        out.push({ title: `${r.channel} 전환율 개선`, why: `전환율 ${U.pct(r.cvr, 2)} — 전체 평균 ${U.pct(avg, 2)}보다 낮고 유입은 ${U.num(r.visits)}`, est: gain, how: `평균까지 올리면 매출 약 ${won(gain)} (추정). 상세페이지 첫 화면·가격 비교 노출·리뷰·배송 조건·쿠폰 노출 순으로 점검` });
      });
    }
    // 3. 재고: 잘 팔리는 상품의 소진 임박
    const cover = MD.coverRows().filter((r) => r.cover != null && r.cover < MD.settings.coverDays && r.daily > 0);
    if (cover.length) { const lead = Number(U.store.get('leadDays', 30)); const loss = cover.reduce((a, r) => a + Math.max(0, lead - r.cover - (r.inbound ? lead : 0)) * r.daily * (Number(r.price) || 0), 0);
      out.push({ title: '품절 방지 재발주', why: `${MD.settings.coverDays}일 안에 소진 예상 ${cover.length}개 (${cover.slice(0, 3).map((r) => r.name).join(', ')})`, est: loss, how: `입고까지(리드타임 ${lead}일) 비는 날의 판매 손실 약 ${U.krw(loss)}원 (추정, 판매가 기준). 발주·입고 일정에서 제안 발주량 확인` }); }
    // 4. 경쟁 가격
    if (d.compete.length && MD.competeSignals) {
      const [cs, ce] = C.compareRange(st.start, st.end, st.cmp);
      MD.competeSignals(st.start, st.end, cs, ce).bySku.filter((r) => r.gap != null && r.gap > 0.1 + 1e-9 && r.dSales != null && r.dSales < 0).slice(0, 2).forEach((r) => out.push({ title: `${r.name} 가격 대응`, why: `경쟁 최저가보다 ${U.pct(r.gap)} 비싸고 매출 ${U.pct(r.dSales)}`, est: r.prevSales - r.sales, how: `줄어든 매출 ${U.krw(r.prevSales - r.sales)}원 회복이 목표. 가격 인하보다 쿠폰·묶음 구성·사은품으로 실판매가를 맞추는 안부터 손익분기 시뮬레이터로 검토` }));
    }
    // 5. 행사: 지금까지 성공률 높은 행사 유형
    const done = d.promotions.map(MD.promoResult).filter((r) => r.status !== '진행/예정' && r.status !== '자료 없음' && r.status !== '기준 자료 없음');
    if (done.length >= 2) {
      const byType = [...U.groupBy(done, (r) => r.type).entries()].map(([t, rs]) => ({ t, n: rs.length, win: rs.filter((r) => r.status === '성공').length, gain: rs.reduce((a, r) => a + (r.netGain || 0), 0) / rs.length })).sort((a, b) => b.gain - a.gain);
      const top = byType[0];
      if (top && top.gain > 0) out.push({ title: `${top.t} 유형 행사 우선`, why: `지난 행사 ${top.n}건 중 성공 ${top.win}건, 건당 순증 이익 평균 ${U.krw(top.gain)}원 (유형별 최고)`, est: top.gain, how: `부족한 달에는 이 유형을 먼저 검토. 손실 유형(${byType.filter((b) => b.gain < 0).map((b) => b.t).join(', ') || '없음'})은 할인율·비용 조건을 바꾸거나 줄이기` });
    }
    return out.sort((a, b) => (b.est || 0) - (a.est || 0));
  }

  // 업무 개선: 데이터·운영 습관에서 보이는 것
  function processTips() {
    const d = MD.data, out = [];
    const lag = d.maxDate ? U.diffDays(d.maxDate, U.today()) : null;
    if (lag != null && lag > 3) out.push(`판매 자료가 오늘보다 ${lag}일 늦습니다. 주 1회(월요일) 올리는 루틴을 정하면 주간 보고·목표 페이스 판단이 빨라집니다.`);
    const a = C.salesAsOf(); if (a.unconfirmed.length) out.push(`자료 마감 확인이 안 된 채널 ${a.unconfirmed.length}개(${a.unconfirmed.slice(0, 3).join(', ')}) — 목표 판정이 자료 마지막 날 기준으로 잡혀 있습니다.`);
    const sold = new Set(d.sales.map((r) => r.sku)); const nc = d.products.filter((p) => sold.has(p.sku) && !(Number(p.cost) > 0)); if (nc.length) out.push(`원가가 없는 판매 상품 ${nc.length}개 — 이익률·이익 판단이 부풀려집니다.`);
    if (d.traffic.length && !d.traffic.some((t) => t.ordOk)) out.push('유입 파일에 주문 건수(플랫폼 통계) 열이 없어 전환율 목표를 판정하지 못합니다. 플랫폼 통계의 결제 건수를 함께 내려받아 넣으세요.');
    if (!d.ads.length) out.push('광고 리포트가 없어 광고 ROAS를 계산하지 못합니다. 플랫폼 광고 리포트(광고비·전환 매출)를 주 1회 올리세요.');
    else if (d.ads.some((r) => (r.miss || []).includes('revenue'))) out.push('광고 리포트에 광고 매출이 빈 행이 있습니다 — 그 행은 ROAS에서 빠집니다.');
    if (!d.compete.length) out.push('경쟁 상품 조사 자료가 없습니다. 매출 상위 상품부터 경쟁 상품 2~3개를 주 1회 같은 요일에 조사하면 외부 요인(가격 경쟁)을 분리할 수 있습니다.');
    if (!(d.events || []).some((e) => !e.sample)) out.push('이슈 기록이 비어 있습니다. 날씨·경쟁사 행사·노출 변경·품절 같은 사건을 그때그때 적어 두면 월말 변동 분석의 근거가 됩니다.');
    return out;
  }

  MD.views.insight = function (el) {
    const d = MD.data, st = MD.state;
    const { cur, prev, cs, ce } = MD.current();
    const x = cur.sum, y = prev.sum, diff = x.sales - y.sales;
    const A = decompA(x, y), B = decompB(cur.sales, prev.sales);
    const F = factors(st, cs, ce, cur, prev), S = suggestions(st, cur, prev), T = processTips();
    const gm = (d.maxDate && d.maxDate < st.end ? d.maxDate : st.end).slice(0, 7), gs = MD.goalStatus(gm);
    const bar = (v, max) => `<div class="bar-track" style="height:8px"><div class="bar-fill" style="width:${max ? Math.min(100, (Math.abs(v) / max) * 100) : 0}%;background:var(${v >= 0 ? '--good' : '--bad'})"></div></div>`;
    const rowsA = A ? [['유입(방문)', A.v, `${U.num(y.visits)} → ${U.num(x.visits)}`], ['전환율', A.c, `${U.pct(y.orders / y.visits, 2)} → ${U.pct(x.orders / x.visits, 2)}`], ['객단가', A.a, `${U.won(y.sales / y.orders)} → ${U.won(x.sales / x.orders)}`]] : [];
    const rowsB = [['가격(같은 상품의 단가 변화)', B.price], ['수량(전체 판매량 변화)', B.volume], ['구성(비싼·싼 상품 비중 변화)', B.mix], ['신규 상품', B.add], ['판매 중단·0건 상품', B.lost]];
    const maxA = Math.max(1, ...rowsA.map((r) => Math.abs(r[1]))), maxB = Math.max(1, ...rowsB.map((r) => Math.abs(r[1])));
    const lv = { high: ['bad', '영향 가능성 큼'], mid: ['warn', '영향 가능성 있음'], low: ['neutral', '영향 작음·판단 불가'] };

    // 목표 부족분 → 레버별 필요 개선폭
    let lever = '';
    if (gs.target && gs.remainDays > 0 && gs.need != null && gs.run != null && gs.run > 0 && gs.need > gs.run) {
      const k = gs.need / gs.run - 1, cvrNow = x.visits ? x.orders / x.visits : null;
      lever = `<div class="card"><div class="card-head"><h2>${Number(gm.slice(5))}월 목표까지 필요한 개선 폭</h2><span class="muted">남은 ${gs.remainDays}일 · 필요 일매출 ${U.krw(gs.need)}원 vs 최근 7일 평균 ${U.krw(gs.run)}원</span></div>
        <p style="margin-top:0">일매출을 <b>${U.pct(k)}</b> 올려야 합니다. 셋 중 하나만 움직인다면 각각 아래만큼 필요합니다(나머지가 그대로일 때의 단순 계산).</p>
        <div class="result-grid">
          <div><div class="k">유입(방문)만</div><div class="v">+${U.pct(k)}</div><div class="muted" style="font-size:12px">하루 방문 약 +${U.num(x.visits / (U.diffDays(st.start, st.end) + 1) * k)}</div></div>
          <div><div class="k">전환율만</div><div class="v">${cvrNow == null ? '-' : `${U.pct(cvrNow, 2)} → ${U.pct(cvrNow * (1 + k), 2)}`}</div></div>
          <div><div class="k">객단가만</div><div class="v">${x.orders ? `${U.won(x.sales / x.orders)} → ${U.won(x.sales / x.orders * (1 + k))}` : '-'}</div><div class="muted" style="font-size:12px">묶음·세트·추가 구성 제안</div></div>
        </div></div>`;
    } else if (gs.target && gs.remain === 0) lever = `<div class="note" style="margin:12px 0">${Number(gm.slice(5))}월 목표를 이미 달성했습니다. 아래 제안은 초과 달성·이익 개선용입니다.</div>`;

    el.innerHTML = `
      <div class="row" style="margin-bottom:12px"><span class="muted">${st.start} ~ ${st.end} vs ${MD.cmpLabel()} ${cs} ~ ${ce}</span></div>
      <div class="kpis">
        <div class="kpi"><div class="k">매출 변화</div><div class="v" style="color:var(${diff >= 0 ? '--good' : '--bad'})">${won(diff)}</div><div class="s">${U.krw(y.sales)}원 → ${U.krw(x.sales)}원 ${U.deltaHtml(U.delta(x.sales, y.sales))}</div></div>
        <div class="kpi"><div class="k">가장 큰 요인 (분해 A)</div><div class="v">${A ? rowsA.slice().sort((p, q) => Math.abs(q[1]) - Math.abs(p[1]))[0][0] : '-'}</div><div class="s">${A ? won(rowsA.slice().sort((p, q) => Math.abs(q[1]) - Math.abs(p[1]))[0][1]) : '유입 자료가 있어야 계산'}</div></div>
        <div class="kpi"><div class="k">가장 큰 요인 (분해 B)</div><div class="v">${rowsB.slice().sort((p, q) => Math.abs(q[1]) - Math.abs(p[1]))[0][0].split('(')[0]}</div><div class="s">${won(rowsB.slice().sort((p, q) => Math.abs(q[1]) - Math.abs(p[1]))[0][1])}</div></div>
      </div>
      <div class="grid g2" style="margin-top:16px">
        <div class="card"><div class="card-head"><h2>분해 A · 유입 × 전환율 × 객단가</h2></div>
          ${A ? `<table><tbody>${rowsA.map(([n, v, t]) => `<tr><td style="width:30%">${n}<div class="muted" style="font-size:11px">${t}</div></td><td class="num" style="width:22%">${won(v)}</td><td>${bar(v, maxA)}</td></tr>`).join('')}
            <tr class="total"><td>합계 = 매출 변화</td><td class="num">${won(A.v + A.c + A.a)}</td><td></td></tr></tbody></table>
            <div class="note">로그 평균 분해라 세 기여의 합이 실제 변화액과 같습니다. 전환율·객단가는 판매 파일 주문수 기준(목표 판정용 전환율과 다를 수 있음).</div>` : '<div class="empty">두 기간 모두 유입·주문·매출이 있어야 계산합니다.</div>'}</div>
        <div class="card"><div class="card-head"><h2>분해 B · 가격 · 수량 · 구성</h2></div>
          <table><tbody>${rowsB.map(([n, v]) => `<tr><td style="width:38%">${n}</td><td class="num" style="width:22%">${won(v)}</td><td>${bar(v, maxB)}</td></tr>`).join('')}
            <tr class="total"><td>합계 = 매출 변화</td><td class="num">${won(B.total)}</td><td></td></tr></tbody></table>
          <div class="note">가격 = Σ(단가 변화 × 이번 수량), 수량 = 두 기간 모두 팔린 상품의 수량 변화 × 이전 평균 단가, 구성 = 나머지. ${B.addList.length ? `신규 ${B.addList.length}개` : ''}${B.lostList.length ? ` · 0건 ${B.lostList.length}개(${B.lostList.slice(0, 3).map((r) => U.esc((d.productMap[r.sku] || {}).name || r.sku)).join(', ')})` : ''}</div></div>
      </div>
      <div class="card"><div class="card-head"><h2>내부 · 외부 요인 점검</h2><span class="muted">근거 숫자로 '가능성'만 표시 — 원인 확정은 아님</span></div>
        <div class="grid g2">${['내부', '외부'].map((side) => `<div><h3 style="margin:0 0 8px">${side} 요인</h3><ul class="insights">${F.filter((f) => f.side === side).map((f) => `<li class="${f.level === 'high' ? 'bad' : f.level === 'mid' ? 'warn' : ''}"><span class="tag ${lv[f.level][0]}">${lv[f.level][1]}</span><b>${U.esc(f.name)}</b>${f.est != null ? ` <span class="muted">(추정 ${won(f.est)})</span>` : ''}<div style="font-size:13px;margin-top:2px">${f.text}</div></li>`).join('') || '<li>점검할 항목이 없습니다.</li>'}</ul></div>`).join('')}</div>
        <div class="note">추정 금액은 서로 겹칠 수 있어 더하면 실제 변화와 맞지 않습니다(예: 행사 기간에 광고도 늘림). 정확한 분해는 위 분해 A·B를 보세요.</div></div>
      ${lever}
      <div class="card"><div class="card-head"><h2>목표 달성을 위한 제안</h2><span class="muted">추정 효과 큰 순 · 다른 조건이 같다는 가정의 단순 계산</span></div>
        ${S.length ? `<ol class="guide-steps">${S.map((s) => `<li class="todo"><div class="row"><b>${U.esc(s.title)}</b><span class="spacer"></span>${s.est != null ? `<span class="tag good">추정 ${won(s.est)}</span>` : ''}</div><div class="muted" style="font-size:12px">${U.esc(s.why)}</div><div style="margin-top:4px">${U.esc(s.how)}</div></li>`).join('')}</ol>` : '<div class="empty">데이터에서 찾은 개선 여지가 없습니다.</div>'}</div>
      <div class="card"><div class="card-head"><h2>업무 개선 방향</h2><span class="muted">자료·운영 습관에서 보이는 것</span></div>
        ${T.length ? `<ul class="checklist">${T.map((t) => `<li><span>${U.esc(t)}</span></li>`).join('')}</ul>` : '<div class="muted">자료 관리 상태가 좋습니다.</div>'}</div>
      <div class="card" id="evCard"><div class="card-head"><h2>이슈 기록</h2><span class="muted">외부(날씨·경쟁사 행사·플랫폼 정책)·내부(상세 변경·노출 변경·품절)·공휴일(기본 목록 보정)</span></div><div id="evT"></div></div>`;

    MD.crud(el.querySelector('#evT'), {
      fields: [
        { key: 'date', label: '시작', type: 'date' }, { key: 'end', label: '끝', type: 'date' },
        { key: 'kind', label: '구분', type: 'select', options: ['외부', '내부', '공휴일'] },
        { key: 'channel', label: '채널(선택)', type: 'select', options: ['', ...d.channels.map((c) => c.name)] },
        { key: 'title', label: '내용', width: '320px' },
      ],
      list: () => MD.data.events,
      onChange: (kind, row) => { if (row) delete row.sample; MD.store.save(['events']); },
      newRow: () => ({ date: st.end, end: st.end, kind: '외부', channel: '', title: '' }),
    });
  };
})();
