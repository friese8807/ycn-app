/**
 * 윤호, 채원이네 — 상벌 통장 (Google Apps Script 서버)
 * 이 스크립트는 '윤호, 채원이네 상벌 통장' 구글 시트에 붙어서(확장 프로그램 > Apps Script) 동작합니다.
 * 배포: 배포 > 새 배포 > 유형 '웹 앱' > 실행: 나 / 액세스: 모든 사용자
 */
const SH = { SET: '설정', RULE: '규칙', LOG: '기록', PAY: '정산', ACC: '접속', PUSH: '알림' };
const COLS = {
  SET: ['키', '값'],
  RULE: ['아이', 'id', '항목', '금액', '일리', '아이인증', '하루최대', '사진필수'],
  LOG: ['id', '아이', '날짜', '시각', '규칙id', '항목', '금액', '메모', '사진', '사진해시', '입력', '상태', '반려사유', '기록자', '검토자', '검토시각'],
  PAY: ['아이', '월', '지급', '지급일', '기본', '상점', '벌점', '보너스', '지급액', '처리자'],
  ACC: ['시각', '누구', '이름', '방식', '기기'],
  PUSH: ['주소', '누구', '이름', '등록']
};
const KIDS = ['yunho', 'chaewon'];
const PHOTO_KEYS = ['photo_yunho', 'photo_chaewon', 'photo_ily', 'photo_bg'];

function doGet() {
  // 앱 화면은 github.io에서 열어요. 이 주소로 들어오면 그쪽으로 안내만 해요.
  var url = 'https://friese8807.github.io/ycn-app/';
  return HtmlService.createHtmlOutput('<meta charset="utf-8"><div style="font:16px sans-serif;text-align:center;padding:48px 16px">'
    + '<p>여기는 서버 주소예요. 앱은 아래에서 열어주세요.</p><p><a href="' + url + '" target="_top" style="font-weight:700">윤호, 채원이네 열기</a></p></div>'
    + '<script>try{window.top.location.href="' + url + '"}catch(e){}</script>')
    .setTitle('윤호, 채원이네')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}
// 홈 화면 앱(github.io)이 화면 없이 데이터만 주고받는 입구예요.
function doPost(e) {
  var req = {};
  try { req = JSON.parse((e && e.postData && e.postData.contents) || '{}'); } catch (x) { req = {}; }
  return ContentService.createTextOutput(JSON.stringify(api(req))).setMimeType(ContentService.MimeType.JSON);
}
// ycn-part-1.txt, ycn-part-2.txt … 를 번호 순서대로 이어 붙여 화면을 만들어요.
function appParts_() {
  var parents = DriveApp.getFileById(book_().getId()).getParents();
  var parts = [];
  while (parents.hasNext()) {
    var it = parents.next().getFiles();
    while (it.hasNext()) {
      var f = it.next(); var m = /^ycn-part-(\d+)\.txt$/i.exec(f.getName());
      if (!m || f.isTrashed()) continue;
      parts.push({ n: Number(m[1]), text: f.getBlob().getDataAsString('UTF-8') });
    }
  }
  parts.sort(function (a, b) { return a.n - b.n; });
  for (var i = 0; i < parts.length; i++) if (parts[i].n !== i + 1) return '';
  return parts.map(function (p) { return p.text; }).join('');
}
function appFile_() {
  var parents = DriveApp.getFileById(book_().getId()).getParents();
  var best = null;
  while (parents.hasNext()) {
    var it = parents.next().getFiles();
    while (it.hasNext()) {
      var f = it.next();
      if (!/^Index.*\.html?$/i.test(f.getName()) || f.isTrashed()) continue;
      if (!best || f.getLastUpdated() > best.getLastUpdated()) best = f;
    }
  }
  return best;
}

/* ---------- sheet helpers ---------- */
function book_() { return SpreadsheetApp.getActiveSpreadsheet(); }
function tz_() { return book_().getSpreadsheetTimeZone() || 'Asia/Seoul'; }
function sheet_(key) {
  const name = SH[key];
  let sh = book_().getSheetByName(name);
  if (!sh) {
    sh = book_().insertSheet(name);
    sh.getRange(1, 1, 1, COLS[key].length).setValues([COLS[key]]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}
function values_(key) {
  const sh = sheet_(key);
  const v = sh.getDataRange().getValues();
  return v.slice(1).map(function (r, i) { return { r: r, row: i + 2 }; }).filter(function (x) { return String(x.r[0]) !== ''; });
}
function dstr_(x, fmt) {
  if (x instanceof Date) return Utilities.formatDate(x, tz_(), fmt || 'yyyy-MM-dd');
  return String(x == null ? '' : x);
}
function bool_(x) { return x === true || String(x).toUpperCase() === 'TRUE'; }
function safe_(s, n) {
  s = String(s == null ? '' : s).slice(0, n || 200);
  return /^[=+\-@]/.test(s) ? ' ' + s : s;   // 수식 주입 방지
}
function today_() { return Utilities.formatDate(new Date(), tz_(), 'yyyy-MM-dd'); }
function fail_(code, msg) { return new Error(code + '|' + msg); }

/* ---------- settings ---------- */
function settings_() {
  const o = {};
  values_('SET').forEach(function (x) { o[String(x.r[0])] = x.r[1]; });
  if (!o.salt) { o.salt = Utilities.getUuid(); setSetting_('salt', o.salt); }
  return o;
}
function setSetting_(k, val) {
  const sh = sheet_('SET');
  const rows = values_('SET');
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i].r[0]) === k) { sh.getRange(rows[i].row, 2).setValue(val); return; }
  }
  sh.appendRow([k, val]);
}
function hash_(pin, salt) {
  const b = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, salt + ':' + pin, Utilities.Charset.UTF_8);
  return b.map(function (x) { return ((x + 256) % 256).toString(16); }).map(function (h) { return h.length < 2 ? '0' + h : h; }).join('');
}

/* ---------- auth ---------- */
function authorize_(a, st) {
  if (!a || !a.who) throw fail_('auth', '로그인이 필요해요');
  const who = String(a.who);
  if (who !== 'parent' && KIDS.indexOf(who) < 0) throw fail_('auth', '사용자를 다시 골라주세요');
  const key = who === 'parent' ? 'parentPinHash' : 'pin_' + who;
  const h = String(st[key] || '');
  if (h) {
    const cache = CacheService.getScriptCache();
    const ck = 'fail_' + who;
    const n = Number(cache.get(ck) || 0);
    if (n >= 5) throw fail_('locked', '비밀번호를 여러 번 틀렸어요. 5분 뒤에 다시 해주세요');
    if (hash_(String(a.pin || ''), st.salt) !== h) {
      cache.put(ck, String(n + 1), 300);
      throw fail_('auth', '비밀번호가 맞지 않아요');
    }
  }
  return {
    role: who === 'parent' ? 'parent' : 'kid',
    kid: who === 'parent' ? null : who,
    name: who === 'parent' ? (String(a.name || '부모').slice(0, 10)) : String(st['name_' + who] || who)
  };
}
function parentOnly_(me) { if (me.role !== 'parent') throw fail_('forbidden', '부모님만 할 수 있어요'); }

/* ---------- reads ---------- */
function rules_() {
  return values_('RULE').map(function (x) {
    const r = x.r;
    return { kid: String(r[0]), id: String(r[1]), label: String(r[2]), amount: Number(r[3]) || 0,
      ily: bool_(r[4]), kidOk: bool_(r[5]), max: Number(r[6]) || 0,
      photo: (r[7] === '' || r[7] == null) ? true : bool_(r[7]), _row: x.row };
  });
}
function entries_() {
  return values_('LOG').map(function (x) {
    const r = x.r;
    return { _id: String(r[0]), kid: String(r[1]), date: dstr_(r[2]), ts: Number(r[3]) || 0, ruleId: String(r[4]),
      label: String(r[5]), amount: Number(r[6]) || 0, memo: String(r[7]), photo: String(r[8]), photoHash: String(r[9]),
      src: String(r[10]), status: String(r[11] || 'ok'), reason: String(r[12]), byName: String(r[13]),
      reviewer: String(r[14]), reviewedAt: Number(r[15]) || 0, _row: x.row };
  });
}
function ledger_() {
  return values_('PAY').map(function (x) {
    const r = x.r;
    return { kid: String(r[0]), month: dstr_(r[1], 'yyyy-MM'), paid: bool_(r[2]), paidAt: dstr_(r[3]),
      base: Number(r[4]) || 0, plus: Number(r[5]) || 0, minus: Number(r[6]) || 0, bonus: Number(r[7]) || 0,
      total: Number(r[8]) || 0, by: String(r[9]), _row: x.row };
  });
}
function isPaid_(kid, month) {
  return ledger_().some(function (l) { return l.kid === kid && l.month === month && l.paid; });
}
function publicCfg_(st) {
  const kids = {};
  KIDS.forEach(function (k) {
    kids[k] = { name: String(st['name_' + k] || k), photo: String(st['photo_' + k] || ''), hasPin: !!st['pin_' + k] };
  });
  return { kids: kids, ily: String(st.photo_ily || ''), bg: String(st.photo_bg || ''), hasParentPin: !!st.parentPinHash };
}
function clean_(o) { const c = {}; for (var k in o) if (k !== '_row') c[k] = o[k]; return c; }

/* ---------- api ---------- */
function api(req) {
  try {
    return { ok: true, data: route_(req || {}) };
  } catch (e) {
    const m = String(e && e.message || e);
    const i = m.indexOf('|');
    return { ok: false, code: i > 0 ? m.slice(0, i) : 'error', message: i > 0 ? m.slice(i + 1) : '처리하지 못했어요: ' + m };
  }
}
function route_(req) {
  const st = settings_();
  const a = String(req.action || '');
  if (a === 'boot') return { cfg: publicCfg_(st), today: today_() };
  if (a === 'image') return image_(req, st);
  if (a === 'pushKey') return { key: vapid_(st).pub };
  if (a === 'pushMsg') return { msg: popMsg_(req.endpoint) };
  const me = authorize_(req.auth, st);
  if (a === 'login' || a === 'load') logAccess_(req, me);
  if (a === 'login') return { role: me.role, name: me.name };
  if (a === 'load') return load_(String(req.month || ''), me, st);
  if (a === 'access') return access_(me);
  if (a === 'pushSub') return pushSub_(req, me);
  if (a === 'pushOff') { delPushRow_(String(req.endpoint || '')); return {}; }
  if (a === 'pushTest') { pushTo_(st, function (x) { return x.endpoint === String(req.endpoint || ''); }, '알림이 잘 와요 🔔', me.name + ' 휴대폰에 알림이 켜져 있어요'); return {}; }
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    switch (a) {
      case 'addEntry': return addEntry_(req, me, st);
      case 'review': return review_(req, me);
      case 'deleteEntry': return deleteEntry_(req, me);
      case 'pay': return pay_(req, me);
      case 'unpay': return unpay_(req, me);
      case 'saveRule': return saveRule_(req, me);
      case 'deleteRule': return deleteRule_(req, me);
      case 'saveSettings': return saveSettings_(req, me);
      case 'setPin': return setPin_(req, me, st);
      case 'setPhoto': return setPhoto_(req, me, st);
    }
  } finally { lock.releaseLock(); }
  throw fail_('bad', '알 수 없는 요청이에요');
}

// 접속 기록: 앱이 보낸 meta가 있을 때만, 같은 사람·기기는 10분에 한 번만 남겨요. (위젯 자동 새로고침은 meta가 없어 빠져요)
function logAccess_(req, me) {
  try {
    const m = req.meta; if (!m || typeof m !== 'object') return;
    const who = String(req.auth.who), dev = safe_(m.dev, 60), via = safe_(m.via, 20);
    const cache = CacheService.getScriptCache(), ck = 'acc_' + Utilities.base64EncodeWebSafe(who + '|' + me.name + '|' + dev).slice(0, 200);
    if (req.action !== 'login' && cache.get(ck)) return;
    cache.put(ck, '1', 600);
    const sh = sheet_('ACC');
    sh.insertRowBefore(2);
    sh.getRange(2, 1, 1, 5).setValues([[Utilities.formatDate(new Date(), tz_(), 'yyyy-MM-dd HH:mm:ss'), who === 'parent' ? '부모' : '아이', safe_(me.name, 20), via, dev]]);
    if (sh.getLastRow() > 3001) sh.deleteRows(3002, sh.getLastRow() - 3001);
  } catch (e) {}
}

function access_(me) {
  parentOnly_(me);
  const sh = book_().getSheetByName(SH.ACC);
  if (!sh || sh.getLastRow() < 2) return { rows: [] };
  const n = Math.min(40, sh.getLastRow() - 1);
  return { rows: sh.getRange(2, 1, n, 5).getValues().map(function (r) {
    return { t: dstr_(r[0], 'yyyy-MM-dd HH:mm:ss'), who: String(r[1]), name: String(r[2]), via: String(r[3]), dev: String(r[4]) };
  }) };
}

function load_(month, me, st) {
  if (!/^\d{4}-\d{2}$/.test(month)) month = today_().slice(0, 7);
  const kids = {};
  KIDS.forEach(function (k) {
    kids[k] = { name: String(st['name_' + k] || k), base: Number(st['base_' + k]) || 0, baseVac: Number(st['baseVac_' + k]) || 0, photo: String(st['photo_' + k] || ''), hasPin: !!st['pin_' + k], rules: [] };
  });
  rules_().forEach(function (r) { if (kids[r.kid]) kids[r.kid].rules.push(clean_(r)); });
  var bonuses = [];
  try { bonuses = JSON.parse(String(st.bonuses || '[]')); } catch (e) { bonuses = []; }
  const ents = entries_().filter(function (e) {
    return e.date.slice(0, 7) === month && (!me.kid || e.kid === me.kid);
  }).map(clean_).sort(function (a, b) { return b.ts - a.ts; });
  const led = {};
  ledger_().forEach(function (l) { if (l.month === month && (!me.kid || l.kid === me.kid)) led[l.kid + '_' + l.month] = clean_(l); });
  return {
    config: { kids: kids, bonuses: bonuses, vacMonths: String(st.vacMonths || ''),
      accounts: me.role === 'parent' ? accounts_(st) : {}, floorZero: st.floorZero === '' || st.floorZero == null ? true : bool_(st.floorZero), momMinus: bool_(st.momMinus),
      ily: String(st.photo_ily || ''), bg: String(st.photo_bg || ''), hasParentPin: !!st.parentPinHash },
    entries: ents, ledger: led, today: today_(), month: month, me: me
  };
}

function accounts_(st) {
  const o = {};
  KIDS.forEach(function (k) { o[k] = { bank: String(st['bank_' + k] || ''), no: String(st['acct_' + k] || '').replace(/^'/, '') }; });
  return o;
}
function image_(req, st) {
  const id = String(req.id || '');
  if (!id) throw fail_('bad', '사진 정보가 없어요');
  const isPublic = PHOTO_KEYS.some(function (k) { return String(st[k] || '') === id; });
  if (!isPublic) {
    const me = authorize_(req.auth, st);
    const e = entries_().filter(function (x) { return x.photo === id; })[0];
    if (!e || (me.kid && e.kid !== me.kid)) throw fail_('forbidden', '볼 수 없는 사진이에요');
  }
  const blob = DriveApp.getFileById(id).getBlob();
  return { id: id, url: 'data:' + blob.getContentType() + ';base64,' + Utilities.base64Encode(blob.getBytes()) };
}

function folder_(st) {
  var id = String(st.photoFolderId || '');
  if (id) { try { return DriveApp.getFolderById(id); } catch (e) {} }
  const f = DriveApp.createFolder('윤호, 채원이네 인증 사진');
  setSetting_('photoFolderId', f.getId());
  return f;
}
function savePhoto_(dataUrl, name, st) {
  const m = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/.exec(String(dataUrl || ''));
  if (!m) throw fail_('bad', '사진 형식이 올바르지 않아요');
  const bytes = Utilities.base64Decode(m[2]);
  if (bytes.length > 4 * 1024 * 1024) throw fail_('bad', '사진이 너무 커요');
  return folder_(st).createFile(Utilities.newBlob(bytes, m[1], name)).getId();
}
function trash_(id) { if (!id) return; try { DriveApp.getFileById(id).setTrashed(true); } catch (e) {} }

function addEntry_(req, me, st) {
  const kid = me.kid || String(req.kid || '');
  if (KIDS.indexOf(kid) < 0) throw fail_('bad', '아이를 골라주세요');
  const rule = rules_().filter(function (r) { return r.kid === kid && r.id === String(req.ruleId); })[0];
  if (!rule) throw fail_('bad', '없는 항목이에요. 화면을 새로고침해 주세요');
  const asKid = me.role === 'kid' || req.asKid === true;
  const date = asKid ? today_() : String(req.date || today_());
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date > today_()) throw fail_('bad', '날짜가 올바르지 않아요');
  if (isPaid_(kid, date.slice(0, 7))) throw fail_('paid', '이미 정산이 끝난 달이에요');
  const hashv = String(req.photoHash || '').slice(0, 64);
  if (!asKid && rule.amount < 0 && me.name === '엄마' && !bool_(st.momMinus)) throw fail_('forbidden', '벌점은 아빠만 줄 수 있어요');
  if (asKid) {
    if (!(rule.kidOk && rule.amount > 0)) throw fail_('bad', '아이가 인증할 수 없는 항목이에요');
    if (rule.photo && !req.photo) throw fail_('bad', '인증 사진이 필요해요');
    const ents = entries_();
    const used = ents.filter(function (e) { return e.kid === kid && e.ruleId === rule.id && e.date === date && e.status !== 'rejected'; }).length;
    if (rule.max && used >= rule.max) throw fail_('limit', '오늘은 이 항목을 더 인증할 수 없어요');
    if (hashv && ents.some(function (e) { return e.kid === kid && e.photoHash === hashv; })) throw fail_('dup', '이미 인증에 쓴 사진이에요');
  }
  const photoId = req.photo ? savePhoto_(req.photo, date + '_' + kid + '_' + rule.id + '.jpg', st) : '';
  const id = Utilities.getUuid().replace(/-/g, '').slice(0, 10);
  sheet_('LOG').appendRow([id, kid, date, Date.now(), rule.id, safe_(rule.label, 60), rule.amount, safe_(req.memo, 200), photoId, hashv,
    asKid ? 'kid' : 'parent', asKid ? 'pending' : 'ok', '', safe_(me.name, 20), '', '']);
  if (asKid) pushTo_(st, function (x) { return x.who === 'parent'; }, '인증 도착 📷', ka_(st, kid) + " '" + rule.label + "' 인증을 보냈어요 (" + won_(rule.amount) + ')');
  return { id: id, status: asKid ? 'pending' : 'ok' };
}

function findEntry_(id) {
  const e = entries_().filter(function (x) { return x._id === String(id); })[0];
  if (!e) throw fail_('gone', '이미 지워졌거나 없는 기록이에요');
  return e;
}
function review_(req, me) {
  parentOnly_(me);
  const e = findEntry_(req.id);
  if (isPaid_(e.kid, e.date.slice(0, 7))) throw fail_('paid', '이미 정산이 끝난 달이에요');
  const ok = req.decision === 'ok';
  sheet_('LOG').getRange(e._row, 12, 1, 5).setValues([[ok ? 'ok' : 'rejected', ok ? '' : safe_(req.reason, 100), e.byName, safe_(me.name, 20), Date.now()]]);
  if (e.src === 'kid') pushTo_(settings_(), function (x) { return x.who === e.kid; }, ok ? '인증 승인 🎉' : '인증 반려',
    ok ? "'" + e.label + "' 인증이 승인됐어요 (" + won_(e.amount) + ')' : "'" + e.label + "' 인증이 반려됐어요" + (req.reason ? ' · ' + String(req.reason).slice(0, 60) : ''));
  return { id: e._id, status: ok ? 'ok' : 'rejected' };
}
function deleteEntry_(req, me) {
  const e = findEntry_(req.id);
  if (me.role !== 'parent' && !(e.kid === me.kid && e.status === 'pending')) throw fail_('forbidden', '지울 수 없는 기록이에요');
  if (isPaid_(e.kid, e.date.slice(0, 7))) throw fail_('paid', '이미 정산이 끝난 달이에요');
  sheet_('LOG').deleteRow(e._row);
  trash_(e.photo);
  return { id: e._id };
}
function pay_(req, me) {
  parentOnly_(me);
  const kid = String(req.kid), month = String(req.month);
  if (KIDS.indexOf(kid) < 0 || !/^\d{4}-\d{2}$/.test(month)) throw fail_('bad', '정산 정보가 올바르지 않아요');
  const s = req.summary || {};
  const row = [kid, month, true, today_(), Number(s.base) || 0, Number(s.plus) || 0, Number(s.minus) || 0, Number(s.bonus) || 0, Number(s.total) || 0, safe_(me.name, 20)];
  const l = ledger_().filter(function (x) { return x.kid === kid && x.month === month; })[0];
  if (l) sheet_('PAY').getRange(l._row, 1, 1, row.length).setValues([row]); else sheet_('PAY').appendRow(row);
  return { paid: true };
}
function unpay_(req, me) {
  parentOnly_(me);
  const l = ledger_().filter(function (x) { return x.kid === String(req.kid) && x.month === String(req.month); })[0];
  if (l) sheet_('PAY').getRange(l._row, 3).setValue(false);
  return { paid: false };
}
function saveRule_(req, me) {
  parentOnly_(me);
  const kid = String(req.kid); const r = req.rule || {};
  if (KIDS.indexOf(kid) < 0) throw fail_('bad', '아이를 골라주세요');
  const amount = Math.round(Number(r.amount) || 0);
  const label = String(r.label || '').trim();
  if (!label || !amount) throw fail_('bad', '이름과 금액을 입력해 주세요');
  const id = String(r.id || ('r' + Date.now().toString(36)));
  const row = [kid, id, safe_(label, 40), amount, !!r.ily, amount > 0 && !!r.kidOk, Math.max(0, Math.round(Number(r.max) || 0)), r.photo !== false];
  const ex = rules_().filter(function (x) { return x.kid === kid && x.id === id; })[0];
  if (ex) sheet_('RULE').getRange(ex._row, 1, 1, row.length).setValues([row]); else sheet_('RULE').appendRow(row);
  return { id: id };
}
function deleteRule_(req, me) {
  parentOnly_(me);
  const ex = rules_().filter(function (x) { return x.kid === String(req.kid) && x.id === String(req.id); })[0];
  if (ex) sheet_('RULE').deleteRow(ex._row);
  return {};
}
function saveSettings_(req, me) {
  parentOnly_(me);
  const s = req.settings || {};
  KIDS.forEach(function (k) {
    if (s['base_' + k] != null) setSetting_('base_' + k, Math.max(0, Math.round(Number(s['base_' + k]) || 0)));
    if (s['baseVac_' + k] != null) setSetting_('baseVac_' + k, Math.max(0, Math.round(Number(s['baseVac_' + k]) || 0)));
  });
  KIDS.forEach(function (k) {
    if (s['bank_' + k] != null) setSetting_('bank_' + k, String(s['bank_' + k]).slice(0, 20));
    if (s['acct_' + k] != null) { var no = String(s['acct_' + k]).replace(/[^0-9-]/g, '').slice(0, 30); setSetting_('acct_' + k, no ? "'" + no : ''); } // ' = 시트가 날짜·숫자로 바꾸지 않게 글자로 저장
  });
  if (s.vacMonths != null) setSetting_('vacMonths', String(s.vacMonths).replace(/[^0-9,]/g, '').slice(0, 40));
  if (s.floorZero != null) setSetting_('floorZero', !!s.floorZero);
  if (s.momMinus != null) { if (me.name !== '아빠') throw fail_('forbidden', '아빠만 바꿀 수 있어요'); setSetting_('momMinus', !!s.momMinus); }
  if (s.bonuses != null) setSetting_('bonuses', JSON.stringify(s.bonuses).slice(0, 5000));
  return {};
}
function setPin_(req, me, st) {
  const target = String(req.target);
  // 부모 PIN이 아직 없을 때만 누구나 첫 설정 가능, 그 뒤로는 부모만
  if (!(target === 'parent' && !st.parentPinHash)) parentOnly_(me);
  const pin = String(req.pin || '');
  if (target === 'parent') {
    if (!/^\d{4,8}$/.test(pin)) throw fail_('bad', '숫자 4~8자리로 정해주세요');
    setSetting_('parentPinHash', hash_(pin, st.salt));
  } else if (KIDS.indexOf(target) >= 0) {
    if (pin && !/^\d{4,8}$/.test(pin)) throw fail_('bad', '숫자 4~8자리로 정해주세요');
    setSetting_('pin_' + target, pin ? hash_(pin, st.salt) : '');
  } else throw fail_('bad', '대상이 올바르지 않아요');
  return {};
}
function setPhoto_(req, me, st) {
  parentOnly_(me);
  const target = String(req.target);
  if (['yunho', 'chaewon', 'ily', 'bg'].indexOf(target) < 0) throw fail_('bad', '대상이 올바르지 않아요');
  const old = String(st['photo_' + target] || '');
  const id = savePhoto_(req.data, 'profile_' + target + '.jpg', st);
  setSetting_('photo_' + target, id);
  trash_(old);
  return { id: id };
}

/** 처음 한 번 편집기에서 실행해 권한(시트·드라이브)을 허용하세요. */
function setup() {
  ['SET', 'RULE', 'LOG', 'PAY'].forEach(sheet_);
  const st = settings_();
  folder_(st);
  Logger.log('준비 완료. 이제 배포 > 새 배포 > 웹 앱으로 배포하세요.');
}


/* ---------- 알림 (웹 푸시) ----------
 * 구글 서버는 암호화 기능이 없어 내용 없는 알림만 보내고, 휴대폰(sw.js)이 알림을 받으면 서버에서 문구(popMsg_)를 받아 띄운다.
 * 알림 서명(VAPID, P-256)은 아래 함수가 직접 한다. 열쇠는 처음 한 번 만들어 설정 시트에 둔다. */
function won_(n) { n = Number(n) || 0; return (n > 0 ? '+' : n < 0 ? '−' : '') + Math.abs(n).toLocaleString('ko-KR') + '원'; }
function ka_(st, kid) { // '윤호가', '채원이가'
  var n = String(st['name_' + kid] || kid); if (n.length === 3) n = n.slice(1);
  var c = n.charCodeAt(n.length - 1) - 0xAC00; return n + (c >= 0 && c < 11172 && c % 28 ? '이가' : '가');
}
function b64u_(x) { return (typeof x === 'string' ? Utilities.base64EncodeWebSafe(x, Utilities.Charset.UTF_8) : Utilities.base64EncodeWebSafe(x)).replace(/=+$/, ''); }
function sha_(x) { return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, x); }
function big_(bytes) { var h = '0x0'; bytes.forEach(function (b) { h += ('0' + ((b + 256) % 256).toString(16)).slice(-2); }); return BigInt(h); }
function bytes_(x, n) { var h = x.toString(16); while (h.length < n * 2) h = '0' + h; var o = []; for (var i = 0; i < n; i++) { var v = parseInt(h.substr(i * 2, 2), 16); o.push(v > 127 ? v - 256 : v); } return o; }
var EC_ = null;
function ec_() {
  if (!EC_) EC_ = { p: BigInt('0xffffffff00000001000000000000000000000000ffffffffffffffffffffffff'), n: BigInt('0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551'),
    G: [BigInt('0x6b17d1f2e12c4247f8bce6e563a440f277037d812deb33a0f4a13945d898c296'), BigInt('0x4fe342e2fe1a7f9b8ee7eb4a7c0f9e162bce33576b315ececbb6406837bf51f5')] };
  return EC_;
}
function md_(a, m) { a = a % m; return a < BigInt(0) ? a + m : a; }
function inv_(a, m) { var t = BigInt(0), nt = BigInt(1), r = m, nr = md_(a, m), q, x; while (nr !== BigInt(0)) { q = r / nr; x = t - q * nt; t = nt; nt = x; x = r - q * nr; r = nr; nr = x; } return md_(t, m); }
function ecAdd_(P, Q) {
  if (!P) return Q; if (!Q) return P;
  var p = ec_().p, l;
  if (P[0] === Q[0]) { if (md_(P[1] + Q[1], p) === BigInt(0)) return null; l = md_(BigInt(3) * P[0] * P[0] - BigInt(3), p) * inv_(BigInt(2) * P[1], p) % p; }
  else l = md_(Q[1] - P[1], p) * inv_(Q[0] - P[0], p) % p;
  var x = md_(l * l - P[0] - Q[0], p);
  return [x, md_(l * (P[0] - x) - P[1], p)];
}
function ecMul_(k, P) { var R = null; while (k > BigInt(0)) { if (k % BigInt(2) === BigInt(1)) R = ecAdd_(R, P); P = ecAdd_(P, P); k = k / BigInt(2); } return R; }
function rnd_(extra) { // 난수: 무작위 UUID 여러 개 + 추가 값을 SHA-256으로 섞는다
  return big_(sha_(Utilities.getUuid() + Utilities.getUuid() + Utilities.getUuid() + String(extra || '') + Date.now()));
}
function vapid_(st) {
  var d = String(st.vapidD || '').replace(/^k/, ''), pub = String(st.vapidPub || '').replace(/^k/, '');
  if (!d || !pub) {
    var n = ec_().n, D = md_(rnd_(), n - BigInt(1)) + BigInt(1), Q = ecMul_(D, ec_().G);
    d = D.toString(16); pub = b64u_([4].concat(bytes_(Q[0], 32), bytes_(Q[1], 32)));
    setSetting_('vapidD', 'k' + d); setSetting_('vapidPub', 'k' + pub);  // k = 시트가 숫자로 바꾸지 않게
  }
  return { d: BigInt('0x' + d), pub: pub };
}
function jwt_(v, aud) {
  var msg = b64u_(JSON.stringify({ typ: 'JWT', alg: 'ES256' })) + '.' + b64u_(JSON.stringify({ aud: aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: 'https://friese8807.github.io/ycn-app/' }));
  var c = ec_(), e = big_(sha_(msg)), r = BigInt(0), s = BigInt(0);
  while (r === BigInt(0) || s === BigInt(0)) {
    var k = md_(rnd_(v.d.toString(16) + msg), c.n - BigInt(1)) + BigInt(1);
    r = md_(ecMul_(k, c.G)[0], c.n);
    s = md_(inv_(k, c.n) * (e + r * v.d), c.n);
  }
  return msg + '.' + b64u_(bytes_(r, 32).concat(bytes_(s, 32)));
}
function pushRows_() { return values_('PUSH').map(function (x) { return { endpoint: String(x.r[0]), who: String(x.r[1]), row: x.row }; }); }
function delPushRow_(ep) { var rows = pushRows_().filter(function (x) { return x.endpoint === ep; }); for (var i = rows.length - 1; i >= 0; i--) sheet_('PUSH').deleteRow(rows[i].row); }
function pushSub_(req, me) {
  var ep = String(req.endpoint || '');
  if (!/^https:\/\/[^\s]{10,900}$/.test(ep)) throw fail_('bad', '알림 주소가 올바르지 않아요');
  delPushRow_(ep);
  sheet_('PUSH').appendRow([ep, me.kid || 'parent', safe_(me.name, 20), Utilities.formatDate(new Date(), tz_(), 'yyyy-MM-dd HH:mm')]);
  return {};
}
function msgKey_(ep) { return 'pm_' + big_(sha_(String(ep))).toString(16); }
function popMsg_(ep) {
  var c = CacheService.getScriptCache(), k = msgKey_(ep), list = [];
  try { list = JSON.parse(c.get(k) || '[]'); } catch (e) { list = []; }
  var m = list.shift() || null; c.put(k, JSON.stringify(list), 21600);
  return m;
}
/** 조건(match)에 맞는 휴대폰마다 문구를 맡겨 두고 내용 없는 알림을 보낸다. 실패해도 본래 동작은 막지 않는다. */
function pushTo_(st, match, title, body) {
  try {
    var targets = pushRows_().filter(match); if (!targets.length) return;
    var v = vapid_(st), c = CacheService.getScriptCache(), gone = [];
    targets.forEach(function (t) {
      var k = msgKey_(t.endpoint), list = [];
      try { list = JSON.parse(c.get(k) || '[]'); } catch (e) {}
      list.push({ title: title, body: body }); c.put(k, JSON.stringify(list.slice(-5)), 21600);
      var aud = t.endpoint.match(/^https:\/\/[^\/]+/)[0];
      var res = UrlFetchApp.fetch(t.endpoint, { method: 'post', payload: '', muteHttpExceptions: true,
        headers: { TTL: '86400', Urgency: 'high', Authorization: 'vapid t=' + jwt_(v, aud) + ', k=' + v.pub } });
      var code = res.getResponseCode();
      if (code === 404 || code === 410) gone.push(t.endpoint);
    });
    gone.forEach(delPushRow_);
  } catch (e) { console.log('push 실패: ' + e); }
}
