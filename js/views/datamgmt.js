// 데이터 관리: 양식 내려받기, 업로드(추가/교체), 채널·상품 마스터 편집, 백업·복원, 기준값
(function () {
  const U = MD.util;

  const SPECS = {
    sales: {
      label: '판매 데이터', desc: '일자·채널·상품별 판매 (사방넷·플랫폼 주문 내역을 일자별로 합친 형태)',
      cols: { date: ['날짜', '일자', '주문일', 'date'], channel: ['채널', '쇼핑몰', '판매처', 'channel'], sku: ['SKU', '상품코드', '품번', 'sku'], qty: ['수량', '판매수량', 'qty'], sales: ['매출', '결제금액', '판매금액', '실결제금액', 'sales'], discount: ['할인', '할인금액', 'discount'], orders: ['주문수', '주문건수', 'orders'] },
      required: ['date', 'channel', 'sku', 'sales'],
      example: [{ 날짜: '2026-10-01', 채널: '네이버 스마트스토어', SKU: 'SKU001', 수량: 2, 매출: 1980000, 할인: 0, 주문수: 2 }],
    },
    traffic: {
      label: '유입·광고비', desc: '일자·채널별 전체 방문수(세션)·광고비, 그리고 플랫폼 통계의 주문 건수(선택, 전환율 목표 판정에 필요)',
      cols: { date: ['날짜', '일자', 'date'], channel: ['채널', '쇼핑몰', 'channel'], visits: ['유입', '방문', '유입수', '방문수', '세션', 'visits'], ad: ['광고비', '광고 비용', 'ad'], orders: ['주문수', '주문건수', '결제건수', '구매건수', 'orders'] },
      required: ['date', 'channel'],
      example: [{ 날짜: '2026-10-01', 채널: '네이버 스마트스토어', 방문수: 1520, 광고비: 180000, 주문수: 41 }],
    },
    products: {
      label: '상품 마스터', desc: 'SKU별 원가(입고원가, VAT 제외)·판매가(VAT 포함)·재고',
      cols: { sku: ['SKU', '상품코드', '품번', 'sku'], name: ['상품명', 'name'], brand: ['브랜드', 'brand'], category: ['카테고리', '분류', 'category'], season: ['시즌', 'season'], price: ['판매가', 'price'], cost: ['원가', '입고원가', 'cost'], stock: ['재고', '현재고', 'stock'] },
      required: ['sku'],
      example: [{ SKU: 'SKU001', 상품명: 'MAISON LUNE 숄더백', 브랜드: 'MAISON LUNE', 카테고리: '가방', 시즌: '사계절', 판매가: 990000, 원가: 520000, 재고: 12 }],
    },
    ads: {
      label: '광고 리포트', desc: '플랫폼 광고 리포트: 일자·채널별 광고비와 광고 매출(전환 매출). 노출·클릭·전환수·캠페인 열을 더 넣으면 CTR·CPC·CPA·캠페인별 분석이 추가됩니다. 채널 열에는 데이터 관리의 판매 채널 이름을 적으세요(예: 쿠팡 광고 → 쿠팡).',
      cols: { date: ['날짜', '일자', 'date'], channel: ['채널', '쇼핑몰', '판매채널', 'channel'], campaign: ['캠페인', '캠페인명', '광고그룹', 'campaign'], spend: ['광고비', '비용', '총비용', '광고 비용', 'spend', 'cost'], revenue: ['광고매출', '광고 매출', '전환매출', '전환 매출', '전환매출액', '구매금액', 'revenue'], imp: ['노출', '노출수', 'impressions'], clicks: ['클릭', '클릭수', 'clicks'], conv: ['전환', '전환수', '구매수', '구매 전환수', 'conversions'] },
      required: ['date', 'channel', 'spend'],
      example: [{ 날짜: '2026-10-01', 채널: '쿠팡', 캠페인: '쿠팡 검색광고', 노출: 52000, 클릭: 640, 광고비: 180000, 전환수: 21, 광고매출: 1150000 }],
    },
    compete: {
      label: '경쟁 상품', desc: '정기 조사한 경쟁 상품의 가격·순위. SKU 열에는 비교할 우리 상품 SKU를 적습니다. 순위·리뷰수·평점·우리 판매가 열을 더 넣으면 순위 변화·리뷰 격차 분석이 추가됩니다.',
      cols: { date: ['날짜', '일자', '조사일', 'date'], sku: ['SKU', '상품코드', '우리상품', '우리 상품', 'sku'], rival: ['경쟁상품', '경쟁 상품', '경쟁상품명', 'rival'], rivalBrand: ['경쟁브랜드', '경쟁 브랜드'], channel: ['채널', '판매처', 'channel'], price: ['경쟁가', '경쟁 가격', '경쟁상품가', 'price'], ourPrice: ['우리판매가', '우리 판매가', '자사가'], rank: ['순위', '랭킹', 'rank'], reviews: ['리뷰수', '리뷰 수', 'reviews'], rating: ['평점', 'rating'] },
      required: ['date', 'sku', 'rival', 'price'],
      example: [{ 날짜: '2026-10-01', SKU: 'KC-202', 경쟁상품: 'A사 세라믹 프라이팬 28cm', 경쟁브랜드: 'A사', 채널: '쿠팡', 경쟁가: 35900, 우리판매가: 39000, 순위: 3, 리뷰수: 1520, 평점: 4.7 }],
    },
    channels: {
      label: '채널', desc: '채널명·유형·수수료율(예: 0.12)·월 목표 매출',
      cols: { name: ['채널', '채널명', 'name'], type: ['유형', 'type'], fee: ['수수료율', '수수료', 'fee'], target: ['월목표', '월 목표', '목표', 'target'] },
      required: ['name'],
      example: [{ 채널: '네이버 스마트스토어', 유형: '오픈마켓', 수수료율: 0.055, 월목표: 60000000 }],
    },
  };
  const NUMS = ['qty', 'sales', 'discount', 'orders', 'visits', 'ad', 'price', 'cost', 'stock', 'fee', 'target', 'spend', 'revenue', 'imp', 'clicks', 'conv', 'ourPrice', 'rank', 'reviews', 'rating'];

  // 열 이름(별칭)으로 항목 ↔ 파일 열을 자동으로 맞춘다
  function autoMap(spec, head) {
    const norm = (s) => String(s).replace(/\s/g, '').toLowerCase();
    const map = {};
    for (const [k, al] of Object.entries(spec.cols)) { const h = head.find((c) => c && al.some((a) => norm(a) === norm(c))); if (h) map[k] = h; }
    return map;
  }
  // opts(가져오기 전 확인 화면용, 선택): headers = 열 이름 목록, override = { 항목: 파일 열 | ''(사용 안 함) } 직접 지정,
  // rowNums = 각 행의 원본 파일 행 번호(제외 사유 예시에 표시)
  function mapRows(spec, rows, opts = {}) {
    if (!rows.length) throw new Error('행이 없습니다.');
    const head = opts.headers || Object.keys(rows[0]);
    const map = autoMap(spec, head);
    for (const [k, h] of Object.entries(opts.override || {})) { if (h === '') delete map[k]; else if (head.includes(h)) map[k] = h; }
    const miss = spec.required.filter((k) => !map[k]);
    if (miss.length) throw new Error(`필수 열 없음: ${miss.map((k) => spec.cols[k][0]).join(', ')}`);
    // 잘못된 값은 0이나 기본값으로 바꾸지 않고 행 단위로 제외한다. 빈 칸만 '값 없음'으로 본다.
    const reasons = {}, samples = [];
    let rowNo = 0;
    const reject = (why) => { reasons[why] = (reasons[why] || 0) + 1; if (samples.length < 20) samples.push({ row: rowNo, why }); return null; };
    const out = rows.map((r, i) => {
      rowNo = opts.rowNums ? opts.rowNums[i] : i + 2;
      const o = {};
      for (const [k, h] of Object.entries(map)) {
        const raw = String(r[h] ?? '').trim();
        if (NUMS.includes(k)) {
          if (raw === '') { if (spec.required.includes(k)) return reject(`${spec.cols[k][0]} 빈 값`); continue; }
          const cleaned = raw.replace(/[,원%\s]/g, '');
          let v = Number(cleaned);
          // '원'·'%'만 있는 칸은 Number('')=0이 되므로 숫자가 남아 있는지 따로 확인
          if (!/\d/.test(cleaned) || !Number.isFinite(v)) return reject(`${spec.cols[k][0]} 숫자 아님`);
          if (spec === SPECS.sales && (k === 'qty' || k === 'orders') && !(v > 0)) return reject(`${spec.cols[k][0]} 0 이하`);
          // 유입 자료의 방문·광고비·주문 건수는 0이 정상 값이다 (주문 없는 날, 광고 안 한 날). 음수만 거부
          if ((spec === SPECS.traffic || spec === SPECS.ads || spec === SPECS.compete) && v < 0) return reject(`${spec.cols[k][0]} 음수`);
          if (spec === SPECS.compete && (k === 'price' || k === 'ourPrice') && !(v > 0)) return reject(`${spec.cols[k][0]} 0원`); // 0원 조사가는 가격 격차를 계산할 수 없다
          // 수수료: '12%'·'0.5%'처럼 %가 붙었거나 1보다 크면(12) 백분율, 아니면(0.12) 비율로 본다
          if (k === 'fee' && (raw.includes('%') || v > 1)) v = v / 100;
          o[k] = v;
        } else if (k === 'date') {
          const v = U.normDate(raw);
          if (!v) return reject('날짜 오류');
          o[k] = v;
        } else {
          if (raw === '') { if (spec.required.includes(k)) return reject(`${spec.cols[k][0]} 빈 값`); continue; } // 빈 칸은 기존 값 유지
          o[k] = raw;
        }
      }
      return o;
    }).filter(Boolean);
    const bad = Object.values(reasons).reduce((a, b) => a + b, 0);
    return { rows: out, bad, reasons, map, samples };
  }

  // 광고 리포트: 일자·채널·캠페인으로 합산. 광고비는 필수, 광고 매출·노출·클릭·전환수는 선택 —
  // 한 행이라도 값이 없던 항목은 그 합계에서 '없음'으로 남겨(miss) 분석·판정에서 빼게 한다
  function importAds(rows, mode) {
    MD.store.ensureReal();
    const D = MD.data, OPT = ['revenue', 'imp', 'clicks', 'conv'];
    const key = (r) => r.date + '|' + r.channel + '|' + (r.campaign || '');
    const agg = new Map();
    for (const r of rows) {
      const k = key(r), miss = OPT.filter((f) => r[f] == null), prev = agg.get(k);
      if (!prev) { agg.set(k, { ...r, campaign: r.campaign || '', miss }); continue; }
      prev.spend += r.spend;
      for (const f of OPT) { if (r[f] == null) { if (!prev.miss.includes(f)) prev.miss.push(f); } else if (!prev.miss.includes(f)) prev[f] = (prev[f] || 0) + r[f]; }
    }
    const out = [...agg.values()].map((r) => { r.miss.forEach((f) => delete r[f]); if (!r.miss.length) delete r.miss; return r; });
    if (mode === 'replace') D.ads = out;
    else { const m = new Map(D.ads.map((r) => [key(r), r])); out.forEach((r) => m.set(key(r), r)); D.ads = [...m.values()]; }
    MD.store.save();
    const known = new Set(D.channels.map((c) => c.name));
    const unknown = [...new Set(out.map((r) => r.channel))].filter((c) => !known.has(c));
    const merged = rows.length - out.length;
    return (merged ? ` 같은 일자·채널·캠페인 행 ${merged}개를 합산했습니다.` : '') +
      (unknown.length ? ` 채널 목록에 없는 이름 ${unknown.length}개(${unknown.slice(0, 3).join(', ')}): 채널별 목표 판정에서 빠집니다. 판매 채널 이름과 같게 고쳐 다시 올리거나 채널명을 맞추세요.` : '') +
      ' 새 자료는 [자료 마감 확인]에서 확인일을 찍어야 목표 판정에 쓰입니다.';
  }

  // 경쟁 상품: 같은 조사일·SKU·경쟁상품·채널은 마지막 행으로 (가격은 합산하면 안 되는 값)
  function importCompete(rows, mode) {
    MD.store.ensureReal();
    const D = MD.data, key = (r) => [r.date, r.sku, r.rival, r.channel || ''].join('|');
    const m = new Map(mode === 'replace' ? [] : D.compete.map((r) => [key(r), r]));
    rows.forEach((r) => m.set(key(r), { ...r, channel: r.channel || '' }));
    D.compete = [...m.values()];
    MD.store.save();
    const known = new Set(D.products.map((p) => p.sku));
    const unknown = [...new Set(rows.map((r) => r.sku))].filter((s) => !known.has(s));
    return unknown.length ? ` 상품 마스터에 없는 SKU ${unknown.length}개(${unknown.slice(0, 3).join(', ')})는 우리 판매 실적과 연결되지 않습니다.` : '';
  }

  function applyImport(kind, rows, mode) {
    const d = MD.data;
    if (kind === 'ads') return importAds(rows, mode);
    if (kind === 'compete') return importCompete(rows, mode);
    if (kind === 'sales' || kind === 'traffic') {
      MD.store.ensureReal();
      const D = MD.data;
      // 기본값은 열 자체가 비어 있을 때만 채운다 (잘못된 값은 mapRows에서 이미 제외됨)
      // 값이 실제로 있었는지(확인됨)와 기본값으로 채웠는지를 남긴다 — 목표 판정은 확인된 값만 쓴다
      if (kind === 'sales') rows.forEach((r) => { if (r.qty == null) r.qty = 1; r.ordSrc = r.orders == null ? 'qty' : 'file'; if (r.orders == null) r.orders = r.qty; if (r.discount == null) r.discount = 0; });
      if (kind === 'traffic') rows.forEach((r) => { r.vOk = r.visits != null; r.adOk = r.ad != null; r.ordOk = r.orders != null; if (r.visits == null) r.visits = 0; if (r.ad == null) r.ad = 0; if (r.orders == null) delete r.orders; });
      // 한 파일 안의 같은 일자·채널(·SKU) 행은 먼저 합산한다 (주문 단위 내역이 여러 줄인 경우).
      // 그다음 교체는 그대로 저장, 추가·갱신은 같은 키의 기존 값을 이 합계로 덮어쓴다 — 같은 파일을 어느 방식으로 다시 올려도 결과가 같다.
      const key = kind === 'sales' ? (r) => r.date + '|' + r.channel + '|' + r.sku : (r) => r.date + '|' + r.channel;
      const sumKeys = kind === 'sales' ? ['qty', 'sales', 'discount', 'orders'] : ['visits', 'ad'];
      const agg = new Map();
      for (const r of rows) {
        const k = key(r), prev = agg.get(k);
        if (!prev) agg.set(k, { ...r });
        else {
          sumKeys.forEach((f) => (prev[f] += r[f]));
          // 합친 행 중 하나라도 기본값으로 채운 값이 있으면 합계도 '확인 안 됨'
          if (kind === 'sales' && r.ordSrc === 'qty') prev.ordSrc = 'qty';
          if (kind === 'traffic') {
            prev.vOk = prev.vOk && r.vOk; prev.adOk = prev.adOk && r.adOk; prev.ordOk = prev.ordOk && r.ordOk;
            prev.orders = prev.ordOk ? (prev.orders || 0) + (r.orders || 0) : undefined;
            if (!prev.ordOk) delete prev.orders;
          }
        }
      }
      const merged = rows.length - agg.size;
      rows = [...agg.values()];
      if (mode === 'replace') D[kind] = rows;
      else {
        const m = new Map(D[kind].map((r) => [key(r), r]));
        rows.forEach((r) => m.set(key(r), r));
        D[kind] = [...m.values()];
      }
      const mergedNote = merged ? ` 같은 ${kind === 'sales' ? '일자·채널·SKU' : '일자·채널'} 행 ${merged}개를 합산했습니다.` : '';
      // 마스터에 없는 채널·상품은 자동 등록 (수수료·원가는 0이므로 입력 필요)
      const chs = new Set(D.channels.map((c) => c.name)), sks = new Set(D.products.map((p) => p.sku));
      const newCh = [...new Set(rows.map((r) => r.channel))].filter((c) => c && !chs.has(c));
      newCh.forEach((c) => D.channels.push({ name: c, type: '', fee: 0, target: 0 }));
      const newSku = kind === 'sales' ? [...new Set(rows.map((r) => r.sku))].filter((s) => s && !sks.has(s)) : [];
      newSku.forEach((s) => D.products.push({ sku: s, name: s, brand: '', category: '미분류', season: '', price: 0, cost: 0, stock: 0 }));
      MD.store.save();
      return mergedNote + ' 새 자료는 [자료 마감 확인]에서 확인일을 찍어야 목표 판정에 쓰입니다.' + ((newCh.length || newSku.length) ? ` 새 채널 ${newCh.length}개·상품 ${newSku.length}개를 자동 등록했습니다. 수수료율·원가를 아래에서 입력해야 이익이 계산됩니다.` : '');
    }
    const key = kind === 'products' ? 'sku' : 'name';
    if (d.isSample) MD.store.ensureReal();
    const D = MD.data;
    // 빈 칸은 기존 값을 유지하고, 새 항목이면 0·빈 문자열로 시작한다
    const base = kind === 'products' ? { name: '', brand: '', category: '미분류', season: '', price: 0, cost: 0, stock: 0 } : { type: '', fee: 0, target: 0 };
    // 같은 키가 파일에 여러 번 있으면 교체·추가 모두 뒤 행으로 합친다 — 교체에서 중복이 남으면 채널 목표가 두 번 더해진다 (Codex 기능 K R1-02)
    const m = new Map(mode === 'replace' ? [] : D[kind].map((r) => [r[key], r]));
    rows.forEach((r) => m.set(r[key], { ...base, ...(m.get(r[key]) || {}), ...r }));
    D[kind] = [...m.values()];
    MD.store.save();
    return '';
  }

  // ---------- 가져오기 전 확인 (로드맵 1순위, Codex 합의 2026-10-31) ----------
  // 파일을 고르면 바로 반영하지 않고, 열 이름 행·열 매핑·반영 결과 미리보기를 보여 준 뒤 [반영하기]에서만 저장한다.
  const KEYF = {
    sales: [(r) => r.date + '|' + r.channel + '|' + r.sku, '일자·채널·SKU'],
    traffic: [(r) => r.date + '|' + r.channel, '일자·채널'],
    ads: [(r) => r.date + '|' + r.channel + '|' + (r.campaign || ''), '일자·채널·캠페인'],
    compete: [(r) => [r.date, r.sku, r.rival, r.channel || ''].join('|'), '조사일·SKU·경쟁상품·채널'],
    products: [(r) => r.sku, 'SKU'],
    channels: [(r) => r.name, '채널명'],
  };
  const SUMS = { sales: ['sales', 'qty'], traffic: ['visits', 'ad'], ads: ['spend', 'revenue'] };
  const SUM_LABEL = { sales: '매출 합계', qty: '수량', visits: '방문', ad: '광고비', spend: '광고비', revenue: '광고 매출' };
  const MONEY = ['sales', 'ad', 'spend', 'revenue'];

  // 첫 10행 안에서 필수 열이 모두 맞는 첫 행을 열 이름 행으로 (플랫폼 내려받기 파일은 위에 제목·조회 조건 줄이 있는 경우가 많다)
  function detectHeader(spec, grid) {
    let best = 0, bestScore = -1;
    for (let i = 0; i < Math.min(10, grid.length); i++) {
      const m = autoMap(spec, grid[i]);
      if (spec.required.every((k) => m[k])) return i;
      const score = spec.required.filter((k) => m[k]).length * 100 + Object.keys(m).length;
      if (score > bestScore) { bestScore = score; best = i; }
    }
    return best;
  }
  // 열 이름 행 h 아래를 행 객체로. 빈 줄은 건너뛰되 원본 파일 행 번호는 유지한다.
  // 같은 이름의 열이 여럿이면 뒤 열이 앞 열 값을 덮어쓰므로, 그 열들은 '이름 [C열]'처럼 위치를 붙여 구분한다 —
  // 별칭과 달라져 자동 매핑되지 않으므로 사용자가 쓸 열을 직접 고른다 (Codex 기능 K R1-03)
  const colName = (j) => { let s = ''; for (j += 1; j > 0; j = Math.floor((j - 1) / 26)) s = String.fromCharCode(65 + ((j - 1) % 26)) + s; return s; };
  function gridRows(sheet, h) {
    const grid = sheet.grid, raw = grid[h] || [], rows = [], rowNums = [];
    const count = {}; raw.forEach((c) => { if (c) count[c] = (count[c] || 0) + 1; });
    const head = raw.map((c, j) => (c && count[c] > 1 ? `${c} [${colName(j)}열]` : c));
    const dup = Object.keys(count).filter((c) => count[c] > 1);
    for (let i = h + 1; i < grid.length; i++) {
      if (!grid[i].some((v) => v !== '')) continue;
      const o = {};
      head.forEach((c, j) => { if (c) o[c] = grid[i][j] ?? ''; });
      rows.push(o); rowNums.push((sheet.start || 0) + i + 1);
    }
    return { head: head.filter(Boolean), rows, rowNums, dup };
  }
  // 반영하면 어떻게 되는지: 기간·채널·SKU·합계, 같은 키 기준으로 덮어쓸/새로 생길/지워질 행. known = 같은 통합 파일에서 함께 들어오는 채널·상품
  function previewStats(kind, rows, mode, known = {}) {
    const d = MD.data, real = !d.isSample, [keyOf, keyLabel] = KEYF[kind];
    const uniq = (f) => [...new Set(rows.map(f).filter((v) => v != null && v !== ''))];
    const dates = uniq((r) => r.date).sort();
    const chNames = new Set([...(real ? d.channels.map((c) => c.name) : []), ...(known.channels || [])]);
    const skuSet = new Set([...(real ? d.products.map((p) => p.sku) : []), ...(known.products || [])]);
    const chs = kind === 'channels' ? uniq((r) => r.name) : kind === 'products' ? [] : uniq((r) => r.channel);
    const skus = ['sales', 'compete', 'products'].includes(kind) ? uniq((r) => r.sku) : [];
    const keys = new Set(rows.map(keyOf));
    const existing = real ? d[kind] : [];
    const existKeys = new Set(existing.map(keyOf));
    const overwrite = [...keys].filter((k) => existKeys.has(k)).length;
    return {
      period: dates.length ? [dates[0], dates[dates.length - 1]] : null,
      chs, newCh: chs.filter((c) => !chNames.has(c)), skus, newSku: skus.filter((s) => !skuSet.has(s)),
      sums: (SUMS[kind] || []).map((f) => ({ f, label: SUM_LABEL[f], v: rows.reduce((a, r) => a + (r[f] || 0), 0), n: rows.filter((r) => r[f] != null).length })).filter((s) => s.n > 0), // 열이 없는 항목은 합계를 보이지 않음
      keyLabel, distinct: keys.size, merged: rows.length - keys.size,
      effect: mode === 'replace' ? `기존 ${U.num(existing.length)}행을 지우고 ${U.num(keys.size)}건으로 교체` : `같은 ${keyLabel} 기준: 기존 ${U.num(overwrite)}건을 새 값으로 바꾸고 ${U.num(keys.size - overwrite)}건을 새로 추가`,
    };
  }
  function statsHtml(kind, st, res) {
    const fmt = (s) => (MONEY.includes(s.f) ? U.won(s.v) : U.num(s.v)) + (s.n < res.rows.length ? ` <span class="muted" style="font-size:11px">(${U.num(s.n)}행만 값 있음)</span>` : '');
    const list = (a) => U.esc(a.slice(0, 8).join(', ')) + (a.length > 8 ? ` 외 ${a.length - 8}개` : '');
    return `<div class="result-grid" style="margin:10px 0">
        <div><div class="k">반영할 행</div><div class="v">${U.num(res.rows.length)}</div>${res.bad ? `<div class="muted" style="font-size:12px;color:var(--bad)">제외 ${U.num(res.bad)}행</div>` : ''}</div>
        ${st.period ? `<div><div class="k">기간</div><div class="v" style="font-size:14px">${st.period[0]} ~ ${st.period[1]}</div></div>` : ''}
        ${kind !== 'products' ? `<div><div class="k">채널</div><div class="v">${st.chs.length}</div>${st.newCh.length ? `<div class="muted" style="font-size:12px">새 채널 ${st.newCh.length}</div>` : ''}</div>` : ''}
        ${st.skus.length ? `<div><div class="k">SKU</div><div class="v">${U.num(st.skus.length)}</div>${st.newSku.length ? `<div class="muted" style="font-size:12px">새 상품 ${U.num(st.newSku.length)}</div>` : ''}</div>` : ''}
        ${st.sums.map((s) => `<div><div class="k">${s.label}</div><div class="v" style="font-size:15px">${fmt(s)}</div></div>`).join('')}
      </div>
      <div class="note" style="margin:0">${st.effect}.${st.merged ? ` 파일 안에서 같은 ${st.keyLabel} 행 ${U.num(st.merged)}개는 합산(경쟁·마스터는 마지막 행)합니다.` : ''}
        ${st.newCh.length ? `<br>새 채널: ${list(st.newCh)}${kind === 'sales' || kind === 'traffic' ? ' — 자동 등록되며 수수료율·목표를 따로 입력해야 합니다.' : kind === 'channels' ? '' : ' — 채널 목록에 없어 채널별 판정에서 빠집니다.'}` : ''}
        ${st.newSku.length ? `<br>새 상품: ${list(st.newSku)}${kind === 'sales' ? ' — 자동 등록되며 원가를 입력해야 이익이 계산됩니다.' : kind === 'compete' ? ' — 상품 마스터에 없어 우리 실적과 연결되지 않습니다.' : ''}` : ''}</div>
      ${res.bad ? `<div class="note" style="margin:6px 0 0;color:var(--bad)">제외 사유: ${Object.entries(res.reasons).map(([r, n]) => `${U.esc(r)} ${U.num(n)}`).join(', ')} · 예: ${res.samples.slice(0, 5).map((x) => `${x.row}행 ${U.esc(x.why)}`).join(', ')}${res.bad > 5 ? ' …' : ''}</div>` : ''}`;
  }
  // 백업 복원 전 형식 검사: 자료 종류별로 배열(마감 확인은 객체)인지, 계산에 꼭 필요한 칸이 있는지. 문제 목록을 돌려준다
  const isObj = (v) => v != null && typeof v === 'object' && !Array.isArray(v);
  // 모양뿐 아니라 달력에 있는 날짜인지(2026-02-31·2026-99-99 거부) — 업로드와 같은 U.normDate 기준 (Codex 기능 K R3-02)
  const okDate = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && U.normDate(v) === v;
  const okText = (v) => typeof v === 'string' && v.trim() !== '';
  const okNum = (v) => typeof v === 'number' && Number.isFinite(v);
  // 행 규칙: 문제가 있으면 사유 문자열, 없으면 null. 계산에 꼭 필요한 값은 형식까지 검사하고(Codex 기능 K R2-01),
  // 빠져 있어도 되는 숫자는 가져오기와 같은 기본값으로 채운다(fill) — 예전 백업과의 호환. 값이 있는데 숫자가 아니면 거부
  const optNum = (r, keys) => keys.find((k) => r[k] != null && r[k] !== '' && !okNum(r[k]));
  const fill = (r, defs) => { for (const [k, v] of Object.entries(defs)) if (r[k] == null || r[k] === '') r[k] = typeof v === 'function' ? v(r) : v; };
  const okDateOrEmpty = (v) => v == null || v === '' || okDate(v);
  const ROW_RULES = {
    sales: (r) => {
      if (!okDate(r.date)) return '날짜'; if (!okText(r.channel)) return '채널'; if (!okText(r.sku)) return 'SKU'; if (!okNum(r.sales)) return '매출';
      const n = optNum(r, ['qty', 'orders', 'discount']); if (n) return n;
      if (r.orders == null && r.ordSrc == null) r.ordSrc = 'qty'; // 주문 수를 수량으로 채운 표시(가져오기와 같음)
      fill(r, { qty: 1, orders: (x) => x.qty, discount: 0 });
      return null;
    },
    traffic: (r) => {
      if (!okDate(r.date)) return '날짜'; if (!okText(r.channel)) return '채널';
      const n = optNum(r, ['visits', 'ad', 'orders']); if (n) return n;
      if (r.vOk == null) r.vOk = r.visits != null; if (r.adOk == null) r.adOk = r.ad != null; if (r.ordOk == null) r.ordOk = r.orders != null;
      fill(r, { visits: 0, ad: 0 });
      return null;
    },
    ads: (r) => {
      if (!okDate(r.date)) return '날짜'; if (!okText(r.channel)) return '채널'; if (!okNum(r.spend)) return '광고비';
      const n = optNum(r, ['revenue', 'imp', 'clicks', 'conv']); if (n) return n;
      if (r.miss != null && !Array.isArray(r.miss)) return 'miss';
      // 업로드(importAds)와 같이 값이 없는 선택 항목은 miss로 남겨 ROAS 등에서 그 행을 뺀다 (Codex 기능 K R4-01)
      const miss = [...new Set([...(r.miss || []), ...['revenue', 'imp', 'clicks', 'conv'].filter((f) => r[f] == null)])];
      if (miss.length) r.miss = miss; else delete r.miss;
      return null;
    },
    compete: (r) => (!okDate(r.date) ? '조사일' : !okText(r.sku) ? 'SKU' : !okText(r.rival) ? '경쟁상품' : !okNum(r.price) ? '경쟁가' : optNum(r, ['ourPrice', 'rank', 'reviews', 'rating']) || null),
    channels: (r) => { if (!okText(r.name)) return '채널명'; const n = optNum(r, ['fee', 'target']); if (n) return n; fill(r, { fee: 0, target: 0 }); return null; },
    products: (r) => { if (!okText(r.sku)) return 'SKU'; const n = optNum(r, ['price', 'cost', 'stock']); if (n) return n; fill(r, { price: 0, cost: 0, stock: 0, name: (x) => x.sku }); return null; },
    targets: (r) => (typeof r.month !== 'string' || !/^\d{4}-\d{2}$/.test(r.month) ? '월' : optNum(r, ['sales', 'roas', 'cvr', 'adBudget', 'margin']) || null),
    promotions: (r) => {
      if (!okText(r.name)) return '행사명'; if (!okText(r.channel)) return '채널'; if (!okDate(r.start)) return '시작일'; if (!okDate(r.end)) return '종료일';
      if (r.end < r.start) return '기간(종료일이 시작일보다 앞)';
      if (r.categories != null && !Array.isArray(r.categories)) return '카테고리';
      const n = optNum(r, ['discount', 'budget']); if (n) return n;
      fill(r, { discount: 0, budget: 0 });
      return null;
    },
    pos: (r) => (!okText(r.sku) ? 'SKU' : !okNum(r.qty) ? '수량' : !okDateOrEmpty(r.ordered) ? '발주일' : !okDateOrEmpty(r.eta) ? '입고 예정일' : optNum(r, ['received']) || (fill(r, { received: 0 }), null)),
    vendors: (r) => (!okText(r.name) ? '거래처명' : !okDateOrEmpty(r.last) ? '최근 접촉일' : !okDateOrEmpty(r.due) ? '다음 기한' : !okDateOrEmpty(r.contractEnd) ? '계약 종료일' : null),
    candidates: (r) => (!okText(r.name) ? '후보명' : optNum(r, ['popularity', 'lastYearQty', 'outlook', 'margin', 'moq']) || null),
    events: (r) => (!okDate(r.date) ? '날짜' : !okDateOrEmpty(r.end) ? '종료일' : !okText(r.title) ? '내용' : (fill(r, { end: (x) => x.date }), null)),
    reports: (r) => (!okText(r.id) ? 'id' : !okText(r.at) ? '저장 시각' : !okDate(r.start) || !okDate(r.end) ? '보고 기간' : typeof r.html !== 'string' ? '본문' : r.notes != null && (!Array.isArray(r.notes) || r.notes.some((n) => !isObj(n) || !okText(n.at) || isNaN(Date.parse(n.at)) || !okText(n.text))) ? '수정 문구' : null),
  };
  const BACKUP_NUMS = [...NUMS, 'received', 'popularity', 'lastYearQty', 'outlook', 'margin', 'moq', 'roas', 'cvr', 'adBudget', 'budget'];
  function checkBackup(j) {
    const out = [];
    for (const k of ['channels', 'products', 'sales', 'traffic', 'promotions', 'vendors', 'pos', 'candidates', 'targets', 'ads', 'compete', 'events', 'reports']) {
      const v = j[k];
      if (v === undefined && k !== 'sales') continue;
      if (!Array.isArray(v)) { out.push(`${k}: 목록 형식 아님`); continue; }
      const rule = ROW_RULES[k];
      for (let i = 0; i < v.length && out.length < 20; i++) {
        if (!isObj(v[i])) { out.push(`${k} ${i + 1}번째: 행 형식 아님`); continue; }
        // 숫자 칸의 빈 문자열은 '값 없음'으로 바꾼다 — 그대로 두면 합계가 문자열 이어 붙이기가 된다 (Codex 기능 K R4-01)
        for (const f of BACKUP_NUMS) if (v[i][f] === '') delete v[i][f];
        const why = rule && rule(v[i]);
        if (why) out.push(`${k} ${i + 1}번째: ${why} 값 오류`);
      }
    }
    if (j.closes !== undefined && (!isObj(j.closes) || Object.values(j.closes).some((c) => c != null && !isObj(c)))) out.push('closes: 형식 아님');
    // 마스터의 같은 키는 업로드 전체 교체와 같은 규칙(뒤 행 우선으로 합침)으로 하나로 — 중복 채널은 전사 목표를 이중 집계한다 (Codex 기능 K R3-01)
    if (!out.length) for (const [k, key] of [['channels', 'name'], ['products', 'sku']]) {
      if (!Array.isArray(j[k])) continue;
      const m = new Map();
      j[k].forEach((r) => m.set(r[key], { ...(m.get(r[key]) || {}), ...r }));
      j[k] = [...m.values()];
    }
    return out;
  }
  // 후보 자료로 계산을 한 번 돌려 본다: 화면 색인, 전체 요약(숫자가 NaN이면 거부), 행사 성과
  function trialBackup(cand) {
    MD.data = cand;
    MD.buildIndex();
    const sum = MD.calc.summarize(cand.sales, cand.traffic, cand.ads);
    const nan = Object.entries(sum).filter(([, v]) => (typeof v === 'number' && Number.isNaN(v)) || typeof v === 'string').map(([k]) => k); // 문자열 합계도 오류
    if (nan.length) throw new Error(`요약 계산 값 오류(${nan.slice(0, 4).join(', ')})`);
    if (MD.promoResult) cand.promotions.forEach((p) => MD.promoResult(p));
  }
  const headSig = (head) => head.join('|');
  const savedMap = (kind, head) => ((U.store.get('importMaps', {})[kind] || {})[headSig(head)] || {});
  function rememberMap(kind, head, override) {
    const all = U.store.get('importMaps', {}), mine = all[kind] || {};
    if (Object.keys(override).length) mine[headSig(head)] = override; else delete mine[headSig(head)];
    all[kind] = mine;
    U.store.set('importMaps', all); // 다음에 같은 열 구성 파일을 올리면 같은 지정을 쓴다 (백업 extras에 포함)
  }

  // 계산 기준 표 (데이터 관리·보고서 공용)
  function basisTable(lines) {
    return `<table><thead><tr><th>항목</th><th>기준</th><th>이 기간 자료 상태</th></tr></thead><tbody>${lines.map((l) => `<tr><td>${U.esc(l.item)}</td><td>${U.esc(l.rule)}</td><td class="${l.warn ? '' : 'muted'}" style="${l.warn ? 'color:var(--warn)' : ''}">${U.esc(l.fact || '-')}</td></tr>`).join('')}</tbody></table>`;
  }
  MD.basisTable = basisTable;
  MD.SPECS = SPECS;
  MD.downloadUnifiedTemplate = () => downloadUnified();
  const ORDER = ['channels', 'products', 'sales', 'traffic', 'ads', 'compete'];
  function downloadUnified() {
    const guide = [
      { 시트: '안내', 설명: '이 파일 하나에 모든 자료를 시트별로 넣어 [데이터 관리 → 통합 양식 올리기]로 한 번에 올릴 수 있습니다. 쓰지 않는 시트는 지우거나 비워 두세요.' },
      { 시트: '공통 규칙', 설명: '첫 행은 열 이름. 날짜는 2026-10-01 형식 권장(2026.10.1, 20261001도 인식). 금액의 쉼표·원 표시는 자동 제거. 매출은 VAT 포함 실결제액.' },
      ...ORDER.map((k) => ({ 시트: SPECS[k].label, 설명: `${SPECS[k].desc} / 필수 열: ${SPECS[k].required.map((r) => SPECS[k].cols[r][0]).join(', ')} / 인식하는 열 이름: ${Object.values(SPECS[k].cols).map((a) => a.slice(0, 3).join('·')).join(' | ')}` })),
    ];
    U.exportXlsx('MD워크툴_통합양식.xlsx', { 안내: guide, ...Object.fromEntries(ORDER.map((k) => [SPECS[k].label, SPECS[k].example])) });
  }
  // 처음 사용 체크리스트. 값이 0이라고 무조건 미완료로 보지 않고 '확인 필요'로 표시한다 (수수료 0%인 채널도 있을 수 있음)
  MD.setupItems = function () {
    const d = MD.data, U2 = U;
    if (d.isSample) return [];
    const m = (d.maxDate || U2.today()).slice(0, 7);
    const sold = new Set(d.sales.map((r) => r.sku));
    const noFee = d.channels.filter((c) => !(Number(c.fee) > 0));
    const noCost = d.products.filter((p) => sold.has(p.sku) && !(Number(p.cost) > 0));
    const noTarget = d.channels.filter((c) => MD.calc.targetInfo(c.name, m).source === 'none');
    return [
      { done: d.sales.length > 0, text: '판매 자료 올리기', href: '#data' },
      { done: d.traffic.length > 0, text: '유입·광고비 자료 올리기 (전환율·ROAS에 필요)', href: '#data' },
      { done: d.channels.length > 0 && !noFee.length, text: noFee.length ? `수수료율 0%인 채널 ${noFee.length}개 확인 (${noFee.slice(0, 3).map((c) => c.name).join(', ')})` : '채널 수수료율 입력', href: '#data' },
      { done: !noCost.length && d.products.length > 0, text: noCost.length ? `판매가 있는데 원가가 0인 상품 ${noCost.length}개 입력 (이익이 부풀려짐)` : '상품 원가 입력', href: '#data' },
      { done: d.channels.length > 0 && !noTarget.length, text: noTarget.length ? `${Number(m.slice(5))}월 매출 목표 없는 채널 ${noTarget.length}개` : '월 매출 목표 설정', href: '#goals' },
      (() => { const a = MD.calc.salesAsOf(); return { done: d.sales.length > 0 && a.confirmed, text: a.unconfirmed.length ? `판매 자료 마감 확인 안 된 채널 ${a.unconfirmed.length}개 (목표 기준일이 자료 마지막 날로 잡힘)` : '자료 마감 확인', href: '#data' }; })(),
    ];
  };
  MD.setupBanner = function () {
    const items = MD.setupItems(), open = items.filter((x) => !x.done);
    if (!open.length) return '';
    return `<div class="card" style="margin-bottom:16px"><div class="card-head"><h2>설정 확인 ${items.length - open.length}/${items.length}</h2><span class="muted">끝내면 이 안내는 사라집니다</span></div>
      <ul class="checklist">${items.map((x) => `<li class="${x.done ? 'done' : ''}">${x.done ? U.esc(x.text) : `<a href="${x.href}">${U.esc(x.text)}</a>`}</li>`).join('')}</ul></div>`;
  };

  MD.views.data = function (el) {
    const d = MD.data;
    const intr = MD.store.interrupted;
    el.innerHTML = `${intr ? `<div class="card" style="border-color:var(--bad);margin-bottom:16px"><div class="card-head"><h2>지난 저장이 중간에 끝나지 못했습니다</h2></div>
        <p style="margin-top:0">${U.esc(intr.at.slice(0, 16).replace('T', ' '))}(UTC) 저장 중 일부 자료를 되돌리지 못했습니다. 다음 자료가 서로 다른 시점의 값일 수 있습니다: <b>${intr.keys.map(U.esc).join(', ')}</b>. 최근 백업 파일이 있으면 아래 '백업 복원'으로 되돌리는 것이 가장 안전합니다. 화면의 자료가 맞는지 확인했다면 '이대로 사용'을 누르세요(현재 자료 전체를 다시 저장).</p>
        <div class="row"><button class="btn danger" id="intrOk">확인했고 이대로 사용</button></div></div>` : ''}${MD.setupBanner()}
      <div class="card">
        <div class="card-head"><h2>현재 데이터</h2><span class="badge ${d.isSample ? '' : 'real'}">${d.isSample ? '예시 데이터 사용 중' : '내 데이터'}</span></div>
        <div class="result-grid">
          <div><div class="k">판매 행</div><div class="v">${U.num(d.sales.length)}</div></div>
          <div><div class="k">기간</div><div class="v" style="font-size:14px">${d.minDate || '-'} ~ ${d.maxDate || '-'}</div></div>
          <div><div class="k">채널</div><div class="v">${d.channels.length}</div></div>
          <div><div class="k">상품</div><div class="v">${d.products.length}</div></div>
          <div><div class="k">행사·거래처·발주</div><div class="v">${d.promotions.length} · ${d.vendors.length} · ${d.pos.length}</div></div>
        </div>
        <p class="note">데이터는 이 브라우저에만 저장되며 외부로 전송되지 않습니다. 다른 PC로 옮기거나 보관하려면 백업 파일을 내려받으세요.${d.isSample ? ' 판매·유입 데이터를 처음 올리면 예시 데이터는 비워지고 내 데이터로 바뀝니다. 아래 표에서 직접 고친 채널·상품만 남고, 행사·거래처·발주 예시는 지워집니다.' : ''} 추가·갱신 업로드는 같은 일자·채널(·SKU)의 기존 값을 새 파일의 합계로 바꿉니다(더하지 않음).</p>
        <div class="row">
          <button class="btn" id="bk">백업 파일 받기 (.json)</button>
          <label class="btn">백업 복원<input type="file" id="rs" accept=".json" class="hide"></label>
          <span class="spacer"></span>
          <button class="btn" id="toSample">예시 데이터로 되돌리기</button>
          <button class="btn danger" id="toEmpty">빈 상태로 시작</button>
        </div>
      </div>

      <div class="card">
        <div class="card-head"><h2>파일 올리기</h2><span class="muted">CSV 또는 엑셀(.xlsx) · 고르면 반영 전에 확인 화면이 나옵니다(열 이름 행·열 매핑 자동 인식, 직접 수정 가능)</span></div>
        <div class="drop" style="text-align:left;margin-bottom:12px">
          <div class="row"><b>통합 양식 (한 파일에 모든 자료)</b><span class="spacer"></span><button class="btn small" id="uniTpl">통합 양식 받기 (.xlsx)</button></div>
          <div class="muted" style="font-size:12px;margin:4px 0 8px">시트 이름으로 종류를 구분합니다(채널 → 상품 마스터 → 판매 → 유입 → 광고 → 경쟁 순서로 반영). 아래 개별 양식과 열 이름이 같습니다. 월초에는 이 파일 하나로 올리는 것을 권합니다.</div>
          <div class="row"><select id="uniMode"><option value="merge">추가·갱신</option><option value="replace">전체 교체</option></select><input type="file" accept=".xlsx,.xls" id="uniUp" style="max-width:100%"></div>
        </div>
        <div class="grid g2">${Object.entries(SPECS).map(([k, s]) => `
          <div class="drop" data-k="${k}" style="text-align:left">
            <div class="row"><b>${s.label}</b><span class="spacer"></span><button class="btn small" data-tpl="${k}">양식 받기</button></div>
            <div class="muted" style="font-size:12px;margin:4px 0 8px">${s.desc}<br>열: ${Object.values(s.cols).map((a) => a[0]).join(', ')} (필수: ${s.required.map((r) => s.cols[r][0]).join(', ')})</div>
            <div class="row"><select data-mode="${k}"><option value="merge">추가·갱신</option><option value="replace">전체 교체</option></select><input type="file" accept=".csv,.xlsx,.xls" data-up="${k}" style="max-width:100%"></div>
          </div>`).join('')}</div>
        <div id="upMsg" class="note"></div>
      </div>
      <div id="pvBox"></div>

      <div class="card"><div class="card-head"><h2>저장 상태</h2><span class="muted">이 브라우저에 저장된 양 — 브라우저마다 한도가 다르며 Edge에서는 수백만 자 수준에서 저장 실패가 기록된 적이 있습니다</span></div>
        <div id="usageT"></div>
        <div class="note">저장에 실패하면 화면 위쪽에 '저장 안 됨' 표시가 남습니다. 그때는 백업 파일을 받아 두고, 오래된 자료를 정리하거나 다른 브라우저로 옮기세요. 백업 파일에는 업무 자료와 보고서 작성자·기간별 액션 문구·기준값이 함께 들어갑니다.</div></div>

      <div class="card" id="closeCard"><div class="card-head"><h2>자료 마감 확인</h2><span class="muted">채널별로 "이 날까지 자료가 다 들어왔다"고 확인한 날. 목표·KPI 판정은 확인일까지만 합니다.</span>
        <button class="btn small" id="closeAll">모든 칸을 자료 마지막 날로 확인</button></div>
        <div id="closeT"></div>
        <div class="note">마지막 날 = 그 채널 자료에 행이 있는 마지막 날. 판매가 없는 날은 행이 없을 수 있어, 확인일은 행이 없어도 그 이후로 정할 수 있습니다(그 사이는 실적 0으로 봅니다). 비워 두면 '미확인'으로 판정을 보류하거나 경고합니다.</div></div>

      <div class="card"><div class="card-head"><h2>분석 기준값</h2></div>
        <div class="row end">
          <label class="field">광고 ROAS 경고 기준(%)<input type="number" id="roasMin" value="${Math.round(MD.settings.roasMin * 100)}" style="width:100px"></label>
          <label class="field">재고 경고 기준(일)<input type="number" id="coverDays" value="${MD.settings.coverDays}" style="width:100px"></label>
        </div>
      </div>

      <div class="card"><div class="card-head"><h2>계산 기준</h2><span class="muted">보고서와 확정본에 함께 남습니다. 아래 상태는 지금 선택한 기간 기준</span></div>
        <div class="row end">
          <label class="field">판매 자료의 취소·반품<select id="bReturns"><option value="">확인 안 됨</option><option value="net">취소·반품을 뺀 금액(순결제)</option><option value="gross">빼기 전 금액</option></select></label>
          <label class="field">공헌이익에 뺄 광고비<select id="bAdSrc"><option value="traffic">유입 파일의 광고비</option><option value="ads">광고 리포트의 광고비</option></select></label>
        </div>
        <div id="basisT" style="margin-top:10px"></div></div>

      <div class="card"><div class="card-head"><h2>채널 (수수료율·월 목표)</h2><span class="muted">수수료율은 계약 조건에 맞게 수정. 예시 값은 실제 플랫폼 수수료가 아닙니다.</span></div><div id="chT"></div></div>
      <div class="card"><div class="card-head"><h2>상품 마스터</h2><button class="btn small" id="pX">엑셀로 받기</button></div><div id="pT"></div></div>`;

    // 저장 사용량: 행 수·저장된 글자 수·마지막 저장 결과 (고정 한도 대비 %는 브라우저마다 달라 쓰지 않는다)
    const usage = MD.store.KEYS.map((k) => { let n = 0; try { n = (localStorage.getItem('mdwt:' + k) || '').length; } catch (e) { /* 접근 불가 */ } const v = d[k]; return { k, rows: Array.isArray(v) ? v.length : v && typeof v === 'object' ? Object.keys(v).length : 0, chars: n }; });
    const LABEL = { channels: '채널', products: '상품', sales: '판매', traffic: '유입·광고비', promotions: '행사', vendors: '거래처', pos: '발주', candidates: '소싱 후보', targets: '목표', ads: '광고 리포트', closes: '마감 확인', compete: '경쟁 조사', events: '이슈 기록', reports: '보고서 확정본' };
    const idb = MD.store.backend() === 'IndexedDB';
    if (idb) usage.forEach((u) => { try { u.chars = JSON.stringify(d[u.k] ?? '').length; } catch (e) { /* 계산 불가 */ } }); // IndexedDB는 글자 수를 직접 볼 수 없어 직렬화 길이로
    const dataChars = usage.reduce((a, u) => a + u.chars, 0), ls = MD.store.lastSave;
    let allChars = 0; try { for (let i = 0; i < localStorage.length; i++) { const key = localStorage.key(i); if (key && key.startsWith('mdwt:')) allChars += (localStorage.getItem(key) || '').length; } } catch (e) { allChars = idb ? 0 : dataChars; }
    if (idb) allChars += dataChars; // IndexedDB면 localStorage에는 설정만 남는다 — 업무 자료(직렬화 길이)를 더해 합계로 (빼면 음수가 됨)
    el.querySelector('#usageT').innerHTML = `<div class="result-grid" style="margin-bottom:10px">
        <div><div class="k">이 앱 저장값 글자 수 합계</div><div class="v">${U.num(allChars)}자</div><div class="muted" style="font-size:12px">업무 자료 ${U.num(dataChars)} · 설정·기타(모드·보고서 문구 등) ${U.num(allChars - dataChars)}</div></div>
        <div><div class="k">마지막 저장</div><div class="v" style="font-size:15px;color:var(${!ls ? '--ink' : ls.ok ? '--good' : '--bad'})">${!ls ? '이번 접속에서 저장 없음' : `${ls.ok ? '성공' : '실패'} ${new Date(ls.at).toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })}`}</div></div>
        <div><div class="k">상태</div><div class="v" style="font-size:15px">${d.isSample ? '예시 데이터(판매 등은 저장 안 함)' : ls && !ls.ok ? '화면에만 반영 — 백업 필요' : '저장됨'}</div></div>
        <div><div class="k">저장 방식</div><div class="v" style="font-size:15px">${MD.store.backend()}</div><div class="muted" style="font-size:12px" id="quotaInfo">${MD.store.migration ? (MD.store.migration.ok ? `이전 완료: 판매 ${U.num(MD.store.migration.salesRows)}행 · ${U.won(MD.store.migration.salesSum)} 대조 일치` : `이전 실패(localStorage로 계속): ${U.esc(MD.store.migration.error)}`) : ''}</div></div></div>
      <div class="table-wrap"><table><thead><tr><th>자료</th><th class="num">행 수</th><th class="num">${idb ? '직렬화 글자 수' : '저장된 글자 수'}</th></tr></thead><tbody>${usage.filter((u) => u.rows || u.chars).sort((a, b) => b.chars - a.chars).map((u) => `<tr><td>${LABEL[u.k] || u.k}</td><td class="num">${U.num(u.rows)}</td><td class="num">${U.num(u.chars)}</td></tr>`).join('')}</tbody></table></div>`;

    // 이전을 끝내지 못해 localStorage에 IndexedDB와 다른 자료가 남았으면 복구·폐기를 고르게 한다 (Codex 기능 J R3-01)
    if (MD.store.legacy) {
      const box = document.createElement('div');
      box.className = 'note';
      box.style.cssText = 'border-left:3px solid var(--bad);padding-left:10px;margin-top:10px';
      box.innerHTML = `저장 방식 이전 중에 저장된 것으로 보이는 예전 자료(${MD.store.legacy.keys.map((k) => LABEL[k] || k).join(', ')})가 남아 있습니다. 지금 화면은 IndexedDB 자료입니다.
        <div class="row" style="margin-top:6px"><button class="btn small" id="lgRecover">남은 자료로 복구</button><button class="btn small" id="lgDiscard">남은 자료 버리기</button></div>`;
      el.querySelector('#usageT').appendChild(box);
      box.querySelector('#lgRecover').onclick = async () => {
        if (!confirm('남은 예전 자료로 해당 항목을 덮어씁니다. 먼저 [백업 받기]로 현재 자료를 받아 두셨나요?')) return;
        if (await MD.store.recoverLegacy()) { U.toast('남은 자료로 복구했습니다.'); MD.refresh(); }
      };
      box.querySelector('#lgDiscard').onclick = () => {
        if (!confirm('남은 예전 자료를 지웁니다. 되돌릴 수 없습니다.')) return;
        MD.store.discardLegacy(); MD.refresh();
      };
    }

    // IndexedDB면 브라우저가 알려 주는 이 사이트의 사용량·한도(추정치)를 덧붙인다
    if (idb && navigator.storage && navigator.storage.estimate) navigator.storage.estimate().then((q) => {
      const box = el.querySelector('#quotaInfo'); if (!box || !q) return;
      const mb = (n) => (n / 1048576).toFixed(1) + 'MB';
      box.textContent = `${box.textContent ? box.textContent + ' · ' : ''}브라우저 추정 사용 ${mb(q.usage || 0)} / 한도 ${mb(q.quota || 0)}`;
    }).catch(() => {});

    // 계산 기준: 선택과 현재 기간 자료 상태
    {
      const b = MD.calc.basis();
      el.querySelector('#bReturns').value = b.returns || '';
      el.querySelector('#bAdSrc').value = b.adSource;
      el.querySelector('#basisT').innerHTML = basisTable(MD.calc.basisLines(MD.current().cur));
      const setB = (patch) => { if (MD.calc.setBasis(patch)) { U.toast('계산 기준을 바꿨습니다. 모든 화면의 공헌이익·보고서에 적용됩니다.'); MD.rerender(); } else U.toast('계산 기준을 저장하지 못했습니다.', 'bad'); };
      el.querySelector('#bReturns').onchange = (e) => setB({ returns: e.target.value });
      el.querySelector('#bAdSrc').onchange = (e) => setB({ adSource: e.target.value });
    }

    // 자료 마감 확인 표
    const srcs = [['sales', '판매', d.sales], ['traffic', '유입·광고비', d.traffic], ['ads', '광고 리포트', d.ads]];
    const lastOf = (list, ch) => { let m = null; for (const r of list) if (r.channel === ch && (!m || r.date > m)) m = r.date; return m; };
    const chNames = [...new Set([...d.channels.map((c) => c.name), ...d.sales.map((r) => r.channel), ...d.traffic.map((r) => r.channel), ...d.ads.map((r) => r.channel)])];
    const known = new Set(d.channels.map((c) => c.name));
    const closeRows = chNames.map((ch) => ({ ch, last: Object.fromEntries(srcs.map(([k, , list]) => [k, lastOf(list, ch)])) }));
    el.querySelector('#closeT').innerHTML = d.isSample ? '<div class="muted">예시 데이터는 모든 채널이 자료 마지막 날까지 확인된 것으로 둡니다.</div>' : `<div class="table-wrap"><table><thead><tr><th>채널</th>${srcs.map(([, l]) => `<th>${l} 마지막 날 → 확인일</th>`).join('')}</tr></thead><tbody>
      ${closeRows.map((r) => `<tr><td>${U.esc(r.ch)}${known.has(r.ch) ? '' : ' <span class="tag warn">목록에 없음</span>'}</td>${srcs.map(([k]) => {
        const c = MD.calc.closeOf(r.ch, k), last = r.last[k];
        const tag = !last ? '' : !c ? '<span class="tag hold">미확인</span>' : c < last ? '<span class="tag warn">이후 자료 미확인</span>' : '<span class="tag good">확인</span>';
        return `<td><span class="muted" style="font-size:12px">${last || '자료 없음'}</span> → <input type="date" data-close="${k}" data-ch="${U.esc(r.ch)}" value="${c || ''}" style="width:140px"> ${tag}</td>`;
      }).join('')}</tr>`).join('') || `<tr><td colspan="4" class="muted">자료가 없습니다.</td></tr>`}</tbody></table></div>`;
    el.querySelectorAll('[data-close]').forEach((inp) => (inp.onchange = () => {
      const k = inp.dataset.close, ch = inp.dataset.ch, v = inp.value || null;
      const last = (closeRows.find((r) => r.ch === ch) || { last: {} }).last[k];
      if (v && last && v > last) U.toast(`${ch}: 자료 마지막 날(${last}) 이후를 확인했습니다. 그 사이 날짜는 실적 0으로 봅니다.`);
      MD.calc.setClose(ch, k, v); MD.store.save(['closes']);
      const y = window.scrollY; MD.rerender(); window.scrollTo(0, y); // 표 위치를 잃지 않게
    }));
    const ca = el.querySelector('#closeAll');
    if (d.isSample) ca.disabled = true;
    ca.onclick = () => {
      const n = closeRows.reduce((a, r) => a + srcs.filter(([k]) => r.last[k]).length, 0);
      if (!n || !confirm(`${n}칸을 각 자료의 마지막 날로 확인합니다. 실제로 그날까지 자료가 다 들어왔는지 확인하셨나요?`)) return;
      closeRows.forEach((r) => srcs.forEach(([k]) => { if (r.last[k]) MD.calc.setClose(r.ch, k, r.last[k]); }));
      MD.store.save(['closes']); const y = window.scrollY; MD.rerender(); window.scrollTo(0, y); U.toast('자료 마감을 확인했습니다.');
    };

    if (intr) el.querySelector('#intrOk').onclick = () => {
      if (!confirm('지금 화면의 자료를 기준으로 전체를 다시 저장합니다. 계속할까요?')) return;
      Promise.resolve(MD.store.acceptInterrupted()).then((ok) => { if (ok) { U.toast('현재 자료로 다시 저장했습니다.'); MD.refresh(); } });
    };
    el.querySelector('#uniTpl').onclick = downloadUnified;
    // 통합 양식: 시트별로 열 이름 행을 찾아 요약을 보여 주고, [반영하기]에서 채널 → 상품 → 판매 → 유입 → 광고 → 경쟁 순서로 반영
    const openUnified = async (f) => {
      const box = el.querySelector('#pvBox');
      let sheets;
      try { sheets = await U.readGrid(f); } catch (err) { el.querySelector('#upMsg').textContent = '실패: ' + err.message; U.toast('통합 양식 실패: ' + err.message, 'bad'); return; }
      const norm = (s) => String(s).replace(/[\s·]/g, '');
      let mode = el.querySelector('#uniMode').value;
      const draw = () => {
        const known = { channels: [], products: [] }, items = [];
        for (const k of ORDER) {
          const sh = sheets.find((x) => norm(x.name) === norm(SPECS[k].label));
          if (!sh) continue;
          const h = detectHeader(SPECS[k], sh.grid), g = gridRows(sh, h);
          if (!g.rows.length) continue;
          let res = null, err = null;
          try { res = mapRows(SPECS[k], g.rows, { headers: g.head, override: savedMap(k, g.head), rowNums: g.rowNums }); } catch (e) { err = e.message; }
          if (res && !res.rows.length) err = `반영할 행 없음 — 제외 ${res.bad}행: ${Object.entries(res.reasons).map(([r, n]) => `${r} ${n}`).join(', ')}`;
          const st = res && !err ? previewStats(k, res.rows, mode, known) : null;
          if (st && k === 'channels') known.channels.push(...res.rows.map((r) => r.name));
          if (st && k === 'products') known.products.push(...res.rows.map((r) => r.sku));
          items.push({ k, sh, h, res, err, st, dup: g.dup });
        }
        const unknown = sheets.filter((x) => x.name !== '안내' && !ORDER.some((k) => norm(SPECS[k].label) === norm(x.name))).map((x) => x.name);
        const ok = items.filter((x) => !x.err);
        box.innerHTML = `<div class="card" style="border-color:var(--accent)">
          <div class="card-head"><h2>가져오기 전 확인 — 통합 양식</h2><span class="muted">${U.esc(f.name)} · 아직 저장하지 않았습니다</span></div>
          ${MD.data.isSample ? '<div class="note" style="margin-top:0">반영하면 예시 데이터가 비워지고 내 데이터로 바뀝니다.</div>' : ''}
          <div class="row end"><label class="field">반영 방식<select id="pvMode"><option value="merge" ${mode === 'merge' ? 'selected' : ''}>추가·갱신</option><option value="replace" ${mode === 'replace' ? 'selected' : ''}>전체 교체(파일에 있는 시트 종류만)</option></select></label></div>
          ${items.map((x) => `<div style="border-top:1px solid var(--line);margin-top:12px;padding-top:10px">
            <b>${SPECS[x.k].label}</b> <span class="muted" style="font-size:12px">시트 '${U.esc(x.sh.name)}' · 열 이름 ${(x.sh.start || 0) + x.h + 1}행</span>
            ${x.dup.length ? `<div class="note" style="color:var(--warn);margin:4px 0 0">같은 이름의 열: ${U.esc(x.dup.join(', '))} — 이 열은 자동으로 쓰지 않습니다. 개별 업로드에서 쓸 열을 고르세요.</div>` : ''}
            ${x.err ? `<div class="note" style="color:var(--bad);margin:4px 0 0">건너뜀: ${U.esc(x.err)} — 열 이름이 다르면 이 시트를 개별 업로드로 올려 열을 직접 지정하세요.</div>` : statsHtml(x.k, x.st, x.res)}</div>`).join('') || '<div class="note">올릴 시트를 찾지 못했습니다.</div>'}
          ${unknown.length ? `<div class="note">모르는 시트(반영 안 함): ${U.esc(unknown.join(', '))}. 시트 이름을 ${ORDER.map((k) => SPECS[k].label).join(', ')} 중 하나로 맞추세요.</div>` : ''}
          <div class="row" style="margin-top:12px"><button class="btn primary" id="pvGo" ${ok.length ? '' : 'disabled'}>${ok.length}개 시트 반영하기</button><button class="btn" id="pvCancel">취소</button></div></div>`;
        box.querySelector('#pvMode').onchange = (e) => { mode = e.target.value; draw(); };
        box.querySelector('#pvCancel').onclick = () => { box.innerHTML = ''; };
        box.querySelector('#pvGo').onclick = async () => {
          if (mode === 'replace' && !confirm(`${ok.map((x) => SPECS[x.k].label).join(', ')}를 전부 교체합니다. 계속할까요?`)) return;
          const done = [], notes = [];
          for (const x of ok) {
            const extra = applyImport(x.k, x.res.rows, mode);
            done.push(`${SPECS[x.k].label} ${U.num(x.res.rows.length)}행${x.res.bad ? `(제외 ${x.res.bad})` : ''}`);
            if (extra) notes.push(extra.trim());
          }
          const skipped = items.filter((x) => x.err).map((x) => SPECS[x.k].label);
          await MD.store.saving;
          MD.refresh();
          if (!MD.store.lastSave || MD.store.lastSave.ok) U.toast(`통합 양식 반영·저장: ${done.length}개 시트`);
          else U.toast('통합 양식을 화면에 반영했지만 저장하지 못했습니다. 새로고침하면 사라지니 백업 파일을 받아 두세요.', 'bad');
          setTimeout(() => { const m = document.querySelector('#upMsg'); if (m) m.textContent = `반영: ${done.join(' / ')}${skipped.length ? ` · 건너뜀: ${skipped.join(', ')}` : ''} ${[...new Set(notes)].join(' ')}`; }, 50);
        };
      };
      draw();
      box.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };
    el.querySelector('#uniUp').onchange = (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) openUnified(f); };

    el.querySelectorAll('[data-tpl]').forEach((b) => (b.onclick = () => U.download(`양식_${SPECS[b.dataset.tpl].label}.csv`, U.toCSV(SPECS[b.dataset.tpl].example))));
    // 개별 업로드: 시트·열 이름 행·열 매핑을 고를 수 있는 확인 화면. 직접 지정한 매핑은 같은 열 구성이면 다음에도 쓴다
    const upload = async (k, f) => {
      const spec = SPECS[k], box = el.querySelector('#pvBox');
      let sheets;
      try { sheets = (await U.readGrid(f)).filter((s) => s.grid.some((r) => r.some((v) => v !== ''))); } catch (err) { el.querySelector('#upMsg').textContent = '실패: ' + err.message; U.toast('업로드 실패: ' + err.message, 'bad'); return; }
      if (!sheets.length) { el.querySelector('#upMsg').textContent = '실패: 빈 파일입니다.'; U.toast('업로드 실패: 빈 파일입니다.', 'bad'); return; }
      const norm = (s) => String(s).replace(/[\s·]/g, '');
      let si = Math.max(0, sheets.findIndex((s) => norm(s.name) === norm(spec.label)));
      let hi = detectHeader(spec, sheets[si].grid);
      let mode = el.querySelector(`[data-mode=${k}]`).value;
      let override = savedMap(k, gridRows(sheets[si], hi).head);
      const draw = () => {
        const sh = sheets[si], g = gridRows(sh, hi), auto = autoMap(spec, g.head);
        let res = null, err = null;
        if (!g.rows.length) err = '열 이름 행 아래에 자료가 없습니다.';
        else try { res = mapRows(spec, g.rows, { headers: g.head, override, rowNums: g.rowNums }); } catch (e) { err = e.message; }
        if (res && !res.rows.length) err = `반영할 수 있는 행이 없습니다 — 제외 ${res.bad}행: ${Object.entries(res.reasons).map(([r, n]) => `${r} ${n}`).join(', ')}`;
        const map = { ...auto }; for (const [f2, h] of Object.entries(override)) { if (h === '') delete map[f2]; else map[f2] = h; }
        const first = g.rows[0] || {};
        const headOpts = sh.grid.slice(0, 10).map((r, i) => (r.some((v) => v !== '') ? `<option value="${i}" ${i === hi ? 'selected' : ''}>${(sh.start || 0) + i + 1}행: ${U.esc(r.filter(Boolean).slice(0, 4).join(' · ').slice(0, 60))}</option>` : '')).join('');
        box.innerHTML = `<div class="card" style="border-color:var(--accent)">
          <div class="card-head"><h2>가져오기 전 확인 — ${spec.label}</h2><span class="muted">${U.esc(f.name)} · 아직 저장하지 않았습니다</span></div>
          ${MD.data.isSample && ['sales', 'traffic', 'ads', 'compete'].includes(k) ? '<div class="note" style="margin-top:0">반영하면 예시 데이터가 비워지고 내 데이터로 바뀝니다.</div>' : ''}
          <div class="row end">
            ${sheets.length > 1 ? `<label class="field">시트<select id="pvSheet">${sheets.map((s, i) => `<option value="${i}" ${i === si ? 'selected' : ''}>${U.esc(s.name)}</option>`).join('')}</select></label>` : ''}
            <label class="field">열 이름 행<select id="pvHead">${headOpts}</select></label>
            <label class="field">반영 방식<select id="pvMode"><option value="merge" ${mode === 'merge' ? 'selected' : ''}>추가·갱신</option><option value="replace" ${mode === 'replace' ? 'selected' : ''}>전체 교체</option></select></label>
          </div>
          <div class="table-wrap" style="margin-top:10px"><table><thead><tr><th>항목</th><th>파일의 열</th><th>첫 행 값</th></tr></thead><tbody>
            ${Object.entries(spec.cols).map(([f2, al]) => `<tr><td>${al[0]}${spec.required.includes(f2) ? ' <span class="tag bad">필수</span>' : ''}</td>
              <td><select data-f="${f2}"><option value="">(사용 안 함)</option>${g.head.map((h) => `<option ${map[f2] === h ? 'selected' : ''}>${U.esc(h)}</option>`).join('')}</select>${f2 in override ? ' <span class="muted" style="font-size:11px">직접 지정</span>' : map[f2] ? ' <span class="muted" style="font-size:11px">자동</span>' : ''}</td>
              <td class="muted">${map[f2] ? U.esc(String(first[map[f2]] ?? '').slice(0, 40)) : '-'}</td></tr>`).join('')}
          </tbody></table></div>
          ${g.dup.length ? `<div class="note" style="color:var(--warn)">같은 이름의 열이 여러 개 있습니다: ${U.esc(g.dup.join(', '))}. 위치([C열] 등)를 붙여 구분했으니 쓸 열을 직접 고르세요.</div>` : ''}
          ${err ? `<div class="note" style="color:var(--bad)">${U.esc(err)}</div>` : statsHtml(k, previewStats(k, res.rows, mode), res)}
          <div class="row" style="margin-top:12px"><button class="btn primary" id="pvGo" ${err ? 'disabled' : ''}>반영하기</button><button class="btn" id="pvCancel">취소</button>
            <span class="muted" style="font-size:12px">직접 지정한 열은 같은 열 구성의 파일을 다음에 올릴 때 자동으로 씁니다.</span></div></div>`;
        if (box.querySelector('#pvSheet')) box.querySelector('#pvSheet').onchange = (e) => { si = Number(e.target.value); hi = detectHeader(spec, sheets[si].grid); override = savedMap(k, gridRows(sheets[si], hi).head); draw(); };
        box.querySelector('#pvHead').onchange = (e) => { hi = Number(e.target.value); override = savedMap(k, gridRows(sheets[si], hi).head); draw(); };
        box.querySelector('#pvMode').onchange = (e) => { mode = e.target.value; draw(); };
        box.querySelectorAll('[data-f]').forEach((s) => (s.onchange = () => { const f2 = s.dataset.f; if (s.value === (auto[f2] || '')) delete override[f2]; else override[f2] = s.value; draw(); }));
        box.querySelector('#pvCancel').onclick = () => { box.innerHTML = ''; };
        box.querySelector('#pvGo').onclick = async () => {
          if (mode === 'replace' && !confirm(`${spec.label}를 전부 교체합니다. 계속할까요?`)) return;
          rememberMap(k, g.head, override);
          const why = res.bad ? ` 제외 ${res.bad}행 (${Object.entries(res.reasons).map(([r, n]) => `${r} ${n}`).join(', ')}). 원본 파일을 고쳐 다시 올리면 같은 행은 덮어씁니다.` : '';
          const extra = applyImport(k, res.rows, mode);
          await MD.store.saving; // IndexedDB 저장은 비동기 — 결과가 나온 뒤 안내
          MD.refresh();
          const saved = !MD.store.lastSave || MD.store.lastSave.ok;
          if (saved) U.toast(`${spec.label} ${U.num(res.rows.length)}행 반영·저장${res.bad ? `, ${res.bad}행 제외` : ''}`);
          else U.toast(`${spec.label}를 화면에 반영했지만 저장하지 못했습니다. 새로고침하면 사라지니 백업 파일을 받아 두세요.`, 'bad');
          const note = (why + (extra || '')).trim();
          if (note) setTimeout(() => { const m = document.querySelector('#upMsg'); if (m) m.textContent = note; }, 50);
        };
      };
      draw();
      box.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };
    el.querySelectorAll('[data-up]').forEach((i) => (i.onchange = (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) upload(i.dataset.up, f); }));
    el.querySelectorAll('.drop[data-k]').forEach((z) => {
      z.ondragover = (e) => { e.preventDefault(); z.classList.add('over'); };
      z.ondragleave = () => z.classList.remove('over');
      z.ondrop = (e) => { e.preventDefault(); z.classList.remove('over'); const f = e.dataTransfer.files[0]; if (f) upload(z.dataset.k, f); };
    });

    el.querySelector('#bk').onclick = () => {
      const out = {}; for (const k of MD.store.KEYS) out[k] = d[k];
      out.isSample = d.isSample; out.exportedAt = new Date().toISOString(); out.backupVersion = 2;
      // 업무 자료 키·meta 말고 이 앱이 저장한 나머지 값(보고서 팀·작성자, 기간별 다음 액션, 분석 기준값, 가격 설정 등)
      out.extras = {};
      try { for (let i = 0; i < localStorage.length; i++) { const key = localStorage.key(i); if (!key || !key.startsWith('mdwt:')) continue; const k = key.slice(5); if (k === 'meta' || k === 'pending' || MD.store.KEYS.includes(k)) continue; const v = U.store.get(k, null); if (v != null) out.extras[k] = v; } } catch (e) { /* 저장소 접근 불가 — 자료만 백업 */ }
      U.download(`MD워크툴_백업_${U.today()}.json`, JSON.stringify(out), 'application/json');
    };
    el.querySelector('#rs').onchange = async (e) => {
      const f = e.target.files[0]; if (!f) return;
      try {
        const j = JSON.parse(await f.text());
        if (!Array.isArray(j.sales)) throw new Error('백업 파일 형식이 아닙니다.');
        if (j.isSample) {
          if (!confirm('예시 데이터에서 받은 백업입니다. 내 데이터로 복원하지 않고 예시 데이터로 되돌립니다. 계속할까요?')) return;
          if (await MD.store.resetToSample()) { MD.refresh(); U.toast('예시 데이터로 되돌렸습니다.'); }
          return;
        }
        // 형식 검사는 현재 자료를 바꾸기 전에 끝낸다 — 잘못된 백업이 기존 저장 자료를 덮어쓰지 않게 (Codex 기능 K R1-01)
        const bad = checkBackup(j);
        if (bad.length) throw new Error(`백업 파일의 자료 형식이 맞지 않습니다(기존 자료 그대로): ${bad.slice(0, 3).join(' / ')}${bad.length > 3 ? ` 외 ${bad.length - 3}건` : ''}`);
        const closes = Object.fromEntries(Object.entries(j.closes || {}).filter(([, c]) => c && !c.sample));
        const cand = { isSample: false, channels: j.channels || [], products: j.products || [], sales: j.sales, traffic: j.traffic || [], promotions: j.promotions || [], vendors: j.vendors || [], pos: j.pos || [], candidates: j.candidates || [], targets: j.targets || [], ads: j.ads || [], closes, compete: j.compete || [], events: (j.events || []).filter((x) => !x.sample), reports: j.reports || [] };
        // 저장 전에 화면 자료를 한 번 만들어 본다. 실패하면 이전 자료로 되돌리고 저장하지 않는다
        const prev = MD.data;
        try { trialBackup(cand); } catch (err2) { MD.data = prev; MD.buildIndex(); throw new Error(`백업 자료로 화면을 만들 수 없습니다(기존 자료 그대로): ${err2.message}`); }
        MD.data = prev; MD.buildIndex();
        if (!confirm('현재 데이터를 백업 내용으로 바꿉니다. 계속할까요?')) return;
        MD.data = cand;
        const ok = await MD.store.saveAllClearingInterrupted(); // 백업 전체 저장 = 이전 불완전 저장 해소 (IndexedDB면 비동기)
        // 보고서 작성자·기간별 액션·기준값 등(백업 버전 2부터 포함)은 자료 저장이 성공했을 때만 되살린다.
        // 업무 자료 키·meta·저장 진행 표시는 부가 설정으로 쓰지 않는다(잘못된 백업이 자료를 덮어쓰지 않게)
        const reserved = new Set([...MD.store.KEYS, 'meta', 'pending']);
        const extras = j.extras && typeof j.extras === 'object' && !Array.isArray(j.extras) ? Object.entries(j.extras) : [];
        const skippedX = extras.filter(([k]) => reserved.has(k)).map(([k]) => k);
        const failedX = ok ? extras.filter(([k]) => !reserved.has(k)).filter(([k, v]) => !U.store.set(k, v)).map(([k]) => k) : [];
        MD.calc.reloadBasis(); // 계산 기준(basis)도 복원했을 수 있다 — 화면 계산에 바로 쓰이게
        MD.refresh();
        if (!ok) U.toast('백업 내용을 화면에 불러왔지만 저장하지 못했습니다. 새로고침하면 사라집니다.', 'bad');
        else if (failedX.length) {
          MD.store.lastSave = { ok: false, at: new Date().toISOString(), failed: '설정', notRestored: failedX };
          if (MD.saveStateChanged) MD.saveStateChanged();
          U.toast(`업무 자료는 복원·저장했지만 설정 ${failedX.length}개(${failedX.slice(0, 3).join(', ')})는 저장하지 못했습니다. 이 설정은 이전 값으로 남아 있습니다.`, 'bad');
        } else U.toast(`복원·저장했습니다.${j.extras ? '' : ' (이전 형식 백업: 보고서 작성자·액션 문구·기준값은 들어 있지 않음)'}${skippedX.length ? ` 백업의 설정 칸에 있던 업무 자료 이름(${skippedX.join(', ')})은 무시했습니다.` : ''}`);
      } catch (err) { U.toast('복원 실패: ' + err.message, 'bad'); }
    };
    el.querySelector('#toSample').onclick = async () => { if (confirm('저장된 내 데이터를 지우고 예시 데이터로 되돌립니다. 먼저 백업하셨나요?')) { if (await MD.store.resetToSample()) MD.refresh(); } };
    el.querySelector('#toEmpty').onclick = () => { if (confirm('모든 데이터를 비웁니다. 먼저 백업하셨나요?')) { MD.store.startEmpty(); MD.refresh(); } };
    el.querySelector('#roasMin').onchange = (e) => U.store.set('roasMin', (Number(e.target.value) || 0) / 100);
    el.querySelector('#coverDays').onchange = (e) => U.store.set('coverDays', Number(e.target.value) || 0);
    el.querySelector('#pX').onclick = () => U.exportXlsx('상품마스터.xlsx', { 상품: d.products.map(({ sku, name, brand, category, season, price, cost, stock }) => ({ SKU: sku, 상품명: name, 브랜드: brand, 카테고리: category, 시즌: season, 판매가: price, 원가: cost, 재고: stock })) });

    // 사용자가 고친 행은 userSet으로 표시 — 예시 → 실데이터 전환 때 이 행만 남긴다
    const masterSave = (k) => (kind, row, meta) => {
      if (k === 'channels' && kind === 'edit' && meta && meta.key === 'name' && meta.old !== meta.value) {
        const to = String(meta.value).trim(), from = meta.old;
        if (!to) { U.toast('채널명은 비울 수 없습니다.', 'bad'); return false; }
        // 앞뒤 공백만 바뀐 경우: 이름은 그대로 두고 연결 자료도 건드리지 않는다
        if (to === from) { row.name = from; return true; }
        if (MD.data.channels.some((c) => c !== row && c.name === to)) { U.toast(`'${to}' 채널이 이미 있습니다. 두 채널을 합치려면 한쪽 자료의 채널명을 고쳐 다시 올리세요.`, 'bad'); return false; }
        if (MD.data.isSample) { U.toast('예시 데이터에서는 채널명을 바꿀 수 없습니다(새로고침하면 예시 판매 자료가 원래 이름으로 다시 만들어짐). 내 데이터를 올린 뒤 바꾸세요.', 'bad'); return false; }
        const n = MD.calc.channelRefs(from);
        const what = [['판매', n.sales, '행'], ['유입', n.traffic, '행'], ['광고', n.ads, '행'], ['목표', n.targets, '건'], ['행사', n.promotions, '건'], ['마감 확인', n.closes, '건']].filter((x) => x[1]).map((x) => `${x[0]} ${U.num(x[1])}${x[2]}`).join('·');
        if (!confirm(`채널명을 '${from}'에서 '${to}'(으)로 바꿉니다.${what ? ` ${what}의 채널명도 함께 바뀝니다.` : ''} 계속할까요?`)) return false;
        row.name = to;
        MD.calc.renameChannel(from, to);
        row.userSet = true;
        Promise.resolve(MD.store.save()).then((ok) => { if (ok) U.toast(`채널명을 바꿨습니다: ${from} → ${to}`); });
        return true;
      }
      if (row) row.userSet = true;
      if (MD.data.isSample && k === 'products') U.toast('예시 상태의 상품 수정은 새로고침하면 사라집니다. 첫 판매 데이터를 올릴 때까지는 유지됩니다.');
      MD.store.save([k]);
    };
    MD.crud(el.querySelector('#chT'), {
      fields: [{ key: 'name', label: '채널명', width: '170px' }, { key: 'type', label: '유형', width: '110px' }, { key: 'fee', label: '수수료율(%)', type: 'pct', width: '90px' }, { key: 'target', label: '월 목표(원)', type: 'number', width: '140px' }],
      list: () => MD.data.channels, onChange: masterSave('channels'), newRow: () => ({ name: '새 채널', type: '', fee: 0, target: 0, userSet: true }),
    });
    MD.crud(el.querySelector('#pT'), {
      fields: [{ key: 'sku', label: 'SKU', width: '90px' }, { key: 'name', label: '상품명', width: '200px' }, { key: 'brand', label: '브랜드', width: '120px' }, { key: 'category', label: '카테고리', width: '80px' }, { key: 'season', label: '시즌', width: '70px' }, { key: 'price', label: '판매가', type: 'number', width: '110px' }, { key: 'cost', label: '입고원가', type: 'number', width: '110px' }, { key: 'stock', label: '재고', type: 'number', width: '70px' }],
      list: () => MD.data.products, onChange: masterSave('products'), newRow: () => ({ sku: 'NEW' + (MD.data.products.length + 1), name: '', brand: '', category: '', season: '', price: 0, cost: 0, stock: 0, userSet: true }),
    });
  };
})();
