// 표 안에서 바로 고치는 편집기 (거래처·발주·채널·상품 공용) + 거래처·계약 화면
(function () {
  const U = MD.util;

  // fields: [{key, label, type: text|number|date|select|pct, options, width}]
  MD.crud = function (el, { fields, list, onChange, newRow, rowClass, extra }) {
    function cell(f, r, i) {
      const v = r[f.key];
      const st = f.width ? `style="width:${f.width}"` : '';
      if (f.type === 'select') return `<select data-i="${i}" data-k="${f.key}" ${st}>${(v != null && v !== '' && !f.options.includes(v) ? [...f.options, v] : f.options).map((o) => `<option ${o === v ? 'selected' : ''}>${U.esc(o)}</option>`).join('')}</select>`;
      if (f.type === 'pct') return `<input type="number" step="0.1" data-i="${i}" data-k="${f.key}" data-pct="1" value="${v === '' || v == null ? '' : Math.round(v * 1000) / 10}" ${st}>`;
      return `<input type="${f.type || 'text'}" data-i="${i}" data-k="${f.key}" value="${U.esc(v ?? '')}" ${st}>`;
    }
    function draw() {
      el.innerHTML = `<div class="table-wrap"><table><thead><tr>${extra ? '<th></th>' : ''}${fields.map((f) => `<th class="${f.type === 'number' || f.type === 'pct' ? 'num' : ''}">${f.label}</th>`).join('')}<th></th></tr></thead>
        <tbody>${list().map((r, i) => `<tr class="${rowClass ? rowClass(r) : ''}">${extra ? `<td>${extra(r)}</td>` : ''}${fields.map((f) => `<td>${cell(f, r, i)}</td>`).join('')}<td class="actions"><button class="btn small danger" data-del="${i}">삭제</button></td></tr>`).join('') || `<tr><td colspan="${fields.length + 2}" class="muted" style="text-align:center;padding:16px">항목이 없습니다.</td></tr>`}</tbody></table></div>
        ${newRow ? '<div class="row" style="margin-top:10px"><button class="btn small" data-add>+ 행 추가</button></div>' : ''}`;
    }
    draw();
    el.onchange = (e) => {
      const t = e.target; if (t.dataset.i == null) return;
      const f = fields.find((x) => x.key === t.dataset.k);
      let v = t.value;
      if (t.dataset.pct) v = v === '' ? 0 : Number(v) / 100;
      else if (f.type === 'number') v = v === '' ? 0 : Number(v);
      const row = list()[t.dataset.i], old = row[t.dataset.k];
      row[t.dataset.k] = v;
      if (onChange('edit', row, { key: t.dataset.k, old, value: v }) === false) row[t.dataset.k] = old;
      draw();
    };
    el.onclick = (e) => {
      const t = e.target;
      if (t.dataset.del != null && confirm('이 행을 삭제할까요?')) { list().splice(Number(t.dataset.del), 1); onChange('delete'); draw(); }
      if (t.dataset.add != null) { list().push(newRow()); onChange('add'); draw(); }
    };
    return { redraw: draw };
  };

  let typeFilter = '';

  MD.views.vendors = function (el) {
    const d = MD.data, today = U.today();
    const TYPES = ['해외 공급처', 'B2B 거래처', '플랫폼 담당자', '협력사', '판권·라이선스'];
    const STATUS = ['발굴', '제안', '협의중', '거래중', '보류', '중단'];
    const overdue = d.vendors.filter((v) => v.due && v.due < today && v.status !== '중단');
    const soon = d.vendors.filter((v) => v.contractEnd && v.contractEnd >= today && U.diffDays(today, v.contractEnd) <= 60);
    const counts = Object.fromEntries(STATUS.map((s) => [s, d.vendors.filter((v) => v.status === s).length]));

    el.innerHTML = `
      <div class="grid g4">
        <div class="kpi"><div class="k">거래중</div><div class="v">${counts['거래중']}곳</div><div class="s">전체 ${d.vendors.length}곳</div></div>
        <div class="kpi"><div class="k">발굴·제안·협의 파이프라인</div><div class="v">${counts['발굴'] + counts['제안'] + counts['협의중']}곳</div><div class="s">발굴 ${counts['발굴']} · 제안 ${counts['제안']} · 협의 ${counts['협의중']}</div></div>
        <div class="kpi"><div class="k">기한 지난 후속 조치</div><div class="v" style="color:var(${overdue.length ? '--bad' : '--good'})">${overdue.length}건</div></div>
        <div class="kpi"><div class="k">60일 내 계약·판권 만료</div><div class="v" style="color:var(${soon.length ? '--bad' : '--good'})">${soon.length}건</div></div>
      </div>
      ${overdue.length || soon.length ? `<div class="card" style="margin-top:16px"><div class="card-head"><h2>오늘 챙길 일</h2></div><ul class="insights">
        ${overdue.map((v) => `<li class="bad"><span class="tag bad">D+${U.diffDays(v.due, today)}</span><b>${U.esc(v.name)}</b> — ${U.esc(v.next)}</li>`).join('')}
        ${soon.map((v) => `<li class="warn"><span class="tag warn">만료 D-${U.diffDays(today, v.contractEnd)}</span><b>${U.esc(v.name)}</b> 계약 만료 ${v.contractEnd} — 갱신·재협상 일정 확인</li>`).join('')}
      </ul></div>` : ''}
      <div class="card" style="margin-top:16px">
        <div class="card-head"><h2>거래처·협력사 목록</h2>
          <div class="seg" id="tSeg"><button data-t="" class="${!typeFilter ? 'on' : ''}">전체</button>${[...new Set([...TYPES, ...d.vendors.map((v) => v.type).filter(Boolean)])].map((t) => `<button data-t="${U.esc(t)}" class="${t === typeFilter ? 'on' : ''}">${U.esc(t)}</button>`).join('')}</div>
          <button class="btn small" id="vX">엑셀로 받기</button>
        </div>
        <div id="vT"></div>
        <div class="note">조건(결제·인코텀즈·수수료·단가·프로모션 분담)은 “거래 조건” 칸에 기록합니다. 다음 조치 기한이 지나거나 계약 만료 60일 이내면 위에 표시됩니다.</div>
      </div>`;

    el.querySelectorAll('#tSeg button').forEach((b) => (b.onclick = () => { typeFilter = b.dataset.t; MD.rerender(); }));
    el.querySelector('#vX').onclick = () => U.exportXlsx('거래처목록.xlsx', { 거래처: d.vendors.map((v) => ({ 업체명: v.name, 구분: v.type, 국가: v.country, 상태: v.status, '담당·연락처': v.contact, '거래 조건': v.terms, '최근 연락': v.last, '다음 조치': v.next, '조치 기한': v.due, '계약·판권 만료': v.contractEnd, 메모: v.memo })) });

    // 필터는 보기용 사본이 아니라 원본 인덱스를 유지해야 하므로, 필터 시 원본 배열을 그대로 쓰되 행을 숨긴다
    const fields = [
      { key: 'name', label: '업체명', width: '170px' },
      { key: 'type', label: '구분', type: 'select', options: TYPES },
      { key: 'country', label: '국가', width: '70px' },
      { key: 'status', label: '상태', type: 'select', options: STATUS },
      { key: 'contact', label: '담당·연락처', width: '150px' },
      { key: 'terms', label: '거래 조건', width: '170px' },
      { key: 'last', label: '최근 연락', type: 'date' },
      { key: 'next', label: '다음 조치', width: '170px' },
      { key: 'due', label: '조치 기한', type: 'date' },
      { key: 'contractEnd', label: '계약·판권 만료', type: 'date' },
      { key: 'memo', label: '메모', width: '140px' },
    ];
    MD.crud(el.querySelector('#vT'), {
      fields, list: () => d.vendors,
      onChange: () => { MD.store.save(['vendors']); MD.rerender(); },
      newRow: () => ({ name: '', type: typeFilter || '해외 공급처', country: '', status: '발굴', contact: '', terms: '', last: today, next: '', due: '', contractEnd: '', memo: '' }),
      rowClass: (r) => (typeFilter && r.type !== typeFilter ? 'hide' : ''),
    });
  };
})();
