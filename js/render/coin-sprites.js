"use strict";
/* =========================================================
   render/coin-sprites.js - コインのスプライト (額面の10段階)
   ========================================================= */

// ---------- コインのスプライト (大きさ・色ごとに1回だけ描いて使い回す) ----------
// 額面の10段階カラーラダー: 10倍ごとに色がはっきり変わる。合体で育った大判コインほど
// 大きく・豪華になる (最大半径19 = 直径約1.6ブロックで頭打ち)。段階判定は額面ベースで、
// 合体コインも単体コインも同じ表を通る。
// fx: "" 通常 / "halo" 外周グロー (段階色) / "haloSpark" グロー+キラキラ / "rainbow" 虹縁+グロー+キラキラ
const COIN_TIERS = [
  { min: 0,          r: 6,    fill: "#da844a", stroke: "#8f4f1e", lw: 1 },                                                              // 銅
  { min: 10,         r: 7,    fill: "#b04a28", stroke: "#5e2110", lw: 1 },                                                              // 赤銅
  { min: 100,        r: 8,    fill: "#ccd3da", stroke: "#7e8894", lw: 1 },                                                              // 銀
  { min: 1000,       r: 9.5,  fill: "#f4f9fb", stroke: "#a8c4d4", lw: 1.5 },                                                            // プラチナ
  { min: 10000,      r: 11,   fill: "#ffd60a", stroke: "#a88600", lw: 1.5 },                                                            // 金
  { min: 100000,     r: 12.5, fill: "#ff9500", stroke: "#a34d00", lw: 2 },                                                              // 濃金
  { min: 1000000,    r: 14,   fill: "#17b978", stroke: "#075e2c", lw: 2, fx: "halo",      halo: "46,224,140",  letter: "#ffffff" },    // エメラルド
  { min: 10000000,   r: 15.5, fill: "#1f6feb", stroke: "#0d3f8f", lw: 2, fx: "halo",      halo: "80,150,255",  letter: "#ffffff" },    // サファイア
  { min: 100000000,  r: 17,   fill: "#a55eea", stroke: "#5e2b97", lw: 2, fx: "haloSpark", halo: "190,110,255", letter: "#ffffff" },    // アメジスト
  { min: 1000000000, r: 19,   fill: "#fff6a8", stroke: "#ffffff", lw: 2.5, fx: "rainbow" },                                             // 虹
];
function coinTierOf(v){
  let t = 0;
  for (let i = 1; i < COIN_TIERS.length; i++) if (v >= COIN_TIERS[i].min) t = i;
  return t;
}
const coinSprites = new Map();
function coinSprite(r, fill, stroke, lw, fx, letter, haloCol){
  const halo = fx === "halo" || fx === "haloSpark" || fx === "rainbow", rainbow = fx === "rainbow";
  const key = r + "|" + fill + "|" + stroke + "|" + lw + "|" + (fx || "") + "|" + (letter || "") + "|" + (haloCol || "");
  let sp = coinSprites.get(key);
  if (sp) return sp;
  const pad = halo ? 6 : 0;   // ハロー (外周のグロー) のぶんだけキャンバスを広げる。本体の見かけ半径は r のまま
  const S = 2, size = Math.ceil((r + pad) * 2 + lw + 2), cv2 = document.createElement("canvas");   // 高解像度ディスプレイ用に2倍で描く
  cv2.width = cv2.height = size * S;
  const g = cv2.getContext("2d"), c = size / 2;
  g.scale(S, S);
  if (halo){   // 外周グロー: 段階色の輪 + 外側へにじむ影
    g.beginPath(); g.arc(c, c, r + 4.5, 0, 7);
    g.strokeStyle = rainbow ? "rgba(255,240,180,.55)" : `rgba(${haloCol || "255,214,10"},.5)`; g.lineWidth = 3; g.stroke();
    g.beginPath(); g.arc(c, c, r + 1.5, 0, 7);
    g.strokeStyle = "rgba(255,255,255,.35)"; g.lineWidth = 1; g.stroke();
  }
  g.beginPath(); g.arc(c, c, r, 0, 7);
  g.fillStyle = fill; g.fill();
  if (rainbow){   // 最高額面: 縁を虹色の6分割にする
    for (let k = 0; k < 6; k++){
      g.beginPath(); g.arc(c, c, r - lw / 2, k * Math.PI / 3, (k + 1) * Math.PI / 3);
      g.strokeStyle = `hsl(${k * 60}, 95%, 62%)`; g.lineWidth = lw; g.stroke();
    }
  } else {
    g.strokeStyle = stroke; g.lineWidth = lw; g.stroke();
  }
  g.fillStyle = letter || "#000"; g.font = `bold ${Math.round(r * 1.3)}px monospace`; g.textAlign = "center";
  g.fillText("C", c, c + r * 0.45);
  if (rainbow || fx === "haloSpark"){   // キラキラ (十字の星) を2つ焼き込む
    g.strokeStyle = "rgba(255,255,255,.95)"; g.lineWidth = 1.4;
    for (const [sx, sy, sr] of [[c - r * 0.45, c - r * 0.5, 3.4], [c + r * 0.5, c - r * 0.28, 2.6]]){
      g.beginPath();
      g.moveTo(sx - sr, sy); g.lineTo(sx + sr, sy);
      g.moveTo(sx, sy - sr); g.lineTo(sx, sy + sr);
      g.stroke();
    }
  }
  sp = { cv: cv2, size };
  coinSprites.set(key, sp);
  return sp;
}
function coinSpriteFor(c){
  const v = c.value;
  if (c.chest) return coinSprite(14, v >= 1000 ? "#ffe95e" : "#ffd60a", v >= 10000 ? "#ffffff" : "#a88600", v >= 10000 ? 2 : 1);
  const T = COIN_TIERS[coinTierOf(v)];
  return coinSprite(T.r, T.fill, T.stroke, T.lw, T.fx, T.letter, T.halo);
}
