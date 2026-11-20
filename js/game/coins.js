"use strict";
/* =========================================================
   game/coins.js - コインの合体と引き合い (エンティティ数の削減)
   ========================================================= */

// ---------- コインの合体 (マージ) ----------
// 1箇所に大量に落ちたコイン同士がひっついて大きな1枚になる。目的はエンティティ数と
// 描画コストの削減で、合体は経済イベントではない: 合計額は厳密に保存され、構成枚数は
// survivor の n に積まれる (取得時の発動抽選は gainCoin が n 回ぶん回すので期待値は不変)。
// 宝箱コイン (ミダス王) と複製コイン (こぼれ) は性質が違うので合体対象にしない。
const COIN_MERGE_R = 36;              // 合体が起きる中心間距離 (約1.5ブロック)
const COIN_MERGE_R2 = COIN_MERGE_R * COIN_MERGE_R;
const COIN_MERGE_MIN_AGE = 0.3;       // 生まれた直後は合体しない (飛散の途中を固めない)
const COIN_MERGE_MAX_SPD2 = 38 * 38;  // これより速く動いているコインは「静止」扱いにしない (吸引・輸送中は合体しない)
const COIN_MERGE_MAX_PER_PASS = 160;  // 1パスの合体上限 (スパイク防止)
let coinMergeT = 0.25;                // パスの周期タイマ (frame から駆動)
function coinMergeable(c){
  return !c.chest && !c.dup && !c.gone && (c.age || 0) >= COIN_MERGE_MIN_AGE
    && c.vx * c.vx + c.vy * c.vy < COIN_MERGE_MAX_SPD2;
}
// a が b を吸収する。位置・速度は額面で重み付けした重心に寄せ、age は古い方を残す
// (回収ボットの利息判定 c.age > 2 が目減りしないように)
function absorbCoin(a, b){
  const tot = a.value + b.value;
  if (tot > 0){
    a.x = (a.x * a.value + b.x * b.value) / tot;
    a.y = (a.y * a.value + b.y * b.value) / tot;
    a.vx = (a.vx * a.value + b.vx * b.value) / tot;
    a.vy = (a.vy * a.value + b.vy * b.value) / tot;
  }
  a.value = tot;
  a.n = (a.n || 1) + (b.n || 1);
  if ((b.age || 0) > (a.age || 0)) a.age = b.age;
  b.gone = true;
}
// 0.25秒に1回、空間グリッド (セル = 合体半径) で近傍だけを見る。全数総当たりはしない。
// 「近いコイン同士の連なり」(連結成分) を BFS で集めて塊ごとに1枚へ畳むので、
// 直線状に連なったコインでも端から端まで連鎖して合体する。
// survivor は塊の最大額面 (回収ボットの目標になっている大きなコインが消えにくい)。
function mergeCoinsPass(){
  if (coinsArr.length < 2) return 0;
  const grid = new Map();
  for (const c of coinsArr){
    if (!coinMergeable(c)) continue;
    const k = coinCellKey(Math.floor(c.x / COIN_MERGE_R), Math.floor(c.y / COIN_MERGE_R));
    let a = grid.get(k); if (!a){ a = []; grid.set(k, a); } a.push(c);
  }
  let merges = 0;
  const seen = new Set(), consumed = [];
  for (const c of coinsArr){
    if (merges >= COIN_MERGE_MAX_PER_PASS) break;
    if (c.gone || seen.has(c) || !coinMergeable(c)) continue;
    const comp = [c]; seen.add(c);
    for (let qi = 0; qi < comp.length; qi++){
      const m = comp[qi];
      const gx = Math.floor(m.x / COIN_MERGE_R), gy = Math.floor(m.y / COIN_MERGE_R);
      for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++){
        const a = grid.get(coinCellKey(gx + ox, gy + oy)); if (!a) continue;
        for (let bi = a.length - 1; bi >= 0; bi--){
          const o = a[bi];
          if (seen.has(o) || o.gone) continue;
          const dx = o.x - m.x, dy = o.y - m.y;
          if (dx * dx + dy * dy < COIN_MERGE_R2){
            seen.add(o); comp.push(o);
            a[bi] = a[a.length - 1]; a.pop();   // 塊に入れたコインはバケットから抜く (密集時の走査が二乗に膨らまない)
          }
        }
      }
    }
    if (comp.length < 2) continue;
    let s = comp[0];
    for (const o of comp) if (o.value > s.value) s = o;
    const tierBefore = coinTierOf(s.value);
    for (const o of comp){
      if (o === s) continue;
      if (merges >= COIN_MERGE_MAX_PER_PASS) break;   // 上限に達したら残りは次のパスで
      absorbCoin(s, o); consumed.push(o); merges++;
    }
    // 合体で段階が上がった瞬間だけ、新しい段階色のリングを広げて「色が変わった」ことを知らせる
    const tierAfter = coinTierOf(s.value);
    if (tierAfter > tierBefore){
      const T = COIN_TIERS[tierAfter];
      addRing({ x: s.x, y: s.y, r: Math.round(T.r * 2.4), t: performance.now(), color: hexRGB(T.fill), dur: 380 });
    }
  }
  if (consumed.length){
    const dead = new Set(consumed);
    for (let i = coinsArr.length - 1; i >= 0; i--) if (dead.has(coinsArr[i])) removeCoinAt(i);
  }
  return merges;
}

// ---------- コイン同士の引き合い ----------
// 合体半径 (36px) より広く散らばった山は、合体パスだけでは永遠に残ってしまう。
// 静止したコイン同士に弱いバネ状の引き合いを付け、近傍の重心へゆっくり寄せて
// 合体半径まで凝集させる。力は回収系 (マグネット 1400 / ボット真空 3200) より
// 十分弱く、吸引を受けているコインにはフレーム側で適用しない (回収が常に勝つ)。
// コイン物理にブロック衝突は無い (吸引でもブロックを抜ける) ので、引き合いも
// 遮蔽は見ない。方向の計算は 0.5 秒周期で空間グリッドを使い、
// フレーム側は保存した加速度ベクトル (pax / pay) を適用するだけにする。
const COIN_PULL_R = 96;                    // 引き合いが届く中心間距離 (約4ブロック)
const COIN_PULL_R2 = COIN_PULL_R * COIN_PULL_R;
const COIN_PULL_K = 6.5;                   // バネ定数: 重心までの距離 1px あたりの加速度 (px/s^2)。終端速度は距離×約1.24 px/s
const COIN_PULL_MAX_ACCEL = 480;           // 加速度の上限 (px/s^2)。引き合い半径の縁 (96px) ではバネ値 624 がここで頭打ちになる
const COIN_PULL_MAX_SPD = 110;             // 引き合いが付ける速度の上限 (px/s)
const COIN_PULL_MAX_SPD2 = COIN_PULL_MAX_SPD * COIN_PULL_MAX_SPD;
const COIN_PULL_SRC_MAX_SPD2 = 150 * 150;  // これより速いコインは引き合い対象にしない (吸引・輸送の途中)
const COIN_PULL_MAX_NB = 24;               // 重心計算に使う近傍数の上限 (密集時の走査が二乗に膨らまないように)
function coinPullable(c){
  return !c.chest && !c.dup && !c.gone && (c.age || 0) >= COIN_MERGE_MIN_AGE
    && c.vx * c.vx + c.vy * c.vy < COIN_PULL_SRC_MAX_SPD2;
}
// 0.5 秒に1回 (合体パスより緩い周期で十分。方向の鮮度より軽さを優先)、引き合い対象の
// コインごとに「近傍 (96px) の額面重み付き重心」を求め、そこへ向かうバネ加速度を
// c.pax / c.pay に保存する。近傍が無いコインはベクトルを消して完全静止させる。
// 重心に近いほど力は弱まる (距離比例) ので、中心付近では減速して合体条件
// (速度 <38px/s) に落ち着き、振動やジッターは起きない。
let coinPullT = 0.5;   // パスの周期タイマ (frame から駆動)
function coinPullPass(){
  const grid = new Map(), elig = [];
  for (const c of coinsArr){
    if (!coinPullable(c)){ if (c.pax){ c.pax = 0; c.pay = 0; } continue; }
    elig.push(c);
    const k = coinCellKey(Math.floor(c.x / COIN_PULL_R), Math.floor(c.y / COIN_PULL_R));
    let a = grid.get(k); if (!a){ a = []; grid.set(k, a); } a.push(c);
  }
  for (const c of elig){
    let sx = 0, sy = 0, sv = 0, nb = 0;
    // 隣接セルのキーは基準キーへの加算で得る (coinCellKey(gx+ox, gy+oy) = base + ox*8192 + oy)
    const base = coinCellKey(Math.floor(c.x / COIN_PULL_R), Math.floor(c.y / COIN_PULL_R));
    outer:
    for (let ox = -8192; ox <= 8192; ox += 8192) for (let oy = -1; oy <= 1; oy++){
      const a = grid.get(base + ox + oy); if (!a) continue;
      for (const o of a){
        if (o === c) continue;
        const dx = o.x - c.x, dy = o.y - c.y;
        if (dx * dx + dy * dy < COIN_PULL_R2){
          sx += o.x * o.value; sy += o.y * o.value; sv += o.value;
          if (++nb >= COIN_PULL_MAX_NB) break outer;
        }
      }
    }
    if (!nb || sv <= 0){ c.pax = 0; c.pay = 0; continue; }
    const dx = sx / sv - c.x, dy = sy / sv - c.y, d2 = dx * dx + dy * dy;
    if (d2 < 4){ c.pax = 0; c.pay = 0; continue; }   // ほぼ重心上: 力を消してジッターを防ぐ
    const d = Math.sqrt(d2), acc = Math.min(COIN_PULL_K * d, COIN_PULL_MAX_ACCEL);
    c.pax = dx / d * acc; c.pay = dy / d * acc;
  }
}
