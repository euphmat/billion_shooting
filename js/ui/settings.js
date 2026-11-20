"use strict";
/* =========================================================
   ui/settings.js - 設定ポップアップとアップデート履歴
   ========================================================= */

/* ---------- settings popup ---------- */
const settingsOverlay = $("settingsOverlay");
$("gearBtn").addEventListener("click", () => { $("soundToggle").checked = !state.muted; $("atkSndToggle").checked = !state.atkMuted; $("fxLowToggle").checked = !!state.fxLow; settingsOverlay.classList.add("open"); });
$("settingsClose").addEventListener("click", () => settingsOverlay.classList.remove("open"));
settingsOverlay.addEventListener("click", e => { if (e.target === settingsOverlay) settingsOverlay.classList.remove("open"); });
window.addEventListener("keydown", e => { if (e.key === "Escape") settingsOverlay.classList.remove("open"); });
$("soundToggle").addEventListener("change", e => { state.muted = !e.target.checked; save(); syncAudioActive(); if (!state.muted) sndBuy(); });
$("fxLowToggle").addEventListener("change", e => { state.fxLow = !!e.target.checked; save(); });
$("atkSndToggle").addEventListener("change", e => { state.atkMuted = !e.target.checked; save(); if (!state.atkMuted) sndBuy(); });
$("resetBtn").addEventListener("click", () => {
  if (confirm("セーブを削除して最初からにしますか？")) wipeSave().then(() => location.reload());
});

/* ---------- アップデート履歴 ---------- */
let updOpen = false;
// 新しい順。行を足すときは先頭に追加し、js/manifest.js の APP_VERSION を上げる
const UPDATE_HISTORY = [
  { v:92, text:"武器の「覚醒」を追加: 強化 Lv5 / 10 / 20 / 30 / 50 で ★1〜★5 に覚醒し、★ごとに威力 +15%。さらに武器ごとの覚醒特性 (貫通・跳弾・連鎖・同時照射・範囲・会心・燃焼・処刑など、全137種それぞれの持ち味) が伸び、弾は光をまとい→残像→光の衛星→二色の光冠→虹のオーロラへと化ける。ビーム・オーラ・着弾・銃口の閃光も★で派手に / スキルツリーに「系統マスタリー」を追加: 同じ系統のスキルを 3 / 7 / 12 / 18 / 25 / 34 個習得するとランクアップし、破壊=全ダメージ (最大×3)・元素=状態異常ダメージと付与率・財宝=コインと経験値・艦隊=仲間の威力と移動速度・採掘=素材ドロップが大きく伸びる。ランクを持つ系統の光球が自機のまわりを公転する / スキル習得の瞬間にノードが弾ける演出、詳細に「次のランクまであと何個」を表示" },
  { v:91, text:"右の工房パネルを全面リニューアル: ヘッダーをコンパクトにして一覧を広く / タブをアイコン+「今買えるもの」の件数バッジに / 新タブ「おすすめ」で今すぐできること (製作・ボット・モジュール・より強い武器への持ち替え) と次の目標を1画面に集約、「すべて1回ずつ」まとめ買いも / 武器は1行1武器の一覧になり、右端のボタンで製作・強化、行を押すと詳細 / 武器・素材に検索欄 (日本語入力対応) / 素材の絞り込みをプルダウンに整理 / ボットの作戦モードをセグメント切替に / コインの獲得ペース (毎秒) を表示 / 検索欄に文字を打っても自機が動かないように" },
  { v:90, text:"大規模な整理と快適化: 強化を重ねた終盤の重さを解消 (連鎖スキルの余波を数フレームに分けて処理・演出の量に上限) / ブーストで斜めの壁をすり抜ける不具合を修正 / 画面中央の大きな文字通知を廃止し、左下の小さな通知ログに変更 / スキル発動の場所にスキル名を小さく表示 / 設定に「演出を控えめにする」を追加 / ダンジョン効果のバナーを画面下に常時表示 / 工房のステージを開閉式に (そろったステージは畳む) / 強化の節目ボーナスを全装備共通の「Lv10ごとに威力+50%」に統一し、DPS表示にも反映 / 序盤の装備レシピとハンドドリルの強化素材を、地表で実際に集まる量に合わせて緩和" },
  { v:89, text:"究極スキル5種を追加 (各1000SP): 惑星消滅プロトコル (全ダメ×3＋45秒ごとに半径24を消し飛ばす消滅砲撃) / ビッグバン元素炉 (付与率+50pt・状態ダメ×5・元素新星) / 無限黄金郷 (コイン×5・XP×3・素材×3・黄金化×100) / 惑星破壊艦隊 (巨大母艦の惑星破壊ビーム・全ボット×3) / 星喰い・真 (半径3追加破壊＋解体波)。そしてエンディング実装: 主惑星のブロックを全て壊すとシネマティックとエンディング画面が流れ、タイトルにクリアバッジが付く (その後もエンドレスで遊べる)" },
  { v:88, text:"工房の最上部に「一括強化 (強い順)」ボタンを追加 (強い武器から順に、買える限りまとめて強化・見込み回数つき)" },
  { v:87, text:"コイン同士の引き合う力を付けた (約4ブロック以内のコインが寄り集まって合体しやすくなった)" },
  { v:86, text:"素材払いに使える素材を、その武器の製作に使う素材だけに限定した (内訳表示も「製作素材払い」に変更)" },
  { v:85, text:"コインの色が額面で10段階に変わるようにした (銅→赤銅→銀→プラチナ→金→濃金→エメラルド→サファイア→アメジスト→虹・合体で段階が上がるとリング表示)" },
  { v:84, text:"落ちたコインが密集すると合体して大きなコインになるようにした (総額はそのまま・額が大きいほど豪華に・描画も軽く)" },
  { v:83, text:"素材で支払う時は強化ボタンにも素材のアイコンを表示するようにした (全額素材払いではコイン表示なし・混合払いは両方表示)" },
  { v:82, text:"武器強化で素材を代用払いできるようにした (1素材=1コイン・所持数の多い素材から優先使用・支払い内訳を表示)" },
  { v:81, text:"超高速移動を追加：PCはスペースキー長押し、スマホは高速移動トグルボタン (通常の10倍速・残像と噴射の演出つき)" },
  { v:80, text:"スキルツリーに奥義15種を追加 (全165種・各系統に100/200/300SPの最終スキル：ファンネル/オービタルボット/軌道砲撃など) ・ ファストトラベル強化 (検索/リスト/ホーム＆リターン) ・ 画面シェイクを全廃止 ・ 設定に攻撃/破壊音のオフを追加" },
  { v:79, text:"拡大マップで重なっていたダンジョン名のラベルが重ならないように調整 (4組)" },
  { v:78, text:"アーティファクトの発動を左上のフィードに表示 (発動カウンタ付き) ・ 工房に武器フィルタを追加 (未製作のみ/製作可能のみ/所持済みのみ)" },
  { v:77, text:"アーティファクト全60種の効果を強化し、レア度を5段階に整理 (コモン/レア/エピック/レジェンダリー/ミシック・枠に色) ・ スキルの発動が見えるように (発動カウンタ/取得前後の合計値/発動中マーク)" },
  { v:76, text:"スキルツリーの詳細を、クリックしたノードの近くに出るポップオーバーに変更" },
  { v:75, text:"レジェンダリーアーティファクト10種を追加 (全60種に) ・ ボットUI大改修 (装備モーダル/まとめ買い) ・ 状態異常をグラフィカルに表示" },
  { v:74, text:"ファストトラベル (訪問済みダンジョンへ、右下マップから) とアップデート履歴を追加" },
  { v:73, text:"スタート画面の数を実数に修正 (素材168種・装備137種・スキル150種)" },
  { v:72, text:"スマホ・PWA対応 (タッチ操作、ホーム画面に追加して全画面プレイ)" },
  { v:69, text:"発破採掘を追加 (一定数壊すと周囲がまとめて爆砕)" },
  { v:68, text:"元素付与を全武器対応に再編 (お宝ブロック・連破も追加)" },
  { v:65, text:"序盤ダンジョン+10と武器見直し (石灰クラッシャー底上げ)" },
  { v:64, text:"ダンジョン固有効果 (倍率・状態付与) とHUDバナー" },
  { v:63, text:"幻想ダンジョン+10 (妖精の泉〜世界樹の根源)" },
  { v:62, text:"惑星内部ダンジョン+10 (骨の回廊〜惑星の心臓)" },
  { v:61, text:"弾のデザイン一新 (全武器に固有の弾フォームと破壊エフェクト)" },
  { v:60, text:"武器大改修 (全武器に固有の能力を付与)" },
  { v:56, text:"ズーム最適化 (ズームイン/アウトの重さを解消)" },
  { v:55, text:"アクティブスキル廃止 (スキルツリーはパッシブ専用に)" },
];
function renderUpdates(){
  const el = $("updateList"); if (!el) return;
  el.innerHTML = UPDATE_HISTORY.map((u, i) =>
    `<div class="upd-row${i === 0 ? " latest" : ""}"><span class="upd-ver">v${u.v}</span><span class="upd-text">${u.text}</span>${i === 0 ? `<span class="upd-new">NEW</span>` : ""}</div>`).join("");
}
function updateUpdBadge(){
  const b = $("updBadge"); if (b) b.style.display = state.lastSeenUpdate < GAME_VERSION ? "block" : "none";
}
function openUpdates(){
  updOpen = true;
  renderUpdates();
  $("updateOverlay").classList.add("open");
  if (state.lastSeenUpdate < GAME_VERSION){ state.lastSeenUpdate = GAME_VERSION; save(); }
  updateUpdBadge();
}
function closeUpdates(){ updOpen = false; $("updateOverlay").classList.remove("open"); }
$("updateBtn").addEventListener("click", openUpdates);
$("updateClose").addEventListener("click", closeUpdates);
$("updateOverlay").addEventListener("click", e => { if (e.target === $("updateOverlay")) closeUpdates(); });
window.addEventListener("keydown", e => { if (e.key === "Escape") closeUpdates(); });
updateUpdBadge();
