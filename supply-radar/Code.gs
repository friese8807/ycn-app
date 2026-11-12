/**
 * 수급 레이더 — 데이터 중계 (Google Apps Script)
 * 네이버 증권 공개 JSON을 받아 웹앱이 쓰기 좋은 형태로 돌려줍니다.
 *
 * 배포: 배포 > 새 배포 > 유형 "웹 앱" > 실행 "나", 액세스 "모든 사용자"
 *
 *   ?action=all&codes=005930,000660   시장(코스피·코스닥) + 관심종목
 *   ?action=search&q=삼성             종목 검색
 *   ?action=debug&codes=005930        원본 응답 일부 확인(문제 생겼을 때)
 */

var UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
var MARKETS = [{ code: 'KOSPI', name: '코스피' }, { code: 'KOSDAQ', name: '코스닥' }];
var CACHE_SEC = 8;

function doGet(e) {
  var p = (e && e.parameter) || {};
  var action = p.action || 'all';
  var out;
  try {
    if (action === 'search') out = search_(p.q || '');
    else if (action === 'debug') out = debug_(cleanCodes_(p.codes));
    else out = all_(cleanCodes_(p.codes));
  } catch (err) {
    out = { ok: false, error: String(err) };
  }
  return ContentService.createTextOutput(JSON.stringify(out))
    .setMimeType(ContentService.MimeType.JSON);
}

/* ---------- 요청 ---------- */

function opt_() {
  return { muteHttpExceptions: true, headers: { 'User-Agent': UA, 'Referer': 'https://m.stock.naver.com/' } };
}

function req_(url) {
  var o = opt_(); o.url = url; return o;
}

function parse_(resp) {
  try {
    if (resp.getResponseCode() !== 200) return null;
    return JSON.parse(resp.getContentText());
  } catch (err) { return null; }
}

function all_(codes) {
  var cache = CacheService.getScriptCache();
  var key = 'all:' + codes.join(',');
  var hit = cache.get(key);
  if (hit) return JSON.parse(hit);

  var reqs = [];
  MARKETS.forEach(function (m) {
    reqs.push(req_('https://polling.finance.naver.com/api/realtime/domestic/index/' + m.code));
    reqs.push(req_('https://m.stock.naver.com/api/index/' + m.code + '/integration'));
  });
  if (codes.length) reqs.push(req_('https://polling.finance.naver.com/api/realtime/domestic/stock/' + codes.join(',')));
  codes.forEach(function (c) {
    reqs.push(req_('https://m.stock.naver.com/api/stock/' + c + '/trend?pageSize=10'));
  });

  var res = UrlFetchApp.fetchAll(reqs).map(parse_);
  var errors = [];
  var i = 0;

  var markets = MARKETS.map(function (m) {
    var rt = res[i++], integ = res[i++];
    var flow = pickFlow(integ);
    if (!flow) {
      // 예비 경로
      var alt = parse_(UrlFetchApp.fetch('https://m.stock.naver.com/api/index/' + m.code + '/trend', opt_()));
      flow = pickFlow(alt);
    }
    if (!flow) errors.push(m.name + ' 투자자 동향을 받지 못했습니다');
    var q = pickQuote(rt, 0) || {};
    return { code: m.code, name: m.name, price: q.price, change: q.change, pct: q.pct, status: q.status, tradedAt: q.tradedAt, flow: flow };
  });

  var rtStocks = codes.length ? res[i++] : null;
  var stocks = codes.map(function (c, k) {
    var q = pickQuoteByCode(rtStocks, c) || pickQuote(rtStocks, k) || {};
    var trend = pickTrend(res[i++]);
    if (!trend.length) errors.push(c + ' 수급 데이터를 받지 못했습니다');
    return { code: c, name: q.name || '', price: q.price, change: q.change, pct: q.pct, status: q.status, trend: trend };
  });

  var out = { ok: true, ts: new Date().toISOString(), markets: markets, stocks: stocks, errors: errors };
  try { cache.put(key, JSON.stringify(out), CACHE_SEC); } catch (err) {}
  return out;
}

function search_(q) {
  q = String(q).trim();
  if (!q) return { ok: true, items: [] };
  var url = 'https://m.stock.naver.com/front-api/search/autoComplete?query=' + encodeURIComponent(q) + '&target=stock';
  var j = parse_(UrlFetchApp.fetch(url, opt_()));
  return { ok: true, items: pickSearch(j) };
}

function debug_(codes) {
  var urls = [
    'https://polling.finance.naver.com/api/realtime/domestic/index/KOSPI',
    'https://m.stock.naver.com/api/index/KOSPI/integration',
    'https://m.stock.naver.com/api/index/KOSPI/trend'
  ];
  if (codes.length) {
    urls.push('https://polling.finance.naver.com/api/realtime/domestic/stock/' + codes[0]);
    urls.push('https://m.stock.naver.com/api/stock/' + codes[0] + '/trend?pageSize=3');
  }
  var res = UrlFetchApp.fetchAll(urls.map(req_));
  return urls.map(function (u, k) {
    return { url: u, status: res[k].getResponseCode(), body: res[k].getContentText().slice(0, 1500) };
  });
}

/* ---------- 순수 파싱 함수 (네이버 응답 → 숫자) ---------- */

function cleanCodes_(s) {
  return String(s || '').split(',').map(function (x) { return x.trim().toUpperCase(); })
    .filter(function (x) { return /^[0-9A-Z]{6}$/.test(x); }).slice(0, 15);
}

/** "-1,673,323" / "+2,746,972" / 123 → 숫자. 못 읽으면 null */
function num(v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return isFinite(v) ? v : null;
  var n = parseFloat(String(v).replace(/[,+\s%]/g, ''));
  return isFinite(n) ? n : null;
}

/** 지수 투자자별 순매수(억원). integration의 dealTrendInfo 또는 trend 응답 */
function pickFlow(j) {
  if (!j) return null;
  var d = j.dealTrendInfo || (Array.isArray(j.dealTrendInfos) ? j.dealTrendInfos[0] : null) || (Array.isArray(j) ? j[0] : j);
  if (!d) return null;
  var f = { date: d.bizdate || '', personal: num(d.personalValue), foreign: num(d.foreignValue), institution: num(d.institutionalValue) };
  if (f.personal === null && f.foreign === null && f.institution === null) return null;
  return f;
}

function quoteOf(d) {
  if (!d) return null;
  var change = num(d.compareToPreviousClosePrice);
  var pct = num(d.fluctuationsRatio);
  var dir = d.compareToPreviousPrice && String(d.compareToPreviousPrice.code);
  if (dir === '4' || dir === '5') { // 하한·하락인데 부호가 빠져 온 경우
    if (change !== null && change > 0) change = -change;
    if (pct !== null && pct > 0) pct = -pct;
  }
  return {
    code: d.itemCode || d.symbolCode || '', name: d.stockName || d.indexName || '',
    price: num(d.closePrice), change: change, pct: pct,
    status: d.marketStatus || '', tradedAt: d.localTradedAt || ''
  };
}

function pickQuote(j, k) {
  if (!j || !Array.isArray(j.datas)) return null;
  return quoteOf(j.datas[k]);
}

function pickQuoteByCode(j, code) {
  if (!j || !Array.isArray(j.datas)) return null;
  for (var k = 0; k < j.datas.length; k++) {
    var d = j.datas[k];
    if (d && (d.itemCode === code || d.symbolCode === code)) return quoteOf(d);
  }
  return null;
}

/** 종목 일별 투자자 순매수(주). 최신일이 앞 */
function pickTrend(j) {
  var a = Array.isArray(j) ? j : (j && Array.isArray(j.result) ? j.result : []);
  return a.map(function (r) {
    return {
      date: String(r.bizdate || ''),
      foreign: num(r.foreignerPureBuyQuant),
      organ: num(r.organPureBuyQuant),
      individual: num(r.individualPureBuyQuant),
      holdRatio: num(r.foreignerHoldRatio),
      close: num(r.closePrice)
    };
  }).filter(function (r) { return r.date && (r.foreign !== null || r.organ !== null); });
}

function pickSearch(j) {
  var items = (j && j.result && j.result.items) || (j && j.items) || [];
  return items.filter(function (x) { return x && /^[0-9A-Z]{6}$/.test(String(x.code || '')); })
    .slice(0, 12)
    .map(function (x) { return { code: String(x.code), name: x.name || '', market: x.typeName || '' }; });
}

if (typeof module !== 'undefined') module.exports = { num: num, pickFlow: pickFlow, pickQuote: pickQuote, pickQuoteByCode: pickQuoteByCode, pickTrend: pickTrend, pickSearch: pickSearch, cleanCodes_: cleanCodes_ };
