// 상급자 보고용 1장 보고서: 인쇄·PDF, 메신저 텍스트, 엑셀
//  - 보고서 종류(분리 4단계): MD 보고서(매출·이익·상품·재고) / 광고 보고서(광고비·광고 ROAS·채널·캠페인·순위). 기본은 작업 공간을 따른다
//  - 확정본: 새로 저장하는 것에만 종류(type)·양식 버전(form: 2)을 남긴다. 종류가 없는 예전 확정본은 '기존 통합 보고서'로 그대로 보여 준다
//  - 다음 액션 초안은 종류별로 따로 저장한다(키에 종류 포함). MD 보고서는 예전 키(종류 없음)에 남은 문구를 이어서 쓴다
(function () {
  const U = MD.util, C = MD.calc;
  let rtype = null, seenSpace;
  const TYPE_NAME = { md: 'MD 보고서', ad: '광고 보고서' };
  const typeOf = (snap) => (snap.type === 'md' || snap.type === 'ad' ? snap.type : null); // null = 종류 구분 전 확정본
  const typeName = (snap) => TYPE_NAME[typeOf(snap)] || '기존 통합 보고서';
  const actKey = (T, st) => `reportActions:${T}:${st.start}${st.end}`;
  const readActions = (T, st, def) => {
    const v = U.store.get(actKey(T, st), null);
    if (v != null) return v;
    return T === 'md' ? U.store.get('reportActions:' + st.start + st.end, def) : def; // 종류 구분 전 문구는 MD 보고서가 이어받는다
  };
  // 노출·클릭·전환은 그 값이 있는 행만 합산 (광고 성과 화면과 같은 규칙)
  function adExtra(rows) {
    const has = (r, f) => r[f] != null && !(r.miss || []).includes(f);
    const sum = (l, f) => l.reduce((a, r) => a + (r[f] || 0), 0);
    const ic = rows.filter((r) => has(r, 'imp') && has(r, 'clicks')), ck = rows.filter((r) => has(r, 'clicks')), cv = rows.filter((r) => has(r, 'conv'));
    return {
      hasImp: ic.length > 0, hasClk: ck.length > 0, hasConv: cv.length > 0,
      imp: sum(ic, 'imp'), ctr: sum(ic, 'imp') ? sum(ic, 'clicks') / sum(ic, 'imp') : null,
      clicks: sum(ck, 'clicks'), cpc: sum(ck, 'clicks') ? sum(ck, 'spend') / sum(ck, 'clicks') : null,
      conv: sum(cv, 'conv'), cpa: sum(cv, 'conv') ? sum(cv, 'spend') / sum(cv, 'conv') : null,
    };
  }

  // 확정본 본문은 이 앱이 만든 HTML이지만 백업 파일로 들어올 수도 있으므로 그릴 때 스크립트·이벤트 속성·외부 링크를 지운다
  function cleanHtml(html) {
    const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
    doc.querySelectorAll('script,iframe,object,embed,link,meta,style,form,input,button,textarea,select').forEach((n) => n.remove());
    doc.querySelectorAll('*').forEach((n) => {
      for (const a of [...n.attributes]) {
        const v = a.value.trim().toLowerCase();
        if (a.name.startsWith('on') || ((a.name === 'href' || a.name === 'src' || a.name === 'xlink:href') && !(v.startsWith('data:image/') || v.startsWith('#')))) n.removeAttribute(a.name);
      }
    });
    return doc.body.firstChild.innerHTML;
  }
  const localTime = (iso) => new Date(iso).toLocaleString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });

  // 확정본 보기: 저장 당시 본문 그대로 + 같은 기간 현재 자료와의 매출 차이 + 수정 문구
  function viewSnapshot(el, snap) {
    // 광고 보고서는 광고비가 기준, MD·기존 통합 보고서는 매출이 기준
    const isAd = typeOf(snap) === 'ad', mainKey = isAd ? 'adSpend' : 'sales', mainLabel = isAd ? '광고비' : '매출';
    const now = C.period(snap.start, snap.end).sum, diff = now[mainKey] - ((snap.nums && snap.nums[mainKey]) || 0);
    // 매출이 같아도 원가·수수료·광고비 기준이 바뀌면 이익이 달라진다 — 확정본에 저장된 값과 비교 (개선 7단계)
    const others = isAd ? [['adRev', '광고 매출'], ['sales', '매출']] : [['gross', '매출총이익'], ['contrib', '공헌이익'], ['adSpend', '광고비']];
    const otherDiffs = others.filter(([k]) => snap.nums && Number.isFinite(snap.nums[k]) && Math.abs((now[k] || 0) - snap.nums[k]) >= 1)
      .map(([k, label]) => `${label} ${now[k] - snap.nums[k] > 0 ? '+' : ''}${U.won(now[k] - snap.nums[k])}`);
    const notes = (Array.isArray(snap.notes) ? snap.notes : []).filter((n) => n && typeof n.text === 'string'); // 복원 검사를 통과했어도 그릴 때 한 번 더
    el.innerHTML = `
      <div class="row no-print" style="margin-bottom:14px">
        <button class="btn" id="sBack">← 현재 보고서로</button>
        <span class="spacer"></span>
        <button class="btn" id="sNote">수정 문구 추가</button>
        <button class="btn primary" id="sPrint">인쇄 · PDF 저장</button>
      </div>
      <div class="card no-print" style="border-color:var(--accent);margin-bottom:14px">
        <b>확정본</b> · ${typeName(snap)} · 저장 ${localTime(snap.at)}${snap.memo ? ` · ${U.esc(snap.memo)}` : ''} — 저장 뒤 자료가 바뀌어도 이 내용은 바뀌지 않습니다.
        <div class="muted" style="font-size:12px;margin-top:4px">같은 기간(${U.esc(snap.start)} ~ ${U.esc(snap.end)}) 현재 자료 ${mainLabel} ${U.won(now[mainKey])} · ${Math.abs(diff) < 1 ? '확정본과 일치' : `확정본 대비 <b style="color:var(--warn)">${diff > 0 ? '+' : ''}${U.won(diff)}</b> (확정 뒤 자료가 추가·수정됨)`}${otherDiffs.length ? ` · <b style="color:var(--warn)">${isAd ? '광고 매출·매출' : '이익·광고비'} 변경 있음</b>(${otherDiffs.join(', ')} — ${isAd ? '광고 리포트나 판매 자료가 바뀜' : '원가·수수료·계산 기준이나 광고 자료가 바뀜'})` : ` · ${isAd ? '광고 매출·매출' : '이익·광고비'}도 일치`}${snap.confirmed === false ? ` · 확정 당시 ${isAd ? '광고 리포트' : '판매 자료'} 마감 미확인 채널 ${(snap.unconfirmed || []).length}개` : ''}</div>
      </div>
      <div class="report">${cleanHtml(snap.html)}
        ${notes.length ? `<h2>수정 문구</h2><ul>${notes.map((n) => `<li>${localTime(n.at)} — ${U.esc(n.text)}</li>`).join('')}</ul>` : ''}
      </div>`;
    el.querySelector('#sBack').onclick = () => { MD.state.reportSnap = null; MD.rerender(); };
    el.querySelector('#sPrint').onclick = () => window.print();
    el.querySelector('#sNote').onclick = async () => {
      const text = (prompt('수정 문구 (예: 쿠팡 10/28 매출 누락분 반영 — 매출 +120만 원). 확정본 수치는 바꾸지 않고 문구로 남깁니다.', '') || '').trim();
      if (!text) return;
      snap.notes = [...(snap.notes || []), { at: new Date().toISOString(), text }];
      if (await MD.store.save(['reports'])) U.toast('수정 문구를 남겼습니다.'); else snap.notes.pop();
      MD.rerender();
    };
  }

  MD.views.report = function (el) {
    const st = MD.state, d = MD.data;
    const snapOpen = st.reportSnap && d.reports.find((r) => r.id === st.reportSnap);
    if (snapOpen) return viewSnapshot(el, snapOpen);
    const sp = st.space || 'md';
    if (seenSpace !== sp) { rtype = null; seenSpace = sp; }
    if (st.focus && st.focus.view === 'report') { rtype = st.focus.id === 'ad' ? 'ad' : 'md'; st.focus = null; } // 월초 체크에서 들어온 경우
    const T = rtype || (sp === 'mkt' ? 'ad' : 'md');
    if (T === 'ad') return adReport(el);
    if (!d.sales.length) {
      // 판매 자료가 없으면 MD 보고서는 만들 수 없다 — 광고 보고서로 바로 갈 수 있게 종류 전환은 남긴다
      el.innerHTML = `<div class="row no-print" style="margin-bottom:14px">${segHtml(T)}</div>
        <div class="card empty">아직 판매 데이터가 없어 MD 보고서를 만들 수 없습니다. 광고 리포트만 있으면 광고 보고서는 볼 수 있습니다.<br><br><a class="btn primary" href="#data">데이터 관리에서 올리기</a></div>`;
      bindSeg(el);
      return;
    }
    const { cur, prev, cs, ce } = MD.current();
    const s = cur.sum, p = prev.sum, lab = MD.cmpLabel();
    const meta = U.store.get('reportMeta', { team: '온라인사업팀', author: '' });
    const ins = MD.insights(cur, prev);
    // 판매가 없어도 광고 리포트가 있는 채널은 남긴다 (광고비만 나가고 매출이 없는 채널을 놓치지 않게)
    const ch = MD.channelRows(cur, prev).filter((r) => r.sales || r.prevSales || r.adRows).sort((a, b) => b.sales - a.sales);
    const pr = MD.productRows(cur, prev);
    const top = [...pr].sort((a, b) => b.sales - a.sales).slice(0, 5);
    const fall = pr.filter((r) => r.prevSales > 0).sort((a, b) => a.diff - b.diff).slice(0, 3).filter((r) => r.diff < 0);
    const promos = d.promotions.filter((x) => x.end >= st.start && x.start <= st.end).map(MD.promoResult);
    const cover = MD.coverRows().filter((r) => r.cover != null && r.cover < MD.settings.coverDays && r.daily > 0).sort((a, b) => a.cover - b.cover);
    const late = d.pos.filter((x) => x.status !== '입고완료' && x.status !== '취소' && x.eta && x.eta < U.today());
    const target = C.monthTarget(null, st.start, st.end);
    const days = U.diffDays(st.start, st.end) + 1;
    const kind = days <= 7 ? '주간' : days <= 31 ? '월간' : '기간';

    // 월 목표: 보고 기간 마지막 날(자료가 그보다 짧으면 자료 기준일)이 속한 달 기준
    const gAt = (d.maxDate && d.maxDate < st.end) ? d.maxDate : st.end; // 지난 기간 보고서는 그 종료일까지만 본다
    const gm = gAt.slice(0, 7);
    const gs = MD.goalStatus(gm, null, gAt), gk = MD.goalKpis(gm, gAt), gr = MD.ratioStatus(gm, null, gAt);
    // 보고서용 한 줄: '534% / 목표 500% · +34%p (목표 이상)' 또는 '판정 보류: 사유'
    const ratioLine = (r, kind) => `${MD.ratioText(r, kind)} (${r.state}${r.why ? `: ${r.why}` : ''})`;
    const ppd = (a, b) => (a == null || b == null ? '-' : `${a - b >= 0 ? '+' : ''}${((a - b) * 100).toFixed(1)}%p`);
    // 매출 목표와 따로 설정된 이익률 목표. 광고 ROAS·전환율·광고비 예산은 광고 보고서에서 다룬다 (분리 4단계)
    const kpiRows = () => [
      gk.marginTarget != null ? `<tr><td>이익률 / 목표</td><td class="num">${U.pct(gk.margin)} / ${U.pct(gk.marginTarget)}</td><td class="num">${gk.noCostHold ? '판정 보류 (원가 미입력 매출 1% 이상)' : ppd(gk.margin, gk.marginTarget)}</td></tr>` : '',
    ].join('');
    const marginLine = gk.marginTarget == null ? null : `- 이익률 ${U.pct(gk.margin)} / 목표 ${U.pct(gk.marginTarget)}${gk.noCostHold ? ' (판정 보류: 원가 미입력 매출 1% 이상)' : ` (${ppd(gk.margin, gk.marginTarget)})`}`;
    const ratioCopy = marginLine ? [marginLine] : [];
    const ratioXlsx = gk.marginTarget == null ? [] : [{ 항목: '이익률 / 목표', 값: `${U.pct(gk.margin)} / ${U.pct(gk.marginTarget)}${gk.noCostHold ? ' (판정 보류)' : ''}` }];
    const gLow = d.channels.map((c) => ({ name: c.name, ...MD.goalStatus(gm, c.name, gAt) })).filter((r) => r.gap > 0).sort((a, b) => b.gap - a.gap).slice(0, 3);
    const gEdited = d.targets.filter((t) => t.month === gm && t.updatedAt).map((t) => t.updatedAt).sort().slice(-1)[0];
    const gLabel = `${Number(gm.slice(5))}월`;
    const gapWord = (v) => (v > 0 ? `${U.krw(v)}원 부족` : `${U.krw(-v)}원 초과`);

    // 다음 액션 초안: 인사이트에서 조치가 필요한 항목만
    const actions = [];
    if (gs.pace != null && gs.pace < 1) actions.push(`${gLabel} 목표: 기준일까지 계획보다 ${U.krw(gs.gap)}원 부족${gLow.length ? ` — ${gLow.map((r) => r.name).join(', ')}의 유입·전환·품절·행사 점검` : ''}`);
    const down = ch.filter((r) => r.dSales != null && r.dSales < -0.1).slice(0, 2);
    down.forEach((r) => actions.push(`${r.channel} 매출 ${U.pct(-r.dSales, 0)} 감소 — 유입·전환 원인 확인 후 담당 MD 미팅`));
    if (cover.length) actions.push(`재고 소진 임박 ${cover.length}개 SKU 재발주 검토 (${cover.slice(0, 2).map((r) => r.name).join(', ')})`);
    if (late.length) actions.push(`입고 지연 ${late.length}건 공급처 확인 (${late.map((x) => x.po).join(', ')})`);
    const draft = readActions('md', st, actions.map((a) => '· ' + a).join('\n'));

    const dd = (v, inv) => U.deltaHtml(v, inv);
    const basis = C.basisLines(cur);

    el.innerHTML = `
      ${headHtml(T, meta, d)}
      <div class="report" id="rep">
        <h1>${kind} 매출 실적 보고</h1>
        <div class="meta">${st.start} ~ ${st.end} (${days}일) · 비교: ${lab} ${cs} ~ ${ce} · ${U.esc(meta.team)}${meta.author ? ' ' + U.esc(meta.author) : ''} · 작성일 ${U.today()}${d.isSample ? ' · <b>예시 데이터</b>' : ''}</div>

        <div class="summary"><b>요약</b><ul style="margin:6px 0 0;padding-left:18px">${ins.slice(0, 5).map((i) => `<li>${i.text}</li>`).join('')}</ul></div>

        <h2>1. 핵심 지표</h2>
        <div class="kpi-row">
          <div><div class="k">매출</div><div class="v">${U.krw(s.sales)}</div>${dd(U.delta(s.sales, p.sales))}</div>
          <div><div class="k">기간 목표 대비</div><div class="v">${target ? U.pct(s.sales / target) : '-'}</div><span class="muted" style="font-size:11px">기간 배분 목표 ${U.krw(target)}</span></div>
          <div><div class="k">매출총이익</div><div class="v">${U.krw(s.gross)}</div>${dd(U.delta(s.gross, p.gross))}</div>
          <div><div class="k">공헌이익</div><div class="v">${U.krw(s.contrib)}</div>${dd(U.delta(s.contrib, p.contrib))}</div>
        </div>
        <table style="margin-top:10px">
          <thead><tr><th>지표</th><th class="num">이번 기간</th><th class="num">${lab}</th><th class="num">증감</th></tr></thead>
          <tbody>
            <tr><td>매출 (VAT 포함)</td><td class="num">${U.won(s.sales)}</td><td class="num">${U.won(p.sales)}</td><td class="num">${dd(U.delta(s.sales, p.sales))}</td></tr>
            <tr><td>매출총이익 / 이익률</td><td class="num">${U.won(s.gross)} / ${U.pct(s.margin)}</td><td class="num">${U.won(p.gross)} / ${U.pct(p.margin)}</td><td class="num">${ppd(s.margin, p.margin)}</td></tr>
            <tr><td>광고비(리포트) / 광고 ROAS</td><td class="num">${U.won(s.adSpend)} / ${s.roas == null ? '-' : U.pct(s.roas, 0)}</td><td class="num">${U.won(p.adSpend)} / ${p.roas == null ? '-' : U.pct(p.roas, 0)}</td><td class="num">${dd(U.delta(s.adSpend, p.adSpend), true)}</td></tr>
            <tr><td>유입 / 전환율</td><td class="num">${U.num(s.visits)} / ${U.pct(s.cvr, 2)}</td><td class="num">${U.num(p.visits)} / ${U.pct(p.cvr, 2)}</td><td class="num">${ppd(s.cvr, p.cvr)}</td></tr>
            <tr><td>주문 / 객단가</td><td class="num">${U.num(s.orders)} / ${U.won(s.aov)}</td><td class="num">${U.num(p.orders)} / ${U.won(p.aov)}</td><td class="num">${dd(U.delta(s.aov, p.aov))}</td></tr>
          </tbody>
        </table>
        <div style="height:200px;margin-top:12px"><canvas id="rTrend"></canvas></div>
        ${MD.legend([{ label: '이번 기간 일매출', color: MD.colorOf(0) }, { label: lab, color: '#9a9890', dashed: true }])}

        <h2>2. ${gLabel} 목표 달성</h2>
        ${gs.target == null ? `<p class="muted">${gLabel} 매출 목표가 설정되지 않았습니다. [목표·KPI 달성]에서 입력하세요.</p>` : ''}
        ${gs.target == null && !kpiRows() ? '' : `
        <table class="goal-sum"><tbody>
          ${gs.target == null ? '' : `<tr><td>월 목표 / 누적 실적</td><td class="num">${U.won(gs.target)} / ${U.won(gs.actual)}</td><td class="num">달성률 ${U.pct(gs.achieve)}</td></tr>
          <tr><td>기준일까지 계획 대비</td><td class="num">${gs.pace == null ? '-' : U.pct(gs.pace)}</td><td class="num">${gs.gap == null ? '-' : gapWord(gs.gap)}</td></tr>
          <tr><td>남은 기간 필요 일매출</td><td class="num">${gs.need == null ? '-' : gs.remain === 0 ? '월 목표 달성' : U.won(gs.need)}</td><td class="num">${gs.remainDays}일 남음</td></tr>
          <tr><td>월말 예상 (최근 7일 평균 연장, 참고)</td><td class="num">${gs.forecast == null ? '관측 부족' : U.won(gs.forecast)}</td><td class="num">${gs.fAchieve == null ? '' : '예상 달성률 ' + U.pct(gs.fAchieve)}</td></tr>`}
          ${kpiRows()}
        </tbody></table>
        ${gLow.length ? `<p style="margin:6px 0 0">계획 대비 부족 상위 채널: ${gLow.map((r) => `${U.esc(r.name)} ${U.krw(r.gap)}원`).join(', ')}</p>` : ''}
        <div class="meta">실적 기준일 ${gs.upto || gr.upto || '-'}${gs.confirmed ? ' (판매 자료 마감 확인)' : ` <b>(판매 자료 마감 미확인 ${gs.unconfirmed.length}개 채널 — 자료 마지막 날 기준)</b>`}${gs.target == null ? '' : ` · 월 목표를 일수로 균등 배분${gs.unset ? ` · 목표 미설정 채널 ${gs.unset}개는 제외` : ''}`}${gEdited ? ` · 목표 마지막 수정 ${gEdited.slice(0, 10)}` : ''}${gk.memo ? ` · 목표 근거: ${U.esc(gk.memo)}` : ''}</div>`}

        <h2>3. 채널별 실적</h2>
        <table><thead><tr><th>채널</th><th class="num">매출</th><th class="num">증감</th><th class="num">비중</th><th class="num">기간 목표 대비</th><th class="num">이익률</th><th class="num" title="광고 리포트의 광고 매출 ÷ 광고비">광고 ROAS</th></tr></thead>
        <tbody>${ch.map((r) => `<tr><td>${U.esc(r.channel)}</td><td class="num">${U.krw(r.sales)}</td><td class="num">${dd(r.dSales)}</td><td class="num">${U.pct(r.share)}</td><td class="num">${U.pct(r.achieve)}</td><td class="num">${U.pct(r.margin)}</td><td class="num">${r.roas == null ? '-' : U.pct(r.roas, 0)}</td></tr>`).join('')}</tbody></table>

        <h2>4. 상품</h2>
        <table><thead><tr><th>매출 상위</th><th class="num">매출</th><th class="num">증감</th><th class="num">이익률</th></tr></thead>
        <tbody>${top.map((r) => `<tr><td>${U.esc(r.name)}</td><td class="num">${U.krw(r.sales)}</td><td class="num">${dd(r.dSales)}</td><td class="num">${U.pct(r.margin)}</td></tr>`).join('')}</tbody></table>
        ${fall.length ? `<table style="margin-top:8px"><thead><tr><th>하락 상위</th><th class="num">매출</th><th class="num">감소액</th><th class="num">증감</th></tr></thead>
        <tbody>${fall.map((r) => `<tr><td>${U.esc(r.name)}</td><td class="num">${U.krw(r.sales)}</td><td class="num">${U.krw(r.diff)}</td><td class="num">${dd(r.dSales)}</td></tr>`).join('')}</tbody></table>` : ''}

        <h2>5. 프로모션</h2>
        ${promos.length ? `<table><thead><tr><th>행사</th><th>채널</th><th class="num">매출</th><th class="num">리프트</th><th class="num">ROAS</th><th class="num">순증 이익</th><th>판정</th></tr></thead>
        <tbody>${promos.map((r) => `<tr><td>${U.esc(r.name)}</td><td>${U.esc(r.channel)}</td><td class="num">${U.krw(r.sales)}</td><td class="num">${r.lift == null ? '-' : (r.lift >= 0 ? '+' : '') + U.pct(r.lift, 0)}</td><td class="num">${r.roas == null ? '-' : U.pct(r.roas, 0)}</td><td class="num">${U.krw(r.netGain)}</td><td>${r.status}</td></tr>`).join('')}</tbody></table>` : '<p class="muted">기간 내 행사 없음</p>'}

        <h2>6. 재고·발주 이슈</h2>
        ${cover.length || late.length ? `<ul>${cover.slice(0, 5).map((r) => `<li>${U.esc(r.name)} — ${r.stock > 0 ? `재고 ${r.stock}개, 약 ${Math.floor(r.cover)}일 내 소진 예상` : '품절 (재고 0개)'}${r.inbound ? ` (입고 예정 ${r.inbound}개)` : ''}</li>`).join('')}${late.map((x) => `<li>${U.esc(x.po)} ${U.esc(x.vendor)} — 입고 예정일 ${x.eta} 경과 (${U.esc(x.status)})</li>`).join('')}</ul>` : '<p class="muted">특이사항 없음</p>'}

        <h2>7. 다음 액션</h2>
        <textarea id="rAct" class="no-print" rows="${Math.max(4, actions.length + 2)}">${U.esc(draft)}</textarea>
        <div id="rActPrint" class="print-only">${U.esc(draft)}</div>
        <div class="meta no-print">자동 초안입니다. 직접 고친 내용은 이 기간 보고서에 저장됩니다.</div>

        <h2>8. 계산 기준</h2>
        ${MD.basisTable(basis)}
      </div>`;

    // 보고서 차트는 인쇄를 위해 밝은 색 고정
    const ser = MD.dailySeries(cur.sales, prev.sales, st.start, st.end, cs);
    const c = MD.charts.line(el.querySelector('#rTrend'), ser.labels, [
      { label: '이번 기간', data: ser.cv, color: '#2a78d6' },
      { label: lab, data: ser.pv, color: '#9a9890', dashed: true },
    ], U.krw);
    if (c) { c.options.scales.x.ticks.color = '#666'; c.options.scales.y.ticks.color = '#666'; c.options.scales.y.grid.color = '#e5e5e0'; c.update(); }

    bindCommon(el, 'md');

    // 확정본: 본문(차트는 이미지로)·핵심 수치·목표·실적 기준일과 마감 상태·계산 기준·다음 액션을 함께 저장
    el.querySelector('#rSnap').onclick = async () => {
      const memo = prompt('확정본 메모(선택, 예: 10월 월간 — 본부장 보고)', '');
      if (memo === null) return;
      const snap = {
        id: 'R' + Date.now().toString(36), at: new Date().toISOString(), type: 'md', form: 2, title: `${kind} 매출 실적 보고`, start: st.start, end: st.end,
        cmp: { label: lab, start: cs, end: ce }, team: meta.team, author: meta.author, memo: memo.trim(),
        asOf: gs.upto || gr.upto || null, confirmed: !!gs.confirmed, unconfirmed: gs.unconfirmed || [],
        nums: { sales: s.sales, prevSales: p.sales, gross: s.gross, margin: s.margin, contrib: s.contrib, adSpend: s.adSpend, roas: s.roas, visits: s.visits, orders: s.orders, target },
        goal: gs.target == null ? null : { month: gm, target: gs.target, actual: gs.actual, achieve: gs.achieve, pace: gs.pace, gap: gs.gap },
        basis: basis.map(({ item, rule, fact }) => ({ item, rule, fact })), actions: el.querySelector('#rAct').value,
        html: snapHtml(el, c, '일매출 추이'), notes: [],
      };
      await pushSnap(snap);
    };

    el.querySelector('#rCopy').onclick = async () => {
      const lines = [
        `[${kind} 매출 보고] ${st.start} ~ ${st.end}`,
        ...ins.slice(0, 5).map((i) => '- ' + i.plain),
        '',
        ...(gs.target == null && !ratioCopy.length ? [] : [
          `■ ${gLabel} 목표 (${(gs.upto || gr.upto || '').slice(5).replace('-', '/')} 기준${gs.confirmed ? '' : ', 판매 자료 마감 미확인'})`,
          gs.target == null ? `- 매출 목표 미설정` : `- 달성률 ${U.pct(gs.achieve)} (${U.krw(gs.actual)}원 / ${U.krw(gs.target)}원), 계획 대비 ${gs.pace == null ? '-' : U.pct(gs.pace)}${gs.gap == null ? '' : ' · ' + gapWord(gs.gap)}`,
          gs.target == null || gs.need == null || gs.remain === 0 ? null : `- 남은 ${gs.remainDays}일 필요 일매출 ${U.krw(gs.need)}원${gs.forecast == null ? '' : `, 월말 예상 ${U.krw(gs.forecast)}원(참고)`}`,
          gLow.length ? `- 부족 상위: ${gLow.map((r) => `${r.name} ${U.krw(r.gap)}원`).join(', ')}` : null,
          ...ratioCopy,
          '',
        ].filter((x) => x != null)),
        `■ 채널별 (매출 / ${lab} 대비)`,
        ...ch.slice(0, 6).map((r) => `- ${r.channel}: ${U.krw(r.sales)}원 (${r.dSales == null ? '-' : (r.dSales >= 0 ? '+' : '') + (r.dSales * 100).toFixed(1) + '%'})`),
        '',
        '■ 다음 액션',
        el.querySelector('#rAct').value,
      ];
      await copyText(lines.join('\n'));
    };

    el.querySelector('#rXlsx').onclick = () => {
      U.exportXlsx(`${kind}매출보고_${st.start}_${st.end}.xlsx`, {
        요약: [
          { 항목: '기간', 값: `${st.start} ~ ${st.end}` }, { 항목: '비교', 값: `${lab} ${cs} ~ ${ce}` },
          { 항목: '매출', 값: Math.round(s.sales) }, { 항목: `${lab} 매출`, 값: Math.round(p.sales) },
          { 항목: '매출총이익', 값: Math.round(s.gross) }, { 항목: '이익률', 값: s.margin }, { 항목: '광고비(광고 리포트)', 값: Math.round(s.adSpend) },
          { 항목: '광고 ROAS', 값: s.roas }, { 항목: '전환율', 값: s.cvr }, { 항목: '목표', 값: Math.round(target) },
          ...ins.map((i, k) => ({ 항목: '인사이트 ' + (k + 1), 값: i.plain })),
        ],
        채널별: ch.map((r) => ({ 채널: r.channel, 매출: Math.round(r.sales), [`${lab} 매출`]: Math.round(r.prevSales), 증감률: r.dSales, 비중: r.share, 목표: Math.round(r.target), 달성률: r.achieve, 매출총이익: Math.round(r.gross), 이익률: r.margin, '광고비(리포트)': Math.round(r.adSpend), '광고 ROAS': r.roas, 유입: r.visits, 전환율: r.cvr })),
        상품별: pr.filter((r) => r.sales || r.prevSales).sort((a, b) => b.sales - a.sales).map((r) => ({ SKU: r.sku, 상품명: r.name, 카테고리: r.category, 매출: Math.round(r.sales), [`${lab} 매출`]: Math.round(r.prevSales), 증감률: r.dSales, 수량: r.qty, 이익률: r.margin })),
        목표: gs.target == null ? [{ 항목: '기준 월', 값: gm }, { 항목: '실적 기준일', 값: gr.upto }, { 항목: `${gLabel} 매출 목표`, 값: '미설정' }, ...ratioXlsx] : [
          { 항목: '기준 월', 값: gm }, { 항목: '실적 기준일', 값: gs.upto }, { 항목: '월 목표', 값: Math.round(gs.target) }, { 항목: '누적 실적', 값: Math.round(gs.actual) },
          { 항목: '월 목표 달성률', 값: U.pct(gs.achieve) }, { 항목: '기준일까지 계획', 값: gs.plan == null ? null : Math.round(gs.plan) }, { 항목: '계획 대비율', 값: gs.pace == null ? '-' : U.pct(gs.pace) },
          { 항목: '부족액(−는 초과)', 값: gs.gap == null ? null : Math.round(gs.gap) }, { 항목: '필요 일매출', 값: gs.need == null ? null : Math.round(gs.need) }, { 항목: '월말 예상(참고)', 값: gs.forecast == null ? null : Math.round(gs.forecast) },
          ...ratioXlsx,
        ],
        프로모션: promos.map((r) => ({ 행사: r.name, 채널: r.channel, 시작: r.start, 종료: r.end, 매출: r.sales == null ? null : Math.round(r.sales), 리프트: r.lift, 비용: r.cost, ROAS: r.roas, 순증이익: r.netGain == null ? null : Math.round(r.netGain), 판정: r.status })),
      });
    };
  };

  // ---------- 공용: 종류 전환·머리 도구·보관함·확정본 ----------
  const segHtml = (T) => `<div class="seg" role="group" aria-label="보고서 종류">${['md', 'ad'].map((k) => `<button data-rt="${k}" class="${T === k ? 'on' : ''}" aria-pressed="${T === k}">${TYPE_NAME[k]}</button>`).join('')}</div>`;
  const bindSeg = (el) => el.querySelectorAll('[data-rt]').forEach((b) => (b.onclick = () => { rtype = b.dataset.rt; MD.rerender(); }));
  function headHtml(T, meta, d) {
    const snaps = [...d.reports].sort((a, b) => (a.at < b.at ? 1 : -1));
    const amount = (r) => (!r.nums ? '-' : typeOf(r) === 'ad' ? `광고비 ${U.krw(r.nums.adSpend)}` : U.krw(r.nums.sales));
    return `
      <div class="row no-print" style="margin-bottom:14px">
        ${segHtml(T)}
        <label>팀 <input type="text" id="rTeam" value="${U.esc(meta.team)}" style="width:140px"></label>
        <label>작성자 <input type="text" id="rAuthor" value="${U.esc(meta.author)}" style="width:110px"></label>
        <span class="spacer"></span>
        <button class="btn" id="rCopy">메신저용 텍스트 복사</button>
        <button class="btn" id="rXlsx">엑셀로 받기</button>
        <button class="btn" id="rSnap" ${d.isSample ? 'disabled title="예시 데이터에서는 확정본을 저장하지 않습니다"' : 'title="지금 보고서 본문·수치·목표·마감 상태·계산 기준을 그대로 보관"'}>확정본 저장</button>
        <button class="btn primary" id="rPrint">인쇄 · PDF 저장</button>
      </div>
      ${snaps.length ? `<div class="card no-print" style="margin-bottom:14px"><div class="card-head"><h2>확정본 보관함 ${snaps.length}건</h2><span class="muted">보고 당시 그대로 보관 — 자료가 바뀌어도 내용은 바뀌지 않음. 두 종류의 확정본이 함께 보관됩니다</span></div>
        <div class="table-wrap"><table><thead><tr><th>저장</th><th>종류</th><th>보고 기간</th><th>메모</th><th>작성</th><th>실적 기준일</th><th class="num">매출·광고비</th><th class="num">수정 문구</th><th></th></tr></thead><tbody>
        ${snaps.slice(0, 20).map((r) => `<tr><td>${localTime(r.at)}</td><td>${typeName(r)}</td><td>${U.esc(r.start)} ~ ${U.esc(r.end)}</td><td>${U.esc(r.memo || '')}</td><td>${U.esc([r.team, r.author].filter(Boolean).join(' '))}</td><td>${U.esc(r.asOf || '-')}${r.confirmed === false ? ' <span class="tag warn">마감 미확인</span>' : ''}</td><td class="num">${amount(r)}</td><td class="num">${(r.notes || []).length}</td>
          <td><button class="btn small" data-snap="${U.esc(r.id)}">보기</button> <button class="btn small danger" data-snapdel="${U.esc(r.id)}">삭제</button></td></tr>`).join('')}
        </tbody></table></div>${snaps.length > 20 ? `<div class="note">최근 20건만 표시합니다(전체 ${snaps.length}건은 백업 파일에 포함).</div>` : ''}</div>` : ''}`;
  }
  // 팀·작성자·다음 액션·인쇄·보관함 보기·삭제
  function bindCommon(el, T) {
    const st = MD.state, d = MD.data;
    bindSeg(el);
    const saveMeta = () => { U.store.set('reportMeta', { team: el.querySelector('#rTeam').value, author: el.querySelector('#rAuthor').value }); };
    el.querySelector('#rTeam').onchange = () => { saveMeta(); MD.rerender(); };
    el.querySelector('#rAuthor').onchange = () => { saveMeta(); MD.rerender(); };
    el.querySelector('#rAct').oninput = (e) => {
      U.store.set(actKey(T, st), e.target.value);
      el.querySelector('#rActPrint').textContent = e.target.value; // 인쇄용 사본을 화면 입력과 즉시 맞춘다
    };
    el.querySelector('#rPrint').onclick = () => window.print();
    el.querySelectorAll('[data-snap]').forEach((b) => (b.onclick = () => { MD.state.reportSnap = b.dataset.snap; MD.rerender(); window.scrollTo(0, 0); }));
    el.querySelectorAll('[data-snapdel]').forEach((b) => (b.onclick = async () => {
      if (!confirm('이 확정본을 삭제합니다. 되돌릴 수 없습니다(백업 파일에 있으면 복원 가능).')) return;
      const keep = d.reports;
      d.reports = d.reports.filter((r) => r.id !== b.dataset.snapdel);
      if (!(await MD.store.save(['reports']))) d.reports = keep;
      MD.rerender();
    }));
  }
  // 확정본 본문: 차트는 이미지로, 화면 전용 요소는 빼고, 인쇄 전용 사본은 보이게
  function snapHtml(el, chart, alt) {
    const clone = el.querySelector('#rep').cloneNode(true);
    const img = document.createElement('img');
    img.src = chart ? chart.toBase64Image() : ''; img.alt = alt; img.style.cssText = 'width:100%;height:200px;object-fit:contain';
    const cv = clone.querySelector('canvas'); if (cv) cv.parentNode.replaceChild(img, cv);
    clone.querySelectorAll('.no-print').forEach((n) => n.remove());
    clone.querySelectorAll('.print-only').forEach((n) => { n.classList.remove('print-only'); n.style.whiteSpace = 'pre-wrap'; });
    return clone.innerHTML;
  }
  async function pushSnap(snap) {
    const d = MD.data;
    d.reports.push(snap);
    if (await MD.store.save(['reports'])) U.toast('확정본을 저장했습니다. 나중에 자료가 바뀌어도 이 내용은 그대로 남습니다.');
    else d.reports.pop(); // 저장 실패 안내는 저장 함수가 띄운다
    MD.rerender();
  }
  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); U.toast('복사했습니다. 메신저에 붙여넣으세요.'); }
    catch (e) { const t = document.createElement('textarea'); t.value = text; document.body.appendChild(t); t.select(); document.execCommand('copy'); t.remove(); U.toast('복사했습니다.'); }
  }

  // ---------- 광고 보고서 (분리 4단계) ----------
  //  - 광고 리포트·유입 자료만으로 만든다(판매 자료가 없어도 열림). 판매 자료가 있으면 광고 매출 비중·행사 성과를 덧붙인다
  //  - 월 광고 목표 판정은 목표 화면과 같은 MD.ratioStatus·MD.goalKpis. 이 판정의 기준일은 판매 자료 기준일이라 판매 자료가 없으면 '시작 전'
  //  - 이름: 광고 ROAS = 광고 리포트의 광고 매출 ÷ 광고비, 행사 ROAS = 행사 매출 ÷ 행사 비용(프로모션 화면) — 서로 다른 지표
  function adReport(el) {
    const st = MD.state, d = MD.data, T = 'ad';
    const { cur, prev, cs, ce } = MD.current();
    const s = cur.sum, p = prev.sum, lab = MD.cmpLabel();
    const meta = U.store.get('reportMeta', { team: '온라인사업팀', author: '' });
    const days = U.diffDays(st.start, st.end) + 1;
    const kind = days <= 7 ? '주간' : days <= 31 ? '월간' : '기간';
    const a = adExtra(cur.ads), b = adExtra(prev.ads);
    const dd = (v, inv) => U.deltaHtml(v, inv);
    const ppd = (x, y) => (x == null || y == null ? '-' : `${x - y >= 0 ? '+' : ''}${((x - y) * 100).toFixed(0)}%p`);
    const pctOr = (v, dg = 0) => (v == null ? '-' : U.pct(v, dg));
    const known = new Set(d.channels.map((c) => c.name));
    // 광고 리포트 마감: 이 기간 광고 자료가 있는 채널 중 확인일이 종료일 전인 곳
    const adChs = [...new Set(cur.ads.map((r) => r.channel))];
    const adOpen = adChs.filter((c) => (C.closeOf(c, 'ads') || '') < st.end);
    // 월 목표: 보고 기간 마지막 날(판매 자료가 그보다 짧으면 판매 자료 기준일)이 속한 달
    const gAt = d.maxDate && d.maxDate < st.end ? d.maxDate : st.end, gm = gAt.slice(0, 7), gLabel = `${Number(gm.slice(5))}월`;
    const gr = MD.ratioStatus(gm, null, gAt), gk = MD.goalKpis(gm, gAt);
    const ratioLine = (r, k) => `${MD.ratioText(r, k)} (${r.state}${r.why ? `: ${r.why}` : ''})`;
    const ch = MD.channelRows(cur, prev).filter((r) => r.adRows || r.visits || r.prevRoas != null).map((r) => {
      const name = r.channel, judged = known.has(name) ? MD.ratioStatus(gm, name, gAt).roas : null;
      return { ...r, judged };
    }).sort((x, y) => y.adSpend - x.adSpend);
    // 캠페인: 광고비 큰 순 5개
    const cg = U.groupBy(cur.ads.filter((r) => r.campaign), (r) => JSON.stringify([r.channel, r.campaign]));
    const camps = [...cg.entries()].map(([k, rs]) => {
      const [cn, cp] = JSON.parse(k), rv = rs.filter((r) => r.revenue != null && !(r.miss || []).includes('revenue'));
      const sp = rs.reduce((x, r) => x + (r.spend || 0), 0), rvSp = rv.reduce((x, r) => x + (r.spend || 0), 0), rev = rv.reduce((x, r) => x + r.revenue, 0);
      return { channel: cn, name: cp, spend: sp, roas: rvSp ? rev / rvSp : null };
    }).sort((x, y) => y.spend - x.spend).slice(0, 5);
    // 검색 순위: 이 기간 관측끼리 비교 (순위 화면과 같은 하락 기준 — 5위 이상 하락 또는 범위 밖으로)
    const rkRows = (d.ranks || []).filter((r) => r.at && r.at.slice(0, 10) >= st.start && r.at.slice(0, 10) <= st.end);
    const rk = MD.rankSeries ? MD.rankSeries(rkRows) : [];
    const drops = rk.filter((x) => (x.change != null && x.change >= 5) || x.note === '범위 밖으로 하락');
    const ups = rk.filter((x) => (x.change != null && x.change <= -5) || x.note === '범위 안 진입');
    const rt = (r) => (r.rank != null ? `${r.rank}위` : '범위 밖');
    const promos = d.sales.length ? d.promotions.filter((x) => x.end >= st.start && x.start <= st.end).map(MD.promoResult) : [];

    // 다음 액션 초안: 숫자로 확인되는 것만
    const actions = [];
    const miss = ch.filter((r) => r.judged && r.judged.state === '목표 미달');
    miss.slice(0, 3).forEach((r) => actions.push(`${r.channel} 광고 ROAS ${MD.ratioText(r.judged, 'roas')} — 키워드·소재 조정 또는 예산 재배분`));
    if (!miss.length) ch.filter((r) => r.adSpend > 0 && r.roas != null && r.roas < MD.settings.roasMin && !(r.judged && r.judged.target != null)).slice(0, 2)
      .forEach((r) => actions.push(`${r.channel} 광고 ROAS ${U.pct(r.roas, 0)} — 기준 ${U.pct(MD.settings.roasMin, 0)} 미달, 키워드·소재 점검`));
    if (gk.usage != null && gk.usage > gk.elapsedShare + 0.05) actions.push(`광고비 예산 사용 ${U.pct(gk.usage, 0)} (월 경과율 ${U.pct(gk.elapsedShare, 0)}) — 남은 기간 일 예산 조정`);
    if (drops.length) actions.push(`검색 순위 하락 ${drops.length}건 (${drops.slice(0, 2).map((x) => `${x.last.platform} '${x.last.keyword}'`).join(', ')}) — 노출·가격·리뷰 점검`);
    if (adOpen.length) actions.push(`광고 리포트 마감 미확인 ${adOpen.length}개 채널(${adOpen.slice(0, 3).join(', ')}) — 확인 후 수치 확정`);
    const draft = readActions('ad', st, actions.map((x) => '· ' + x).join('\n'));

    const basis = [
      ...C.basisLines(cur).filter((x) => x.item === '광고 ROAS' || x.item === '공헌이익 광고비'),
      { item: '노출·클릭·전환', rule: '광고 리포트에 그 값이 있는 행만 합산(CTR은 노출·클릭이 모두 있는 행)', fact: '', warn: false },
      { item: '전환율', rule: C.cvrNote(s), fact: '', warn: false },
      { item: '행사 ROAS', rule: '행사 매출 ÷ 행사 비용(프로모션 화면) — 광고 ROAS와 다른 지표', fact: '', warn: false },
    ];
    const goalRows = [
      gr.roas.target != null || gr.roas.state !== '목표 미설정' ? `<tr><td>광고 ROAS(광고 매출 ÷ 광고비) / 목표<br><span class="muted" style="font-size:11px">${U.esc(gr.roas.scope || '')} · 플랫폼 광고 리포트 기준</span></td><td class="num" colspan="2">${U.esc(ratioLine(gr.roas, 'roas'))}</td></tr>` : '',
      gr.cvr.target != null ? `<tr><td>전환율(주문 건수 ÷ 방문) / 목표<br><span class="muted" style="font-size:11px">${U.esc(gr.cvr.scope || '')}</span></td><td class="num" colspan="2">${U.esc(ratioLine(gr.cvr, 'cvr'))}</td></tr>` : '',
      gk.budget != null ? `<tr><td>광고비 / 예산</td><td class="num">${U.won(gk.spent)} / ${U.won(gk.budget)}</td><td class="num">사용률 ${U.pct(gk.usage)} (경과율 ${U.pct(gk.elapsedShare, 0)})</td></tr>` : '',
    ].join('');

    el.innerHTML = `
      ${headHtml(T, meta, d)}
      <div class="report" id="rep">
        <h1>${kind} 광고 성과 보고</h1>
        <div class="meta">${st.start} ~ ${st.end} (${days}일) · 비교: ${lab} ${cs} ~ ${ce} · ${U.esc(meta.team)}${meta.author ? ' ' + U.esc(meta.author) : ''} · 작성일 ${U.today()}${d.isSample ? ' · <b>예시 데이터</b>' : ''} · 광고 리포트 기준(플랫폼 귀속 매출)</div>
        ${!cur.ads.length ? '<div class="summary">이 기간 광고 리포트가 없습니다. 데이터 관리에서 광고 리포트를 올리면 광고비·광고 ROAS·캠페인 분석이 채워집니다.</div>' : ''}

        <h2>1. 핵심 지표</h2>
        <div class="kpi-row">
          <div><div class="k">광고비</div><div class="v">${U.krw(s.adSpend)}</div>${dd(U.delta(s.adSpend, p.adSpend), true)}</div>
          <div><div class="k">광고 매출</div><div class="v">${U.krw(s.adRev)}</div>${dd(U.delta(s.adRev, p.adRev))}</div>
          <div><div class="k">광고 ROAS</div><div class="v">${pctOr(s.roas)}</div><span class="muted" style="font-size:11px">${lab} ${pctOr(p.roas)}</span></div>
          <div><div class="k">전환율(방문)</div><div class="v">${pctOr(s.visits ? s.cvr : null, 2)}</div><span class="muted" style="font-size:11px">${lab} ${pctOr(p.visits ? p.cvr : null, 2)}</span></div>
        </div>
        <table style="margin-top:10px">
          <thead><tr><th>지표</th><th class="num">이번 기간</th><th class="num">${lab}</th><th class="num">증감</th></tr></thead>
          <tbody>
            <tr><td>광고비(광고 리포트)</td><td class="num">${U.won(s.adSpend)}</td><td class="num">${U.won(p.adSpend)}</td><td class="num">${dd(U.delta(s.adSpend, p.adSpend), true)}</td></tr>
            <tr><td>광고 매출 / 광고 ROAS</td><td class="num">${U.won(s.adRev)} / ${pctOr(s.roas)}</td><td class="num">${U.won(p.adRev)} / ${pctOr(p.roas)}</td><td class="num">${ppd(s.roas, p.roas)}</td></tr>
            ${a.hasImp || b.hasImp ? `<tr><td>노출 / CTR</td><td class="num">${U.num(a.imp)} / ${pctOr(a.ctr, 2)}</td><td class="num">${U.num(b.imp)} / ${pctOr(b.ctr, 2)}</td><td class="num">${dd(U.delta(a.ctr, b.ctr))}</td></tr>` : ''}
            ${a.hasClk || b.hasClk ? `<tr><td>클릭 / CPC</td><td class="num">${U.num(a.clicks)} / ${a.cpc == null ? '-' : U.won(a.cpc)}</td><td class="num">${U.num(b.clicks)} / ${b.cpc == null ? '-' : U.won(b.cpc)}</td><td class="num">${dd(U.delta(a.cpc, b.cpc), true)}</td></tr>` : ''}
            ${a.hasConv || b.hasConv ? `<tr><td>전환 / CPA</td><td class="num">${U.num(a.conv)} / ${a.cpa == null ? '-' : U.won(a.cpa)}</td><td class="num">${U.num(b.conv)} / ${b.cpa == null ? '-' : U.won(b.cpa)}</td><td class="num">${dd(U.delta(a.cpa, b.cpa), true)}</td></tr>` : ''}
            <tr><td>유입 / 전환율(방문)</td><td class="num">${U.num(s.visits)} / ${pctOr(s.visits ? s.cvr : null, 2)}</td><td class="num">${U.num(p.visits)} / ${pctOr(p.visits ? p.cvr : null, 2)}</td><td class="num">${ppd(s.visits ? s.cvr : null, p.visits ? p.cvr : null)}</td></tr>
            ${s.sales ? `<tr><td>광고 매출 비중(광고 매출 ÷ 전체 매출)</td><td class="num">${U.pct(s.adRev / s.sales)}</td><td class="num">${p.sales ? U.pct(p.adRev / p.sales) : '-'}</td><td class="num"></td></tr>` : ''}
          </tbody>
        </table>
        <div style="height:200px;margin-top:12px"><canvas id="rAdTrend"></canvas></div>
        ${MD.legend([{ label: '광고비', color: '#c2410c' }, { label: '광고 매출', color: '#2a78d6' }])}

        <h2>2. ${gLabel} 광고 목표</h2>
        ${goalRows ? `<table class="goal-sum"><tbody>${goalRows}</tbody></table>` : `<p class="muted">${gLabel} 광고 목표(광고비 예산·ROAS·전환율)가 설정되지 않았습니다. [목표·KPI 달성] 광고 목표 탭에서 입력하세요.</p>`}
        <div class="meta">판정 기준일 ${gr.upto || '-'}${!d.sales.length ? ' — 판매 자료가 없어 목표 판정 기준일을 정하지 못했습니다(판정은 판매 자료 기준일까지)' : ''}${adOpen.length ? ` · <b>광고 리포트 마감 미확인 ${adOpen.length}개 채널</b>` : ''}</div>

        <h2>3. 채널별 광고</h2>
        ${ch.length ? `<table><thead><tr><th>채널</th><th class="num">광고비</th><th class="num">광고 매출</th><th class="num">광고 ROAS</th><th class="num">${lab}</th><th>${gLabel} 목표 판정</th><th class="num">유입</th><th class="num">전환율</th></tr></thead>
        <tbody>${ch.map((r) => `<tr><td>${U.esc(r.channel)}</td><td class="num">${U.krw(r.adSpend)}</td><td class="num">${U.krw(r.adRev)}</td><td class="num">${pctOr(r.roas)}</td><td class="num">${pctOr(r.prevRoas)}</td><td>${r.judged ? U.esc(r.judged.state) : '-'}</td><td class="num">${U.num(r.visits)}</td><td class="num">${pctOr(r.visits ? r.cvr : null, 2)}</td></tr>`).join('')}</tbody></table>` : '<p class="muted">이 기간 광고·유입 자료가 있는 채널이 없습니다.</p>'}

        <h2>4. 캠페인 (광고비 상위)</h2>
        ${camps.length ? `<table><thead><tr><th>채널</th><th>캠페인</th><th class="num">광고비</th><th class="num">광고 ROAS</th></tr></thead>
        <tbody>${camps.map((r) => `<tr><td>${U.esc(r.channel)}</td><td>${U.esc(r.name)}</td><td class="num">${U.krw(r.spend)}</td><td class="num">${pctOr(r.roas)}</td></tr>`).join('')}</tbody></table>` : '<p class="muted">광고 리포트에 캠페인 열이 없거나 이 기간 자료가 없습니다.</p>'}

        <h2>5. 검색 순위</h2>
        ${rk.length ? `<p style="margin:0">이 기간 관측 ${U.num(rkRows.length)}건 · 추적 ${rk.length}개 · 하락 ${drops.length}개 · 상승 ${ups.length}개</p>
        ${drops.length ? `<ul>${drops.slice(0, 5).map((x) => `<li>${U.esc(x.last.platform)} '${U.esc(x.last.keyword)}' (${U.esc(x.last.type)}) ${rt(x.prev)} → ${rt(x.last)}${x.diffCond ? ' (측정 조건 다름)' : ''}</li>`).join('')}</ul>` : ''}` : '<p class="muted">이 기간 순위 관측 기록이 없습니다.</p>'}

        <h2>6. 행사</h2>
        ${!d.sales.length ? '<p class="muted">판매 자료가 없어 행사 성과를 계산하지 않습니다.</p>' : promos.length ? `<table><thead><tr><th>행사</th><th>채널</th><th class="num">행사 비용</th><th class="num" title="행사 매출 ÷ 행사 비용 — 광고 ROAS와 다른 지표">행사 ROAS</th><th>판정</th></tr></thead>
        <tbody>${promos.map((r) => `<tr><td>${U.esc(r.name)}</td><td>${U.esc(r.channel)}</td><td class="num">${U.krw(r.cost)}</td><td class="num">${pctOr(r.roas)}</td><td>${U.esc(r.status)}</td></tr>`).join('')}</tbody></table>` : '<p class="muted">기간 내 행사 없음</p>'}

        <h2>7. 다음 액션</h2>
        <textarea id="rAct" class="no-print" rows="${Math.max(4, actions.length + 2)}">${U.esc(draft)}</textarea>
        <div id="rActPrint" class="print-only">${U.esc(draft)}</div>
        <div class="meta no-print">자동 초안입니다. 직접 고친 내용은 이 기간 광고 보고서에 저장됩니다(MD 보고서와 따로).</div>

        <h2>8. 계산 기준</h2>
        ${MD.basisTable(basis)}
      </div>`;

    // 일별 광고비·광고 매출 (인쇄를 위해 밝은 색 고정)
    const dayList = U.dateRange(st.start, st.end);
    const by = (f) => { const m = new Map(); for (const r of cur.ads) if (f === 'spend' || (r.revenue != null && !(r.miss || []).includes('revenue'))) m.set(r.date, (m.get(r.date) || 0) + (r[f] || 0)); return dayList.map((x) => m.get(x) || 0); };
    const c = MD.charts.line(el.querySelector('#rAdTrend'), dayList.map((x) => x.slice(5).replace('-', '/')), [
      { label: '광고비', data: by('spend'), color: '#c2410c' },
      { label: '광고 매출', data: by('revenue'), color: '#2a78d6' },
    ], U.krw);
    if (c) { c.options.scales.x.ticks.color = '#666'; c.options.scales.y.ticks.color = '#666'; c.options.scales.y.grid.color = '#e5e5e0'; c.update(); }
    bindCommon(el, T);

    el.querySelector('#rSnap').onclick = async () => {
      const memo = prompt('확정본 메모(선택, 예: 10월 광고 — 마케팅 팀장 보고)', '');
      if (memo === null) return;
      await pushSnap({
        id: 'R' + Date.now().toString(36), at: new Date().toISOString(), type: 'ad', form: 2, title: `${kind} 광고 성과 보고`, start: st.start, end: st.end,
        cmp: { label: lab, start: cs, end: ce }, team: meta.team, author: meta.author, memo: memo.trim(),
        asOf: gr.upto || (cur.ads.length ? cur.ads[cur.ads.length - 1].date : null), confirmed: !adOpen.length, unconfirmed: adOpen,
        nums: { adSpend: s.adSpend, prevAdSpend: p.adSpend, adRev: s.adRev, roas: s.roas, prevRoas: p.roas, clicks: a.clicks, conv: a.conv, visits: s.visits, sales: s.sales },
        goal: { month: gm, roas: gr.roas.target ?? null, roasState: gr.roas.state, budget: gk.budget, usage: gk.usage },
        basis: basis.map(({ item, rule, fact }) => ({ item, rule, fact })), actions: el.querySelector('#rAct').value,
        html: snapHtml(el, c, '일별 광고비·광고 매출'), notes: [],
      });
    };

    el.querySelector('#rCopy').onclick = () => copyText([
      `[${kind} 광고 보고] ${st.start} ~ ${st.end} (광고 리포트 기준)`,
      `- 광고비 ${U.krw(s.adSpend)}원 (${lab} 대비 ${s.adSpend && p.adSpend ? ((s.adSpend / p.adSpend - 1) * 100).toFixed(1) + '%' : '-'}) · 광고 매출 ${U.krw(s.adRev)}원 · 광고 ROAS ${pctOr(s.roas)} (${lab} ${pctOr(p.roas)})`,
      a.hasClk ? `- 클릭 ${U.num(a.clicks)} · CPC ${a.cpc == null ? '-' : U.won(a.cpc)}${a.hasImp ? ` · CTR ${pctOr(a.ctr, 2)}` : ''}${a.hasConv ? ` · 전환 ${U.num(a.conv)} · CPA ${a.cpa == null ? '-' : U.won(a.cpa)}` : ''}` : null,
      '',
      `■ ${gLabel} 광고 목표 (${(gr.upto || '-').slice(5).replace('-', '/')} 기준${adOpen.length ? ', 광고 리포트 마감 미확인 채널 있음' : ''})`,
      `- 광고 ROAS ${ratioLine(gr.roas, 'roas')}`,
      gr.cvr.target != null ? `- 전환율 ${ratioLine(gr.cvr, 'cvr')}` : null,
      gk.budget != null ? `- 광고비 예산 사용 ${pctOr(gk.usage)} (${U.krw(gk.spent)}원 / ${U.krw(gk.budget)}원, 경과율 ${U.pct(gk.elapsedShare, 0)})` : '- 광고비 예산 미설정',
      '',
      '■ 채널별 (광고비 / 광고 ROAS)',
      ...ch.filter((r) => r.adRows).slice(0, 6).map((r) => `- ${r.channel}: ${U.krw(r.adSpend)}원 / ${pctOr(r.roas)}${r.judged && r.judged.target != null ? ` (${r.judged.state})` : ''}`),
      drops.length ? '' : null,
      drops.length ? `■ 검색 순위 하락 ${drops.length}건` : null,
      ...drops.slice(0, 3).map((x) => `- ${x.last.platform} '${x.last.keyword}' ${rt(x.prev)} → ${rt(x.last)}`),
      '',
      '■ 다음 액션',
      el.querySelector('#rAct').value,
    ].filter((x) => x != null).join('\n'));

    el.querySelector('#rXlsx').onclick = () => {
      U.exportXlsx(`${kind}광고보고_${st.start}_${st.end}.xlsx`, {
        요약: [
          { 항목: '기간', 값: `${st.start} ~ ${st.end}` }, { 항목: '비교', 값: `${lab} ${cs} ~ ${ce}` },
          { 항목: '광고비(광고 리포트)', 값: Math.round(s.adSpend) }, { 항목: `${lab} 광고비`, 값: Math.round(p.adSpend) },
          { 항목: '광고 매출', 값: Math.round(s.adRev) }, { 항목: '광고 ROAS', 값: s.roas }, { 항목: `${lab} 광고 ROAS`, 값: p.roas },
          { 항목: '노출', 값: a.hasImp ? a.imp : null }, { 항목: 'CTR', 값: a.ctr }, { 항목: '클릭', 값: a.hasClk ? a.clicks : null }, { 항목: 'CPC', 값: a.cpc },
          { 항목: '전환', 값: a.hasConv ? a.conv : null }, { 항목: 'CPA', 값: a.cpa }, { 항목: '유입', 값: s.visits }, { 항목: '전환율(방문)', 값: s.visits ? s.cvr : null },
        ],
        채널별: ch.map((r) => ({ 채널: r.channel, 광고비: Math.round(r.adSpend), 광고매출: Math.round(r.adRev), '광고 ROAS': r.roas, [`${lab} 광고 ROAS`]: r.prevRoas, [`${gLabel} 목표 판정`]: r.judged ? r.judged.state : null, 유입: r.visits, 전환율: r.visits ? r.cvr : null })),
        캠페인: camps.map((r) => ({ 채널: r.channel, 캠페인: r.name, 광고비: Math.round(r.spend), '광고 ROAS': r.roas })),
        목표: [{ 항목: '기준 월', 값: gm }, { 항목: '판정 기준일', 값: gr.upto }, { 항목: '광고 ROAS', 값: ratioLine(gr.roas, 'roas') }, { 항목: '전환율', 값: ratioLine(gr.cvr, 'cvr') },
          { 항목: '광고비 예산', 값: gk.budget }, { 항목: '예산 사용률', 값: gk.usage }],
        순위하락: drops.map((x) => ({ 플랫폼: x.last.platform, 키워드: x.last.keyword, 구분: x.last.type, 이전: rt(x.prev), 최근: rt(x.last), 관측: x.last.at })),
      });
    };
  }
})();
