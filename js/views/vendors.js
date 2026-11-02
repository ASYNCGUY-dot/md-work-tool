// 표 안에서 바로 고치는 편집기 (거래처·발주·채널·상품 공용) + 거래처·계약 화면
(function () {
  const U = MD.util;

  // fields: [{key, label, type: text|number|date|select|pct, options, width}]
  MD.crud = function (el, { fields, list, onChange, newRow, rowClass, extra, rowName }) {
    // 입력칸 이름(화면 읽기 프로그램용): '열 이름 — 행 이름'. 행 이름은 기본으로 첫 열 값(업체명·발주번호·SKU 등) (개선 6단계)
    const nameOf = (r, i) => String((rowName ? rowName(r) : r[fields[0].key]) || `${i + 1}번째 행`);
    function cell(f, r, i) {
      const v = r[f.key];
      const st = (f.width ? `style="width:${f.width}"` : '') + ` aria-label="${U.esc(`${f.label} — ${nameOf(r, i)}`)}"`;
      if (f.type === 'select') return `<select data-i="${i}" data-k="${f.key}" ${st}>${(v != null && v !== '' && !f.options.includes(v) ? [...f.options, v] : f.options).map((o) => `<option ${o === v ? 'selected' : ''}>${U.esc(o)}</option>`).join('')}</select>`;
      if (f.type === 'pct') return `<input type="number" step="0.1" data-i="${i}" data-k="${f.key}" data-pct="1" value="${v === '' || v == null ? '' : Math.round(v * 1000) / 10}" ${st}>`;
      return `<input type="${f.type || 'text'}" data-i="${i}" data-k="${f.key}" value="${U.esc(v ?? '')}" ${st}>`;
    }
    function draw() {
      // 첫 열(식별 열)은 가로로 넘겨도 보이게 고정(sticky-col)
      el.innerHTML = `<div class="table-wrap"><table><thead><tr>${extra ? '<th></th>' : ''}${fields.map((f, j) => `<th class="${f.type === 'number' || f.type === 'pct' ? 'num' : ''}${j === 0 ? ' sticky-col' : ''}">${f.label}</th>`).join('')}<th></th></tr></thead>
        <tbody>${list().map((r, i) => `<tr class="${rowClass ? rowClass(r) : ''}">${extra ? `<td>${extra(r)}</td>` : ''}${fields.map((f, j) => `<td${j === 0 ? ' class="sticky-col"' : ''}>${cell(f, r, i)}</td>`).join('')}<td class="actions"><button class="btn small danger" data-del="${i}" aria-label="${U.esc(`${nameOf(r, i)} 삭제`)}">삭제</button></td></tr>`).join('') || `<tr><td colspan="${fields.length + 2}" class="muted" style="text-align:center;padding:16px">항목이 없습니다.</td></tr>`}</tbody></table></div>
        ${newRow ? '<div class="row" style="margin-top:10px"><button class="btn small" data-add>+ 행 추가</button></div>' : ''}`;
    }
    draw();
    // onChange는 기존처럼 동기 false로 되돌릴 수도, Promise<boolean>으로 저장 결과가 나온 뒤 되돌릴 수도 있다 (저장 실패 시 복구용)
    function applyResult(res, revert) {
      if (res && typeof res.then === 'function') res.then((ok) => { if (ok === false) revert(); draw(); }, () => { revert(); draw(); });
      else { if (res === false) revert(); draw(); }
    }
    // 칸마다 '마지막으로 저장된 값'과 진행 중 저장 수를 기억한다. 같은 칸을 저장이 끝나기 전에 다시 고쳐도, 실패하면 그 칸의 마지막
    // 저장 완료 값으로 되돌린다(앞 편집의 미저장 값을 다시 쓰지 않음). 저장은 차례로 처리되므로 성공한 편집의 값이 곧 저장된 값 (Codex 개선 3단계 R1-02)
    const cellState = new WeakMap();
    const cellOf = (row, k) => { let m = cellState.get(row); if (!m) cellState.set(row, (m = {})); return m[k] || (m[k] = { pending: 0, base: undefined }); };
    el.onchange = (e) => {
      const t = e.target; if (t.dataset.i == null) return;
      const f = fields.find((x) => x.key === t.dataset.k);
      let v = t.value;
      if (t.dataset.pct) v = v === '' ? 0 : Number(v) / 100;
      else if (f.type === 'number') v = v === '' ? 0 : Number(v);
      const row = list()[t.dataset.i], key = t.dataset.k, old = row[key], hadEdited = row.sampleEdited;
      const cell = cellOf(row, key);
      if (cell.pending === 0) cell.base = { value: old, edited: hadEdited };
      row[key] = v;
      if (row.sample && old !== v) row.sampleEdited = true; // 고친 예시 행 — 내 데이터 전환 때 고를 수 있게 (개선 1단계)
      const res = onChange('edit', row, { key, old, value: v });
      if (res && typeof res.then === 'function') {
        cell.pending++;
        res.then((ok) => ok !== false, () => false).then((ok) => {
          cell.pending--;
          if (ok) cell.base = { value: v, edited: row.sampleEdited };
          else if (cell.pending === 0) { row[key] = cell.base.value; if (cell.base.edited) row.sampleEdited = cell.base.edited; else delete row.sampleEdited; }
          draw();
        });
      } else applyResult(res, () => { row[key] = old; if (hadEdited) row.sampleEdited = hadEdited; else delete row.sampleEdited; });
    };
    el.onclick = (e) => {
      const t = e.target;
      if (t.dataset.del != null && confirm('이 행을 삭제할까요?')) {
        const idx = Number(t.dataset.del), removed = list().splice(idx, 1)[0];
        applyResult(onChange('delete'), () => list().splice(idx, 0, removed));
      }
      if (t.dataset.add != null) {
        const row = newRow();
        list().push(row);
        applyResult(onChange('add'), () => { const i = list().indexOf(row); if (i !== -1) list().splice(i, 1); });
      }
    };
    return { redraw: draw };
  };

  let typeFilter = '', detailId = null;
  const uid = (p) => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const safeLink = (v) => (/^https?:\/\/\S+$/i.test(String(v || '').trim()) ? String(v).trim() : null);
  const CONTRACT_KINDS = ['공급 계약', '판권·라이선스', '플랫폼 입점', '유통·대리점', '기타'];
  const CONTRACT_STATUS = ['유효', '협의중', '만료', '해지'];
  const RENEWAL = ['협의 갱신', '자동 갱신', '갱신 없음'];
  const HIST_KINDS = ['연락', '미팅', '조건 변경', '계약', '기타'];
  const LABEL = { status: '상태', terms: '거래 조건', contractEnd: '계약·판권 만료' };

  // 거래처의 계약 요약: 유효 계약 수, 가장 빠른 만료일, 갱신 통보 기한(만료일 − 통보 일수)
  // soonNotice = 통보 기한이 오늘~30일 안, lateNotice = 만료 전인데 통보 기한이 이미 지난 것.
  // 지난 기한을 알림에서 빼면 가장 급한 항목이 사라지므로 따로 모아 함께 보여 준다 (Codex 개선 논의 2026-11-01)
  MD.vendorContracts = function (v, today = U.today()) {
    const list = (Array.isArray(v.contracts) ? v.contracts : []).filter((c) => c.status === '유효');
    const ends = list.filter((c) => c.end && c.end >= today).map((c) => c.end).sort();
    // 통보 일수는 1~3650일 정수만 계산(잘못 저장된 값이 날짜 계산 예외로 화면 전체를 멈추지 않게, Codex 개선 0단계 R1-02)
    const okN = (n) => Number.isInteger(Number(n)) && Number(n) >= 1 && Number(n) <= 3650;
    const notices = list.filter((c) => c.end && U.normDate(c.end) && okN(c.noticeDays)).map((c) => ({ c, by: U.addDays(c.end, -Number(c.noticeDays)) }));
    const end = ends[0] || (v.contractEnd && !list.length ? v.contractEnd : null); // 계약 상세가 없으면 목록의 만료일
    const state = (by) => (by < today ? 'late' : by === today ? 'today' : 'soon');
    const byDate = (a, b) => (a.by < b.by ? -1 : 1);
    const soonNotice = notices.filter((x) => x.by >= today && U.diffDays(today, x.by) <= 30).map((x) => ({ ...x, state: state(x.by) })).sort(byDate);
    const lateNotice = notices.filter((x) => x.by < today && x.c.end >= today).map((x) => ({ ...x, state: 'late' })).sort(byDate);
    const expired = list.filter((c) => c.end && c.end < today); // 만료일이 지났는데 상태가 '유효'
    return { active: list.length, end, notices, soonNotice, lateNotice, expired };
  };

  function detail(el, d, v, today, save) {
    if (!Array.isArray(v.contracts)) v.contracts = [];
    if (!Array.isArray(v.history)) v.history = [];
    const box = el.querySelector('#vDetail');
    const hist = [...v.history].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
    box.innerHTML = `<div class="card" style="border-color:var(--accent)">
      <div class="card-head"><h2>${U.esc(v.name || '(이름 없음)')} — 상세</h2><span class="spacer"></span><button class="btn small" id="dClose">닫기</button></div>
      <div class="row end">
        <label class="field">국가<input type="text" data-b="country" value="${U.esc(v.country || '')}" style="width:90px"></label>
        <label class="field">담당·연락처<input type="text" data-b="contact" value="${U.esc(v.contact || '')}" style="width:180px"></label>
        <label class="field">기본 거래 조건<input type="text" data-b="terms" value="${U.esc(v.terms || '')}" style="width:240px" placeholder="결제·인코텀즈·수수료 등"></label>
        <label class="field">최근 연락<input type="date" data-b="last" value="${U.esc(v.last || '')}"></label>
        <label class="field">메모<input type="text" data-b="memo" value="${U.esc(v.memo || '')}" style="width:200px"></label>
      </div>
      <h3 style="margin:16px 0 6px;font-size:14px">계약·판권 ${v.contracts.length}건</h3>
      <div id="dContracts"></div>
      <div class="note">통보 일수: 만료 며칠 전까지 갱신·해지를 알려야 하는지(계약서 조항). 유효 계약의 통보 기한이 30일 안이면 위 '오늘 챙길 일'에 표시됩니다. 계약서 위치는 http(s) 주소만 링크로 엽니다.</div>
      <h3 style="margin:16px 0 6px;font-size:14px">이력 ${hist.length}건</h3>
      <div class="row end">
        <label class="field">날짜<input type="date" id="hDate" value="${today}"></label>
        <label class="field">구분<select id="hKind">${HIST_KINDS.map((k) => `<option>${k}</option>`).join('')}</select></label>
        <label class="field">내용<input type="text" id="hText" style="width:320px" placeholder="예: 단가 3% 인하 요청, 11/15까지 회신"></label>
        <button class="btn small" id="hAdd">이력 추가</button>
      </div>
      ${hist.length ? `<div class="table-wrap" style="margin-top:8px"><table><thead><tr><th>날짜</th><th>구분</th><th>내용</th><th></th></tr></thead><tbody>
        ${hist.map((h) => `<tr><td>${U.esc(h.date || '')}</td><td>${U.esc(h.kind || '')}</td><td>${U.esc(h.text || '')}</td><td><button class="btn small danger" data-hdel="${U.esc(h.id)}">삭제</button></td></tr>`).join('')}
      </tbody></table></div>` : '<div class="muted" style="margin-top:6px">기록된 이력이 없습니다. 상태·거래 조건·만료일을 바꾸면 자동으로 남습니다.</div>'}
    </div>`;
    box.querySelector('#dClose').onclick = () => { detailId = null; MD.rerender(); };
    box.querySelectorAll('[data-b]').forEach((inp) => (inp.onchange = async () => {
      const k = inp.dataset.b, old = v[k] ?? '', val = inp.value.trim();
      if (k === 'last' && val && !U.normDate(val)) { U.toast('날짜 형식이 아닙니다.', 'bad'); MD.rerender(); return; }
      v[k] = val;
      if (k === 'terms' && old !== val) v.history.push({ id: uid('H'), date: today, kind: '조건 변경', text: `거래 조건: ${old || '(없음)'} → ${val || '(없음)'}` });
      if (!(await save())) { v[k] = old; if (k === 'terms') v.history.pop(); }
      MD.rerender();
    }));
    MD.crud(box.querySelector('#dContracts'), {
      fields: [
        { key: 'kind', label: '종류', type: 'select', options: CONTRACT_KINDS },
        { key: 'title', label: '계약명·대상(브랜드·품목)', width: '170px' },
        { key: 'territory', label: '지역·채널 범위', width: '120px' },
        { key: 'start', label: '시작', type: 'date' },
        { key: 'end', label: '만료', type: 'date' },
        { key: 'terms', label: '조건(결제·수수료·로열티)', width: '170px' },
        { key: 'royalty', label: '로열티·수수료(%)', type: 'pct', width: '70px' },
        { key: 'minimum', label: '최소 보장·MOQ 금액', type: 'number', width: '110px' },
        { key: 'renewal', label: '갱신', type: 'select', options: RENEWAL },
        { key: 'noticeDays', label: '통보 일수', type: 'number', width: '60px' },
        { key: 'status', label: '상태', type: 'select', options: CONTRACT_STATUS },
        { key: 'link', label: '계약서 위치', width: '130px' },
      ],
      list: () => v.contracts,
      extra: (c) => { const l = safeLink(c.link); return l ? `<a href="${U.esc(l)}" target="_blank" rel="noopener noreferrer">계약서</a>` : ''; },
      onChange: (kind, row, ch) => {
        if (kind === 'edit' && ch && (ch.key === 'start' || ch.key === 'end') && ch.value && !U.normDate(ch.value)) { U.toast('날짜 형식이 아닙니다.', 'bad'); return false; }
        if (kind === 'edit' && ch && ch.key === 'noticeDays' && !(Number.isInteger(ch.value) && ch.value >= 0 && ch.value <= 3650)) { U.toast('통보 일수는 0~3650일 사이 정수로 입력하세요.', 'bad'); return false; }
        let pushedHistory = false;
        if (kind === 'edit' && ch && ['status', 'end', 'terms'].includes(ch.key) && ch.old !== ch.value) {
          v.history.push({ id: uid('H'), date: today, kind: ch.key === 'status' ? '계약' : '조건 변경', text: `${row.title || row.kind} ${({ status: '계약 상태', end: '만료일', terms: '조건' })[ch.key]}: ${ch.old || '(없음)'} → ${ch.value || '(없음)'}` });
          pushedHistory = true;
        }
        // 성공하면 전체를 다시 그려 집계(만료·통보 목록)를 갱신하고, 실패하면 이력만 되돌린다(필드 값은 crud가 되돌림) — MD.rerender()를 되돌리기 전에 부르면 아직 안 되돌린 값으로 다시 그려진다
        return save().then((ok) => { if (ok) MD.rerender(); else if (pushedHistory) v.history.pop(); return ok; });
      },
      newRow: () => ({ id: uid('C'), kind: v.type === '판권·라이선스' ? '판권·라이선스' : '공급 계약', title: '', territory: '', start: today, end: '', terms: '', royalty: 0, minimum: 0, renewal: '협의 갱신', noticeDays: 30, status: '협의중', link: '' }),
    });
    box.querySelector('#hAdd').onclick = async () => {
      const date = U.normDate(box.querySelector('#hDate').value), text = box.querySelector('#hText').value.trim();
      if (!date || !text) { U.toast('날짜와 내용을 입력하세요.', 'bad'); return; }
      v.history.push({ id: uid('H'), date, kind: box.querySelector('#hKind').value, text });
      if (!(await save())) v.history.pop();
      MD.rerender();
    };
    box.querySelectorAll('[data-hdel]').forEach((b) => (b.onclick = async () => {
      if (!confirm('이 이력을 삭제할까요?')) return;
      const keep = v.history;
      v.history = v.history.filter((h) => h.id !== b.dataset.hdel);
      if (!(await save())) v.history = keep;
      MD.rerender();
    }));
  }

  MD.views.vendors = function (el) {
    const d = MD.data, today = U.today();
    const focus = MD.state && MD.state.focus && MD.state.focus.view === 'vendors' ? MD.state.focus : null; // '오늘 확인할 일'에서 이동 — 그 거래처 상세를 연다
    if (focus) { detailId = focus.id; MD.state.focus = null; }
    const TYPES = ['해외 공급처', 'B2B 거래처', '플랫폼 담당자', '협력사', '판권·라이선스'];
    const STATUS = ['발굴', '제안', '협의중', '거래중', '보류', '중단'];
    d.vendors.forEach((v) => { if (!v.id) v.id = uid('V'); }); // 상세 화면 연결용 (다음 저장 때 함께 저장)
    const info = new Map(d.vendors.map((v) => [v, MD.vendorContracts(v, today)]));
    const overdue = d.vendors.filter((v) => v.due && v.due < today && v.status !== '중단');
    const soon = d.vendors.filter((v) => { const e = info.get(v).end; return e && e >= today && U.diffDays(today, e) <= 60; });
    const notices = d.vendors.flatMap((v) => [...info.get(v).lateNotice, ...info.get(v).soonNotice].map((x) => ({ v, ...x })));
    const expired = d.vendors.flatMap((v) => info.get(v).expired.map((c) => ({ v, c })));
    const lateN = notices.filter((x) => x.state === 'late').length;
    const counts = Object.fromEntries(STATUS.map((s) => [s, d.vendors.filter((v) => v.status === s).length]));
    // localStorage는 Boolean을, IndexedDB는 Promise를 돌려준다 — 항상 Promise<boolean>으로 맞춰 .then·await 모두 안전하게 쓴다
    const save = () => {
      const r = MD.store.save(['vendors']);
      return r && typeof r.then === 'function' ? r.then((ok) => ok !== false).catch(() => false) : Promise.resolve(r !== false);
    };

    el.innerHTML = `
      <div class="grid g4">
        <div class="kpi"><div class="k">거래중</div><div class="v">${counts['거래중']}곳</div><div class="s">전체 ${d.vendors.length}곳</div></div>
        <div class="kpi"><div class="k">발굴·제안·협의 파이프라인</div><div class="v">${counts['발굴'] + counts['제안'] + counts['협의중']}곳</div><div class="s">발굴 ${counts['발굴']} · 제안 ${counts['제안']} · 협의 ${counts['협의중']}</div></div>
        <div class="kpi"><div class="k">기한 지난 후속 조치</div><div class="v" style="color:var(${overdue.length ? '--bad' : '--good'})">${overdue.length}건</div></div>
        <div class="kpi"><div class="k">60일 내 계약·판권 만료</div><div class="v" style="color:var(${soon.length ? '--bad' : '--good'})">${soon.length}건</div><div class="s">${notices.length ? `갱신 통보 ${notices.length}건${lateN ? ` (기한 지남 ${lateN})` : ''}` : ''}</div></div>
      </div>
      ${overdue.length || soon.length || notices.length || expired.length ? `<div class="card" style="margin-top:16px"><div class="card-head"><h2>오늘 챙길 일</h2></div><ul class="insights">
        ${overdue.map((v) => `<li class="bad"><span class="tag bad">D+${U.diffDays(v.due, today)}</span><b>${U.esc(v.name)}</b> — ${U.esc(v.next)}</li>`).join('')}
        ${notices.map((x) => x.state === 'late'
          ? `<li class="bad"><span class="tag bad">통보 기한 D+${U.diffDays(x.by, today)}</span><b>${U.esc(x.v.name)}</b> ${U.esc(x.c.title || x.c.kind)} — 갱신·해지 통보 기한(${U.esc(x.by)})이 지났습니다. 통보했는지 확인하세요(만료 ${U.esc(x.c.end)}, ${U.esc(x.c.renewal || '')})</li>`
          : `<li class="warn"><span class="tag warn">${x.state === 'today' ? '통보 오늘' : `통보 D-${U.diffDays(today, x.by)}`}</span><b>${U.esc(x.v.name)}</b> ${U.esc(x.c.title || x.c.kind)} — ${U.esc(x.by)}까지 갱신·해지 통보(만료 ${U.esc(x.c.end)}, ${U.esc(x.c.renewal || '')})</li>`).join('')}
        ${expired.map((x) => `<li class="bad"><span class="tag bad">만료 지남</span><b>${U.esc(x.v.name)}</b> ${U.esc(x.c.title || x.c.kind)} — 만료일 ${U.esc(x.c.end)}이 지났는데 상태가 '유효'입니다. 갱신 여부를 확인해 상태를 바꾸세요</li>`).join('')}
        ${soon.map((v) => `<li class="warn"><span class="tag warn">만료 D-${U.diffDays(today, info.get(v).end)}</span><b>${U.esc(v.name)}</b> 계약 만료 ${U.esc(info.get(v).end)} — 갱신·재협상 일정 확인</li>`).join('')}
      </ul></div>` : ''}
      <div class="card" style="margin-top:16px" id="vCard">
        <div class="card-head"><h2>거래처·협력사 목록</h2>
          <div class="seg" id="tSeg"><button data-t="" class="${!typeFilter ? 'on' : ''}">전체</button>${[...new Set([...TYPES, ...d.vendors.map((v) => v.type).filter(Boolean)])].map((t) => `<button data-t="${U.esc(t)}" class="${t === typeFilter ? 'on' : ''}">${U.esc(t)}</button>`).join('')}</div>
          <button class="btn small" id="vX">엑셀로 받기</button>
        </div>
        <div id="vT"></div>
        <div class="note">목록은 요약입니다. [상세]에서 거래 조건·연락처·계약(판권 범위·로열티·갱신·통보 기한)·이력을 관리합니다. 상태·만료일을 바꾸면 이력에 자동으로 남습니다.</div>
      </div>
      <div id="vDetail"></div>`;

    el.querySelectorAll('#tSeg button').forEach((b) => (b.onclick = () => { typeFilter = b.dataset.t; MD.rerender(); }));
    el.querySelector('#vX').onclick = () => U.exportXlsx('거래처목록.xlsx', {
      거래처: d.vendors.map((v) => ({ 업체명: v.name, 구분: v.type, 국가: v.country, 상태: v.status, '담당·연락처': v.contact, '거래 조건': v.terms, '최근 연락': v.last, '다음 조치': v.next, '조치 기한': v.due, '계약·판권 만료': info.get(v).end || '', '유효 계약': info.get(v).active, 메모: v.memo })),
      계약: d.vendors.flatMap((v) => (v.contracts || []).map((c) => ({ 업체명: v.name, 종류: c.kind, 계약명: c.title, 범위: c.territory, 시작: c.start, 만료: c.end, 조건: c.terms, '로열티·수수료': c.royalty, '최소 보장': c.minimum, 갱신: c.renewal, '통보 일수': c.noticeDays, 상태: c.status, 계약서: c.link }))),
      이력: d.vendors.flatMap((v) => (v.history || []).map((h) => ({ 업체명: v.name, 날짜: h.date, 구분: h.kind, 내용: h.text }))),
    });

    // 필터는 보기용 사본이 아니라 원본 인덱스를 유지해야 하므로, 필터 시 원본 배열을 그대로 쓰되 행을 숨긴다
    const fields = [
      { key: 'name', label: '업체명', width: '170px' },
      { key: 'type', label: '구분', type: 'select', options: TYPES },
      { key: 'status', label: '상태', type: 'select', options: STATUS },
      { key: 'next', label: '다음 조치', width: '190px' },
      { key: 'due', label: '조치 기한', type: 'date' },
      { key: 'contractEnd', label: '계약·판권 만료', type: 'date' },
    ];
    MD.crud(el.querySelector('#vT'), {
      fields, list: () => d.vendors,
      extra: (v) => `<button class="btn small" data-detail="${U.esc(v.id)}">상세</button>${info.get(v) && info.get(v).active ? ` <span class="tag">계약 ${info.get(v).active}</span>` : ''}`,
      onChange: (kind, row, ch) => {
        // 상태·만료일 변경은 이력에 자동 기록
        let pushedHistory = false;
        if (kind === 'edit' && ch && LABEL[ch.key] && ch.old !== ch.value) {
          if (!Array.isArray(row.history)) row.history = [];
          row.history.push({ id: uid('H'), date: today, kind: '조건 변경', text: `${LABEL[ch.key]}: ${ch.old || '(없음)'} → ${ch.value || '(없음)'}` });
          pushedHistory = true;
        }
        // 성공하면 전체를 다시 그려 집계(기한 지난 조치·만료 목록)를 갱신하고, 실패하면 이력만 되돌린다(필드 값은 crud가 되돌림) — MD.rerender()를 되돌리기 전에 부르면 아직 안 되돌린 값으로 다시 그려진다
        return save().then((ok) => { if (ok) MD.rerender(); else if (pushedHistory) row.history.pop(); return ok; });
      },
      newRow: () => ({ id: uid('V'), name: '', type: typeFilter || '해외 공급처', country: '', status: '발굴', contact: '', terms: '', last: today, next: '', due: '', contractEnd: '', memo: '', contracts: [], history: [] }),
      rowClass: (r) => (typeFilter && r.type !== typeFilter ? 'hide' : ''),
    });
    el.querySelector('#vT').addEventListener('click', (e) => {
      const id = e.target.dataset && e.target.dataset.detail;
      if (!id) return;
      detailId = detailId === id ? null : id; MD.rerender();
      if (detailId) setTimeout(() => { const b = document.querySelector('#vDetail'); if (b) b.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 0);
    });
    const sel = detailId && d.vendors.find((v) => v.id === detailId);
    // 상세(기본 정보·계약·이력)를 고치면 예시 거래처도 '고친 예시 행'으로 표시 — 저장 실패면 표시도 되돌린다 (Codex 개선 1단계 R1-01)
    const saveSel = async () => {
      const prev = sel.sampleEdited;
      if (sel.sample) sel.sampleEdited = true;
      const ok = await save();
      if (!ok) { if (prev) sel.sampleEdited = prev; else delete sel.sampleEdited; }
      return ok;
    };
    if (sel) detail(el, d, sel, today, saveSel);
    if (focus && sel) setTimeout(() => { const b = el.querySelector('#vDetail'); if (b) b.scrollIntoView({ block: 'start' }); }, 0);
  };
})();
