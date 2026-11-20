"use strict";
/* =========================================================
   render/blocks.js - ブロックの描画 (オフスクリーンキャッシュ + レア・状態の重ね描き)
   ========================================================= */

// ---------- ブロックの描画キャッシュ ----------
// 画面内のブロックを「1セル = 1ピクセル」の小さな画像に描いておき、拡大して1回で貼る。
// - ブロックの数だけ fillStyle (色文字列の解析) と fillRect を呼ばない
// - 画像は画面より少し広く作り、カメラが端を越えたときだけ作り直す
// - 壊れた/削れたブロック (dirtyBlocks) は、そのピクセルだけ描き直す
// - 遠景 (1セル = step x step ブロック) は、描き直しを 0.12秒に1回まで間引く
// レアブロック・黄金・被弾の白フラッシュは、数が少ないので毎フレーム上から重ねて描く
const LAYER_MARGIN = 12;
const blockLayer = { cv: document.createElement("canvas"), ctx: null, img: null, step: 0, cx0: 0, cy0: 0, cols: 0, rows: 0,
  t: 0, rare: [], bx0: 1e9, by0: 1e9, bx1: -1, by1: -1 };
blockLayer.ctx = blockLayer.cv.getContext("2d");
// セル (cx,cy) の代表ブロック: step 1 ならそのブロック。LOD なら範囲内で最初に見つかった生存ブロック
function layerCellIdx(cx, cy, step){
  if (step === 1){
    if (cx < 0 || cy < 0 || cx >= D || cy >= D || !blockExists(cx, cy)) return -1;
    const i = cy * D + cx;
    return isDestroyed(i) ? -1 : i;
  }
  const xa = cx * step, ya = cy * step, L = blockLayer;
  for (let gy = Math.max(0, ya), ye = Math.min(D - 1, ya + step - 1); gy <= ye; gy++){
    // この行にブロックがある横幅 (天体ごとの区間)。宇宙の部分は調べない。
    // 再構築時は行ごとに1回だけ計算してキャッシュ (L.spans) し、全セルで使い回す
    let ivs;
    if (L.spans && gy >= L.spanY0 && gy < L.spanY0 + L.spans.length){
      ivs = L.spans[gy - L.spanY0];
      if (!ivs) continue;
    } else ivs = rowIntervals(gy);
    for (let k = 0; k < ivs.length; k++){
      const lo = ivs[k][0], hi = ivs[k][1];
      if (hi < xa || lo > xa + step - 1) continue;
      for (let gx = Math.max(xa, lo), xe = Math.min(xa + step - 1, hi); gx <= xe; gx++){
        const i = gy * D + gx;
        if (blockExists(gx, gy) && !isDestroyed(i)) return i;
      }
    }
  }
  return -1;
}
// セル1つ分のピクセルを書く。collect = レアブロックの一覧に登録する (作り直しのときだけ)
function paintLayerCell(cx, cy, collect){
  const L = blockLayer, lx = cx - L.cx0, ly = cy - L.cy0;
  if (lx < 0 || ly < 0 || lx >= L.cols || ly >= L.rows) return;
  const d = L.img.data, o = (ly * L.cols + lx) * 4, idx = layerCellIdx(cx, cy, L.step);
  if (idx < 0) d[o + 3] = 0;
  else {
    const rx = idx % D, ry = (idx / D) | 0, c = earthColor(rx, ry, L.step === 1);
    let cr = c[0], cg = c[1], cb = c[2];
    if (L.step === 1 && collect){
      const kind = blockKind(rx, ry);
      if (kind) L.rare.push(idx);
    }
    const hp = damagedMap.get(idx);
    const sh = hp === undefined ? 1 : 0.45 + 0.55 * hp / blockMaxHP(rx, ry);   // ダメージで暗くなる
    d[o] = cr * sh; d[o + 1] = cg * sh; d[o + 2] = cb * sh; d[o + 3] = 255;
  }
  if (lx < L.bx0) L.bx0 = lx; if (lx > L.bx1) L.bx1 = lx;
  if (ly < L.by0) L.by0 = ly; if (ly > L.by1) L.by1 = ly;
}
// ブロック行 gy にブロックがある横幅を、天体ごとの区間リストで返す (左→右の順)
function rowIntervals(gy){
  const ivs = [];
  const dy = gy - GC;
  if (dy * dy <= R2){ const s = Math.floor(Math.sqrt(R2 - dy * dy)); ivs.push([GC - s, GC + s]); }
  for (const S of SATS){ if (S.rect) continue; const sy = gy - S.cy; if (sy * sy <= S.r2){ const s = Math.floor(Math.sqrt(S.r2 - sy * sy)); ivs.push([S.cx - s, S.cx + s]); } }
  if (ivs.length > 1) ivs.sort((a, b) => a[0] - b[0]);
  return ivs;
}
// 再構築範囲の行について rowIntervals を先に計算しておく (セルごとの再計算を避ける)
function buildRowSpans(y0, y1){
  const spans = new Array(Math.max(0, y1 - y0 + 1));
  for (let gy = y0; gy <= y1; gy++){ const ivs = rowIntervals(gy); spans[gy - y0] = ivs.length ? ivs : null; }
  return spans;
}
function rebuildBlockLayer(now, step, cxa, cya, cxb, cyb){
  const L = blockLayer, M = LAYER_MARGIN;
  const cols = cxb - cxa + 1 + 2 * M, rows = cyb - cya + 1 + 2 * M;
  if (cols !== L.cols || rows !== L.rows || !L.img){
    L.cols = cols; L.rows = rows; L.cv.width = cols; L.cv.height = rows;
    L.img = L.ctx.createImageData(cols, rows);
  }
  L.step = step; L.cx0 = cxa - M; L.cy0 = cya - M; L.t = now; L.rare.length = 0;
  if (step > 1){ L.spanY0 = Math.max(0, L.cy0 * step); L.spans = buildRowSpans(L.spanY0, Math.min(D - 1, (L.cy0 + rows) * step - 1)); }
  else L.spans = null;
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) paintLayerCell(L.cx0 + x, L.cy0 + y, true);
  dirtyBlocks.length = 0; dirtyOverflow = false;
}
let stepReq = 0, stepChangeT = -1e9;   // ズームで要求 step が最後に変わった時刻
function layerCoversView(gx0, gy0, gx1, gy1){
  const L = blockLayer, s = L.step;
  return Math.floor(gx0 / s) >= L.cx0 && Math.floor(gy0 / s) >= L.cy0
    && Math.floor(gx1 / s) < L.cx0 + L.cols && Math.floor(gy1 / s) < L.cy0 + L.rows;
}
function updateBlockLayer(now, step, gx0, gy0, gx1, gy1){
  const L = blockLayer, M = LAYER_MARGIN;
  if (step !== stepReq){ stepReq = step; stepChangeT = now; }
  const cxa = Math.floor(gx0 / step), cya = Math.floor(gy0 / step), cxb = Math.floor(gx1 / step), cyb = Math.floor(gy1 / step);
  const covered = L.img && L.step === step
    && cxa >= L.cx0 && cya >= L.cy0 && cxb < L.cx0 + L.cols && cyb < L.cy0 + L.rows
    && L.cols - (cxb - cxa + 1) <= 4 * M && L.rows - (cyb - cya + 1) <= 4 * M;   // ズームインで画像が大きすぎたら作り直す
  let eff = step;
  if (!covered || (dirtyOverflow && (step === 1 || now - L.t > 250))){
    // step が変わった直後 (ズーム操作中) は旧レイヤーを拡大/縮小して描き回し、
    // ズームが落ち着いて (130ms) から作り直す。再構築の連続発生を防ぐ
    if (L.img && L.step !== step && now - stepChangeT < 130 && layerCoversView(gx0, gy0, gx1, gy1)) eff = L.step;
    else if (L.img && L.step !== step && now - stepChangeT < 400 && now - L.t < 120) eff = L.step;   // ズーム継続中は再構築を最大 120ms 間隔に間引く
    else rebuildBlockLayer(now, step, cxa, cya, cxb, cyb);
  }
  else if (dirtyBlocks.length && (L.step === 1 || now - L.t > 120)){
    L.t = now;
    if (L.step === 1) for (const idx of dirtyBlocks) paintLayerCell(idx % D, (idx / D) | 0, false);
    else {
      const seen = new Set();
      for (const idx of dirtyBlocks){
        const cx = Math.floor((idx % D) / L.step), cy = Math.floor(((idx / D) | 0) / L.step), k = cy * 65536 + cx;
        if (!seen.has(k)){ seen.add(k); paintLayerCell(cx, cy, false); }
      }
    }
    dirtyBlocks.length = 0;
  }
  if (L.bx1 >= L.bx0){
    L.ctx.putImageData(L.img, 0, 0, L.bx0, L.by0, L.bx1 - L.bx0 + 1, L.by1 - L.by0 + 1);
    L.bx0 = L.by0 = 1e9; L.bx1 = L.by1 = -1;
  }
  return eff;
}

function drawBlocks(now, camX, camY, px, step, gx0, gy0, gx1, gy1){
  step = updateBlockLayer(now, step, gx0, gy0, gx1, gy1);
  const L = blockLayer, cell = px * step;
  const toSX = gx => ((gx - GC) * BS - camX) * zoom + CW / 2, toSY = gy => ((gy - GC) * BS - camY) * zoom + CH / 2;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(L.cv, toSX(L.cx0 * step), toSY(L.cy0 * step), L.cols * cell, L.rows * cell);
  ctx.imageSmoothingEnabled = true;
  if (step !== 1){ if (flashes.size > 200) flashes.clear(); return; }

  // --- レアブロック / 黄金 (きらめき + 目印) ---
  const sz = Math.max(1, px - 1), q = px * 0.24, m = px / 2;
  const special = (idx, kind) => {
    const rx = idx % D, ry = (idx / D) | 0;
    if (rx < gx0 || rx > gx1 || ry < gy0 || ry > gy1 || isDestroyed(idx)) return;
    const sx = toSX(rx), sy = toSY(ry), hp = damagedMap.get(idx);
    const sh = hp === undefined ? 1 : 0.45 + 0.55 * hp / blockMaxHP(rx, ry);
    if (kind === 3){   // 黄金: 色ごと塗り替える
      const tw = 0.85 + 0.15 * Math.sin(now / 220 + idx);
      ctx.fillStyle = `rgb(${(255 * tw * sh) | 0},${(214 * tw * sh) | 0},${(10 * sh) | 0})`;
      ctx.fillRect(sx, sy, sz, sz);
    } else if (kind === 1){   // 宝石: きらめき (素材色は下地のまま)
      const tw = 0.5 + 0.5 * Math.sin(now / 160 + idx * 0.7);
      ctx.fillStyle = `rgba(255,255,255,${(0.18 + 0.32 * tw) * sh})`;
      ctx.fillRect(sx, sy, sz, sz);
    }
    if (px > 9){
      ctx.strokeStyle = kind === 2 ? "rgba(0,0,0,.8)" : "#fff"; ctx.beginPath();
      if (kind === 1){ ctx.moveTo(sx + m, sy + m - q); ctx.lineTo(sx + m + q, sy + m); ctx.lineTo(sx + m, sy + m + q); ctx.lineTo(sx + m - q, sy + m); ctx.closePath(); }
      else if (kind === 2){ ctx.moveTo(sx + m - q, sy + m - q); ctx.lineTo(sx + m + q, sy + m + q); ctx.moveTo(sx + m + q, sy + m - q); ctx.lineTo(sx + m - q, sy + m + q); }
      else ctx.arc(sx + m, sy + m, q, 0, 7);
      ctx.stroke();
    }
  };
  for (const idx of L.rare) if (!goldSet.has(idx)) special(idx, blockKind(idx % D, (idx / D) | 0));
  for (const idx of goldSet) special(idx, 3);
  if ((sk("e_scan") && px > 9) || (sk("e_scan2") && px > 3)){   // 未知スキャン: 未発見の素材が光る (4マスおきに間引いて軽く)
    for (let yy = gy0 - (gy0 % 4); yy <= gy1; yy += 4) for (let xx = gx0 - (gx0 % 4); xx <= gx1; xx += 4){
      const idx2 = yy * D + xx;
      if (!blockExists(xx, yy) || isDestroyed(idx2) || state.seen[MATS[materialAt(xx, yy)].key]) continue;
      ctx.globalAlpha = 0.4 + 0.35 * Math.sin(now / 240 + idx2);
      ctx.fillStyle = "#fff";
      ctx.fillRect(toSX(xx) + px * 0.32, toSY(yy) + px * 0.32, px * 0.36, px * 0.36);
    }
    ctx.globalAlpha = 1;
  }
  // --- お宝ブロック (金色に光って星が瞬く) ---
  if (treasureSet.size && px > 3){
    for (const idx of treasureSet){
      const rx = idx % D, ry = (idx / D) | 0;
      if (rx < gx0 || rx > gx1 || ry < gy0 || ry > gy1 || isDestroyed(idx)) continue;
      const pu = 0.5 + 0.5 * Math.sin(now / 180 + idx);
      ctx.globalAlpha = 0.30 + 0.35 * pu;
      ctx.fillStyle = "#ffd640";
      ctx.fillRect(toSX(rx), toSY(ry), sz, sz);
      ctx.globalAlpha = 1;
      ctx.fillStyle = "#ffffff";
      const cxp = toSX(rx) + sz / 2, cyp = toSY(ry) + sz / 2, q = sz * (0.16 + 0.10 * pu);
      ctx.beginPath();
      ctx.moveTo(cxp, cyp - q); ctx.lineTo(cxp + q * 0.35, cyp - q * 0.35); ctx.lineTo(cxp + q, cyp); ctx.lineTo(cxp + q * 0.35, cyp + q * 0.35);
      ctx.lineTo(cxp, cyp + q); ctx.lineTo(cxp - q * 0.35, cyp + q * 0.35); ctx.lineTo(cxp - q, cyp); ctx.lineTo(cxp - q * 0.35, cyp - q * 0.35);
      ctx.closePath(); ctx.fill();
    }
  }

  // --- 被弾の白フラッシュ ---
  ctx.fillStyle = "#ffffff";
  for (const [idx, t] of flashes){
    if (now - t >= 90 || isDestroyed(idx)) continue;
    const rx = idx % D, ry = (idx / D) | 0;
    if (rx < gx0 || rx > gx1 || ry < gy0 || ry > gy1) continue;
    ctx.fillRect(toSX(rx), toSY(ry), sz, sz);
  }
  if (flashes.size > 200) flashes.clear();
  // --- 状態異常 (氷結/炎上/酸/放射/過負荷/残り火: プリレンダ済みスプライトを貼るだけ) ---
  drawStatusFx(now, toSX, toSY, sz, gx0, gy0, gx1, gy1);

  // --- ブロックの継ぎ目 (1本のパスでまとめて引く。惑星の外 = 宇宙・大気には引かない) ---
  const x0 = toSX(gx0), x1 = toSX(gx1 + 1), y0 = toSY(gy0), y1 = toSY(gy1 + 1);
  const half = d => { const a = Math.abs(d); return a > R ? -1 : Math.sqrt(R2 - a * a); };   // 円の半幅 (ブロック数)
  const seams = (off) => {
    ctx.beginPath();
    for (let gx = gx0; gx <= gx1 + 1; gx++){
      const h = half(Math.min(Math.abs(gx - GC), Math.abs(gx - 1 - GC))); if (h < 0) continue;
      const x = Math.round(toSX(gx)) + off, ya = Math.max(y0, toSY(GC - h)), yb = Math.min(y1, toSY(GC + h + 1));
      if (ya < yb){ ctx.moveTo(x, ya); ctx.lineTo(x, yb); }
    }
    for (let gy = gy0; gy <= gy1 + 1; gy++){
      const h = half(Math.min(Math.abs(gy - GC), Math.abs(gy - 1 - GC))); if (h < 0) continue;
      const y = Math.round(toSY(gy)) + off, xa = Math.max(x0, toSX(GC - h)), xb = Math.min(x1, toSX(GC + h + 1));
      if (xa < xb){ ctx.moveTo(xa, y); ctx.lineTo(xb, y); }
    }
    ctx.stroke();
  };
  ctx.lineWidth = 1;
  ctx.strokeStyle = "#000"; seams(-0.5);                                    // 隙間
  if (px > 9){ ctx.strokeStyle = "rgba(0,0,0,.55)"; seams(0.5); }           // 縁取り
}
