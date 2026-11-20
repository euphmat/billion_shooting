"use strict";
/* =========================================================
   game/coinbots.js - 回収ボットの移動・待ち伏せ・目標選び
   ========================================================= */

// ---------- 回収系ボットの移動 ----------
// 目標へ直進する。1フレームで行き過ぎないよう、残り距離で歩幅を打ち切る
function steerBot(b, tx, ty, spd, dt, stopR){
  const dx = tx - b.x, dy = ty - b.y, d = Math.hypot(dx, dy);
  if (d <= stopR || d < 0.5) return;
  const s = Math.min(d - stopR, spd * dt);
  b.x += dx / d * s; b.y += dy / d * s;
  b.angle = Math.atan2(dy, dx);
}
// 待機中: コインの湧きどころへ先回りする。ヒートマップが空のときだけ、
// 自機から大きく離れていたら自機の周りへ戻る (近くにいるならその場で待つ)
function idleMove(b, spd, dt, i, n){
  const solo = state.cbMode === "solo";
  if (b.idle){
    const h = b.idle, a = i * 2.39996;   // 同じ場所に来ても重ならないよう黄金角でずらす (独立モードは広く)
    const rad = solo ? 260 : 40;
    steerBot(b, h.sx / h.h + Math.cos(a) * rad, h.sy / h.h + Math.sin(a) * rad, spd, dt, 8);
    return;
  }
  const dx = player.x - b.x, dy = player.y - b.y;
  if (solo){
    // 独立モード: 仕事が無いときは自機の周りの持ち場 (半径1500 の輪、自分の角度スロット) へ必ず散る。
    // ゆっくり回転しながら待つので、どの方向にコインが湧いても近くに1台いる
    const a = i * (Math.PI * 2 / Math.max(1, n)) + nowMs / 60000;
    steerBot(b, player.x + Math.cos(a) * 1500, player.y + Math.sin(a) * 1500, spd, dt, 24);
  }
  else if (dx * dx + dy * dy > 900 * 900){
    const a = i * (Math.PI * 2 / Math.max(1, n));
    steerBot(b, player.x + Math.cos(a) * 220, player.y + Math.sin(a) * 220, spd * 0.6, dt, 20);
  }
}

// ---------- コイン発生ヒートマップ ----------
// ブロックが壊れてコインが出た場所を、時間で減衰する重み付きで覚える。
// セルごとに重み h と重み付き座標和 (sx, sy) を持ち、重心 = (sx/h, sy/h) が待ち伏せ地点になる
const HEAT_CELL = 240, HEAT_TAU = 8;   // セル 240px (10ブロック)・減衰の時定数 8秒
const coinHeat = new Map();
let heatPruneT = 2;
const heatDecay = e => Math.exp((e.t - nowMs / 1000) / HEAT_TAU);
function noteCoinSpawn(x, y, v){
  const gx = Math.floor(x / HEAT_CELL), gy = Math.floor(y / HEAT_CELL), k = coinCellKey(gx, gy);
  const t = nowMs / 1000;
  let e = coinHeat.get(k);
  if (!e){ e = { h: 0, sx: 0, sy: 0, t }; coinHeat.set(k, e); }
  const f = Math.exp((e.t - t) / HEAT_TAU);
  e.h = e.h * f + v; e.sx = e.sx * f + x * v; e.sy = e.sy * f + y * v; e.t = t;
}
// 40秒 (5τ) 以上コインが出ていないセルは忘れる
function pruneCoinHeat(){
  const t = nowMs / 1000;
  for (const [k, e] of coinHeat) if (t - e.t > HEAT_TAU * 5) coinHeat.delete(k);
}
// 待ち伏せ先 = 最近の発生量 / 到着時間 が最大のセル。他の待機ボットが居るセルは割り引く
function pickIdleSpot(bot, speed){
  let best = null, bestS = 0;
  for (const e of coinHeat.values()){
    const w = e.h * heatDecay(e);
    if (w <= 0) continue;
    const dx = e.sx / e.h - bot.x, dy = e.sy / e.h - bot.y;
    let n = 0;
    for (const o of coinBots)    if (o !== bot && o.idle === e) n++;
    const s = w / (Math.hypot(dx, dy) / speed + 2) / (1 + (state.cbMode === "solo" ? 6 : 2) * n);
    if (s > bestS){ bestS = s; best = e; }
  }
  return best;
}

// ---------- coin bot targeting ----------
// 各ボットが狙っているコインを登録し、同じコイン・同じ場所へ複数台が向かわないようにする
// 目標コイン周辺の山の重心 (価値で重み付け)。端のコインを追って往復せず、山の中心で一括回収する
function coinClusterAim(claims, cn, cr){
  const gx = (cn.x / 160) | 0, gy = (cn.y / 160) | 0, cr2 = cr * cr;
  let n = 0, sw = 0, sx = 0, sy = 0;
  for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++){
    const a = claims.grid.get(coinCellKey(gx + ox, gy + oy)); if (!a) continue;
    for (const c of a){
      const dx = c.x - cn.x, dy = c.y - cn.y;
      if (dx * dx + dy * dy > cr2) continue;
      n++; sw += c.value; sx += c.x * c.value; sy += c.y * c.value;
    }
  }
  if (n < 3 || sw <= 0) return null;
  const x = sx / sw, y = sy / sw, dx = x - cn.x, dy = y - cn.y;
  return dx * dx + dy * dy > 40 * 40 ? [x, y] : null;
}

function buildCoinClaims(){
  const m = new Map();
  for (const b of coinBots) if (b.target) m.set(b.target, b);
  // 密集度用の空間グリッド (セル 160px)。キーは文字列ではなく数値 (毎回の文字列生成を避ける)
  const grid = new Map();
  for (const cn of coinsArr){
    const k = coinCellKey((cn.x / 160) | 0, (cn.y / 160) | 0);
    let a = grid.get(k); if (!a){ a = []; grid.set(k, a); } a.push(cn);
  }
  return { owner: m, grid, nb: new Map() };
}
const coinCellKey = (gx, gy) => (gx + 4096) * 8192 + (gy + 4096);
// 周囲 3x3 セルの枚数と合計額 (セルごとに1回だけ数える)。合計額は周辺価値の上限にもなる
function coinNeighborhood(claims, cn){
  const gx = (cn.x / 160) | 0, gy = (cn.y / 160) | 0, key = coinCellKey(gx, gy);
  let nb = claims.nb.get(key);
  if (!nb){
    nb = { n: 0, sum: 0 };
    for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++){
      const a = claims.grid.get(coinCellKey(gx + ox, gy + oy)); if (!a) continue;
      nb.n += a.length; for (const o of a) nb.sum += o.value;
    }
    claims.nb.set(key, nb);
  }
  return nb;
}
function coinClusterValue(claims, cn, r){
  const gx = (cn.x / 160) | 0, gy = (cn.y / 160) | 0, r2 = r * r, nb = coinNeighborhood(claims, cn);
  if (nb.n > 48) return nb.sum;   // 密集地帯は 3x3 セルの合計で近似 (コイン同士の総当たりをしない)
  let v = 0;
  for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++){
    const a = claims.grid.get(coinCellKey(gx + ox, gy + oy)); if (!a) continue;
    for (const o of a){ const dx = o.x - cn.x, dy = o.y - cn.y; if (dx*dx + dy*dy < r2) v += o.value; }
  }
  return v;
}
function pickCoinTarget(bot, claims, speed, vacuum){
  const prev = bot.target;
  if (prev) claims.owner.delete(prev);
  const solo = state.cbMode === "solo";
  const mr2 = magnetRange() ** 2, sepR2 = (solo ? 1000 : Math.max(140, vacuum * 1.2)) ** 2, cr = Math.max(60, vacuum);
  // 他ボットの目標地点を数値の配列にしておく (コインごとに Map を回さない)
  // 独立モードでは僚機の現在位置も割り引き対象に入れる: 誰かが働いている場所は「担当済み」
  const others = [], theirTargets = [];
  for (const [t, o] of claims.owner) if (o !== bot){ others.push(t.x, t.y); theirTargets.push(t.x, t.y); }
  if (solo) for (const o of coinBots) if (o !== bot) others.push(o.x, o.y);
  const cap2 = solo ? 400e6 : 25e6;   // 独立モードは 20000 まで (忘れられた山まで自分から行く)
  // 1つの山 (480px 圏) に向かう台数の上限。独立モードは 2 台まで:
  // 余ったボットは別の山や持ち場に回り、1箇所に固まらない。自分の今の目標は上限の対象外
  const scan = crewCap => {
    let best = null, bestS = -Infinity;
    for (const cn of coinsArr){
      const pdx = cn.x - player.x, pdy = cn.y - player.y;
      if (pdx*pdx + pdy*pdy < mr2) continue;                   // 自機の磁石圏内は放っておいても回収される
      const dx = cn.x - bot.x, dy = cn.y - bot.y, dd = dx*dx + dy*dy;
      if (dd > cap2) continue;
      const ow = claims.owner.get(cn);
      if (ow && ow !== bot) continue;                          // 他ボットが狙っているコイン
      if (crewCap < Infinity && cn !== prev){
        let crew = 0;
        for (let k = 0; k < theirTargets.length; k += 2){
          const ex = theirTargets[k] - cn.x, ey = theirTargets[k + 1] - cn.y;
          if (ex*ex + ey*ey < 480 * 480) crew++;
        }
        if (crew >= crewCap) continue;                         // この山 (480px 圏) はもう満員
      }
      // スコア = 周辺のコイン価値 / 到着時間 (+目標を維持するボーナスでブレ防止)
      const t = Math.sqrt(dd) / speed + 0.35, keep = cn === prev ? 1.3 : 1;
      if (coinNeighborhood(claims, cn).sum / t * keep <= bestS) continue;
      // 他ボットの目標・位置の近くは割り引く (吸引エリアの重なりを避ける)
      let crowd = 0;
      for (let k = 0; k < others.length; k += 2){
        const ex = others[k] - cn.x, ey = others[k + 1] - cn.y;
        if (ex*ex + ey*ey < sepR2) crowd++;
      }
      const s = coinClusterValue(claims, cn, cr) / t * keep / (1 + (solo ? 3 : 2.5) * crowd);
      if (s > bestS){ bestS = s; best = cn; }
    }
    return best;
  };
  let best = scan(solo ? 2 : Infinity);
  // 上限なしの再走査は「場のコインが大量に滞留しているとき」だけ (手が足りない現場には合流する)
  if (!best && solo && coinsArr.length > coinBots.length * 12) best = scan(Infinity);
  if (best) claims.owner.set(best, bot);
  return best;
}
