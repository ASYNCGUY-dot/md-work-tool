// 공통 유틸: 숫자·날짜 포맷, CSV 파싱, 다운로드, 난수, 저장소
window.MD = window.MD || {};

MD.util = (function () {
  const won = (n) => (n == null || isNaN(n) ? '-' : Math.round(n).toLocaleString('ko-KR') + '원');
  const num = (n, d = 0) => (n == null || isNaN(n) ? '-' : Number(n).toLocaleString('ko-KR', { maximumFractionDigits: d, minimumFractionDigits: d }));
  const pct = (n, d = 1) => (n == null || !isFinite(n) ? '-' : (n * 100).toFixed(d) + '%');

  // 억/만 단위 축약: 보고용
  function krw(n) {
    if (n == null || isNaN(n)) return '-';
    const a = Math.abs(n), s = n < 0 ? '-' : '';
    if (a >= 1e8) return s + (a / 1e8).toFixed(2) + '억';
    if (a >= 1e4) return s + Math.round(a / 1e4).toLocaleString('ko-KR') + '만';
    return s + Math.round(a).toLocaleString('ko-KR');
  }

  // 증감률 (분모 0이면 null — 0으로 오해하지 않도록)
  const delta = (cur, prev) => (prev ? (cur - prev) / Math.abs(prev) : null);

  function deltaHtml(d, invert = false) {
    if (d == null || !isFinite(d)) return '<span class="delta flat">비교 불가</span>';
    const up = d > 0.0005, down = d < -0.0005;
    const good = invert ? down : up, bad = invert ? up : down;
    const cls = good ? 'good' : bad ? 'bad' : 'flat';
    const arrow = up ? '▲' : down ? '▼' : '–';
    return `<span class="delta ${cls}">${arrow} ${Math.abs(d * 100).toFixed(1)}%</span>`;
  }

  // 날짜는 'YYYY-MM-DD' 문자열로 다룬다 (시간대 문제 회피)
  function toDate(s) { const [y, m, d] = s.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); }
  function fmt(d) { return d.toISOString().slice(0, 10); }
  function addDays(s, n) { const d = toDate(s); d.setUTCDate(d.getUTCDate() + n); return fmt(d); }
  function diffDays(a, b) { return Math.round((toDate(b) - toDate(a)) / 86400000); }
  // 2/29의 전년 동기는 2/28로 맞춘다 (3/1로 넘어가 비교 기간이 하루 늘지 않도록)
  function addYears(s, n) {
    const [y, m, d] = s.split('-').map(Number);
    const last = new Date(Date.UTC(y + n, m, 0)).getUTCDate();
    return fmt(new Date(Date.UTC(y + n, m - 1, Math.min(d, last))));
  }
  // 업로드 날짜 정규화: 2026-1-5, 2026/01/05, 2026.1.5, 20260105, '2026-01-05 13:20' → '2026-01-05'.
  // 달력에 없는 날짜(2026-02-31)나 알 수 없는 형식은 null
  function normDate(s) {
    s = String(s ?? '').trim();
    const m = s.match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})(?!\d)/) || s.match(/^(\d{4})(\d{2})(\d{2})$/);
    if (!m) return null;
    const v = `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
    return fmt(toDate(v)) === v ? v : null;
  }
  function today() { const d = new Date(); return fmt(new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))); }
  function dateRange(a, b) { const out = []; for (let s = a; s <= b; s = addDays(s, 1)) out.push(s); return out; }
  function weekday(s) { return '일월화수목금토'[toDate(s).getUTCDay()]; }

  // 시드 고정 난수: 예시 데이터가 매번 같게
  function rng(seed) {
    let t = seed >>> 0;
    return function () {
      t += 0x6d2b79f5;
      let r = Math.imul(t ^ (t >>> 15), 1 | t);
      r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
  }

  // 따옴표·줄바꿈을 처리하는 CSV 파서
  // CSV 텍스트 → 칸 배열의 배열 (빈 줄 제외). parseCSV와 가져오기 전 확인 화면(열 이름 행 고르기)이 함께 쓴다
  function csvGrid(text) {
    text = text.replace(/^﻿/, '');
    const rows = []; let row = [], cell = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) {
        if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
        else if (c === '"') q = false;
        else cell += c;
      } else if (c === '"') q = true;
      else if (c === ',') { row.push(cell); cell = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(cell); rows.push(row); row = []; cell = '';
      } else cell += c;
    }
    if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
    return rows;
  }
  function parseCSV(text) {
    const clean = csvGrid(text).filter((r) => r.some((v) => v.trim() !== ''));
    if (!clean.length) return [];
    const head = clean[0].map((h) => h.trim());
    return clean.slice(1).map((r) => Object.fromEntries(head.map((h, i) => [h, (r[i] ?? '').trim()])));
  }

  function toCSV(rows, cols) {
    cols = cols || (rows[0] ? Object.keys(rows[0]) : []);
    const esc = (v) => { v = v == null ? '' : String(v); return /[",\r\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
    return '﻿' + [cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n');
  }

  function download(name, content, type = 'text/csv;charset=utf-8') {
    const blob = content instanceof Blob ? content : new Blob([content], { type });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  // 엑셀(xlsx)로 여러 시트 내보내기. SheetJS가 없으면 CSV로 대체
  function exportXlsx(name, sheets) {
    if (!window.XLSX) {
      const first = Object.entries(sheets)[0];
      download(name.replace(/\.xlsx$/, '.csv'), toCSV(first[1]));
      return;
    }
    const wb = XLSX.utils.book_new();
    for (const [sheet, rows] of Object.entries(sheets)) {
      const ws = XLSX.utils.json_to_sheet(rows);
      // 이름이 률·율·비중·ROAS·리프트·증감·변화·폭으로 끝나는 열의 숫자는 비율(0.12)이므로 % 서식을 붙인다
      const heads = rows.length ? Object.keys(rows[0]) : [];
      heads.forEach((h, c) => {
        if (!/(률|율|비중|ROAS|리프트|증감|변화|폭)$/.test(h)) return; // '목표 이익률 판매가'처럼 금액 열은 제외
        for (let r = 1; r <= rows.length; r++) { const cell = ws[XLSX.utils.encode_cell({ r, c })]; if (cell && cell.t === 'n') cell.z = '0.0%'; }
      });
      XLSX.utils.book_append_sheet(wb, ws, sheet.slice(0, 31));
    }
    XLSX.writeFile(wb, name);
  }

  // CSV·XLSX 파일을 행 배열로 읽기
  // 엑셀 시트 → 행 배열. 금액·% 등은 표시 문자열(raw:false)로 읽되, 날짜 서식 숫자 셀은 일련번호를 연·월·일로 직접 바꿔 YYYY-MM-DD로 쓴다.
  // JS Date(cellDates)를 거치면 1899년 기준일의 옛 시간대 차이 때문에 한국 시간에서 하루가 당겨진다(2026-10-01 → 09-30, 2026-10-30 브라우저 재현).
  function fixDateCells(sheet) {
    for (const a in sheet) {
      if (a[0] === '!') continue;
      const c = sheet[a];
      let v = null;
      if (c.t === 'n' && c.z && XLSX.SSF && XLSX.SSF.is_date(c.z)) {
        const p = XLSX.SSF.parse_date_code(c.v);
        if (p) v = `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`;
      } else if (c.t === 'd' && c.v instanceof Date && !isNaN(c.v)) {
        // 이미 Date인 셀: 자정 직전(23:28 등)으로 밀린 값도 같은 날이 되도록 12시간을 더해 로컬 날짜로 반올림
        const t = new Date(c.v.getTime() + 12 * 3600 * 1000);
        v = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
      }
      if (v) { c.t = 's'; c.v = v; c.w = v; delete c.z; }
    }
  }
  function sheetRows(sheet) {
    fixDateCells(sheet);
    return XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false });
  }
  // 파일 → [{ name: 시트 이름, grid: 칸 배열의 배열 }]. 열 이름 행을 정하기 전 단계라 첫 행을 열 이름으로 가정하지 않는다.
  // 날짜·금액 처리는 readTable과 같다(fixDateCells, raw:false). CSV는 시트 하나로 본다
  function readGrid(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      const isX = /\.xlsx?$/i.test(file.name);
      r.onerror = () => reject(r.error);
      r.onload = () => {
        try {
          if (isX) {
            if (!window.XLSX) throw new Error('엑셀 라이브러리를 불러오지 못했습니다. CSV로 저장해 올려주세요.');
            const wb = XLSX.read(r.result, { type: 'array', cellNF: true });
            resolve(wb.SheetNames.map((name) => {
              const sh = wb.Sheets[name];
              fixDateCells(sh);
              const grid = XLSX.utils.sheet_to_json(sh, { header: 1, defval: '', raw: false, blankrows: true }).map((row) => row.map((v) => String(v ?? '').trim()));
              return { name, grid, start: sh['!ref'] ? XLSX.utils.decode_range(sh['!ref']).s.r : 0 }; // grid[i]는 엑셀 start+i+1행
            }));
          } else resolve([{ name: file.name, grid: csvGrid(r.result).map((row) => row.map((v) => v.trim())), start: 0 }]);
        } catch (e) { reject(e); }
      };
      isX ? r.readAsArrayBuffer(file) : r.readAsText(file, 'utf-8');
    });
  }

  function readTable(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      const isX = /\.xlsx?$/i.test(file.name);
      r.onerror = () => reject(r.error);
      r.onload = () => {
        try {
          if (isX) {
            if (!window.XLSX) throw new Error('엑셀 라이브러리를 불러오지 못했습니다. CSV로 저장해 올려주세요.');
            const wb = XLSX.read(r.result, { type: 'array', cellNF: true });
            resolve(sheetRows(wb.Sheets[wb.SheetNames[0]]));
          } else resolve(parseCSV(r.result));
        } catch (e) { reject(e); }
      };
      isX ? r.readAsArrayBuffer(file) : r.readAsText(file, 'utf-8');
    });
  }

  const store = {
    get(k, fallback) { try { const v = localStorage.getItem('mdwt:' + k); return v ? JSON.parse(v) : fallback; } catch (e) { return fallback; } },
    set(k, v) { try { localStorage.setItem('mdwt:' + k, JSON.stringify(v)); return true; } catch (e) { return false; } },
    del(k) { try { localStorage.removeItem('mdwt:' + k); } catch (e) { /* 무시 */ } },
  };

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function groupBy(rows, keyFn) {
    const m = new Map();
    for (const r of rows) { const k = keyFn(r); if (!m.has(k)) m.set(k, []); m.get(k).push(r); }
    return m;
  }

  function toast(msg, kind = '') {
    const el = document.createElement('div');
    el.className = 'toast ' + kind; el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => el.classList.add('show'), 10);
    setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 300); }, 2600);
  }

  return { sheetRows, won, num, pct, krw, delta, deltaHtml, toDate, fmt, normDate, addDays, diffDays, addYears, today, dateRange, weekday, rng, parseCSV, toCSV, download, exportXlsx, readTable, readGrid, store, esc, groupBy, toast };
})();
