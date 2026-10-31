// 사용 가이드·월초 체크: 새 달을 시작할 때 할 일을 순서대로 보여 주고, 각 단계가 끝났는지 실제 데이터로 표시한다
(function () {
  const U = MD.util, C = MD.calc;

  const monthEnd = (m) => { const [y, mm] = m.split('-').map(Number); return U.fmt(new Date(Date.UTC(y, mm, 0))); };
  const prevMonth = (m) => { const [y, mm] = m.split('-').map(Number); return U.fmt(new Date(Date.UTC(y, mm - 2, 1))).slice(0, 7); };
  const label = (m) => `${m.slice(0, 4)}년 ${Number(m.slice(5))}월`;

  // 월초 단계별 상태 (done: true 완료 · false 할 일 · null 해당 없음)
  function steps(M) {
    const d = MD.data, P = prevMonth(M), pEnd = monthEnd(P);
    const salesCh = [...new Set(C.inRange(d.sales, P + '-01', pEnd).map((r) => r.channel))];
    const notClosed = salesCh.filter((c) => (C.closeOf(c, 'sales') || '') < pEnd);
    const lag = d.maxDate ? U.diffDays(d.maxDate, U.today()) : null;
    const chNoTarget = d.channels.filter((c) => C.targetInfo(c.name, M).source !== 'month');
    const co = C.targetRow('', M) || {};
    const kpiSet = ['margin', 'adBudget', 'roas', 'cvr'].filter((k) => co[k] != null);
    const lastAd = d.ads.length ? d.ads[d.ads.length - 1].date : null, lastCp = d.compete.length ? d.compete[d.compete.length - 1].date : null;
    const promosM = d.promotions.filter((p) => p.start <= monthEnd(M) && p.end >= M + '-01');
    const eventsM = d.events.filter((e) => e.date <= monthEnd(M) && (e.end || e.date) >= M + '-01');
    return [
      { key: 'upload', title: '1. 지난달 말일까지 자료 올리기', how: '데이터 관리 → 통합 양식(판매·유입·광고·경쟁 시트)을 채워 한 번에 올립니다. 개별 양식으로 올려도 됩니다.', href: '#data',
        done: d.maxDate ? d.maxDate >= pEnd : false, state: d.maxDate ? `판매 자료 마지막 날 ${d.maxDate}${lag != null ? ` (오늘보다 ${lag}일 전)` : ''}` : '판매 자료 없음' },
      { key: 'close', title: '2. 지난달 자료 마감 확인', how: '데이터 관리 → 자료 마감 확인에서 채널마다 지난달 말일까지 확인일을 찍습니다. 정산·취소가 늦게 들어오는 채널은 들어온 뒤에 찍으세요. 확인일까지만 목표를 판정합니다.', href: '#data',
        done: salesCh.length ? !notClosed.length : null, state: salesCh.length ? (notClosed.length ? `${P.slice(5)}월 말일까지 확인 안 된 채널 ${notClosed.length}개: ${notClosed.slice(0, 4).join(', ')}` : `${salesCh.length}개 채널 모두 ${pEnd}까지 확인`) : '지난달 판매 자료 없음' },
      { key: 'report', title: '3. 지난달 실적 보고서 확정', how: '보고서 화면에서 기간을 "지난 달"로 두고 인쇄·PDF, 엑셀, 메신저 복사로 공유합니다. 다음 액션 칸을 직접 고치면 그 기간 보고서에 저장됩니다.', href: '#report', action: 'lm',
        done: null, state: '보고서 열기 버튼은 기간을 지난 달로 맞춰 엽니다' },
      { key: 'target', title: `4. ${Number(M.slice(5))}월 목표 입력`, how: '목표·KPI 달성 → 목표 입력에서 채널별 매출 목표를 넣습니다. "전년 같은 달 × (1+성장률)" 채우기·이전 달 복사를 쓰면 빠릅니다. 이익률·광고비 예산·광고 ROAS·전환율 목표와 근거 메모도 함께 남기세요.', href: '#goals',
        done: d.channels.length ? !chNoTarget.length && kpiSet.length > 0 : null,
        state: `채널 매출 목표 ${d.channels.length - chNoTarget.length}/${d.channels.length}개 입력${chNoTarget.length ? ` (미입력: ${chNoTarget.slice(0, 3).map((c) => c.name).join(', ')}${chNoTarget.length > 3 ? ' 외' : ''} — 기본값 또는 미설정)` : ''} · 전사 KPI ${kpiSet.length}/4개` },
      { key: 'plan', title: `5. ${Number(M.slice(5))}월 행사·이슈 등록`, how: '프로모션 화면에 이번 달 행사를 등록하고, 매출 변동 분석 → 이슈 기록에 예정된 외부 요인(시즌·경쟁사 행사·날씨·공휴일 변경)을 적어 둡니다. 월말에 변동 원인을 찾을 때 근거가 됩니다.', href: '#promotions',
        done: promosM.length || eventsM.length ? true : false, state: `이번 달 행사 ${promosM.length}건 · 이슈 기록 ${eventsM.length}건` },
      { key: 'ads', title: '6. 광고 리포트·경쟁 조사 갱신', how: '광고 리포트(광고비·광고 매출, 가능하면 노출·클릭·전환·캠페인)와 경쟁 상품 가격·순위 조사를 올립니다. 열을 더 넣을수록 광고 성과·경쟁 비교 분석이 늘어납니다.', href: '#ads',
        done: lastAd ? lastAd >= pEnd : false, state: `광고 리포트 마지막 날 ${lastAd || '없음'} · 경쟁 조사 마지막 날 ${lastCp || '없음'}` },
    ];
  }

  const WEEKLY = [
    ['월요일', '지난주 자료 올리기 → 자료 마감 확인 → 보고서 기간 "지난 주"로 주간 보고(메신저 복사)'],
    ['수시', '목표·KPI 달성에서 "기준일까지 계획 대비"와 부족액 상위 채널 확인 → 매출 변동 분석의 개선 제안 검토'],
    ['행사 종료 후', '프로모션 화면에서 리프트·순증 이익 판정 확인, 다음 행사 손익분기 시뮬레이터로 조건 점검'],
    ['재고', '상품 성과·재고와 발주·입고 일정에서 소진 임박·입고 지연 확인'],
  ];
  const DEFS = [
    ['매출', 'VAT 포함 실결제액(판매 자료 그대로)'],
    ['순매출', '매출 ÷ 1.1'],
    ['매출총이익 / 이익률', '순매출 − 수수료(매출×수수료율÷1.1) − 원가(수량×입고원가) / 매출총이익 ÷ 순매출'],
    ['공헌이익', '매출총이익 − 광고비÷1.1 (광고비 출처는 [데이터 관리 → 계산 기준]에서 유입 파일·광고 리포트 중 선택, 기본은 유입 파일)'],
    ['광고 ROAS', '광고 리포트의 광고 매출 ÷ 광고비 (플랫폼 귀속 매출, 광고 매출이 빈 행은 제외)'],
    ['전환율', '주문 ÷ 방문. 목표 판정은 유입 파일의 주문 건수(플랫폼 통계)로만'],
    ['기간 목표 대비', '선택 기간 실적 ÷ 그 기간에 일수로 나눈 목표'],
    ['월 목표 달성률 / 계획 대비', '누적 실적 ÷ 월 목표 / 누적 실적 ÷ (월 목표 × 경과일 ÷ 월 일수)'],
    ['실적 기준일', '판매가 있는 모든 채널의 자료 마감 확인일 중 가장 이른 날(미확인 채널이 있으면 자료 마지막 날 + 경고)'],
    ['비교 기준', '직전 동일기간(같은 길이 바로 앞) · 전월 동기간(한 달 앞 같은 날짜) · 전년 동기(1년 앞 같은 날짜)'],
  ];

  MD.views.guide = function (el) {
    const d = MD.data;
    const M = U.today().slice(0, 7), list = steps(M);
    const doneN = list.filter((s) => s.done === true).length, need = list.filter((s) => s.done !== null).length;
    const S = MD.SPECS || {};
    const unlock = { sales: '대시보드·상품·목표 실적·보고서', traffic: '전환율·유입 분석, 전환율 목표', ads: '광고 ROAS(필수) → 노출·클릭·전환·캠페인 열로 CTR·CPC·CPA·캠페인 분석', products: '이익·이익률, 재고 일수, ABC', channels: '수수료·월 기본 목표', compete: '경쟁 가격 격차 → 순위·리뷰·평점 열로 순위 변화·리뷰 격차' };
    const when = { sales: '매주 또는 월초(지난달 전체)', traffic: '매주', ads: '매주(플랫폼 리포트)', products: '신상품·원가 변경 때', channels: '수수료·목표 변경 때', compete: '주 1회 같은 요일 조사 권장' };
    el.innerHTML = `
      ${d.isSample ? '<div class="note" style="margin-bottom:12px">지금은 예시 데이터입니다. 아래 상태 표시는 예시 기준이며, 내 데이터를 올리면 실제 상태로 바뀝니다.</div>' : ''}
      <div class="card"><div class="card-head"><h2>${label(M)} 월초 체크</h2><span class="muted">${doneN}/${need}단계 완료 · 순서대로 진행하세요</span></div>
        <ol class="guide-steps">${list.map((s) => `<li class="${s.done === true ? 'done' : s.done === false ? 'todo' : 'na'}">
          <div class="row"><b>${U.esc(s.title)}</b><span class="tag ${s.done === true ? 'good' : s.done === false ? 'warn' : 'neutral'}">${s.done === true ? '완료' : s.done === false ? '할 일' : '확인'}</span><span class="spacer"></span>
            <a class="btn small" href="${s.href}" ${s.action ? `data-act="${s.action}"` : ''}>${s.action ? '지난 달 보고서 열기' : '바로 가기'}</a></div>
          <div class="muted" style="font-size:12px;margin-top:2px">${U.esc(s.state)}</div>
          <div style="margin-top:4px">${U.esc(s.how)}</div></li>`).join('')}</ol>
      </div>

      <div class="card"><div class="card-head"><h2>자료 종류와 파일 양식</h2><button class="btn small" id="gdTpl">통합 양식 받기 (.xlsx)</button></div>
        <p style="margin-top:0">양식은 <b>통합 양식 한 파일</b>(시트별로 종류 구분)과 <b>종류별 개별 양식</b> 두 가지가 있고, 열 이름 규칙은 같습니다. 열 이름은 흔한 표기(예: 주문일·결제금액·쇼핑몰)를 자동으로 알아보므로 플랫폼에서 받은 파일의 열 이름을 꼭 바꿀 필요는 없습니다. 필수 열만 있으면 올라가고, 선택 열을 더 넣을수록 분석이 늘어납니다.</p>
        <div class="table-wrap"><table><thead><tr><th>종류</th><th>언제</th><th>필수 열</th><th>선택 열</th><th>열리는 분석</th></tr></thead><tbody>
          ${['sales', 'traffic', 'ads', 'products', 'channels', 'compete'].filter((k) => S[k]).map((k) => `<tr><td><b>${U.esc(S[k].label)}</b></td><td>${when[k]}</td><td>${S[k].required.map((r) => S[k].cols[r][0]).join(', ')}</td><td>${Object.keys(S[k].cols).filter((c) => !S[k].required.includes(c)).map((c) => S[k].cols[c][0]).join(', ') || '-'}</td><td>${unlock[k]}</td></tr>`).join('')}
        </tbody></table></div>
        <div class="note">행사·거래처·발주·소싱 후보·목표는 화면에서 직접 입력합니다. 다른 PC로 옮길 때는 데이터 관리 → 백업 파일을 씁니다.</div>
      </div>

      <div class="grid g2">
        <div class="card"><div class="card-head"><h2>평소 루틴</h2></div>
          <ul class="checklist">${WEEKLY.map(([w, t]) => `<li><span><b>${w}</b> — ${U.esc(t)}</span></li>`).join('')}</ul></div>
        <div class="card"><div class="card-head"><h2>지표 정의</h2></div>
          <div class="table-wrap"><table><tbody>${DEFS.map(([k, v]) => `<tr><td style="white-space:nowrap"><b>${k}</b></td><td>${U.esc(v)}</td></tr>`).join('')}</tbody></table></div></div>
      </div>`;
    el.querySelector('#gdTpl').onclick = () => MD.downloadUnifiedTemplate();
    el.querySelectorAll('[data-act="lm"]').forEach((a) => (a.onclick = (e) => { e.preventDefault(); MD.state.preset = 'lm'; MD.refresh(); location.hash = '#report'; }));
  };
})();
