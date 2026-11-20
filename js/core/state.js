"use strict";
/* =========================================================
   core/state.js - セーブ対象の状態 (state) と保存処理。起動時に古いセーブを正規化する
   ========================================================= */

// ---------- save / state ----------
const SAVE_KEY = "billion_shooting_save_v2";
const OLD_SAVE_KEY = "million_shooting_save_v1";
const GAME_VERSION = APP_VERSION;   // 現在のゲームバージョン (js/manifest.js が定義元。アップデート履歴の未読判定に使う)
const state = {
  coins: 0, totalCoins: 0, destroyed: 0,
  weapon: "handDrill",
  weaponsOwned: { handDrill:true },
  weaponLv: {},
  bots: 0, coinBots: 0, botLv: 0, botMode: "follow", cbMode: "follow",
  botLoadout: [],   // 攻撃ボットの装備 (スロット番号 -> 装備キー。無いスロットは標準装備)
  cbMod: {},        // 回収ボットの装備 (モジュールキー -> レベル)
  inv: {}, seen: {},   // 素材の所持数 / 発見済み
  crafted: 0,
  muted: false,
  fxLow: false,      // 演出を控えめにする (リング・破片・ダメージ数値・スピードラインを絞る)
  atkMuted: false,   // 攻撃・破壊音だけオフ (発射/破壊/爆発チャンネル。他の効果音と全体ミュートとは独立)
  xp: 0, lv: 1, skills: {},
  artifacts: {},   // 所持アーティファクト {id: 1}
  botCore: 0, botArmor: 0,   // 衛星テクノロジー (攻撃ボット兵装コア / 自機の衛星装甲)
  hp: 100,   // 自機HP (最大値はレベルで伸びる: playerMaxHP)
  off: {},   // 停止中の仲間 { bots:true, ... }
  visitedBodies: [],   // 訪問済みダンジョン (SATS のインデックス。ファストトラベルの解放条件)
  lastSeenUpdate: 0,   // アップデート履歴を最後に見たバージョン
  endingSeen: false,   // エンディング (主惑星の破壊完了) を見たか。自動再生は1回だけ
  playTime: 0,   // 累計プレイ時間 (秒)。エンディングの統計表示用
};
const SAVE_FIELDS = ["coins", "totalCoins", "destroyed", "weapon", "weaponsOwned", "weaponLv", "bots", "coinBots", "botLv",
  "botLoadout", "cbMod", "inv", "seen", "crafted", "muted", "atkMuted", "fxLow", "xp", "lv", "skills", "off", "hp", "artifacts", "botCore", "botArmor", "botMode", "cbMode", "visitedBodies", "lastSeenUpdate", "endingSeen", "playTime"];
let migrated = false;
try {
  // 本番の置き場所は IndexedDB (store.js が起動時に読み終えている)。
  // 無ければ旧 localStorage のセーブを引っ越す (初回だけ)
  let s = (window.SAVED && window.SAVED.state) || null;
  if (!s){
    s = JSON.parse(localStorage.getItem(SAVE_KEY) || "null");
    if (!s){
      // 旧バージョン (コイン購入制) のセーブからは、進行度だけ引き継ぐ。装備・スキルは作り直す
      const o = JSON.parse(localStorage.getItem(OLD_SAVE_KEY) || "null");
      if (o) s = { coins:o.coins, totalCoins:o.totalCoins, destroyed:o.destroyed, lv:o.lv, xp:o.xp, muted:o.muted };
    }
    if (s) migrated = true;
    try { localStorage.removeItem(SAVE_KEY); localStorage.removeItem(OLD_SAVE_KEY); } catch(e){}
  }
  if (s) for (const k of SAVE_FIELDS) if (s[k] !== undefined) state[k] = s[k];
} catch(e){}
/* 破壊数は「惑星の実状」そのものなので、小さいセーブ (kv:state) ではなく
   惑星側のセーブ (kv:world の alive) から必ず導く。
   両者は書き込み周期が違うので、別々に持つとリロード後に数個ズレてしまう。
   旧 localStorage からの引っ越しでも、惑星は手つかず = destroyed 0 になって正しい */
state.destroyed = TARGET_TOTAL - alive;

const isObj = v => v && typeof v === "object" && !Array.isArray(v);
// 自機の最大HP: レベルで伸びる (アーティファクト等はここに倍率が掛かる)
const playerMaxHP = () => Math.round((100 + (state.lv - 1) * 30) * (1 + (typeof artVal === "function" ? artVal("hp") : 0)));
for (const k of ["weaponLv", "cbMod", "inv", "seen", "skills", "off", "weaponsOwned", "artifacts"]) if (!isObj(state[k])) state[k] = {};
state.botLv |= 0; state.bots |= 0; state.coinBots |= 0; state.crafted |= 0;
state.lv = Math.max(1, state.lv | 0); state.xp = Math.max(0, +state.xp || 0);
state.coins = Math.max(0, +state.coins || 0); state.totalCoins = Math.max(0, +state.totalCoins || 0);
if (!Array.isArray(state.botLoadout)) state.botLoadout = [];
if (!Array.isArray(state.visitedBodies)) state.visitedBodies = [];
state.visitedBodies = state.visitedBodies.filter(i => Number.isInteger(i) && i >= 0 && i < SATS.length);
state.lastSeenUpdate = Math.max(0, state.lastSeenUpdate | 0);
state.endingSeen = !!state.endingSeen;
state.fxLow = !!state.fxLow;
state.playTime = Math.max(0, +state.playTime || 0);
for (const k of Object.keys(state.inv)) if (!MAT[k]) delete state.inv[k];
// 稼働中の数 (OFFにした種類は0として扱う。所持数 state[k] はそのまま)
const act = k => state.off[k] ? 0 : state[k];
/* save() はクラフト・強化・スキル取得など至る所から呼ばれるので、
   300ms にまとめて IndexedDB へ 1回だけ書く (構造化クローンなので JSON 化は不要)。
   書き込み自体は非同期なのでゲームループは待たない */
let saveTimer = 0;
const stateSnapshot = () => { const o = {}; for (const k of SAVE_FIELDS) o[k] = state[k]; return o; };
function saveNow(){
  if (saveTimer){ clearTimeout(saveTimer); saveTimer = 0; }
  SaveDB.put(ST_KV, [["state", stateSnapshot()]]);
}
function save(){
  if (saveTimer) return;
  saveTimer = setTimeout(() => { saveTimer = 0; SaveDB.put(ST_KV, [["state", stateSnapshot()]]); }, 300);
}
// セーブを全部消す (設定の「最初から」ボタン用)
function wipeSave(){
  if (saveTimer){ clearTimeout(saveTimer); saveTimer = 0; }
  try { localStorage.removeItem(SAVE_KEY); localStorage.removeItem(OLD_SAVE_KEY); } catch(e){}
  return SaveDB.clearAll();
}
if (migrated) saveNow();   // localStorage からの引っ越し分をすぐ IndexedDB へ
