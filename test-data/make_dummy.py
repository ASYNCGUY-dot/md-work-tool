# 화면 점검용 더미 업무 파일 생성기 (가상 회사·가상 브랜드, 실제 데이터 아님)
# 실행: python test-data/make_dummy.py  → test-data/ 아래에 업로드용 파일과 기대값(expected.json)을 만든다
import csv, json, random, os, datetime as dt
from collections import defaultdict
from openpyxl import Workbook

OUT = os.path.dirname(os.path.abspath(__file__))
R = random.Random(20261030)
END = dt.date(2026, 10, 29)
START = dt.date(2025, 11, 1)
D = lambda d: d.isoformat()

# 채널: 수수료 표기를 일부러 섞는다 (5.5% / 0.108 / 13)
CHANNELS = [
    ('네이버 스마트스토어', '오픈마켓', '5.5%', 0.055, '45,000,000원', 26, 650),
    ('쿠팡', '오픈마켓', '0.108', 0.108, '50,000,000', 30, 520),
    ('지그재그', '버티컬', '13', 0.13, '15,000,000', 9, 420),
    ('자사몰', '자사몰', '3.3%', 0.033, '8,000,000', 6, 900),
    ('카카오톡 선물하기', '선물하기', '0.15', 0.15, '7,000,000', 5, 0),
]  # 이름, 유형, 수수료 원문, 수수료 값, 월목표 원문, 일 주문 기준, 목표 ROAS(%)/0=광고 없음

PRODUCTS = [  # SKU, 상품명, 브랜드, 분류, 시즌, 판매가, 원가, 재고, 인기 가중치
    ('HL-101', '린넨 워셔블 침구 세트 Q', '하루리빙', '침구', '사계절', 89000, 41000, 140, 3),
    ('HL-102', '마이크로 모달 여름 이불', '하루리빙', '침구', 'S/S', 59000, 26000, 60, 2),
    ('HL-103', '구스 다운 겨울 이불 Q', '하루리빙', '침구', 'F/W', 159000, 82000, 35, 2),
    ('KC-201', '스테인리스 3중 냄비 20cm', '키친온', '주방', '사계절', 49000, 21000, 220, 4),
    ('KC-202', '세라믹 논스틱 프라이팬 28cm', '키친온', '주방', '사계절', 39000, 15500, 30, 5),
    ('KC-203', '내열유리 밀폐용기 10종', '키친온', '주방', '사계절', 32900, 13000, 400, 4),
    ('KC-204', '원목 도마 대형', '키친온', '주방', '사계절', 28000, 9800, 12, 2),
    ('BT-301', '세라마이드 수분 크림 50ml', '오늘피부', '뷰티', '사계절', 32000, 8900, 900, 6),
    ('BT-302', '저자극 선크림 SPF50+', '오늘피부', '뷰티', 'S/S', 24000, 6500, 600, 5),
    ('BT-303', '비타민C 앰플 30ml', '오늘피부', '뷰티', '사계절', 38000, 11000, 18, 3),
    ('BT-304', '립 컨디셔닝 밤 3종', '오늘피부', '뷰티', 'F/W', 18000, 4200, 300, 3),
    ('HM-401', '무드 LED 수면등', '모아홈', '홈데코', '사계절', 29900, 11500, 150, 2),
    ('HM-402', '디퓨저 200ml 우드', '모아홈', '홈데코', '사계절', 26000, 7800, 260, 3),
    ('HM-403', '극세사 러그 160x230', '모아홈', '홈데코', 'F/W', 69000, 33000, 25, 1),
    ('HM-404', '접이식 빨래 건조대', '모아홈', '홈데코', '사계절', 35000, 17500, 0, 1),
]
PMAP = {p[0]: p for p in PRODUCTS}
ORPHAN = 'TMP-999'  # 마스터에 없는 SKU → 업로드 시 자동 등록되어야 함

PROMOS = [  # id, 이름, 채널, 유형, 시작, 종료, 할인율, 예산, 카테고리, 판매 증가배수
    ('PR-A', '가을 키친 위크', '네이버 스마트스토어', '기획전', '2026-09-14', '2026-09-20', 0.15, 2000000, ['주방'], 2.6),
    ('PR-B', '쿠팡 뷰티 타임딜', '쿠팡', '타임딜', '2026-10-10', '2026-10-11', 0.2, 1500000, ['뷰티'], 3.2),
    ('PR-C', '지그재그 여름 침구전', '지그재그', '기획전', '2026-07-01', '2026-07-07', 0.2, 3000000, ['침구'], 1.1),
    ('PR-D', '11.11 홈데코 특가', '쿠팡', '타임딜', '2026-11-11', '2026-11-13', 0.15, 1000000, ['홈데코'], 1.0),
]

def season_w(p, d):
    s, m = p[4], d.month
    if s == 'S/S': return 1.6 if m in (5, 6, 7, 8) else 0.35
    if s == 'F/W': return 1.7 if m in (11, 12, 1, 2) else 0.4
    return 1.0

def promo_for(ch, cat, d):
    for pr in PROMOS:
        if pr[2] == ch and pr[4] <= D(d) <= pr[5] and cat in pr[8]: return pr
    return None

def poisson(l):
    import math
    if l <= 0: return 0
    L, k, p = math.exp(-l), 0, 1.0
    while True:
        k += 1; p *= R.random()
        if p <= L or k > 200: return k - 1

def fmt_date(d):  # 5%는 2026.7.3, 3%는 20260703 형식으로 섞는다
    x = R.random()
    if x < 0.05: return f'{d.year}.{d.month}.{d.day}'
    if x < 0.08: return d.strftime('%Y%m%d')
    return D(d)

lines, agg, traffic, orders = [], {}, [], []
seq = 0
d = START
while d <= END:
    trend = 0.85 + 0.3 * ((d - START).days / (END - START).days)  # 1년간 완만한 성장
    weekend = 1.15 if d.weekday() >= 5 else 1.0
    for ch, typ, _, fee, _, base, roas in CHANNELS:
        ch_sales = 0
        n = poisson(base * trend * weekend)
        ocnt = n  # 플랫폼 통계의 주문 건수 (주문번호 기준, 상품 수와 무관)
        for _ in range(n):
            seq += 1
            ono = f'{d.strftime("%Y%m%d")}-{seq:06d}'
            items = 2 if R.random() < 0.1 else 1
            picked = R.choices(PRODUCTS, weights=[p[8] * season_w(p, d) for p in PRODUCTS], k=items)
            for p in picked:
                pr = promo_for(ch, p[3], d)
                qty = 1 if R.random() < 0.85 else 2
                disc = pr[6] if pr else (0.05 if R.random() < 0.2 else 0)
                gross = p[5] * qty
                dc = round(gross * disc / 10) * 10
                amt = gross - dc
                lines.append((ono, d, ch, p[0], qty, amt, dc))
                ch_sales += amt
        # 행사 기간에는 행사 카테고리 주문을 추가로 만든다 (증가배수 − 1 만큼)
        for pr in PROMOS:
            if pr[2] == ch and pr[4] <= D(d) <= pr[5] and pr[9] > 1:
                cat_products = [p for p in PRODUCTS if p[3] in pr[8]]
                extra = poisson(base * trend * 0.3 * (pr[9] - 1))
                ocnt += extra
                for _ in range(extra):
                    seq += 1
                    p = R.choice(cat_products)
                    gross = p[5]; dc = round(gross * pr[6] / 10) * 10
                    lines.append((f'{d.strftime("%Y%m%d")}-{seq:06d}', d, ch, p[0], 1, gross - dc, dc))
                    ch_sales += gross - dc
        visits = int(n * R.uniform(28, 45)) + R.randint(20, 60)
        ad = 0 if roas == 0 else round(ch_sales / (roas / 100) * R.uniform(0.8, 1.2) / 100) * 100
        traffic.append((d, ch, visits, ad, ocnt))
    d += dt.timedelta(days=1)

# 마스터에 없는 SKU 2건
lines.append((f'20261028-{seq + 1:06d}', dt.date(2026, 10, 28), '자사몰', ORPHAN, 1, 15000, 0))
lines.append((f'20261029-{seq + 2:06d}', dt.date(2026, 10, 29), '자사몰', ORPHAN, 2, 30000, 0))

# 광고 리포트 (본 난수와 분리한 R2로 생성해 기존 판매·유입 값은 그대로 둔다)
R2 = random.Random(7)
CAMPS = {'네이버 스마트스토어': [('쇼핑검색', 0.7), ('브랜드검색', 0.3)], '쿠팡': [('쿠팡 검색광고', 0.65), ('쿠팡 비검색', 0.35)], '지그재그': [('ZIGZAG 광고', 1.0)], '자사몰': [('메타 광고', 1.0)]}
REV_GAP = (dt.date(2026, 10, 20), '자사몰')  # 광고 매출을 비운 행 → 자사몰 10월 광고 ROAS 판정 보류
day_sales = defaultdict(int)
for ono, dd, ch, sku, qty, amt, dc in lines: day_sales[(dd, ch)] += amt
ads = []
for dd, ch, v, ad, oc in traffic:
    if not ad or ch not in CAMPS: continue
    for camp, share in CAMPS[ch]:
        spend = round(ad * share / 10) * 10
        imp = int(spend / R2.uniform(2.5, 4.5)); clicks = max(1, int(imp * R2.uniform(0.008, 0.02))); conv = int(clicks * R2.uniform(0.02, 0.05))
        rev = round(day_sales[(dd, ch)] * share * R2.uniform(0.35, 0.6) / 10) * 10
        ads.append({'date': dd, 'channel': ch, 'campaign': camp, 'spend': spend, 'revenue': None if (dd, ch) == REV_GAP else rev,
                    'imp': None if ch == '지그재그' else imp, 'clicks': None if ch == '지그재그' else clicks, 'conv': conv})

# 기대값: 앱과 같은 규칙(일자·채널·SKU 합산)으로 집계
for ono, dd, ch, sku, qty, amt, dc in lines:
    k = (D(dd), ch, sku)
    a = agg.setdefault(k, {'date': D(dd), 'channel': ch, 'sku': sku, 'qty': 0, 'sales': 0, 'discount': 0, 'orders': 0})
    a['qty'] += qty; a['sales'] += amt; a['discount'] += dc; a['orders'] += 1

# 1) 판매 CSV (사방넷 주문 내역형, 엑셀이 여는 UTF-8 BOM) — 오류 행 3개를 일부러 넣는다
with open(os.path.join(OUT, '01_판매내역_주문단위.csv'), 'w', newline='', encoding='utf-8-sig') as f:
    w = csv.writer(f)
    w.writerow(['주문번호', '주문일', '쇼핑몰', '상품코드', '판매수량', '실결제금액', '할인금액', '주문건수'])
    for i, (ono, dd, ch, sku, qty, amt, dc) in enumerate(lines):
        w.writerow([ono, fmt_date(dd), ch, sku, qty, f'{amt:,}' if i % 7 == 0 else amt, dc, 1])
    w.writerow(['ERR-1', '2026-13-01', '쿠팡', 'KC-201', 1, 49000, 0, 1])   # 날짜 오류
    w.writerow(['ERR-2', '2026-10-20', '쿠팡', 'KC-201', 1, '원', 0, 1])    # 금액 숫자 아님
    w.writerow(['ERR-3', '2026-10-20', '쿠팡', 'KC-201', 0, 49000, 0, 1])   # 수량 0

# 2) 유입·광고비 XLSX (광고 리포트형)
wb = Workbook(); ws = wb.active; ws.title = '광고리포트'
ws.append(['일자', '채널', '방문수', '광고비', '주문수'])
AD_GAP = (dt.date(2026, 10, 15), '자사몰')  # 광고비 칸을 비운 날 → 자사몰 10월 ROAS 판정 보류
NO_ORD = '카카오톡 선물하기'                  # 주문수를 주지 않는 채널 → 전환율 판정 보류
for dd, ch, v, ad, oc in traffic: ws.append([D(dd), ch, v, None if (dd, ch) == AD_GAP else ad, None if ch == NO_ORD else oc])
wb.save(os.path.join(OUT, '02_유입_광고비.xlsx'))

# 2-1) 광고 리포트 CSV (플랫폼 리포트형): 지그재그는 노출·클릭을 비워 둔다(일부 행만 있는 항목 처리 확인)
with open(os.path.join(OUT, '09_광고리포트.csv'), 'w', newline='', encoding='utf-8-sig') as f:
    w = csv.writer(f)
    w.writerow(['일자', '채널', '캠페인', '노출수', '클릭수', '광고비', '전환수', '전환매출'])
    for a in ads: w.writerow([D(a['date']), a['channel'], a['campaign'], '' if a['imp'] is None else a['imp'], '' if a['clicks'] is None else a['clicks'], a['spend'], a['conv'], '' if a['revenue'] is None else a['revenue']])

# 2-2) 경쟁 상품 조사 CSV: 매주 화요일, 주요 상품마다 경쟁 2개. KC-202의 'A사 세라믹팬'은 10/6부터 12% 인하(검증용)
R3 = random.Random(11)
RIVALS = {'KC-202': [('A사 세라믹팬 28cm', 'A사', '쿠팡', 36900), ('B리빙 논스틱팬 28cm', 'B리빙', '네이버 스마트스토어', 41000)],
          'HL-101': [('C침구 린넨세트 Q', 'C침구', '쿠팡', 92000), ('D홈 워셔블 린넨 Q', 'D홈', '지그재그', 85000)],
          'BT-301': [('E뷰티 세라마이드 크림', 'E뷰티', '쿠팡', 29800), ('F랩 장벽크림 50ml', 'F랩', '네이버 스마트스토어', 34000)],
          'KC-201': [('G키친 3중 냄비 20cm', 'G키친', '쿠팡', 52000)]}
compete = []
cd = dt.date(2026, 8, 4)
while cd <= dt.date(2026, 10, 27):
    for sku, rs in RIVALS.items():
        for i, (name, brand, ch, base) in enumerate(rs):
            price = base * (0.88 if (sku == 'KC-202' and i == 0 and cd >= dt.date(2026, 10, 6)) else 1) * R3.uniform(0.98, 1.02)
            compete.append({'date': cd, 'sku': sku, 'rival': name, 'brand': brand, 'channel': ch, 'price': round(price / 100) * 100,
                            'ourPrice': PMAP[sku][5], 'rank': max(1, int(R3.uniform(1, 12)) - (3 if sku == 'KC-202' and i == 0 and cd >= dt.date(2026, 10, 6) else 0)),
                            'reviews': int(800 + (cd - dt.date(2026, 8, 4)).days * R3.uniform(3, 8)), 'rating': round(R3.uniform(4.3, 4.9), 1)})
    cd += dt.timedelta(days=7)
with open(os.path.join(OUT, '10_경쟁상품조사.csv'), 'w', newline='', encoding='utf-8-sig') as f:
    w = csv.writer(f)
    w.writerow(['조사일', 'SKU', '경쟁상품', '경쟁브랜드', '채널', '경쟁가', '우리판매가', '순위', '리뷰수', '평점'])
    for c in compete: w.writerow([D(c['date']), c['sku'], c['rival'], c['brand'], c['channel'], c['price'], c['ourPrice'], c['rank'], c['reviews'], c['rating']])

# 3) 상품 마스터 XLSX (열 이름 변형, 금액에 쉼표·원)
wb = Workbook(); ws = wb.active; ws.title = '상품'
ws.append(['상품코드', '상품명', '브랜드', '분류', '시즌', '판매가', '입고원가', '현재고'])
for p in PRODUCTS: ws.append([p[0], p[1], p[2], p[3], p[4], f'{p[5]:,}원', f'{p[6]:,}', p[7]])
wb.save(os.path.join(OUT, '03_상품마스터.xlsx'))

# 4) 채널 CSV (수수료 표기 혼합)
with open(os.path.join(OUT, '04_채널_수수료.csv'), 'w', newline='', encoding='utf-8-sig') as f:
    w = csv.writer(f)
    w.writerow(['채널명', '유형', '수수료율', '월 목표'])
    for c in CHANNELS: w.writerow([c[0], c[1], c[2], c[4]])

# 5) 정산 대사 3종 — 최근 7일 주문, 문제를 일부러 심는다
recent = [l for l in lines if l[1] >= END - dt.timedelta(days=6)]
hub, plat, acct = [], [], []
by_order = defaultdict(int)
for l in recent: by_order[l[0]] += l[5]
order_ch = {l[0]: l[2] for l in recent}
order_dt = {l[0]: D(l[1]) for l in recent}
for l in recent: hub.append([l[0], l[2], l[5], D(l[1])])  # 통합관리는 상품별 행 (2상품 주문은 같은 번호 2행)
orders_list = list(by_order)
planted = {'platform_missing': orders_list[3:5], 'platform_diff': orders_list[10], 'account_missing': orders_list[20],
           'account_bad': orders_list[30], 'account_extra': '20261029-EXTRA1'}
for o in orders_list:
    short = order_ch[o].replace('네이버 ', '')  # 플랫폼 자료는 채널 표기가 다르다
    if o not in planted['platform_missing']:
        plat.append([o, short, by_order[o] - (3000 if o == planted['platform_diff'] else 0), order_dt[o].replace('-', '.')])
    if o != planted['account_missing']:
        acct.append([o, order_ch[o], '-' if o == planted['account_bad'] else f'{by_order[o]:,}', order_dt[o]])
acct.append([planted['account_extra'], '자사몰', '52,000', D(END)])
for name, head, rows in [('05_정산_사방넷주문.csv', ['주문번호', '쇼핑몰명', '결제금액', '주문일자'], hub),
                         ('06_정산_플랫폼정산.csv', ['상품주문번호', '판매처', '정산대상금액', '결제일'], plat),
                         ('07_정산_회계매출.csv', ['주문번호', '채널', '매출액', '날짜'], acct)]:
    with open(os.path.join(OUT, name), 'w', newline='', encoding='utf-8-sig') as f:
        w = csv.writer(f); w.writerow(head); w.writerows(rows)
multi = [o for o in orders_list if sum(1 for l in recent if l[0] == o) > 1]

# 6) 행사·거래처·발주·소싱 후보 — 업로드 양식이 없어 백업 파일(.json)로 복원해 넣는다
promotions = [{'id': p[0], 'name': p[1], 'channel': p[2], 'type': p[3], 'start': p[4], 'end': p[5], 'discount': p[6], 'budget': p[7], 'categories': p[8], 'memo': ''} for p in PROMOS]
vendors = [
    {'name': '(주)하루텍스', 'type': '제조사', 'country': '한국', 'contact': '영업팀', 'status': '거래중', 'terms': '월말 마감 익월 말', 'last': '2026-10-20', 'next': 'F/W 이불 추가 생산 확정', 'due': '2026-10-25', 'contractEnd': '2026-12-10', 'memo': ''},
    {'name': 'Ningbo Kitchenware Co.', 'type': '해외 공급처', 'country': '중국', 'contact': 'sales@ningbo.example', 'status': '거래중', 'terms': 'T/T 30/70, FOB', 'last': '2026-10-15', 'next': '프라이팬 단가 재협상', 'due': '2026-11-05', 'contractEnd': '2027-06-30', 'memo': 'MOQ 500'},
    {'name': '오늘피부 OEM', 'type': '제조사', 'country': '한국', 'contact': 'OEM 담당', 'status': '협의중', 'terms': '협의 중', 'last': '2026-10-28', 'next': '앰플 리뉴얼 샘플 수령', 'due': '2026-11-02', 'contractEnd': '', 'memo': ''},
    {'name': '쿠팡 리빙 MD', 'type': '플랫폼 담당자', 'country': '한국', 'contact': '담당 MD', 'status': '거래중', 'terms': '수수료 10.8% (가상)', 'last': '2026-10-01', 'next': '11.11 구좌 확정', 'due': '2026-10-31', 'contractEnd': '', 'memo': ''},
]
pos = [
    {'po': 'PO-3001', 'vendor': 'Ningbo Kitchenware Co.', 'sku': 'KC-202', 'qty': 500, 'received': 0, 'ordered': '2026-09-20', 'eta': '2026-11-10', 'status': '선적'},
    {'po': 'PO-3002', 'vendor': '(주)하루텍스', 'sku': 'HL-103', 'qty': 80, 'received': 0, 'ordered': '2026-09-01', 'eta': '2026-10-15', 'status': '생산중'},   # 지연
    {'po': 'PO-3003', 'vendor': '오늘피부 OEM', 'sku': 'BT-303', 'qty': 300, 'received': 300, 'ordered': '2026-08-01', 'eta': '2026-09-01', 'status': '입고완료'},
    {'po': 'PO-3004', 'vendor': '(주)하루텍스', 'sku': 'HL-102', 'qty': 100, 'received': 0, 'ordered': '2026-08-10', 'eta': '2026-09-10', 'status': '취소'},     # 취소 — 지연에 넣으면 안 됨
]
candidates = [
    {'name': '접이식 실리콘 밀폐용기', 'brand': '키친온', 'category': '주방', 'popularity': 5, 'lastYearQty': 0, 'outlook': 4, 'margin': 0.42, 'supplier': 'Ningbo Kitchenware Co.', 'moq': 1000, 'memo': '신규 카테고리'},
    {'name': '경추 메모리폼 베개', 'brand': '하루리빙', 'category': '침구', 'popularity': 4, 'lastYearQty': 320, 'outlook': 4, 'margin': 0.35, 'supplier': '(주)하루텍스', 'moq': 200, 'memo': ''},
    {'name': '레티놀 나이트 세럼', 'brand': '오늘피부', 'category': '뷰티', 'popularity': 3, 'lastYearQty': 0, 'outlook': 3, 'margin': 0.6, 'supplier': '오늘피부 OEM', 'moq': 3000, 'memo': '성분 규제 확인'},
]
channels = [{'name': c[0], 'type': c[1], 'fee': c[3], 'target': int(c[4].replace(',', '').replace('원', ''))} for c in CHANNELS]
products = [{'sku': p[0], 'name': p[1], 'brand': p[2], 'category': p[3], 'season': p[4], 'price': p[5], 'cost': p[6], 'stock': p[7]} for p in PRODUCTS]
backup = {'channels': channels, 'products': products, 'sales': list(agg.values()),
          'traffic': [{'date': D(t[0]), 'channel': t[1], 'visits': t[2], 'ad': 0 if (t[0], t[1]) == AD_GAP else t[3], 'vOk': True, 'adOk': (t[0], t[1]) != AD_GAP,
                       **({} if t[1] == NO_ORD else {'orders': t[4], 'ordOk': True}), **({'ordOk': False} if t[1] == NO_ORD else {})} for t in traffic],
          'promotions': promotions, 'vendors': vendors, 'pos': pos, 'candidates': candidates, 'isSample': False, 'exportedAt': '2026-10-30T00:00:00Z'}
# 월별 목표 (2026년): 카카오톡 선물하기는 10월부터 일부러 미설정(채널 기본 목표로 대체되는지 확인), '옛 채널명'은 연결 끊긴 목표
SEASON = [0.9, 0.85, 0.95, 1, 1, 0.95, 0.9, 0.9, 1.05, 1.1, 1.25, 1.35]
targets = []
for i, x in enumerate(SEASON):
    m = f'2026-{i + 1:02d}'
    for c in CHANNELS:
        if c[0] == '카카오톡 선물하기' and i >= 9: continue
        RT = {'네이버 스마트스토어': (3.0, 0.03), '쿠팡': (2.8, 0.03), '지그재그': (2.0, None), '자사몰': (4.0, 0.025)}.get(c[0], (None, None))
        targets.append({'month': m, 'channel': c[0], 'sales': round(int(c[4].replace(',', '').replace('원', '')) * x / 100000) * 100000, 'updatedAt': '2026-10-01T09:00:00Z',
                        **({'roas': RT[0]} if RT[0] else {}), **({'cvr': RT[1]} if RT[1] else {})})
    targets.append({'month': m, 'channel': '', 'adBudget': round(24000000 * x / 100000) * 100000, 'margin': 0.45, 'roas': 2.8, 'cvr': 0.028, 'memo': '전년 +10%, 11월 블프 반영' if i == 10 else ''})
targets.append({'month': '2026-10', 'channel': '옛 채널명', 'sales': 3000000})
backup['targets'] = targets
def app_ad(a):
    o = {'date': D(a['date']), 'channel': a['channel'], 'campaign': a['campaign'], 'spend': a['spend']}
    miss = [k for k in ('revenue', 'imp', 'clicks', 'conv') if a[k] is None]
    for k in ('revenue', 'imp', 'clicks', 'conv'):
        if a[k] is not None: o[k] = a[k]
    if miss: o['miss'] = miss
    return o
backup['ads'] = [app_ad(a) for a in ads]
backup['compete'] = [{'date': D(c['date']), 'sku': c['sku'], 'rival': c['rival'], 'rivalBrand': c['brand'], 'channel': c['channel'], 'price': c['price'],
                      'ourPrice': c['ourPrice'], 'rank': c['rank'], 'reviews': c['reviews'], 'rating': c['rating']} for c in compete]
backup['events'] = [{'date': '2026-10-06', 'end': '2026-10-12', 'kind': '외부', 'channel': '쿠팡', 'title': '경쟁사 A사 세라믹팬 할인전'},
                    {'date': '2026-09-14', 'end': '2026-09-14', 'kind': '내부', 'channel': '네이버 스마트스토어', 'title': '스마트스토어 상세페이지 개편'}]
# 마감 확인: 모두 10/29까지 확인하되 지그재그 판매는 10/27까지만 → 판매 실적 기준일 10/27
backup['closes'] = {c[0]: {'sales': '2026-10-27' if c[0] == '지그재그' else '2026-10-29', 'traffic': '2026-10-29', 'ads': '2026-10-29', 'at': '2026-10-30T09:00:00Z'} for c in CHANNELS}
with open(os.path.join(OUT, '08_전체복원용_백업.json'), 'w', encoding='utf-8') as f: json.dump(backup, f, ensure_ascii=False)

# 기대값 — 화면 숫자를 독립적으로 대조하기 위한 값
def window(a, b):
    S = [s for s in agg.values() if a <= s['date'] <= b]; T = [t for t in traffic if a <= D(t[0]) <= b]
    fee = {c[0]: c[3] for c in CHANNELS}; cost = {p[0]: p[6] for p in PRODUCTS}
    sales = sum(s['sales'] for s in S); ad = sum(t[3] for t in T); visits = sum(t[2] for t in T); orders = sum(s['orders'] for s in S)
    gross = sum(s['sales'] / 1.1 - s['sales'] * fee[s['channel']] / 1.1 - s['qty'] * cost.get(s['sku'], 0) for s in S)
    return {'sales': sales, 'ad': ad, 'visits': visits, 'orders': orders, 'roas': sales / ad if ad else None,
            'cvr': orders / visits if visits else None, 'gross': gross, 'contribution': gross - ad / 1.1}
expected = {
    'lines': len(lines), 'csv_rows': len(lines) + 3, 'bad_rows': 3, 'agg_rows': len(agg), 'merged_rows': len(lines) - len(agg),
    'traffic_rows': len(traffic), 'orphan_sku': ORPHAN, 'total_sales': sum(a['sales'] for a in agg.values()),
    'last30': window('2026-09-30', '2026-10-29'), 'prev30': window('2026-08-31', '2026-09-29'),
    'oct_mtd_by_channel': {c[0]: sum(s['sales'] for s in agg.values() if s['channel'] == c[0] and s['date'] >= '2026-10-01') for c in CHANNELS},
    'settlement': {'hub_rows': len(hub), 'orders': len(orders_list), 'multi_line_orders': len(multi), **planted},
}
oct_t = [t for t in traffic if dt.date(2026, 10, 1) <= t[0] <= dt.date(2026, 10, 29)]
expected['oct_ratio'] = {}
for c in CHANNELS:
    T = [t for t in oct_t if t[1] == c[0]]
    s_ = expected['oct_mtd_by_channel'][c[0]]
    ad_ = sum(0 if (t[0], t[1]) == AD_GAP else t[3] for t in T); v_ = sum(t[2] for t in T); o_ = sum(t[4] for t in T)
    expected['oct_ratio'][c[0]] = {'sales': s_, 'ad': ad_, 'roas': s_ / ad_ if ad_ else None, 'visits': v_, 'orders': o_, 'cvr': o_ / v_ if v_ else None,
                                   'roas_hold': c[0] == AD_GAP[1], 'cvr_hold': c[0] == NO_ORD}
A0, A1 = dt.date(2026, 10, 1), dt.date(2026, 10, 27)
expected['asof_confirmed'] = '2026-10-27'
expected['oct27'] = {}
for c in CHANNELS:
    A = [a for a in ads if a['channel'] == c[0] and A0 <= a['date'] <= A1]
    T = [t for t in traffic if t[1] == c[0] and A0 <= t[0] <= A1]
    sp = sum(a['spend'] for a in A); rv = sum(a['revenue'] or 0 for a in A); v_ = sum(t[2] for t in T); o_ = sum(t[4] for t in T)
    expected['oct27'][c[0]] = {'spend': sp, 'revenue': rv, 'ad_roas': rv / sp if sp else None, 'rev_missing_rows': sum(1 for a in A if a['revenue'] is None),
                               'visits': v_, 'orders': o_, 'cvr': o_ / v_ if v_ else None,
                               'sales': sum(s['sales'] for s in agg.values() if s['channel'] == c[0] and '2026-10-01' <= s['date'] <= '2026-10-27')}
with open(os.path.join(OUT, 'expected.json'), 'w', encoding='utf-8') as f: json.dump(expected, f, ensure_ascii=False, indent=1)
print(json.dumps({k: v for k, v in expected.items() if k not in ('settlement',)}, ensure_ascii=False)[:600])
print('settlement', expected['settlement'])
