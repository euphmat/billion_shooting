"use strict";
/* =========================================================
   game/skill-early.js - 序盤スキル (各系統の内側24種 x 6系統) の効果
   ※ 作業途中: 既存処理から呼ばれる入口は全て定義済み (未実装の効果は何もしない)。
     実装済み: 単純な倍率系 (照準補正・表層破り・虫の息・宝石砕き・岩砕き・出っ張り・崩し屋・小銭拾い・増加装甲・
     駆け出し支援・若葉の学び・富者の余裕・拾い得・早拾い・表層の財・希少素材・爆発の財・遠征手当・連鎖の駄賃・
     初物・霜の学び・撃破の学び・露頭・深掘り・爆発物の採取・星屑ふるい・余波の採掘・金属探知・分解抽出・
     超伝導・長銃身・ボット長距離砲・アフターバーナー・ボット照準器・連携射撃・編隊飛行・予備弾倉・徹し撃ち 等)
     実装済み (機兵序盤 f0_*): プロト・簡易砲台・自爆ドローン・地雷は game/machines.js の f0 セクション、
     被弾/撃破フックは mobs.js 経由、排熱利用は earlyRateMul、採掘モジュールは earlyDropAdj に接続済み。
     未実装: 毎フレーム処理 (雷雲・日当など他系統の分)・ツリー画面の環レイアウト調整
   ========================================================= */
const eElemAdd = { burn: 0, frost: 0, acid: 0, shock: 0 };
const ePlHit = new Map();   // 連携射撃: 自機が撃ったブロック -> 時刻 (ms)
let eFirst = false;         // 初物: いま壊したブロックの素材が未発見だったか
const eAtk = () => playerDamage();
const eDigits = v => Math.floor(Math.log10(Math.max(1, v)) + 1);
function eN4(gx, gy){ let n = 0; for (const [dx, dy] of N4) if (liveAt(gx + dx, gy + dy) >= 0) n++; return n; }

// ---------- 倍率 ----------
function earlyGlobalMul(){ return 1; }
// 序盤機兵 f0 排熱利用: プロト・砲台・自爆ドローン・自律機兵が壊すたび連射 +1% (最大+15%、3秒で冷める)。状態は machines.js の f0Heat
function earlyRateMul(){ return 1 + (sk("f0_exhaust") ? f0Heat * 0.01 : 0); }
function earlyCrewRateMul(){ return 1; }
function earlySpeedMul(){ return 1; }
function earlyBoostMul(){ return sk("d0_afterburn") ? 1.25 : 1; }
function earlyRangeMul(){ return sk("a0_barrel") ? 1.12 : 1; }
function earlyBotRangeMul(){ return sk("d0_botrange") ? 1.15 : 1; }
function earlyCrewShotMul(sx, sy, fromBot){
  let m = 1;
  if (fromBot && sk("d0_formation")){ const dx = sx - player.x, dy = sy - player.y; if (dx * dx + dy * dy <= 192 * 192) m *= skMul("d0_formation", 1.2); }
  return m;
}
function earlyCritAdd(hp, max){ return hp >= max ? skAdd("a0_sharp", 0.15) : 0; }
function earlyOnCrit(){}
function earlyHitMul(idx, gx, gy, hp, max){
  let m = 1;
  if (curPl) m *= skMul("a0_sight", 1.08);
  if (curPl && sk("a0_rough")) m *= 0.8 + Math.random() * 0.8 * skA("a0_rough");   // 強化で上振れの幅が広がる
  if (sk("a0_surface") && blockDepth(gx, gy) <= 0.2) m *= skMul("a0_surface", 1.2);
  if (sk("a0_weakspot") && hp <= max * 0.25) m *= skMul("a0_weakspot", 1.25);
  if (sk("a0_rock") && max >= eAtk() * 20) m *= skMul("a0_rock", 1.2);
  if (sk("a0_spike") || sk("e0_buried")){ const n = eN4(gx, gy); if (sk("a0_spike") && n <= 2) m *= skMul("a0_spike", 1.2); if (sk("e0_buried") && n >= 4) m *= skMul("e0_buried", 1.25); }
  if (sk("a0_gem")){ const mm = MATS[materialAt(gx, gy)]; if (mm.explosive) m *= skMul("a0_gem", 2); else if (mm.cat === "gem") m *= skMul("a0_gem", 1.4); }
  if (sk("b0_combo") && frosts.has(idx) && burns.has(idx)) m *= skMul("b0_combo", 1.35);
  if (curCrew && sk("d0_link")){ const t = ePlHit.get(idx); if (t && nowMs - t < 2000) m *= skMul("d0_link", 1.3); }
  if (curBot && sk("d0_botcrit") && Math.random() < skChance("d0_botcrit", 0.08)) m *= 2;   // 会心はダメージが増えるだけ (処理は増えない) なので確率を強化
  return m;
}
function earlyAfterHit(idx, gx, gy, dmg, cur){
  if (curPl && sk("d0_link")){ if (ePlHit.size > 3000) ePlHit.clear(); ePlHit.set(idx, nowMs); }
}
function earlyOnShock(j, d){}

// ---------- コイン / 経験値 ----------
function earlyCoinMul(){ return state.coins < state.lv * 2000 ? skMul("c0_rookie", 1.3) : 1; }
function earlyCoinPickMul(c, byBot){
  let m = 1;
  if (!byBot) m *= skMul("c0_hand", 1.08);
  if (sk("c0_quick") && (c.age || 0) <= 1) m *= skMul("c0_quick", 1.15);
  return m;
}
function earlyOnCoin(v, n, byBot){}
function earlyXpMul(){
  let m = 1;
  if (sk("c0_youth")) m *= 1 + 0.6 * skA("c0_youth") * Math.max(0, (60 - state.lv) / 59);
  if (sk("c0_proud")) m *= 1 + 0.02 * skA("c0_proud") * eDigits(state.coins);
  return m;
}
function earlyBreakPre(idx, gx, gy, m){
  eFirst = sk("c0_firstfind") && !state.seen[m.key];
  let v = eFirst ? 1 + 4 * skA("c0_firstfind") : 1;
  if (sk("b0_scorch")){ const f = burns.get(idx); if (f && (!f.k || f.k === "burn")) v *= skMul("b0_scorch", 1.3); }
  if (sk("c0_surface") && blockDepth(gx, gy) <= 0.2) v *= skMul("c0_surface", 1.15);
  if (sk("c0_rare") && matRarity(m) >= 2) v *= skMul("c0_rare", 1.5);
  if (sk("c0_boom") && m.explosive) v *= skMul("c0_boom", 3);
  if (sk("c0_chain") && dmgDepth >= 2) v *= skMul("c0_chain", 1.2);
  if (sk("c0_expedition") && bodyAt(gx, gy) > 0) v *= skMul("c0_expedition", 1.25);
  if (idx === markIdx){ v *= 1 + 4 * skLvMul("a0_steady"); markBurst(idx, gx, gy); }   // 刻印弾 (game/skill-fx.js): 刻印ブロックはコイン ×5 で炸裂
  return v;
}
function earlyBreakXpMul(idx, gx, gy){
  let m = eFirst ? 1 + 2 * skA("c0_firstfind") : 1;
  if (sk("b0_frostlearn") && frosts.has(idx)) m *= skMul("b0_frostlearn", 1.5);
  if (sk("c0_direct") && curPl && dmgDepth === 1) m *= skMul("c0_direct", 1.2);
  return m;
}
function earlyOnBreak(idx, gx, gy, kind){}

// ---------- 素材 ----------
function earlyDropAdj(n, gx, gy, m){
  let mul = 1, add = 0;
  const dep = blockDepth(gx, gy), idx = gy * D + gx;
  if (sk("e0_outcrop") && dep <= 0.15) mul *= skMul("e0_outcrop", 1.25);
  if (sk("e0_deep")) mul *= 1 + 0.4 * skA("e0_deep") * Math.max(0, dep);
  if (sk("e0_explo") && m.explosive) mul *= skMul("e0_explo", 2);
  if (sk("e0_rubble") && dmgDepth >= 2) mul *= skMul("e0_rubble", 1.2);
  if (sk("e0_dust") && bodyAt(gx, gy) > 0) mul *= skMul("e0_dust", 1.3);
  if (sk("e0_hard") && blockMaxHP(gx, gy) >= eAtk() * 20) add += skA("e0_hard");
  if (sk("e0_metal") && (m.cat === "metal" || m.cat === "ore") && Math.random() < 0.2) add += skA("e0_metal");
  if (sk("b0_extract")){ const f = burns.get(idx); if (f && f.k === "acid") add += skA("b0_extract"); }
  if (sk("f0_minemod") && curProto) add += skA("f0_minemod");   // 序盤機兵 f0 採掘モジュール: プロト・砲台・自爆ドローンが壊したブロックは素材 +1 (自律機兵の破壊には付かない)
  if (mul !== 1){ const x = n * mul, w = Math.floor(x); n = w + (Math.random() < x - w ? 1 : 0); }
  return n + (add ? rndI(add) : 0);   // スキルLvで増えた端数は確率で繰り上げ
}
