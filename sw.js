"use strict";
/* =========================================================
   sw.js - BILLION SHOOTING の Service Worker
   ・アプリシェル (HTML/CSS/JS/アイコン) を先読みキャッシュ
   ・HTML はネットワーク優先 (更新をすぐ拾う)、失敗したらキャッシュ → オフラインでも起動する
   ・それ以外の同一オリジンはキャッシュ優先 + 裏で更新 (stale-while-revalidate)
   ※ セーブデータは IndexedDB なので、キャッシュを消しても消えない
   ========================================================= */
// バージョンとファイル一覧は js/manifest.js が唯一の定義元 (ページと同じものを読む)。
// importScripts したファイルもブラウザの更新チェック対象なので、APP_VERSION を上げれば SW も更新される
importScripts("js/manifest.js");
const CACHE = "billion-shooting-v" + APP_VERSION;

const SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./js/manifest.js",
  ...APP_STYLES.map(p => "./" + appAsset(p)),
  "./" + appAsset(APP_BOOT_SCRIPT),
  ...APP_SCRIPTS.map(p => "./" + appAsset(p)),
  ...APP_ICONS.map(p => "./" + p),
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

  // manifest.js はバージョン付きで読めない (どのバージョンを読むかを決めるファイル) ので、
  // HTML と同じくネットワーク優先にして、更新をすぐ拾う
  if (url.pathname.endsWith("/js/manifest.js")){
    e.respondWith(fetch(req).then(res => {
      if (res && res.status === 200) caches.open(CACHE).then(c => c.put("./js/manifest.js", res.clone()));
      return res;
    }).catch(async () => (await (await caches.open(CACHE)).match("./js/manifest.js")) || Response.error()));
    return;
  }

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
