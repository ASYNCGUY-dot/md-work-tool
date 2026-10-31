// 데이터 상태·예시 데이터·집계 계산
(function () {
  const U = MD.util;

  // ---------- 예시 데이터 ----------
  // 브랜드명은 가상, 채널명은 실제 플랫폼 이름이지만 수수료율·목표는 예시값이다.
  const SAMPLE_CHANNELS = [
    { name: '네이버 스마트스토어', type: '오픈마켓', fee: 0.055, target: 62000000, weight: 1.6 },
    { name: 'SSG.COM', type: '종합몰', fee: 0.15, target: 30000000, weight: 0.8 },
    { name: '롯데온', type: '종합몰', fee: 0.13, target: 18000000, weight: 0.5 },
    { name: 'LFmall', type: '전문몰', fee: 0.2, target: 16000000, weight: 0.45 },
    { name: '머스트잇', type: '명품 전문몰', fee: 0.12, target: 34000000, weight: 0.95 },
    { name: '발란', type: '명품 전문몰', fee: 0.15, target: 26000000, weight: 0.7 },
    { name: '크림', type: '리셀·전문몰', fee: 0.08, target: 14000000, weight: 0.4 },
    { name: '11번가', type: '오픈마켓', fee: 0.12, target: 12000000, weight: 0.35 },
    { name: '비즈마켓', type: '폐쇄몰', fee: 0.1, target: 20000000, weight: 0.55 },
  ];

  const BRANDS = ['MAISON LUNE', 'ATELIER NOIR', 'CASA VERDE', 'NORD STUDIO'];
  const CATS = {
    가방: { names: ['미니 토트백', '숄더백', '크로스백', '버킷백', '클러치'], price: [690000, 1490000], season: '사계절' },
    지갑: { names: ['반지갑', '카드지갑', '장지갑'], price: [290000, 590000], season: '사계절' },
    신발: { names: ['레더 스니커즈', '로퍼', '앵클부츠'], price: [490000, 890000], season: 'F/W' },
    의류: { names: ['울 코트', '캐시미어 니트', '린넨 셔츠'], price: [390000, 1890000], season: 'F/W' },
    액세서리: { names: ['실크 스카프', '벨트', '선글라스'], price: [190000, 450000], season: 'S/S' },
  };

  function roundPrice(p) { return Math.round(p / 10000) * 10000; }

  function makeProducts(r) {
    const out = []; let i = 1;
    const plan = [['가방', 8], ['지갑', 5], ['신발', 3], ['의류', 4], ['액세서리', 4]];
    for (const [cat, n] of plan) {
      const c = CATS[cat];
      for (let k = 0; k < n; k++) {
        const brand = BRANDS[(i + k) % BRANDS.length];
        const name = c.names[k % c.names.length];
        let season = c.season;
        if (name === '린넨 셔츠') season = 'S/S';
        const price = roundPrice(c.price[0] + r() * (c.price[1] - c.price[0]));
        const costRate = 0.48 + r() * 0.2; // 판매가(VAT포함) 대비 원가 비중
        out.push({
          sku: 'SKU' + String(i).padStart(3, '0'), name: `${brand} ${name}`, brand, category: cat, season,
          price, cost: Math.round((price * costRate) / 1.1 / 100) * 100,
          stock: Math.round(4 + r() * 40), pop: 0.4 + r() * 1.4, launch: null,
        });
        i++;
      }
    }
    return out;
  }

  function seasonal(season, month) {
    if (season === 'F/W') return [1.3, 1.0, 0.7, 0.5, 0.4, 0.35, 0.35, 0.5, 0.9, 1.4, 1.7, 1.6][month];
    if (season === 'S/S') return [0.5, 0.6, 1.0, 1.4, 1.6, 1.6, 1.4, 1.2, 0.8, 0.6, 0.5, 0.5][month];
    return [1.0, 0.9, 1.0, 1.0, 1.1, 0.95, 0.9, 0.9, 1.0, 1.05, 1.25, 1.35][month];
  }

  function poisson(l, r) {
    if (l <= 0) return 0;
    const L = Math.exp(-l); let k = 0, p = 1;
    do { k++; p *= r(); } while (p > L && k < 50);
    return k - 1;
  }

  function makePromotions(end) {
    const d = (n) => U.addDays(end, n);
    const P = (id, name, channel, type, s, e, disc, budget, cats) => ({ id, name, channel, type, start: d(s), end: d(e), discount: disc, budget, categories: cats, memo: '' });
    return [
      P('PR01', '봄 신상 기획전', '네이버 스마트스토어', '기획전', -220, -210, 0.1, 3000000, ['가방', '액세서리']),
      P('PR02', '머스트잇 브랜드위크', '머스트잇', '기획전', -180, -174, 0.12, 2500000, ['가방', '지갑']),
      P('PR03', '가정의달 타임딜', 'SSG.COM', '타임딜', -170, -168, 0.18, 1800000, ['지갑']),
      P('PR04', '발란 썸머 세일', '발란', '기획전', -120, -110, 0.15, 2000000, ['액세서리', '가방']),
      P('PR05', '롯데온 반짝특가', '롯데온', '타임딜', -95, -94, 0.2, 1200000, ['가방']),
      P('PR06', '비즈마켓 임직원 특가', '비즈마켓', '폐쇄몰 행사', -75, -68, 0.2, 0, ['지갑', '액세서리']),
      P('PR07', '추석 선물 기획전', '네이버 스마트스토어', '기획전', -52, -42, 0.1, 4500000, ['지갑', '액세서리', '가방']),
      P('PR08', 'LFmall 쿠폰 프로모션', 'LFmall', '쿠폰', -40, -34, 0.15, 3500000, ['의류']),
      P('PR09', 'F/W 아우터 타임딜', '머스트잇', '타임딜', -20, -18, 0.15, 1500000, ['의류', '신발']),
      P('PR10', '스마트스토어 라이브 특가', '네이버 스마트스토어', '타임딜', -9, -8, 0.12, 1000000, ['가방']),
    ];
  }

  function generateSample() {
    const r = U.rng(20260830);
    const end = U.addDays(U.today(), -1);
    const start = U.addDays(end, -669);
    const channels = SAMPLE_CHANNELS.map((c) => ({ name: c.name, type: c.type, fee: c.fee, target: c.target }));
    const chW = Object.fromEntries(SAMPLE_CHANNELS.map((c) => [c.name, c.weight]));
    // 채널별 연간 추세: 일부 채널은 성장, 일부는 감소 — 비교 분석이 의미 있도록
    const trend = { '네이버 스마트스토어': 0.18, 'SSG.COM': -0.12, 롯데온: -0.2, LFmall: 0.05, 머스트잇: 0.25, 발란: -0.08, 크림: 0.35, '11번가': -0.25, 비즈마켓: 0.1 };
    const products = makeProducts(r);
    const promotions = makePromotions(end);
    const sales = [], traffic = [];
    const days = U.dateRange(start, end);
    const scale = 0.05; // 연매출 약 25억 규모가 되도록 맞춘 값

    for (const date of days) {
      const dt = U.toDate(date);
      const m = dt.getUTCMonth(), wd = dt.getUTCDay();
      const t = U.diffDays(start, date) / 365;
      const wdF = [1.15, 0.95, 0.95, 0.95, 1.0, 1.05, 1.2][wd];
      for (const ch of channels) {
        const promosToday = promotions.filter((p) => p.channel === ch.name && p.start <= date && date <= p.end);
        const chTrend = Math.max(0.3, 1 + trend[ch.name] * (t - 0.9));
        let chQty = 0, chOrders = 0;
        for (const p of products) {
          const promo = promosToday.find((x) => x.categories.includes(p.category));
          // PR08(LFmall 쿠폰)은 광고비 대비 반응이 약한 사례로 둔다
          const boost = promo ? (promo.id === 'PR08' ? 1.25 : promo.type === '타임딜' ? 3.4 : 2.3) : 1;
          const lam = scale * p.pop * chW[ch.name] * seasonal(p.season, m) * wdF * chTrend * boost;
          const qty = poisson(lam, r);
          if (!qty) continue;
          const disc = promo ? promo.discount : r() < 0.3 ? 0.05 : 0;
          const gross = qty * p.price;
          const amount = Math.round((gross * (1 - disc)) / 10) * 10;
          const orders = Math.max(1, qty - (qty > 1 && r() < 0.3 ? 1 : 0));
          sales.push({ date, channel: ch.name, sku: p.sku, qty, sales: amount, discount: gross - amount, orders });
          chQty += qty; chOrders += orders;
        }
        // 전환율 0.6~1.5%, ROAS 300~900% 정도가 나오도록 맞춘 예시 값
        const baseVisits = 110 * chW[ch.name] * chTrend * wdF * (0.85 + r() * 0.3);
        const promoAd = promosToday.reduce((s, p) => s + p.budget / (U.diffDays(p.start, p.end) + 1), 0);
        const visits = Math.round(baseVisits * (promosToday.length ? 1.9 : 1) + chOrders * 45);
        const adBase = { 'SSG.COM': 380000, 롯데온: 420000, '11번가': 400000 }[ch.name] || 260000;
        const ad = Math.round((chW[ch.name] * adBase * (0.7 + r() * 0.6) + promoAd) / 100) * 100;
        // 예시 플랫폼 통계: 방문·광고비·주문 건수가 모두 확인된 자료로 둔다 (vOk·adOk·ordOk)
        traffic.push({ date, channel: ch.name, visits, ad: ch.name === '비즈마켓' ? 0 : ad, orders: chOrders, vOk: true, adOk: true, ordOk: true });
      }
    }

    // 최근 판매 속도에 맞춰 재고를 조정: 일부는 품절 임박, 일부는 과재고가 되도록
    const recent = U.addDays(end, -27);
    for (const p of products) {
      const q = sales.filter((s) => s.sku === p.sku && s.date >= recent).reduce((a, s) => a + s.qty, 0);
      const daily = q / 28;
      p.stock = Math.max(0, Math.round(daily * (5 + r() * 70)));
      delete p.pop;
    }

    const vendors = [
      { name: 'Maison Duval SARL', type: '해외 공급처', country: '프랑스', contact: 'export@duval.example', status: '거래중', terms: 'T/T 선결제 30%, FOB', last: U.addDays(end, -6), next: '가을 시즌 오더 확정', due: U.addDays(end, 4), contractEnd: U.addDays(end, 210), memo: '가방 MOQ 20' },
      { name: 'Bottega Rossi Srl', type: '해외 공급처', country: '이탈리아', contact: 'sales@rossi.example', status: '거래중', terms: 'T/T 100%, EXW', last: U.addDays(end, -15), next: '단가 재협상 (환율 반영)', due: U.addDays(end, -2), contractEnd: U.addDays(end, 25), memo: '독점 판권 계약 갱신 필요' },
      { name: 'Alpen Trade AG', type: '해외 공급처', country: '스위스', contact: 'info@alpentrade.example', status: '협의중', terms: '협의 중', last: U.addDays(end, -3), next: '샘플 3종 수령 확인', due: U.addDays(end, 7), contractEnd: '', memo: '액세서리 라인' },
      { name: 'Van Dijk Fashion BV', type: '해외 공급처', country: '네덜란드', contact: 'buy@vandijk.example', status: '거래중', terms: 'T/T 50/50, CIF', last: U.addDays(end, -30), next: '연간 물량 계약 검토', due: U.addDays(end, 12), contractEnd: U.addDays(end, 58), memo: '' },
      { name: '(주)한빛리테일', type: 'B2B 거래처', country: '한국', contact: '구매팀 김OO', status: '거래중', terms: '월말 마감 익월 15일', last: U.addDays(end, -2), next: '11월 발주 수량 확인', due: U.addDays(end, 3), contractEnd: U.addDays(end, 120), memo: '연 거래액 상위' },
      { name: '스타일웍스', type: 'B2B 거래처', country: '한국', contact: '대표 이OO', status: '거래중', terms: '선입금', last: U.addDays(end, -20), next: '신상 카탈로그 발송', due: U.addDays(end, -5), contractEnd: U.addDays(end, 300), memo: '' },
      { name: '모노셀렉트', type: 'B2B 거래처', country: '한국', contact: 'MD 박OO', status: '제안', terms: '-', last: U.addDays(end, -8), next: '제안서 회신 확인', due: U.addDays(end, 1), contractEnd: '', memo: '편집숍 3개 매장' },
      { name: '머스트잇 MD팀', type: '플랫폼 담당자', country: '한국', contact: '담당 MD 최OO', status: '거래중', terms: '수수료 협의 (예시 12%)', last: U.addDays(end, -4), next: '12월 기획전 구좌 신청', due: U.addDays(end, 9), contractEnd: '', memo: '' },
      { name: 'SSG.COM 패션담당', type: '플랫폼 담당자', country: '한국', contact: '담당 MD 정OO', status: '거래중', terms: '수수료 협의 (예시 15%)', last: U.addDays(end, -26), next: '매출 하락 대응 미팅', due: U.addDays(end, 2), contractEnd: '', memo: '최근 매출 감소 채널' },
    ];

    const pos = [
      { po: 'PO-2601', vendor: 'Maison Duval SARL', sku: products[0].sku, qty: 20, ordered: U.addDays(end, -35), eta: U.addDays(end, 6), received: 0, status: '운송중' },
      { po: 'PO-2602', vendor: 'Bottega Rossi Srl', sku: products[2].sku, qty: 15, ordered: U.addDays(end, -20), eta: U.addDays(end, 18), received: 0, status: '생산중' },
      { po: 'PO-2603', vendor: 'Van Dijk Fashion BV', sku: products[17].sku, qty: 30, ordered: U.addDays(end, -40), eta: U.addDays(end, -3), received: 0, status: '통관대기' },
      { po: 'PO-2604', vendor: 'Maison Duval SARL', sku: products[9].sku, qty: 25, ordered: U.addDays(end, -60), eta: U.addDays(end, -20), received: 25, status: '입고완료' },
    ];

    const candidates = [
      { name: '카프스킨 미니 호보백', brand: 'MAISON LUNE', category: '가방', popularity: 5, lastYearQty: 140, outlook: 4, margin: 0.31, supplier: 'Maison Duval SARL', moq: 20, memo: 'SNS 언급 증가' },
      { name: '퀼팅 체인 카드지갑', brand: 'ATELIER NOIR', category: '지갑', popularity: 4, lastYearQty: 220, outlook: 4, margin: 0.27, supplier: 'Bottega Rossi Srl', moq: 30, memo: '선물 시즌 수요' },
      { name: '시어링 무스탕', brand: 'NORD STUDIO', category: '의류', popularity: 3, lastYearQty: 45, outlook: 5, margin: 0.22, supplier: 'Van Dijk Fashion BV', moq: 10, memo: '고단가, 재고 리스크' },
      { name: '로고 실크 스카프', brand: 'CASA VERDE', category: '액세서리', popularity: 2, lastYearQty: 60, outlook: 2, margin: 0.38, supplier: 'Alpen Trade AG', moq: 50, memo: 'S/S 상품 — 시즌 역행' },
      { name: '첼시 부츠', brand: 'ATELIER NOIR', category: '신발', popularity: 4, lastYearQty: 80, outlook: 4, margin: 0.25, supplier: 'Bottega Rossi Srl', moq: 15, memo: '사이즈 리스크' },
    ];

    // 예시 월별 목표: 올해 각 달 = 채널 기본 목표 × 계절 지수. sample 표시로 실데이터 전환 때 지운다
    const yr = end.slice(0, 4), SEASON = [0.85, 0.8, 0.95, 1, 1, 0.9, 0.85, 0.85, 1.05, 1.1, 1.2, 1.3];
    const targets = [];
    SEASON.forEach((f, i) => {
      const month = `${yr}-${String(i + 1).padStart(2, '0')}`;
      for (const c of channels) {
        const roas = { 'SSG.COM': 3.5, 롯데온: 3, '11번가': 3 }[c.name] || (c.name === '비즈마켓' ? null : 4.5);
        targets.push({ month, channel: c.name, sales: Math.round((c.target * f) / 100000) * 100000, ...(roas ? { roas } : {}), sampleFields: ['sales', 'roas'] });
      }
      targets.push({ month, channel: '', adBudget: Math.round(48000000 * f / 100000) * 100000, margin: 0.3, roas: 4.5, cvr: 0.008, memo: i === 10 ? '블랙프라이데이·연말 선물 수요 반영 (예시)' : '', sampleFields: ['adBudget', 'margin', 'roas', 'cvr', 'memo'] });
    });
    // 예시 광고 리포트: 광고비가 있는 채널·날짜를 캠페인 두 개로 나누고, 광고 매출은 그날 채널 매출의 일부로 둔다
    const ads = [], daySales = new Map();
    for (const s of sales) daySales.set(s.date + '|' + s.channel, (daySales.get(s.date + '|' + s.channel) || 0) + s.sales);
    for (const t of traffic) {
      if (!t.ad) continue;
      const rev = daySales.get(t.date + '|' + t.channel) || 0;
      [['검색광고', 0.6, 0.42], ['상품 노출광고', 0.4, 0.2]].forEach(([camp, share, revShare]) => {
        const spend = Math.round((t.ad * share) / 100) * 100, imp = Math.round(spend / 3.2), clicks = Math.max(1, Math.round(imp * 0.012));
        ads.push({ date: t.date, channel: t.channel, campaign: camp, spend, revenue: Math.round((rev * revShare) / 10) * 10, imp, clicks, conv: Math.max(0, Math.round(clicks * 0.03)) });
      });
    }
    const closes = Object.fromEntries(channels.map((c) => [c.name, { sales: end, traffic: end, ads: end, sample: true }]));
    const events = [
      { date: U.addDays(end, -40), end: U.addDays(end, -38), kind: '외부', title: '이른 한파로 아우터 검색량 급증 (예시)', channel: '', sample: true },
      { date: U.addDays(end, -15), end: U.addDays(end, -15), kind: '내부', title: '상세페이지 리뉴얼 반영 (예시)', channel: '네이버 스마트스토어', sample: true },
    ];
    return { isSample: true, channels, products, sales, traffic, promotions, vendors, pos, candidates, targets, ads, closes, compete: [], events, reports: [], savedAt: null };
  }

  // ---------- 상태 ----------
  const KEYS = ['channels', 'products', 'sales', 'traffic', 'promotions', 'vendors', 'pos', 'candidates', 'targets', 'ads', 'closes', 'compete', 'events', 'reports'];

  // 저장된 값을 꺼내는 함수(get)로 화면용 자료를 조립한다 — localStorage·IndexedDB 공통
  function build(get) {
    const meta = get('meta', null);
    let d;
    if (!meta || meta.isSample) {
      d = generateSample();
      // 예시 데이터라도 사용자가 편집한 소형 목록은 유지
      if (meta) for (const k of ['vendors', 'pos', 'candidates', 'promotions', 'channels', 'targets', 'compete', 'events']) { const v = get(k, null); if (v) d[k] = v; }
    } else {
      d = { isSample: false };
      for (const k of KEYS) d[k] = get(k, k === 'closes' ? {} : []);
    }
    MD.store.gen = (meta && meta.gen) || 0; // 여러 탭 덮어쓰기 방지용 저장 세대
    MD.data = d;
    MD.buildIndex();
  }

  // 불러오기. 'mdwt:backend'가 'idb'면 IndexedDB에서 읽고(비동기, Promise 반환), 아니면 localStorage에서 읽은 뒤
  // IndexedDB가 있으면 이전을 시도한다(이전 결과와 관계없이 화면은 읽은 자료로 동작). IndexedDB가 없는 환경은 기존 방식 그대로.
  function load() {
    if (hasIDB() && rawGet('backend') === 'idb') return loadIDB();
    // 지난 저장이 끝나지 못하고 되돌리기도 실패했으면 진행 표시가 남는다 — 자료 시점이 섞였을 수 있음
    const pend = U.store.get('pending', null);
    MD.store.interrupted = pend && Array.isArray(pend.keys) ? pend : null;
    build((k, fb) => U.store.get(k, fb));
    // 이전은 화면을 막지 않도록 기다리지 않는다. 섞였을 수 있는 자료는 옮기지 않는다
    if (hasIDB() && !MD.store.interrupted) MD.store.migrating = migrate();
  }

  // ---------- IndexedDB ----------
  // 업무 자료(KEYS)와 meta를 객체 저장소 하나(kv)에 키별로 둔다. 저장은 트랜잭션 하나라서 브라우저가 '전부 저장되거나 전부 그대로'를 보장한다.
  // 설정 값(보고서 작성자·기준값 등)은 작아서 localStorage에 그대로 둔다.
  const IDB_NAME = 'mdwt', IDB_STORE = 'kv';
  let db = null;
  const hasIDB = () => typeof indexedDB !== 'undefined' && !!indexedDB;
  const useIDB = () => !!db && rawGet('backend') === 'idb';
  // 저장소 열기가 응답 없이 멈추는 환경이 있어(headless Edge에서 재현) 시간 제한을 둔다
  function openDB(ms = 5000) {
    return new Promise((res, rej) => {
      const timer = setTimeout(() => rej(new Error('저장소 열기 응답 없음')), ms);
      const done = (fn) => (v) => { clearTimeout(timer); fn(v); };
      res = done(res); rej = done(rej);
      const r = indexedDB.open(IDB_NAME, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(IDB_STORE);
      r.onsuccess = () => {
        // 다른 곳에서 삭제·업그레이드를 요청하면 연결을 닫아 그 요청이 영원히 막히지 않게 한다.
        // 닫힌 뒤의 저장은 useIDB()가 false가 되고, saveLS가 backend='idb'를 보고 거부한다
        r.result.onversionchange = () => { r.result.close(); if (db === r.result) db = null; };
        res(r.result);
      };
      r.onerror = () => rej(r.error);
      r.onblocked = () => rej(new Error('다른 탭이 저장소를 잡고 있습니다'));
    });
  }
  function readAll(h, ms = 15000) {
    return new Promise((res, rej) => {
      const timer = setTimeout(() => rej(new Error('저장소 읽기 응답 없음')), ms);
      const ok = (v) => { clearTimeout(timer); res(v); }, no = (e) => { clearTimeout(timer); rej(e); };
      let tx;
      try { tx = h.transaction(IDB_STORE, 'readonly'); } catch (e) { no(e); return; }
      const out = {}, rq = tx.objectStore(IDB_STORE).openCursor();
      rq.onsuccess = () => { const c = rq.result; if (c) { out[c.key] = c.value; c.continue(); } };
      tx.oncomplete = () => ok(out);
      tx.onerror = () => no(tx.error || new Error('저장소 읽기 오류'));
      tx.onabort = () => no(tx.error || new Error('저장소 읽기 중단')); // 오류 이벤트 없이 중단돼도 대기하지 않게 (R1-04)
    });
  }
  async function loadIDB() {
    MD.store.interrupted = null; // 트랜잭션 저장이라 '섞인 저장'이 생기지 않는다
    try {
      db = db || await openDB();
      const all = await readAll(db);
      build((k, fb) => (all[k] === undefined ? fb : all[k]));
      tidyLegacy(all);
    } catch (e) {
      // 저장소를 열지 못하면 저장을 막는다 (빈 예시로 실제 자료를 덮어쓰지 않게)
      MD.store.backendError = (e && e.message) || '저장소를 읽지 못했습니다';
      build(() => null);
    }
  }
  // localStorage → IndexedDB 이전: 원본 문자열을 그대로 옮기고, 다시 읽어 키마다 전체 내용(행 수·금액 포함)이 같은지 대조한 뒤에만 전환한다.
  // 대조가 끝나기 전에는 localStorage 자료를 지우지 않는다. 실패하면 localStorage 방식으로 계속 쓴다.
  // 이전 규칙 (Codex 기능 J 라운드 1·2):
  //  - '이미 옮겼다'의 유일한 근거는 localStorage의 전환 표시 backend='idb'다. 이 표시는 대조가 끝난 뒤에만 쓴다.
  //    IndexedDB 안의 사본·표식은 근거로 쓰지 않는다(취소된 이전의 사본일 수 있음).
  //  - 이전 중 어느 탭이든 localStorage에 저장했는지는 탭 안 계수기가 아니라 공유 localStorage 원본 문자열을 다시 읽어 판단한다.
  //    시작 때 복사한 원본과 전환 직전·직후에 한 글자라도 다르면 취소한다. 전환 표시가 생긴 뒤에는 다른 탭의 saveLS가 저장을 거부한다.
  //  - 탭이 여러 개면 Web Locks로 이전을 한 번에 하나만 한다(없으면 그대로 실행).
  function migrate() {
    const run = () => migrateOnce();
    return typeof navigator !== 'undefined' && navigator.locks && navigator.locks.request ? navigator.locks.request('mdwt-migrate', run) : run();
  }
  const snapshot = () => { const o = {}; for (const k of [...KEYS, 'meta']) o[k] = rawGet(k); return o; };
  const changedSince = (src) => [...KEYS, 'meta'].filter((k) => rawGet(k) !== src[k]);
  async function migrateOnce() {
    const at = new Date().toISOString();
    try {
      const h = await openDB();
      if (rawGet('backend') === 'idb') return adoptIDB(h, '다른 탭이 저장 방식을 이미 옮겼습니다'); // 기다리는 사이 전환됨
      let src = snapshot(); // 공유 localStorage 원본 문자열 그대로 (없는 키는 null)
      let movedMeanwhile = false;
      const copy = (guard) => new Promise((res, rej) => {
        const tx = h.transaction(IDB_STORE, 'readwrite'), st = tx.objectStore(IDB_STORE);
        // 트랜잭션을 연 뒤에도 다른 탭이 전환했는지 다시 확인 — 전환됐으면 그 IndexedDB 자료를 지우지 않는다
        if (guard && rawGet('backend') === 'idb') { movedMeanwhile = true; tx.abort(); }
        else {
          st.clear();
          for (const [k, v] of Object.entries(src)) if (v != null) st.put(JSON.parse(v), k);
        }
        tx.oncomplete = res;
        tx.onerror = () => { if (!movedMeanwhile) rej(tx.error || new Error('이전 쓰기 오류')); };
        tx.onabort = () => (movedMeanwhile ? res() : rej(tx.error || new Error('이전 트랜잭션 중단')));
      });
      const verify = async () => {
        const back = await readAll(h);
        const keys = Object.keys(src).filter((k) => src[k] != null);
        const bad = keys.filter((k) => JSON.stringify(back[k]) !== src[k]);
        if (bad.length || Object.keys(back).length !== keys.length) throw new Error(`이전 후 대조 불일치: ${bad.join(', ') || '키 수'}`);
        return { back, keys };
      };
      await copy(true);
      if (movedMeanwhile) return adoptIDB(h, '다른 탭이 저장 방식을 이미 옮겼습니다');
      let { back, keys } = await verify();
      // 전환 직전: 이전하는 동안 어느 탭이든 localStorage에 저장했으면 사본이 오래됐다 (R2-01)
      let diff = changedSince(src);
      if (diff.length) throw new Error(`이전 중 다른 저장(${diff.join(', ')})이 있어 다음 접속에 다시 이전합니다(기존 자료 보존)`);
      // 전환 표시가 실제로 써졌는지 확인한 뒤에만 원본을 지운다 (R1-01)
      if (!rawPut('backend', 'idb') || rawGet('backend') !== 'idb') throw new Error('전환 표시를 저장하지 못해 이전을 취소했습니다(기존 자료 보존)');
      // 전환 직후: 표시를 쓰는 사이 저장이 끼었으면 표시를 되돌리지 않고(되돌리기도 실패할 수 있음, R3-01) 최신 원본으로 다시 복사해 끝낸다.
      // 표시가 생긴 뒤에는 다른 탭의 saveLS가 저장을 거부하므로 진행 중이던 저장 한 번만 끝나면 원본이 멈춘다
      let recopied = false;
      for (let i = 0; (diff = changedSince(src)).length; i++) {
        if (i >= 5) throw new Error(`전환 뒤에도 원본(${diff.join(', ')})이 계속 바뀌어 이전을 마치지 못했습니다(localStorage 원본 보존, 다음 접속에 [데이터 관리]에서 복구 가능)`);
        await new Promise((r) => setTimeout(r, 50));
        src = snapshot();
        await copy(false);
        ({ back, keys } = await verify());
        recopied = true;
      }
      db = h;
      // 화면 자료·저장 세대를 최종 대조 사본으로 맞춘다 — 처음 불러온 오래된 자료가 남으면 다음 저장이 최신 자료를 덮어쓴다 (R4-01)
      build((k, fb) => (back[k] === undefined ? fb : back[k]));
      for (const k of [...KEYS, 'meta', 'pending']) rawPut(k, null); // 대조가 끝났으니 localStorage의 업무 자료를 지워 공간을 비운다
      const sales = back.sales || [];
      MD.store.migration = { ok: true, at, keys: keys.length, salesRows: sales.length, salesSum: sales.reduce((x, r) => x + (r.sales || 0), 0), recopied };
    } catch (e) {
      MD.store.migration = { ok: false, at, error: (e && e.message) || String(e) };
    }
  }
  // IndexedDB를 쓰는 동안 localStorage에 남은 업무 자료 사본 정리 (R3-01): IndexedDB와 내용이 같은 사본만 지운다.
  // 다른 사본은 전환을 끝내지 못한 이전의 최신 원본일 수 있어 지우지 않고 MD.store.legacy로 알려 [데이터 관리]에서 복구·폐기를 고르게 한다.
  function tidyLegacy(all) {
    rawPut('pending', null);
    const left = [];
    for (const k of [...KEYS, 'meta']) {
      const v = rawGet(k);
      if (v == null) continue;
      if (k === 'meta' || v === JSON.stringify(all[k])) rawPut(k, null); else left.push(k); // meta는 세대가 달라 비교하지 않음
    }
    MD.store.legacy = left.length ? { keys: left } : null;
  }
  // 남은 localStorage 사본으로 IndexedDB 자료를 덮어써 복구 (사용자가 고른 경우만)
  async function recoverLegacy() {
    const lg = MD.store.legacy;
    if (!lg || !useIDB()) return false;
    const keys = lg.keys.filter((k) => rawGet(k) != null);
    try { for (const k of keys) MD.data[k] = JSON.parse(rawGet(k)); } catch (e) { U.toast('남은 자료를 읽지 못했습니다(기존 자료 그대로).', 'bad'); return false; }
    MD.data.isSample = false;
    const ok = await saveIDB(keys);
    if (ok) { for (const k of keys) rawPut(k, null); MD.store.legacy = null; }
    return ok;
  }
  function discardLegacy() {
    if (!MD.store.legacy) return;
    for (const k of MD.store.legacy.keys) rawPut(k, null);
    MD.store.legacy = null;
  }
  // 다른 탭이 옮긴 IndexedDB 자료를 이 탭의 화면 자료로 삼는다 (이 탭은 아직 저장 전이라 잃을 변경이 없다)
  async function adoptIDB(h, why) {
    db = h;
    const all = await readAll(h);
    build((k, fb) => (all[k] === undefined ? fb : all[k]));
    tidyLegacy(all);
    MD.store.migration = { ok: true, at: new Date().toISOString(), adopted: why };
  }
  // 다른 탭이 저장하면 알려 준다 — 이 탭의 화면 자료가 오래됐을 수 있음
  const bc = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('mdwt') : null;
  if (bc) bc.onmessage = (e) => { if (e.data && e.data.type === 'saved' && e.data.gen !== MD.store.gen) { MD.store.staleBy = true; if (MD.saveStateChanged) MD.saveStateChanged(); } };

  // IndexedDB 저장: 같은 트랜잭션 안에서 저장 세대(meta.gen)를 먼저 확인해, 다른 탭이 그 사이 저장했으면 덮어쓰지 않고 중단한다
  function saveIDB(list) {
    const d = MD.data, at = new Date().toISOString();
    MD.buildIndex();
    const p = new Promise((resolve) => {
      let conflict = false, nextGen = null, finished = false;
      const finish = (ok, why) => {
        if (finished) return; finished = true;
        if (ok) {
          MD.store.gen = nextGen; MD.store.staleBy = false; unsaved.clear();
          MD.store.lastSave = { ok: true, at };
          if (bc) bc.postMessage({ type: 'saved', gen: nextGen });
        } else {
          list.forEach((k) => unsaved.add(k));
          MD.store.lastSave = { ok: false, at, failed: conflict ? 'conflict' : why || 'idb', notRestored: [] };
          U.toast(conflict
            ? '다른 탭(창)에서 자료가 먼저 저장돼 이 탭의 변경은 저장하지 않았습니다(덮어쓰기 방지). 이 탭의 변경이 필요하면 백업 파일을 받은 뒤 새로고침하세요.'
            : '저장에 실패했습니다. 이번 변경은 화면에만 있고 새로고침하면 사라집니다. [데이터 관리]에서 백업 파일을 받아 두세요.', 'bad');
        }
        if (MD.saveStateChanged) MD.saveStateChanged();
        resolve(ok);
      };
      let tx;
      try { tx = db.transaction(IDB_STORE, 'readwrite'); } catch (e) { finish(false, e && e.name); return; }
      const st = tx.objectStore(IDB_STORE), rq = st.get('meta');
      rq.onsuccess = () => {
        const cur = (rq.result && rq.result.gen) || 0;
        if (cur !== (MD.store.gen || 0)) { conflict = true; tx.abort(); return; }
        nextGen = cur + 1;
        try {
          for (const k of list) st.put(d[k], k);
          st.put({ isSample: d.isSample, savedAt: at, gen: nextGen }, 'meta');
        } catch (e) { tx.abort(); }
      };
      tx.oncomplete = () => finish(true);
      tx.onabort = () => finish(false, tx.error && tx.error.name);
      tx.onerror = () => finish(false, tx.error && tx.error.name);
    });
    MD.store.saving = p;
    return p;
  }

  // 저장은 '전부 저장되거나 전부 그대로'로 한다. localStorage에는 트랜잭션이 없으므로
  // 컬렉션을 먼저 쓰고 meta(모드·저장 시각)를 마지막에 쓰며, 하나라도 실패하면 이번에 쓴 키를 이전 문자열로 되돌린다.
  // (meta를 먼저 쓰던 방식은 일부 컬렉션만 저장된 채 남을 수 있었다 — Codex 로드맵 논의 2026-10-31)
  // 결과는 MD.store.lastSave에 남겨 상단 저장 상태 표시·업로드 안내가 읽는다.
  const SAMPLE_REGEN = ['sales', 'traffic', 'products', 'ads', 'closes']; // 예시는 다시 만들므로 저장하지 않는 키
  const rawGet = (k) => { try { return localStorage.getItem('mdwt:' + k); } catch (e) { return null; } };
  const rawPut = (k, v) => { try { if (v == null) localStorage.removeItem('mdwt:' + k); else localStorage.setItem('mdwt:' + k, v); return true; } catch (e) { return false; } };
  // unsaved: 지난 저장 실패로 메모리에만 남은 키. 다음 저장은 요청한 키와 함께 이 키들도 저장해야 성공으로 본다(R1-02)
  const unsaved = new Set();
  // 이전 불완전 저장(interrupted)이 있으면 확인·복원 전까지 그 표시를 다시 쓰고, 없으면 지운다 (R2-01)
  function keepOrClearPending() {
    const it = MD.store && MD.store.interrupted;
    if (it) U.store.set('pending', { at: it.at, keys: it.keys }); else rawPut('pending', null);
  }
  function save(keys) {
    const d = MD.data;
    const list = [...new Set([...(keys || KEYS), ...unsaved])].filter((k) => !(d.isSample && SAMPLE_REGEN.includes(k)));
    if (MD.store.backendError) {
      MD.store.lastSave = { ok: false, at: new Date().toISOString(), failed: 'backend', notRestored: [] };
      U.toast(`저장소(IndexedDB)를 열지 못해 저장하지 않았습니다: ${MD.store.backendError}. 새로고침하거나 다른 탭을 닫아 보세요.`, 'bad');
      if (MD.saveStateChanged) MD.saveStateChanged();
      MD.store.saving = Promise.resolve(false);
      return false;
    }
    if (useIDB()) return saveIDB(list);
    const result = saveLS(list);
    MD.store.saving = Promise.resolve(result);
    return result;
  }
  function saveLS(list) {
    const d = MD.data;
    if (hasIDB() && rawGet('backend') === 'idb') {
      // 다른 탭이 저장 방식을 IndexedDB로 옮겼다 — 여기서 localStorage에 쓰면 아무도 읽지 않는 자료가 된다
      list.forEach((k) => unsaved.add(k));
      MD.store.lastSave = { ok: false, at: new Date().toISOString(), failed: 'moved', notRestored: [] };
      U.toast('다른 탭에서 저장 방식이 바뀌어 이 탭의 변경은 저장하지 않았습니다. 필요하면 백업 파일을 받은 뒤 새로고침하세요.', 'bad');
      if (MD.saveStateChanged) MD.saveStateChanged();
      return false;
    }
    const written = [];
    let failed = null;
    // 저장 진행 표시(작은 값): 저장이 끝나거나 되돌리기가 끝나면 지운다. 남아 있으면 다음 불러오기에서 '섞였을 수 있음'으로 본다(R1-01)
    if (!U.store.set('pending', { at: new Date().toISOString(), keys: list })) {
      list.forEach((k) => unsaved.add(k));
      MD.store.lastSave = { ok: false, at: new Date().toISOString(), failed: 'pending', notRestored: [] };
      U.toast('저장에 실패했습니다(저장 공간 부족 또는 접근 불가). 이번 변경은 화면에만 있고 새로고침하면 사라집니다. [데이터 관리]에서 백업 파일을 받아 두세요.', 'bad');
      MD.buildIndex();
      if (MD.saveStateChanged) MD.saveStateChanged();
      return false;
    }
    for (const k of list) {
      const prev = rawGet(k);
      if (!U.store.set(k, d[k])) { failed = k; break; }
      written.push([k, prev]);
    }
    if (!failed) {
      const prevMeta = rawGet('meta');
      if (!U.store.set('meta', { isSample: d.isSample, savedAt: new Date().toISOString() })) failed = 'meta';
      else written.push(['meta', prevMeta]);
    }
    if (failed) {
      // 되돌리기: 이전 값은 새 값보다 크지 않은 경우가 대부분이라 다시 들어간다. 실패하면 그 사실을 남긴다
      const notRestored = written.filter(([k]) => k !== 'meta').reverse().filter(([k, prev]) => !rawPut(k, prev)).map(([k]) => k);
      list.forEach((k) => unsaved.add(k));
      MD.store.lastSave = { ok: false, at: new Date().toISOString(), failed, notRestored };
      if (notRestored.length) {
        // 실제로 새 값이 남은 키(+이전 불완전 키)를 표시하고, 이번 접속에서도 곧바로 '불완전' 상태로 둔다 (R3-01)
        const it = { at: new Date().toISOString(), keys: [...new Set([...notRestored, ...(MD.store.interrupted ? MD.store.interrupted.keys : [])])] };
        U.store.set('pending', it);
        MD.store.interrupted = it;
      }
      else keepOrClearPending(); // 완전히 되돌렸으면 이번 저장 전 상태로 — 이전 불완전 표시가 있었다면 그것을 유지
      U.toast(notRestored.length
        ? `저장에 실패했고, 일부 자료(${notRestored.join(', ')})는 되돌리지 못해 저장소에 새 값이 남았습니다. 새로고침하면 시점이 다른 자료가 섞일 수 있으니 지금 [데이터 관리]에서 백업 파일을 받아 두세요.`
        : `저장에 실패했습니다${failed === 'meta' ? '' : `(${failed})`}. 이번 변경은 화면에만 있고 새로고침하면 사라집니다. [데이터 관리]에서 백업 파일을 받아 두세요.`, 'bad');
    } else {
      unsaved.clear();
      keepOrClearPending();
      MD.store.lastSave = { ok: true, at: new Date().toISOString() };
    }
    MD.buildIndex();
    if (MD.saveStateChanged) MD.saveStateChanged();
    return !failed;
  }

  function resetToSample() {
    for (const k of [...KEYS, 'meta']) U.store.del(k);
    if (useIDB()) {
      return new Promise((resolve) => {
        let conflict = false, finished = false, resetMeta = null;
        const finish = (ok) => {
          if (finished) return; finished = true;
          if (ok) {
            build((k) => (k === 'meta' ? resetMeta : null)); // 예시 자료 — 세대는 초기화 전보다 하나 큼
            MD.store.lastSave = { ok: true, at: new Date().toISOString() }; unsaved.clear();
            if (bc) bc.postMessage({ type: 'saved', gen: resetMeta.gen });
          } else {
            U.toast(conflict ? '다른 탭에서 자료가 먼저 저장돼 예시로 되돌리지 않았습니다. 새로고침 후 다시 하세요.' : '저장된 자료를 지우지 못해 예시로 되돌리지 않았습니다(기존 자료 그대로).', 'bad');
          }
          if (MD.saveStateChanged) MD.saveStateChanged();
          resolve(ok);
        };
        let tx;
        try { tx = db.transaction(IDB_STORE, 'readwrite'); } catch (e) { finish(false); return; }
        const st = tx.objectStore(IDB_STORE), g = st.get('meta');
        g.onsuccess = () => {
          const cur = (g.result && g.result.gen) || 0;
          if (cur !== (MD.store.gen || 0)) { conflict = true; tx.abort(); return; }
          for (const k of KEYS) st.delete(k);
          // meta는 지우지 않고 세대를 올린다 — 세대가 0으로 돌아가면 초기화 전 자료를 연 다른 탭의 저장이 충돌 검사를 통과한다 (R3-02)
          resetMeta = { isSample: true, savedAt: new Date().toISOString(), gen: cur + 1 };
          st.put(resetMeta, 'meta');
        };
        tx.oncomplete = () => finish(true);
        tx.onabort = tx.onerror = () => finish(false);
      });
    }
    load();
    return true;
  }

  function startEmpty() {
    MD.data = { isSample: false, channels: [], products: [], sales: [], traffic: [], promotions: [], vendors: [], pos: [], candidates: [], targets: [], ads: [], closes: {}, compete: [], events: [], reports: [] };
    save();
  }

  // 판매 데이터를 실제 데이터로 처음 넣을 때 예시 데이터를 걷어낸다.
  // 단, 사용자가 화면에서 직접 고친 채널·상품(userSet)은 남긴다 — 예시 수수료가 실제 값처럼 남지 않도록 고친 것만.
  // 예시 목표에서 예시 필드를 지우고, 사용자가 입력한 필드가 하나도 없는 행은 버린다
  function realTargets(list) {
    return (list || []).map((t) => {
      const o = { ...t }, fake = o.sampleFields || (o.sample ? TARGET_FIELDS : []);
      fake.forEach((k) => delete o[k]); delete o.sample; delete o.sampleFields;
      return o;
    }).filter((o) => TARGET_FIELDS.some((k) => o[k] !== '' && o[k] != null));
  }

  function ensureReal() {
    if (!MD.data.isSample) return;
    const mine = (list) => (list || []).filter((x) => x.userSet);
    const keep = { vendors: [], pos: [], candidates: [], promotions: [] };
    MD.data = { isSample: false, channels: mine(MD.data.channels), products: mine(MD.data.products), sales: [], traffic: [], ...keep, targets: realTargets(MD.data.targets), ads: [], closes: {}, compete: [], events: (MD.data.events || []).filter((e) => !e.sample), reports: [] };
  }

  MD.buildIndex = function () {
    const d = MD.data;
    d.targets = cleanTargets(Array.isArray(d.targets) ? d.targets : []);
    if (!Array.isArray(d.ads)) d.ads = [];
    if (!Array.isArray(d.compete)) d.compete = [];
    if (!Array.isArray(d.events)) d.events = [];
    if (!Array.isArray(d.reports)) d.reports = [];
    d.compete.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    if (!d.closes || typeof d.closes !== 'object' || Array.isArray(d.closes)) d.closes = {};
    d.ads.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    d.productMap = Object.fromEntries(d.products.map((p) => [p.sku, p]));
    d.channelMap = Object.fromEntries(d.channels.map((c) => [c.name, c]));
    d.sales.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    d.traffic.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    d.minDate = d.sales.length ? d.sales[0].date : null;
    d.maxDate = d.sales.length ? d.sales[d.sales.length - 1].date : null;
  };

  // ---------- 계산 ----------
  // 매출은 VAT 포함 실결제액으로 받는다.
  // 순매출 = 매출/1.1, 수수료 = 매출×수수료율/1.1, 매출총이익 = 순매출 − 수수료 − 원가, 공헌이익 = 매출총이익 − 광고비/1.1
  function inRange(rows, s, e) {
    // 날짜 정렬을 이용한 이진 탐색
    let lo = 0, hi = rows.length;
    while (lo < hi) { const m = (lo + hi) >> 1; rows[m].date < s ? (lo = m + 1) : (hi = m); }
    const out = [];
    for (let i = lo; i < rows.length && rows[i].date <= e; i++) out.push(rows[i]);
    return out;
  }

  // 계산 기준(로드맵 3순위 '정의 확정'): 공헌이익에 뺄 광고비 출처, 판매 자료의 취소·반품 처리 방식(표시만).
  // 설정은 작아서 localStorage('basis')에 두고(백업 extras에 포함), 집계마다 읽지 않도록 메모리에 둔다
  let basisCache = null;
  function basis() {
    if (!basisCache) basisCache = { adSource: 'traffic', returns: '', ...U.store.get('basis', {}) };
    return basisCache;
  }
  // 저장소의 basis가 다른 경로(백업 복원)로 바뀌었을 때 메모리 값을 버리고 다시 읽는다 (Codex 기능 L R1-01)
  function reloadBasis() { basisCache = null; return basis(); }
  function setBasis(patch) {
    const next = { ...basis(), ...patch };
    if (!U.store.set('basis', next)) return false;
    basisCache = next;
    return true;
  }
  const RETURNS_TEXT = { net: '판매 자료 매출은 취소·반품을 뺀 금액(순결제)', gross: '판매 자료 매출은 취소·반품을 빼기 전 금액 — 실제보다 클 수 있음', '': '확인 안 됨 — [데이터 관리 → 계산 기준]에서 판매 자료의 취소·반품 처리 방식을 고르세요' };
  // 보고서·확정본에 함께 남기는 계산 기준과 그 기간 자료의 상태(대체값·0 입력 등)
  function basisLines(cur) {
    const d = MD.data, b = basis(), s = cur.sum;
    const sold = new Map(); for (const r of cur.sales) sold.set(r.sku, (sold.get(r.sku) || 0) + r.sales);
    const noCost = [...sold.keys()].filter((k) => !(d.productMap[k] && d.productMap[k].cost > 0));
    const noCostSales = noCost.reduce((a, k) => a + sold.get(k), 0);
    const usedCh = new Set(cur.sales.map((r) => r.channel));
    const noFee = d.channels.filter((c) => usedCh.has(c.name) && !(c.fee > 0)).map((c) => c.name);
    const ordSub = cur.sales.filter((r) => r.ordSrc === 'qty').length;
    return [
      { item: '매출·VAT', rule: '매출은 VAT 포함 실결제액, 순매출 = 매출 ÷ 1.1', fact: '' },
      { item: '취소·반품', rule: RETURNS_TEXT[b.returns] || RETURNS_TEXT[''], fact: '', warn: !b.returns },
      { item: '주문 수', rule: '판매 자료의 주문수 열, 없으면 수량으로 대체', fact: cur.sales.length ? `이 기간 ${U.num(cur.sales.length)}행 중 수량으로 대체 ${U.num(ordSub)}행` : '', warn: ordSub > 0 },
      { item: '원가', rule: '상품 마스터의 현재 입고원가(VAT 제외)를 기간 전체에 적용', fact: noCost.length ? `원가 0·미등록 상품 ${noCost.length}개(매출 비중 ${U.pct(s.sales ? noCostSales / s.sales : 0)}) — 이익이 부풀려짐` : '판매 상품 모두 원가 입력됨', warn: noCost.length > 0 },
      { item: '수수료', rule: '채널의 현재 수수료율을 기간 전체에 적용(매출 × 수수료율 ÷ 1.1)', fact: noFee.length ? `수수료 0% 채널 ${noFee.length}개(${noFee.slice(0, 3).join(', ')})` : '', warn: noFee.length > 0 },
      { item: '공헌이익 광고비', rule: b.adSource === 'ads' ? '광고 리포트의 광고비' : '유입 파일의 광고비', fact: `이 기간 유입 파일 ${U.won(s.ad)} · 광고 리포트 ${U.won(s.adSpend)}`, warn: Math.abs(s.ad - s.adSpend) > Math.max(s.ad, s.adSpend) * 0.05 && s.ad > 0 && s.adSpend > 0 },
      { item: '광고 ROAS', rule: '광고 리포트의 광고 매출 ÷ 광고비(광고 매출이 있는 행만)', fact: s.adRevMiss ? `광고 매출 없는 행 ${U.num(s.adRevMiss)}개 제외` : '', warn: false },
    ];
  }

  // ads(광고 리포트)를 주면 ROAS = 광고 매출 ÷ 광고비(광고 매출이 있는 행만). 광고 리포트가 없으면 ROAS는 null.
  // z.ad는 유입 파일의 광고비, 광고 리포트 광고비는 z.adSpend. 공헌이익은 계산 기준(adSource)에서 고른 쪽을 뺀다.
  function summarize(sales, traffic, ads) {
    const d = MD.data;
    const z = { sales: 0, qty: 0, orders: 0, discount: 0, fee: 0, cogs: 0, ad: 0, visits: 0 };
    for (const r of sales) {
      const ch = d.channelMap[r.channel], p = d.productMap[r.sku];
      z.sales += r.sales; z.qty += r.qty; z.orders += r.orders || r.qty; z.discount += r.discount || 0;
      z.fee += (r.sales * (ch ? ch.fee : 0)) / 1.1;
      z.cogs += r.qty * (p ? p.cost : 0);
    }
    for (const t of traffic || []) { z.ad += t.ad || 0; z.visits += t.visits || 0; }
    z.adSpend = 0; z.adRev = 0; z.adRevSpend = 0; z.adRows = 0; z.adRevMiss = 0;
    for (const a of ads || []) {
      z.adRows++; z.adSpend += a.spend || 0;
      if (a.revenue == null || (a.miss || []).includes('revenue')) { z.adRevMiss++; continue; }
      z.adRev += a.revenue; z.adRevSpend += a.spend || 0;
    }
    z.net = z.sales / 1.1;
    z.gross = z.net - z.fee - z.cogs;
    z.contribAd = basis().adSource === 'ads' ? z.adSpend : z.ad;
    z.contrib = z.gross - z.contribAd / 1.1;
    z.margin = z.net ? z.gross / z.net : null;
    z.roas = z.adRevSpend ? z.adRev / z.adRevSpend : null;
    z.salesPerAd = z.ad ? z.sales / z.ad : null; // 예전 정의(전체 매출 ÷ 유입 파일 광고비) — 참고용
    z.cvr = z.visits ? z.orders / z.visits : null;
    z.aov = z.orders ? z.sales / z.orders : null;
    return z;
  }

  function period(s, e, filter) {
    const d = MD.data;
    let sales = inRange(d.sales, s, e), traffic = inRange(d.traffic, s, e), ads = inRange(d.ads || [], s, e);
    // 광고 리포트 행에도 채널이 있으므로 유입 필터를 그대로 쓴다
    if (filter) { sales = sales.filter(filter.sale || (() => true)); traffic = traffic.filter(filter.traffic || (() => true)); ads = ads.filter(filter.traffic || (() => true)); }
    return { sales, traffic, ads, sum: summarize(sales, traffic, ads) };
  }

  function addMonths(s, n) {
    const [y, m, d] = s.split('-').map(Number);
    const t = new Date(Date.UTC(y, m - 1 + n, 1)), last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate();
    return U.fmt(new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), Math.min(d, last))));
  }
  function compareRange(s, e, mode) {
    if (mode === 'yoy') return [U.addYears(s, -1), U.addYears(e, -1)];
    // 전월 동기간: 10/1~10/29 → 9/1~9/29. 끝날이 그 달 말일이면 비교 달의 말일까지 (10/1~10/31 → 9/1~9/30)
    if (mode === 'mom') {
      const [y, m] = e.split('-').map(Number), lastE = new Date(Date.UTC(y, m, 0)).getUTCDate() === Number(e.slice(8));
      const ce = lastE ? U.fmt(new Date(Date.UTC(y, m - 1, 0))) : addMonths(e, -1);
      return [addMonths(s, -1), ce];
    }
    const len = U.diffDays(s, e) + 1;
    return [U.addDays(s, -len), U.addDays(s, -1)];
  }

  // 키별 집계 (채널·상품·카테고리 등)
  function by(sales, traffic, keyFn, trafficKeyFn, ads) {
    const sg = U.groupBy(sales, keyFn);
    const tg = trafficKeyFn ? U.groupBy(traffic, trafficKeyFn) : new Map();
    const ag = trafficKeyFn && ads ? U.groupBy(ads, trafficKeyFn) : new Map();
    const keys = new Set([...sg.keys(), ...tg.keys(), ...ag.keys()]);
    const out = new Map();
    for (const k of keys) out.set(k, summarize(sg.get(k) || [], tg.get(k) || [], ag.get(k) || []));
    return out;
  }

  // ---------- 자료 마감 확인 ----------
  // closes: { 채널명: { sales: 'YYYY-MM-DD', traffic, ads, at } } — 사용자가 "이 날까지 자료가 다 들어왔다"고 확인한 날.
  // 행이 있는 마지막 날(maxDate)과 다르다: 무판매일·늦게 들어오는 정산 자료가 있어 마지막 행만으로는 완결을 알 수 없다.
  const closeOf = (ch, src) => ((MD.data.closes || {})[ch] || {})[src] || null;
  function setClose(ch, src, date) {
    const d = MD.data, c = (d.closes[ch] = { ...(d.closes[ch] || {}) });
    if (date) c[src] = date; else delete c[src];
    delete c.sample; c.at = new Date().toISOString();
  }
  // 판매 실적 기준일: 판매가 있는 모든 채널의 판매 마감 확인일 중 가장 이른 날(자료 마지막 날을 넘지 않음).
  // 확인 안 된 채널이 있으면 자료 마지막 날을 쓰되, 미확인 채널 목록을 돌려줘 화면이 경고하게 한다.
  function salesAsOf() {
    const d = MD.data;
    if (!d.maxDate) return { date: null, confirmed: false, unconfirmed: [] };
    const chs = [...new Set(d.sales.map((r) => r.channel))];
    const unconfirmed = chs.filter((c) => !closeOf(c, 'sales'));
    if (unconfirmed.length) return { date: d.maxDate, confirmed: false, unconfirmed };
    const min = chs.map((c) => closeOf(c, 'sales')).sort()[0];
    return { date: min < d.maxDate ? min : d.maxDate, confirmed: true, unconfirmed: [] };
  }

  // 채널명 변경: 채널을 이름으로 연결하므로 판매·유입·광고·목표·행사·마감 확인의 이름도 함께 바꾼다
  function channelRefs(name) {
    const d = MD.data, n = (list) => (list || []).filter((r) => r.channel === name).length;
    return { sales: n(d.sales), traffic: n(d.traffic), ads: n(d.ads), targets: n(d.targets), promotions: n(d.promotions), closes: d.closes && d.closes[name] ? 1 : 0 };
  }
  function renameChannel(from, to) {
    const d = MD.data;
    if (from === to) return; // 같은 이름이면 아무것도 바꾸지 않는다 (마감 확인을 지웠다가 다시 쓰는 일 방지)
    for (const k of ['sales', 'traffic', 'ads', 'targets', 'promotions']) for (const r of d[k] || []) if (r.channel === from) r.channel = to;
    if (d.closes && d.closes[from]) { d.closes[to] = d.closes[from]; delete d.closes[from]; }
  }

  // ---------- 목표 ----------
  // targets: [{ month: 'YYYY-MM', channel: 채널명 | ''(전사), sales, adBudget, margin, roas, cvr, memo, updatedAt, sampleFields }]
  // 채널 행은 매출·ROAS·전환율 목표, 전사('') 행은 광고비 예산·이익률·ROAS(광고 집행 채널 합계)·전환율 목표·근거 메모를 담는다.
  // 전사 매출 목표는 채널 목표의 합이다. 전사 ROAS·전환율 목표는 채널에 상속하지 않는다.
  const TARGET_FIELDS = ['sales', 'adBudget', 'margin', 'roas', 'cvr', 'memo'];
  // 월·채널당 한 행, 유효한 월, 유한하고 0 이상인 숫자만 남긴다 (같은 키가 여러 개면 마지막 것).
  function cleanTargets(list) {
    const m = new Map();
    for (const t of list || []) {
      if (!t || !/^\d{4}-(0[1-9]|1[0-2])$/.test(t.month || '')) continue;
      const o = { ...t, channel: String(t.channel ?? '') };
      for (const k of ['sales', 'adBudget', 'margin', 'roas', 'cvr']) {
        if (o[k] === '' || o[k] == null) { delete o[k]; continue; }
        const v = Number(o[k]);
        // 비율 목표(ROAS·전환율)는 0보다 커야 의미가 있다
        if (!Number.isFinite(v) || v < 0 || ((k === 'roas' || k === 'cvr') && v === 0)) delete o[k]; else o[k] = v;
      }
      m.set(o.month + '|' + o.channel, o);
    }
    return [...m.values()];
  }
  const targetRow = (channel, month) => (MD.data.targets || []).find((x) => x.month === month && x.channel === channel);

  // 채널의 그 달 매출 목표와 출처: 'month'(그 달에 입력) · 'default'(채널 기본 월 목표로 대체) · 'none'(미설정)
  // 미설정은 0으로 바꾸지 않는다 — 호출하는 쪽이 '판정 보류'로 표시해야 한다.
  function targetInfo(channel, month) {
    const t = targetRow(channel, month);
    if (t && t.sales != null) return { amount: t.sales, source: 'month' };
    const c = MD.data.channelMap[channel];
    if (c && Number(c.target) > 0) return { amount: Number(c.target), source: 'default' };
    return { amount: null, source: 'none' };
  }
  const salesTargetOf = (channel, month) => targetInfo(channel, month).amount || 0;

  function setTarget(month, channel, field, value) {
    const d = MD.data;
    let t = targetRow(channel, month);
    if (!t) { t = { month, channel }; d.targets.push(t); }
    if (value === '' || value == null) delete t[field]; else t[field] = value;
    // 예시 행이면 고친 필드만 예시 표시에서 뺀다 (이전 형식 sample: true는 모든 필드를 예시로 본다)
    if (t.sample && !t.sampleFields) t.sampleFields = TARGET_FIELDS;
    delete t.sample;
    if (t.sampleFields) { t.sampleFields = t.sampleFields.filter((k) => k !== field); if (!t.sampleFields.length) delete t.sampleFields; }
    t.updatedAt = new Date().toISOString();
    d.targets = cleanTargets(d.targets).filter((x) => Object.keys(x).some((k) => TARGET_FIELDS.includes(k) && x[k] !== '' && x[k] != null));
  }

  function monthTarget(channel, s, e) {
    // 이름과 달리 '선택 기간에 배분된 매출 목표'다: 그 달 목표 ÷ 그 달 일수를 기간의 날마다 더한다 (미설정 채널은 0)
    const d = MD.data;
    const list = channel ? [channel].filter((n) => d.channelMap[n]) : d.channels.map((c) => c.name);
    let t = 0;
    for (const day of U.dateRange(s, e)) {
      const dt = U.toDate(day);
      const dim = new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth() + 1, 0)).getUTCDate();
      for (const n of list) t += salesTargetOf(n, day.slice(0, 7)) / dim;
    }
    return t;
  }

  // 공휴일 기본값. 정부 공식 발표로 직접 확인한 목록은 아니므로, 달라지면 [매출 변동 분석 → 이슈 기록]에 '공휴일'로 추가해 보정한다
  MD.HOLIDAYS = {
    '2025-01-01': '신정', '2025-01-27': '임시공휴일', '2025-01-28': '설 연휴', '2025-01-29': '설날', '2025-01-30': '설 연휴', '2025-03-03': '삼일절 대체',
    '2025-05-05': '어린이날·부처님오신날', '2025-05-06': '대체공휴일', '2025-06-03': '대통령 선거', '2025-06-06': '현충일', '2025-08-15': '광복절',
    '2025-10-03': '개천절', '2025-10-05': '추석 연휴', '2025-10-06': '추석', '2025-10-07': '추석 연휴', '2025-10-08': '대체공휴일', '2025-10-09': '한글날', '2025-12-25': '성탄절',
    '2026-01-01': '신정', '2026-02-16': '설 연휴', '2026-02-17': '설날', '2026-02-18': '설 연휴', '2026-03-02': '삼일절 대체', '2026-05-05': '어린이날',
    '2026-05-25': '부처님오신날 대체', '2026-06-03': '지방선거', '2026-08-17': '광복절 대체', '2026-09-24': '추석 연휴', '2026-09-25': '추석', '2026-09-26': '추석 연휴',
    '2026-10-05': '개천절 대체', '2026-10-09': '한글날', '2026-12-25': '성탄절',
  };

  // 섞였을 수 있는 상태를 사용자가 확인하고 이대로 쓰기로 했을 때: 현재 화면 자료 전체를 다시 저장해 시점을 맞춘다
  // 불완전 표시를 해제하고 전체를 저장한다. 저장이 실패하면 표시를 되살린다 (확인·백업 복원 공통)
  function saveAllClearingInterrupted() {
    if (useIDB()) return save();
    const prev = MD.store.interrupted;
    MD.store.interrupted = null;
    const ok = save();
    if (!ok) {
      if (MD.store.interrupted) {
        // 이번 저장에서 새로 되돌리지 못한 키가 생겼다 — 이전 불완전 키와 합쳐 보존
        const it = { at: MD.store.interrupted.at, keys: [...new Set([...MD.store.interrupted.keys, ...(prev ? prev.keys : [])])] };
        MD.store.interrupted = it; U.store.set('pending', it);
      } else { MD.store.interrupted = prev; keepOrClearPending(); } // 완전히 되돌림 — 저장 전 상태 그대로
    }
    if (MD.saveStateChanged) MD.saveStateChanged();
    return ok;
  }
  const acceptInterrupted = saveAllClearingInterrupted;
  MD.store = { load, save, resetToSample, startEmpty, ensureReal, generateSample, acceptInterrupted, saveAllClearingInterrupted, recoverLegacy, discardLegacy, legacy: null, lastSave: null, interrupted: null, saving: Promise.resolve(true), gen: 0, KEYS, unsavedKeys: () => [...unsaved], backend: () => (useIDB() ? 'IndexedDB' : 'localStorage') };
  MD.calc = { basis, setBasis, reloadBasis, basisLines, inRange, summarize, period, compareRange, by, monthTarget, salesTargetOf, targetInfo, targetRow, setTarget, cleanTargets, closeOf, setClose, salesAsOf, channelRefs, renameChannel };
})();
