"use strict";
/* =========================================================
   ui/minimap.js - ミニマップ (レーダー式)
   ========================================================= */

// ミニマップ (レーダー式): 自機を中心に、メインビューのズームに同期して
// 表示範囲が変わる。地形はオフスクリーンにキャッシュし (blockLayer と同じ方式)、
// 毎フレームは 天体の輪と名前・ビューポート枠・モンスター・宝箱・自機 を重ねる。
const MM_SIZE = 150, MM_FACTOR = 3;   // ミニマップはメインビューの約3倍の範囲を表示
const mmLayer = { cv: document.createElement("canvas"), ctx: null, img: null, cx0: 0, cy0: 0, cols: 0, rows: 0, step: 0, t: -1e9 };
mmLayer.ctx = mmLayer.cv.getContext("2d");
function mmScale(){ return (CW / zoom) * MM_FACTOR / MM_SIZE; }   // ワールド単位 / mmピクセル
// ミニマップのサンプリング step は2の累乗に丸める (ズームで連続変化させない)
function mmStepFor(scale){
  const raw = Math.max(1, 2.4 * scale / BS);
  return Math.max(1, Math.min(96, Math.pow(2, Math.round(Math.log2(raw)))));
}
function rebuildMmLayer(now){
  const L = mmLayer, scale = mmScale();
  const step = mmStepFor(scale);
  const cellWorld = step * BS, cols = Math.ceil(MM_SIZE * scale / cellWorld) + 10, rows = cols;
  const pcx = Math.floor((player.x / BS + GC) / step), pcy = Math.floor((player.y / BS + GC) / step);
  L.step = step; L.cols = cols; L.rows = rows;
  L.cx0 = pcx - (cols >> 1); L.cy0 = pcy - (rows >> 1); L.t = now;
  if (L.cv.width !== cols){ L.cv.width = cols; L.cv.height = rows; }
  const img = L.ctx.createImageData(cols, rows), d = img.data;
  for (let j = 0; j < rows; j++){
    const gy = (L.cy0 + j) * step;
    for (let i = 0; i < cols; i++){
      const gx = (L.cx0 + i) * step, o = (j * cols + i) * 4;
      if (!blockExists(gx, gy) || isDestroyed(gy * D + gx)) continue;   // 宇宙・破壊済み = 透明 (黒地)
      const c = earthColor(gx, gy, true);                               // 本体と同じ色 (LOD)
      d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2]; d[o + 3] = 255;
    }
  }
  L.ctx.putImageData(img, 0, 0);
  L.img = L.cv;
}
function drawMinimap(now){
  const scale = mmScale(), C = MM_SIZE / 2;
  const L = mmLayer;
  const pcx = Math.floor((player.x / BS + GC) / Math.max(1, L.step)), pcy = Math.floor((player.y / BS + GC) / Math.max(1, L.step));
  const stepNow = mmStepFor(scale);
  if (!L.img || (L.step !== stepNow && now - L.t > 140) ||
      pcx < L.cx0 + L.cols * 0.3 || pcx > L.cx0 + L.cols * 0.7 || pcy < L.cy0 + L.rows * 0.3 || pcy > L.cy0 + L.rows * 0.7 ||
      (now - L.t > 900 && (dirtyBlocks.length || dirtyOverflow))) rebuildMmLayer(now);
  mm.clearRect(0, 0, MM_SIZE, MM_SIZE);
  mm.fillStyle = "#000"; mm.fillRect(0, 0, MM_SIZE, MM_SIZE);
  const toX = wx => C + (wx - player.x) / scale, toY = wy => C + (wy - player.y) / scale;
  if (L.img){
    const cellWorld = L.step * BS;
    mm.imageSmoothingEnabled = false;
    mm.drawImage(L.img, toX((L.cx0 * L.step - GC) * BS), toY((L.cy0 * L.step - GC) * BS), L.cols * cellWorld / scale, L.rows * cellWorld / scale);
  }
  // 本星の輪郭
  const mRad = R * BS / scale;
  if (mRad < 4000){ mm.strokeStyle = "rgba(125,184,255,.45)"; mm.lineWidth = 1; mm.beginPath(); mm.arc(toX(0), toY(0), mRad, 0, 7); mm.stroke(); }
  // 衛星・小惑星: 範囲内は輪+名前、範囲外は縁に方向ドット
  mm.textAlign = "center";
  for (const S of SATS){
    const sx = toX((S.cx - GC) * BS), sy = toY((S.cy - GC) * BS), sr = Math.max(1.5, S.r * BS / scale), col = MAT[S.sig].color;
    if (S.rect){   // 惑星内部ダンジョン: 矩形の輪郭 + 名前
      const hw2 = S.hw * BS / scale, hh2 = S.hh * BS / scale;
      if (sx > -hw2 - 26 && sx < MM_SIZE + hw2 + 26 && sy > -hh2 - 26 && sy < MM_SIZE + hh2 + 26){
        mm.strokeStyle = col; mm.lineWidth = 1.2; mm.strokeRect(sx - hw2, sy - hh2, hw2 * 2, hh2 * 2);
        if (hw2 >= 13){ mm.font = "bold 9px sans-serif"; mm.fillStyle = "rgba(0,0,0,.65)"; const tw = mm.measureText(S.name).width + 6; mm.fillRect(sx - tw / 2, sy - hh2 - 15, tw, 11); mm.fillStyle = "#fff"; mm.fillText(S.name, sx, sy - hh2 - 6);
          if (S.fx){ mm.font = "7.5px sans-serif"; const fw = mm.measureText(S.fx.name).width + 6; mm.fillStyle = "rgba(0,0,0,.55)"; mm.fillRect(sx - fw / 2, sy - hh2 - 3, fw, 9); mm.fillStyle = "#ffd9a0"; mm.fillText(S.fx.name, sx, sy - hh2 + 4); } }
      } else {
        const dx = sx - C, dy = sy - C, len = Math.hypot(dx, dy) || 1, mx = C - 7;
        mm.fillStyle = col; mm.beginPath(); mm.arc(C + dx / len * mx, C + dy / len * mx, 3, 0, 7); mm.fill();
        mm.strokeStyle = "rgba(255,255,255,.75)"; mm.lineWidth = 1; mm.stroke();
      }
      continue;
    }
    if (sx > -sr - 26 && sx < MM_SIZE + sr + 26 && sy > -sr - 26 && sy < MM_SIZE + sr + 26){
      mm.strokeStyle = col; mm.lineWidth = 1.2;
      mm.beginPath(); mm.arc(sx, sy, sr, 0, 7); mm.stroke();
      if (sr >= 13){ mm.font = "bold 9px sans-serif"; mm.fillStyle = "rgba(0,0,0,.65)"; const tw = mm.measureText(S.name).width + 6; mm.fillRect(sx - tw / 2, sy - sr - 15, tw, 11); mm.fillStyle = "#fff"; mm.fillText(S.name, sx, sy - sr - 6);
        if (S.fx){ mm.font = "7.5px sans-serif"; const fw = mm.measureText(S.fx.name).width + 6; mm.fillStyle = "rgba(0,0,0,.55)"; mm.fillRect(sx - fw / 2, sy - sr - 3, fw, 9); mm.fillStyle = "#ffd9a0"; mm.fillText(S.fx.name, sx, sy - sr + 4); } }
    } else {
      const dx = sx - C, dy = sy - C, len = Math.hypot(dx, dy) || 1, mx = C - 7;
      mm.fillStyle = col; mm.beginPath(); mm.arc(C + dx / len * mx, C + dy / len * mx, 3, 0, 7); mm.fill();
      mm.strokeStyle = "rgba(255,255,255,.75)"; mm.lineWidth = 1; mm.stroke();
    }
  }
  // 宝箱ドット (探知機のアーティファクト所持時)
  if (artSpecial("chestSense")) for (const ch of chests){
    if (openedChests.has(chestKey(ch.si, ch.ci))) continue;
    const bx = toX(ch.x), by = toY(ch.y);
    if (bx >= -4 && bx <= MM_SIZE + 4 && by >= -4 && by <= MM_SIZE + 4){ mm.fillStyle = "#ffd24d"; mm.fillRect(bx - 2, by - 2, 4, 4); }
    else { const dx = bx - C, dy = by - C, len = Math.hypot(dx, dy) || 1, mx = C - 7; mm.fillStyle = "#ffd24d"; mm.fillRect(C + dx / len * mx - 2, C + dy / len * mx - 2, 4, 4); }
  }
  // モンスター: 赤ドット
  mm.fillStyle = "#ff5252";
  for (const m of mobs){
    const mx2 = toX(m.x), my2 = toY(m.y);
    if (mx2 >= 0 && mx2 <= MM_SIZE && my2 >= 0 && my2 <= MM_SIZE) mm.fillRect(mx2 - 1.5, my2 - 1.5, 3, 3);
  }
  machineMinimap(mm, toX, toY, MM_SIZE);   // 機兵系統: 自律機兵の位置
  // メインビューの表示範囲 (ビューポート枠)
  const vw = (CW / zoom) / scale, vh = (CH / zoom) / scale;
  mm.strokeStyle = "rgba(255,255,255,.85)"; mm.lineWidth = 1;
  mm.strokeRect(C - vw / 2, C - vh / 2, vw, vh);
  // 自機: 進行方向の三角 + 白芯 (中心固定)
  mm.save(); mm.translate(C, C); mm.rotate(player.angle + Math.PI / 2);
  mm.fillStyle = "#fff"; mm.beginPath(); mm.moveTo(0, -6); mm.lineTo(4.5, 5); mm.lineTo(-4.5, 5); mm.closePath(); mm.fill();
  mm.restore();
  mm.fillStyle = "#000"; mm.fillRect(C - 1.5, C - 1.5, 3, 3);
  // 開き方の案内 (ミニマップがワールドマップの入口だと気づけるように)
  mm.font = "9px sans-serif"; mm.textAlign = "left";
  const hint = TOUCH_UI ? "タップで全体マップ" : "クリック / M で全体マップ";
  const hw = mm.measureText(hint).width + 8;
  mm.fillStyle = "rgba(0,0,0,.7)"; mm.fillRect(2, MM_SIZE - 15, hw, 13);
  mm.fillStyle = "rgba(255,255,255,.8)"; mm.fillText(hint, 6, MM_SIZE - 5);
}
