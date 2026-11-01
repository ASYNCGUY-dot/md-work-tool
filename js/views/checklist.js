// 상품 오픈·기획전 체크리스트: 담당·기한·완료·증빙 링크, 연결 상품(SKU)·행사 (로드맵 4순위)
(function () {
  const U = MD.util;

  // 종류별 기본 항목: [내용, 기준일(오픈일·행사 시작일)로부터 일수]
  const TEMPLATES = {
    '상품 오픈': [['상품 정보·고시 정보 확인', -14], ['상세페이지·썸네일 제작', -10], ['가격·원가·수수료 확인', -7], ['채널 상품 등록·검수 요청', -5], ['재고 입고 확인', -3], ['오픈 당일 노출·주문 확인', 0], ['오픈 1주 성과 점검', 7]],
    기획전: [['구좌·행사 신청', -21], ['할인율·쿠폰·예산 확정', -14], ['행사 재고 확보', -10], ['배너·소재 제작', -7], ['광고 예산·키워드 세팅', -3], ['행사 당일 노출·가격 확인', 0], ['행사 성과 리뷰(리프트·순증 이익)', 7]],
    기타: [],
  };
  const uid = (p) => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  // 증빙 링크는 http(s)만 링크로 연다 (javascript: 등은 글자로만 표시)
  const safeLink = (v) => (/^https?:\/\/\S+$/i.test(String(v || '').trim()) ? String(v).trim() : null);
  MD.checklistTemplates = TEMPLATES;

  // 체크리스트 상태: 완료 수·기한 지난 항목·다음 기한
  MD.checklistStatus = function (c, today = U.today()) {
    const items = Array.isArray(c.items) ? c.items : [];
    const done = items.filter((i) => i.done).length;
    const open = items.filter((i) => !i.done);
    const overdue = open.filter((i) => i.due && i.due < today);
    const next = open.filter((i) => i.due).map((i) => i.due).sort()[0] || null;
    return { total: items.length, done, overdue, next, complete: items.length > 0 && done === items.length };
  };

  let showDone = false, openId = null;

  MD.views.checklist = function (el) {
    const d = MD.data, today = U.today(), wk = U.addDays(today, 7);
    if (!Array.isArray(d.checklists)) d.checklists = [];
    const lists = d.checklists.map((c) => ({ c, s: MD.checklistStatus(c, today) }));
    const active = lists.filter((x) => !x.s.complete);
    const allOpen = active.flatMap((x) => x.c.items.filter((i) => !i.done));
    const overdueN = allOpen.filter((i) => i.due && i.due < today).length;
    const weekN = allOpen.filter((i) => i.due && i.due >= today && i.due <= wk).length;
    const promoOf = (id) => d.promotions.find((p) => p.id === id);
    const shown = lists.filter((x) => showDone || !x.s.complete)
      .sort((a, b) => (a.s.complete - b.s.complete) || ((b.s.overdue.length > 0) - (a.s.overdue.length > 0)) || String(a.s.next || '9999').localeCompare(String(b.s.next || '9999')));

    el.innerHTML = `
      <div class="kpis kpis-4">
        <div class="kpi"><div class="k">진행 중 체크리스트</div><div class="v">${active.length}개</div><div class="s">전체 ${lists.length}개</div></div>
        <div class="kpi"><div class="k">기한 지난 항목</div><div class="v" style="color:var(${overdueN ? '--bad' : '--good'})">${overdueN}개</div><div class="s">오늘 ${today}</div></div>
        <div class="kpi"><div class="k">7일 안에 마감</div><div class="v">${weekN}개</div><div class="s">~ ${wk}</div></div>
        <div class="kpi"><div class="k">남은 항목</div><div class="v">${allOpen.length}개</div><div class="s">진행 중 체크리스트 기준</div></div>
      </div>

      <div class="card" style="margin-top:16px">
        <div class="card-head"><h2>새 체크리스트</h2><span class="muted">종류를 고르면 기본 항목이 기준일에 맞춰 기한과 함께 들어갑니다(나중에 고칠 수 있음)</span></div>
        <div class="row end">
          <label class="field">제목<input type="text" id="nTitle" placeholder="예: 11월 블랙프라이데이 기획전" style="width:240px"></label>
          <label class="field">종류<select id="nKind">${Object.keys(TEMPLATES).map((k) => `<option>${k}</option>`).join('')}</select></label>
          <label class="field">연결 행사(선택)<select id="nPromo"><option value="">없음</option>${[...d.promotions].sort((a, b) => (a.start < b.start ? 1 : -1)).map((p) => `<option value="${U.esc(p.id)}">${U.esc(p.name)} (${U.esc(p.channel)} ${U.esc(p.start)})</option>`).join('')}</select></label>
          <label class="field">연결 SKU(선택, 쉼표로 구분)<input type="text" id="nSku" style="width:180px"></label>
          <label class="field">기준일(오픈일·행사 시작일)<input type="date" id="nBase" value="${U.addDays(today, 21)}"></label>
          <button class="btn primary" id="nAdd">만들기</button>
        </div>
      </div>

      <div class="card">
        <div class="card-head"><h2>체크리스트</h2>
          <label class="muted"><input type="checkbox" id="showDone" ${showDone ? 'checked' : ''}> 완료한 체크리스트도 보기</label></div>
        ${shown.length ? shown.map(({ c, s }) => {
          const p = c.promoId ? promoOf(c.promoId) : null, isOpen = openId === c.id;
          const unknown = (c.skus || []).filter((k) => !d.productMap[k]);
          return `<div class="cl" style="border-top:1px solid var(--line);padding:10px 0">
            <div class="row">
              <button class="btn small" data-open="${U.esc(c.id)}">${isOpen ? '접기' : '열기'}</button>
              <b>${U.esc(c.title)}</b> <span class="tag">${U.esc(c.kind || '')}</span>
              ${s.complete ? '<span class="tag good">완료</span>' : s.overdue.length ? `<span class="tag bad">기한 지남 ${s.overdue.length}</span>` : ''}
              <span class="muted" style="font-size:12px">${s.done}/${s.total} 완료${s.next ? ` · 다음 기한 ${U.esc(s.next)}` : ''}${c.base ? ` · 기준일 ${U.esc(c.base)}` : ''}</span>
              <span class="spacer"></span>
              <span class="muted" style="font-size:12px">${c.promoId ? (p ? `행사: <a href="#promotions">${U.esc(p.name)}</a> (${U.esc(p.start)}~${U.esc(p.end)})` : '연결 행사가 삭제됨') : ''}${(c.skus || []).length ? ` · SKU ${U.esc(c.skus.join(', '))}${unknown.length ? ` <span style="color:var(--warn)">(상품 마스터에 없음: ${U.esc(unknown.join(', '))})</span>` : ''}` : ''}</span>
            </div>
            <div class="bar-track"><div class="bar-fill" style="width:${s.total ? Math.round((s.done / s.total) * 100) : 0}%"></div></div>
            ${isOpen ? `<div class="table-wrap" style="margin-top:8px"><table><thead><tr><th>완료</th><th>항목</th><th>담당</th><th>기한</th><th>증빙 링크</th><th></th></tr></thead><tbody>
              ${c.items.map((i) => {
                const late = !i.done && i.due && i.due < today, link = safeLink(i.link);
                return `<tr data-cl="${U.esc(c.id)}" data-it="${U.esc(i.id)}">
                  <td><input type="checkbox" data-f="done" ${i.done ? 'checked' : ''}></td>
                  <td><input type="text" data-f="text" value="${U.esc(i.text)}" style="width:100%;min-width:200px${i.done ? ';text-decoration:line-through;color:var(--muted)' : ''}"></td>
                  <td><input type="text" data-f="owner" value="${U.esc(i.owner || '')}" style="width:90px"></td>
                  <td><input type="date" data-f="due" value="${U.esc(i.due || '')}"${late ? ' style="color:var(--bad);border-color:var(--bad)"' : ''}>${i.done && typeof i.doneAt === 'string' && i.doneAt ? `<div class="muted" style="font-size:11px">완료 ${U.esc(i.doneAt.slice(0, 10))}</div>` : ''}</td>
                  <td><input type="text" data-f="link" value="${U.esc(i.link || '')}" placeholder="https://" style="width:160px">${link ? ` <a href="${U.esc(link)}" target="_blank" rel="noopener noreferrer">열기</a>` : i.link ? ' <span class="muted" style="font-size:11px">http(s) 주소만 열 수 있음</span>' : ''}</td>
                  <td><button class="btn small danger" data-del>삭제</button></td></tr>`;
              }).join('')}
              </tbody></table></div>
              <div class="row" style="margin-top:6px">
                <button class="btn small" data-additem="${U.esc(c.id)}">항목 추가</button>
                <span class="spacer"></span>
                <button class="btn small danger" data-delcl="${U.esc(c.id)}">체크리스트 삭제</button>
              </div>` : ''}
          </div>`;
        }).join('') : `<div class="empty">${lists.length ? '진행 중인 체크리스트가 없습니다.' : '아직 체크리스트가 없습니다. 위에서 만들어 보세요.'}</div>`}
      </div>`;

    const save = async () => { const ok = await MD.store.save(['checklists']); return ok; };
    const find = (cid) => d.checklists.find((c) => c.id === cid);

    el.querySelector('#nPromo').onchange = (e) => {
      const p = promoOf(e.target.value);
      if (p) { el.querySelector('#nBase').value = p.start; if (!el.querySelector('#nTitle').value) el.querySelector('#nTitle').value = p.name; el.querySelector('#nKind').value = '기획전'; }
    };
    el.querySelector('#nAdd').onclick = async () => {
      const title = el.querySelector('#nTitle').value.trim(), kind = el.querySelector('#nKind').value, base = el.querySelector('#nBase').value;
      if (!title) { U.toast('제목을 입력하세요.', 'bad'); return; }
      if (TEMPLATES[kind].length && !U.normDate(base)) { U.toast('기준일을 입력하세요(기본 항목의 기한 계산에 씁니다).', 'bad'); return; }
      const skus = [...new Set(el.querySelector('#nSku').value.split(',').map((x) => x.trim()).filter(Boolean))];
      const c = {
        id: uid('CL'), title, kind, promoId: el.querySelector('#nPromo').value || '', skus, base: U.normDate(base) || '', createdAt: new Date().toISOString(),
        items: TEMPLATES[kind].map(([text, off]) => ({ id: uid('I'), text, owner: '', due: U.addDays(base, off), done: false, link: '' })),
      };
      d.checklists.push(c);
      if (!(await save())) { d.checklists.pop(); return; }
      openId = c.id; MD.rerender(); U.toast('체크리스트를 만들었습니다.');
    };
    el.querySelector('#showDone').onchange = (e) => { showDone = e.target.checked; MD.rerender(); };
    el.querySelectorAll('[data-open]').forEach((b) => (b.onclick = () => { openId = openId === b.dataset.open ? null : b.dataset.open; MD.rerender(); }));
    // 항목 수정: 바뀐 칸만 저장. 실패하면 이전 값으로 되돌려 화면과 저장 자료를 맞춘다
    el.querySelectorAll('tr[data-it]').forEach((tr) => {
      const c = find(tr.dataset.cl), it = c && c.items.find((i) => i.id === tr.dataset.it);
      if (!it) return;
      tr.querySelectorAll('[data-f]').forEach((inp) => (inp.onchange = async () => {
        const f = inp.dataset.f, prev = { ...it };
        if (f === 'done') { it.done = inp.checked; it.doneAt = inp.checked ? new Date().toISOString() : ''; }
        else if (f === 'due') { const v = inp.value ? U.normDate(inp.value) : ''; if (inp.value && !v) { U.toast('날짜 형식이 아닙니다.', 'bad'); MD.rerender(); return; } it.due = v || ''; }
        else if (f === 'text') { const v = inp.value.trim(); if (!v) { U.toast('항목 내용을 비울 수 없습니다. 지우려면 삭제를 누르세요.', 'bad'); MD.rerender(); return; } it.text = v; }
        else it[f] = inp.value.trim();
        if (!(await save())) Object.assign(it, prev);
        MD.rerender();
      }));
      tr.querySelector('[data-del]').onclick = async () => {
        if (!confirm(`'${it.text}' 항목을 삭제합니다.`)) return;
        const keep = c.items;
        c.items = c.items.filter((i) => i !== it);
        if (!(await save())) c.items = keep;
        MD.rerender();
      };
    });
    el.querySelectorAll('[data-additem]').forEach((b) => (b.onclick = async () => {
      const c = find(b.dataset.additem); if (!c) return;
      c.items.push({ id: uid('I'), text: '새 항목', owner: '', due: '', done: false, link: '' });
      if (!(await save())) c.items.pop();
      MD.rerender();
    }));
    el.querySelectorAll('[data-delcl]').forEach((b) => (b.onclick = async () => {
      const c = find(b.dataset.delcl); if (!c || !confirm(`'${c.title}' 체크리스트를 삭제합니다. 되돌릴 수 없습니다(백업 파일에 있으면 복원 가능).`)) return;
      const keep = d.checklists;
      d.checklists = d.checklists.filter((x) => x !== c);
      if (!(await save())) d.checklists = keep;
      MD.rerender();
    }));
  };
})();
