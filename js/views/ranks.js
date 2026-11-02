// 검색 순위 수동 기록 (로드맵 6순위): 플랫폼·키워드·관측 시각·측정 조건·자연/광고 구분.
// 미노출은 0위가 아니라 '관측 범위 밖(N위 밖)'으로 기록하고, 순위 변화는 두 관측 모두 순위가 있을 때만 계산한다
(function () {
  const U = MD.util;
  const TYPES = ['자연', '광고'];
  const DEVICES = ['모바일', 'PC'];
  const uid = () => 'RK' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const keyOf = (r) => JSON.stringify([r.platform, r.keyword, r.sku || '', r.type]);
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
      // 같은 조건(기기·관측 범위)의 직전 관측과 비교한 변화도 함께 (개선 8단계 — 조건이 다르면 이쪽이 비교 가능한 값)
      let prevSame = null;
      for (let i = list.length - 2; i >= 0; i--) if (list[i].device === last.device && Number(list[i].scopeN) === Number(last.scopeN)) { prevSame = list[i]; break; }
      const changeSame = prevSame && prevSame.rank != null && last.rank != null ? last.rank - prevSame.rank : null;
      return { key: k, list, last, prev, change, note, diffCond, prevSame, changeSame };
    });
  };

  let pick = null, sameOnly = false;
  // 순위 CSV 가져오기 (개선 8단계): 열 이름 별칭 → 같은 검사로 행마다 확인, 잘못된 행은 사유와 함께 제외, 같은 관측(시각·플랫폼·키워드·상품·구분·기기)은 건너뜀
  const RANK_COLS = { at: ['관측시각', '관측 시각', '시각', '일시', 'at'], date: ['날짜', '일자', '관측일', 'date'], platform: ['플랫폼', '채널', '쇼핑몰', 'platform'], keyword: ['키워드', '검색어', 'keyword'], sku: ['SKU', '상품코드', 'sku'], type: ['구분', '노출 구분', '노출구분', 'type'], rank: ['순위', '랭킹', 'rank'], scopeN: ['관측범위', '관측 범위', '확인 범위', '범위', 'scope'], device: ['기기', 'device'], memo: ['메모', 'memo'] };
  function parseRankRows(grid) {
    const norm = (x) => String(x || '').replace(/\s/g, '').toLowerCase();
    let h = grid.findIndex((row) => row.some((c) => RANK_COLS.keyword.some((a) => norm(a) === norm(c))));
    if (h < 0) throw new Error("'키워드' 열을 찾지 못했습니다.");
    const head = grid[h], col = {};
    for (const [k, al] of Object.entries(RANK_COLS)) { const j = head.findIndex((c) => al.some((a) => norm(a) === norm(c))); if (j >= 0) col[k] = j; }
    const rows = [], bad = {};
    const no = (why) => { bad[why] = (bad[why] || 0) + 1; };
    for (let i = h + 1; i < grid.length; i++) {
      const g = (k) => (col[k] == null ? '' : String(grid[i][col[k]] ?? '').trim());
      if (!grid[i].some((v) => String(v).trim() !== '')) continue;
      let at = g('at').replace(' ', 'T').slice(0, 16);
      if (!at && g('date')) at = (U.normDate(g('date')) || '') + 'T00:00';
      const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})$/.exec(at);
      if (!m || !U.normDate(m[1]) || U.normDate(m[1]) !== m[1] || Number(m[2]) > 23 || Number(m[3]) > 59) { no('관측 시각 오류'); continue; }
      const platform = g('platform'), keyword = g('keyword');
      if (!platform || !keyword) { no('플랫폼·키워드 빈 값'); continue; }
      const tRaw = g('type'), type = /광고|ad/i.test(tRaw) ? '광고' : '자연';
      const rRaw = g('rank'), out = rRaw === '' || /^(-|범위\s*밖|없음|미노출)$/.test(rRaw);
      const rank = out ? null : Number(rRaw.replace(/[위,\s]/g, ''));
      const scopeN = g('scopeN') === '' ? 40 : Number(g('scopeN').replace(/[위,\s]/g, ''));
      if (!(Number.isInteger(scopeN) && scopeN >= 1)) { no('관측 범위 오류'); continue; }
      if (rank != null && !(Number.isInteger(rank) && rank >= 1 && rank <= scopeN)) { no('순위 오류(1 이상, 관측 범위 이하)'); continue; }
      const dRaw = g('device'), device = /pc|데스크/i.test(dRaw) ? 'PC' : '모바일';
      rows.push({ at, date: m[1], platform, keyword, sku: g('sku'), type, rank, scopeN, device, memo: g('memo') });
    }
    return { rows, bad, scopeDefaulted: col.scopeN == null };
  }

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
        <div class="card-head"><h2>순위 기록</h2><span class="muted">검색 결과를 직접 보고 적습니다. 보이지 않으면 순위를 비워 두세요 — 0위가 아니라 '관측 범위 밖'으로 남습니다</span>
          <span class="spacer"></span><label class="btn small">CSV·엑셀로 여러 건 올리기<input type="file" id="rkFile" accept=".csv,.xlsx,.xls" class="hide"></label></div>
        <div class="muted" style="font-size:12px;margin-bottom:8px">열: 관측시각(또는 날짜)·플랫폼·키워드·SKU·구분(자연/광고)·순위(비우거나 '-'면 범위 밖)·관측범위·기기·메모. 같은 관측은 한 번만 들어갑니다.</div>
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
            <td>${s.change != null ? (s.change < 0 ? `<span class="delta good">▲${-s.change}</span>` : s.change > 0 ? `<span class="delta bad">▼${s.change}</span>` : '-') : U.esc(s.note || '-')}${s.diffCond ? ` <span class="tag warn">조건 다름</span>${s.changeSame != null ? ` <span class="muted" style="font-size:11px">같은 조건 직전 대비 ${s.changeSame < 0 ? `▲${-s.changeSame}` : s.changeSame > 0 ? `▼${s.changeSame}` : '변화 없음'}</span>` : s.prevSame ? ` <span class="muted" style="font-size:11px">같은 조건 직전 ${U.esc(rankText(s.prevSame))}</span>` : ' <span class="muted" style="font-size:11px">같은 조건 이전 관측 없음</span>'}` : ''}</td>
            <td style="white-space:nowrap">${U.esc(s.last.at.replace('T', ' '))} · ${U.esc(s.last.device || '')}</td><td class="num">${s.list.length}</td>
            <td><button class="btn small" data-pick="${U.esc(s.key)}">추이</button></td></tr>`).join('')}
        </tbody></table></div></div>` : ''}

      ${sel ? `<div class="card"><div class="card-head"><h2>순위 추이 — ${U.esc(sel.last.platform)} '${U.esc(sel.last.keyword)}' ${U.esc(pname(sel.last.sku))} (${U.esc(sel.last.type)})</h2></div>
        <div class="row" style="margin-bottom:6px"><label class="muted"><input type="checkbox" id="rkSame" ${sameOnly ? 'checked' : ''}> 최근 관측과 같은 조건(${U.esc(sel.last.device || '')}·상위 ${U.esc(sel.last.scopeN)}위)만 보기</label></div>
        <div style="height:200px"><canvas id="rkChart"></canvas></div>
        <div id="rkSalesBox"></div>
        <div class="note">날짜별 마지막 관측 순위입니다(위로 갈수록 높은 순위). 범위 밖 관측은 점을 찍지 않고(0위로 그리지 않음) 아래 표에 '범위 밖'으로 남깁니다. 매출 그래프는 같은 날짜 축에 따로 그려 순위와 겹쳐 읽지 않게 했습니다 — 두 선이 같이 움직여도 인과관계를 뜻하지는 않습니다.</div>
        <div class="table-wrap"><table><thead><tr><th>관측 시각</th><th class="num">순위</th><th class="num">관측 범위</th><th>기기</th><th>메모</th><th></th></tr></thead><tbody>
          ${[...sel.list].reverse().map((r) => `<tr><td>${U.esc(r.at.replace('T', ' '))}</td><td class="num">${U.esc(rankText(r))}</td><td class="num">${r.scopeN ? `상위 ${U.esc(r.scopeN)}위` : '-'}</td><td>${U.esc(r.device || '')}</td><td>${U.esc(r.memo || '')}</td><td><button class="btn small danger" data-rdel="${U.esc(r.id)}">삭제</button></td></tr>`).join('')}
        </tbody></table></div></div>` : `<div class="card"><div class="empty">아직 기록이 없습니다. 위에서 첫 관측을 기록해 보세요.</div></div>`}`;

    if (sel) {
      const pts = sel.list.filter((r) => !sameOnly || (r.device === sel.last.device && Number(r.scopeN) === Number(sel.last.scopeN)));
      // 날짜 축을 첫 관측일~마지막 관측일 하루 단위로 맞춰 순위·매출 두 그래프가 같은 날짜를 가리키게 한다
      const days = pts.length ? U.dateRange(pts[0].date, pts[pts.length - 1].date) : [];
      const lastOfDay = new Map(); for (const r of pts) lastOfDay.set(r.date, r);
      const labels = days.map((x) => x.slice(5).replace('-', '/'));
      const c = MD.charts.make(el.querySelector('#rkChart'), {
        type: 'line',
        data: { labels, datasets: [{ label: '순위', data: days.map((x) => (lastOfDay.has(x) ? lastOfDay.get(x).rank : null)), borderColor: MD.colorOf(0), backgroundColor: MD.colorOf(0), spanGaps: false, pointRadius: 3, tension: 0 }] },
        options: { ...MD.charts.base((v) => `${v}위`) },
      });
      if (c) { c.options.scales.y.reverse = true; c.options.scales.y.beginAtZero = false; c.options.scales.y.min = 1; c.options.scales.y.ticks.precision = 0; c.update(); }
      // 같은 기간 매출: 플랫폼 이름이 판매 채널과 같을 때만(상품을 골랐으면 그 상품, 아니면 채널 전체)
      const sb = el.querySelector('#rkSalesBox'), ch = sel.last.platform, sku = sel.last.sku;
      if (!d.channelMap[ch]) sb.innerHTML = `<div class="muted" style="font-size:12px;margin:6px 0">'${U.esc(ch)}'이(가) 판매 채널 이름과 달라 같은 기간 매출을 붙이지 않았습니다. 채널명과 같게 적으면 매출 그래프가 함께 나옵니다.</div>`;
      else if (days.length) {
        const g = new Map(); for (const r of MD.calc.inRange(d.sales, days[0], days[days.length - 1])) if (r.channel === ch && (!sku || r.sku === sku)) g.set(r.date, (g.get(r.date) || 0) + r.sales);
        sb.innerHTML = `<div class="muted" style="font-size:12px;margin:8px 0 2px">같은 기간 ${U.esc(ch)} ${sku ? U.esc(pname(sku)) + ' ' : ''}일매출${d.maxDate && days[days.length - 1] > d.maxDate ? ` (판매 자료는 ${d.maxDate}까지)` : ''}</div><div style="height:160px"><canvas id="rkSales"></canvas></div>`;
        MD.charts.make(sb.querySelector('#rkSales'), { type: 'bar', data: { labels, datasets: [{ label: '매출', data: days.map((x) => (d.maxDate && x > d.maxDate ? null : g.get(x) || 0)), backgroundColor: MD.colorOf(1) }] }, options: { ...MD.charts.base(U.krw) } });
      }
      el.querySelector('#rkSame').onchange = (e) => { sameOnly = e.target.checked; MD.rerender(); };
    }
    el.querySelector('#rkFile').onchange = async (e) => {
      const f = e.target.files[0]; e.target.value = ''; if (!f) return;
      let parsed;
      try { const sheets = await U.readGrid(f); parsed = parseRankRows(sheets[0].grid); } catch (err) { U.toast('순위 파일 읽기 실패: ' + err.message, 'bad'); return; }
      const seen = new Set(d.ranks.map((r) => JSON.stringify([r.at, r.platform, r.keyword, r.sku || '', r.type, r.device])));
      const add = parsed.rows.filter((r) => { const k = JSON.stringify([r.at, r.platform, r.keyword, r.sku || '', r.type, r.device]); if (seen.has(k)) return false; seen.add(k); return true; }).map((r) => ({ id: uid(), ...r }));
      const badN = Object.values(parsed.bad).reduce((a, b) => a + b, 0), dup = parsed.rows.length - add.length;
      if (!add.length) { U.toast(`올릴 새 관측이 없습니다${badN ? ` (제외 ${badN}행: ${Object.entries(parsed.bad).map(([k, n]) => `${k} ${n}`).join(', ')})` : ''}${dup ? ` · 이미 있는 관측 ${dup}건` : ''}.`, 'bad'); return; }
      d.ranks.push(...add);
      if (!(await MD.store.saveP(['ranks']))) { d.ranks.splice(d.ranks.length - add.length, add.length); return; } // 실패 안내는 저장 함수가 띄운다
      MD.rerender();
      U.toast(`순위 관측 ${add.length}건을 올렸습니다${badN ? ` · 제외 ${badN}행(${Object.entries(parsed.bad).map(([k, n]) => `${k} ${n}`).join(', ')})` : ''}${dup ? ` · 이미 있는 관측 ${dup}건 건너뜀` : ''}${parsed.scopeDefaulted ? ' · 관측범위 열이 없어 상위 40위로 기록' : ''}.`);
    };

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
