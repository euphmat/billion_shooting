"use strict";
/* =========================================================
   render/unit-art.js - 自機・ボット・砲台・機兵の SVG アート

   全ての機体を SVG (グラデーション・発光フィルタ・パネルライン入り) で描き、
   起動時に1回だけキャンバスへラスタライズして使い回す。毎フレームの処理は
   drawImage だけ (パス描画・グラデーション生成・ctx.filter は一切しない)。

   - 解像度の段階 (ミップ): 各アートを 最大倍率, 1/2, 1/4 … の数段で焼いておき、
     画面上の大きさに一番近い段を選ぶ。縮小しすぎのギザギザと、拡大のボケを両方防ぐ
   - アニメーションは「部品を重ねる」方式: 本体 + 噴射炎 (伸縮・揺らぎ) + 発光コア (明滅) +
     回る部品 (ローター / 砲身)。歩行・ドリル回転は数コマのフレームを焼いて切り替える
   - 武器の色で塗る部品 (攻撃ボットのコアなど) は色ごとに初回だけ焼く
   - SVG の読み込みは非同期 (数ミリ秒)。焼き上がるまでのその機体は描かない

   使い方 (描画側):
     uaXf(x, y, ang, sx, sy)      画面座標 (CSS px) に機体の座標系を置く (+x が機首)
     uaImg(A, ox, oy, s, sy)      アート A の原点を機体座標 (ox, oy) に置き、s 倍で描く
     uaEnd()                      変換を基準 (dpr) に戻す
   ========================================================= */

const UA_MAXPX = 512;   // 1枚の最大ピクセル (メモリの上限)
const UA_tint = new Map();   // テンプレート名 -> Map(色 -> アート)
let UA_S = 1;                // いまの変換の拡大率 (段の選択に使う)

// vb: [x0, y0, w, h] (アートの座標系。原点 = 回転の中心 / 取り付け点)。maxScale: 最大の画面倍率 (CSS px あたり × dpr)
function uaDef(vb, maxScale, inner){
  const [x0, y0, w, h] = vb;
  const top = Math.min(maxScale, UA_MAXPX / Math.max(w, h));
  const lv = [], sc = [];
  for (let s = top; ; s /= 2){
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(w * s)); c.height = Math.max(1, Math.round(h * s));
    lv.push(c); sc.push(s);
    if (Math.max(w, h) * s < 24) break;
  }
  const A = { x0, y0, w, h, lv, sc, ready: false };
  const img = new Image();
  img.onload = () => {
    for (const c of lv){ const g = c.getContext("2d"); g.clearRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height); }
    A.ready = true;
  };
  img.onerror = () => {   // 万一 SVG を読めない環境: 目印の丸だけ描いて、機体が消えるのだけは避ける
    for (const c of lv){ const g = c.getContext("2d"), r = Math.min(c.width, c.height) * 0.3; g.fillStyle = "#cfe6ff"; g.beginPath(); g.arc(-x0 / w * c.width, -y0 / h * c.height, r, 0, 7); g.fill(); }
    A.ready = true;
  };
  img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x0} ${y0} ${w} ${h}" width="${lv[0].width}" height="${lv[0].height}">${inner}</svg>`);
  return A;
}
// 色つきテンプレート: 初めて使う色のときだけ焼く
function uaTint(name, color){
  let m = UA_tint.get(name);
  if (!m){ m = new Map(); UA_tint.set(name, m); }
  let A = m.get(color);
  if (!A){ A = UA_TPL[name](color); m.set(color, A); }
  return A;
}

// ---------- 毎フレームの描画 (setTransform + drawImage だけ) ----------
function uaXf(x, y, a, sx, sy){
  if (sx === undefined) sx = 1;
  if (sy === undefined) sy = sx;
  const k = DPR, c = Math.cos(a) * k, s = Math.sin(a) * k;
  ctx.setTransform(c * sx, s * sx, -s * sy, c * sy, x * k, y * k);
  UA_S = sx > sy ? sx : sy;
}
function uaImg(A, ox, oy, s, sy){
  if (!A.ready) return;
  const need = s * DPR * UA_S * 0.85, sc = A.sc;
  let i = sc.length - 1;
  while (i > 0 && sc[i] < need) i--;
  const ys = sy === undefined ? s : sy;
  ctx.drawImage(A.lv[i], ox + A.x0 * s, oy + A.y0 * ys, A.w * s, A.h * ys);
}
function uaEnd(){ ctx.setTransform(DPR, 0, 0, DPR, 0, 0); }

// ---------- SVG の部品 ----------
const uaBlur = (id, sd) => `<filter id="${id}" x="-80%" y="-80%" width="260%" height="260%"><feGaussianBlur stdDeviation="${sd}"/></filter>`;
const uaLin = (id, x1, y1, x2, y2, stops) => `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}">${uaStops(stops)}</linearGradient>`;
const uaRad = (id, cx, cy, r, stops) => `<radialGradient id="${id}" gradientUnits="userSpaceOnUse" cx="${cx}" cy="${cy}" r="${r}">${uaStops(stops)}</radialGradient>`;
const uaStops = st => st.map(([o, c, a]) => `<stop offset="${o}" stop-color="${c}"${a === undefined ? "" : ` stop-opacity="${a}"`}/>`).join("");
const uaPoly = (n, r, rot, cx = 0, cy = 0) => { let s = ""; for (let k = 0; k < n; k++){ const a = rot + k * Math.PI * 2 / n; s += `${(cx + Math.cos(a) * r).toFixed(2)},${(cy + Math.sin(a) * r).toFixed(2)} `; } return s; };
const uaRot = (n, fn) => { let s = ""; for (let k = 0; k < n; k++) s += fn(k * 360 / n, k); return s; };

// ---------- 色つきテンプレート ----------
const SHIP_HULL = "M18 0L-4 -6.5L-13 -16L-16.5 -15L-11.5 -5L-14 0L-11.5 5L-16.5 15L-13 16L-4 6.5Z";
const UA_TPL = {
  // 発光コア: 白い芯 → 色 → 透明
  glow: c => uaDef([-8, -8, 16, 16], 6, `<defs>${uaRad("g", 0, 0, 8, [[0, "#fff"], [0.22, "#fff"], [0.42, c], [1, c, 0]])}</defs><circle r="8" fill="url(#g)"/>`),
  // 噴射炎: 原点 = ノズル、-x 方向へ伸びる
  flame: c => uaDef([-27, -6, 30, 12], 5, `<defs>${uaLin("o", 0, 0, -24, 0, [[0, c, 0.95], [0.55, c, 0.5], [1, c, 0]])}${uaLin("i", 0, 0, -11, 0, [[0, "#fff"], [1, "#fff", 0]])}${uaBlur("b", 1.1)}</defs>
    <path d="M1 -4C-6 -4.6 -14 -2.6 -24 0C-14 2.6 -6 4.6 1 4Z" fill="url(#o)" filter="url(#b)"/>
    <path d="M0.5 -2C-3 -2 -7 -1.2 -11 0C-7 1.2 -3 2 0.5 2Z" fill="url(#i)"/>`),
  // 残像 / 影分身: 発光する輪郭のシルエット
  ghost: c => uaDef([-20, -19, 40, 38], 3, `<defs>${uaBlur("b", 1.6)}</defs><path d="${SHIP_HULL}" fill="${c}" opacity=".45" filter="url(#b)"/><path d="${SHIP_HULL}" fill="${c}" fill-opacity=".18" stroke="${c}" stroke-width="1.1" stroke-linejoin="round"/>`),
  // 自機型の戦闘機 (自機 / 僚機)。trim: 翼の発光ライン, canopy: キャノピーの色
  ship: c => {
    const [trim, canopy, rim] = c.split(",");
    return uaDef([-20, -19, 40, 38], 3.2, `<defs>
      ${uaLin("w", 0, -16, 0, 16, [[0, "#30506f"], [0.48, "#162840"], [0.52, "#122236"], [1, "#081120"]])}
      ${uaLin("f", 0, -4, 0, 4, [[0, "#ffffff"], [0.45, "#cfdeea"], [1, "#56708a"]])}
      ${uaRad("c", 7, -0.8, 5, [[0, "#f0ffff"], [0.35, canopy], [1, "#06243a"]])}
      ${uaBlur("b", 1.3)}</defs>
      <path d="${SHIP_HULL}" fill="${rim}" opacity=".5" filter="url(#b)"/>
      <path d="${SHIP_HULL}" fill="url(#w)" stroke="#cdeeff" stroke-width=".9" stroke-linejoin="round"/>
      <path d="M-5 -6.5L-10.5 -7L-12 -10.5ZM-5 6.5L-10.5 7L-12 10.5Z" fill="#3f6c92"/>
      <path d="M-2.5 -7.6L-12.6 -14.8M-2.5 7.6L-12.6 14.8" stroke="${trim}" stroke-width="1.4" stroke-linecap="round"/>
      <path d="M-2.5 -7.6L-12.6 -14.8M-2.5 7.6L-12.6 14.8" stroke="${trim}" stroke-width="3" stroke-linecap="round" opacity=".35" filter="url(#b)"/>
      <path d="M19.5 0L7 -3.9L-9 -3.7L-12.6 0L-9 3.7L7 3.9Z" fill="url(#f)" stroke="#fff" stroke-width=".5" stroke-linejoin="round"/>
      <path d="M-9.5 0H3M-2 -3.7V3.7M-6 -3.6V3.6" stroke="#5a7590" stroke-width=".5"/>
      <ellipse cx="6.8" cy="0" rx="5.2" ry="2.2" fill="url(#c)" stroke="#06243a" stroke-width=".5"/>
      <ellipse cx="8.2" cy="-.85" rx="2.1" ry=".6" fill="#fff" opacity=".85"/>
      <rect x="-15.2" y="-3.5" width="3.8" height="2.6" rx=".7" fill="#36424f" stroke="#a6bfd0" stroke-width=".4"/>
      <rect x="-15.2" y=".9" width="3.8" height="2.6" rx=".7" fill="#36424f" stroke="#a6bfd0" stroke-width=".4"/>
      <circle cx="-14.4" cy="-15.3" r="1.1" fill="#ff4d6d"/><circle cx="-14.4" cy="15.3" r="1.1" fill="#57e39a"/>`);
  },
  // 固有覚醒の砲台 (武器の色)
  evoBase: c => uaDef([-13, -13, 26, 26], 4, `<defs>${uaRad("g", -2, -2, 12, [[0, "#3a4656"], [1, "#0d1219"]])}${uaBlur("b", 1.4)}</defs>
    <polygon points="${uaPoly(6, 10, 0)}" fill="${c}" opacity=".45" filter="url(#b)"/>
    <polygon points="${uaPoly(6, 9.5, 0)}" fill="url(#g)" stroke="${c}" stroke-width="1.6" stroke-linejoin="round"/>
    <polygon points="${uaPoly(6, 6, Math.PI / 6)}" fill="none" stroke="${c}" stroke-opacity=".5" stroke-width=".8"/>
    ${uaRot(6, a => `<circle cx="7.3" cy="0" r=".7" fill="#dfe8f0" transform="rotate(${a + 30})"/>`)}`),
  evoGun: c => uaDef([-4, -3.5, 20, 7], 5, `<rect x="0" y="-1.8" width="13.5" height="3.6" rx=".9" fill="${c}" stroke="#fff" stroke-width=".5"/><rect x="2" y="-.6" width="10" height="1.2" fill="#fff" opacity=".8"/><rect x="12" y="-2.6" width="2.8" height="5.2" rx=".6" fill="#e9eef3"/><circle r="3.6" fill="#1a222c" stroke="${c}" stroke-width="1"/><circle r="1.4" fill="#fff"/>`),
};

// ---------- 固定のアート ----------
const UA = (() => {
  const A = {};
  // 自機 (白銀の機体 + シアンの発光ライン) / 僚機 (緑)
  A.ship = uaTint("ship", "#7df9ff,#7df9ff,#7df9ff");
  A.wing = uaTint("ship", "#57e39a,#9cffc8,#57e39a");
  // 影 (地表に落ちる。光源は左上固定なので回転と別に右下へずらして描く)
  A.shipShadow = uaDef([-22, -21, 44, 42], 2, `<defs>${uaBlur("b", 1.8)}</defs><path d="${SHIP_HULL}" fill="#000" filter="url(#b)"/>`);
  A.blob = uaDef([-14, -14, 28, 28], 2, `<defs>${uaBlur("b", 2)}</defs><circle r="9" fill="#000" filter="url(#b)"/>`);

  // 攻撃ボット: ガンメタの六角装甲 + 左右のエンジンポッド + 主砲。中央のソケットに武器色のコアを重ねる
  const BOT_HEX = "M9 0L4.5 -8.5L-6 -8.5L-10.5 0L-6 8.5L4.5 8.5Z";
  A.bot = uaDef([-17, -17, 35, 34], 3, `<defs>
    ${uaLin("h", 0, -9, 0, 9, [[0, "#93a7ba"], [0.5, "#3b4856"], [1, "#141a21"]])}
    ${uaLin("p", 0, -3, 0, 3, [[0, "#76899c"], [1, "#1b232c"]])}
    ${uaLin("m", 0, -2, 0, 2, [[0, "#c9d6e2"], [1, "#3a4654"]])}
    ${uaBlur("b", 1.3)}</defs>
    <path d="${BOT_HEX}" fill="#9fd8ff" opacity=".4" filter="url(#b)"/>
    <path d="M-4.5 -8L-2 -10.5M-4.5 8L-2 10.5M1.5 -8L1.5 -10.5M1.5 8L1.5 10.5" stroke="#5d6d7d" stroke-width="1.8"/>
    <g transform="translate(0 -12)"><rect x="-12" y="-3" width="15.5" height="6" rx="2.6" fill="url(#p)" stroke="#c8d6e2" stroke-width=".7"/><rect x="-12.6" y="-2" width="2" height="4" rx=".8" fill="#ffb067"/><path d="M-1 -3V3M1.6 -3V3" stroke="#ffd60a" stroke-width="1" opacity=".9"/></g>
    <g transform="translate(0 12)"><rect x="-12" y="-3" width="15.5" height="6" rx="2.6" fill="url(#p)" stroke="#c8d6e2" stroke-width=".7"/><rect x="-12.6" y="-2" width="2" height="4" rx=".8" fill="#ffb067"/><path d="M-1 -3V3M1.6 -3V3" stroke="#ffd60a" stroke-width="1" opacity=".9"/></g>
    <rect x="5" y="-2.1" width="11" height="4.2" rx="1" fill="url(#m)" stroke="#e1e9f0" stroke-width=".5"/>
    <rect x="14.6" y="-2.9" width="3" height="5.8" rx=".7" fill="#dfe7ee" stroke="#7d8d9c" stroke-width=".4"/>
    <path d="${BOT_HEX}" fill="url(#h)" stroke="#e6eef5" stroke-width=".9" stroke-linejoin="round"/>
    <path d="M4.5 -8.5L2.2 -4.7M4.5 8.5L2.2 4.7M-6 -8.5L-4.3 -4.7M-6 8.5L-4.3 4.7M-10.5 0H-6.3M9 0H6" stroke="#1d252e" stroke-width=".7"/>
    <path d="M-5.3 -7.6H3.8" stroke="#fff" stroke-opacity=".55" stroke-width=".8"/>
    <circle r="4.9" fill="#0a0f15" stroke="#aebdca" stroke-width=".8"/>
    <circle r="3.4" fill="none" stroke="#2f3a46" stroke-width="1"/>
    <circle cx="-7.6" cy="-3.8" r=".65" fill="#dfe7ee"/><circle cx="-7.6" cy="3.8" r=".65" fill="#dfe7ee"/><circle cx="5.6" cy="-5.6" r=".65" fill="#dfe7ee"/><circle cx="5.6" cy="5.6" r=".65" fill="#dfe7ee"/>`);
  A.botShadow = uaDef([-18, -18, 36, 36], 2, `<defs>${uaBlur("b", 1.8)}</defs><g fill="#000" filter="url(#b)"><path d="${BOT_HEX}"/><rect x="-12" y="-15" width="15.5" height="6" rx="2.6"/><rect x="-12" y="9" width="15.5" height="6" rx="2.6"/><rect x="5" y="-2" width="12" height="4"/></g>`);

  // コイン回収ボット: 金のドーム + 回るローターリング
  A.cbot = uaDef([-12, -12, 24, 24], 3.5, `<defs>
    ${uaRad("g", -2.6, -2.8, 9, [[0, "#fffbe0"], [0.35, "#ffd60a"], [1, "#8a6200"]])}
    ${uaBlur("b", 1.5)}</defs>
    <circle r="9.5" fill="#ffd60a" opacity=".4" filter="url(#b)"/>
    <circle r="9.2" fill="#1f1b0f" stroke="#ffe680" stroke-width=".8"/>
    ${uaRot(8, a => `<rect x="7.4" y="-.7" width="1.8" height="1.4" fill="#6b5410" transform="rotate(${a})"/>`)}
    <circle r="7" fill="url(#g)" stroke="#a87a00" stroke-width=".7"/>
    <circle r="3.6" fill="none" stroke="#9a6f00" stroke-width="1.1"/>
    <circle r="1.6" fill="#fff6c0"/>
    <ellipse cx="-2.6" cy="-3.6" rx="2.6" ry="1.1" fill="#fff" opacity=".75" transform="rotate(-35 -2.6 -3.6)"/>`);
  A.cbRing = uaDef([-16, -16, 32, 32], 3.5, `<defs>${uaBlur("b", 1)}</defs>
    <circle r="12.4" fill="none" stroke="#ffd60a" stroke-opacity=".28" stroke-width="1.1" stroke-dasharray="5 3.2"/>
    ${uaRot(3, a => `<g transform="rotate(${a})"><path d="M12.4 0A12.4 12.4 0 0 1 8.4 9.1" fill="none" stroke="#ffe680" stroke-width="2.4" stroke-linecap="round" opacity=".35" filter="url(#b)"/><path d="M12.4 0A12.4 12.4 0 0 1 10.2 7" fill="none" stroke="#ffe680" stroke-width="1" stroke-linecap="round" opacity=".7"/><circle cx="12.4" cy="0" r="2.6" fill="#ffd60a" opacity=".55" filter="url(#b)"/><circle cx="12.4" cy="0" r="1.7" fill="#fff4b8" stroke="#a87a00" stroke-width=".5"/></g>`)}`);

  // 守護衛星: 菱形のコア + 太陽電池パネル
  A.sat = uaDef([-14, -9, 28, 18], 4, `<defs>${uaLin("p", 0, -3.5, 0, 3.5, [[0, "#3c7fb8"], [1, "#0f2f52"]])}${uaRad("c", 0, 0, 5, [[0, "#e6fff0"], [0.4, "#57e39a"], [1, "#0f5a35"]])}${uaBlur("b", 1.2)}</defs>
    <path d="M-4 0H4" stroke="#b7c6d3" stroke-width="1.2"/>
    <rect x="-13" y="-3.5" width="8.5" height="7" fill="url(#p)" stroke="#9fd8ff" stroke-width=".5"/><path d="M-10.2 -3.5V3.5M-7.4 -3.5V3.5M-13 0H-4.5" stroke="#9fd8ff" stroke-opacity=".5" stroke-width=".4"/>
    <rect x="4.5" y="-3.5" width="8.5" height="7" fill="url(#p)" stroke="#9fd8ff" stroke-width=".5"/><path d="M7.3 -3.5V3.5M10.1 -3.5V3.5M4.5 0H13" stroke="#9fd8ff" stroke-opacity=".5" stroke-width=".4"/>
    <path d="M0 -6L4.2 0L0 6L-4.2 0Z" fill="#57e39a" opacity=".5" filter="url(#b)"/>
    <path d="M0 -5.5L4 0L0 5.5L-4 0Z" fill="url(#c)" stroke="#c9ffe0" stroke-width=".6"/>
    <path d="M0 -5.5V-8" stroke="#c9ffe0" stroke-width=".6"/><circle cx="0" cy="-8" r=".8" fill="#fff"/>`);

  // 簡易砲台 (シアン): 三脚の台座 + 旋回砲 (単装 / 連装)
  A.turBase = uaDef([-16, -16, 32, 32], 4, `<defs>${uaRad("g", -3, -3, 14, [[0, "#2d4e5a"], [1, "#0b1a20"]])}${uaBlur("b", 1.4)}</defs>
    ${uaRot(3, a => `<g transform="rotate(${a + 90})"><path d="M3 -2L13.5 -3L14.5 0L13.5 3L3 2Z" fill="#1b323b" stroke="#7df9ff" stroke-width=".8" stroke-linejoin="round"/><circle cx="13" cy="0" r="1.6" fill="#0b1a20" stroke="#9adfe8" stroke-width=".6"/></g>`)}
    <polygon points="${uaPoly(8, 9.5, Math.PI / 8)}" fill="#7df9ff" opacity=".35" filter="url(#b)"/>
    <polygon points="${uaPoly(8, 9, Math.PI / 8)}" fill="url(#g)" stroke="#7df9ff" stroke-width="1.1" stroke-linejoin="round"/>
    <circle r="6.6" fill="none" stroke="#4fb8c4" stroke-width=".7" stroke-dasharray="1.4 1.2"/>
    ${uaRot(4, a => `<circle cx="7.6" cy="0" r=".6" fill="#d8fbff" transform="rotate(${a + 45})"/>`)}`);
  const turGun = twin => uaDef([-8, -7, 31, 14], 5, `<defs>${uaLin("m", 0, -2, 0, 2, [[0, "#eafcff"], [0.5, "#9adfe8"], [1, "#3d7480"]])}${uaRad("t", -1.5, -1.5, 6.5, [[0, "#4b8a98"], [1, "#122a31"]])}</defs>
    ${(twin ? [-2.7, 2.7] : [0]).map(y => `<rect x="2" y="${y - 1.8}" width="17" height="3.6" rx=".8" fill="url(#m)" stroke="#d8fbff" stroke-width=".45"/><rect x="17.6" y="${y - 2.4}" width="3.4" height="4.8" rx=".7" fill="#c8f4fa" stroke="#3d7480" stroke-width=".4"/><rect x="8" y="${y - 2.1}" width="1.6" height="4.2" fill="#2f6470"/>`).join("")}
    <rect x="-6.8" y="-3.2" width="3.4" height="6.4" rx="1" fill="#1b323b" stroke="#7df9ff" stroke-width=".5"/>
    <circle r="5.6" fill="url(#t)" stroke="#7df9ff" stroke-width=".9"/>
    <circle r="2" fill="#d8fbff"/>`);
  A.turGun = turGun(false); A.turGun2 = turGun(true);

  // プロト (シアンの小型ドローン): 両脇のスラスタ + 前方の銃。中央に発光コアを重ねる
  A.proto = uaDef([-15, -15, 30, 30], 4, `<defs>${uaRad("g", -3, -3, 11, [[0, "#3b7f8f"], [1, "#0a2229"]])}${uaBlur("b", 1.4)}</defs>
    <circle r="10.5" fill="#7df9ff" opacity=".3" filter="url(#b)"/>
    <rect x="-5" y="-14" width="10" height="5" rx="2.2" fill="#1e4552" stroke="#7df9ff" stroke-width=".7"/><rect x="-5" y="9" width="10" height="5" rx="2.2" fill="#1e4552" stroke="#7df9ff" stroke-width=".7"/>
    <rect x="-6" y="-13" width="1.6" height="3" fill="#7df9ff"/><rect x="-6" y="10" width="1.6" height="3" fill="#7df9ff"/>
    <rect x="7" y="-1.5" width="7" height="3" rx=".7" fill="#9adfe8" stroke="#eafcff" stroke-width=".4"/>
    <circle r="9.5" fill="url(#g)" stroke="#7df9ff" stroke-width="1.2"/>
    <circle r="5.6" fill="#071a20" stroke="#4fb8c4" stroke-width=".7"/>
    <path d="M-6 -7A9.5 9.5 0 0 1 6 -7" fill="none" stroke="#eafcff" stroke-opacity=".6" stroke-width=".8"/>`);
  // 自爆ドローン (オレンジのダート)
  A.kami = uaDef([-9, -7, 19, 14], 5, `<defs>${uaLin("o", 0, -5, 0, 5, [[0, "#ffc27a"], [0.5, "#ff8a2a"], [1, "#9a3d0a"]])}${uaBlur("b", 1)}</defs>
    <path d="M9 0L-6 -5.5L-4 0L-6 5.5Z" fill="#ff9a3c" opacity=".45" filter="url(#b)"/>
    <path d="M9 0L-6 -5.5L-4 0L-6 5.5Z" fill="url(#o)" stroke="#ffe0b0" stroke-width=".6" stroke-linejoin="round"/>
    <path d="M9 0L3.4 -2.4L3.4 2.4Z" fill="#fff1d6"/><path d="M2.2 -3V3" stroke="#d2321e" stroke-width="1.3"/>
    <path d="M-1 -2.6L-4.2 -4.4M-1 2.6L-4.2 4.4" stroke="#6b2a06" stroke-width=".6"/>`);
  // 地雷 (点灯 / 消灯の2コマ)
  const mine = on => uaDef([-7, -7, 14, 14], 6, `<defs>${uaBlur("b", 1.2)}</defs>
    ${uaRot(6, a => `<path d="M3 -.9L5.6 0L3 .9Z" fill="#8a8f96" transform="rotate(${a})"/>`)}
    <circle r="3.6" fill="#2a2d33" stroke="#8a8f96" stroke-width=".6"/>
    ${on ? `<circle r="3" fill="#ff5340" opacity=".8" filter="url(#b)"/><circle r="1.7" fill="#ff5340"/><circle r=".7" fill="#fff"/>` : `<circle r="1.5" fill="#7a1f16"/>`}`);
  A.mineOn = mine(true); A.mineOff = mine(false);

  // ---- 自律機兵 (紫) ----
  const VHULL = [[0, "#2a2160"], [0.5, "#6a58f0"], [1, "#130e2e"]];
  A.hunter = uaDef([-24, -18, 49, 36], 4, `<defs>${uaLin("h", 0, -12, 0, 12, VHULL)}${uaRad("e", 5, 0, 6, [[0, "#fff"], [0.35, "#ff6fa8"], [1, "#ff3d8a", 0]])}${uaBlur("b", 1.5)}</defs>
    <path d="M20 0L-2 -14L-15.5 -12L-9 0L-15.5 12L-2 14Z" fill="#8c7dff" opacity=".45" filter="url(#b)"/>
    <path d="M6 -4L12.5 -15L8.5 -16.2L-4 -9ZM6 4L12.5 15L8.5 16.2L-4 9Z" fill="#3a3080" stroke="#cfc4ff" stroke-width=".8" stroke-linejoin="round"/>
    <path d="M20 0L-2 -12L-14 -10L-8.5 0L-14 10L-2 12Z" fill="url(#h)" stroke="#e1d9ff" stroke-width="1" stroke-linejoin="round"/>
    <path d="M-2 -8L10 -2M-2 8L10 2" stroke="#a99cff" stroke-width="1"/>
    <path d="M-8 -5L-3 -1M-8 5L-3 1" stroke="#130e2e" stroke-width=".8"/>
    <rect x="-15.4" y="-7.6" width="4.2" height="3.4" rx=".8" fill="#1c1640" stroke="#b9a8ff" stroke-width=".5"/><rect x="-15.4" y="4.2" width="4.2" height="3.4" rx=".8" fill="#1c1640" stroke="#b9a8ff" stroke-width=".5"/>
    <path d="M19 0H23.5" stroke="#ffd0ec" stroke-width="1.3" stroke-linecap="round"/>
    <circle cx="5" cy="0" r="6" fill="url(#e)"/><circle cx="5" cy="0" r="1.5" fill="#fff"/>`);
  // ドリラー: ドリルの溝と履帯が回る4コマ (溝は3本なので 1/3 周で1巡)
  A.driller = [0, 1, 2, 3].map(fi => {
    const f = fi / 12;
    let grooves = "";
    for (let k = 0; k < 3; k++){
      const p = (f + k / 3) % 1, x = 3 + p * 21, hh = 11.5 * (1 - (x - 2) / 26), hh2 = 11.5 * (1 - (x + 2.6 - 2) / 26);
      grooves += `<path d="M${x.toFixed(2)} ${(-hh).toFixed(2)}L${(x + 2.6).toFixed(2)} ${hh2.toFixed(2)}" stroke="#fff" stroke-opacity="${(0.35 + 0.5 * (1 - p)).toFixed(2)}" stroke-width="1.1"/><path d="M${(x - 1).toFixed(2)} ${(-hh).toFixed(2)}L${(x + 1.6).toFixed(2)} ${hh2.toFixed(2)}" stroke="#2a2340" stroke-opacity=".5" stroke-width=".8"/>`;
    }
    return uaDef([-23, -17, 53, 34], 4, `<defs>${uaLin("b", 0, -11, 0, 11, [[0, "#6a5cc8"], [0.5, "#3e3466"], [1, "#1a1530"]])}${uaLin("c", 0, -11, 0, 11, [[0, "#f1eeff"], [0.45, "#b4acd8"], [1, "#4d4770"]])}${uaRad("k", -8, 0, 7, [[0, "#fff"], [0.45, "#8c7dff"], [1, "#8c7dff", 0]])}</defs>
      ${[-12, 12].map(y => `<rect x="-21" y="${y - 2.8}" width="24" height="5.6" rx="2.2" fill="#1d1830" stroke="#8c7dff" stroke-width=".8"/><path d="M-20 ${y}H2" stroke="#5b4bd6" stroke-width="3" stroke-dasharray="1.2 1.8" stroke-dashoffset="${(-fi * 0.75).toFixed(2)}"/>`).join("")}
      <rect x="-18" y="-10.5" width="21" height="21" rx="3" fill="url(#b)" stroke="#a99cff" stroke-width="1"/>
      <path d="M-15 -7H-1M-15 7H-1" stroke="#1a1530" stroke-width=".8"/>
      <circle cx="-8" cy="0" r="7" fill="url(#k)"/>
      <path d="M2 -11.5L28 0L2 11.5Z" fill="url(#c)" stroke="#ece8ff" stroke-width=".8" stroke-linejoin="round"/>
      ${grooves}
      <rect x="0" y="-12.6" width="3.6" height="25.2" rx="1" fill="#5b4bd6" stroke="#ece8ff" stroke-width=".6"/>`);
  });
  // スパイダー: 8本脚の歩行6コマ (+ 噛みつきの大顎を重ねる)
  A.spider = [0, 1, 2, 3, 4, 5].map(fi => {
    const w = fi / 6 * Math.PI * 2;
    let legs = "", under = "";
    for (let i = 0; i < 4; i++){
      const ph = Math.sin(w + i * 1.6) * 0.35, ax = -5 + i * 3.4;
      for (const sg of [-1, 1]){
        const d = `M${ax.toFixed(2)} 0L${(ax + 2 + ph * 6).toFixed(2)} ${sg * 8}L${(ax + 4 + ph * 9).toFixed(2)} ${sg * 13}`;
        under += `<path d="${d}"/>`;
        legs += `<path d="${d}"/><circle cx="${(ax + 2 + ph * 6).toFixed(2)}" cy="${sg * 8}" r="1"/>`;
      }
    }
    return uaDef([-17, -17, 34, 34], 5, `<defs>${uaRad("a", -4.5, -1.5, 8, [[0, "#5a4a9c"], [1, "#16112c"]])}${uaRad("t", 4, -1, 4.5, [[0, "#6b5bc0"], [1, "#1f1840"]])}${uaBlur("b", 1.2)}</defs>
      <g fill="none" stroke="#0d0a1c" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round">${under}</g>
      <g fill="#e2dbff" stroke="#b9a8ff" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${legs}</g>
      <ellipse cx="-3" cy="0" rx="8" ry="6" fill="#8c7dff" opacity=".35" filter="url(#b)"/>
      <ellipse cx="-3.5" cy="0" rx="7" ry="5.6" fill="url(#a)" stroke="#b9a8ff" stroke-width=".9"/>
      <path d="M-8.5 0H-1M-7 -3.4L-2 -1.6M-7 3.4L-2 1.6" stroke="#ff6fa8" stroke-width=".9" stroke-linecap="round" opacity=".85"/>
      <circle cx="4.2" cy="0" r="4" fill="url(#t)" stroke="#b9a8ff" stroke-width=".8"/>
      <circle cx="6.4" cy="-1.9" r="1.3" fill="#ff6fa8"/><circle cx="6.4" cy="1.9" r="1.3" fill="#ff6fa8"/><circle cx="7.4" cy="-.7" r=".7" fill="#ffb3d1"/><circle cx="7.4" cy=".7" r=".7" fill="#ffb3d1"/>`);
  });
  A.spiderBite = uaDef([5, -6, 11, 12], 5, `<defs>${uaBlur("b", .8)}</defs><path d="M7.5 -4L13 0L7.5 4" fill="none" stroke="#fff" stroke-width="2.4" opacity=".5" filter="url(#b)"/><path d="M7.5 -4L13 0L7.5 4" fill="none" stroke="#fff" stroke-width="1.2" stroke-linejoin="round"/><circle cx="13.2" cy="0" r="1.2" fill="#fff"/>`);
  // テスラ: 銅コイルの輪 + 3本の放電端子 (回転) / 中心の光球 (脈動)
  A.teslaRing = uaDef([-27, -27, 54, 54], 4, `<defs>${uaBlur("b", 1.6)}</defs>
    <circle r="21" fill="none" stroke="#9ff0ff" stroke-width="2.6" opacity=".45" filter="url(#b)"/>
    <circle r="17" fill="none" stroke="#1d2f42" stroke-width="7"/>
    <circle r="17" fill="none" stroke="#c88a42" stroke-width="5" stroke-dasharray="1.1 1.4"/>
    <circle r="17" fill="none" stroke="#ffd2a0" stroke-width=".6" stroke-dasharray="1.1 1.4" opacity=".7"/>
    <circle r="13.4" fill="none" stroke="#5f86a8" stroke-width="1"/>
    <circle r="21" fill="none" stroke="#9ff0ff" stroke-width="1.1"/>
    ${uaRot(3, a => `<g transform="rotate(${a - 90})"><path d="M16 -3.8L23.5 -1.7L23.5 1.7L16 3.8Z" fill="#c9f6ff" stroke="#fff" stroke-width=".5"/><circle cx="24.4" cy="0" r="2.4" fill="#9ff0ff" opacity=".7" filter="url(#b)"/><circle cx="24.4" cy="0" r="1.4" fill="#fff"/></g>`)}`);
  A.teslaCore = uaDef([-14, -14, 28, 28], 4, `<defs>${uaRad("g", 0, 0, 12, [[0, "#fff"], [0.3, "#e9feff"], [0.5, "#7df9ff", 0.85], [1, "#7df9ff", 0]])}${uaBlur("b", 1)}</defs>
    <circle r="12" fill="url(#g)"/><path d="M-5 -2L-1 1L2 -3L5 2" fill="none" stroke="#fff" stroke-width=".9" filter="url(#b)"/>`);
  // ボマー: 大型の全翼機 + 地表の影 (影は焼いた黒シルエット。ctx.filter は使わない)
  const BOMB_HULL = "M25 0L-6 -33L-18 -31L-10 -8L-20 0L-10 8L-18 31L-6 33Z";
  A.bomber = uaDef([-38, -38, 76, 76], 3, `<defs>${uaLin("h", 0, -30, 0, 30, [[0, "#1b1636"], [0.5, "#4f42a8"], [1, "#100c22"]])}${uaRad("c", 10, -1, 6, [[0, "#ffffff"], [0.4, "#dcd4ff"], [1, "#5b4bd6"]])}${uaBlur("b", 1.8)}</defs>
    <path d="${BOMB_HULL}" fill="#b9a8ff" opacity=".35" filter="url(#b)"/>
    <path d="${BOMB_HULL}" fill="url(#h)" stroke="#c8bcff" stroke-width="1.3" stroke-linejoin="round"/>
    <path d="M-4 -21L12 -5M-4 21L12 5" stroke="#ffaa5a" stroke-width="1.2" opacity=".85"/>
    <path d="M-8 -26L-14 -12M-8 26L-14 12M2 -14L-4 -6M2 14L-4 6" stroke="#0d0a1c" stroke-width=".8"/>
    <rect x="-20.5" y="-27" width="10" height="6" rx="2" fill="#2a2346" stroke="#b9a8ff" stroke-width=".8"/><rect x="-20.5" y="21" width="10" height="6" rx="2" fill="#2a2346" stroke="#b9a8ff" stroke-width=".8"/>
    <rect x="-11" y="-5" width="15" height="10" rx="2" fill="#15112a" stroke="#8c7dff" stroke-width=".8"/>
    <path d="M-7.5 -5V5M-3.5 -5V5M.5 -5V5" stroke="#3e3466" stroke-width="1"/>
    <ellipse cx="9" cy="0" rx="6.5" ry="3.6" fill="url(#c)" stroke="#2a2346" stroke-width=".6"/>
    <ellipse cx="10.5" cy="-1.3" rx="2.4" ry=".8" fill="#fff" opacity=".85"/>
    <circle cx="-15" cy="-31.5" r="1.3" fill="#ffaa5a"/><circle cx="-15" cy="31.5" r="1.3" fill="#ffaa5a"/>`);
  A.bomberShadow = uaDef([-40, -40, 80, 80], 1.5, `<defs>${uaBlur("b", 2.4)}</defs><path d="${BOMB_HULL}" fill="#000" filter="url(#b)"/>`);
  // キャノン: 八角の要塞台座 + 旋回砲塔 (発射で後退)
  A.cannonBase = uaDef([-28, -28, 56, 56], 3, `<defs>${uaRad("g", -5, -6, 26, [[0, "#3c3270"], [1, "#120e24"]])}${uaRad("r", -3, -3, 15, [[0, "#4d4290"], [1, "#1f1940"]])}${uaBlur("b", 1.8)}</defs>
    <polygon points="${uaPoly(8, 23, Math.PI / 8)}" fill="#8c7dff" opacity=".35" filter="url(#b)"/>
    <polygon points="${uaPoly(8, 22, Math.PI / 8)}" fill="url(#g)" stroke="#8c7dff" stroke-width="1.6" stroke-linejoin="round"/>
    <polygon points="${uaPoly(8, 18, Math.PI / 8)}" fill="none" stroke="#2c2452" stroke-width="1.2"/>
    ${uaRot(4, a => `<g transform="rotate(${a + 45})"><rect x="15.5" y="-4" width="6" height="8" rx="1" fill="#5b4bd6" stroke="#dcd4ff" stroke-width=".6"/><circle cx="18.5" cy="0" r="1.1" fill="#ffaa5a"/></g>`)}
    <circle r="14" fill="url(#r)" stroke="#a99cff" stroke-width="1.2"/>
    <circle r="11" fill="none" stroke="#8c7dff" stroke-width="1.2" stroke-dasharray="1.5 2"/>`);
  A.cannonGun = uaDef([-9, -8, 39, 16], 5, `<defs>${uaLin("m", 0, -3.5, 0, 3.5, [[0, "#a99cff"], [0.5, "#5b4bd6"], [1, "#241c58"]])}${uaRad("t", -2, -2, 8, [[0, "#6b5bc0"], [1, "#1f1840"]])}</defs>
    <rect x="2" y="-3.5" width="22" height="7" rx="1.2" fill="url(#m)" stroke="#dcd4ff" stroke-width=".8"/>
    <path d="M6 -1.2H22" stroke="#fff" stroke-opacity=".45" stroke-width=".8"/>
    <rect x="8" y="-4.3" width="3" height="8.6" rx=".6" fill="#3e3466" stroke="#dcd4ff" stroke-width=".5"/>
    <rect x="23" y="-4.8" width="5.4" height="9.6" rx="1" fill="#2a2346" stroke="#dcd4ff" stroke-width=".7"/>
    <path d="M24.6 -4.8V4.8M26.6 -4.8V4.8" stroke="#8c7dff" stroke-width=".6"/>
    <rect x="-8" y="-4.5" width="5" height="9" rx="1.2" fill="#2a2346" stroke="#a99cff" stroke-width=".6"/>
    <circle r="7.2" fill="url(#t)" stroke="#dcd4ff" stroke-width="1"/>
    <circle r="2.6" fill="#ff6fa8"/><circle cx="-.7" cy="-.7" r=".9" fill="#fff"/>`);
  // タイタン: 胴体 / 脚 (歩行で前後) / 影。目の光は glow を重ねて明滅
  A.titanBody = uaDef([-34, -38, 68, 76], 3, `<defs>${uaLin("h", 0, -28, 0, 28, [[0, "#151129"], [0.5, "#5b4bd6"], [1, "#0f0b20"]])}${uaLin("s", 0, -7, 0, 7, [[0, "#5a4ea0"], [1, "#221c44"]])}${uaBlur("b", 2)}</defs>
    <path d="M26 0L12 -24L-20 -28L-28 0L-20 28L12 24Z" fill="#8c7dff" opacity=".35" filter="url(#b)"/>
    <path d="M26 0L12 -24L-20 -28L-28 0L-20 28L12 24Z" fill="url(#h)" stroke="#dcd4ff" stroke-width="2" stroke-linejoin="round"/>
    <path d="M18 0L8 -16L-16 -19L-21 0L-16 19L8 16Z" fill="none" stroke="#2c2452" stroke-width="1.4"/>
    <path d="M-21 0H2M-12 -19L-6 -6M-12 19L-6 6" stroke="#a99cff" stroke-width="1" opacity=".7"/>
    ${[-1, 1].map(sg => `<g transform="translate(0 ${sg * 26})"><rect x="-15" y="-8" width="22" height="16" rx="2.5" fill="url(#s)" stroke="#dcd4ff" stroke-width="1.4"/>${[0, 1, 2].map(q => `<rect x="${-11 + q * 6}" y="-2.5" width="3.4" height="5" rx=".8" fill="#ffb070"/><rect x="${-11 + q * 6}" y="-2.5" width="3.4" height="1.6" fill="#fff" opacity=".6"/>`).join("")}</g>`).join("")}
    <circle cx="10" cy="0" r="7.5" fill="#0a0716" stroke="#a99cff" stroke-width="1.2"/>`);
  A.titanLeg = uaDef([-12, -11, 40, 22], 3, `<defs>${uaLin("l", 0, -7, 0, 7, [[0, "#4a3e9e"], [1, "#1c1734"]])}</defs>
    <rect x="-10" y="-7" width="30" height="14" rx="3" fill="url(#l)" stroke="#8c7dff" stroke-width="1.6"/>
    <rect x="-1" y="-2" width="15" height="4" rx="1" fill="#c9c2e8" stroke="#6f6890" stroke-width=".5"/>
    <rect x="14" y="-9" width="12" height="18" rx="2.5" fill="#4a3e9e" stroke="#b9a8ff" stroke-width="1.4"/>
    <path d="M18 -9V9M22 -9V9" stroke="#221c44" stroke-width="1"/>
    <circle cx="-4" cy="0" r="3.8" fill="#1a1433" stroke="#b9a8ff" stroke-width="1.1"/><circle cx="-4" cy="0" r="1.3" fill="#ff6fa8"/>`);
  A.titanShadow = uaDef([-52, -32, 96, 76], 1.2, `<defs>${uaBlur("b", 4)}</defs><ellipse cx="-4" cy="6" rx="42" ry="32" fill="#000" filter="url(#b)"/>`);
  // ナノマシン: 銀の六角 + 公転する粒 (焼き込み。群れでも1機1枚)
  const nanite = om => uaDef([-15, -15, 30, 30], 4, `<defs>${uaRad("h", 0, 0, 14.5, [[0, om ? "#ff4d6d" : "#b9a8ff", 0.4], [1, om ? "#ff4d6d" : "#b9a8ff", 0]])}${uaLin("s", 0, -6, 0, 6, [[0, "#ffffff"], [0.5, "#d8d4ea"], [1, "#8d88a8"]])}</defs>
    <circle r="14.5" fill="url(#h)"/>
    <polygon points="${uaPoly(6, 6, 0)}" fill="url(#s)" stroke="${om ? "#ff4d6d" : "#8c7dff"}" stroke-width="1.2" stroke-linejoin="round"/>
    <path d="M-3 -5.2L3 5.2M3 -5.2L-3 5.2" stroke="#8d88a8" stroke-width=".5"/>
    <circle r="2" fill="${om ? "#ff4d6d" : "#ff6fa8"}"/><circle r=".8" fill="#fff"/>
    ${uaRot(3, a => `<rect x="10" y="-1" width="2" height="2" fill="#e6e0ff" transform="rotate(${a + 20})"/>`)}`);
  A.nanite = nanite(false); A.naniteOm = nanite(true);

  // ---- 奥義の機体 ----
  // ファンネル: 菱形ビット + 尾翼 + 発光コア
  A.funnel = uaDef([-28, -18, 56, 36], 4, `<defs>${uaLin("b", 0, -11, 0, 11, [[0, "#41617e"], [0.5, "#1c2a38"], [1, "#0b1118"]])}${uaRad("c", -2, 0, 9, [[0, "#ffffff"], [0.35, "#57e39a"], [1, "#57e39a", 0]])}${uaBlur("g", 1.5)}</defs>
    <path d="M20 0L2 -11L-16 -5L-20 0L-16 5L2 11Z" fill="#7df9ff" opacity=".35" filter="url(#g)"/>
    <path d="M-14 -4L-24 -13L-10 -10ZM-14 4L-24 13L-10 10Z" fill="#57e39a" stroke="#c9ffe0" stroke-width=".6" stroke-linejoin="round"/>
    <path d="M20 0L2 -11L-16 -5L-20 0L-16 5L2 11Z" fill="url(#b)" stroke="#7df9ff" stroke-width="1.4" stroke-linejoin="round"/>
    <path d="M2 -11L6 0L2 11M-16 -5L-10 0L-16 5" fill="none" stroke="#0b1118" stroke-width=".8"/>
    <path d="M2 -9.5L14 -2.5" stroke="#dff6ff" stroke-opacity=".5" stroke-width=".8"/>
    <rect x="13" y="-1.3" width="10.5" height="2.6" rx=".6" fill="#dff6ff"/>
    <circle cx="-2" cy="0" r="9" fill="url(#c)"/>`);
  // オービタル: 二重リング + 装甲セグメント + 金のコア
  A.orbital = uaDef([-52, -52, 104, 104], 3, `<defs>${uaRad("c", 0, 0, 17, [[0, "#ffffff"], [0.3, "#ffd60a"], [0.7, "#ff9628", 0.55], [1, "#ff9628", 0]])}${uaLin("a", 0, -8, 0, 8, [[0, "#6b8bab"], [1, "#22374d"]])}${uaBlur("b", 2)}</defs>
    <circle r="46" fill="none" stroke="#7df9ff" stroke-width="4" opacity=".35" filter="url(#b)"/>
    <circle r="40" fill="none" stroke="#1d2b3a" stroke-width="12"/>
    <circle r="40" fill="none" stroke="#3a5470" stroke-width="10" stroke-dasharray="3 5"/>
    <circle r="46" fill="none" stroke="#7df9ff" stroke-width="2.2"/>
    <circle r="34" fill="none" stroke="#57e39a" stroke-width="2.6"/>
    <circle r="34" fill="none" stroke="#c9ffe0" stroke-width=".8" stroke-dasharray="2 6"/>
    ${uaRot(4, a => `<g transform="rotate(${a + 45})"><rect x="33" y="-6" width="14" height="12" rx="2" fill="url(#a)" stroke="#cfe9ff" stroke-width=".8"/><rect x="37" y="-2" width="6" height="4" fill="#7df9ff"/></g>`)}
    <circle r="17" fill="url(#c)"/>
    <circle r="9" fill="none" stroke="#ffe9a8" stroke-width="1.6"/>`);
  // 母艦: 多層装甲の弩級艦 (鼻は +x)
  A.mothership = uaDef([-100, -50, 200, 100], 2.6, `<defs>
    ${uaLin("h", 0, -32, 0, 32, [[0, "#14202f"], [0.5, "#456583"], [1, "#0a0f16"]])}
    ${uaLin("k", -60, 0, 70, 0, [[0, "#7df9ff", 0], [0.5, "#dff6ff"], [1, "#7df9ff", 0]])}
    ${uaRad("c", 18, 0, 16, [[0, "#ffffff"], [0.4, "#7df9ff"], [1, "#7df9ff", 0]])}
    ${uaRad("e", -84, 0, 30, [[0, "#a0f0ff", 0.8], [1, "#a0f0ff", 0]])}
    ${uaBlur("b", 2.5)}</defs>
    <circle cx="-84" cy="0" r="30" fill="url(#e)"/>
    <path d="M96 0L52 -20L8 -30L-52 -26L-84 -12L-84 12L-52 26L8 30L52 20Z" fill="#9fd8ff" opacity=".3" filter="url(#b)"/>
    ${[-1, 1].map(s => `<path d="M30 ${s * 30}L-30 ${s * 39}L-62 ${s * 31}L-20 ${s * 22}Z" fill="#22364c" stroke="#7df9ff" stroke-width="1.6" stroke-linejoin="round"/><path d="M-54 ${s * 31}L-24 ${s * 36}" stroke="#7df9ff" stroke-opacity=".5" stroke-width="1"/>`).join("")}
    <path d="M96 0L52 -20L8 -30L-52 -26L-84 -12L-84 12L-52 26L8 30L52 20Z" fill="url(#h)" stroke="#9fd8ff" stroke-width="2" stroke-linejoin="round"/>
    <path d="M80 0L48 -14L8 -22L-48 -19L-74 -8L-74 8L-48 19L8 22L48 14Z" fill="none" stroke="#0a0f16" stroke-width="1.2"/>
    <path d="M60 -13L-40 -18M60 13L-40 18" stroke="#ffd60a" stroke-opacity=".8" stroke-width="2"/>
    ${[-44, -16, 16, 44].map(o => `<path d="M${o} -24V24" stroke="#7df9ff" stroke-opacity=".45" stroke-width="1.2"/>`).join("")}
    ${[-70, -58, -46].map(x => `<rect x="${x}" y="-9" width="6" height="3" fill="#ffb070"/><rect x="${x}" y="6" width="6" height="3" fill="#ffb070"/>`).join("")}
    <rect x="-60" y="-3.5" width="130" height="7" fill="url(#k)"/>
    <circle cx="18" cy="0" r="16" fill="url(#c)"/>
    ${[-16, 16].map(y => `<circle cx="34" cy="${y}" r="8" fill="#486581" stroke="#dff6ff" stroke-width="1.4"/><rect x="34" y="${y - 1.6}" width="12" height="3.2" rx=".8" fill="#dff6ff"/>`).join("")}
    <rect x="-90" y="-11" width="7" height="22" rx="2" fill="#2b3f55" stroke="#9fd8ff" stroke-width="1"/>`);
  return A;
})();
// 色つき部品の参照 (よく使う色はここで先に焼いておく)
const uaFlame = c => uaTint("flame", c);
const uaGlow = c => uaTint("glow", c);
const UA_FLAME_CYAN = uaFlame("#7df9ff"), UA_FLAME_ORANGE = uaFlame("#ff9a3c"), UA_FLAME_VIOLET = uaFlame("#a99cff"), UA_FLAME_GREEN = uaFlame("#57e39a");
const UA_GHOST_CYAN = uaTint("ghost", "#7df9ff"), UA_GHOST_WHITE = uaTint("ghost", "#ffffff");
