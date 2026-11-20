"use strict";
/* =========================================================
   ui/worldmap.js - ワールドマップ / ファストトラベル
   ========================================================= */

// ---------- ワールドマップ / ファストトラベル ----------
// 右下ミニマップのクリックで開く。訪問済みダンジョン (visitedBodies) をクリックすると、
// その天体の中で掘り開けたセル (ライブブロックなし) へ瞬間移動する
let mapOpen = false;
let bigMapMarks = [];
const bigMapCv = $("bigMap"), bigMapCtx = bigMapCv.getContext("2d");
const BM_SIZE = 760;
function openMap(){ mapOpen = true; $("mapOverlay").classList.add("open"); refreshMapAll(); }
function closeMap(){ mapOpen = false; mapSelected = -1; hideMapPop(); refreshMapGoBar(); $("mapOverlay").classList.remove("open"); }

// ---------- ファストトラベル拡張: ホーム/リターン・検索/効果フィルタ・リスト表示・情報ポップ ----------
// UI 状態はセーブしない (マップを開いている間だけのもの)。mapReturnPos だけは移動のたびに更新される
let mapQuery = "", mapFxFilter = null, mapView = "map", mapSort = "dist", mapSelected = -1;
let mapReturnPos = null;   // 直前のプレイヤー位置 {x, y} (ワールド座標)。リターンで現在地と入れ替わる
const MAP_FX_CATS = [
  { key: "dmg",  label: "与ダメ↑",   test: fx => !!fx && fx.dmg > 1 },
  { key: "coin", label: "コイン↑",   test: fx => !!fx && fx.coin > 1 },
  { key: "xp",   label: "経験値↑",   test: fx => !!fx && fx.xp > 1 },
  { key: "drop", label: "ドロップ↑", test: fx => !!fx && fx.drop > 1 },
  { key: "crit", label: "会心",       test: fx => !!fx && (fx.crit || 0) > 0 },
  { key: "proc", label: "状態付与",   test: fx => !!fx && !!fx.proc },
  { key: "gold", label: "金塊",       test: fx => !!fx && (fx.gold || 0) > 0 },
  { key: "safe", label: "安全",       test: fx => !!fx && fx.hurt < 1 },
];
function mapFxCat(key){ return MAP_FX_CATS.find(c => c.key === key) || null; }
function mapFiltering(){ return !!(mapQuery || mapFxFilter); }
function mapMatch(si){
  const S = SATS[si];
  if (mapFxFilter){ const c = mapFxCat(mapFxFilter); if (c && !c.test(S.fx)) return false; }
  if (mapQuery && !S.name.includes(mapQuery) && !(S.fx && S.fx.name.includes(mapQuery))) return false;
  return true;
}
function mapMatchCount(){ let n = 0; for (let si = 0; si < SATS.length; si++) if (mapMatch(si)) n++; return n; }
function chestsLeftFor(si){   // その天体の未開封の宝箱数 (全天体に3つずつ)
  if (chestsInit){ let n = 0; for (const ch of chests) if (ch.si === si && !openedChests.has(chestKey(si, ch.ci))) n++; return n; }
  let opened = 0; for (const k of openedChests) if (k.startsWith(si + "-")) opened++;
  return Math.max(0, 3 - opened);
}
function bodyDist(si){ const S = SATS[si]; return Math.hypot(S.cx - w2g(player.x), S.cy - w2g(player.y)); }
function fmtDist(d){ return "約" + Math.round(d).toLocaleString("ja-JP") + "ブロック"; }
function recordReturnPos(){ mapReturnPos = { x: player.x, y: player.y }; }
function travelHome(){   // メイン惑星の出現地点 (リスポーン地点) へ。常時使用可
  recordReturnPos();
  ftSilent = true;
  player.x = (R + 4) * BS; player.y = 0; player.vx = 0; player.vy = 0;
  closeMap();
  toast("ホーム (メイン惑星) へ戻った");
  return true;
}
function travelReturn(){   // 移動直前の位置へ。現在地と入れ替わるので、もう一度押すと行き先に戻れる
  if (!mapReturnPos) return false;
  const back = mapReturnPos;
  mapReturnPos = { x: player.x, y: player.y };
  ftSilent = true;
  player.x = back.x; player.y = back.y; player.vx = 0; player.vy = 0;
  closeMap();
  toast("さっきの場所へ戻った");
  return true;
}
function refreshMapBar(){
  const rb = $("mapReturn"); if (rb) rb.disabled = !mapReturnPos;
  const mc = $("mapMatchCount"); if (mc) mc.textContent = mapFiltering() ? `該当 ${mapMatchCount()} 件` : "";
  const vm = $("mapViewMapBtn"), vl = $("mapViewListBtn");
  if (vm) vm.classList.toggle("on", mapView === "map");
  if (vl) vl.classList.toggle("on", mapView === "list");
  const so = $("mapSort"); if (so) so.value = mapSort;
}
function renderMapChips(){
  const box = $("mapFxChips"); if (!box) return;
  let html = `<button class="fchip ${!mapFxFilter ? "on" : ""}" data-fx="">すべて <b>${SATS.length}</b></button>`;
  for (const c of MAP_FX_CATS){
    let n = 0; for (let si = 0; si < SATS.length; si++) if (c.test(SATS[si].fx)) n++;
    html += `<button class="fchip ${mapFxFilter === c.key ? "on" : ""}" data-fx="${c.key}">${c.label} <b>${n}</b></button>`;
  }
  box.innerHTML = html;
}
function mapListRows(){   // リスト表示のデータ (表示は未訪問を伏せるが、数値自体は実データ)
  const cur = bodyAt(w2g(player.x), w2g(player.y));
  const rows = SATS.map((S, si) => ({
    si, name: S.name, fx: S.fx, sig: S.sig,
    visited: state.visitedBodies.includes(si),
    chests: chestsLeftFor(si), dist: bodyDist(si),
    cur: cur === si + 1, match: mapMatch(si),
  }));
  rows.sort((a, b) => mapSort === "name" ? a.name.localeCompare(b.name, "ja") : a.dist - b.dist);
  return rows;
}
function renderMapList(){
  const box = $("mapList"); if (!box) return;
  box.innerHTML = mapListRows().map(r => `
    <div class="map-row ${r.visited ? "" : "unvisited"} ${r.cur ? "current" : ""} ${r.match ? "" : "dim"} ${mapSelected === r.si ? "selected" : ""}" data-si="${r.si}">
      <span class="map-dot" style="background:${r.visited ? MAT[r.sig].color : "#3a3f47"}"></span>
      <span class="map-row-main">
        <span class="map-row-name">${r.name}${r.cur ? `<em class="map-cur">現在地</em>` : ""}</span>
        <span class="map-row-sub">${r.fx ? r.fx.name : "効果なし"} ・ 看板素材 ${MAT[r.sig].name}</span>
      </span>
      <span class="map-row-side">
        <span>宝箱 残り ${r.visited ? r.chests : "?"}</span>
        <span class="map-row-dist">${r.visited ? fmtDist(r.dist) : "未訪問"}</span>
      </span>
    </div>`).join("");
}
function refreshMapView(){ refreshMapBar(); if (mapView === "list") renderMapList(); else drawBigMap(); }
function refreshMapAll(){ renderMapChips(); refreshMapView(); refreshMapGoBar(); }
function setMapView(v){
  mapView = v;
  $("mapOverlay").classList.toggle("listview", v === "list");
  hideMapPop();
  refreshMapView();
}
function mapPopHTML(si){
  const S = SATS[si], visited = state.visitedBodies.includes(si);
  return `<div class="mp-name"><span class="map-dot" style="background:${visited ? MAT[S.sig].color : "#3a3f47"}"></span>${S.name}${visited ? "" : "<em>未訪問</em>"}</div>`
    + `<div>看板素材: ${MAT[S.sig].name}</div>`
    + (S.fx ? `<div>効果: <b>${S.fx.name}</b></div><div class="mp-desc">${S.fx.desc}</div>` : "")
    + `<div>宝箱: ${visited ? `残り ${chestsLeftFor(si)} / 3` : "?"} ・ 距離: ${visited ? fmtDist(bodyDist(si)) : "?"}</div>`
    + (visited ? "" : `<div class="mp-desc">実際に訪れるとファストトラベルが解放される</div>`);
}
function showMapPopAt(si, mx, my){   // mx, my はキャンバス座標 (0..BM_SIZE)
  const pop = $("mapPop"); if (!pop) return;
  pop.innerHTML = mapPopHTML(si);
  const ov = $("mapOverlay").getBoundingClientRect(), cr = bigMapCv.getBoundingClientRect();
  let x = cr.left - ov.left + (mx / BM_SIZE) * cr.width + 16;
  let y = cr.top - ov.top + (my / BM_SIZE) * cr.height - 12;
  x = Math.max(6, Math.min(x, Math.max(6, ov.width - 244)));
  y = Math.max(6, Math.min(y, Math.max(6, ov.height - 150)));
  pop.style.left = x + "px"; pop.style.top = y + "px";
  pop.classList.add("open");
}
function hideMapPop(){ const pop = $("mapPop"); if (pop) pop.classList.remove("open"); }
function selectMapBody(si){
  mapSelected = si;
  if (mapView === "map") drawBigMap(); else renderMapList();
  refreshMapGoBar();
}
function refreshMapGoBar(){   // モバイル用: 選択中の天体と「ここへ移動」ボタン (誤タップ移動防止)
  const bar = $("mapGoBar"); if (!bar) return;
  const on = TOUCH_UI && mapSelected >= 0;
  bar.classList.toggle("open", !!on);
  if (on){
    const visited = state.visitedBodies.includes(mapSelected);
    $("mapGoName").textContent = SATS[mapSelected].name + (visited ? "" : " (未訪問)");
    const btn = $("mapGoBtn");
    btn.disabled = !visited;
    btn.textContent = visited ? "ここへ移動" : "未訪問";
  }
}
// 拡大マップのラベル重なり解消: 既に置いたラベルと重なる場合は下へ14pxずつずらす (最大4段・56px)。
// ずらすのは描画位置だけで、クリック判定 (bigMapMarks) は変わらない。重なりがなければ dy=0 で従来通り。
function mapLabelShift(box, placed){
  let dy = 0;
  while (dy < 56){
    const y0 = box.y0 + dy, y1 = box.y1 + dy;
    if (!placed.some(p => box.x0 < p.x1 && p.x0 < box.x1 && y0 < p.y1 && p.y0 < y1)) break;
    dy += 14;
  }
  placed.push({ x0: box.x0, x1: box.x1, y0: box.y0 + dy, y1: box.y1 + dy });
  return dy;
}
function drawBigMap(){
  const g = bigMapCtx, scale = BM_SIZE / D, px = gx => gx * scale;
  g.fillStyle = "#04060a"; g.fillRect(0, 0, BM_SIZE, BM_SIZE);
  // メイン惑星の輪郭
  g.beginPath(); g.arc(px(GC), px(GC), R * scale, 0, 7);
  g.fillStyle = "#0a1524"; g.fill();
  g.strokeStyle = "rgba(125,184,255,.5)"; g.lineWidth = 1.2; g.stroke();
  const cur = bodyAt(w2g(player.x), w2g(player.y));
  const filtering = mapFiltering();
  bigMapMarks = [];
  SATS.forEach((S, si) => {
    const visited = state.visitedBodies.includes(si), col = MAT[S.sig].color;
    const matched = mapMatch(si);
    const cx = px(S.cx), cy = px(S.cy);
    g.globalAlpha = filtering && !matched ? 0.2 : 1;   // 絞り込み中: 非該当は淡く (消さない)
    if (S.rect){   // 矩形ダンジョン
      const x0 = px(S.x0), y0 = px(S.y0), w = Math.max(3, (S.x1 - S.x0) * scale), h = Math.max(3, (S.y1 - S.y0) * scale);
      g.fillStyle = visited ? col : "#2b2e35"; g.fillRect(x0, y0, w, h);
      g.strokeStyle = visited ? "rgba(255,255,255,.85)" : "#5b5f68"; g.lineWidth = 1; g.strokeRect(x0, y0, w, h);
      if (cur === si + 1){ g.strokeStyle = "#ffb340"; g.lineWidth = 1.6; g.strokeRect(x0 - 2.5, y0 - 2.5, w + 5, h + 5); }
      if (filtering && matched){ g.strokeStyle = "#ffd60a"; g.lineWidth = 1.8; g.strokeRect(x0 - 4.5, y0 - 4.5, w + 9, h + 9); }
      bigMapMarks.push({ si, x0: x0 - 5, y0: y0 - 5, x1: x0 + w + 5, y1: y0 + h + 5, lx: cx, ly: y0 });
    } else {       // 円形天体 (衛星・小惑星)
      const r = Math.max(2.5, S.r * scale);
      g.beginPath(); g.arc(cx, cy, r, 0, 7);
      g.fillStyle = visited ? col : "#2b2e35"; g.fill();
      g.strokeStyle = visited ? "rgba(255,255,255,.85)" : "#5b5f68"; g.lineWidth = 1; g.stroke();
      if (cur === si + 1){ g.beginPath(); g.arc(cx, cy, r + 2.5, 0, 7); g.strokeStyle = "#ffb340"; g.lineWidth = 1.6; g.stroke(); }
      if (filtering && matched){ g.beginPath(); g.arc(cx, cy, r + 4.5, 0, 7); g.strokeStyle = "#ffd60a"; g.lineWidth = 1.8; g.stroke(); }
      bigMapMarks.push({ si, cx, cy, hr: Math.max(11, r), lx: cx, ly: cy - r });
    }
    g.globalAlpha = 1;
  });
  // ラベルは訪問済みのみ (名前 + 効果名)。未訪問はグレーのマーカーだけ。絞り込み中は非該当のラベルを省く
  g.textAlign = "center";
  const placedLabels = [];
  for (const m of bigMapMarks){
    if (!state.visitedBodies.includes(m.si)) continue;
    if (filtering && !mapMatch(m.si)) continue;
    const S = SATS[m.si];
    g.font = "bold 11px sans-serif";
    const tw = g.measureText(S.name).width + 8;
    let fw = 0;
    if (S.fx){
      g.font = "9px sans-serif";
      fw = g.measureText(S.fx.name).width + 8;
    }
    const hw = Math.max(tw, fw) / 2;
    const ly = m.ly + mapLabelShift({ x0: m.lx - hw, x1: m.lx + hw, y0: m.ly - 15, y1: m.ly + (S.fx ? 10 : -2) }, placedLabels);
    g.font = "bold 11px sans-serif";
    g.fillStyle = "rgba(0,0,0,.68)"; g.fillRect(m.lx - tw / 2, ly - 15, tw, 13);
    g.fillStyle = "#fff"; g.fillText(S.name, m.lx, ly - 4);
    if (S.fx){
      g.font = "9px sans-serif";
      g.fillStyle = "rgba(0,0,0,.55)"; g.fillRect(m.lx - fw / 2, ly - 1, fw, 11);
      g.fillStyle = "#ffd9a0"; g.fillText(S.fx.name, m.lx, ly + 8);
    }
  }
  // 選択中マーカーのリング (モバイルのタップ選択 / デスクトップの未訪問クリック)
  if (mapSelected >= 0){
    const m = bigMapMarks.find(mk => mk.si === mapSelected);
    if (m){
      g.strokeStyle = "#57e39a"; g.lineWidth = 2.2;
      if (m.hr !== undefined){ g.beginPath(); g.arc(m.cx, m.cy, m.hr + 3, 0, 7); g.stroke(); }
      else g.strokeRect(m.x0 - 2, m.y0 - 2, (m.x1 - m.x0) + 4, (m.y1 - m.y0) + 4);
    }
  }
  // 自機マーカー
  const pxx = px(player.x / BS + GC), pyy = px(player.y / BS + GC);
  g.beginPath(); g.arc(pxx, pyy, 4, 0, 7); g.fillStyle = "#fff"; g.fill();
  g.beginPath(); g.arc(pxx, pyy, 7.5, 0, 7); g.strokeStyle = "#ffb340"; g.lineWidth = 1.6; g.stroke();
  const mc = $("mapCount"); if (mc) mc.textContent = `訪問済み ${state.visitedBodies.length} / ${SATS.length}`;
}
// 着地点探し: 中心から渦巻き状 (チェビシェフ距離のリング順) に、ライブブロックのないセルを探す。
// 天体内部では blockExists が常に真なので「ライブブロックなし」= 破壊済みセル
function findLandingCell(S){
  const inBody = (gx, gy) => S.rect ? (gx >= S.x0 && gx <= S.x1 && gy >= S.y0 && gy <= S.y1)
                                    : (gx - S.cx) * (gx - S.cx) + (gy - S.cy) * (gy - S.cy) <= S.r2;
  const free = (gx, gy) => isDestroyed(gy * D + gx) && liveAt(gx, gy) < 0;
  const maxR = S.rect ? Math.max(S.hw, S.hh) : S.r;
  const scan = stepFor => {
    for (let r = 0; r <= maxR; r++){
      if (r === 0){ if (inBody(S.cx, S.cy) && free(S.cx, S.cy)) return { gx: S.cx, gy: S.cy }; continue; }
      const st = stepFor(r);
      for (let dx = -r; dx <= r; dx += st) for (const dy of [-r, r]){ const gx = S.cx + dx, gy = S.cy + dy; if (inBody(gx, gy) && free(gx, gy)) return { gx, gy }; }
      for (let dy = -r + st; dy <= r - 1; dy += st) for (const dx of [-r, r]){ const gx = S.cx + dx, gy = S.cy + dy; if (inBody(gx, gy) && free(gx, gy)) return { gx, gy }; }
    }
    return null;
  };
  return scan(r => (r < 40 ? 1 : r < 90 ? 2 : 3)) || scan(() => 1);   // 粗い走査で見つからなければ全セル走査
}
function fastTravelTo(si){
  const S = SATS[si]; if (!S) return false;
  const cell = findLandingCell(S);
  if (!cell){ toast("着地できる場所が見つからなかった"); return false; }
  recordReturnPos();   // 「さっきの場所に戻る」用に移動直前の位置を記録
  ftSilent = true;   // 直後のフレームでバナー側トーストと重ねない
  player.x = g2w(cell.gx); player.y = g2w(cell.gy);
  player.vx = 0; player.vy = 0;
  closeMap();
  toast(`「${S.name}」へファストトラベル！`);
  return true;
}
$("minimap").addEventListener("click", () => openMap());
// マップ上のヒット判定 (モバイルはタップターゲットを広げる)
function mapEventPos(e){
  const rect = bigMapCv.getBoundingClientRect();
  return { x: (e.clientX - rect.left) * (BM_SIZE / rect.width), y: (e.clientY - rect.top) * (BM_SIZE / rect.height) };
}
function mapHitAt(x, y){
  const pad = TOUCH_UI ? 10 : 4;
  for (let i = bigMapMarks.length - 1; i >= 0; i--){
    const m = bigMapMarks[i];
    if (m.hr !== undefined){ const hr = m.hr + pad; if ((x - m.cx) * (x - m.cx) + (y - m.cy) * (y - m.cy) <= hr * hr) return m; }
    else if (x >= m.x0 - pad && x <= m.x1 + pad && y >= m.y0 - pad && y <= m.y1 + pad) return m;
  }
  return null;
}
bigMapCv.addEventListener("click", e => {
  const p = mapEventPos(e), m = mapHitAt(p.x, p.y);
  if (TOUCH_UI){   // モバイル: タップでは移動せず、選択 + 情報ポップ + 下部の確定ボタンで移動する (誤タップ防止)
    if (m){ selectMapBody(m.si); showMapPopAt(m.si, p.x, p.y); }
    else { selectMapBody(-1); hideMapPop(); }
    return;
  }
  if (!m){ selectMapBody(-1); hideMapPop(); return; }
  if (state.visitedBodies.includes(m.si)) fastTravelTo(m.si);   // デスクトップ: 訪問済みはクリック即移動 (従来通り)
  else { selectMapBody(m.si); showMapPopAt(m.si, p.x, p.y); }    // 未訪問は情報ポップ (移動はできない)
});
bigMapCv.addEventListener("mousemove", e => {
  if (TOUCH_UI || mapView !== "map") return;
  const p = mapEventPos(e), m = mapHitAt(p.x, p.y);
  if (m) showMapPopAt(m.si, p.x, p.y); else hideMapPop();
});
bigMapCv.addEventListener("mouseleave", () => { if (!TOUCH_UI) hideMapPop(); });
$("mapClose").addEventListener("click", closeMap);
$("mapOverlay").addEventListener("click", e => { if (e.target === $("mapOverlay") || e.target === $("mapWrap")) closeMap(); });
window.addEventListener("keydown", e => { if (e.key === "Escape" && mapOpen) closeMap(); });
// マップツールバーの配線
$("mapHome").addEventListener("click", () => travelHome());
$("mapReturn").addEventListener("click", () => travelReturn());
$("mapSearch").addEventListener("input", e => { mapQuery = e.target.value.trim(); refreshMapView(); });
$("mapFxChips").addEventListener("click", e => {
  const b = e.target.closest ? e.target.closest(".fchip") : null;
  if (!b) return;
  const k = b.dataset.fx || null;
  mapFxFilter = (mapFxFilter === k) ? null : k;
  renderMapChips(); refreshMapView();
});
$("mapViewMapBtn").addEventListener("click", () => setMapView("map"));
$("mapViewListBtn").addEventListener("click", () => setMapView("list"));
$("mapSort").addEventListener("change", e => { mapSort = e.target.value; if (mapView === "list") renderMapList(); });
$("mapList").addEventListener("click", e => {
  const row = e.target.closest ? e.target.closest(".map-row") : null;
  if (!row) return;
  const si = Number(row.dataset.si);
  if (state.visitedBodies.includes(si)) fastTravelTo(si);
  else toast("まだ行ったことのないダンジョンだ");
});
$("mapGoBtn").addEventListener("click", () => { if (mapSelected >= 0 && state.visitedBodies.includes(mapSelected)) fastTravelTo(mapSelected); });
$("mapGoClose").addEventListener("click", () => { selectMapBody(-1); hideMapPop(); });
// M キーでマップ開閉 (T=ツリー等と衝突しない。検索欄にフォーカスがある時は文字入力を優先)
window.addEventListener("keydown", e => {
  if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
  const tag = e.target && e.target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
  if (e.code !== "KeyM") return;
  if (mapOpen) closeMap();
  else if (started && !treeOpen && !artOpen && !updOpen && !botEqOpen) openMap();
});
