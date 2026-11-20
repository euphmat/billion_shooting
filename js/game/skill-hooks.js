"use strict";
/* =========================================================
   game/skill-hooks.js - スキルの命中時 / 撃破時フックと、状態異常・連鎖の処理
   ========================================================= */

// ---------- 元素付与 (スキルツリー): どの武器でも状態異常が乗る ----------
function elemChances(){
  const all = (sk("b_kindling") ? 0.05 : 0) + MASTERY.b.elem[masteryRank("b")];   // 元素活性: 全ての付与率アップ / 元素マスタリー
  const crown = artHas("lg_crown") ? 0.20 : 0;   // 元素の王冠: 全元素の付与率 +20% (絶対値)
  const apex = (sk("b_singularity") ? 0.25 : 0) + (sk("b_core") ? 0.25 : 0) + (sk("b_ultimate") ? 0.50 : 0);   // 奥義: 特異点 +25pt / 原初元素炉 +25pt / 究極: ビッグバン元素炉 +50pt
  return {
    burn:  (sk("b_burn")  ? 0.08 : 0) + all + crown + apex,
    frost: (sk("b_frost") ? 0.08 : 0) + all + crown + apex,
    acid:  (sk("b_acid")  ? 0.08 : 0) + all + crown + apex,
    rad:   (sk("b_radio") ? 0.05 : 0) + all + crown + apex,
    shock: (sk("b_shock") ? 0.08 : 0) + (sk("b_tesla") ? 0.08 : 0) + all + crown + apex,
  };
}
// 現在の武器 + スキル込みで「命中時にその状態異常が付く確率」(武器特性は命中時常時付与 = 100%扱い)
function elemTotals(){
  const w = WEAPONS[state.weapon], ec = elemChances();
  const rnd = sk("b_elem") ? 0.10 / 3 : 0;   // 元素付与のランダム枠 (炎/氷/酸のどれか1つに 10%/3 ずつ)
  const mix = (feat, c) => feat ? 1 : 1 - (1 - rnd) * (1 - c);
  return {
    burn:  mix(w.burn, ec.burn),
    frost: mix(w.frost, ec.frost),
    acid:  mix(w.acid, ec.acid),
    rad:   w.radiation ? 1 : ec.rad,
    shock: Math.min(1, (w.shock || 0) + ec.shock + (sk("b_elem") ? 0.025 : 0) + artVal("shockP") / 100),
  };
}

// ---------- 発動カウンタ (セッション内のみ・セーブしない。「本当に発動しているか」の見える化用) ----------
const skillProc = { burn: 0, frost: 0, acid: 0, rad: 0, shock: 0, thermo: 0, bolt: 0, firestorm: 0, icebreak: 0, meteor: 0, treasure: 0, treasureBreak: 0, chain: 0, blast: 0, quake: 0, jackpot: 0,
  dimension: 0, planetkiller: 0, chainreact: 0, tycoon: 0, fleetburst: 0, automine: 0, stareater: 0,
  annihilation: 0, elemnova: 0, goldify: 0, planetbeam: 0, devour: 0, diswave: 0 };
// x, y を渡すと、その場所にスキル名の発動タグを出す (ui/notify.js の procTag。間引きは向こうで行う)
function bumpProc(k, x, y){ skillProc[k]++; if (x !== undefined) procTag(k, x, y); }
// 奥義の大きな発動は、アーティファクトと同じ左上フィード (#artFeed) に名前を出す (チップのプール・集約は artifacts.js 側)
function skillFeed(key, name, icon, color){
  if (typeof artFeedShow === "function") artFeedShow({ id: "sk:" + key, name, icon, color, rar: 0 });
}
const goldRainFx = [];   // 大富豪の蓄財: 金の雨の発生イベント {x, y} (パーティクル化は game/skill-fx.js)

// 自機の命中時に呼ばれる。装備の特性とは独立に、スキル由来の状態異常を付ける
function infuseElements(idx, gx, gy, dmg){
  const ec = elemChances();
  let kind = null;
  if (sk("b_elem") && Math.random() < 0.10) kind = ["burn", "frost", "acid"][(Math.random() * 3) | 0];   // 元素付与: ランダムに1つ (雷は放電判定側)
  const roll = k => kind === k || (ec[k] > 0 && Math.random() < ec[k]);
  if (roll("burn") && (burns.size < 800 || burns.has(idx))){ const bd = dmg * 0.15 * burnSetMul(); burns.set(idx, { d: bd, t: 3 + (sk("b_plasma") ? 2 : 0), k: "burn", g: 0 }); bumpProc("burn"); chainReact(idx, gx, gy, "burn", bd); elemNova(idx, gx, gy, "burn", bd); }
  if (roll("acid") && (burns.size < 800 || burns.has(idx))){ const ad = dmg * 0.3 * elemMul() * (sk("b_acid") ? 1.5 : 1) * (1 + artVal("acid")); burns.set(idx, { d: ad, t: 4 + (sk("b_acid") ? 2 : 0), k: "acid" }); bumpProc("acid"); chainReact(idx, gx, gy, "acid", ad); elemNova(idx, gx, gy, "acid", ad); }
  if (ec.rad > 0 && Math.random() < ec.rad && (burns.size < 800 || burns.has(idx))){ const rd = dmg * 0.3 * elemMul(); burns.set(idx, { d: rd, t: 4, rad: true, k: "rad" }); bumpProc("rad"); chainReact(idx, gx, gy, "rad", rd); elemNova(idx, gx, gy, "rad", rd); }
  if (roll("frost")){
    if (sk("b_thermo") && burns.has(idx)){   // 熱衝撃: 燃焼中の氷結で大爆発 (両方消える)
      burns.delete(idx);
      addRing({ x: g2w(gx), y: g2w(gy), r: BS * 2, t: performance.now(), color: "255,150,60", dur: 300 });
      damageBlock(idx, blockMaxHP(gx, gy) * 0.15, 0);
      bumpProc("thermo", g2w(gx), g2w(gy));
    } else if (frosts.size < 1500 || frosts.has(idx)){
      const freshFrost = !frosts.has(idx);
      frosts.set(idx, 3 + (sk("b_frost2") ? 2 : 0)); frostGen.set(idx, 0);
      bumpProc("frost");
      if (freshFrost){ chainReact(idx, gx, gy, "frost", dmg * 0.3 * elemMul()); elemNova(idx, gx, gy, "frost", dmg * 0.3 * elemMul()); }
      if (freshFrost && sk("b_permafrost")) for (const [dx, dy] of N4){ const j = liveAt(gx + dx, gy + dy); if (j >= 0 && Math.random() < 0.5 && frosts.size < 1500 && !frosts.has(j)){ frosts.set(j, 2); frostGen.set(j, 1); bumpProc("frost"); } }   // 永久凍土
    }
  }
}

// 五色連鎖反応 (奥義): 状態異常の付与時に 15% で元素爆発 — 周囲8マスへ状態異常ダメージ×3 + その状態異常を伝播 (世代上限で打ち切り)
const ELEM_RGB = { burn: "255,120,40", frost: "120,220,255", acid: "120,255,90", rad: "200,120,255" };
function chainReact(idx, gx, gy, kind, baseD){
  if (!sk("b_chainreaction") || chainReacting || Math.random() >= 0.15) return;
  chainReacting = true;
  try {
    bumpProc("chainreact", g2w(gx), g2w(gy));
    const x = g2w(gx), y = g2w(gy);
    addRing({ x, y, r: BS * 2.2, t: performance.now(), color: ELEM_RGB[kind], dur: 380 });
    dimFx.push({ x, y, t: 0, kind });
    for (const [dx, dy] of N8){
      const j = liveAt(gx + dx, gy + dy);
      if (j < 0) continue;
      damageBlock(j, baseD * 3, 0);
      if (kind === "frost"){ if (frosts.size < 1500 && !frosts.has(j)){ frosts.set(j, 2); frostGen.set(j, 2); } }
      else if (burns.size < 800 || burns.has(j)){
        if (kind === "burn") burns.set(j, { d: baseD, t: 2, k: "burn", g: 3 });
        else if (kind === "acid") burns.set(j, { d: baseD, t: 2, k: "acid" });
        else burns.set(j, { d: baseD, t: 2, rad: true, k: "rad" });
      }
    }
  } finally { chainReacting = false; }
}

// 元素新星 (究極 b_ultimate): 状態異常の付与時 25% で半径6セルの元素爆発 — 状態異常ダメージ×10 + その状態異常を伝播 (世代上限つき)。
// 再入ガード + クールダウン (0.12秒) で、付与が集中しても1フレームに何度も炸裂しないようにする
let elemNoving = false, novaCd = 0;
function elemNova(idx, gx, gy, kind, baseD){
  if (!sk("b_ultimate") || elemNoving || novaCd > 0 || Math.random() >= 0.25) return;
  elemNoving = true; novaCd = 0.12;
  try {
    bumpProc("elemnova", g2w(gx), g2w(gy));
    const x = g2w(gx), y = g2w(gy);
    addRing({ x, y, r: BS * 6.5, t: performance.now(), color: ELEM_RGB[kind] || "255,255,255", dur: 520 });
    addRing({ x, y, r: BS * 3.2, t: performance.now(), color: "255,255,255", dur: 380 });
    dimFx.push({ x, y, t: 0, kind, dur: 0.6 });
    skillFeed("elemnova", "元素新星", "💥", "#ff8a5c");
    sndBoom();
    for (let dy = -6; dy <= 6; dy++) for (let dx = -6; dx <= 6; dx++){
      if (dx * dx + dy * dy > 36) continue;
      const j = liveAt(gx + dx, gy + dy);
      if (j < 0 || j === idx) continue;
      damageBlock(j, baseD * 10, 0);
      if (kind === "frost"){ if (frosts.size < 1500 && !frosts.has(j)){ frosts.set(j, 2); frostGen.set(j, 2); } }   // 伝播した氷結は世代2 (それ以上広がらない)
      else if (burns.size < 800 || burns.has(j)){
        if (kind === "burn") burns.set(j, { d: baseD, t: 2, k: "burn", g: 3 });   // 燃え移りは世代上限 (g=3) で打ち切り
        else if (kind === "acid") burns.set(j, { d: baseD, t: 2, k: "acid" });
        else burns.set(j, { d: baseD, t: 2, rad: true, k: "rad" });
      }
    }
  } finally { elemNoving = false; }
}

// ---------- 実行時の状態 (セーブしない) ----------
let treeOpen = false;
let combo = 0, comboT = 0, heat = 0, heatT = 0, gMul = 1, nearClose = false;
let doomN = 0, ringN = 0, breakN = 0, jackN = 0, quakeN = 0;
let piggy = 0, piggyT = 60, interestT = 10;
let dmgDepth = 0;          // damageBlock の入れ子の深さ (0 = 攻撃そのもの / 1以上 = 余波・誘爆)
let curPl = false;         // いま処理中の攻撃が「自機の攻撃」か
let curEcho = false;       // いま処理中の弾がエコーショットか (エコーはエコーを呼ばない)
let shattering = false;    // 破砕のダメージを与えている最中か (破砕は破砕を呼ばない)
let resonating = false, firestorming = false, blasting = false;    // 共鳴/火炎嵐/発破の処理中か (再入防止)
let chainReacting = false, automining = false, stareating = false;   // 連鎖反応/自動採掘網/星喰いの処理中か (再入防止)
let starN = 0;                  // 星喰い: 前回の一撃から壊した数
let devourN = 0;                // 星喰い・真 (究極): 解体波までの破壊数 (キュー由来の破壊は数えない)
const vuln = new Map();
const embers = new Map(), overloads = new Map();   // 残り火 / 過負荷 (残り秒数)    // 弱点露出: idx -> 重ねた回数
const burns = new Map();   // 燃焼 / 腐食 / 放射: idx -> {d: 毎秒ダメージ, t: 残り秒, rad: 放射 (壊れると隣へ移る)}
const frosts = new Map();  // 氷結: idx -> 残り秒 (受けるダメージ +30%)
const frostGen = new Map();   // 氷結の伝播世代 (無限に広がらないよう世代で打ち切る)
const bombs = [], bombSet = new Set();   // 時限爆弾 {idx,t,dmg}
const meteors = [];        // 落下待ちの隕石 {x,y,t,r,dmg}
const treasureSet = new Set();   // お宝ブロック (壊すと大ボーナス)
let blastN = 0;                  // 発破採掘: 前回の発破から壊した数
let chainBudget = 0;             // 連破の残り連鎖数
const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const N8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
const liveAt = (gx, gy) => (blockExists(gx, gy) && !isDestroyed(gy * D + gx)) ? gy * D + gx : -1;
// 余波扱い (スキル補正なし) でダメージを与える
function rawDamage(fn){ dmgDepth++; try { fn(); } finally { dmgDepth--; } }

/* ---------- 撃破の余波キュー (重さ対策の要) ----------
   連破・発破・破砕・共鳴・大地母神の腕・誘爆など「ブロックが壊れたら周りを削る」効果は、以前はその場で
   damageBlock を再帰呼び出ししていた。スキルが揃うと 1発の命中から1フレームで数万ブロックへ波及し、
   終盤は数 fps まで落ちていた。
   余波はキューに積み、毎フレーム時間予算 (AFTERSHOCK_BUDGET_MS) の範囲だけ処理する。
   効果の量は変わらず、数フレームに分けて順に崩れていく (見た目にも連鎖が追える)。
   kind は余波の出どころで、処理中にその再入防止フラグを立て直す
   (例: 破砕で壊れたブロックは弾けない、発破で壊れた分は発破のカウントに入れない — 即時処理と同じ約束を守る) */
const AFTERSHOCK_CAP = 24000, AFTERSHOCK_BUDGET_MS = 4;
const SHOCK_NONE = 0, SHOCK_SHATTER = 1, SHOCK_RESO = 2, SHOCK_BLAST = 3, SHOCK_AUTOMINE = 4, SHOCK_STAR = 5, SHOCK_FIRE = 6;
const shockIdx = [], shockDmg = [], shockKind = [];
let shockHead = 0;
function aftershock(j, dmg, kind){
  if (j < 0 || shockIdx.length - shockHead >= AFTERSHOCK_CAP) return;
  shockIdx.push(j); shockDmg.push(dmg); shockKind.push(kind || SHOCK_NONE);
}
const aftershockPending = () => shockIdx.length - shockHead;
function setShockFlag(kind, on){
  if (kind === SHOCK_SHATTER) shattering = on;
  else if (kind === SHOCK_RESO) resonating = on;
  else if (kind === SHOCK_BLAST) blasting = on;
  else if (kind === SHOCK_AUTOMINE) automining = on;
  else if (kind === SHOCK_STAR) stareating = on;
  else if (kind === SHOCK_FIRE) firestorming = on;
}
function processAftershocks(budgetMs){
  if (shockHead >= shockIdx.length) return;
  const t0 = performance.now();
  dmgDepth++;   // 余波は「攻撃そのもの」ではない (命中時スキルは乗らない)
  try {
    let n = 0;
    while (shockHead < shockIdx.length){
      const j = shockIdx[shockHead], d = shockDmg[shockHead], k = shockKind[shockHead];
      shockHead++;
      if (!isDestroyed(j)){
        setShockFlag(k, true);
        try { damageBlock(j, d, 0); } finally { setShockFlag(k, false); }
      }
      if ((++n & 31) === 0 && performance.now() - t0 > budgetMs) break;
    }
  } finally { dmgDepth--; }
  if (shockHead >= shockIdx.length){ shockIdx.length = shockDmg.length = shockKind.length = 0; shockHead = 0; }
  else if (shockHead > 8192){ shockIdx.splice(0, shockHead); shockDmg.splice(0, shockHead); shockKind.splice(0, shockHead); shockHead = 0; }
}

// ---------- 全破壊キュー (究極スキル用) ----------
// 消滅砲撃 / 星喰い・真 の「HP無視の全破壊」は即時実行せずキューに積み、毎フレーム上限ぶんだけ処理する。
// これで半径24セル級の一括破壊でも1フレームに処理が集中せず、連破/発破/自動採掘網と重なっても暴走しない。
// キュー由来の破壊 (fromBreakQueue) は星喰い・真の抽選/カウンタ対象にしない (自己増殖の防止)。
const breakQueue = []; let breakQHead = 0, fromBreakQueue = false;
const BREAKQ_CAP = 8000, BREAKQ_PER_FRAME = 400, BREAKQ_BUDGET_MS = 3;
function queueDestroyIdx(j){ if (breakQueue.length - breakQHead < BREAKQ_CAP) breakQueue.push(j); }
function queueDestroyCircle(gx, gy, r){
  const r2 = r * r;
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++){
    if (dx * dx + dy * dy > r2) continue;
    const j = liveAt(gx + dx, gy + dy);
    if (j >= 0) queueDestroyIdx(j);
  }
}
function processBreakQueue(){
  if (breakQHead >= breakQueue.length){ if (breakQueue.length){ breakQueue.length = 0; breakQHead = 0; } return; }
  let n = Math.min(BREAKQ_PER_FRAME, breakQueue.length - breakQHead), k = 0;
  const t0 = performance.now();
  fromBreakQueue = true;
  try {
    while (n-- > 0){
      const j = breakQueue[breakQHead++];
      if (!isDestroyed(j)) damageBlock(j, blockMaxHP(j % D, (j / D) | 0) * 100, 0);   // HP無視の全破壊 (報酬・連鎖は通常の破壊経路)
      if ((++k & 15) === 0 && performance.now() - t0 > BREAKQ_BUDGET_MS) break;   // 時間予算を超えたら次のフレームへ
    }
  } finally { fromBreakQueue = false; }
  if (breakQHead >= breakQueue.length){ breakQueue.length = 0; breakQHead = 0; }
  else if (breakQHead > 4096){ breakQueue.splice(0, breakQHead); breakQHead = 0; }
}

// 全ての攻撃に掛かる倍率。毎フレーム gMul に入れておき、命中時はそれを使う
function globalDmgMul(){
  let m = levelDmgMul() * (1 + artVal("dmg")) * artMul("dmgMul");   // 惑星の心臓: 全ダメージ ×1.5 (乗算キー)
  m *= masteryMul("a");   // 破壊マスタリー
  if (sk("a_train")) m *= 1.06;
  if (sk("a_apex")) m *= 1.5;   // 殲滅プロトコル (奥義)
  if (sk("a_planetkiller")) m *= 1.5;   // 惑星殺し・極 (奥義)
  if (sk("a_ultimate")) m *= 3;   // 惑星消滅プロトコル (究極)
  if (sk("a_combo")) m *= 1 + Math.min(30, combo) * 0.005;
  if (sk("a_warm"))  m *= 1 + 0.2 * heat;
  if (sk("d_cruise") && player.moving) m *= 1.12;
  if (sk("c_goldbullet")) m *= 1 + (sk("c_goldbullet2") ? 0.05 : 0.03) * Math.floor(Math.log10(Math.max(1, state.coins)) + 1);
  if (sk("c_god")) m *= 1 + 0.06 * Math.floor(Math.log10(Math.max(1, state.totalCoins)) + 1);
  if (sk("d_god")) m *= 1 + Math.min(0.4, 0.02 * crewCount());
  else if (sk("d_synergy")) m *= 1 + Math.min(0.2, 0.01 * crewCount());
  return m;
}

// ---------- 命中時 (攻撃そのものにだけ掛かる。余波・誘爆には掛からない) ----------
function skillHitMods(idx, gx, gy, dmg, hp){
  let m = gMul;
  const max = blockMaxHP(gx, gy);
  if (hp >= max && sk("a_first")) m *= 1.2;
  { const voidEye = artHas("lg_void");   // 虚無の単眼: 会心率 +25%、会心ダメは最低でも ×3、専用演出フラグを立てる
    const ac = (sk("a_crit") ? 0.06 : 0) + (sk("a_apex") ? 0.10 : 0) + MASTERY.a.crit[masteryRank("a")] + artVal("crit") / 100 + (voidEye ? 0.25 : 0);   // 破壊マスタリー: 会心率
    if (ac > 0 && Math.random() < ac){ let cm = (sk("a_critx") ? 3 : 2) + artVal("critd") / 100; if (voidEye){ cm = Math.max(cm, 3); dmgVoidFlag = true; } m *= cm; } }   // 会心 (スキル+アーティファクト合算)
  if (sk("a_deep")) m *= 1 + (sk("a_deep2") ? 2.0 : 1.0) * blockDepth(gx, gy);
  if (artVal("deep")) m *= 1 + artVal("deep") * blockDepth(gx, gy);   // アーティファクト: 深さダメ
  if (sk("a_abyss") && blockDepth(gx, gy) >= 0.5) m *= 1.25;
  if (sk("a_core") && MATS[materialAt(gx, gy)].layer === 6) m *= 3;   // 内核の素材のみ (衛星レイヤー追加で index がずれたので固定)
  if (nearClose) m *= sk("a_point") ? 1.45 : 1.3;
  if (sk("a_weak")){
    const v = vuln.get(idx) || 0;
    m *= 1 + 0.04 * v;
    if (v < 10){ if (vuln.size > 3000) vuln.clear(); vuln.set(idx, v + 1); }
  }
  if (frosts.has(idx)) m *= (sk("b_iceage") ? 1.8 : sk("b_frost") ? 1.5 : 1.3) + artVal("frostV");   // 氷結は脆い
  if (sk("b_chill")){ m *= 1.05; if (frosts.has(idx)) m *= 1.1; }   // 冷気
  if (sk("b_magma") && burns.has(idx)) m *= 1.25;   // マグマ化: 燃焼中は脆い
  if (sk("b_melt") && burns.get(idx) && burns.get(idx).k === "acid") m *= 1.2;   // 溶解: 腐食中は脆い
  if (embers.has(idx)) m *= 1.2;   // 残り火
  if (overloads.has(idx)) m *= 1.25;   // 過負荷
  dmg *= m;
  if (sk("a_ap")) dmg += max * 0.0005;
  if (curFx && curFx.ap) dmg += max * curFx.ap;   // 装備の徹甲
  return dmg;
}
// cur = 命中後の残りHP (0以下なら壊れた)
function skillAfterHit(idx, gx, gy, dmg, cur){
  if (curPl && !artZapBusy && artSpecial("zap") && Math.random() < 0.18){   // アーティファクト: 連鎖の稲妻
    artZapBusy = true;
    try {
      const cand = findNearestBlocks(g2w(gx), g2w(gy), 210, 1, new Set([idx]));
      if (cand.length){ const j = cand[0]; addBeam({ x1: g2w(gx), y1: g2w(gy), x2: g2w(j % D), y2: g2w((j / D) | 0), t: performance.now(), w: 2, color: "#ffe14d" }); damageBlock(j, dmg * 0.5, 0); bumpArtProc("e_zap"); }
    } finally { artZapBusy = false; }
  }
  if (curPl && artHas("lg_dice") && Math.random() < 0.07) chaosDice(idx, gx, gy, dmg);   // 混沌のサイコロ: 自機の命中時 7%で発動
  if (curPl && sk("a_dimension") && Math.random() < 0.08){   // 次元崩壊砲 (奥義): 自機の命中時 8% で紫の次元爆発 (800% 範囲)
    bumpProc("dimension", g2w(gx), g2w(gy));
    const dx2 = g2w(gx), dy2 = g2w(gy);
    addRing({ x: dx2, y: dy2, r: BS * 2.6, t: performance.now(), color: "200,120,255", dur: 420 });
    addRing({ x: dx2, y: dy2, r: BS * 1.6, t: performance.now(), color: "255,120,255", dur: 320 });
    dimFx.push({ x: dx2, y: dy2, t: 0, kind: "dimension" });
    rawDamage(() => damageRadius(dx2, dy2, BS * 2, dmg * 8));
  }
  if (cur < 0 && dmg < 1e300 && !curCarry && sk("a_overkill")){   // 弾・照射は damageBlock の余剰引き継ぎで強化される
    let carry = -cur, cx = gx, cy = gy;
    for (let k = 0; k < 6 && carry > 0; k++){
      let j = -1;
      const o = (Math.random() * 4) | 0;
      for (let q = 0; q < 4 && j < 0; q++){ const [dx, dy] = N4[(o + q) % 4]; j = liveAt(cx + dx, cy + dy); }
      if (j < 0) break;
      const hp = blockHP(j);
      damageBlock(j, carry, 0);
      carry -= hp; cx = j % D; cy = (j / D) | 0;
    }
  }
  if (sk("a_bolt") && Math.random() < 0.05){
    bumpProc("bolt", g2w(gx), g2w(gy));
    const x = g2w(gx), y = g2w(gy), cand = findNearestBlocks(x, y, 150, 8, new Set([idx]));
    for (let k = 0; k < 3 && cand.length; k++){
      const j = cand.splice((Math.random() * cand.length) | 0, 1)[0];
      addBeam({ x1:x, y1:y, x2:g2w(j % D), y2:g2w((j / D) | 0), t:performance.now(), w:1.5, color:"#ffe14d", zig:true, life:130 });
      damageBlock(j, dmg * 1.5, 0);
    }
  }
  // 放電: 隣へ跳ねる (伝導体/テスラで連鎖、過負荷で脆くする)。装備の特性が無くても、スキルの放電付与で走る
  const shockP = (curFx && curFx.shock ? curFx.shock : 0) + (curPl ? elemChances().shock + (sk("b_elem") ? 0.025 : 0) : 0) + artVal("shockP") / 100;
  if (shockP > 0 && Math.random() < shockP){
    bumpProc("shock");
    let left = sk("b_tesla") ? 3 : sk("b_conductor") ? 2 : 1;
    let from = idx, dealt = dmg * 0.5 * elemMul() * (sk("b_shock") ? 1.5 : 1);
    const hitSet = new Set([idx]);
    while (left-- > 0){
      const fx = from % D, fy = (from / D) | 0, cand = [];
      for (const [dx, dy] of N4){ const j = liveAt(fx + dx, fy + dy); if (j >= 0 && !hitSet.has(j)) cand.push(j); }
      if (!cand.length) break;
      const j = cand[(Math.random() * cand.length) | 0];
      addBeam({ x1:g2w(fx), y1:g2w(fy), x2:g2w(j % D), y2:g2w((j / D) | 0), t:performance.now(), w:1.5, color:(curFx && curFx.accent) || "#ffe14d", zig:true, life:100 });
      rawDamage(() => damageBlock(j, dealt, 0));
      if (sk("b_overload")) overloads.set(j, 2);
      hitSet.add(j); from = j; dealt *= 0.7;
    }
  }
  if (cur > 0){
    if (sk("a_burn") && (burns.size < 500 || burns.has(idx))){ burns.set(idx, { d: dmg * 0.15 * burnSetMul(), t: 3 + (sk("b_plasma") ? 2 : 0), k: "burn" }); bumpProc("burn"); }
    if (curPl){
      if (sk("c_goldhand") && Math.random() < 0.03 && goldSet.size < 4000) goldSet.add(idx);
      infuseElements(idx, gx, gy, dmg);   // 元素付与 (スキル): どの武器でも状態異常が乗る
    }
  }
}

// ---------- 撃破時 ----------
// 静的なコイン倍率 (JACKPOT 等の副作用なし)。ツリー詳細の probe 表示にも使う
function coinMulStatic(){
  let m = (1 + artVal("coin")) * artMul("coinMul");   // 黄金の特異点: コイン ×2 (乗算キー)
  m *= masteryMul("c");   // 財宝マスタリー
  if (sk("c_merchant")) m *= 1.10;
  if (sk("c_king")) m *= 1.3;
  if (sk("c_bonus2")) m *= 1.2;
  if (sk("c_combo")) m *= 1 + Math.min(20, Math.floor(combo / 10)) * 0.02;
  if (sk("c_eldorado")) m *= 2;   // 黄金郷 (奥義)
  if (sk("c_philosopher")) m *= 1.5;   // 無限財宝 (奥義)
  if (sk("c_ultimate")) m *= 5;   // 無限黄金郷 (究極)
  if (sk("c_bonus3")) m *= 1.25;
  if (sk("c_king3")) m *= 1.2;
  return m;
}
function coinSkillMul(){
  let m = coinMulStatic();
  if (sk("c_lucky") && Math.random() < 0.08) m *= 2;
  if (sk("c_jackpot") && ++jackN >= (sk("c_jackpot2") ? 400 : 1000)){ jackN = 0; bumpProc("jackpot", player.x, player.y - 30); const jm = sk("c_jackpot2") ? 50 : 30; m *= jm; }
  return m;
}
function skillOnBreak(idx, gx, gy, kind, rare){
  let xp = blockXP(gx, gy) * MATS[materialAt(gx, gy)].xp;
  if (sk("c_xp")) xp *= 1.15;
  if (rare && sk("c_know")) xp *= sk("c_know2") ? 12 : 5;
  if (curFx && curFx.xpMul) xp *= curFx.xpMul;
  const dfx = dungeonFxAt(gx, gy); if (dfx) xp *= dfx.xp;   // ダンジョン固有効果: 経験値倍率
  gainXP(xp);
  combo++; comboT = 3;
  const wasFrost = frosts.has(idx), frostG = frostGen.get(idx) || 0;
  vuln.delete(idx); frosts.delete(idx); frostGen.delete(idx);
  const x = g2w(gx), y = g2w(gy);   // 周囲への波及は余波キュー (aftershock) 経由なので、再帰の深さで打ち切る必要はない
  const fire = burns.get(idx);
  if (fire){
    burns.delete(idx);
    if (sk("a_spread") || fire.rad) for (const [dx, dy] of (fire.rad && sk("b_radio") ? N8 : N4)){   // 延焼 / 放射能は隣へ移る
      const j = liveAt(gx + dx, gy + dy);
      if (j >= 0 && burns.size < 800 && !burns.has(j) && (fire.g || 0) < 3){ burns.set(j, { d: fire.d, t: fire.rad ? 4 : 3, rad: fire.rad, k: fire.k, g: (fire.g || 0) + 1 }); bumpProc(fire.k); }   // 燃え移りは3世代まで
    }
    if (sk("b_firestorm") && !firestorming){   // 火炎嵐: 燃焼中の撃破で爆発 (余波キュー経由)
      bumpProc("firestorm", x, y);
      const fd = fire.d * (sk("b_supernova") ? 12 : 6), rr = sk("b_supernova") ? 2 : 1;
      for (let dy = -rr; dy <= rr; dy++) for (let dx = -rr; dx <= rr; dx++){
        if (dx || dy) aftershock(liveAt(gx + dx, gy + dy), fd, SHOCK_FIRE);
      }
      addRing({ x, y, r: BS * (rr + 1), color: "255,120,40", dur: 350 });
    }
  }
  if (wasFrost && sk("b_icebreak") && !shattering){   // 氷砕: 氷結中の撃破で氷片が飛ぶ
    bumpProc("icebreak", x, y);
    const d = blockMaxHP(gx, gy) * (sk("b_glacier") ? 0.12 : 0.05), dirs = sk("b_glacier") ? N8 : N4;
    for (const [dx, dy] of dirs) aftershock(liveAt(gx + dx, gy + dy), d, SHOCK_SHATTER);
  }
  if (wasFrost && sk("b_frost3") && frostG < 2) for (const [dx, dy] of N4){ const j = liveAt(gx + dx, gy + dy); if (j >= 0 && frosts.size < 1500 && !frosts.has(j)){ frosts.set(j, 3 + (sk("b_frost2") ? 2 : 0)); frostGen.set(j, frostG + 1); bumpProc("frost"); } }   // 氷結伝播 (2世代まで)
  const shat = !shattering ? (sk("a_shatter") ? (sk("a_shatter2") ? 0.12 : 0.05) : 0) + (curFx && curFx.shatter ? curFx.shatter : 0) : 0;
  if (shat > 0){   // 破砕で壊れたブロックは弾けない (連鎖で星ごと崩れないように)
    const d = blockMaxHP(gx, gy) * shat;
    for (const [dx, dy] of N4) aftershock(liveAt(gx + dx, gy + dy), d, SHOCK_SHATTER);
  }
  if (sk("a_meteor") && ++breakN >= (sk("a_meteor2") ? 120 : 300)){ breakN = 0; bumpProc("meteor", x, y); meteors.push({ x, y, t: 0.6, r: BS * 4, dmg: playerDamage() * 10 }); }
  if (artHas("lg_nova") && !novaBusy && ++novaArtN >= 50){ novaArtN = 0; novaBusy = true; try { supernovaAt(x, y); } finally { novaBusy = false; } }   // 超新星の核: 50個破壊ごと
  if (artHas("lg_gaia") && !shattering && Math.random() < 0.30){   // 大地母神の腕: 隣接ブロックも一緒に砕く (緑の衝撃波)
    bumpArtProc("lg_gaia");
    for (const [dx, dy] of N4){ const j = liveAt(gx + dx, gy + dy); if (j >= 0) aftershock(j, blockMaxHP(gx + dx, gy + dy) * 10, SHOCK_SHATTER); }
    addRing({ x, y, r: BS * 1.8, color: "90,220,120", dur: 320 });
  }
  if (sk("e_reso") && !resonating){   // 鉱脈共鳴: 隣の同じ素材も一緒に削れる
    const pw = 0.2, mi = materialAt(gx, gy);
    for (const [dx, dy] of N4){ const j = liveAt(gx + dx, gy + dy); if (j >= 0 && materialAt(gx + dx, gy + dy) === mi) aftershock(j, blockMaxHP(gx + dx, gy + dy) * pw, SHOCK_RESO); }
  }
  if (sk("e_reso3") && !resonating){   // 共鳴増幅: 2マス先の同じ素材にも届く
    const pw2 = 0.3, rr = 2, mi2 = materialAt(gx, gy);
    for (let dy = -rr; dy <= rr; dy++) for (let dx = -rr; dx <= rr; dx++){
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 2) continue;
      const j = liveAt(gx + dx, gy + dy);
      if (j >= 0 && materialAt(gx + dx, gy + dy) === mi2) aftershock(j, blockMaxHP(gx + dx, gy + dy) * pw2, SHOCK_RESO);
    }
  }
  if (sk("e_quake2") && ++quakeN >= 400){   // 地殻振動: 400個壊すごとに自動で地震
    quakeN = 0; bumpProc("quake", x, y);
    const r = 300, rb = Math.ceil(r / BS);
    for (let yy = Math.max(0, gy - rb); yy <= Math.min(D - 1, gy + rb); yy++)
      for (let xx = Math.max(0, gx - rb); xx <= Math.min(D - 1, gx + rb); xx++){
        const j = liveAt(xx, yy);
        if (j >= 0 && Math.hypot(g2w(xx) - x, g2w(yy) - y) <= r) aftershock(j, blockMaxHP(xx, yy) * 0.03, SHOCK_NONE);
      }
    addRing({ x, y, r, t: performance.now(), color: "242,166,90", dur: 600 });
    sndBoom();
  }
  // --- お宝ブロック: 壊したら大ボーナス、壊すたび近くのブロックがまれにお宝化する ---
  if (treasureSet.has(idx)){
    bumpProc("treasureBreak", x, y);
    treasureSet.delete(idx);
    const tm = MATS[materialAt(gx, gy)], tb = sk("e_treasure3") ? 12 : sk("e_treasure2") ? 8 : 4;
    invAdd(tm.key, tb); noteDrop(x, y, tm, tb);
    gainXP(blockXP(gx, gy) * (sk("e_treasure3") ? 4 : 2));   // 通常分と合わせて 3倍 / 5倍
    const cv = Math.max(5, Math.round(blockCoinValue(gx, gy) * 2)), cn2 = sk("e_treasure3") ? 8 : 5;
    for (let i = 0; i < cn2; i++){ const a = Math.random() * Math.PI * 2, sp = 120 + Math.random() * 260; spawnCoin({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, value: cv, chest: false, age: 0 }); }
    addRing({ x, y, r: BS * 2.2, t: performance.now(), color: "255,214,64", dur: 500 });
  }
  if (sk("e_treasure") && treasureSet.size < (sk("e_treasure3") ? 60 : sk("e_treasure2") ? 40 : 20) && Math.random() < (sk("e_treasure3") ? 0.02 : sk("e_treasure2") ? 0.012 : 0.005) * (sk("e_rights") ? 2 : 1)){   // 惑星採掘権 (奥義): お宝出現率 ×2
    for (let t = 0; t < 10; t++){
      const j = liveAt(gx + ((Math.random() * 29) | 0) - 14, gy + ((Math.random() * 29) | 0) - 14);
      if (j >= 0 && j !== idx && !treasureSet.has(j)){ treasureSet.add(j); bumpProc("treasure"); break; }
    }
  }
  // --- 連破: 周囲のブロックが巻き込まれて一緒に壊れる (予算の範囲で連鎖) ---
  if (sk("e_chain") || sk("e_chain2")){
    if (chainBudget > 0){ chainBudget--; if (Math.random() < (sk("e_stareater") ? 0.90 : 0.75)) chainStrike(gx, gy); }   // 星喰い (奥義): 連破の継続率 75%→90%
    else if (Math.random() < (sk("e_chain2") ? 0.20 : 0.12)){ chainBudget = (sk("e_chain2") ? 4 : 2) - 1; chainStrike(gx, gy); }
  }
  // --- 発破採掘: 一定数壊すごとに、破壊地点を中心に大爆発 (発破で壊れた分は数えない) ---
  if (sk("e_blast") && !blasting && ++blastN >= blastThreshold()){
    blastN = 0; bumpProc("blast", x, y);
    const rr = sk("e_blast3") ? 3 : sk("e_blast2") ? 2 : 1;
    for (let dy = -rr; dy <= rr; dy++) for (let dx = -rr; dx <= rr; dx++){
      if (!dx && !dy) continue;
      const j = liveAt(gx + dx, gy + dy);
      if (j >= 0) aftershock(j, blockMaxHP(gx + dx, gy + dy) * 10, SHOCK_BLAST);
    }
    addRing({ x, y, r: BS * (rr + 1.5), color: "255,110,50", dur: 450 });
    sndBoom();
  }
  // --- 自動採掘網 (奥義): 破壊時 20% で周囲 3x3 を追加で削る (発破採掘とは別系統で重複発動可) ---
  if (sk("e_automine") && !automining && !blasting && Math.random() < 0.20){
    bumpProc("automine", x, y);
    for (const [dx, dy] of N8){ const j = liveAt(gx + dx, gy + dy); if (j >= 0) aftershock(j, blockMaxHP(gx + dx, gy + dy) * 0.5, SHOCK_AUTOMINE); }
    addRing({ x, y, r: BS * 1.9, color: "80,220,255", dur: 300 });
  }
  // --- 星喰い (奥義): 100個破壊ごとに十字4方向を一直線に貫通破壊 (各方向 最大20セル、報酬あり) ---
  if (sk("e_stareater") && !stareating && ++starN >= 100){
    starN = 0; bumpProc("stareater", x, y);
    skillFeed("stareater", "星喰いの一撃", "🌟", "#f2a65a");
    for (const [dx, dy] of N4){
      addBeam({ x1: x, y1: y, x2: x + dx * BS * 20, y2: y + dy * BS * 20, w: 3, color: "rgba(255,176,96,.8)", life: 300 });
      for (let s = 1; s <= 20; s++){
        const jx = gx + dx * s, jy = gy + dy * s;
        if (jx < 0 || jy < 0 || jx >= D || jy >= D) break;
        const j = liveAt(jx, jy);
        if (j >= 0) aftershock(j, blockMaxHP(jx, jy) * 10, SHOCK_STAR);
      }
    }
    addRing({ x, y, r: BS * 4, t: performance.now(), color: "255,176,96", dur: 550 });
    sndBoom();
  }
  // --- 星喰い・真 (究極): 破壊時 25% で周囲 半径3セルを追加全破壊 + 25個ごとに解体波 (どちらも全破壊キュー経由) ---
  if (sk("e_ultimate") && !fromBreakQueue){
    if (Math.random() < 0.25){
      bumpProc("devour", x, y);
      addRing({ x, y, r: BS * 3.4, t: performance.now(), color: "255,190,90", dur: 380 });
      queueDestroyCircle(gx, gy, 3);
    }
    if (++devourN >= 25){
      devourN = 0; bumpProc("diswave", x, y);
      skillFeed("diswave", "解体波", "🌀", "#ffb060");
      addRing({ x, y, r: BS * 10.5, t: performance.now(), color: "255,176,96", dur: 650 });
      addRing({ x, y, r: BS * 6, t: performance.now(), color: "255,255,255", dur: 450 });
      dimFx.push({ x, y, t: 0, kind: "diswave", dur: 0.6 });
      queueDestroyCircle(gx, gy, 10);
      sndBoom();
    }
  }
}
// 発破採掘の発動間隔 (星喰い習得で ×0.7 に短縮、下限 5)
function blastThreshold(){ const b = sk("e_blast3") ? 10 : sk("e_blast2") ? 15 : 25; return sk("e_stareater") ? Math.max(5, Math.round(b * 0.7)) : b; }
// 連破の一撃: 周囲8マスからランダムな1ブロックを即座に砕く
function chainStrike(gx, gy){
  bumpProc("chain");
  const cand = [];
  for (const [dx, dy] of N8){ const j = liveAt(gx + dx, gy + dy); if (j >= 0) cand.push(j); }
  if (!cand.length) return;
  procTag("chain", g2w(gx), g2w(gy));
  const j = cand[(Math.random() * cand.length) | 0];
  addRing({ x: g2w(j % D), y: g2w((j / D) | 0), r: BS * 1.4, color: "242,166,90", dur: 260 });
  aftershock(j, blockMaxHP(j % D, (j / D) | 0) * 10, SHOCK_NONE);
}

// ---------- コイン ----------
function addCoins(n){ state.coins += n; state.totalCoins += n; }
function gainCoin(c, byBot){
  let v = c.value;
  const n = c.n || 1;   // 合体コインの構成枚数。取得は1回でも、発動抽選は構成枚数ぶん回して期待値を落とさない
  if (byBot){
    v *= botCoinMul();
    if (sk("c_haul")) v *= 1.10;
    if (c.age > 2 && cbInterest() > 0) v *= 1 + cbInterest();
    if (cbScanChance() > 0){ const sc = cbScanChance(); for (let k = 0; k < n; k++) if (Math.random() < sc) scanMaterialAt(c.x, c.y); }   // 鉱物スキャナ
  }
  v = Math.round(v);
  addCoins(v); sndCoin(n, c.chest, byBot);
  if (!c.dup && sk("c_tycoon")){   // 大富豪の蓄財 (奥義): コイン獲得時 3% で ×20 バースト + 金の雨 + フィード
    const per = Math.max(1, Math.round(v / n));   // 1枚あたりの額 (n=1 では従来と完全一致)
    for (let k = 0; k < n; k++) if (Math.random() < 0.03){
      const burst = per * 20;
      addCoins(burst); bumpProc("tycoon");
      goldRainFx.push({ x: c.x, y: c.y });
      addRing({ x: c.x, y: c.y, r: BS * 2.4, t: performance.now(), color: "255,214,10", dur: 420 });
      skillFeed("tycoon", `大当たり! +${fmt(burst)}コイン`, "💰", "#ffd60a");
    }
  }
  if (sk("c_piggy")) piggy += v * (sk("c_piggy2") ? 0.2 : 0.1);
  if (!c.dup && sk("c_spill")){
    const per = Math.max(1, Math.round(c.value / n));
    for (let k = 0; k < n; k++) if (Math.random() < 0.05){
      const a = Math.random() * Math.PI * 2;
      spawnCoin({ x: c.x, y: c.y, vx: Math.cos(a) * 420, vy: Math.sin(a) * 420, value: per, dup: true, age: 0 });
    }
  }
}
// 鉱物スキャナ: その場所の地層からランダムな素材を1つ見つける
function scanMaterialAt(x, y){
  const gx = w2g(x), gy = w2g(y);
  if (gx < 0 || gy < 0 || gx >= D || gy >= D) return;
  const b = bodyAt(gx, gy);
  if (b < 0) return;
  let m;
  if (b > 0){ const S = SATS[b - 1], dep = blockDepth(gx, gy); m = MATS[pickFrom(dep < 0.2 ? S.tab0 : dep < 0.6 ? S.tab1 : S.tab2, Math.random())]; }
  else { const li = Math.max(1, layerIndexOf(blockDepth(gx, gy))), tab = LAYER_TABLES[li]; m = MATS[pickFrom(tab, Math.random())]; }
  invAdd(m.key, 1); noteDrop(x, y, m, 1);
}
