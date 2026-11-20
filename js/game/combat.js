"use strict";
/* =========================================================
   game/combat.js - ブロックの探索・ダメージ・破壊報酬と射撃
   ========================================================= */

const PLANET_CX = BS / 2, PLANET_CY = BS / 2;      // 惑星中心のワールド座標




// ---------- 黄金ブロック (黄金の手 / 錬金術スキルで変化) ----------
const goldSet = new Set();   // 黄金化されたブロックの idx
const GOLD_MUL = 4;          // 黄金ブロックのコイン倍率


// --- 演出 --- (画面シェイクは 2026-11-19 Tomomi 指示で全廃止)
let curCoinMul = 1;     // いま処理中の攻撃のコイン倍率 (黄金の弾丸など)
let novaLeft = 0;   // いま処理中の攻撃の誘爆残り回数
let curFx = null;       // いま処理中の攻撃の装備 (処刑 / 燃焼 / 時限爆弾などの命中時効果)
let curCarry = false;   // いま処理中の攻撃が「余剰ダメージを奥へ引き継ぐ」弾・照射か

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
  const eu = top && curFx ? curFx.evoU : null;   // 固有覚醒 (data/evo-unique.js)
  const evoPre = eu && (eu.t === "frozen" || eu.t === "burning") ? (frosts.has(idx) ? 1 : 0) | (burns.has(idx) ? 2 : 0) : 0;
  const dfx = top ? dungeonFxAt(gx, gy) : null;   // ダンジョン固有効果
  if (dfx){ dmg *= dfx.dmg; if (dfx.crit && Math.random() < dfx.crit){ dmg *= 2; dmgCritFlag = true; } }
  const voidHit = top && dmgVoidFlag;   // 虚無の単眼の会心 (skillHitMods か弾の経路が立てる)。読んだら消費する
  if (top) dmgVoidFlag = false;
  let cur = hp - dmg;
  if (top && cur > 0 && sk("a_execute") && cur <= blockMaxHP(gx, gy) * 0.1) cur = 0;   // 処刑
  if (top && cur > 0 && sk("b_zero") && frosts.has(idx) && cur <= blockMaxHP(gx, gy) * 0.1) cur = 0;   // 絶対零度: 氷結中は残り1割で砕ける
  if (top && cur > 0 && curFx && curFx.exec && cur <= blockMaxHP(gx, gy) * curFx.exec){ cur = 0; if (eu) evoExecFlag = true; }   // 装備の処刑
  // ダメージ数値用に「実際に削れた量」をブロック単位で貯める (表示は flushDmgLabels がまとめて行う)
  const dealt = hp - Math.max(0, cur);
  if (dealt > 0){
    let e = dmgAcc.get(idx);
    if (!e){
      // 画面外のヒット (遠くの攻撃ボット・仲間) は数えない。数えると枠を先に使い切り、画面内の数字が出なくなる
      const wx = g2w(gx), wy = g2w(gy);
      if (dmgAcc.size < 96 && onScreen(wx, wy, BS * 2)){
        e = dmgEntryPool.pop() || {};
        e.x = wx; e.y = wy; e.total = 0; e.crit = false; e.void = false; e.max = hp;
        dmgAcc.set(idx, e);
      }
    }
    if (e){ e.total += dealt; if (dmgCritFlag) e.crit = true; if (voidHit) e.void = true; }
    if (voidHit){   // 虚無の単眼: 紫のリング。星バーストは壊れた時だけ (頻度を抑える)
      bumpArtProc("lg_void");
      addRing({ x: g2w(gx), y: g2w(gy), r: BS * 2.4, t: nowMs, color: "176,110,255", dur: 380 });
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
        addRing({ x: g2w(gx), y: g2w(gy), r: BS * 2, t: nowMs, color: "255,150,60", dur: 300 });
        damageBlock(idx, blockMaxHP(gx, gy) * 0.15, 0);
        bumpProc("thermo", g2w(gx), g2w(gy));
      } else if (frosts.size < 1500 || frosts.has(idx)){
        const freshFrost = !frosts.has(idx);
        frosts.set(idx, 3 + (sk("b_frost2") ? 2 : 0)); frostGen.set(idx, 0);   // 氷結 (直接当てたものは第0世代)
        bumpProc("frost");
        if (freshFrost && sk("b_permafrost")) for (const [dx, dy] of N4){ const j = liveAt(gx + dx, gy + dy); if (j >= 0 && Math.random() < 0.5 && frosts.size < 1500 && !frosts.has(j)){ frosts.set(j, 2); frostGen.set(j, 1); bumpProc("frost"); } }   // 永久凍土 (伝播は1世代だけ)
      }
    }
    if (curFx.bomb && !bombSet.has(idx) && bombs.length < 200){ bombSet.add(idx); bombs.push({ idx, t: 1.5, dmg: dmg * curFx.bomb, fx: curFx }); }   // 時限爆弾
  }
  if (eu) evoHit(idx, gx, gy, raw, hp, cur, evoPre);   // 固有覚醒: 命中時の発動条件
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
  if (isMainCell(gx, gy)) mainAlive--;   // 主惑星だけの残数 (エンディング判定用。衛星や他天体の破壊では減らない)
  const m = MATS[materialAt(gx, gy)];
  burstAt(g2w(gx), g2w(gy), curFx, m);
  const kind = m.explosive ? 2 : m.cat === "gem" ? 1 : 0;
  // 硬い (HPが高い) ブロック・貴重な素材ほど高額。そこへ各種倍率が掛かる
  const rare = kind !== 0 || goldSet.has(idx);
  let value = blockCoinValue(gx, gy) * curCoinMul * coinSkillMul() * weaponYield();
  const goldified = sk("c_ultimate") && Math.random() < 0.05;   // 無限黄金郷 (究極): 破壊時 5% で黄金化 → そのブロックのコイン ×100
  if (goldified) value *= 100;
  if (kind === 1 && sk("c_gem")) value *= sk("c_gem2") ? 2.2 : 1.5;
  if (sk("e_deepfit")) value *= 1 + 0.2 * blockDepth(gx, gy);   // 深層適性: 深いほどコイン増
  value *= evoCoinMul();   // 固有覚醒: コインの加速 (黄金の洪水)
  if (goldSet.delete(idx)) value *= GOLD_MUL;
  const bfx = dungeonFxAt(gx, gy); if (bfx){ value *= bfx.coin; if (bfx.gold && Math.random() < bfx.gold) value *= GOLD_MUL; }   // ダンジョン固有効果
  const chest = sk("c_king") && Math.random() < (sk("c_king2") ? 0.015 : 0.005);   // ミダス王: 宝箱
  if (chest) value *= sk("c_king3") ? 60 : sk("c_king2") ? 30 : 20;
  value = Math.max(1, Math.round(value));
  dropMaterial(gx, gy, m, kind);
  noteCoinSpawn(g2w(gx), g2w(gy), value);   // 回収ボットの待ち伏せ先 (コイン発生ヒートマップ)
  spawnCoin({ x:g2w(gx), y:g2w(gy), vx:(Math.random()-.5)*90, vy:(Math.random()-.5)*90, value, chest, age:0 });   // 上限を超えたら既存のコインへ上乗せ
  sndBreak(m);
  if (goldified){   // 黄金化: 金色に輝いて壊れる (リング + 金の星バースト + フィード)
    bumpProc("goldify", g2w(gx), g2w(gy)); sndGoldify();
    skillFeed("goldify", "黄金化! コイン×100", "✨", "#ffd60a");
    addRing({ x: g2w(gx), y: g2w(gy), r: BS * 2.6, t: performance.now(), color: "255,214,10", dur: 520 });
    burstAt(g2w(gx), g2w(gy), { accent: "#ffd60a", c2: "#fff3b0", burst: "star" }, m);
  }
  if (mainAlive <= 0) return gameClear();   // 主惑星の残数が 0 → エンディング
  skillOnBreak(idx, gx, gy, kind, rare);   // 経験値 / コンボ / 撃破時スキル
  if (curFx && curFx.evoU) evoBreak(idx, gx, gy, kind);   // 固有覚醒: 撃破時の発動条件
  if (kind === 2){   // 爆発性ブロック: 5x5 を巻き込んで誘爆 (隣の爆発物にも連鎖する)。危険物取扱で 7x7・威力1.5倍
    const big = sk("c_bomb"), er = big ? 3 : 2;
    const dmg = blockMaxHP(gx, gy) * 1.5 * (big ? 1.5 : 1);
    addRing({ x:g2w(gx), y:g2w(gy), r:BS * (er + 1), t:performance.now(), color:matColorRGB(m) });
    sndBoom();
    for (let dy = -er; dy <= er; dy++) for (let dx = -er; dx <= er; dx++){
      if (dx || dy) aftershock(liveAt(gx + dx, gy + dy), dmg, SHOCK_NONE);   // 誘爆は余波キュー経由 (隣の爆発物へ順に連鎖する)
    }
  }
  if (novaLeft > 0){ // ノヴァバースト: 壊れたブロックが周囲8個を巻き込む (威力は壊れたブロックの最大HPの60%)
    const keep = novaLeft; novaLeft = keep - 1;
    const novaDmg = blockMaxHP(gx, gy) * 0.6;
    addRing({ x:g2w(gx), y:g2w(gy), r:BS * 1.8, t:performance.now(), color:"255,95,95", dur:220 });
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
  // 普通の素材は 0.7秒に1回まで (控えめ設定では出さない)。レア素材は常に出す
  if ((rare || (!fxLow() && nowMs - labelT > 700)) && labels.length < MAX_LABELS){
    labelT = nowMs;
    const fs = rare ? 13 : 12, text = `+${fmt(n)} ${m.name}`;
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
  try { fired = shootRaw(sx, sy, (doom ? dmg * 5 : dmg) * (pl ? evoDmgMul() : 1), weaponKey, fromBot, doom ? 2 : 0); }   // 固有覚醒: 威力の加速
  finally { curPl = false; }
  if (pl && fired){
    doomN = doom ? 0 : doomN + 1;
  }
  return fired;
}
// xs = 追加の着弾範囲 (終末の一撃)
function shootRaw(sx, sy, dmg, weaponKey, fromBot, xs){
  const w = evoW(weaponKey || state.weapon);   // 覚醒 (★) 込みの性能 (data/evolve.js)
  const mods = curPl;

  // ボット: 装備なしは普通の単発、装備ありは装備の性能そのまま
  if (fromBot){
    if (weaponKey){
      curFx = w;
      try { const ok = shootWeapon(w, sx, sy, dmg, atkRange() * (w.range || 1), w.splash || 0, false, sk("d_ap") ? 1 : 0); if (ok && w.evoU && !evoEchoing) evoShot(w, sx, sy, dmg); return ok; }
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
  try { const ok = shootWeapon(w, sx, sy, dmg, rng, splash, mods); if (ok && w.evoU && !evoEchoing) evoShot(w, sx, sy, dmg); return ok; }   // 固有覚醒: 射撃時の発動条件
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
  // 最難関の武器 (超新星 / 流星群 / 銀河斬 / 特異点 / 創世): 専用の撃ち方 (game/ultra.js)
  if (w.ultra) return ultraFire(w, sx, sy, dmg, mods);
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
    if (hitAny){ addRing({ x:sx, y:sy, r, t:performance.now(), color: hexRGB(w.accent), evo: w.evo || 0 }); sndShoot(w, mods); }
    if (hitAny && w.evoU && w.evoU.t === "pulse" && evoIsReady(w.key)){   // 固有覚醒の発動点: 自機に一番近いブロック (無ければ自機)
      const j = findNearestBlock(sx, sy, r);
      evoAimX = j >= 0 ? g2w(j % D) : sx; evoAimY = j >= 0 ? g2w((j / D) | 0) : sy;
    }
    return hitAny;
  }

  // チェイン: 命中したブロックから近くのブロックへ次々に飛び移る
  if (w.mode === "chain"){
    const seen = new Set();
    let px = sx, py = sy, d = dmg;
    const mob0 = nearestMob(sx, sy, rng);   // 最初の一撃はモンスター優先
    if (mob0){
      evoAimX = mob0.x; evoAimY = mob0.y;
      addBeam({ x1:px, y1:py, x2:mob0.x, y2:mob0.y, t:performance.now(), w:2.5, color:w.accent, zig:true, life:120, evo: w.evo || 0 });
      damageMob(mob0, d, { fx: w });
      px = mob0.x; py = mob0.y; d *= w.chainDecay || 0.7;
    }
    let idx = findNearestBlock(px, py, mob0 ? 120 : rng);
    if (!mob0 && idx < 0) return false;
    for (let c = mob0 ? 1 : 0; c <= w.chains && idx !== undefined && idx >= 0; c++){
      seen.add(idx);
      const tx = g2w(idx % D), ty = g2w((idx / D) | 0);
      addBeam({ x1:px, y1:py, x2:tx, y2:ty, t:performance.now(), w:c ? 1.5 : 2.5, color:w.accent, zig:true, life:120, evo: w.evo || 0 });
      damageBlock(idx, d, splash);
      px = tx; py = ty; d *= w.chainDecay || 0.7;
      evoAimX = tx; evoAimY = ty;   // 固有覚醒の発動点 = 連鎖の終点
      const cand = findNearestBlocks(px, py, 120, 8, seen);
      idx = cand.length ? cand[(Math.random() * cand.length) | 0] : undefined;
    }
    sndShoot(w, mods);
    return true;
  }

  // 照準: 射程内にモンスターがいれば最優先で狙い、残りの多目標枠をブロックに使う
  const mobT = nearestMob(sx, sy, rng), nTgt = w.targets || 1;
  const targets = findNearestBlocks(sx, sy, rng, mobT ? nTgt - 1 : nTgt);
  const aims = [];
  if (mobT) aims.push({ x: mobT.x, y: mobT.y, mob: mobT, idx: -1 });
  for (const idx of targets) aims.push({ x: g2w(idx % D), y: g2w((idx / D) | 0), mob: null, idx });
  if (!aims.length) return false;
  evoAimX = aims[0].x; evoAimY = aims[0].y;   // 固有覚醒の発動点

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
      addBeam({ x1:sx, y1:sy, x2:sx + Math.cos(a) * rng, y2:sy + Math.sin(a) * rng, t:performance.now(), w:w.beamW || 5, color:w.accent, evo: w.evo || 0 });
    }
    sndShoot(w, mods);
    return true;
  }

  // 通常射撃 (aims は同時多目標。モンスターが先頭)
  for (const aim of aims){
    const idx = aim.idx, tx = aim.x, ty = aim.y, baseA = Math.atan2(ty - sy, tx - sx);
    if (w.mode === "laser"){
      addBeam({ x1:sx, y1:sy, x2:tx, y2:ty, t:performance.now(), w:2 + 0.3 * (w.evo || 0), color:w.accent, evo: w.evo || 0 });
      if (aim.mob){ damageMob(aim.mob, dmg, { fx: w }); continue; }
      curCarry = true;
      const over = damageBlock(idx, dmg, splash);
      if (over > 0) carryRay(tx, ty, baseA, over, Math.max(BS * 2, rng - Math.hypot(tx - sx, ty - sy)), splash);
      curCarry = false;
      continue;
    }
    // 弾は武器の素の性能で作る (mods は「自機の弾か」の印)
    // 強化で増えた弾 (最大 +2) は、1発の威力を弾数で割って DPS を変えない (data/weapons.js の weaponPellets)
    const n = weaponPellets(w.key), base = w.pellets || 1;
    if (n > base) dmg *= base / n;
    const spd = (w.bulletSpeed || 720) * BULLET_SPD_MUL;
    const ev = w.evo || 0;   // 覚醒 (★): 弾が大きく・光り・残像を引く (描画は render/bullets.js)
    const mk = a => {
      const isCrit = w.critC && Math.random() < w.critC;
      const hm = !!w.homing;
      bullets.push({ x:sx, y:sy, vx:Math.cos(a)*spd, vy:Math.sin(a)*spd,
        dmg: isCrit ? dmg * w.critM : dmg, crit:isCrit, fx:w, sz:(w.size || 4) * (1 + 0.08 * ev),
        splash, life: rng / spd + 0.25,
        homing: hm, targetIdx: idx, targetMob: aim.mob ? aim.mob.id : 0, retargetT: 0, color: w.accent,
        pierce: (w.pierce || 0) + (bonusPierce || 0), bounce: w.bounce || 0,
        split: w.split || 0, frags: w.frags || 0, lastHit: -1, pl: mods, shape: w.shape || "dot",
        coinMul: w.coinMul || 1, nova: w.nova || 0, orb: w.orb ? w.orbR : 0, tickT: 0,
        move: w.move || null, seed: Math.random() * 6.283, age: 0, life0: rng / spd + 0.25, spd0: spd,
        baseSz: (w.size || 4) * (1 + 0.08 * ev), spin: w.spin || 0, pulse: w.pulse || 0, trail: !!w.trail || ev >= 2, glow: !!w.glow || ev >= 1, evo: ev,
        mine: w.mine || 0, ox: sx, oy: sy,
        form: w.form || w.shape || "dot", c2: w.c2 || "#ffffff", trailFx: w.trailFx || "ghost" });
    };
    const step = w.arc ? Math.PI * 2 / n : (w.spreadA || 0.16);
    for (let p = 0; p < n; p++){
      const a = w.arc ? baseA + p * step : baseA + (n > 1 ? (p - (n - 1) / 2) * step : 0);
      mk(a + (w.jitter ? (Math.random() - 0.5) * w.jitter : 0));
    }
  }
  sndShoot(w, mods);
  return true;
}
const hexRGB = h => { const n = parseInt(h.slice(1), 16); return `${n >> 16 & 255},${n >> 8 & 255},${n & 255}`; };
