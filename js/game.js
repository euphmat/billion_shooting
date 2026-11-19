"use strict";
/* =========================================================
   game.js - 本体: 移動 / 射撃 / ボット / コイン / 描画 / ループ
   ========================================================= */

// ---------- entities ----------
const SW = (window.SAVED && SAVED.world) || null;   // セーブされた世界の状態 (store.js が起動時に読む)
const player = { x: SW && isFinite(SW.px) ? SW.px : (R + 4) * BS, y: SW && isFinite(SW.py) ? SW.py : 0, vx:0, vy:0, angle:-Math.PI/2, fireT:0 };
const keys = {};
// スマホのバーチャルスティック (mobile.js が書き込む)。mag は 0〜1 のアナログ量
const touchAxis = { x:0, y:0, mag:0, on:false };
/* ---------- 超高速移動 (ブースト): PC = スペース長押し / スマホ = トグルボタン ----------
   倍率の根拠: 天体間の表面距離は最寄りでも約12,000px・典型約27,000px (実測)。
   通常速度 270 の ×6 (1,620) では最寄りでも 7 秒超かかるため、「数秒で隣の天体圏」を
   満たす ×10 (2,700 → 最寄り約 4.4 秒 / 典型約 10 秒) を採用。手動入力の間だけ効き、
   オートパイロット (放置移動) には効かない。 */
const BOOST_MUL = 10;
let boostKey = false;        // スペース押下中 (PC)
let boostTouchOn = false;    // スマホのトグル (mobile.js が切り替える。セッション内のみ保持)
let boostOn = false;         // このフレーム実際にブースト中か (描画とボットの追いつきが参照)
const boostGhosts = [];      // 残像 {x, y, a, t} (最大14)
const boostParts = [];       // 噴射パーティクル {x, y, vx, vy, t, life} (最大90)
let boostGhostT = 0, boostPartT = 0;
// 噴射の光: 事前レンダリング済みスプライト (奥義と同じ流儀で毎フレーム描き直さない)
const boostFlameSpr = (() => {
  const c = document.createElement("canvas"); c.width = c.height = 32;
  const g = c.getContext("2d");
  const rg = g.createRadialGradient(16, 16, 0, 16, 16, 15);
  rg.addColorStop(0, "rgba(255,255,255,.95)"); rg.addColorStop(0.35, "rgba(125,249,255,.75)"); rg.addColorStop(1, "rgba(125,249,255,0)");
  g.fillStyle = rg; g.beginPath(); g.arc(16, 16, 15, 0, 7); g.fill();
  return c;
})();
// スペースの押下/解放をブーストに結ぶ。入力欄にフォーカスがある時は文字入力を優先し、
// ゲーム側では扱わない (マップ検索の M キーと同じ流儀)。解放は常に対象外でも止める (押しっぱなしの取り残し防止)
function boostSpaceEvent(e, down){
  if (!e || e.code !== "Space") return;
  if (!down){ boostKey = false; return; }
  const tag = e.target && e.target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
  if (e.preventDefault) e.preventDefault();   // ページスクロールと、フォーカス中ボタンのスペース再押下を止める
  boostKey = true;
}
const bullets = [];   // {x,y,vx,vy,idx,dmg,splash,life}
const coinsArr = [];  // {x,y,vx,vy,value}
const flashes = new Map(); // idx -> timestamp
const bots = [];      // {x,y,angle,fireT,tx,ty,retargetT}
const beams = [];     // laser / beam visuals {x1,y1,x2,y2,t,w}
const rings = [];     // aura visuals {x,y,r,t}
const bursts = [];    // 破壊バースト {x,y,c,c2,style,t,seed}
function burstAt(x, y, fx, mat){
  if (bursts.length > 140) bursts.shift();
  bursts.push({ x, y, c: fx ? fx.accent : (mat ? mat.color : "#ffffff"), c2: fx && fx.c2 ? fx.c2 : "#ffffff", style: fx && fx.burst ? fx.burst : "shard", t: performance.now(), seed: Math.random() * 10 });
}
const labels = [];    // 浮かぶ文字 (+1 鉄鉱石 など) {x,y,text,color,chip,w,fs,t,rare}
const dmgLabels = []; // ダメージ数値 {x,y,text,color,fs,t} (プールで使い回す)
const dmgPool = [];
const dmgAcc = new Map();   // idx -> {x,y,total,crit,max} 命中ごとに貯めて 0.15秒ごとにまとめて表示 (大量ヒット対策)
const dmgEntryPool = [];
const MAX_BEAMS = 300, MAX_RINGS = 120, MAX_LABELS = 24;   // 演出の上限 (超えたら古いものから消す)
const MAX_DMG_LABELS = 42, DMG_LABEL_TTL = 650;   // ダメージ数値の上限と表示時間(ms)
let dmgCritFlag = false;   // いま処理中の命中がクリティカルか (弾の命中経路が立てる)
let dmgVoidFlag = false;   // 虚無の単眼のクリティカルか (紫の特大ダメージ数字 + バースト用)
const MAT_LABEL_FONT = fs => `700 ${fs}px "Hiragino Kaku Gothic ProN","Yu Gothic",system-ui,sans-serif`;
const DMG_FONT = fs => `800 ${fs}px ui-monospace,"SF Mono",Menlo,Consolas,monospace`;
const DMG_GRID_X = [0, -1, 1, 0, -1, 1, 0, -1], DMG_GRID_Y = [0, 1, 1, 2, 3, 3, 4, 5];   // ダメージ同士が重ならないための配置格子 (列, 行)
// 素材色が暗すぎると黒背景で読めないので、文字用に白へ寄せて明るくする (作成時に1回だけ計算)
function labelTextColor(m){
  const lum = 0.2126 * m.r + 0.7152 * m.g + 0.0722 * m.b;
  if (lum >= 150) return m.color;
  const k = Math.min(0.62, (150 - lum) / 255 + 0.25);
  const c = v => Math.round(v + (255 - v) * k);
  return `rgb(${c(m.r)},${c(m.g)},${c(m.b)})`;
}
const MAX_COINS = 1500;   // 場に出すコインの上限。超えた分は既存のコインに額を上乗せする (合計額は変わらない)
let nowMs = performance.now();   // フレーム開始時刻 (命中のたびに performance.now() を呼ばない)
// コインを配列から外す。順番は保たず、末尾と入れ替えて O(1) で消す (逆順ループの中で使う前提)
function removeCoinAt(j){
  coinsArr[j].gone = true;
  const tail = coinsArr.pop();
  if (j < coinsArr.length) coinsArr[j] = tail;
}

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
      rings.push({ x: s.x, y: s.y, r: Math.round(T.r * 2.4), t: performance.now(), color: hexRGB(T.fill), dur: 380 });
    }
  }
  if (consumed.length){
    const dead = new Set(consumed);
    for (let i = coinsArr.length - 1; i >= 0; i--) if (dead.has(coinsArr[i])) removeCoinAt(i);
  }
  return merges;
}
// HUD (DOM) の更新は重いので、コインを拾うたびではなく、まとめて最大 10回/秒 にする
let hudDirty = false, hudT = 0;

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

const PLANET_CX = BS / 2, PLANET_CY = BS / 2;      // 惑星中心のワールド座標




// ---------- 黄金ブロック (黄金の手 / 錬金術スキルで変化) ----------
const goldSet = new Set();   // 黄金化されたブロックの idx
const GOLD_MUL = 4;          // 黄金ブロックのコイン倍率


// --- 演出 --- (画面シェイクは 2026-11-19 Tomomi 指示で全廃止)
let curCoinMul = 1;     // いま処理中の攻撃のコイン倍率 (黄金の弾丸など)
let novaLeft = 0;   // いま処理中の攻撃の誘爆残り回数
let curFx = null;       // いま処理中の攻撃の装備 (処刑 / 燃焼 / 時限爆弾などの命中時効果)
let curCarry = false;   // いま処理中の攻撃が「余剰ダメージを奥へ引き継ぐ」弾・照射か
function toast(text){
  const el = $("toast"); el.textContent = text;
  el.classList.remove("show"); void el.offsetWidth; el.classList.add("show");
}

// ---------- ダンジョン固有効果: 入退室の検知と HUD バナー ----------
let curBodyIdx = -2;   // 前回判定した天体 (bodyAt の返り値)。-2 は未判定
let ftSilent = false;   // ファストトラベル直後はバナー側のトーストを抑える (移動トーストと重ねない)
const dfxEl = { box: $("dungeonFx"), name: $("dfxName"), desc: $("dfxDesc"), body: $("dfxBody") };
function updateDungeonBanner(){
  const b = bodyAt(w2g(player.x), w2g(player.y));
  if (b === curBodyIdx) return;
  const prevFx = curBodyIdx > 0 ? SATS[curBodyIdx - 1].fx : null;
  curBodyIdx = b;
  const S = b > 0 ? SATS[b - 1] : null, fx = S ? S.fx : null;
  if (fx){
    const si = b - 1;
    if (!state.visitedBodies.includes(si)){ state.visitedBodies.push(si); save(); }   // 訪問記録 (ファストトラベル用)
    dfxEl.name.textContent = fx.name;
    dfxEl.desc.textContent = fx.desc;
    dfxEl.body.textContent = S.name;
    dfxEl.box.classList.add("show");
    if (!ftSilent) toast(`「${S.name}」 — ${fx.name}`); ftSilent = false;
  } else {
    dfxEl.box.classList.remove("show");
    if (prevFx) toast("ダンジョンを出た");
  }
}


// ---------- block search / damage ----------
// 探索範囲が惑星にまったく届かないか (宇宙空間からの探索は即座に打ち切る)
const PLANET_REACH = (R + 1) * BS;
function outOfPlanet(x, y, r){
  const dx = x - BS / 2, dy = y - BS / 2, m = PLANET_REACH + r;
  if (dx * dx + dy * dy <= m * m) return false;
  for (const S of SATS){   // 衛星惑星の近くも「惑星内」
    const sx = x - (S.cx - GC) * BS, sy = y - (S.cy - GC) * BS, sm = S.r * BS + r;
    if (sx * sx + sy * sy <= sm * sm) return false;
  }
  return true;
}
// 近い順に探す: 中心のセルから外側へ 1周ずつ (チェビシェフ距離のリング) 調べ、
// 見つかった最短距離より外側のリングに入ったら打ち切る。近くにブロックがあれば数十セルで終わる
function findNearestBlock(x, y, maxRange){
  if (outOfPlanet(x, y, maxRange)) return -1;
  const cgx = w2g(x), cgy = w2g(y), rb = Math.ceil(maxRange / BS);
  let best = -1, bestD2 = maxRange * maxRange;
  for (let r = 0; r <= rb; r++){
    const near = (r - 0.5) * BS;                     // リング r のセル中心までの最短距離の下限
    if (r > 0 && near * near >= bestD2) break;
    const y0 = cgy - r, y1 = cgy + r;
    for (let gy = Math.max(0, y0); gy <= Math.min(D - 1, y1); gy++){
      const stepX = (gy === y0 || gy === y1 || r === 0) ? 1 : 2 * r;   // 上下の辺は全セル、それ以外は左右の2セル
      for (let gx = cgx - r; gx <= cgx + r; gx += stepX){
        if (gx < 0 || gx >= D) continue;
        const i = gy * D + gx;
        if (!blockExists(gx, gy) || isDestroyed(i)) continue;
        const dx = g2w(gx) - x, dy = g2w(gy) - y, d2 = dx*dx + dy*dy;
        if (d2 < bestD2){ bestD2 = d2; best = i; }
      }
    }
  }
  return best;
}
// dmgDepth === 0 の呼び出し = 攻撃そのもの。スキルの命中補正はここにだけ掛かり、
// 余波・誘爆 (入れ子の呼び出し) には掛からない (二重に乗らないように)。
// 戻り値 = 壊したときの余剰ダメージ (補正前の単位)。curCarry の攻撃だけが返す (弾はこれを持って奥へ進む)
function damageBlock(idx, dmg, splash){
  if (isDestroyed(idx)) return 0;
  const top = dmgDepth === 0, gx = idx % D, gy = (idx / D) | 0, hp = blockHP(idx), raw = dmg;
  if (top) dmg = skillHitMods(idx, gx, gy, dmg, hp);
  const dfx = top ? dungeonFxAt(gx, gy) : null;   // ダンジョン固有効果
  if (dfx){ dmg *= dfx.dmg; if (dfx.crit && Math.random() < dfx.crit){ dmg *= 2; dmgCritFlag = true; } }
  const voidHit = top && dmgVoidFlag;   // 虚無の単眼の会心 (skillHitMods か弾の経路が立てる)。読んだら消費する
  if (top) dmgVoidFlag = false;
  let cur = hp - dmg;
  if (top && cur > 0 && sk("a_execute") && cur <= blockMaxHP(gx, gy) * 0.1) cur = 0;   // 処刑
  if (top && cur > 0 && sk("b_zero") && frosts.has(idx) && cur <= blockMaxHP(gx, gy) * 0.1) cur = 0;   // 絶対零度: 氷結中は残り1割で砕ける
  if (top && cur > 0 && curFx && curFx.exec && cur <= blockMaxHP(gx, gy) * curFx.exec) cur = 0;   // 装備の処刑
  // ダメージ数値用に「実際に削れた量」をブロック単位で貯める (表示は flushDmgLabels がまとめて行う)
  const dealt = hp - Math.max(0, cur);
  if (dealt > 0){
    let e = dmgAcc.get(idx);
    if (!e){
      if (dmgAcc.size < 96){
        e = dmgEntryPool.pop() || {};
        e.x = g2w(gx); e.y = g2w(gy); e.total = 0; e.crit = false; e.void = false; e.max = hp;
        dmgAcc.set(idx, e);
      }
    }
    if (e){ e.total += dealt; if (dmgCritFlag) e.crit = true; if (voidHit) e.void = true; }
    if (voidHit){   // 虚無の単眼: 紫のリング。星バーストは壊れた時だけ (頻度を抑える)
      bumpArtProc("lg_void");
      rings.push({ x: g2w(gx), y: g2w(gy), r: BS * 2.4, t: nowMs, color: "176,110,255", dur: 380 });
      if (cur <= 0) burstAt(g2w(gx), g2w(gy), { accent: "#b06eff", c2: "#e9d5ff", burst: "star" }, null);
    }
  }
  flashes.set(idx, nowMs);
  dmgDepth++;
  if (cur <= 0) onBlockBroken(idx); else { damagedMap.set(idx, cur); worldDirty = true; touchBlock(idx); }
  if (top) skillAfterHit(idx, gx, gy, dmg, cur);
  if (top && cur > 0 && curFx){
    if (curFx.burn && (burns.size < 800 || burns.has(idx))){ burns.set(idx, { d: dmg * curFx.burn * burnSetMul(), t: 3 + (sk("b_plasma") ? 2 : 0), k: "burn" }); bumpProc("burn"); }   // 燃焼
    if (curFx.acid && (burns.size < 800 || burns.has(idx))){ burns.set(idx, { d: dmg * curFx.acid * elemMul() * (sk("b_acid") ? 1.5 : 1) * (1 + artVal("acid")), t: 4 + (sk("b_acid") ? 2 : 0), k: "acid" }); bumpProc("acid"); }   // 腐食 (長く溶ける)
    if (curFx.radiation && (burns.size < 800 || burns.has(idx))){ burns.set(idx, { d: dmg * curFx.radiation * elemMul(), t: 4, rad: true, k: "rad" }); bumpProc("rad"); }   // 放射 (壊れると隣へ移る)
    if (curFx.frost){
      if (sk("b_thermo") && burns.has(idx)){   // 熱衝撃: 燃焼中の氷結で大爆発 (両方消える)
        burns.delete(idx);
        rings.push({ x: g2w(gx), y: g2w(gy), r: BS * 2, t: nowMs, color: "255,150,60", dur: 300 });
        damageBlock(idx, blockMaxHP(gx, gy) * 0.15, 0);
        bumpProc("thermo");
      } else if (frosts.size < 1500 || frosts.has(idx)){
        const freshFrost = !frosts.has(idx);
        frosts.set(idx, 3 + (sk("b_frost2") ? 2 : 0)); frostGen.set(idx, 0);   // 氷結 (直接当てたものは第0世代)
        bumpProc("frost");
        if (freshFrost && sk("b_permafrost")) for (const [dx, dy] of N4){ const j = liveAt(gx + dx, gy + dy); if (j >= 0 && Math.random() < 0.5 && frosts.size < 1500 && !frosts.has(j)){ frosts.set(j, 2); frostGen.set(j, 1); bumpProc("frost"); } }   // 永久凍土 (伝播は1世代だけ)
      }
    }
    if (curFx.bomb && !bombSet.has(idx) && bombs.length < 200){ bombSet.add(idx); bombs.push({ idx, t: 1.5, dmg: dmg * curFx.bomb }); }   // 時限爆弾
  }
  if (top && cur > 0 && dfx && dfx.proc && Math.random() < dfx.p){   // ダンジョン固有効果: 状態付与
    const k = dfx.proc === "random" ? ["burn","frost","shock"][Math.random() * 3 | 0] : dfx.proc;
    if (k === "burn" && burns.size < 800){ burns.set(idx, { d: dmg * 0.5, t: 3, k: "burn" }); bumpProc("burn"); }
    else if (k === "acid" && burns.size < 800){ burns.set(idx, { d: dmg * 0.4, t: 4, k: "acid" }); bumpProc("acid"); }
    else if (k === "frost" && frosts.size < 1500){ frosts.set(idx, 3); frostGen.set(idx, 0); bumpProc("frost"); }
    else if (k === "bomb" && !bombSet.has(idx) && bombs.length < 200){ bombSet.add(idx); bombs.push({ idx, t: 1.5, dmg: dmg * 2 }); }
    else if (k === "shock"){ for (const [dx, dy] of N4){ const j = liveAt(gx + dx, gy + dy); if (j >= 0) damageBlock(j, dmg * 0.3, 0); } }
  }
  // 余剰ダメージ: オーバーキル習得時は、壊したブロックのHPの半分しか目減りしない
  const over = (top && curCarry && cur < 0 && dmg > 0) ? (-cur + (sk("a_carry") ? hp : sk("a_overkill") ? hp * 0.5 : 0)) * raw / dmg : 0;
  if (splash > 0){
    const sd = dmg * 0.5;
    for (let dy = -splash; dy <= splash; dy++) for (let dx = -splash; dx <= splash; dx++){
      if (!dx && !dy) continue;
      const x = gx + dx, y = gy + dy;
      if (blockExists(x, y)) damageBlock(y * D + x, sd, 0);
    }
  }
  dmgDepth--;
  return over;
}
function onBlockBroken(idx){
  markDestroyed(idx); alive--; state.destroyed++;
  const gx = idx % D, gy = (idx / D) | 0;
  const m = MATS[materialAt(gx, gy)];
  burstAt(g2w(gx), g2w(gy), curFx, m);
  const kind = m.explosive ? 2 : m.cat === "gem" ? 1 : 0;
  // 硬い (HPが高い) ブロック・貴重な素材ほど高額。そこへ各種倍率が掛かる
  const rare = kind !== 0 || goldSet.has(idx);
  let value = blockCoinValue(gx, gy) * curCoinMul * coinSkillMul() * weaponYield();
  if (kind === 1 && sk("c_gem")) value *= sk("c_gem2") ? 2.2 : 1.5;
  if (sk("e_deepfit")) value *= 1 + 0.2 * blockDepth(gx, gy);   // 深層適性: 深いほどコイン増
  if (goldSet.delete(idx)) value *= GOLD_MUL;
  const bfx = dungeonFxAt(gx, gy); if (bfx){ value *= bfx.coin; if (bfx.gold && Math.random() < bfx.gold) value *= GOLD_MUL; }   // ダンジョン固有効果
  const chest = sk("c_king") && Math.random() < (sk("c_king2") ? 0.015 : 0.005);   // ミダス王: 宝箱
  if (chest) value *= sk("c_king3") ? 60 : sk("c_king2") ? 30 : 20;
  value = Math.max(1, Math.round(value));
  dropMaterial(gx, gy, m, kind);
  noteCoinSpawn(g2w(gx), g2w(gy), value);   // 回収ボットの待ち伏せ先 (コイン発生ヒートマップ)
  // 大量破壊でコインが増えすぎると重くなるので、一定数を超えたら既存のコインへ額を上乗せする
  if (coinsArr.length >= MAX_COINS && !chest) coinsArr[(Math.random() * coinsArr.length) | 0].value += value;
  else coinsArr.push({ x:g2w(gx), y:g2w(gy), vx:(Math.random()-.5)*90, vy:(Math.random()-.5)*90, value, chest, age:0 });
  sndBreak();
  if (alive <= 0) return gameClear();
  skillOnBreak(idx, gx, gy, kind, rare);   // 経験値 / コンボ / 撃破時スキル
  if (kind === 2){   // 爆発性ブロック: 5x5 を巻き込んで誘爆 (隣の爆発物にも連鎖する)。危険物取扱で 7x7・威力1.5倍
    const big = sk("c_bomb"), er = big ? 3 : 2;
    const dmg = blockMaxHP(gx, gy) * 1.5 * (big ? 1.5 : 1);
    rings.push({ x:g2w(gx), y:g2w(gy), r:BS * (er + 1), t:performance.now(), color:matColorRGB(m) });
    sndBoom();
    for (let dy = -er; dy <= er; dy++) for (let dx = -er; dx <= er; dx++){
      if ((dx || dy) && blockExists(gx + dx, gy + dy)) damageBlock((gy + dy) * D + gx + dx, dmg, 0);
    }
  }
  if (novaLeft > 0){ // ノヴァバースト: 壊れたブロックが周囲8個を巻き込む (威力は壊れたブロックの最大HPの60%)
    const keep = novaLeft; novaLeft = keep - 1;
    const novaDmg = blockMaxHP(gx, gy) * 0.6;
    rings.push({ x:g2w(gx), y:g2w(gy), r:BS * 1.8, t:performance.now(), color:"255,95,95", dur:220 });
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++){
      if ((dx || dy) && blockExists(gx + dx, gy + dy)) damageBlock((gy + dy) * D + gx + dx, novaDmg, 0);
    }
    novaLeft = keep;
  }
}
// ---------- 素材ドロップ ----------
// 壊したブロックの素材が手に入る。基本1個。採掘スキル・触媒装備・宝石細工で増える (端数は確率で繰り上げ)
let labelT = 0;
function dropMaterial(gx, gy, m, kind){
  let n = matDropMul() * (curFx && curFx.matBonus ? 1 + curFx.matBonus : 1);
  if (kind === 1 && sk("c_gem")) n += sk("c_gem2") ? 2 : 1;
  const whole = Math.floor(n), frac = n - whole;
  n = whole + (Math.random() < frac ? 1 : 0);
  // --- 採掘スキル (e系統): ボーナスは整数で上乗せ ---
  if (sk("e_mine") && Math.random() < 0.15) n += 1;
  if (sk("e_double") && Math.random() < 0.15) n *= 2;
  if (sk("e_core") && m.layer >= LAYERS.length - 1) n *= 2;
  const rar = matRarity(m);
  if (rar >= 2 && sk("e_rare")) n += 1;
  if (sk("e_vein") || sk("e_vein2")){
    let same = 0;
    for (const [dx, dy] of N8){ const x = gx + dx, y = gy + dy; if (blockExists(x, y) && MATS[materialAt(x, y)].key === m.key) same++; }
    if (same >= (sk("e_vein2") ? 1 : 2)) n += sk("e_vein3") ? 4 : sk("e_vein2") ? 2 : 1;
    if (sk("e_vein4") && same >= 4) n *= 2;   // 鉱脈の心臓: 脈の中心は2倍
  }
  if (n <= 0) return;
  invAdd(m.key, n);
  noteDrop(g2w(gx), g2w(gy), m, n);
}
// 獲得の通知: 破片のアニメーションは無く、素材は即座に手に入る。知らせるのは浮かぶ文字だけ
function noteDrop(x, y, m, n){
  const rare = matRarity(m) >= 2;
  if ((rare || nowMs - labelT > 450) && labels.length < MAX_LABELS){
    labelT = nowMs;
    const fs = rare ? 17 : 15, text = `+${fmt(n)} ${m.name}`;
    ctx.font = MAT_LABEL_FONT(fs);   // 幅は作成時に1回だけ測る (描画中は測らない)
    labels.push({ x, y, text, color:labelTextColor(m), chip:m.color, w:ctx.measureText(text).width, fs, t:nowMs, rare });
  }
}
// 半径内の全ブロックへダメージ (重力球 / ドリル)。当たった数を返す
function damageRadius(x, y, r, dmg){
  if (outOfPlanet(x, y, r)) return 0;
  const cgx = w2g(x), cgy = w2g(y), rb = Math.ceil(r / BS), r2 = r * r;
  let n = 0;
  for (let gy = Math.max(0, cgy - rb); gy <= Math.min(D - 1, cgy + rb); gy++){
    for (let gx = Math.max(0, cgx - rb); gx <= Math.min(D - 1, cgx + rb); gx++){
      const i = gy * D + gx;
      if (!blockExists(gx, gy) || isDestroyed(i)) continue;
      const dx = g2w(gx) - x, dy = g2w(gy) - y;
      if (dx * dx + dy * dy <= r2){ damageBlock(i, dmg, 0); n++; }
    }
  }
  for (const m of mobs){ if (!m.dead){ const dx = m.x - x, dy = m.y - y; if (dx * dx + dy * dy <= r2) damageMob(m, dmg, null); } }
  return n;
}
// 次の射撃までの間隔。ガトリングは撃ち続けるほど回転が上がる (holder.spin: 0→1)
function fireDelay(w, holder, fired){
  if (!w.spinMax) return fired ? 1 / w.rate : 0.08;
  holder.spin = fired ? Math.min(1, (holder.spin || 0) + 1 / (w.spinShots || 40)) : Math.max(0, (holder.spin || 0) - 0.1);
  return fired ? 1 / (w.rate * (1 + (w.spinMax - 1) * holder.spin)) : 0.08;
}
// ---------- collision (ブロックを貫通させない) ----------
// 自機を円として扱い、重なった生存ブロックの外へ押し出す。
// 掘った穴 (破壊済み) には入れるので、採掘したトンネルは通れる。
function resolveCollision(ent, rad){
  for (let iter = 0; iter < 3; iter++){
    const cgx = w2g(ent.x), cgy = w2g(ent.y);
    const rb = Math.ceil(rad / BS) + 1;
    let moved = false;
    for (let gy = cgy - rb; gy <= cgy + rb; gy++){
      for (let gx = cgx - rb; gx <= cgx + rb; gx++){
        if (!blockExists(gx, gy) || isDestroyed(gy * D + gx)) continue;
        const bx = (gx - GC) * BS, by = (gy - GC) * BS;   // ブロック左上 (world)
        const cx = Math.max(bx, Math.min(ent.x, bx + BS));
        const cy = Math.max(by, Math.min(ent.y, by + BS));
        let dx = ent.x - cx, dy = ent.y - cy;
        const d2 = dx * dx + dy * dy;
        if (d2 > rad * rad) continue;
        if (d2 > 1e-6){
          const d = Math.sqrt(d2);
          ent.x = cx + dx / d * rad; ent.y = cy + dy / d * rad;
        } else {
          // 中心がブロック内: 最も近い辺から押し出す
          const left = ent.x - bx, right = bx + BS - ent.x, top = ent.y - by, bottom = by + BS - ent.y;
          const m = Math.min(left, right, top, bottom);
          if (m === left) ent.x = bx - rad; else if (m === right) ent.x = bx + BS + rad;
          else if (m === top) ent.y = by - rad; else ent.y = by + BS + rad;
        }
        moved = true;
      }
    }
    if (!moved) break;
  }
}

// ---------- shooting ----------
// 近い順に k 個。findNearestBlock と同じリング探索で、k 個集まった時点の
// 「最も遠い候補」より外側のリングに入ったら打ち切る
function findNearestBlocks(x, y, maxRange, k, exclude){
  if (k <= 0 || outOfPlanet(x, y, maxRange)) return [];
  const cgx = w2g(x), cgy = w2g(y), rb = Math.ceil(maxRange / BS);
  const cand = [];
  let limit = maxRange * maxRange;
  for (let r = 0; r <= rb; r++){
    const near = (r - 0.5) * BS;
    if (r > 0 && near * near >= limit) break;
    const y0 = cgy - r, y1 = cgy + r;
    for (let gy = Math.max(0, y0); gy <= Math.min(D - 1, y1); gy++){
      const stepX = (gy === y0 || gy === y1 || r === 0) ? 1 : 2 * r;
      for (let gx = cgx - r; gx <= cgx + r; gx += stepX){
        if (gx < 0 || gx >= D) continue;
        const i = gy * D + gx;
        if (!blockExists(gx, gy) || isDestroyed(i)) continue;
        if (exclude && exclude.has(i)) continue;
        const dx = g2w(gx) - x, dy = g2w(gy) - y, d2 = dx*dx + dy*dy;
        if (d2 < limit) cand.push([d2, i]);
      }
    }
    if (cand.length >= k){   // k番目の距離は、今の候補の最大値以下
      let mx = 0; for (const c of cand) if (c[0] > mx) mx = c[0];
      limit = Math.min(limit, mx + 1e-6);
    }
  }
  cand.sort((a, b) => a[0] - b[0]);
  const out = new Array(Math.min(k, cand.length));
  for (let j = 0; j < out.length; j++) out[j] = cand[j][1];
  return out;
}

// 入口: 「自機の攻撃か」を記録してから撃つ。自機専用スキル (終末の一撃 / 全方位射撃) の発数もここで数える
function shoot(sx, sy, dmg, weaponKey, fromBot){
  const pl = !weaponKey && !fromBot;                      // 自機本人の射撃
  const doom = pl && doomN >= (sk("a_doom2") ? 4 : 9) && sk("a_doom");
  curPl = pl;                                             // プレイヤー自身の攻撃か (命中時スキルの判定用)
  let fired = false;
  try { fired = shootRaw(sx, sy, doom ? dmg * 5 : dmg, weaponKey, fromBot, doom ? 2 : 0); }
  finally { curPl = false; }
  if (pl && fired){
    doomN = doom ? 0 : doomN + 1;
  }
  return fired;
}
// xs = 追加の着弾範囲 (終末の一撃)
function shootRaw(sx, sy, dmg, weaponKey, fromBot, xs){
  const w = weaponKey ? WEAPONS[weaponKey] : WEAPONS[state.weapon];
  const mods = curPl;

  // ボット: 装備なしは普通の単発、装備ありは装備の性能そのまま
  if (fromBot){
    if (weaponKey){
      curFx = w;
      try { return shootWeapon(w, sx, sy, dmg, atkRange() * (w.range || 1), w.splash || 0, false, sk("d_ap") ? 1 : 0); }
      finally { curFx = null; curCarry = false; }
    }
    const mb = nearestMob(sx, sy, atkRange());   // ボットもモンスター優先
    const idx = mb ? -1 : findNearestBlock(sx, sy, atkRange());
    if (!mb && idx < 0) return false;
    const a = mb ? Math.atan2(mb.y - sy, mb.x - sx) : Math.atan2(g2w((idx / D) | 0) - sy, g2w(idx % D) - sx);
    bullets.push({ x:sx, y:sy, vx:Math.cos(a)*720*BULLET_SPD_MUL, vy:Math.sin(a)*720*BULLET_SPD_MUL, dmg, splash:0, life:0.6 / BULLET_SPD_MUL, lastHit:-1, color:"#ffffff", pierce: sk("d_ap") ? 1 : 0, shape:"dot", sz:3 });
    sndShoot();
    return true;
  }
  const rng = atkRange() * (w.range || 1), splash = (w.splash || 0) + xs + artVal("splash");
  curFx = w;
  try { return shootWeapon(w, sx, sy, dmg, rng, splash, mods); }
  finally { curFx = null; curCarry = false; }
}
// 照射系の余剰ダメージ: 命中点から射線の奥へ、壊れなくなるまで引き継ぐ
function carryRay(x, y, a, dmg, maxD, splash){
  const ca = Math.cos(a), sa = Math.sin(a);
  let last = -1;
  for (let d = BS / 2; d <= maxD && dmg > 0.01; d += BS / 2){
    const gx = w2g(x + ca * d), gy = w2g(y + sa * d), i = gy * D + gx;
    if (i === last || !blockExists(gx, gy) || isDestroyed(i)) continue;
    last = i;
    dmg = damageBlock(i, dmg, splash);
  }
}
function shootWeapon(w, sx, sy, dmg, rng, splash, mods, bonusPierce = 0){
  // オーラ: 弾を撃たず、周囲の全ブロックを削る
  if (w.mode === "aura"){
    const r = w.auraR || 110, cgx = w2g(sx), cgy = w2g(sy), rb = Math.ceil(r / BS), r2 = r * r;
    let hitAny = false;
    for (const m of mobs){   // モンスターも範囲内の全員に当たる
      if (m.dead) continue;
      const dx = m.x - sx, dy = m.y - sy, mr = r + m.type.r;
      if (dx * dx + dy * dy <= mr * mr){ damageMob(m, dmg, { fx: w }); hitAny = true; }
    }
    const inReach = !outOfPlanet(sx, sy, r);
    for (let gy = Math.max(0, cgy - rb); inReach && gy <= Math.min(D - 1, cgy + rb); gy++){
      for (let gx = Math.max(0, cgx - rb); gx <= Math.min(D - 1, cgx + rb); gx++){
        const i = gy * D + gx;
        if (!blockExists(gx, gy) || isDestroyed(i)) continue;
        const dx = g2w(gx) - sx, dy = g2w(gy) - sy;
        if (dx * dx + dy * dy <= r2){ damageBlock(i, dmg, 0); hitAny = true; }
      }
    }
    if (hitAny){ rings.push({ x:sx, y:sy, r, t:performance.now(), color: hexRGB(w.accent) }); sndShoot(); }
    return hitAny;
  }

  // チェイン: 命中したブロックから近くのブロックへ次々に飛び移る
  if (w.mode === "chain"){
    const seen = new Set();
    let px = sx, py = sy, d = dmg;
    const mob0 = nearestMob(sx, sy, rng);   // 最初の一撃はモンスター優先
    if (mob0){
      beams.push({ x1:px, y1:py, x2:mob0.x, y2:mob0.y, t:performance.now(), w:2.5, color:w.accent, zig:true, life:120 });
      damageMob(mob0, d, { fx: w });
      px = mob0.x; py = mob0.y; d *= w.chainDecay || 0.7;
    }
    let idx = findNearestBlock(px, py, mob0 ? 120 : rng);
    if (!mob0 && idx < 0) return false;
    for (let c = mob0 ? 1 : 0; c <= w.chains && idx !== undefined && idx >= 0; c++){
      seen.add(idx);
      const tx = g2w(idx % D), ty = g2w((idx / D) | 0);
      beams.push({ x1:px, y1:py, x2:tx, y2:ty, t:performance.now(), w:c ? 1.5 : 2.5, color:w.accent, zig:true, life:120 });
      damageBlock(idx, d, splash);
      px = tx; py = ty; d *= w.chainDecay || 0.7;
      const cand = findNearestBlocks(px, py, 120, 8, seen);
      idx = cand.length ? cand[(Math.random() * cand.length) | 0] : undefined;
    }
    sndShoot();
    return true;
  }

  // 照準: 射程内にモンスターがいれば最優先で狙い、残りの多目標枠をブロックに使う
  const mobT = nearestMob(sx, sy, rng), nTgt = w.targets || 1;
  const targets = findNearestBlocks(sx, sy, rng, mobT ? nTgt - 1 : nTgt);
  const aims = [];
  if (mobT) aims.push({ x: mobT.x, y: mobT.y, mob: mobT, idx: -1 });
  for (const idx of targets) aims.push({ x: g2w(idx % D), y: g2w((idx / D) | 0), mob: null, idx });
  if (!aims.length) return false;

  // ビーム: 射線上のブロックを全て貫く (狙ったモンスターにも当たる)
  if (w.mode === "beam"){
    for (const aim of aims){
      const a = Math.atan2(aim.y - sy, aim.x - sx);
      if (aim.mob) damageMob(aim.mob, dmg, { fx: w });
      const seen = new Set();
      for (let d = 0; d <= rng; d += BS / 2){
        const gx = w2g(sx + Math.cos(a) * d), gy = w2g(sy + Math.sin(a) * d);
        if (!blockExists(gx, gy)) continue;
        const i = gy * D + gx;
        if (!seen.has(i) && !isDestroyed(i)){ seen.add(i); damageBlock(i, dmg, splash); }
      }
      beams.push({ x1:sx, y1:sy, x2:sx + Math.cos(a) * rng, y2:sy + Math.sin(a) * rng, t:performance.now(), w:w.beamW || 5, color:w.accent });
    }
    sndShoot();
    return true;
  }

  // 通常射撃 (aims は同時多目標。モンスターが先頭)
  for (const aim of aims){
    const idx = aim.idx, tx = aim.x, ty = aim.y, baseA = Math.atan2(ty - sy, tx - sx);
    if (w.mode === "laser"){
      beams.push({ x1:sx, y1:sy, x2:tx, y2:ty, t:performance.now(), w:2, color:w.accent });
      if (aim.mob){ damageMob(aim.mob, dmg, { fx: w }); continue; }
      curCarry = true;
      const over = damageBlock(idx, dmg, splash);
      if (over > 0) carryRay(tx, ty, baseA, over, Math.max(BS * 2, rng - Math.hypot(tx - sx, ty - sy)), splash);
      curCarry = false;
      continue;
    }
    // 弾は武器の素の性能で作る (mods は「自機の弾か」の印)
    const n = weaponPellets(w.key);   // 強化Lv10ごとに +1
    const spd = (w.bulletSpeed || 720) * BULLET_SPD_MUL;
    const mk = a => {
      const isCrit = w.critC && Math.random() < w.critC;
      const hm = !!w.homing;
      bullets.push({ x:sx, y:sy, vx:Math.cos(a)*spd, vy:Math.sin(a)*spd,
        dmg: isCrit ? dmg * w.critM : dmg, crit:isCrit, fx:w, sz:w.size || 4,
        splash, life: rng / spd + 0.25,
        homing: hm, targetIdx: idx, targetMob: aim.mob ? aim.mob.id : 0, retargetT: 0, color: w.accent,
        pierce: (w.pierce || 0) + (bonusPierce || 0), bounce: w.bounce || 0,
        split: w.split || 0, frags: w.frags || 0, lastHit: -1, pl: mods, shape: w.shape || "dot",
        coinMul: w.coinMul || 1, nova: w.nova || 0, orb: w.orb ? w.orbR : 0, tickT: 0,
        move: w.move || null, seed: Math.random() * 6.283, age: 0, life0: rng / spd + 0.25, spd0: spd,
        baseSz: w.size || 4, spin: w.spin || 0, pulse: w.pulse || 0, trail: !!w.trail, glow: !!w.glow,
        mine: w.mine || 0, ox: sx, oy: sy,
        form: w.form || w.shape || "dot", c2: w.c2 || "#ffffff", trailFx: w.trailFx || "ghost" });
    };
    const step = w.arc ? Math.PI * 2 / n : (w.spreadA || 0.16);
    for (let p = 0; p < n; p++){
      const a = w.arc ? baseA + p * step : baseA + (n > 1 ? (p - (n - 1) / 2) * step : 0);
      mk(a + (w.jitter ? (Math.random() - 0.5) * w.jitter : 0));
    }
  }
  sndShoot();
  return true;
}
const hexRGB = h => { const n = parseInt(h.slice(1), 16); return `${n >> 16 & 255},${n >> 8 & 255},${n & 255}`; };

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
let hoverInfo = null;   // カーソル下のブロック {gx, gy, name, color, cur, max} (無いときは null)。カーソル位置は skillfx.js の mouseSX/mouseSY/mouseIn を共有
window.addEventListener("dragstart", e => e.preventDefault());   // 要素のゴーストドラッグを止める
window.addEventListener("keydown", e => { keys[e.key.toLowerCase()] = true; if (["w","a","s","d"].includes(e.key.toLowerCase())) audio(); boostSpaceEvent(e, true); });
window.addEventListener("keyup",   e => { keys[e.key.toLowerCase()] = false; boostSpaceEvent(e, false); });
window.addEventListener("blur", () => { boostKey = false; });   // フォーカスを失ったらブーストは解除 (押しっぱなし扱いの防止)

// ---------- start / clear ----------
let started = false, cleared = false;
$("startBtn").addEventListener("click", () => { audio(); tone(523,.12,"square",.05); $("startOverlay").style.display = "none"; started = true; });
function gameClear(quiet){
  if (cleared) return; cleared = true; if (!quiet) sndClear();
  $("clearStats").textContent = `累計獲得コイン ${fmt(state.totalCoins)} ・ 製作した装備 ${state.crafted} ・ レベル ${state.lv} — おつかれさま。`;
  $("clearOverlay").style.display = "flex";
}
if (alive <= 0) gameClear(true);   // 前回のプレイで破壊し尽くしていた
$("restartBtn").addEventListener("click", () => wipeSave().then(() => location.reload()));
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

/* ---------- 世界の保存 (破壊ビットマップ / 部分ダメージ / 宝箱 / 自機の居場所) ----------
   軽量化の肝: 27MB のビットマップのうち、印の付いた 64KB チャンクだけを書き戻す。
   ふつうのプレイでは毎回 1〜3個しか動かないので、1回の保存は数百KB未満で済む。
   書き込みは非同期なのでループは待たない */
const MAX_DAMAGED_SAVE = 20000;   // 部分ダメージ中のブロック。これ以上は保存を打ち切る (通常は数十個)
let lastSavePx = player.x, lastSavePy = player.y;
function flushWorld(force){
  if (!SaveDB.live) return;
  if (Math.abs(player.x - lastSavePx) + Math.abs(player.y - lastSavePy) > 120) worldDirty = true;
  if (!worldDirty && !force) return;
  worldDirty = false;
  lastSavePx = player.x; lastSavePy = player.y;
  const puts = [];
  for (let i = 0; i < CHUNK_N; i++) if (chunkDirty[i]){
    chunkDirty[i] = 0;
    puts.push([i, { i, d: destroyedBits.slice(i * CHUNK_BYTES, (i + 1) * CHUNK_BYTES) }]);
  }
  const n = Math.min(damagedMap.size, MAX_DAMAGED_SAVE);
  const ix = new Int32Array(n), hp = new Float64Array(n);
  let k = 0;
  for (const [i, h] of damagedMap){ if (k >= n) break; ix[k] = i; hp[k++] = h; }
  // 破壊ビットマップと残り数 alive は必ず一緒に書く (片方だけ残ると破壊率がズレる)
  SaveDB.putMulti([
    [ST_CH, puts],
    [ST_KV, [["world", { alive, ix, hp, chests:[...openedChests], px:player.x, py:player.y, zoom, cleared }]]],
  ]);
}
// タブを離れる / 閉じるときは取りこぼさないよう即保存する
const flushAll = () => { saveNow(); flushWorld(true); };
document.addEventListener("visibilitychange", () => { if (document.hidden) flushAll(); });
window.addEventListener("pagehide", flushAll);

// ---------- main loop ----------
let last = performance.now(), uiT = 0, saveT = 0, worldT = 3;
function frame(now){
  requestAnimationFrame(frame);
  trackFrameRate(now - last);
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  nowMs = now;
  updateSkillHUD();
  updateHpHud();
  if (!started || cleared || treeOpen || artOpen || mapOpen || updOpen || botEqOpen){ draw(now); return; }   // ツリー/アーティファクト/マップ/履歴/ボット装備を開いている間は一時停止
  updateDungeonBanner();

  // --- timers ---
  dmgFlushT -= dt;   // 0以下になったら draw 前に flushDmgLabels が集計を発行し、周期を戻す
  const pfdt = dt * playerRate(), bdt = dt * crewRate();   // 自機 / 仲間それぞれの連射スキル込み
  // --- player move ---
  let ax = 0, ay = 0, amp = 1, manual = false;
  if (keys["w"]) ay -= 1; if (keys["s"]) ay += 1; if (keys["a"]) ax -= 1; if (keys["d"]) ax += 1;
  if (ax || ay) manual = true;
  if (!ax && !ay && touchAxis.on && touchAxis.mag > 0){ ax = touchAxis.x; ay = touchAxis.y; amp = touchAxis.mag; manual = true; }   // スマホのスティック (傾けた分だけ速い)
  if (ax || ay) idleT = 0; else { [ax, ay] = autopilot(dt); amp = 1; }   // オートパイロット (スキル)
  player.moving = !!(ax || ay);
  boostOn = manual && (boostKey || boostTouchOn);   // ブーストは手動入力の間だけ (放置の自動移動は速くしない)
  const al = Math.hypot(ax, ay) || 1, sp = playerSpeed() * amp * (boostOn ? BOOST_MUL : 1);
  player.vx = ax / al * sp * (ax || ay ? 1 : 0); player.vy = ay / al * sp * (ax || ay ? 1 : 0);
  // 高速時は 1 フレームの移動量がブロック (BS=24) を超え、押し出し式の衝突だけでは
  // 薄い壁をすり抜けるので、16px 以下の小刻みに進めて各歩で衝突を解決する
  const mdx = player.vx * dt, mdy = player.vy * dt;
  const mSteps = Math.max(1, Math.ceil(Math.hypot(mdx, mdy) / 16));
  for (let s = 0; s < mSteps; s++){ player.x += mdx / mSteps; player.y += mdy / mSteps; resolveCollision(player, 10); }
  if (ax || ay) player.angle = Math.atan2(ay, ax);
  // ブースト演出の発生 (残像と噴射。寿命は draw 側が時刻で管理する)
  if (boostOn){
    boostGhostT -= dt; boostPartT -= dt;
    if (boostGhostT <= 0){
      boostGhostT = 0.03;
      boostGhosts.push({ x: player.x, y: player.y, a: player.angle, t: now });
      if (boostGhosts.length > 14) boostGhosts.shift();
    }
    if (boostPartT <= 0){
      boostPartT = 0.012;
      const bx = player.x - Math.cos(player.angle) * 12, by = player.y - Math.sin(player.angle) * 12;
      for (let k = 0; k < 2; k++){
        const ja = player.angle + Math.PI + (Math.random() - 0.5) * 0.7, js = 120 + Math.random() * 160;
        boostParts.push({ x: bx, y: by, vx: Math.cos(ja) * js - player.vx * 0.25, vy: Math.sin(ja) * js - player.vy * 0.25, t: now, life: 260 + Math.random() * 160 });
      }
      if (boostParts.length > 90) boostParts.splice(0, boostParts.length - 90);
    }
  }

  // --- player fire ---
  player.fireT -= pfdt;
  const w = WEAPONS[state.weapon];
  if (player.fireT <= 0){
    const fired = shoot(player.x, player.y, shotDamage(), null, false);
    player.fireT = fireDelay(w, player, fired);
    if (fired){
      heatT = 0.5;                                                                        // ウォームアップ
      if (sk("a_double") && Math.random() < (sk("a_triple") ? 0.35 : 0.2)) player.fireT = Math.min(player.fireT, 0.04);   // ダブルタップ
    }
  }


  skillsUpdate(dt, dt, bdt, now);   // スキルの継続効果・設置物・自動詠唱
  updatePlayerHP(dt);   // 自機HP (無敵時間・自動回復)
  updateMobs(dt);       // 衛星のモンスター・敵弾
  updateArtifacts(dt);  // 宝箱・アーティファクトの継続効果

  // --- bots (作戦モード: follow=追従 / solo=独立 / explore=探索) ---
  const botMode = state.botMode || "follow";
  for (let bi = 0; bi < bots.length; bi++){
    const b = bots[bi];
    const wk = botWeaponAt(bi), bw = wk ? WEAPONS[wk] : null;
    b.retargetT -= dt;
    if (b.retargetT <= 0){
      b.retargetT = 0.4;
      if (botMode === "explore") updateExploreTarget(b);
      else if (botMode === "solo"){
        const idx = findNearestBlock(b.x, b.y, 1400);
        if (idx >= 0){ b.tx = g2w(idx % D); b.ty = g2w(((idx / D) | 0)); }
        else { const sp = nearestBodySurface(b.x, b.y); if (sp){ b.tx = sp.x; b.ty = sp.y; } }   // 宇宙にいたら最寄りの天体へ
      } else {   // follow: 自機から離れすぎていたら掘らずに合流する
        const pd = Math.hypot(player.x - b.x, player.y - b.y);
        if (pd > 620) b.tx = null;
        else { const idx = findNearestBlock(b.x, b.y, 1400); if (idx >= 0){ b.tx = g2w(idx % D); b.ty = g2w(((idx / D) | 0)); } }
      }
    }
    // 移動先: 目標ブロック。追従モードで合流中は自機の周りの編隊位置
    let mvx = b.tx, mvy = b.ty, regroup = false;
    if (botMode === "follow" && mvx === null){
      const a2 = bi / Math.max(1, bots.length) * Math.PI * 2 + nowMs / 5000;
      mvx = player.x + Math.cos(a2) * 95; mvy = player.y + Math.sin(a2) * 95; regroup = true;
    }
    if (mvx !== null && mvx !== undefined){
      const dx = mvx - b.x, dy = mvy - b.y, d = Math.hypot(dx, dy);
      // 装備の届く距離まで近づく (オーラは範囲内まで、短射程は撃ち切れる距離まで)。遠い目標へは距離に応じて加速する
      const stopD = regroup ? 24 : bw && bw.mode === "aura" ? (bw.auraR || 110) * 0.7
                  : Math.min(atkRange() * 0.75, atkRange() * ((bw && bw.range) || 1) * 0.9);
      // 追いつき上限: 通常は従来通り 2200。プレイヤーがブースト中だけ、自機のブースト速度に
      // 合わせて上限を広げる (置いてけぼりにせず、ブーストを止めればすぐ編隊に戻れる範囲)
      const spdCap = boostOn ? Math.max(2200, playerSpeed() * BOOST_MUL) : 2200;
      if (d > stopD){ const spd = 210 + Math.min(spdCap, Math.max(0, d - 400) * 0.75); b.x += dx / d * spd * dt; b.y += dy / d * spd * dt; }
      resolveCollision(b, 10);
      b.angle = Math.atan2(dy, dx);
    }
    b.fireT -= bdt;
    if (b.fireT <= 0){
      if (bw) b.fireT = fireDelay(bw, b, shoot(b.x, b.y, shotDamage(wk) * 0.6 * botMul(), wk, true));
      else if (shoot(b.x, b.y, playerDamage() * 0.6 * botMul(), null, true)) b.fireT = 1 / 3;
      else b.fireT = 0.15;
    }
  }

  // --- coin bots: 他ボットと被らないコインを価値・密集度・距離で選ぶ ---
  // 割り当て表は、このフレームで誰かが目標を選び直すときにだけ作る
  // コインが無いときは自機には付いて行かず、最近コインがよく湧いている場所で待ち伏せする
  let coinClaims = null;
  const claims = () => coinClaims || (coinClaims = buildCoinClaims());
  heatPruneT -= dt; if (heatPruneT <= 0){ heatPruneT = 2; pruneCoinHeat(); }
  const cbSpd = coinBotSpeed(), cbVac = coinBotVacuum(), cbTouch2 = coinBotTouchR() ** 2;
  const cbMode = state.cbMode || "follow";   // follow=追従 / solo=独立 / botfollow=ボット追従
  for (let ci = 0; ci < coinBots.length; ci++){
    const cb = coinBots[ci];
    cb.retargetT -= dt;
    if (cb.target && cb.target.gone){ cb.target = null; cb.retargetT = 0; }
    if (cb.retargetT <= 0){
      cb.target = coinsArr.length ? pickCoinTarget(cb, claims(), cbSpd, cbVac) : null;
      if (cb.target && cbMode === "follow"){   // 追従: 自機から遠いコインは追わない
        const pdx = cb.target.x - player.x, pdy = cb.target.y - player.y;
        if (pdx * pdx + pdy * pdy > 2600 * 2600) cb.target = null;
      }
      if (cb.target && cbMode === "botfollow"){   // ボット追従: 担当ボットの近くのコインだけ拾う
        const tdx2 = cb.target.x - cb.x, tdy2 = cb.target.y - cb.y;
        if (tdx2 * tdx2 + tdy2 * tdy2 > 950 * 950) cb.target = null;
      }
      cb.idle = cb.target ? null : (cbMode === "solo" ? pickIdleSpot(cb, cbSpd) : null);
      cb.retargetT = 0.15;
    }
    if (cb.target){
      // 目標の周りに山があるときは、その重心へ向かう (一停車で山ごと吸引圏内に入れる)
      let ax = cb.target.x, ay = cb.target.y;
      const caim = coinClusterAim(claims(), cb.target, Math.min(cbVac, 320));
      if (caim){ ax = caim[0]; ay = caim[1]; }
      // 独立モード: 同じ山に複数台が向かうときは、重心の周りに花びら状に散って吸引エリアを分担する (1点に重ならない)
      if (caim && cbMode === "solo"){
        let sharers = 0;
        for (const o of coinBots){ if (o === cb || !o.target) continue;
          const odx = o.target.x - cb.target.x, ody = o.target.y - cb.target.y;
          if (odx * odx + ody * ody < 480 * 480) sharers++; }
        if (sharers > 0){ const a = ci * 2.39996; ax += Math.cos(a) * 150; ay += Math.sin(a) * 150; }
      }
      const tdx = ax - cb.x, tdy = ay - cb.y, td2 = tdx * tdx + tdy * tdy;
      const warpR = 800 - 150 * cbLv("stargate");
      if ((cbLv("anchor") > 0 || cbLv("stargate") > 0) && td2 > warpR * warpR){   // 時空アンカー / 星核ワープコア: 遠い目標の手前へワープ
        const td = Math.sqrt(td2);
        rings.push({ x:cb.x, y:cb.y, r:40, t:nowMs, color:"64,224,208", dur:300 });
        cb.x = ax - tdx / td * 120; cb.y = ay - tdy / td * 120;
        rings.push({ x:cb.x, y:cb.y, r:40, t:nowMs, color:"64,224,208", dur:300 });
      }
      steerBot(cb, ax, ay, cbSpd * (td2 > 400 * 400 ? cbNozzle() : 1) * (td2 > 1200 * 1200 ? 1.35 : 1), dt, 0);   // 推進ノズル + 長距離巡航ブースト: 移動の死に時間を減らす
    }
    else if (cbMode === "follow"){   // 自機の周りの編隊位置で待つ (遠いときは加速して合流)
      const a3 = ci / Math.max(1, coinBots.length) * Math.PI * 2 + nowMs / 6000;
      const tx3 = player.x + Math.cos(a3) * 75, ty3 = player.y + Math.sin(a3) * 75;
      const dd3 = Math.hypot(tx3 - cb.x, ty3 - cb.y);
      steerBot(cb, tx3, ty3, cbSpd * (1 + Math.min(5, dd3 / 700)), dt, 10);
    }
    else if (cbMode === "botfollow"){   // 担当の攻撃ボット (1台につき回収ボット1台) の側で待つ。攻撃ボットが回収ボットより多い/少ない場合は割り当てを繰り返す
      const ab = bots.length ? bots[ci % bots.length] : null;
      const ax = ab ? ab.x : player.x, ay = ab ? ab.y : player.y;
      const a3 = ci * 2.39996;
      const tx3 = ax + Math.cos(a3) * 48, ty3 = ay + Math.sin(a3) * 48;
      const dd3 = Math.hypot(tx3 - cb.x, ty3 - cb.y);
      steerBot(cb, tx3, ty3, cbSpd * 1.2 * (1 + Math.min(5, dd3 / 700)), dt, 8);
    }
    else idleMove(cb, cbSpd, dt, ci, coinBots.length);
    // 接触回収: 近づいたコインはその場で確実に拾う (吸引だけに頼らない)。拡張ハッチで範囲が広がる
    for (let j = coinsArr.length - 1; j >= 0; j--){
      const cn = coinsArr[j], ex = cn.x - cb.x, ey = cn.y - cb.y;
      if (ex * ex + ey * ey < cbTouch2){
        gainCoin(cn);
        removeCoinAt(j); hudDirty = true;
        if (cn === cb.target){ cb.target = null; cb.retargetT = 0; }   // 拾い終わったら待たずに次の目標へ
      }
    }
  }

  // --- bullets ---
  for (let i = bullets.length - 1; i >= 0; i--){
    const bl = bullets[i];
    // 追尾: 目標へ旋回し続ける (目標が消えたら近くのブロックを探し直す)
    if (bl.homing){
      bl.retargetT -= dt;
      const steer = (tx, ty) => {
        const want = Math.atan2(ty - bl.y, tx - bl.x);
        const cur = Math.atan2(bl.vy, bl.vx);
        let diff = ((want - cur + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
        const turn = 7 * dt, na = cur + Math.max(-turn, Math.min(turn, diff));
        const spd = Math.hypot(bl.vx, bl.vy);
        bl.vx = Math.cos(na) * spd; bl.vy = Math.sin(na) * spd;
      };
      const hm = bl.targetMob ? mobById(bl.targetMob) : null;
      if (hm) steer(hm.x, hm.y);   // モンスターを追尾
      else {
        if (bl.targetMob) bl.targetMob = 0;   // 目標のモンスターは倒れた
        if (bl.targetIdx < 0 || isDestroyed(bl.targetIdx)){
          if (bl.retargetT <= 0){
            const mb = nearestMob(bl.x, bl.y, atkRange());   // 探し直しもモンスター優先
            if (mb) bl.targetMob = mb.id;
            else bl.targetIdx = findNearestBlock(bl.x, bl.y, atkRange());
            bl.retargetT = 0.12;
          }
        }
        if (bl.targetIdx >= 0) steer(g2w(bl.targetIdx % D), g2w((bl.targetIdx / D) | 0));
      }
    }
    bl.life -= dt;
    bl.age = (bl.age || 0) + dt;
    if (bl.stuck){   // 設置爆弾: くっついた場所で信管が進み、敵が近づくか時間切れで起爆
      bl.armT -= dt;
      let boom = bl.life <= 0;
      if (!boom && bl.armT <= 0) for (const m of mobs){ if (!m.dead && (m.x - bl.x) ** 2 + (m.y - bl.y) ** 2 < 2304){ boom = true; break; } }
      if (boom){
        const mr = (bl.mine || 2) * BS;
        damageRadius(bl.x, bl.y, mr, bl.dmg);
        rings.push({ x: bl.x, y: bl.y, r: mr, t: performance.now(), color: hexRGB(bl.color) });
        removeBulletAt(i);
      }
      continue;
    }
    if (bl.move){   // 武器ごとの移動パターン
      const rot = ang => { const c = Math.cos(ang), sn = Math.sin(ang), vx = bl.vx, vy = bl.vy; bl.vx = vx * c - vy * sn; bl.vy = vx * sn + vy * c; };
      switch (bl.move){
        case "wave": rot(Math.sin(bl.age * 9 + bl.seed) * 2.0 * dt); break;
        case "spiral": rot((bl.seed > 3.14 ? -1 : 1) * 2.3 * dt); break;
        case "zigzag": bl.zzT = (bl.zzT || 0) - dt; if (bl.zzT <= 0){ bl.zzT = 0.11; bl.zzS = -(bl.zzS || 1); rot(bl.zzS * 0.55); } break;
        case "drift": rot((Math.sin(bl.age * 3.1 + bl.seed) + Math.sin(bl.age * 7.7 + bl.seed * 2)) * 0.9 * dt); break;
        case "accel": { const f = 1 + 1.7 * Math.min(1, bl.age / (bl.life0 * 0.8)), cur = Math.hypot(bl.vx, bl.vy), want = bl.spd0 * f; if (cur > 0){ bl.vx *= want / cur; bl.vy *= want / cur; } break; }
        case "grow": { const nf = 1 + 1.2 * Math.min(1, bl.age / (bl.life0 * 0.75)), of = bl.growF || 1; bl.sz = bl.baseSz * nf; bl.dmg *= nf / of; bl.growF = nf; break; }
        case "boomerang": {
          if (!bl.ret && bl.age > bl.life0 * 0.5) bl.ret = true;
          if (bl.ret){
            const dx = bl.ox - bl.x, dy = bl.oy - bl.y, d = Math.hypot(dx, dy), spd = Math.hypot(bl.vx, bl.vy);
            if (d < 18){ removeBulletAt(i); continue; }
            const want = Math.atan2(dy, dx), cur = Math.atan2(bl.vy, bl.vx);
            let diff = ((want - cur + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
            const turn = 11 * dt, na = cur + Math.max(-turn, Math.min(turn, diff));
            bl.vx = Math.cos(na) * spd; bl.vy = Math.sin(na) * spd;
            bl.life = Math.max(bl.life, d / spd + 0.05);
          }
          break; }
      }
    }
    if (bl.trail){ (bl.ghost = bl.ghost || []).unshift({ x: bl.x, y: bl.y }); if (bl.ghost.length > 3) bl.ghost.pop(); }
    if (bl.orb){   // 重力球: ブロックをすり抜け、周囲を削り続ける
      bl.x += bl.vx * dt; bl.y += bl.vy * dt;
      bl.tickT -= dt;
      if (bl.tickT <= 0){ bl.tickT = 1 / 8; damageRadius(bl.x, bl.y, bl.orb, bl.dmg); }
      if (bl.life <= 0) removeBulletAt(i);
      continue;
    }
    // 速い弾がブロックを飛び越えないよう、1フレームの移動をブロック半分ずつに刻んで当たり判定する
    const sub = Math.min(6, Math.max(1, Math.ceil(Math.hypot(bl.vx, bl.vy) * dt / (BS * 0.5))));
    let gx = 0, gy = 0, idx = -1, hit = false, mobHit = null;
    for (let k = 0; k < sub && !hit && !mobHit; k++){
      bl.x += bl.vx * dt / sub; bl.y += bl.vy * dt / sub;
      mobHit = mobAtPoint(bl.x, bl.y, bl.lastMob);
      if (!mobHit){
        gx = w2g(bl.x); gy = w2g(bl.y); idx = gy * D + gx;
        hit = blockExists(gx, gy) && !isDestroyed(idx) && idx !== bl.lastHit;
      }
    }
    if ((hit || mobHit) && bl.mine && !bl.stuck){   // 設置爆弾は当たらずにくっつく
      bl.stuck = true; bl.vx = 0; bl.vy = 0; bl.life = 2.4; bl.armT = 0.35; bl.move = null; hit = false; mobHit = null;
    }
    let dead = bl.life <= 0;
    if (mobHit){   // モンスターに命中
      curPl = !!bl.pl; curFx = bl.fx || null;
      damageMob(mobHit, bl.dmg, bl);
      curFx = null; curPl = false;
      if (bl.pierce > 0){ bl.pierce--; bl.lastMob = mobHit.id; }
      else dead = true;
    }
    if (hit){
      curPl = !!bl.pl; curEcho = !!bl.echo; curFx = bl.fx || null; curCarry = true;
      curCoinMul = bl.coinMul || 1; novaLeft = bl.nova || 0;
      const hitDmg = bl.dmg;
      dmgCritFlag = !!bl.crit;
      dmgVoidFlag = !!bl.crit && artHas("lg_void");   // 虚無の単眼: 武器の会心も紫の特大数字にする
      const over = damageBlock(idx, bl.dmg, bl.splash);
      dmgCritFlag = false; dmgVoidFlag = false;
      curCoinMul = 1; novaLeft = 0; curFx = null; curCarry = false;
      if (bl.split){   // 分裂: 周囲のブロックへ破片
        const neigh = [];
        for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++){
          if (!dx && !dy) continue;
          const x = gx + dx, y = gy + dy;
          if (blockExists(x, y) && !isDestroyed(y * D + x)) neigh.push(y * D + x);
        }
        for (let k = 0; k < bl.split && neigh.length; k++){
          const j = neigh.splice((Math.random() * neigh.length) | 0, 1)[0];
          damageBlock(j, hitDmg * 0.4, 0);
        }
      }
      // 貫通・跳弾は「威力を落とさずにもう1個」。使い切ったあとは、余剰ダメージを持ったまま奥へ進み続ける
      if (bl.pierce > 0){ bl.pierce--; bl.lastHit = idx; }   // 貫通: 死なない (大口径で威力増)
      else if (bl.bounce > 0){                                     // 跳弾: 別のブロックへ
        const nxt = findNearestBlocks(bl.x, bl.y, 170, 1, new Set([idx]))[0];
        if (nxt !== undefined){
          const spd = Math.hypot(bl.vx, bl.vy);
          const a = Math.atan2(g2w((nxt / D) | 0) - bl.y, g2w(nxt % D) - bl.x);
          bl.vx = Math.cos(a) * spd; bl.vy = Math.sin(a) * spd;
          bl.x += bl.vx * 0.03; bl.y += bl.vy * 0.03;
          bl.bounce--; bl.lastHit = idx;
        } else if (over > 0.01){ bl.dmg = over; bl.lastHit = idx; }
        else dead = true;
      }
      else if (over > 0.01){ bl.dmg = over; bl.lastHit = idx; }   // 余剰ダメージ: 壊して余った威力で、奥のブロックへ
      else dead = true;
      curPl = false; curEcho = false;
      if (dead && bl.frags && bullets.length < 900){   // クラスター: 子弾をばらまく
        const life = 0.28 / BULLET_SPD_MUL;
        for (let k = 0; k < bl.frags; k++){
          const a = Math.random() * Math.PI * 2;
          bullets.push({ x:bl.x, y:bl.y, vx:Math.cos(a)*600*BULLET_SPD_MUL, vy:Math.sin(a)*600*BULLET_SPD_MUL, dmg:hitDmg * (bl.fx.fragDmg || 0.5), splash:0, life, lastHit:idx, color:bl.color, pl:bl.pl, child:true, fx:bl.fx, shape:"spark", sz:3 });
        }
      }
    }
    if (dead) removeBulletAt(i);
  }
  pruneFx(now);

  // --- コインの合体: 密集して静止したコインを 0.25 秒ごとに間引いて大きな1枚にする ---
  coinMergeT -= dt; if (coinMergeT <= 0){ coinMergeT = 0.25; mergeCoinsPass(); }

  // --- coins (player magnet / coin-bot vacuum, yellow) ---
  // 距離の比較は2乗のまま行い、平方根は必要なときだけ取る
  const goldSing = artHas("lg_gold");   // 黄金の特異点: 吸引範囲 ×6・吸引力も大幅アップ
  const mr = magnetRange() * (goldSing ? 6 : 1), mr2 = mr * mr, vac = coinBotVacuum(), vac2 = vac * vac, pull = coinBotPull(), touch2 = coinBotTouchR() ** 2;
  const pPull = goldSing ? 9000 : 1400;
  const damp = Math.pow(0.92, dt * 60);   // フレームレートに依らない減衰 (60fps で従来の 0.92)
  for (let i = coinsArr.length - 1; i >= 0; i--){
    const c = coinsArr[i];
    let collected = false;
    const dx = player.x - c.x, dy = player.y - c.y, d2 = dx * dx + dy * dy;
    c.age = (c.age || 0) + dt;
    if (d2 < mr2){ const d = Math.sqrt(d2) || 1; c.vx += dx / d * pPull * dt; c.vy += dy / d * pPull * dt; }
    if (d2 < 676) collected = true;
    if (!collected){
      for (const cb of coinBots){
        const bx = cb.x - c.x, by = cb.y - c.y, bd2 = bx * bx + by * by;
        if (bd2 < vac2){ const bd = Math.sqrt(bd2) || 1; c.vx += bx / bd * pull * dt; c.vy += by / bd * pull * dt; }
        if (bd2 < touch2){ collected = 2; break; }   // 2 = 回収ボットが拾った
      }
    }
    c.vx *= damp; c.vy *= damp;
    c.x += c.vx * dt; c.y += c.vy * dt;
    if (collected){
      gainCoin(c, collected === 2);
      removeCoinAt(i); hudDirty = true;
    }
  }

  if (dmgFlushT <= 0){ dmgFlushT = 0.15; flushDmgLabels(); }

  draw(now);

  // --- target HP bar ---
  updateTargetBar();

  uiT -= dt; hudT -= dt;
  if (uiT <= 0){ uiT = 0.25; renderPanels(); updateHUD(); hudDirty = false; }
  else if (hudDirty && hudT <= 0){ hudT = 0.1; hudDirty = false; updateHUD(); }
  saveT -= dt; if (saveT <= 0){ saveT = 5; save(); }
  worldT -= dt; if (worldT <= 0){ worldT = 8; flushWorld(); }   // 惑星の破壊状況 (差分のみ)
}


// ---------- ダメージ数値の表示 (0.15秒ごとに集計し、上位だけを出す) ----------
// 毎ヒット表示すると大量ヒットで埋もれて重くなるので、ブロック単位で貯めた合計を
// 0.15秒に1回だけ・同時に最大8件まで・表示中は最大42件までに絞る。文字列化と
// フォント決定はこの発行時に1回だけ行い、描画中は測り直さない。
let dmgFlushT = 0;
function flushDmgLabels(){
  if (!dmgAcc.size && !mobDmgAcc.size) return;
  if (dmgAcc.size){
  let cand = null;
  if (dmgAcc.size > 8){
    cand = [...dmgAcc.entries()].sort((a, b) => b[1].total - a[1].total);
  }
  let emitted = 0;
  // 重なり回避の目安 (ワールド座標)。画面上で横34px・縦14pxぶん離す
  const minDx = 34 / zoom, minDy = 14 / zoom;
  const emit = (idx, e) => {
    if (dmgLabels.length < MAX_DMG_LABELS){
      const d = dmgPool.pop() || {};
      const h = (idx * 2654435761) >>> 8;
      // 重ならないよう格子状のスロットへ割り当てる: 近くに既にあるラベルの数で置き場所が決まる (決定的・総当たり1回で軽い)
      let near = 0;
      for (const o of dmgLabels){ if (Math.abs(o.x - e.x) <= minDx * 1.5 && o.y <= e.y + minDy && o.y >= e.y - minDy * 5.5) near++; }
      const slot = Math.min(near, 7);
      d.x = e.x + DMG_GRID_X[slot] * minDx;
      d.y = e.y - DMG_GRID_Y[slot] * minDy;
      d.text = fmtDmg(e.total);
      d.crit = e.crit; d.void = !!e.void;
      d.fs = e.void ? 24 : e.crit ? 19 : e.total >= e.max * 0.35 ? 15 : 13;
      d.color = e.void ? "#c77dff" : e.crit ? "#ffa726" : "#ffffff";   // 金色は廃止。通常=白、クリティカル=オレンジ、虚無の単眼=紫・特大
      d.vy = 26 + (h >> 4) % 19;   // 上昇速度にもばらつきを持たせ、浮かぶ間にも離れていく
      d.t = nowMs;
      dmgLabels.push(d);
    }
    emitted++;
  };
  if (cand){ for (let i = 0; i < cand.length && emitted < 8; i++) emit(cand[i][0], cand[i][1]); }
  else for (const [idx, e] of dmgAcc) emit(idx, e);
  for (const e of dmgAcc.values()) dmgEntryPool.push(e);
  dmgAcc.clear();
  }
  // モンスター分: 頭上に表示 (多い時は合計の大きい順に6件まで)
  if (mobDmgAcc.size){
    const list = [...mobDmgAcc.values()].sort((x, y) => y.total - x.total);
    let n = 0;
    for (const e of list){
      if (n >= 6 || dmgLabels.length >= MAX_DMG_LABELS) break;
      const m = e.m, d = dmgPool.pop() || {};
      d.x = m.x + ((m.id * 37) % 13) - 6;
      d.y = m.y - m.type.r - 6;
      d.text = fmtDmg(e.total);
      d.crit = e.crit; d.void = !!e.void;
      d.fs = e.void ? 23 : e.crit ? 19 : 15;
      d.color = e.void ? "#c77dff" : e.crit ? "#ffa726" : "#ffffff";
      d.vy = 30 + (m.id * 13) % 17;
      d.t = nowMs;
      dmgLabels.push(d); n++;
    }
    mobDmgAcc.clear();
  }
}

// ---------- 狙っているブロックの HP バー (値が変わったときだけ DOM を書き換える) ----------
const tbEl = { bar: $("targetBar"), text: $("targetText"), fill: $("targetFill"), pct: $("targetPct"), sub: $("targetSub") };
let tbShown = null, tbText = "", tbWidth = "", tbPct = "", tbMatKey = "";
function updateTargetBar(){
  // モンスター優先 (照準と同じ): 射程内にいれば名前とHPを上部バーに表示
  const mob = nearestMob(player.x, player.y, atkRange());
  let show = false, nameText = "", dimText = "", ratio = 0;
  if (mob){
    show = true;
    const key = "mob:" + mob.type.name + ":" + mob.sat;
    if (key !== tbMatKey){
      tbMatKey = key;
      tbEl.bar.style.setProperty("--tc", mob.type.color);
      tbEl.sub.textContent = `モンスター ・ ${SATS[mob.sat].name}`;
    }
    nameText = `${mob.type.name}  HP ${fmtDmg(Math.max(0, mob.hp))}`;
    dimText = ` / ${fmtDmg(mob.maxHp)}`;
    ratio = Math.max(0, mob.hp / mob.maxHp);
  } else {
    const tIdx = findNearestBlock(player.x, player.y, atkRange());
    if (tIdx >= 0){
      show = true;
      const tMax = blockMaxHP(tIdx % D, (tIdx / D) | 0), tCur = blockHP(tIdx);
      const tm = MATS[materialAt(tIdx % D, (tIdx / D) | 0)];
      if (tm.key !== tbMatKey){   // 素材が変わったときだけ色と補足情報を差し替える
        tbMatKey = tm.key;
        tbEl.bar.style.setProperty("--tc", tm.color);
        tbEl.sub.textContent = `${MAT_CATS[tm.cat].name} ・ ${LAYERS[tm.layer].name}`;
      }
      nameText = `${tm.name}  HP ${fmtDmg(Math.max(0, tCur))}`;
      dimText = ` / ${fmtDmg(tMax)}`;
      ratio = Math.max(0, tCur / tMax);
    }
  }
  if (show !== tbShown){ tbShown = show; tbEl.bar.style.display = show ? "block" : "none"; }
  if (!show) return;
  const text = nameText + dimText;
  if (text !== tbText){
    tbText = text;
    tbEl.text.innerHTML = "";
    const name = document.createElement("span"); name.textContent = nameText;
    const dim = document.createElement("span"); dim.className = "hp-dim"; dim.textContent = dimText;
    tbEl.text.append(name, dim);
  }
  const pct = (ratio * 100).toFixed(1) + "%";
  if (pct !== tbPct){ tbPct = pct; tbEl.pct.textContent = pct; }
  const width = (ratio * 100).toFixed(1) + "%";
  if (width !== tbWidth){ tbWidth = width; tbEl.fill.style.width = width; }
}

// ---------- 弾・演出の後片付け ----------
// 弾は順番を保たず末尾と入れ替えて消す (splice の詰め直しをしない)
function removeBulletAt(i){
  const tail = bullets.pop();
  if (i < bullets.length) bullets[i] = tail;
}
// 寿命切れのビーム / リングを一度に詰め、上限を超えた古いものも捨てる
function pruneFx(now){
  let w = 0;
  for (let i = 0; i < beams.length; i++){ const b = beams[i]; if (now - b.t <= (b.life || 60)) beams[w++] = b; }
  beams.length = w;
  if (w > MAX_BEAMS) beams.splice(0, w - MAX_BEAMS);
  w = 0;
  for (let i = 0; i < rings.length; i++){ const r = rings[i]; if (now - r.t <= (r.dur || 350)) rings[w++] = r; }
  rings.length = w;
  if (w > MAX_RINGS) rings.splice(0, w - MAX_RINGS);
  w = 0;
  for (let i = 0; i < bursts.length; i++){ const b = bursts[i]; if (now - b.t <= 420) bursts[w++] = b; }
  bursts.length = w;
  w = 0;
  for (let i = 0; i < labels.length; i++){ const l = labels[i]; if (now - l.t <= 1100) labels[w++] = l; }
  labels.length = w;
  w = 0;
  for (let i = 0; i < dmgLabels.length; i++){ const d = dmgLabels[i]; if (now - d.t <= DMG_LABEL_TTL) dmgLabels[w++] = d; else dmgPool.push(d); }
  dmgLabels.length = w;
}

// ---------- 自動画質調整 ----------
// 高解像度ディスプレイで描画が追いつかないとき (平均 40fps 未満が約3秒続いたら)、
// キャンバスの解像度を 1倍に落とす。十分軽くなったら (20秒以上 55fps 超) 元に戻す (戻すのは1回まで)
let dprCap = 2, frameEMA = 16.7, slowFrames = 0, fastFrames = 0, dprRestores = 0;
function trackFrameRate(ms){
  if (!(ms > 0) || ms > 100) return;           // 裏タブ復帰などの異常値は無視
  frameEMA += (ms - frameEMA) * 0.05;
  if (dprCap > 1 && (window.devicePixelRatio || 1) > 1){
    slowFrames = frameEMA > 25 ? slowFrames + 1 : 0;
    if (slowFrames > 120){ dprCap = 1; slowFrames = fastFrames = 0; resize(); }
  } else if (dprCap === 1 && dprRestores < 1){
    fastFrames = frameEMA < 18 ? fastFrames + 1 : 0;
    if (fastFrames > 1200){ dprCap = 2; dprRestores++; fastFrames = slowFrames = 0; resize(); }
  }
}

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

// ---------- drawing ----------
function draw(now){
  ctx.fillStyle = "#000"; ctx.fillRect(0, 0, CW, CH);
  ctx.save();
  const camX = player.x, camY = player.y;
  const halfW = CW / 2 / zoom, halfH = CH / 2 / zoom;

  // stars (parallax)
  ctx.fillStyle = "#fff";
  for (let i = 0; i < 40; i++){
    const sx = ((i * 373.7 - camX * 0.3) % CW + CW) % CW, sy = ((i * 517.3 - camY * 0.3) % CH + CH) % CH;
    ctx.globalAlpha = 0.25 + (i % 3) * 0.2; ctx.fillRect(sx, sy, 2, 2);
  }
  ctx.globalAlpha = 1;

  // atmosphere glow
  {
    const [acx, acy] = [(0 - camX) * zoom + CW/2, (0 - camY) * zoom + CH/2];
    const ar = R * BS * zoom;
    if (ar < 30000){
      ctx.strokeStyle = "rgba(90,170,255,.35)"; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(acx, acy, ar + 10 * zoom + 4, 0, 7); ctx.stroke(); ctx.lineWidth = 1;
    }
  }

  // blocks in view (LOD sampling when zoomed out)
  const gx0 = Math.max(0, w2g(camX - halfW)), gx1 = Math.min(D - 1, w2g(camX + halfW));
  const gy0 = Math.max(0, w2g(camY - halfH)), gy1 = Math.min(D - 1, w2g(camY + halfH));
  const px = BS * zoom;
  const step = px >= 5 ? 1 : Math.max(1, Math.ceil(5 / px));
  if (gx0 <= gx1 && gy0 <= gy1) drawBlocks(now, camX, camY, px, step, gx0, gy0, gx1, gy1);
  else if (flashes.size) flashes.clear();

  const toScreen = (x, y) => [(x - camX) * zoom + CW/2, (y - camY) * zoom + CH/2];

  // coins : yellow (高額コインほど大きく・明るく)
  // 1枚ずつ円・文字を描かず、事前に描いた画像 (スプライト) を貼るだけにする
  const ox = CW / 2 - camX * zoom, oy = CH / 2 - camY * zoom;
  for (const c of coinsArr){
    const sx = c.x * zoom + ox, sy = c.y * zoom + oy;
    if (sx < -30 || sy < -30 || sx > CW + 30 || sy > CH + 30) continue;
    const sp = coinSpriteFor(c);
    // ハロー段階 (100万〜) はゆっくり脈動させて「特別な1枚」だと伝える。age 由来なので追加の状態を持たない
    const sz = c.value >= 1000000 && !c.chest ? sp.size * (1 + 0.05 * Math.sin((c.age || 0) * 2.4)) : sp.size;
    const h = sz / 2;
    ctx.drawImage(sp.cv, sx - h, sy - h, sz, sz);
  }
  // beams
  for (const b of beams){
    const [x1,y1] = toScreen(b.x1,b.y1), [x2,y2] = toScreen(b.x2,b.y2);
    ctx.strokeStyle = b.color || "rgba(255,255,255,.85)"; ctx.lineWidth = b.w || 2;
    ctx.beginPath(); ctx.moveTo(x1,y1);
    if (b.zig){   // 稲妻: 途中を毎フレームずらしてギザギザに
      const nx = -(y2 - y1), ny = x2 - x1, len = Math.hypot(nx, ny) || 1;
      for (let k = 1; k <= 3; k++){
        const j = (Math.random() - .5) * Math.min(18, len * 0.35);
        ctx.lineTo(x1 + (x2 - x1) * k / 4 + nx / len * j, y1 + (y2 - y1) * k / 4 + ny / len * j);
      }
    }
    ctx.lineTo(x2,y2); ctx.stroke();
  }
  ctx.lineWidth = 1;
  // aura rings
  for (const r of rings){
    const age = Math.min(1, (now - r.t) / (r.dur || 350)), [rx, ry] = toScreen(r.x, r.y);
    ctx.strokeStyle = `rgba(${r.color || "155,225,93"},${0.75 * (1 - age)})`; ctx.lineWidth = r.color ? 3 : 2;
    ctx.beginPath(); ctx.arc(rx, ry, r.r * zoom * (0.35 + 0.65 * age), 0, 7); ctx.stroke(); ctx.lineWidth = 1;
  }
  // 破壊バースト (武器ごとの効果)
  for (const b of bursts){
    const p = (now - b.t) / 380; if (p < 0 || p > 1) continue;
    const [bx, by] = toScreen(b.x, b.y), fade = 1 - p, u = BS * zoom;
    const rnd = i => { const v = Math.sin(b.seed * 127.1 + i * 311.7) * 43758.5453; return v - Math.floor(v); };
    ctx.fillStyle = b.c; ctx.strokeStyle = b.c;
    switch (b.style){
      case "ring": ctx.globalAlpha = fade; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(bx, by, u * (0.3 + 1.15 * p), 0, 7); ctx.stroke(); ctx.strokeStyle = b.c2; ctx.beginPath(); ctx.arc(bx, by, u * (0.18 + 0.7 * p), 0, 7); ctx.stroke(); break;
      case "dots": ctx.globalAlpha = fade; for (let i = 0; i < 7; i++){ const a = rnd(i) * 6.283, d = u * (0.25 + 1.25 * p) * (0.4 + rnd(i + 9)); ctx.beginPath(); ctx.arc(bx + Math.cos(a) * d, by + Math.sin(a) * d, 1.5 + rnd(i + 20) * 2, 0, 7); ctx.fill(); } break;
      case "shard": ctx.globalAlpha = fade; for (let i = 0; i < 5; i++){ const a = rnd(i) * 6.283, d = u * (0.2 + 1.1 * p) * (0.5 + rnd(i + 7)); ctx.save(); ctx.translate(bx + Math.cos(a) * d, by + Math.sin(a) * d); ctx.rotate(a + p * 5); ctx.fillRect(-2.5, -2.5, 5, 5); ctx.restore(); } break;
      case "petal": ctx.globalAlpha = fade * 0.9; for (let i = 0; i < 5; i++){ const a = rnd(i) * 6.283, d = u * (0.2 + 0.9 * p); ctx.save(); ctx.translate(bx + Math.cos(a) * d, by + Math.sin(a) * d - u * 0.3 * p); ctx.rotate(a + p * 3); ctx.beginPath(); ctx.ellipse(0, 0, 5, 2.5, 0, 0, 7); ctx.fill(); ctx.restore(); } break;
      case "bubble": ctx.globalAlpha = fade; ctx.lineWidth = 1.5; for (let i = 0; i < 5; i++){ const a = rnd(i) * 6.283, d = u * 0.5 * rnd(i + 3); ctx.beginPath(); ctx.arc(bx + Math.cos(a) * d, by + Math.sin(a) * d - u * 0.7 * p, 4 + 5 * p * rnd(i + 11), 0, 7); ctx.stroke(); } break;
      case "snow": ctx.globalAlpha = fade; ctx.lineWidth = 2; ctx.strokeStyle = b.c2; for (let k = 0; k < 3; k++){ const a = k * Math.PI / 3 + p * 0.8, r = u * (0.55 - 0.25 * p); ctx.beginPath(); ctx.moveTo(bx - Math.cos(a) * r, by - Math.sin(a) * r); ctx.lineTo(bx + Math.cos(a) * r, by + Math.sin(a) * r); ctx.stroke(); } break;
      case "ember": for (let i = 0; i < 6; i++){ const a = rnd(i) * 6.283, d = u * 0.5 * rnd(i + 5); ctx.globalAlpha = fade * (0.5 + 0.5 * Math.sin(now / 40 + i * 2)); ctx.fillStyle = i % 2 ? b.c2 : b.c; ctx.beginPath(); ctx.arc(bx + Math.cos(a) * d, by + Math.sin(a) * d - u * 0.9 * p, 2, 0, 7); ctx.fill(); } break;
      case "star": ctx.globalAlpha = fade; ctx.fillStyle = b.c2; ctx.beginPath(); { const R1 = u * (0.3 + 0.9 * p); for (let k = 0; k < 8; k++){ const r = k & 1 ? R1 * 0.32 : R1, t = k * Math.PI / 4 - Math.PI / 2; ctx.lineTo(bx + Math.cos(t) * r, by + Math.sin(t) * r); } } ctx.closePath(); ctx.fill(); break;
      default: ctx.globalAlpha = fade; ctx.lineWidth = 2; for (let i = 0; i < 8; i++){ const a = i * Math.PI / 4 + rnd(0) * 0.5, r1 = u * (0.15 + 0.35 * p), r2 = u * (0.4 + 1.05 * p); ctx.beginPath(); ctx.moveTo(bx + Math.cos(a) * r1, by + Math.sin(a) * r1); ctx.lineTo(bx + Math.cos(a) * r2, by + Math.sin(a) * r2); ctx.stroke(); } break;
    }
    ctx.globalAlpha = 1; ctx.lineWidth = 1;
  }
  // bullets (crit は黄色く大きく / リサイクルの弾はコインそのもの)
  for (const bl of bullets){
    const sx = bl.x * zoom + ox, sy = bl.y * zoom + oy, m = bl.orb ? bl.orb * zoom + 8 : 12;
    if (sx < -m || sy < -m || sx > CW + m || sy > CH + m) continue;   // 画面外の弾は描かない
    if (bl.orb){   // 重力球: 黒い核 + 渦を巻く紫の輪
      const rr = bl.orb * zoom, sp = now / 140;
      ctx.beginPath(); ctx.arc(sx, sy, Math.max(3, rr * 0.3), 0, 7); ctx.fillStyle = "#000"; ctx.fill();
      ctx.strokeStyle = bl.color; ctx.lineWidth = 2; ctx.stroke();
      ctx.lineWidth = 1.5;
      for (let k = 0; k < 3; k++){
        ctx.beginPath(); ctx.arc(sx, sy, rr * (0.5 + k * 0.25), sp + k * 2.1, sp + k * 2.1 + 2.2);
        ctx.strokeStyle = `rgba(180,140,255,${0.8 - k * 0.22})`; ctx.stroke();
      }
      ctx.lineWidth = 1;
    }
    else drawBullet(bl, sx, sy, now);
  }
  drawMobs(toScreen, zoom);   // モンスター・敵弾
  drawChests(toScreen, zoom);   // 宝箱
  // 浮かぶ文字 (素材ラベル / ダメージ数値)
  if (labels.length){
    // 素材ラベル: 暗いピル + 素材色の縁とチップ + 明るくした太字。白い氷原でも黒い宇宙でも読める
    ctx.textBaseline = "bottom";
    for (const l of labels){
      const age = (now - l.t) / 1100, sx = l.x * zoom + ox, sy = l.y * zoom + oy - 16 - age * 34;
      if (sx < -110 || sy < -24 || sx > CW + 110 || sy > CH + 24) continue;
      ctx.globalAlpha = Math.max(0, 1 - Math.max(0, age - 0.55) / 0.45);
      const pw = l.w + 31, ph = l.fs + 10, x0 = sx - pw / 2, y0 = sy - ph + 4;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(x0, y0, pw, ph, 7); else ctx.rect(x0, y0, pw, ph);
      ctx.fillStyle = "rgba(5,8,12,.68)"; ctx.fill();
      ctx.strokeStyle = l.chip; ctx.lineWidth = 1.2; ctx.stroke();
      ctx.fillStyle = l.chip; ctx.fillRect(x0 + 7, sy - l.fs - 1, 9, 9);   // 素材色のチップ
      ctx.strokeStyle = "rgba(255,255,255,.75)"; ctx.lineWidth = 1; ctx.strokeRect(x0 + 7.5, sy - l.fs - 0.5, 8, 8);
      ctx.font = MAT_LABEL_FONT(l.fs); ctx.textAlign = "left";
      ctx.lineJoin = "round"; ctx.lineWidth = 3; ctx.strokeStyle = "rgba(0,0,0,.85)";
      ctx.strokeText(l.text, x0 + 21, sy);
      ctx.fillStyle = l.color; ctx.fillText(l.text, x0 + 21, sy);
    }
    ctx.globalAlpha = 1; ctx.textAlign = "start"; ctx.textBaseline = "alphabetic"; ctx.lineWidth = 1;
  }
  if (dmgLabels.length){
    // ダメージ数値: 黒の太い縁取り + 白 (クリティカルはオレンジ・大)。数字は等幅で読みやすく
    ctx.textAlign = "center"; ctx.textBaseline = "bottom"; ctx.lineJoin = "round";
    for (const d of dmgLabels){
      const age = (now - d.t) / DMG_LABEL_TTL, sx = d.x * zoom + ox, sy = d.y * zoom + oy - 8 - age * d.vy;
      if (sx < -70 || sy < -20 || sx > CW + 70 || sy > CH + 20) continue;
      ctx.globalAlpha = Math.max(0, 1 - Math.max(0, age - 0.6) / 0.4);
      ctx.font = DMG_FONT(d.fs);
      ctx.lineWidth = Math.max(3, d.fs / 4); ctx.strokeStyle = "rgba(0,0,0,.88)";
      ctx.strokeText(d.text, sx, sy);
      ctx.fillStyle = d.color; ctx.fillText(d.text, sx, sy);
    }
    ctx.globalAlpha = 1; ctx.textAlign = "start"; ctx.textBaseline = "alphabetic"; ctx.lineWidth = 1;
  }

  skillsDraw(now, toScreen);   // スキルの設置物・継続効果

  // ---- units: 種類ごとにシルエットを描き分ける ----
  // 自機: 三角の矢じり型
  function ship(x, y, a, s){
    const [sx, sy] = toScreen(x, y);
    ctx.save(); ctx.translate(sx, sy); ctx.rotate(a); ctx.scale(s, s);
    ctx.strokeStyle = "#fff"; ctx.beginPath();
    ctx.moveTo(12, 0); ctx.lineTo(-9, -8); ctx.lineTo(-5, 0); ctx.lineTo(-9, 8); ctx.closePath(); ctx.stroke();
    ctx.restore();
  }
  // 攻撃ボット: 四角い機体 + 砲身 (無骨なメカ)
  function attackBotShape(x, y, a, accent){
    const [sx, sy] = toScreen(x, y);
    ctx.save(); ctx.translate(sx, sy); ctx.rotate(a);
    ctx.strokeStyle = "#fff";
    ctx.strokeRect(-8, -8, 16, 16);                    // 角ばった胴体
    ctx.beginPath(); ctx.moveTo(8, 0); ctx.lineTo(15, 0); ctx.stroke();  // 砲身
    ctx.beginPath(); ctx.arc(0, 0, 3, 0, 7); ctx.stroke();               // コア
    if (accent){ ctx.fillStyle = accent; ctx.beginPath(); ctx.arc(0, 0, 1.8, 0, 7); ctx.fill(); }   // 装備の色
    ctx.beginPath(); ctx.moveTo(-8, -11); ctx.lineTo(-8, -8); ctx.moveTo(-8, 8); ctx.lineTo(-8, 11); ctx.stroke(); // 後部フィン
    ctx.restore();
  }
  // コイン回収ボット: 丸いドローン (黄色) + 回る外周ドット
  function coinBotShape(x, y, a, spin){
    const [sx, sy] = toScreen(x, y);
    ctx.save(); ctx.translate(sx, sy);
    ctx.strokeStyle = "#ffd60a";
    ctx.beginPath(); ctx.arc(0, 0, 8.5, 0, 7); ctx.stroke();             // 丸い本体
    ctx.beginPath(); ctx.arc(0, 0, 3.2, 0, 7); ctx.stroke();             // 内側リング
    ctx.fillStyle = "#ffd60a";
    for (let k = 0; k < 3; k++){                                          // 周囲を回るドット
      const t = spin + k * Math.PI * 2 / 3;
      ctx.beginPath(); ctx.arc(Math.cos(t) * 12, Math.sin(t) * 12, 1.6, 0, 7); ctx.fill();
    }
    ctx.restore();
  }
  bots.forEach((b, bi) => { const wk = botWeaponAt(bi); attackBotShape(b.x, b.y, b.angle, wk ? WEAPONS[wk].accent : null); });
  coinBots.forEach((cb, i) => coinBotShape(cb.x, cb.y, cb.angle, now / 350 + i * 1.7));
  // ブースト演出 (シェイクは使わない): 残像は自機と同じ矢じり輪郭を薄く、噴射は事前レンダリング済みスプライト
  const boostVis = boostOn && started && !cleared && !treeOpen && !artOpen && !mapOpen && !updOpen && !botEqOpen;
  for (let i = boostGhosts.length - 1; i >= 0; i--){
    const g = boostGhosts[i], age = (now - g.t) / 380;
    if (age >= 1){ boostGhosts.splice(i, 1); continue; }
    const [sx, sy] = toScreen(g.x, g.y);
    ctx.save(); ctx.translate(sx, sy); ctx.rotate(g.a);
    ctx.strokeStyle = `rgba(125,249,255,${0.5 * (1 - age)})`; ctx.beginPath();
    ctx.moveTo(12, 0); ctx.lineTo(-9, -8); ctx.lineTo(-5, 0); ctx.lineTo(-9, 8); ctx.closePath(); ctx.stroke();
    ctx.restore();
  }
  for (let i = boostParts.length - 1; i >= 0; i--){
    const p = boostParts[i], ageMs = now - p.t, age = ageMs / p.life;
    if (age >= 1){ boostParts.splice(i, 1); continue; }
    const [sx, sy] = toScreen(p.x + p.vx * ageMs / 1000, p.y + p.vy * ageMs / 1000);
    ctx.globalAlpha = 0.75 * (1 - age);
    ctx.drawImage(boostFlameSpr, sx - 8, sy - 8, 16, 16);
  }
  ctx.globalAlpha = 1;
  ship(player.x, player.y, player.angle, 1);
  drawArtifactsFx(now, toScreen);   // LEGENDARY の常時演出 (残像 / オーラ / きらめき / サイコロ)
  if (boostVis){
    // 画面端のスピードライン: 端の帯だけに、進行方向と逆向きの短い線を流す
    ctx.strokeStyle = "rgba(160,240,255,.35)"; ctx.lineWidth = 2;
    const dirx = Math.cos(player.angle), diry = Math.sin(player.angle), tick = (now / 90) | 0;
    for (let i = 0; i < 10; i++){
      const s1 = Math.sin(i * 77.7 + tick * 13.3) * 43758.5453, fr = s1 - Math.floor(s1);
      const s2 = Math.sin(i * 31.7 + tick * 7.1) * 24634.6345, fr2 = s2 - Math.floor(s2);
      const ex = fr * CW, ey = fr2 * CH;
      if (Math.min(ex, CW - ex, ey, CH - ey) > 130) continue;   // 中央は空ける
      const ln = 26 + fr * 30;
      ctx.beginPath(); ctx.moveTo(ex, ey); ctx.lineTo(ex - dirx * ln, ey - diry * ln); ctx.stroke();
    }
    ctx.lineWidth = 1;
    // BOOST 表示 (自機は常に画面中央)
    ctx.font = "700 13px system-ui, sans-serif"; ctx.textAlign = "center";
    ctx.fillStyle = "rgba(125,249,255,.95)";
    ctx.fillText("» BOOST «", CW / 2, CH / 2 - 26);
    ctx.textAlign = "start";
  }

  // range rings
  const [pcx, pcy] = toScreen(player.x, player.y);
  ctx.strokeStyle = "rgba(255,255,255,.14)";
  ctx.beginPath(); ctx.arc(pcx, pcy, atkRange() * zoom, 0, 7); ctx.stroke();
  ctx.strokeStyle = "rgba(255,214,10,.20)";
  ctx.beginPath(); ctx.arc(pcx, pcy, magnetRange() * zoom, 0, 7); ctx.stroke();
  ctx.restore();

  // --- カーソル下のブロック: 枠 + 素材名とHPのツールチップ ---
  hoverInfo = null;
  if (mouseIn){
    const mw = mouseWorld();
    const gx = Math.floor(mw.x / BS) + GC, gy = Math.floor(mw.y / BS) + GC;
    if (gx >= 0 && gy >= 0 && gx < D && gy < D){
      const cdx = gx - GC, cdy = gy - GC, idx = gy * D + gx;
      if (blockExists(gx, gy) && !isDestroyed(idx)){
        const m = MATS[materialAt(gx, gy)], max = blockMaxHP(gx, gy), cur = blockHP(idx);
        hoverInfo = { gx, gy, name: m.name, color: m.color, cur, max };
        const bz = BS * zoom;
        if (bz >= 3){ ctx.strokeStyle = "rgba(255,255,255,.85)"; ctx.lineWidth = 1.5; ctx.strokeRect((gx - GC) * BS * zoom + ox + .5, (gy - GC) * BS * zoom + oy + .5, bz - 1, bz - 1); ctx.lineWidth = 1; }
        const hpText = `HP ${fmtDmg(cur)} / ${fmtDmg(max)} (${(cur / max * 100).toFixed(1)}%)`;
        ctx.font = "700 13px system-ui, sans-serif";
        const w1 = ctx.measureText(m.name).width;
        ctx.font = "12px ui-monospace, Menlo, monospace";
        const bw = Math.max(w1 + 24, ctx.measureText(hpText).width) + 16, bh = 44;
        let tx = mouseSX + 16, ty = mouseSY + 16;
        if (tx + bw > CW - 4) tx = mouseSX - bw - 8;
        if (ty + bh > CH - 4) ty = mouseSY - bh - 8;
        ctx.fillStyle = "rgba(8,8,12,.88)"; ctx.fillRect(tx, ty, bw, bh);
        ctx.strokeStyle = m.color; ctx.strokeRect(tx + .5, ty + .5, bw - 1, bh - 1);
        ctx.fillStyle = m.color; ctx.fillRect(tx + 8, ty + 9, 10, 10);
        ctx.font = "700 13px system-ui, sans-serif"; ctx.fillStyle = "#fff"; ctx.textAlign = "left";
        ctx.fillText(m.name, tx + 24, ty + 19);
        ctx.font = "12px ui-monospace, Menlo, monospace"; ctx.fillStyle = "rgba(255,255,255,.85)";
        ctx.fillText(hpText, tx + 8, ty + 36);
      }
    }
  }

  if (hurtFlash > 0){ ctx.fillStyle = `rgba(255,45,35,${(hurtFlash * 0.26).toFixed(3)})`; ctx.fillRect(0, 0, CW, CH); }
  else if (started && state.hp < playerMaxHP() * 0.25){ ctx.fillStyle = `rgba(255,45,35,${(0.07 + 0.04 * Math.sin(now / 240)).toFixed(3)})`; ctx.fillRect(0, 0, CW, CH); }
  drawMinimap(now);
}
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

// ---------- 弾の描画 (装備の素材にちなんだ形) ----------
// 形は装備ごとに決まる (core.js の shape)。速い弾は進行方向に尾を引く
function drawBullet(bl, sx, sy, now){
  const pulseF = bl.pulse ? 1 + bl.pulse * 0.35 * Math.sin(now / 90 + (bl.seed || 0)) : 1;
  const z = (bl.sz || 4) * BULLET_SIZE_MUL * pulseF, c = bl.color || "#fff", a = Math.atan2(bl.vy, bl.vx), shape = bl.form || bl.shape || "dot";
  const c2 = bl.c2 || "#ffffff";
  const rot = (bl.spin || 0) * (bl.age || 0) + (bl.seed || 0);
  if (bl.ghost){ for (let g = 0; g < bl.ghost.length; g++){ const gp = bl.ghost[g], gx2 = sx + (gp.x - bl.x) * zoom, gy2 = sy + (gp.y - bl.y) * zoom; ctx.globalAlpha = 0.13 - g * 0.04;
    if (bl.trailFx === "bubble"){ ctx.strokeStyle = c; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(gx2, gy2, Math.max(1, z * (0.7 - g * 0.15)), 0, 7); ctx.stroke(); }
    else if (bl.trailFx === "petal"){ ctx.fillStyle = c; ctx.save(); ctx.translate(gx2, gy2); ctx.rotate((bl.seed || 0) + g); ctx.beginPath(); ctx.ellipse(0, 0, z * 0.55, z * 0.28, 0, 0, 7); ctx.fill(); ctx.restore(); }
    else if (bl.trailFx === "ember"){ ctx.fillStyle = g % 2 ? c2 : "#ff9d3c"; ctx.beginPath(); ctx.arc(gx2, gy2, Math.max(0.8, z * (0.4 - g * 0.09)), 0, 7); ctx.fill(); }
    else if (bl.trailFx === "spark"){ ctx.fillStyle = c2; ctx.fillRect(gx2 - 1.5, gy2 - 1.5, 3, 3); }
    else { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(gx2, gy2, Math.max(0.5, z * (0.8 - g * 0.18)), 0, 7); ctx.fill(); } } ctx.globalAlpha = 1; ctx.lineWidth = 1; }
  if (bl.glow){ ctx.fillStyle = c; ctx.globalAlpha = 0.15; ctx.beginPath(); ctx.arc(sx, sy, z * 2.3, 0, 7); ctx.fill(); ctx.globalAlpha = 1; }
  if (bl.crit){   // クリティカル: 黄色く大きく
    ctx.fillStyle = "#ffe14d"; ctx.beginPath();
    for (let k = 0; k < 8; k++){ const r = k & 1 ? z * 0.5 : z * 1.1, t = now / 90 + k * Math.PI / 4; ctx.lineTo(sx + Math.cos(t) * r, sy + Math.sin(t) * r); }
    ctx.closePath(); ctx.fill(); return;
  }
  switch (shape){
    case "arrow": {   // 矢: 細い線 + 矢じり
      ctx.save(); ctx.translate(sx, sy); ctx.rotate(a);
      ctx.strokeStyle = c; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(-z * 2.2, 0); ctx.lineTo(z * 1.2, 0); ctx.stroke();
      ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(z * 2, 0); ctx.lineTo(z * 0.4, -z * 0.7); ctx.lineTo(z * 0.4, z * 0.7); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,.6)"; ctx.beginPath(); ctx.moveTo(-z * 2.2, 0); ctx.lineTo(-z * 1.5, -z * 0.6); ctx.moveTo(-z * 2.2, 0); ctx.lineTo(-z * 1.5, z * 0.6); ctx.stroke();
      ctx.restore(); ctx.lineWidth = 1; break; }
    case "rock": {    // 岩: ごつごつした多角形 (回転する)
      ctx.save(); ctx.translate(sx, sy); ctx.rotate(now / 180 + (bl.lastHit || 0) + rot);
      ctx.fillStyle = c; ctx.beginPath();
      for (let k = 0; k < 7; k++){ const r = z * (0.7 + 0.3 * ((k * 7919) % 5) / 4), t = k * Math.PI * 2 / 7; ctx.lineTo(Math.cos(t) * r, Math.sin(t) * r); }
      ctx.closePath(); ctx.fill(); ctx.strokeStyle = "rgba(0,0,0,.5)"; ctx.stroke(); ctx.restore(); break; }
    case "grain": {   // 粒: 小さな点が数個
      ctx.fillStyle = c;
      ctx.fillRect(sx - 1, sy - 1, 2.5, 2.5); ctx.fillRect(sx + z * 0.5, sy - z * 0.4, 2, 2); ctx.fillRect(sx - z * 0.6, sy + z * 0.3, 2, 2); break; }
    case "drop": {    // 液体: 涙型 (進行方向に丸く、後ろに尾)
      ctx.save(); ctx.translate(sx, sy); ctx.rotate(a); ctx.fillStyle = c; ctx.beginPath();
      ctx.moveTo(-z * 1.8, 0); ctx.quadraticCurveTo(0, -z * 0.9, z * 0.9, 0); ctx.quadraticCurveTo(0, z * 0.9, -z * 1.8, 0); ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,.55)"; ctx.beginPath(); ctx.arc(z * 0.25, -z * 0.25, z * 0.22, 0, 7); ctx.fill(); ctx.restore(); break; }
    case "shard": case "needle": {   // 氷柱 / 針: 細長いひし形
      ctx.save(); ctx.translate(sx, sy); ctx.rotate(a); ctx.fillStyle = c; ctx.beginPath();
      const L = shape === "needle" ? z * 3 : z * 2.2, W = shape === "needle" ? z * 0.35 : z * 0.6;
      ctx.moveTo(L, 0); ctx.lineTo(0, -W); ctx.lineTo(-L * 0.7, 0); ctx.lineTo(0, W); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,.5)"; ctx.beginPath(); ctx.moveTo(-L * 0.6, 0); ctx.lineTo(L * 0.9, 0); ctx.stroke(); ctx.restore(); break; }
    case "bomb": {    // 爆弾: 丸 + 点滅する導火線
      ctx.fillStyle = c; ctx.beginPath(); ctx.arc(sx, sy, z * 0.9, 0, 7); ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,.6)"; ctx.stroke();
      ctx.fillStyle = (now / 100 | 0) % 2 ? "#fff" : "#ff5a46"; ctx.beginPath(); ctx.arc(sx + z * 0.6, sy - z * 0.9, 1.8, 0, 7); ctx.fill(); break; }
    case "crystal": { // 結晶: 六角形
      ctx.save(); ctx.translate(sx, sy); ctx.rotate(now / 260 + rot); ctx.fillStyle = c; ctx.beginPath();
      for (let k = 0; k < 6; k++){ const t = k * Math.PI / 3; ctx.lineTo(Math.cos(t) * z, Math.sin(t) * z); }
      ctx.closePath(); ctx.fill(); ctx.strokeStyle = "rgba(255,255,255,.7)"; ctx.stroke(); ctx.restore(); break; }
    case "spark": {   // 火花: 十字の線
      ctx.strokeStyle = c; ctx.lineWidth = 1.5; ctx.beginPath();
      const r = z * 1.2, t = now / 60;
      ctx.moveTo(sx + Math.cos(t) * r, sy + Math.sin(t) * r); ctx.lineTo(sx - Math.cos(t) * r, sy - Math.sin(t) * r);
      ctx.moveTo(sx + Math.cos(t + 1.57) * r * 0.6, sy + Math.sin(t + 1.57) * r * 0.6); ctx.lineTo(sx - Math.cos(t + 1.57) * r * 0.6, sy - Math.sin(t + 1.57) * r * 0.6);
      ctx.stroke(); ctx.lineWidth = 1; break; }
    case "disc": {    // 円盤 (金属弾): 円 + ハイライト
      ctx.fillStyle = c; ctx.beginPath(); ctx.arc(sx, sy, z * 0.8, 0, 7); ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,.45)"; ctx.stroke();
      ctx.fillStyle = "rgba(255,255,255,.6)"; ctx.beginPath(); ctx.arc(sx - z * 0.25, sy - z * 0.25, z * 0.25, 0, 7); ctx.fill(); break; }
    case "flame": {   // 炎: ゆらめく三角 + 尾
      ctx.save(); ctx.translate(sx, sy); ctx.rotate(a); const f = 0.8 + 0.4 * Math.sin(now / 40 + sx);
      ctx.fillStyle = "rgba(255,120,40,.45)"; ctx.beginPath(); ctx.moveTo(z, 0); ctx.lineTo(-z * 2.6 * f, -z * 0.9); ctx.lineTo(-z * 2.6 * f, z * 0.9); ctx.closePath(); ctx.fill();
      ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(z * 0.9, 0); ctx.lineTo(-z * 1.4 * f, -z * 0.5); ctx.lineTo(-z * 1.4 * f, z * 0.5); ctx.closePath(); ctx.fill();
      ctx.fillStyle = "#fff8c0"; ctx.beginPath(); ctx.arc(0, 0, z * 0.3, 0, 7); ctx.fill(); ctx.restore(); break; }
    case "star": {    // 星: 5芒星
      ctx.save(); ctx.translate(sx, sy); ctx.rotate(now / 200 + rot); ctx.fillStyle = c; ctx.beginPath();
      for (let k = 0; k < 10; k++){ const r = k & 1 ? z * 0.5 : z * 1.2, t = k * Math.PI / 5 - Math.PI / 2; ctx.lineTo(Math.cos(t) * r, Math.sin(t) * r); }
      ctx.closePath(); ctx.fill(); ctx.restore(); break; }
    case "ring": {    // 輪: 中空の円
      ctx.strokeStyle = c; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(sx, sy, z * 0.9, 0, 7); ctx.stroke();
      ctx.fillStyle = c; ctx.beginPath(); ctx.arc(sx, sy, z * 0.25, 0, 7); ctx.fill(); ctx.lineWidth = 1; break; }
    case "cube": {    // 重い弾: 斜めの四角 + 影
      ctx.save(); ctx.translate(sx, sy); ctx.rotate(a + Math.PI / 4);
      ctx.fillStyle = "rgba(0,0,0,.5)"; ctx.fillRect(-z * 0.7 + 1.5, -z * 0.7 + 1.5, z * 1.4, z * 1.4);
      ctx.fillStyle = c; ctx.fillRect(-z * 0.7, -z * 0.7, z * 1.4, z * 1.4);
      ctx.strokeStyle = "rgba(255,255,255,.5)"; ctx.strokeRect(-z * 0.7, -z * 0.7, z * 1.4, z * 1.4); ctx.restore(); break; }
    case "orb": {     // 光球: 淡いにじみ + 芯
      ctx.fillStyle = hexA(c, 0.28); ctx.beginPath(); ctx.arc(sx, sy, z * 1.7, 0, 7); ctx.fill();
      ctx.fillStyle = c; ctx.beginPath(); ctx.arc(sx, sy, z * 0.7, 0, 7); ctx.fill();
      ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(sx, sy, z * 0.3, 0, 7); ctx.fill(); break; }
    case "bolt": {    // 雷: ギザギザの線
      ctx.save(); ctx.translate(sx, sy); ctx.rotate(a); ctx.strokeStyle = c; ctx.lineWidth = 1.8; ctx.beginPath();
      ctx.moveTo(-z * 2, 0); ctx.lineTo(-z * 0.7, -z * 0.7); ctx.lineTo(z * 0.2, z * 0.5); ctx.lineTo(z * 1.8, 0); ctx.stroke(); ctx.restore(); ctx.lineWidth = 1; break; }
    case "gear": {    // 歯車 (ドリル): 回転する歯
      ctx.save(); ctx.translate(sx, sy); ctx.rotate(now / 45 + rot); ctx.fillStyle = c; ctx.beginPath();
      for (let k = 0; k < 16; k++){ const r = k & 1 ? z * 0.75 : z * 1.15, t = k * Math.PI / 8; ctx.lineTo(Math.cos(t) * r, Math.sin(t) * r); }
      ctx.closePath(); ctx.fill(); ctx.fillStyle = "rgba(0,0,0,.6)"; ctx.beginPath(); ctx.arc(0, 0, z * 0.3, 0, 7); ctx.fill(); ctx.restore(); break; }
    case "moon": {    // 三日月 (ブーメラン): 回転する弧
      ctx.save(); ctx.translate(sx, sy); ctx.rotate(now / 50 + rot); ctx.strokeStyle = c; ctx.lineWidth = 2.2; ctx.lineCap = "round";
      ctx.beginPath(); ctx.arc(0, 0, z * 1.1, -0.9, 0.9); ctx.stroke(); ctx.lineCap = "butt"; ctx.lineWidth = 1; ctx.restore(); break; }
    case "skull": {   // 骸骨: 丸 + 2つの黒い目
      ctx.fillStyle = c; ctx.beginPath(); ctx.arc(sx, sy, z * 0.9, 0, 7); ctx.fill();
      ctx.fillStyle = "#000"; ctx.fillRect(sx - z * 0.5, sy - z * 0.3, z * 0.35, z * 0.35); ctx.fillRect(sx + z * 0.15, sy - z * 0.3, z * 0.35, z * 0.35); break; }
    case "petal": {   // 花びら: 回転する楕円
      ctx.save(); ctx.translate(sx, sy); ctx.rotate(now / 90 + sx * 0.01); ctx.fillStyle = c;
      ctx.beginPath(); ctx.ellipse(0, 0, z * 1.05, z * 0.5, 0, 0, 7); ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,.55)"; ctx.beginPath(); ctx.arc(0, 0, z * 0.28, 0, 7); ctx.fill(); ctx.restore(); break; }
    case "bubble": {  // 泡: 中空の円 + ハイライト
      ctx.strokeStyle = c; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.arc(sx, sy, z * 0.95, 0, 7); ctx.stroke();
      ctx.fillStyle = "rgba(255,255,255,.75)"; ctx.beginPath(); ctx.arc(sx - z * 0.35, sy - z * 0.35, z * 0.22, 0, 7); ctx.fill(); ctx.lineWidth = 1; break; }
    case "cone": {   // ドリル: 三角錐 + 縞
      ctx.save(); ctx.translate(sx, sy); ctx.rotate(a); ctx.fillStyle = c; ctx.beginPath();
      ctx.moveTo(z * 1.7, 0); ctx.lineTo(-z * 1.1, -z * 0.85); ctx.lineTo(-z * 1.1, z * 0.85); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = c2; ctx.lineWidth = 1.4; for (let k = 0; k < 3; k++){ const x = z * (0.9 - k * 0.62); ctx.beginPath(); ctx.moveTo(x, -z * (0.55 - k * 0.14)); ctx.lineTo(x, z * (0.55 - k * 0.14)); ctx.stroke(); }
      ctx.restore(); ctx.lineWidth = 1; break; }
    case "tear": {   // 雫: 丸い頭 + 細い尾
      ctx.save(); ctx.translate(sx, sy); ctx.rotate(a); ctx.fillStyle = c; ctx.beginPath();
      ctx.moveTo(-z * 2, 0); ctx.quadraticCurveTo(-z * 0.2, -z * 0.95, z * 0.75, 0); ctx.quadraticCurveTo(-z * 0.2, z * 0.95, -z * 2, 0); ctx.fill();
      ctx.fillStyle = c2; ctx.globalAlpha = 0.75; ctx.beginPath(); ctx.arc(z * 0.3, -z * 0.28, z * 0.26, 0, 7); ctx.fill(); ctx.globalAlpha = 1; ctx.restore(); break; }
    case "icicle": { // 氷柱: 長い菱形 + 枝
      ctx.save(); ctx.translate(sx, sy); ctx.rotate(a); ctx.fillStyle = c; ctx.beginPath();
      ctx.moveTo(z * 2.6, 0); ctx.lineTo(0, -z * 0.5); ctx.lineTo(-z * 1.2, 0); ctx.lineTo(0, z * 0.5); ctx.closePath(); ctx.fill();
      ctx.fillStyle = c2; ctx.beginPath(); ctx.moveTo(z * 0.6, 0); ctx.lineTo(-z * 0.2, -z * 0.85); ctx.lineTo(-z * 0.5, 0); ctx.lineTo(-z * 0.2, z * 0.85); ctx.closePath(); ctx.fill(); ctx.restore(); break; }
    case "gem": {    // 宝石: カットされた多角形 + ファセット
      ctx.save(); ctx.translate(sx, sy); ctx.rotate(rot); ctx.fillStyle = c; ctx.beginPath();
      ctx.moveTo(0, -z); ctx.lineTo(z * 0.85, -z * 0.3); ctx.lineTo(z * 0.55, z * 0.85); ctx.lineTo(-z * 0.55, z * 0.85); ctx.lineTo(-z * 0.85, -z * 0.3); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = c2; ctx.lineWidth = 1.1; ctx.beginPath(); ctx.moveTo(-z * 0.85, -z * 0.3); ctx.lineTo(z * 0.85, -z * 0.3); ctx.moveTo(0, -z); ctx.lineTo(0, z * 0.85); ctx.stroke(); ctx.restore(); ctx.lineWidth = 1; break; }
    case "claw": {   // 爪: 三日月の爪
      ctx.save(); ctx.translate(sx, sy); ctx.rotate(a + rot * 0.4); ctx.strokeStyle = c; ctx.lineWidth = Math.max(1.2, z * 0.62); ctx.lineCap = "round";
      ctx.beginPath(); ctx.arc(0, 0, z * 1.05, -1.15, 1.15); ctx.stroke();
      ctx.strokeStyle = c2; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.arc(0, 0, z * 1.05, -1.15, -0.4); ctx.stroke(); ctx.restore(); ctx.lineWidth = 1; ctx.lineCap = "butt"; break; }
    case "coin": {   // コイン: 二重の縁 + 光
      ctx.fillStyle = c; ctx.beginPath(); ctx.arc(sx, sy, z * 0.85, 0, 7); ctx.fill();
      ctx.strokeStyle = c2; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.arc(sx, sy, z * 0.55, 0, 7); ctx.stroke();
      ctx.fillStyle = c2; ctx.beginPath(); ctx.arc(sx - z * 0.2, sy - z * 0.2, z * 0.16, 0, 7); ctx.fill(); ctx.lineWidth = 1; break; }
    case "dart": {   // ダーツ: 細い軸 + 羽
      ctx.save(); ctx.translate(sx, sy); ctx.rotate(a); ctx.fillStyle = c; ctx.beginPath();
      ctx.moveTo(z * 2, 0); ctx.lineTo(-z * 0.4, -z * 0.32); ctx.lineTo(-z * 0.4, z * 0.32); ctx.closePath(); ctx.fill();
      ctx.fillStyle = c2; ctx.beginPath(); ctx.moveTo(-z * 0.5, 0); ctx.lineTo(-z * 1.5, -z * 0.8); ctx.lineTo(-z * 1.5, z * 0.8); ctx.closePath(); ctx.fill(); ctx.restore(); break; }
    case "ember": {  // 熾火: ゆらめく塊
      const f = 0.85 + 0.3 * Math.sin(now / 47 + sx * 0.7 + sy); ctx.fillStyle = c; ctx.beginPath(); ctx.arc(sx, sy, z * 0.72 * f, 0, 7); ctx.fill();
      ctx.fillStyle = c2; ctx.beginPath(); ctx.arc(sx + z * 0.15, sy - z * 0.1, z * 0.34 * f, 0, 7); ctx.fill(); break; }
    case "anvil": {  // 金床: 重い台形
      ctx.save(); ctx.translate(sx, sy); ctx.rotate(a); ctx.fillStyle = c; ctx.beginPath();
      ctx.moveTo(z, -z * 0.55); ctx.lineTo(z, z * 0.55); ctx.lineTo(-z * 0.4, z * 0.55); ctx.lineTo(-z * 0.4, z * 0.2); ctx.lineTo(-z, z * 0.2); ctx.lineTo(-z, -z * 0.2); ctx.lineTo(-z * 0.4, -z * 0.2); ctx.lineTo(-z * 0.4, -z * 0.55); ctx.closePath(); ctx.fill();
      ctx.fillStyle = c2; ctx.globalAlpha = 0.5; ctx.fillRect(-z * 0.4, -z * 0.55, z * 1.4, z * 0.3); ctx.globalAlpha = 1; ctx.restore(); break; }
    case "cube3": {  // 立方: 3面の濃淡
      ctx.save(); ctx.translate(sx, sy); ctx.rotate(a + Math.PI / 4);
      ctx.fillStyle = c; ctx.fillRect(-z * 0.7, -z * 0.7, z * 1.4, z * 1.4);
      ctx.fillStyle = c2; ctx.globalAlpha = 0.55; ctx.fillRect(-z * 0.7, -z * 0.7, z * 1.4, z * 0.55); ctx.globalAlpha = 1;
      ctx.fillStyle = "rgba(0,0,0,.35)"; ctx.fillRect(-z * 0.7, z * 0.25, z * 1.4, z * 0.45); ctx.restore(); break; }
    case "hex": {    // 六角: 厚い六角形 + 芯
      ctx.save(); ctx.translate(sx, sy); ctx.rotate(rot); ctx.fillStyle = c; ctx.beginPath();
      for (let k = 0; k < 6; k++){ const t = k * Math.PI / 3; ctx.lineTo(Math.cos(t) * z * 0.95, Math.sin(t) * z * 0.95); }
      ctx.closePath(); ctx.fill(); ctx.fillStyle = c2; ctx.beginPath(); ctx.arc(0, 0, z * 0.3, 0, 7); ctx.fill(); ctx.restore(); break; }
    case "saturn": { // 環球: 球 + 輪
      ctx.fillStyle = c; ctx.beginPath(); ctx.arc(sx, sy, z * 0.62, 0, 7); ctx.fill();
      ctx.fillStyle = c2; ctx.beginPath(); ctx.arc(sx - z * 0.15, sy - z * 0.15, z * 0.2, 0, 7); ctx.fill();
      ctx.strokeStyle = c2; ctx.lineWidth = 1.8; ctx.beginPath(); ctx.ellipse(sx, sy, z * 1.25, z * 0.42, a, 0, 7); ctx.stroke(); ctx.lineWidth = 1; break; }
    case "orb2": {   // 双子球: 2つの球
      ctx.fillStyle = c; ctx.beginPath(); ctx.arc(sx - z * 0.4, sy, z * 0.55, 0, 7); ctx.fill();
      ctx.fillStyle = c2; ctx.beginPath(); ctx.arc(sx + z * 0.45, sy, z * 0.42, 0, 7); ctx.fill();
      ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(sx - z * 0.55, sy - z * 0.18, z * 0.16, 0, 7); ctx.fill(); break; }
    case "missile": {// ミサイル: 胴体 + 翼 + 炎
      ctx.save(); ctx.translate(sx, sy); ctx.rotate(a);
      ctx.fillStyle = "#ff9d3c"; ctx.beginPath(); ctx.moveTo(-z * 1.1, 0); ctx.lineTo(-z * 1.9 - Math.sin(now / 31) * z * 0.3, -z * 0.3); ctx.lineTo(-z * 1.9, z * 0.3); ctx.closePath(); ctx.fill();
      ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(z * 1.6, 0); ctx.quadraticCurveTo(z * 0.6, -z * 0.55, -z * 0.9, -z * 0.5); ctx.lineTo(-z * 0.9, z * 0.5); ctx.quadraticCurveTo(z * 0.6, z * 0.55, z * 1.6, 0); ctx.fill();
      ctx.fillStyle = c2; ctx.beginPath(); ctx.moveTo(-z * 0.9, -z * 0.5); ctx.lineTo(-z * 1.5, -z * 1); ctx.lineTo(-z * 0.9, -z * 0.1); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(-z * 0.9, z * 0.5); ctx.lineTo(-z * 1.5, z * 1); ctx.lineTo(-z * 0.9, z * 0.1); ctx.closePath(); ctx.fill(); ctx.restore(); break; }
    case "fang": {   // 牙: 曲がった牙
      ctx.save(); ctx.translate(sx, sy); ctx.rotate(a); ctx.fillStyle = c; ctx.beginPath();
      ctx.moveTo(z * 1.8, -z * 0.4); ctx.quadraticCurveTo(z * 0.2, z * 0.9, -z * 1.2, z * 0.75); ctx.quadraticCurveTo(z * 0.4, -z * 0.5, z * 1.8, -z * 0.4); ctx.fill();
      ctx.fillStyle = c2; ctx.globalAlpha = 0.6; ctx.beginPath(); ctx.arc(z * 0.9, -z * 0.15, z * 0.18, 0, 7); ctx.fill(); ctx.globalAlpha = 1; ctx.restore(); break; }
    case "star4": {  // 閃光星: 4芒のきらめき
      ctx.save(); ctx.translate(sx, sy); ctx.rotate(rot * 0.5); ctx.fillStyle = c; ctx.beginPath();
      for (let k = 0; k < 8; k++){ const r = k & 1 ? z * 0.28 : z * 1.35, t = k * Math.PI / 4 - Math.PI / 2; ctx.lineTo(Math.cos(t) * r, Math.sin(t) * r); }
      ctx.closePath(); ctx.fill(); ctx.fillStyle = c2; ctx.beginPath(); ctx.arc(0, 0, z * 0.3, 0, 7); ctx.fill(); ctx.restore(); break; }
    case "bolt2": {  // 二重雷: 2本の稲妻
      ctx.save(); ctx.translate(sx, sy); ctx.rotate(a); ctx.strokeStyle = c; ctx.lineWidth = 1.8; ctx.beginPath();
      ctx.moveTo(-z * 2, -z * 0.4); ctx.lineTo(-z * 0.6, -z * 1); ctx.lineTo(z * 0.3, -z * 0.3); ctx.lineTo(z * 1.9, -z * 0.7); ctx.stroke();
      ctx.strokeStyle = c2; ctx.beginPath(); ctx.moveTo(-z * 2, z * 0.5); ctx.lineTo(-z * 0.5, z * 0.05); ctx.lineTo(z * 0.4, z * 0.6); ctx.lineTo(z * 1.9, z * 0.2); ctx.stroke(); ctx.restore(); ctx.lineWidth = 1; break; }
    case "halo": {   // 光輪: 輪 + 光条
      ctx.strokeStyle = c; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(sx, sy, z * 0.85, 0, 7); ctx.stroke();
      ctx.strokeStyle = c2; ctx.lineWidth = 1.5; for (let k = 0; k < 4; k++){ const t = rot + k * Math.PI / 2; ctx.beginPath(); ctx.moveTo(sx + Math.cos(t) * z * 1.05, sy + Math.sin(t) * z * 1.05); ctx.lineTo(sx + Math.cos(t) * z * 1.45, sy + Math.sin(t) * z * 1.45); ctx.stroke(); }
      ctx.fillStyle = c2; ctx.beginPath(); ctx.arc(sx, sy, z * 0.22, 0, 7); ctx.fill(); ctx.lineWidth = 1; break; }
    case "meteor": { // 隕石: 岩 + 炎の尾
      ctx.save(); ctx.translate(sx, sy); ctx.rotate(a); ctx.fillStyle = "rgba(255,120,40,.5)"; ctx.beginPath();
      ctx.moveTo(-z * 0.5, -z * 0.7); ctx.lineTo(-z * 2.6, 0); ctx.lineTo(-z * 0.5, z * 0.7); ctx.closePath(); ctx.fill(); ctx.restore();
      ctx.save(); ctx.translate(sx, sy); ctx.rotate(now / 170 + rot); ctx.fillStyle = c; ctx.beginPath();
      for (let k = 0; k < 7; k++){ const r = z * (0.65 + 0.3 * ((k * 7919) % 5) / 4), t = k * Math.PI * 2 / 7; ctx.lineTo(Math.cos(t) * r, Math.sin(t) * r); }
      ctx.closePath(); ctx.fill(); ctx.fillStyle = c2; ctx.beginPath(); ctx.arc(z * 0.1, -z * 0.1, z * 0.25, 0, 7); ctx.fill(); ctx.restore(); break; }
    case "void": {   // 虚空: 黒い核 + 色の縁
      ctx.fillStyle = "#050208"; ctx.beginPath(); ctx.arc(sx, sy, z * 0.8, 0, 7); ctx.fill();
      ctx.strokeStyle = c; ctx.lineWidth = 2.2; ctx.beginPath(); ctx.arc(sx, sy, z * 0.8, 0, 7); ctx.stroke();
      ctx.strokeStyle = c2; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(sx, sy, z * 1.15, rot, rot + 4.2); ctx.stroke(); ctx.lineWidth = 1; break; }
    case "sun": {    // 太陽: 核 + 三角の光
      ctx.fillStyle = c2; ctx.beginPath(); for (let k = 0; k < 8; k++){ const t = rot + k * Math.PI / 4; ctx.moveTo(sx + Math.cos(t) * z * 0.75, sy + Math.sin(t) * z * 0.75); ctx.lineTo(sx + Math.cos(t + 0.22) * z * 0.75, sy + Math.sin(t + 0.22) * z * 0.75); ctx.lineTo(sx + Math.cos(t + 0.11) * z * 1.5, sy + Math.sin(t + 0.11) * z * 1.5); } ctx.fill();
      ctx.fillStyle = c; ctx.beginPath(); ctx.arc(sx, sy, z * 0.72, 0, 7); ctx.fill();
      ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(sx, sy, z * 0.3, 0, 7); ctx.fill(); break; }
    case "star6": {  // 六芒星
      ctx.save(); ctx.translate(sx, sy); ctx.rotate(rot * 0.6); ctx.fillStyle = c; ctx.beginPath();
      for (let k = 0; k < 12; k++){ const r = k & 1 ? z * 0.52 : z * 1.2, t = k * Math.PI / 6 - Math.PI / 2; ctx.lineTo(Math.cos(t) * r, Math.sin(t) * r); }
      ctx.closePath(); ctx.fill(); ctx.fillStyle = c2; ctx.beginPath(); ctx.arc(0, 0, z * 0.28, 0, 7); ctx.fill(); ctx.restore(); break; }
    case "bubbles": {// 泡塊: 3つの泡
      ctx.strokeStyle = c; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(sx - z * 0.45, sy + z * 0.2, z * 0.55, 0, 7); ctx.stroke();
      ctx.beginPath(); ctx.arc(sx + z * 0.4, sy - z * 0.25, z * 0.45, 0, 7); ctx.stroke();
      ctx.beginPath(); ctx.arc(sx + z * 0.1, sy + z * 0.5, z * 0.32, 0, 7); ctx.stroke();
      ctx.fillStyle = c2; ctx.beginPath(); ctx.arc(sx - z * 0.6, sy, z * 0.14, 0, 7); ctx.fill(); ctx.lineWidth = 1; break; }
    case "petals": { // 花びら塊: 3枚の花びら
      ctx.fillStyle = c; for (let k = 0; k < 3; k++){ ctx.save(); ctx.translate(sx + Math.cos(rot + k * 2.1) * z * 0.4, sy + Math.sin(rot + k * 2.1) * z * 0.4); ctx.rotate(rot + k * 2.1); ctx.beginPath(); ctx.ellipse(0, 0, z * 0.62, z * 0.3, 0, 0, 7); ctx.fill(); ctx.restore(); }
      ctx.fillStyle = c2; ctx.beginPath(); ctx.arc(sx, sy, z * 0.22, 0, 7); ctx.fill(); break; }
    case "mine": {   // 棘爆弾: 棘の生えた球
      ctx.strokeStyle = c; ctx.lineWidth = 2; for (let k = 0; k < 8; k++){ const t = k * Math.PI / 4 + rot * 0.3; ctx.beginPath(); ctx.moveTo(sx + Math.cos(t) * z * 0.55, sy + Math.sin(t) * z * 0.55); ctx.lineTo(sx + Math.cos(t) * z * 1.05, sy + Math.sin(t) * z * 1.05); ctx.stroke(); }
      ctx.fillStyle = c; ctx.beginPath(); ctx.arc(sx, sy, z * 0.62, 0, 7); ctx.fill();
      ctx.fillStyle = (now / 100 | 0) % 2 ? c2 : "#ff5a46"; ctx.beginPath(); ctx.arc(sx, sy, z * 0.22, 0, 7); ctx.fill(); ctx.lineWidth = 1; break; }
    case "pill": {   // カプセル: 2色のカプセル
      ctx.save(); ctx.translate(sx, sy); ctx.rotate(a); ctx.fillStyle = c; ctx.beginPath();
      ctx.moveTo(z * 0.9, -z * 0.5); ctx.lineTo(-z * 0.9, -z * 0.5); ctx.arc(-z * 0.9, 0, z * 0.5, -Math.PI / 2, Math.PI / 2, true); ctx.lineTo(z * 0.9, z * 0.5); ctx.arc(z * 0.9, 0, z * 0.5, Math.PI / 2, -Math.PI / 2, true); ctx.closePath(); ctx.fill();
      ctx.fillStyle = c2; ctx.globalAlpha = 0.8; ctx.fillRect(-z * 0.15, -z * 0.5, z * 1.05, z); ctx.globalAlpha = 1; ctx.restore(); break; }
    case "acorn": {  // 実: 楕円 + 条
      ctx.save(); ctx.translate(sx, sy); ctx.rotate(a); ctx.fillStyle = c; ctx.beginPath(); ctx.ellipse(0, 0, z * 1.05, z * 0.72, 0, 0, 7); ctx.fill();
      ctx.fillStyle = c2; ctx.beginPath(); ctx.ellipse(z * 0.55, 0, z * 0.42, z * 0.72, 0, 0, 7); ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,.35)"; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(-z * 0.5, -z * 0.6); ctx.lineTo(-z * 0.5, z * 0.6); ctx.moveTo(0, -z * 0.7); ctx.lineTo(0, z * 0.7); ctx.stroke(); ctx.restore(); ctx.lineWidth = 1; break; }
    case "snow": {   // 雪結晶: 6方向の枝
      ctx.save(); ctx.translate(sx, sy); ctx.rotate(rot * 0.4); ctx.strokeStyle = c; ctx.lineWidth = 1.7;
      for (let k = 0; k < 6; k++){ const t = k * Math.PI / 3; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(t) * z, Math.sin(t) * z);
        ctx.moveTo(Math.cos(t) * z * 0.55, Math.sin(t) * z * 0.55); ctx.lineTo(Math.cos(t - 0.5) * z * 0.85, Math.sin(t - 0.5) * z * 0.85);
        ctx.moveTo(Math.cos(t) * z * 0.55, Math.sin(t) * z * 0.55); ctx.lineTo(Math.cos(t + 0.5) * z * 0.85, Math.sin(t + 0.5) * z * 0.85); ctx.stroke(); }
      ctx.fillStyle = c2; ctx.beginPath(); ctx.arc(0, 0, z * 0.2, 0, 7); ctx.fill(); ctx.restore(); ctx.lineWidth = 1; break; }
    case "ring2": {  // 二重輪
      ctx.strokeStyle = c; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(sx, sy, z * 0.95, 0, 7); ctx.stroke();
      ctx.strokeStyle = c2; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.arc(sx, sy, z * 0.55, 0, 7); ctx.stroke();
      ctx.fillStyle = c; ctx.beginPath(); ctx.arc(sx, sy, z * 0.2, 0, 7); ctx.fill(); ctx.lineWidth = 1; break; }
    default: { ctx.fillStyle = c; ctx.fillRect(sx - z / 2, sy - z / 2, z, z); }
  }
  if (bl.stuck){ const f = 0.5 + 0.5 * Math.sin(now / 70); ctx.strokeStyle = `rgba(255,60,40,${0.35 + 0.4 * f})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(sx, sy, z * (1.5 + 0.3 * f), 0, 7); ctx.stroke(); ctx.lineWidth = 1; }
}
const hexA = (h, a) => { const n = parseInt(h.slice(1), 16); return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${a})`; };

// ---------- コインのスプライト (大きさ・色ごとに1回だけ描いて使い回す) ----------
// 額面の10段階カラーラダー: 10倍ごとに色がはっきり変わる。合体で育った大判コインほど
// 大きく・豪華になる (最大半径19 = 直径約1.6ブロックで頭打ち)。段階判定は額面ベースで、
// 合体コインも単体コインも同じ表を通る。
// fx: "" 通常 / "halo" 外周グロー (段階色) / "haloSpark" グロー+キラキラ / "rainbow" 虹縁+グロー+キラキラ
const COIN_TIERS = [
  { min: 0,          r: 6,    fill: "#da844a", stroke: "#8f4f1e", lw: 1 },                                                              // 銅
  { min: 10,         r: 7,    fill: "#b04a28", stroke: "#5e2110", lw: 1 },                                                              // 赤銅
  { min: 100,        r: 8,    fill: "#ccd3da", stroke: "#7e8894", lw: 1 },                                                              // 銀
  { min: 1000,       r: 9.5,  fill: "#f4f9fb", stroke: "#a8c4d4", lw: 1.5 },                                                            // プラチナ
  { min: 10000,      r: 11,   fill: "#ffd60a", stroke: "#a88600", lw: 1.5 },                                                            // 金
  { min: 100000,     r: 12.5, fill: "#ff9500", stroke: "#a34d00", lw: 2 },                                                              // 濃金
  { min: 1000000,    r: 14,   fill: "#17b978", stroke: "#075e2c", lw: 2, fx: "halo",      halo: "46,224,140",  letter: "#ffffff" },    // エメラルド
  { min: 10000000,   r: 15.5, fill: "#1f6feb", stroke: "#0d3f8f", lw: 2, fx: "halo",      halo: "80,150,255",  letter: "#ffffff" },    // サファイア
  { min: 100000000,  r: 17,   fill: "#a55eea", stroke: "#5e2b97", lw: 2, fx: "haloSpark", halo: "190,110,255", letter: "#ffffff" },    // アメジスト
  { min: 1000000000, r: 19,   fill: "#fff6a8", stroke: "#ffffff", lw: 2.5, fx: "rainbow" },                                             // 虹
];
function coinTierOf(v){
  let t = 0;
  for (let i = 1; i < COIN_TIERS.length; i++) if (v >= COIN_TIERS[i].min) t = i;
  return t;
}
const coinSprites = new Map();
function coinSprite(r, fill, stroke, lw, fx, letter, haloCol){
  const halo = fx === "halo" || fx === "haloSpark" || fx === "rainbow", rainbow = fx === "rainbow";
  const key = r + "|" + fill + "|" + stroke + "|" + lw + "|" + (fx || "") + "|" + (letter || "") + "|" + (haloCol || "");
  let sp = coinSprites.get(key);
  if (sp) return sp;
  const pad = halo ? 6 : 0;   // ハロー (外周のグロー) のぶんだけキャンバスを広げる。本体の見かけ半径は r のまま
  const S = 2, size = Math.ceil((r + pad) * 2 + lw + 2), cv2 = document.createElement("canvas");   // 高解像度ディスプレイ用に2倍で描く
  cv2.width = cv2.height = size * S;
  const g = cv2.getContext("2d"), c = size / 2;
  g.scale(S, S);
  if (halo){   // 外周グロー: 段階色の輪 + 外側へにじむ影
    g.beginPath(); g.arc(c, c, r + 4.5, 0, 7);
    g.strokeStyle = rainbow ? "rgba(255,240,180,.55)" : `rgba(${haloCol || "255,214,10"},.5)`; g.lineWidth = 3; g.stroke();
    g.beginPath(); g.arc(c, c, r + 1.5, 0, 7);
    g.strokeStyle = "rgba(255,255,255,.35)"; g.lineWidth = 1; g.stroke();
  }
  g.beginPath(); g.arc(c, c, r, 0, 7);
  g.fillStyle = fill; g.fill();
  if (rainbow){   // 最高額面: 縁を虹色の6分割にする
    for (let k = 0; k < 6; k++){
      g.beginPath(); g.arc(c, c, r - lw / 2, k * Math.PI / 3, (k + 1) * Math.PI / 3);
      g.strokeStyle = `hsl(${k * 60}, 95%, 62%)`; g.lineWidth = lw; g.stroke();
    }
  } else {
    g.strokeStyle = stroke; g.lineWidth = lw; g.stroke();
  }
  g.fillStyle = letter || "#000"; g.font = `bold ${Math.round(r * 1.3)}px monospace`; g.textAlign = "center";
  g.fillText("C", c, c + r * 0.45);
  if (rainbow || fx === "haloSpark"){   // キラキラ (十字の星) を2つ焼き込む
    g.strokeStyle = "rgba(255,255,255,.95)"; g.lineWidth = 1.4;
    for (const [sx, sy, sr] of [[c - r * 0.45, c - r * 0.5, 3.4], [c + r * 0.5, c - r * 0.28, 2.6]]){
      g.beginPath();
      g.moveTo(sx - sr, sy); g.lineTo(sx + sr, sy);
      g.moveTo(sx, sy - sr); g.lineTo(sx, sy + sr);
      g.stroke();
    }
  }
  sp = { cv: cv2, size };
  coinSprites.set(key, sp);
  return sp;
}
function coinSpriteFor(c){
  const v = c.value;
  if (c.chest) return coinSprite(14, v >= 1000 ? "#ffe95e" : "#ffd60a", v >= 10000 ? "#ffffff" : "#a88600", v >= 10000 ? 2 : 1);
  const T = COIN_TIERS[coinTierOf(v)];
  return coinSprite(T.r, T.fill, T.stroke, T.lw, T.fx, T.letter, T.halo);
}

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
  // メインビューの表示範囲 (ビューポート枠)
  const vw = (CW / zoom) / scale, vh = (CH / zoom) / scale;
  mm.strokeStyle = "rgba(255,255,255,.85)"; mm.lineWidth = 1;
  mm.strokeRect(C - vw / 2, C - vh / 2, vw, vh);
  // 自機: 進行方向の三角 + 白芯 (中心固定)
  mm.save(); mm.translate(C, C); mm.rotate(player.angle + Math.PI / 2);
  mm.fillStyle = "#fff"; mm.beginPath(); mm.moveTo(0, -6); mm.lineTo(4.5, 5); mm.lineTo(-4.5, 5); mm.closePath(); mm.fill();
  mm.restore();
  mm.fillStyle = "#000"; mm.fillRect(C - 1.5, C - 1.5, 3, 3);
}

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

// ---------- boot ----------
resize(); renderPanels(true); updateHUD();
requestAnimationFrame(t => { last = t; requestAnimationFrame(frame); });
