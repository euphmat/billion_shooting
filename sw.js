"use strict";
/* =========================================================
   sw.js - BILLION SHOOTING の Service Worker
   ・アプリシェル (HTML/CSS/JS/アイコン) を先読みキャッシュ
   ・HTML はネットワーク優先 (更新をすぐ拾う)、失敗したらキャッシュ → オフラインでも起動する
   ・それ以外の同一オリジンはキャッシュ優先 + 裏で更新 (stale-while-revalidate)
   ※ セーブデータは IndexedDB なので、キャッシュを消しても消えない
   ========================================================= */
const V = "v85";                       // index.html の ?v= と合わせる
const CACHE = "billion-shooting-" + V;

const SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./css/style.css?v=" + V.slice(1),
  "./css/mobile.css?v=" + V.slice(1),
  "./js/store.js?v=" + V.slice(1),
  "./js/materials.js?v=" + V.slice(1),
  "./js/planet.js?v=" + V.slice(1),
  "./js/core.js?v=" + V.slice(1),
  "./js/audio.js?v=" + V.slice(1),
  "./js/skills.js?v=" + V.slice(1),
  "./js/ui.js?v=" + V.slice(1),
  "./js/mobs.js?v=" + V.slice(1),
  "./js/artifacts.js?v=" + V.slice(1),
  "./js/game.js?v=" + V.slice(1),
  "./js/skillfx.js?v=" + V.slice(1),
  "./js/skilltree.js?v=" + V.slice(1),
  "./js/mobile.js?v=" + V.slice(1),
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/maskable-512.png",
  "./icons/apple-touch-icon.png",
];

// アプリシェルをキャッシュへ。1つでも失敗すると addAll は全部諦めるので、個別に入れて取りこぼしを許容する
async function precache(){
  const c = await caches.open(CACHE);
  const have = new Set((await c.keys()).map(r => new URL(r.url).pathname + new URL(r.url).search));
  await Promise.all(SHELL.map(u => {
    const p = new URL(u, self.registration.scope);
    if (have.has(p.pathname + p.search)) return null;
    return c.add(new Request(u, { cache: "reload" })).catch(() => {});
  }));
}

self.addEventListener("install", e => {
  e.waitUntil(precache().then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k.startsWith("billion-shooting-") && k !== CACHE).map(k => caches.delete(k)));
    if (self.registration.navigationPreload) await self.registration.navigationPreload.enable().catch(() => {});
    await self.clients.claim();
    await precache();   // ストレージを空にされた後でも取り直せるように
  })());
});



self.addEventListener("message", e => {
  if (e.data === "skipWaiting") self.skipWaiting();
  // ページ側からの入れ直し要求 (install が走らない起動でもシェルを揃えるため)
  else if (e.data === "precache") e.waitUntil(precache());
});

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // HTML (ページ遷移): ネットワーク優先 → 落ちたらキャッシュ
  if (req.mode === "navigate"){
    e.respondWith((async () => {
      try {
        const pre = await e.preloadResponse;
        const res = pre || await fetch(req);
        const c = await caches.open(CACHE);
        c.put("./index.html", res.clone());
        return res;
      } catch (err) {
        const c = await caches.open(CACHE);
        return (await c.match("./index.html")) || (await c.match("./")) || Response.error();
      }
    })());
    return;
  }

  // 静的ファイル: キャッシュ優先 + 裏で更新
  e.respondWith((async () => {
    const c = await caches.open(CACHE);
    const hit = await c.match(req, { ignoreVary: true });
    const net = fetch(req).then(res => {
      if (res && res.status === 200 && res.type === "basic") c.put(req, res.clone());
      return res;
    }).catch(() => null);
    return hit || (await net) || Response.error();
  })());
});
