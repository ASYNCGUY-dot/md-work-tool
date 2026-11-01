// 검색 순위 수동 기록 (로드맵 6순위): 플랫폼·키워드·관측 시각·측정 조건·자연/광고 구분.
// 미노출은 0위가 아니라 '관측 범위 밖(N위 밖)'으로 기록하고, 순위 변화는 두 관측 모두 순위가 있을 때만 계산한다
(function () {
  const U = MD.util;
  const TYPES = ['자연', '광고'];
  const DEVICES = ['모바일', 'PC'];
  const uid = () => 'RK' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const keyOf = (r) => [r.platform, r.keyword, r.sku || '', r.type].join('|');
  const nowLocal = () => { const t = new Date(); t.setMinutes(t.getMinutes() - t.getTimezoneOffset()); return t.toISOString().slice(0, 16); };
  const rankText = (r) => (r.rank != null ? `${r.rank}위` : `범위 밖(${r.scopeN || '?'}위 밖)`);

  // 같은 플랫폼·키워드·상품·구분의 최근 관측과 직전 관측 비교
  MD.rankSeries = function (rows) {
    const g = new Map();
    for (const r of [...rows].sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0))) { const k = keyOf(r); if (!g.has(k)) g.set(k, []); g.get(k).push(r); }
    return [...g.entries()].map(([k, list]) => {
      const last = list[list.length - 1], prev = list.length > 1 ? list[list.length - 2] : null;
      let change = null, note = '';
      if (prev) {
        if (last.rank != null && prev.rank != null) change = last.rank - prev.rank; // 음수 = 순위 상승
        else if (last.rank == null && prev.rank != null) note = '범위 밖으로 하락';
        else if (last.rank != null && prev.rank == null) note = '범위 안 진입';
        else note = '계속 범위 밖';
      }
      const diffCond = prev && (prev.device !== last.device || Number(prev.scopeN) !== Number(last.scopeN));
      return { key: k, list, last, prev, change, note, diffCond };
    });
  };

  let pick = null;

  MD.views.ranks = function (el) {
    const d = MD.data;
    if (!Array.isArray(d.ranks)) d.ranks = [];
    const series = MD.rankSeries(d.ranks).sort((a, b) => (a.last.at < b.last.at ? 1 : -1));
    const pname = (sku) => (sku ? ((d.productMap[sku] || {}).name || sku) : '-');
    const platforms = [...new Set([...d.channels.map((c) => c.name), ...d.ranks.map((r) => r.platform)].filter(Boolean))];
    const keywords = [...new Set(d.ranks.map((r) => r.keyword))];
    const drops = series.filter((s) => (s.change != null && s.change >= 5) || s.note === '범위 밖으로 하락');
    const ups = series.filter((s) => (s.change != null && s.change <= -5) || s.note === '범위 안 진입');
    if (pick && !series.some((s) => s.key === pick)) pick = null;
    const sel = series.find((s) => s.key === (pick || (series[0] && series[0].key)));

    el.innerHTML = `
      <div class="kpis kpis-4">
        <div class="kpi"><div class="k">추적 중</div><div class="v">${series.length}개</div><div class="s">플랫폼·키워드·상품·구분 조합</div></div>
        <div class="kpi"><div class="k">관측 기록</div><div class="v">${U.num(d.ranks.length)}건</div><div class="s">${d.ranks.length ? `최근 ${U.esc(series[0].last.at.replace('T', ' '))}` : '없음'}</div></div>
        <div class="kpi"><div class="k">순위 하락 (5위 이상·범위 밖)</div><div class="v" style="color:var(${drops.length ? '--bad' : '--good'})">${drops.length}개</div></div>
        <div class="kpi"><div class="k">순위 상승 (5위 이상·범위 진입)</div><div class="v">${ups.length}개</div></div>
      </div>
      ${drops.length ? `<div class="card" style="margin-top:16px"><div class="card-head"><h2>확인할 순위 변화</h2></div><ul class="insights">${drops.slice(0, 6).map((s) => `<li class="warn"><b>${U.esc(s.last.platform)} '${U.esc(s.last.keyword)}'</b> ${U.esc(pname(s.last.sku))} (${U.esc(s.last.type)}) — ${U.esc(rankText(s.prev))} → ${U.esc(rankText(s.last))}${s.diffCond ? ' <span class="muted">(측정 조건이 달라 직접 비교에 주의)</span>' : ''}</li>`).join('')}</ul></div>` : ''}

      <div class="card" style="margin-top:16px">
        <div class="card-head"><h2>순위 기록</h2><span class="muted">검색 결과를 직접 보고 적습니다. 보이지 않으면 순위를 비워 두세요 — 0위가 아니라 '관측 범위 밖'으로 남습니다</span></div>
        <div class="row end">
          <label class="field">관측 시각<input type="datetime-local" id="rAt" value="${nowLocal()}"></label>
          <label class="field">플랫폼<input type="text" id="rPf" list="rPfList" style="width:150px"><datalist id="rPfList">${platforms.map((p) => `<option value="${U.esc(p)}">`).join('')}</datalist></label>
          <label class="field">키워드<input type="text" id="rKw" list="rKwList" style="width:150px"><datalist id="rKwList">${keywords.map((k) => `<option value="${U.esc(k)}">`).join('')}</datalist></label>
          <label class="field">상품(선택)<select id="rSku"><option value="">(키워드 전체 관측)</option>${d.products.map((p) => `<option value="${U.esc(p.sku)}">${U.esc(p.sku)} ${U.esc(p.name || '')}</option>`).join('')}</select></label>
          <label class="field">구분<select id="rType">${TYPES.map((t) => `<option>${t}</option>`).join('')}</select></label>
          <label class="field">순위(비우면 범위 밖)<input type="number" id="rRank" min="1" step="1" style="width:80px"></label>
          <label class="field">관측 범위(상위 몇 위까지 확인)<input type="number" id="rScope" min="1" step="1" value="40" style="width:80px"></label>
          <label class="field">기기<select id="rDev">${DEVICES.map((t) => `<option>${t}</option>`).join('')}</select></label>
          <label class="field">메모<input type="text" id="rMemo" style="width:160px" placeholder="로그인·지역·정렬 기준 등"></label>
          <button class="btn primary" id="rAdd">기록</button>
        </div>
      </div>

      ${series.length ? `<div class="card">
        <div class="card-head"><h2>최근 순위</h2><span class="muted">변화는 두 관측 모두 순위가 있을 때만 계산(▲ 상승). 기기·관측 범위가 다르면 표시</span></div>
        <div class="table-wrap"><table><thead><tr><th>플랫폼</th><th style="min-width:110px">키워드</th><th style="min-width:150px">상품</th><th>구분</th><th class="num">최근</th><th class="num">직전</th><th>변화</th><th>관측 시각</th><th class="num">기록</th><th></th></tr></thead><tbody>
          ${series.map((s) => `<tr${sel && s.key === sel.key ? ' style="background:var(--surface-2)"' : ''}><td>${U.esc(s.last.platform)}</td><td>${U.esc(s.last.keyword)}</td><td>${U.esc(pname(s.last.sku))}</td><td>${U.esc(s.last.type)}</td>
            <td class="num">${U.esc(rankText(s.last))}</td><td class="num">${s.prev ? U.esc(rankText(s.prev)) : '-'}</td>
            <td>${s.change != null ? (s.change < 0 ? `<span class="delta good">▲${-s.change}</span>` : s.change > 0 ? `<span class="delta bad">▼${s.change}</span>` : '-') : U.esc(s.note || '-')}${s.diffCond ? ' <span class="tag warn">조건 다름</span>' : ''}</td>
            <td style="white-space:nowrap">${U.esc(s.last.at.replace('T', ' '))} · ${U.esc(s.last.device || '')}</td><td class="num">${s.list.length}</td>
            <td><button class="btn small" data-pick="${U.esc(s.key)}">추이</button></td></tr>`).join('')}
        </tbody></table></div></div>` : ''}

      ${sel ? `<div class="card"><div class="card-head"><h2>순위 추이 — ${U.esc(sel.last.platform)} '${U.esc(sel.last.keyword)}' ${U.esc(pname(sel.last.sku))} (${U.esc(sel.last.type)})</h2></div>
        <div style="height:220px"><canvas id="rkChart"></canvas></div>
        <div class="note">위로 갈수록 높은 순위입니다. 범위 밖 관측은 점을 찍지 않고(0위로 그리지 않음) 아래 표에 '범위 밖'으로 남깁니다.</div>
        <div class="table-wrap"><table><thead><tr><th>관측 시각</th><th class="num">순위</th><th class="num">관측 범위</th><th>기기</th><th>메모</th><th></th></tr></thead><tbody>
          ${[...sel.list].reverse().map((r) => `<tr><td>${U.esc(r.at.replace('T', ' '))}</td><td class="num">${U.esc(rankText(r))}</td><td class="num">${r.scopeN ? `상위 ${U.esc(r.scopeN)}위` : '-'}</td><td>${U.esc(r.device || '')}</td><td>${U.esc(r.memo || '')}</td><td><button class="btn small danger" data-rdel="${U.esc(r.id)}">삭제</button></td></tr>`).join('')}
        </tbody></table></div></div>` : `<div class="card"><div class="empty">아직 기록이 없습니다. 위에서 첫 관측을 기록해 보세요.</div></div>`}`;

    if (sel) {
      const pts = sel.list;
      const c = MD.charts.make(el.querySelector('#rkChart'), {
        type: 'line',
        data: { labels: pts.map((r) => r.at.slice(5, 16).replace('T', ' ')), datasets: [{ label: '순위', data: pts.map((r) => r.rank), borderColor: MD.colorOf(0), backgroundColor: MD.colorOf(0), spanGaps: false, pointRadius: 3, tension: 0 }] },
        options: { ...MD.charts.base((v) => `${v}위`) },
      });
      if (c) { c.options.scales.y.reverse = true; c.options.scales.y.beginAtZero = false; c.options.scales.y.min = 1; c.options.scales.y.ticks.precision = 0; c.update(); }
    }

    el.querySelector('#rAdd').onclick = async () => {
      const at = el.querySelector('#rAt').value, platform = el.querySelector('#rPf').value.trim(), keyword = el.querySelector('#rKw').value.trim();
      const rankRaw = el.querySelector('#rRank').value.trim(), scopeRaw = el.querySelector('#rScope').value.trim();
      // 모양뿐 아니라 시 0~23·분 0~59·실제 달력 날짜까지 맞아야 한다(25:00·10:99 거부), 백업 검사(datamgmt.js ROW_RULES.ranks)와 기준을 맞춤
      const atm = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})$/.exec(at);
      if (!atm || !U.normDate(atm[1]) || Number(atm[2]) > 23 || Number(atm[3]) > 59) { U.toast('관측 시각을 입력하세요.', 'bad'); return; }
      if (!platform || !keyword) { U.toast('플랫폼과 키워드를 입력하세요.', 'bad'); return; }
      const rank = rankRaw === '' ? null : Number(rankRaw), scopeN = Number(scopeRaw);
      if (rank != null && !(Number.isInteger(rank) && rank >= 1)) { U.toast('순위는 1 이상의 정수입니다. 보이지 않았다면 비워 두세요.', 'bad'); return; }
      if (!(Number.isInteger(scopeN) && scopeN >= 1)) { U.toast('관측 범위(상위 몇 위까지 확인했는지)를 입력하세요.', 'bad'); return; }
      if (rank != null && rank > scopeN) { U.toast(`순위(${rank})가 관측 범위(상위 ${scopeN}위)보다 큽니다. 범위를 늘려 적거나, 범위 밖이면 순위를 비우세요.`, 'bad'); return; }
      const row = { id: uid(), at, date: at.slice(0, 10), platform, keyword, sku: el.querySelector('#rSku').value, type: el.querySelector('#rType').value, rank, scopeN, device: el.querySelector('#rDev').value, memo: el.querySelector('#rMemo').value.trim() };
      d.ranks.push(row);
      if (!(await MD.store.save(['ranks']))) { d.ranks.pop(); return; }
      pick = keyOf(row); MD.rerender(); U.toast(`기록했습니다: ${rankText(row)}`);
    };
    el.querySelectorAll('[data-pick]').forEach((b) => (b.onclick = () => { pick = b.dataset.pick; MD.rerender(); }));
    el.querySelectorAll('[data-rdel]').forEach((b) => (b.onclick = async () => {
      if (!confirm('이 관측 기록을 삭제할까요?')) return;
      const keep = d.ranks;
      d.ranks = d.ranks.filter((r) => r.id !== b.dataset.rdel);
      if (!(await MD.store.save(['ranks']))) d.ranks = keep;
      MD.rerender();
    }));
  };
})();
