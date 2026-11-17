"use strict";
/* =========================================================
   mobs.js - 衛星惑星のモンスター / 自機HP / 敵の弾
   - モンスターは衛星ごとに生息し、自機が近づいた星の分だけ活動する
   - 倒すとコイン・経験値・たまに看板素材を落とす
   - 自機HP: レベルで伸び、被弾すると減り、しばらく無傷だと回復する
   - HPが0になるとメイン惑星の開始地点で復活 (ペナルティなし)
   ========================================================= */

// 衛星ごとのモンスター種 (SATS と同じ順番)
// mode: 移動AI (chase=接近 / shoot=距離を保つ / charge=溜めて突進)
// atk:  攻撃パターン (spit=単発 / spread=扇状 / burst=連射 / charge系は mode で表現)。全種が何かしら攻撃する
const MOB_TYPES = [
  { name:"マグマスライム",       color:"#ff6a2a", shotColor:"#ff8a3a", r:20, spd:95,  mode:"chase",  atk:"spit",   dmgMul:1.0, hpMul:1.0, shotSpd:330, atkCd:2.6, atkRange:780, shotR:8, shotDmgMul:1.25 },
  { name:"フロストウルフ",       color:"#aef4ff", r:17, spd:170, mode:"charge", dmgMul:0.8, hpMul:0.7, teleT:0.35, dashMul:3.8, dashT:0.34, chargeRange:580, postCd:2.0 },
  { name:"ポイズンスポア",       color:"#7dff4a", shotColor:"#9dff57", r:18, spd:70,  mode:"shoot",  atk:"spit",   dmgMul:0.9, hpMul:0.8, shotSpd:400, atkCd:2.2, shotR:5 },
  { name:"クリスタルゴーレム",   color:"#d9a0ff", shotColor:"#e3b0ff", r:30, spd:55,  mode:"shoot",  atk:"spread", dmgMul:1.6, hpMul:3.2, shotSpd:370, atkCd:3.0, spreadN:5, shotR:5, shotDmgMul:0.75 },
  { name:"レリックガーディアン", color:"#d8b878", shotColor:"#ffd98a", r:22, spd:82,  mode:"shoot",  atk:"burst",  dmgMul:1.1, hpMul:1.6, shotSpd:460, atkCd:2.3, burstN:3, burstGap:0.14, shotR:5 },
  { name:"ディープリーパー",     color:"#7fe8e0", shotColor:"#7fe8e0", r:18, spd:190, mode:"chase",  atk:"spit",   dmgMul:1.2, hpMul:1.1, shotSpd:520, atkCd:1.7, atkRange:700, shotR:4, shotDmgMul:0.8 },
  { name:"ボルトドローン",       color:"#ffe14d", shotColor:"#ffe14d", r:15, spd:135, mode:"shoot",  atk:"burst",  dmgMul:1.0, hpMul:0.9, shotSpd:560, atkCd:2.1, burstN:4, burstGap:0.09, shotR:4, shotDmgMul:0.8 },
  { name:"サンドワーム",         color:"#ffd98a", r:24, spd:105, mode:"charge", dmgMul:1.5, hpMul:1.8, teleT:0.5, dashMul:4.4, dashT:0.45, chargeRange:700, postCd:1.6 },
  { name:"アビスアイ",           color:"#9a6aff", shotColor:"#c09aff", r:21, spd:92,  mode:"shoot",  atk:"spread", dmgMul:1.2, hpMul:1.5, shotSpd:430, atkCd:2.4, spreadN:3, shotR:5 },
  { name:"ノヴァセンチネル",     color:"#fff2b0", shotColor:"#fff2b0", r:27, spd:102, mode:"shoot",  atk:"spread", atkAlt:"ring", ringN:14, dmgMul:1.8, hpMul:4.0, shotSpd:500, atkCd:2.2, spreadN:5, shotR:6, shotDmgMul:0.85 },
  // ===== 小惑星のモンスター (SATS 10..29 と同じ順番)。fam/deco で姿を描き分ける =====
  { name:"ペタルスライム",   color:"#86efac", shotColor:"#bbf7d0", r:19, spd:80,  mode:"chase",  atk:"spit",   dmgMul:0.9, hpMul:0.9, shotSpd:300, atkCd:2.8, atkRange:700, shotR:5, shotDmgMul:0.9, fam:"blob", deco:"petal" },
  { name:"ハニービー",       color:"#ffb020", shotColor:"#fde68a", r:15, spd:185, mode:"chase",  atk:"spit",   dmgMul:0.8, hpMul:0.6, shotSpd:460, atkCd:1.5, atkRange:620, shotR:3, shotDmgMul:0.6, fam:"bat" },
  { name:"マッシュゴブリン", color:"#d8b4fe", shotColor:"#e9d5ff", r:18, spd:75,  mode:"shoot",  atk:"spit",   dmgMul:0.9, hpMul:0.9, shotSpd:380, atkCd:2.3, shotR:5, fam:"blob", deco:"shroom" },
  { name:"キャンディゴースト", color:"#ff8fab", shotColor:"#fbcfe8", r:18, spd:120, mode:"chase", atk:"spit",  dmgMul:1.0, hpMul:0.8, shotSpd:420, atkCd:2.0, atkRange:720, shotR:4, fam:"ghost" },
  { name:"アイアンボール",   color:"#93c5fd", shotColor:"#bfdbfe", r:22, spd:60,  mode:"chase",  atk:"spread", dmgMul:1.4, hpMul:2.6, shotSpd:340, atkCd:3.0, atkRange:760, spreadN:3, shotR:5, shotDmgMul:0.8, fam:"rock" },
  { name:"バブルフィッシュ", color:"#7dd3fc", shotColor:"#bae6fd", r:16, spd:130, mode:"shoot",  atk:"burst",  dmgMul:0.9, hpMul:0.8, shotSpd:480, atkCd:2.0, burstN:3, burstGap:0.1, shotR:3, shotDmgMul:0.7, fam:"ghost", deco:"fin" },
  { name:"ルーンセンチネル", color:"#e2e8f0", shotColor:"#f1f5f9", r:21, spd:70,  mode:"shoot",  atk:"burst",  dmgMul:1.1, hpMul:1.7, shotSpd:440, atkCd:2.4, burstN:3, burstGap:0.16, shotR:5, fam:"bot" },
  { name:"パンプキンゴースト", color:"#fb923c", r:20, spd:105, mode:"charge", dmgMul:1.3, hpMul:1.2, teleT:0.4, dashMul:4.0, dashT:0.36, chargeRange:620, postCd:1.8, fam:"ghost", deco:"stem" },
  { name:"グミスライム",     color:"#a3e635", shotColor:"#d9f99d", r:17, spd:150, mode:"chase",  atk:"spit",   dmgMul:0.9, hpMul:0.7, shotSpd:500, atkCd:1.4, atkRange:680, shotR:3, shotDmgMul:0.65, fam:"blob" },
  { name:"コメットスピリット", color:"#bae6fd", shotColor:"#e0f2fe", r:17, spd:140, mode:"shoot", atk:"spread", dmgMul:1.1, hpMul:1.0, shotSpd:470, atkCd:2.2, spreadN:3, shotR:4, fam:"spike" },
  { name:"ベビードラゴン",   color:"#f87171", shotColor:"#fca5a5", r:20, spd:150, mode:"shoot",  atk:"burst",  dmgMul:1.3, hpMul:1.6, shotSpd:520, atkCd:2.2, burstN:3, burstGap:0.12, shotR:5, shotDmgMul:0.9, fam:"bat", deco:"horn" },
  { name:"ミラージュイーター", color:"#fde68a", shotColor:"#fef3c7", r:19, spd:95, mode:"shoot", atk:"spread", dmgMul:1.2, hpMul:1.3, shotSpd:430, atkCd:2.5, spreadN:3, shotR:5, fam:"eye" },
  { name:"オーロラバタフライ", color:"#6ee7b7", shotColor:"#a7f3d0", r:16, spd:165, mode:"chase", atk:"spit",  dmgMul:1.0, hpMul:0.9, shotSpd:450, atkCd:1.8, atkRange:660, shotR:4, shotDmgMul:0.8, fam:"bat" },
  { name:"ギアボット",       color:"#facc15", shotColor:"#fef08a", r:19, spd:110, mode:"shoot",  atk:"burst",  dmgMul:1.2, hpMul:1.4, shotSpd:540, atkCd:2.0, burstN:4, burstGap:0.08, shotR:4, shotDmgMul:0.8, fam:"bot" },
  { name:"ネビュラゴースト", color:"#818cf8", shotColor:"#c7d2fe", r:20, spd:90,  mode:"shoot",  atk:"spit",   dmgMul:1.3, hpMul:1.9, shotSpd:410, atkCd:2.4, shotR:6, shotDmgMul:1.1, fam:"ghost" },
  { name:"ラグーンクラブ",   color:"#2dd4bf", r:22, spd:120, mode:"charge", dmgMul:1.4, hpMul:1.8, teleT:0.38, dashMul:3.9, dashT:0.34, chargeRange:600, postCd:1.7, fam:"crab" },
  { name:"ブラッドオーブ",   color:"#dc2626", shotColor:"#fca5a5", r:20, spd:100, mode:"shoot",  atk:"spread", dmgMul:1.5, hpMul:2.0, shotSpd:460, atkCd:2.6, spreadN:5, shotR:5, shotDmgMul:0.8, fam:"spike" },
  { name:"ルミナセラフ",     color:"#fef9c3", shotColor:"#fefce8", r:18, spd:135, mode:"shoot",  atk:"burst",  dmgMul:1.4, hpMul:1.6, shotSpd:530, atkCd:2.1, burstN:4, burstGap:0.1, shotR:4, shotDmgMul:0.85, fam:"bat" },
  { name:"ジャングルスパイダー", color:"#34d399", shotColor:"#a7f3d0", r:19, spd:175, mode:"chase", atk:"spit", dmgMul:1.3, hpMul:1.3, shotSpd:490, atkCd:1.5, atkRange:680, shotR:4, shotDmgMul:0.75, fam:"crab" },
  { name:"ホライズンアイ",   color:"#7c3aed", shotColor:"#c4b5fd", r:24, spd:95,  mode:"shoot",  atk:"spread", atkAlt:"ring", ringN:12, dmgMul:1.7, hpMul:3.0, shotSpd:480, atkCd:2.3, spreadN:5, shotR:6, shotDmgMul:0.9, fam:"eye" },
  // ===== 惑星内部ダンジョン (30-39) =====
  { name:"ボーンウォーカー", color:"#e8e0cc", r:21, spd:105, mode:"chase", atk:"spit",  dmgMul:1.0, hpMul:1.2, shotSpd:430, atkCd:1.9, shotR:4, shotDmgMul:0.7, fam:"rock", deco:"horn" },
  { name:"ルートスネーク",   color:"#8a9a5b", shotColor:"#dcedc8", r:19, spd:135, mode:"chase", atk:"spit", dmgMul:1.0, hpMul:1.1, shotSpd:470, atkCd:1.6, shotR:4, shotDmgMul:0.7, fam:"blob", deco:"stem" },
  { name:"スタラクバット",   color:"#b0bec5", shotColor:"#eceff1", r:17, spd:155, mode:"shoot", atk:"spit", dmgMul:1.0, hpMul:1.0, shotSpd:500, atkCd:1.8, shotR:4, shotDmgMul:0.75, fam:"bat" },
  { name:"ハライトクラブ",   color:"#f8bbd0", r:22, spd:120, mode:"charge", dmgMul:1.2, hpMul:1.6, teleT:0.4, dashMul:3.8, dashT:0.34, chargeRange:580, postCd:1.7, fam:"crab" },
  { name:"ジオードスパイク", color:"#b39ddb", shotColor:"#e1bee7", r:20, spd:85,  mode:"shoot", atk:"spread", dmgMul:1.2, hpMul:1.7, shotSpd:470, atkCd:2.4, spreadN:5, shotR:5, shotDmgMul:0.8, fam:"spike" },
  { name:"マグネドローン",   color:"#5c6bc0", shotColor:"#c5cae9", r:18, spd:125, mode:"shoot", atk:"burst", dmgMul:1.2, hpMul:1.4, shotSpd:520, atkCd:2.2, burstN:4, burstGap:0.1, shotR:4, shotDmgMul:0.8, fam:"bot" },
  { name:"トゥームゴースト", color:"#90a4ae", shotColor:"#eceff1", r:21, spd:88,  mode:"shoot", atk:"spit", dmgMul:1.3, hpMul:2.3, shotSpd:450, atkCd:2.0, shotR:5, shotDmgMul:0.85, fam:"ghost" },
  { name:"ブリムデーモン",   color:"#ff7043", shotColor:"#ffccbc", r:21, spd:110, mode:"shoot", atk:"spread", dmgMul:1.5, hpMul:2.0, shotSpd:490, atkCd:2.3, spreadN:5, shotR:5, shotDmgMul:0.85, fam:"spike", deco:"horn" },
  { name:"スターダストアイ", color:"#ffe082", shotColor:"#fff8e1", r:20, spd:100, mode:"shoot", atk:"burst", dmgMul:1.5, hpMul:2.2, shotSpd:510, atkCd:2.0, burstN:5, burstGap:0.09, shotR:4, shotDmgMul:0.85, fam:"eye" },
  { name:"コアガーディアン", color:"#ff5252", shotColor:"#ffcdd2", r:25, spd:95,  mode:"shoot", atk:"spread", atkAlt:"ring", ringN:14, dmgMul:1.8, hpMul:3.2, shotSpd:500, atkCd:2.2, spreadN:5, shotR:6, shotDmgMul:0.9, fam:"eye", deco:"horn" },
  // ===== 惑星内部・幻想ダンジョン (40-49) =====
  { name:"フェアリースライム", color:"#a5f2ff", shotColor:"#e1f5fe", r:18, spd:120, mode:"chase", atk:"spit", dmgMul:1.0, hpMul:1.0, shotSpd:450, atkCd:1.7, shotR:4, shotDmgMul:0.7, fam:"blob", deco:"petal" },
  { name:"レインボーゴーレム", color:"#f48fb1", r:23, spd:75,  mode:"shoot", atk:"spread", dmgMul:1.1, hpMul:1.9, shotSpd:450, atkCd:2.5, spreadN:5, shotR:5, shotDmgMul:0.8, fam:"rock" },
  { name:"スピリットトレント", color:"#aed581", r:22, spd:115, mode:"charge", dmgMul:1.2, hpMul:1.7, teleT:0.42, dashMul:3.7, dashT:0.36, chargeRange:600, postCd:1.8, fam:"blob", deco:"stem" },
  { name:"ドリームシープ",   color:"#ce93d8", shotColor:"#f3e5f5", r:20, spd:90,  mode:"shoot", atk:"burst", dmgMul:1.1, hpMul:1.5, shotSpd:440, atkCd:2.3, burstN:4, burstGap:0.12, shotR:5, shotDmgMul:0.75, fam:"blob" },
  { name:"ルーンゴーレム",   color:"#90caf9", shotColor:"#e3f2fd", r:21, spd:95,  mode:"shoot", atk:"burst", dmgMul:1.2, hpMul:1.8, shotSpd:500, atkCd:2.1, burstN:4, burstGap:0.1, shotR:4, shotDmgMul:0.8, fam:"bot" },
  { name:"キマイラビースト", color:"#ffb74d", r:22, spd:140, mode:"charge", dmgMul:1.4, hpMul:1.9, teleT:0.36, dashMul:4.1, dashT:0.34, chargeRange:640, postCd:1.6, fam:"spike", deco:"horn" },
  { name:"クロノアイ",       color:"#fff59d", shotColor:"#fffde7", r:20, spd:100, mode:"shoot", atk:"spread", dmgMul:1.3, hpMul:1.9, shotSpd:490, atkCd:2.2, spreadN:5, shotR:5, shotDmgMul:0.85, fam:"eye" },
  { name:"セラフドローン",   color:"#fff9c4", shotColor:"#fffde7", r:18, spd:145, mode:"shoot", atk:"burst", dmgMul:1.3, hpMul:1.6, shotSpd:530, atkCd:2.0, burstN:5, burstGap:0.09, shotR:4, shotDmgMul:0.8, fam:"bat" },
  { name:"デモンコントラクター", color:"#6a1b9a", shotColor:"#ce93d8", r:21, spd:105, mode:"shoot", atk:"spread", dmgMul:1.6, hpMul:2.1, shotSpd:500, atkCd:2.2, spreadN:5, shotR:5, shotDmgMul:0.85, fam:"ghost", deco:"horn" },
  { name:"イグドラシルガーディアン", color:"#66bb6a", shotColor:"#c8e6c9", r:24, spd:92, mode:"shoot", atk:"spread", atkAlt:"ring", ringN:12, dmgMul:1.7, hpMul:3.0, shotSpd:490, atkCd:2.3, spreadN:5, shotR:6, shotDmgMul:0.9, fam:"eye", deco:"stem" },
  { name:"モススライム",     color:"#7cb342", shotColor:"#dcedc8", r:15, spd:70,  mode:"chase",  dmgMul:0.04,  hpMul:0.8, coinMul:0.03,  xpMul:0.04,  fam:"blob", deco:"petal" },
  { name:"クレイゴーレム",   color:"#c97b4a", shotColor:"#ffe0b2", r:19, spd:45,  mode:"chase",  dmgMul:0.045, hpMul:1.1, coinMul:0.03,  xpMul:0.04,  fam:"rock" },
  { name:"サップスネーク",   color:"#d4a017", shotColor:"#fff9c4", r:14, spd:95,  mode:"chase",  dmgMul:0.05,  hpMul:0.9, coinMul:0.035, xpMul:0.045, fam:"blob", deco:"stem" },
  { name:"リューサワーム",   color:"#e0c98f", shotColor:"#fff3e0", r:16, spd:110, mode:"charge", dmgMul:0.05,  hpMul:1.0, coinMul:0.035, xpMul:0.045, teleT:0.4, dashMul:3.6, dashT:0.34, chargeRange:560, postCd:2.0, fam:"spike" },
  { name:"アンモアイボール", color:"#a1887f", shotColor:"#efebe9", r:15, spd:60,  mode:"shoot",  atk:"spit",  dmgMul:0.055, hpMul:0.9, coinMul:0.04,  xpMul:0.05,  shotSpd:300, atkCd:2.4, shotR:5, shotDmgMul:0.7, fam:"eye" },
  { name:"チャコールバット", color:"#616161", shotColor:"#ffccbc", r:13, spd:120, mode:"shoot",  atk:"spit",  dmgMul:0.06,  hpMul:0.8, coinMul:0.04,  xpMul:0.05,  shotSpd:320, atkCd:2.2, shotR:5, shotDmgMul:0.7, fam:"bat" },
  { name:"アクアクラブ",     color:"#4fc3f7", shotColor:"#e1f5fe", r:17, spd:85,  mode:"charge", dmgMul:0.065, hpMul:1.1, coinMul:0.045, xpMul:0.055, teleT:0.38, dashMul:3.8, dashT:0.36, chargeRange:580, postCd:1.9, fam:"crab", deco:"fin" },
  { name:"ラストドローン",   color:"#a15c3f", shotColor:"#ffccbc", r:14, spd:80,  mode:"shoot",  atk:"burst", dmgMul:0.07,  hpMul:1.0, coinMul:0.045, xpMul:0.055, shotSpd:330, atkCd:2.6, burstN:3, burstGap:0.12, shotR:5, shotDmgMul:0.7, fam:"bot" },
  { name:"ペタルゴースト",   color:"#f06292", shotColor:"#fce4ec", r:15, spd:65,  mode:"shoot",  atk:"spit",  dmgMul:0.075, hpMul:1.2, coinMul:0.05,  xpMul:0.06,  shotSpd:340, atkCd:2.4, shotR:5, shotDmgMul:0.8, fam:"ghost", deco:"petal" },
  { name:"グラススパイク",   color:"#a7d7d0", shotColor:"#e0f2f1", r:16, spd:55,  mode:"shoot",  atk:"spread", dmgMul:0.085, hpMul:1.3, coinMul:0.05,  xpMul:0.06,  shotSpd:350, atkCd:2.5, spreadN:4, shotR:5, shotDmgMul:0.8, fam:"spike" },
];
const mobs = [];        // {id, sat, type, x, y, vx, vy, hp, maxHp, atkT, burnT, burnD, slowT, flashT, mode/timer (charge用), hx, hy}
const mobShots = [];    // 敵の弾 {x, y, vx, vy, dmg, t}
let mobNextId = 1;
let hurtT = 0;          // 最後に被弾してからの経過 (回復開始の判定)
let hurtFlash = 0;      // 被弾時の赤フラッシュ
let hpInitDone = false;

const satWorld = S => [(S.cx - GC) * BS, (S.cy - GC) * BS];   // 衛星中心のワールド座標

function spawnMob(si){
  const S = SATS[si], T = MOB_TYPES[si], [wx, wy] = satWorld(S);
  const maxHp = Math.round(12 * Math.pow(10, S.exp * 0.52) * T.hpMul);
  if (S.rect){   // 内部ダンジョン: 掘り開けられたマスにだけ湧く (開けた場所がなければ湧かない)
    let cell = null;
    for (let t = 0; t < 24 && !cell; t++){
      const gx = S.x0 + 1 + ((Math.random() * (S.hw * 2 - 1)) | 0), gy = S.y0 + 1 + ((Math.random() * (S.hh * 2 - 1)) | 0);
      if (isDestroyed(gy * D + gx)) cell = [gx, gy];
    }
    if (!cell){   // ランダムで見つからなければ走査して開けたマスを探す
      const open = [];
      for (let gy = S.y0 + 1; gy < S.y1 && open.length < 24; gy += 2)
        for (let gx = S.x0 + 1; gx < S.x1 && open.length < 24; gx += 2)
          if (isDestroyed(gy * D + gx)) open.push([gx, gy]);
      if (open.length) cell = open[(Math.random() * open.length) | 0];
    }
    if (!cell) return;
    const x = g2w(cell[0]), y = g2w(cell[1]);
    mobs.push({ id: mobNextId++, sat: si, type: T, x, y, vx: 0, vy: 0, hx: x, hy: y,
      hp: maxHp, maxHp, atkT: Math.random(), burnT: 0, burnD: 0, slowT: 0, flashT: 0,
      ph: Math.random() * 7, mode: "idle", modeT: 0 });
    return;
  }
  const a = Math.random() * Math.PI * 2, rr = (S.r + 2.5) * BS;
  mobs.push({ id: mobNextId++, sat: si, type: T,
    x: wx + Math.cos(a) * rr, y: wy + Math.sin(a) * rr, vx: 0, vy: 0,
    hx: wx + Math.cos(a) * rr, hy: wy + Math.sin(a) * rr,
    hp: maxHp, maxHp, atkT: Math.random(), burnT: 0, burnD: 0, slowT: 0, flashT: 0,
    ph: Math.random() * 7, mode: "idle", modeT: 0 });
}
function mobCountFor(si){ return si < 10 ? 5 + Math.min(5, si) : 3 + (si - 10) % 3; }   // 小惑星は小さいので少なめ

// ---------- 敵の攻撃 ----------
function mobShot(m, T, a, spdMul = 1, dmgMul = 1){
  mobShots.push({ x: m.x + Math.cos(a) * T.r * 0.8, y: m.y + Math.sin(a) * T.r * 0.8,
    vx: Math.cos(a) * T.shotSpd * spdMul, vy: Math.sin(a) * T.shotSpd * spdMul,
    dmg: (4 + m.sat * 2.8) * T.dmgMul * (T.shotDmgMul || 1) * dmgMul, t: 2.4,
    r: T.shotR || 5, color: T.shotColor || "#ff5a4a" });
}
function mobFire(m, T, baseA){   // パターンに応じて撃つ (baseA = 自機への角度)
  if (T.atk === "spit") mobShot(m, T, baseA);
  else if (T.atk === "spread"){
    m.atkN = (m.atkN || 0) + 1;
    if (T.atkAlt === "ring" && m.atkN % 3 === 0){   // ノヴァセンチネル: 3回に1回は全方位リング
      for (let k = 0; k < T.ringN; k++) mobShot(m, T, k / T.ringN * Math.PI * 2 + m.ph, 0.7, 0.7);
    } else {
      const n = T.spreadN || 3;
      for (let k = 0; k < n; k++) mobShot(m, T, baseA + (k - (n - 1) / 2) * 0.22);
    }
  }
  else if (T.atk === "burst"){ mobShot(m, T, baseA); m.burst = (T.burstN || 3) - 1; m.burstT = T.burstGap || 0.12; }
}

// ---------- 自機HP ----------
function onLevelUpHeal(){ state.hp = playerMaxHP(); }
function damagePlayer(d){
  if (!started || player.iframes > 0 || state.hp <= 0) return;
  if (artSpecial("shield") && artShieldT <= 0){ artShieldT = 12; hurtFlash = Math.max(hurtFlash, 0.35); toast("結界が攻撃を防いだ"); return; }   // 結界の欠片
  d *= (1 - Math.min(0.6, artVal("def"))) * (1 - 0.04 * (state.botArmor || 0));
  { const pfx = dungeonFxAt(w2g(player.x), w2g(player.y)); if (pfx) d *= pfx.hurt; }   // ダンジョン固有効果: 被ダメ倍率   // アーティファクト軽減 × 衛星装甲
  state.hp = Math.max(0, state.hp - d);
  player.iframes = 0.45; hurtT = 0; hurtFlash = 1; hudDirty = true;
  if (state.hp <= 0){
    if (artHas("lg_phoenix") && artPhoenixT <= 0){   // 不死鳥の灰: 全HPで復活 + 周囲に大爆発 (45秒に1回)
      artPhoenixT = 45; state.hp = playerMaxHP(); player.iframes = 2.5; hurtFlash = 0; hudDirty = true;
      phoenixBlast(); toast("不死鳥の灰が燃え上がり、蘇った！"); return;
    }
    if (artSpecial("revive") && Math.random() < 0.75){ state.hp = Math.round(playerMaxHP() * 0.75); player.iframes = 2; toast("不死の核が蘇らせた！"); return; }   // 不死の核
    respawnPlayer();
  }
}
function respawnPlayer(){
  state.hp = playerMaxHP();
  player.x = (R + 4) * BS; player.y = 0; player.vx = 0; player.vy = 0;
  player.iframes = 3; hurtFlash = 0;
  mobShots.length = 0;
  toast("撃墜された… メイン惑星で復活");
}
function updatePlayerHP(dt){
  if (!hpInitDone){   // 初回: セーブのHPを妥当な範囲に
    hpInitDone = true;
    if (!(state.hp > 0) || state.hp > playerMaxHP()) state.hp = playerMaxHP();
  }
  if (player.iframes > 0) player.iframes -= dt;
  hurtT += dt; hurtFlash = Math.max(0, hurtFlash - dt * 2.2);
  if (state.hp > 0 && state.hp < playerMaxHP()){
    let add = artVal("regenAlways") / 100 * playerMaxHP() * dt;                    // 常時回復 (アーティファクト)
    if (hurtT > 4) add += playerMaxHP() * 0.02 * (1 + artVal("regen")) * dt;      // 無傷4秒後から毎秒2%回復
    if (add > 0) state.hp = Math.min(playerMaxHP(), state.hp + add);
  }
}

// ---------- モンスター ----------
// ダメージ数値用: モンスター単位で集計し、game.js の flushDmgLabels がまとめて表示する
const mobDmgAcc = new Map();   // mob.id -> {m, total, crit, max}
function noteMobDmg(m, dmg, crit){
  if (!(dmg > 0)) return;
  let e = mobDmgAcc.get(m.id);
  if (!e){ if (mobDmgAcc.size >= 48) return; e = { m, total: 0, crit: false, max: 0 }; mobDmgAcc.set(m.id, e); }
  e.total += dmg; if (crit) e.crit = true; if (dmg > e.max) e.max = dmg;
}
function damageMob(m, dmg, bl){
  if (m.hp <= 0) return;
  let voidCrit = false;
  if (bl){
    if (bl.crit) dmg *= 2;
    if (bl.crit && artHas("lg_void")){ dmg *= 1.5; voidCrit = true; }   // 虚無の単眼: モンスターへの会心も合計 ×3
    if (bl.fx && bl.fx.burn){ m.burnT = 3; m.burnD = Math.max(m.burnD, dmg * bl.fx.burn * 0.4); }
    if (bl.fx && bl.fx.frost) m.slowT = Math.max(m.slowT, 2);
  }
  m.hp -= dmg; m.flashT = 0.09;
  noteMobDmg(m, dmg, !!(bl && bl.crit));
  if (voidCrit){   // 紫のリング + 特大数字フラグ
    const e = mobDmgAcc.get(m.id); if (e) e.void = true;
    rings.push({ x: m.x, y: m.y, r: 70, t: performance.now(), color: "176,110,255", dur: 350 });
  }
  if (bl && bl.fx) m.lastFx = bl.fx;
  if (m.hp <= 0) killMob(m);
}
function killMob(m){
  if (typeof burstAt === "function") burstAt(m.x, m.y, m.lastFx || { accent: (m.type && m.type.color) || "#ffd24d", c2: "#ffffff", burst: "dots" }, null);
  const si = m.sat, S = SATS[si], T = m.type;
  const total = Math.round((30 + si * 45) * T.hpMul * (T.coinMul || 1)), each = Math.max(1, Math.round(total / 4));
  for (let k = 0; k < 4; k++)
    coinsArr.push({ x: m.x, y: m.y, vx: (Math.random() - .5) * 120, vy: (Math.random() - .5) * 120, value: each, chest: false, age: 0 });
  gainXP(Math.round((8 + si * 6) * T.hpMul * (T.xpMul || 1) * (S.fx ? S.fx.xp : 1)));
  if (Math.random() < 0.35 * (S.fx ? S.fx.drop : 1)){ const n = 1 + (Math.random() * 3 | 0); invAdd(S.sig, n); noteDrop(m.x, m.y, MAT[S.sig], n); }
  if (artSpecial("mobDrop")){ invAdd(S.sig, 1); noteDrop(m.x, m.y - 16, MAT[S.sig], 1); }   // 星屑の収穫者: 必ず落ちる
  m.hp = 0; m.dead = true;
}
// 射撃の照準用: (x, y) から rng 以内の最も近いモンスター (ブロックより優先して狙う)
function nearestMob(x, y, rng){
  let best = null, bd = Infinity;
  for (const m of mobs){
    if (m.dead) continue;
    const dx = m.x - x, dy = m.y - y, rr = rng + m.type.r, d = dx * dx + dy * dy;
    if (d <= rr * rr && d < bd){ bd = d; best = m; }
  }
  return best;
}
function mobById(id){
  for (const m of mobs) if (m.id === id && !m.dead) return m;
  return null;
}
function mobAtPoint(x, y, exceptId){
  for (const m of mobs){
    if (m.dead || m.id === exceptId) continue;
    const dx = m.x - x, dy = m.y - y, rr = m.type.r + 4;
    if (dx * dx + dy * dy <= rr * rr) return m;
  }
  return null;
}
function updateMobs(dt){
  // 星ごとに生息数を維持 (自機が近い星だけ)
  for (let si = 0; si < SATS.length; si++){
    const S = SATS[si], [wx, wy] = satWorld(S);
    const dx = player.x - wx, dy = player.y - wy;
    if (dx * dx + dy * dy > (S.r * BS + 3000) ** 2) continue;
    let n = 0; for (const m of mobs) if (m.sat === si && !m.dead) n++;
    if (n < mobCountFor(si)) spawnMob(si);
  }
  // 敵弾
  for (let i = mobShots.length - 1; i >= 0; i--){
    const s = mobShots[i];
    s.x += s.vx * dt; s.y += s.vy * dt; s.t -= dt;
    const gx = w2g(s.x), gy = w2g(s.y);
    const hitBlock = blockExists(gx, gy) && !isDestroyed(gy * D + gx);
    const dx = s.x - player.x, dy = s.y - player.y;
    if (dx * dx + dy * dy < 20 * 20){ damagePlayer(s.dmg); mobShots.splice(i, 1); continue; }
    if (s.t <= 0 || hitBlock) mobShots.splice(i, 1);
  }
  // 本体
  for (let i = mobs.length - 1; i >= 0; i--){
    const m = mobs[i];
    if (m.dead){ mobs.splice(i, 1); continue; }
    const pdx = player.x - m.x, pdy = player.y - m.y, pd = Math.hypot(pdx, pdy);
    if (pd > 3600) continue;   // 遠くの個体は眠らせる
    const S = SATS[m.sat], T = m.type, [wx, wy] = satWorld(S);
    m.atkT -= dt; m.flashT = Math.max(0, m.flashT - dt);
    if (m.slowT > 0) m.slowT -= dt;
    if (m.burnT > 0){ m.burnT -= dt; const bd = m.burnD * dt; m.hp -= bd; noteMobDmg(m, bd, false); if (m.hp <= 0){ killMob(m); continue; } }
    // 行動決定
    let tx = m.hx, ty = m.hy, spd = T.spd * 0.4;
    const aggro = pd < 840;
    if (m.mode === "tele"){   // 突進系: 狙いを定めている
      m.modeT -= dt; spd = 0;
      if (m.modeT <= 0){ m.mode = "dash"; m.modeT = T.dashT || 0.45; const l = pd || 1; m.vx = pdx / l * T.spd * (T.dashMul || 4.4); m.vy = pdy / l * T.spd * (T.dashMul || 4.4); }
    } else if (m.mode === "dash"){
      m.modeT -= dt; spd = -1;   // ダッシュ中は速度を維持
      if (m.modeT <= 0){ m.mode = "idle"; m.atkT = Math.max(m.atkT, T.postCd || 1.6); }
    } else if (aggro){
      tx = player.x; ty = player.y; spd = T.spd;
      if (T.mode === "shoot") spd = pd > 620 ? T.spd : T.spd * 0.25;   // 射手は距離を保つ
      if (T.mode === "charge" && pd < (T.chargeRange || 700) && m.atkT <= 0){ m.mode = "tele"; m.modeT = T.teleT || 0.5; }
    }
    if (spd >= 0){
      const dx = tx - m.x, dy = ty - m.y, l = Math.hypot(dx, dy) || 1;
      const wob = aggro ? 0 : Math.sin(nowMs / 900 + m.ph) * 0.5;
      const tvx = (dx / l - dy / l * wob) * spd * (m.slowT > 0 ? 0.45 : 1);
      const tvy = (dy / l + dx / l * wob) * spd * (m.slowT > 0 ? 0.45 : 1);
      m.vx += (tvx - m.vx) * Math.min(1, dt * 3.2); m.vy += (tvy - m.vy) * Math.min(1, dt * 3.2);
    }
    m.x += m.vx * dt; m.y += m.vy * dt;
    // ブロックにめり込んだら、星の外側へ押し出す
    for (let k = 0; k < 3; k++){
      const gx = w2g(m.x), gy = w2g(m.y);
      if (!blockExists(gx, gy) || isDestroyed(gy * D + gx)) break;
      let ox = m.x - wx, oy = m.y - wy;
      if (S.rect){ ox = m.hx - m.x; oy = m.hy - m.y; }   // 内部ダンジョン: 中心から外ではなく、巣穴の開けたマスへ押し戻す
      const l = Math.hypot(ox, oy) || 1;
      m.x += ox / l * BS * 0.6; m.y += oy / l * BS * 0.6;
    }
    // リーシュ: 星から離れすぎたら引き戻す
    const hx = m.x - wx, hy = m.y - wy, hd = Math.hypot(hx, hy), leash = (S.r + 46) * BS;
    if (hd > leash){ m.x = wx + hx / hd * leash; m.y = wy + hy / hd * leash; }
    // 攻撃: 接触 + パターン射撃 (全種が何かしら攻撃してくる)
    if (aggro && pd < T.r + 17 && m.atkT <= 0 && m.mode !== "tele"){
      damagePlayer((5 + m.sat * 3.2) * T.dmgMul);
      m.atkT = 0.9;
    } else if (aggro && T.atk && m.mode !== "tele" && m.mode !== "dash" && pd < (T.atkRange || 980) && m.atkT <= 0){
      mobFire(m, T, Math.atan2(pdy, pdx));
      m.atkT = T.atkCd * (0.9 + Math.random() * 0.25);
    }
    // バーストの残り弾はクールダウンと独立に撃ち切る
    if (m.burst > 0){
      m.burstT -= dt;
      if (m.burstT <= 0 && pd < 1150){ mobShot(m, T, Math.atan2(pdy, pdx)); m.burst--; m.burstT = T.burstGap || 0.12; }
    }
    // サンドワームの移動履歴 (体の節の描画用)
    if (m.sat === 7){
      m.trail = m.trail || [];
      const lt = m.trail[0];
      if (!lt || (m.x - lt.x) ** 2 + (m.y - lt.y) ** 2 > 100){ m.trail.unshift({ x: m.x, y: m.y }); if (m.trail.length > 26) m.trail.pop(); }
    }
  }
}

// ---------- 描画 ----------
// 種ごとの姿を描く (ローカル座標, 原点=中心, r=半径px, la=自機への角度)
function drawMiniMob(m, T, r, la){
  const t = nowMs, ph = m.ph, C = T.color;
  const eyes = (ex, ey, s = 0.11) => {
    ctx.fillStyle = "#101418";
    ctx.beginPath(); ctx.arc(Math.cos(la) * r * 0.16 - ex * r, ey * r + Math.sin(la) * r * 0.08, s * r, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(Math.cos(la) * r * 0.16 + ex * r, ey * r + Math.sin(la) * r * 0.08, s * r, 0, 7); ctx.fill();
  };
  ctx.lineWidth = Math.max(1, 1.6 * zoom);
  if (T.fam === "blob"){
    ctx.fillStyle = C;
    ctx.beginPath();
    for (let k = 0; k <= 8; k++){
      const a = k / 8 * Math.PI * 2, rr = r * (1 + 0.09 * Math.sin(t / 260 + ph + k * 1.9));
      k ? ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr * 0.94) : ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr * 0.94);
    }
    ctx.closePath(); ctx.fill(); ctx.strokeStyle = "rgba(0,0,0,.45)"; ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,.35)"; ctx.beginPath(); ctx.arc(-r * 0.34, -r * 0.38, r * 0.2, 0, 7); ctx.fill();
    if (T.deco === "petal"){
      ctx.fillStyle = "#fff1f2";
      for (let k = 0; k < 5; k++){ const a = -Math.PI / 2 + (k - 2) * 0.5; ctx.beginPath(); ctx.ellipse(Math.cos(a) * r * 0.6, Math.sin(a) * r * 0.7 - r * 0.18, r * 0.19, r * 0.33, a + Math.PI / 2, 0, 7); ctx.fill(); }
      ctx.fillStyle = "#fbbf24"; ctx.beginPath(); ctx.arc(0, -r * 0.76, r * 0.16, 0, 7); ctx.fill();
    }
    if (T.deco === "shroom"){
      ctx.fillStyle = "#f5f3ff"; ctx.fillRect(-r * 0.07, -r * 1.02, r * 0.14, r * 0.28);
      ctx.fillStyle = "#a855f7"; ctx.beginPath(); ctx.ellipse(0, -r * 1.0, r * 0.44, r * 0.3, 0, Math.PI, 0); ctx.closePath(); ctx.fill();
      ctx.fillStyle = "#ede9fe"; ctx.beginPath(); ctx.arc(-r * 0.18, -r * 1.1, r * 0.07, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.arc(r * 0.14, -r * 1.16, r * 0.06, 0, 7); ctx.fill();
    }
    eyes(0.26, -0.05);
  } else if (T.fam === "spike"){
    const rot = t / 1400 + ph;
    ctx.fillStyle = C;
    for (let k = 0; k < 8; k++){
      ctx.save(); ctx.rotate(rot + k * Math.PI / 4);
      ctx.beginPath(); ctx.moveTo(r * 1.25, 0); ctx.lineTo(r * 0.55, -r * 0.2); ctx.lineTo(r * 0.55, r * 0.2); ctx.closePath(); ctx.fill(); ctx.restore();
    }
    ctx.beginPath(); ctx.arc(0, 0, r * 0.78, 0, 7); ctx.fill(); ctx.strokeStyle = "rgba(0,0,0,.45)"; ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,.85)"; ctx.beginPath(); ctx.arc(0, 0, r * 0.3, 0, 7); ctx.fill();
    ctx.fillStyle = "#101418"; ctx.beginPath(); ctx.arc(Math.cos(la) * r * 0.12, Math.sin(la) * r * 0.12, r * 0.13, 0, 7); ctx.fill();
  } else if (T.fam === "ghost"){
    const bob = Math.sin(t / 480 + ph) * r * 0.05;
    if (T.deco === "fin"){ ctx.fillStyle = C; for (const s of [-1, 1]){ ctx.beginPath(); ctx.moveTo(s * r * 0.88, r * 0.1 + bob); ctx.lineTo(s * r * 1.35, r * 0.35 + bob); ctx.lineTo(s * r * 0.9, r * 0.55 + bob); ctx.closePath(); ctx.fill(); } }
    ctx.fillStyle = C; ctx.globalAlpha = 0.92;
    ctx.beginPath();
    ctx.ellipse(0, bob, r * 0.95, r * 1.0, 0, Math.PI, 0);
    for (let k = 0; k <= 4; k++) ctx.lineTo(r * 0.95 - k * (r * 1.9 / 4), r * 0.72 + bob + (k % 2 ? r * 0.22 : 0));
    ctx.closePath(); ctx.fill(); ctx.globalAlpha = 1;
    ctx.strokeStyle = "rgba(0,0,0,.4)"; ctx.stroke();
    if (T.deco === "stem"){ ctx.strokeStyle = "#65a30d"; ctx.lineWidth = Math.max(1.4, 2.4 * zoom); ctx.beginPath(); ctx.moveTo(0, -r * 0.92 + bob); ctx.quadraticCurveTo(r * 0.1, -r * 1.18 + bob, r * 0.3, -r * 1.2 + bob); ctx.stroke(); ctx.lineWidth = Math.max(1, 1.6 * zoom); }
    ctx.fillStyle = "#101418";
    ctx.beginPath(); ctx.arc(-r * 0.3, -r * 0.18 + bob, r * 0.12, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(r * 0.3, -r * 0.18 + bob, r * 0.12, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.ellipse(0, r * 0.18 + bob, r * 0.13, r * 0.19, 0, 0, 7); ctx.fill();
  } else if (T.fam === "bot"){
    const bob = Math.sin(t / 550 + ph) * r * 0.04;
    ctx.strokeStyle = "rgba(0,0,0,.4)"; ctx.beginPath(); ctx.moveTo(0, -r * 0.95 + bob); ctx.lineTo(0, -r * 1.28 + bob); ctx.stroke();
    ctx.fillStyle = "#ff5040"; ctx.beginPath(); ctx.arc(0, -r * 1.36 + bob, r * 0.11 * (1 + 0.3 * Math.sin(t / 200 + ph)), 0, 7); ctx.fill();
    ctx.fillStyle = C;
    ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(-r * 0.85, -r * 0.8 + bob, r * 1.7, r * 1.65, r * 0.3); else ctx.rect(-r * 0.85, -r * 0.8 + bob, r * 1.7, r * 1.65); ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,.55)"; ctx.stroke();
    ctx.fillStyle = "#14181f"; ctx.fillRect(-r * 0.62, -r * 0.32 + bob, r * 1.24, r * 0.44);
    ctx.fillStyle = "#7df9ff"; ctx.beginPath(); ctx.arc(Math.cos(la) * r * 0.3, -r * 0.1 + bob + Math.sin(la) * r * 0.08, r * 0.13, 0, 7); ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,.25)"; ctx.fillRect(-r * 0.62, r * 0.42 + bob, r * 1.24, r * 0.14);
  } else if (T.fam === "eye"){
    ctx.fillStyle = "rgba(255,255,255,.15)"; ctx.beginPath(); ctx.arc(0, 0, r * 1.3, 0, 7); ctx.fill();
    ctx.fillStyle = "#f4f0ff"; ctx.beginPath(); ctx.arc(0, 0, r, 0, 7); ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,.45)"; ctx.stroke();
    const ix = Math.cos(la) * r * 0.3, iy = Math.sin(la) * r * 0.3;
    ctx.fillStyle = C; ctx.beginPath(); ctx.arc(ix, iy, r * 0.55, 0, 7); ctx.fill();
    ctx.fillStyle = "#0a0618"; ctx.beginPath(); ctx.arc(ix + Math.cos(la) * r * 0.1, iy + Math.sin(la) * r * 0.1, r * 0.27, 0, 7); ctx.fill();
    ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(ix - r * 0.15, iy - r * 0.17, r * 0.1, 0, 7); ctx.fill();
  } else if (T.fam === "bat"){
    const flap = Math.sin(t / 110 + ph) * 0.45;
    ctx.fillStyle = C;
    for (const s of [-1, 1]){
      ctx.save(); ctx.scale(s, 1); ctx.rotate(-0.25 - flap * 0.5);
      ctx.beginPath(); ctx.moveTo(r * 0.4, -r * 0.15); ctx.quadraticCurveTo(r * 1.25, -r * 0.75, r * 1.6, -r * 0.1);
      ctx.quadraticCurveTo(r * 1.15, r * 0.05, r * 1.05, r * 0.38); ctx.quadraticCurveTo(r * 0.7, r * 0.12, r * 0.42, r * 0.3);
      ctx.closePath(); ctx.fill(); ctx.restore();
    }
    ctx.beginPath(); ctx.ellipse(0, 0, r * 0.72, r * 0.82, 0, 0, 7); ctx.fill(); ctx.strokeStyle = "rgba(0,0,0,.45)"; ctx.stroke();
    if (T.deco === "horn"){
      ctx.fillStyle = "#fef3c7";
      for (const s of [-1, 1]){ ctx.beginPath(); ctx.moveTo(s * r * 0.42, -r * 0.62); ctx.quadraticCurveTo(s * r * 0.85, -r * 1.05, s * r * 0.62, -r * 1.28); ctx.quadraticCurveTo(s * r * 0.5, -r * 0.95, s * r * 0.2, -r * 0.72); ctx.closePath(); ctx.fill(); }
    } else {
      ctx.fillStyle = C;
      for (const s of [-1, 1]){ ctx.beginPath(); ctx.moveTo(s * r * 0.2, -r * 0.68); ctx.lineTo(s * r * 0.42, -r * 1.12); ctx.lineTo(s * r * 0.58, -r * 0.6); ctx.closePath(); ctx.fill(); }
    }
    eyes(0.26, -0.12);
    ctx.fillStyle = "#fff";
    for (const s of [-1, 1]){ ctx.beginPath(); ctx.moveTo(s * r * 0.2 - r * 0.05, r * 0.3); ctx.lineTo(s * r * 0.2 + r * 0.05, r * 0.3); ctx.lineTo(s * r * 0.2, r * 0.48); ctx.closePath(); ctx.fill(); }
  } else if (T.fam === "crab"){
    ctx.strokeStyle = C; ctx.lineWidth = Math.max(1.4, 2.6 * zoom); ctx.lineCap = "round";
    for (const s of [-1, 1]) for (let k = 0; k < 3; k++){
      const bx = s * r * (0.5 + k * 0.16), wv = Math.sin(t / 240 + ph + k * 1.2 + (s > 0 ? 2 : 0)) * r * 0.12;
      ctx.beginPath(); ctx.moveTo(bx, r * 0.3); ctx.lineTo(bx + s * r * 0.42, r * 0.62 + wv); ctx.lineTo(bx + s * r * 0.5, r * 1.0 + wv); ctx.stroke();
    }
    ctx.lineCap = "butt";
    for (const s of [-1, 1]){
      const cxp = Math.cos(la) * r * 0.5 + s * r * 0.85, cyp = Math.sin(la) * r * 0.5 + r * 0.15;
      ctx.fillStyle = C; ctx.beginPath(); ctx.arc(cxp, cyp, r * 0.34, 0, 7); ctx.fill();
      ctx.fillStyle = "rgba(0,0,0,.35)"; ctx.beginPath(); ctx.moveTo(cxp, cyp); ctx.lineTo(cxp + Math.cos(la) * r * 0.36, cyp + Math.sin(la) * r * 0.36); ctx.lineTo(cxp + Math.cos(la + 0.7) * r * 0.3, cyp + Math.sin(la + 0.7) * r * 0.3); ctx.closePath(); ctx.fill();
    }
    ctx.fillStyle = C;
    ctx.beginPath(); ctx.ellipse(0, 0, r * 1.0, r * 0.78, 0, 0, 7); ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,.45)"; ctx.lineWidth = Math.max(1, 1.6 * zoom); ctx.stroke();
    ctx.strokeStyle = C; ctx.lineWidth = Math.max(1.2, 2 * zoom);
    for (const s of [-1, 1]){ ctx.beginPath(); ctx.moveTo(s * r * 0.28, -r * 0.6); ctx.lineTo(s * r * 0.36, -r * 0.95); ctx.stroke(); }
    ctx.fillStyle = "#101418";
    for (const s of [-1, 1]){ ctx.beginPath(); ctx.arc(s * r * 0.36, -r * 1.0, r * 0.13, 0, 7); ctx.fill(); }
    ctx.fillStyle = "#fff";
    for (const s of [-1, 1]){ ctx.beginPath(); ctx.arc(s * r * 0.36 + Math.cos(la) * r * 0.05, -r * 1.0 + Math.sin(la) * r * 0.05, r * 0.05, 0, 7); ctx.fill(); }
  } else {   // rock
    ctx.fillStyle = C;
    ctx.beginPath();
    for (let k = 0; k <= 7; k++){
      const a = k / 7 * Math.PI * 2 + ph, rr = r * (0.82 + 0.24 * ((Math.sin(ph * 7 + k * 2.7) + 1) / 2));
      k ? ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr) : ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    ctx.closePath(); ctx.fill(); ctx.strokeStyle = "rgba(0,0,0,.5)"; ctx.stroke();
    ctx.strokeStyle = "rgba(0,0,0,.3)";
    ctx.beginPath(); ctx.moveTo(-r * 0.5, -r * 0.3); ctx.lineTo(-r * 0.1, r * 0.1); ctx.lineTo(-r * 0.3, r * 0.5); ctx.stroke();
    const pu = 1 + 0.12 * Math.sin(t / 260 + ph);
    ctx.fillStyle = "#fff7cc"; ctx.beginPath(); ctx.arc(r * 0.15, -r * 0.1, r * 0.24 * pu, 0, 7); ctx.fill();
    eyes(0.3, 0.34, 0.09);
  }
}
function drawMobDesign(m, T, r, la){
  if (m.sat >= 10){ drawMiniMob(m, T, r, la); return; }   // 小惑星のモンスターはファミリー描画
  const t = nowMs, ph = m.ph;
  ctx.lineWidth = Math.max(1, 1.6 * zoom);
  if (m.sat === 0){   // マグマスライム: うねる溶岩ドーム + 光る亀裂と核
    ctx.fillStyle = "#6e2a10";
    ctx.beginPath();
    for (let k = 0; k <= 8; k++){
      const a = k / 8 * Math.PI * 2, rr = r * (1 + 0.10 * Math.sin(t / 280 + ph + k * 1.7));
      const px = Math.cos(a) * rr, py = Math.sin(a) * rr * 0.92;
      k ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    }
    ctx.closePath(); ctx.fill(); ctx.strokeStyle = "rgba(0,0,0,.5)"; ctx.stroke();
    ctx.strokeStyle = T.color; ctx.lineWidth = Math.max(1, 2 * zoom);
    for (let k = 0; k < 3; k++){
      const a = ph + k * 2.2;
      ctx.beginPath(); ctx.moveTo(Math.cos(a) * r * 0.3, Math.sin(a) * r * 0.3);
      ctx.lineTo(Math.cos(a + 0.4) * r * 0.62, Math.sin(a + 0.4) * r * 0.62);
      ctx.lineTo(Math.cos(a + 0.15) * r * 0.9, Math.sin(a + 0.15) * r * 0.9); ctx.stroke();
    }
    const pu = 1 + 0.13 * Math.sin(t / 240 + ph);
    ctx.fillStyle = "#ffd23a"; ctx.beginPath(); ctx.arc(0, 0, r * 0.34 * pu, 0, 7); ctx.fill();
    ctx.fillStyle = "#fff6d8"; ctx.beginPath(); ctx.arc(0, 0, r * 0.17 * pu, 0, 7); ctx.fill();
    ctx.fillStyle = "#2a0d02";
    ctx.beginPath(); ctx.arc(Math.cos(la) * r * 0.55 - r * 0.18, Math.sin(la) * r * 0.55 - r * 0.3, r * 0.09, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(Math.cos(la) * r * 0.55 + r * 0.18, Math.sin(la) * r * 0.55 - r * 0.3, r * 0.09, 0, 7); ctx.fill();
  } else if (m.sat === 1){   // フロストウルフ: 角ばった狼の頭 (自機の方を向く)
    ctx.save(); ctx.rotate(la);
    ctx.fillStyle = "#cfeeff";
    ctx.beginPath();
    ctx.moveTo(r * 1.08, 0); ctx.lineTo(r * 0.3, -r * 0.52); ctx.lineTo(r * 0.12, -r * 1.02);
    ctx.lineTo(r * -0.3, -r * 0.58); ctx.lineTo(r * -0.92, -r * 0.3); ctx.lineTo(r * -0.98, r * 0.34);
    ctx.lineTo(r * -0.35, r * 0.52); ctx.lineTo(r * 0.42, r * 0.46); ctx.lineTo(r * 0.95, r * 0.2);
    ctx.closePath(); ctx.fill(); ctx.strokeStyle = "rgba(40,90,130,.7)"; ctx.stroke();
    ctx.fillStyle = T.color;   // 氷の棘
    for (let k = 0; k < 3; k++){
      const bx = r * (0.05 - k * 0.34);
      ctx.beginPath(); ctx.moveTo(bx, -r * 0.5); ctx.lineTo(bx - r * 0.1, -r * (0.86 - k * 0.08)); ctx.lineTo(bx - r * 0.24, -r * 0.44); ctx.closePath(); ctx.fill();
    }
    ctx.fillStyle = "#fff";   // 牙
    ctx.beginPath(); ctx.moveTo(r * 0.62, r * 0.4); ctx.lineTo(r * 0.74, r * 0.4); ctx.lineTo(r * 0.66, r * 0.62); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#062a3a"; ctx.beginPath(); ctx.arc(r * 0.98, -r * 0.05, r * 0.09, 0, 7); ctx.fill();   // 鼻
    ctx.fillStyle = "#19c8ff"; ctx.beginPath(); ctx.arc(r * 0.3, -r * 0.2, r * 0.11, 0, 7); ctx.fill();      // 目
    ctx.fillStyle = "#04222e"; ctx.beginPath(); ctx.arc(r * 0.34, -r * 0.2, r * 0.05, 0, 7); ctx.fill();
    ctx.restore();
  } else if (m.sat === 2){   // ポイズンスポア: 毒キノコ + 漂う胞子
    const bob = Math.sin(t / 500 + ph) * r * 0.06;
    ctx.fillStyle = "rgba(125,255,74,.55)";
    for (let k = 0; k < 3; k++){
      const a = t / 700 + ph + k * 2.1;
      ctx.beginPath(); ctx.arc(Math.cos(a) * r * 1.28, Math.sin(a) * r * 1.1 + bob, r * 0.1, 0, 7); ctx.fill();
    }
    ctx.fillStyle = "#cfe8b0";   // 軸
    ctx.beginPath(); ctx.ellipse(0, r * 0.42 + bob, r * 0.42, r * 0.55, 0, 0, 7); ctx.fill();
    ctx.strokeStyle = "rgba(30,80,20,.6)"; ctx.stroke();
    ctx.fillStyle = "#58c93a";   // 傘
    ctx.beginPath(); ctx.ellipse(0, r * 0.05 + bob, r * 1.08, r * 0.78, 0, Math.PI, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#eaffd0";   // 斑点
    for (const [ox, oy, orr] of [[-0.45, -0.32, 0.16], [0.3, -0.48, 0.2], [0.62, -0.14, 0.12], [-0.05, -0.18, 0.1]]){
      ctx.beginPath(); ctx.arc(ox * r, oy * r + bob, orr * r, 0, 7); ctx.fill();
    }
    ctx.fillStyle = "#1d330d";   // 目 (自機を見る)
    ctx.beginPath(); ctx.arc(Math.cos(la) * r * 0.14 - r * 0.17, r * 0.42 + bob + Math.sin(la) * r * 0.08, r * 0.08, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(Math.cos(la) * r * 0.14 + r * 0.17, r * 0.42 + bob + Math.sin(la) * r * 0.08, r * 0.08, 0, 7); ctx.fill();
  } else if (m.sat === 3){   // クリスタルゴーレム: ゆっくり回る結晶クラスター
    const rot = t / 9000 + ph;
    ctx.fillStyle = "#4a3a5e"; ctx.beginPath(); ctx.arc(0, 0, r * 0.92, 0, 7); ctx.fill();
    for (let k = 0; k < 5; k++){
      const a = rot + k / 5 * Math.PI * 2, ex = Math.cos(a) * r * 0.95, ey = Math.sin(a) * r * 0.95;
      ctx.save(); ctx.translate(ex * 0.55, ey * 0.55); ctx.rotate(a);
      ctx.fillStyle = k % 2 ? "rgba(217,160,255,.85)" : "rgba(180,110,255,.85)";
      ctx.beginPath(); ctx.moveTo(r * 0.52, 0); ctx.lineTo(0, -r * 0.26); ctx.lineTo(r * -0.3, 0); ctx.lineTo(0, r * 0.26); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,.5)"; ctx.stroke(); ctx.restore();
    }
    ctx.save(); ctx.rotate(-rot * 1.7);
    ctx.fillStyle = "#f4e6ff";
    ctx.beginPath(); ctx.moveTo(r * 0.42, 0); ctx.lineTo(0, -r * 0.42); ctx.lineTo(r * -0.42, 0); ctx.lineTo(0, r * 0.42); ctx.closePath(); ctx.fill();
    ctx.restore();
    ctx.fillStyle = "#2a1042"; ctx.beginPath(); ctx.arc(0, 0, r * 0.13, 0, 7); ctx.fill();
  } else if (m.sat === 4){   // レリックガーディアン: 浮遊する石碑 + 衛星キューブ
    const bob = Math.sin(t / 600 + ph) * r * 0.05;
    for (let k = 0; k < 2; k++){
      const a = t / 1600 + ph + k * Math.PI, ox = Math.cos(a) * r * 1.35, oy = Math.sin(a) * r * 1.15 + bob;
      ctx.save(); ctx.translate(ox, oy); ctx.rotate(a * 1.5);
      ctx.fillStyle = "#a8895a"; ctx.fillRect(-r * 0.16, -r * 0.16, r * 0.32, r * 0.32);
      ctx.strokeStyle = "rgba(0,0,0,.5)"; ctx.strokeRect(-r * 0.16, -r * 0.16, r * 0.32, r * 0.32); ctx.restore();
    }
    ctx.fillStyle = "#8a734f";
    ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(-r * 0.78, -r * 0.95 + bob, r * 1.56, r * 1.9, r * 0.24); else ctx.rect(-r * 0.78, -r * 0.95 + bob, r * 1.56, r * 1.9); ctx.fill();
    ctx.strokeStyle = "rgba(40,26,8,.7)"; ctx.stroke();
    ctx.strokeStyle = "#ffd98a"; ctx.lineWidth = Math.max(1, 2 * zoom);
    ctx.beginPath(); ctx.arc(0, -r * 0.18 + bob, r * 0.44, 0, 7); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-r * 0.55, r * 0.55 + bob); ctx.lineTo(r * 0.55, r * 0.55 + bob); ctx.stroke();
    ctx.fillStyle = "#ffe9a8";   // 光る目
    const ex = Math.cos(la) * r * 0.1;
    ctx.fillRect(ex - r * 0.3, -r * 0.3 + bob, r * 0.18, r * 0.09);
    ctx.fillRect(ex + r * 0.14, -r * 0.3 + bob, r * 0.18, r * 0.09);
    ctx.strokeStyle = "rgba(40,26,8,.45)"; ctx.lineWidth = Math.max(1, 1.2 * zoom);   // ひび
    ctx.beginPath(); ctx.moveTo(-r * 0.6, -r * 0.8 + bob); ctx.lineTo(-r * 0.35, -r * 0.4 + bob); ctx.lineTo(-r * 0.5, -r * 0.05 + bob); ctx.stroke();
  } else if (m.sat === 5){   // ディープリーパー: クラゲ (傘 + うねる触手)
    const sq = 1 + 0.08 * Math.sin(t / 380 + ph);
    ctx.strokeStyle = T.color; ctx.lineWidth = Math.max(1.4, 2.6 * zoom); ctx.lineCap = "round";
    for (let k = 0; k < 5; k++){
      const bx = (k - 2) * r * 0.32, wv = Math.sin(t / 300 + ph + k * 1.3) * r * 0.22;
      ctx.beginPath(); ctx.moveTo(bx, r * 0.28);
      ctx.quadraticCurveTo(bx + wv, r * 0.75, bx + wv * 0.4, r * 1.25); ctx.stroke();
    }
    ctx.lineCap = "butt";
    ctx.fillStyle = "rgba(127,232,224,.8)";
    ctx.beginPath(); ctx.ellipse(0, 0, r * 1.02 * sq, r * 0.88 / sq, 0, Math.PI, 0);
    ctx.quadraticCurveTo(r * 0.5, r * 0.5, 0, r * 0.38);
    ctx.quadraticCurveTo(r * -0.5, r * 0.5, r * -1.02 * sq, 0); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = "rgba(10,70,66,.55)"; ctx.lineWidth = Math.max(1, 1.6 * zoom); ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,.75)"; ctx.beginPath(); ctx.arc(0, -r * 0.18, r * 0.3, 0, 7); ctx.fill();
    ctx.fillStyle = "#07332f";
    ctx.beginPath(); ctx.arc(Math.cos(la) * r * 0.16 - r * 0.2, -r * 0.05 + Math.sin(la) * r * 0.1, r * 0.09, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(Math.cos(la) * r * 0.16 + r * 0.2, -r * 0.05 + Math.sin(la) * r * 0.1, r * 0.09, 0, 7); ctx.fill();
  } else if (m.sat === 6){   // ボルトドローン: 回転リング + 放電する機械核
    const rot = t / 500 + ph;
    ctx.strokeStyle = "#788090"; ctx.lineWidth = r * 0.2;
    ctx.beginPath(); ctx.arc(0, 0, r * 0.92, 0, 7); ctx.stroke();
    ctx.fillStyle = "#aab4c4";
    for (let k = 0; k < 4; k++){
      const a = rot + k * Math.PI / 2;
      ctx.beginPath(); ctx.arc(Math.cos(a) * r * 0.92, Math.sin(a) * r * 0.92, r * 0.17, 0, 7); ctx.fill();
    }
    ctx.strokeStyle = "rgba(255,225,77,.9)"; ctx.lineWidth = Math.max(1, 1.6 * zoom);   // 放電
    for (let k = 0; k < 3; k++){
      const a = Math.random() * Math.PI * 2;
      ctx.beginPath(); ctx.moveTo(Math.cos(a) * r * 0.3, Math.sin(a) * r * 0.3);
      ctx.lineTo(Math.cos(a + 0.5) * r * 0.6, Math.sin(a + 0.5) * r * 0.6);
      ctx.lineTo(Math.cos(a) * r * 0.9, Math.sin(a) * r * 0.9); ctx.stroke();
    }
    ctx.fillStyle = "#2a2f3a"; ctx.beginPath(); ctx.arc(0, 0, r * 0.62, 0, 7); ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,.6)"; ctx.stroke();
    const pu = 1 + 0.15 * Math.sin(t / 160 + ph);
    ctx.fillStyle = T.color; ctx.beginPath(); ctx.arc(0, 0, r * 0.3 * pu, 0, 7); ctx.fill();
    ctx.fillStyle = "#fffbe0"; ctx.beginPath(); ctx.arc(0, 0, r * 0.13 * pu, 0, 7); ctx.fill();
  } else if (m.sat === 7){   // サンドワーム: 節のある体 + 開く顎 (節は頭側で描くので本体は drawMobs 側)
    ctx.fillStyle = T.color; ctx.beginPath(); ctx.arc(0, 0, r, 0, 7); ctx.fill();
    ctx.strokeStyle = "rgba(90,60,10,.65)"; ctx.stroke();
    ctx.save(); ctx.rotate(la);
    const open = m.mode === "tele" ? 0.62 : m.mode === "dash" ? 0.5 : 0.3 + 0.08 * Math.sin(t / 300 + ph);
    ctx.fillStyle = "#571f08";   // 口
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, r * 0.78, -open, open); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#fff";   // 牙
    for (const s of [-1, 1]){
      ctx.beginPath(); ctx.moveTo(Math.cos(open * s) * r * 0.76, Math.sin(open * s) * r * 0.76);
      ctx.lineTo(Math.cos(open * s + 0.3 * s) * r * 0.5, Math.sin(open * s + 0.3 * s) * r * 0.5);
      ctx.lineTo(Math.cos(open * s + 0.12 * s) * r * 0.82, Math.sin(open * s + 0.12 * s) * r * 0.82); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
    ctx.fillStyle = "#3a2403";   // 目
    ctx.beginPath(); ctx.arc(Math.cos(la - 0.7) * r * 0.55, Math.sin(la - 0.7) * r * 0.55, r * 0.11, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(Math.cos(la + 0.7) * r * 0.55, Math.sin(la + 0.7) * r * 0.55, r * 0.11, 0, 7); ctx.fill();
  } else if (m.sat === 8){   // アビスアイ: 自機を見つめる巨大な眼球 + 紫の炎
    ctx.fillStyle = "rgba(154,106,255,.55)";
    for (let k = 0; k < 4; k++){
      const a = t / 1200 + ph + k * Math.PI / 2, ox = Math.cos(a) * r * 1.25, oy = Math.sin(a) * r * 1.25;
      ctx.beginPath(); ctx.arc(ox, oy, r * (0.16 + 0.05 * Math.sin(t / 200 + k)), 0, 7); ctx.fill();
    }
    ctx.fillStyle = "#efe9ff"; ctx.beginPath(); ctx.arc(0, 0, r, 0, 7); ctx.fill();
    ctx.strokeStyle = "rgba(80,40,160,.5)";
    for (let k = 0; k < 3; k++){   // 血管
      const a = ph + k * 2.2;
      ctx.beginPath(); ctx.moveTo(Math.cos(a) * r * 0.95, Math.sin(a) * r * 0.95);
      ctx.quadraticCurveTo(Math.cos(a + 0.4) * r * 0.7, Math.sin(a + 0.4) * r * 0.7, Math.cos(a + 0.2) * r * 0.5, Math.sin(a + 0.2) * r * 0.5); ctx.stroke();
    }
    const ix = Math.cos(la) * r * 0.3, iy = Math.sin(la) * r * 0.3;
    ctx.fillStyle = "#6a2aff"; ctx.beginPath(); ctx.arc(ix, iy, r * 0.52, 0, 7); ctx.fill();
    ctx.fillStyle = "#0a0618"; ctx.beginPath(); ctx.arc(ix + Math.cos(la) * r * 0.1, iy + Math.sin(la) * r * 0.1, r * 0.26, 0, 7); ctx.fill();
    ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(ix - r * 0.14, iy - r * 0.16, r * 0.1, 0, 7); ctx.fill();
  } else {   // ノヴァセンチネル: 回る星核 + 周回する破片
    const rot = t / 2600 + ph;
    ctx.fillStyle = "rgba(255,242,176,.16)"; ctx.beginPath(); ctx.arc(0, 0, r * 1.55, 0, 7); ctx.fill();
    ctx.fillStyle = "#e8b64c";
    for (let k = 0; k < 3; k++){
      const a = rot * 2 + k * 2.1, ox = Math.cos(a) * r * 1.45, oy = Math.sin(a) * r * 1.45;
      ctx.save(); ctx.translate(ox, oy); ctx.rotate(a * 2);
      ctx.beginPath(); ctx.moveTo(r * 0.22, 0); ctx.lineTo(0, -r * 0.13); ctx.lineTo(r * -0.22, 0); ctx.lineTo(0, r * 0.13); ctx.closePath(); ctx.fill(); ctx.restore();
    }
    ctx.save(); ctx.rotate(rot);
    ctx.fillStyle = T.color;
    ctx.beginPath();
    for (let k = 0; k < 8; k++){
      const a = k / 8 * Math.PI * 2, rr = k % 2 ? r * 0.45 : r * 1.18;
      k ? ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr) : ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    ctx.closePath(); ctx.fill(); ctx.strokeStyle = "rgba(160,100,10,.7)"; ctx.stroke(); ctx.restore();
    const pu = 1 + 0.1 * Math.sin(t / 300 + ph);
    ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(0, 0, r * 0.3 * pu, 0, 7); ctx.fill();
    ctx.fillStyle = "#7a4d00"; ctx.beginPath(); ctx.arc(Math.cos(la) * r * 0.1, Math.sin(la) * r * 0.1, r * 0.11, 0, 7); ctx.fill();
  }
}
function drawMobs(toScreen, zoom){
  const [psx, psy] = toScreen(player.x, player.y);
  for (const m of mobs){
    if (m.dead) continue;
    const [sx, sy] = toScreen(m.x, m.y), T = m.type, r = T.r * zoom;
    if (sx < -80 || sy < -80 || sx > CW + 80 || sy > CH + 80) continue;
    if (m.mode === "tele"){   // 突進の狙い線
      ctx.save(); ctx.strokeStyle = "rgba(255,60,40,.35)"; ctx.lineWidth = 2; ctx.setLineDash([7, 7]);
      ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(psx, psy); ctx.stroke(); ctx.restore();
    }
    // サンドワームの節 (頭より先に描く)
    if (m.sat === 7 && m.trail){
      for (let k = 4; k >= 1; k--){
        const tp = m.trail[Math.min(k * 5, m.trail.length - 1)]; if (!tp) continue;
        const bx = sx + (tp.x - m.x) * zoom, by = sy + (tp.y - m.y) * zoom, br = r * (1 - k * 0.14);
        ctx.fillStyle = k % 2 ? "#e8c075" : "#d9ae62";
        ctx.beginPath(); ctx.arc(bx, by, br, 0, 7); ctx.fill();
        ctx.strokeStyle = "rgba(90,60,10,.5)"; ctx.lineWidth = 1.5; ctx.stroke(); ctx.lineWidth = 1;
      }
    }
    ctx.save(); ctx.translate(sx, sy);
    if (m.mode === "tele") ctx.translate((Math.random() - .5) * 3, (Math.random() - .5) * 3);
    const la = Math.atan2(player.y - m.y, player.x - m.x);
    drawMobDesign(m, T, r, la);
    if (m.flashT > 0){ ctx.fillStyle = "rgba(255,255,255,.55)"; ctx.beginPath(); ctx.arc(0, 0, r, 0, 7); ctx.fill(); }
    if (m.burnT > 0){ ctx.fillStyle = "rgba(255,110,40,.5)"; ctx.beginPath(); ctx.arc(0, 0, r * 1.08, 0, 7); ctx.fill(); }
    ctx.restore();
    if (m.hp < m.maxHp){   // HPバー
      const w = Math.max(30, r * 2), pct = Math.max(0, m.hp / m.maxHp);
      ctx.fillStyle = "rgba(0,0,0,.6)"; ctx.fillRect(sx - w / 2, sy - r - 12, w, 5);
      ctx.fillStyle = pct > 0.35 ? "#7dff6a" : "#ff5040"; ctx.fillRect(sx - w / 2 + 1, sy - r - 11, (w - 2) * pct, 3);
    }
  }
  // 敵弾 (種ごとに色と大きさが違う)
  for (const s of mobShots){
    const [sx, sy] = toScreen(s.x, s.y);
    ctx.fillStyle = s.color || "#ff5a4a";
    ctx.beginPath(); ctx.arc(sx, sy, (s.r || 5) * zoom + 2, 0, 7); ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,.55)"; ctx.lineWidth = 1.5; ctx.stroke(); ctx.lineWidth = 1;
  }
}

// ---------- HP HUD ----------
let hpHudLast = "";
function updateHpHud(){
  const max = playerMaxHP(), cur = Math.max(0, Math.round(state.hp));
  const key = cur + "/" + max;
  if (key === hpHudLast) return;
  hpHudLast = key;
  const fill = $("hpFill"), txt = $("hpText");
  if (!fill) return;
  const pct = Math.max(0, state.hp / max * 100);
  fill.style.width = pct + "%";
  fill.style.background = pct > 35 ? "linear-gradient(90deg,#3fd95f,#8dff6a)" : "linear-gradient(90deg,#d93f3f,#ff7a5a)";
  txt.textContent = cur.toLocaleString() + " / " + max.toLocaleString();
}
