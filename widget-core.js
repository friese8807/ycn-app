// YCN_WIDGET — 윤호, 채원이네 홈 화면 위젯 (Scriptable 앱용 본체)
// 이 파일은 위젯이 실행될 때마다 자동으로 새 버전을 받아요. 직접 고칠 필요 없어요.
const EXEC = "https://script.google.com/macros/s/AKfycbzhbaZtMcPyhMlsOBEt1cqps72dyTTdhso3vsjWXAA69xLrck1xABlOnCCfZMnQRISg/exec";
const APP = "https://friese8807.github.io/ycn-app/";
const KIDS = [{ id: "yunho", short: "윤호", color: "#6c9cf5" }, { id: "chaewon", short: "채원", color: "#ee7fbe" }];
const C = { bg: "#10141b", card: "#1a202b", ink: "#eef2f7", muted: "#8b95a5", plus: "#4cc28b", minus: "#f07373", warn: "#e6a35c" };

/* ---------- 계산 (앱과 같은 규칙) ---------- */
const pad = n => String(n).padStart(2, "0");
const ymd = d => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
function addDays(date, n) { const d = new Date(date + "T00:00:00"); d.setDate(d.getDate() + n); return ymd(d); }
function weekKey(date) { const d = new Date(date + "T00:00:00"); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return ymd(d); }
function weeksOf(month) { const out = []; let mon = weekKey(month + "-01"); for (let i = 0; i < 6; i++) { if (addDays(mon, 3).slice(0, 7) === month) out.push(mon); mon = addDays(mon, 7); } return out; }
function monthAdd(k, d) { let [y, m] = k.split("-").map(Number); m += d; while (m < 1) { m += 12; y--; } while (m > 12) { m -= 12; y++; } return y + "-" + pad(m); }
const st = e => e.status || "ok";

function compute(cur, prev, kid) {
  const month = cur.month, today = cur.today, live = month === today.slice(0, 7);
  const ents = (cur.entries || []).filter(e => e.kid === kid);
  const ok = ents.filter(e => st(e) === "ok");
  let p = 0, m = 0, wn = 0;
  for (const e of ents) { const s = st(e); if (s === "ok") { if (e.amount > 0) p += e.amount; else m += e.amount; } else if (s === "pending") wn++; }
  let bo = 0;
  for (const b of cur.config?.bonuses || []) {
    if (b.off) continue; const amt = Number(b.amount) || 0;
    if (b.type === "noMinus") {
      if (b.from && month < b.from) continue;
      if (!ok.length) continue; if (!ok.some(e => e.amount < 0)) bo += amt;
    } else if (b.type === "weekly") {
      const wk = {}; for (const e of ok) if (e.ruleId === b.ruleId) wk[weekKey(e.date)] = (wk[weekKey(e.date)] || 0) + 1;
      if (b.per) { const min = Number(b.min) || 1, cap = Number(b.cap) || 99; for (const n of Object.values(wk)) if (n >= min) bo += Math.min(n, cap) * (Number(b.per) || 0); continue; }
      bo += Object.values(wk).filter(n => n >= (Number(b.min) || 1)).length * amt;
    } else if (b.type === "weeklyMiss") {
      const amt2 = Number(b.amounts?.[kid] ?? b.amount) || 0; const min = Number(b.min) || 1; if (!amt2) continue;
      const adj = (prev?.entries || []).filter(e => e.kid === kid && st(e) === "ok");
      const all = ok.concat(adj).filter(e => e.ruleId === b.ruleId);
      let missed = 0;
      for (const mon of weeksOf(month)) { const sun = addDays(mon, 6); const n = all.filter(e => e.date >= mon && e.date <= sun).length; if (sun < today && n < min) missed++; }
      bo -= missed * amt2;
    }
  }
  const kc = cur.config?.kids?.[kid] || {};
  const vm = String(cur.config?.vacMonths || "").split(/[^0-9]+/).filter(Boolean).map(Number);
  const vac = (Number(kc.baseVac) || 0) > 0 && vm.includes(Number(month.slice(5, 7)));
  const base = vac ? Number(kc.baseVac) || 0 : Number(kc.base) || 0;
  let pay = base + p + m + bo; if (cur.config?.floorZero !== false && pay < 0) pay = 0;
  const todayN = ents.filter(e => e.date === today && st(e) !== "rejected").length;
  const last = ents.filter(e => st(e) !== "rejected").sort((a, b) => (b.ts || 0) - (a.ts || 0))[0] || null;
  const paid = !!cur.ledger?.[kid + "_" + month]?.paid;
  return { kid, name: cur.config?.kids?.[kid]?.name || kid, photo: cur.config?.kids?.[kid]?.photo || "", base, p, m, bo, pay, wn, todayN, last, paid, live };
}
function settleInfo(today) {
  const [y, mo, d] = today.split("-").map(Number); const lastD = new Date(y, mo, 0).getDate();
  const left = lastD - d; return { left, label: left === 0 ? "오늘 정산" : `정산 D-${left}`, month: mo };
}

/* ---------- 통신·저장 ---------- */
async function api(body) {
  const r = new Request(EXEC); r.method = "POST"; r.timeoutInterval = 25;
  r.headers = { "Content-Type": "text/plain;charset=utf-8" }; r.body = JSON.stringify(body);
  const j = await r.loadJSON(); if (!j || !j.ok) throw new Error((j && j.message) || "서버 응답 없음"); return j.data;
}
function store() {
  const fm = FileManager.local(); const dir = fm.joinPath(fm.cacheDirectory(), "ycn-widget");
  if (!fm.fileExists(dir)) fm.createDirectory(dir, true);
  return {
    get(k) { const p = fm.joinPath(dir, k); try { return fm.fileExists(p) ? JSON.parse(fm.readString(p)) : null; } catch (e) { return null; } },
    set(k, v) { try { fm.writeString(fm.joinPath(dir, k), JSON.stringify(v)); } catch (e) {} }
  };
}
async function photo(id, auth, S) {
  if (!id) return null; const key = "img-" + id.replace(/[^\w-]/g, "");
  let d = S.get(key);
  if (!d) { try { d = (await api({ action: "image", id, auth })).url; S.set(key, d); } catch (e) { return null; } }
  try { return Image.fromData(Data.fromBase64String(String(d).split(",")[1])); } catch (e) { return null; }
}

// 배경: 앱 맨 위 아파트 그림 (한 번 받아서 저장해 두고 써요)
const BG_VER = 1;
async function bgImage(name, S) {
  const key = `bg-${name}-v${BG_VER}`; let d = S.get(key);
  if (!d) { try { const r = new Request(APP + `widget-bg-${name}.png?v=${BG_VER}`); r.timeoutInterval = 15; d = (await r.load()).toBase64String(); S.set(key, d); } catch (e) { return null; } }
  try { return Image.fromData(Data.fromBase64String(d)); } catch (e) { return null; }
}

// 위젯을 누르면 사파리 대신 Scriptable 안에서 주소창 없는 전체 화면으로 앱을 열어요.
function openURL() { try { return "scriptable:///run/" + encodeURIComponent(Script.name()) + "?open=1"; } catch (e) { return APP; } }
async function openApp() {
  const wv = new WebView();
  await wv.loadURL(APP);
  await wv.present(true);
}

/* ---------- 그리기 ---------- */
const won = n => (n < 0 ? "−" : "") + Math.abs(Math.round(n)).toLocaleString("ko-KR");
const krw = n => won(n) + "원";
function txt(st, s, size, color, weight) {
  const t = st.addText(s); t.textColor = new Color(color);
  t.font = weight === "b" ? Font.boldRoundedSystemFont(size) : weight === "h" ? Font.heavyRoundedSystemFont(size) : Font.mediumRoundedSystemFont(size);
  t.lineLimit = 1; t.minimumScaleFactor = 0.5; return t;
}
function avatar(st, img, kid, size) {
  if (img) { const i = st.addImage(img); i.imageSize = new Size(size, size); i.cornerRadius = size / 2; return; }
  const s = st.addStack(); s.size = new Size(size, size); s.cornerRadius = size / 2; s.backgroundColor = new Color(kid.color); s.centerAlignContent();
  txt(s, kid.short.slice(0, 1), size * 0.5, "#ffffff", "b");
}
function kidBlock(parent, r, kid, img, opt) {
  const box = parent.addStack(); box.layoutVertically(); box.backgroundColor = new Color(C.card, 0.84); box.cornerRadius = 14;
  box.setPadding(8, 10, 8, 10); box.url = openURL();
  const top = box.addStack(); top.centerAlignContent(); avatar(top, img, kid, opt.av); top.addSpacer(6);
  txt(top, kid.short, opt.name, C.ink, "b"); top.addSpacer();
  if (r.wn && opt.parent) { const b = top.addStack(); b.backgroundColor = new Color(C.warn); b.cornerRadius = 8; b.setPadding(1, 6, 1, 6); txt(b, "대기 " + r.wn, 10, "#1b1f27", "b"); }
  else if (r.paid) txt(top, "지급완료", 10, C.plus, "b");
  box.addSpacer(4);
  txt(box, krw(r.pay), opt.big, kid.color, "h");
  const row = box.addStack(); txt(row, "상점 +" + won(r.p), 11, C.plus, "m"); row.addSpacer(6); txt(row, "벌점 " + (r.m ? won(r.m) : "0"), 11, C.minus, "m");
  if (r.bo) { row.addSpacer(6); txt(row, (r.bo > 0 ? "보너스 +" : "보너스 ") + won(r.bo), 11, C.warn, "m"); }
  if (opt.detail) {
    box.addSpacer(3);
    txt(box, r.todayN ? `오늘 ${r.todayN}건 기록` : "오늘 기록 없음", 11, r.todayN ? C.ink : C.muted, "m");
    if (r.last) txt(box, `최근 ${r.last.label} ${r.last.amount > 0 ? "+" : ""}${won(r.last.amount)}${st(r.last) === "pending" ? " (대기)" : ""}`, 10, C.muted, "m");
  }
  return box;
}
function header(w, cur, family) {
  const s = settleInfo(cur.today); const h = w.addStack(); h.centerAlignContent();
  txt(h, family === "small" ? `${s.month}월 용돈` : `윤호, 채원이네 · ${s.month}월`, family === "small" ? 12 : 13, C.ink, "b"); h.addSpacer();
  txt(h, s.label, 11, s.left <= 3 ? C.warn : C.muted, "b");
}
function footer(w, at, stale) {
  const f = w.addStack(); f.addSpacer();
  const d = new Date(at); txt(f, (stale ? "연결 안 됨 · " : "") + `${pad(d.getHours())}:${pad(d.getMinutes())} 기준`, 9, stale ? C.minus : C.muted, "m");
}

async function build(opts) {
  const S = store(); const param = String(args.widgetParameter || opts.show || "").trim();
  const who = opts.who || "parent"; const auth = { who, pin: String(opts.pin || ""), name: opts.name || "부모" };
  const parent = who === "parent";
  let kids = parent ? KIDS : KIDS.filter(k => k.id === who);
  const one = KIDS.find(k => param.includes(k.short) || param === k.id); if (one && parent) kids = [one];
  let cur, prev, stale = false, at = Date.now(), err = "";
  try {
    cur = await api({ action: "load", auth });
    try { prev = await api({ action: "load", auth, month: monthAdd(cur.month, -1) }); } catch (e) { prev = S.get("prev"); }
    S.set("cur", cur); S.set("prev", prev); S.set("at", at);
  } catch (e) { err = String(e.message || e); cur = S.get("cur"); prev = S.get("prev"); at = S.get("at") || at; stale = true; }

  const family = config.widgetFamily || "medium";
  const w = new ListWidget(); w.url = openURL(); w.refreshAfterDate = new Date(Date.now() + 15 * 60 * 1000);
  if (family.startsWith("accessory")) {
    if (!cur) { w.addText("윤호채원: 연결 안 됨"); return w; }
    const rs = kids.map(k => [k, compute(cur, prev, k.id)]);
    if (family === "accessoryInline") { w.addText(rs.map(([k, r]) => `${k.short} ${won(r.pay)}`).join(" · ")); return w; }
    if (family === "accessoryCircular") { const [k, r] = rs[0]; const t1 = w.addText(k.short); t1.font = Font.boldSystemFont(11); t1.centerAlignText();
      const t2 = w.addText(Math.round(r.pay / 1000) + "천"); t2.font = Font.boldRoundedSystemFont(14); t2.minimumScaleFactor = .5; t2.centerAlignText(); return w; }
    for (const [k, r] of rs) { const t = w.addText(`${k.short} ${krw(r.pay)}${r.wn && parent ? ` · 대기${r.wn}` : ""}`); t.font = Font.boldRoundedSystemFont(13); t.minimumScaleFactor = .6; }
    const t = w.addText(settleInfo(cur.today).label); t.font = Font.systemFont(11); return w;
  }

  w.backgroundColor = new Color(C.bg); w.setPadding(12, 12, 10, 12);
  const bgName = family === "small" ? "small" : family === "large" || family === "extraLarge" ? "large" : "medium";
  const bg = await bgImage(bgName, S); if (bg) w.backgroundImage = bg;
  if (!cur) { txt(w, "윤호, 채원이네", 14, C.ink, "b"); w.addSpacer(6); txt(w, "불러오지 못했어요", 12, C.minus, "m"); const t = w.addText(err.slice(0, 80)); t.font = Font.systemFont(10); t.textColor = new Color(C.muted); return w; }

  header(w, cur, family); w.addSpacer(6);
  const rs = []; for (const k of kids) rs.push([k, compute(cur, prev, k.id), await photo(cur.config?.kids?.[k.id]?.photo, auth, S)]);
  if (family === "small") {
    if (rs.length === 1) { const [k, r, img] = rs[0]; kidBlock(w, r, k, img, { av: 26, name: 14, big: 20, parent, detail: true }); }
    else for (const [k, r, img] of rs) {
      const row = w.addStack(); row.centerAlignContent(); avatar(row, img, k, 20); row.addSpacer(5);
      const col = row.addStack(); col.layoutVertically(); txt(col, krw(r.pay), 16, k.color, "h");
      if (r.wn && parent) txt(col, `확인 대기 ${r.wn}건`, 10, C.warn, "b"); w.addSpacer(5);
    }
  } else if (family === "medium") {
    const row = w.addStack(); row.spacing = 8;
    for (const [k, r, img] of rs) kidBlock(row, r, k, img, { av: 24, name: 14, big: rs.length === 1 ? 26 : 19, parent, detail: true });
  } else {
    for (const [k, r, img] of rs) { kidBlock(w, r, k, img, { av: 30, name: 15, big: 26, parent, detail: true }); w.addSpacer(8); }
    const pend = rs.reduce((a, [, r]) => a + r.wn, 0);
    if (parent && pend) txt(w, `아이 인증 ${pend}건이 확인을 기다려요 · 눌러서 열기`, 12, C.warn, "b");
  }
  w.addSpacer(); footer(w, at, stale);
  return w;
}

async function main(opts = {}) {
  if (!config.runsInWidget && !config.runsInAccessoryWidget && args.queryParameters && args.queryParameters.open) { await openApp(); Script.complete(); return; }
  const w = await build(opts);
  if (config.runsInWidget || config.runsInAccessoryWidget) Script.setWidget(w);
  else { const f = String(args.widgetParameter || opts.preview || "medium"); f === "small" ? await w.presentSmall() : f === "large" ? await w.presentLarge() : await w.presentMedium(); }
  Script.complete();
}
module.exports = main;
module.exports.compute = compute;
module.exports.settleInfo = settleInfo;
