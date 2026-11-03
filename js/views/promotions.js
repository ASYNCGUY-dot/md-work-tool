// 프로모션·타임딜 성과 분석 + 손익분기 시뮬레이터
(function () {
  const U = MD.util, C = MD.calc;
  let sel = null, editing = null;
  const BASE_DAYS = 14;

  // 행사 성과: 같은 채널·카테고리의 행사 직전 14일 일평균을 기준선으로 비교
  MD.promoResult = function (p) {
    const d = MD.data;
    const match = (r) => r.channel === p.channel && (!p.categories || !p.categories.length || p.categories.includes((d.productMap[r.sku] || {}).category));
    const days = U.diffDays(p.start, p.end) + 1;
    const bs = U.addDays(p.start, -BASE_DAYS), be = U.addDays(p.start, -1);
    // 관측 종료일은 행사 채널 기준: 이 채널의 마지막 판매일과 판매 마감 확인일 중 늦은 날 (Codex 분리 3단계 R1-01).
    // 다른 채널의 더 늦은 판매가 이 채널의 미관측 날짜를 매출 0으로 만들지 않게. 이 채널 판매도 확인일도 없으면 전체 판매 마지막 날
    let chLast = '';
    for (let i = d.sales.length - 1; i >= 0; i--) if (d.sales[i].channel === p.channel) { chLast = d.sales[i].date; break; }
    const chClose = C.closeOf(p.channel, 'sales') || '';
    const maxD = (chLast || chClose ? (chLast > chClose ? chLast : chClose) : d.maxDate) || '';
    // 채널 첫 판매일: 기준 자료 시작일과 차트 시작의 하한. 예정 행사(아래 조기 반환)에도 돌려준다 (Codex 분리 3단계 R3-01)
    const chFirst = (d.sales.find((r) => r.channel === p.channel) || {}).date || d.maxDate || '';
    // 판매 자료의 마지막 날 이후는 아직 관측하지 않은 기간이다. 시작 전 행사는 성과를 계산하지 않고,
    // 진행 중 행사는 지금까지의 일수로만 일평균을 낸다 (없는 날을 매출 0으로 보면 리프트가 -100%가 된다)
    if (p.start > maxD) {
      return { ...p, days, sales: null, qty: null, gross: null, margin: null, discountAmt: null, dailyA: null, dailyB: null, lift: null, incSales: null, incGross: null, netGain: null, cost: Number(p.budget) || 0, roas: null, iroas: null, cvr: null, prevCvr: null, baseMargin: null, status: '진행/예정', baseFrom: bs, obsEnd: maxD, chFirst };
    }
    const pEnd = p.end > maxD ? maxD : p.end, obs = U.diffDays(p.start, pEnd) + 1;
    const during = C.inRange(d.sales, p.start, pEnd).filter(match);
    const base = C.inRange(d.sales, bs, be).filter(match);
    const tDuring = C.inRange(d.traffic, p.start, pEnd).filter((t) => t.channel === p.channel);
    const tBase = C.inRange(d.traffic, bs, be).filter((t) => t.channel === p.channel);
    const a = C.summarize(during, tDuring), b = C.summarize(base, tBase);
    // 직전 14일이 판매 자료 범위 밖이면 기준 매출을 0으로 보지 않고 판정을 보류한다.
    // 일부만 범위 안이면 기준선은 지금처럼 14일 평균(없는 날 0)으로 두되 화면에 관측 일수를 알린다
    // 자료 시작일은 행사 채널 기준 — 다른 채널에 오래된 판매가 있어도 이 채널 자료가 없던 기간은 기준으로 보지 않는다
    const baseStart = chFirst > bs ? chFirst : bs;
    const baseDays = baseStart <= be ? U.diffDays(baseStart, be) + 1 : 0;
    const dailyA = a.sales / obs, dailyB = baseDays ? b.sales / BASE_DAYS : null;
    const cost = Number(p.budget) || 0;
    const incSales = baseDays ? (dailyA - dailyB) * obs : null;
    const incGross = baseDays ? a.gross - (b.gross / BASE_DAYS) * obs : null;
    const netGain = baseDays ? incGross - cost / 1.1 : null;
    // 행사·기준 기간 모두 판매가 없으면 판정하지 않는다. 순증 이익 0은 '본전 근처'
    const status = p.end > maxD ? '진행/예정' : !during.length && !base.length ? '자료 없음' : !baseDays ? '기준 자료 없음' : netGain > 0 ? '성공' : netGain >= -cost * 0.2 ? '본전 근처' : '손실';
    // 카테고리를 지정한 행사는 대상 카테고리 주문 ÷ 채널 유입(판매 파일 주문 기준), 아니면 공통 전환율
    const cat = p.categories && p.categories.length;
    return {
      ...p, days, sales: a.sales, qty: a.qty, gross: a.gross, margin: a.margin, discountAmt: a.discount,
      dailyA, dailyB, lift: dailyB ? dailyA / dailyB - 1 : null, incSales, incGross, netGain, cost,
      roas: cost ? a.sales / cost : null, iroas: cost && incSales != null ? incSales / cost : null,
      cvr: cat ? a.cvrSales : a.cvr, prevCvr: cat ? b.cvrSales : b.cvr, cvrNote: cat ? '대상 카테고리 주문(판매 파일) ÷ 채널 전체 유입' : C.cvrNote(a),
      baseMargin: baseDays ? b.margin : null, baseDays, status, baseFrom: bs, obsEnd: maxD, chFirst,
    };
  };

  function form(p) {
    const cats = [...new Set(MD.data.products.map((x) => x.category))];
    return `<div class="card" id="pForm">
      <div class="card-head"><h2>${p.id ? '행사 수정' : '행사 등록'}</h2></div>
      <div class="row end">
        <label class="field">행사명<input type="text" name="name" value="${U.esc(p.name || '')}" style="width:200px"></label>
        <label class="field">채널<select name="channel">${MD.data.channels.map((c) => `<option ${c.name === p.channel ? 'selected' : ''}>${U.esc(c.name)}</option>`).join('')}</select></label>
        <label class="field">유형<select name="type">${['기획전', '타임딜', '쿠폰', '라이브', '폐쇄몰 행사'].map((t) => `<option ${t === p.type ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
        <label class="field">시작<input type="date" name="start" value="${p.start || ''}"></label>
        <label class="field">종료<input type="date" name="end" value="${p.end || ''}"></label>
        <label class="field">할인율(%)<input type="number" name="discount" value="${p.discount != null ? Math.round(p.discount * 100) : 10}" style="width:80px"></label>
        <label class="field">행사 비용(원, 광고·쿠폰 부담)<input type="number" name="budget" value="${p.budget || 0}" style="width:140px"></label>
      </div>
      <div class="row" style="margin-top:10px"><span class="muted">대상 카테고리 (없으면 채널 전체)</span>
        ${cats.map((c) => `<label><input type="checkbox" name="cat" value="${U.esc(c)}" ${(p.categories || []).includes(c) ? 'checked' : ''}> ${U.esc(c)}</label>`).join('')}
      </div>
      <label class="field" style="margin-top:10px">메모<input type="text" name="memo" value="${U.esc(p.memo || '')}"></label>
      <div class="row" style="margin-top:12px"><button class="btn primary" id="pSave">저장</button><button class="btn" id="pCancel">취소</button></div>
    </div>`;
  }

  MD.views.promotions = function (el) {
    const d = MD.data;
    const list = d.promotions.map(MD.promoResult).sort((a, b) => (a.start < b.start ? 1 : -1));
    // 처음에는 가장 최근에 끝난 행사를 보여준다 (예정 행사는 아직 볼 성과가 없음)
    if (!sel || !list.find((x) => x.id === sel)) sel = (list.find((x) => x.status !== '진행/예정') || list[0] || {}).id;
    const cur = list.find((x) => x.id === sel);
    const done = list.filter((x) => x.status !== '진행/예정');
    const judged = done.filter((x) => x.netGain != null); // 기준 자료가 없는 행사는 성공률·순증 합계에서 뺀다
    const win = judged.filter((x) => x.status === '성공').length;

    el.innerHTML = `
      <div class="grid g4">
        <div class="kpi"><div class="k">분석한 행사</div><div class="v">${done.length}건</div><div class="s">종료된 행사 기준${judged.length < done.length ? ` · 판정 가능 ${judged.length}건` : ''}</div></div>
        <div class="kpi"><div class="k">순증 이익 플러스</div><div class="v">${win}건</div><div class="s">${judged.length ? U.pct(win / judged.length, 0) : '-'} 성공률</div></div>
        <div class="kpi"><div class="k">행사 매출 합계</div><div class="v">${U.krw(done.reduce((a, x) => a + x.sales, 0))}</div><div class="s">증분 매출 ${U.krw(judged.reduce((a, x) => a + x.incSales, 0))}</div></div>
        <div class="kpi"><div class="k">행사 비용 합계</div><div class="v">${U.krw(done.reduce((a, x) => a + x.cost, 0))}</div><div class="s">순증 이익 ${U.krw(judged.reduce((a, x) => a + x.netGain, 0))}</div></div>
      </div>
      <div id="formSlot"></div>
      <div class="card" style="margin-top:16px">
        <div class="card-head"><h2>행사별 성과</h2><button class="btn primary small" id="pNew">+ 행사 등록</button></div>
        <div id="tPr"></div>
        <div class="note">기준선 = 같은 채널·대상 카테고리의 행사 직전 ${BASE_DAYS}일 일평균. 증분 매출 = (행사 일평균 − 기준 일평균) × 행사 일수. 순증 이익 = 증분 매출총이익 − 행사 비용(VAT 제외). 다른 행사·시즌 효과가 섞일 수 있으니 참고 지표로 보세요.</div>
      </div>
      ${cur ? `<div class="grid g3">
        <div class="card span2"><div class="card-head"><h2>${U.esc(cur.name)} 일별 매출</h2><span class="muted">${U.esc(cur.channel)} · ${cur.start} ~ ${cur.end}${cur.obsEnd && cur.obsEnd < cur.end ? ` · 이 채널 자료는 ${cur.obsEnd}까지(이후는 그리지 않음)` : ''}</span></div>
          ${MD.legend([{ label: '기준·이후 기간', color: MD.colorOf(0) }, { label: '행사 기간', color: MD.colorOf(1) }])}
          <div class="chart-box"><canvas id="cPr"></canvas></div></div>
        <div class="card"><div class="card-head"><h2>행사 요약</h2><span class="tag ${cur.status === '성공' ? 'good' : cur.status === '손실' ? 'bad' : 'warn'}">${cur.status}</span></div>
          <div class="result-grid">
            <div><div class="k">매출 리프트</div><div class="v">${cur.lift == null ? '-' : (cur.lift >= 0 ? '+' : '') + U.pct(cur.lift, 0)}</div></div>
            <div><div class="k">ROAS</div><div class="v">${cur.roas == null ? '-' : U.pct(cur.roas, 0)}</div></div>
            <div><div class="k">증분 ROAS</div><div class="v">${cur.iroas == null ? '-' : U.pct(cur.iroas, 0)}</div></div>
            <div><div class="k">행사 이익률</div><div class="v">${U.pct(cur.margin)}</div></div>
            <div><div class="k">순증 이익</div><div class="v">${U.krw(cur.netGain)}</div></div>
            <div><div class="k">전환율</div><div class="v">${U.pct(cur.cvr, 2)}</div></div>
          </div>
          <div class="note">평시 이익률 ${U.pct(cur.baseMargin)} · 평시 전환율 ${U.pct(cur.prevCvr, 2)}${cur.cvrNote ? ` (전환율 = ${cur.cvrNote})` : ''}${cur.status === '진행/예정' ? ' · 진행 중이면 판매 자료 마지막 날까지만 계산' : ''}${cur.status === '기준 자료 없음' ? ` · 행사 직전 ${BASE_DAYS}일(${cur.baseFrom}~) 판매 자료가 없어 순증·성공 여부를 판정하지 않음` : cur.baseDays != null && cur.baseDays < BASE_DAYS && cur.status !== '진행/예정' ? ` · 직전 ${BASE_DAYS}일 중 판매 자료가 있는 날은 ${cur.baseDays}일뿐이라 기준선이 낮게 잡혔을 수 있음` : ''}</div>
        </div></div>` : ''}
      <div class="card" id="sim">
        <div class="card-head"><h2>행사 손익분기 시뮬레이터</h2><span class="muted">행사 전에 “얼마나 더 팔아야 본전인가”를 계산</span></div>
        <div class="row end">
          <label class="field">평시 일매출(원)<input type="number" id="sBase" value="${cur && cur.dailyB != null ? Math.round(cur.dailyB) : 3000000}" style="width:140px"></label>
          <label class="field">평시 이익률(%, 수수료 차감 후)<input type="number" id="sM" value="${cur && cur.baseMargin != null && Number.isFinite(cur.baseMargin) ? (cur.baseMargin * 100).toFixed(1) : 30}" style="width:90px"></label>
          <label class="field">추가 할인율(%)<input type="number" id="sD" value="${cur ? Math.round(cur.discount * 100) : 10}" style="width:80px"></label>
          <label class="field">행사 비용(원)<input type="number" id="sC" value="${cur ? cur.cost : 1000000}" style="width:130px"></label>
          <label class="field">행사 일수<input type="number" id="sN" value="${cur ? cur.days : 3}" style="width:70px"></label>
          <label class="field">예상 판매량 증가(%)<input type="number" id="sU" value="100" style="width:90px"></label>
        </div>
        <div class="result-grid" id="sOut" style="margin-top:14px"></div>
        <div class="formula" style="margin-top:10px">할인 후 개당 이익률 = (이익률 − 할인율) ÷ (1 − 할인율). 본전 판매량 배수 = [평시 순매출 × 이익률 × 일수 + 비용] ÷ [평시 순매출 × (1 − 할인율) × 할인 후 이익률 × 일수]. 순매출 = 일매출 ÷ 1.1, 비용도 VAT 제외. 이익률이 할인율보다 낮으면 팔수록 손해입니다.</div>
      </div>`;

    // 표
    const statusTag = (v) => `<span class="tag ${v === '성공' ? 'good' : v === '손실' ? 'bad' : v === '진행/예정' ? 'neutral' : 'warn'}">${v}</span>`;
    MD.table(el.querySelector('#tPr'), {
      cols: [
        { key: 'name', label: '행사', html: true, fmt: (v, r) => `<a href="#promotions" data-sel="${r.id}">${U.esc(v)}</a>`, xfmt: (v) => v },
        { key: 'channel', label: '채널' }, { key: 'type', label: '유형' },
        { key: 'start', label: '기간', fmt: (v, r) => `${v.slice(5)}~${r.end.slice(5)}`, xfmt: (v, r) => `${v}~${r.end}` },
        { key: 'discount', label: '할인', num: true, fmt: (v) => U.pct(v, 0), xfmt: (v) => v },
        MD.cols.sales,
        { key: 'lift', label: '리프트', num: true, fmt: (v) => (v == null ? '-' : (v >= 0 ? '+' : '') + U.pct(v, 0)), xfmt: (v) => v },
        { key: 'incSales', label: '증분 매출', num: true, fmt: (v) => U.krw(v), xfmt: (v) => (v == null ? '' : Math.round(v)) },
        { key: 'cost', label: '비용', num: true, fmt: (v) => U.krw(v), xfmt: (v) => v },
        { key: 'roas', label: 'ROAS(행사 매출÷비용)', num: true, fmt: (v) => (v == null ? '-' : U.pct(v, 0)), xfmt: (v) => v },
        { key: 'netGain', label: '순증 이익', num: true, fmt: (v) => U.krw(v), xfmt: (v) => (v == null ? '' : Math.round(v)) },
        { key: 'status', label: '판정', html: true, fmt: statusTag, xfmt: (v) => v },
        { key: 'id', label: '', nosort: true, noexport: true, html: true, fmt: (v) => `<button class="btn small" data-edit="${v}">수정</button> <button class="btn small danger" data-del="${v}">삭제</button>` },
      ],
      rows: list, exportName: '프로모션성과',
    });
    el.querySelector('#tPr').addEventListener('click', async (e) => {
      const t = e.target;
      if (t.dataset.sel) { e.preventDefault(); sel = t.dataset.sel; MD.rerender(); }
      if (t.dataset.edit) { editing = d.promotions.find((p) => p.id === t.dataset.edit); showForm(); }
      if (t.dataset.del && confirm('이 행사를 삭제할까요?')) {
        // 저장 결과를 기다려 실패하면 원래 목록으로 되돌린다 (Codex 개선 0단계 R2-01)
        const keep = d.promotions;
        d.promotions = d.promotions.filter((p) => p.id !== t.dataset.del);
        if (!(await MD.store.save(['promotions']))) d.promotions = keep;
        MD.rerender();
      }
    });
    el.querySelector('#pNew').onclick = () => { editing = { channel: d.channels[0] && d.channels[0].name, type: '기획전', categories: [] }; showForm(); };

    function showForm() {
      const slot = el.querySelector('#formSlot');
      slot.innerHTML = form(editing);
      slot.scrollIntoView({ behavior: 'smooth', block: 'start' });
      slot.querySelector('#pCancel').onclick = () => { slot.innerHTML = ''; };
      slot.querySelector('#pSave').onclick = async () => {
        const f = slot.querySelector('#pForm');
        const v = (n) => f.querySelector(`[name=${n}]`).value;
        if (!v('name') || !v('start') || !v('end')) { U.toast('행사명과 기간을 입력하세요.', 'bad'); return; }
        const rec = { id: editing.id || 'PR' + Date.now().toString(36), name: v('name'), channel: v('channel'), type: v('type'), start: v('start') <= v('end') ? v('start') : v('end'), end: v('start') <= v('end') ? v('end') : v('start'), discount: Number(v('discount')) / 100, budget: Number(v('budget')) || 0, categories: [...f.querySelectorAll('[name=cat]:checked')].map((x) => x.value), memo: v('memo') };
        if (editing.sample) { rec.sample = true; rec.sampleEdited = true; } // 고친 예시 행사 (개선 1단계)
        const i = d.promotions.findIndex((p) => p.id === rec.id), prev = i >= 0 ? d.promotions[i] : null;
        i >= 0 ? (d.promotions[i] = rec) : d.promotions.push(rec);
        // 저장 결과를 기다려 성공했을 때만 입력을 닫고 안내한다. 실패하면 화면 자료를 되돌리고 입력을 그대로 둬 다시 시도할 수 있게 (Codex 기능 L R3-01)
        if (!(await MD.store.save(['promotions']))) { if (prev) d.promotions[i] = prev; else d.promotions.pop(); return; }
        sel = rec.id; editing = null; MD.rerender(); U.toast('저장했습니다.');
      };
    }

    // 행사 차트: 기준 14일 + 행사 + 이후 7일
    if (cur) {
      // 행사 채널이 관측한 범위만 그린다(첫 판매일 ~ 관측 종료일) — 범위 밖 날짜를 0원으로 보이지 않게 (Codex 분리 3단계 R2-01)
      const from = cur.chFirst && cur.chFirst > cur.baseFrom ? cur.chFirst : cur.baseFrom, after = U.addDays(cur.end, 7), to = after > cur.obsEnd ? cur.obsEnd : after;
      const cats = cur.categories || [];
      const match = (r) => r.channel === cur.channel && (!cats.length || cats.includes((d.productMap[r.sku] || {}).category));
      const days = from <= to ? U.dateRange(from, to) : [];
      const g = U.groupBy(C.inRange(d.sales, from, to).filter(match), (r) => r.date);
      const vals = days.map((x) => (g.get(x) || []).reduce((a, r) => a + r.sales, 0));
      const colors = days.map((x) => (x >= cur.start && x <= cur.end ? MD.colorOf(1) : MD.colorOf(0)));
      MD.charts.bar(el.querySelector('#cPr'), days.map((x) => x.slice(5).replace('-', '/')), [{ label: '매출', data: vals, colors }], U.krw);
    }

    // 시뮬레이터
    const sim = () => {
      const g = (id) => Number(el.querySelector(id).value) || 0;
      const base = g('#sBase'), m = g('#sM') / 100, disc = g('#sD') / 100, cost = g('#sC'), n = Math.max(1, g('#sN')), up = g('#sU') / 100;
      // 할인율은 0 이상 100% 미만만 계산 — 100%면 아래 이익률 나눗셈이 깨져 원가 손실이 빠진다 (Codex 개선 0단계 R1-01)
      if (!(Number.isFinite(disc) && disc >= 0 && disc < 1)) {
        el.querySelector('#sOut').innerHTML = '<div style="grid-column:1/-1;color:var(--bad)">할인율은 0 이상 100% 미만으로 입력하세요(무료 증정은 비용 칸에 원가를 넣어 계산).</div>';
        return;
      }
      const unitM = (m - disc) / (1 - disc); // 할인 후 매출 대비 이익률
      // 이익률은 VAT 제외 순매출 기준이므로 이익 계산은 모두 순매출(÷1.1)로 한다. 비용도 VAT 제외
      const baseNet = base / 1.1;
      const baseProfit = baseNet * m * n;
      // 판매량 배수 k일 때 행사 순매출 = baseNet×(1−d)×k, 이익 = 그 × unitM
      const perK = baseNet * (1 - disc) * unitM * n;
      const k = perK > 0 ? (baseProfit + cost / 1.1) / perK : null;
      const expSales = base * (1 - disc) * (1 + up) * n; // 표시용 매출은 VAT 포함
      const expGain = (expSales / 1.1) * unitM - cost / 1.1 - baseProfit;
      el.querySelector('#sOut').innerHTML = `
        <div><div class="k">할인 후 이익률</div><div class="v">${U.pct(unitM)}</div></div>
        <div><div class="k">본전 판매량 증가율</div><div class="v">${k == null ? '불가 (할인율 ≥ 이익률)' : '+' + U.pct(k - 1, 0)}</div></div>
        <div><div class="k">예상 행사 매출</div><div class="v">${U.krw(expSales)}</div></div>
        <div><div class="k">평시 대비 순증 이익</div><div class="v" style="color:var(${expGain >= 0 ? '--good' : '--bad'})">${expGain >= 0 ? '+' : ''}${U.krw(expGain)}</div></div>
        <div><div class="k">예상 ROAS</div><div class="v">${cost ? U.pct(expSales / cost, 0) : '-'}</div></div>`;
    };
    el.querySelectorAll('#sim input').forEach((i) => (i.oninput = sim));
    sim();
  };
})();
