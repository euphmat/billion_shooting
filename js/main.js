"use strict";
/* =========================================================
   main.js - 起動 (全ファイルを読み終えた後に最後に実行する)
   ========================================================= */

// 前回のプレイで主惑星を破壊し尽くしていた (エンディング未見の場合だけ、演出なしで結果画面を出す)
if (mainAlive <= 0 && !state.endingSeen) gameClear(true);

resize(); renderPanels(true); updateHUD();
requestAnimationFrame(t => { last = t; requestAnimationFrame(frame); });
