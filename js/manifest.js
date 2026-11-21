"use strict";
/* =========================================================
   manifest.js - バージョンと読み込むファイルの一覧 (ここが唯一の定義元)

   - index.html : APP_STYLES を <link> で、APP_SCRIPTS を SaveDB.boot で読み込む
   - sw.js      : importScripts でこのファイルを読み、同じ一覧をオフライン用に先読みする
   - アップデート履歴の未読判定 (GAME_VERSION) もこの APP_VERSION を使う

   リリースするときは APP_VERSION を上げるだけでよい (キャッシュ破棄の ?v= も全部これに揃う)。
   ファイルを足すときは APP_SCRIPTS の「読み込み順」に注意: 全て通常の <script> と同じく
   グローバルを共有するので、読み込み時に実行されるコードは先に読まれたファイルにしか依存できない。
   ========================================================= */
const APP_VERSION = 100;

const APP_STYLES = ["css/style.css", "css/side.css", "css/mobile.css"];

// store.js だけは index.html が同期で先に読む (セーブを読み終えてから残りを読み込むため)
const APP_BOOT_SCRIPT = "js/core/store.js";

const APP_SCRIPTS = [
  // --- 基盤とマスターデータ ---
  "js/data/materials.js",       // 素材カタログ
  "js/data/planet.js",          // 惑星・天体・ブロックの生成と破壊ビットマップ
  "js/core/format.js",          // 数値表示
  "js/core/state.js",           // セーブ対象の状態
  "js/data/weapons.js",         // 装備
  "js/data/crew.js",            // ボット
  "js/core/stats.js",           // 派生ステータス
  "js/data/evolve.js",          // 武器の覚醒 (★1〜★10)
  "js/data/evo-unique.js",      // 固有覚醒 (武器ごとに1つ・全武器で別物)
  "js/core/audio.js",           // 効果音
  "js/data/skills.js",          // スキルツリーのデータ / レベル
  "js/game/skill-hooks.js",     // スキルの命中時・撃破時フック
  "js/game/skill-early.js",     // 序盤スキル (各系統の内側24種) の効果 ※作業途中: 一部は未実装
  // --- UI (パネル) ---
  "js/ui/common.js",
  "js/ui/notify.js",
  "js/ui/workshop.js",
  "js/ui/crew-panel.js",
  "js/ui/materials-panel.js",
  "js/ui/home-panel.js",
  "js/ui/panels.js",
  "js/ui/settings.js",
  "js/ui/hud.js",
  // --- ゲーム本体 ---
  "js/game/mobs.js",
  "js/game/artifacts.js",
  "js/game/entities.js",
  "js/game/coins.js",
  "js/game/bots.js",
  "js/game/combat.js",
  "js/game/ultra.js",           // 最難関の武器 (超新星 / 流星群 / 銀河斬 / 特異点 / 創世)
  "js/game/physics.js",
  "js/game/dungeon.js",
  "js/game/view.js",
  "js/game/ending.js",
  "js/game/persist.js",
  "js/game/loop.js",
  "js/game/coinbots.js",
  // --- 描画 ---
  "js/render/labels.js",
  "js/render/draw.js",
  "js/render/block-tex.js",     // 素材ごとのブロックのテクスチャ (前計算)
  "js/render/blocks.js",
  "js/render/status-fx.js",
  "js/render/bullets.js",
  "js/render/coin-sprites.js",
  // --- 画面上の UI (キャンバス外) ---
  "js/ui/minimap.js",
  "js/ui/worldmap.js",
  "js/game/skill-fx.js",
  "js/game/machines.js",        // 6系統目「機兵」: 独立稼働する自律機兵 (skill-fx.js の部品を使う)
  "js/ui/skilltree.js",
  "js/ui/mobile.js",
  // --- 起動 (最後) ---
  "js/main.js",
];

const APP_ICONS = ["icons/icon-192.png", "icons/icon-512.png", "icons/maskable-512.png", "icons/apple-touch-icon.png"];

// キャッシュ破棄用のクエリを付けたパス
const appAsset = p => p + "?v=" + APP_VERSION;
