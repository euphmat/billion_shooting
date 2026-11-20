"use strict";
/* =========================================================
   render/block-tex.js - 素材ごとのブロックのテクスチャ (8x8 のドット絵を前計算)

   - 模様は素材のカテゴリ (+ 一部は素材名) で決め、素材ごとの乱数で形を変える
     (同じ「岩石」でも石ごとに地層の傾きやひびの入り方が違う)
   - 1素材につき 4パターン。ブロックごとにハッシュで選び、タイル感を消す
   - 8x8 を作り、4x4 / 2x2 は平均して縮小する (ズームに合わせて使い分け)
   - 描画側は「テクスチャを ブロックの濃淡 k 倍して書き込む」だけ。
     どの素材でも 1ブロックあたりの処理は同じ (模様の複雑さは前計算に閉じている)
   - 削れたブロックには ひび割れ (全素材共通のマスク) を掛ける
   ========================================================= */
const BTEX_N = 8, BTEX_VARS = 4;
const btexCache = [];   // [素材 index] -> { 8:[4パターン], 4:[...], 2:[...] }  (RGB の Uint8ClampedArray)

function btexRng(seed){
  let s = (seed >>> 0) || 0x2545f491;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}
const btexSeed = str => { let h = 2166136261; for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619); return h >>> 0; };

// 素材 → 模様の種類
function btexStyle(m){
  const k = m.key;
  switch (m.cat){
    case "liquid":
      if (/ice/i.test(k)) return "ice";
      if (/magma|molten|Melt|liquidIron/.test(k)) return "lava";
      if (/gas/i.test(k)) return "gas";
      return "liquid";
    case "soil":
      if (k === "snow") return "snow";
      if (k === "gravel" || k === "ryusite") return "gravel";
      return "soil";
    case "rock":
      if (k === "obsidian") return "glass";
      return "rock";
    case "ore": return "ore";
    case "metal": return "metal";
    case "gem": return "gem";
    case "element":
      if (/uranium|thorium|toxicite|voltore/.test(k)) return "glow";
      return "crystal";
    case "organic":
      if (/wood/i.test(k)) return "wood";
      if (/grass|kelp|moss|rhizom/.test(k)) return "leaf";
      return "pore";
    case "exotic":
      if (k === "yggdrasil") return "wood";
      return "exotic";
  }
  return "soil";
}

// 8x8 のキャンバス (明るさ倍率 Lm と、色の上塗り tint/tw) に模様を描く
function btexPaint(m, variant){
  const N = BTEX_N, n2 = N * N, r = btexRng(btexSeed(m.key) ^ Math.imul(variant + 1, 0x9e3779b1));
  const Lm = new Float32Array(n2).fill(1), Tc = new Float32Array(n2 * 3), Tw = new Float32Array(n2);
  const at = (x, y) => (x < 0 || y < 0 || x >= N || y >= N) ? -1 : y * N + x;
  const mul = (x, y, f) => { const i = at(x, y); if (i >= 0) Lm[i] *= f; };
  const tint = (x, y, c, w) => { const i = at(x, y); if (i < 0) return; const a = Math.max(Tw[i], w); Tc[i * 3] = c[0]; Tc[i * 3 + 1] = c[1]; Tc[i * 3 + 2] = c[2]; Tw[i] = a; };
  const noise = a => { for (let i = 0; i < n2; i++) Lm[i] *= 1 - a + 2 * a * r(); };
  const ri = n => (r() * n) | 0;
  const walk = (len, f, x = ri(N), y = ri(N)) => {   // ひび・割れ目 (ランダムウォーク)
    let dx = r() < 0.5 ? 1 : -1;
    for (let s = 0; s < len; s++){ mul(x, y, f); if (r() < 0.6) x += dx; else y += r() < 0.75 ? 1 : -1; if (r() < 0.15) dx = -dx; }
  };
  // ボロノイ: 各テクセルの最寄りの点と「境界かどうか」
  const voronoi = cnt => {
    const px = [], py = [];
    for (let k = 0; k < cnt; k++){ px.push(r() * N); py.push(r() * N); }
    const id = new Int8Array(n2), edge = new Uint8Array(n2);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++){
      let b1 = 1e9, b2 = 1e9, bi = 0;
      for (let k = 0; k < cnt; k++){
        const dx = x + 0.5 - px[k], dy = y + 0.5 - py[k], d = Math.sqrt(dx * dx + dy * dy);
        if (d < b1){ b2 = b1; b1 = d; bi = k; } else if (d < b2) b2 = d;
      }
      id[y * N + x] = bi; edge[y * N + x] = b2 - b1 < 0.9 ? 1 : 0;
    }
    return { id, edge, px, py };
  };
  const bevel = s => {   // 左上から光が当たる立体感
    for (let k = 0; k < N; k++){
      mul(k, 0, 1 + 0.26 * s); mul(0, k, 1 + 0.14 * s);
      mul(k, N - 1, 1 - 0.30 * s); mul(N - 1, k, 1 - 0.20 * s);
    }
  };
  const W = [255, 255, 255], Y = (m.r * 0.3 + m.g * 0.59 + m.b * 0.11);
  const style = btexStyle(m);

  switch (style){
    case "soil": {
      noise(0.09);
      for (let k = 0; k < 6; k++) mul(ri(N), ri(N), r() < 0.55 ? 0.74 : 1.2);   // 粒
      if (r() < 0.5) walk(3, 0.82);                                               // 根っこ・すじ
      bevel(1);
      break;
    }
    case "snow": {
      noise(0.03);
      for (let x = 0; x < N; x++) tint(x, N - 1, [150, 175, 220], 0.35);
      for (let k = 0; k < 2; k++) tint(1 + ri(N - 2), ri(N - 2), W, 0.9);        // 雪の結晶のきらめき
      bevel(0.9);
      break;
    }
    case "gravel": {
      for (let i = 0; i < n2; i++) Lm[i] = 0.72 + 0.08 * r();
      for (let k = 0; k < 6; k++){                                                // 小石 (上が明るく下が暗い)
        const x = ri(N - 1), y = ri(N - 1), f = 0.95 + 0.25 * r();
        Lm[at(x, y)] = f * 1.18; Lm[at(x + 1, y)] = f * 1.05; Lm[at(x, y + 1)] = f; Lm[at(x + 1, y + 1)] = f * 0.86;
      }
      bevel(0.8);
      break;
    }
    case "rock": {
      if (r() < 0.55){                                                            // 地層
        const ph = r() * 6.28, sl = (r() - 0.5) * 0.9, fr = 1.2 + r() * 0.8;
        for (let y = 0; y < N; y++) for (let x = 0; x < N; x++)
          Lm[y * N + x] = Math.sin(y * fr + x * sl + ph) > 0.25 ? 1.1 : 0.92;
        noise(0.05);
      } else {                                                                    // 石組み
        const v = voronoi(3 + ri(2)), sh = [];
        for (let k = 0; k < 5; k++) sh.push(0.9 + 0.2 * r());
        for (let i = 0; i < n2; i++) Lm[i] = v.edge[i] ? 0.7 : sh[v.id[i]];
        noise(0.04);
      }
      walk(3 + ri(4), 0.66);                                                      // ひび
      bevel(1);
      break;
    }
    case "glass": {                                                               // 黒曜石: 艶のある反射
      noise(0.04);
      const c = 2 + ri(3);
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++){
        const s = x + y;
        if (s === c || s === c + 1) tint(x, y, W, 0.22);
        else if (s === c + 5) tint(x, y, W, 0.1);
      }
      walk(3, 1.5);                                                               // 貝殻状の割れ口 (明るい)
      bevel(1.2);
      break;
    }
    case "ore": {                                                                 // 灰色の母岩 + 素材色の鉱石の粒
      const g = Math.max(40, Y * 0.42), mat = [g * 1.02, g, g * 0.97];
      for (let i = 0; i < n2; i++){ Tc[i * 3] = mat[0]; Tc[i * 3 + 1] = mat[1]; Tc[i * 3 + 2] = mat[2]; Tw[i] = 0.72; }
      noise(0.08);
      const cnt = 3 + ri(2);
      for (let k = 0; k < cnt; k++){
        const x = ri(N - 2), y = ri(N - 2), big = r() < 0.5;
        const cells = big ? [[0, 0], [1, 0], [0, 1], [1, 1]] : [[0, 0], [1, 0], [1, 1]];
        for (const [ox, oy] of cells){ const i = at(x + ox, y + oy); Tw[i] = 0; Lm[i] = 1.12; }
        Lm[at(x, y)] = 1.42;                                                      // 粒の光沢
        const sd = at(x + 1, y + 2); if (sd >= 0 && Tw[sd] > 0) Lm[sd] *= 0.7;    // 粒の影
      }
      bevel(1);
      break;
    }
    case "metal": {                                                               // ヘアライン + 斜めの光沢 + リベット
      const rows = []; for (let y = 0; y < N; y++) rows.push(1 + (r() - 0.5) * 0.12);
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) Lm[y * N + x] = rows[y] * (1 + (r() - 0.5) * 0.03);
      const c = 3 + variant;
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++){
        const s = x + y;
        if (s === c) Lm[y * N + x] *= 1.3; else if (s === c + 1) Lm[y * N + x] *= 1.14; else if (s === c - 1) Lm[y * N + x] *= 1.08;
      }
      if (variant & 1){ for (const [x, y] of [[1, 1], [6, 1], [1, 6], [6, 6]]){ mul(x, y, 1.4); mul(x + 1, y + 1, 0.72); } }
      else { const y = 3 + ri(2); for (let x = 1; x < N - 1; x++){ mul(x, y, 0.72); mul(x, y + 1, 1.12); } }   // パネルの継ぎ目
      bevel(1.5);
      break;
    }
    case "gem": {                                                                 // カット面 (上が明るく下が暗い) + きらめき
      const tb = 1.5 + (variant & 1) * 0.6, cx = 3.5 + (r() - 0.5), cy = 3.5 + (r() - 0.5);
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++){
        const dx = x + 0.5 - cx - 0.5, dy = y + 0.5 - cy - 0.5, ax = Math.abs(dx), ay = Math.abs(dy);
        let f;
        if (ax + ay <= tb) f = 1.16;                                              // テーブル面
        else if (dy < 0 && ay >= ax) f = 1.32;
        else if (dx < 0 && ax > ay) f = 1.08;
        else if (dx > 0 && ax > ay) f = 0.84;
        else f = 0.66;
        if (Math.abs(ax + ay - tb - 0.5) < 0.5) f *= 1.1;                         // 面の稜線
        Lm[y * N + x] = f;
      }
      const sx = 1 + ri(3), sy = 1 + ri(3);
      tint(sx, sy, W, 0.9); tint(sx + 1, sy, W, 0.4); tint(sx - 1, sy, W, 0.4); tint(sx, sy + 1, W, 0.4); tint(sx, sy - 1, W, 0.4);
      bevel(0.6);
      break;
    }
    case "crystal": {                                                             // 結晶の粒 (面ごとに明暗 + 艶)
      const v = voronoi(4 + ri(2)), sh = [];
      for (let k = 0; k < 6; k++) sh.push(0.84 + 0.32 * r());
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++){
        const i = y * N + x, k = v.id[i];
        let f = v.edge[i] ? 0.72 : sh[k];
        if (!v.edge[i] && x + 0.5 < v.px[k] && y + 0.5 < v.py[k]) f *= 1.12;     // 粒の左上が明るい
        Lm[i] = f;
      }
      tint(ri(N), ri(N), W, 0.5);
      bevel(1);
      break;
    }
    case "glow": {                                                                // 放射性: 暗い母材の中で光る粒
      for (let i = 0; i < n2; i++) Lm[i] = 0.62 + 0.12 * r();
      for (let k = 0; k < 7; k++){
        const x = ri(N), y = ri(N);
        mul(x, y, 1.9); tint(x, y, [255, 255, 220], 0.35);
        mul(x + 1, y, 1.3); mul(x - 1, y, 1.3); mul(x, y + 1, 1.3); mul(x, y - 1, 1.3);
      }
      bevel(1);
      break;
    }
    case "liquid": {                                                              // 波頭 + 深さのグラデーション + 反射
      const ph = r() * 6.28, fq = 0.7 + r() * 0.5;
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) Lm[y * N + x] = 1.06 - 0.18 * y / (N - 1);
      for (let x = 0; x < N; x++){
        const wy = 1 + Math.round(1 + Math.sin(x * fq + ph));
        mul(x, wy, 1.28); mul(x, wy + 1, 0.9);
        mul(x, wy + 4, 1.13); mul(x, wy + 5, 0.94);
      }
      tint(1 + ri(2), ri(2), W, 0.55);
      bevel(0.5);
      break;
    }
    case "ice": {                                                                 // 斜めの光の筋 + 白いひび
      const c = ri(5);
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++){
        const s = ((x - y + c) % 6 + 6) % 6;
        if (s === 0) { Lm[y * N + x] = 1.18; tint(x, y, W, 0.3); }
        else Lm[y * N + x] = 1 - 0.1 * y / N;
      }
      { let x = ri(N), y = ri(N); for (let s = 0; s < 4; s++){ tint(x, y, [235, 250, 255], 0.55); x += r() < 0.5 ? 1 : -1; y += r() < 0.6 ? 1 : 0; } }
      bevel(1.1);
      break;
    }
    case "lava": {                                                                // 黒い岩殻の隙間から光る溶岩
      const v = voronoi(3 + ri(2)), crust = [m.r * 0.3, m.g * 0.18, m.b * 0.15];
      for (let i = 0; i < n2; i++){
        if (v.edge[i]){ Lm[i] = 1.25; Tc[i * 3] = 255; Tc[i * 3 + 1] = 236; Tc[i * 3 + 2] = 140; Tw[i] = 0.4; }
        else { Lm[i] = 0.9 + 0.2 * r(); Tc[i * 3] = crust[0]; Tc[i * 3 + 1] = crust[1]; Tc[i * 3 + 2] = crust[2]; Tw[i] = 0.55 + 0.2 * r(); }
      }
      bevel(0.6);
      break;
    }
    case "gas": {                                                                 // ふわっとした濃淡 + 泡
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) Lm[y * N + x] = 0.92 + 0.1 * Math.sin(x * 0.9 + y * 0.6 + variant);
      for (let k = 0; k < 3; k++){
        const x = ri(N - 1), y = ri(N - 1);
        tint(x, y, W, 0.55); mul(x + 1, y + 1, 0.82); mul(x + 1, y, 1.1); mul(x, y + 1, 1.1);
      }
      bevel(0.5);
      break;
    }
    case "wood": {                                                                // 木目 + 節
      const ph = r() * 6.28, fq = 1.5 + r() * 0.8;
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++)
        Lm[y * N + x] = 1 + 0.13 * Math.sin(x * fq + Math.sin(y * 0.7 + ph) * 1.3);
      if (r() < 0.6){ const x = 1 + ri(N - 2), y = 1 + ri(N - 2); mul(x, y, 0.62); mul(x - 1, y, 0.86); mul(x + 1, y, 0.86); mul(x, y - 1, 0.9); mul(x, y + 1, 0.9); }
      noise(0.03);
      bevel(1);
      break;
    }
    case "leaf": {                                                                // 草葉: 縦の葉 + 明るい先端
      const col = []; for (let x = 0; x < N; x++) col.push(0.84 + 0.3 * r());
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) Lm[y * N + x] = col[x] * (1.1 - 0.22 * y / (N - 1));
      for (let k = 0; k < 4; k++){ const x = ri(N), y = ri(N - 3); mul(x, y, 1.3); mul(x, y + 1, 1.12); }
      noise(0.04);
      bevel(0.8);
      break;
    }
    case "pore": {                                                                // 骨・珊瑚・貝: 小さな穴とその縁
      noise(0.07);
      for (let k = 0; k < 4; k++){ const x = ri(N - 1), y = ri(N - 1); mul(x, y, 0.66); mul(x + 1, y + 1, 1.15); mul(x - 1, y - 1, 0.9); }
      if (r() < 0.5){ const y = 2 + ri(4); for (let x = 0; x < N; x++) mul(x, y + (x > 3 ? 1 : 0), 1.1); }   // 成長線
      bevel(1);
      break;
    }
    case "exotic": {                                                              // 渦巻く光 + 星屑
      const cx = 3.5 + (r() - 0.5) * 2, cy = 3.5 + (r() - 0.5) * 2, ph = r() * 6.28, arms = 2 + ri(2);
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++){
        const dx = x + 0.5 - cx, dy = y + 0.5 - cy, d = Math.sqrt(dx * dx + dy * dy) / 5;
        Lm[y * N + x] = 1.28 - 0.5 * d + 0.14 * Math.sin(Math.atan2(dy, dx) * arms + d * 7 + ph);
      }
      const star = Y < 90 ? [220, 200, 255] : W;
      for (let k = 0; k < 3; k++) tint(ri(N), ri(N), star, 0.75);
      bevel(0.7);
      break;
    }
  }

  // 合成: 素材色 x 明るさ → 上塗り色を混ぜる
  const out = new Uint8ClampedArray(n2 * 3);
  for (let i = 0; i < n2; i++){
    const w = Tw[i], l = Lm[i];
    out[i * 3]     = (m.r * (1 - w) + Tc[i * 3] * w) * l;
    out[i * 3 + 1] = (m.g * (1 - w) + Tc[i * 3 + 1] * w) * l;
    out[i * 3 + 2] = (m.b * (1 - w) + Tc[i * 3 + 2] * w) * l;
  }
  return out;
}
// 平均で縮小 (8 → 4 → 2)
function btexDown(src, N){
  const H = N >> 1, out = new Uint8ClampedArray(H * H * 3);
  for (let y = 0; y < H; y++) for (let x = 0; x < H; x++) for (let c = 0; c < 3; c++){
    const a = ((2 * y) * N + 2 * x) * 3 + c;
    out[(y * H + x) * 3 + c] = (src[a] + src[a + 3] + src[a + N * 3] + src[a + N * 3 + 3]) / 4;
  }
  return out;
}
// 素材 mi の T x T テクスチャ (パターン v)。初回に 8/4/2 をまとめて作る
function blockTex(mi, T, v){
  let e = btexCache[mi];
  if (!e){
    e = btexCache[mi] = { 8: [], 4: [], 2: [] };
    for (let k = 0; k < BTEX_VARS; k++){
      const t8 = btexPaint(MATS[mi], k), t4 = btexDown(t8, 8);
      e[8].push(t8); e[4].push(t4); e[2].push(btexDown(t4, 4));
    }
  }
  return e[T][v];
}

// ---------- ひび割れ (削れ具合 3段階 x 2パターン、全素材共通) ----------
// 明るさの倍率 (0..1) を T x T で持つ。ひびの無いところは 1
const crackMasks = (() => {
  const N = BTEX_N, res = [];
  for (let lv = 1; lv <= 3; lv++){
    const row = [];
    for (let v = 0; v < 2; v++){
      const r = btexRng(0xc0ffee + lv * 97 + v * 13), m8 = new Float32Array(N * N).fill(1);
      const hit = (x, y, f) => { if (x >= 0 && y >= 0 && x < N && y < N) m8[y * N + x] = Math.min(m8[y * N + x], f); };
      const lines = lv;   // 段階ごとに筋が増える
      for (let l = 0; l < lines; l++){
        let x = 3 + ((r() * 2) | 0), y = 3 + ((r() * 2) | 0);
        const dx = r() < 0.5 ? 1 : -1, dy = r() < 0.5 ? 1 : -1, len = 2 + lv;
        for (let s = 0; s < len; s++){
          hit(x, y, 0.38); hit(x + 1, y + 1, 0.8);
          if (r() < 0.55) x += dx; else y += dy;
          if (r() < 0.3) { if (r() < 0.5) x += dx; else y += dy; }
        }
      }
      const pack = (src, n) => { const o = new Float32Array(n * n), k = N / n;
        for (let y = 0; y < n; y++) for (let x = 0; x < n; x++){ let s = 0; for (let j = 0; j < k; j++) for (let i = 0; i < k; i++) s += src[(y * k + j) * N + x * k + i]; o[y * n + x] = s / (k * k); }
        return o; };
      row.push({ 8: m8, 4: pack(m8, 4), 2: pack(m8, 2) });
    }
    res.push(row);
  }
  return res;
})();
