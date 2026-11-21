"use strict";
/* =========================================================
   core/stats.js - 派生ステータス (攻撃力・速度・DPS など)
   ========================================================= */

// ---------- derived stats ----------
const ATTACK_RANGE = 300;
const BULLET_SPD_MUL = 0.6;   // 弾速の全体倍率: 弾の形が見分けられるよう一律で遅くする (射程は寿命側で補正し不変)
const BULLET_SIZE_MUL = 1.3;  // 弾の描画サイズの全体倍率: 何を撃っているか見分けやすく、少しだけ大きくする (当たり判定・範囲は不変)
// 攻撃力: 仲間・スキルの威力の土台。装備の格 (実効DPS倍率) の平方根で伸びる (連射や弾数に左右されない)
const weaponAtkMul = k => Math.sqrt(WEAPONS[k].power) * weaponLvMul(k);
const playerDamage = () => weaponAtkMul(state.weapon);
// 1発の威力: 装備ごとに「実効DPS ÷ 連射 ÷ 実効倍率」で決まる
const shotDamage   = (k = state.weapon) => WEAPONS[k].dmg * weaponPowerMul(k);
const weaponYield  = () => WEAPONS[state.weapon].yield;   // 採掘ボーナス (コイン倍率)
const playerSpeed  = () => 270 * (sk("d_boost") ? 1.15 : 1) * (1 + (typeof artVal === "function" ? artVal("spd") : 0)) * (1 + MASTERY.d.spd[masteryRank("d")]) * (typeof earlySpeedMul === "function" ? earlySpeedMul() : 1);   // 艦隊マスタリー: 移動速度 / 序盤スキル (game/skill-early.js)
const magnetRange  = () => 90 * (1 + (typeof artVal === "function" ? artVal("magnet") : 0)) * (sk("c_philosopher") ? 3 : 1) * (sk("c0_magnet") ? 1.25 : 1);   // 吸引範囲は「範囲」なのでスキルLvでは広げない   // 無限財宝 (奥義): コイン吸引範囲 ×3 / 小銭拾い: +25%
const weaponDPS = w => 5 * w.power;   // 基礎ダメージ1あたりの実効DPS
const playerDPS    = () => weaponDPS(WEAPONS[state.weapon]) * weaponPowerMul(state.weapon);
// ---------- 攻撃ボットの装備 ----------
const botWeaponAt = i => {
  const k = state.botLoadout[i];
  if (!k || !WEAPONS[k] || !state.weaponsOwned[k] || k === state.weapon) return null;
  for (let j = 0; j < i; j++) if (state.botLoadout[j] === k) return null;
  return k;
};
// 装備そのものの火力 (おまかせ編成・棚の並び順はこちらで比べる)
const botWeaponRawDPS = k => weaponDPS(WEAPONS[k]) * weaponPowerMul(k) * 0.6 * botMul();
const botDefaultDPS = () => playerDamage() * 0.6 * botMul() * 3;
// 装備ボットの火力の下限 = デフォルト砲。デフォルト砲は自機の攻撃力 (√power) で伸びるので、自機が最難関の
// 武器を持つと通常武器が全部デフォルト砲を下回り、おまかせ編成が最難関の残り4本しか配らなかった。
// 装備すると弱くなる、を無くし、どの武器を持たせても「その武器の撃ち方 + 少なくともデフォルト砲の威力」で撃つ
const botWeaponFloorMul = k => Math.max(1, botDefaultDPS() / botWeaponRawDPS(k));
const botWeaponDPS  = k => Math.max(botWeaponRawDPS(k), botDefaultDPS());
const botSlotDPS    = i => { const k = botWeaponAt(i); return k ? botWeaponDPS(k) : botDefaultDPS(); };
// 編成の比較用: 空きスロット (デフォルト砲) は -1 で必ず一番弱い扱い、装備中は装備そのものの火力
const botSlotRank   = i => { const k = botWeaponAt(i); return k ? botWeaponRawDPS(k) : -1; };
const botsTotalDPS  = () => { let s = 0; const n = act("bots"); for (let i = 0; i < n; i++) s += botSlotDPS(i); return s; };
const setBotWeapon  = (i, k) => {
  if (k) for (let j = 0; j < state.botLoadout.length; j++) if (j !== i && state.botLoadout[j] === k) state.botLoadout[j] = null;
  state.botLoadout[i] = k || null;
};
const clearBotWeapon = k => { for (let j = 0; j < state.botLoadout.length; j++) if (state.botLoadout[j] === k) state.botLoadout[j] = null; };
const totalDPS     = () => Math.round(playerDPS() + botsTotalDPS());
