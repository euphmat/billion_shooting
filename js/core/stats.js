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
const playerSpeed  = () => 270 * (sk("d_boost") ? 1.15 : 1) * (1 + (typeof artVal === "function" ? artVal("spd") : 0));
const magnetRange  = () => 90 * (1 + (typeof artVal === "function" ? artVal("magnet") : 0)) * (sk("c_philosopher") ? 3 : 1);   // 無限財宝 (奥義): コイン吸引範囲 ×3
const weaponDPS = w => 5 * w.power;   // 基礎ダメージ1あたりの実効DPS
const playerDPS    = () => weaponDPS(WEAPONS[state.weapon]) * weaponPowerMul(state.weapon);
// ---------- 攻撃ボットの装備 ----------
const botWeaponAt = i => {
  const k = state.botLoadout[i];
  if (!k || !WEAPONS[k] || !state.weaponsOwned[k] || k === state.weapon) return null;
  for (let j = 0; j < i; j++) if (state.botLoadout[j] === k) return null;
  return k;
};
const botWeaponDPS  = k => weaponDPS(WEAPONS[k]) * weaponPowerMul(k) * 0.6 * botMul();
const botDefaultDPS = () => playerDamage() * 0.6 * botMul() * 3;
const botSlotDPS    = i => { const k = botWeaponAt(i); return k ? botWeaponDPS(k) : botDefaultDPS(); };
const botsTotalDPS  = () => { let s = 0; const n = act("bots"); for (let i = 0; i < n; i++) s += botSlotDPS(i); return s; };
const setBotWeapon  = (i, k) => {
  if (k) for (let j = 0; j < state.botLoadout.length; j++) if (j !== i && state.botLoadout[j] === k) state.botLoadout[j] = null;
  state.botLoadout[i] = k || null;
};
const clearBotWeapon = k => { for (let j = 0; j < state.botLoadout.length; j++) if (state.botLoadout[j] === k) state.botLoadout[j] = null; };
const totalDPS     = () => Math.round(playerDPS() + botsTotalDPS());
