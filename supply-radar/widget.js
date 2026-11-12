// 수급 레이더 위젯 — 아이폰 Scriptable 앱용
// 사용법: Scriptable 앱 > + > 이 내용 전체 붙여넣기 > 이름 "수급 레이더"
//        홈 화면 길게 누르기 > 위젯 추가 > Scriptable > 작은/중간 크기 > 위젯 편집에서 Script 선택
// 위젯 편집의 Parameter 칸에 종목코드(예: SK하이닉스 000660)를 넣으면 그 종목을 보여 줍니다.

const STOCK = (args.widgetParameter || "005930").trim();   // 기본 종목
const WEBAPP_URL = "https://friese8807.github.io/ycn-app/supply-radar/";                                      // 위젯을 눌렀을 때 열 웹앱 주소(선택)

const C = {
  bg: Color.dynamic(new Color("#ffffff"), new Color("#16181d")),
  ink: Color.dynamic(new Color("#16181d"), new Color("#f2f3f5")),
  sub: Color.dynamic(new Color("#6c7078"), new Color("#9aa0aa")),
  buy: Color.dynamic(new Color("#1c4fb0"), new Color("#6ea0ff")),
  sell: Color.dynamic(new Color("#b3262f"), new Color("#ff7b82")),
};
const UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";

async function getJSON(url) {
  try {
    const r = new Request(url);
    r.headers = { "User-Agent": UA, "Referer": "https://m.stock.naver.com/" };
    r.timeoutInterval = 10;
    return await r.loadJSON();
  } catch (e) { return null; }
}
function num(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = parseFloat(String(v).replace(/[,+\s%]/g, ""));
  return isFinite(n) ? n : null;
}
function eok(n) {
  if (n === null) return "–";
  const a = Math.abs(n), s = n > 0 ? "+" : n < 0 ? "-" : "";
  return a >= 10000 ? s + (a / 10000).toFixed(2) + "조" : s + Math.round(a).toLocaleString("ko-KR") + "억";
}
function colorOf(n) { return n === null || n === 0 ? C.sub : n > 0 ? C.buy : C.sell; }

async function market(code) {
  const [rt, integ] = await Promise.all([
    getJSON("https://polling.finance.naver.com/api/realtime/domestic/index/" + code),
    getJSON("https://m.stock.naver.com/api/index/" + code + "/integration"),
  ]);
  let d = integ && integ.dealTrendInfo;
  if (!d) { const alt = await getJSON("https://m.stock.naver.com/api/index/" + code + "/trend"); d = Array.isArray(alt) ? alt[0] : alt; }
  const q = rt && rt.datas && rt.datas[0];
  return {
    pct: q ? num(q.fluctuationsRatio) : null,
    open: q ? q.marketStatus === "OPEN" : false,
    rows: [["개인", d ? num(d.personalValue) : null], ["외국인", d ? num(d.foreignValue) : null], ["기관", d ? num(d.institutionalValue) : null]],
  };
}

async function stock(code) {
  const [rt, tr] = await Promise.all([
    getJSON("https://polling.finance.naver.com/api/realtime/domestic/stock/" + code),
    getJSON("https://m.stock.naver.com/api/stock/" + code + "/trend?pageSize=10"),
  ]);
  const q = rt && rt.datas && rt.datas[0];
  const t = Array.isArray(tr) ? tr : [];
  // 외국인 연속 순매수/순매도 일수
  let n = 0, buy = null;
  for (const r of t) {
    const v = num(r.foreignerPureBuyQuant);
    if (v === null || v === 0) break;
    if (buy === null) buy = v > 0;
    if ((v > 0) === buy) n++; else break;
  }
  const amt = (r, k) => { const v = num(r[k]), c = num(r.closePrice); return v === null || c === null ? null : v * c / 1e8; };
  const r0 = t[0];
  return {
    name: (q && q.stockName) || code,
    pct: q ? num(q.fluctuationsRatio) : null,
    date: r0 ? String(r0.bizdate).slice(4, 6) * 1 + "/" + String(r0.bizdate).slice(6, 8) * 1 : "",
    streak: n ? "외국인 " + n + "일 연속 " + (buy ? "순매수" : "순매도") : "",
    streakBuy: buy,
    rows: r0 ? [["외국인", amt(r0, "foreignerPureBuyQuant")], ["기관", amt(r0, "organPureBuyQuant")], ["개인", amt(r0, "individualPureBuyQuant")]] : [],
  };
}

function block(parent, title, pct, rows, foot, footColor) {
  const s = parent.addStack(); s.layoutVertically();
  const h = s.addStack(); h.centerAlignContent();
  const t = h.addText(title); t.font = Font.semiboldSystemFont(13); t.textColor = C.ink; t.lineLimit = 1;
  h.addSpacer();
  if (pct !== null) { const p = h.addText((pct > 0 ? "+" : "") + pct.toFixed(2) + "%"); p.font = Font.mediumSystemFont(11); p.textColor = pct > 0 ? C.sell : pct < 0 ? C.buy : C.sub; }
  s.addSpacer(6);
  for (const [k, v] of rows) {
    const r = s.addStack(); r.centerAlignContent();
    const a = r.addText(k); a.font = Font.systemFont(12); a.textColor = C.sub;
    r.addSpacer();
    const b = r.addText(eok(v)); b.font = Font.semiboldRoundedSystemFont(14); b.textColor = colorOf(v);
    s.addSpacer(3);
  }
  if (foot) { s.addSpacer(2); const f = s.addText(foot); f.font = Font.mediumSystemFont(10); f.textColor = footColor || C.sub; f.lineLimit = 1; f.minimumScaleFactor = 0.8; }
}

const w = new ListWidget();
w.backgroundColor = C.bg;
w.setPadding(14, 14, 12, 14);
if (WEBAPP_URL) w.url = WEBAPP_URL;

const family = config.widgetFamily || "medium";
const [kospi, st] = await Promise.all([market("KOSPI"), stock(STOCK)]);
const now = new Date();
const stamp = ("0" + now.getHours()).slice(-2) + ":" + ("0" + now.getMinutes()).slice(-2);

if (family === "small") {
  block(w, "코스피 수급", kospi.pct, kospi.rows, (kospi.open ? "장중 " : "마감 ") + stamp + " 기준");
} else {
  const row = w.addStack();
  block(row, "코스피 수급", kospi.pct, kospi.rows, (kospi.open ? "장중 " : "마감 ") + stamp + " 기준");
  row.addSpacer(18);
  block(row, st.name + " " + st.date, st.pct, st.rows, st.streak, st.streakBuy === null ? C.sub : st.streakBuy ? C.buy : C.sell);
}
w.addSpacer();
w.refreshAfterDate = new Date(Date.now() + 5 * 60 * 1000);   // 5분 뒤 갱신 요청(실제 주기는 iOS가 정함)

Script.setWidget(w);
if (!config.runsInWidget) await w.presentMedium();
Script.complete();
