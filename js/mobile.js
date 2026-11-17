"use strict";
/* =========================================================
   mobile.js - スマホ対応 (最後に読み込む)
     1. バーチャルスティック / ピンチズーム / タップ判定
     2. 工房パネルをボトムシートとして開閉
     3. スキルツリーのピンチズーム
     4. PWA: Service Worker 登録 + ホーム画面に追加の案内
   PC では 1〜3 は何もしない (CSS 側で操作系を隠している)。
   ========================================================= */

const MOBILE_Q = window.matchMedia("(max-width: 860px)");
const isMobile = () => MOBILE_Q.matches;
const COARSE = TOUCH_UI;   // ui.js で判定済み
if (COARSE) document.body.classList.add("touch");

/* =========================================================
   1. バーチャルスティック
   ========================================================= */
(() => {
  const zone = $("stickZone"), knob = $("stickKnob");
  if (!zone) return;
  const MAXR = 44, DEAD = 7;
  let id = null, cx = 0, cy = 0;

  const reset = () => {
    touchAxis.on = false; touchAxis.x = touchAxis.y = touchAxis.mag = 0;
    knob.style.transform = "translate(0,0)";
    zone.classList.remove("on");
  };
  const aim = (px, py) => {
    const dx = px - cx, dy = py - cy, d = Math.hypot(dx, dy);
    if (d < DEAD){ touchAxis.x = touchAxis.y = touchAxis.mag = 0; knob.style.transform = "translate(0,0)"; return; }
    const k = Math.min(1, (d - DEAD) / (MAXR - DEAD));
    touchAxis.x = dx / d; touchAxis.y = dy / d; touchAxis.mag = 0.25 + k * 0.75;   // 弾きすぎても急発進しないよう下限を付ける
    knob.style.transform = `translate(${touchAxis.x * MAXR * k}px, ${touchAxis.y * MAXR * k}px)`;
  };

  zone.addEventListener("pointerdown", e => {
    if (id !== null) return;
    id = e.pointerId;
    try { zone.setPointerCapture(id); } catch(err){}
    const r = zone.getBoundingClientRect();
    cx = r.left + r.width / 2; cy = r.top + r.height / 2;
    touchAxis.on = true; zone.classList.add("on");
    audio();                       // 初回タッチで効果音を有効化
    aim(e.clientX, e.clientY);
    e.preventDefault();
  });
  zone.addEventListener("pointermove", e => { if (e.pointerId === id){ aim(e.clientX, e.clientY); e.preventDefault(); } });
  const up = e => { if (e.pointerId === id){ id = null; reset(); } };
  zone.addEventListener("pointerup", up);
  zone.addEventListener("pointercancel", up);
  window.addEventListener("blur", () => { id = null; reset(); });
  window.mobileStickReset = reset;
})();

/* =========================================================
   2. ゲーム画面: タップでブロックを調べる / 2本指でズーム
   ========================================================= */
(() => {
  const pts = new Map();
  let startT = 0, sx0 = 0, sy0 = 0, moved = 0, pinchD = 0, pinched = false;
  const two = () => { const [a, b] = [...pts.values()]; return Math.hypot(a.x - b.x, a.y - b.y); };

  cv.addEventListener("pointerdown", e => {
    if (e.pointerType === "mouse") return;
    touchCanvas = true;                       // PC 用の click ハンドラを黙らせる
    pts.set(e.pointerId, { x:e.clientX, y:e.clientY });
    if (pts.size === 1){ startT = performance.now(); sx0 = e.clientX; sy0 = e.clientY; moved = 0; pinched = false; }
    else if (pts.size === 2){ pinchD = two(); pinched = true; }
  }, { passive:true });

  cv.addEventListener("pointermove", e => {
    if (!pts.has(e.pointerId)) return;
    pts.set(e.pointerId, { x:e.clientX, y:e.clientY });
    if (pts.size === 1){ moved = Math.max(moved, Math.hypot(e.clientX - sx0, e.clientY - sy0)); }
    else if (pts.size === 2){
      const d = two();
      if (pinchD > 8 && d > 8) applyZoom(d / pinchD);
      pinchD = d;
    }
  }, { passive:true });

  const end = e => {
    if (!pts.has(e.pointerId)) return;
    pts.delete(e.pointerId);
    if (pts.size === 1){ pinchD = 0; }          // 片方だけ離した: 残りの指では何もしない
    if (pts.size === 0){
      const quick = performance.now() - startT < 350 && moved < 14;
      if (quick && !pinched) inspectAtClient(e.clientX, e.clientY);
      setTimeout(() => { touchCanvas = false; }, 400);   // 合成 click が来るので少し待ってから戻す
    }
  };
  cv.addEventListener("pointerup", end, { passive:true });
  cv.addEventListener("pointercancel", end, { passive:true });

  // ズーム ± (押しっぱなしで連続)
  const holdZoom = (btn, f) => {
    if (!btn) return;
    let t = 0;
    const stop = () => { clearInterval(t); t = 0; };
    btn.addEventListener("pointerdown", e => {
      e.preventDefault(); applyZoom(f);
      stop(); t = setInterval(() => applyZoom(f), 70);
    });
    ["pointerup", "pointerleave", "pointercancel"].forEach(ev => btn.addEventListener(ev, stop));
  };
  holdZoom($("mZoomIn"), 1.07);
  holdZoom($("mZoomOut"), 1 / 1.07);

  // iOS Safari の「2本指で画面を拡大」を止める (ゲーム内のピンチと喧嘩するため)。
  // ダブルタップ拡大の抑止は CSS の touch-action:manipulation に任せる
  // (touchend を preventDefault すると、連打した 2 回目の click が消えてしまう)
  ["gesturestart", "gesturechange", "gestureend"].forEach(ev =>
    document.addEventListener(ev, e => e.preventDefault(), { passive:false }));
})();

/* =========================================================
   3. 工房 = ボトムシート
   ========================================================= */
const sheetOpen = () => document.body.classList.contains("sheet-open");
function setSheet(open){
  if (open === sheetOpen()) return;
  document.body.classList.toggle("sheet-open", open);
  const side = $("side");
  side.style.transform = "";
  if (open){ renderPanels(true); updateHUD(); if (window.mobileStickReset) mobileStickReset(); }
}
(() => {
  const side = $("side"), handle = $("sheetHandle");
  const shop = $("mShop");
  if (shop) shop.addEventListener("click", () => { audio(); setSheet(!sheetOpen()); });
  // 左下メニューの残りは、画面上の既存ボタンをそのまま押す (開閉の作法を揃える)
  const menuTap = (id, target) => {
    const el = $(id);
    if (el) el.addEventListener("click", () => { audio(); const b = $(target); if (b) b.click(); });
  };
  menuTap("mMenuTree", "treeBtn");
  menuTap("mMenuArt", "artBtn");
  menuTap("mMenuGear", "gearBtn");
  const back = $("sheetBack");
  if (back) back.addEventListener("click", () => setSheet(false));

  // つまみを下にスワイプで閉じる
  if (handle){
    let id = null, y0 = 0, dy = 0;
    handle.addEventListener("pointerdown", e => {
      id = e.pointerId; y0 = e.clientY; dy = 0;
      try { handle.setPointerCapture(id); } catch(err){}
      side.style.transition = "none";
      e.preventDefault();
    });
    handle.addEventListener("pointermove", e => {
      if (e.pointerId !== id) return;
      dy = Math.max(0, e.clientY - y0);
      side.style.transform = `translateY(${dy}px)`;
    });
    const done = e => {
      if (e.pointerId !== id) return;
      id = null; side.style.transition = "";
      if (dy > 70) setSheet(false); else side.style.transform = "";
    };
    handle.addEventListener("pointerup", done);
    handle.addEventListener("pointercancel", done);
    handle.addEventListener("click", () => { if (dy <= 70) setSheet(false); });
  }

  // スキルツリー / アーティファクトを開いたらシートは閉じる
  ["treeBtn", "artBtn"].forEach(k => { const b = $(k); if (b) b.addEventListener("click", () => setSheet(false)); });

  // ブロックをタップしたとき、素材の詳細が見えるようシートも開く
  if (typeof window.openMaterial === "function"){
    const orig = window.openMaterial;
    window.openMaterial = key => { orig(key); if (isMobile()) setSheet(true); };
  }
})();

// オーバーレイが出ている間は操作系を隠す (250ms ごとに見るだけの軽い監視)
(() => {
  let was = "";
  const syncBadge = (srcId, dstId, on) => {
    const s = $(srcId), d = $(dstId);
    if (!s || !d) return;
    if (d.textContent !== s.textContent) d.textContent = s.textContent;
    d.classList.toggle("show", !!on(s));
  };
  setInterval(() => {
    // 左下メニューのバッジを、上の SKILL / ART ボタンと同期する
    syncBadge("spBadge", "mSpBadge", () => $("treeBtn").classList.contains("has-sp"));
    syncBadge("artBadge", "mArtBadge", s => s.textContent !== "" && s.textContent !== "0");
    const startUp = $("startOverlay").style.display !== "none";
    const busy = startUp || cleared || treeOpen || artOpen || sheetOpen() || $("settingsOverlay").classList.contains("open") || $("mapOverlay").classList.contains("open") || $("updateOverlay").classList.contains("open");
    const sig = busy ? "1" : "0";
    if (sig === was) return;
    was = sig;
    document.body.classList.toggle("ui-open", busy);
    if (busy && window.mobileStickReset) mobileStickReset();
  }, 250);
})();

/* =========================================================
   4. スキルツリー: 2本指ピンチで拡大縮小
   ========================================================= */
(() => {
  const view = $("treeView");
  if (!view) return;
  const pts = new Map();
  let d0 = 0;
  const pair = () => { const [a, b] = [...pts.values()]; return { d:Math.hypot(a.x-b.x, a.y-b.y), x:(a.x+b.x)/2, y:(a.y+b.y)/2 }; };
  view.addEventListener("pointerdown", e => {
    if (e.pointerType === "mouse") return;
    pts.set(e.pointerId, { x:e.clientX, y:e.clientY });
    if (pts.size === 2){ d0 = pair().d; drag = null; view.classList.remove("dragging"); }
  }, { passive:true });
  view.addEventListener("pointermove", e => {
    if (!pts.has(e.pointerId)) return;
    pts.set(e.pointerId, { x:e.clientX, y:e.clientY });
    if (pts.size !== 2) return;
    drag = null;
    const p = pair();
    if (d0 > 8 && p.d > 8){
      const r = view.getBoundingClientRect(), mx = p.x - r.left, my = p.y - r.top;
      const ns = Math.max(0.3, Math.min(1.8, tv.s * (p.d / d0)));
      tv.x = mx - (mx - tv.x) * ns / tv.s; tv.y = my - (my - tv.y) * ns / tv.s; tv.s = ns;
      applyView();
    }
    d0 = p.d;
  }, { passive:true });
  const off = e => { pts.delete(e.pointerId); if (pts.size < 2) d0 = 0; };
  view.addEventListener("pointerup", off, { passive:true });
  view.addEventListener("pointercancel", off, { passive:true });
})();

/* =========================================================
   5. 画面を消さない (放置ゲームなので) — 対応端末のみ
   ========================================================= */
(() => {
  let lock = null;
  const want = () => started && !cleared && !document.hidden;
  const ask = async () => {
    if (!("wakeLock" in navigator) || lock || !want()) return;
    try { lock = await navigator.wakeLock.request("screen"); lock.addEventListener("release", () => { lock = null; }); }
    catch(err){ lock = null; }
  };
  const btn = $("startBtn");
  if (btn) btn.addEventListener("click", () => setTimeout(ask, 120));
  document.addEventListener("visibilitychange", () => { if (document.hidden) lock = null; else ask(); });
})();

/* =========================================================
   6. PWA — Service Worker とインストール案内
   ========================================================= */
const PWA_KEY = "bs.pwa.dismissed";
const standalone = () =>
  window.matchMedia("(display-mode: standalone)").matches ||
  window.matchMedia("(display-mode: fullscreen)").matches ||
  navigator.standalone === true;

// beforeinstallprompt があるか (Chrome/Edge系 = ワンタップで入れられる。Safari には無い)
const HAS_BIP = "onbeforeinstallprompt" in window;
// iOS / iPadOS 判定。iPadOS は Mac を名乗るので、タッチの有無と「BIP が無いこと」で見分ける
const IOS = !HAS_BIP && (/iP(hone|ad|od)/.test(navigator.userAgent) ||
            (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));

const lsGet = k => { try { return localStorage.getItem(k); } catch(e){ return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch(e){} };

// --- Service Worker (オフライン起動 + インストール可能にする) ---
if ("serviceWorker" in navigator && location.protocol !== "file:"){
  // このファイルは load 後に動的に読み込まれるので、load イベントは待たずにその場で登録する
  const reg = () => navigator.serviceWorker.register("sw.js", { scope: "./" })
    .then(r => {
      // 既に動いている SW は install が走らないので、シェルが揃っているか確認させる
      navigator.serviceWorker.ready.then(x => { if (x.active) x.active.postMessage("precache"); });
      return r;
    })
    .catch(err => console.warn("SW:", err));
  if (document.readyState === "complete") reg(); else window.addEventListener("load", reg);
}

(() => {
  const sheet = $("pwaSheet");
  if (!sheet) return;
  let deferred = null;         // beforeinstallprompt を溜めておく
  let shown = false;

  const canOneTap = () => !!deferred;
  const installable = () => canOneTap() || (IOS && !standalone());

  // 設定 / スタート画面のインストール導線を出し入れする
  function syncEntryPoints(){
    const on = installable() && !standalone();
    const row = $("installRow"), sb = $("startInstallBtn");
    if (row){
      row.hidden = !on;
      const d = $("installRowDesc");
      if (d) d.textContent = IOS && !canOneTap()
        ? "共有ボタン →「ホーム画面に追加」で、全画面・オフラインで遊べます"
        : "ホーム画面に追加すると、全画面・オフラインで遊べます";
    }
    if (sb) sb.hidden = !(on && isMobile());
  }

  function open(){
    if (!installable() || standalone()) return;
    document.body.classList.toggle("pwa-ios-mode", IOS && !canOneTap());
    sheet.hidden = false;
    shown = true;
  }
  function close(remember){
    sheet.hidden = true;
    shown = false;
    if (remember) lsSet(PWA_KEY, "1");
    syncEntryPoints();
  }

  async function doInstall(){
    if (deferred){
      const d = deferred; deferred = null;
      close(true);
      d.prompt();
      try {
        const res = await d.userChoice;
        if (res && res.outcome !== "accepted") deferred = null;
      } catch(err){}
      syncEntryPoints();
    } else {
      // iOS: 自動インストールの API が無いので手順を見せる
      document.body.classList.add("pwa-ios-mode");
      sheet.hidden = false;
    }
  }

  $("pwaInstall").addEventListener("click", doInstall);
  $("pwaLater").addEventListener("click", () => close(true));
  sheet.addEventListener("click", e => { if (e.target === sheet) close(true); });
  const rowBtn = $("installRowBtn");
  if (rowBtn) rowBtn.addEventListener("click", () => { $("settingsOverlay").classList.remove("open"); doInstall(); });
  const startBtn2 = $("startInstallBtn");
  if (startBtn2) startBtn2.addEventListener("click", doInstall);

  window.addEventListener("beforeinstallprompt", e => {
    e.preventDefault();
    deferred = e;
    syncEntryPoints();
    // 案内を先に出していたら、手順の説明からワンタップのボタンに切り替える
    if (shown) document.body.classList.remove("pwa-ios-mode");
    maybeAutoShow();
  });

  window.addEventListener("appinstalled", () => {
    deferred = null;
    close(true);
    lsSet(PWA_KEY, "1");
  });

  // --- 初回だけ自動で出す ---
  let asked = false;
  function maybeAutoShow(){
    if (asked || shown || standalone()) return;
    if (!isMobile() && !COARSE) return;          // PC では自動で出さない (設定からはいつでも入れられる)
    if (lsGet(PWA_KEY)) return;                  // 一度「あとで」を押している
    if (!installable()) return;
    // 遊び始めた後に全画面の案内を被せない (スタート画面と設定に導線が残る)
    if (typeof started !== "undefined" && started) return;
    asked = true;
    setTimeout(open, 600);
  }
  // iOS は beforeinstallprompt が来ないので早めに。Chrome 系はイベントを待つ (来たらその場で出る)
  setTimeout(maybeAutoShow, IOS ? 900 : 2600);
  syncEntryPoints();
})();
