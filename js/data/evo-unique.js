"use strict";
/* =========================================================
   data/evo-unique.js - 固有覚醒 (武器ごとに1つずつ・全武器すべて別物)

   覚醒 ★1 で目覚め、★が上がるほど強くなる、その武器だけの能力。
   1つの固有覚醒 = 「発動条件 (TRIG)」 x 「効果 (VERB)」。
   同じ組み合わせの武器は2つと無い (読み込み時に検査し、重複や条件の不整合があればコンソールに出す)。

   - 強さは ★ごとに EVO_F 倍 (★5・★10 で大きく跳ねる)、再発動は EVO_CD 倍に短くなる。
     範囲 (r) は ★5 で +1、★10 で +2。★10「真覚醒」では名前に「真・」が付く
   - 再発動の間隔 (cd) は武器ごと。自機・攻撃ボット・僚機で共有する (どれだけ撃っても暴走しない)
   - 範囲を砕く効果は「ブロックの最大HPの◯%」で、撃破の余波キュー (aftershock) に積む
     (数フレームに分けて崩れる。重さの上限は既存の余波と同じ)
   - 弾を生む効果 (追尾弾・全方位弾・砲台…) の威力は「その武器の通常弾1発」が基準
   - 自機専用の効果 (連射・威力・コイン・経験値の加速、同じ射撃のくり返し、光球) は、その武器を自機が装備中のときだけ

   フック (呼び出し元):
     game/combat.js  damageBlock → evoHit / onBlockBroken → evoBreak / shootRaw → evoShot / shoot → evoDmgMul / コイン → evoCoinMul
     game/loop.js    evoTick (毎フレーム) / 跳弾・貫通・子弾・重力球・設置爆弾 → evoEvent / 連射 → evoRateMul
     game/skill-fx.js 時限爆弾 → evoEvent("bomb")    game/skill-hooks.js 経験値 → evoXpMul
     render/draw.js  drawEvoUniques (光球・砲台・隕石の予告・加速中の輪)
   ========================================================= */

const EVO_F  = [0, 1, 1.25, 1.4, 1.55, 1.85, 2.1, 2.3, 2.5, 2.75, 3.6];        // ★ごとの強さ
const EVO_CD = [1, 1, 1, 0.95, 0.82, 0.8, 0.77, 0.74, 0.64, 0.6, 0.45];       // ★ごとの再発動の短さ
const evoRB = s => s >= 10 ? 2 : s >= 5 ? 1 : 0;                              // 範囲の伸び

/* ---------- 発動条件 ---------- */
const EVO_TRIG = {
  hit:       { txt: () => "命中時" },
  crit:      { txt: () => "会心の一撃で", need: w => w.critC > 0 },
  frozen:    { txt: () => "凍ったブロックに当てると", need: w => w.frost > 0 },
  burning:   { txt: () => "燃えている・溶けているブロックに当てると", need: w => w.burn > 0 || w.acid > 0 || w.radiation > 0 },
  fresh:     { txt: () => "無傷のブロックに当てると" },
  weak:      { txt: () => "ブロックを瀕死 (残りHP25%以下) に追い込むと" },
  far:       { txt: () => "射程の奥 (7割より先) に当てると" },
  near:      { txt: () => "至近距離 (射程の3割以内) で当てると" },
  break:     { txt: () => "ブロックを壊すと" },
  rare:      { txt: () => "宝石・爆発物ブロックを壊すと" },
  breakN:    { txt: u => `${u.c}個壊すごとに` },
  combo:     { txt: u => `1秒以内に${u.c}個壊すと` },
  exec:      { txt: () => "処刑でブロックを砕くと", need: w => w.exec > 0 },
  shot:      { txt: () => "撃つと" },
  shotN:     { txt: u => `${u.c}回撃つごとに` },
  moveShot:  { txt: () => "移動しながら撃つと" },
  stillShot: { txt: () => "立ち止まって撃つと" },
  pulse:     { txt: () => "波動を放つと", need: w => w.mode === "aura" },
  chainEnd:  { txt: () => "連鎖が尽きた地点で", need: w => w.mode === "chain" },
  spin:      { txt: () => "最高回転で撃つと", need: w => w.spinMax > 0 },
  bounce:    { txt: () => "跳ね返るたび", need: w => w.bounce > 0 },
  pierce:    { txt: () => "貫通するたび", need: w => w.pierce > 0 },
  cluster:   { txt: () => "子弾が飛び散ると", need: w => w.frags > 0 },
  orbEnd:    { txt: () => "重力球が消えるとき", need: w => !!w.orb },
  bomb:      { txt: () => "仕掛けた爆弾が爆ぜると", need: w => w.bomb > 0 },
  mine:      { txt: () => "設置爆弾が爆ぜると", need: w => w.mine > 0 },
  timer:     { txt: () => "自動で" },
};

/* ---------- 効果 ---------- */
const euP = v => Math.round(v * 100) + "%";
const euSq = r => `${2 * r + 1}×${2 * r + 1}`;
const evoMaxHP = j => blockMaxHP(j % D, (j / D) | 0);
const euHitJ = (j, m) => { if (j >= 0) aftershock(j, evoMaxHP(j) * m, SHOCK_NONE); };
const euAt = (gx, gy, m) => euHitJ(liveAt(gx, gy), m);
function euRect(gx, gy, r, fn){ for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++){ const j = liveAt(gx + dx, gy + dy); if (j >= 0) fn(j, dx, dy); } }
const euRGB = w => hexRGB(w.accent);
const euFxRing = (c, rPx, dur, col) => addRing({ x: c.x, y: c.y, r: rPx, color: col || euRGB(c.w), dur: dur || 380, evo: c.w.evo || 0 });
const euFxBeam = (c, x1, y1, x2, y2, o) => addBeam(Object.assign({ x1, y1, x2, y2, w: 3 + 0.4 * (c.w.evo || 0), color: c.w.accent, life: 220, evo: c.w.evo || 0 }, o));
// 格子方向へ一直線 (空洞は飛び越えて続く)
function euLine(c, dx, dy, len, m){
  for (let s = 1; s <= len; s++) euAt(c.gx + dx * s, c.gy + dy * s, m);
  const n = Math.hypot(dx, dy);
  euFxBeam(c, c.x, c.y, c.x + dx / n * len * BS * n, c.y + dy / n * len * BS * n);
}
// 角度 a へ光線 (len マス)。width = 1 で幅3
function euRay(c, a, len, m, width){
  const ca = Math.cos(a), sa = Math.sin(a), seen = new Set();
  for (let d = BS / 2; d <= len * BS; d += BS / 2){
    const bx = c.x + ca * d, by = c.y + sa * d;
    for (let o = -(width || 0); o <= (width || 0); o++){
      const gx = w2g(bx - sa * o * BS), gy = w2g(by + ca * o * BS), k = gy * D + gx;
      if (seen.has(k)) continue;
      seen.add(k); euAt(gx, gy, m);
    }
  }
  euFxBeam(c, c.x, c.y, c.x + ca * len * BS, c.y + sa * len * BS, width ? { w: 7 + (c.w.evo || 0) } : null);
}
// 弾を生む (威力は通常弾が基準。fx は武器そのもの = 燃焼・処刑などの性能も乗る)
function evoBullet(c, a, dmg, o){
  if (bullets.length >= 800) return;
  const w = c.w, spd = ((o && o.spd) || 600) * BULLET_SPD_MUL, life = (o && o.life) || 0.9, sz = (w.size || 4) * 0.95;
  bullets.push({ x: c.x, y: c.y, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd, dmg, crit: false, fx: w, sz, splash: (o && o.splash) || 0, life,
    homing: !!(o && o.homing), targetIdx: -1, targetMob: 0, retargetT: 0, color: w.accent, pierce: (o && o.pierce) || 0, bounce: (o && o.bounce) || 0,
    split: 0, frags: 0, lastHit: (o && o.lastHit) !== undefined ? o.lastHit : -1, pl: c.pl, shape: w.shape || "dot", coinMul: 1, nova: 0, orb: 0, tickT: 0,
    move: (o && o.move) || null, seed: Math.random() * 6.283, age: 0, life0: life, spd0: spd, baseSz: sz, spin: w.spin || 0, pulse: 0,
    trail: true, glow: true, evo: w.evo || 0, mine: 0, ox: c.x, oy: c.y, form: w.form || w.shape || "dot", c2: w.c2 || "#ffffff", trailFx: w.trailFx || "ghost", child: true });
}
// 近くの生きたブロックを n 個 (自分自身は除く)
const euNear = (c, n, rPx) => findNearestBlocks(c.x, c.y, rPx || BS * 5, n, new Set([c.gy * D + c.gx]));
const euShuffle = a => { for (let i = a.length - 1; i > 0; i--){ const j = (Math.random() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };

// 遅れて起きること (隕石・くり返し射撃) と、画面に残る印 (隕石の予告円)
const evoLaterQ = [], evoMarks = [];
function evoLater(sec, fn){ if (evoLaterQ.length < 96) evoLaterQ.push({ t: sec, fn }); }
const evoTurrets = [], evoOrbs = [];
const evoBuf = { rate: [0, 0], dmg: [0, 0], coin: [0, 0], xp: [0, 0] };   // [終了時刻(ms), 倍率の上乗せ]
let evoBufColor = "#ffffff", evoEchoing = false;
let evoAimX = 0, evoAimY = 0;       // 直前の射撃の狙い (game/combat.js の shootWeapon が書く)
let evoExecFlag = false;            // いま処理中の命中が「装備の処刑」で砕いたか (game/combat.js が立てる)

const EVO_VERB = {
  // --- 形を描いて砕く ---
  burst:    { def: { r: 1, m: 1.5 }, d: q => `周囲${euSq(q.r)}を最大HPの${euP(q.m)}で吹き飛ばす`,
    run: (c, q) => { euRect(c.gx, c.gy, q.r, j => euHitJ(j, q.m)); euFxRing(c, BS * (q.r + 1), 420); burstAt(c.x, c.y, c.w, null); }, big: true },
  cross:    { def: { len: 5, m: 1.5 }, d: q => `十字4方向へ${q.len}マス、最大HPの${euP(q.m)}の光が走る`,
    run: (c, q) => { for (const [dx, dy] of N4) euLine(c, dx, dy, q.len, q.m); euFxRing(c, BS * 1.6, 300); } },
  saltire:  { def: { len: 5, m: 1.5 }, d: q => `斜め4方向へ${q.len}マスを最大HPの${euP(q.m)}で切り裂く`,
    run: (c, q) => { for (const [dx, dy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) euLine(c, dx, dy, q.len, q.m); euFxRing(c, BS * 1.6, 300); } },
  star:     { def: { len: 4, m: 1.5 }, d: q => `8方向へ${q.len}マスの星形に、最大HPの${euP(q.m)}で砕く`,
    run: (c, q) => { for (const [dx, dy] of N8) euLine(c, dx, dy, q.len, q.m); euFxRing(c, BS * 2, 360); burstAt(c.x, c.y, c.w, null); } },
  lance:    { def: { len: 7, m: 1.8 }, d: q => `射線の奥へ${q.len}マスを一直線に、最大HPの${euP(q.m)}で貫く`,
    run: (c, q) => euRay(c, c.a, q.len, q.m, 0) },
  drill:    { def: { len: 6, m: 1.5 }, d: q => `射線の奥へ幅3のトンネルを${q.len}マス掘り抜く (最大HPの${euP(q.m)})`,
    run: (c, q) => euRay(c, c.a, q.len, q.m, 1) },
  row:      { def: { len: 6, m: 1.5 }, d: q => `横一列 (左右${q.len}マス) を最大HPの${euP(q.m)}で薙ぎ払う`,
    run: (c, q) => { euAt(c.gx, c.gy, q.m); euLine(c, 1, 0, q.len, q.m); euLine(c, -1, 0, q.len, q.m); } },
  col:      { def: { len: 6, m: 1.5 }, d: q => `縦一列 (上下${q.len}マス) を最大HPの${euP(q.m)}で貫く`,
    run: (c, q) => { euAt(c.gx, c.gy, q.m); euLine(c, 0, 1, q.len, q.m); euLine(c, 0, -1, q.len, q.m); } },
  ringwave: { def: { r: 3, m: 1.5 }, d: q => `半径${q.r}マスの輪の衝撃波が、最大HPの${euP(q.m)}で砕く`,
    run: (c, q) => { const r = q.r; euRect(c.gx, c.gy, r + 1, (j, dx, dy) => { const d = Math.hypot(dx, dy); if (d >= r - 0.75 && d <= r + 0.75) euHitJ(j, q.m); }); euFxRing(c, BS * r, 480); euFxRing(c, BS * (r + 0.6), 560, "255,255,255"); }, big: true },
  diamond:  { def: { r: 2, m: 1.6 }, d: q => `ひし形 (${q.r}マス以内) を最大HPの${euP(q.m)}で砕く`,
    run: (c, q) => { euRect(c.gx, c.gy, q.r, (j, dx, dy) => { if (Math.abs(dx) + Math.abs(dy) <= q.r) euHitJ(j, q.m); }); euFxRing(c, BS * (q.r + 0.5), 360); burstAt(c.x, c.y, c.w, null); } },
  checker:  { def: { r: 2, m: 2 }, d: q => `周囲${euSq(q.r)}を市松模様に、最大HPの${euP(q.m)}で砕く`,
    run: (c, q) => { euRect(c.gx, c.gy, q.r, (j, dx, dy) => { if (((dx + dy) & 1) === 0) euHitJ(j, q.m); }); euFxRing(c, BS * (q.r + 1), 420); } },
  spiral:   { def: { n: 12, m: 1.5 }, d: q => `渦を巻いて${q.n}マスを最大HPの${euP(q.m)}で削り取る`,
    run: (c, q) => {
      let x = 0, y = 0, dx = 1, dy = 0, seg = 1, k = 0, done = 0;
      while (done < q.n && k < 400){
        for (let t = 0; t < 2 && done < q.n; t++){ for (let i = 0; i < seg && done < q.n; i++){ x += dx; y += dy; k++; if (liveAt(c.gx + x, c.gy + y) >= 0){ euAt(c.gx + x, c.gy + y, q.m); done++; } } [dx, dy] = [-dy, dx]; }
        seg++;
      }
      euFxRing(c, BS * 1.5, 300); euFxRing(c, BS * 3, 520);
    } },
  scatter:  { def: { r: 4, n: 6, m: 1.6 }, d: q => `周囲${q.r}マス内のランダムな${q.n}か所を最大HPの${euP(q.m)}で砕く`,
    run: (c, q) => { const cand = []; euRect(c.gx, c.gy, q.r, j => cand.push(j)); euShuffle(cand); for (let i = 0; i < q.n && i < cand.length; i++){ const j = cand[i]; euHitJ(j, q.m); burstAt(g2w(j % D), g2w((j / D) | 0), c.w, null); } euFxRing(c, BS * q.r, 400); } },
  sunder:   { def: { r: 2, x: 0.4 }, d: q => `周囲${euSq(q.r)}の残りHPを${euP(Math.min(0.95, q.x))}えぐり取る`,
    run: (c, q) => { const x = Math.min(0.95, q.x); euRect(c.gx, c.gy, q.r, j => aftershock(j, blockHP(j) * x, SHOCK_NONE)); euFxRing(c, BS * (q.r + 1), 450); } },
  reap:     { def: { r: 2, th: 0.45 }, d: q => `周囲${euSq(q.r)}の残りHP${euP(q.th)}以下のブロックを即座に砕く`,
    run: (c, q) => { euRect(c.gx, c.gy, q.r, j => { if (blockHP(j) <= evoMaxHP(j) * q.th) euHitJ(j, 3); }); euFxRing(c, BS * (q.r + 1), 400, "255,80,110"); } },
  resonate: { def: { r: 5, m: 2.5 }, d: q => `${q.r}マス以内の同じ素材のブロックを、最大HPの${euP(q.m)}で共鳴破砕`,
    run: (c, q) => { const mi = materialAt(c.gx, c.gy); euRect(c.gx, c.gy, q.r, j => { if (materialAt(j % D, (j / D) | 0) === mi) euHitJ(j, q.m); }); euFxRing(c, BS * q.r, 520); euFxRing(c, BS * q.r * 0.6, 420, "255,255,255"); } },
  quake:    { def: { r: 6, m: 0.5 }, d: q => `自機の周囲${q.r}マスを揺らし、最大HPの${euP(q.m)}を削る大地震`,
    run: (c, q) => { const pc = { x: player.x, y: player.y, w: c.w }; euRect(w2g(player.x), w2g(player.y), q.r, j => euHitJ(j, q.m)); euFxRing(pc, BS * q.r, 650); euFxRing(pc, BS * q.r * 0.6, 500, "255,255,255"); }, big: true },
  mirror:   { def: { r: 1, m: 2 }, d: q => `自機を挟んだ反対側に、鏡写しの爆発 (${euSq(q.r)}・最大HPの${euP(q.m)})`,
    run: (c, q) => {
      const mx = 2 * player.x - c.x, my = 2 * player.y - c.y, mc = { x: mx, y: my, w: c.w };
      euRect(c.gx, c.gy, q.r, j => euHitJ(j, q.m)); euRect(w2g(mx), w2g(my), q.r, j => euHitJ(j, q.m));
      euFxRing(c, BS * (q.r + 1), 380); euFxRing(mc, BS * (q.r + 1), 380); euFxBeam(c, c.x, c.y, mx, my, { w: 1.5, life: 260 });
    } },
  domino:   { def: { n: 7, m: 2 }, d: q => `隣へ隣へ${q.n}回のドミノ倒し (最大HPの${euP(q.m)})`,
    run: (c, q) => {
      let gx = c.gx, gy = c.gy; const hit = new Set();
      for (let i = 0; i < q.n; i++){
        const cand = [];
        for (const [dx, dy] of N8){ const j = liveAt(gx + dx, gy + dy); if (j >= 0 && !hit.has(j)) cand.push(j); }
        if (!cand.length) break;
        const j = cand[(Math.random() * cand.length) | 0], nx = j % D, ny = (j / D) | 0;
        hit.add(j); euHitJ(j, q.m);
        euFxBeam(c, g2w(gx), g2w(gy), g2w(nx), g2w(ny), { w: 2.5, life: 260 });
        gx = nx; gy = ny;
      }
    } },
  arcs:     { def: { n: 4, m: 1.2 }, d: q => `近くの${q.n}ブロックへ稲妻が走る (最大HPの${euP(q.m)})`,
    run: (c, q) => { for (const j of euNear(c, q.n, BS * 7)){ euFxBeam(c, c.x, c.y, g2w(j % D), g2w((j / D) | 0), { zig: true, w: 2, life: 150 }); euHitJ(j, q.m); } } },
  thunder:  { def: { n: 3, r: 5, m: 2.5 }, d: q => `周囲${q.r}マスに${q.n}本の落雷 (最大HPの${euP(q.m)}・隣にも半分)`,
    run: (c, q) => {
      const cand = []; euRect(c.gx, c.gy, q.r, j => cand.push(j)); euShuffle(cand);
      for (let i = 0; i < q.n && i < cand.length; i++){
        const j = cand[i], gx = j % D, gy = (j / D) | 0, x = g2w(gx), y = g2w(gy);
        euHitJ(j, q.m); for (const [dx, dy] of N4) euAt(gx + dx, gy + dy, q.m * 0.5);
        euFxBeam(c, x + 120, y - 700, x, y, { zig: true, w: 3.5, life: 180 });
        addRing({ x, y, r: BS * 1.5, color: euRGB(c.w), dur: 260 });
      }
    }, big: true },
  // --- 弾を生む ---
  seekers:  { def: { n: 3, x: 1.5 }, d: q => `追尾弾${q.n}発を放つ (1発 = 通常弾の${euP(q.x)})`,
    run: (c, q) => { for (let i = 0; i < q.n; i++) evoBullet(c, Math.random() * 6.283, c.dmg * q.x, { homing: true, life: 1.4, spd: 520, lastHit: c.gy * D + c.gx }); euFxRing(c, BS * 1.2, 260); } },
  nova:     { def: { n: 10, x: 1 }, d: q => `全方位へ${q.n}発の弾を放つ (通常弾の${euP(q.x)})`,
    run: (c, q) => { const a0 = Math.random() * 6.283; for (let i = 0; i < q.n; i++) evoBullet(c, a0 + i * 6.283 / q.n, c.dmg * q.x, { life: 0.55, spd: 700 }); euFxRing(c, BS * 2, 320); } },
  bloom:    { def: { n: 6, x: 1.2 }, d: q => `ふわりと漂い弾ける花弾${q.n}発 (通常弾の${euP(q.x)}・周囲3×3も巻き込む)`,
    run: (c, q) => { for (let i = 0; i < q.n; i++) evoBullet(c, i * 6.283 / q.n, c.dmg * q.x, { move: "drift", splash: 1, life: 1.3, spd: 300 }); euFxRing(c, BS * 1.8, 420); } },
  bouncers: { def: { n: 3, x: 1.2, b: 4 }, d: q => `${q.b}回跳ね回る弾${q.n}発 (通常弾の${euP(q.x)})`,
    run: (c, q) => { for (let i = 0; i < q.n; i++) evoBullet(c, Math.random() * 6.283, c.dmg * q.x, { bounce: q.b, life: 1.1 }); } },
  piercers: { def: { n: 3, x: 1.2, pc: 5 }, d: q => `${q.pc}個貫通する弾を扇状に${q.n}発 (通常弾の${euP(q.x)})`,
    run: (c, q) => { for (let i = 0; i < q.n; i++) evoBullet(c, c.a + (i - (q.n - 1) / 2) * 0.18, c.dmg * q.x, { pierce: q.pc, life: 0.8, spd: 900 }); } },
  meteor:   { def: { r: 2, m: 3 }, d: q => `0.6秒後、半径${q.r}マスに隕石が落ちる (最大HPの${euP(q.m)})`,
    run: (c, q) => evoMeteor(c, c.x, c.y, q.r, q.m, 0.6) },
  comets:   { def: { n: 3, r: 1, m: 2.5 }, d: q => `周囲に${q.n}個の流星が降りそそぐ (各${euSq(q.r)}・最大HPの${euP(q.m)})`,
    run: (c, q) => { for (let i = 0; i < q.n; i++){ const a = Math.random() * 6.283, d = BS * (1 + Math.random() * 4); evoMeteor(c, c.x + Math.cos(a) * d, c.y + Math.sin(a) * d, q.r, q.m, 0.35 + i * 0.16); } } },
  blackhole:{ def: { R: 48, t: 2.5, x: 1 }, d: q => `${evoR2(q.t)}秒その場にとどまる重力球 (半径${q.R}・毎秒8回 通常弾の${euP(q.x)})`,
    run: (c, q) => { if (bullets.length >= 800) return; bullets.push({ x: c.x, y: c.y, vx: 0, vy: 0, dmg: c.dmg * q.x, splash: 0, life: q.t, orb: q.R, tickT: 0, lastHit: -1, color: c.w.accent, shape: "orb", sz: 6, evo: c.w.evo || 0, seed: Math.random() * 6 }); euFxRing(c, q.R * 1.4, 500); }, big: true },
  turret:   { def: { t: 4, x: 1.2, rate: 5 }, d: q => `その場に砲台を${evoR2(q.t)}秒置く (毎秒${q.rate}発・通常弾の${euP(q.x)})`,
    run: (c, q) => { if (evoTurrets.length >= 6) evoTurrets.shift(); evoTurrets.push({ x: c.x, y: c.y, until: nowMs + q.t * 1000, fireT: 0, rate: q.rate, dmg: c.dmg * q.x, w: c.w, pl: c.pl, a: c.a }); euFxRing(c, BS * 1.5, 400); } },
  orbit:    { def: { n: 2, t: 4, m: 1.2 }, self: true, d: q => `自機のまわりを${q.n}個の光球が${evoR2(q.t)}秒巡り、触れたブロックを最大HPの${euP(q.m)}で砕く`,
    run: (c, q) => { evoOrbs.length = 0; for (let i = 0; i < Math.min(8, q.n); i++) evoOrbs.push({ a: i * 6.283 / q.n, until: nowMs + q.t * 1000, m: q.m, w: c.w, hitT: 0 }); euFxRing({ x: player.x, y: player.y, w: c.w }, 60, 420); } },
  sweep:    { def: { deg: 60, len: 6, m: 1.5 }, d: q => `${q.deg}°の扇に光を走らせ、${q.len}マス先まで最大HPの${euP(q.m)}で薙ぐ`,
    run: (c, q) => { const n = Math.max(3, Math.round(q.deg / 9)), span = q.deg * Math.PI / 180; for (let i = 0; i < n; i++){ const a = q.deg >= 360 ? c.a + i * span / n : c.a - span / 2 + span * i / (n - 1); euRay(c, a, q.len, q.m, 0); } euFxRing(c, BS * 2, 360); } },
  echo:     { def: { n: 1, x: 1 }, self: true, d: q => `同じ射撃を${q.n}回くり返す (威力${euP(q.x)})`,
    run: (c, q) => { for (let i = 0; i < q.n; i++) evoLater(0.12 * (i + 1), () => { if (state.weapon !== c.k) return; evoEchoing = true; try { shoot(player.x, player.y, shotDamage(c.k) * q.x, null, false); } finally { evoEchoing = false; } }); } },
  // --- 状態を付ける ---
  freeze:   { def: { r: 2 }, d: q => `周囲${euSq(q.r)}を凍らせる (受けるダメージ +30%)`,
    run: (c, q) => { euRect(c.gx, c.gy, q.r, j => { if (frosts.size < 1500 || frosts.has(j)){ frosts.set(j, 3); frostGen.set(j, 0); } }); euFxRing(c, BS * (q.r + 1), 500, "150,230,255"); } },
  ignite:   { def: { r: 1, x: 0.18 }, d: q => `周囲${euSq(q.r)}を燃やす (毎秒 最大HPの${euP(q.x)}・3秒)`,
    run: (c, q) => { euRect(c.gx, c.gy, q.r, j => { if (burns.size < 800 || burns.has(j)) burns.set(j, { d: evoMaxHP(j) * q.x, t: 3, k: "burn" }); }); euFxRing(c, BS * (q.r + 1), 420, "255,130,50"); } },
  corrode:  { def: { r: 1, x: 0.15 }, d: q => `周囲${euSq(q.r)}を腐食させる (毎秒 最大HPの${euP(q.x)}・4秒)`,
    run: (c, q) => { euRect(c.gx, c.gy, q.r, j => { if (burns.size < 800 || burns.has(j)) burns.set(j, { d: evoMaxHP(j) * q.x, t: 4, k: "acid" }); }); euFxRing(c, BS * (q.r + 1), 480, "120,255,90"); } },
  irradiate:{ def: { r: 1, x: 0.15 }, d: q => `周囲${euSq(q.r)}を被曝させる (毎秒 最大HPの${euP(q.x)}・壊れると隣へ移る)`,
    run: (c, q) => { euRect(c.gx, c.gy, q.r, j => { if (burns.size < 800 || burns.has(j)) burns.set(j, { d: evoMaxHP(j) * q.x, t: 4, rad: true, k: "rad" }); }); euFxRing(c, BS * (q.r + 1), 480, "200,120,255"); } },
  prism:    { def: { r: 1, x: 0.15 }, d: q => `周囲${euSq(q.r)}に燃焼・氷結・腐食・放射のどれかを一つずつ灯す (毎秒 最大HPの${euP(q.x)})`,
    run: (c, q) => {
      euRect(c.gx, c.gy, q.r, j => {
        const e = (Math.random() * 4) | 0;
        if (e === 1){ if (frosts.size < 1500) { frosts.set(j, 3); frostGen.set(j, 0); } }
        else if (burns.size < 800) burns.set(j, { d: evoMaxHP(j) * q.x, t: e === 0 ? 3 : 4, k: ["burn", 0, "acid", "rad"][e], rad: e === 3 });
      });
      euFxRing(c, BS * (q.r + 1), 420, "255,120,40"); euFxRing(c, BS * (q.r + 0.5), 360, "120,220,255");
    } },
  expose:   { def: { r: 2, x: 0.6, t: 4 }, d: q => `周囲${euSq(q.r)}の弱点を暴く (${evoR2(q.t)}秒間 受けるダメージ +${euP(q.x)})`,
    run: (c, q) => { const u = nowMs + q.t * 1000, x = 1 + q.x; euRect(c.gx, c.gy, q.r, j => { if (evoVuln.size < 4000) evoVuln.set(j, { u, x }); }); euFxRing(c, BS * (q.r + 1), 450, "255,90,140"); } },
  overload: { def: { r: 2, t: 3 }, d: q => `周囲${euSq(q.r)}を過負荷にする (${evoR2(q.t)}秒間 受けるダメージ +25%)`,
    run: (c, q) => { euRect(c.gx, c.gy, q.r, j => overloads.set(j, q.t)); euFxRing(c, BS * (q.r + 1), 380, "255,225,77"); for (const j of euNear(c, 3, BS * 3)) euFxBeam(c, c.x, c.y, g2w(j % D), g2w((j / D) | 0), { zig: true, w: 1.5, life: 140, color: "#ffe14d" }); } },
  ember:    { def: { r: 2, t: 4 }, d: q => `周囲${euSq(q.r)}に残り火を灯す (${evoR2(q.t)}秒間 受けるダメージ +20%)`,
    run: (c, q) => { euRect(c.gx, c.gy, q.r, j => embers.set(j, q.t)); euFxRing(c, BS * (q.r + 1), 450, "255,150,60"); } },
  plant:    { def: { n: 3, m: 2 }, d: q => `近くの${q.n}ブロックに時限爆弾 (1.2秒後 最大HPの${euP(q.m)}で周囲ごと起爆)`,
    run: (c, q) => { for (const j of euNear(c, q.n, BS * 5)){ if (!bombSet.has(j) && bombs.length < 200){ bombSet.add(j); bombs.push({ idx: j, t: 1.2, dmg: evoMaxHP(j) * q.m }); } } } },
  // --- 実り ---
  gild:     { def: { n: 2 }, d: q => `近くの${q.n}ブロックを黄金に変える (壊すとコイン ×${GOLD_MUL})`,
    run: (c, q) => { for (const j of euNear(c, q.n * 2, BS * 5)){ if (goldSet.size >= 4000) break; if (!goldSet.has(j)){ goldSet.add(j); addRing({ x: g2w(j % D), y: g2w((j / D) | 0), r: BS, color: "255,214,10", dur: 420 }); if (--q.left === 0) break; } } },
    prep: q => { q.left = q.n; } },
  coinburst:{ def: { x: 6 }, d: q => `コインが噴き出す (そのブロックの${evoR2(q.x)}倍)`,
    run: (c, q) => {
      const v = Math.max(1, Math.round(blockCoinValue(c.gx, c.gy) * q.x * coinMulStatic() * weaponYield() / 4));
      for (let i = 0; i < 4; i++){ const a = Math.random() * 6.283, sp = 140 + Math.random() * 220; spawnCoin({ x: c.x, y: c.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, value: v, chest: false, age: 0 }); }
      euFxRing(c, BS * 1.5, 420, "255,214,10");
    } },
  ore:      { def: { n: 3 }, d: q => `その素材を さらに +${q.n}個`,
    run: (c, q) => { const m = MATS[materialAt(c.gx, c.gy)]; if (!m) return; invAdd(m.key, q.n); noteDrop(c.x, c.y, m, q.n); euFxRing(c, BS * 1.2, 360, matColorRGB(m)); } },
  wisdom:   { def: { x: 4 }, d: q => `そのブロックの経験値を さらに ${evoR2(q.x)}倍ぶん得る`,
    run: (c, q) => { const m = MATS[materialAt(c.gx, c.gy)]; gainXP(blockXP(c.gx, c.gy) * (m ? m.xp : 1) * q.x); euFxRing(c, BS * 1.4, 400, "140,200,255"); } },
  treasure: { def: { n: 1 }, d: q => `近くの${q.n}ブロックを「お宝」に変える (壊すと素材・コイン・経験値の大ボーナス)`,
    run: (c, q) => { let n = q.n; for (const j of euNear(c, q.n * 3, BS * 8)){ if (n <= 0 || treasureSet.size >= 80) break; if (!treasureSet.has(j)){ treasureSet.add(j); n--; addRing({ x: g2w(j % D), y: g2w((j / D) | 0), r: BS * 1.6, color: "255,214,64", dur: 600 }); } } } },
  magnet:   { def: { R: 500 }, d: q => `自機の周囲${q.R}のコインを一瞬で回収する`,
    run: (c, q) => { const r2 = q.R * q.R; for (let i = coinsArr.length - 1; i >= 0; i--){ const cn = coinsArr[i], dx = cn.x - player.x, dy = cn.y - player.y; if (dx * dx + dy * dy < r2){ gainCoin(cn); removeCoinAt(i); } } hudDirty = true; euFxRing({ x: player.x, y: player.y, w: c.w }, q.R, 520, "255,214,10"); } },
  // --- 自機の加速 ---
  frenzy:   { def: { t: 2.5, x: 0.8 }, self: true, d: q => `${evoR2(q.t)}秒間 連射 +${euP(q.x)}`, run: (c, q) => evoBuff("rate", c, q) },
  fury:     { def: { t: 3, x: 0.6 }, self: true, d: q => `${evoR2(q.t)}秒間 威力 +${euP(q.x)}`, run: (c, q) => evoBuff("dmg", c, q) },
  goldtime: { def: { t: 4, x: 1 }, self: true, d: q => `${evoR2(q.t)}秒間 コイン +${euP(q.x)}`, run: (c, q) => evoBuff("coin", c, q) },
  xptime:   { def: { t: 4, x: 1 }, self: true, d: q => `${evoR2(q.t)}秒間 経験値 +${euP(q.x)}`, run: (c, q) => evoBuff("xp", c, q) },
};
const evoVuln = new Map();   // 弱点露出 (固有覚醒): idx -> {u: 終了時刻, x: 倍率}。skillHitMods が読む
function evoBuff(kind, c, q){ evoBuf[kind] = [nowMs + q.t * 1000, q.x]; evoBufColor = c.w.accent; euFxRing({ x: player.x, y: player.y, w: c.w }, 70, 520); }
const evoBufOn = kind => nowMs < evoBuf[kind][0];
const evoRateMul = () => evoBufOn("rate") ? 1 + evoBuf.rate[1] : 1;
const evoDmgMul  = () => evoBufOn("dmg")  ? 1 + evoBuf.dmg[1]  : 1;
const evoCoinMul = () => evoBufOn("coin") ? 1 + evoBuf.coin[1] : 1;
const evoXpMul   = () => evoBufOn("xp")   ? 1 + evoBuf.xp[1]   : 1;
function evoMeteor(c, x, y, r, m, delay){
  evoMarks.push({ x, y, r: BS * (r + 0.5), t0: nowMs, t1: nowMs + delay * 1000, color: c.w.accent });
  evoLater(delay, () => {
    const mc = { x, y, w: c.w, gx: w2g(x), gy: w2g(y) };
    euRect(mc.gx, mc.gy, r, (j, dx, dy) => { if (dx * dx + dy * dy <= (r + 0.5) * (r + 0.5)) euHitJ(j, m); });
    addBeam({ x1: x + 260, y1: y - 900, x2: x, y2: y, w: 6, color: c.w.accent, life: 160, evo: c.w.evo || 0 });
    euFxRing(mc, BS * (r + 1.2), 480); euFxRing(mc, BS * (r + 0.4), 360, "255,255,255"); burstAt(x, y, c.w, null);
    if (typeof sndBoom === "function") sndBoom();
  });
}

/* ---------- 武器ごとの固有覚醒 (全武器・発動条件 x 効果 の組み合わせは全て別) ----------
   key: [名前, 発動条件, 再発動(秒), 効果, 効果の値 (省略時は効果の既定値), 条件の回数] */
const EVO_UNIQUE_SRC = {
  // ===== 地表 =====
  handDrill:          ["掘り抜き",         "shotN",     1,   "drill",     { len: 5 }, 8],
  woodBow:            ["木霊の矢",         "crit",      1.5, "seekers",   { n: 2 }],
  stoneSling:         ["地鳴り",           "break",     3,   "ringwave",  { r: 2 }],
  sandBlaster:        ["砂嵐",             "shot",      2.5, "scatter",   { r: 3, n: 5 }],
  waterJet:           ["水しぶき",         "bounce",    1.5, "burst",     { r: 1, m: 1.2 }],
  iceLance:           ["氷柱貫き",         "frozen",    2,   "lance",     { len: 7 }],
  clayBomb:           ["連鎖起爆",         "bomb",      2,   "plant",     { n: 2 }],
  saltShard:          ["塩の結晶化",       "hit",       3,   "checker",   { r: 1 }],
  coralNeedle:        ["珊瑚の枝分かれ",   "break",     2.5, "saltire",   { len: 4 }],
  shellBoomerang:     ["潮騒の真珠",       "bounce",    4,   "coinburst", { x: 5 }],
  // ===== 表土 =====
  flintGun:           ["火打ちの火花",     "crit",      1.5, "ignite",    { r: 1 }],
  copperGun:          ["銅貨の雨",         "breakN",    1,   "coinburst", { x: 8 }, 25],
  tinRapid:           ["錫鳴り",           "crit",      1.5, "arcs",      { n: 3 }],
  coalBurner:         ["炭塵爆発",         "burning",   2,   "burst",     { r: 1 }],
  limeCrusher:        ["風化崩落",         "weak",      2.5, "sunder",    { r: 2 }],
  amberLens:          ["集光",             "stillShot", 3,   "sweep",     { deg: 50, len: 7 }],
  sulfurFlare:        ["硫黄の飛び火",     "break",     2.5, "ignite",    { r: 2 }],
  bronzeGatling:      ["オーバードライブ", "spin",      3,   "nova",      { n: 12 }],
  fossilBreaker:      ["太古の記憶",       "exec",      1.5, "wisdom",    { x: 5 }],
  // ===== 地殻 =====
  ironCannon:         ["鉄片の連爆",       "cluster",   2,   "burst",     { r: 1, m: 1.8 }],
  leadSlug:           ["鉛の重圧",         "pierce",    2,   "row",       { len: 4 }],
  quartzLaser:        ["水晶の共振",       "hit",       2,   "arcs",      { n: 3 }],
  magnetHoming:       ["磁力回収",         "break",     6,   "magnet",    { R: 450 }],
  obsidianBlade:      ["黒曜の一閃",       "fresh",     2,   "lance",     { len: 6 }],
  silverArc:          ["銀雷の落下",       "chainEnd",  2.5, "thunder",   { n: 3 }],
  goldBullet:         ["黄金の伝染",       "break",     4,   "gild",      { n: 2 }],
  jadeRicochet:       ["翡翠の分身",       "bounce",    2,   "seekers",   { n: 2 }],
  amethystPrism:      ["紫の分光",         "hit",       2,   "prism",     { r: 1 }],
  graniteMissile:     ["巨岩落とし",       "break",     5,   "meteor",    { r: 2 }],
  basaltDrill:        ["溶岩トンネル",     "pierce",    3,   "drill",     { len: 7 }],
  lapisStorm:         ["瑠璃の余雷",       "chainEnd",  2,   "arcs",      { n: 5 }],
  zincSwarm:          ["群れの増殖",       "shot",      3,   "seekers",   { n: 3 }],
  steelVulcan:        ["鋼の熱狂",         "shotN",     4,   "fury",      { t: 2.5 }, 60],
  nickelShotgun:      ["零距離炸裂",       "near",      1.5, "burst",     { r: 1, m: 2 }],
  oilFlamethrower:    ["油だまり引火",     "burning",   2,   "ignite",    { r: 2 }],
  // ===== 上部マントル =====
  titaniumRail:       ["超電磁の残光",     "far",       2,   "lance",     { len: 12 }],
  tungstenAP:         ["芯抜き",           "hit",       2,   "reap",      { r: 1, th: 0.4 }],
  rubyLaser:          ["紅蓮の薙ぎ払い",   "burning",   3,   "sweep",     { deg: 60, len: 6 }],
  sapphireFrost:      ["氷晶爆砕",         "frozen",    3,   "burst",     { r: 2, m: 1.2 }],
  emeraldAcid:        ["毒霧の拡散",       "burning",   2.5, "corrode",   { r: 2 }],
  topazBeam:          ["黄金十字",         "shot",      3,   "cross",     { len: 6 }],
  garnetBarrage:      ["柘榴の流星",       "break",     4,   "comets",    { n: 2 }],
  magmaAura:          ["噴石",             "pulse",     4,   "meteor",    { r: 2 }],
  platinumCrit:       ["白金の刻印",       "crit",      2.5, "gild",      { n: 1 }],
  cobaltNova:         ["青い連星",         "break",     2.5, "nova",      { n: 10 }],
  chromeMirror:       ["鏡像反射",         "bounce",    2,   "mirror",    { r: 1 }],
  olivineVortex:      ["渦の核",           "pulse",     5,   "blackhole", { R: 48, t: 2 }],
  bismuthCluster:     ["階段結晶",         "cluster",   3,   "spiral",    { n: 12 }],
  lithiumFlash:       ["過電流",           "hit",       2.5, "overload",  { r: 2 }],
  diamondDrill:       ["金剛のひし形",     "pierce",    2.5, "diamond",   { r: 2 }],
  // ===== 下部マントル =====
  uraniumCannon:      ["臨界連鎖",         "break",     3,   "irradiate", { r: 2 }],
  thoriumEmber:       ["熾火の残照",       "burning",   3,   "ember",     { r: 2 }],
  iridiumStarbreaker: ["星砕きの波紋",     "hit",       4,   "ringwave",  { r: 5 }],
  osmiumSlug:         ["超重の地震",       "exec",      4,   "quake",     { r: 5 }],
  rhodiumLight:       ["反射光",           "hit",       2.5, "mirror",    { r: 1 }],
  palladiumCatalyst:  ["触媒の結晶化",     "break",     3,   "ore",       { n: 4 }],
  perovskiteResonance:["共鳴の終止符",     "chainEnd",  3,   "resonate",  { r: 5 }],
  moltenTorrent:      ["溶鉄の横溢",       "shotN",     1,   "row",       { len: 7 }, 6],
  spinelStarfall:     ["星屑の追撃",       "shot",      3,   "comets",    { n: 2 }],
  carbonadoNeedle:    ["黒金剛の一閃",     "crit",      2,   "lance",     { len: 9 }],
  stishoviteQuake:    ["衝撃の残響",       "pulse",     4,   "ringwave",  { r: 6 }],
  liquidIronSerpent:  ["大蛇の尾",         "chainEnd",  3,   "domino",    { n: 9 }],
  // ===== 外核 =====
  nickelMagstorm:     ["磁嵐の吹き返し",   "shotN",     1,   "nova",      { n: 14 }, 5],
  plasmaCannon:       ["プラズマ交差",     "shot",      3,   "saltire",   { len: 7 }],
  helium3Gravity:     ["重力崩壊",         "orbEnd",    1.5, "burst",     { r: 3, m: 1.6 }],
  ferrofluidMaelstrom:["磁性の渦潮",       "pulse",     6,   "magnet",    { R: 650 }],
  coriumDecay:        ["炉心溶融",         "exec",      3,   "irradiate", { r: 3 }],
  stellarRagnarok:    ["神々の雷槌",       "break",     4,   "thunder",   { n: 5 }],
  mercurySplit:       ["水銀の雫",         "cluster",   3,   "bouncers",  { n: 3 }],
  neutronNeedle:      ["中性子崩壊",       "far",       2.5, "reap",      { r: 2, th: 0.45 }],
  goldMeltRain:       ["黄金の洪水",       "break",     12,  "goldtime",  { t: 4 }],
  adamantJudgment:    ["断罪の十字",       "exec",      2.5, "cross",     { len: 7 }],
  voidRift:           ["裂け目の残滓",     "orbEnd",    2,   "blackhole", { R: 64, t: 3 }],
  // ===== 内核 =====
  starMetalOmega:     ["オメガの落日",     "cluster",   4,   "meteor",    { r: 3 }],
  darkMatterMaw:      ["顎の咀嚼",         "pulse",     3,   "reap",      { r: 4, th: 0.5 }],
  antimatterGenesis:  ["対消滅の星",       "cluster",   4,   "star",      { len: 6 }],
  chroniteInfinity:   ["時の再演",         "chainEnd",  4,   "echo",      { n: 1 }],
  aetherPrism:        ["七色の祝福",       "shot",      3,   "prism",     { r: 2 }],
  quantumSwarm:       ["量子の分岐",       "pierce",    2,   "seekers",   { n: 2 }],
  singularityCannon:  ["事象の地平",       "orbEnd",    2,   "nova",      { n: 18 }],
  primordialOrigin:   ["原点回帰の光環",   "timer",     8,   "sweep",     { deg: 360, len: 11 }],
  magmaForge:         ["鍛造の熱",         "burning",   8,   "fury",      { t: 3 }],
  permaFrost:         ["永久凍土",         "exec",      3,   "freeze",    { r: 3 }],
  toxicNeedle:        ["毒の針路",         "pierce",    2,   "corrode",   { r: 1 }],
  // ===== 衛星惑星 =====
  prismJudgment:      ["分光の断罪",       "exec",      2.5, "saltire",   { len: 6 }],
  voltTempest:        ["雷爆の余波",       "break",     2,   "arcs",      { n: 4 }],
  novaHeart:          ["星核の脈動",       "pulse",     4,   "star",      { len: 7 }],
  floraBloom:         ["満開",             "shot",      3,   "bloom",     { n: 6 }],
  amberHive:          ["分蜂",             "break",     2.5, "seekers",   { n: 3 }],
  fungusCannon:       ["胞子の大繁殖",     "bomb",      2.5, "corrode",   { r: 2 }],
  candyRain:          ["飴玉の流星群",     "combo",     4,   "comets",    { n: 3 }, 6],
  // ===== 小惑星 =====
  cobaltDrill:        ["コバルトの螺旋弾", "shotN",     1,   "piercers",  { n: 3 }, 8],
  sodaPopper:         ["弾ける泡",         "cluster",   2,   "scatter",   { n: 6 }],
  lunaSaber:          ["月光の薙ぎ",       "frozen",    3,   "sweep",     { deg: 70, len: 7 }],
  pumpkinBomber:      ["ジャック・オ・ランタン", "mine", 3,  "plant",     { n: 3 }],
  gummyLauncher:      ["べたべたグミ爆弾", "bounce",    2.5, "plant",     { n: 1 }],
  cometTail:          ["彗星の尾",         "chainEnd",  3,   "meteor",    { r: 2 }],
  dragonBreath:       ["竜の薙ぎ払い",     "shot",      3,   "sweep",     { deg: 80, len: 6 }],
  mirageMirror:       ["蜃気楼の残像",     "shot",      4,   "echo",      { n: 2, x: 0.8 }],
  auroraVeil:         ["オーロラの帯",     "timer",     9,   "orbit",     { n: 3, t: 5 }],
  gearShredder:       ["歯車の砲台",       "shotN",     6,   "turret",    { t: 4 }, 30],
  nebulaCloud:        ["星雲の帯電",       "break",     2.5, "overload",  { r: 2 }],
  aquaLance:          ["深海の凍結",       "frozen",    3,   "freeze",    { r: 2 }],
  crimsonReaper:      ["鮮血の鎌",         "exec",      2,   "seekers",   { n: 3 }],
  luminaJudgment:     ["光の審判",         "exec",      3,   "thunder",   { n: 3 }],
  jadeFang:           ["翡翠の毒牙",       "pierce",    2,   "expose",    { r: 1 }],
  horizonEnd:         ["地平の侵食",       "pulse",     4,   "sunder",    { r: 5, x: 0.3 }],
  boneLance:          ["骨砕き",           "fresh",     2.5, "domino",    { n: 6 }],
  rootWhip:           ["根の絡みつき",     "chainEnd",  3,   "expose",    { r: 2 }],
  stalacDrip:         ["鍾乳の雫柱",       "pierce",    2.5, "col",       { len: 6 }],
  saltPalace:         ["塩の宮殿",         "pulse",     4,   "checker",   { r: 4 }],
  // ===== 惑星内部 =====
  geodeRay:           ["晶洞の落雷",       "shot",      3,   "thunder",   { n: 3 }],
  lodestoneStorm:     ["磁極の鍍金",       "chainEnd",  4,   "gild",      { n: 2 }],
  sarcophagusJudge:   ["墓所の財宝",       "exec",      8,   "treasure",  { n: 1 }],
  brimFlame:          ["火の粉の延焼",     "cluster",   2,   "ignite",    { r: 1 }],
  stardustHarvest:    ["星屑の収穫",       "rare",      1.5, "ore",       { n: 6 }],
  coreHeartBeat:      ["鼓動の高鳴り",     "pulse",     9,   "fury",      { t: 3, x: 0.8 }],
  fairyBow:           ["妖精の鈴の音",     "hit",       3,   "coinburst", { x: 4 }],
  rainbowPrism:       ["虹の架け橋",       "shotN",     1,   "prism",     { r: 2 }, 8],
  spiritTreant:       ["精霊の花",         "chainEnd",  3,   "bloom",     { n: 5 }],
  dreamCannon:        ["夢見の加護",       "break",     12,  "xptime",    { t: 4 }],
  runeGrimoire:       ["ルーンの残光",     "exec",      3,   "ember",     { r: 2 }],
  chimeraFang:        ["急所の噛み痕",     "crit",      2,   "expose",    { r: 1 }],
  chronoRevolver:     ["時の巻き戻し",     "bounce",    3,   "echo",      { n: 1 }],
  seraphJudgment:     ["天使の十字",       "shotN",     1,   "cross",     { len: 7 }, 12],
  demonContract:      ["悪魔の取り立て",   "pulse",     5,   "gild",      { n: 3 }],
  yggdrasilRod:       ["世界樹の芽吹き",   "pulse",     4,   "bloom",     { n: 8 }],
  // ===== 惑星内部 (序盤) =====
  mossSpreader:       ["苔むす",           "hit",       2.5, "ember",     { r: 1 }],
  terraHammer:        ["大地叩き",         "stillShot", 4,   "quake",     { r: 4 }],
  sapGun:             ["樹液のねばり",     "hit",       2.5, "freeze",    { r: 1 }],
  ryusaShot:          ["流砂の渦",         "break",     3,   "spiral",    { n: 9 }],
  ammoShell:          ["巻貝の守り",       "shotN",     5,   "orbit",     { n: 1, t: 3 }, 6],
  anthraBurner:       ["炭の火種",         "burning",   3,   "plant",     { n: 1 }],
  aquaJet2:           ["水圧の伸び",       "moveShot",  2,   "lance",     { len: 6 }],
  rustGatling:        ["錆落とし",         "shotN",     6,   "frenzy",    { t: 2.5 }, 20],
  petalChain:         ["花吹雪",           "chainEnd",  3,   "scatter",   { n: 5 }],
  glassCannon:        ["硝子の砕片",       "exec",      2.5, "star",      { len: 4 }],
  // ===== 最難関 (専用の撃ち方は game/ultra.js。撃ち方に依らず働くよう、自動発動にしてある) =====
  supernovaHalo:      ["超新星の残光",     "timer",     4,   "ringwave",  { r: 8, m: 2 }],
  ragnaMeteor:        ["終末の星雨",       "timer",     3,   "comets",    { n: 6, r: 2, m: 3 }],
  galaxyEdge:         ["銀河の加速",       "timer",     8,   "frenzy",    { t: 3, x: 1 }],
  worldEater:         ["虚無の胃袋",       "timer",     5,   "blackhole", { R: 120, t: 3 }],
  omegaGenesis:       ["創世の祝福",       "timer",     10,  "treasure",  { n: 4 }],
};
const EVO_UNIQUE = {};
for (const k in EVO_UNIQUE_SRC){
  if (!WEAPONS[k]) continue;   // まだ無い武器の分は使わない
  const [name, t, cd, v, p, c] = EVO_UNIQUE_SRC[k];
  EVO_UNIQUE[k] = { k, name, t, cd, v, p: Object.assign({}, EVO_VERB[v] ? EVO_VERB[v].def : {}, p || {}), c: c || 0 };
}
// 検査: 全武器にあるか / 条件と効果が実在するか / 発動条件が武器の性能に合うか / 組み合わせの重複が無いか
(function evoUniqueAudit(){
  const sig = {}, bad = [];
  for (const k of WEAPON_KEYS){
    const u = EVO_UNIQUE[k];
    if (!u){ bad.push(`${k}: 固有覚醒が無い`); continue; }
    if (!EVO_TRIG[u.t]) bad.push(`${k}: 未知の発動条件 ${u.t}`);
    else if (EVO_TRIG[u.t].need && !EVO_TRIG[u.t].need(WEAPONS[k])) bad.push(`${k}: 発動条件 ${u.t} がこの武器では起きない`);
    if (!EVO_VERB[u.v]) bad.push(`${k}: 未知の効果 ${u.v}`);
    const s = u.t + "+" + u.v;
    if (sig[s]) bad.push(`${k}: ${sig[s]} と同じ組み合わせ (${s})`); else sig[s] = k;
  }
  if (bad.length) console.warn("[固有覚醒の検査]\n" + bad.join("\n"));
})();

/* ---------- ★ごとの値・説明文 ---------- */
const evoQCache = {};
function evoQ(u, s){
  const key = u.k + ":" + s;
  if (evoQCache[key]) return evoQCache[key];
  const f = EVO_F[s], rb = evoRB(s), p = u.p, q = {};
  const many = p.n !== undefined;   // 数が増える効果は、1つあたりの強さの伸びを √ に抑える (数 x 強さで二重に伸びすぎないように)
  for (const key2 in p){
    const v = p[key2];
    if (key2 === "r" || key2 === "b" || key2 === "pc") q[key2] = v + rb;
    else if (key2 === "len") q.len = Math.round(v * (1 + (f - 1) * 0.6));
    else if (key2 === "n") q.n = Math.max(1, Math.round(v * f));
    else if (key2 === "m" || key2 === "x") q[key2] = v * (many ? Math.sqrt(f) : f);
    else if (key2 === "t") q.t = v * (1 + 0.07 * (s - 1));
    else if (key2 === "th") q.th = Math.min(0.85, v + 0.03 * (s - 1));
    else if (key2 === "deg") q.deg = Math.min(360, Math.round(v * (1 + (f - 1) * 0.5)));
    else if (key2 === "R") q.R = Math.round(v * (1 + 0.08 * (s - 1)));
    else q[key2] = v;
  }
  if (u.v === "orbit") q.n = Math.min(8, q.n);   // 光球は8個まで (重なって見えなくなるので)
  q.cd = Math.max(0.3, u.cd * EVO_CD[s]);
  return (evoQCache[key] = q);
}
const evoCdTxt = v => (Math.round(v * 10) / 10) + "秒";
function evoUText(k, s){
  const u = EVO_UNIQUE[k]; if (!u) return "";
  const q = evoQ(u, Math.max(1, s)), d = EVO_VERB[u.v].d(q);
  if (u.t === "timer") return `${evoCdTxt(q.cd)}ごとに自動で、${d}`;
  return `${EVO_TRIG[u.t].txt(u)}、${d} (再発動 ${evoCdTxt(q.cd)})`;
}
// 道のりの1行用: その★での主な数値だけ
const EVO_SHORT = { r: v => `範囲${v}`, len: v => `${v}マス`, n: v => `×${v}`, m: v => `威力${euP(v)}`, x: v => `効果${euP(v)}`, t: v => `${evoR2(v)}秒`,
  th: v => `HP${euP(v)}以下`, deg: v => `${v}°`, R: v => `半径${v}`, b: v => `跳弾${v}`, pc: v => `貫通${v}` };
function evoUShort(k, s){
  const u = EVO_UNIQUE[k]; if (!u) return "";
  const q = evoQ(u, Math.max(1, s)), parts = [];
  for (const key in u.p) if (EVO_SHORT[key] && key !== "rate") parts.push(EVO_SHORT[key](q[key]));
  parts.push(`再発動${evoCdTxt(q.cd)}`);
  return parts.join("・");
}
const evoUName = (k, s) => { const u = EVO_UNIQUE[k]; return u ? (s >= EVO_MAX ? "真・" : "") + u.name : ""; };

/* ---------- 発動 ---------- */
const evoReady = {}, evoCnt = {}, evoComboT = {}, evoTagLast = {};
let evoSndT = 0;
const evoLight = h => { const n = parseInt(h.slice(1), 16), c = v => Math.round(v + (255 - v) * 0.45); return `rgb(${c(n >> 16 & 255)},${c(n >> 8 & 255)},${c(n & 255)})`; };
function evoFire(w, x, y, dmg, pl){
  const u = w.evoU, k = w.key, s = w.evoS || 1, V = EVO_VERB[u.v];
  if (V.self && k !== state.weapon) return false;
  const q = evoQ(u, s);
  evoReady[k] = nowMs + q.cd * 1000;
  const gx = w2g(x), gy = w2g(y), dx = x - player.x, dy = y - player.y;
  const c = { k, w, s, u, x, y, gx, gy, dmg: dmg || shotDamage(k), pl: !!pl, a: dx * dx + dy * dy > 4 ? Math.atan2(dy, dx) : Math.random() * 6.283 };
  if (V.prep) V.prep(q);
  V.run(c, q);
  // 発動の名前 (同じ武器は 1.8秒に1回まで)
  if (onScreen(x, y, 0) && procTags.length < PROC_TAG_MAX && nowMs - (evoTagLast[k] || -1e9) >= (fxLow() ? 4000 : 1800)){
    evoTagLast[k] = nowMs;
    procTags.push({ x, y, text: "★" + evoUName(k, s), color: evoLight(w.accent), t: nowMs });
  }
  if (nowMs - evoSndT > 110 && typeof tone === "function" && pl){
    evoSndT = nowMs;
    if (V.big && typeof sndBoom === "function") sndBoom(); else tone(620 + 45 * s, 0.1, "triangle", 0.03, 980 + 60 * s);
  }
  return true;
}
const evoIsReady = k => !(nowMs < (evoReady[k] || 0));
// 命中時 (damageBlock の攻撃そのもの = 余波は除く)。pre = 命中前の状態 (1 = 凍結, 2 = 燃焼/腐食/放射)
function evoHit(idx, gx, gy, raw, hp, cur, pre){
  const w = curFx, u = w.evoU, ex = evoExecFlag;
  evoExecFlag = false;
  if (!evoIsReady(w.key)) return;
  let ok = false;
  switch (u.t){
    case "hit": ok = true; break;
    case "crit": ok = dmgCritFlag; break;
    case "frozen": ok = !!(pre & 1); break;
    case "burning": ok = !!(pre & 2); break;
    case "fresh": ok = hp >= blockMaxHP(gx, gy) * 0.999; break;
    case "weak": ok = cur > 0 && cur <= blockMaxHP(gx, gy) * 0.25; break;
    case "exec": ok = ex; break;
    case "far": case "near": {
      if (!curPl) break;
      const d = Math.hypot(g2w(gx) - player.x, g2w(gy) - player.y), R = atkRange() * (w.range || 1);
      ok = u.t === "far" ? d >= R * 0.7 : d <= R * 0.3; break;
    }
    default: return;
  }
  if (ok) evoFire(w, g2w(gx), g2w(gy), raw, curPl);
}
// 撃破時 (curFx が覚醒武器のとき)
function evoBreak(idx, gx, gy, kind){
  const w = curFx, u = w.evoU, k = w.key;
  let ok = false;
  switch (u.t){
    case "break": ok = true; break;
    case "rare": ok = kind !== 0; break;
    case "breakN": evoCnt[k] = (evoCnt[k] || 0) + 1; ok = evoCnt[k] >= u.c; break;
    case "combo": {
      const t = evoComboT[k] || (evoComboT[k] = { t0: 0, n: 0 });
      if (nowMs - t.t0 > 1000){ t.t0 = nowMs; t.n = 0; }
      ok = ++t.n >= u.c; break;
    }
    default: return;
  }
  if (!ok || !evoIsReady(k)) return;
  if (u.t === "breakN") evoCnt[k] = 0;
  if (u.t === "combo") evoComboT[k].n = 0;
  evoFire(w, g2w(gx), g2w(gy), 0, curPl);
}
// 射撃時 (shootRaw が撃てたときに呼ぶ)。狙いの位置は evoAimX/Y
function evoShot(w, sx, sy, dmg){
  const u = w.evoU, k = w.key;
  let ok = false;
  switch (u.t){
    case "shot": case "pulse": case "chainEnd": ok = true; break;
    case "shotN": evoCnt[k] = (evoCnt[k] || 0) + 1; ok = evoCnt[k] >= u.c; break;
    case "moveShot": ok = curPl && player.moving; break;
    case "stillShot": ok = curPl && !player.moving; break;
    case "spin": ok = curPl && (player.spin || 0) >= 0.98; break;
    default: return;
  }
  if (!ok || !evoIsReady(k)) return;
  if (u.t === "shotN") evoCnt[k] = 0;
  evoFire(w, evoAimX, evoAimY, dmg, curPl);
}
// 弾の出来事 (跳弾・貫通・子弾・重力球の消滅・爆弾)
function evoEvent(kind, w, x, y, dmg, pl){
  if (!w || !w.evoU || w.evoU.t !== kind || !evoIsReady(w.key)) return;
  evoFire(w, x, y, dmg, pl);
}

/* ---------- 毎フレーム: 遅延・砲台・光球・自動発動 ---------- */
let evoTimerRetry = 0;
function evoTick(dt){
  for (let i = evoLaterQ.length - 1; i >= 0; i--){
    const e = evoLaterQ[i]; e.t -= dt;
    if (e.t <= 0){ evoLaterQ.splice(i, 1); e.fn(); }
  }
  for (let i = evoMarks.length - 1; i >= 0; i--) if (nowMs > evoMarks[i].t1) evoMarks.splice(i, 1);
  if (evoVuln.size > 3000) for (const [j, e] of evoVuln) if (nowMs >= e.u) evoVuln.delete(j);
  // 砲台: 近くのブロックへ撃ち続ける
  for (let i = evoTurrets.length - 1; i >= 0; i--){
    const t = evoTurrets[i];
    if (nowMs > t.until){ evoTurrets.splice(i, 1); continue; }
    t.fireT -= dt;
    if (t.fireT > 0) continue;
    t.fireT = 1 / t.rate;
    const j = findNearestBlock(t.x, t.y, 280);
    if (j < 0) continue;
    const tx = g2w(j % D), ty = g2w((j / D) | 0);
    t.a = Math.atan2(ty - t.y, tx - t.x);
    evoBullet({ x: t.x, y: t.y, w: t.w, pl: t.pl }, t.a, t.dmg, { spd: 800, life: 0.6 });
  }
  // 光球: 自機のまわりを巡り、触れたブロックを砕く
  if (evoOrbs.length){
    for (let i = evoOrbs.length - 1; i >= 0; i--){
      const o = evoOrbs[i];
      if (nowMs > o.until){ evoOrbs.splice(i, 1); continue; }
      o.a += dt * 3.4;
      o.hitT -= dt;
      if (o.hitT > 0) continue;
      o.hitT = 0.09;
      const R = 64, ox = player.x + Math.cos(o.a) * R, oy = player.y + Math.sin(o.a) * R, gx = w2g(ox), gy = w2g(oy);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++){ const j = liveAt(gx + dx, gy + dy); if (j >= 0) euHitJ(j, o.m); }
    }
  }
  // 自動発動 (装備中の武器だけ)
  if (!started) return;
  const w = evoW(state.weapon);
  if (!w.evoU || w.evoU.t !== "timer" || !evoIsReady(w.key)) return;
  evoTimerRetry -= dt;
  if (evoTimerRetry > 0) return;
  const j = findNearestBlock(player.x, player.y, atkRange());
  if (j < 0){ evoTimerRetry = 0.5; return; }
  evoFire(w, g2w(j % D), g2w((j / D) | 0), shotDamage(state.weapon), true);
}

/* ---------- 描画: 光球・砲台・隕石の予告・加速中の輪 (render/draw.js から) ---------- */
function drawEvoUniques(now, toScreen){
  for (const m of evoMarks){
    const [sx, sy] = toScreen(m.x, m.y), p = Math.max(0, Math.min(1, (now - m.t0) / Math.max(1, m.t1 - m.t0)));
    ctx.strokeStyle = hexA(m.color, 0.85); ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.arc(sx, sy, m.r * zoom, 0, 7); ctx.stroke();
    ctx.beginPath(); ctx.arc(sx, sy, m.r * zoom * (1 - p), 0, 7); ctx.stroke();
  }
  for (const t of evoTurrets){
    const [sx, sy] = toScreen(t.x, t.y), f = Math.min(1, (t.until - now) / 600);
    ctx.globalAlpha = Math.max(0.2, f);
    ctx.fillStyle = hexA(t.w.accent, 0.25); ctx.beginPath(); ctx.arc(sx, sy, 11, 0, 7); ctx.fill();
    ctx.strokeStyle = t.w.accent; ctx.lineWidth = 2; ctx.beginPath();
    for (let k = 0; k < 6; k++){ const a = k * Math.PI / 3 + now / 900; ctx.lineTo(sx + Math.cos(a) * 8, sy + Math.sin(a) * 8); }
    ctx.closePath(); ctx.stroke();
    ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx + Math.cos(t.a) * 13, sy + Math.sin(t.a) * 13); ctx.stroke();
    ctx.globalAlpha = 1; ctx.lineWidth = 1;
  }
  for (const o of evoOrbs){
    const [sx, sy] = toScreen(player.x + Math.cos(o.a) * 64, player.y + Math.sin(o.a) * 64);
    if (!fxLow()){ ctx.fillStyle = hexA(o.w.accent, 0.25); ctx.beginPath(); ctx.arc(sx, sy, 12, 0, 7); ctx.fill(); }
    ctx.fillStyle = o.w.accent; ctx.beginPath(); ctx.arc(sx, sy, 6, 0, 7); ctx.fill();
    ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(sx, sy, 2.5, 0, 7); ctx.fill();
  }
  if (evoBufOn("rate") || evoBufOn("dmg") || evoBufOn("coin") || evoBufOn("xp")){
    const [px, py] = toScreen(player.x, player.y), f = 0.5 + 0.5 * Math.sin(now / 90);
    ctx.strokeStyle = hexA(evoBufColor, 0.45 + 0.35 * f); ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(px, py, 24 + 3 * f, 0, 7); ctx.stroke(); ctx.lineWidth = 1;
  }
}
