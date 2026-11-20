"use strict";
/* =========================================================
   render/draw.js - 1フレームの描画
   ========================================================= */

// ---------- drawing ----------
function draw(now){
  ctx.fillStyle = "#000"; ctx.fillRect(0, 0, CW, CH);
  ctx.save();
  const camX = player.x, camY = player.y;
  const halfW = CW / 2 / zoom, halfH = CH / 2 / zoom;

  // stars (parallax)
  ctx.fillStyle = "#fff";
  for (let i = 0; i < 40; i++){
    const sx = ((i * 373.7 - camX * 0.3) % CW + CW) % CW, sy = ((i * 517.3 - camY * 0.3) % CH + CH) % CH;
    ctx.globalAlpha = 0.25 + (i % 3) * 0.2; ctx.fillRect(sx, sy, 2, 2);
  }
  ctx.globalAlpha = 1;

  // atmosphere glow
  {
    const [acx, acy] = [(0 - camX) * zoom + CW/2, (0 - camY) * zoom + CH/2];
    const ar = R * BS * zoom;
    if (ar < 30000){
      ctx.strokeStyle = "rgba(90,170,255,.35)"; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(acx, acy, ar + 10 * zoom + 4, 0, 7); ctx.stroke(); ctx.lineWidth = 1;
    }
  }

  // blocks in view (LOD sampling when zoomed out)
  const gx0 = Math.max(0, w2g(camX - halfW)), gx1 = Math.min(D - 1, w2g(camX + halfW));
  const gy0 = Math.max(0, w2g(camY - halfH)), gy1 = Math.min(D - 1, w2g(camY + halfH));
  const px = BS * zoom;
  const step = px >= 5 ? 1 : Math.max(1, Math.ceil(5 / px));
  if (gx0 <= gx1 && gy0 <= gy1) drawBlocks(now, camX, camY, px, step, gx0, gy0, gx1, gy1);
  else if (flashes.size) flashes.clear();

  const toScreen = (x, y) => [(x - camX) * zoom + CW/2, (y - camY) * zoom + CH/2];

  // coins : yellow (高額コインほど大きく・明るく)
  // 1枚ずつ円・文字を描かず、事前に描いた画像 (スプライト) を貼るだけにする
  const ox = CW / 2 - camX * zoom, oy = CH / 2 - camY * zoom;
  for (const c of coinsArr){
    const sx = c.x * zoom + ox, sy = c.y * zoom + oy;
    if (sx < -30 || sy < -30 || sx > CW + 30 || sy > CH + 30) continue;
    const sp = coinSpriteFor(c);
    // ハロー段階 (100万〜) はゆっくり脈動させて「特別な1枚」だと伝える。age 由来なので追加の状態を持たない
    const sz = c.value >= 1000000 && !c.chest ? sp.size * (1 + 0.05 * Math.sin((c.age || 0) * 2.4)) : sp.size;
    const h = sz / 2;
    ctx.drawImage(sp.cv, sx - h, sy - h, sz, sz);
  }
  // beams
  for (const b of beams){
    const [x1,y1] = toScreen(b.x1,b.y1), [x2,y2] = toScreen(b.x2,b.y2);
    ctx.strokeStyle = b.color || "rgba(255,255,255,.85)"; ctx.lineWidth = b.w || 2;
    ctx.beginPath(); ctx.moveTo(x1,y1);
    if (b.zig){   // 稲妻: 途中を毎フレームずらしてギザギザに
      const nx = -(y2 - y1), ny = x2 - x1, len = Math.hypot(nx, ny) || 1;
      for (let k = 1; k <= 3; k++){
        const j = (Math.random() - .5) * Math.min(18, len * 0.35);
        ctx.lineTo(x1 + (x2 - x1) * k / 4 + nx / len * j, y1 + (y2 - y1) * k / 4 + ny / len * j);
      }
    }
    ctx.lineTo(x2,y2);
    const ev = b.evo && !fxLow() ? b.evo : 0;
    if (ev){   // 覚醒 (★): 外側に光の帯 (★5 は色が巡る)
      const bw = b.w || 2;
      ctx.globalAlpha = 0.12 + 0.02 * ev; ctx.lineWidth = bw * (1.8 + 0.25 * ev);
      if (ev >= 5) ctx.strokeStyle = `hsl(${(now / 5) % 360},100%,65%)`;
      ctx.stroke(); ctx.globalAlpha = 1; ctx.lineWidth = bw; ctx.strokeStyle = b.color || "rgba(255,255,255,.85)";
    }
    ctx.stroke();
    if (ev >= 2){   // ★2〜: 白く輝く芯
      ctx.globalAlpha = 0.75; ctx.strokeStyle = "#fff"; ctx.lineWidth = Math.max(1, (b.w || 2) * 0.35); ctx.stroke(); ctx.globalAlpha = 1;
      if (ev >= 4){   // ★4〜: 光の粒が射線を走る
        ctx.fillStyle = "#fff";
        for (let k = 0; k < 3; k++){ const f = ((now / 260) + k / 3 + (b.t % 97) / 97) % 1; ctx.beginPath(); ctx.arc(x1 + (x2 - x1) * f, y1 + (y2 - y1) * f, 1.4 + 0.3 * ev, 0, 7); ctx.fill(); }
      }
    }
  }
  ctx.lineWidth = 1;
  // aura rings
  for (const r of rings){
    // 経過は 0〜1 に収める (重いフレームでは開始時刻がフレーム時刻より後になり、半径が負になって arc が例外を投げていた)
    const age = Math.max(0, Math.min(1, (now - r.t) / (r.dur || 350))), [rx, ry] = toScreen(r.x, r.y);
    const big = r.r * zoom > 140 ? 0.55 : 1;   // 画面を覆うほど大きなリングは薄く
    const rad = r.r * zoom * (0.35 + 0.65 * age), ev = r.evo || 0;
    ctx.strokeStyle = `rgba(${r.color || "155,225,93"},${0.5 * big * (1 - age)})`; ctx.lineWidth = (r.color ? 2 : 1.5) + 0.6 * ev;
    ctx.beginPath(); ctx.arc(rx, ry, rad, 0, 7); ctx.stroke(); ctx.lineWidth = 1;
    if (ev >= 3 && !fxLow()){   // 覚醒オーラ: 内側に白い輪 / ★5 は回る紋様
      ctx.strokeStyle = `rgba(255,255,255,${0.28 * big * (1 - age)})`; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(rx, ry, rad * 0.72, 0, 7); ctx.stroke();
      if (ev >= 5){
        ctx.strokeStyle = `hsla(${(now / 5) % 360},100%,70%,${0.6 * big * (1 - age)})`; ctx.lineWidth = 2.5;
        for (let k = 0; k < 6; k++){ const a0 = now / 400 + k * Math.PI / 3; ctx.beginPath(); ctx.arc(rx, ry, rad * 0.86, a0, a0 + 0.35); ctx.stroke(); }
      }
      ctx.lineWidth = 1;
    }
  }
  // 破壊バースト (武器ごとの効果)
  for (const b of bursts){
    const p = (now - b.t) / 380; if (p < 0 || p > 1) continue;
    const [bx, by] = toScreen(b.x, b.y), fade = 1 - p, u = BS * zoom * (b.sc || 1);   // sc: 覚醒 (★) で大きく弾ける
    const rnd = i => { const v = Math.sin(b.seed * 127.1 + i * 311.7) * 43758.5453; return v - Math.floor(v); };
    ctx.fillStyle = b.c; ctx.strokeStyle = b.c;
    switch (b.style){
      case "ring": ctx.globalAlpha = fade; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(bx, by, u * (0.3 + 1.15 * p), 0, 7); ctx.stroke(); ctx.strokeStyle = b.c2; ctx.beginPath(); ctx.arc(bx, by, u * (0.18 + 0.7 * p), 0, 7); ctx.stroke(); break;
      case "dots": ctx.globalAlpha = fade; for (let i = 0; i < 7; i++){ const a = rnd(i) * 6.283, d = u * (0.25 + 1.25 * p) * (0.4 + rnd(i + 9)); ctx.beginPath(); ctx.arc(bx + Math.cos(a) * d, by + Math.sin(a) * d, 1.5 + rnd(i + 20) * 2, 0, 7); ctx.fill(); } break;
      case "shard": ctx.globalAlpha = fade; for (let i = 0; i < 5; i++){ const a = rnd(i) * 6.283, d = u * (0.2 + 1.1 * p) * (0.5 + rnd(i + 7)); ctx.save(); ctx.translate(bx + Math.cos(a) * d, by + Math.sin(a) * d); ctx.rotate(a + p * 5); ctx.fillRect(-2.5, -2.5, 5, 5); ctx.restore(); } break;
      case "petal": ctx.globalAlpha = fade * 0.9; for (let i = 0; i < 5; i++){ const a = rnd(i) * 6.283, d = u * (0.2 + 0.9 * p); ctx.save(); ctx.translate(bx + Math.cos(a) * d, by + Math.sin(a) * d - u * 0.3 * p); ctx.rotate(a + p * 3); ctx.beginPath(); ctx.ellipse(0, 0, 5, 2.5, 0, 0, 7); ctx.fill(); ctx.restore(); } break;
      case "bubble": ctx.globalAlpha = fade; ctx.lineWidth = 1.5; for (let i = 0; i < 5; i++){ const a = rnd(i) * 6.283, d = u * 0.5 * rnd(i + 3); ctx.beginPath(); ctx.arc(bx + Math.cos(a) * d, by + Math.sin(a) * d - u * 0.7 * p, 4 + 5 * p * rnd(i + 11), 0, 7); ctx.stroke(); } break;
      case "snow": ctx.globalAlpha = fade; ctx.lineWidth = 2; ctx.strokeStyle = b.c2; for (let k = 0; k < 3; k++){ const a = k * Math.PI / 3 + p * 0.8, r = u * (0.55 - 0.25 * p); ctx.beginPath(); ctx.moveTo(bx - Math.cos(a) * r, by - Math.sin(a) * r); ctx.lineTo(bx + Math.cos(a) * r, by + Math.sin(a) * r); ctx.stroke(); } break;
      case "ember": for (let i = 0; i < 6; i++){ const a = rnd(i) * 6.283, d = u * 0.5 * rnd(i + 5); ctx.globalAlpha = fade * (0.5 + 0.5 * Math.sin(now / 40 + i * 2)); ctx.fillStyle = i % 2 ? b.c2 : b.c; ctx.beginPath(); ctx.arc(bx + Math.cos(a) * d, by + Math.sin(a) * d - u * 0.9 * p, 2, 0, 7); ctx.fill(); } break;
      case "star": ctx.globalAlpha = fade; ctx.fillStyle = b.c2; ctx.beginPath(); { const R1 = u * (0.3 + 0.9 * p); for (let k = 0; k < 8; k++){ const r = k & 1 ? R1 * 0.32 : R1, t = k * Math.PI / 4 - Math.PI / 2; ctx.lineTo(bx + Math.cos(t) * r, by + Math.sin(t) * r); } } ctx.closePath(); ctx.fill(); break;
      default: ctx.globalAlpha = fade; ctx.lineWidth = 2; for (let i = 0; i < 8; i++){ const a = i * Math.PI / 4 + rnd(0) * 0.5, r1 = u * (0.15 + 0.35 * p), r2 = u * (0.4 + 1.05 * p); ctx.beginPath(); ctx.moveTo(bx + Math.cos(a) * r1, by + Math.sin(a) * r1); ctx.lineTo(bx + Math.cos(a) * r2, by + Math.sin(a) * r2); ctx.stroke(); } break;
    }
    ctx.globalAlpha = 1; ctx.lineWidth = 1;
  }
  drawUltra(now, toScreen, zoom);   // 最難関の武器 (game/ultra.js)
  // bullets (crit は黄色く大きく / リサイクルの弾はコインそのもの)
  for (const bl of bullets){
    const sx = bl.x * zoom + ox, sy = bl.y * zoom + oy, m = bl.orb ? bl.orb * zoom + 8 : 12;
    if (sx < -m || sy < -m || sx > CW + m || sy > CH + m) continue;   // 画面外の弾は描かない
    if (bl.orb){   // 重力球: 黒い核 + 渦を巻く紫の輪
      const rr = bl.orb * zoom, sp = now / 140;
      ctx.beginPath(); ctx.arc(sx, sy, Math.max(3, rr * 0.3), 0, 7); ctx.fillStyle = "#000"; ctx.fill();
      ctx.strokeStyle = bl.color; ctx.lineWidth = 2; ctx.stroke();
      ctx.lineWidth = 1.5;
      for (let k = 0; k < 3; k++){
        ctx.beginPath(); ctx.arc(sx, sy, rr * (0.5 + k * 0.25), sp + k * 2.1, sp + k * 2.1 + 2.2);
        ctx.strokeStyle = `rgba(180,140,255,${0.8 - k * 0.22})`; ctx.stroke();
      }
      ctx.lineWidth = 1;
    }
    else drawBullet(bl, sx, sy, now);
  }
  drawMobs(toScreen, zoom);   // モンスター・敵弾
  drawChests(toScreen, zoom);   // 宝箱
  // 浮かぶ文字 (素材ラベル / ダメージ数値)
  if (labels.length){
    // 素材ラベル: 暗いピル + 素材色の縁とチップ + 明るくした太字。白い氷原でも黒い宇宙でも読める
    ctx.textBaseline = "bottom";
    for (const l of labels){
      const age = (now - l.t) / 1100, sx = l.x * zoom + ox, sy = l.y * zoom + oy - 16 - age * 34;
      if (sx < -110 || sy < -24 || sx > CW + 110 || sy > CH + 24) continue;
      ctx.globalAlpha = Math.max(0, 1 - Math.max(0, age - 0.55) / 0.45);
      const pw = l.w + 31, ph = l.fs + 10, x0 = sx - pw / 2, y0 = sy - ph + 4;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(x0, y0, pw, ph, 7); else ctx.rect(x0, y0, pw, ph);
      ctx.fillStyle = "rgba(5,8,12,.68)"; ctx.fill();
      ctx.strokeStyle = l.chip; ctx.lineWidth = 1.2; ctx.stroke();
      ctx.fillStyle = l.chip; ctx.fillRect(x0 + 7, sy - l.fs - 1, 9, 9);   // 素材色のチップ
      ctx.strokeStyle = "rgba(255,255,255,.75)"; ctx.lineWidth = 1; ctx.strokeRect(x0 + 7.5, sy - l.fs - 0.5, 8, 8);
      ctx.font = MAT_LABEL_FONT(l.fs); ctx.textAlign = "left";
      ctx.lineJoin = "round"; ctx.lineWidth = 3; ctx.strokeStyle = "rgba(0,0,0,.85)";
      ctx.strokeText(l.text, x0 + 21, sy);
      ctx.fillStyle = l.color; ctx.fillText(l.text, x0 + 21, sy);
    }
    ctx.globalAlpha = 1; ctx.textAlign = "start"; ctx.textBaseline = "alphabetic"; ctx.lineWidth = 1;
  }
  if (dmgLabels.length){
    // ダメージ数値: 黒の太い縁取り + 白 (クリティカルはオレンジ・大)。数字は等幅で読みやすく
    // 演出 (すべて四則演算だけ・追加の描画パスなし):
    //  出現時にポンと拡大して縮む / 最初に勢いよく上がって減速 / 左右に散る / 会心は横に震えて一瞬白く光る
    ctx.textAlign = "center"; ctx.textBaseline = "bottom"; ctx.lineJoin = "round";
    const T0 = ctx.getTransform(), k = T0.a;   // 基準の変換 (dpr)。ラベルごとに拡大を掛けて最後に戻す
    for (const d of dmgLabels){
      const age = Math.max(0, (now - d.t) / DMG_LABEL_TTL), rise = 1 - (1 - age) * (1 - age) * (1 - age);   // ease-out
      const sx = d.x * zoom + ox + (d.vx || 0) * rise, sy = d.y * zoom + oy - 8 - rise * d.vy;
      if (sx < -80 || sy < -30 || sx > CW + 80 || sy > CH + 30) continue;
      ctx.globalAlpha = Math.max(0, 1 - Math.max(0, age - 0.62) / 0.38);
      const p = age < 0.16 ? 1 - age / 0.16 : 0;   // 出現直後 1 → 0
      const s = 1 + (d.pop || 0) * p * p - (p > 0 && p < 0.35 ? 0.06 : 0);   // 跳ねて少し縮み、等倍に落ち着く
      const jx = d.shake && p > 0 ? Math.sin(age * 140) * d.shake * p : 0;
      ctx.setTransform(k * s, 0, 0, k * s, T0.e + k * (sx + jx), T0.f + k * sy);
      ctx.font = d.font || DMG_FONT(d.fs);
      ctx.lineWidth = Math.max(3, d.fs / 4); ctx.strokeStyle = "rgba(0,0,0,.88)";
      ctx.strokeText(d.text, 0, 0);
      ctx.fillStyle = d.flash && age < 0.07 ? "#ffffff" : d.color; ctx.fillText(d.text, 0, 0);
    }
    ctx.setTransform(T0);
    ctx.globalAlpha = 1; ctx.textAlign = "start"; ctx.textBaseline = "alphabetic"; ctx.lineWidth = 1;
  }

  drawProcTags(now, ox, oy);   // スキル名の発動タグ (ui/notify.js)

  skillsDraw(now, toScreen);   // スキルの設置物・継続効果

  // ---- units: 種類ごとにシルエットを描き分ける ----
  // 自機: 三角の矢じり型
  function ship(x, y, a, s){
    const [sx, sy] = toScreen(x, y);
    ctx.save(); ctx.translate(sx, sy); ctx.rotate(a); ctx.scale(s, s);
    ctx.strokeStyle = "#fff"; ctx.beginPath();
    ctx.moveTo(12, 0); ctx.lineTo(-9, -8); ctx.lineTo(-5, 0); ctx.lineTo(-9, 8); ctx.closePath(); ctx.stroke();
    ctx.restore();
  }
  // 攻撃ボット: 四角い機体 + 砲身 (無骨なメカ)
  function attackBotShape(x, y, a, accent){
    const [sx, sy] = toScreen(x, y);
    ctx.save(); ctx.translate(sx, sy); ctx.rotate(a);
    ctx.strokeStyle = "#fff";
    ctx.strokeRect(-8, -8, 16, 16);                    // 角ばった胴体
    ctx.beginPath(); ctx.moveTo(8, 0); ctx.lineTo(15, 0); ctx.stroke();  // 砲身
    ctx.beginPath(); ctx.arc(0, 0, 3, 0, 7); ctx.stroke();               // コア
    if (accent){ ctx.fillStyle = accent; ctx.beginPath(); ctx.arc(0, 0, 1.8, 0, 7); ctx.fill(); }   // 装備の色
    ctx.beginPath(); ctx.moveTo(-8, -11); ctx.lineTo(-8, -8); ctx.moveTo(-8, 8); ctx.lineTo(-8, 11); ctx.stroke(); // 後部フィン
    ctx.restore();
  }
  // コイン回収ボット: 丸いドローン (黄色) + 回る外周ドット
  function coinBotShape(x, y, a, spin){
    const [sx, sy] = toScreen(x, y);
    ctx.save(); ctx.translate(sx, sy);
    ctx.strokeStyle = "#ffd60a";
    ctx.beginPath(); ctx.arc(0, 0, 8.5, 0, 7); ctx.stroke();             // 丸い本体
    ctx.beginPath(); ctx.arc(0, 0, 3.2, 0, 7); ctx.stroke();             // 内側リング
    ctx.fillStyle = "#ffd60a";
    for (let k = 0; k < 3; k++){                                          // 周囲を回るドット
      const t = spin + k * Math.PI * 2 / 3;
      ctx.beginPath(); ctx.arc(Math.cos(t) * 12, Math.sin(t) * 12, 1.6, 0, 7); ctx.fill();
    }
    ctx.restore();
  }
  bots.forEach((b, bi) => { const wk = botWeaponAt(bi); attackBotShape(b.x, b.y, b.angle, wk ? WEAPONS[wk].accent : null); });
  coinBots.forEach((cb, i) => coinBotShape(cb.x, cb.y, cb.angle, now / 350 + i * 1.7));
  // ブースト演出 (シェイクは使わない): 残像は自機と同じ矢じり輪郭を薄く、噴射は事前レンダリング済みスプライト
  const boostVis = boostOn && started && !cleared && !treeOpen && !artOpen && !mapOpen && !updOpen && !botEqOpen;
  for (let i = boostGhosts.length - 1; i >= 0; i--){
    const g = boostGhosts[i], age = (now - g.t) / 380;
    if (age >= 1){ boostGhosts.splice(i, 1); continue; }
    const [sx, sy] = toScreen(g.x, g.y);
    ctx.save(); ctx.translate(sx, sy); ctx.rotate(g.a);
    ctx.strokeStyle = `rgba(125,249,255,${0.5 * (1 - age)})`; ctx.beginPath();
    ctx.moveTo(12, 0); ctx.lineTo(-9, -8); ctx.lineTo(-5, 0); ctx.lineTo(-9, 8); ctx.closePath(); ctx.stroke();
    ctx.restore();
  }
  for (let i = boostParts.length - 1; i >= 0; i--){
    const p = boostParts[i], ageMs = now - p.t, age = ageMs / p.life;
    if (age >= 1){ boostParts.splice(i, 1); continue; }
    const [sx, sy] = toScreen(p.x + p.vx * ageMs / 1000, p.y + p.vy * ageMs / 1000);
    ctx.globalAlpha = 0.75 * (1 - age);
    ctx.drawImage(boostFlameSpr, sx - 8, sy - 8, 16, 16);
  }
  ctx.globalAlpha = 1;
  drawShipAuras(now, toScreen);   // 覚醒の光輪・銃口の閃光・覚醒の瞬間・系統マスタリーの光球
  drawEvoUniques(now, toScreen);  // 固有覚醒: 光球・砲台・隕石の予告・加速中の輪 (data/evo-unique.js)
  ship(player.x, player.y, player.angle, 1);
  drawArtifactsFx(now, toScreen);   // LEGENDARY の常時演出 (残像 / オーラ / きらめき / サイコロ)
  if (boostVis && !fxLow()){
    // 画面端のスピードライン: 端の帯だけに、進行方向と逆向きの短い線を流す (中央の文字表示は廃止。ボタンの点灯で分かる)
    ctx.strokeStyle = "rgba(160,240,255,.25)"; ctx.lineWidth = 1.5;
    const dirx = Math.cos(player.angle), diry = Math.sin(player.angle), tick = (now / 90) | 0;
    for (let i = 0; i < 6; i++){
      const s1 = Math.sin(i * 77.7 + tick * 13.3) * 43758.5453, fr = s1 - Math.floor(s1);
      const s2 = Math.sin(i * 31.7 + tick * 7.1) * 24634.6345, fr2 = s2 - Math.floor(s2);
      const ex = fr * CW, ey = fr2 * CH;
      if (Math.min(ex, CW - ex, ey, CH - ey) > 130) continue;   // 中央は空ける
      const ln = 26 + fr * 30;
      ctx.beginPath(); ctx.moveTo(ex, ey); ctx.lineTo(ex - dirx * ln, ey - diry * ln); ctx.stroke();
    }
    ctx.lineWidth = 1;
  }

  // range rings
  const [pcx, pcy] = toScreen(player.x, player.y);
  ctx.strokeStyle = "rgba(255,255,255,.14)";
  ctx.beginPath(); ctx.arc(pcx, pcy, atkRange() * zoom, 0, 7); ctx.stroke();
  ctx.strokeStyle = "rgba(255,214,10,.20)";
  ctx.beginPath(); ctx.arc(pcx, pcy, magnetRange() * zoom, 0, 7); ctx.stroke();
  ctx.restore();

  // --- カーソル下のブロック: 枠 + 素材名とHPのツールチップ ---
  hoverInfo = null;
  if (mouseIn){
    const mw = mouseWorld();
    const gx = Math.floor(mw.x / BS) + GC, gy = Math.floor(mw.y / BS) + GC;
    if (gx >= 0 && gy >= 0 && gx < D && gy < D){
      const cdx = gx - GC, cdy = gy - GC, idx = gy * D + gx;
      if (blockExists(gx, gy) && !isDestroyed(idx)){
        const m = MATS[materialAt(gx, gy)], max = blockMaxHP(gx, gy), cur = blockHP(idx);
        hoverInfo = { gx, gy, name: m.name, color: m.color, cur, max };
        const bz = BS * zoom;
        if (bz >= 3){ ctx.strokeStyle = "rgba(255,255,255,.85)"; ctx.lineWidth = 1.5; ctx.strokeRect((gx - GC) * BS * zoom + ox + .5, (gy - GC) * BS * zoom + oy + .5, bz - 1, bz - 1); ctx.lineWidth = 1; }
        const hpText = `HP ${fmtDmg(cur)} / ${fmtDmg(max)} (${(cur / max * 100).toFixed(1)}%)`;
        ctx.font = "700 13px system-ui, sans-serif";
        const w1 = ctx.measureText(m.name).width;
        ctx.font = "12px ui-monospace, Menlo, monospace";
        const bw = Math.max(w1 + 24, ctx.measureText(hpText).width) + 16, bh = 44;
        let tx = mouseSX + 16, ty = mouseSY + 16;
        if (tx + bw > CW - 4) tx = mouseSX - bw - 8;
        if (ty + bh > CH - 4) ty = mouseSY - bh - 8;
        ctx.fillStyle = "rgba(8,8,12,.88)"; ctx.fillRect(tx, ty, bw, bh);
        ctx.strokeStyle = m.color; ctx.strokeRect(tx + .5, ty + .5, bw - 1, bh - 1);
        ctx.fillStyle = m.color; ctx.fillRect(tx + 8, ty + 9, 10, 10);
        ctx.font = "700 13px system-ui, sans-serif"; ctx.fillStyle = "#fff"; ctx.textAlign = "left";
        ctx.fillText(m.name, tx + 24, ty + 19);
        ctx.font = "12px ui-monospace, Menlo, monospace"; ctx.fillStyle = "rgba(255,255,255,.85)";
        ctx.fillText(hpText, tx + 8, ty + 36);
      }
    }
  }

  if (hurtFlash > 0){ ctx.fillStyle = `rgba(255,45,35,${(hurtFlash * 0.26).toFixed(3)})`; ctx.fillRect(0, 0, CW, CH); }
  else if (started && state.hp < playerMaxHP() * 0.25){ ctx.fillStyle = `rgba(255,45,35,${(0.07 + 0.04 * Math.sin(now / 240)).toFixed(3)})`; ctx.fillRect(0, 0, CW, CH); }
  // 消滅砲撃 (究極) の画面フラッシュ: 全画面が真っ白になると目に痛いので薄く。控えめ設定では出さない
  if (typeof whiteFlash === "number" && whiteFlash > 0 && !fxLow()){ ctx.fillStyle = `rgba(255,255,255,${(whiteFlash * 0.22).toFixed(3)})`; ctx.fillRect(0, 0, CW, CH); }
  drawMinimap(now);
}

// ---------- 自機まわりの「強くなった」演出 ----------
// 1. 銃口の閃光 (装備の色。★が上がるほど大きい)
// 2. 覚醒の光輪: 装備中の武器が ★4 以上なら装備色の弧が自機を回る (★5 は虹色)
// 3. 覚醒の瞬間: ★が上がったとき、自機から光の輪と星が広がる (data/evolve.js の evoBursts)
// 4. 系統マスタリー: ランク I 以上の系統ごとに、系統色の光球が自機を公転する (ランクで大きく・IV で尾・MAX で輪)
function drawShipAuras(now, toScreen){
  const [px, py] = toScreen(player.x, player.y), low = fxLow();
  const w = WEAPONS[state.weapon], ev = evoVis(state.weapon);   // 見た目の段階 (★2つで1段)
  if (player.muzzleT && now - player.muzzleT < 70){
    const f = 1 - (now - player.muzzleT) / 70, nx = px + Math.cos(player.angle) * 13, ny = py + Math.sin(player.angle) * 13, R = (3 + 1.3 * ev) * f;
    ctx.fillStyle = w.accent; ctx.globalAlpha = 0.85 * f; ctx.beginPath();
    for (let k = 0; k < 8; k++){ const r = k & 1 ? R * 0.4 : R, t = player.angle + k * Math.PI / 4; ctx.lineTo(nx + Math.cos(t) * r, ny + Math.sin(t) * r); }
    ctx.closePath(); ctx.fill(); ctx.globalAlpha = 1;
  }
  if (ev >= 4 && !low){
    const t = now / 520;
    ctx.lineWidth = 2; ctx.lineCap = "round";
    for (let k = 0; k < 3; k++){
      ctx.strokeStyle = ev >= 5 ? `hsla(${(now / 6 + k * 120) % 360},100%,70%,.75)` : hexA(w.accent, 0.7);
      const a0 = t + k * Math.PI * 2 / 3; ctx.beginPath(); ctx.arc(px, py, 19, a0, a0 + 1.1); ctx.stroke();
    }
    ctx.lineWidth = 1; ctx.lineCap = "butt";
  }
  for (let i = evoBursts.length - 1; i >= 0; i--){
    const b = evoBursts[i], p = (now - b.t) / 1400;
    if (p >= 1 || p < 0){ if (p >= 1) evoBursts.splice(i, 1); continue; }
    const fade = 1 - p;
    ctx.strokeStyle = hexA(b.color, 0.8 * fade); ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(px, py, 16 + 140 * p, 0, 7); ctx.stroke();
    ctx.strokeStyle = `rgba(255,255,255,${0.6 * fade})`; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(px, py, 10 + 90 * Math.min(1, p * 1.4), 0, 7); ctx.stroke();
    ctx.fillStyle = EVO_COLORS[b.s] || "#fff"; ctx.globalAlpha = fade;
    for (let k = 0; k < 5 + b.s; k++){
      const a = k * Math.PI * 2 / (5 + b.s) + p * 1.5, d = 20 + 110 * p, cx = px + Math.cos(a) * d, cy = py + Math.sin(a) * d, R = 5 * fade + 2;
      ctx.beginPath(); for (let q = 0; q < 10; q++){ const r = q & 1 ? R * 0.42 : R, t = q * Math.PI / 5 - Math.PI / 2; ctx.lineTo(cx + Math.cos(t) * r, cy + Math.sin(t) * r); } ctx.closePath(); ctx.fill();
    }
    ctx.globalAlpha = 1; ctx.lineWidth = 1;
  }
  for (let i = mastBursts.length - 1; i >= 0; i--){
    const b = mastBursts[i];
    if (!b.t){ if (treeOpen) continue; b.t = now; }
    const p = (now - b.t) / 1200;
    if (p >= 1 || p < 0){ if (p >= 1) mastBursts.splice(i, 1); continue; }
    ctx.strokeStyle = hexA(b.color, 0.75 * (1 - p)); ctx.lineWidth = 2.5;
    for (let k = 0; k < 3; k++){ const pp = Math.max(0, p - k * 0.12); ctx.beginPath(); ctx.arc(px, py, 14 + 120 * pp, 0, 7); ctx.stroke(); }
    ctx.lineWidth = 1;
  }
  let n = 0;
  for (const br of BRANCHES){ if (masteryRank(br.key) > 0) n++; }
  if (!n) return;
  let j = 0;
  for (const br of BRANCHES){
    const rk = masteryRank(br.key);
    if (!rk) continue;
    const a = now / 900 + j * Math.PI * 2 / n, R = 27 + (j % 2) * 4, ox = px + Math.cos(a) * R, oy = py + Math.sin(a) * R * 0.9, sz = 1.6 + rk * 0.45;
    j++;
    if (rk >= 4 && !low){   // IV〜: 公転の尾
      ctx.strokeStyle = hexA(br.color, 0.35); ctx.lineWidth = sz * 0.9; ctx.lineCap = "round";
      ctx.beginPath(); ctx.ellipse(px, py, R, R * 0.9, 0, a - 0.55, a); ctx.stroke(); ctx.lineCap = "butt";
    }
    let col = br.color;
    if (br.key === "b" && !low) col = ["#ff7a3a", "#7df9ff", "#9cff57", "#c08bff", "#ffe14d"][((now / 260) | 0) % 5];   // 元素: 五色に揺らぐ
    if (!low){ ctx.fillStyle = hexA(br.color, 0.22); ctx.beginPath(); ctx.arc(ox, oy, sz * 2.2, 0, 7); ctx.fill(); }
    ctx.fillStyle = col; ctx.beginPath(); ctx.arc(ox, oy, sz, 0, 7); ctx.fill();
    if (rk >= 6 && !low){ ctx.strokeStyle = "#fff"; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(ox, oy, sz + 2.5, 0, 7); ctx.stroke(); }
  }
  ctx.lineWidth = 1;
}
