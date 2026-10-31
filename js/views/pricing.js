// 수입 원가 → 채널별 판매가·마진 계산, 전 상품 판매가 일괄 산출
(function () {
  const U = MD.util;

  const DEF = { price: 520, cur: 'EUR', fx: 1500, freight: 15000, duty: 8, local: 5000, etc: 0, target: 25, discount: 0, round: 1000, market: '' };
  const st = Object.assign({}, DEF, U.store.get('pricing', {}));

  // 판매가 P(VAT 포함)에서의 이익: 결제액 = P×(1−할인), 이익 = 결제액×(1−수수료)/1.1 − 원가 − 개당 물류비
  MD.profitAt = function (P, cost, fee, disc = 0, ship = 0) {
    const paid = P * (1 - disc);
    const profit = (paid * (1 - fee)) / 1.1 - cost - ship;
    return { paid, profit, margin: paid ? profit / (paid / 1.1) : null, feeAmt: (paid * fee) / 1.1 };
  };
  // 할인율은 0 이상 1 미만만 계산한다 — 100% 이상이면 ∞·음수 판매가가 나온다 (Codex R4-02)
  MD.discOk = (disc) => Number.isFinite(disc) && disc >= 0 && disc < 1;
  MD.priceFor = function (cost, fee, target, disc = 0, ship = 0, round = 1000) {
    const denom = 1 - fee - target;
    if (denom <= 0 || !MD.discOk(disc)) return null;
    const paid = ((cost + ship) * 1.1) / denom;
    const P = Math.ceil(paid / (1 - disc) / round) * round;
    return Number.isFinite(P) && P > 0 ? P : null;
  };

  MD.views.pricing = function (el) {
    // 설정은 화면을 열 때마다 저장소에서 다시 읽는다 — 백업 복원 뒤 이전 메모리 값으로 덮어쓰지 않게 (Codex 기능 L R2-01)
    for (const k of Object.keys(st)) delete st[k];
    Object.assign(st, DEF, U.store.get('pricing', {}));
    const d = MD.data;
    el.innerHTML = `
      <div class="grid g2">
        <div class="card">
          <div class="card-head"><h2>1. 수입 원가 계산</h2></div>
          <div class="row end">
            <label class="field">매입 단가<input type="number" id="p_price" value="${st.price}" style="width:110px"></label>
            <label class="field">통화<select id="p_cur">${['EUR', 'USD', 'GBP', 'CHF', 'JPY(100)', 'KRW'].map((c) => `<option ${c === st.cur ? 'selected' : ''}>${c}</option>`).join('')}</select></label>
            <label class="field">적용 환율(원)<input type="number" id="p_fx" value="${st.fx}" style="width:100px"></label>
          </div>
          <div class="row end" style="margin-top:10px">
            <label class="field">해외 운임·보험(원/개)<input type="number" id="p_freight" value="${st.freight}" style="width:130px"></label>
            <label class="field">관세율(%)<input type="number" id="p_duty" value="${st.duty}" style="width:80px"></label>
            <label class="field">국내 물류·포장(원/개)<input type="number" id="p_local" value="${st.local}" style="width:120px"></label>
            <label class="field">기타 부대비용(원/개)<input type="number" id="p_etc" value="${st.etc}" style="width:110px"></label>
          </div>
          <div class="result-grid" id="costOut" style="margin-top:14px"></div>
          <div class="note">환율·관세율은 직접 입력값입니다. 실제 신고 시 관세청 고시환율과 품목별 세율(HS코드), FTA 원산지 적용 여부를 확인하세요. 수입 부가세는 매입세액 공제 대상으로 보고 원가에서 제외했습니다.</div>
        </div>
        <div class="card">
          <div class="card-head"><h2>2. 판매 조건</h2></div>
          <div class="row end">
            <label class="field">목표 이익률(%)<input type="number" id="p_target" value="${st.target}" style="width:90px"></label>
            <label class="field">상시 할인·쿠폰(%)<input type="number" id="p_discount" value="${st.discount}" style="width:90px"></label>
            <label class="field">가격 단위<select id="p_round">${[100, 1000, 10000].map((r) => `<option value="${r}" ${r == st.round ? 'selected' : ''}>${U.num(r)}원 올림</option>`).join('')}</select></label>
            <label class="field">시장 최저가(선택)<input type="number" id="p_market" value="${st.market}" placeholder="경쟁가" style="width:120px"></label>
          </div>
          <div class="formula" style="margin-top:14px">
            이익 = 결제액 × (1 − 수수료율) ÷ 1.1 − 입고원가 − 국내 물류비<br>
            이익률 = 이익 ÷ (결제액 ÷ 1.1) · 결제액 = 판매가 × (1 − 할인율)<br>
            권장 판매가 = (입고원가 + 물류비) × 1.1 ÷ (1 − 수수료율 − 목표 이익률) ÷ (1 − 할인율)
          </div>
        </div>
      </div>
      <div class="card" style="margin-top:16px">
        <div class="card-head"><h2>3. 채널별 권장 판매가와 마진</h2><span class="muted">수수료율은 [데이터 관리 → 채널]에서 계약 조건으로 수정</span></div>
        <div id="tChan"></div>
      </div>
      <div class="card">
        <div class="card-head"><h2>전 상품 판매가 일괄 점검</h2><span class="muted">등록된 상품 원가 × 채널 수수료로 현재 판매가의 마진과 목표 마진 판매가를 한 번에 계산</span></div>
        <div class="row" style="margin-bottom:10px"><label>채널 <select id="bulkCh">${d.channels.map((c) => `<option>${U.esc(c.name)}</option>`).join('')}</select></label><span class="muted">목표 이익률·할인·가격 단위는 위 2번 설정을 따릅니다.</span></div>
        <div id="tBulk"></div>
      </div>`;

    const ids = Object.keys(DEF);
    function calc() {
      for (const k of ids) { const i = el.querySelector('#p_' + k); if (i) st[k] = i.type === 'number' ? (i.value === '' ? '' : Number(i.value)) : i.value; }
      U.store.set('pricing', st);
      // 입력칸 값은 빈 문자열일 수 있다 — 그대로 더하면 문자열 이어 붙이기가 된다 (Codex 기능 L R1-02)
      const n = (k) => (st[k] === '' || st[k] == null ? 0 : Number(st[k]) || 0);
      const missing = ['price', 'fx', 'target'].filter((k) => st[k] === '' || st[k] == null);
      const unit = st.cur === 'KRW' ? 1 : st.cur === 'JPY(100)' ? n('fx') / 100 : n('fx');
      const goods = n('price') * unit;
      const cif = goods + n('freight');
      const duty = (cif * n('duty')) / 100;
      const importVat = (cif + duty) * 0.1;
      const landed = cif + duty + n('etc');
      const ship = n('local');
      el.querySelector('#costOut').innerHTML = `
        <div><div class="k">물품가(원화)</div><div class="v">${U.won(goods)}</div></div>
        <div><div class="k">과세가격(CIF)</div><div class="v">${U.won(cif)}</div></div>
        <div><div class="k">관세</div><div class="v">${U.won(duty)}</div></div>
        <div><div class="k">수입 부가세 (공제)</div><div class="v muted">${U.won(importVat)}</div></div>
        <div><div class="k"><b>입고 원가</b></div><div class="v">${U.won(landed)}</div></div>${missing.length ? `<div style="grid-column:1/-1;color:var(--warn)">${missing.map((k) => ({ price: '매입 단가', fx: '적용 환율', target: '목표 이익률' })[k]).join('·')} 입력이 필요합니다 — 입력해야 권장 판매가를 계산합니다(비용 칸의 빈 값은 0원으로 봅니다).</div>` : ''}`;

      const tgt = n('target') / 100, disc = n('discount') / 100;
      const rows = d.channels.map((c) => {
        const rec = missing.length ? null : MD.priceFor(landed, c.fee, tgt, disc, ship, Number(st.round) || 1000);
        const at = rec ? MD.profitAt(rec, landed, c.fee, disc, ship) : null;
        const mk = st.market && MD.discOk(disc) ? MD.profitAt(Number(st.market), landed, c.fee, disc, ship) : null;
        return { channel: c.name, fee: c.fee, rec, profit: at && at.profit, margin: at && at.margin, feeAmt: at && at.feeAmt, mkMargin: mk && mk.margin, mkProfit: mk && mk.profit, gap: rec && st.market ? rec / Number(st.market) - 1 : null };
      });
      MD.table(el.querySelector('#tChan'), {
        cols: [
          { key: 'channel', label: '채널' },
          { key: 'fee', label: '수수료율', num: true, fmt: (v) => U.pct(v), xfmt: (v) => v },
          { key: 'rec', label: '권장 판매가', num: true, html: true, fmt: (v) => (v ? `<b>${U.won(v)}</b>` : missing.length ? '<span class="tag warn">입력 필요</span>' : MD.discOk(disc) ? '<span class="tag bad">목표 불가</span>' : '<span class="tag bad">할인율 확인(0~99%)</span>'), xfmt: (v) => v },
          { key: 'feeAmt', label: '수수료(개당)', num: true, fmt: (v) => U.won(v), xfmt: (v) => Math.round(v || 0) },
          { key: 'profit', label: '개당 이익', num: true, fmt: (v) => U.won(v), xfmt: (v) => Math.round(v || 0) },
          { key: 'margin', label: '이익률', num: true, fmt: (v) => U.pct(v), xfmt: (v) => v },
          ...(st.market ? [
            { key: 'gap', label: '시장가 대비', num: true, html: true, fmt: (v) => (v == null ? '-' : `<span class="delta ${v > 0.05 ? 'bad' : 'good'}">${v >= 0 ? '+' : ''}${U.pct(v)}</span>`), xfmt: (v) => v },
            { key: 'mkMargin', label: '시장가 판매 시 이익률', num: true, html: true, fmt: (v) => (v == null ? '-' : `<span class="delta ${v < tgt ? 'bad' : 'good'}">${U.pct(v)}</span>`), xfmt: (v) => v },
          ] : []),
        ],
        rows, exportName: '채널별_권장판매가',
      });
      bulk();
    }

    function bulk() {
      const ch = d.channelMap[el.querySelector('#bulkCh').value];
      if (!ch) { el.querySelector('#tBulk').innerHTML = '<div class="empty">채널이 없습니다.</div>'; return; }
      const num = (k) => (st[k] === '' || st[k] == null ? 0 : Number(st[k]) || 0);
      const tgt = num('target') / 100, disc = num('discount') / 100, local = num('local');
      const rows = d.products.map((p) => {
        const now = MD.profitAt(p.price, p.cost, ch.fee, disc, local);
        const rec = st.target === '' ? null : MD.priceFor(p.cost, ch.fee, tgt, disc, local, Number(st.round) || 1000);
        return { sku: p.sku, name: p.name, cost: p.cost, price: p.price, margin: now.margin, profit: now.profit, rec, change: rec ? rec / p.price - 1 : null, ok: now.margin >= tgt };
      });
      const under = rows.filter((r) => !r.ok).length;
      MD.table(el.querySelector('#tBulk'), {
        cols: [
          { key: 'sku', label: 'SKU' }, { key: 'name', label: '상품명' },
          { key: 'cost', label: '입고원가', num: true, fmt: (v) => U.won(v) },
          { key: 'price', label: '현재 판매가', num: true, fmt: (v) => U.won(v) },
          { key: 'margin', label: '현재 이익률', num: true, html: true, fmt: (v, r) => `<span class="delta ${r.ok ? 'good' : 'bad'}">${U.pct(v)}</span>`, xfmt: (v) => v },
          { key: 'profit', label: '개당 이익', num: true, fmt: (v) => U.won(v), xfmt: (v) => Math.round(v) },
          { key: 'rec', label: '목표 이익률 판매가', num: true, fmt: (v) => (v ? U.won(v) : MD.discOk(disc) ? '불가' : '할인율 확인'), xfmt: (v) => v },
          { key: 'change', label: '조정 폭', num: true, fmt: (v) => (v == null ? '-' : (v >= 0 ? '+' : '') + U.pct(v)), xfmt: (v) => v },
        ],
        rows, sortKey: 'margin', sortDir: 1, exportName: `판매가점검_${ch.name}`,
      });
      el.querySelector('#tBulk').insertAdjacentHTML('afterbegin', `<div class="note" style="margin:0 0 6px">목표 이익률(${st.target}%) 미달 상품 <b>${under}개</b> / 전체 ${rows.length}개</div>`);
    }

    el.querySelectorAll('input, select').forEach((i) => { if (i.id !== 'bulkCh') i.oninput = calc; });
    el.querySelector('#bulkCh').onchange = bulk;
    calc();
  };
})();
