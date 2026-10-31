// 발주·입고 일정 + 재발주 제안
(function () {
  const U = MD.util;

  MD.views.orders = function (el) {
    const d = MD.data, today = U.today();
    const lead = Number(U.store.get('leadDays', 30)), safety = Number(U.store.get('safetyDays', 14));
    const closed = (p) => p.status === '입고완료' || p.status === '취소';
    const open = d.pos.filter((p) => !closed(p));
    const late = open.filter((p) => p.eta && p.eta < today);
    const pname = (sku) => (d.productMap[sku] || {}).name || sku;

    // 재발주 제안량 = 일평균 판매 × (리드타임 + 안전재고 일수) − 현재고 − 입고 예정
    const sugg = MD.coverRows().map((r) => ({ ...r, need: Math.ceil(r.daily * (lead + safety) - r.stock - r.inbound) }))
      .filter((r) => r.daily > 0 && r.need > 0).sort((a, b) => (a.cover ?? 0) - (b.cover ?? 0));

    el.innerHTML = `
      <div class="grid g4">
        <div class="kpi"><div class="k">진행 중 발주</div><div class="v">${open.length}건</div><div class="s">수량 ${U.num(open.reduce((a, p) => a + Number(p.qty) - Number(p.received || 0), 0))}개</div></div>
        <div class="kpi"><div class="k">입고 예정일 지남</div><div class="v" style="color:var(${late.length ? '--bad' : '--good'})">${late.length}건</div><div class="s">${late.map((p) => p.po).join(', ') || '없음'}</div></div>
        <div class="kpi"><div class="k">재발주 검토 SKU</div><div class="v">${sugg.length}개</div><div class="s">리드타임 ${lead}일 + 안전 ${safety}일 기준</div></div>
        <div class="kpi"><div class="k">발주 금액(진행 중, 원가 기준)</div><div class="v">${U.krw(open.reduce((a, p) => a + (Number(p.qty) - Number(p.received || 0)) * ((d.productMap[p.sku] || {}).cost || 0), 0))}</div></div>
      </div>
      <div class="card" style="margin-top:16px">
        <div class="card-head"><h2>입고 일정</h2><span class="muted">오늘 ${today}</span></div>
        <div id="gantt"></div>
      </div>
      <div class="card"><div class="card-head"><h2>발주 목록</h2><button class="btn small" id="oX">엑셀로 받기</button></div><div id="oT"></div></div>
      <div class="card">
        <div class="card-head"><h2>재발주 제안</h2>
          <label>리드타임 <input type="number" id="lead" value="${lead}" style="width:70px">일</label>
          <label>안전재고 <input type="number" id="safety" value="${safety}" style="width:70px">일</label>
        </div>
        <div id="sT"></div>
        <div class="note">제안량 = 최근 28일 일평균 판매 × (리드타임 + 안전재고 일수) − 현재고 − 입고 예정. 시즌 종료 상품은 제안량을 그대로 쓰지 말고 다음 시즌 전망을 반영하세요.</div>
      </div>`;

    // 간트: 발주일~입고예정일 막대
    const items = d.pos.filter((p) => p.ordered && p.eta);
    if (items.length) {
      const min = items.reduce((a, p) => (p.ordered < a ? p.ordered : a), today);
      const max = items.reduce((a, p) => (p.eta > a ? p.eta : a), today);
      const span = Math.max(1, U.diffDays(min, max));
      const x = (s) => (U.diffDays(min, s) / span) * 100;
      el.querySelector('#gantt').innerHTML = `<div style="position:relative;padding-top:4px">
        ${items.map((p) => {
          const col = closed(p) ? 'var(--line-strong)' : p.eta < today ? 'var(--bad)' : 'var(--accent)';
          return `<div style="display:grid;grid-template-columns:minmax(120px,220px) 1fr;gap:10px;align-items:center;margin:6px 0">
            <div style="font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${U.esc(pname(p.sku))}"><b>${U.esc(p.po)}</b> ${U.esc(pname(p.sku))}</div>
            <div style="position:relative;height:22px;background:var(--surface-2);border-radius:4px">
              <div title="${p.ordered} → ${p.eta} · ${U.esc(p.status)}" style="position:absolute;left:${x(p.ordered)}%;width:${Math.max(1.5, x(p.eta) - x(p.ordered))}%;top:3px;bottom:3px;background:${col};border-radius:4px"></div>
              <div style="position:absolute;left:${x(today)}%;top:-3px;bottom:-3px;width:2px;background:var(--ink)"></div>
            </div></div>`;
        }).join('')}
        <div class="legend" style="margin-top:8px"><span><i style="background:var(--accent)"></i>진행 중</span><span><i style="background:var(--bad)"></i>예정일 지남</span><span><i style="background:var(--line-strong)"></i>입고 완료·취소</span><span><i style="background:var(--ink);width:2px;height:12px"></i>오늘</span></div>
      </div>`;
    } else el.querySelector('#gantt').innerHTML = '<div class="empty">발주가 없습니다.</div>';

    MD.crud(el.querySelector('#oT'), {
      fields: [
        { key: 'po', label: '발주번호', width: '90px' },
        { key: 'vendor', label: '공급처', width: '150px' },
        { key: 'sku', label: 'SKU', type: 'select', options: d.products.map((p) => p.sku) },
        { key: 'qty', label: '발주량', type: 'number', width: '70px' },
        { key: 'received', label: '입고량', type: 'number', width: '70px' },
        { key: 'ordered', label: '발주일', type: 'date' },
        { key: 'eta', label: '입고 예정', type: 'date' },
        { key: 'status', label: '상태', type: 'select', options: ['발주', '생산중', '선적', '운송중', '통관대기', '입고완료', '취소'] },
      ],
      list: () => d.pos,
      onChange: () => { MD.store.save(['pos']); MD.rerender(); },
      newRow: () => ({ po: 'PO-' + Date.now().toString().slice(-5), vendor: '', sku: d.products[0] ? d.products[0].sku : '', qty: 0, received: 0, ordered: today, eta: U.addDays(today, lead), status: '발주' }),
      extra: (r) => (!closed(r) && r.eta && r.eta < today ? '<span class="tag bad">지연</span>' : ''),
    });
    el.querySelector('#oX').onclick = () => U.exportXlsx('발주목록.xlsx', { 발주: d.pos.map((p) => ({ 발주번호: p.po, 공급처: p.vendor, SKU: p.sku, 상품명: pname(p.sku), 발주량: Number(p.qty) || 0, 입고량: Number(p.received) || 0, 발주일: p.ordered, '입고 예정': p.eta, 상태: p.status, 지연: !closed(p) && p.eta && p.eta < today ? '지연' : '' })) });

    MD.table(el.querySelector('#sT'), {
      cols: [
        { key: 'sku', label: 'SKU' }, { key: 'name', label: '상품명' },
        { key: 'stock', label: '현재고', num: true, fmt: (v) => U.num(v) },
        { key: 'inbound', label: '입고 예정', num: true, fmt: (v) => U.num(v) },
        { key: 'daily', label: '일평균 판매', num: true, fmt: (v) => U.num(v, 2) },
        { key: 'cover', label: '재고 일수', num: true, fmt: (v) => (v == null ? '-' : Math.floor(v) + '일'), xfmt: (v) => (v == null ? '' : Math.floor(v)) },
        { key: 'need', label: '제안 발주량', num: true, html: true, fmt: (v) => `<b>${U.num(v)}</b>`, xfmt: (v) => v },
        { key: 'season', label: '시즌' },
      ],
      rows: sugg, exportName: '재발주제안',
    });
    el.querySelector('#lead').onchange = (e) => { U.store.set('leadDays', Number(e.target.value) || 0); MD.rerender(); };
    el.querySelector('#safety').onchange = (e) => { U.store.set('safetyDays', Number(e.target.value) || 0); MD.rerender(); };
  };
})();
