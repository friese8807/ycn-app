// 수급 레이더 — GitHub Actions가 주기적으로 실행해 data.json을 만듭니다.
// 네이버 응답 해석은 Code.gs의 함수를 그대로 씁니다.
const fs = require('fs');
const path = require('path');
const Module = require('module');
const src = fs.readFileSync(path.join(__dirname, 'Code.gs'), 'utf8');
const m = new Module('Code.gs'); m._compile(src, 'Code.gs');
const P = m.exports;

const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
async function get(url) {
  for (let i = 0; i < 2; i++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA, 'Referer': 'https://m.stock.naver.com/' }, signal: AbortSignal.timeout(15000) });
      if (r.ok) return await r.json();
      console.error(r.status, url);
    } catch (e) { console.error(String(e), url); }
  }
  return null;
}

(async () => {
  const watch = JSON.parse(fs.readFileSync(path.join(__dirname, 'watchlist.json'), 'utf8'));
  const codes = watch.map(w => w.code);
  const errors = [];
  const markets = [];
  for (const mk of [{ code: 'KOSPI', name: '코스피' }, { code: 'KOSDAQ', name: '코스닥' }]) {
    const [rt, integ] = await Promise.all([
      get('https://polling.finance.naver.com/api/realtime/domestic/index/' + mk.code),
      get('https://m.stock.naver.com/api/index/' + mk.code + '/integration')]);
    let flow = P.pickFlow(integ);
    if (!flow) flow = P.pickFlow(await get('https://m.stock.naver.com/api/index/' + mk.code + '/trend'));
    if (!flow) errors.push(mk.name + ' 투자자 동향을 받지 못했습니다');
    const q = P.pickQuote(rt, 0) || {};
    markets.push({ code: mk.code, name: mk.name, price: q.price, change: q.change, pct: q.pct, status: q.status, tradedAt: q.tradedAt, flow });
  }
  const rtStocks = await get('https://polling.finance.naver.com/api/realtime/domestic/stock/' + codes.join(','));
  const stocks = [];
  for (const w of watch) {
    const q = P.pickQuoteByCode(rtStocks, w.code) || {};
    const trend = P.pickTrend(await get('https://m.stock.naver.com/api/stock/' + w.code + '/trend?pageSize=10'));
    if (!trend.length) errors.push(w.name + ' 수급 데이터를 받지 못했습니다');
    stocks.push({ code: w.code, name: q.name || w.name, price: q.price, change: q.change, pct: q.pct, status: q.status, trend });
  }
  const ok = markets.some(x => x.flow || x.price != null) || stocks.some(s => s.trend.length);
  if (!ok) { console.error('받은 데이터가 없습니다'); process.exit(1); }
  const out = { ok: true, ts: new Date().toISOString(), snapshot: true, markets, stocks, errors };
  fs.mkdirSync(process.argv[2] || 'out', { recursive: true });
  fs.writeFileSync(path.join(process.argv[2] || 'out', 'data.json'), JSON.stringify(out));
  console.log('markets', markets.map(x => x.code + ':' + JSON.stringify(x.flow)).join(' '), '| stocks', stocks.length, '| errors', errors.length);
})();
(async()=>{ const j = await get('https://polling.finance.naver.com/api/realtime/domestic/stock/005930'); console.log('RAW', JSON.stringify(j).slice(0,2500));
const t = await get('https://m.stock.naver.com/api/stock/005930/trend?pageSize=2'); console.log('RAWT', JSON.stringify(t).slice(0,1200)); })();
