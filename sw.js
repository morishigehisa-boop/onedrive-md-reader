/* OneDrive Markdown Reader - Service Worker (v3.8.0)
   アプリ本体とCDNのスクリプトを端末に保存し、通信なしでも起動できるようにする。
   Microsoft Graph / ログイン関連の通信は一切横取りしない。 */
const CACHE = "mdreader-v3.8.0";
const CDN_HOSTS = ["cdn.jsdelivr.net", "cdn.tailwindcss.com"];
const STATIC = ["manifest.webmanifest", "icon-192.png", "icon-512.png", "apple-touch-icon.png"];

self.addEventListener("install", e => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    // 本体HTMLを取得し、そこに書かれたCDNのscriptを同じURLで保存（バージョンのずれを防ぐ）
    try {
      const res = await fetch("./", { cache: "reload" });
      const html = await res.clone().text();
      await c.put("./", res);
      const urls = [...html.matchAll(/<script[^>]+src="(https:[^"]+)"/g)].map(m => m[1]);
      await Promise.all(urls.map(async u => {
        try {
          const cors = new URL(u).hostname === "cdn.jsdelivr.net";
          await c.put(u, await fetch(new Request(u, { mode: cors ? "cors" : "no-cors", credentials: "omit" })));
        } catch (_) {}
      }));
    } catch (_) {}
    await Promise.all(STATIC.map(u => c.add(u).catch(() => {})));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== CACHE && k.startsWith("mdreader-")) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (req.mode === "navigate" && url.origin === self.location.origin) {
    // 画面本体：通信できれば最新、できなければ保存済み
    e.respondWith(fetch(req).then(res => {
      if (res.ok) { const cp = res.clone(); caches.open(CACHE).then(c => c.put("./", cp)); }
      return res;
    }).catch(async () => (await caches.match("./")) || Response.error()));
    return;
  }
  if (url.origin === self.location.origin || CDN_HOSTS.includes(url.hostname)) {
    // 静的ファイルとCDN：保存済みを即返しつつ、裏で更新
    e.respondWith((async () => {
      const hit = await caches.match(req);
      const net = fetch(req).then(res => {
        if (res && (res.ok || res.type === "opaque")) { const cp = res.clone(); caches.open(CACHE).then(c => c.put(req, cp)); }
        return res;
      }).catch(() => hit);
      return hit || net;
    })());
  }
});
