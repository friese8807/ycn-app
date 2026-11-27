/* 윤호, 채원이네 — 알림 전용 서비스 워커 (화면 저장은 하지 않아요)
 * 서버가 내용 없는 알림을 보내면, 여기서 서버에 문구를 물어 알림을 띄워요. */
const API = "https://script.google.com/macros/s/AKfycbzhbaZtMcPyhMlsOBEt1cqps72dyTTdhso3vsjWXAA69xLrck1xABlOnCCfZMnQRISg/exec";
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", e => e.waitUntil(self.clients.claim()));
self.addEventListener("push", e => e.waitUntil((async () => {
  let m = null;
  try {
    const sub = await self.registration.pushManager.getSubscription();
    const r = await fetch(API, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify({ action: "pushMsg", endpoint: sub && sub.endpoint }) });
    const j = await r.json(); m = j && j.ok && j.data && j.data.msg;
  } catch (_) {}
  m = m || { title: "윤호, 채원이네", body: "새 소식이 있어요. 눌러서 확인해 주세요." };
  await self.registration.showNotification(m.title, { body: m.body, icon: "icon-192.png", badge: "icon-192.png" });
})()));
self.addEventListener("notificationclick", e => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(ws => ws.length ? ws[0].focus() : self.clients.openWindow("./")));
});
