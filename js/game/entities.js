"use strict";
/* =========================================================
   game/entities.js - 実行時のエンティティ (自機・弾・コイン・演出の配列) と後片付け
   ========================================================= */

// ---------- entities ----------
const SW = (window.SAVED && SAVED.world) || null;   // セーブされた世界の状態 (store.js が起動時に読む)
const player = { x: SW && isFinite(SW.px) ? SW.px : (R + 4) * BS, y: SW && isFinite(SW.py) ? SW.py : 0, vx:0, vy:0, angle:-Math.PI/2, fireT:0 };
const keys = {};
// スマホのバーチャルスティック (mobile.js が書き込む)。mag は 0〜1 のアナログ量
const touchAxis = { x:0, y:0, mag:0, on:false };
/* ---------- 超高速移動 (ブースト): PC = スペース長押し / スマホ = トグルボタン ----------
   倍率の根拠: 天体間の表面距離は最寄りでも約12,000px・典型約27,000px (実測)。
   通常速度 270 の ×6 (1,620) では最寄りでも 7 秒超かかるため、「数秒で隣の天体圏」を
   満たす ×10 (2,700 → 最寄り約 4.4 秒 / 典型約 10 秒) を採用。手動入力の間だけ効き、
   オートパイロット (放置移動) には効かない。 */
const BOOST_MUL = 10;
let boostKey = false;        // スペース押下中 (PC)
let boostTouchOn = false;    // スマホのトグル (mobile.js が切り替える。セッション内のみ保持)
let boostOn = false;         // このフレーム実際にブースト中か (描画とボットの追いつきが参照)
// 自機の軌跡 (新しい順)。ブースト中の追従ボットは、ここを一列になって辿る (自機が掘った通路の中を通るので壁に埋まらない)
const BOOST_TRAIL_GAP = 22;        // 隊列の間隔 (ワールド単位)
const boostTrail = [];
function recordBoostTrail(){
  const last = boostTrail[0];
  if (last){
    const dx = player.x - last.x, dy = player.y - last.y;
    if (dx * dx + dy * dy > BS * 8 * BS * 8) boostTrail.length = 0;   // ワープ・リスポーンなどの瞬間移動では軌跡を切る
    else if (dx * dx + dy * dy < 36) return;                          // 6 単位ごとに記録
  }
  boostTrail.unshift({ x: player.x, y: player.y });
  if (boostTrail.length > 600) boostTrail.length = 600;
}
// 自機から軌跡に沿って dist だけ戻った地点 (軌跡が足りなければ一番古い点。軌跡が無ければ自機の真後ろ)
function trailPoint(dist){
  let px = player.x, py = player.y;
  for (const q of boostTrail){
    const d = Math.hypot(q.x - px, q.y - py);
    if (d >= dist){ const t = dist / d; return { x: px + (q.x - px) * t, y: py + (q.y - py) * t }; }
    dist -= d; px = q.x; py = q.y;
  }
  if (boostTrail.length) return { x: px, y: py };
  return { x: player.x - Math.cos(player.angle || 0) * dist, y: player.y - Math.sin(player.angle || 0) * dist };
}
// 隊列の速度: 自機の今の速さ + 離れている分の追いつき (約0.15秒で隊列に戻る)
const convoySpeed = d => Math.hypot(player.vx || 0, player.vy || 0) * 1.1 + 300 + d * 7;
const boostGhosts = [];      // 残像 {x, y, a, t} (最大14)
const boostParts = [];       // 噴射パーティクル {x, y, vx, vy, t, life} (最大90)
let boostGhostT = 0, boostPartT = 0;
// 噴射の光: 事前レンダリング済みスプライト (奥義と同じ流儀で毎フレーム描き直さない)
const boostFlameSpr = (() => {
  const c = document.createElement("canvas"); c.width = c.height = 32;
  const g = c.getContext("2d");
  const rg = g.createRadialGradient(16, 16, 0, 16, 16, 15);
  rg.addColorStop(0, "rgba(255,255,255,.95)"); rg.addColorStop(0.35, "rgba(125,249,255,.75)"); rg.addColorStop(1, "rgba(125,249,255,0)");
  g.fillStyle = rg; g.beginPath(); g.arc(16, 16, 15, 0, 7); g.fill();
  return c;
})();
// スペースの押下/解放をブーストに結ぶ。入力欄にフォーカスがある時は文字入力を優先し、
// ゲーム側では扱わない (マップ検索の M キーと同じ流儀)。解放は常に対象外でも止める (押しっぱなしの取り残し防止)
function boostSpaceEvent(e, down){
  if (!e || e.code !== "Space") return;
  if (!down){ boostKey = false; return; }
  const tag = e.target && e.target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
  if (e.preventDefault) e.preventDefault();   // ページスクロールと、フォーカス中ボタンのスペース再押下を止める
  boostKey = true;
}
const bullets = [];   // {x,y,vx,vy,idx,dmg,splash,life}
const coinsArr = [];  // {x,y,vx,vy,value}
const flashes = new Map(); // idx -> timestamp
const bots = [];      // {x,y,angle,fireT,tx,ty,retargetT}
const beams = [];     // laser / beam visuals {x1,y1,x2,y2,t,w}
const rings = [];     // aura visuals {x,y,r,t}
const bursts = [];    // 破壊バースト {x,y,c,c2,style,t,seed}
function burstAt(x, y, fx, mat){
  if (fxBurstBudget <= 0 || bursts.length >= MAX_BURSTS || !onScreen(x, y, BS * 2)) return;
  fxBurstBudget--;
  bursts.push({ x, y, c: fx ? fx.accent : (mat ? mat.color : "#ffffff"), c2: fx && fx.c2 ? fx.c2 : "#ffffff", style: fx && fx.burst ? fx.burst : "shard", t: nowMs, seed: Math.random() * 10, sc: fx && fx.evo ? 1 + 0.14 * fx.evo : 1 });   // sc: 覚醒 (★) で着弾が大きく弾ける
}
const labels = [];    // 浮かぶ文字 (+1 鉄鉱石 など) {x,y,text,color,chip,w,fs,t,rare}
const dmgLabels = []; // ダメージ数値 {x,y,text,color,fs,t} (プールで使い回す)
const dmgPool = [];
const dmgAcc = new Map();   // idx -> {x,y,total,crit,max} 命中ごとに貯めて 0.15秒ごとにまとめて表示 (大量ヒット対策)
const dmgEntryPool = [];
const MAX_BEAMS = 160, MAX_RINGS = 48, MAX_BURSTS = 60, MAX_LABELS = 12;   // 同時に出す演出の上限
const MAX_DMG_LABELS = 28, DMG_LABEL_TTL = 720;   // ダメージ数値の上限と表示時間(ms)
let dmgCritFlag = false;   // いま処理中の命中がクリティカルか (弾の命中経路が立てる)
let dmgVoidFlag = false;   // 虚無の単眼のクリティカルか (紫の特大ダメージ数字 + バースト用)
const MAT_LABEL_FONT = fs => `700 ${fs}px "Hiragino Kaku Gothic ProN","Yu Gothic",system-ui,sans-serif`;
const DMG_FONT = fs => `800 ${fs}px ui-monospace,"SF Mono",Menlo,Consolas,monospace`;
const DMG_GRID_X = [0, -1, 1, 0, -1, 1, 0, -1], DMG_GRID_Y = [0, 1, 1, 2, 3, 3, 4, 5];   // ダメージ同士が重ならないための配置格子 (列, 行)
// 素材色が暗すぎると黒背景で読めないので、文字用に白へ寄せて明るくする (作成時に1回だけ計算)
function labelTextColor(m){
  const lum = 0.2126 * m.r + 0.7152 * m.g + 0.0722 * m.b;
  if (lum >= 150) return m.color;
  const k = Math.min(0.62, (150 - lum) / 255 + 0.25);
  const c = v => Math.round(v + (255 - v) * k);
  return `rgb(${c(m.r)},${c(m.g)},${c(m.b)})`;
}
const MAX_COINS = 700;   // 場に出すコインの上限 (画面がコインで埋まらないように)。超えた分は既存のコインに額を上乗せする (合計額は変わらない)
let nowMs = performance.now();   // フレーム開始時刻 (命中のたびに performance.now() を呼ばない)

/* ---------- 演出の量 (フレーム予算) ----------
   大量破壊の最中は、連鎖スキルがリング・ビーム・破片を1フレームに何百個も積み、画面がうるさく重くなっていた。
   新しく積める数をフレームごとに制限し、画面外の演出は最初から積まない。
   ダメージや報酬など実際の効果には一切影響しない (見た目だけ)。
   設定の「演出を控えめにする」(state.fxLow) で、さらに絞る。 */
const FX_BUDGET = {
  normal: { rings: 5, beams: 28, bursts: 8 },
  low:    { rings: 2, beams: 10, bursts: 3 },
};
let fxRingBudget = 0, fxBeamBudget = 0, fxBurstBudget = 0;
const fxLow = () => !!state.fxLow;
function resetFxBudget(){
  const b = FX_BUDGET[fxLow() ? "low" : "normal"];
  fxRingBudget = b.rings; fxBeamBudget = b.beams; fxBurstBudget = b.bursts;
}
// ワールド座標 (x, y) が画面内 (+余白 margin) にあるか。自機は常に画面中央
function onScreen(x, y, margin){
  const hw = CW / 2 / zoom + margin, hh = CH / 2 / zoom + margin;
  return Math.abs(x - player.x) <= hw && Math.abs(y - player.y) <= hh;
}
// リング演出 {x, y, r, color?, dur?}。開始時刻はフレーム時刻に揃える (描画側の経過時間が負にならない)
function addRing(o){
  if (fxRingBudget <= 0 || rings.length >= MAX_RINGS || !onScreen(o.x, o.y, o.r)) return;
  fxRingBudget--;
  o.t = nowMs;
  rings.push(o);
}
// ビーム / 稲妻 / レーザーの線 {x1, y1, x2, y2, w, color, zig?, life?}
function addBeam(o){
  if (fxBeamBudget <= 0 || beams.length >= MAX_BEAMS) return;
  if (!onScreen(o.x1, o.y1, 60) && !onScreen(o.x2, o.y2, 60)) return;
  fxBeamBudget--;
  o.t = nowMs;
  beams.push(o);
}
// コインを配列から外す。順番は保たず、末尾と入れ替えて O(1) で消す (逆順ループの中で使う前提)
function removeCoinAt(j){
  coinsArr[j].gone = true;
  const tail = coinsArr.pop();
  if (j < coinsArr.length) coinsArr[j] = tail;
}

// HUD (DOM) の更新は重いので、コインを拾うたびではなく、まとめて最大 10回/秒 にする
let hudDirty = false, hudT = 0;

/* ---------- コインの発生 ----------
   場のコインは MAX_COINS 枚まで。超えた分は近くの (無ければ任意の) 既存コインに額を上乗せするので、
   合計額は変わらない。宝箱・お宝・ドロップなど、コインを出す処理は全てここを通す
   (以前は上限を素通りする経路があり、終盤に 8,000 枚を超えて重くなっていた) */
function spawnCoin(c){
  if (coinsArr.length < MAX_COINS){ coinsArr.push(c); return; }
  if (c.dup){ addCoins(c.value); hudDirty = true; return; }   // こぼれコイン (複製) は上限時はその場で受け取る (複製の再発動を起こさない)
  let best = null, bd = 160 * 160;
  for (let k = 0; k < 24; k++){   // 総当たりはしない: ランダムに数枚見て、近いものに寄せる
    const o = coinsArr[(Math.random() * coinsArr.length) | 0];
    if (o.dup || o.gone) continue;
    const dx = o.x - c.x, dy = o.y - c.y, d2 = dx * dx + dy * dy;
    if (d2 < bd){ bd = d2; best = o; }
  }
  if (!best) best = coinsArr[(Math.random() * coinsArr.length) | 0];
  best.value += c.value;
  best.n = (best.n || 1) + (c.n || 1);
}

// ---------- 弾・演出の後片付け ----------
// 弾は順番を保たず末尾と入れ替えて消す (splice の詰め直しをしない)
function removeBulletAt(i){
  const tail = bullets.pop();
  if (i < bullets.length) bullets[i] = tail;
}
// 寿命切れのビーム / リングを一度に詰め、上限を超えた古いものも捨てる
function pruneFx(now){
  let w = 0;
  for (let i = 0; i < beams.length; i++){ const b = beams[i]; if (now - b.t <= (b.life || 60)) beams[w++] = b; }
  beams.length = w;
  if (w > MAX_BEAMS) beams.splice(0, w - MAX_BEAMS);
  w = 0;
  for (let i = 0; i < rings.length; i++){ const r = rings[i]; if (now - r.t <= (r.dur || 350)) rings[w++] = r; }
  rings.length = w;
  if (w > MAX_RINGS) rings.splice(0, w - MAX_RINGS);
  w = 0;
  for (let i = 0; i < bursts.length; i++){ const b = bursts[i]; if (now - b.t <= 420) bursts[w++] = b; }
  bursts.length = w;
  w = 0;
  for (let i = 0; i < labels.length; i++){ const l = labels[i]; if (now - l.t <= 1100) labels[w++] = l; }
  labels.length = w;
  w = 0;
  for (let i = 0; i < dmgLabels.length; i++){ const d = dmgLabels[i]; if (now - d.t <= DMG_LABEL_TTL) dmgLabels[w++] = d; else dmgPool.push(d); }
  dmgLabels.length = w;
}
