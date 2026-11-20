"use strict";
/* =========================================================
   render/status-fx.js - 状態異常のスプライトと描画
   ========================================================= */

// ---------- 状態異常スプライト (負荷対策: 全て事前にオフスクリーン canvas へ描いておき、描画時は drawImage で貼るだけ) ----------
// アニメーションは全ブロック共通のグローバル位相 (時刻によるフレーム切り替え) のみ。ブロック毎のタイマー・乱数は持たない。
const STFX_S = 48;   // スプライト解像度 (BS=24 の2倍)
let STFX = null;
const stfxRnd = seed => { let s = seed >>> 0; return () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff; };
function stfxMake(paint){
  const c = document.createElement("canvas"); c.width = c.height = STFX_S;
  paint(c.getContext("2d"), STFX_S);
  return c;
}
function statusSprites(){
  if (STFX) return STFX;
  const S = STFX_S;
  // 氷結: 水色の膜 + 白い結晶 + 霜のフチ
  const frost = stfxMake(g => {
    const rnd = stfxRnd(1234567);
    g.fillStyle = "rgba(155,218,255,.34)"; g.fillRect(0, 0, S, S);
    g.fillStyle = "rgba(225,246,255,.28)"; g.fillRect(5, 5, S - 10, S - 10);
    g.strokeStyle = "rgba(255,255,255,.55)"; g.lineWidth = 2;
    for (let i = 0; i < 7; i++){   // 結晶の枝
      const x = 6 + rnd() * (S - 12), y = 6 + rnd() * (S - 12), a = rnd() * 6.283, l = 5 + rnd() * 7;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
      g.moveTo(x, y); g.lineTo(x + Math.cos(a + 2.4) * l * 0.6, y + Math.sin(a + 2.4) * l * 0.6);
      g.moveTo(x, y); g.lineTo(x + Math.cos(a - 2.4) * l * 0.6, y + Math.sin(a - 2.4) * l * 0.6); g.stroke();
    }
    g.fillStyle = "rgba(255,255,255,.85)";   // きらめき
    for (let i = 0; i < 3; i++){ const x = 8 + rnd() * (S - 16), y = 8 + rnd() * (S - 16); g.fillRect(x - 1, y - 3, 2, 6); g.fillRect(x - 3, y - 1, 6, 2); }
    g.strokeStyle = "rgba(255,255,255,.9)"; g.lineWidth = 3; g.strokeRect(1.5, 1.5, S - 3, S - 3);   // 霜のフチ
  });
  // 炎上: 3フレーム (下部の炎のギザギザが位相で切り替わる)
  const burn = [0, 1, 2].map(f => stfxMake(g => {
    const rnd = stfxRnd(777 + f * 131);
    g.fillStyle = "rgba(255,84,12,.26)"; g.fillRect(0, 0, S, S);
    const tongue = (x0, w, h, col) => { g.fillStyle = col; g.beginPath(); g.moveTo(x0, S); g.lineTo(x0 + w / 2, S - h); g.lineTo(x0 + w, S); g.closePath(); g.fill(); };
    for (let x = -4; x < S; x += 9){ const h = 14 + rnd() * 16; tongue(x, 11, h, "rgba(255,110,0,.75)"); tongue(x + 2.5, 6, h * 0.55, "rgba(255,205,70,.9)"); }
    g.fillStyle = "rgba(255,190,80,.9)";   // 火の粉
    for (let i = 0; i < 4; i++){ const x = 4 + rnd() * (S - 8), y = 6 + rnd() * (S * 0.45); g.beginPath(); g.arc(x, y, 1.4 + rnd() * 1.4, 0, 7); g.fill(); }
  }));
  // 酸: 2フレーム (泡の位置が切り替わる)
  const acid = [0, 1].map(f => stfxMake(g => {
    const rnd = stfxRnd(4242 + f * 977);
    g.fillStyle = "rgba(105,225,60,.24)"; g.fillRect(0, 0, S, S);
    g.fillStyle = "rgba(140,240,90,.45)";   // 上からの垂れ
    for (let i = 0; i < 3; i++){ const x = 6 + rnd() * (S - 14), l = 10 + rnd() * 14; g.fillRect(x, 0, 3.5, l); }
    for (let i = 0; i < 9; i++){   // 泡の斑点
      const x = 5 + rnd() * (S - 10), y = 5 + rnd() * (S - 10), r = 2 + rnd() * 4.5;
      g.beginPath(); g.arc(x, y, r, 0, 7);
      if (rnd() < 0.5){ g.fillStyle = "rgba(170,255,120,.4)"; g.fill(); } else { g.strokeStyle = "rgba(200,255,160,.85)"; g.lineWidth = 1.6; g.stroke(); }
    }
  }));
  // 放射: 2フレーム (濃さが脈動) + 三つ葉マーク
  const rad = [0, 1].map(f => stfxMake(g => {
    g.fillStyle = f ? "rgba(195,255,70,.26)" : "rgba(195,255,70,.15)"; g.fillRect(0, 0, S, S);
    g.fillStyle = f ? "rgba(220,255,95,.95)" : "rgba(220,255,95,.7)";
    const cx = S / 2, cy = S / 2;
    g.beginPath(); g.arc(cx, cy, 3.2, 0, 7); g.fill();
    for (let k = 0; k < 3; k++){
      const a = -Math.PI / 2 + k * (Math.PI * 2 / 3);
      g.beginPath(); g.moveTo(cx + Math.cos(a - 0.52) * 5.5, cy + Math.sin(a - 0.52) * 5.5);
      g.arc(cx, cy, 14, a - 0.52, a + 0.52); g.closePath(); g.fill();
    }
  }));
  // 過負荷 (帯電): 2フレーム (稲妻が左右に揺れる)
  const overload = [0, 1].map(f => stfxMake(g => {
    g.fillStyle = "rgba(255,220,80,.10)"; g.fillRect(0, 0, S, S);
    const dx = f ? 3 : -2;
    g.beginPath();
    g.moveTo(27 + dx, 6); g.lineTo(15 + dx, 27); g.lineTo(22 + dx, 27); g.lineTo(19 + dx, 42); g.lineTo(33 + dx, 20); g.lineTo(25 + dx, 20);
    g.closePath();
    g.fillStyle = "rgba(255,228,70,.95)"; g.fill();
    g.strokeStyle = "rgba(255,160,0,.9)"; g.lineWidth = 1.5; g.stroke();
  }));
  // 残り火: 薄い橙の膜 + 下部の熾き
  const ember = stfxMake(g => {
    const rnd = stfxRnd(999331);
    g.fillStyle = "rgba(255,100,20,.15)"; g.fillRect(0, 0, S, S);
    for (let i = 0; i < 6; i++){
      const x = 4 + rnd() * (S - 8), y = S - 4 - rnd() * 10, r = 1.6 + rnd() * 2.4;
      g.fillStyle = rnd() < 0.4 ? "rgba(255,215,120,.95)" : "rgba(255,140,45,.85)";
      g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
    }
  });
  return (STFX = { frost, burn, acid, rad, overload, ember });
}
// 状態異常の描画 (drawBlocks 内、画面内ブロックのみ)。優先順位: 氷結 > burns (炎上/酸/放射) > 過負荷 > 残り火、重なりは最大2枚 (2枚目は右下に小さく)
function drawStatusFx(now, toSX, toSY, sz, gx0, gy0, gx1, gy1){
  if (!burns.size && !frosts.size && !embers.size && !overloads.size) return;
  const SP = statusSprites();
  const burnCv = SP.burn[(now / 140 | 0) % 3], acidCv = SP.acid[(now / 320 | 0) % 2],
        radCv = SP.rad[(now / 480 | 0) % 2], ovCv = SP.overload[(now / 180 | 0) % 2];
  const burnSprite = b => b.k === "acid" ? acidCv : b.k === "rad" ? radCv : burnCv;
  // 状態が1カテゴリだけなら重なりは起きない: 記録を省略して直接描く
  if ((!!burns.size) + (!!frosts.size) + (!!overloads.size) + (!!embers.size) === 1){
    if (frosts.size) for (const idx of frosts.keys()){ const rx = idx % D, ry = (idx / D) | 0; if (rx < gx0 || rx > gx1 || ry < gy0 || ry > gy1 || isDestroyed(idx)) continue; ctx.drawImage(SP.frost, toSX(rx), toSY(ry), sz, sz); }
    else if (burns.size) for (const [idx, b] of burns){ const rx = idx % D, ry = (idx / D) | 0; if (rx < gx0 || rx > gx1 || ry < gy0 || ry > gy1 || isDestroyed(idx)) continue; ctx.drawImage(burnSprite(b), toSX(rx), toSY(ry), sz, sz); }
    else if (overloads.size) for (const idx of overloads.keys()){ const rx = idx % D, ry = (idx / D) | 0; if (rx < gx0 || rx > gx1 || ry < gy0 || ry > gy1 || isDestroyed(idx)) continue; ctx.drawImage(ovCv, toSX(rx), toSY(ry), sz, sz); }
    else for (const idx of embers.keys()){ const rx = idx % D, ry = (idx / D) | 0; if (rx < gx0 || rx > gx1 || ry < gy0 || ry > gy1 || isDestroyed(idx)) continue; ctx.drawImage(SP.ember, toSX(rx), toSY(ry), sz, sz); }
    return;
  }
  // 複数カテゴリ: 重なりは前段の Map への has 判定だけで数える (追加の記録 Map を持たない)。最大2枚、2枚目は sz が十分大きい時だけ右下に小さく
  const badge = sz >= 14, s2 = sz * 0.55;
  const draw1 = (idx, cv) => { const rx = idx % D, ry = (idx / D) | 0; if (rx < gx0 || rx > gx1 || ry < gy0 || ry > gy1 || isDestroyed(idx)) return; ctx.drawImage(cv, toSX(rx), toSY(ry), sz, sz); };
  const draw2 = (idx, cv) => { if (!badge) return; const rx = idx % D, ry = (idx / D) | 0; if (rx < gx0 || rx > gx1 || ry < gy0 || ry > gy1 || isDestroyed(idx)) return; ctx.drawImage(cv, toSX(rx) + sz - s2, toSY(ry) + sz - s2, s2, s2); };
  for (const idx of frosts.keys()) draw1(idx, SP.frost);
  for (const idx of burns.keys()){ const cv = burnSprite(burns.get(idx)); if (frosts.has(idx)) draw2(idx, cv); else draw1(idx, cv); }
  for (const idx of overloads.keys()){ const prior = (frosts.has(idx) ? 1 : 0) + (burns.has(idx) ? 1 : 0); if (prior === 0) draw1(idx, ovCv); else if (prior === 1) draw2(idx, ovCv); }
  for (const idx of embers.keys()){ const prior = (frosts.has(idx) ? 1 : 0) + (burns.has(idx) ? 1 : 0) + (overloads.has(idx) ? 1 : 0); if (prior === 0) draw1(idx, SP.ember); else if (prior === 1) draw2(idx, SP.ember); }
}
