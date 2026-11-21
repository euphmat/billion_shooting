"use strict";
/* =========================================================
   game/skill-fx.js - スキル効果の毎フレーム処理 / 描画
   (ゲーム本体の後に読み込む。データは data/skills.js、命中時フックは game/skill-hooks.js)
   ========================================================= */

// ---------- カーソル位置 ----------
let mouseSX = 0, mouseSY = 0, mouseIn = false;
cv.addEventListener("mousemove", e => { mouseSX = e.offsetX; mouseSY = e.offsetY; mouseIn = true; });
cv.addEventListener("mouseleave", () => { mouseIn = false; });
const mouseWorld = () => ({ x: player.x + (mouseSX - CW / 2) / zoom, y: player.y + (mouseSY - CH / 2) / zoom });
const blockPos = idx => ({ x: g2w(idx % D), y: g2w((idx / D) | 0) });

// ---------- 演出の部品 ----------
const sndLevel = () => [523, 659, 784, 1046, 1318].forEach((f, i) => tone(f, .18, "triangle", .07, 0, i * .075));
function blast(x, y, r, dmg, color){
  damageRadius(x, y, r, dmg);
  addRing({ x, y, r: r * 1.15, t: performance.now(), color: color || "255,255,255", dur: 480 });
  sndBoom();
}
function levelUpFx(){
  if (typeof f0OnLevelUp === "function") f0OnLevelUp();   // 序盤機兵: 急速充電 (20秒間、機兵の動作速度 ×2)
  sndLevel();
  if (typeof artHas === "function" && artHas("lg_scepter")) scepterStarfall();   // 星屑の王笏: 星が降り注ぐ
  addRing({ x: player.x, y: player.y, r: 260, t: performance.now(), color: "255,255,255", dur: 700 });
  let msg = `レベルアップ  Lv.${state.lv} (スキルポイント +${state.lv % 5 === 0 ? 2 : 1})`;
  if (sk("c_bonus")){ const g = state.lv * 60; addCoins(g); msg += `  祝い金 +${fmt(g)}`; }
  toast(msg, "good", "levelup");
}

// ---------- 奥義: 専用スプライト (事前レンダリング。発光はスプライト側に焼き込む) ----------
function makeSprite(size, draw){
  const c = document.createElement("canvas"); c.width = c.height = size;
  const g = c.getContext("2d"); draw(g, size); return c;
}
// ファンネル: 菱形ビット本体 + 尾翼フィン + 発光コア + 砲口 (鼻は +x 方向)
const funnelSpr = makeSprite(56, (g, S) => {
  const cx = S / 2, cy = S / 2;
  const body = g.createLinearGradient(cx - 20, 0, cx + 20, 0);
  body.addColorStop(0, "#141c26"); body.addColorStop(0.55, "#33506b"); body.addColorStop(1, "#0d1218");
  g.fillStyle = body; g.strokeStyle = "#7df9ff"; g.lineWidth = 1.6;
  g.beginPath(); g.moveTo(cx + 20, cy); g.lineTo(cx + 2, cy - 11); g.lineTo(cx - 16, cy - 5); g.lineTo(cx - 20, cy); g.lineTo(cx - 16, cy + 5); g.lineTo(cx + 2, cy + 11); g.closePath(); g.fill(); g.stroke();
  g.fillStyle = "#57e39a";
  g.beginPath(); g.moveTo(cx - 14, cy - 4); g.lineTo(cx - 24, cy - 13); g.lineTo(cx - 10, cy - 10); g.closePath(); g.fill();
  g.beginPath(); g.moveTo(cx - 14, cy + 4); g.lineTo(cx - 24, cy + 13); g.lineTo(cx - 10, cy + 10); g.closePath(); g.fill();
  g.strokeStyle = "#dff6ff"; g.lineWidth = 2.4; g.beginPath(); g.moveTo(cx + 14, cy); g.lineTo(cx + 23, cy); g.stroke();
  const core = g.createRadialGradient(cx - 2, cy, 0, cx - 2, cy, 10);
  core.addColorStop(0, "#ffffff"); core.addColorStop(0.35, "#57e39a"); core.addColorStop(1, "rgba(87,227,154,0)");
  g.fillStyle = core; g.beginPath(); g.arc(cx - 2, cy, 10, 0, 7); g.fill();
});
// オービタルボット: 重厚な二重リング軌道体 + 装甲セグメント + 金色コア (攻撃ボットと一目で違うシルエット)
const orbitalSpr = makeSprite(104, (g, S) => {
  const cx = S / 2, cy = S / 2;
  g.strokeStyle = "#2c3e50"; g.lineWidth = 11; g.beginPath(); g.arc(cx, cy, 40, 0, 7); g.stroke();
  g.strokeStyle = "#7df9ff"; g.lineWidth = 2.4; g.beginPath(); g.arc(cx, cy, 46, 0, 7); g.stroke();
  g.strokeStyle = "#57e39a"; g.lineWidth = 3; g.beginPath(); g.arc(cx, cy, 34, 0, 7); g.stroke();
  g.fillStyle = "#486581";
  for (let k = 0; k < 4; k++){ const a = k * Math.PI / 2 + Math.PI / 4, x = cx + Math.cos(a) * 40, y = cy + Math.sin(a) * 40; g.save(); g.translate(x, y); g.rotate(a); g.fillRect(-7, -5, 14, 10); g.restore(); }
  const core = g.createRadialGradient(cx, cy, 0, cx, cy, 17);
  core.addColorStop(0, "#ffffff"); core.addColorStop(0.3, "#ffd60a"); core.addColorStop(0.7, "rgba(255,150,40,.55)"); core.addColorStop(1, "rgba(255,150,40,0)");
  g.fillStyle = core; g.beginPath(); g.arc(cx, cy, 17, 0, 7); g.fill();
  g.strokeStyle = "#ffe9a8"; g.lineWidth = 1.6; g.beginPath(); g.arc(cx, cy, 9, 0, 7); g.stroke();
});
// マズルフラッシュ: 十字スパイク + グロー
const flashSpr = makeSprite(40, (g, S) => {
  const cx = S / 2, cy = S / 2;
  const rg = g.createRadialGradient(cx, cy, 0, cx, cy, 19);
  rg.addColorStop(0, "rgba(255,255,255,.95)"); rg.addColorStop(0.4, "rgba(160,240,255,.55)"); rg.addColorStop(1, "rgba(160,240,255,0)");
  g.fillStyle = rg; g.beginPath(); g.arc(cx, cy, 19, 0, 7); g.fill();
  g.strokeStyle = "rgba(255,255,255,.9)"; g.lineWidth = 2;
  g.beginPath(); g.moveTo(cx - 18, cy); g.lineTo(cx + 18, cy); g.moveTo(cx, cy - 18); g.lineTo(cx, cy + 18); g.stroke();
});
// 原初元素炉の虹オーラ: 12色の扇セグメント + 柔らかい外周グロー
const auraSpr = makeSprite(256, (g, S) => {
  const cx = S / 2, cy = S / 2;
  for (let k = 0; k < 12; k++){
    g.fillStyle = `hsla(${k * 30}, 100%, 62%, .20)`;
    g.beginPath(); g.moveTo(cx, cy); g.arc(cx, cy, 124, k * Math.PI / 6, (k + 1) * Math.PI / 6); g.closePath(); g.fill();
  }
  const rg = g.createRadialGradient(cx, cy, 30, cx, cy, 126);
  rg.addColorStop(0, "rgba(255,255,255,0)"); rg.addColorStop(0.75, "rgba(255,255,255,.10)"); rg.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = rg; g.beginPath(); g.arc(cx, cy, 126, 0, 7); g.fill();
});
// 金貨: 金のグラデーション + 縁取り + ハイライト
const coinSpr = makeSprite(22, (g, S) => {
  const cx = S / 2, cy = S / 2;
  const rg = g.createRadialGradient(cx - 2, cy - 2, 0, cx, cy, 10);
  rg.addColorStop(0, "#fff6bf"); rg.addColorStop(0.55, "#ffd60a"); rg.addColorStop(1, "#b8860b");
  g.fillStyle = rg; g.beginPath(); g.arc(cx, cy, 9.5, 0, 7); g.fill();
  g.strokeStyle = "#8a6508"; g.lineWidth = 1.4; g.beginPath(); g.arc(cx, cy, 9.5, 0, 7); g.stroke();
  g.strokeStyle = "rgba(138,101,8,.8)"; g.lineWidth = 1.2; g.beginPath(); g.arc(cx, cy, 5.5, 0, 7); g.stroke();
  g.fillStyle = "rgba(255,255,255,.9)"; g.fillRect(cx - 5, cy - 6, 2.4, 2.4);
});
// バースト演出: 白熱コア + 色グロー + 破片リング (二重の欠けリング)
function burstSprite(color, coreColor){
  return makeSprite(128, (g, S) => {
    const cx = S / 2, cy = S / 2;
    const rg = g.createRadialGradient(cx, cy, 0, cx, cy, 62);
    rg.addColorStop(0, "rgba(255,255,255,.95)"); rg.addColorStop(0.25, coreColor); rg.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = rg; g.beginPath(); g.arc(cx, cy, 62, 0, 7); g.fill();
    g.strokeStyle = color; g.lineWidth = 5;
    for (let k = 0; k < 6; k++){ const a0 = k * Math.PI / 3 + 0.18; g.beginPath(); g.arc(cx, cy, 50, a0, a0 + Math.PI / 4.2); g.stroke(); }
    g.lineWidth = 2.4;
    for (let k = 0; k < 6; k++){ const a0 = k * Math.PI / 3 - 0.3; g.beginPath(); g.arc(cx, cy, 34, a0, a0 + Math.PI / 5); g.stroke(); }
  });
}
const burstSprs = {
  dimension: burstSprite("rgba(224,110,255,.9)", "rgba(190,90,255,.75)"),
  planet: burstSprite("rgba(255,176,96,.95)", "rgba(255,140,50,.8)"),
  burn: burstSprite("rgba(255,120,40,.9)", "rgba(255,90,20,.7)"),
  frost: burstSprite("rgba(120,220,255,.9)", "rgba(90,180,255,.7)"),
  acid: burstSprite("rgba(120,255,90,.9)", "rgba(80,220,60,.7)"),
  rad: burstSprite("rgba(157,107,255,.9)", "rgba(140,80,255,.7)"),
  spark: burstSprite("rgba(125,249,255,.95)", "rgba(125,249,255,.7)"),
  annihilation: burstSprite("rgba(255,255,255,.98)", "rgba(255,244,200,.9)"),   // 消滅砲撃 (究極): 純白
  diswave: burstSprite("rgba(255,170,80,.95)", "rgba(255,210,130,.85)"),        // 解体波 (究極): 橙白
  planetbeam: burstSprite("rgba(125,249,255,.95)", "rgba(190,250,255,.85)"),    // 惑星破壊ビーム (究極): 青白
};
// 惑星破壊艦隊の母艦: オービタル (104px) より遥かに大きい 240px の弩級艦 (鼻は +x 方向)。
// 多層装甲 + 側部ポッド + 金のトリム + 発光コアストリップで「重さ」を出す
const mothershipSpr = makeSprite(240, (g, S) => {
  const cx = S / 2, cy = S / 2;
  const eng = g.createRadialGradient(cx - 82, cy, 0, cx - 82, cy, 36);
  eng.addColorStop(0, "rgba(160,240,255,.75)"); eng.addColorStop(1, "rgba(160,240,255,0)");
  g.fillStyle = eng; g.beginPath(); g.arc(cx - 82, cy, 36, 0, 7); g.fill();
  const hull = g.createLinearGradient(0, cy - 34, 0, cy + 34);
  hull.addColorStop(0, "#0d1420"); hull.addColorStop(0.5, "#3d5a76"); hull.addColorStop(1, "#0a0f16");
  g.fillStyle = hull; g.strokeStyle = "#9fd8ff"; g.lineWidth = 2;
  g.beginPath();
  g.moveTo(cx + 96, cy); g.lineTo(cx + 52, cy - 20); g.lineTo(cx + 8, cy - 30); g.lineTo(cx - 52, cy - 26);
  g.lineTo(cx - 84, cy - 12); g.lineTo(cx - 84, cy + 12); g.lineTo(cx - 52, cy + 26); g.lineTo(cx + 8, cy + 30);
  g.lineTo(cx + 52, cy + 20); g.closePath(); g.fill(); g.stroke();
  g.fillStyle = "#22364c"; g.strokeStyle = "#7df9ff"; g.lineWidth = 1.6;
  for (const sgn of [-1, 1]){
    g.beginPath(); g.moveTo(cx + 30, cy + sgn * 30); g.lineTo(cx - 30, cy + sgn * 38); g.lineTo(cx - 62, cy + sgn * 30); g.lineTo(cx - 20, cy + sgn * 22); g.closePath(); g.fill(); g.stroke();
  }
  g.strokeStyle = "rgba(255,214,10,.75)"; g.lineWidth = 2;
  g.beginPath(); g.moveTo(cx + 60, cy - 13); g.lineTo(cx - 40, cy - 18); g.moveTo(cx + 60, cy + 13); g.lineTo(cx - 40, cy + 18); g.stroke();
  g.strokeStyle = "rgba(125,249,255,.5)"; g.lineWidth = 1.2;
  for (const off of [-44, -16, 16, 44]){ g.beginPath(); g.moveTo(cx + off, cy - 24); g.lineTo(cx + off, cy + 24); g.stroke(); }
  const core = g.createLinearGradient(cx - 60, 0, cx + 70, 0);
  core.addColorStop(0, "rgba(125,249,255,0)"); core.addColorStop(0.5, "#dff6ff"); core.addColorStop(1, "rgba(125,249,255,0)");
  g.fillStyle = core; g.fillRect(cx - 60, cy - 3.5, 130, 7);
  const cg = g.createRadialGradient(cx + 18, cy, 0, cx + 18, cy, 16);
  cg.addColorStop(0, "#ffffff"); cg.addColorStop(0.4, "#7df9ff"); cg.addColorStop(1, "rgba(125,249,255,0)");
  g.fillStyle = cg; g.beginPath(); g.arc(cx + 18, cy, 16, 0, 7); g.fill();
  g.fillStyle = "#486581"; g.strokeStyle = "#dff6ff"; g.lineWidth = 1.4;
  g.beginPath(); g.arc(cx + 34, cy - 16, 8, 0, 7); g.fill(); g.stroke();
  g.beginPath(); g.arc(cx + 34, cy + 16, 8, 0, 7); g.fill(); g.stroke();
});
// 消滅砲撃の破片: 岩片スプライト (2種)
const shardSprs = [0, 1].map(() => makeSprite(24, (g, S) => {
  const cx = S / 2, cy = S / 2;
  g.fillStyle = "#5a4632"; g.strokeStyle = "#8a6f4d"; g.lineWidth = 1.2;
  g.beginPath();
  for (let k = 0; k < 5; k++){ const a = k / 5 * Math.PI * 2 + Math.random() * 0.5, r = 5 + Math.random() * 6, x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r; k ? g.lineTo(x, y) : g.moveTo(x, y); }
  g.closePath(); g.fill(); g.stroke();
  g.fillStyle = "rgba(255,190,90,.85)"; g.fillRect(cx - 1.5, cy - 1.5, 3, 3);
}));

// ---------- 奥義: 毎フレーム処理 ----------
const funnels = [], orbitals = [];
const dimFx = [], goldParts = [];   // dimFx: {x, y, t, kind, dur?} バースト演出 / goldParts: 金貨パーティクル
let planetT = 30, fleetT = 10, coreFrostT = 0, goldTrailT = 0, funCount = -1, orbCount = -1;
// ---------- 究極: 実行時状態 ----------
let annihT = 45, whiteFlash = 0;   // 消滅砲撃のタイマー / 画面フラッシュの残量 (1→0)
const mothership = { ang: 0, x: 0, y: 0, fireT: 3, flash: 0 };   // 惑星破壊艦隊の母艦
const debrisParts = [];   // 消滅砲撃の破片 {x, y, vx, vy, t, life, rot, vr, s, spr}
function capstoneUpdate(dt, bdt, now){
  // 原初元素炉: 氷結中ブロックへ追加ダメージ (最大HP 1%/秒。数が多い時は間隔を伸ばして集約)
  if (sk("b_core") && frosts.size){
    coreFrostT -= dt;
    if (coreFrostT <= 0){
      coreFrostT = frosts.size > 400 ? 1 : frosts.size > 120 ? 0.5 : 0.25;   // 件数が多いほど間隔を伸ばして集約 (DPS は 1%/秒で不変)
      const frac = coreFrostT * 0.01;
      rawDamage(() => { for (const idx of frosts.keys()) if (!isDestroyed(idx)) damageBlock(idx, blockMaxHP(idx % D, (idx / D) | 0) * frac, 0); });
    }
  }
  // 惑星殺し・極: 30秒ごとに軌道砲撃 (空からの太い光柱 + 多重リング + 画面内の全ブロック/モンスターへ特大ダメージ)
  if (sk("a_planetkiller")){
    planetT -= dt;
    if (planetT <= 0){
      planetT = 30; bumpProc("planetkiller");
      skillFeed("planetkiller", "軌道砲撃", "☄️", "#ff6b4a");
      const R = Math.min(1500, Math.hypot(CW, CH) / 2 / zoom + BS * 2);
      addBeam({ x1: player.x, y1: player.y - 1700, x2: player.x, y2: player.y, t: now, w: 16, color: "rgba(255,176,96,.7)", life: 320 });
      addBeam({ x1: player.x, y1: player.y - 1700, x2: player.x, y2: player.y, t: now, w: 5, color: "#ffffff", life: 320 });
      addRing({ x: player.x, y: player.y, r: R * 0.55, t: now, color: "255,150,60", dur: 650 });
      addRing({ x: player.x, y: player.y, r: R * 0.3, t: now, color: "255,230,190", dur: 500 });
      dimFx.push({ x: player.x, y: player.y, t: 0, kind: "planet", dur: 0.6 });
      rawDamage(() => damageRadius(player.x, player.y, R, playerDamage() * 20 * gMul));
      sndBoom(true);
    }
  }
  // ファンネル: 公転しながら既存の shoot() 経路で自動射撃 (艦隊総攻撃で 8基・二重リング逆回転)
  const gf = sk("d_grandfleet");
  const wantFun = gf ? 8 : sk("d_funnel") ? 4 : 0;
  if (wantFun !== funCount){
    funCount = wantFun; funnels.length = 0;
    for (let i = 0; i < wantFun; i++) funnels.push({ ang: i * Math.PI * 2 / wantFun, x: player.x, y: player.y, face: 0, fireT: 0.12 * i, flash: 0, trail: [] });
  }
  for (let i = 0; i < funnels.length; i++){
    const f = funnels[i], outer = gf && i >= 4;
    const radius = gf ? (outer ? 88 : 56) : 62, speed = outer ? -1.4 : 2.0;
    f.ang += bdt * speed;
    f.x = player.x + Math.cos(f.ang) * radius; f.y = player.y + Math.sin(f.ang) * radius;
    f.face = f.ang + (speed > 0 ? Math.PI / 2 : -Math.PI / 2);
    f.trail.push({ x: f.x, y: f.y }); if (f.trail.length > 4) f.trail.shift();
    if (f.flash > 0) f.flash -= bdt;
    f.fireT -= bdt;
    if (f.fireT <= 0){ f.fireT = 0.4; if (shoot(f.x, f.y, playerDPS() * 0.15 * 0.4 * (gf ? 2 : 1) * (sk("d_ultimate") ? 3 : 1) * masteryMul("d"), null, true)) f.flash = 0.06; }   // 間隔 0.4s × 1発 = 自機DPSの約15%/基 / 惑星破壊艦隊 (究極): ×3
  }
  // オービタルボット: 大きく周回し、最も硬い対象へ徹甲レーザー (太ビーム + 着弾スパーク)
  const wantOrb = gf ? 2 : sk("d_orbital") ? 1 : 0;
  if (wantOrb !== orbCount){
    orbCount = wantOrb; orbitals.length = 0;
    for (let i = 0; i < wantOrb; i++) orbitals.push({ ang: i * Math.PI, x: player.x, y: player.y, fireT: 1.2 + i * 1.1, flash: 0 });
  }
  for (const o of orbitals){
    o.ang -= bdt * 0.85;
    o.x = player.x + Math.cos(o.ang) * 128; o.y = player.y + Math.sin(o.ang) * 128;
    if (o.flash > 0) o.flash -= bdt;
    o.fireT -= bdt;
    if (o.fireT <= 0){
      o.fireT = 2.4;
      const range = atkRange() * 1.3, dmg = playerDPS() * 0.40 * 2.4 * (gf ? 2 : 1) * (sk("d_ultimate") ? 3 : 1);   // 惑星破壊艦隊 (究極): ×3
      let bIdx = -1, bHard = 0;
      for (const i of findNearestBlocks(player.x, player.y, range, 14)){ const mh = blockMaxHP(i % D, (i / D) | 0); if (mh > bHard){ bHard = mh; bIdx = i; } }
      let bMob = null;
      for (const m of mobs){ if (!m.dead && m.maxHp > bHard && Math.hypot(m.x - player.x, m.y - player.y) <= range){ bHard = m.maxHp; bMob = m; } }
      if (bMob || bIdx >= 0){
        const tp = bMob ? { x: bMob.x, y: bMob.y } : blockPos(bIdx);
        addBeam({ x1: o.x, y1: o.y, x2: tp.x, y2: tp.y, t: now, w: 7, color: "#7df9ff", life: 200 });
        addBeam({ x1: o.x, y1: o.y, x2: tp.x, y2: tp.y, t: now, w: 2.5, color: "#ffffff", life: 200 });
        dimFx.push({ x: tp.x, y: tp.y, t: 0, kind: "spark", dur: 0.28 });
        if (bMob) damageMob(bMob, dmg, null); else damageBlock(bIdx, dmg, 0);
        o.flash = 0.12;
      } else o.fireT = 0.5;
    }
  }
  // 艦隊総攻撃: 10秒ごとに全ファンネル一斉射撃バースト
  if (gf && funnels.length){
    fleetT -= dt;
    if (fleetT <= 0){
      fleetT = 10; bumpProc("fleetburst");
      skillFeed("grandfleet", "艦隊総攻撃", "🛸", "#57e39a");
      for (const f of funnels){ for (let k = 0; k < 3; k++) shoot(f.x, f.y, playerDPS() * 0.15 * 0.4 * 2 * 1.5 * (sk("d_ultimate") ? 3 : 1) * masteryMul("d"), null, true); f.flash = 0.09; }   // 惑星破壊艦隊 (究極): ×3
    }
  }
  // 大富豪の蓄財: 金の雨 (イベント消費) / 無限財宝: 移動中の金の軌跡
  while (goldRainFx.length){
    const e = goldRainFx.shift();
    for (let k = 0; k < 12 && goldParts.length < 90; k++){
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 1.6, sp = 130 + Math.random() * 190;
      goldParts.push({ x: e.x, y: e.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, t: 0, life: 0.85 + Math.random() * 0.3, rot: Math.random() * 6.3, vr: (Math.random() - 0.5) * 9 });
    }
  }
  if (sk("c_philosopher") && player.moving){
    goldTrailT -= dt;
    if (goldTrailT <= 0 && goldParts.length < 90){ goldTrailT = 0.05; goldParts.push({ x: player.x + (Math.random() - 0.5) * 14, y: player.y + (Math.random() - 0.5) * 14, vx: (Math.random() - 0.5) * 24, vy: 26 + Math.random() * 22, t: 0, life: 0.55, rot: Math.random() * 6.3, vr: (Math.random() - 0.5) * 7 }); }
  }
  for (let i = goldParts.length - 1; i >= 0; i--){
    const p = goldParts[i]; p.t += dt;
    if (p.t >= p.life){ goldParts.splice(i, 1); continue; }
    p.vy += 300 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
  }
  // バースト演出の寿命
  for (let i = dimFx.length - 1; i >= 0; i--){ dimFx[i].t += dt; if (dimFx[i].t >= (dimFx[i].dur || 0.45)) dimFx.splice(i, 1); }
  ultimateUpdate(dt, bdt, now);
  machineUpdate(dt, now);   // 機兵系統: 自律機兵 (game/machines.js)
}

// ---------- 究極: 毎フレーム処理 ----------
function ultimateUpdate(dt, bdt, now){
  if (novaCd > 0) novaCd -= dt;   // 元素新星のクールダウン (game/skill-hooks.js)
  processBreakQueue();            // 全破壊キュー: 1フレーム上限ぶんだけ処理
  if (whiteFlash > 0) whiteFlash = Math.max(0, whiteFlash - dt * 1.6);
  for (let i = debrisParts.length - 1; i >= 0; i--){
    const p = debrisParts[i]; p.t += dt;
    if (p.t >= p.life){ debrisParts.splice(i, 1); continue; }
    p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 130 * dt; p.rot += p.vr * dt;
  }
  // 惑星消滅プロトコル: 45秒ごとに消滅砲撃
  if (sk("a_ultimate")){
    annihT -= dt;
    if (annihT <= 0){ annihT = 45; fireAnnihilation(now); }
  }
  // 惑星破壊艦隊: 巨大母艦が自機をゆっくり周回し、3秒ごとに最も密集した地点へ惑星破壊ビーム
  if (sk("d_ultimate")){
    mothership.ang -= bdt * 0.22;
    mothership.x = player.x + Math.cos(mothership.ang) * 235;
    mothership.y = player.y + Math.sin(mothership.ang) * 235;
    if (mothership.flash > 0) mothership.flash -= bdt;
    mothership.fireT -= dt;
    if (mothership.fireT <= 0){
      mothership.fireT = 3;
      const tp = mothershipTarget();
      if (tp){
        bumpProc("planetbeam");
        skillFeed("planetbeam", "惑星破壊ビーム", "🛸", "#7df9ff");
        addBeam({ x1: mothership.x, y1: mothership.y, x2: tp.x, y2: tp.y, t: now, w: 9, color: "rgba(125,249,255,.7)", life: 260 });
        addBeam({ x1: mothership.x, y1: mothership.y, x2: tp.x, y2: tp.y, t: now, w: 3, color: "#ffffff", life: 260 });
        addRing({ x: tp.x, y: tp.y, r: BS * 8.5, t: now, color: "125,249,255", dur: 550 });
        dimFx.push({ x: tp.x, y: tp.y, t: 0, kind: "planetbeam", dur: 0.55 });
        rawDamage(() => damageRadius(tp.x, tp.y, BS * 8, playerDPS() * 50));
        mothership.flash = 0.18;
        sndBoom();
      } else mothership.fireT = 0.6;
    }
  }
}
// 消滅砲撃: 白い太光柱 + 多重リング + 純白バースト + 画面フラッシュ + 破片。
// ブロックはHP無視で全破壊キューへ、範囲内のモンスターは即死 (シェイクは使わない)
function fireAnnihilation(now){
  bumpProc("annihilation");
  skillFeed("annihilation", "消滅砲撃", "💥", "#ffffff");
  addBeam({ x1: player.x, y1: player.y - 2400, x2: player.x, y2: player.y, t: now, w: 24, color: "rgba(255,255,255,.6)", life: 420 });
  addBeam({ x1: player.x, y1: player.y - 2400, x2: player.x, y2: player.y, t: now, w: 10, color: "#ffe9a8", life: 420 });
  addBeam({ x1: player.x, y1: player.y - 2400, x2: player.x, y2: player.y, t: now, w: 6, color: "#ffffff", life: 420 });
  addRing({ x: player.x, y: player.y, r: BS * 24, t: now, color: "255,255,255", dur: 800 });
  addRing({ x: player.x, y: player.y, r: BS * 16, t: now, color: "255,233,168", dur: 650 });
  addRing({ x: player.x, y: player.y, r: BS * 8, t: now, color: "255,255,255", dur: 500 });
  dimFx.push({ x: player.x, y: player.y, t: 0, kind: "annihilation", dur: 0.7 });
  whiteFlash = 1;
  for (let k = 0; k < 46 && debrisParts.length < 160; k++){
    const a = Math.random() * Math.PI * 2, sp = 120 + Math.random() * 420;
    debrisParts.push({ x: player.x, y: player.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 60, t: 0, life: 0.9 + Math.random() * 0.7, rot: Math.random() * 6.3, vr: (Math.random() - 0.5) * 10, s: 5 + Math.random() * 9, spr: (Math.random() * 2) | 0 });
  }
  const rr = BS * 24;
  for (const m of mobs) if (!m.dead && Math.hypot(m.x - player.x, m.y - player.y) <= rr) damageMob(m, (m.hp + m.maxHp) * 10 + 1e6, null);   // 範囲内のモンスターは即死
  queueDestroyCircle(w2g(player.x), w2g(player.y), 24);
  sndBoom(true);
}
// 母艦の照準: 自機周辺の候補点 (ブロック群・モンスター) を半径4セルのブロック密度で採点し、最も密集した地点を選ぶ
function mothershipTarget(){
  const cand = [];
  for (const i of findNearestBlocks(player.x, player.y, 1100, 16)) cand.push(blockPos(i));
  for (const m of mobs) if (!m.dead && Math.hypot(m.x - player.x, m.y - player.y) <= 1100) cand.push({ x: m.x, y: m.y });
  let best = null, bestScore = -1;
  for (const c of cand){
    const cgx = w2g(c.x), cgy = w2g(c.y);
    let s = 0;
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++)
      if (dx * dx + dy * dy <= 16 && liveAt(cgx + dx, cgy + dy) >= 0) s++;
    if (s > bestScore){ bestScore = s; best = c; }
  }
  return best;
}

// ---------- 奥義: 描画 (skillsDraw の先頭 = 自機より下の層) ----------
function capstoneDraw(now, toScreen){
  if (sk("b_core")){   // 虹色オーラ (回転 + 脈動)
    const [sx, sy] = toScreen(player.x, player.y);
    const size = 175 * zoom * (1 + 0.05 * Math.sin(now / 340));
    ctx.save(); ctx.translate(sx, sy); ctx.rotate(now / 2600); ctx.globalAlpha = 0.85;
    ctx.drawImage(auraSpr, -size / 2, -size / 2, size, size); ctx.restore();
  }
  machineDraw(now, toScreen);   // 機兵系統: 自律機兵 (game/machines.js)
  for (const d of dimFx){   // 次元崩壊は回転させて歪み感を出す
    const spr = burstSprs[d.kind]; if (!spr) continue;
    const dur = d.dur || 0.45, p = Math.min(1, d.t / dur);
    const base = d.size || (d.kind === "annihilation" ? 560 : d.kind === "diswave" ? 430 : d.kind === "planetbeam" ? 400 : d.kind === "planet" ? 360 : d.kind === "spark" ? 95 : 175);
    const size = base * (0.35 + 0.75 * p) * zoom;
    const [sx, sy] = toScreen(d.x, d.y);
    ctx.save(); ctx.translate(sx, sy); if (d.kind === "dimension") ctx.rotate(p * 1.4);
    ctx.globalAlpha = (1 - p) * 0.95; ctx.drawImage(spr, -size / 2, -size / 2, size, size); ctx.restore();
  }
  for (const p of goldParts){   // 金貨 (回転で薄くなる表現)
    const [sx, sy] = toScreen(p.x, p.y);
    const size = 15 * zoom, sq = Math.abs(Math.cos(p.rot));
    ctx.save(); ctx.translate(sx, sy); ctx.globalAlpha = Math.min(1, (p.life - p.t) / 0.25);
    ctx.drawImage(coinSpr, -size / 2, -size / 2, Math.max(2, size * (0.25 + 0.75 * sq)), size); ctx.restore();
  }
  if (sk("d_ultimate")){   // 母艦: 進行方向 (接線) を向いてゆっくり周回。発射時は船体が発光する
    const [sx, sy] = toScreen(mothership.x, mothership.y), size = 150 * zoom;
    ctx.save(); ctx.translate(sx, sy); ctx.rotate(mothership.ang - Math.PI / 2);
    ctx.drawImage(mothershipSpr, -size / 2, -size / 2, size, size);
    if (mothership.flash > 0){ ctx.globalCompositeOperation = "lighter"; ctx.globalAlpha = Math.min(1, mothership.flash / 0.18) * 0.8; ctx.drawImage(mothershipSpr, -size / 2, -size / 2, size, size); }
    ctx.restore();
  }
  for (const p of debrisParts){   // 消滅砲撃の破片 (回転しながら飛散し、寿命で薄れる)
    const [sx, sy] = toScreen(p.x, p.y), size = p.s * 2 * zoom;
    ctx.save(); ctx.translate(sx, sy); ctx.rotate(p.rot); ctx.globalAlpha = Math.min(1, (p.life - p.t) / 0.3);
    ctx.drawImage(shardSprs[p.spr], -size / 2, -size / 2, size, size); ctx.restore();
  }
  for (const f of funnels){   // トレイル → 本体 (進行方向を向く) → マズルフラッシュ
    for (let k = 0; k < f.trail.length; k++){
      const tp = f.trail[k], [tx, ty] = toScreen(tp.x, tp.y);
      ctx.fillStyle = `rgba(87,227,154,${0.05 + 0.05 * k})`;
      ctx.beginPath(); ctx.arc(tx, ty, 2 + k, 0, 7); ctx.fill();
    }
    const [sx, sy] = toScreen(f.x, f.y), size = 27 * zoom;
    ctx.save(); ctx.translate(sx, sy); ctx.rotate(f.face); ctx.drawImage(funnelSpr, -size / 2, -size / 2, size, size); ctx.restore();
    if (f.flash > 0){
      const nx = f.x + Math.cos(f.face) * 15, ny = f.y + Math.sin(f.face) * 15, [fx2, fy2] = toScreen(nx, ny), fs = 21 * zoom;
      ctx.save(); ctx.translate(fx2, fy2); ctx.rotate(f.face); ctx.globalCompositeOperation = "lighter";
      ctx.drawImage(flashSpr, -fs / 2, -fs / 2, fs, fs); ctx.restore();
    }
  }
  for (const o of orbitals){   // リング軌道体 (チャージで脈動が強まる) + 発射フラッシュ
    const [sx, sy] = toScreen(o.x, o.y);
    const charge = 1 - Math.max(0, o.fireT) / 2.4;
    const size = 56 * zoom * (1 + 0.05 * Math.sin(now / 200) + 0.1 * charge);
    ctx.save(); ctx.translate(sx, sy); ctx.rotate(o.ang * 0.6); ctx.drawImage(orbitalSpr, -size / 2, -size / 2, size, size); ctx.restore();
    if (o.flash > 0){
      const fs = 30 * zoom;
      ctx.save(); ctx.translate(sx, sy); ctx.globalCompositeOperation = "lighter"; ctx.globalAlpha = Math.min(1, o.flash / 0.12);
      ctx.drawImage(flashSpr, -fs / 2, -fs / 2, fs, fs); ctx.restore();
    }
  }
}

// ---------- 設置物 / 継続効果 ----------
const hist = [];      // 影分身用: 自機の位置履歴
const shadows = [{ fireT: 0 }, { fireT: 0.1 }, { fireT: 0.2 }, { fireT: 0.3 }];
const shadowCount = () => 2 + (sk("d_shadow2") ? 1 : 0) + (sk("d_shadow3") ? 1 : 0);
const wing = { fireT: 0 };
let satT = 3, ramT = 0, waveDist = 0, burnTick = 0, autoT = 0, droneT = 2;
let idleT = 0;   // 無操作の時間 (放置モードの起動待ち・自動戦闘プログラム)
const wingPos = () => ({ x: player.x - Math.sin(player.angle) * 46, y: player.y + Math.cos(player.angle) * 46 });
const shadowPos = k => hist[Math.max(0, hist.length - 1 - 34 * (k + 1))] || player;
/* 放置モード (state.autoMode。最初から使える ON/OFF トグル): 操作が無いとき、自機が主惑星のブロックを「弱い順」に壊しに行く
   - ブロックの最大HPは深さに対して指数的に増える (深さ 8% ごとに 10倍。data/planet.js) ので、弱い順 ≒ 外側の層から順。
     主惑星のチャンク (16x16 マス) を中心からの距離で「帯」に分け、ブロックが残っているいちばん外側の帯の中で
     自機に近いチャンクを選び、その中で最大HPが最も低いブロックを目標にする (惑星を外側から一皮ずつ剥いていく)
   - 帯の表は初回だけ作る。外側の帯は一度空になったら二度と見ない (peelBand は内側へ進む一方)
   - 帯の走査は 1フレーム 1.5ms の時間予算で少しずつ進める (初回だけ chunkLive の数え上げが走るため)
   - 目標の真外側 (宇宙側) に陣取って撃つ。惑星の裏側へは、惑星を突っ切らずに外周を回って向かう */
const AP_BUDGET_MS = 1.5;
const AP_DELAY = 0.4;                      // 手を離してから自動操縦に切り替わるまで (秒)
const PEEL_BANDS = Math.ceil(R / LC_S) + 2;
let peelCx = null, peelCy = null, peelOff = null;   // 帯ごとのチャンク座標 (帯 b は peelOff[b] .. peelOff[b+1]-1)
let peelBand = -1;     // いま削っている帯
let peelScan = null;   // 帯の走査の途中経過 { b, k, best, bestD2 }
let peelIdx = -1;      // 目標ブロック
let peelIdle = 0;      // 主惑星に何も残っていなかった: しばらく探さない
function buildPeel(){
  const c0 = Math.max(0, (GC - R - LC_S) >> LC_SHIFT), c1 = Math.min(LC_N - 1, (GC + R + LC_S) >> LC_SHIFT);
  const bandOf = (cx, cy) => {
    const gx = (cx << LC_SHIFT) + LC_S / 2 - GC, gy = (cy << LC_SHIFT) + LC_S / 2 - GC, d = Math.sqrt(gx * gx + gy * gy);
    return d > R + LC_S ? -1 : Math.min(PEEL_BANDS - 1, Math.floor(d / LC_S));
  };
  peelOff = new Int32Array(PEEL_BANDS + 1);
  for (let cy = c0; cy <= c1; cy++) for (let cx = c0; cx <= c1; cx++){ const b = bandOf(cx, cy); if (b >= 0) peelOff[b + 1]++; }
  for (let b = 0; b < PEEL_BANDS; b++) peelOff[b + 1] += peelOff[b];
  const fill = peelOff.slice(0, PEEL_BANDS);
  peelCx = new Uint16Array(peelOff[PEEL_BANDS]); peelCy = new Uint16Array(peelOff[PEEL_BANDS]);
  for (let cy = c0; cy <= c1; cy++) for (let cx = c0; cx <= c1; cx++){
    const b = bandOf(cx, cy);
    if (b >= 0){ const i = fill[b]++; peelCx[i] = cx; peelCy[i] = cy; }
  }
  peelBand = PEEL_BANDS - 1;
}
// 帯を外側から走査して、ブロックが残っている帯の中で自機にいちばん近いチャンクを探す (時間切れなら false で続きは次のフレーム)
function peelStep(){
  const S = peelScan, t0 = performance.now();
  let n = 0;
  while (S.b >= 0){
    const end = peelOff[S.b + 1];
    while (S.k < end){
      const i = S.k++, cx = peelCx[i], cy = peelCy[i];
      if (chunkLive(cx, cy) > 0){
        const dx = g2w((cx << LC_SHIFT) + LC_S / 2) - player.x, dy = g2w((cy << LC_SHIFT) + LC_S / 2) - player.y, d2 = dx * dx + dy * dy;
        if (d2 < S.bestD2){ S.bestD2 = d2; S.best = i; }
      }
      if ((++n & 31) === 0 && performance.now() - t0 > AP_BUDGET_MS) return false;
    }
    if (S.best >= 0) return true;
    S.b--; if (S.b >= 0) S.k = peelOff[S.b];
    peelBand = S.b;   // この帯は空だった: 二度と見ない
  }
  return true;   // 主惑星に何も残っていない
}
// チャンクの中で、最大HPがいちばん低い (弱い) ブロック
function peelPick(cx, cy){
  const gx0 = cx << LC_SHIFT, gy0 = cy << LC_SHIFT;
  let best = -1, bh = Infinity;
  for (let gy = gy0; gy < Math.min(D, gy0 + LC_S); gy++) for (let gx = gx0; gx < Math.min(D, gx0 + LC_S); gx++){
    const i = gy * D + gx;
    if (isDestroyed(i) || !blockExists(gx, gy)) continue;
    const h = blockMaxHP(gx, gy);
    if (h < bh){ bh = h; best = i; }
  }
  return best;
}
function autopilot(dt){
  idleT += dt;   // 無操作の時間 (自動戦闘プログラム f0_idle も見る)
  if (!state.autoMode || idleT < AP_DELAY) return [0, 0];
  if (!peelOff) buildPeel();
  peelIdle -= dt;
  if (peelIdx >= 0 && isDestroyed(peelIdx)) peelIdx = -1;
  if (peelIdx < 0 && !peelScan && peelIdle <= 0){
    if (peelBand < 0) peelBand = PEEL_BANDS - 1;
    peelScan = { b: peelBand, k: peelOff[peelBand], best: -1, bestD2: Infinity };
  }
  if (peelScan && peelStep()){   // 走査が終わった
    const S = peelScan;
    peelScan = null;
    peelIdx = S.best >= 0 ? peelPick(peelCx[S.best], peelCy[S.best]) : -1;
    if (S.best < 0) peelIdle = 10;   // 何も残っていない: 10秒は探し直さない
  }
  if (peelIdx < 0) return [0, 0];
  // 目標の真外側 (宇宙側) に陣取る
  const gx = peelIdx % D, gy = (peelIdx / D) | 0, ox = gx - GC, oy = gy - GC, ol = Math.hypot(ox, oy) || 1;
  const off = Math.min(atkRange() * 0.4, BS * 5);
  let tx = g2w(gx) + ox / ol * off, ty = g2w(gy) + oy / ol * off;
  // 惑星の裏側の目標へは、惑星を突っ切らずに外周を回る (角度の差が大きい間は、少し先の外周上の点へ向かう)
  const cw = g2w(GC), px = player.x - cw, py = player.y - cw, pr = Math.hypot(px, py);
  const ta = Math.atan2(oy, ox), pa = Math.atan2(py, px);
  let da = ta - pa; da -= Math.round(da / (Math.PI * 2)) * Math.PI * 2;
  const orbitR = (ol + LC_S) * BS + off;
  if (Math.abs(da) * Math.max(pr, orbitR) > BS * 30){
    const a = pa + Math.sign(da) * Math.min(Math.abs(da), 0.25), r = Math.max(orbitR, Math.min(pr, orbitR + BS * 20));
    tx = cw + Math.cos(a) * r; ty = cw + Math.sin(a) * r;
  }
  const dx = tx - player.x, dy = ty - player.y, d = Math.hypot(dx, dy);
  return d > BS ? [dx / d, dy / d] : [0, 0];
}
// 放置モードの切り替え (HUD のボタン / F キー。ui/settings.js)
function setAutoMode(on){
  state.autoMode = !!on;
  peelIdx = -1; peelScan = null; peelIdle = 0;
  save();
  if (typeof syncAutoBtn === "function") syncAutoBtn();
}

/* ---------- ワープアウト (d_auto) / 空間断裂 (d_auto2): ブーストを止めた地点の空間が弾ける ---------- */
let warpRunT = 0, warpCD = 0;
function warpOutUpdate(dt){
  if (warpCD > 0) warpCD -= dt;
  if (!sk("d_auto")){ warpRunT = 0; return; }
  if (boostOn){ warpRunT += dt; return; }
  const big = sk("d_auto2");
  if (warpRunT >= (big ? 0.5 : 1) && warpCD <= 0){
    warpCD = 3;
    bumpProc("warpout", player.x, player.y);
    blast(player.x, player.y, BS * (big ? 7 : 4), playerDamage() * (big ? 10 : 4), "120,190,255");
    addRing({ x: player.x, y: player.y, r: BS * (big ? 3 : 1.8), t: performance.now(), color: "230,245,255", dur: 260 });
  }
  warpRunT = 0;
}


/* ---------- 刻印弾 (a0_steady): 8秒ごとに近くのいちばん硬いブロックへ刻印。壊れると炸裂 (コイン ×5 は skill-early.js) ---------- */
let markIdx = -1, markT = 1, markAt = 0;
function markUpdate(dt, now){
  if (!sk("a0_steady")){ markIdx = -1; return; }
  if (markIdx >= 0 && isDestroyed(markIdx)) markIdx = -1;   // 刻印のまま炸裂せずに消えた (起こらないはずの保険)
  markT -= dt;
  if (markT > 0) return;
  markT = 8;
  let best = -1, bestHP = 0;
  for (const i of findNearestBlocks(player.x, player.y, atkRange() * 1.5, 24)){ const hp = blockMaxHP(i % D, (i / D) | 0); if (hp > bestHP){ bestHP = hp; best = i; } }
  if (best < 0){ markT = 1; return; }
  markIdx = best; markAt = now;
  const p = blockPos(best);
  addBeam({ x1: player.x, y1: player.y, x2: p.x, y2: p.y, w: 1.5, color: "rgba(255,70,70,.85)", life: 180 });
  addRing({ x: p.x, y: p.y, r: BS * 1.6, color: "255,70,70", dur: 320 });
}
function markBurst(idx, gx, gy){
  markIdx = -1;
  const x = g2w(gx), y = g2w(gy), d = blockMaxHP(gx, gy) * 0.5;
  bumpProc("mark", x, y);
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++){
    if ((dx || dy) && dx * dx + dy * dy <= 5) aftershock(liveAt(gx + dx, gy + dy), d, SHOCK_NONE);
  }
  addRing({ x, y, r: BS * 3, color: "255,70,70", dur: 420 });
  addRing({ x, y, r: BS * 1.5, color: "255,220,200", dur: 260 });
  sndBoom();
}
/* ---------- 舷側斉射 (d_cruise): 10秒ごとに左右の舷側から6発ずつ、真横へ貫通する砲弾 ---------- */
let broadT = 4;
function broadsideUpdate(dt, now){
  if (!sk("d_cruise")) return;
  broadT -= dt;
  if (broadT > 0) return;
  if (findNearestBlock(player.x, player.y, atkRange() * 1.4) < 0 && !nearestMob(player.x, player.y, atkRange() * 1.4)){ broadT = 0.5; return; }   // 撃つ相手がいない
  broadT = 10;
  bumpProc("broadside", player.x, player.y);
  const dmg = playerDamage() * 2, spd = 900 * BULLET_SPD_MUL, life = atkRange() * 1.4 / spd;
  const ca = Math.cos(player.angle), sa = Math.sin(player.angle);
  for (const side of [-1, 1]){
    const a = player.angle + side * Math.PI / 2;
    for (let k = 0; k < 6; k++){
      const off = (k - 2.5) * 7;   // 艦首から艦尾へ並んだ砲門
      const sx = player.x + ca * off + Math.cos(a) * 10, sy = player.y + sa * off + Math.sin(a) * 10;
      const aa = a + (k - 2.5) * 0.05;
      if (bullets.length < 900) bullets.push({ x: sx, y: sy, vx: Math.cos(aa) * spd, vy: Math.sin(aa) * spd, dmg, splash: 0, life, pierce: 5, lastHit: -1, color: "#57e39a", shape: "disc", sz: 4 });
    }
    addRing({ x: player.x + Math.cos(a) * 14, y: player.y + Math.sin(a) * 14, r: 26, color: "87,227,154", dur: 220 });
  }
  sndBoom();
}

// ---------- 毎フレーム ----------
function skillsUpdate(dt, fdt, bdt, now){
  markUpdate(dt, now);
  broadsideUpdate(dt, now);
  warpOutUpdate(dt);
  if (comboT > 0){ comboT -= dt; if (comboT <= 0) combo = 0; }
  heatT -= dt;
  heat = Math.max(0, Math.min(1, heat + (heatT > 0 ? dt / 10 : -dt / 3)));
  gMul = globalDmgMul();
  nearClose = sk("a_close") && findNearestBlock(player.x, player.y, sk("a_point") ? 160 : 100) >= 0;


  // --- 財宝: 利息 / 貯金箱 ---
  if (sk("c_interest")){
    interestT -= dt;
    if (interestT <= 0){ interestT = 10; const g = Math.floor(Math.min(state.coins * (sk("c_interest2") ? 0.008 : 0.003), state.lv * (sk("c_interest2") ? 200 : 100))); if (g > 0) addCoins(g); }
  }
  if (sk("c_piggy")){
    piggyT -= dt;
    if (piggyT <= 0){
      piggyT = 60;
      if (piggy >= 1){ const g = Math.floor(piggy * (sk("c_piggy2") ? 2.5 : 1.5)); piggy = 0; addCoins(g); toast(`貯金箱が満期  +${fmt(g)} コイン`, "good"); }
    }
  }

  // --- 燃焼 (腐食・放射) / 氷結 / 時限爆弾 / 隕石 ---
  burnTick -= dt;
  if (burnTick <= 0){
    burnTick = 0.25;
    const frostGone = [];
    for (const [idx, t] of frosts){ if (isDestroyed(idx)){ frosts.delete(idx); frostGen.delete(idx); } else if (t <= 0.25){ frosts.delete(idx); frostGen.delete(idx); frostGone.push(idx); } else frosts.set(idx, t - 0.25); }
    for (const [idx, t] of embers){ if (t <= 0.25 || isDestroyed(idx)) embers.delete(idx); else embers.set(idx, t - 0.25); }
    for (const [idx, t] of overloads){ if (t <= 0.25 || isDestroyed(idx)) overloads.delete(idx); else overloads.set(idx, t - 0.25); }
    if (frostGone.length && sk("b_frostbite")) rawDamage(() => { for (const idx of frostGone) if (!isDestroyed(idx)) damageBlock(idx, blockMaxHP(idx % D, (idx / D) | 0) * 0.03, 0); });   // 凍傷
    rawDamage(() => {
      for (const [idx, b] of burns){
        b.t -= 0.25;
        if (isDestroyed(idx)){ burns.delete(idx); continue; }
        if (b.t <= 0){
          burns.delete(idx);
          const isBurn = !b.k || b.k === "burn";
          if (isBurn && sk("b_ember")) embers.set(idx, 3);   // 残り火
          if (isBurn && (sk("b_burn2") || sk("b_wildfire")) && (b.g || 0) < (sk("b_wildfire") ? 5 : 3)){   // 延焼 / 山火事 (世代で打ち切り)
            const gx = idx % D, gy = (idx / D) | 0, cand = [];
            for (const [dx, dy] of (sk("b_wildfire") ? N8 : N4)){ const j = liveAt(gx + dx, gy + dy); if (j >= 0 && !burns.has(j)) cand.push(j); }
            if (cand.length){ burns.set(cand[(Math.random() * cand.length) | 0], { d: b.d, t: 3, k: "burn", g: (b.g || 0) + 1 }); bumpProc("burn"); }
          }
          continue;
        }
        let tick = b.d * 0.25;
        if (sk("b_sun") && (!b.k || b.k === "burn")) tick += blockMaxHP(idx % D, (idx / D) | 0) * 0.0025;   // 太陽の核
        if (sk("b_decay") && b.rad) tick += blockMaxHP(idx % D, (idx / D) | 0) * 0.00125;   // 崩壊
        if (sk("b_core")) tick += blockMaxHP(idx % D, (idx / D) | 0) * 0.0025;   // 原初元素炉 (奥義): 状態異常中は追加で最大HP 1%/秒
        damageBlock(idx, tick, 0);
      }
    });
  }
  for (let i = bombs.length - 1; i >= 0; i--){
    const b = bombs[i]; b.t -= dt;
    if (b.t > 0) continue;
    bombs.splice(i, 1); bombSet.delete(b.idx);
    if (isDestroyed(b.idx)) continue;
    const p = blockPos(b.idx);
    addRing({ x: p.x, y: p.y, r: BS * 2, t: now, color: "255,90,70", dur: 240 });
    rawDamage(() => damageBlock(b.idx, b.dmg, 1));
    if (b.fx) evoEvent("bomb", b.fx, p.x, p.y, b.dmg, true);   // 固有覚醒: 仕掛けた爆弾
  }
  for (let i = meteors.length - 1; i >= 0; i--){
    const m = meteors[i]; m.t -= dt;
    if (m.t > 0) continue;
    meteors.splice(i, 1);
    damageRadius(m.x, m.y, m.r, m.dmg);
    addRing({ x: m.x, y: m.y, r: m.r * 1.3, t: now, color: "255,170,80", dur: 420 });
    addBeam({ x1: m.x + 500, y1: m.y - 1400, x2: m.x, y2: m.y, t: now, w: 5, color: "#ffb060", life: 150 });
    sndBoom();
  }

  // --- 爆撃ドローン (自動発進) ---
  if (sk("d_bombdrone")){
    droneT -= dt;
    if (droneT <= 0){
      droneT = sk("d_bombdrone2") ? 2.2 : 4;
      const idx = findNearestBlock(player.x, player.y, atkRange());
      if (idx >= 0){
        const dn = sk("d_bombdrone2") ? 2 : 1, dd = playerDamage() * (sk("d_bombdrone2") ? 6.5 : 3);
        for (let i = 0; i < dn; i++){
          const a = Math.random() * Math.PI * 2;
          bullets.push({ x: player.x, y: player.y, vx: Math.cos(a) * 320 * BULLET_SPD_MUL, vy: Math.sin(a) * 320 * BULLET_SPD_MUL, dmg: dd, splash: 1, life: 5,
            homing: true, targetIdx: idx, targetMob: 0, retargetT: 0, lastHit: -1, color: "#57e39a", shape: "arrow", sz: 4 });
        }
      } else droneT = 0.5;
    }
  }
  // --- 仲間系パッシブ ---
  const w = evoW(state.weapon);   // 覚醒込み (僚機・影分身のガトリングも加速が伸びる)
  if (sk("d_wing")){
    wing.fireT -= bdt;
    if (wing.fireT <= 0){ const p = wingPos(); wing.fireT = fireDelay(w, wing, shoot(p.x, p.y, shotDamage() * (0.3 + (sk("d_wing2") ? 0.3 : 0) + (sk("d_formation") ? 0.2 : 0)) * masteryMul("d"), state.weapon, false)); }
  }
  if (sk("d_shadow")){
    hist.push({ x: player.x, y: player.y, angle: player.angle });
    if (hist.length > 150) hist.shift();
    shadows.forEach((s, k) => {
      if (k >= shadowCount()) return;
      s.fireT -= fdt;
      if (s.fireT <= 0){ const p = shadowPos(k); s.fireT = fireDelay(w, s, shoot(p.x, p.y, shotDamage() * ((sk("d_shadow3") ? 0.4 : 0.3) + (sk("d_formation") ? 0.2 : 0)) * masteryMul("d"), state.weapon, false)); }
    });
  } else hist.length = 0;
  if (sk("d_sat")){
    satT -= dt;
    if (satT <= 0){
      satT = sk("d_sat2") ? 1.5 : 3;
      let best = -1, bestHP = 0;
      for (const i of findNearestBlocks(player.x, player.y, atkRange(), 12)){ const hp = blockHP(i); if (hp > bestHP){ bestHP = hp; best = i; } }
      if (best >= 0){
        const p = blockPos(best);
        addBeam({ x1: player.x, y1: player.y - 52, x2: p.x, y2: p.y, t: now, w: 4, color: "#57e39a", life: 160 });
        damageBlock(best, playerDamage() * (sk("d_sat2") ? 15 : 8), 0);
      } else satT = 0.5;
    }
  }
  if (player.moving){
    if (sk("d_ram")){
      ramT -= dt;
      if (ramT <= 0){ ramT = sk("d_ram2") ? 0.09 : 0.15; damageRadius(player.x + Math.cos(player.angle) * 18, player.y + Math.sin(player.angle) * 18, 24, playerDamage() * (sk("d_ram2") ? 1.6 : 0.55)); }
    }
    if (sk("d_wave")){
      waveDist += playerSpeed() * dt;
      const wThr = sk("d_wave4") ? 150 : sk("d_wave2") ? 200 : 300;
      if (waveDist >= wThr){
        waveDist = 0;
        blast(player.x, player.y, sk("d_wave4") ? 220 : sk("d_wave3") ? 175 : 100,
          playerDamage() * (sk("d_wave4") ? 9 : sk("d_wave3") ? 6 : sk("d_wave2") ? 4 : 1.5), "87,227,154");
      }
    }
  }
  capstoneUpdate(dt, bdt, now);
}

// ---------- 描画 (draw() の中、弾の後・ユニットの前) ----------
function skillsDraw(now, toScreen){
  capstoneDraw(now, toScreen);
  const px = BS * zoom;
  // 爆弾 (ブロックの状態異常は render/status-fx.js の drawStatusFx でスプライト描画する)
  if (px > 4){
    for (const b of bombs){
      const [sx, sy] = toScreen(g2w(b.idx % D), g2w((b.idx / D) | 0));
      ctx.fillStyle = (now / 120 | 0) % 2 ? "#ff5a46" : "#fff";
      ctx.beginPath(); ctx.arc(sx, sy, Math.max(2, px * 0.2), 0, 7); ctx.fill();
    }
    ctx.lineWidth = 1;
  }
  // 刻印弾: 刻印されたブロックに赤い照準 (ゆっくり回る)
  if (markIdx >= 0){
    const [sx, sy] = toScreen(g2w(markIdx % D), g2w((markIdx / D) | 0)), r = Math.max(7, px * 0.9), a0 = (now - markAt) / 600;
    ctx.strokeStyle = "rgba(255,70,70,.95)"; ctx.lineWidth = 1.8;
    ctx.beginPath(); ctx.arc(sx, sy, r, 0, 7); ctx.stroke();
    for (let k = 0; k < 4; k++){
      const a = a0 + k * Math.PI / 2, c = Math.cos(a), s = Math.sin(a);
      ctx.beginPath(); ctx.moveTo(sx + c * r * 0.55, sy + s * r * 0.55); ctx.lineTo(sx + c * r * 1.45, sy + s * r * 1.45); ctx.stroke();
    }
    ctx.lineWidth = 1;
  }
  // 隕石の着弾予告
  for (const m of meteors){
    const [sx, sy] = toScreen(m.x, m.y);
    ctx.strokeStyle = "rgba(255,170,80,.8)"; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(sx, sy, m.r * zoom, 0, 7); ctx.stroke();
    ctx.beginPath(); ctx.arc(sx, sy, m.r * zoom * Math.min(1, m.t / 0.6), 0, 7); ctx.stroke(); ctx.lineWidth = 1;
  }
  // 僚機 / 影分身 (自機と同じ矢じり型)
  const tri = (p, a, color) => {
    const [sx, sy] = toScreen(p.x, p.y);
    ctx.save(); ctx.translate(sx, sy); ctx.rotate(a); ctx.strokeStyle = color; ctx.beginPath();
    ctx.moveTo(10, 0); ctx.lineTo(-7, -6.5); ctx.lineTo(-4, 0); ctx.lineTo(-7, 6.5); ctx.closePath(); ctx.stroke();
    ctx.restore();
  };
  if (sk("d_wing")) tri(wingPos(), player.angle, "#57e39a");
  if (sk("d_shadow")) for (let k = 0; k < shadowCount(); k++){ const p = shadowPos(k); tri(p, p.angle === undefined ? player.angle : p.angle, "rgba(255,255,255,.5)"); }
  // 守護衛星
  if (sk("d_sat")){
    const [sx, sy] = toScreen(player.x, player.y - 52);
    ctx.strokeStyle = "#57e39a"; ctx.beginPath();
    ctx.moveTo(sx, sy - 7); ctx.lineTo(sx + 6, sy); ctx.lineTo(sx, sy + 7); ctx.lineTo(sx - 6, sy); ctx.closePath(); ctx.stroke();
  }
}
