"use strict";
/* =========================================================
   data/crew.js - 攻撃ボット / 回収ボット / 衛星テクノロジーのマスターデータと派生値
   ========================================================= */

// ---------- 攻撃ボット (製造: コイン + 素材) ----------
const BOT_MAX = 12, COINBOT_MAX = 8;
const BOT_MATS = [
  { wood:30, stone:30 }, { copperOre:40, flint:20 }, { tinOre:40, copperOre:60 }, { ironOre:80, coal:50 },
  { ironOre:150, quartz:50 }, { magnetite:100, silverOre:60 }, { titaniumOre:120, ironOre:200 }, { tungstenOre:150, cobaltOre:100 },
  { diamond:80, titaniumOre:200 }, { iridium:120, osmium:120 }, { stellarIron:200, neutronDust:100 }, { adamant:200, starMetal:200 },
];
const COINBOT_MATS = [
  { wood:20, grass:20 }, { copperOre:30, sand:30 }, { magnetite:40, tinOre:40 }, { ironOre:100, goldOre:30 },
  { silverOre:80, quartz:80 }, { platinumOre:60, titaniumOre:100 }, { palladium:80, helium3:40 }, { goldMelt:100, chronite:60 },
];
const BOT_COST     = n => niceRound(100 * Math.pow(2.2, n));
const COINBOT_COST = n => niceRound(80 * Math.pow(2.0, n));
const BOT_RECIPE     = n => BOT_MATS[Math.min(n, BOT_MATS.length - 1)];
const COINBOT_RECIPE = n => COINBOT_MATS[Math.min(n, COINBOT_MATS.length - 1)];
// 攻撃ボット強化: 威力 +12%/Lv。5レベルごとに要求素材の格が上がる
const BOT_UP_MATS_LIST = ["copperOre", "ironOre", "titaniumOre", "tungstenOre", "diamond", "iridium", "stellarIron", "adamant", "singularityShard"];
const BOT_UP_COST = () => niceRound(150 * Math.pow(1.55, state.botLv));
const BOT_UP_MATS = () => { const o = {}; o[BOT_UP_MATS_LIST[Math.min(BOT_UP_MATS_LIST.length - 1, Math.floor(state.botLv / 5))]] = Math.ceil(20 * Math.pow(1.18, state.botLv % 5 + Math.floor(state.botLv / 5) * 2)); return o; };
const botMul = () => (1 + 0.12 * state.botLv) * crewMul() * (sk("d_bot") ? 1.3 : 1) * (1 + (typeof artVal === "function" ? artVal("bot") : 0)) * (1 + 0.25 * (state.botCore || 0)) * (sk("d_grandfleet") ? 2 : 1) * (sk("d_ultimate") ? 3 : 1);   // 艦隊総攻撃 (奥義): 全ボット威力 ×2 / 惑星破壊艦隊 (究極): ×3
// ---------- 衛星テクノロジー (ボット強化) ----------
const BOT_CORE_MAX = 5, BOT_ARMOR_MAX = 5;
const BOT_CORE_MATS  = [{ magmalite:60 }, { permaice:60, toxicite:40 }, { prismore:70 }, { voltore:70, duneglass:40 }, { novalite:90 }];
const BOT_ARMOR_MATS = [{ magmalite:50 }, { permaice:50 }, { relicstone:60 }, { abyssite:60 }, { novalite:70 }];
const BOT_CORE_COST  = lv => niceRound(80000 * Math.pow(3.5, lv));
const BOT_ARMOR_COST = lv => niceRound(60000 * Math.pow(3.2, lv));

// ---------- 回収ボットの装備 (モジュール) ----------
/* key: { name, icon, accent, max, cost(lv), mats(lv), eff(lv) 説明, tagline, desc } */
const scaleRec = (rec, lv, step) => { const o = {}; for (const k in rec) o[k] = Math.ceil(rec[k] * Math.pow(step, lv)); return o; };
const CB_MODULES = {
  coil:   { name:"磁気コイル",     icon:"magnet",  accent:"#8fd3ff", max:30, base:120, cstep:1.5, mats:{ magnetite:30, copperOre:30 }, mstep:1.22,
            tagline:"吸い寄せる力を、巻き上げる。", desc:"磁鉄鉱を巻いたコイル。コインを引き寄せる吸引範囲が広がる。",
            eff: lv => `吸引範囲 +${lv * 12}%` },
  frame:  { name:"軽合金フレーム", icon:"speed",   accent:"#d8e0e8", max:30, base:150, cstep:1.5, mats:{ bauxite:30, titaniumOre:10 }, mstep:1.22,
            tagline:"軽くなれば、速くなる。", desc:"アルミとチタンの骨格。機体が軽くなり、移動速度が上がる。",
            eff: lv => `移動速度 +${lv * 10}%` },
  plating:{ name:"金メッキ",       icon:"coin",    accent:"#ffd60a", max:20, base:300, cstep:1.6, mats:{ goldOre:20 }, mstep:1.3,
            tagline:"金は金を呼ぶ。", desc:"機体を金で覆う。回収ボットが拾ったコインの額が増える。",
            eff: lv => `ボット回収コイン +${lv * 5}%` },
  hatch:  { name:"拡張ハッチ",     icon:"bag",     accent:"#c0c0c0", max:10, base:200, cstep:1.7, mats:{ ironOre:40, zincOre:20 }, mstep:1.3,
            tagline:"大きく開けて、まとめて飲み込む。", desc:"回収口を広げる。すれ違うだけで拾える接触範囲が広がる。",
            eff: lv => `接触回収の範囲 +${lv * 20}%` },
  scanner:{ name:"鉱物スキャナ",   icon:"eye",     accent:"#9be15d", max:10, base:400, cstep:1.7, mats:{ quartz:30, silverOre:20 }, mstep:1.3,
            tagline:"コインの下に、何かが埋まっている。", desc:"回収ボットがコインを拾うとき、その場所の地層の素材を一緒に見つけてくる。",
            eff: lv => `コイン回収時 ${lv * 4}% で素材 +1` },
  nozzle: { name:"推進ノズル",     icon:"flame",   accent:"#ff9346", max:5, base:500, cstep:2, mats:{ sulfur:40, magma:20 }, mstep:1.5,
            tagline:"遠いコインほど、急いで取りに行く。", desc:"硫黄とマグマで燃える補助ブースター。目標まで400以上離れているときの速度が上がる。",
            eff: lv => `長距離ブースト +${lv * 30}%` },
  replicator:{ name:"複製回路",    icon:"twin",    accent:"#80ffc0", max:3, base:2000, cstep:5, mats:{ silicon:60, lithium:40 }, mstep:2,
            tagline:"ひとつ作れば、もうひとつ生まれる。", desc:"シリコンとリチウムの自己複製回路。回収ボットが1機おまけで加わる。",
            eff: lv => `回収ボット +${lv}機` },
  interest:{ name:"利息回路",      icon:"clock",   accent:"#e8f0f8", max:10, base:1500, cstep:1.8, mats:{ platinumOre:30, silverOre:50 }, mstep:1.3,
            tagline:"待てば、増える。", desc:"地面に落ちてから2秒以上たったコインは、回収ボットが拾うと利息がつく。",
            eff: lv => `落ちて2秒以上のコイン +${lv * 10}%` },
  gravLens:{ name:"重力レンズ",    icon:"hole",    accent:"#c792ff", max:5, base:1e5, cstep:2.5, mats:{ helium3:40, darkMatter:20 }, mstep:1.5,
            tagline:"空間ごと、引き寄せる。", desc:"ヘリウム3と暗黒物質で空間を曲げる。吸引範囲と吸引力が大きく伸びる。",
            eff: lv => `吸引範囲 +${lv * 40}%・吸引力 +${lv * 30}%` },
  anchor: { name:"時空アンカー",   icon:"warp",    accent:"#40e0d0", max:1, base:1e6, cstep:1, mats:{ chronite:80 }, mstep:1,
            tagline:"歩かない。跳ぶ。", desc:"クロナイトの錨。目標まで800以上離れていると、その手前へ瞬間移動する。",
            eff: lv => lv ? "ワープ稼働中" : "ワープ" },
  stargate:{ name:"星核ワープコア", icon:"warp",   accent:"#fff2b0", max:3, base:3e5, cstep:3, mats:{ novalite:30, nereidpearl:20 }, mstep:1.8,
            tagline:"星の核で、距離を消す。", desc:"ノヴァライトの核で空間を折り畳む。吸引が大きく伸び、ワープの距離制限も緩む (アンカーなしでもワープできる)。",
            eff: lv => `吸引範囲 +${lv * 30}%・吸引力 +${lv * 50}%・ワープ距離 -${lv * 150}` },
};
const CB_MOD_KEYS = Object.keys(CB_MODULES);
const cbLv      = k => state.cbMod[k] || 0;
const CB_COST   = k => { const m = CB_MODULES[k]; return niceRound(m.base * Math.pow(m.cstep, cbLv(k))); };
const CB_MATS   = k => { const m = CB_MODULES[k]; return scaleRec(m.mats, cbLv(k), m.mstep); };
const canUpgradeCB = k => state.coinBots > 0 && cbLv(k) < CB_MODULES[k].max && state.coins >= CB_COST(k) && invHas(CB_MATS(k));
const coinBotSpeed  = () => 300 * (1 + 0.10 * cbLv("frame")) * (sk("d_drone") ? 1.2 : 1) * (sk("c_fleet") ? 1.15 : 1);
const coinBotVacuum = () => 180 * (1 + 0.12 * cbLv("coil")) * (1 + 0.4 * cbLv("gravLens")) * (1 + 0.3 * cbLv("stargate")) * (sk("c_fleet") ? 1.2 : 1);
const coinBotPull   = () => 3200 * (1 + 0.3 * cbLv("gravLens")) * (1 + 0.5 * cbLv("stargate"));
const coinBotTouchR = () => 40 * (1 + 0.2 * cbLv("hatch"));
const botCoinMul    = () => 1 + 0.05 * cbLv("plating");
const cbScanChance  = () => 0.04 * cbLv("scanner");
const cbNozzle      = () => 1 + 0.3 * cbLv("nozzle");
const cbInterest    = () => 0.10 * cbLv("interest");
