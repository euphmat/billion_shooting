"use strict";
/* =========================================================
   game/dungeon.js - ダンジョン固有効果の入退室検知とバナー
   ========================================================= */

// ---------- ダンジョン固有効果: 入退室の検知と HUD バナー ----------
let curBodyIdx = -2;   // 前回判定した天体 (bodyAt の返り値)。-2 は未判定
let ftSilent = false;   // ファストトラベル直後はバナー側のトーストを抑える (移動トーストと重ねない)
const dfxEl = { box: $("dungeonFx"), name: $("dfxName"), desc: $("dfxDesc"), body: $("dfxBody") };
function updateDungeonBanner(){
  const b = bodyAt(w2g(player.x), w2g(player.y));
  if (b === curBodyIdx) return;
  const prevFx = curBodyIdx > 0 ? SATS[curBodyIdx - 1].fx : null;
  curBodyIdx = b;
  const S = b > 0 ? SATS[b - 1] : null, fx = S ? S.fx : null;
  if (fx){
    const si = b - 1;
    if (!state.visitedBodies.includes(si)){ state.visitedBodies.push(si); save(); }   // 訪問記録 (ファストトラベル用)
    dfxEl.name.textContent = fx.name;
    dfxEl.desc.textContent = fx.desc;
    dfxEl.body.textContent = S.ultra ? `【最難関 #${S.rank}】${S.name}` : S.name;
    dfxEl.box.classList.toggle("ultra", !!S.ultra);
    dfxEl.box.classList.add("show");
    if (S.ultra && !ftSilent) toast(`最難関ダンジョン「${S.name}」に突入。ブロックの硬さは異次元だ`, "good");
    ftSilent = false;   // 入ったことは画面下のバナーが常時示すので、通知ログには出さない
  } else {
    dfxEl.box.classList.remove("show");
    if (prevFx) toast("ダンジョンを出た");
  }
}
