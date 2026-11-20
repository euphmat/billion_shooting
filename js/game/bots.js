"use strict";
/* =========================================================
   game/bots.js - 攻撃ボット / 回収ボットの生成と、作戦モードの目標選び
   ========================================================= */

function syncBots(){
  while (bots.length < botCount()){
    const a = Math.random() * Math.PI * 2;
    bots.push({ x: player.x + Math.cos(a)*80, y: player.y + Math.sin(a)*80, angle:0, fireT:Math.random()*.3, tx:null, ty:null, retargetT:0 });
  }
  bots.length = botCount();
}
syncBots();

const coinBots = [];  // {x,y,angle,tx,ty,retargetT}
function syncCoinBots(){
  while (coinBots.length < coinBotCount()){
    const a = Math.random() * Math.PI * 2;
    coinBots.push({ x: player.x + Math.cos(a)*60, y: player.y + Math.sin(a)*60, angle:0, tx:null, ty:null, target:null, retargetT:Math.random()*.2 });
  }
  coinBots.length = coinBotCount();
}
syncCoinBots();

// ---------- ボットの作戦モード用ヘルパー ----------
// 最も近い天体 (本星/衛星/小惑星) の表面付近の点。独立モードで宇宙にいるときの帰還先
function nearestBodySurface(x, y){
  let best = null, bd = Infinity;
  const consider = (cx, cy, rB) => {
    const dx = x - cx, dy = y - cy, d = Math.hypot(dx, dy) || 1, edge = Math.abs(d - rB * BS);
    if (edge < bd){ bd = edge; const rr = Math.max(0, (rB - 2) * BS); best = { x: cx + dx / d * Math.min(d, rr), y: cy + dy / d * Math.min(d, rr) }; }
  };
  consider(0, 0, R);
  for (const S of SATS) consider((S.cx - GC) * BS, (S.cy - GC) * BS, S.r);
  return best;
}
// 天体にブロックが残っているか (step 3 の粗い走査 → 見つからなければ step 1 で確定)
function bodyHasBlocks(si, full){
  const S = SATS[si]; if (!S) return false;
  const step = full ? 1 : 3, r2 = S.r * S.r;
  for (let gy = S.cy - S.r; gy <= S.cy + S.r; gy += step)
    for (let gx = S.cx - S.r; gx <= S.cx + S.r; gx += step){
      const dx = gx - S.cx, dy = gy - S.cy;
      if (dx * dx + dy * dy > r2) continue;
      if (blockExists(gx, gy) && !isDestroyed(gy * D + gx)) return true;
    }
  return false;
}
// 探索モード: 担当する小惑星を選ぶ (他のボットと被らない星を優先)
function pickExploreSat(self){
  const minis = [];
  for (let si = 10; si < SATS.length; si++) if (SATS[si].mini && bodyHasBlocks(si, false)) minis.push(si);
  if (!minis.length) return -1;
  const taken = new Set();
  for (const o of bots) if (o !== self && o.exploreSat >= 10) taken.add(o.exploreSat);
  const free = minis.filter(si => !taken.has(si));
  const pool = free.length ? free : minis;
  return pool[(Math.random() * pool.length) | 0];
}
// 探索モードの目標決め: 担当の小惑星へ向かい、その星のブロックだけを掘る。掘り尽くしたら次の星へ
function updateExploreTarget(b){
  if (b.exploreSat === undefined || b.exploreSat < 10 || !SATS[b.exploreSat]) b.exploreSat = pickExploreSat(b);
  if (b.exploreSat < 0){   // 小惑星は全部制覇済み → 独立モードと同じ動き
    const idx = findNearestBlock(b.x, b.y, 1400);
    if (idx >= 0){ b.tx = g2w(idx % D); b.ty = g2w(((idx / D) | 0)); }
    else { const sp = nearestBodySurface(b.x, b.y); if (sp){ b.tx = sp.x; b.ty = sp.y; } }
    return;
  }
  const S = SATS[b.exploreSat];
  b.scanT = (b.scanT || 0) - 0.4;   // この関数は再照準のたび (0.4秒間隔) に呼ばれる
  if (b.scanT <= 0){
    b.scanT = 2.5;
    if (!bodyHasBlocks(b.exploreSat, false) && !bodyHasBlocks(b.exploreSat, true)){
      toast(`攻撃ボットが小惑星「${S.name}」を完全破壊した！`);
      b.exploreSat = pickExploreSat(b);
      return;
    }
  }
  const idx = findNearestBlock(b.x, b.y, 2800);
  if (idx >= 0 && bodyAt(idx % D, ((idx / D) | 0)) === b.exploreSat + 1){ b.tx = g2w(idx % D); b.ty = g2w(((idx / D) | 0)); }
  else { b.tx = (S.cx - GC) * BS + BS / 2; b.ty = (S.cy - GC) * BS + BS / 2; }   // 担当の星の中心へ (近づけばその星のブロックが最寄りになる)
}
