"use strict";
/* =========================================================
   game/persist.js - 世界の保存 (破壊ビットマップの差分書き込み)
   ========================================================= */

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
    [ST_KV, [["world", { alive, mainAlive, ix, hp, chests:[...openedChests], px:player.x, py:player.y, zoom, cleared }]]],
  ]);
}
// タブを離れる / 閉じるときは取りこぼさないよう即保存する
const flushAll = () => { saveNow(); flushWorld(true); };
document.addEventListener("visibilitychange", () => { if (document.hidden) flushAll(); });
window.addEventListener("pagehide", flushAll);
