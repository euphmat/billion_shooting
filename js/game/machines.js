"use strict";
/* =========================================================
   game/machines.js - 6系統目「機兵」: 独立稼働する自律機兵 (スキル f_*)

   自機にも工房の攻撃ボットにも従わず、自機のまわりの「戦域」に散らばって自分の判断で動く機兵たち。
   - ハンター   : 戦域を飛び回り、レーザーで撃ち抜く (照準マーカー / 貫通 / 炸裂 / レールガン / 狩猟本能)
   - ドリラー   : ブロックをすり抜けて内部を掘り進む (コアダイブ / マグマ噴出 / 地殻粉砕機)
   - スパイダー : 表面を這い、ブロックをHP無視で引き剥がす (自己複製で子機が増える / 大顎で 3x3)
   - テスラ     : ブロックを跳ねる稲妻 (帯電連鎖で壊れた帯電ブロックが放電)
   - ボマー     : 上空を旋回し、密集地点へ爆弾 (絨毯爆撃で3発)
   - キャノン   : 地表に降りて砲台化、遠くの密集地点へ砲撃 (多連装 / 戦術核)
   - 奥義: タイタン (踏みつけ・ミサイル) / 群体知性 (リンク光線・機数で威力) / オメガ (定期的に暴走しHP無視)
   - 究極: 惑星解体機群 (分裂して増えるナノマシンがHP無視で惑星を分解)

   威力の土台は自機DPS (playerDPS)。命中は全て通常の damageBlock 経路を通るので、
   全ダメージ倍率 (gMul)・会心・報酬・撃破時スキルがそのまま乗る。
   機兵は実行時の状態だけを持ち、セーブしない (スキルから毎フレーム機数を合わせ直す)。
   毎フレーム処理は skill-fx.js の capstoneUpdate から、描画は capstoneDraw から呼ばれる。
   ========================================================= */

const MCH = {
  hunters: [], drillers: [], spiders: [], kids: [], teslas: [], bombers: [], cannons: [], titan: null, nanites: [],
};
const fDrops = [];          // 落下物 / 砲弾 / ミサイル {x0,y0,x1,y1,t,dur,delay,arc,r,dmg,kind,ang}
const fMarks = new Map();   // 照準マーカー: idx -> 期限 (ms)
const fCharged = new Map(); // 帯電: idx -> {u: 期限 (ms), g: 放電の世代}
let fLinks = [];            // 群体知性のリンク [unitA, unitB]
let fCount = 0;             // 稼働中の機兵数 (群体知性の威力計算・表示用)
let fOmega = 0, fOmegaT = 25, fNukeT = 25, fLinkT = 0;
let fRipAcc = 0, fNanoInit = false, fActive = false;
let fKiller = null;         // いま攻撃中のハンター (狩猟本能の撃破判定)
const F_HUNT_R = 280;       // ハンターの射程
const F_LEASH = 2600;       // 自機からこれ以上離れたら戦域へ呼び戻す

// ---------- 機数と倍率 ----------
function fWant(){
  return {
    hunters: (sk("f_core") ? 2 : 0) + (sk("f_hunter2") ? 2 : 0) + (sk("f_hunter3") ? 2 : 0) + (sk("f_hunter4") ? 3 : 0) + (sk("f_legion") ? 3 : 0),
    drillers: (sk("f_driller") ? 1 : 0) + (sk("f_drill2") ? 1 : 0) + (sk("f_drill4") ? 1 : 0),
    spiders: (sk("f_spider") ? 3 : 0) + (sk("f_spider2") ? 3 : 0),
    teslas: (sk("f_tesla") ? 1 : 0) + (sk("f_tesla2") ? 1 : 0),
    bombers: (sk("f_bomber") ? 1 : 0) + (sk("f_carpet") ? 1 : 0),
    cannons: (sk("f_artillery") ? 1 : 0) + (sk("f_artillery2") ? 1 : 0),
    titan: sk("f_titan") ? 1 : 0,
    nanites: sk("f_ultimate") ? 6 : 0,
  };
}
// スキルだけで決まる機数 (ツリーの「習得するとこう変わる」用。子機・分裂ぶんは含めない)
function fDesiredCount(){ const w = fWant(); return w.hunters + w.drillers + w.spiders + w.teslas + w.bombers + w.cannons + w.titan + w.nanites; }
// 全機兵の威力倍率 (n = 群体知性で数える機数)
function fPowWith(n){
  // f0 共有修飾: 設計図 (レベル×1%、最大+60%) と自動戦闘プログラム (無操作30秒で ×1.5) は自律機兵にも効く
  return masteryMul("f") * (sk("f_legion") ? 1.3 : 1) * (sk("f_overlord") ? 2 : 1) * (sk("f_omega") ? 2.5 : 1) * (sk("f_ultimate") ? 3 : 1)
    * (sk("f_hivemind") ? 1 + 0.04 * n : 1) * f0BlueprintMul() * f0IdleMul();
}
const fPow = () => fPowWith(fCount);
const fPowStatic = () => fPowWith(fDesiredCount());
// 連射・動作速度 (オメガの暴走中は ×3)
const fRateStatic = () => (sk("f_overclock") ? 1.25 : 1) * (sk("f_overlord") ? 1.3 : 1) * (1 + MASTERY.f.frate[masteryRank("f")]);
// f0 急速充電: レベルアップ後 20秒間は自律機兵 (とプロト) の動作速度 ×2
const fRate = () => fRateStatic() * (fOmega > 0 ? 3 : 1) * (f0ChargeT > 0 ? 2 : 1);

// ---------- 戦域: 機兵ごとの持ち場 (自機のまわりに散らばる。自機が動けば戦域ごと動く) ----------
function fHome(u){
  const a = u.ha + nowMs / 45000;
  return { x: player.x + Math.cos(a) * u.hr, y: player.y + Math.sin(a) * u.hr };
}
function fNewUnit(i, n, extra){
  const a = Math.random() * Math.PI * 2, d = 40 + Math.random() * 40;
  const u = { x: player.x + Math.cos(a) * d, y: player.y + Math.sin(a) * d, ang: a,
    ha: i / Math.max(1, n) * Math.PI * 2 + (Math.random() - 0.5) * 0.6, hr: 380 + Math.random() * 760, hrT: 10 + Math.random() * 10,
    flash: 0, born: nowMs };
  Object.assign(u, extra || {});
  addRing({ x: u.x, y: u.y, r: 34, color: "140,125,255", dur: 380 });
  return u;
}
// 持ち場の半径をときどき選び直す / 戦域から離れすぎたら呼び戻す (共通)
function fTend(u, dt){
  u.hrT -= dt;
  if (u.hrT <= 0){ u.hrT = 10 + Math.random() * 12; u.hr = 380 + Math.random() * 760; }
  const dx = u.x - player.x, dy = u.y - player.y;
  if (dx * dx + dy * dy > F_LEASH * F_LEASH){
    const h = fHome(u);
    addRing({ x: u.x, y: u.y, r: 30, color: "140,125,255", dur: 300 });
    u.x = h.x; u.y = h.y;
    addRing({ x: u.x, y: u.y, r: 30, color: "140,125,255", dur: 300 });
    return true;
  }
  return false;
}
function fMoveTo(u, tx, ty, base, dt, stop){
  const dx = tx - u.x, dy = ty - u.y, d = Math.hypot(dx, dy);
  if (d <= (stop || 0) || d < 0.01) return d;
  const spd = Math.min(d / dt, base + Math.min(1600, Math.max(0, d - 300) * 1.2));
  u.x += dx / d * spd * dt; u.y += dy / d * spd * dt;
  u.ang = Math.atan2(dy, dx);
  return d;
}

// ---------- ダメージの部品 (全て自律機兵の攻撃) ----------
function fMarked(idx){
  const t = fMarks.get(idx);
  if (t === undefined) return false;
  if (t > nowMs) return true;
  fMarks.delete(idx); return false;
}
const fMarkMul = idx => (fMarks.size && fMarked(idx)) ? 1.6 : 1;
// f0 自動照準較正: 機兵 (プロト・砲台・自律機兵) の攻撃は 10% で会心 (ダメージ2倍)。ダメージチョークポイントで判定する
const fCalibDmg = dmg => (sk("f0_calib") && Math.random() < 0.1) ? dmg * 2 : dmg;
// 単体への攻撃 (攻撃そのもの = 全ダメージ倍率・会心が乗る)。オメガの暴走中はHP無視で一撃破壊
function fHitBlock(idx, dmg){
  if (idx < 0 || isDestroyed(idx)) return;
  const pm = curMach; curMach = true;   // 発生源フラグ (f0 排熱利用の集計用)
  try {
    if (fOmega > 0){ damageBlock(idx, blockMaxHP(idx % D, (idx / D) | 0) * 100, 0); return; }
    damageBlock(idx, fCalibDmg(dmg * fMarkMul(idx)), 0);
  } finally { curMach = pm; }
}
// 余波としての攻撃 (炸裂・リンク光線など。全ダメージ倍率は手で掛ける)
function fRawHit(idx, dmg){
  if (idx < 0 || isDestroyed(idx)) return;
  const pm = curMach; curMach = true;
  try { rawDamage(() => damageBlock(idx, fOmega > 0 ? blockMaxHP(idx % D, (idx / D) | 0) * 100 : fCalibDmg(dmg * gMul * fMarkMul(idx)), 0)); }
  finally { curMach = pm; }
}
function fMobsIn(x, y, r, dmg){
  const r2 = r * r;
  for (const m of mobs){ if (m.dead) continue; const dx = m.x - x, dy = m.y - y; if (dx * dx + dy * dy <= r2) damageMob(m, fOmega > 0 ? dmg * 10 : fCalibDmg(dmg), null); }
}
// 範囲攻撃 (r: ワールド座標)。マーカーの上乗せつき。暴走中は範囲ごと全破壊キューへ
function fRadius(x, y, r, dmg){
  fMobsIn(x, y, r, dmg);
  if (fOmega > 0){ queueDestroyCircle(w2g(x), w2g(y), Math.max(1, Math.round(r / BS))); return; }
  if (outOfPlanet(x, y, r)) return;
  const cgx = w2g(x), cgy = w2g(y), rb = Math.ceil(r / BS), r2 = r * r;
  const pm = curMach; curMach = true;
  try {
    for (let gy = Math.max(0, cgy - rb); gy <= Math.min(D - 1, cgy + rb); gy++){
      for (let gx = Math.max(0, cgx - rb); gx <= Math.min(D - 1, cgx + rb); gx++){
        const i = gy * D + gx;
        if (!blockExists(gx, gy) || isDestroyed(i)) continue;
        const dx = g2w(gx) - x, dy = g2w(gy) - y;
        if (dx * dx + dy * dy <= r2) damageBlock(i, fCalibDmg(dmg * fMarkMul(i)), 0);
      }
    }
  } finally { curMach = pm; }
}
// 線上の生きているブロック (近い順、重複なし)
function fRayBlocks(x, y, a, d0, d1, n){
  const out = [], ca = Math.cos(a), sa = Math.sin(a);
  let last = -1;
  for (let d = d0; d <= d1 && out.length < n; d += BS / 2){
    const gx = w2g(x + ca * d), gy = w2g(y + sa * d), i = gy * D + gx;
    if (i === last) continue;
    last = i;
    if (blockExists(gx, gy) && !isDestroyed(i)) out.push(i);
  }
  return out;
}
// 密集地点: 近場の候補 + 範囲内のランダムな候補を、半径 rad セルのブロック数で採点
function fDensest(x, y, range, rad){
  const cand = [];
  for (const i of findNearestBlocks(x, y, Math.min(range, 400), 6)) cand.push(i);
  for (let k = 0; k < 9; k++){
    const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * range;
    const i = findNearestBlock(x + Math.cos(a) * d, y + Math.sin(a) * d, 160);
    if (i >= 0) cand.push(i);
  }
  for (const m of mobs) if (!m.dead && Math.hypot(m.x - x, m.y - y) <= range) return { x: m.x, y: m.y };   // モンスター優先
  let best = -1, bs = -1;
  const r2 = rad * rad;
  for (const i of cand){
    const cgx = i % D, cgy = (i / D) | 0;
    let s = 0;
    for (let dy = -rad; dy <= rad; dy++) for (let dx = -rad; dx <= rad; dx++) if (dx * dx + dy * dy <= r2 && liveAt(cgx + dx, cgy + dy) >= 0) s++;
    if (s > bs){ bs = s; best = i; }
  }
  return best >= 0 ? blockPos(best) : null;
}

// ---------- 撃破フック (game/skill-hooks.js の skillOnBreak から) ----------
function machineOnBreak(idx, gx, gy){
  // 序盤機兵 (f0) の撃破連動は自律機兵が稼働していなくても数える
  if (sk("f0_exhaust") && (curProto || curMach)){ f0Heat = Math.min(15, f0Heat + 1); f0HeatT = 3; }   // 排熱利用: 機兵の破壊で自機の連射が上がる
  if (sk("f0_scrap")){
    f0ScrapN++;
    const need = sk("f0_scrap2") ? 100 : 200;
    if (f0ScrapN >= need){ f0ScrapN -= need; f0DroneQueue += sk("f0_scrap2") ? 2 : 1; }   // スクラップ工房: 自爆ドローンを組み立てる
  }
  if (!fActive) return;
  if (fKiller && sk("f_instinct")) fKiller.frenzy = 3;   // 狩猟本能
  if (fMarks.size) fMarks.delete(idx);
  // 帯電連鎖: 帯電したブロックが壊れると放電し、半径3以内のブロック最大4個へ 最大HP25% + 帯電 (3世代まで)
  if (fCharged.size){
    const c = fCharged.get(idx);
    if (c !== undefined){
      fCharged.delete(idx);
      if (c.u > nowMs){
        const x = g2w(gx), y = g2w(gy), cand = [];
        for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++){
          if ((!dx && !dy) || dx * dx + dy * dy > 9) continue;
          const j = liveAt(gx + dx, gy + dy);
          if (j >= 0) cand.push(j);
        }
        for (let n = 0; n < 4 && cand.length; n++){
          const j = cand.splice((Math.random() * cand.length) | 0, 1)[0];
          aftershock(j, blockMaxHP(j % D, (j / D) | 0) * 0.25, SHOCK_NONE);
          if (c.g < 3 && fCharged.size < 5000){ const o = fCharged.get(j); if (!o || o.g > c.g + 1) fCharged.set(j, { u: nowMs + 4000, g: c.g + 1 }); }
          addBeam({ x1: x, y1: y, x2: g2w(j % D), y2: g2w((j / D) | 0), w: 1.6, color: "#c9f6ff", zig: true, life: 140 });
        }
        bumpProc("fdisch", x, y);
      }
    }
  }
}

// ---------- 毎フレーム ----------
function syncMachines(){
  const w = fWant();
  const fit = (arr, n, mk) => { while (arr.length < n) arr.push(mk(arr.length, n)); if (arr.length > n) arr.length = n; };
  fit(MCH.hunters, w.hunters, (i, n) => fNewUnit(i, n, { fireT: Math.random() * 0.4, retT: Math.random() * 1.2, tm: 0, ti: -1, frenzy: 0, shots: 0 }));
  fit(MCH.drillers, w.drillers, (i, n) => fNewUnit(i, n, { tx: player.x, ty: player.y, retT: 0, tickT: 0, magT: 4 + i * 2.5, spin: 0 }));
  fit(MCH.spiders, w.spiders, (i, n) => fNewUnit(i, n, { ti: -1, retT: Math.random() * 1.2, ripT: 0.5, bite: 0, walk: Math.random() * 6 }));
  fit(MCH.teslas, w.teslas, (i, n) => fNewUnit(i, n, { zapT: 0.5 + i * 0.4, ti: -1, retT: Math.random() * 1.2 }));
  fit(MCH.bombers, w.bombers, (i, n) => fNewUnit(i, n, { oa: i * Math.PI, bombT: 1.5 + i * 1.5 }));
  fit(MCH.cannons, w.cannons, (i, n) => fNewUnit(i, n, { mode: "fly", sx: player.x, sy: player.y, fireT: 2 + i, relocT: 0, aim: 0, recoil: 0 }));
  if (w.titan && !MCH.titan){ MCH.titan = fNewUnit(0, 1, { tx: player.x, ty: player.y, retT: 0, stompT: 2, salvoT: 5, step: 0, stomp: 0 }); MCH.titan.hr = 520; }
  if (!w.titan) MCH.titan = null;
  if (!sk("f_replicate")) MCH.kids.length = 0;
  if (w.nanites){
    if (!fNanoInit){ fNanoInit = true; for (let i = 0; i < 6; i++) MCH.nanites.push(fNewUnit(i, 6, { eatT: Math.random() * 0.7, eaten: 0, ti: -1, retT: Math.random() * 1.5, spin: Math.random() * 6 })); }
  } else { MCH.nanites.length = 0; fNanoInit = false; }
  fActive = !!(w.hunters || w.drillers || w.spiders || w.teslas || w.bombers || w.cannons || w.titan || w.nanites);
  if (!fActive){ fDrops.length = 0; fLinks = []; fMarks.clear(); fCharged.clear(); fOmega = 0; }
  fCount = MCH.hunters.length + MCH.drillers.length + MCH.spiders.length + MCH.kids.length + MCH.teslas.length + MCH.bombers.length + MCH.cannons.length + (MCH.titan ? 1 : 0) + MCH.nanites.length;
}
// 振り直しのとき: 子機・ナノマシン・落下物も含めて全て片付ける
function machineReset(){
  for (const k of ["hunters", "drillers", "spiders", "kids", "teslas", "bombers", "cannons", "nanites"]) MCH[k].length = 0;
  MCH.titan = null; fNanoInit = false; fDrops.length = 0; fLinks = []; fMarks.clear(); fCharged.clear(); fOmega = 0; fRipAcc = 0;
  f0Reset();
}

function machineUpdate(dt, now){
  syncMachines();
  f0Update(dt, now);   // 序盤機兵 (プロト・簡易砲台・自爆ドローン): 自律機兵が無くても動く
  if (!fActive) return;
  const U = playerDPS(), pow = fPow(), rate = fRate();
  // オメガ・プロトコル: 25秒ごとに8秒間の暴走
  if (sk("f_omega")){
    if (fOmega > 0){ fOmega -= dt; if (fOmega <= 0) fOmega = 0; }
    else {
      fOmegaT -= dt;
      if (fOmegaT <= 0){
        fOmegaT = 25; fOmega = 8; bumpProc("fomega");
        skillFeed("fomega", "オメガ・プロトコル 暴走", "⚠️", "#ff4d6d");
        addRing({ x: player.x, y: player.y, r: 320, color: "255,77,109", dur: 700 });
        [196, 147, 98].forEach((f, i) => tone(f, .32, "sawtooth", .05, f * 0.6, i * .12));
      }
    }
  } else fOmega = 0;
  for (const h of MCH.hunters) updateHunter(h, dt, U, pow, rate);
  for (const d of MCH.drillers) updateDriller(d, dt, U, pow, rate);
  for (const s of MCH.spiders) updateSpider(s, dt, rate);
  for (let i = MCH.kids.length - 1; i >= 0; i--){
    const s = MCH.kids[i]; s.life -= dt;
    if (s.life <= 0){ addRing({ x: s.x, y: s.y, r: 22, color: "185,168,255", dur: 260 }); MCH.kids.splice(i, 1); continue; }
    updateSpider(s, dt, rate);
  }
  for (const t of MCH.teslas) updateTesla(t, dt, U, pow, rate);
  for (const b of MCH.bombers) updateBomber(b, dt, U, pow, rate);
  for (const c of MCH.cannons) updateCannon(c, dt, U, pow, rate);
  if (sk("f_nuke") && MCH.cannons.length){   // 戦術核砲弾: 25秒ごと
    fNukeT -= dt * rate;
    if (fNukeT <= 0){
      const c = MCH.cannons.find(o => o.mode === "set") || MCH.cannons[0];
      const tp = fDensest(c.x, c.y, 1200, 6);
      if (tp){
        fNukeT = 25;
        fDrops.push({ x0: c.x, y0: c.y, x1: tp.x, y1: tp.y, t: 0, dur: 1.6, delay: 0, arc: 420, r: 14, dmg: U * 30 * pow, kind: "nuke" });
        c.recoil = 0.4; c.aim = Math.atan2(tp.y - c.y, tp.x - c.x);
        skillFeed("fnuke", "戦術核砲弾 発射", "☢️", "#8c7dff");
      } else fNukeT = 1;
    }
  }
  if (MCH.titan) updateTitan(MCH.titan, dt, U, pow, rate);
  for (let i = MCH.nanites.length - 1; i >= 0; i--) updateNanite(MCH.nanites[i], dt, rate);
  updateDrops(dt, now);
  if (sk("f_hivemind")) updateLinks(dt, U, pow); else fLinks = [];
  // 期限切れのマーカー・帯電を間引く
  if (fMarks.size > 2500){ for (const [k, t] of fMarks){ if (t <= nowMs) fMarks.delete(k); } if (fMarks.size > 2500) fMarks.clear(); }
  if (fCharged.size > 2500){ for (const [k, c] of fCharged){ if (c.u <= nowMs) fCharged.delete(k); } if (fCharged.size > 2500) fCharged.clear(); }
}

// --- ハンター ---
function updateHunter(h, dt, U, pow, rate){
  fTend(h, dt);
  if (h.flash > 0) h.flash -= dt;
  if (h.frenzy > 0) h.frenzy -= dt;
  h.retT -= dt;
  if (h.retT <= 0){
    h.retT = 0.5 + Math.random() * 0.3;
    const mb = nearestMob(h.x, h.y, F_HUNT_R * 1.6);
    if (mb){ h.tm = mb.id; h.ti = -1; }
    else {
      h.tm = 0;
      let idx = findNearestBlock(h.x, h.y, F_HUNT_R);
      if (idx < 0){ const hp = fHome(h); idx = findNearestBlock(hp.x, hp.y, 900); if (idx < 0) idx = findNearestBlock(h.x, h.y, 1600); }
      h.ti = idx;
      if (idx < 0) h.retT = 1.5 + Math.random() * 0.5;   // 周りが掘り尽くされている: 遠くの探索は重いので間隔を空ける
    }
  }
  const tmob = h.tm ? mobById(h.tm) : null;
  let tx, ty;
  if (tmob){ tx = tmob.x; ty = tmob.y; }
  else if (h.ti >= 0 && !isDestroyed(h.ti)){ tx = g2w(h.ti % D); ty = g2w((h.ti / D) | 0); }
  else { const hp = fHome(h); tx = hp.x; ty = hp.y; }
  fMoveTo(h, tx, ty, 260, dt, tmob || h.ti >= 0 ? 170 : 10);
  h.fireT -= dt * rate * (h.frenzy > 0 ? 2 : 1);
  if (h.fireT > 0) return;
  h.fireT = 0.45;
  const dmg = U * 0.2 * 0.45 * pow * (sk("f_hunter4") ? 1.3 : 1);
  const mb = tmob && Math.hypot(tmob.x - h.x, tmob.y - h.y) <= F_HUNT_R ? tmob : null;
  if (mb){
    addBeam({ x1: h.x, y1: h.y, x2: mb.x, y2: mb.y, w: 2.2, color: "#b9a8ff", life: 110 });
    damageMob(mb, fOmega > 0 ? dmg * 10 : fCalibDmg(dmg * gMul), null);
    if (mb.dead && sk("f_instinct")) h.frenzy = 3;
    h.flash = 0.06; h.ang = Math.atan2(mb.y - h.y, mb.x - h.x);
    return;
  }
  let idx = h.ti >= 0 && !isDestroyed(h.ti) ? h.ti : -1;
  if (idx >= 0){ const p = blockPos(idx); if (Math.hypot(p.x - h.x, p.y - h.y) > F_HUNT_R) idx = -1; }
  if (idx < 0) idx = findNearestBlock(h.x, h.y, F_HUNT_R);
  if (idx < 0){ h.fireT = 0.15; return; }
  h.ti = idx;
  const p = blockPos(idx), a = Math.atan2(p.y - h.y, p.x - h.x), dist = Math.hypot(p.x - h.x, p.y - h.y);
  h.ang = a; h.flash = 0.06; h.shots++;
  const rail = sk("f_railgun") && h.shots % 6 === 0;
  fKiller = h;
  try {
    if (rail){   // レールガン: 射線上 約25ブロックを一直線に貫く
      const ex = h.x + Math.cos(a) * BS * 25, ey = h.y + Math.sin(a) * BS * 25;
      addBeam({ x1: h.x, y1: h.y, x2: ex, y2: ey, w: 7, color: "rgba(140,125,255,.75)", life: 220 });
      addBeam({ x1: h.x, y1: h.y, x2: ex, y2: ey, w: 2.5, color: "#ffffff", life: 220 });
      const line = fRayBlocks(h.x, h.y, a, BS / 2, BS * 25, 80);
      for (const j of line) fHitBlock(j, dmg * 4);
      bumpProc("frail", p.x, p.y);
    } else {
      addBeam({ x1: h.x, y1: h.y, x2: p.x, y2: p.y, w: 2.2, color: "#b9a8ff", life: 110 });
      if (sk("f_mark") && fMarks.size < 5000) fMarks.set(idx, nowMs + 5000);   // 照準マーカー (命中前に付ける = この一撃から乗る)
      fHitBlock(idx, dmg);
      if (sk("f_pierce")){   // 貫通: 奥のブロック最大3個
        const more = fRayBlocks(h.x, h.y, a, dist + BS * 0.6, dist + BS * 9, 3);
        if (more.length){ const q = blockPos(more[more.length - 1]); addBeam({ x1: p.x, y1: p.y, x2: q.x, y2: q.y, w: 1.4, color: "#dcd4ff", life: 110 }); }
        for (const j of more) fHitBlock(j, dmg);
      }
      if (sk("f_shrapnel")){   // 炸裂: 周囲8マスへ 50%
        const gx = idx % D, gy = (idx / D) | 0;
        for (const [dx, dy] of N8) fRawHit(liveAt(gx + dx, gy + dy), dmg * 0.5);
        if (Math.random() < 0.3) addRing({ x: p.x, y: p.y, r: BS * 1.5, color: "185,168,255", dur: 200 });
      }
    }
  } finally { fKiller = null; }
}

// --- ドリラー ---
function updateDriller(d, dt, U, pow, rate){
  fTend(d, dt);
  d.retT -= dt;
  const reach = Math.hypot(d.tx - d.x, d.ty - d.y);
  if (d.retT <= 0 || reach < 40){
    d.retT = 7;
    let a, r;
    if (sk("f_coredive")){   // コアダイブ: 惑星の中心の方向へ
      a = Math.atan2(PLANET_CY - player.y, PLANET_CX - player.x) + (Math.random() - 0.5) * 1.5; r = 600 + Math.random() * 1200;
    } else { a = Math.random() * Math.PI * 2; r = 300 + Math.random() * 1100; }
    d.tx = player.x + Math.cos(a) * r; d.ty = player.y + Math.sin(a) * r;
  }
  const want = Math.atan2(d.ty - d.y, d.tx - d.x);
  let diff = ((want - d.ang + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
  d.ang += Math.max(-1.6 * dt, Math.min(1.6 * dt, diff)) + Math.sin(nowMs / 700 + d.ha * 5) * 0.4 * dt;
  const spd = 120 * (fOmega > 0 ? 2 : 1);
  d.x += Math.cos(d.ang) * spd * dt; d.y += Math.sin(d.ang) * spd * dt;
  d.spin += dt * 14 * rate;
  d.tickT -= dt * rate;
  if (d.tickT <= 0){
    d.tickT = 0.15;
    const gx = w2g(d.x), gy = w2g(d.y), inRock = liveAt(gx, gy) >= 0;
    const rCells = 1.5 + (sk("f_drill2") ? 1 : 0) + (sk("f_drill4") ? 1 : 0);
    let dm = U * 0.2 * 0.15 * pow * (sk("f_drill4") ? 2 : 1);
    if (sk("f_coredive") && blockExists(gx, gy)) dm *= 1 + 2 * Math.max(0, Math.min(1, blockDepth(gx, gy)));
    fRadius(d.x, d.y, rCells * BS, dm);
    d.dig = inRock ? 0.25 : Math.max(0, (d.dig || 0) - 0.15);
  }
  if (sk("f_magma")){   // マグマ噴出: 8秒ごと
    d.magT -= dt * rate;
    if (d.magT <= 0){
      d.magT = 8;
      const gx = w2g(d.x), gy = w2g(d.y);
      fRadius(d.x, d.y, BS * 4, U * 4 * pow);
      let n = 0;
      for (let dy = -4; dy <= 4 && n < 40; dy++) for (let dx = -4; dx <= 4 && n < 40; dx++){
        if (dx * dx + dy * dy > 16) continue;
        const j = liveAt(gx + dx, gy + dy);
        if (j >= 0 && (burns.size < 800 || burns.has(j))){ burns.set(j, { d: U * 0.3 * pow * burnSetMul(), t: 3, k: "burn", g: 0 }); n++; }
      }
      addRing({ x: d.x, y: d.y, r: BS * 4.6, color: "255,120,40", dur: 520 });
      if (onScreen(d.x, d.y, 100)) dimFx.push({ x: d.x, y: d.y, t: 0, kind: "burn", dur: 0.5 });
      bumpProc("fmagma", d.x, d.y);
    }
  }
}

// --- スパイダー (子機も同じ動き) ---
function updateSpider(s, dt, rate){
  if (!s.kid) fTend(s, dt);
  else { const dx = s.x - player.x, dy = s.y - player.y; if (dx * dx + dy * dy > F_LEASH * F_LEASH) s.life = 0; }
  if (s.bite > 0) s.bite -= dt;
  s.retT -= dt;
  if (s.ti >= 0 && isDestroyed(s.ti)){ s.ti = -1; s.retT = Math.min(s.retT, 0.1); }
  if (s.retT <= 0){   // 探索はタイマーで間引く (見つからない時に毎フレーム遠くを探すと重い)
    let idx = findNearestBlock(s.x, s.y, 240);
    if (idx < 0 && !s.kid){ const hp = fHome(s); idx = findNearestBlock(hp.x, hp.y, 900); }
    if (idx < 0) idx = findNearestBlock(s.x, s.y, 1600);
    s.ti = idx;
    s.retT = idx >= 0 ? 2 : 1.5 + Math.random() * 0.5;
  }
  let near = false;
  if (s.ti >= 0){
    const p = blockPos(s.ti), d = fMoveTo(s, p.x, p.y, 200, dt, BS * 1.1);
    near = d <= BS * 1.7;
    if (d > BS * 1.1) s.walk += dt * 18;
  } else { const hp = fHome(s); fMoveTo(s, hp.x, hp.y, 200, dt, 10); s.walk += dt * 18; }
  s.ripT -= dt * rate;
  if (s.ripT > 0) return;
  if (!near){ s.ripT = 0; return; }
  s.ripT = sk("f_spider2") ? 1 : 1.5;
  const gx = s.ti % D, gy = (s.ti / D) | 0, p = blockPos(s.ti);
  const targets = [];
  if (sk("f_spider3")){ for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++){ const j = liveAt(gx + dx, gy + dy); if (j >= 0) targets.push(j); } }
  else targets.push(s.ti);
  const pm = curMach; curMach = true;   // 発生源フラグ (f0 排熱利用の集計用)。HP無視の一撃なので会心は付けない
  try { rawDamage(() => { for (const j of targets) if (!isDestroyed(j)) damageBlock(j, blockMaxHP(j % D, (j / D) | 0) * 100, 0); }); } finally { curMach = pm; }   // HP無視で引き剥がす
  s.bite = 0.22; s.ti = -1; s.retT = 0;   // 次の獲物をすぐ探す
  bumpProc("frip", p.x, p.y);
  addBeam({ x1: s.x, y1: s.y, x2: p.x, y2: p.y, w: 3, color: "#e0d8ff", life: 120 });
  if (onScreen(p.x, p.y, 40) && debrisParts.length < 160) for (let k = 0; k < 3; k++){
    const a = Math.random() * Math.PI * 2, sp = 60 + Math.random() * 120;
    debrisParts.push({ x: p.x, y: p.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 40, t: 0, life: 0.5 + Math.random() * 0.3, rot: Math.random() * 6.3, vr: (Math.random() - 0.5) * 10, s: 3 + Math.random() * 3, spr: (Math.random() * 2) | 0 });
  }
  if (sk("f_replicate")){   // 自己複製: 解体数で子機を増やす
    fRipAcc += targets.length;
    const need = sk("f_replicate2") ? 25 : 50, cap = sk("f_replicate2") ? 25 : 10;
    while (fRipAcc >= need){
      fRipAcc -= need;
      if (MCH.kids.length < cap){
        const k = fNewUnit(0, 1, { ti: -1, retT: 0, ripT: 0.4, bite: 0, walk: 0, kid: true, life: 40 });
        k.x = s.x; k.y = s.y;
        MCH.kids.push(k);
        bumpProc("freplicate", s.x, s.y);
      }
    }
  }
}

// --- テスラ ---
function updateTesla(t, dt, U, pow, rate){
  fTend(t, dt);
  if (t.flash > 0) t.flash -= dt;
  t.retT -= dt;
  if (t.retT <= 0){
    t.retT = 1.2;
    const hp = fHome(t);
    t.ti = findNearestBlock(hp.x, hp.y, 900);
    if (t.ti < 0) t.ti = findNearestBlock(t.x, t.y, 1600);
  }
  let tx, ty;
  if (t.ti >= 0){ const p = blockPos(t.ti); tx = p.x + Math.cos(nowMs / 900 + t.ha) * 110; ty = p.y + Math.sin(nowMs / 900 + t.ha) * 110; }
  else { const hp = fHome(t); tx = hp.x; ty = hp.y; }
  fMoveTo(t, tx, ty, 150, dt, 6);
  t.zapT -= dt * rate;
  if (t.zapT > 0) return;
  t.zapT = 1;
  const dmg = U * 0.8 * pow;
  let px = t.x, py = t.y;
  const mb = nearestMob(t.x, t.y, 320);
  if (mb){ addBeam({ x1: px, y1: py, x2: mb.x, y2: mb.y, w: 2.4, color: "#9ff0ff", zig: true, life: 160 }); damageMob(mb, fOmega > 0 ? dmg * 10 : fCalibDmg(dmg * gMul), null); px = mb.x; py = mb.y; }
  let cur = findNearestBlock(px, py, 320);
  if (cur < 0 && !mb){ t.zapT = 0.5; return; }
  const jumps = sk("f_tesla2") ? 10 : 5, seen = new Set();
  for (let k = 0; k < jumps && cur >= 0; k++){
    const p = blockPos(cur);
    addBeam({ x1: px, y1: py, x2: p.x, y2: p.y, w: k ? 1.8 : 2.6, color: k ? "#c9f6ff" : "#9ff0ff", zig: true, life: 160 });
    if (sk("f_tesla3") && fCharged.size < 5000) fCharged.set(cur, { u: nowMs + 4000, g: 0 });   // 帯電 (命中前に付ける = この一撃で壊れても放電する)
    fHitBlock(cur, dmg);
    seen.add(cur); px = p.x; py = p.y;
    const nx = findNearestBlocks(px, py, BS * 3.5, 1, seen)[0];
    cur = nx === undefined ? -1 : nx;
  }
  t.flash = 0.12;
  if (onScreen(t.x, t.y, 0)) tone(1400 + Math.random() * 500, .06, "square", .018, 500);
}

// --- ボマー ---
function updateBomber(b, dt, U, pow, rate){
  fTend(b, dt);
  const hp = fHome(b);
  b.oa += dt * 0.7;
  const tx = hp.x + Math.cos(b.oa) * 380, ty = hp.y + Math.sin(b.oa) * 380;
  const px = b.x, py = b.y;
  fMoveTo(b, tx, ty, 380, dt, 0);
  if (Math.abs(b.x - px) + Math.abs(b.y - py) > 0.5) b.head = Math.atan2(b.y - py, b.x - px);
  b.bombT -= dt * rate;
  if (b.bombT > 0) return;
  const tp = fDensest(b.x, b.y, 650, 3);
  if (!tp){ b.bombT = 0.6; return; }
  b.bombT = 3;
  const n = sk("f_carpet") ? 3 : 1, h = b.head || 0;
  for (let k = 0; k < n; k++){
    const off = (k - (n - 1) / 2) * BS * 3.2;
    fDrops.push({ x0: b.x, y0: b.y, x1: tp.x + Math.cos(h) * off, y1: tp.y + Math.sin(h) * off, t: 0, dur: 0.75, delay: k * 0.12, arc: 0, r: 3, dmg: U * 3 * pow, kind: "bomb" });
  }
}

// --- キャノン ---
function updateCannon(c, dt, U, pow, rate){
  if (c.recoil > 0) c.recoil -= dt;
  c.relocT -= dt;
  const far = Math.hypot(c.sx - player.x, c.sy - player.y) > 1700;
  if (c.relocT <= 0 || far){   // 持ち場を選び直して飛ぶ (戦域の前線へ)
    c.relocT = 40;
    const hp = fHome(c), idx = findNearestBlock(hp.x, hp.y, 900);
    const p = idx >= 0 ? blockPos(idx) : hp;
    c.sx = p.x; c.sy = p.y; c.mode = "fly";
    if (far && Math.hypot(c.x - player.x, c.y - player.y) > F_LEASH){ c.x = player.x; c.y = player.y; }
  }
  if (c.mode === "fly"){
    const d = fMoveTo(c, c.sx, c.sy, 700, dt, 2);
    if (d <= 4){ c.mode = "set"; addRing({ x: c.x, y: c.y, r: 44, color: "185,168,255", dur: 420 }); }
    return;
  }
  c.fireT -= dt * rate;
  if (c.fireT > 0) return;
  const tp = fDensest(c.x, c.y, 1200, 4);
  if (!tp){ c.fireT = 1.5; return; }
  c.fireT = 4;
  c.aim = Math.atan2(tp.y - c.y, tp.x - c.x); c.recoil = 0.25;
  const n = sk("f_artillery2") ? 3 : 1;
  for (let k = 0; k < n; k++){
    const jx = k ? (Math.random() - 0.5) * BS * 5 : 0, jy = k ? (Math.random() - 0.5) * BS * 5 : 0;
    fDrops.push({ x0: c.x, y0: c.y, x1: tp.x + jx, y1: tp.y + jy, t: 0, dur: 0.9, delay: k * 0.28, arc: 260, r: 5, dmg: U * 5 * pow, kind: "shell" });
  }
  if (onScreen(c.x, c.y, 0)) tone(90, .18, "triangle", .07, 55);
}

// --- タイタン (奥義) ---
function updateTitan(T, dt, U, pow, rate){
  fTend(T, dt);
  T.retT -= dt;
  if (T.retT <= 0){
    T.retT = 4;
    const hp = fHome(T), tp = fDensest(hp.x, hp.y, 700, 4);
    if (tp){ T.tx = tp.x; T.ty = tp.y; } else { T.tx = hp.x; T.ty = hp.y; }
  }
  const px = T.x, py = T.y;
  fMoveTo(T, T.tx, T.ty, 75, dt, 30);
  if (Math.abs(T.x - px) + Math.abs(T.y - py) > 0.05) T.step += dt * 4;
  if (T.stomp > 0) T.stomp -= dt;
  T.stompT -= dt * rate;
  if (T.stompT <= 0){   // 踏みつけ: 足元 半径3を消し飛ばし、半径7へ 1500%
    T.stompT = 2; T.stomp = 0.3;
    queueDestroyCircle(w2g(T.x), w2g(T.y), 3);
    fRadius(T.x, T.y, BS * 7, U * 15 * pow);
    addRing({ x: T.x, y: T.y, r: BS * 7.5, color: "140,125,255", dur: 520 });
    addRing({ x: T.x, y: T.y, r: BS * 3.5, color: "255,255,255", dur: 380 });
    if (onScreen(T.x, T.y, 200)){ dimFx.push({ x: T.x, y: T.y, t: 0, kind: "fstomp", dur: 0.5, size: 330 }); sndBoom(); }
    bumpProc("fstomp", T.x, T.y);
  }
  T.salvoT -= dt * rate;
  if (T.salvoT <= 0){   // 肩部ミサイル16発
    const pool = findNearestBlocks(T.x, T.y, 900, 48);
    if (!pool.length){ T.salvoT = 1; return; }
    T.salvoT = 10;
    for (let k = 0; k < 16; k++){
      const j = pool[(Math.random() * pool.length) | 0], p = blockPos(j), side = k & 1 ? 1 : -1;
      const sx = T.x + Math.cos(T.ang + Math.PI / 2 * side) * 26, sy = T.y + Math.sin(T.ang + Math.PI / 2 * side) * 26;
      fDrops.push({ x0: sx, y0: sy, x1: p.x, y1: p.y, t: 0, dur: 0.55 + Math.random() * 0.4, delay: k * 0.06, arc: 140 + Math.random() * 120, r: 2, dmg: U * 4 * pow, kind: "missile", side });
    }
    bumpProc("fsalvo", T.x, T.y);
  }
}

// --- ナノマシン (究極) ---
function updateNanite(n, dt, rate){
  n.spin += dt * 3;
  const dx = n.x - player.x, dy = n.y - player.y, pd2 = dx * dx + dy * dy;
  if (pd2 > 3600 * 3600){ const a = Math.random() * Math.PI * 2; n.x = player.x + Math.cos(a) * 300; n.y = player.y + Math.sin(a) * 300; }
  const gx = w2g(n.x), gy = w2g(n.y), inRock = liveAt(gx, gy) >= 0;
  n.retT -= dt;
  if (n.ti >= 0 && isDestroyed(n.ti)){ n.ti = -1; n.retT = Math.min(n.retT, 0.2); }
  if (!inRock && n.retT <= 0){ n.ti = findNearestBlock(n.x, n.y, 1500); n.retT = n.ti >= 0 ? 1 : 2 + Math.random(); }   // 見つからない時は間隔を空ける
  let want = n.ang + (Math.random() - 0.5) * 6 * dt;   // 岩の中では気ままに食い進む
  if (pd2 > 2400 * 2400) want = Math.atan2(player.y - n.y, player.x - n.x);
  else if (!inRock && n.ti >= 0){ const p = blockPos(n.ti); want = Math.atan2(p.y - n.y, p.x - n.x); }
  else if (!inRock){ const hp = fHome(n); want = Math.atan2(hp.y - n.y, hp.x - n.x); }
  let diff = ((want - n.ang + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
  n.ang += Math.max(-3 * dt, Math.min(3 * dt, diff));
  const spd = inRock ? 70 : 260;
  n.x += Math.cos(n.ang) * spd * dt; n.y += Math.sin(n.ang) * spd * dt;
  n.eatT -= dt * rate;
  if (n.eatT > 0) return;
  n.eatT = 0.7;
  let c = 0;
  for (let ddy = -2; ddy <= 2; ddy++) for (let ddx = -2; ddx <= 2; ddx++) if (ddx * ddx + ddy * ddy <= 4 && liveAt(gx + ddx, gy + ddy) >= 0) c++;
  if (!c) return;
  queueDestroyCircle(gx, gy, 2);
  n.eaten += c;
  if (Math.random() < 0.15) bumpProc("fnano", n.x, n.y);
  if (n.eaten >= 300 && MCH.nanites.length < 48){   // 分裂
    n.eaten = 0;
    const k = fNewUnit(0, 1, { eatT: 0.35, eaten: 0, ti: -1, retT: 0, spin: 0 });
    k.x = n.x; k.y = n.y; k.ang = n.ang + Math.PI;
    MCH.nanites.push(k);
    bumpProc("fsplit", n.x, n.y);
  }
}

// --- 落下物 / 砲弾 / ミサイルの着弾 ---
function updateDrops(dt, now){
  for (let i = fDrops.length - 1; i >= 0; i--){
    const o = fDrops[i];
    if (o.delay > 0){ o.delay -= dt; continue; }
    o.t += dt;
    if (o.t < o.dur) continue;
    fDrops.splice(i, 1);
    const x = o.x1, y = o.y1;
    if (o.kind === "nuke"){   // 戦術核: 半径5を消し飛ばし、半径14へ 3000%
      queueDestroyCircle(w2g(x), w2g(y), 5);
      fRadius(x, y, BS * o.r, o.dmg);
      addRing({ x, y, r: BS * 15, color: "255,255,255", dur: 900 });
      addRing({ x, y, r: BS * 9, color: "170,255,140", dur: 700 });
      addRing({ x, y, r: BS * 5, color: "255,240,160", dur: 500 });
      if (onScreen(x, y, BS * 14)){
        dimFx.push({ x, y, t: 0, kind: "fnuke", dur: 0.9, size: 620 });
        whiteFlash = Math.max(whiteFlash, 0.6);
        for (let k = 0; k < 36 && debrisParts.length < 160; k++){
          const a = Math.random() * Math.PI * 2, sp = 150 + Math.random() * 380;
          debrisParts.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 60, t: 0, life: 0.8 + Math.random() * 0.6, rot: Math.random() * 6.3, vr: (Math.random() - 0.5) * 10, s: 4 + Math.random() * 8, spr: (Math.random() * 2) | 0 });
        }
        sndBoom(true);
      }
      bumpProc("fnuke", x, y);
      continue;
    }
    fRadius(x, y, BS * o.r, o.dmg);
    const big = o.kind === "shell";
    addRing({ x, y, r: BS * (o.r + 0.6), color: o.kind === "missile" ? "185,168,255" : "255,170,90", dur: big ? 460 : 340 });
    if (onScreen(x, y, BS * o.r)){
      if (o.kind !== "missile" || Math.random() < 0.35) dimFx.push({ x, y, t: 0, kind: "fbomb", dur: big ? 0.5 : 0.4, size: big ? 260 : o.kind === "bomb" ? 190 : 110 });
      if (o.kind !== "missile" || Math.random() < 0.2) sndBoom();
    }
    bumpProc(o.kind === "shell" ? "fshell" : o.kind === "bomb" ? "fbomb" : "fsalvo", x, y);
  }
}

// --- 群体知性: 近くの機兵同士を結ぶリンク光線 ---
function fAllUnits(){
  const a = [];
  for (const k of ["hunters", "drillers", "spiders", "kids", "teslas", "bombers", "cannons", "nanites"]) for (const u of MCH[k]) a.push(u);
  if (MCH.titan) a.push(MCH.titan);
  return a;
}
function updateLinks(dt, U, pow){
  fLinkT -= dt;
  if (fLinkT > 0) return;
  fLinkT = 0.5;
  const all = fAllUnits(), links = [], seen = new Set();
  for (let i = 0; i < all.length && links.length < 30; i++){
    const u = all[i];
    let best = -1, bd = 650 * 650;
    for (let j = 0; j < all.length; j++){
      if (j === i) continue;
      const dx = all[j].x - u.x, dy = all[j].y - u.y, d2 = dx * dx + dy * dy;
      if (d2 < bd){ bd = d2; best = j; }
    }
    if (best < 0) continue;
    const key = i < best ? i * 4096 + best : best * 4096 + i;
    if (seen.has(key)) continue;
    seen.add(key); links.push([u, all[best]]);
  }
  fLinks = links;
  const dmg = U * 1.0 * 0.5 * pow;
  for (const [a, b] of links){
    const d = Math.hypot(b.x - a.x, b.y - a.y);
    for (const j of fRayBlocks(a.x, a.y, Math.atan2(b.y - a.y, b.x - a.x), 0, d, 60)) fRawHit(j, dmg);
  }
}

// ---------- 描画 ----------
const hunterSpr = makeSprite(48, (g, S) => {
  const cx = S / 2, cy = S / 2;
  const eng = g.createRadialGradient(cx - 13, cy, 0, cx - 13, cy, 10);
  eng.addColorStop(0, "rgba(200,190,255,.9)"); eng.addColorStop(1, "rgba(140,125,255,0)");
  g.fillStyle = eng; g.beginPath(); g.arc(cx - 13, cy, 10, 0, 7); g.fill();
  const body = g.createLinearGradient(0, cy - 12, 0, cy + 12);
  body.addColorStop(0, "#1c1640"); body.addColorStop(0.5, "#5b4bd6"); body.addColorStop(1, "#140f30");
  g.fillStyle = body; g.strokeStyle = "#cfc4ff"; g.lineWidth = 1.5;
  g.beginPath(); g.moveTo(cx + 19, cy); g.lineTo(cx - 4, cy - 13); g.lineTo(cx - 14, cy - 10); g.lineTo(cx - 8, cy); g.lineTo(cx - 14, cy + 10); g.lineTo(cx - 4, cy + 13); g.closePath(); g.fill(); g.stroke();
  g.strokeStyle = "#8c7dff"; g.lineWidth = 1.2; g.beginPath(); g.moveTo(cx - 2, cy - 9); g.lineTo(cx + 10, cy - 2); g.moveTo(cx - 2, cy + 9); g.lineTo(cx + 10, cy + 2); g.stroke();
  const eye = g.createRadialGradient(cx + 5, cy, 0, cx + 5, cy, 6);
  eye.addColorStop(0, "#ffffff"); eye.addColorStop(0.4, "#ff6fa8"); eye.addColorStop(1, "rgba(255,80,150,0)");
  g.fillStyle = eye; g.beginPath(); g.arc(cx + 5, cy, 6, 0, 7); g.fill();
});
const drillerSpr = makeSprite(60, (g, S) => {
  const cx = S / 2, cy = S / 2;
  g.fillStyle = "#2a2340"; g.strokeStyle = "#8c7dff"; g.lineWidth = 1.4;
  g.fillRect(cx - 20, cy - 13, 22, 4); g.fillRect(cx - 20, cy + 9, 22, 4);   // 履帯
  g.fillStyle = "#3e3466"; g.beginPath(); g.rect(cx - 18, cy - 10, 20, 20); g.fill(); g.stroke();
  const cone = g.createLinearGradient(cx + 2, 0, cx + 27, 0);
  cone.addColorStop(0, "#c9c2e8"); cone.addColorStop(1, "#6f6890");
  g.fillStyle = cone; g.strokeStyle = "#ece8ff";
  g.beginPath(); g.moveTo(cx + 2, cy - 11); g.lineTo(cx + 27, cy); g.lineTo(cx + 2, cy + 11); g.closePath(); g.fill(); g.stroke();
  const core = g.createRadialGradient(cx - 8, cy, 0, cx - 8, cy, 7);
  core.addColorStop(0, "#fff"); core.addColorStop(0.5, "#8c7dff"); core.addColorStop(1, "rgba(140,125,255,0)");
  g.fillStyle = core; g.beginPath(); g.arc(cx - 8, cy, 7, 0, 7); g.fill();
});
const teslaSpr = makeSprite(52, (g, S) => {
  const cx = S / 2, cy = S / 2;
  g.strokeStyle = "#3d5a76"; g.lineWidth = 5; g.beginPath(); g.arc(cx, cy, 17, 0, 7); g.stroke();
  g.strokeStyle = "#9ff0ff"; g.lineWidth = 1.5; g.beginPath(); g.arc(cx, cy, 21, 0, 7); g.stroke();
  g.fillStyle = "#c9f6ff";
  for (let k = 0; k < 3; k++){ const a = k * Math.PI * 2 / 3 - Math.PI / 2; g.save(); g.translate(cx + Math.cos(a) * 17, cy + Math.sin(a) * 17); g.rotate(a); g.fillRect(-2, -4, 9, 8); g.restore(); }
  const core = g.createRadialGradient(cx, cy, 0, cx, cy, 12);
  core.addColorStop(0, "#ffffff"); core.addColorStop(0.4, "#7df9ff"); core.addColorStop(1, "rgba(125,249,255,0)");
  g.fillStyle = core; g.beginPath(); g.arc(cx, cy, 12, 0, 7); g.fill();
});
const bomberSpr = makeSprite(76, (g, S) => {
  const cx = S / 2, cy = S / 2;
  const body = g.createLinearGradient(0, cy - 30, 0, cy + 30);
  body.addColorStop(0, "#151129"); body.addColorStop(0.5, "#4a3e9e"); body.addColorStop(1, "#110d22");
  g.fillStyle = body; g.strokeStyle = "#b9a8ff"; g.lineWidth = 1.6;
  g.beginPath(); g.moveTo(cx + 24, cy); g.lineTo(cx - 8, cy - 32); g.lineTo(cx - 18, cy - 30); g.lineTo(cx - 10, cy - 8); g.lineTo(cx - 20, cy);
  g.lineTo(cx - 10, cy + 8); g.lineTo(cx - 18, cy + 30); g.lineTo(cx - 8, cy + 32); g.closePath(); g.fill(); g.stroke();
  g.strokeStyle = "rgba(255,170,90,.8)"; g.lineWidth = 1.2;
  g.beginPath(); g.moveTo(cx - 4, cy - 20); g.lineTo(cx + 12, cy - 4); g.moveTo(cx - 4, cy + 20); g.lineTo(cx + 12, cy + 4); g.stroke();
  for (const sy of [-24, 24]){ const e = g.createRadialGradient(cx - 17, cy + sy, 0, cx - 17, cy + sy, 7); e.addColorStop(0, "rgba(255,190,120,.95)"); e.addColorStop(1, "rgba(255,150,60,0)"); g.fillStyle = e; g.beginPath(); g.arc(cx - 17, cy + sy, 7, 0, 7); g.fill(); }
  g.fillStyle = "#dcd4ff"; g.beginPath(); g.ellipse(cx + 8, cy, 6, 3.5, 0, 0, 7); g.fill();
});
const cannonSpr = makeSprite(56, (g, S) => {
  const cx = S / 2, cy = S / 2;
  g.fillStyle = "#231d3d"; g.strokeStyle = "#8c7dff"; g.lineWidth = 1.6;
  g.beginPath(); for (let k = 0; k < 8; k++){ const a = k * Math.PI / 4 + Math.PI / 8; g.lineTo(cx + Math.cos(a) * 22, cy + Math.sin(a) * 22); } g.closePath(); g.fill(); g.stroke();
  g.fillStyle = "#3e3466"; g.beginPath(); g.arc(cx, cy, 13, 0, 7); g.fill(); g.stroke();
  for (let k = 0; k < 4; k++){ const a = k * Math.PI / 2 + Math.PI / 4; g.fillStyle = "#5b4bd6"; g.fillRect(cx + Math.cos(a) * 20 - 3, cy + Math.sin(a) * 20 - 3, 6, 6); }
});
burstSprs.fbomb = burstSprite("rgba(255,170,90,.92)", "rgba(185,140,255,.75)");
burstSprs.fstomp = burstSprite("rgba(185,168,255,.95)", "rgba(140,125,255,.8)");
burstSprs.fnuke = burstSprite("rgba(200,255,170,.98)", "rgba(255,250,210,.92)");

function machineDraw(now, toScreen){
  if (!fActive && !fDrops.length && !f0Active) return;
  f0Draw(now, toScreen);   // 序盤機兵 (プロト・砲台・ドローン・地雷)
  if (!fActive && !fDrops.length) return;
  const low = fLowFx(), om = fOmega > 0;
  // リンク光線 (群体知性)
  if (fLinks.length){
    ctx.lineWidth = 1.6;
    for (const [a, b] of fLinks){
      if (!onScreen(a.x, a.y, 60) && !onScreen(b.x, b.y, 60)) continue;
      const [x1, y1] = toScreen(a.x, a.y), [x2, y2] = toScreen(b.x, b.y);
      ctx.strokeStyle = om ? "rgba(255,90,120,.55)" : `rgba(160,145,255,${0.35 + 0.2 * Math.sin(now / 160)})`;
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      if (!low){ const p = (now / 600) % 1; ctx.fillStyle = "#e6e0ff"; ctx.beginPath(); ctx.arc(x1 + (x2 - x1) * p, y1 + (y2 - y1) * p, 2.2, 0, 7); ctx.fill(); }
    }
    ctx.lineWidth = 1;
  }
  // ドリラー: 岩の中では半透明 + 掘削の火花
  for (const d of MCH.drillers){
    if (!onScreen(d.x, d.y, 60)) continue;
    const [sx, sy] = toScreen(d.x, d.y), size = 40 * zoom;
    ctx.save(); ctx.translate(sx, sy); ctx.rotate(d.ang); ctx.globalAlpha = d.dig > 0 ? 0.8 : 1;
    ctx.drawImage(drillerSpr, -size / 2, -size / 2, size, size);
    ctx.strokeStyle = "rgba(255,255,255,.7)"; ctx.lineWidth = 1;   // 回るドリルの溝
    for (let k = 0; k < 3; k++){ const f = ((d.spin + k / 3) % 1), x = (3 + f * 22) / 60 * size; ctx.beginPath(); ctx.moveTo(x, -(1 - f) * 0.17 * size); ctx.lineTo(x + 2, (1 - f) * 0.17 * size); ctx.stroke(); }
    ctx.restore();
    if (d.dig > 0 && !low){
      const nx = d.x + Math.cos(d.ang) * 18, ny = d.y + Math.sin(d.ang) * 18, [fx, fy] = toScreen(nx, ny);
      ctx.fillStyle = "#ffd9a0";
      for (let k = 0; k < 3; k++) ctx.fillRect(fx + (Math.random() - 0.5) * 14 * zoom, fy + (Math.random() - 0.5) * 14 * zoom, 2, 2);
    }
    if (om) fOmegaHalo(sx, sy, 22 * zoom, now);
  }
  // スパイダー (子機は小さく半透明)
  const spider = s => {
    if (!onScreen(s.x, s.y, 40)) return;
    const [sx, sy] = toScreen(s.x, s.y), k = (s.kid ? 0.7 : 1) * zoom;
    ctx.save(); ctx.translate(sx, sy); ctx.rotate(s.ang);
    if (s.kid) ctx.globalAlpha = 0.55 + 0.45 * Math.min(1, s.life / 5);
    ctx.strokeStyle = "#b9a8ff"; ctx.lineWidth = Math.max(1, 1.6 * k);
    for (let i = 0; i < 4; i++){
      const ph = Math.sin(s.walk + i * 1.6) * 0.35, ax = (-5 + i * 3.4) * k;
      for (const sg of [-1, 1]){
        ctx.beginPath(); ctx.moveTo(ax, 0); ctx.lineTo(ax + (2 + ph * 6) * k, sg * 8 * k); ctx.lineTo(ax + (4 + ph * 9) * k, sg * 13 * k); ctx.stroke();
      }
    }
    ctx.fillStyle = "#2a2346"; ctx.beginPath(); ctx.ellipse(0, 0, 8 * k, 6 * k, 0, 0, 7); ctx.fill(); ctx.stroke();
    ctx.fillStyle = s.bite > 0 ? "#ffffff" : "#ff6fa8";
    ctx.beginPath(); ctx.arc(6 * k, -2 * k, 1.6 * k, 0, 7); ctx.arc(6 * k, 2 * k, 1.6 * k, 0, 7); ctx.fill();
    if (s.bite > 0){ ctx.strokeStyle = "#ffffff"; ctx.beginPath(); ctx.moveTo(8 * k, -4 * k); ctx.lineTo(13 * k, 0); ctx.lineTo(8 * k, 4 * k); ctx.stroke(); }
    ctx.restore();
    if (om) fOmegaHalo(sx, sy, 12 * k, now);
  };
  for (const s of MCH.spiders) spider(s);
  for (const s of MCH.kids) spider(s);
  // キャノン: 台座 + 砲身 (発射で反動)
  for (const c of MCH.cannons){
    if (!onScreen(c.x, c.y, 60)) continue;
    const [sx, sy] = toScreen(c.x, c.y), size = 40 * zoom;
    ctx.drawImage(cannonSpr, sx - size / 2, sy - size / 2, size, size);
    const rec = Math.max(0, c.recoil) * 20 * zoom;
    ctx.save(); ctx.translate(sx, sy); ctx.rotate(c.aim);
    ctx.fillStyle = "#5b4bd6"; ctx.strokeStyle = "#dcd4ff"; ctx.lineWidth = 1.2;
    ctx.fillRect(4 * zoom - rec, -3.5 * zoom, 22 * zoom, 7 * zoom); ctx.strokeRect(4 * zoom - rec, -3.5 * zoom, 22 * zoom, 7 * zoom);
    if (c.recoil > 0.12){ const fs = 22 * zoom; ctx.globalCompositeOperation = "lighter"; ctx.drawImage(flashSpr, 26 * zoom - rec - fs / 2, -fs / 2, fs, fs); }
    ctx.restore();
    if (c.mode === "fly" && !low){ ctx.strokeStyle = "rgba(185,168,255,.5)"; ctx.setLineDash([4, 4]); const [tx, ty] = toScreen(c.sx, c.sy); ctx.beginPath(); ctx.arc(tx, ty, 14 * zoom, 0, 7); ctx.stroke(); ctx.setLineDash([]); }
    if (om) fOmegaHalo(sx, sy, 22 * zoom, now);
  }
  // ハンター
  for (const h of MCH.hunters){
    if (!onScreen(h.x, h.y, 40)) continue;
    const [sx, sy] = toScreen(h.x, h.y), size = 30 * zoom;
    if (h.frenzy > 0 && !low){ ctx.fillStyle = "rgba(255,111,168,.22)"; ctx.beginPath(); ctx.arc(sx, sy, 15 * zoom, 0, 7); ctx.fill(); }
    ctx.save(); ctx.translate(sx, sy); ctx.rotate(h.ang); ctx.drawImage(hunterSpr, -size / 2, -size / 2, size, size);
    if (h.flash > 0){ const fs = 16 * zoom; ctx.globalCompositeOperation = "lighter"; ctx.drawImage(flashSpr, 12 * zoom - fs / 2, -fs / 2, fs, fs); }
    ctx.restore();
    if (om) fOmegaHalo(sx, sy, 16 * zoom, now);
  }
  // テスラ
  for (const t of MCH.teslas){
    if (!onScreen(t.x, t.y, 50)) continue;
    const [sx, sy] = toScreen(t.x, t.y), size = 36 * zoom * (1 + (t.flash > 0 ? 0.12 : 0));
    ctx.save(); ctx.translate(sx, sy); ctx.rotate(now / 500 + t.ha); ctx.drawImage(teslaSpr, -size / 2, -size / 2, size, size); ctx.restore();
    if (!low && Math.random() < 0.3){ ctx.strokeStyle = "rgba(159,240,255,.7)"; ctx.lineWidth = 1; const a = Math.random() * 6.3; ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx + Math.cos(a) * 20 * zoom, sy + Math.sin(a) * 20 * zoom); ctx.stroke(); }
    if (om) fOmegaHalo(sx, sy, 20 * zoom, now);
  }
  // タイタン: 2本の脚 (歩行で交互に前後) + 胴体 + 肩の砲塔
  if (MCH.titan && onScreen(MCH.titan.x, MCH.titan.y, 120)){
    const T = MCH.titan, [sx, sy] = toScreen(T.x, T.y), k = zoom * (1 + (T.stomp > 0 ? 0.06 * Math.sin(T.stomp * 30) : 0));
    ctx.save(); ctx.translate(sx, sy); ctx.rotate(T.ang);
    ctx.fillStyle = "rgba(0,0,0,.35)"; ctx.beginPath(); ctx.ellipse(-4 * k, 6 * k, 44 * k, 34 * k, 0, 0, 7); ctx.fill();
    for (const sg of [-1, 1]){   // 脚
      const sw = Math.sin(T.step + (sg > 0 ? Math.PI : 0)) * 14 * k;
      ctx.fillStyle = "#2a2346"; ctx.strokeStyle = "#8c7dff"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.rect(-10 * k + sw, sg * 20 * k - 7 * k, 30 * k, 14 * k); ctx.fill(); ctx.stroke();
      ctx.fillStyle = "#4a3e9e"; ctx.beginPath(); ctx.rect(14 * k + sw, sg * 20 * k - 9 * k, 12 * k, 18 * k); ctx.fill(); ctx.stroke();
    }
    const hull = ctx.createLinearGradient(0, -28 * k, 0, 28 * k);
    hull.addColorStop(0, "#151129"); hull.addColorStop(0.5, "#5b4bd6"); hull.addColorStop(1, "#110d22");
    ctx.fillStyle = hull; ctx.strokeStyle = "#dcd4ff"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(26 * k, 0); ctx.lineTo(12 * k, -24 * k); ctx.lineTo(-20 * k, -28 * k); ctx.lineTo(-28 * k, 0); ctx.lineTo(-20 * k, 28 * k); ctx.lineTo(12 * k, 24 * k); ctx.closePath(); ctx.fill(); ctx.stroke();
    for (const sg of [-1, 1]){ ctx.fillStyle = "#3e3466"; ctx.fillRect(-14 * k, sg * 26 * k - 7 * k, 20 * k, 14 * k); ctx.strokeRect(-14 * k, sg * 26 * k - 7 * k, 20 * k, 14 * k);
      ctx.fillStyle = "#ffb070"; for (let q = 0; q < 3; q++) ctx.fillRect(-10 * k + q * 6 * k, sg * 26 * k - 2 * k, 3 * k, 4 * k); }
    const eye = ctx.createRadialGradient(10 * k, 0, 0, 10 * k, 0, 12 * k);
    eye.addColorStop(0, "#ffffff"); eye.addColorStop(0.35, om ? "#ff4d6d" : "#ff6fa8"); eye.addColorStop(1, "rgba(255,80,150,0)");
    ctx.fillStyle = eye; ctx.beginPath(); ctx.arc(10 * k, 0, 12 * k, 0, 7); ctx.fill();
    ctx.restore();
    if (om) fOmegaHalo(sx, sy, 50 * zoom, now);
  }
  // ボマー (上空: 影を地表にずらして描く)
  for (const b of MCH.bombers){
    if (!onScreen(b.x, b.y, 80)) continue;
    const [sx, sy] = toScreen(b.x, b.y), size = 54 * zoom, h = b.head || 0;
    ctx.save(); ctx.translate(sx + 16 * zoom, sy + 22 * zoom); ctx.rotate(h); ctx.globalAlpha = 0.25; ctx.filter = "brightness(0)"; ctx.drawImage(bomberSpr, -size / 2, -size / 2, size, size); ctx.restore();
    ctx.save(); ctx.translate(sx, sy); ctx.rotate(h); ctx.drawImage(bomberSpr, -size / 2, -size / 2, size, size); ctx.restore();
    if (om) fOmegaHalo(sx, sy, 28 * zoom, now);
  }
  // 落下物 / 砲弾 / ミサイル (着弾点の予告輪 + 弧を描く本体)
  for (const o of fDrops){
    if (o.delay > 0) continue;
    const p = Math.min(1, o.t / o.dur);
    const wx = o.x0 + (o.x1 - o.x0) * p, wy = o.y0 + (o.y1 - o.y0) * p;
    if (!onScreen(wx, wy, 120) && !onScreen(o.x1, o.y1, BS * o.r)) continue;
    const [tx, ty] = toScreen(o.x1, o.y1);
    if (o.kind !== "missile"){
      ctx.strokeStyle = o.kind === "nuke" ? "rgba(200,255,170,.85)" : "rgba(255,170,90,.7)"; ctx.lineWidth = o.kind === "nuke" ? 2.4 : 1.4;
      ctx.beginPath(); ctx.arc(tx, ty, BS * o.r * zoom * (o.kind === "nuke" ? 1 : 0.9), 0, 7); ctx.stroke();
      ctx.beginPath(); ctx.arc(tx, ty, BS * o.r * zoom * (1 - p), 0, 7); ctx.stroke(); ctx.lineWidth = 1;
    }
    const lift = Math.sin(p * Math.PI) * (o.arc || 0);
    const [bx, by] = toScreen(wx, wy - lift);
    if (o.kind === "bomb"){ const s = (5 + 4 * (1 - p)) * zoom; ctx.fillStyle = "#2a2346"; ctx.strokeStyle = "#ffb070"; ctx.beginPath(); ctx.arc(bx, by, s, 0, 7); ctx.fill(); ctx.stroke(); }
    else if (o.kind === "nuke"){
      const s = 9 * zoom; ctx.fillStyle = "#e9ffd8"; ctx.beginPath(); ctx.arc(bx, by, s, 0, 7); ctx.fill();
      ctx.fillStyle = "rgba(170,255,140,.35)"; ctx.beginPath(); ctx.arc(bx, by, s * 2.2, 0, 7); ctx.fill();
    } else {
      const p2 = Math.min(1, p + 0.04), lift2 = Math.sin(p2 * Math.PI) * (o.arc || 0);
      const [nx, ny] = toScreen(o.x0 + (o.x1 - o.x0) * p2, o.y0 + (o.y1 - o.y0) * p2 - lift2);
      ctx.strokeStyle = o.kind === "missile" ? "#d6ccff" : "#ffd0a0"; ctx.lineWidth = o.kind === "missile" ? 2.5 : 4;
      ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(nx, ny); ctx.stroke();
      if (!low){ ctx.fillStyle = "rgba(255,190,120,.6)"; ctx.beginPath(); ctx.arc(bx, by, 3 * zoom, 0, 7); ctx.fill(); }
      ctx.lineWidth = 1;
    }
  }
  // ナノマシン: 銀紫の六角の群れ
  for (const n of MCH.nanites){
    if (!onScreen(n.x, n.y, 30)) continue;
    const [sx, sy] = toScreen(n.x, n.y), r = 6 * zoom;
    ctx.save(); ctx.translate(sx, sy); ctx.rotate(n.spin);
    ctx.fillStyle = om ? "rgba(255,77,109,.25)" : "rgba(185,168,255,.22)"; ctx.beginPath(); ctx.arc(0, 0, r * 2.4, 0, 7); ctx.fill();
    ctx.fillStyle = "#d8d4ea"; ctx.strokeStyle = "#8c7dff"; ctx.lineWidth = 1.2;
    ctx.beginPath(); for (let k = 0; k < 6; k++){ const a = k * Math.PI / 3; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); } ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#ff6fa8"; ctx.beginPath(); ctx.arc(0, 0, r * 0.32, 0, 7); ctx.fill();
    if (!low) for (let k = 0; k < 3; k++){ const a = n.spin * 2 + k * 2.1; ctx.fillStyle = "#e6e0ff"; ctx.fillRect(Math.cos(a) * r * 1.8 - 1, Math.sin(a) * r * 1.8 - 1, 2, 2); }
    ctx.restore();
  }
}
const fLowFx = () => !!state.fxLow;
function fOmegaHalo(sx, sy, r, now){
  ctx.strokeStyle = `rgba(255,77,109,${0.45 + 0.3 * Math.sin(now / 90)})`; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(sx, sy, r, 0, 7); ctx.stroke(); ctx.lineWidth = 1;
}

// ミニマップ: 機兵の位置 (独立して散らばっているのが見えるように)
function machineMinimap(mm, toX, toY, size){
  if (!fActive && !f0Active) return;
  if (f0Active){
    mm.fillStyle = "#7df9ff";
    for (const p of F0.protos){ const x = toX(p.x), y = toY(p.y); if (x >= 0 && x <= size && y >= 0 && y <= size) mm.fillRect(x - 1, y - 1, 2.5, 2.5); }
    for (const T of F0.turrets){ const x = toX(T.x), y = toY(T.y); if (x >= 0 && x <= size && y >= 0 && y <= size) mm.fillRect(x - 2, y - 2, 4, 4); }
  }
  if (!fActive) return;
  mm.fillStyle = fOmega > 0 ? "#ff6f8a" : "#b9a8ff";
  for (const k of ["hunters", "drillers", "spiders", "kids", "teslas", "bombers", "cannons", "nanites"]){
    for (const u of MCH[k]){ const x = toX(u.x), y = toY(u.y); if (x >= 0 && x <= size && y >= 0 && y <= size) mm.fillRect(x - 1, y - 1, 2.5, 2.5); }
  }
  if (MCH.titan){ const x = toX(MCH.titan.x), y = toY(MCH.titan.y); if (x >= 0 && x <= size && y >= 0 && y <= size){ mm.fillRect(x - 3, y - 3, 6, 6); mm.strokeStyle = "#fff"; mm.lineWidth = 1; mm.strokeRect(x - 3, y - 3, 6, 6); } }
}
// ツリー上部の発動状況バーに出す稼働状況
function machineStatusText(){
  if (!fActive && !f0Active) return "";
  const parts = [];
  const add = (n, l) => { if (n) parts.push(`${l} <b>${n}</b>`); };
  add(F0.protos.length, "プロト");
  add(F0.turrets.length, "簡易砲台");
  add(MCH.hunters.length, "ハンター"); add(MCH.drillers.length, "ドリラー"); add(MCH.spiders.length + MCH.kids.length, "スパイダー");
  add(MCH.teslas.length, "テスラ"); add(MCH.bombers.length, "ボマー"); add(MCH.cannons.length, "キャノン"); add(MCH.titan ? 1 : 0, "タイタン"); add(MCH.nanites.length, "ナノマシン");
  const extra = [];
  if (f0ChargeT > 0) extra.push("<b style=\"color:#7df9ff\">急速充電中</b>");
  if (f0Heat > 0) extra.push(`排熱 <b>+${f0Heat}%</b>`);
  return `機兵 ${parts.join(" ・ ")} ／ 威力 <b>×${fPow().toFixed(2)}</b>${fOmega > 0 ? " ／ <b style=\"color:#ff6f8a\">暴走中</b>" : ""}${extra.length ? " ／ " + extra.join(" ") : ""}`;
}

// =========================================================
// 序盤機兵 (f0_*): 試作機プロト / 簡易砲台 / 自爆ドローン / 地雷
// 自律機兵 (f_*) と同じ原則: 実行時状態はセーブせず、スキルから毎フレーム機数を合わせ直す。
// 発生源フラグは curProto (skill-hooks.js)。自律機兵側は curMach を立て、素材+1 (f0_minemod) は付かない。
// =========================================================
const F0 = { protos: [], drones: [], mines: [], turrets: [] };   // turrets: 投下済みの簡易砲台 {x, y, ang, fireT, retT, ti, tm, flash, life, drop}
let f0TravelD = 0, f0LastPX = 0, f0LastPY = 0, f0TravelInit = false;   // 砲台投下: 前回の投下からの移動距離 (実移動量ベース)
let f0TurretCD = 0;               // 砲台投下: 次に投下できるまでの最短間隔
let f0ScrapN = 0;                 // スクラップ工房: 前回の組み立てからの破壊数
let f0DroneQueue = 0, f0DroneT = 0;
let f0Heat = 0, f0HeatT = 0;      // 排熱利用: 自機連射の上乗せ (%) と残り時間 (skill-early.js の earlyRateMul が読む)
let f0ChargeT = 0;                // 急速充電: 残り時間 (fRate とプロト/砲台のタイマーが読む)
let f0Heals = [];                 // 修理プロトコル: 継続回復キュー {left, rate}
let f0RebuildT = 0;               // 突撃で失ったプロトの再構築時間
let f0Active = false;

// --- 共有倍率 (自律機兵側は fPowWith / fRate に組み込み済み) ---
function f0BlueprintMul(){ return sk("f0_blueprint") ? 1 + Math.min(0.6, state.lv * 0.01) : 1; }   // 設計図: レベル×1%、最大+60%
function f0IdleMul(){ return (sk("f0_idle") && idleT >= 30) ? 1.5 : 1; }                              // 自動戦闘プログラム: 無操作30秒で ×1.5 (タイマーは skill-fx.js の autopilot と共用)
const f0Pow = () => f0BlueprintMul() * f0IdleMul();        // f0 ユニット (プロト・砲台・ドローン・地雷) の威力倍率
const f0RateMul = () => (f0ChargeT > 0 ? 2 : 1);           // 急速充電中の動作速度

// --- f0 ユニット専用のダメージチョークポイント (curProto を立て、自動照準較正の会心を判定する) ---
function f0HitBlock(idx, dmg){
  if (idx < 0 || isDestroyed(idx)) return;
  const p = curProto; curProto = true;
  try { damageBlock(idx, fCalibDmg(dmg), 0); } finally { curProto = p; }
}
function f0HitMob(m, dmg){ if (m && !m.dead) damageMob(m, fCalibDmg(dmg), null); }
function f0MobsIn(x, y, r, dmg){
  const r2 = r * r;
  for (const m of mobs){ if (m.dead) continue; const dx = m.x - x, dy = m.y - y; if (dx * dx + dy * dy <= r2) damageMob(m, fCalibDmg(dmg), null); }
}
function f0Radius(x, y, r, dmg){
  f0MobsIn(x, y, r, dmg);
  if (outOfPlanet(x, y, r)) return;
  const cgx = w2g(x), cgy = w2g(y), rb = Math.ceil(r / BS), r2 = r * r;
  const p = curProto; curProto = true;
  try {
    for (let gy = Math.max(0, cgy - rb); gy <= Math.min(D - 1, cgy + rb); gy++){
      for (let gx = Math.max(0, cgx - rb); gx <= Math.min(D - 1, cgx + rb); gx++){
        const i = gy * D + gx;
        if (!blockExists(gx, gy) || isDestroyed(i)) continue;
        const dx = g2w(gx) - x, dy = g2w(gy) - y;
        if (dx * dx + dy * dy <= r2) damageBlock(i, fCalibDmg(dmg), 0);
      }
    }
  } finally { curProto = p; }
}

// --- 他ファイルからのフック ---
function f0OnLevelUp(){ if (sk("f0_charge")) f0ChargeT = 20; }   // 急速充電 (skill-fx.js の levelUpFx から)
function f0OnPlayerHit(d){                                        // mobs.js の damagePlayer から (HPを引く直前)
  if (sk("f0_decoy")){                                            // 囮装甲: プロトが約5ブロック以内にいる間、被ダメージ -15%
    const R2 = (BS * 5) * (BS * 5);
    for (const p of F0.protos){ const dx = p.x - player.x, dy = p.y - player.y; if (dx * dx + dy * dy <= R2){ d *= 0.85; break; } }
  }
  if (sk("f0_repair") && F0.protos.length && state.hp - d > 0){   // 修理プロトコル: 受けたダメージの40%を5秒かけて回復
    const amt = d * 0.4;
    if (amt > 0){
      if (f0Heals.length >= 8){ let s = amt; for (const h of f0Heals) s += h.left; f0Heals = [{ left: s, rate: s / 5 }]; }
      else f0Heals.push({ left: amt, rate: amt / 5 });
    }
  }
  return d;
}
function f0OnMobKill(m){                                          // mobs.js の killMob から
  if (!sk("f0_salvage")) return;                                  // 部品取り: 倒すとプロト +1 (20秒間・最大+3)
  let temp = 0;
  for (const p of F0.protos) if (p.temp) temp++;
  if (temp >= 3) return;
  const p = f0NewProto(20);
  p.x = m.x; p.y = m.y;
  F0.protos.push(p);
}
function f0Reset(){
  F0.protos.length = 0; F0.drones.length = 0; F0.mines.length = 0; F0.turrets.length = 0;
  f0ScrapN = 0; f0DroneQueue = 0; f0DroneT = 0;
  f0Heat = 0; f0HeatT = 0; f0ChargeT = 0; f0Heals = []; f0RebuildT = 0;
  f0TravelD = 0; f0TravelInit = false; f0TurretCD = 0; f0Active = false;
}

// --- プロト ---
const f0BaseProtos = () => sk("f0_proto") ? 1 + (sk("f0_proto2") ? 1 : 0) : 0;
function f0NewProto(temp, x, y){
  const a = Math.random() * Math.PI * 2;
  const p = { x: x !== undefined ? x : player.x + Math.cos(a) * 50, y: y !== undefined ? y : player.y + Math.sin(a) * 50, ang: a,
    ha: Math.random() * Math.PI * 2, hr: 90 + Math.random() * 110,
    fireT: Math.random() * 0.5, retT: Math.random() * 0.4, ti: -1, tm: 0,
    lensKey: null, lensN: 0, mineT: 4 + Math.random() * 6, kamiT: 26 + Math.random() * 8, guardT: 0, collectT: Math.random() * 0.2,
    temp: temp || 0, dive: null, flash: 0, born: nowMs };
  addRing({ x: p.x, y: p.y, r: 22, color: "125,249,255", dur: 300 });
  return p;
}
function syncProtos(){
  const want = Math.max(0, f0BaseProtos() - (f0RebuildT > 0 ? 1 : 0));   // 突撃で失った1機は再構築が終わるまで欠員
  let base = 0;
  for (const p of F0.protos) if (!p.temp) base++;
  while (base < want){ F0.protos.push(f0NewProto(0)); base++; }
  if (base > want){
    let rm = base - want;
    for (let i = F0.protos.length - 1; i >= 0 && rm > 0; i--) if (!F0.protos[i].temp){ F0.protos.splice(i, 1); rm--; }
  }
  if (!sk("f0_salvage")) for (let i = F0.protos.length - 1; i >= 0; i--) if (F0.protos[i].temp) F0.protos.splice(i, 1);
}
function protoFire(p, U, pow){
  const base = U * 0.10 * 0.5 * pow;   // 0.5秒間隔: 1発 = DPS×10% ÷ 毎秒2発
  const range = BS * 10, mobRange = sk("f0_intercept") ? BS * 17 : range;
  const shots = [];
  const mb = p.tm ? mobById(p.tm) : null;
  if (mb && Math.hypot(mb.x - p.x, mb.y - p.y) <= mobRange) shots.push({ mob: mb });
  else if (p.ti >= 0 && !isDestroyed(p.ti)){ const bp = blockPos(p.ti); if (Math.hypot(bp.x - p.x, bp.y - p.y) <= range) shots.push({ idx: p.ti }); }
  if (!shots.length){ p.lensKey = null; p.lensN = 0; return false; }
  if (sk("f0_split")){   // 拡散レンズ: 近くの3目標同時 (各70%)
    const have = new Set(shots.map(s => s.mob ? "m" + s.mob.id : "b" + s.idx));
    for (const j of findNearestBlocks(p.x, p.y, range, 4)){
      if (shots.length >= 3) break;
      if (have.has("b" + j)) continue;
      have.add("b" + j); shots.push({ idx: j });
    }
  }
  shots.forEach((s, n) => {
    let mult = n === 0 ? 1 : 0.7;
    if (n === 0){   // 収束レンズ: 同じ目標を撃ち続けるほど +20%/発 (最大×2)
      const key = s.mob ? "m" + s.mob.id : "b" + s.idx;
      if (sk("f0_lens")){ if (p.lensKey === key) p.lensN++; else { p.lensKey = key; p.lensN = 0; } mult = Math.min(2, 1 + 0.2 * p.lensN); }
      else { p.lensKey = key; p.lensN = 0; }
    }
    let dmg = base * mult;
    const bp = s.mob ? null : blockPos(s.idx), tx = s.mob ? s.mob.x : bp.x, ty = s.mob ? s.mob.y : bp.y;
    addBeam({ x1: p.x, y1: p.y, x2: tx, y2: ty, w: 1.6, color: "#7df9ff", life: 110 });
    if (s.mob){ if (sk("f0_intercept")) dmg *= 2; f0HitMob(s.mob, dmg); }   // 迎撃プログラム: モンスターへのダメージ×2
    else f0HitBlock(s.idx, dmg);
  });
  p.flash = 0.06;
  const s0 = shots[0], bp0 = s0.mob ? null : blockPos(s0.idx);
  p.ang = Math.atan2((s0.mob ? s0.mob.y : bp0.y) - p.y, (s0.mob ? s0.mob.x : bp0.x) - p.x);
  return true;
}
function protoGuard(p){   // 護衛モード: 周囲約3ブロックの敵弾を撃ち落とす
  const R2 = (BS * 3) * (BS * 3);
  for (let i = 0; i < mobShots.length; i++){
    const s = mobShots[i], dx = s.x - p.x, dy = s.y - p.y;
    if (dx * dx + dy * dy <= R2){
      addBeam({ x1: p.x, y1: p.y, x2: s.x, y2: s.y, w: 1.6, color: "#aef4ff", life: 100 });
      mobShots.splice(i, 1);
      p.flash = 0.06;
      return true;
    }
  }
  return false;
}
function protoCollect(p){   // 回収モジュール: 周囲約3ブロックのコインを拾う (通常の gainCoin 経路)
  const R2 = (BS * 3) * (BS * 3);
  for (let i = coinsArr.length - 1; i >= 0; i--){
    const c = coinsArr[i];
    if (c.gone) continue;
    const dx = c.x - p.x, dy = c.y - p.y;
    if (dx * dx + dy * dy <= R2){ gainCoin(c, false); removeCoinAt(i); hudDirty = true; }
  }
}
function layMine(p){   // 地雷敷設: 近くのブロックへ地雷 (上限つき)
  if (F0.mines.length >= 12) return;
  const idx = findNearestBlock(p.x, p.y, BS * 6);
  if (idx < 0 || F0.mines.some(mn => mn.idx === idx)) return;
  const bp = blockPos(idx);
  F0.mines.push({ idx, x: bp.x, y: bp.y, t: 1.5 });
}
function updateProto(p, dt, U, pow){
  if (p.flash > 0) p.flash -= dt;
  if (p.temp){ p.temp -= dt; if (p.temp <= 0) return false; }
  if (p.dive){   // 突撃中: 密集地へ一直線
    const d = fMoveTo(p, p.dive.x, p.dive.y, 950, dt, 0);
    p.dive.t -= dt;
    if (d <= 34 || p.dive.t <= 0){
      bumpProc("f0kami", p.x, p.y);
      addRing({ x: p.x, y: p.y, r: BS * 2.8, color: "255,170,90", dur: 420 });
      f0Radius(p.x, p.y, BS * 2.5, U * 4 * pow);
      if (onScreen(p.x, p.y, 60)) sndBoom();
      if (!p.temp) f0RebuildT = 3;   // その場で組み直し: 少し置いて自機そばに復帰
      return false;
    }
    return true;
  }
  const rate = f0RateMul();
  if (sk("f0_kamikaze")){   // 突撃プロトコル: 30秒ごとに密集地へ突撃
    p.kamiT -= dt;
    if (p.kamiT <= 0){
      const tp = fDensest(p.x, p.y, 700, 3);
      if (tp){ p.dive = { x: tp.x, y: tp.y, t: 1.6 }; p.kamiT = 30; }
      else p.kamiT = 4;
    }
  }
  if (sk("f0_mines")){ p.mineT -= dt; if (p.mineT <= 0){ p.mineT = 8; layMine(p); } }
  if (p.guardT > 0) p.guardT -= dt;
  if (sk("f0_guard") && p.guardT <= 0 && protoGuard(p)) p.guardT = 0.4;
  if (sk("f0_collect")){ p.collectT -= dt; if (p.collectT <= 0){ p.collectT = 0.15; protoCollect(p); } }
  // 索敵 (間引き)
  p.retT -= dt;
  const range = BS * 10, mobRange = sk("f0_intercept") ? BS * 17 : range;
  if (p.retT <= 0){
    p.retT = 0.4 + Math.random() * 0.2;
    const mb = nearestMob(p.x, p.y, mobRange);
    if (mb){ p.tm = mb.id; p.ti = -1; }
    else {
      p.tm = 0;
      const cur = p.ti >= 0 && !isDestroyed(p.ti) ? blockPos(p.ti) : null;
      if (!cur || Math.hypot(cur.x - p.x, cur.y - p.y) > range) p.ti = findNearestBlock(p.x, p.y, range);
    }
  }
  // 移動: 目標のそばでホバリング。自機から約10ブロック以上は追わない
  const tmob = p.tm ? mobById(p.tm) : null;
  let tx, ty, stop = 10;
  if (tmob){ tx = tmob.x; ty = tmob.y; stop = 150; }
  else if (p.ti >= 0 && !isDestroyed(p.ti)){ const bp = blockPos(p.ti); tx = bp.x; ty = bp.y; stop = 150; }
  else { const hp = fHome(p); tx = hp.x; ty = hp.y; }
  if (Math.hypot(tx - player.x, ty - player.y) > BS * 10){ const hp = fHome(p); tx = hp.x; ty = hp.y; stop = 10; }
  fMoveTo(p, tx, ty, 300, dt, stop);
  // 射撃
  p.fireT -= dt * rate;
  if (p.fireT > 0) return true;
  p.fireT = 0.5;
  if (!protoFire(p, U, pow)) p.fireT = 0.15;
  return true;
}

// --- 簡易砲台 (砲台投下): 移動距離に応じて足跡のように砲台を落としていく ---
const F0_TURRET_DIST = BS * 25;   // 約25ブロック進むごとに1基投下
const F0_TURRET_LIFE = 7;         // 1基が残る秒数
const F0_TURRET_MAX = 3;          // 同時に置ける数 (超えたら古い順に畳む)
const F0_TURRET_CD = 2;           // 投下の最短間隔 (ブースト連打で撤収爆破が乱発しないように)
function packTurret(T, explode){
  if (explode && sk("f0_pack")){   // 撤収爆破: 畳むとき (時間切れ・入れ替わり)、その場で爆発
    bumpProc("f0pack", T.x, T.y);
    addRing({ x: T.x, y: T.y, r: BS * 3.4, color: "255,170,90", dur: 420 });
    f0Radius(T.x, T.y, BS * 3, playerDamage() * 2 * f0Pow());
    if (onScreen(T.x, T.y, 60)) sndBoom();
  }
}
function dropTurret(){
  while (F0.turrets.length >= F0_TURRET_MAX) packTurret(F0.turrets.shift(), true);   // 古い砲台から畳む
  const T = { x: player.x, y: player.y, ang: player.angle !== undefined ? player.angle : -Math.PI / 2,
    fireT: 0.35, retT: 0, ti: -1, tm: 0, flash: 0, life: F0_TURRET_LIFE, drop: 0.25 };
  F0.turrets.push(T);
}
function updateTurrets(dt, U, pow){
  if (!f0TravelInit){ f0TravelInit = true; f0LastPX = player.x; f0LastPY = player.y; }
  const moved = Math.hypot(player.x - f0LastPX, player.y - f0LastPY);
  f0LastPX = player.x; f0LastPY = player.y;
  if (!sk("f0_turret")){ F0.turrets.length = 0; f0TravelD = 0; return; }
  if (moved < BS * 4) f0TravelD += moved;   // ワープ・リスポーンのような瞬間移動は数えない
  if (f0TurretCD > 0) f0TurretCD -= dt;
  if (f0TravelD >= F0_TURRET_DIST && f0TurretCD <= 0){ f0TravelD = 0; f0TurretCD = F0_TURRET_CD; dropTurret(); }
  for (let i = F0.turrets.length - 1; i >= 0; i--){
    const T = F0.turrets[i];
    T.life -= dt;
    if (T.life <= 0){ F0.turrets.splice(i, 1); packTurret(T, true); continue; }
    turretFire(T, dt, U, pow);
  }
}
function turretFire(T, dt, U, pow){
  if (T.flash > 0) T.flash -= dt;
  if (T.drop > 0){                          // 着地するまでは撃たない
    T.drop -= dt;
    if (T.drop <= 0) addRing({ x: T.x, y: T.y, r: BS * 1.4, color: "125,249,255", dur: 260 });
    return;
  }
  const range = BS * 12 * (sk("f0_range") ? 1.5 : 1);   // 砲台の測距儀: 射程 +50%
  T.retT -= dt;
  if (T.retT <= 0){
    T.retT = 0.4;
    const mb = nearestMob(T.x, T.y, range);
    if (mb){ T.tm = mb.id; T.ti = -1; }
    else { T.tm = 0; if (T.ti < 0 || isDestroyed(T.ti)) T.ti = findNearestBlock(T.x, T.y, range); }
  }
  T.fireT -= dt * f0RateMul();
  if (T.fireT > 0) return;
  T.fireT = 0.5;
  const per = (sk("f0_range") ? 0.35 : 0.25) * 0.5;   // 0.5秒間隔: 1発 = DPS×25% (測距儀で35%) ÷ 毎秒2発
  const shots = sk("f0_turret2") ? 2 : 1;              // 連装砲台: 1回に2発
  for (let s = 0; s < shots; s++){
    const mb = T.tm ? mobById(T.tm) : null;
    let idx = T.ti >= 0 && !isDestroyed(T.ti) ? T.ti : -1;
    if (!mb && idx < 0) idx = findNearestBlock(T.x, T.y, range);
    if (mb){
      addBeam({ x1: T.x, y1: T.y, x2: mb.x, y2: mb.y, w: 2, color: "#aef4ff", life: 110 });
      f0HitMob(mb, U * per * pow);
      T.ang = Math.atan2(mb.y - T.y, mb.x - T.x); T.flash = 0.06;
    } else if (idx >= 0){
      const bp = blockPos(idx);
      addBeam({ x1: T.x, y1: T.y, x2: bp.x, y2: bp.y, w: 2, color: "#aef4ff", life: 110 });
      f0HitBlock(idx, U * per * pow);
      T.ang = Math.atan2(bp.y - T.y, bp.x - T.x); T.flash = 0.06;
      if (isDestroyed(idx)) T.ti = -1;
    } else { T.fireT = 0.15; break; }
  }
}

// --- 自爆ドローン (スクラップ工房) ---
function spawnScrapDrone(){
  const tp = fDensest(player.x, player.y, 800, 3) || { x: player.x, y: player.y };
  const a = Math.random() * Math.PI * 2;
  F0.drones.push({ x: player.x + Math.cos(a) * 30, y: player.y + Math.sin(a) * 30, tx: tp.x, ty: tp.y, ang: a, t: 0 });
}
function updateScrapDrone(d, dt, U, pow){
  d.t += dt;
  const dist = fMoveTo(d, d.tx, d.ty, 720, dt, 0);
  if (dist <= 30 || d.t > 2.5){
    bumpProc("f0drone", d.x, d.y);
    addRing({ x: d.x, y: d.y, r: BS * 3.4, color: "255,170,90", dur: 420 });
    f0Radius(d.x, d.y, BS * 3, U * 3 * pow);
    if (onScreen(d.x, d.y, 60)) sndBoom();
    return false;
  }
  return true;
}

// --- f0 全体の更新 (machineUpdate から、自律機兵の有無にかかわらず呼ばれる) ---
function f0Update(dt, now){
  if (f0ChargeT > 0) f0ChargeT -= dt;
  if (f0HeatT > 0){ f0HeatT -= dt; if (f0HeatT <= 0) f0Heat = 0; }   // 排熱は3秒で冷める
  if (f0Heals.length && state.hp > 0){                               // 修理プロトコルの継続回復
    for (let i = f0Heals.length - 1; i >= 0; i--){
      const h = f0Heals[i], amt = Math.min(h.left, h.rate * dt);
      h.left -= amt;
      state.hp = Math.min(playerMaxHP(), state.hp + amt);
      if (h.left <= 0.001) f0Heals.splice(i, 1);
    }
  }
  const any = sk("f0_proto") || sk("f0_turret") || sk("f0_scrap") || sk("f0_salvage");
  f0Active = !!(any || F0.protos.length || F0.turrets.length || F0.drones.length || F0.mines.length);
  if (!f0Active) return;
  const U = playerDPS(), pow = f0Pow();
  if (f0RebuildT > 0) f0RebuildT -= dt;
  syncProtos();
  for (let i = F0.protos.length - 1; i >= 0; i--) if (!updateProto(F0.protos[i], dt, U, pow)) F0.protos.splice(i, 1);
  updateTurrets(dt, U, pow);
  if (f0DroneQueue > 0){ f0DroneT -= dt; if (f0DroneT <= 0){ f0DroneT = 0.3; f0DroneQueue--; spawnScrapDrone(); } }
  for (let i = F0.drones.length - 1; i >= 0; i--) if (!updateScrapDrone(F0.drones[i], dt, U, pow)) F0.drones.splice(i, 1);
  for (let i = F0.mines.length - 1; i >= 0; i--){
    const mn = F0.mines[i];
    if (isDestroyed(mn.idx)){ F0.mines.splice(i, 1); continue; }   // 土台のブロックが先に壊れたら地雷も消える
    mn.t -= dt;
    if (mn.t <= 0){
      F0.mines.splice(i, 1);
      bumpProc("f0mine", mn.x, mn.y);
      addRing({ x: mn.x, y: mn.y, r: BS * 1.8, color: "255,120,60", dur: 380 });
      f0Radius(mn.x, mn.y, BS * 1.5, U * 2 * pow);   // 半径1.5ブロック = 3x3を巻き込む
    }
  }
}

// --- f0 の描画 (machineDraw から) ---
const protoSpr = makeSprite(36, (g, S) => {
  const cx = S / 2, cy = S / 2;
  g.fillStyle = "#12333d"; g.strokeStyle = "#7df9ff"; g.lineWidth = 1.6;
  g.beginPath(); g.arc(cx, cy, 10, 0, 7); g.fill(); g.stroke();
  g.fillStyle = "#2a5a68"; g.fillRect(cx - 13, cy - 3, 6, 6); g.fillRect(cx + 7, cy - 3, 6, 6);
  g.fillStyle = "#d8fbff"; g.beginPath(); g.arc(cx, cy, 4.2, 0, 7); g.fill();
});
function f0Draw(now, toScreen){
  const low = fLowFx();
  // 地雷: 点滅する小さな信管
  for (const mn of F0.mines){
    if (!onScreen(mn.x, mn.y, 30)) continue;
    const [sx, sy] = toScreen(mn.x, mn.y);
    const blink = (now / 200 + mn.idx) % 2 < 1;
    ctx.fillStyle = blink ? "#ff5340" : "#7a1f16";
    ctx.beginPath(); ctx.arc(sx, sy, 3.4 * zoom, 0, 7); ctx.fill();
    ctx.strokeStyle = "rgba(255,83,64,.6)"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(sx, sy, (5 + 2 * Math.sin(now / 150)) * zoom, 0, 7); ctx.stroke();
  }
  // 簡易砲台: 台座 + 砲身 (投下直後は上から落ちてくる・畳まれる直前は点滅)
  for (const T of F0.turrets){
    if (onScreen(T.x, T.y, 60)){
      const [sx0, sy0] = toScreen(T.x, T.y), sx = sx0, sy = sy0 - Math.max(0, T.drop) * 160 * zoom;
      ctx.save();
      if (T.life < 1.2) ctx.globalAlpha = 0.45 + 0.45 * Math.abs(Math.sin(now / 90));
      ctx.translate(sx, sy);
      ctx.fillStyle = "#1c2f38"; ctx.strokeStyle = "#7df9ff"; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(-13 * zoom, 9 * zoom); ctx.lineTo(13 * zoom, 9 * zoom); ctx.lineTo(8 * zoom, -4 * zoom); ctx.lineTo(-8 * zoom, -4 * zoom); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.rotate(T.ang);
      ctx.fillStyle = T.flash > 0 ? "#eafcff" : "#9adfe8";
      ctx.fillRect(0, -2.4 * zoom, 17 * zoom, 4.8 * zoom);
      ctx.restore();
      ctx.fillStyle = "#7df9ff"; ctx.beginPath(); ctx.arc(sx, sy - 4 * zoom, 3 * zoom, 0, 7); ctx.fill();
    }
  }
  // 自爆ドローン: オレンジの小型機
  for (const d of F0.drones){
    if (!onScreen(d.x, d.y, 40)) continue;
    const [sx, sy] = toScreen(d.x, d.y);
    ctx.save(); ctx.translate(sx, sy); ctx.rotate(d.ang);
    ctx.fillStyle = "#ff9a3c"; ctx.strokeStyle = "#ffd9a0"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(8 * zoom, 0); ctx.lineTo(-6 * zoom, 5 * zoom); ctx.lineTo(-6 * zoom, -5 * zoom); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
  }
  // プロト: 小さなドローン (丸い機体+発光コア)。臨時機 (部品取り) は半透明で、消滅が近いと点滅
  for (const p of F0.protos){
    if (!onScreen(p.x, p.y, 50)) continue;
    const [sx, sy] = toScreen(p.x, p.y), size = 36 * zoom;
    ctx.save();
    if (p.temp) ctx.globalAlpha = p.temp < 3 ? (0.35 + 0.4 * Math.abs(Math.sin(now / 120))) : 0.75;
    ctx.translate(sx, sy); ctx.rotate(p.ang);
    ctx.drawImage(protoSpr, -size / 2, -size / 2, size, size);
    ctx.restore();
    if (p.flash > 0){ ctx.fillStyle = "rgba(216,251,255,.85)"; ctx.beginPath(); ctx.arc(sx + Math.cos(p.ang) * 12 * zoom, sy + Math.sin(p.ang) * 12 * zoom, 3 * zoom, 0, 7); ctx.fill(); }
    if (!low && p.dive){ ctx.strokeStyle = "rgba(255,120,60,.7)"; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.arc(sx, sy, 13 * zoom, 0, 7); ctx.stroke(); ctx.lineWidth = 1; }
  }
}
