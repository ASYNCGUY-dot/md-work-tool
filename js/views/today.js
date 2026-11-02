// '오늘 확인할 일' 허브 + 백업 안내 (개선 4단계, Codex 논의 2026-11-01)
// 각 화면을 그리지 않고 상태 계산 함수만 불러 모은다. '정상'(확인했는데 없음)과 '판정 불가'(자료가 없어 판단 못 함)를 구분하고,
// 항목에서 대상(거래처 상세·체크리스트)까지 바로 이동한다. 원래 화면에서 처리하면 여기서도 사라진다(별도 완료 상태 없음).
(function () {
  const U = MD.util;
  const BACKUP_DAYS = 7;

  // level: bad(지남·실패) > warn(오늘·곧) > info(참고)
  function dueTag(due, today) {
    if (!due) return { level: 'info', tag: '' };
    if (due < today) return { level: 'bad', tag: `기한 D+${U.diffDays(due, today)}` };
    if (due === today) return { level: 'warn', tag: '오늘' };
    return { level: 'warn', tag: `D-${U.diffDays(today, due)}` };
  }

  MD.todayItems = function (today = U.today()) {
    const d = MD.data, st = MD.store, groups = [];

    // 1) 자료 보호: 저장 실패·다른 탭 변경·저장소 오류·불완전 저장·백업
    const prot = [];
    if (st.backendError) prot.push({ level: 'bad', tag: '저장소', what: '저장소를 열지 못해 저장하지 않고 있습니다', why: st.backendError, go: { view: 'data' } });
    if (st.staleBy) prot.push({ level: 'bad', tag: '다른 탭', what: '다른 탭(창)에서 자료가 저장됐습니다', why: '새로고침해야 최신 자료를 보고 저장할 수 있습니다', go: { view: 'data' } });
    if (st.lastSave && !st.lastSave.ok) prot.push({ level: 'bad', tag: '저장 안 됨', what: '마지막 저장이 실패했습니다 — 변경이 화면에만 있습니다', why: `미저장 자료: ${(st.unsavedKeys() || []).join(', ') || '확인 필요'} · 백업 파일을 받아 두세요`, go: { view: 'data' } });
    if (st.interrupted) prot.push({ level: 'bad', tag: '불완전 저장', what: '지난 저장이 중간에 끝나지 못했습니다', why: `시점이 섞였을 수 있는 자료: ${st.interrupted.keys.join(', ')}`, go: { view: 'data' } });
    if (!d.isSample) {
      const at = U.store.get('lastBackupAt', null);
      // 저장 시각은 UTC(ISO)라 현지 날짜로 바꿔 오늘(현지 날짜)과 비교한다 — 한국 오전 9시 전 백업이 전날로 잡히던 문제 (Codex 개선 4단계 R1-03)
      const atDate = at && !isNaN(new Date(at)) ? (() => { const t = new Date(at); return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`; })() : null;
      const age = atDate ? U.diffDays(atDate, today) : null;
      if (atDate == null) prot.push({ level: 'warn', tag: '백업', what: '백업 파일을 받은 적이 없습니다', why: '자료는 이 브라우저에만 있습니다. [데이터 관리 → 백업 파일 받기]', go: { view: 'data' } });
      else if (age >= BACKUP_DAYS) prot.push({ level: 'warn', tag: `백업 ${age}일 전`, what: `마지막 백업 다운로드 요청이 ${age}일 전입니다`, why: `${atDate} — 브라우저가 파일을 실제로 저장했는지는 알 수 없어 '다운로드 요청' 시각으로 표시합니다`, go: { view: 'data' } });
    }
    groups.push({ key: 'protect', title: '자료 보호', items: prot });

    // 2) 기한 업무: 체크리스트·발주·거래처 후속 조치·계약 갱신 통보 (지남·오늘·7일 안)
    const due = [], soon = (x) => x && x <= U.addDays(today, 7);
    for (const c of d.checklists || []) {
      for (const i of (c.items || []).filter((x) => !x.done && soon(x.due))) {
        const t = dueTag(i.due, today);
        due.push({ ...t, what: `체크리스트 '${c.title}' — ${i.text}`, why: `${i.owner ? `담당 ${i.owner} · ` : ''}기한 ${i.due}`, due: i.due, go: { view: 'checklist', id: c.id } });
      }
    }
    for (const p of (d.pos || []).filter((x) => x.status !== '입고완료' && x.status !== '취소' && soon(x.eta))) {
      const t = dueTag(p.eta, today);
      due.push({ ...t, tag: t.level === 'bad' ? `입고 지연 D+${U.diffDays(p.eta, today)}` : t.tag, what: `발주 ${p.po || ''} ${p.vendor || ''} 입고 예정`, why: `입고 예정일 ${p.eta} · ${p.status || ''}`, due: p.eta, go: { view: 'orders' } });
    }
    for (const v of d.vendors || []) {
      if (!v.id) v.id = 'V' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); // 상세로 바로 이동하려면 id 필요(거래처 화면과 같은 방식, 다음 저장 때 함께 저장)
      if (v.due && v.status !== '중단' && soon(v.due)) {
        const t = dueTag(v.due, today);
        due.push({ ...t, what: `거래처 ${v.name} — ${v.next || '후속 조치'}`, why: `조치 기한 ${v.due}`, due: v.due, go: { view: 'vendors', id: v.id } });
      }
      if (MD.vendorContracts) {
        const info = MD.vendorContracts(v, today);
        for (const x of info.lateNotice || []) due.push({ level: 'bad', tag: `통보 기한 D+${U.diffDays(x.by, today)}`, what: `거래처 ${v.name} — ${x.c.title || x.c.kind} 갱신·해지 통보 기한 지남`, why: `통보 기한 ${x.by} · 만료 ${x.c.end} · 통보했는지 확인`, due: x.by, go: { view: 'vendors', id: v.id } });
        for (const x of (info.soonNotice || []).filter((n) => soon(n.by))) due.push({ level: 'warn', tag: x.state === 'today' ? '통보 오늘' : `통보 D-${U.diffDays(today, x.by)}`, what: `거래처 ${v.name} — ${x.c.title || x.c.kind} 갱신·해지 통보`, why: `통보 기한 ${x.by} · 만료 ${x.c.end}`, due: x.by, go: { view: 'vendors', id: v.id } });
        for (const c of info.expired || []) due.push({ level: 'bad', tag: '만료 지남', what: `거래처 ${v.name} — ${c.title || c.kind} 만료일이 지났는데 '유효'`, why: `만료 ${c.end} · 계약 상태 확인`, due: c.end, go: { view: 'vendors', id: v.id } });
      }
    }
    groups.push({ key: 'due', title: '기한 업무 (지남·오늘·7일 안)', items: due });

    // 3) 분석 준비: 자료 마감 확인·원가·수수료 — 예시 모드나 판매 자료가 없으면 판정 불가
    if (d.isSample) groups.push({ key: 'ready', title: '분석 준비', na: '예시 데이터라 판정하지 않습니다' });
    else if (!d.sales.length) groups.push({ key: 'ready', title: '분석 준비', na: '판매 자료가 없어 판정할 수 없습니다' });
    else {
      const ready = [], asOf = MD.calc.salesAsOf();
      if (asOf.unconfirmed && asOf.unconfirmed.length) ready.push({ level: 'warn', tag: '마감 미확인', what: `판매 자료 마감 확인 안 된 채널 ${asOf.unconfirmed.length}개`, why: `${asOf.unconfirmed.slice(0, 3).join(', ')}${asOf.unconfirmed.length > 3 ? ' 외' : ''} — 목표 기준일이 자료 마지막 날(${d.maxDate})로 잡힙니다`, go: { view: 'data', id: 'closeCard' } });
      // 원가·수수료는 판매에 나온 SKU·채널을 기준으로 본다 — 마스터에서 지워졌어도 판매가 남아 있으면 '미등록'으로 잡는다 (Codex 개선 4단계 R1-01)
      const soldSku = [...new Set(d.sales.map((r) => r.sku))], soldCh = [...new Set(d.sales.map((r) => r.channel))];
      const pm = d.productMap || {}, cm = d.channelMap || {};
      const noProd = soldSku.filter((k) => !pm[k]), noCost = soldSku.filter((k) => pm[k] && !(Number(pm[k].cost) > 0));
      const noCh = soldCh.filter((c) => !cm[c]), noFee = soldCh.filter((c) => cm[c] && !(Number(cm[c].fee) > 0));
      const list = (a) => a.slice(0, 3).join(', ') + (a.length > 3 ? ' 외' : '');
      if (noProd.length) ready.push({ level: 'warn', tag: '상품 미등록', what: `판매가 있는데 상품 마스터에 없는 SKU ${noProd.length}개`, why: `${list(noProd)} — 원가를 알 수 없어 이익이 부풀려집니다`, go: { view: 'data' } });
      if (noCost.length) ready.push({ level: 'warn', tag: '원가 0', what: `판매가 있는데 원가가 0인 상품 ${noCost.length}개`, why: `${list(noCost.map((k) => pm[k].name || k))} — 이익이 부풀려집니다`, go: { view: 'data' } });
      if (noCh.length) ready.push({ level: 'warn', tag: '채널 미등록', what: `판매가 있는데 채널 목록에 없는 채널 ${noCh.length}개`, why: `${list(noCh)} — 수수료·목표를 알 수 없습니다`, go: { view: 'data' } });
      if (noFee.length) ready.push({ level: 'info', tag: '수수료 0%', what: `판매가 있는데 수수료 0%인 채널 ${noFee.length}개`, why: `${list(noFee)} — 실제로 0%인지 확인`, go: { view: 'data' } });
      groups.push({ key: 'ready', title: '분석 준비', items: ready, asOf: asOf.date }); // salesAsOf의 실적 기준일 필드는 date (R1-02)
    }
    const rank = { bad: 0, warn: 1, info: 2 };
    groups.forEach((g) => { if (g.items) g.items.sort((a, b) => rank[a.level] - rank[b.level] || String(a.due || '').localeCompare(String(b.due || ''))); });
    return { today, groups };
  };

  // 허브 그리기. 항목의 [이동]은 대상 화면을 열고 MD.state.focus로 대상(거래처 상세·체크리스트)을 펼친다
  MD.renderToday = function (box) {
    const { today, groups } = MD.todayItems();
    const total = groups.reduce((a, g) => a + (g.items ? g.items.length : 0), 0);
    const badN = groups.reduce((a, g) => a + (g.items ? g.items.filter((i) => i.level === 'bad').length : 0), 0);
    box.innerHTML = `<div class="card" style="margin-bottom:16px">
      <div class="card-head"><h2>오늘 확인할 일</h2><span class="muted">오늘 ${today}${MD.data.maxDate ? ` · 판매 자료 ~${MD.data.maxDate}` : ''} — 원래 화면에서 처리하면 여기서도 사라집니다</span></div>
      ${groups.map((g) => `<div style="border-top:1px solid var(--line);padding:8px 0">
        <div class="row"><b>${g.title}</b>
          ${g.na ? `<span class="tag">판정 불가</span><span class="muted" style="font-size:12px">${U.esc(g.na)}</span>`
            : g.items.length ? `<span class="tag ${g.items.some((i) => i.level === 'bad') ? 'bad' : 'warn'}">확인 ${g.items.length}</span>`
            : '<span class="tag good">정상</span><span class="muted" style="font-size:12px">확인했고 해당 없음</span>'}
          ${g.asOf ? `<span class="muted" style="font-size:12px">실적 기준일 ${U.esc(g.asOf)}</span>` : ''}</div>
        ${g.items && g.items.length ? `<ul class="insights" style="margin:6px 0 0">${g.items.slice(0, 12).map((i, n) => `<li class="${i.level === 'bad' ? 'bad' : i.level === 'warn' ? 'warn' : ''}">
          ${i.tag ? `<span class="tag ${i.level === 'bad' ? 'bad' : i.level === 'warn' ? 'warn' : ''}">${U.esc(i.tag)}</span>` : ''}<b>${U.esc(i.what)}</b>
          <span class="muted" style="font-size:12px"> — ${U.esc(i.why || '')}</span>
          <button class="btn small" data-go="${g.key}:${n}" style="margin-left:6px">이동</button></li>`).join('')}</ul>${g.items.length > 12 ? `<div class="muted" style="font-size:12px">외 ${g.items.length - 12}개</div>` : ''}` : ''}
      </div>`).join('')}
      ${total ? `<div class="muted" style="font-size:12px">확인할 일 ${total}개${badN ? ` (지남·실패 ${badN})` : ''}</div>` : ''}
    </div>`;
    box.querySelectorAll('[data-go]').forEach((b) => (b.onclick = () => {
      const [gk, n] = b.dataset.go.split(':'), it = groups.find((g) => g.key === gk).items[Number(n)];
      MD.state.focus = it.go.id ? { view: it.go.view, id: it.go.id } : null;
      if (location.hash === '#' + it.go.view) MD.rerender(); else location.hash = '#' + it.go.view;
    }));
  };
  MD.todayCount = function () {
    try { const { groups } = MD.todayItems(); return groups.reduce((a, g) => a + (g.items ? g.items.filter((i) => i.level !== 'info').length : 0), 0); } catch (e) { return 0; }
  };
})();
