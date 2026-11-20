"use strict";
/* =========================================================
   game/ultra.js - 最難関の武器 (v93): これまでにない超広範囲・超火力の撃ち方

   - nova   超新星      : 自機を中心に衝撃波の輪が半径100ブロック超まで膨らみ、触れた全セルを削る
   - meteor 流星群      : 射程内のあちこちへ巨大隕石を十数個降らせ、1個ごとに半径8ブロック級を吹き飛ばす
   - storm  銀河斬      : 長さ100ブロック級の刃が何本も自機の周りを回り続け、薙いだ全てを斬り刻む
   - hole   特異点      : 育つブラックホールを生み、数秒呑み込み続けたあと大崩壊する (モンスターは引きずり込む)
   - omni   創世        : 上の4つを順番に、最大級のパラメータで撃ち続ける

   重さ対策の要: 撃った瞬間には「効果」を積むだけで、ブロックへのダメージは毎フレーム updateUltra が
   時間予算 (ULTRA_BUDGET_MS) の範囲で順に処理する。範囲が数万セルあっても1フレームに集中しない
   (重い場面では衝撃波の輪がゆっくり進むように見えるだけで、与える効果の量は変わらない)。
   ダメージは「余波」と同じ入れ子扱い (dmgDepth > 0) で入れるので、命中時スキルの連鎖で爆発しない。
   スキルの全体倍率 (gMul) と処刑ライン (exec) は、撃つ時にこのファイルで直接掛ける。
   ========================================================= */

const ULTRA_BUDGET_MS = 7;            // 1フレームにブロック処理へ使ってよい時間
const ULTRA_MAX_FX = 90;              // 同時に存在できる効果の上限
const OMNI_ORDER = ["nova", "meteor", "storm", "hole"];
const ultraFx = [];
let ultraT0 = 0;
const ultraOver = () => performance.now() - ultraT0 > ULTRA_BUDGET_MS;

// ---------- 円盤のセル並び (中心から近い順)。必要な半径まで一度だけ作る ----------
// discStart[k] = 「中心からの距離を四捨五入すると k」になるセル群の先頭位置。円環も円盤も添字の範囲で表せる
let discR = -1, discDX = null, discDY = null, discStart = null;
function ensureDisc(r){
  r = Math.ceil(r);
  if (r <= discR) return;
  r = Math.max(r, 64);
  const cnt = new Uint32Array(r + 2);
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++){ const d = Math.round(Math.sqrt(dx * dx + dy * dy)); if (d <= r) cnt[d]++; }
  const st = new Uint32Array(r + 2);
  let acc = 0;
  for (let k = 0; k <= r; k++){ st[k] = acc; acc += cnt[k]; }
  st[r + 1] = acc;
  const ddx = new Int16Array(acc), ddy = new Int16Array(acc), fill = st.slice();
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++){
    const d = Math.round(Math.sqrt(dx * dx + dy * dy));
    if (d <= r){ const p = fill[d]++; ddx[p] = dx; ddy[p] = dy; }
  }
  discR = r; discStart = st; discDX = ddx; discDY = ddy;
}
const discEnd = r => discStart[Math.min(discR, Math.max(0, Math.floor(r))) + 1];   // 半径 r までのセル数

// ---------- 1セルへの一撃 (処刑ライン込み)。存在しない・壊れたセルは何もしない ----------
function ultraCell(gx, gy, dmg, exec){
  if (gx < 0 || gy < 0 || gx >= D || gy >= D) return;
  const i = gy * D + gx;
  if (isDestroyed(i) || !blockExists(gx, gy)) return;
  if (exec > 0){
    const max = blockMaxHP(gx, gy), cur = damagedMap.get(i), hp = cur === undefined ? max : cur;
    if (hp - dmg <= max * exec) dmg = Math.max(dmg, hp + 1);   // 残りHPが処刑ライン以下になるなら消し飛ばす
  }
  damageBlock(i, dmg, 0);
}
// 円盤のセル並び [p, end) を中心 (cgx, cgy) で処理する。予算が切れたらそこまでの位置を返す
function ultraDisc(cgx, cgy, p, end, dmg, exec){
  let n = 0;
  while (p < end){
    ultraCell(cgx + discDX[p], cgy + discDY[p], dmg, exec);
    p++;
    if ((++n & 127) === 0 && ultraOver()) break;
  }
  return p;
}
// 円の中のモンスターへ。pull > 0 なら中心へ引き寄せる (特異点)
function ultraMobs(x, y, r, dmg, w, pull, dt){
  for (const m of mobs){
    if (m.dead) continue;
    const dx = x - m.x, dy = y - m.y, d = Math.hypot(dx, dy) || 1, rr = r + m.type.r;
    if (pull > 0 && d < rr * 2.6){ const s = Math.min(d, pull * dt); m.x += dx / d * s; m.y += dy / d * s; m.vx *= 0.8; m.vy *= 0.8; }
    if (d <= rr && dmg > 0) damageMob(m, dmg, { fx: w });
  }
}
// 届く範囲に天体かモンスターがあるか (宇宙空間で空撃ちしない)
function ultraReach(x, y, r){
  if (!outOfPlanet(x, y, r)) return true;
  for (const m of mobs){ if (!m.dead && Math.hypot(m.x - x, m.y - y) <= r + m.type.r) return true; }
  return false;
}
// 射程内の「生きているセル」をランダムに n 個 (minF = 中心から最低この割合は離す)。モンスターがいれば一部はそこを狙う
function ultraPickTargets(x, y, rangeB, n, minF){
  const out = [], cgx = w2g(x), cgy = w2g(y);
  let mobN = 0;
  for (const m of mobs){
    if (out.length >= Math.ceil(n / 3)) break;
    if (!m.dead && Math.hypot(m.x - x, m.y - y) <= rangeB * BS){ out.push({ x: m.x, y: m.y }); mobN++; }
  }
  for (let t = 0; t < n * 10 && out.length < n; t++){
    const a = Math.random() * Math.PI * 2, rr = rangeB * Math.sqrt(minF * minF + (1 - minF * minF) * Math.random());
    const gx = cgx + Math.round(Math.cos(a) * rr), gy = cgy + Math.round(Math.sin(a) * rr);
    if (gx < 0 || gy < 0 || gx >= D || gy >= D || isDestroyed(gy * D + gx) || !blockExists(gx, gy)) continue;
    out.push({ x: g2w(gx), y: g2w(gy) });
  }
  if (out.length === mobN && out.length < n){   // 散らばった残骸しか無い: 近い順に拾う
    for (const i of findNearestBlocks(x, y, rangeB * BS, n - out.length)) out.push({ x: g2w(i % D), y: g2w((i / D) | 0) });
  }
  return out;
}
function ultraHolderAt(sx, sy){
  for (const b of bots) if (b.x === sx && b.y === sy) return b;
  return { x: sx, y: sy };
}

// ---------- 撃つ (game/combat.js の shootWeapon から呼ばれる) ----------
function ultraFire(w, sx, sy, dmg, mods){
  const holder = mods ? player : ultraHolderAt(sx, sy);
  let kind = w.mode;
  if (kind === "omni"){ holder.omniI = ((holder.omniI === undefined ? -1 : holder.omniI) + 1) % OMNI_ORDER.length; kind = OMNI_ORDER[holder.omniI]; }
  if (ultraFx.length >= ULTRA_MAX_FX) return false;
  dmg *= gMul;   // スキルの全体倍率 (Lv など)。ダメージ自体は入れ子扱いで入れるので、ここで一度だけ掛ける
  const exec = w.exec || 0;
  let ok = false;
  if (kind === "nova"){
    const R = w.novaR || 110;
    let pending = 0; for (const e of ultraFx) if (e.k === "nova" && e.p < e.end) pending++;
    if (pending < 4 && ultraReach(sx, sy, R * BS)){
      ensureDisc(R);
      ultraFx.push({ k: "nova", w, x: sx, y: sy, cgx: w2g(sx), cgy: w2g(sy), R, spd: w.novaSpd || 150, age: 0, p: 0, end: discEnd(R), shown: 0, dmg, exec, hit: new Set(), fade: 0 });
      ok = true;
    }
  } else if (kind === "meteor"){
    const rng = w.meteorRange || 75;
    if (ultraReach(sx, sy, rng * BS)){
      const tg = ultraPickTargets(sx, sy, rng, w.meteorN || 16, 0.15);
      const r = w.meteorR || 8; ensureDisc(r);
      const dir = -2.1 + (Math.random() - 0.5) * 0.5;   // 左上から斜めに落ちてくる
      for (const t of tg){
        if (ultraFx.length >= ULTRA_MAX_FX) break;
        ultraFx.push({ k: "meteor", w, x: t.x, y: t.y, dir: dir + (Math.random() - 0.5) * 0.3, t: 0, fall: 0.3 + Math.random() * 0.55, r, p: 0, end: discEnd(r), hitDone: false, dmg, exec, sz: 0.8 + Math.random() * 0.5 });
      }
      ok = tg.length > 0;
    }
  } else if (kind === "storm"){
    const len = w.bladeLen || 95;
    if (ultraReach(sx, sy, len * BS)){
      let e = ultraFx.find(f => f.k === "storm" && f.holder === holder);
      if (e){ e.life = e.t + (w.stormLife || 1.3); e.dmg = dmg; e.w = w; e.blades = w.blades || 6; e.len = len; e.bw = w.bladeW || 2; e.spin = w.spin || 2.6; e.exec = exec; }
      else ultraFx.push({ k: "storm", w, holder, x: sx, y: sy, t: 0, life: w.stormLife || 1.3, tick: 0, a0: Math.random() * 6.283, blades: w.blades || 6, len, bw: w.bladeW || 2, spin: w.spin || 2.6, dmg, exec });
      ok = true;
    }
  } else if (kind === "hole"){
    const rng = w.holeRange || 60, n = w.holeN || 2;
    let live = 0; for (const e of ultraFx) if (e.k === "hole") live++;
    if (live < n * 3 && ultraReach(sx, sy, rng * BS)){
      const tg = ultraPickTargets(sx, sy, rng, n, 0.35);
      ensureDisc(Math.max(w.holeR || 15, w.collapseR || 26));
      for (const t of tg) ultraFx.push({ k: "hole", w, x: t.x, y: t.y, t: 0, life: w.holeLife || 3.2, rMax: w.holeR || 15, cR: w.collapseR || 26, tick: 0, p: 0, end: 0, dmg, exec, collapsed: false, cp: 0, cEnd: 0, gone: 0, seed: Math.random() * 6.283 });
      ok = tg.length > 0;
    }
  }
  if (ok){
    sndShoot(w, mods);
    if (mods && (kind === "nova" || kind === "hole")) sndBoom(true);
  }
  return ok;
}

// ---------- 毎フレームの処理 (game/loop.js から) ----------
function updateUltra(dt){
  if (!ultraFx.length) return;
  ultraT0 = performance.now();
  dmgDepth++;   // 余波と同じ入れ子扱い: 命中時スキル (連鎖・誘爆など) を1セルごとに起こさない
  try {
    for (let i = 0; i < ultraFx.length; i++){
      const e = ultraFx[i];
      curFx = e.w;   // 破壊バーストの見た目・経験値倍率は武器のもの
      if (e.k === "nova") stepNova(e, dt);
      else if (e.k === "meteor") stepMeteor(e, dt);
      else if (e.k === "storm") stepStorm(e, dt);
      else if (e.k === "hole") stepHole(e, dt);
    }
  } finally { dmgDepth--; curFx = null; }
  let w = 0;
  for (let i = 0; i < ultraFx.length; i++) if (!ultraFx[i].dead) ultraFx[w++] = ultraFx[i];
  ultraFx.length = w;
}
function stepNova(e, dt){
  e.age += dt;
  const target = Math.min(e.R, e.age * e.spd);
  if (e.p < e.end && !ultraOver()) e.p = ultraDisc(e.cgx, e.cgy, e.p, discEnd(target), e.dmg, e.exec);
  e.shown = Math.min(target, Math.sqrt(e.p / Math.PI));   // 実際に処理し終えた半径 (重い時は輪がゆっくり進む)
  const rw = e.shown * BS;
  for (const m of mobs){
    if (m.dead || e.hit.has(m.id)) continue;
    if (Math.hypot(m.x - e.x, m.y - e.y) <= rw + m.type.r){ e.hit.add(m.id); damageMob(m, e.dmg, { fx: e.w }); }
  }
  if (e.p >= e.end){ e.fade += dt; if (e.fade > 0.45) e.dead = true; }
}
function stepMeteor(e, dt){
  e.t += dt;
  if (e.t < e.fall) return;
  if (!e.hitDone){
    e.hitDone = true;
    addRing({ x: e.x, y: e.y, r: e.r * BS * 1.25, color: hexRGB(e.w.accent), dur: 520 });
    addRing({ x: e.x, y: e.y, r: e.r * BS * 0.7, color: "255,240,200", dur: 360 });
    sndBoom(true);
    ultraMobs(e.x, e.y, e.r * BS, e.dmg, e.w, 0, dt);
  }
  if (e.p < e.end && !ultraOver()) e.p = ultraDisc(w2g(e.x), w2g(e.y), e.p, e.end, e.dmg, e.exec);
  if (e.p >= e.end && e.t > e.fall + 0.55) e.dead = true;
}
// 銀河斬: 0.1秒ごとに全ての刃の上のセルを斬る。1回の斬撃は1発の威力の 35% (1発ぶんの寿命で13回ほど斬る)
const stormSeen = new Set();
function stepStorm(e, dt){
  e.t += dt;
  if (e.holder){ e.x = e.holder.x; e.y = e.holder.y; }
  if (e.t > e.life + 0.25){ e.dead = true; return; }
  if (e.t > e.life) return;   // 余韻 (描画だけ)
  e.tick -= dt;
  if (e.tick > 0) return;
  e.tick += 0.1;
  const base = e.a0 + e.t * e.spin, d = e.dmg * 0.35;
  stormSeen.clear();
  let n = 0;
  for (let b = 0; b < e.blades; b++){
    const a = base + b * Math.PI * 2 / e.blades, ca = Math.cos(a), sa = Math.sin(a);
    // モンスター: 刃の線分からの距離で当てる
    for (const m of mobs){
      if (m.dead) continue;
      const rx = m.x - e.x, ry = m.y - e.y, along = rx * ca + ry * sa;
      if (along < 0 || along > e.len * BS) continue;
      if (Math.abs(-rx * sa + ry * ca) <= (e.bw + 0.5) * BS + m.type.r) damageMob(m, d, { fx: e.w });
    }
    for (let s = 1; s <= e.len; s += 0.7){
      for (let o = -e.bw; o <= e.bw; o++){
        const gx = w2g(e.x + (ca * s - sa * o) * BS), gy = w2g(e.y + (sa * s + ca * o) * BS), i = gy * D + gx;
        if (stormSeen.has(i)) continue;
        stormSeen.add(i);
        ultraCell(gx, gy, d, e.exec);
        if ((++n & 127) === 0 && ultraOver()) return;   // 重い時は残りの刃を次の斬撃に回す
      }
    }
  }
}
// 特異点: 0.15秒ごとに今の半径の全セルを呑む (1回 = 1発の威力の 30%)。寿命で大崩壊 (1発の威力の 4倍)
function stepHole(e, dt){
  e.t += dt;
  if (!e.collapsed){
    const r = e.rMax * Math.min(1, e.t / 0.5);
    ultraMobs(e.x, e.y, r * BS, 0, e.w, 900, dt);   // 引き寄せ (ダメージは tick で)
    e.tick -= dt;
    if (e.tick <= 0 && e.p >= e.end){ e.tick += 0.15; e.p = 0; e.end = discEnd(r); ultraMobs(e.x, e.y, r * BS, e.dmg * 0.3, e.w, 0, dt); }
    if (e.p < e.end && !ultraOver()) e.p = ultraDisc(w2g(e.x), w2g(e.y), e.p, e.end, e.dmg * 0.3, e.exec);
    if (e.t >= e.life){
      e.collapsed = true; e.ct = e.t; e.cp = 0; e.cEnd = discEnd(e.cR);
      addRing({ x: e.x, y: e.y, r: e.cR * BS, color: hexRGB(e.w.accent), dur: 650 });
      addRing({ x: e.x, y: e.y, r: e.cR * BS * 0.6, color: "255,255,255", dur: 420 });
      sndBoom(true);
      ultraMobs(e.x, e.y, e.cR * BS, e.dmg * 4, e.w, 0, dt);
    }
    return;
  }
  if (e.cp < e.cEnd && !ultraOver()) e.cp = ultraDisc(w2g(e.x), w2g(e.y), e.cp, e.cEnd, e.dmg * 4, e.exec);
  if (e.cp >= e.cEnd && e.t > e.ct + 0.6) e.dead = true;
}

// ---------- 描画 (render/draw.js から。リングやビームの上、弾の下) ----------
function drawUltra(now, toScreen, zoom){
  if (!ultraFx.length) return;
  const low = fxLow();
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (const e of ultraFx){
    const col = e.w.accent, rgb = hexRGB(col);
    if (e.k === "nova"){
      const [x, y] = toScreen(e.x, e.y), rr = e.shown * BS * zoom, fade = 1 - Math.min(1, e.fade / 0.45);
      if (rr < 1) continue;
      const th = Math.max(4, 2.2 * BS * zoom);
      ctx.globalAlpha = 0.10 * fade; ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, y, rr, 0, 7); ctx.fill();
      ctx.globalAlpha = 0.28 * fade; ctx.strokeStyle = col; ctx.lineWidth = th * 3; ctx.beginPath(); ctx.arc(x, y, Math.max(0, rr - th), 0, 7); ctx.stroke();
      ctx.globalAlpha = 0.85 * fade; ctx.lineWidth = th; ctx.beginPath(); ctx.arc(x, y, rr, 0, 7); ctx.stroke();
      ctx.globalAlpha = 0.9 * fade; ctx.strokeStyle = "#ffffff"; ctx.lineWidth = Math.max(1.5, th * 0.3); ctx.beginPath(); ctx.arc(x, y, rr, 0, 7); ctx.stroke();
      if (!low){   // 輪の上を走る光の粒
        ctx.fillStyle = "#ffffff";
        for (let k = 0; k < 24; k++){ const a = k * 0.2618 + now / 700; ctx.globalAlpha = 0.7 * fade; ctx.beginPath(); ctx.arc(x + Math.cos(a) * rr, y + Math.sin(a) * rr, th * 0.5, 0, 7); ctx.fill(); }
      }
    } else if (e.k === "meteor"){
      if (e.t < e.fall){
        const f = e.t / e.fall, far = (1 - f) * 1100, ca = Math.cos(e.dir), sa = Math.sin(e.dir);
        const hx = e.x + ca * far, hy = e.y + sa * far;
        if (!onScreen(hx, hy, 400) && !onScreen(e.x, e.y, 200)) continue;
        const [x, y] = toScreen(hx, hy), [tx, ty] = toScreen(hx + ca * 260, hy + sa * 260), hr = Math.max(4, (14 + e.r * 1.6) * e.sz * zoom);
        const g = ctx.createLinearGradient(x, y, tx, ty);
        g.addColorStop(0, `rgba(${rgb},0.9)`); g.addColorStop(1, `rgba(${rgb},0)`);
        ctx.globalAlpha = 1; ctx.strokeStyle = g; ctx.lineWidth = hr * 1.6; ctx.lineCap = "round";
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(tx, ty); ctx.stroke(); ctx.lineCap = "butt";
        ctx.fillStyle = "#fff4d6"; ctx.beginPath(); ctx.arc(x, y, hr, 0, 7); ctx.fill();
        ctx.globalAlpha = 0.5; ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, y, hr * 1.8, 0, 7); ctx.fill();
        // 落下地点の予告円
        const [gx, gy] = toScreen(e.x, e.y);
        ctx.globalAlpha = 0.25 + 0.35 * f; ctx.strokeStyle = col; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(gx, gy, e.r * BS * zoom * (1.2 - 0.2 * f), 0, 7); ctx.stroke();
      } else {
        if (!onScreen(e.x, e.y, e.r * BS)) continue;
        const p = Math.min(1, (e.t - e.fall) / 0.55), [x, y] = toScreen(e.x, e.y), rr = e.r * BS * zoom * (0.6 + 0.6 * p);
        const g = ctx.createRadialGradient(x, y, 0, x, y, rr);
        g.addColorStop(0, `rgba(255,255,240,${0.95 * (1 - p)})`); g.addColorStop(0.45, `rgba(${rgb},${0.7 * (1 - p)})`); g.addColorStop(1, `rgba(${rgb},0)`);
        ctx.globalAlpha = 1; ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, rr, 0, 7); ctx.fill();
      }
    } else if (e.k === "storm"){
      const [x, y] = toScreen(e.x, e.y), fade = e.t > e.life ? Math.max(0, 1 - (e.t - e.life) / 0.25) : Math.min(1, e.t / 0.15);
      const base = e.a0 + e.t * e.spin, L = e.len * BS * zoom, W = Math.max(3, (e.bw * 2 + 1) * BS * zoom);
      ctx.lineCap = "round";
      for (let b = 0; b < e.blades; b++){
        const a = base + b * Math.PI * 2 / e.blades, ex = x + Math.cos(a) * L, ey = y + Math.sin(a) * L;
        const g = ctx.createLinearGradient(x, y, ex, ey);
        g.addColorStop(0, `rgba(255,255,255,${0.9 * fade})`); g.addColorStop(0.25, `rgba(${rgb},${0.75 * fade})`); g.addColorStop(1, `rgba(${rgb},${0.15 * fade})`);
        ctx.globalAlpha = 0.35; ctx.strokeStyle = g; ctx.lineWidth = W * 2.2; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(ex, ey); ctx.stroke();
        ctx.globalAlpha = 1; ctx.lineWidth = W; ctx.stroke();
        ctx.globalAlpha = 0.8 * fade; ctx.strokeStyle = "#ffffff"; ctx.lineWidth = Math.max(1.2, W * 0.18); ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(ex, ey); ctx.stroke();
        if (!low){   // 残光: 少し手前の角度に薄い刃
          const a2 = a - 0.12, g2x = x + Math.cos(a2) * L, g2y = y + Math.sin(a2) * L;
          ctx.globalAlpha = 0.18 * fade; ctx.strokeStyle = col; ctx.lineWidth = W * 0.8; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(g2x, g2y); ctx.stroke();
        }
      }
      ctx.lineCap = "butt";
      ctx.globalAlpha = 0.6 * fade; ctx.strokeStyle = col; ctx.lineWidth = 3;   // 中心の渦
      for (let k = 0; k < 3; k++){ const a0 = base * 1.6 + k * 2.094; ctx.beginPath(); ctx.arc(x, y, (30 + k * 16) * zoom + 10, a0, a0 + 1.6); ctx.stroke(); }
    } else if (e.k === "hole"){
      const big = e.collapsed ? e.cR : e.rMax;
      if (!onScreen(e.x, e.y, big * BS)) continue;
      const [x, y] = toScreen(e.x, e.y);
      if (!e.collapsed){
        const r = e.rMax * Math.min(1, e.t / 0.5) * BS * zoom, sp = now / 260 + e.seed;
        ctx.globalCompositeOperation = "source-over";
        ctx.globalAlpha = 0.92; ctx.fillStyle = "#000"; ctx.beginPath(); ctx.arc(x, y, r * 0.55, 0, 7); ctx.fill();
        ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = 0.9; ctx.strokeStyle = col; ctx.lineWidth = Math.max(2, r * 0.07); ctx.beginPath(); ctx.arc(x, y, r * 0.58, 0, 7); ctx.stroke();
        for (let k = 0; k < (low ? 3 : 6); k++){   // 降着円盤: 回りながら吸い込まれる弧
          const rr = r * (0.7 + 0.12 * k + 0.05 * Math.sin(sp * 2 + k)), a0 = sp * (1.4 - k * 0.12) + k * 1.3;
          ctx.globalAlpha = 0.65 - k * 0.08; ctx.strokeStyle = k & 1 ? "#ffffff" : col; ctx.lineWidth = Math.max(1.5, r * 0.05);
          ctx.beginPath(); ctx.arc(x, y, rr, a0, a0 + 2.2); ctx.stroke();
        }
        ctx.globalAlpha = 0.2; ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, r * 1.6, 0, 7); ctx.stroke();   // 重力レンズ
      } else {
        const p = Math.min(1, (e.t - e.ct) / 0.6), rr = e.cR * BS * zoom * (0.3 + 0.8 * p);
        const g = ctx.createRadialGradient(x, y, rr * 0.2, x, y, rr);
        g.addColorStop(0, `rgba(255,255,255,${0.9 * (1 - p)})`); g.addColorStop(0.6, `rgba(${rgb},${0.6 * (1 - p)})`); g.addColorStop(1, `rgba(${rgb},0)`);
        ctx.globalAlpha = 1; ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, rr, 0, 7); ctx.fill();
      }
    }
  }
  ctx.restore();
}
