// 상품 선정 스코어링(소싱 후보) + 트렌드 키워드 비교
(function () {
  const U = MD.util;
  const W_DEF = { popularity: 30, lastYear: 20, outlook: 25, margin: 25 };
  let trend = U.store.get('trend', null);

  // 가중치는 유한하고 0 이상인 값만 유효 (음수·NaN·Infinity는 0으로 취급)
  function sanitizeWeights(w) {
    const out = {};
    for (const k of Object.keys(W_DEF)) { const n = Number(w[k]); out[k] = Number.isFinite(n) && n >= 0 ? n : 0; }
    return out;
  }

  function score(c, w, maxLY, target) {
    const parts = {
      popularity: (Number(c.popularity) || 0) / 5,
      lastYear: maxLY ? (Number(c.lastYearQty) || 0) / maxLY : 0,
      outlook: (Number(c.outlook) || 0) / 5,
      margin: Math.max(0, Math.min(1, (Number(c.margin) || 0) / (target * 1.4))),
    };
    const maxW = Math.max(0, ...Object.values(w));
    if (!maxW) return 0; // 가중치 합계가 0이면 평가 기준이 없으므로 0점 처리
    // 가중치를 최댓값 기준 비율로 정규화해 매우 큰 값에서도 합산이 Infinity로 넘치지 않도록 한다
    const ratio = {}; for (const k of Object.keys(w)) ratio[k] = w[k] / maxW;
    const sw = Object.values(ratio).reduce((a, b) => a + b, 0);
    const raw = (Object.keys(parts).reduce((a, k) => a + parts[k] * ratio[k], 0) / sw) * 100;
    return Math.max(0, Math.min(100, Math.round(raw)));
  }

  MD.views.sourcing = function (el) {
    trend = U.store.get('trend', null); // 백업 복원 뒤에도 저장된 값으로 (Codex 기능 L R2-01과 같은 문제)
    const d = MD.data;
    const w = sanitizeWeights(Object.assign({}, W_DEF, U.store.get('weights', {})));
    U.store.set('weights', w); // 저장된 값에 음수·NaN이 있었다면 정규화해 다시 저장
    const target = (U.store.get('pricing', {}).target || 25) / 100;

    el.innerHTML = `
      <div class="card">
        <div class="card-head"><h2>상품 선정 스코어</h2><span class="muted">현재 인기도 · 전년 동기 판매량 · 다음 시즌 전망 · 예상 이익률을 가중 합산 (100점)</span></div>
        <div class="row end" id="wRow">
          ${[['popularity', '현재 인기도'], ['lastYear', '전년 동기 판매량'], ['outlook', '다음 시즌 전망'], ['margin', '예상 이익률']].map(([k, l]) => `<label class="field">${l} 가중치<input type="number" data-w="${k}" value="${w[k]}" style="width:90px"></label>`).join('')}
          <button class="btn primary" id="cAdd">+ 후보 추가</button>
        </div>
        <div class="table-wrap" style="margin-top:12px"><table id="cTbl"></table></div>
        <div class="note">인기도·전망은 1~5점 직접 평가(아래 트렌드 비교 참고). 이익률 점수는 목표 이익률(${U.pct(target, 0)})의 1.4배에서 만점. 70점 이상 도입 추천, 50~69점 테스트 발주, 50점 미만 보류. 가중치는 0 이상 숫자만 유효하며 음수·빈 값은 0으로 처리됩니다. 가중치 합계가 0이면 평가 기준이 없어 모든 후보가 0점으로 표시됩니다.</div>
      </div>
      <div class="card">
        <div class="card-head"><h2>트렌드 키워드 비교</h2><span class="muted">검색량 지수 CSV를 올리면 최근 4주 vs 직전 4주 증감을 계산</span></div>
        <div class="row">
          <input type="file" id="tFile" accept=".csv,.xlsx,.xls">
          <button class="btn small" id="tSample">예시 트렌드 보기</button>
          ${trend ? '<button class="btn small danger" id="tClear">지우기</button>' : ''}
        </div>
        <div class="note">형식: 첫 열 날짜(YYYY-MM-DD), 다음 열부터 키워드별 수치. 네이버 데이터랩·구글 트렌드에서 내려받은 파일의 머리말 행은 지우고 올려주세요.</div>
        <div id="trendOut"></div>
      </div>`;

    function drawTable() {
      const list = d.candidates;
      const maxLY = Math.max(1, ...list.map((c) => Number(c.lastYearQty) || 0));
      const inp = (i, k, v, type = 'text', wd = '') => `<input type="${type}" data-i="${i}" data-k="${k}" value="${U.esc(v ?? '')}" ${wd ? `style="width:${wd}"` : ''}>`;
      const sel5 = (i, k, v) => `<select data-i="${i}" data-k="${k}">${[1, 2, 3, 4, 5].map((n) => `<option ${n == v ? 'selected' : ''}>${n}</option>`).join('')}</select>`;
      const rows = list.map((c, i) => ({ c, i, s: score(c, w, maxLY, target) })).sort((a, b) => b.s - a.s);
      el.querySelector('#cTbl').innerHTML = `<thead><tr><th>점수</th><th>판정</th><th>후보 상품</th><th>브랜드</th><th>카테고리</th><th>인기도</th><th class="num">전년 동기 판매</th><th>시즌 전망</th><th class="num">예상 이익률(%)</th><th>공급처</th><th class="num">MOQ</th><th>메모</th><th></th></tr></thead>
        <tbody>${rows.map(({ c, i, s }) => `<tr>
          <td class="num"><b>${s}</b></td>
          <td><span class="tag ${s >= 70 ? 'good' : s >= 50 ? 'warn' : 'neutral'}">${s >= 70 ? '도입 추천' : s >= 50 ? '테스트 발주' : '보류'}</span></td>
          <td>${inp(i, 'name', c.name, 'text', '160px')}</td><td>${inp(i, 'brand', c.brand, 'text', '120px')}</td><td>${inp(i, 'category', c.category, 'text', '80px')}</td>
          <td>${sel5(i, 'popularity', c.popularity)}</td><td>${inp(i, 'lastYearQty', c.lastYearQty, 'number', '80px')}</td><td>${sel5(i, 'outlook', c.outlook)}</td>
          <td>${inp(i, 'margin', c.margin != null && c.margin !== '' ? Math.round(c.margin * 1000) / 10 : '', 'number', '70px')}</td>
          <td>${inp(i, 'supplier', c.supplier, 'text', '140px')}</td><td>${inp(i, 'moq', c.moq, 'number', '60px')}</td><td>${inp(i, 'memo', c.memo, 'text', '150px')}</td>
          <td class="actions"><button class="btn small danger" data-del="${i}">삭제</button></td></tr>`).join('') || '<tr><td colspan="13" class="muted" style="text-align:center">후보가 없습니다.</td></tr>'}</tbody>`;
    }
    drawTable();

    const tbl = el.querySelector('#cTbl');
    tbl.addEventListener('change', (e) => {
      const t = e.target; if (t.dataset.i == null) return;
      const c = d.candidates[t.dataset.i];
      let v = t.value;
      if (t.dataset.k === 'margin') v = v === '' ? '' : Number(v) / 100;
      else if (['lastYearQty', 'moq', 'popularity', 'outlook'].includes(t.dataset.k)) v = Number(v);
      const prev = c[t.dataset.k], hadEdited = c.sampleEdited;
      c[t.dataset.k] = v;
      if (c && c.sample) c.sampleEdited = true; // 고친 예시 행 (개선 1단계)
      // 저장 실패면 값·표시를 되돌린다 (개선 3단계)
      MD.store.saveP(['candidates']).then((ok) => { if (!ok) { c[t.dataset.k] = prev; if (hadEdited) c.sampleEdited = hadEdited; else delete c.sampleEdited; } drawTable(); });
    });
    tbl.addEventListener('click', (e) => {
      const i = e.target.dataset.del; if (i == null) return;
      if (confirm('이 후보를 삭제할까요?')) { const removed = d.candidates.splice(Number(i), 1)[0]; MD.store.saveP(['candidates']).then((ok) => { if (!ok) d.candidates.splice(Number(i), 0, removed); drawTable(); }); }
    });
    el.querySelector('#cAdd').onclick = () => {
      const row = { name: '새 후보', brand: '', category: '', popularity: 3, lastYearQty: 0, outlook: 3, margin: target, supplier: '', moq: '', memo: '' };
      d.candidates.push(row);
      MD.store.saveP(['candidates']).then((ok) => { if (!ok) { const j = d.candidates.indexOf(row); if (j !== -1) d.candidates.splice(j, 1); } drawTable(); });
    };
    el.querySelectorAll('[data-w]').forEach((i) => {
      i.oninput = () => {
        let v = Number(i.value);
        if (!Number.isFinite(v) || v < 0) v = 0;
        w[i.dataset.w] = v; U.store.set('weights', w); drawTable();
      };
      // 입력을 마치면(blur) 음수·빈 값 등을 실제로 쓰인 값(0 이상)으로 화면에도 맞춘다
      i.onchange = () => { i.value = w[i.dataset.w]; };
    });

    // 트렌드
    function drawTrend() {
      const out = el.querySelector('#trendOut');
      if (!trend || !trend.rows.length) { out.innerHTML = ''; return; }
      const keys = trend.keys.slice(0, 8);
      const n = trend.rows.length;
      const avg = (k, a, b) => { const s = trend.rows.slice(Math.max(0, a), b); return s.reduce((x, r) => x + r[k], 0) / (s.length || 1); };
      // 일별이면 28행, 주별이면 4행을 4주로 본다
      const step = n > 1 ? U.diffDays(trend.rows[0].date, trend.rows[1].date) : 1;
      const w4 = Math.max(1, Math.round(28 / Math.max(1, step)));
      const stats = keys.map((k, i) => ({ k, i, last: avg(k, n - w4, n), prev: avg(k, n - 2 * w4, n - w4) })).map((s) => ({ ...s, d: U.delta(s.last, s.prev) }));
      out.innerHTML = `${MD.legend(keys.map((k, i) => ({ label: k, color: MD.colorOf(i) })))}<div class="chart-box"><canvas id="cTr"></canvas></div>
        <ul class="insights" style="margin-top:12px">${stats.sort((a, b) => (b.d ?? -9) - (a.d ?? -9)).map((s) => `<li class="${s.d > 0.1 ? 'good' : s.d < -0.1 ? 'bad' : ''}"><b>${U.esc(s.k)}</b> 최근 4주 평균 ${U.num(s.last, 1)} · 직전 4주 대비 ${U.deltaHtml(s.d)}${s.d > 0.2 ? ' → 인기도 4~5점 후보' : ''}</li>`).join('')}</ul>
        ${trend.sample ? '<div class="note">가상의 예시 트렌드입니다.</div>' : ''}`;
      MD.charts.line(out.querySelector('#cTr'), trend.rows.map((r) => r.date.slice(2)), keys.map((k, i) => ({ label: k, data: trend.rows.map((r) => r[k]), color: MD.colorOf(i) })), (v) => U.num(v, 0));
    }
    drawTrend();

    el.querySelector('#tFile').onchange = async (e) => {
      const f = e.target.files[0]; if (!f) return;
      try {
        const rows = await U.readTable(f);
        const cols = Object.keys(rows[0] || {});
        const dk = cols[0], keys = cols.slice(1);
        const parsed = rows.map((r) => {
          const ds = String(r[dk]).replace(/[./]/g, '-').slice(0, 10);
          if (!/^\d{4}-\d{2}-\d{2}$/.test(ds)) return null;
          const o = { date: ds }; keys.forEach((k) => (o[k] = Number(String(r[k]).replace(/,/g, '')) || 0)); return o;
        }).filter(Boolean).sort((a, b) => (a.date < b.date ? -1 : 1));
        if (!parsed.length) throw new Error('날짜 형식(YYYY-MM-DD) 행을 찾지 못했습니다.');
        trend = { keys, rows: parsed }; U.store.set('trend', trend); MD.rerender();
      } catch (err) { U.toast('읽기 실패: ' + err.message, 'bad'); }
    };
    el.querySelector('#tSample').onclick = () => {
      const r = U.rng(7), end = MD.data.maxDate || U.today();
      const keys = ['미니 호보백', '카드지갑', '무스탕', '실크 스카프'];
      const rows = [];
      for (let i = 25; i >= 0; i--) {
        const o = { date: U.addDays(end, -7 * i) };
        o[keys[0]] = Math.round(40 + (25 - i) * 2.2 + r() * 8);
        o[keys[1]] = Math.round(55 + Math.sin(i / 3) * 6 + r() * 6);
        o[keys[2]] = Math.round(20 + Math.max(0, 12 - i) * 5 + r() * 6);
        o[keys[3]] = Math.round(60 - (25 - i) * 1.4 + r() * 6);
        rows.push(o);
      }
      trend = { keys, rows, sample: true }; U.store.set('trend', trend); MD.rerender();
    };
    const clr = el.querySelector('#tClear');
    if (clr) clr.onclick = () => { trend = null; U.store.del('trend'); MD.rerender(); };
  };
})();
