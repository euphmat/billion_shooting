"use strict";
/* =========================================================
   planet.js - 1億ブロック惑星 (素材でできた地球)

   軽量化の設計 (ここが肝):
   - 1億ブロック分の HP 配列は作らない (Int32 でも約800MBになる)
   - 未損傷ブロックは「存在する・HP満タン」が座標から計算できる
     => 最大HP・素材は座標の決定的関数として都度計算する
   - 破壊済みは 1ブロック=1bit のビットマップ (全体で約16MB)
   - 部分ダメージ中は最大でも画面周辺の数十個しかない
     => Map で疎に保持する
   - 合計数は行ごとの円の幅から数え、端数を丸めて
     ちょうど 100,000,000 個に調整する (起動は一瞬)
   ========================================================= */
const BS = 24;                    // block size (world units)
const R  = 5642;                  // planet radius (blocks)
const GC = 7400;                  // 世界の中心 (グリッド座標)。メイン惑星の中心はここにある
const D  = GC * 2 + 1;            // grid width / height (14801)
const R2 = R * R;
const TARGET_TOTAL = 100_000_000;
let alive = TARGET_TOTAL;
// 主惑星だけの残数 (エンディング判定用)。alive は全天体の破壊で減る歴史的な合算なので、
// 主惑星のセル (円盤内。内部ダンジョンのセルも主惑星の一部として数える) だけを別に数える
let mainAlive = TARGET_TOTAL;
const isMainCell = (gx, gy) => {
  const dx = gx - GC, dy = gy - GC, d2 = dx * dx + dy * dy;
  return d2 <= R2 && (d2 < REMOVED_MIN_D2 || !removedSet.has(gy * D + gx));
};

// --- 円の縁の端数調整: 最も外側の数千個を「存在しない」ことにして総数を一致させる ---
const removedSet = new Set();
let REMOVED_MIN_D2 = Infinity;    // 間引いたブロックのうち最も内側の距離²。これより内側は Set を引かなくてよい
(function adjustTotal(){
  let base = 0;
  for (let dy = -R; dy <= R; dy++) base += 2 * Math.floor(Math.sqrt(R2 - dy * dy)) + 1;
  let diff = base - TARGET_TOTAL;                 // R=5642 では +3381
  if (diff <= 0) return;
  const cand = [];
  for (let dy = -R; dy <= R && diff > 0; dy++){
    const dxm = Math.floor(Math.sqrt(R2 - dy * dy));
    for (let dx = Math.max(0, dxm - 4); dx <= dxm; dx++){
      const d2 = dx * dx + dy * dy;
      if (d2 <= R2){
        cand.push([d2, (dy + GC) * D + (dx + GC)]);
        if (dx !== 0) cand.push([d2, (dy + GC) * D + (-dx + GC)]);
      }
    }
  }
  cand.sort((a, b) => b[0] - a[0]);                // 外側 (中心から遠い) 順
  for (let i = 0; i < diff && i < cand.length; i++){ removedSet.add(cand[i][1]); REMOVED_MIN_D2 = Math.min(REMOVED_MIN_D2, cand[i][0]); }
})();

// --- 破壊ビットマップ & 部分ダメージ ---
const destroyedBits = new Uint8Array(Math.ceil(D * D / 8));  // 約27MB
const damagedMap = new Map();                                 // idx -> 現在HP (float)
const isDestroyed = idx => (destroyedBits[idx >> 3] >> (idx & 7)) & 1;

/* --- セーブ用のチャンク管理 (store.js と対になる) ---
   ビットマップを 8KB ずつに切り、「このチャンクで何か壊した」印だけを立てる。
   保存時はその印が付いたチャンクだけを書き戻すので、27MB を毎回触らずに済む。
   1チャンク = 8192 byte = 65536 bit なので、チャンク番号は idx >> 16 で出る。
   8KB なのは、宝箱 (全天体に180個) のように1マスだけ離れて壊れる場所が多いため。
   大きいチャンクだとその1マスのために数十KBを丸ごと抱え込んでしまう */
const CHUNK_SHIFT = 16, CHUNK_BYTES = 1 << (CHUNK_SHIFT - 3);
const CHUNK_N = Math.ceil(destroyedBits.length / CHUNK_BYTES);
const chunkDirty = new Uint8Array(CHUNK_N);
let worldDirty = false;   // 破壊 or 部分ダメージが前回の保存以降にあったか
// 見た目が変わったブロック (描画キャッシュの部分更新用)。溢れたら全体を描き直す
const dirtyBlocks = [];
let dirtyOverflow = false;
function touchBlock(idx){
  if (dirtyBlocks.length < 4000) dirtyBlocks.push(idx); else dirtyOverflow = true;
}
/* --- 探索用: 16x16 セルの「生きているブロック数」(重さ対策の要その2) ---
   終盤は自機の周りがほぼ掘り尽くされていて、「最寄りのブロック探し」(game/combat.js) が毎回
   半径いっぱい (数万セル) を空振りで走査し、それが 1フレームに何十回も走ってスマホが発熱していた。
   チャンクごとの生存数を持ち、空のチャンクは丸ごと飛ばす。数は初めて覗いた時に1回だけ数え (-1 = 未計算)、
   以後は markDestroyed で減らす (ブロックは復活しないので増えることはない) */
const LC_SHIFT = 4, LC_S = 1 << LC_SHIFT, LC_N = Math.ceil(D / LC_S);
const liveCnt = new Int16Array(LC_N * LC_N).fill(-1);
function chunkLive(cx, cy){
  const c = cy * LC_N + cx;
  let n = liveCnt[c];
  if (n >= 0) return n;
  n = 0;
  const x0 = cx << LC_SHIFT, y0 = cy << LC_SHIFT, x1 = Math.min(D, x0 + LC_S), y1 = Math.min(D, y0 + LC_S);
  for (let gy = y0; gy < y1; gy++){
    const row = gy * D;
    for (let gx = x0; gx < x1; gx++) if (!isDestroyed(row + gx) && blockExists(gx, gy)) n++;
  }
  liveCnt[c] = n;
  return n;
}
function markDestroyed(idx){
  if (!isDestroyed(idx)){
    const c = (((idx / D) | 0) >> LC_SHIFT) * LC_N + ((idx % D) >> LC_SHIFT);
    if (liveCnt[c] > 0) liveCnt[c]--;
  }
  destroyedBits[idx >> 3] |= (1 << (idx & 7));
  damagedMap.delete(idx);
  chunkDirty[idx >>> CHUNK_SHIFT] = 1; worldDirty = true;   // 1命令ずつ。ここはブロック破壊のたびに通る
  touchBlock(idx);
}

// --- セーブからの復元 (store.js が起動時に読み込んだもの) ---
(function restoreWorld(){
  const S = window.SAVED;
  if (!S) return;
  if (S.chunks) for (const c of S.chunks) if (c && c.d) destroyedBits.set(c.d, c.i * CHUNK_BYTES);
  const w = S.world;
  if (!w) return;
  if (typeof w.alive === "number") alive = Math.max(0, Math.min(TARGET_TOTAL, w.alive));
  if (typeof w.mainAlive === "number") mainAlive = Math.max(0, Math.min(TARGET_TOTAL, w.mainAlive));
  else if (S.chunks){
    // mainAlive の無い旧セーブ: 破壊ビットマップから主惑星の破壊数を1回だけ数え直す
    // (行ごとにバイト単位で popcount するので 1億セルでも一瞬で終わる)
    const POP = new Uint8Array(256); for (let i = 1; i < 256; i++) POP[i] = POP[i >> 1] + (i & 1);
    let destroyedMain = 0;
    for (let dy = -R; dy <= R; dy++){
      const gy = GC + dy, dxm = Math.floor(Math.sqrt(R2 - dy * dy));
      const i0 = gy * D + (GC - dxm), i1 = gy * D + (GC + dxm);
      const b0 = i0 >> 3, b1 = i1 >> 3;
      if (b0 === b1){ destroyedMain += POP[destroyedBits[b0] & (0xff << (i0 & 7)) & (0xff >>> (7 - (i1 & 7)))]; continue; }
      destroyedMain += POP[destroyedBits[b0] & (0xff << (i0 & 7))];
      for (let b = b0 + 1; b < b1; b++) destroyedMain += POP[destroyedBits[b]];
      destroyedMain += POP[destroyedBits[b1] & (0xff >>> (7 - (i1 & 7)))];
    }
    mainAlive = Math.max(0, TARGET_TOTAL - destroyedMain);
  }
  if (w.ix && w.hp) for (let i = 0; i < w.ix.length; i++) damagedMap.set(w.ix[i], w.hp[i]);
})();

// --- 座標ヘルパー ---
const w2g = w => Math.floor(w / BS) + GC;
const g2w = g => (g - GC) * BS + BS / 2;

function blockExists(gx, gy){
  if (gx < 0 || gy < 0 || gx >= D || gy >= D) return false;
  const b = bodyAt(gx, gy);
  if (b < 0) return false;
  if (b > 0) return true;   // 衛星惑星
  const dx = gx - GC, dy = gy - GC, d2 = dx * dx + dy * dy;
  return d2 < REMOVED_MIN_D2 || !removedSet.has(gy * D + gx);
}
// 決定的ハッシュ [0,1) : ブロックごとのばらつき用
function hash01(n){
  let h = (n ^ 0x9e3779b9) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b) >>> 0;
  h ^= h >>> 13;
  return ((h >>> 0) % 1000) / 1000;
}
function coarseHash(cx, cy){                    // 粗いセル用 (鉱脈・大陸)
  let h = (Math.imul(cx, 374761393) + Math.imul(cy, 668265263)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
const blockDepth = (gx, gy) => {   // 0=表面, 1=中心 (いる惑星の中での深さ)
  const b = bodyAt(gx, gy);
  if (b > 0){ const S = SATS[b - 1]; if (S.rect) return rectDepth(S, gx, gy); return 1 - Math.sqrt((gx - S.cx) * (gx - S.cx) + (gy - S.cy) * (gy - S.cy)) / S.r; }
  return 1 - Math.sqrt((gx - GC) * (gx - GC) + (gy - GC) * (gy - GC)) / R;
};

/* ---------- 衛星惑星 (ミニダンジョン) ----------
   メイン惑星の周囲に浮かぶ小さな惑星たち。同じ座標空間にあるので、飛んで行ってそのまま掘れる。
   [名前, 看板素材, 地表の素材, 中層の素材, 深層の素材, 半径(ブロック), HP指数] */
const SAT_DEFS = [
  ["イグニス",   "magmalite",  "magma",     "basalt",    "obsidian",  300, 3.5],
  ["グレイシア", "permaice",   "ice",       "permafrost","ice",       260, 4.3],
  ["ヴェノム",   "toxicite",   "sulfur",    "clay",      "sulfur",    280, 5.1],
  ["プリズマ",   "prismore",   "granite",   "obsidian",  "granite",   320, 5.9],
  ["レリクス",   "relicstone", "sandstone", "granite",   "bone",      300, 6.7],
  ["ネレイス",   "nereidpearl","water",     "coral",     "shell",     340, 7.5],
  ["ヴォルテス", "voltore",    "sulfur",    "basalt",    "obsidian",  280, 8.3],
  ["デューン",   "duneglass",  "sand",      "sandstone", "bone",      360, 9.1],
  ["アビス",     "abyssite",   "obsidian",  "basalt",    "obsidian",  320, 9.9],
  ["ノヴァコア", "novalite",   "magma",     "obsidian",  "magma",     380, 10.7],
];
const SATS = SAT_DEFS.map((d, i) => {
  const ang = i * (Math.PI * 2 / SAT_DEFS.length) + (hash01(i * 77 + 5) - 0.5) * 0.3;
  const r = d[5], dist = R + 500 + i * 30 + r;
  const tab = (a, b, c) => buildTable([[MAT[d[1]].i, a], [MAT[d[2]].i, b], [MAT[d[3]].i, c], [MAT[d[4]].i, 12]]);
  return { name: d[0], sig: d[1], r, r2: r * r, exp: d[6], salt: i * 31 + 7,
    cx: GC + Math.round(Math.cos(ang) * dist), cy: GC + Math.round(Math.sin(ang) * dist),
    tab0: null, tab1: null, tab2: null,
    _t: [tab(30, 55, 15), tab(50, 15, 35), tab(60, 0, 10)] };
});
SATS.forEach(S => { [S.tab0, S.tab1, S.tab2] = S._t; delete S._t; });

// ===== 小惑星 (小規模ダンジョン x20): 本星と衛星の間の内リング x10 + 衛星の外の外リング x10 =====
// 配置は決定的 (hash01)。既存の衛星とは角度を半周ずらし、どの天体とも重ならないことを検証済み
const MINI_DEFS = [
  ["フローラ",   "florite",   "coral",     "clay",      "sandstone",  95, 2.8],
  ["ハニカム",   "ambarite",  "sandstone", "sulfur",    "sand",      105, 3.1],
  ["キノコバ",   "fungite",   "clay",      "bone",      "water",      88, 3.4],
  ["キャンディ", "candite",   "sand",      "ice",       "shell",     100, 3.8],
  ["コバルト",   "cobaltite", "basalt",    "granite",   "obsidian",  110, 4.2],
  ["ソーダ",     "sodite",    "water",     "ice",       "shell",      92, 4.5],
  ["モノリス",   "lunite",    "granite",   "sandstone", "basalt",    102, 4.8],
  ["パンプキン", "pumpkite",  "clay",      "sand",      "sulfur",    108, 5.1],
  ["グミボール", "goomite",   "water",     "clay",      "coral",      90, 5.4],
  ["コメット",   "cometite",  "ice",       "permafrost","granite",    98, 5.7],
  ["ドラゴニア", "dragonite", "magma",     "obsidian",  "bone",      100, 6.2],
  ["ミラージュ", "mirageite", "sand",      "sandstone", "sulfur",    112, 6.8],
  ["オーロラ",   "aurorite",  "ice",       "permafrost","granite",    95, 7.4],
  ["ギアボール", "gearite",   "basalt",    "granite",   "obsidian",  120, 8.0],
  ["ネビュラ",   "nebulite",  "obsidian",  "basalt",    "granite",   105, 8.6],
  ["ラグーン",   "aquamarite","water",     "coral",     "shell",      92, 9.2],
  ["クリムゾン", "crimsonite","magma",     "basalt",    "bone",      115, 9.8],
  ["ルミナ",     "luminite",  "granite",   "ice",       "sandstone", 100, 10.4],
  ["ジャングル", "jadeite",   "clay",      "water",     "coral",     108, 11.0],
  ["ホライズン", "horizonite","obsidian",  "magma",     "basalt",    125, 11.6],
];
MINI_DEFS.forEach((d, j) => {
  const ring = j < 10 ? 0 : 1, k = j % 10;
  const ang = (k + 0.5) * (Math.PI * 2 / 10) + (hash01(j * 131 + 17) - 0.5) * (ring ? 0.12 : 0.2);
  const r = d[5], dist = ring ? R + 1470 + (k % 3) * 55 : R + 280 + (k % 3) * 30;
  const tab = (a, b, c) => buildTable([[MAT[d[1]].i, a], [MAT[d[2]].i, b], [MAT[d[3]].i, c], [MAT[d[4]].i, 12]]);
  const S = { name: d[0], sig: d[1], r, r2: r * r, exp: d[6], salt: 1000 + j * 31 + 7, mini: true,
    cx: GC + Math.round(Math.cos(ang) * dist), cy: GC + Math.round(Math.sin(ang) * dist),
    tab0: null, tab1: null, tab2: null, _t: [tab(30, 55, 15), tab(50, 15, 35), tab(60, 0, 10)] };
  [S.tab0, S.tab1, S.tab2] = S._t; delete S._t;
  SATS.push(S);
});
// ===== 惑星内部ダンジョン (矩形 x30): メイン惑星の内部に封じられた空間 =====
// 本星のブロックを置き換えるだけなので総ブロック数は変わらない。掘り進んで壁を破ると辿り着く
// [名前, 看板素材, 外層の素材, 中層の素材, 深層の素材, 半幅, 半高, HP指数, 角度(度), 中心からの距離]
const CAVE_DEFS = [
  ["骨の回廊",     "ossite",       "bone",      "sandstone", "clay",     62, 38, 2.6,  205, 4300],
  ["根の迷宮",     "rhizomite",    "wood",      "soil",      "clay",     55, 44, 3.3,  130, 4150],
  ["鍾乳洞",       "stalactite",   "stone",     "clay",      "water",    48, 52, 4.1,  300, 3950],
  ["塩の宮殿",     "halite",       "salt",      "sand",      "shell",    66, 40, 4.9,   20, 3700],
  ["ジオード洞",   "geodite",      "granite",   "stone",     "obsidian", 52, 52, 5.8,   85, 3200],
  ["磁鉄鉱脈",     "lodestonite",  "basalt",    "granite",   "obsidian", 70, 34, 6.7,  250, 2850],
  ["古代の墓所",   "sarcophagite", "bone",      "granite",   "sandstone",58, 46, 7.6,  160, 2350],
  ["硫黄地獄",     "brimstonite",  "sulfur",    "magma",     "basalt",   60, 48, 8.6,  335, 2000],
  ["星屑の堆積層", "stardustite",  "obsidian",  "granite",   "magma",    50, 42, 10.2,  55, 1300],
  ["惑星の心臓",   "coreheart",    "magma",     "obsidian",  "basalt",   64, 54, 12.4,   0,  420],
  // --- 幻想ダンジョン (第2陣) ---
  ["妖精の泉",     "fairyspring",  "water",     "coral",     "shell",    56, 42, 2.9,  235, 4450],
  ["虹の結晶洞",   "rainbownite",  "granite",   "ice",       "stone",    58, 46, 3.7,  105, 4400],
  ["精霊の森",     "spiritwood",   "wood",      "clay",      "water",    60, 48, 4.5,  345, 4400],
  ["夢の層",       "dreamite",     "ice",       "obsidian",  "granite",  54, 44, 5.3,   65, 3750],
  ["魔法の図書館", "runestone",    "sandstone", "granite",   "bone",     64, 40, 6.1,  185, 3550],
  ["幻獣の巣",     "chimeraite",   "bone",      "clay",      "sulfur",   56, 50, 7.0,  275, 3050],
  ["時の間",       "chronoglass",  "sand",      "granite",   "obsidian", 52, 42, 7.9,   40, 2650],
  ["天使の聖域",   "seraphite",    "ice",       "granite",   "shell",    58, 44, 8.9,  145, 2750],
  ["悪魔の契約所", "demonite",     "obsidian",  "sulfur",    "magma",    54, 46, 9.8,  220, 1750],
  ["世界樹の根源", "yggdrasil",    "wood",      "obsidian",  "granite",  66, 54, 11.8, 100,  950],
  // ===== 序盤の浅いダンジョン x10 (v65): 地表近く (深さ 0.08-0.12)、序盤の武器で掘り進める =====
  ["苔の洞窟",     "mossite",     "soil",      "stone",      "sand",      54, 40, 0.8, 152, 5200],
  ["粘土の空洞",   "terracite",   "clay",      "soil",      "sand",      50, 44, 1.0,  78, 5350],
  ["樹液の層",     "sapite",      "wood",      "soil",      "stone",      52, 38, 1.1,  12, 5300],
  ["流砂の間",     "ryusite",     "sand",      "soil",      "gravel",    56, 36, 1.2, 322, 5250],
  ["アンモナイト層","ammonite",   "stone",      "limestone", "soil",      48, 42, 1.4, 262, 5300],
  ["炭の小部屋",   "anthracite",  "coal",      "stone",      "soil",      46, 40, 1.5, 195, 5380],
  ["湧水の間",     "aqualite",    "sand",      "clay",      "stone",      52, 44, 1.6,  48, 5100],
  ["錆鉄の鉱脈",   "rustite",     "stone",      "gravel",    "soil",      50, 42, 1.8, 290, 5050],
  ["花弁の層",     "petalite",    "soil",      "sand",      "quartz",    50, 40, 1.8, 228, 5100],
  ["硝子の浅層",   "glassite",    "sand",      "quartz",    "stone",      48, 38, 1.9, 172, 4950],
];
const CAVE_START = SATS.length;   // 30
CAVE_DEFS.forEach((d, j) => {
  const ang = d[8] * Math.PI / 180, dist = d[9];
  const cx = GC + Math.round(Math.cos(ang) * dist), cy = GC + Math.round(Math.sin(ang) * dist);
  const tab = (a, b, c) => buildTable([[MAT[d[1]].i, a], [MAT[d[2]].i, b], [MAT[d[3]].i, c], [MAT[d[4]].i, 12]]);
  const S = { name: d[0], sig: d[1], exp: d[7], salt: 2000 + j * 31 + 7, cave: true, rect: true,
    cx, cy, hw: d[5], hh: d[6], x0: cx - d[5], x1: cx + d[5], y0: cy - d[6], y1: cy + d[6],
    r: Math.min(d[5], d[6]), tab0: null, tab1: null, tab2: null, _t: [tab(30, 55, 15), tab(50, 15, 35), tab(60, 0, 10)] };
  S.r2 = S.r * S.r;
  [S.tab0, S.tab1, S.tab2] = S._t; delete S._t;
  SATS.push(S);
});
const CAVE_END = SATS.length;     // 60 (内部ダンジョンの範囲は CAVE_START..CAVE_END-1)
// ===== 最難関ダンジョン x4 (v93): ワールドマップの四隅に浮かぶ要塞惑星 =====
// 硬さは異次元: 地表ですら内核の深部並み (hpBase)、中心は主惑星の核の 10万倍以上。
// 看板素材から「これまでにない超広範囲・超火力」の武器が作れる (data/weapons.js の ULTRA 系 / game/ultra.js)
// [名前, 看板素材, 外層, 中層, 深層, 半径, HP指数(深さ方向), 地表HP, x方向(-1=左/1=右), y方向(-1=上/1=下), モンスターHP]
const ULTRA_DEFS = [
  ["星界の終点 アストラル",   "astralite", "starMetal",        "aether",      "coreQuartz",  360, 4.0, 1e11, -1, -1, 4e9],
  ["流星の墓場 メテオグレイヴ", "meteorium", "stellarIron",      "adamant",     "corium",      380, 4.2, 1e12,  1, -1, 4e10],
  ["銀河の回廊 ガラクシア",   "galaxium",  "aether",           "deepPlasma",  "quantumFoam", 400, 4.4, 1e13,  1,  1, 4e11],
  ["虚空の胃袋 グラトニア",   "voidheart", "singularityShard", "abyssite",    "neutronDust", 440, 4.6, 1e14, -1,  1, 4e12],
];
const ULTRA_START = SATS.length;   // 60
const ULTRA_OFF = 5900;            // 世界の中心から四隅への距離 (各軸)。外リングの小惑星 (中心から約7200) より外
ULTRA_DEFS.forEach((d, j) => {
  const tab = (a, b, c) => buildTable([[MAT[d[1]].i, a], [MAT[d[2]].i, b], [MAT[d[3]].i, c], [MAT[d[4]].i, 12]]);
  const S = { name: d[0], sig: d[1], r: d[5], r2: d[5] * d[5], exp: d[6], hpBase: d[7], mobHp: d[10], salt: 3000 + j * 31 + 7, ultra: true, rank: j + 1,
    cx: GC + d[8] * ULTRA_OFF, cy: GC + d[9] * ULTRA_OFF,
    tab0: null, tab1: null, tab2: null, _t: [tab(40, 45, 15), tab(55, 15, 30), tab(70, 0, 10)] };
  [S.tab0, S.tab1, S.tab2] = S._t; delete S._t;
  SATS.push(S);
});

/* ---------- ダンジョン固有効果 (SATS と同じ順番: 衛星10 → 小惑星20 → 内部20) ----------
   dmg=ブロックへの与ダメ倍率 / coin=コイン倍率 / xp=経験値倍率 / hurt=被ダメ倍率 / drop=看板素材ドロップ率倍率
   proc=着弾時に確率で付与される状態 (burn/frost/acid/bomb/shock) / crit=会心率加算 / gold=金塊化率 */
const DUNGEON_FX = [
  { name:"噴火の脈動",   desc:"着弾の30%が燃焼。熱で被ダメ +40%",                 dmg:1,    coin:1,   xp:1,   hurt:1.4, drop:1,   proc:"burn",  p:.3 },
  { name:"万年氷",       desc:"着弾の40%が氷結。凍った星はもろい",               dmg:1.1,  coin:1,   xp:1,   hurt:1,   drop:1,   proc:"frost", p:.4 },
  { name:"猛毒の霧",     desc:"着弾の35%が腐食。毒で被ダメ +30%",                 dmg:1,    coin:1,   xp:1.2, hurt:1.3, drop:1,   proc:"acid",  p:.35 },
  { name:"七色の屈折",   desc:"会心率 +25%。光が乱反射する",                       dmg:1,    coin:1.2, xp:1,   hurt:1,   drop:1,   crit:.25 },
  { name:"遺跡の加護",   desc:"経験値 2倍。古代の知恵が流れ込む",                 dmg:1,    coin:1,   xp:2,   hurt:1,   drop:1 },
  { name:"深海の水圧",   desc:"与ダメ -30%、代わりに真珠が3倍落ちる",             dmg:.7,   coin:1,   xp:1,   hurt:1,   drop:3 },
  { name:"帯電フィールド", desc:"着弾の30%が感電。被ダメ +50%",                   dmg:1,    coin:1,   xp:1,   hurt:1.5, drop:1,   proc:"shock", p:.3 },
  { name:"砂嵐",         desc:"与ダメ -20%、コイン 2.5倍。砂に埋もれた財宝",      dmg:.8,   coin:2.5, xp:1,   hurt:1,   drop:1 },
  { name:"深淵の引力",   desc:"与ダメ 1.5倍、被ダメ 2倍。深淵は見返してくる",     dmg:1.5,  coin:1,   xp:1,   hurt:2,   drop:1 },
  { name:"新星の輝き",   desc:"全部 1.5倍。星の核は惜しみなく与える",             dmg:1.5,  coin:1.5, xp:1.5, hurt:1.5, drop:1.5 },
  { name:"花粉の祝福",   desc:"被ダメ -40%。花の香りが傷を癒す",                   dmg:1,    coin:1,   xp:1.3, hurt:.6,  drop:1 },
  { name:"蜜の甘さ",     desc:"コイン 1.8倍。蜜は金色に輝く",                     dmg:1,    coin:1.8, xp:1,   hurt:1,   drop:1 },
  { name:"胞子爆弾",     desc:"着弾の20%に時限爆弾が芽吹く",                       dmg:1,    coin:1,   xp:1,   hurt:1,   drop:1,   proc:"bomb",  p:.2 },
  { name:"砂糖の衣",     desc:"ブロックが甘く柔い。与ダメ 1.3倍",                 dmg:1.3,  coin:1,   xp:1,   hurt:1,   drop:1 },
  { name:"磁力の盾",     desc:"与ダメ -25%、被ダメ -50%。鉄壁の星",               dmg:.75,  coin:1,   xp:1,   hurt:.5,  drop:2 },
  { name:"炭酸の泡立ち", desc:"着弾の50%が感電するように弾ける",                   dmg:1,    coin:1,   xp:1,   hurt:1,   drop:1,   proc:"shock", p:.5 },
  { name:"月光の静寂",   desc:"会心率 +15%、経験値 1.5倍",                         dmg:1,    coin:1,   xp:1.5, hurt:1,   drop:1,   crit:.15 },
  { name:"収穫祭",       desc:"コイン 2倍、ドロップ 2倍。実りの季節",             dmg:1,    coin:2,   xp:1,   hurt:1,   drop:2 },
  { name:"弾力の壁",     desc:"与ダメ -40%、被ダメ -30%。ぷにぷにして痛くない",   dmg:.6,   coin:1.5, xp:1,   hurt:.7,  drop:1 },
  { name:"彗星の尾",     desc:"着弾の60%が氷結。宇宙の冷気",                       dmg:1,    coin:1,   xp:1,   hurt:1,   drop:1,   proc:"frost", p:.6 },
  { name:"竜の吐息",     desc:"着弾の50%が燃焼、被ダメ +60%",                     dmg:1.2,  coin:1,   xp:1,   hurt:1.6, drop:1,   proc:"burn",  p:.5 },
  { name:"蜃気楼",       desc:"ブロックの5%が金塊に見える…本物だ",               dmg:1,    coin:1,   xp:1,   hurt:1,   drop:1,   gold:.05 },
  { name:"極光の帳",     desc:"経験値 2.5倍。空が光る",                           dmg:.9,   coin:1,   xp:2.5, hurt:1,   drop:1 },
  { name:"歯車の暴走",   desc:"与ダメ 1.6倍、被ダメ 1.8倍。噛み合うと止まらない", dmg:1.6,  coin:1,   xp:1,   hurt:1.8, drop:1 },
  { name:"星雲の霞",     desc:"着弾の40%が腐食。ガスが溶かす",                     dmg:1,    coin:1,   xp:1.4, hurt:1,   drop:1,   proc:"acid",  p:.4 },
  { name:"珊瑚礁の恵み", desc:"ドロップ 4倍。ラグーンは豊か",                     dmg:1,    coin:1,   xp:1,   hurt:1,   drop:4 },
  { name:"血の契り",     desc:"与ダメ 2倍、被ダメ 2.5倍。血で払え",               dmg:2,    coin:1,   xp:1,   hurt:2.5, drop:1 },
  { name:"光の洗礼",     desc:"会心率 +35%。闇は居場所を失う",                     dmg:1,    coin:1,   xp:1.5, hurt:1,   drop:1,   crit:.35 },
  { name:"密林の猛毒",   desc:"着弾の50%が腐食、被ダメ +40%",                     dmg:1,    coin:1.3, xp:1,   hurt:1.4, drop:1,   proc:"acid",  p:.5 },
  { name:"事象の地平",   desc:"全部 2倍。帰ってこれるなら",                        dmg:2,    coin:2,   xp:2,   hurt:2,   drop:2 },
  { name:"骨の呪い",     desc:"被ダメ +30%、コイン 1.4倍。骨はカラカラ笑う",     dmg:1,    coin:1.4, xp:1,   hurt:1.3, drop:1 },
  { name:"根の絡みつき", desc:"与ダメ -30%。根が武器を絡め取る。XP 1.6倍",        dmg:.7,   coin:1,   xp:1.6, hurt:1,   drop:1 },
  { name:"千年の雫",     desc:"着弾の30%が氷結。滴る水は冷たい",                   dmg:1,    coin:1.2, xp:1,   hurt:1,   drop:1,   proc:"frost", p:.3 },
  { name:"塩の浸食",     desc:"着弾の45%が腐食。塩は全てを溶かす",                 dmg:1,    coin:1,   xp:1,   hurt:1,   drop:1.5, proc:"acid",  p:.45 },
  { name:"結晶の共鳴",   desc:"会心率 +30%、コイン 1.3倍",                         dmg:1,    coin:1.3, xp:1,   hurt:1,   drop:1,   crit:.3 },
  { name:"磁気嵐",       desc:"着弾の40%が感電。羅針盤が狂う",                     dmg:1,    coin:1,   xp:1,   hurt:1.2, drop:1,   proc:"shock", p:.4 },
  { name:"墓所の静謐",   desc:"被ダメ -60%、与ダメ -20%。死者は静かに眠る",       dmg:.8,   coin:1,   xp:1.8, hurt:.4,  drop:1 },
  { name:"煉獄の炎",     desc:"着弾の70%が燃焼、被ダメ +80%。地獄だ",             dmg:1.3,  coin:1,   xp:1,   hurt:1.8, drop:1,   proc:"burn",  p:.7 },
  { name:"星屑の記憶",   desc:"金塊 8%、経験値 2倍。宇宙の記憶が舞う",             dmg:1,    coin:1,   xp:2,   hurt:1,   drop:1,   gold:.08 },
  { name:"惑星の鼓動",   desc:"全部 1.8倍、着弾の30%が燃焼。心臓は熱い",           dmg:1.8,  coin:1.8, xp:1.8, hurt:1.8, drop:1.8, proc:"burn", p:.3 },
  { name:"妖精の加護",   desc:"被ダメ -70%。妖精が守ってくれる",                   dmg:1,    coin:1,   xp:1.2, hurt:.3,  drop:1 },
  { name:"虹の煌めき",   desc:"会心率 +40%、金塊 3%",                              dmg:1,    coin:1,   xp:1,   hurt:1,   drop:1,   crit:.4, gold:.03 },
  { name:"精霊の囁き",   desc:"経験値 3倍。森が語りかける",                        dmg:.9,   coin:1,   xp:3,   hurt:1,   drop:1 },
  { name:"夢の浮遊",     desc:"着弾の50%が氷結、与ダメ 1.2倍。夢の中は寒い",      dmg:1.2,  coin:1,   xp:1.5, hurt:.8,  drop:1,   proc:"frost", p:.5 },
  { name:"魔法の増幅",   desc:"全属性付与の着弾が25%。燃焼・氷結・感電がランダム", dmg:1,    coin:1,   xp:1.5, hurt:1,   drop:1,   proc:"random", p:.25 },
  { name:"幻獣の狂乱",   desc:"与ダメ 1.7倍、被ダメ 2倍、会心 +20%",              dmg:1.7,  coin:1,   xp:1,   hurt:2,   drop:1,   crit:.2 },
  { name:"時の逆行",     desc:"時限爆弾 40%、着弾の20%が氷結。時が歪む",          dmg:1,    coin:1.5, xp:1,   hurt:1,   drop:1,   proc:"bomb",  p:.4 },
  { name:"天使の祝福",   desc:"被ダメ -80%、コイン 1.5倍、XP 2倍。聖なる光",      dmg:1,    coin:1.5, xp:2,   hurt:.2,  drop:1 },
  { name:"悪魔の契約",   desc:"全部 3倍。被ダメ 4倍。契約書に目を通せ",            dmg:3,    coin:3,   xp:3,   hurt:4,   drop:3 },
  { name:"世界樹の加護", desc:"全部 2.5倍、被ダメ -30%。全ての命が味方する",      dmg:2.5,  coin:2.5, xp:2.5, hurt:.7,  drop:2.5 },
  { name:"苔の恵み",     desc:"被ダメ -20%、経験値 1.2倍。苔が衝撃を吸う",           dmg:1,    coin:1,   xp:1.2, hurt:.8,  drop:1 },
  { name:"粘土の柔らかさ", desc:"与ダメ 1.2倍。柔らかい粘土は掘りやすい",             dmg:1.2,  coin:1,   xp:1,   hurt:1,   drop:1.2 },
  { name:"樹液の粘り",   desc:"着弾の30%が氷結。樹液の粘りは獲物を逃がさない",        dmg:1,    coin:1.2, xp:1,   hurt:1,   drop:1,   proc:"frost", p:.3 },
  { name:"流砂の財宝",   desc:"コイン 1.6倍。流砂の下に財宝が眠る",                   dmg:1,    coin:1.6, xp:1,   hurt:1.1, drop:1 },
  { name:"化石の記憶",   desc:"経験値 1.6倍。太古の記憶が蘇る",                       dmg:1,    coin:1,   xp:1.6, hurt:1,   drop:1 },
  { name:"炭の火種",     desc:"着弾の25%が燃焼。炭は静かに燃え続ける",               dmg:1,    coin:1,   xp:1,   hurt:1,   drop:1,   proc:"burn",  p:.25 },
  { name:"湧水の清らかさ", desc:"被ダメ -30%、経験値 1.2倍。清い水が癒す",            dmg:1,    coin:1,   xp:1.2, hurt:.7,  drop:1 },
  { name:"錆の浸食",     desc:"着弾の30%が腐食。錆はゆっくり蝕む",                   dmg:1,    coin:1,   xp:1,   hurt:1,   drop:1,   proc:"acid",  p:.3 },
  { name:"花弁の舞い",   desc:"会心率 +15%、コイン 1.3倍。花びらが舞う",              dmg:1,    coin:1.3, xp:1,   hurt:1,   drop:1,   crit:.15 },
  { name:"硝子の屈折",   desc:"会心率 +20%、ドロップ 1.3倍。光が乱反射する",          dmg:1,    coin:1,   xp:1,   hurt:1,   drop:1.3, crit:.2 },
  // ===== 最難関ダンジョン (ultra: マップで特別に表示) =====
  { name:"星界の重圧",   desc:"【最難関】与ダメ -40%・被ダメ 3倍。代わりにコイン・経験値 6倍、ドロップ 3倍、会心 +30%",          dmg:.6, coin:6,  xp:6,  hurt:3,   drop:3, crit:.3, ultra:1 },
  { name:"終わらない流星雨", desc:"【最難関】着弾の50%に時限爆弾。被ダメ 3.5倍。コイン 8倍・経験値 8倍、ドロップ 3倍",       dmg:.6, coin:8,  xp:8,  hurt:3.5, drop:3, proc:"bomb", p:.5, ultra:1 },
  { name:"銀河の渦潮",   desc:"【最難関】着弾の60%が感電。被ダメ 4倍。コイン 10倍・経験値 10倍、ドロップ 3.5倍",              dmg:.55, coin:10, xp:10, hurt:4,   drop:3.5, proc:"shock", p:.6, ultra:1 },
  { name:"虚空の飢餓",   desc:"【最難関】与ダメ -50%・被ダメ 5倍。金塊 15%、コイン 15倍・経験値 12倍、ドロップ 4倍",         dmg:.5, coin:15, xp:12, hurt:5,   drop:4, gold:.15, ultra:1 },
];
SATS.forEach((S, i) => { S.fx = DUNGEON_FX[i] || null; });
// 座標のダンジョン効果 (メイン惑星・宇宙なら null)
function dungeonFxAt(gx, gy){ const b = bodyAt(gx, gy); return b > 0 ? SATS[b - 1].fx : null; }

// 矩形ダンジョン内の深さ: 0=壁際, 1=中心
function rectDepth(S, gx, gy){
  const dx = Math.min(gx - S.x0, S.x1 - gx), dy = Math.min(gy - S.y0, S.y1 - gy);
  return Math.max(0, Math.min(1, Math.min(dx, dy) / S.r));
}
/* 天体の当たりを付ける 64x64 セルのタイル: 0 = どの天体の候補でもない / s+1 = 候補は SATS[s] だけ / 255 = 複数。
   bodyAt はブロックの存在判定のたびに呼ばれ、以前はメイン惑星内の全セルで内部ダンジョン30個の矩形を毎回調べていた */
const BT_SHIFT = 6, BT_N = Math.ceil(D / (1 << BT_SHIFT));
const bodyTile = new Uint8Array(BT_N * BT_N);
(function buildBodyTiles(){
  const mark = (s, x0, y0, x1, y1) => {
    const tx0 = Math.max(0, x0 >> BT_SHIFT), ty0 = Math.max(0, y0 >> BT_SHIFT);
    const tx1 = Math.min(BT_N - 1, x1 >> BT_SHIFT), ty1 = Math.min(BT_N - 1, y1 >> BT_SHIFT);
    for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++){
      const t = ty * BT_N + tx, v = bodyTile[t];
      bodyTile[t] = v === 0 || v === s + 1 ? s + 1 : 255;
    }
  };
  SATS.forEach((S, s) => {
    if (s >= CAVE_START && s < CAVE_END) mark(s, S.x0, S.y0, S.x1, S.y1);   // メイン惑星内: 矩形で判定する分
    const r = Math.ceil(Math.sqrt(S.r2)) + 1;
    mark(s, S.cx - r, S.cy - r, S.cx + r, S.cy + r);                         // メイン惑星外: 円で判定する分
  });
})();
// 座標が属する天体: 0=メイン惑星 / 1..64=衛星・小惑星・内部ダンジョン・最難関 (SATS の index+1) / -1=宇宙空間
function bodyAt(gx, gy){
  const dx = gx - GC, dy = gy - GC, inMain = dx * dx + dy * dy <= R2;
  const t = gx >= 0 && gy >= 0 && gx < D && gy < D ? bodyTile[(gy >> BT_SHIFT) * BT_N + (gx >> BT_SHIFT)] : 255;
  if (t === 0) return inMain ? 0 : -1;
  if (t !== 255){   // 候補が1つだけ: 下の全走査と同じ判定をその天体にだけ行う
    const s = t - 1, S = SATS[s];
    if (inMain) return s >= CAVE_START && s < CAVE_END && gx >= S.x0 && gx <= S.x1 && gy >= S.y0 && gy <= S.y1 ? t : 0;
    const sx = gx - S.cx, sy = gy - S.cy;
    return sx * sx + sy * sy <= S.r2 ? t : -1;
  }
  if (inMain){
    for (let s = CAVE_START; s < CAVE_END; s++){ const S = SATS[s]; if (gx >= S.x0 && gx <= S.x1 && gy >= S.y0 && gy <= S.y1) return s + 1; }
    return 0;
  }
  for (let s = 0; s < SATS.length; s++){
    const S = SATS[s], sx = gx - S.cx, sy = gy - S.cy;
    if (sx * sx + sy * sy <= S.r2) return s + 1;
  }
  return -1;
}
function materialAtSat(S, gx, gy, lod){
  const dx = gx - S.cx, dy = gy - S.cy;
  const depth = S.rect ? rectDepth(S, gx, gy) : 1 - Math.sqrt(dx * dx + dy * dy) / S.r;
  const tab = depth < 0.2 ? S.tab0 : depth < 0.6 ? S.tab1 : S.tab2;
  if (lod) return pickFrom(tab, coarseHash((gx >> 6) + S.salt, (gy >> 6) + S.salt * 3) * 0.3);
  const idx = gy * D + gx;
  if (hash01(idx ^ 0x5bd1e995) < 0.12) return pickFrom(tab, hash01(idx ^ 0x27d4eb2d));
  return pickFrom(tab, coarseHash((gx >> 3) + S.salt * 977, (gy >> 3) + S.salt * 131));
}

/* ---------- 素材の配置 ----------
   - 地層は深さで決まるが、境界は粗いノイズで少し波打たせる
   - 層の中では 8x8 のセル単位で素材を選ぶ (鉱脈のかたまり)。さらに 12% のブロックは個別に選び直す (散らばった粒)
   - 地表はバイオーム (海 / 深海 / 大地 / 森 / 砂漠 / 極地) */
/* 素材と最大HPは座標だけで決まる (決定的) ので、直近に引いたセルを覚えておく (直接写像キャッシュ・各65536件)。
   ブロック1個の撃破で、連鎖スキルが周囲の素材・最大HPを何十回も引くので、ここが効く */
const CELL_CACHE_BITS = 16, CELL_CACHE_SHIFT = 32 - CELL_CACHE_BITS;
const cellSlot = idx => Math.imul(idx, 0x9E3779B1) >>> CELL_CACHE_SHIFT;
const matCacheK = new Int32Array(1 << CELL_CACHE_BITS).fill(-1), matCacheV = new Uint16Array(1 << CELL_CACHE_BITS);
const hpCacheK = new Int32Array(1 << CELL_CACHE_BITS).fill(-1), hpCacheV = new Float64Array(1 << CELL_CACHE_BITS);
// lod = 遠景用: 粗いセル (64x64) で、その層の「よく出る素材」だけから選ぶ (ズームアウトしても地球らしい大きな色面になる)
function materialAt(gx, gy, lod){
  if (lod || gx < 0 || gy < 0 || gx >= D || gy >= D) return materialAtCalc(gx, gy, lod);
  const idx = gy * D + gx, h = cellSlot(idx);
  if (matCacheK[h] === idx) return matCacheV[h];
  const v = materialAtCalc(gx, gy, false);
  matCacheK[h] = idx; matCacheV[h] = v;
  return v;
}
function materialAtCalc(gx, gy, lod){
  const b = bodyAt(gx, gy);
  if (b > 0) return materialAtSat(SATS[b - 1], gx, gy, lod);
  const dx = gx - GC, dy = gy - GC;
  const depth = 1 - Math.sqrt(dx * dx + dy * dy) / R;
  const idx = gy * D + gx;
  if (lod){
    let tab;
    if (depth <= 0.012){
      const lat = Math.abs(dy) / R;
      if (lat > 0.90) tab = BIOME.polar;
      else {
        const warp = Math.sin(dx * 0.0011) * 0.10 + Math.cos(dy * 0.0013) * 0.10;
        if (coarseHash(gx >> 7, gy >> 7) + warp > 0.52){
          const h2 = coarseHash((gx >> 5) + 31, (gy >> 5) - 17);
          tab = h2 > 0.78 ? BIOME.desert : h2 > 0.45 ? BIOME.land : BIOME.forest;
        } else tab = coarseHash((gx >> 7) - 57, (gy >> 7) + 91) > 0.5 ? BIOME.deep : BIOME.ocean;
      }
    } else tab = LAYER_TABLES[Math.max(1, layerIndexOf(depth + (coarseHash((gx >> 4) + 7, (gy >> 4) - 3) - 0.5) * 0.02))];
    return pickFrom(tab, coarseHash((gx >> 6) + 13, (gy >> 6) + 29) * 0.3);
  }
  if (depth <= 0.012){
    const lat = Math.abs(dy) / R;
    let tab;
    if (lat > 0.90) tab = BIOME.polar;
    else {
      const warp = Math.sin(dx * 0.0011) * 0.10 + Math.cos(dy * 0.0013) * 0.10;
      const land = coarseHash(gx >> 7, gy >> 7) + warp > 0.52;
      if (land){
        const h2 = coarseHash((gx >> 5) + 31, (gy >> 5) - 17);
        tab = h2 > 0.78 ? BIOME.desert : h2 > 0.45 ? BIOME.land : BIOME.forest;
      } else tab = coarseHash((gx >> 7) - 57, (gy >> 7) + 91) > 0.5 ? BIOME.deep : BIOME.ocean;
    }
    // 地表も 4x4 のセル単位でまとまる (海の中に海藻や珊瑚のかたまり、森の中に岩など)。10% のブロックは個別
    if (hash01(idx ^ 0x5bd1e995) < 0.10) return pickFrom(tab, hash01(idx));
    return pickFrom(tab, coarseHash((gx >> 2) + 401, (gy >> 2) + 907));
  }
  const wob = (coarseHash((gx >> 4) + 7, (gy >> 4) - 3) - 0.5) * 0.02;   // 層の境界をゆらす
  const li = Math.max(1, layerIndexOf(depth + wob));
  const tab = LAYER_TABLES[li];
  const hb = hash01(idx ^ 0x5bd1e995);
  if (hb < 0.12) return pickFrom(tab, hash01(idx ^ 0x27d4eb2d));          // 散らばった粒
  return pickFrom(tab, coarseHash((gx >> 3) + li * 977, (gy >> 3) + li * 131));   // 鉱脈 (8x8)
}
const matAtIdx = idx => MATS[materialAt(idx % D, (idx / D) | 0)];

/* ---------- HP ----------
   深さに対して指数的に増える: 地表 5 → 内核 約1.6e13。素材の硬さ倍率が掛かる
   (水や雪は柔らかく、ダイヤモンドやアダマントは硬い) */
const HP_EXP = 12.5;
const layerBaseHP = depth => 5 * Math.pow(10, HP_EXP * Math.max(0, depth));
function blockMaxHP(gx, gy){
  if (gx < 0 || gy < 0 || gx >= D || gy >= D) return blockMaxHPCalc(gx, gy);
  const idx = gy * D + gx, h = cellSlot(idx);
  if (hpCacheK[h] === idx) return hpCacheV[h];
  const v = blockMaxHPCalc(gx, gy);
  hpCacheK[h] = idx; hpCacheV[h] = v;
  return v;
}
function blockMaxHPCalc(gx, gy){
  const depth = blockDepth(gx, gy), m = MATS[materialAt(gx, gy)];
  const b = bodyAt(gx, gy);
  const base = b > 0 ? (SATS[b - 1].hpBase || 5) * Math.pow(10, SATS[b - 1].exp * Math.max(0, depth)) : layerBaseHP(depth);   // 衛星は星ごとのHP指数 (最難関は地表から hpBase)
  return Math.max(1, Math.floor(base * m.hard * (0.9 + hash01(gy * D + gx) * 0.2)));
}
// 種類: 0=通常 / 1=宝石 (コイン倍率が高い・きらめく) / 2=爆発性 (壊すと誘爆)
function blockKind(gx, gy){
  const m = MATS[materialAt(gx, gy)];
  return m.explosive ? 2 : m.cat === "gem" ? 1 : 0;
}
// 報酬は最大HPと素材のコイン倍率に連動する: 硬い・貴重なブロックほど、たくさんコインを落とす
function blockCoinValue(gx, gy){
  const m = MATS[materialAt(gx, gy)];
  return Math.max(1, Math.round(blockMaxHP(gx, gy) / 20 * m.coin));
}
function blockHP(idx){
  if (isDestroyed(idx)) return 0;
  const d = damagedMap.get(idx);
  return d !== undefined ? d : blockMaxHP(idx % D, (idx / D) | 0);
}

/* ---------- 色 ----------
   素材そのものの色。ブロックごとに少し濃淡をつけ、鉱脈のセルごとにも微妙に明暗を変える */
const EC = [0, 0, 0];
function earthColor(gx, gy, detailed){
  const m = MATS[materialAt(gx, gy, !detailed)], idx = gy * D + gx;
  const vary = detailed ? 0.90 + hash01(idx) * 0.18 : 0.94 + hash01(idx) * 0.1;
  const cellShade = detailed ? 0.96 + coarseHash((gx >> 3) + 11, (gy >> 3) + 5) * 0.08 : 1;
  const v = vary * cellShade;
  EC[0] = Math.min(255, m.r * v) | 0; EC[1] = Math.min(255, m.g * v) | 0; EC[2] = Math.min(255, m.b * v) | 0;
  return EC;
}
