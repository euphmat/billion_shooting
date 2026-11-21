"use strict";
/* =========================================================
   game/view.js - キャンバス / カメラ / 入力 / 自動画質調整
   ========================================================= */

// ---------- canvas / camera / input ----------
const cv = $("game"), ctx = cv.getContext("2d");
const mm = $("minimap").getContext("2d");
let CW = 0, CH = 0, zoom = SW && isFinite(SW.zoom) ? Math.max(0.004, Math.min(2.5, SW.zoom)) : 0.55;
function resize(){
  const r = $("main").getBoundingClientRect(), dpr = Math.min(dprCap, window.devicePixelRatio || 1);
  CW = r.width; CH = r.height;
  cv.width = CW * dpr; cv.height = CH * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
window.addEventListener("resize", resize);
window.addEventListener("orientationchange", () => setTimeout(resize, 220));
// スマホはアドレスバーの出入りで高さが変わる。visualViewport の方が実寸に近い
if (window.visualViewport) window.visualViewport.addEventListener("resize", resize);
cv.addEventListener("wheel", e => {
  e.preventDefault();
  zoom = Math.max(0.004, Math.min(2.5, zoom * (e.deltaY < 0 ? 1.12 : 0.89)));
}, { passive:false });
let hoverInfo = null;   // カーソル下のブロック {gx, gy, name, color, cur, max} (無いときは null)。カーソル位置は game/skill-fx.js の mouseSX/mouseSY/mouseIn を共有
window.addEventListener("dragstart", e => e.preventDefault());   // 要素のゴーストドラッグを止める
window.addEventListener("keydown", e => { if (isTypingTarget(e)) return; keys[e.key.toLowerCase()] = true; if (["w","a","s","d"].includes(e.key.toLowerCase())) audio(); boostSpaceEvent(e, true); });
window.addEventListener("keyup",   e => { keys[e.key.toLowerCase()] = false; boostSpaceEvent(e, false); });
window.addEventListener("blur", () => { boostKey = false; });   // フォーカスを失ったらブーストは解除 (押しっぱなし扱いの防止)

// 画面上の座標をブロックに当てて、その素材を開く (PC はクリック / スマホは mobile.js のタップ判定から呼ぶ)
function inspectAtClient(clientX, clientY){
  if (!started) return;
  const rect = cv.getBoundingClientRect();
  const sx = (clientX - rect.left) * (CW / rect.width), sy = (clientY - rect.top) * (CH / rect.height);
  const wx = player.x + (sx - CW / 2) / zoom, wy = player.y + (sy - CH / 2) / zoom;
  const gx = Math.floor(wx / BS) + GC, gy = Math.floor(wy / BS) + GC;
  if (gx < 0 || gy < 0 || gx >= D || gy >= D) return;
  const idx = gy * D + gx;
  if (!blockExists(gx, gy) || isDestroyed(idx)) return;
  openMaterial(MATS[materialAt(gx, gy)].key);
}
let touchCanvas = false;   // true = タップ/ピンチは mobile.js が面倒を見る
cv.addEventListener("click", e => { if (!touchCanvas) inspectAtClient(e.clientX, e.clientY); });
// ズーム (mobile.js のピンチ / ± ボタンからも呼ぶ)
const applyZoom = f => { zoom = Math.max(0.004, Math.min(2.5, zoom * f)); };

// ---------- 自動画質調整 ----------
// 高解像度ディスプレイで描画が追いつかないとき (目標の 2/3 未満の fps が約3秒続いたら)、
// キャンバスの解像度を 1倍に落とす。十分軽くなったら (20秒以上 目標に近い fps) 元に戻す (戻すのは1回まで)。
// 解像度の上限は 2倍、省電力モードでは 1.5倍 (target = 目標のフレーム間隔 ms。省電力モードは 30fps)
const dprMax = () => state.powerSave ? 1.5 : 2;
let dprCap = dprMax(), frameEMA = 16.7, slowFrames = 0, fastFrames = 0, dprRestores = 0;
function trackFrameRate(ms, target){
  if (!(ms > 0) || ms > 100) return;           // 裏タブ復帰・一時停止中の間引きなどの異常値は無視
  frameEMA += (ms - frameEMA) * 0.05;
  if (dprCap > 1 && (window.devicePixelRatio || 1) > 1){
    slowFrames = frameEMA > target * 1.5 ? slowFrames + 1 : 0;
    if (slowFrames > 2000 / target){ dprCap = 1; slowFrames = fastFrames = 0; resize(); }
  } else if (dprCap === 1 && dprRestores < 1){
    fastFrames = frameEMA < target * 1.08 ? fastFrames + 1 : 0;
    if (fastFrames > 20000 / target){ dprCap = dprMax(); dprRestores++; fastFrames = slowFrames = 0; resize(); }
  }
}
// 設定の「省電力モード」を切り替えた時: 解像度の上限を合わせ直す
function applyPowerSave(){ dprCap = dprMax(); frameEMA = state.powerSave ? 1000 / 30 : 1000 / 60; slowFrames = fastFrames = dprRestores = 0; resize(); }
