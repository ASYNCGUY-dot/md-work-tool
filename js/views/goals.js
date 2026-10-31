// 목표·KPI: 월별 매출 목표 입력, 기준일까지 계획 대비 실적, 월말 예상, 주차별 달성, 광고비 예산·이익률 목표
// 정의 (collaboration/PROPOSAL-KPI-UX.md, Codex 논의 반영)
//  - 월 목표 달성률 = 기준일까지 누적 실적 ÷ 월 전체 목표
//  - 기준일까지 계획 = 월 목표를 일수로 균등 배분해 1일~기준일까지 더한 값, 페이스 = 누적 실적 ÷ 기준일까지 계획
//  - 기준일 = 판매 자료의 마지막 날 (자료가 그날까지 다 들어왔다고 가정 — 화면에 표시)
//  - 월말 예상 = 누적 실적 + 남은 일수 × 기준일 포함 최근 7일 일평균 (참고값, 행사·품절은 반영 안 됨)
//  - 목표 미설정은 0이 아니라 '판정 보류'
(function () {
  const U = MD.util, C = MD.calc;
  let month = null, year = null, wide = false, seenMax, openCh = false;

  const ym = (s) => s.slice(0, 7);
  const monthStart = (m) => m + '-01';
  const monthEnd = (m) => { const [y, mm] = m.split('-').map(Number); return U.fmt(new Date(Date.UTC(y, mm, 0))); };
  const dim = (m) => Number(monthEnd(m).slice(8));
  const addMonth = (m, n) => { const [y, mm] = m.split('-').map(Number); const t = new Date(Date.UTC(y, mm - 1 + n, 1)); return U.fmt(t).slice(0, 7); };
  const label = (m) => `${Number(m.slice(5))}월`;
  // 금액 입력: '62,000,000' · '6200만' · '1.2억' · '6200만원' 모두 받는다. 숫자가 아니면 NaN
  function parseWon(raw) {
    const s = String(raw).replace(/[,\s원]/g, '');
    if (s === '') return null;
    const m = s.match(/^(\d+(?:\.\d+)?)(억|만)?$/) || s.match(/^(\d+(?:\.\d+)?)억(\d+(?:\.\d+)?)만$/);
    if (!m) return NaN;
    if (m[2] && m[2] !== '억' && m[2] !== '만') return Math.round(Number(m[1]) * 1e8 + Number(m[2]) * 1e4); // 1억2000만
    return Math.round(Number(m[1]) * (m[2] === '억' ? 1e8 : m[2] === '만' ? 1e4 : 1));
  }

  // 한 채널(또는 전체)의 하루 계획: 그 날이 속한 달의 목표 ÷ 그 달 일수
  function dayPlan(channels, day) {
    const m = ym(day), n = dim(m);
    let t = 0;
    for (const c of channels) t += C.salesTargetOf(c, m) / n;
    return t;
  }

  // 월 현황 (channel이 null이면 전체 채널). at: 실적 기준일 — 생략하면 판매 자료 마지막 날, 보고서는 보고 종료일과 둘 중 이른 날을 넘긴다
  MD.goalStatus = function (m, channel, at) {
    const d = MD.data, base = C.salesAsOf(), asOf = at && base.date && at < base.date ? at : base.date;
    const chs = channel ? [channel] : d.channels.map((c) => c.name);
    const infos = chs.map((c) => C.targetInfo(c, m));
    const set = infos.filter((x) => x.source !== 'none');
    const target = set.length ? set.reduce((a, x) => a + x.amount, 0) : null;
    const s = monthStart(m), e = monthEnd(m), n = dim(m);
    const upto = !asOf || asOf < s ? null : asOf > e ? e : asOf; // 이 달에서 실적을 본 마지막 날
    const pick = (r) => (channel ? r.channel === channel : true);
    const sales = upto ? C.inRange(d.sales, s, upto).filter(pick) : [];
    const actual = sales.reduce((a, r) => a + r.sales, 0);
    const elapsed = upto ? U.diffDays(s, upto) + 1 : 0;
    const plan = upto && target != null ? (target * elapsed) / n : null; // 균등 배분이므로 목표 × 경과일 ÷ 월 일수
    const remainDays = n - elapsed;
    // 최근 7일 일평균: 7일 모두 자료 기간 안에 있을 때만 (자료가 없는 날을 0으로 보지 않음)
    let run = null;
    if (upto && remainDays > 0 && d.minDate && d.minDate <= U.addDays(upto, -6)) {
      run = C.inRange(d.sales, U.addDays(upto, -6), upto).filter(pick).reduce((a, r) => a + r.sales, 0) / 7;
    }
    const forecast = !upto ? null : remainDays === 0 ? actual : run == null ? null : actual + run * remainDays;
    const st = { m, channel, target, unset: chs.length - set.length, sources: infos, actual, upto, elapsed, days: n, plan, remainDays, run, forecast, confirmed: base.confirmed, unconfirmed: base.unconfirmed };
    st.achieve = target ? actual / target : null;
    st.pace = plan ? actual / plan : null;
    st.gap = plan != null ? plan - actual : null; // + 면 계획보다 부족
    st.remain = target != null ? Math.max(target - actual, 0) : null;
    st.need = target != null && remainDays > 0 ? st.remain / remainDays : null;
    st.fAchieve = target && forecast != null ? forecast / target : null;
    st.status = target == null ? '판정 보류(목표 미설정)' : target === 0 ? '판정 보류(목표 0)' : !upto ? '시작 전' : st.pace >= 1 ? '계획 이상' : '계획 미달';
    st.tone = st.status === '계획 이상' ? 'good' : st.status === '계획 미달' ? (st.pace >= 0.9 ? 'warn' : 'bad') : 'neutral';
    return st;
  };

  // 전사 KPI: 광고비 예산 사용, 이익률 목표 (그 달 1일~기준일)
  MD.goalKpis = function (m, at) {
    const d = MD.data, base = C.salesAsOf().date, asOf = at && base && at < base ? at : base, t = C.targetRow('', m) || {};
    const s = monthStart(m), e = monthEnd(m);
    const upto = !asOf || asOf < s ? null : asOf > e ? e : asOf;
    const cur = upto ? C.period(s, upto) : null;
    const elapsedShare = upto ? (U.diffDays(s, upto) + 1) / dim(m) : 0;
    const noCost = cur ? cur.sales.filter((r) => !(Number((d.productMap[r.sku] || {}).cost) > 0)).reduce((a, r) => a + r.sales, 0) : 0;
    const tLast = upto ? (C.inRange(d.traffic, s, upto).slice(-1)[0] || {}).date : null;
    return {
      // 광고비는 광고 리포트 기준, 리포트가 없을 때만 유입 파일 광고비
      budget: t.adBudget ?? null, spentSrc: cur && cur.sum.adRows ? '광고 리포트' : '유입 파일', spent: cur ? (cur.sum.adRows ? cur.sum.adSpend : cur.sum.ad) : null,
      usage: t.adBudget ? (cur ? (cur.sum.adRows ? cur.sum.adSpend : cur.sum.ad) : 0) / t.adBudget : null, elapsedShare,
      marginTarget: t.margin ?? null, margin: cur ? cur.sum.margin : null, noCost, noCostHold: cur && cur.sum.sales ? noCost / cur.sum.sales >= 0.01 : false, trafficTo: tLast, upto, memo: t.memo || '', updatedAt: t.updatedAt || null,
    };
  };

  // ---------- 비율 KPI: 광고 ROAS·전환율 ----------
  //  - 광고 ROAS = 광고 리포트의 광고 매출(플랫폼 전환 매출) ÷ 광고비. 전사는 광고 리포트가 있는 채널 합계
  //  - 전환율 = 유입 파일의 주문 건수(플랫폼 통계) ÷ 방문수. 판매 파일의 주문수는 상품 행 합계라 참고값만
  //  - 판정은 필요한 값이 1일~기준일 모든 날 확인됨 + [자료 마감 확인]의 확인일이 기준일 이후일 때만
  //  - 비율 목표는 일수 배분하지 않고, 채널 목표가 없으면 전사 목표를 대신 쓰지 않는다
  function chRatio(ch, s, upto) {
    const d = MD.data, days = upto ? U.dateRange(s, upto) : [];
    const tClose = C.closeOf(ch, 'traffic'), aClose = C.closeOf(ch, 'ads');
    // 유입: 날짜별 합산과 확인 표시 (true 확인 · false 파일에 값 없음 · undefined 표시 전 옛 자료)
    const day = new Map();
    for (const t of upto ? C.inRange(d.traffic, s, upto) : []) {
      if (t.channel !== ch) continue;
      const g = day.get(t.date) || { ad: 0, visits: 0, orders: 0, vOk: true, ordOk: true };
      g.ad += t.ad || 0; g.visits += t.visits || 0; g.orders += t.orders || 0;
      for (const k of ['vOk', 'ordOk']) g[k] = g[k] === false || t[k] === false ? false : g[k] === undefined || t[k] === undefined ? undefined : true;
      day.set(t.date, g);
    }
    const miss = { v: 0, o: 0 }, unk = { v: 0, o: 0 };
    let tAd = 0, visits = 0, orders = 0;
    for (const x of days) {
      const g = day.get(x);
      if (!g) { miss.v++; miss.o++; continue; }
      tAd += g.ad; visits += g.visits; orders += g.orders;
      [['vOk', 'v'], ['ordOk', 'o']].forEach(([f, k]) => { if (g[f] === false) miss[k]++; else if (g[f] !== true) unk[k]++; });
    }
    const tUnconf = days.filter((x) => !tClose || x > tClose).length;
    // 광고 리포트
    const adRows = upto ? C.inRange(d.ads, s, upto).filter((r) => r.channel === ch) : [];
    const spend = adRows.reduce((a, r) => a + r.spend, 0);
    const revMiss = adRows.filter((r) => (r.miss || []).includes('revenue')).length;
    const revenue = adRows.reduce((a, r) => a + (r.revenue || 0), 0);
    const everAds = d.ads.some((r) => r.channel === ch); // 광고 리포트가 한 번도 없으면 광고 안 하는 채널로 본다
    const aUnconf = everAds ? days.filter((x) => !aClose || x > aClose).length : 0;
    const rows = upto ? C.inRange(d.sales, s, upto).filter((r) => r.channel === ch) : [];
    const sales = rows.reduce((a, r) => a + r.sales, 0), saleOrders = rows.reduce((a, r) => a + (r.orders || r.qty), 0);
    return {
      ch, days: days.length, spend, revenue, adRows: adRows.length, revMiss, everAds, aClose, aUnconf, tClose, tUnconf,
      ad: tAd, visits, orders, sales, saleOrders, miss, unk,
      roasOk: everAds && !aUnconf && !revMiss, cvrOk: !miss.v && !unk.v && !miss.o && !unk.o && !tUnconf,
    };
  }
  const unconfText = (close, n, name) => (close ? `${name} ${close} 이후 ${n}일 마감 미확인` : `${name} 마감 미확인`);
  function roasWhy(x) {
    if (x.aUnconf) return unconfText(x.aClose, x.aUnconf, '광고 리포트');
    if (x.revMiss) return `광고 매출이 빈 행 ${x.revMiss}개`;
    return '';
  }
  function cvrWhy(x) {
    return [x.miss.v ? `방문수 ${x.miss.v}일 없음` : x.unk.v ? `방문수 출처 미확인 ${x.unk.v}일(유입 파일 재업로드로 해제)` : '',
      x.miss.o || x.unk.o ? '주문 건수 없음(판매 파일 기준 참고값)' : '',
      x.tUnconf ? unconfText(x.tClose, x.tUnconf, '유입 자료') : ''].filter(Boolean).join(' · ');
  }

  function judge(actual, target, okToJudge, why, naText) {
    if (naText) return { actual, target, state: naText, tone: 'neutral' };
    if (!okToJudge) return { actual, target, state: '판정 보류', tone: 'hold', why };
    if (target == null) return { actual, target, state: '목표 미설정', tone: 'neutral' };
    if (actual == null) return { actual, target, state: '계산 불가', tone: 'hold', why: '분모가 0' };
    return { actual, target, diff: actual - target, state: actual >= target ? '목표 이상' : '목표 미달', tone: actual >= target ? 'good' : 'bad' };
  }

  // 채널 하나 또는 전사(channel = null)의 광고 ROAS·전환율 판정. at: 기준일(보고서용)
  MD.ratioStatus = function (m, channel, at) {
    const d = MD.data, base = C.salesAsOf().date, asOf = at && base && at < base ? at : base;
    const s = monthStart(m), e = monthEnd(m);
    const upto = !asOf || asOf < s ? null : asOf > e ? e : asOf;
    const final = upto === e;
    const t = C.targetRow(channel || '', m) || {};
    if (!upto) return { upto, final, roas: { state: '시작 전', tone: 'neutral', target: t.roas ?? null }, cvr: { state: '시작 전', tone: 'neutral', target: t.cvr ?? null } };
    if (channel) {
      const x = chRatio(channel, s, upto);
      const na = !x.everAds ? '광고 리포트 없음' : x.roasOk && x.spend === 0 ? '광고 집행 없음' : null;
      const roas = judge(x.spend > 0 ? x.revenue / x.spend : null, t.roas ?? null, x.roasOk, roasWhy(x), na);
      const cvr = judge(x.cvrOk && x.visits > 0 ? x.orders / x.visits : null, t.cvr ?? null, x.cvrOk, cvrWhy(x), x.cvrOk && x.visits === 0 ? '방문 0 — 계산 불가' : null);
      if (!x.cvrOk && x.visits > 0) cvr.ref = (!x.miss.o && !x.unk.o ? x.orders : x.saleOrders) / x.visits;
      return { upto, final, x, roas, cvr };
    }
    // 전사: 판매·유입·광고 자료가 있는 모든 채널(목록에 없는 채널 포함)
    const names = new Set([...C.inRange(d.sales, s, upto).map((r) => r.channel), ...C.inRange(d.traffic, s, upto).map((r) => r.channel), ...C.inRange(d.ads, s, upto).map((r) => r.channel)]);
    const xs = [...names].map((c) => chRatio(c, s, upto));
    const adCh = xs.filter((x) => x.everAds), adBad = adCh.filter((x) => !x.roasOk);
    const okAd = adCh.filter((x) => x.roasOk);
    const sumS = okAd.reduce((a, x) => a + x.spend, 0), sumR = okAd.reduce((a, x) => a + x.revenue, 0);
    const roas = judge(sumS ? sumR / sumS : null, t.roas ?? null, !adBad.length, `광고 리포트 미확인 채널: ${adBad.map((x) => `${x.ch}(${roasWhy(x)})`).join(', ')}`,
      !adCh.length ? '광고 리포트 없음' : !adBad.length && sumS === 0 ? '광고 집행 없음' : null);
    roas.scope = `광고 리포트 ${okAd.length}개 채널 합계${adBad.length ? ` (미확인 ${adBad.length}개 제외한 참고값)` : ''}`;
    roas.channels = okAd.map((x) => x.ch);
    const okC = xs.filter((x) => x.cvrOk), badC = xs.filter((x) => !x.cvrOk);
    const ov = okC.reduce((a, x) => a + x.visits, 0), oo = okC.reduce((a, x) => a + x.orders, 0);
    const cvr = judge(ov ? oo / ov : null, t.cvr ?? null, !badC.length, `주문 건수·방문수 미확인 채널: ${badC.map((x) => x.ch).join(', ')}`);
    cvr.scope = badC.length ? `확인된 ${okC.length}개 채널 합계 (참고값)` : `${okC.length}개 채널 합계`;
    return { upto, final, xs, roas, cvr };
  };
  // "534% / 목표 500% · +34%p" 형식. 판정은 반올림 전 값으로 하므로, 차이가 작으면 자릿수를 늘린다
  MD.ratioText = function (r, kind) {
    const dg = kind === 'roas' ? 0 : 2;
    const a = r.actual != null ? U.pct(r.actual, dg) : r.ref != null ? `참고 ${U.pct(r.ref, dg)}` : '-';
    const tg = r.target != null ? ` / 목표 ${U.pct(r.target, dg)}` : '';
    let df = '';
    if (r.diff != null) { const p = r.diff * 100, k = Math.abs(p) < (kind === 'roas' ? 1 : 0.01) ? dg + 2 : dg; df = ` · ${p >= 0 ? '+' : ''}${p.toFixed(k)}%p`; }
    return a + tg + df;
  };
  MD.ratioTag = (r) => `<span class="tag ${r.tone}"${r.why ? ` title="${U.esc(r.why)}"` : ''}>${U.esc(r.state)}</span>`;

  // 주차(월~일): 그 달에 걸친 주. 주 계획은 각 날이 속한 달의 목표로 계산하므로 두 달에 걸친 주도 맞게 더해진다
  function weeks(m) {
    const d = MD.data, chs = d.channels.map((c) => c.name), asOf = C.salesAsOf().date;
    const s = monthStart(m), e = monthEnd(m);
    const wd = (U.toDate(s).getUTCDay() + 6) % 7; // 월=0
    const out = [];
    for (let w = U.addDays(s, -wd); w <= e; w = U.addDays(w, 7)) {
      const we = U.addDays(w, 6);
      let plan = 0; for (const day of U.dateRange(w, we)) plan += dayPlan(chs, day);
      const upto = !asOf || asOf < w ? null : asOf > we ? we : asOf;
      const actual = upto ? C.inRange(d.sales, w, upto).reduce((a, r) => a + r.sales, 0) : null;
      let planTo = 0; if (upto) for (const day of U.dateRange(w, upto)) planTo += dayPlan(chs, day);
      out.push({ week: `${w.slice(5).replace('-', '/')}~${we.slice(5).replace('-', '/')}`, start: w, end: we, plan, actual, planTo, done: upto === we, partial: upto && upto !== we, rate: planTo && actual != null ? actual / planTo : null });
    }
    return out;
  }

  // 연 누적: 연간 목표 합계 대비, 그리고 기준일까지 계획 대비
  function ytd(y) {
    const d = MD.data, asOf = C.salesAsOf().date, chs = d.channels.map((c) => c.name);
    let annual = 0, unsetMonths = 0;
    for (let i = 1; i <= 12; i++) { const m = `${y}-${String(i).padStart(2, '0')}`; const st = chs.map((c) => C.targetInfo(c, m)); if (st.every((x) => x.source === 'none')) unsetMonths++; annual += st.reduce((a, x) => a + (x.amount || 0), 0); }
    const upto = !asOf || asOf < `${y}-01-01` ? null : asOf > `${y}-12-31` ? `${y}-12-31` : asOf;
    const actual = upto ? C.inRange(d.sales, `${y}-01-01`, upto).reduce((a, r) => a + r.sales, 0) : 0;
    let plan = 0; if (upto) for (const day of U.dateRange(`${y}-01-01`, upto)) plan += dayPlan(chs, day);
    // 자료가 1월 1일 이전부터 있지 않으면 올해 누적 실적이 일부만 잡힌다
    const partial = d.minDate && d.minDate > `${y}-01-01`;
    return { annual, actual, plan, upto, unsetMonths, partial };
  }

  const toneTag = (st) => `<span class="tag ${st.tone}">${U.esc(st.status)}</span>`;
  const srcTag = (src) => (src === 'default' ? '<span class="tag neutral" title="이 달 목표를 입력하지 않아 채널 기본 월 목표를 썼습니다">기본값</span>' : src === 'none' ? '<span class="tag warn">미설정</span>' : '');

  MD.views.goals = function (el) {
    const d = MD.data;
    const asOf = d.maxDate || U.today();
    // 자료가 바뀌면(업로드·복원·예시 전환) 기준 달을 새 자료 기준일의 달로 되돌린다
    if (!month || seenMax !== d.maxDate) { month = ym(asOf); year = month.slice(0, 4); seenMax = d.maxDate; }
    const st = MD.goalStatus(month);
    const k = MD.goalKpis(month);
    const yt = ytd(month.slice(0, 4));
    const stale = d.maxDate ? U.diffDays(d.maxDate, U.today()) : null;
    const chRows = d.channels.map((c) => ({ ...MD.goalStatus(month, c.name), name: c.name }));
    const rs = MD.ratioStatus(month);
    const rRows = d.channels.map((c) => { const r = MD.ratioStatus(month, c.name); return { name: c.name, ...(r.x || {}), roas: r.roas, cvr: r.cvr }; });
    // 목표 없이 실적만 있는 채널(마스터에 없는 채널 포함)
    const known = new Set(d.channels.map((c) => c.name));
    const orphanSales = st.upto ? [...U.groupBy(C.inRange(d.sales, monthStart(month), st.upto).filter((r) => !known.has(r.channel)), (r) => r.channel).entries()] : [];
    const orphanTargets = d.targets.filter((t) => t.channel && !known.has(t.channel));

    const pctOr = (v, dgt = 1) => (v == null ? '-' : U.pct(v, dgt));
    const gapTxt = st.gap == null ? '' : st.gap > 0 ? `계획보다 <b>${U.krw(st.gap)}원 부족</b>` : `계획보다 <b>${U.krw(-st.gap)}원 초과</b>`;

    el.innerHTML = `
      <div class="row" style="margin-bottom:12px">
        <button class="btn small" id="gPrev" aria-label="이전 달">◀</button>
        <b style="font-size:16px">${month.slice(0, 4)}년 ${label(month)}</b>
        <button class="btn small" id="gNext" aria-label="다음 달">▶</button>
        <span class="muted">실적 기준일 ${st.upto || '-'} (${st.confirmed ? '판매 자료 마감 확인일' : '판매 자료 마지막 날'})</span>
        ${!st.confirmed && st.unconfirmed.length ? `<a class="badge bad" href="#data" title="데이터 관리 → 자료 마감 확인">판매 마감 미확인 ${st.unconfirmed.length}개 채널</a>` : ''}
        <span class="muted" title="${U.won(yt.actual)} / 연간 목표 ${U.won(yt.annual)}">· ${month.slice(0, 4)}년 누적 ${yt.annual ? U.pct(yt.actual / yt.annual) : '-'} (기준일까지 계획 대비 ${yt.plan ? U.pct(yt.actual / yt.plan) : '-'}${yt.partial ? ', 1월 자료 일부 없음' : ''}${yt.unsetMonths ? `, 목표 없는 달 ${yt.unsetMonths}개` : ''})</span>
        ${stale != null && stale > 3 ? `<span class="badge bad">자료가 오늘보다 ${stale}일 늦음</span>` : ''}
        <span class="spacer"></span>
        <button class="btn small" id="gToInput">목표 입력으로</button>
      </div>
      <div class="kpis kpis-4">
        <div class="kpi"><div class="k">월 목표 달성률</div><div class="v">${pctOr(st.achieve)}</div>
          <div class="s">실적 ${U.krw(st.actual)}원 / 월 목표 ${st.target == null ? '미설정' : U.krw(st.target) + '원'}</div>${st.achieve != null ? `<div class="bar-track" title="경과율 ${U.pct(st.elapsed / st.days, 0)}"><div class="bar-fill" style="width:${Math.min(100, st.achieve * 100)}%"></div><div class="bar-mark" style="left:${(st.elapsed / st.days) * 100}%"></div></div>` : ''}</div>
        <div class="kpi"><div class="k">기준일까지 계획 대비</div><div class="v" style="color:var(--${st.tone === 'neutral' ? 'ink' : st.tone})">${pctOr(st.pace)}</div><div class="s">${toneTag(st)} ${gapTxt}</div></div>
        <div class="kpi"><div class="k">남은 기간 필요 일매출</div><div class="v">${st.need == null ? '-' : st.remain === 0 ? '월 목표 달성' : U.krw(st.need) + '원'}</div><div class="s">${st.remainDays}일 남음 · 최근 7일 평균 ${st.run == null ? '관측 부족' : U.krw(st.run) + '원'}</div></div>
        <div class="kpi"><div class="k">월말 예상 (참고)</div><div class="v">${st.forecast == null ? '-' : U.krw(st.forecast) + '원'}</div><div class="s">${st.fAchieve == null ? (st.remainDays === 0 ? '월 마감' : '관측 부족') : `예상 달성률 ${U.pct(st.fAchieve)}`}</div></div>
      </div>
      <div class="kpis kpis-4" style="margin-top:12px">
        <div class="kpi"><div class="k">광고 ROAS (광고 매출 ÷ 광고비)</div><div class="v">${rs.roas.actual == null ? '-' : U.pct(rs.roas.actual, 0)}</div>
          <div class="s">${MD.ratioTag(rs.roas)} ${rs.roas.target != null ? `목표 ${U.pct(rs.roas.target, 0)}${rs.roas.diff != null ? ` · ${MD.ratioText(rs.roas, 'roas').split(' · ')[1]}` : ''}` : ''}</div>
          <div class="s" style="margin-top:2px">${U.esc(rs.roas.scope || '')} · 플랫폼 광고 리포트 기준 · <a href="#ads">광고 성과</a></div></div>
        <div class="kpi"><div class="k">전환율 (주문 건수 ÷ 방문)</div><div class="v">${rs.cvr.actual == null ? '-' : U.pct(rs.cvr.actual, 2)}</div>
          <div class="s">${MD.ratioTag(rs.cvr)} ${rs.cvr.target != null ? `목표 ${U.pct(rs.cvr.target, 2)}${rs.cvr.diff != null ? ` · ${MD.ratioText(rs.cvr, 'cvr').split(' · ')[1]}` : ''}` : ''}</div>
          <div class="s" style="margin-top:2px">${U.esc(rs.cvr.scope || '')}${rs.final ? ' · 월 최종' : ' · 월 누적'}</div></div>
        <div class="kpi"><div class="k">이익률 목표</div><div class="v">${pctOr(k.margin)}</div><div class="s">${k.marginTarget == null ? '목표 미설정' : k.noCostHold ? `목표 ${U.pct(k.marginTarget)} · <span class="tag warn">판정 보류: 원가 미입력 매출 ${U.krw(k.noCost)}원</span>` : `목표 ${U.pct(k.marginTarget)} · ${k.margin == null ? '' : `${k.margin - k.marginTarget >= 0 ? '+' : ''}${((k.margin - k.marginTarget) * 100).toFixed(1)}%p`}${k.noCost ? ` · 원가 미입력 매출 ${U.krw(k.noCost)}원 포함` : ''}`}</div></div>
        <div class="kpi"><div class="k">광고비 예산 사용</div><div class="v">${pctOr(k.usage)}</div><div class="s">${k.budget == null ? '예산 미설정' : `${U.krw(k.spent)}원(${k.spentSrc}) / 예산 ${U.krw(k.budget)}원 · 경과율 ${U.pct(k.elapsedShare, 0)}`}${k.budget === 0 && k.spent > 0 ? ' · <span class="tag bad">예산 0인데 지출</span>' : k.usage != null && k.usage > k.elapsedShare + 0.05 ? ' · <span class="tag warn">경과율보다 빨리 쓰는 중</span>' : ''}</div></div>
      </div>
      ${rs.roas.tone === 'hold' || rs.cvr.tone === 'hold' ? `<div class="note">판정 보류 사유 — ${[rs.roas.tone === 'hold' ? `ROAS: ${U.esc(rs.roas.why)}` : '', rs.cvr.tone === 'hold' ? `전환율: ${U.esc(rs.cvr.why)}` : ''].filter(Boolean).join(' / ')}</div>` : ''}
      ${st.unset || orphanSales.length ? `<div class="note">${st.unset ? `목표 미설정 채널 ${st.unset}개는 월 목표 합계에서 빠졌습니다. ` : ''}${orphanSales.length ? `채널 목록에 없는 채널의 실적 ${orphanSales.map(([c, rs]) => `${U.esc(c)} ${U.krw(rs.reduce((a, r) => a + r.sales, 0))}원`).join(', ')}은 전체 실적에는 들어가지만 목표가 없습니다.` : ''}</div>` : ''}

      <div class="grid g3" style="margin-top:16px">
        <div class="card span2"><div class="card-head"><h2>누적 실적 vs 누적 계획</h2><span class="muted">일수 균등 배분</span></div>
          ${MD.legend([{ label: '누적 계획', color: 'var(--compare)', dashed: true }, { label: '누적 실적', color: MD.colorOf(0) }, { label: '월말 예상 (참고)', color: MD.colorOf(1), dashed: true }])}
          <div class="chart-box"><canvas id="gBurn"></canvas></div></div>
        <div class="card"><div class="card-head"><h2>주차별 달성</h2><span class="muted">월~일</span></div><div id="gWeek"></div>
          <div class="note">진행 중인 주는 기준일까지의 계획과 비교합니다. 두 달에 걸친 주는 각 날짜가 속한 달의 목표로 계획을 냅니다.</div></div>
      </div>

      <div class="card"><div class="card-head"><h2>채널별 달성 현황</h2><span class="muted">기준일까지 부족액이 큰 순</span></div><div id="gCh"></div>
        <div class="note">부족액 = 기준일까지 계획 − 누적 실적. 비율보다 금액 영향이 큰 채널부터 보세요. 매출 미달을 곧바로 광고 확대로 잇지 말고 이익률·광고비·품절·행사를 함께 확인하세요.</div></div>

      <div class="card"><div class="card-head"><h2>채널별 광고 ROAS·전환율</h2><span class="muted">${rs.final ? '월 최종' : `${month.slice(5)}/1 ~ ${(rs.upto || '').slice(5).replace('-', '/')} 누적`} · 채널 목표가 없으면 전사 목표로 판정하지 않음</span></div><div id="gRatio"></div>
        <div class="note">광고 ROAS = 광고 리포트의 광고 매출 ÷ 광고비. 전환율 = 유입 파일의 주문 건수 ÷ 방문수. 판매 파일의 주문수는 상품 행마다 세어 한 주문이 여러 번 셀 수 있어 '참고'로만 보여 줍니다. 판정은 [데이터 관리 → 자료 마감 확인]의 확인일까지 자료가 있을 때만 합니다.</div></div>

      <div class="card" id="gInput">
        <div class="card-head"><h2>목표 입력</h2>
          <div class="seg"><button data-w="0" class="${!wide ? 'on' : ''}">분기</button><button data-w="1" class="${wide ? 'on' : ''}">1년</button></div>
          <select id="gYear">${[...new Set([Number(asOf.slice(0, 4)) - 1, Number(asOf.slice(0, 4)), Number(asOf.slice(0, 4)) + 1, Number(year)])].sort().map((y) => `<option ${String(y) === year ? 'selected' : ''}>${y}</option>`).join('')}</select>
        </div>
        <div id="gGrid"></div>
        <div class="row" style="margin-top:12px">
          <label>전년 같은 달 실적 × (1 + <input type="number" id="gGrow" value="10" style="width:70px">%)</label><button class="btn small" id="gFillLY">보이는 달의 빈 칸 채우기</button>
          <span class="spacer"></span>
          <label><select id="gSrc"></select> 값을</label><button class="btn small" id="gCopy">이후 달 빈 칸에 복사</button>
          <label><input type="checkbox" id="gOver"> 입력한 칸도 덮어쓰기</label>
        </div>
        <div class="row" style="margin-top:8px">
          <button class="btn small" id="gFreeze">지난 달까지 기본값을 월 목표로 고정</button>
          <span class="muted" style="font-size:12px">채널 기본 월 목표(데이터 관리)를 바꾸면 월 목표를 입력하지 않은 지난 달의 달성률도 바뀝니다. 바꾸기 전에 고정하세요.</span>
        </div>
        <div class="note">매출 목표는 VAT 포함 실결제액 기준(판매 자료와 같은 기준)입니다. 빈 칸은 회색 글씨의 채널 기본 월 목표를 씁니다. 전사 매출 목표는 채널 목표의 합입니다. 이익률 목표는 (순매출 − 수수료 − 원가) ÷ 순매출, 광고비 예산은 광고 리포트 금액 기준입니다.</div>
      </div>
      ${orphanTargets.length ? `<div class="card"><div class="card-head"><h2>연결이 끊긴 목표</h2><span class="muted">채널 이름을 바꾸거나 지워서 채널 목록에 없는 목표</span></div><div id="gOrphan"></div></div>` : ''}`;

    el.querySelector('#gToInput').onclick = () => el.querySelector('#gInput').scrollIntoView({ behavior: 'smooth' });
    el.querySelector('#gPrev').onclick = () => { month = addMonth(month, -1); MD.rerender(); };
    el.querySelector('#gNext').onclick = () => { month = addMonth(month, 1); MD.rerender(); };

    // 번업 차트
    const days = U.dateRange(monthStart(month), monthEnd(month));
    const chs = d.channels.map((c) => c.name);
    const daily = new Map(); if (st.upto) for (const r of C.inRange(d.sales, monthStart(month), st.upto)) daily.set(r.date, (daily.get(r.date) || 0) + r.sales);
    let cp = 0, ca = 0, cf = 0;
    const planS = [], actS = [], fcS = [];
    days.forEach((day) => {
      cp += dayPlan(chs, day); planS.push(st.target == null ? null : cp);
      if (st.upto && day <= st.upto) { ca += daily.get(day) || 0; actS.push(ca); fcS.push(day === st.upto && st.run != null ? ca : null); cf = ca; }
      else { actS.push(null); if (st.run != null && st.upto && day > st.upto) { cf += st.run; fcS.push(cf); } else fcS.push(null); }
    });
    MD.charts.line(el.querySelector('#gBurn'), days.map((x) => x.slice(5).replace('-', '/')), [
      { label: '누적 계획', data: planS, color: getComputedStyle(document.documentElement).getPropertyValue('--compare').trim(), dashed: true },
      { label: '누적 실적', data: actS, color: MD.colorOf(0) },
      { label: '월말 예상', data: fcS, color: MD.colorOf(1), dashed: true },
    ], U.krw);

    MD.table(el.querySelector('#gWeek'), {
      cols: [
        { key: 'week', label: '주', fmt: (v, r) => v + (r.partial ? ' (진행)' : '') },
        { key: 'plan', label: '주 계획', num: true, money: true, fmt: (v) => U.krw(v), xfmt: (v) => Math.round(v) },
        { key: 'actual', label: '실적', num: true, money: true, fmt: (v) => (v == null ? '-' : U.krw(v)), xfmt: (v) => (v == null ? '' : Math.round(v)) },
        { key: 'rate', label: '계획 대비율', num: true, html: true, fmt: (v) => (v == null ? '-' : `<span class="delta ${v >= 1 ? 'good' : v >= 0.9 ? 'flat' : 'bad'}">${U.pct(v)}</span>`), xfmt: (v) => v },
      ],
      rows: weeks(month), exportName: `주차별달성_${month}`,
    });

    MD.table(el.querySelector('#gCh'), {
      cols: [
        { key: 'name', label: '채널', html: true, fmt: (v, r) => `<a href="#channels" data-ch="${U.esc(v)}">${U.esc(v)}</a> ${srcTag(r.sources[0].source)}`, xfmt: (v) => v },
        { key: 'target', label: '월 목표', num: true, money: true, fmt: (v) => (v == null ? '-' : U.krw(v)), xfmt: (v) => v },
        { key: 'actual', label: '실적', num: true, money: true, fmt: (v) => U.krw(v), xfmt: (v) => Math.round(v) },
        { key: 'achieve', label: '월 목표 달성률', num: true, fmt: (v) => pctOr(v), xfmt: (v) => v },
        { key: 'plan', label: '기준일까지 계획', num: true, money: true, fmt: (v) => (v == null ? '-' : U.krw(v)), xfmt: (v) => (v == null ? '' : Math.round(v)) },
        { key: 'pace', label: '계획 대비율', num: true, fmt: (v) => pctOr(v), xfmt: (v) => v },
        { key: 'gap', label: '부족액(−는 초과)', num: true, money: true, html: true, fmt: (v) => (v == null ? '-' : `<span class="delta ${v > 0 ? 'bad' : 'good'}">${U.krw(v)}</span>`), xfmt: (v) => (v == null ? '' : Math.round(v)) },
        { key: 'need', label: '필요 일매출', num: true, money: true, fmt: (v, r) => (v == null ? '-' : r.remain === 0 ? '달성' : U.krw(v)), xfmt: (v) => (v == null ? '' : Math.round(v)) },
        { key: 'forecast', label: '월말 예상', num: true, money: true, fmt: (v) => (v == null ? '-' : U.krw(v)), xfmt: (v) => (v == null ? '' : Math.round(v)) },
        { key: 'status', label: '판정', html: true, fmt: (v, r) => toneTag(r), xfmt: (v) => v },
      ],
      rows: chRows, total: { name: '합계', ...st, sources: [{ source: 'month' }] }, sortKey: 'gap', exportName: `채널별목표달성_${month}`,
    });
    el.querySelector('#gCh').addEventListener('click', (e) => { const a = e.target.closest('a[data-ch]'); if (a) { e.preventDefault(); MD.focusChannel(a.dataset.ch); } });

    MD.table(el.querySelector('#gRatio'), {
      cols: [
        { key: 'name', label: '채널', html: true, fmt: (v) => `<a href="#channels" data-ch="${U.esc(v)}">${U.esc(v)}</a>`, xfmt: (v) => v },
        { key: 'spend', label: '광고비(리포트)', num: true, money: true, fmt: (v, r) => (r.everAds ? U.krw(v) : '-'), xfmt: (v) => v },
        { key: 'revenue', label: '광고 매출', num: true, money: true, fmt: (v, r) => (r.everAds ? U.krw(v) : '-'), xfmt: (v) => v },
        { key: 'roasA', label: 'ROAS 실적 / 목표', num: true, html: true, fmt: (v, r) => MD.ratioText(r.roas, 'roas'), xfmt: (v, r) => (r.roas.actual == null ? '' : r.roas.actual) },
        { key: 'roasS', label: 'ROAS 판정', html: true, fmt: (v, r) => MD.ratioTag(r.roas) + (r.roas.why ? `<br><span class="muted" style="font-size:11px">${U.esc(r.roas.why)}</span>` : ''), xfmt: (v, r) => r.roas.state + (r.roas.why ? ` (${r.roas.why})` : '') },
        { key: 'visits', label: '방문', num: true, fmt: (v) => (v == null ? '-' : U.num(v)) },
        { key: 'orders', label: '주문 건수', num: true, fmt: (v, r) => (r.cvr && r.cvr.actual != null ? U.num(v) : '-') },
        { key: 'cvrA', label: '전환율 실적 / 목표', num: true, html: true, fmt: (v, r) => MD.ratioText(r.cvr, 'cvr'), xfmt: (v, r) => (r.cvr.actual == null ? '' : r.cvr.actual) },
        { key: 'cvrS', label: '전환율 판정', html: true, fmt: (v, r) => MD.ratioTag(r.cvr) + (r.cvr.why ? `<br><span class="muted" style="font-size:11px">${U.esc(r.cvr.why)}</span>` : ''), xfmt: (v, r) => r.cvr.state + (r.cvr.why ? ` (${r.cvr.why})` : '') },
      ],
      rows: rRows, sortKey: 'spend', exportName: `채널별ROAS전환율_${month}`,
    });
    el.querySelector('#gRatio').addEventListener('click', (e) => { const a = e.target.closest('a[data-ch]'); if (a) { e.preventDefault(); MD.focusChannel(a.dataset.ch); } });

    // 목표 입력표
    const q = Math.floor((Number(month.slice(5)) - 1) / 3);
    const months = (wide ? [...Array(12).keys()] : [q * 3, q * 3 + 1, q * 3 + 2]).map((i) => `${year}-${String(i + 1).padStart(2, '0')}`);
    const cur = ym(asOf);
    const cellIn = (m, ch) => {
      const t = C.targetRow(ch, m), info = C.targetInfo(ch, m);
      const ph = info.source === 'default' ? U.num(info.amount) : '미설정';
      return `<input type="text" inputmode="numeric" class="num" data-m="${m}" data-c="${U.esc(ch)}" data-f="sales" value="${t && t.sales != null ? U.num(t.sales) : ''}" placeholder="${ph}" aria-label="${U.esc(ch)} ${label(m)} 매출 목표">`;
    };
    // 비율 목표 입력칸: %로 보여 주고 %로 받는다 (ROAS 5.0 → 500)
    const pctIn = (m, ch, f) => { const v = (C.targetRow(ch, m) || {})[f]; return `<input type="text" inputmode="decimal" class="num" data-m="${m}" data-c="${U.esc(ch)}" data-f="${f}" value="${v != null ? Math.round(v * 10000) / 100 : ''}" placeholder="미설정" aria-label="${U.esc(ch || '전사')} ${label(m)} ${f === 'roas' ? 'ROAS' : '전환율'} 목표(%)">`; };
    const chSet = d.channels.reduce((a, c) => a + months.reduce((b, m) => { const t = C.targetRow(c.name, m) || {}; return b + (t.roas != null) + (t.cvr != null); }, 0), 0);
    const tot = (m) => d.channels.reduce((a, c) => a + (C.targetInfo(c.name, m).amount || 0), 0);
    const co = (m) => C.targetRow('', m) || {};
    el.querySelector('#gGrid').innerHTML = `<div class="table-wrap"><table class="goal-grid">
      <thead><tr><th>채널 (매출 목표, 원)</th>${months.map((m) => `<th class="num ${m === cur ? 'cur' : ''}">${label(m)}${m === cur ? ' · 이번 달' : ''}</th>`).join('')}</tr></thead>
      <tbody>${d.channels.map((c) => `<tr><td>${U.esc(c.name)}</td>${months.map((m) => `<td class="${m === cur ? 'cur' : ''}">${cellIn(m, c.name)}</td>`).join('')}</tr>`).join('') || `<tr><td colspan="${months.length + 1}" class="muted">채널이 없습니다. 데이터 관리에서 채널을 먼저 등록하세요.</td></tr>`}</tbody>
      <tfoot>
        <tr class="total"><td>전사 매출 목표 (합계)</td>${months.map((m) => `<td class="num ${m === cur ? 'cur' : ''}" title="${U.won(tot(m))}">${U.krw(tot(m))}</td>`).join('')}</tr>
        <tr><td>이익률 목표 (%)</td>${months.map((m) => `<td class="${m === cur ? 'cur' : ''}"><input type="number" min="0" max="100" step="0.5" data-m="${m}" data-c="" data-f="margin" value="${co(m).margin != null ? Math.round(co(m).margin * 1000) / 10 : ''}" placeholder="미설정" aria-label="${label(m)} 이익률 목표"></td>`).join('')}</tr>
        <tr><td title="광고 리포트가 있는 채널 합계의 광고 매출 ÷ 광고비">광고 ROAS 목표 (%, 전사)</td>${months.map((m) => `<td class="${m === cur ? 'cur' : ''}">${pctIn(m, '', 'roas')}</td>`).join('')}</tr>
        <tr><td>전환율 목표 (%, 전사)</td>${months.map((m) => `<td class="${m === cur ? 'cur' : ''}">${pctIn(m, '', 'cvr')}</td>`).join('')}</tr>
        <tr><td>광고비 예산 (원)</td>${months.map((m) => `<td class="${m === cur ? 'cur' : ''}"><input type="text" inputmode="numeric" class="num" data-m="${m}" data-c="" data-f="adBudget" value="${co(m).adBudget != null ? U.num(co(m).adBudget) : ''}" placeholder="미설정" aria-label="${label(m)} 광고비 예산"></td>`).join('')}</tr>
        <tr><td>목표 근거 메모</td>${months.map((m) => `<td class="${m === cur ? 'cur' : ''}"><input type="text" data-m="${m}" data-c="" data-f="memo" value="${U.esc(co(m).memo || '')}" placeholder="예: 전년 +10%, 행사 반영" title="${co(m).updatedAt ? '마지막 수정 ' + co(m).updatedAt.slice(0, 16).replace('T', ' ') : ''}" aria-label="${label(m)} 목표 근거 메모"></td>`).join('')}</tr>
      </tfoot></table></div>
      <details style="margin-top:10px" ${openCh ? 'open' : ''} id="gChDet"><summary>채널별 ROAS·전환율 목표 (설정 ${chSet}/${d.channels.length * months.length * 2}칸)</summary>
        <div class="table-wrap" style="margin-top:8px"><table class="goal-grid"><thead><tr><th>채널 · 지표 (%)</th>${months.map((m) => `<th class="num ${m === cur ? 'cur' : ''}">${label(m)}</th>`).join('')}</tr></thead>
        <tbody>${d.channels.map((c) => [['roas', 'ROAS'], ['cvr', '전환율']].map(([f, nm]) => `<tr><td>${U.esc(c.name)} · ${nm}</td>${months.map((m) => `<td class="${m === cur ? 'cur' : ''}">${pctIn(m, c.name, f)}</td>`).join('')}</tr>`).join('')).join('')}</tbody></table></div>
        <div class="note">%로 입력합니다: ROAS 500은 500%, 전환율 3은 3%. 채널 칸이 비어 있으면 그 채널은 '목표 미설정'으로 두고 전사 목표를 대신 쓰지 않습니다.</div>
      </details>`;
    el.querySelector('#gChDet').ontoggle = (e) => { openCh = e.target.open; };
    el.querySelectorAll('#gGrid input').forEach((inp) => (inp.onchange = () => {
      const f = inp.dataset.f, raw = inp.value.trim(), isPct = f === 'margin' || f === 'roas' || f === 'cvr';
      let v = raw === '' ? null : f === 'memo' ? raw : isPct ? Number(raw.replace('%', '')) : parseWon(raw);
      if (v != null && isPct && (!Number.isFinite(v) || v < 0 || ((f === 'roas' || f === 'cvr') && v === 0))) { U.toast(f === 'margin' ? '0 이상의 %를 입력하세요.' : '0보다 큰 %를 입력하세요. 예: ROAS 500, 전환율 3', 'bad'); inp.value = ''; return; }
      if (v != null && !isPct && f !== 'memo' && (!Number.isFinite(v) || v < 0)) { U.toast('0 이상의 금액을 입력하세요. 예: 62,000,000 · 6200만 · 1.2억', 'bad'); inp.value = ''; return; }
      if (isPct && v != null) v = v / 100;
      if (inp.closest('#gChDet')) openCh = true; // 채널별 목표를 고치는 중이면 다시 그려도 펼친 채로
      C.setTarget(inp.dataset.m, inp.dataset.c, f, v);
      MD.store.save(['targets']);
      const y = window.scrollY; MD.rerender(); window.scrollTo(0, y);
    }));
    el.querySelectorAll('[data-w]').forEach((b) => (b.onclick = () => { wide = b.dataset.w === '1'; MD.rerender(); }));
    el.querySelector('#gYear').onchange = (e) => { year = e.target.value; if (month.slice(0, 4) !== year) month = `${year}-${month.slice(5)}`; MD.rerender(); };
    const src = el.querySelector('#gSrc');
    src.innerHTML = months.map((m) => `<option value="${m}" ${m === (months.includes(cur) ? cur : months[0]) ? 'selected' : ''}>${label(m)}</option>`).join('');

    const apply = (changes, what) => {
      if (!changes.length) { U.toast('바꿀 칸이 없습니다.'); return; }
      const sum = changes.reduce((a, x) => a + x.v, 0);
      if (!confirm(`${what}: ${changes.length}칸, 합계 ${U.won(sum)}을 입력합니다. 계속할까요?`)) return;
      changes.forEach((x) => C.setTarget(x.m, x.c, 'sales', x.v));
      MD.store.save(['targets']); MD.rerender(); U.toast(`${changes.length}칸을 입력했습니다.`);
    };
    el.querySelector('#gFillLY').onclick = () => {
      const g = Number(el.querySelector('#gGrow').value) || 0, out = [], skip = [];
      for (const m of months) {
        const ly = `${Number(m.slice(0, 4)) - 1}${m.slice(4)}`;
        // 전년 그 달 자료가 처음부터 끝까지 있어야 쓴다 (일부만 있으면 목표가 낮게 잡힘)
        const full = d.minDate && d.minDate <= monthStart(ly) && d.maxDate >= monthEnd(ly);
        for (const c of d.channels) {
          const t = C.targetRow(c.name, m);
          if (t && t.sales != null) continue;
          if (!full) { skip.push(label(m)); continue; }
          const a = C.inRange(d.sales, monthStart(ly), monthEnd(ly)).filter((r) => r.channel === c.name).reduce((x, r) => x + r.sales, 0);
          if (a > 0) out.push({ m, c: c.name, v: Math.round((a * (1 + g / 100)) / 100000) * 100000 });
        }
      }
      if (skip.length && !out.length) { U.toast(`전년 자료가 한 달 전체로 없는 달이라 채우지 않았습니다: ${[...new Set(skip)].join(', ')}`, 'bad'); return; }
      apply(out, `전년 실적 × ${100 + g}%`);
    };
    el.querySelector('#gCopy').onclick = () => {
      const from = src.value, over = el.querySelector('#gOver').checked, out = [];
      for (let m = addMonth(from, 1); m.slice(0, 4) === from.slice(0, 4); m = addMonth(m, 1)) {
        for (const c of d.channels) {
          const s0 = C.targetRow(c.name, from); if (!s0 || s0.sales == null) continue;
          const t = C.targetRow(c.name, m); if (!over && t && t.sales != null) continue;
          out.push({ m, c: c.name, v: s0.sales });
        }
      }
      apply(out, `${label(from)} 값 복사${over ? ' (덮어쓰기)' : ''}`);
    };
    el.querySelector('#gFreeze').onclick = () => {
      const out = [];
      for (let m = `${year}-01`; m < cur && m.slice(0, 4) === year; m = addMonth(m, 1)) {
        for (const c of d.channels) { const info = C.targetInfo(c.name, m); if (info.source === 'default') out.push({ m, c: c.name, v: info.amount }); }
      }
      apply(out, '기본값 고정');
    };

    if (orphanTargets.length) {
      const box = el.querySelector('#gOrphan');
      box.innerHTML = `<div class="table-wrap"><table><thead><tr><th>채널(이전 이름)</th><th>월</th><th class="num">매출 목표</th><th></th></tr></thead><tbody>${orphanTargets.map((t, i) => `<tr><td>${U.esc(t.channel)}</td><td>${t.month}</td><td class="num">${t.sales == null ? '-' : U.won(t.sales)}</td>
        <td class="actions"><select data-oi="${i}"><option value="">옮길 채널 선택</option>${d.channels.map((c) => `<option>${U.esc(c.name)}</option>`).join('')}</select> <button class="btn small danger" data-od="${i}">삭제</button></td></tr>`).join('')}</tbody></table></div>`;
      box.querySelectorAll('[data-oi]').forEach((s) => (s.onchange = () => {
        const t = orphanTargets[Number(s.dataset.oi)], to = s.value; if (!to) return;
        const ex = C.targetRow(to, t.month);
        if (ex && ex.sales != null && !confirm(`${to} ${t.month}에 이미 목표(${U.won(ex.sales)})가 있습니다. 덮어쓸까요?`)) { s.value = ''; return; }
        d.targets = d.targets.filter((x) => x !== t);
        C.setTarget(t.month, to, 'sales', t.sales ?? null);
        MD.store.save(['targets']); MD.rerender();
      }));
      box.querySelectorAll('[data-od]').forEach((b) => (b.onclick = () => { const t = orphanTargets[Number(b.dataset.od)]; d.targets = d.targets.filter((x) => x !== t); MD.store.save(['targets']); MD.rerender(); }));
    }
  };
})();
