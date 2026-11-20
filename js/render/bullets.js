"use strict";
/* =========================================================
   render/bullets.js - 弾の描画 (装備ごとの形)
   ========================================================= */

// ---------- 弾の描画 (装備の素材にちなんだ形) ----------
// 形は装備ごとに決まる (data/weapons.js の shape)。速い弾は進行方向に尾を引く
function drawBullet(bl, sx, sy, now){
  const pulseF = bl.pulse ? 1 + bl.pulse * 0.35 * Math.sin(now / 90 + (bl.seed || 0)) : 1;
  const z = (bl.sz || 4) * BULLET_SIZE_MUL * pulseF, c = bl.color || "#fff", a = Math.atan2(bl.vy, bl.vx), shape = bl.form || bl.shape || "dot";
  const c2 = bl.c2 || "#ffffff";
  const rot = (bl.spin || 0) * (bl.age || 0) + (bl.seed || 0);
  if (bl.ghost){ for (let g = 0; g < bl.ghost.length; g++){ const gp = bl.ghost[g], gx2 = sx + (gp.x - bl.x) * zoom, gy2 = sy + (gp.y - bl.y) * zoom; ctx.globalAlpha = 0.13 - g * 0.04;
    if (bl.trailFx === "bubble"){ ctx.strokeStyle = c; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(gx2, gy2, Math.max(1, z * (0.7 - g * 0.15)), 0, 7); ctx.stroke(); }
    else if (bl.trailFx === "petal"){ ctx.fillStyle = c; ctx.save(); ctx.translate(gx2, gy2); ctx.rotate((bl.seed || 0) + g); ctx.beginPath(); ctx.ellipse(0, 0, z * 0.55, z * 0.28, 0, 0, 7); ctx.fill(); ctx.restore(); }
    else if (bl.trailFx === "ember"){ ctx.fillStyle = g % 2 ? c2 : "#ff9d3c"; ctx.beginPath(); ctx.arc(gx2, gy2, Math.max(0.8, z * (0.4 - g * 0.09)), 0, 7); ctx.fill(); }
    else if (bl.trailFx === "spark"){ ctx.fillStyle = c2; ctx.fillRect(gx2 - 1.5, gy2 - 1.5, 3, 3); }
    else { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(gx2, gy2, Math.max(0.5, z * (0.8 - g * 0.18)), 0, 7); ctx.fill(); } } ctx.globalAlpha = 1; ctx.lineWidth = 1; }
  if (bl.glow){ ctx.fillStyle = c; ctx.globalAlpha = 0.15 + 0.018 * (bl.evo || 0); ctx.beginPath(); ctx.arc(sx, sy, z * 2.3, 0, 7); ctx.fill(); ctx.globalAlpha = 1; }
  if (bl.crit){   // クリティカル: 黄色く大きく
    ctx.fillStyle = "#ffe14d"; ctx.beginPath();
    for (let k = 0; k < 8; k++){ const r = k & 1 ? z * 0.5 : z * 1.1, t = now / 90 + k * Math.PI / 4; ctx.lineTo(sx + Math.cos(t) * r, sy + Math.sin(t) * r); }
    ctx.closePath(); ctx.fill(); return;
  }
  switch (shape){
    case "arrow": {   // 矢: 細い線 + 矢じり
      ctx.save(); ctx.translate(sx, sy); ctx.rotate(a);
      ctx.strokeStyle = c; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(-z * 2.2, 0); ctx.lineTo(z * 1.2, 0); ctx.stroke();
      ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(z * 2, 0); ctx.lineTo(z * 0.4, -z * 0.7); ctx.lineTo(z * 0.4, z * 0.7); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,.6)"; ctx.beginPath(); ctx.moveTo(-z * 2.2, 0); ctx.lineTo(-z * 1.5, -z * 0.6); ctx.moveTo(-z * 2.2, 0); ctx.lineTo(-z * 1.5, z * 0.6); ctx.stroke();
      ctx.restore(); ctx.lineWidth = 1; break; }
    case "rock": {    // 岩: ごつごつした多角形 (回転する)
      ctx.save(); ctx.translate(sx, sy); ctx.rotate(now / 180 + (bl.lastHit || 0) + rot);
      ctx.fillStyle = c; ctx.beginPath();
      for (let k = 0; k < 7; k++){ const r = z * (0.7 + 0.3 * ((k * 7919) % 5) / 4), t = k * Math.PI * 2 / 7; ctx.lineTo(Math.cos(t) * r, Math.sin(t) * r); }
      ctx.closePath(); ctx.fill(); ctx.strokeStyle = "rgba(0,0,0,.5)"; ctx.stroke(); ctx.restore(); break; }
    case "grain": {   // 粒: 小さな点が数個
      ctx.fillStyle = c;
      ctx.fillRect(sx - 1, sy - 1, 2.5, 2.5); ctx.fillRect(sx + z * 0.5, sy - z * 0.4, 2, 2); ctx.fillRect(sx - z * 0.6, sy + z * 0.3, 2, 2); break; }
    case "drop": {    // 液体: 涙型 (進行方向に丸く、後ろに尾)
      ctx.save(); ctx.translate(sx, sy); ctx.rotate(a); ctx.fillStyle = c; ctx.beginPath();
      ctx.moveTo(-z * 1.8, 0); ctx.quadraticCurveTo(0, -z * 0.9, z * 0.9, 0); ctx.quadraticCurveTo(0, z * 0.9, -z * 1.8, 0); ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,.55)"; ctx.beginPath(); ctx.arc(z * 0.25, -z * 0.25, z * 0.22, 0, 7); ctx.fill(); ctx.restore(); break; }
    case "shard": case "needle": {   // 氷柱 / 針: 細長いひし形
      ctx.save(); ctx.translate(sx, sy); ctx.rotate(a); ctx.fillStyle = c; ctx.beginPath();
      const L = shape === "needle" ? z * 3 : z * 2.2, W = shape === "needle" ? z * 0.35 : z * 0.6;
      ctx.moveTo(L, 0); ctx.lineTo(0, -W); ctx.lineTo(-L * 0.7, 0); ctx.lineTo(0, W); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,.5)"; ctx.beginPath(); ctx.moveTo(-L * 0.6, 0); ctx.lineTo(L * 0.9, 0); ctx.stroke(); ctx.restore(); break; }
    case "bomb": {    // 爆弾: 丸 + 点滅する導火線
      ctx.fillStyle = c; ctx.beginPath(); ctx.arc(sx, sy, z * 0.9, 0, 7); ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,.6)"; ctx.stroke();
      ctx.fillStyle = (now / 100 | 0) % 2 ? "#fff" : "#ff5a46"; ctx.beginPath(); ctx.arc(sx + z * 0.6, sy - z * 0.9, 1.8, 0, 7); ctx.fill(); break; }
    case "crystal": { // 結晶: 六角形
      ctx.save(); ctx.translate(sx, sy); ctx.rotate(now / 260 + rot); ctx.fillStyle = c; ctx.beginPath();
      for (let k = 0; k < 6; k++){ const t = k * Math.PI / 3; ctx.lineTo(Math.cos(t) * z, Math.sin(t) * z); }
      ctx.closePath(); ctx.fill(); ctx.strokeStyle = "rgba(255,255,255,.7)"; ctx.stroke(); ctx.restore(); break; }
    case "spark": {   // 火花: 十字の線
      ctx.strokeStyle = c; ctx.lineWidth = 1.5; ctx.beginPath();
      const r = z * 1.2, t = now / 60;
      ctx.moveTo(sx + Math.cos(t) * r, sy + Math.sin(t) * r); ctx.lineTo(sx - Math.cos(t) * r, sy - Math.sin(t) * r);
      ctx.moveTo(sx + Math.cos(t + 1.57) * r * 0.6, sy + Math.sin(t + 1.57) * r * 0.6); ctx.lineTo(sx - Math.cos(t + 1.57) * r * 0.6, sy - Math.sin(t + 1.57) * r * 0.6);
      ctx.stroke(); ctx.lineWidth = 1; break; }
    case "disc": {    // 円盤 (金属弾): 円 + ハイライト
      ctx.fillStyle = c; ctx.beginPath(); ctx.arc(sx, sy, z * 0.8, 0, 7); ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,.45)"; ctx.stroke();
      ctx.fillStyle = "rgba(255,255,255,.6)"; ctx.beginPath(); ctx.arc(sx - z * 0.25, sy - z * 0.25, z * 0.25, 0, 7); ctx.fill(); break; }
    case "flame": {   // 炎: ゆらめく三角 + 尾
      ctx.save(); ctx.translate(sx, sy); ctx.rotate(a); const f = 0.8 + 0.4 * Math.sin(now / 40 + sx);
      ctx.fillStyle = "rgba(255,120,40,.45)"; ctx.beginPath(); ctx.moveTo(z, 0); ctx.lineTo(-z * 2.6 * f, -z * 0.9); ctx.lineTo(-z * 2.6 * f, z * 0.9); ctx.closePath(); ctx.fill();
      ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(z * 0.9, 0); ctx.lineTo(-z * 1.4 * f, -z * 0.5); ctx.lineTo(-z * 1.4 * f, z * 0.5); ctx.closePath(); ctx.fill();
      ctx.fillStyle = "#fff8c0"; ctx.beginPath(); ctx.arc(0, 0, z * 0.3, 0, 7); ctx.fill(); ctx.restore(); break; }
    case "star": {    // 星: 5芒星
      ctx.save(); ctx.translate(sx, sy); ctx.rotate(now / 200 + rot); ctx.fillStyle = c; ctx.beginPath();
      for (let k = 0; k < 10; k++){ const r = k & 1 ? z * 0.5 : z * 1.2, t = k * Math.PI / 5 - Math.PI / 2; ctx.lineTo(Math.cos(t) * r, Math.sin(t) * r); }
      ctx.closePath(); ctx.fill(); ctx.restore(); break; }
    case "ring": {    // 輪: 中空の円
      ctx.strokeStyle = c; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(sx, sy, z * 0.9, 0, 7); ctx.stroke();
      ctx.fillStyle = c; ctx.beginPath(); ctx.arc(sx, sy, z * 0.25, 0, 7); ctx.fill(); ctx.lineWidth = 1; break; }
    case "cube": {    // 重い弾: 斜めの四角 + 影
      ctx.save(); ctx.translate(sx, sy); ctx.rotate(a + Math.PI / 4);
      ctx.fillStyle = "rgba(0,0,0,.5)"; ctx.fillRect(-z * 0.7 + 1.5, -z * 0.7 + 1.5, z * 1.4, z * 1.4);
      ctx.fillStyle = c; ctx.fillRect(-z * 0.7, -z * 0.7, z * 1.4, z * 1.4);
      ctx.strokeStyle = "rgba(255,255,255,.5)"; ctx.strokeRect(-z * 0.7, -z * 0.7, z * 1.4, z * 1.4); ctx.restore(); break; }
    case "orb": {     // 光球: 淡いにじみ + 芯
      ctx.fillStyle = hexA(c, 0.28); ctx.beginPath(); ctx.arc(sx, sy, z * 1.7, 0, 7); ctx.fill();
      ctx.fillStyle = c; ctx.beginPath(); ctx.arc(sx, sy, z * 0.7, 0, 7); ctx.fill();
      ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(sx, sy, z * 0.3, 0, 7); ctx.fill(); break; }
    case "bolt": {    // 雷: ギザギザの線
      ctx.save(); ctx.translate(sx, sy); ctx.rotate(a); ctx.strokeStyle = c; ctx.lineWidth = 1.8; ctx.beginPath();
      ctx.moveTo(-z * 2, 0); ctx.lineTo(-z * 0.7, -z * 0.7); ctx.lineTo(z * 0.2, z * 0.5); ctx.lineTo(z * 1.8, 0); ctx.stroke(); ctx.restore(); ctx.lineWidth = 1; break; }
    case "gear": {    // 歯車 (ドリル): 回転する歯
      ctx.save(); ctx.translate(sx, sy); ctx.rotate(now / 45 + rot); ctx.fillStyle = c; ctx.beginPath();
      for (let k = 0; k < 16; k++){ const r = k & 1 ? z * 0.75 : z * 1.15, t = k * Math.PI / 8; ctx.lineTo(Math.cos(t) * r, Math.sin(t) * r); }
      ctx.closePath(); ctx.fill(); ctx.fillStyle = "rgba(0,0,0,.6)"; ctx.beginPath(); ctx.arc(0, 0, z * 0.3, 0, 7); ctx.fill(); ctx.restore(); break; }
    case "moon": {    // 三日月 (ブーメラン): 回転する弧
      ctx.save(); ctx.translate(sx, sy); ctx.rotate(now / 50 + rot); ctx.strokeStyle = c; ctx.lineWidth = 2.2; ctx.lineCap = "round";
      ctx.beginPath(); ctx.arc(0, 0, z * 1.1, -0.9, 0.9); ctx.stroke(); ctx.lineCap = "butt"; ctx.lineWidth = 1; ctx.restore(); break; }
    case "skull": {   // 骸骨: 丸 + 2つの黒い目
      ctx.fillStyle = c; ctx.beginPath(); ctx.arc(sx, sy, z * 0.9, 0, 7); ctx.fill();
      ctx.fillStyle = "#000"; ctx.fillRect(sx - z * 0.5, sy - z * 0.3, z * 0.35, z * 0.35); ctx.fillRect(sx + z * 0.15, sy - z * 0.3, z * 0.35, z * 0.35); break; }
    case "petal": {   // 花びら: 回転する楕円
      ctx.save(); ctx.translate(sx, sy); ctx.rotate(now / 90 + sx * 0.01); ctx.fillStyle = c;
      ctx.beginPath(); ctx.ellipse(0, 0, z * 1.05, z * 0.5, 0, 0, 7); ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,.55)"; ctx.beginPath(); ctx.arc(0, 0, z * 0.28, 0, 7); ctx.fill(); ctx.restore(); break; }
    case "bubble": {  // 泡: 中空の円 + ハイライト
      ctx.strokeStyle = c; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.arc(sx, sy, z * 0.95, 0, 7); ctx.stroke();
      ctx.fillStyle = "rgba(255,255,255,.75)"; ctx.beginPath(); ctx.arc(sx - z * 0.35, sy - z * 0.35, z * 0.22, 0, 7); ctx.fill(); ctx.lineWidth = 1; break; }
    case "cone": {   // ドリル: 三角錐 + 縞
      ctx.save(); ctx.translate(sx, sy); ctx.rotate(a); ctx.fillStyle = c; ctx.beginPath();
      ctx.moveTo(z * 1.7, 0); ctx.lineTo(-z * 1.1, -z * 0.85); ctx.lineTo(-z * 1.1, z * 0.85); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = c2; ctx.lineWidth = 1.4; for (let k = 0; k < 3; k++){ const x = z * (0.9 - k * 0.62); ctx.beginPath(); ctx.moveTo(x, -z * (0.55 - k * 0.14)); ctx.lineTo(x, z * (0.55 - k * 0.14)); ctx.stroke(); }
      ctx.restore(); ctx.lineWidth = 1; break; }
    case "tear": {   // 雫: 丸い頭 + 細い尾
      ctx.save(); ctx.translate(sx, sy); ctx.rotate(a); ctx.fillStyle = c; ctx.beginPath();
      ctx.moveTo(-z * 2, 0); ctx.quadraticCurveTo(-z * 0.2, -z * 0.95, z * 0.75, 0); ctx.quadraticCurveTo(-z * 0.2, z * 0.95, -z * 2, 0); ctx.fill();
      ctx.fillStyle = c2; ctx.globalAlpha = 0.75; ctx.beginPath(); ctx.arc(z * 0.3, -z * 0.28, z * 0.26, 0, 7); ctx.fill(); ctx.globalAlpha = 1; ctx.restore(); break; }
    case "icicle": { // 氷柱: 長い菱形 + 枝
      ctx.save(); ctx.translate(sx, sy); ctx.rotate(a); ctx.fillStyle = c; ctx.beginPath();
      ctx.moveTo(z * 2.6, 0); ctx.lineTo(0, -z * 0.5); ctx.lineTo(-z * 1.2, 0); ctx.lineTo(0, z * 0.5); ctx.closePath(); ctx.fill();
      ctx.fillStyle = c2; ctx.beginPath(); ctx.moveTo(z * 0.6, 0); ctx.lineTo(-z * 0.2, -z * 0.85); ctx.lineTo(-z * 0.5, 0); ctx.lineTo(-z * 0.2, z * 0.85); ctx.closePath(); ctx.fill(); ctx.restore(); break; }
    case "gem": {    // 宝石: カットされた多角形 + ファセット
      ctx.save(); ctx.translate(sx, sy); ctx.rotate(rot); ctx.fillStyle = c; ctx.beginPath();
      ctx.moveTo(0, -z); ctx.lineTo(z * 0.85, -z * 0.3); ctx.lineTo(z * 0.55, z * 0.85); ctx.lineTo(-z * 0.55, z * 0.85); ctx.lineTo(-z * 0.85, -z * 0.3); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = c2; ctx.lineWidth = 1.1; ctx.beginPath(); ctx.moveTo(-z * 0.85, -z * 0.3); ctx.lineTo(z * 0.85, -z * 0.3); ctx.moveTo(0, -z); ctx.lineTo(0, z * 0.85); ctx.stroke(); ctx.restore(); ctx.lineWidth = 1; break; }
    case "claw": {   // 爪: 三日月の爪
      ctx.save(); ctx.translate(sx, sy); ctx.rotate(a + rot * 0.4); ctx.strokeStyle = c; ctx.lineWidth = Math.max(1.2, z * 0.62); ctx.lineCap = "round";
      ctx.beginPath(); ctx.arc(0, 0, z * 1.05, -1.15, 1.15); ctx.stroke();
      ctx.strokeStyle = c2; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.arc(0, 0, z * 1.05, -1.15, -0.4); ctx.stroke(); ctx.restore(); ctx.lineWidth = 1; ctx.lineCap = "butt"; break; }
    case "coin": {   // コイン: 二重の縁 + 光
      ctx.fillStyle = c; ctx.beginPath(); ctx.arc(sx, sy, z * 0.85, 0, 7); ctx.fill();
      ctx.strokeStyle = c2; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.arc(sx, sy, z * 0.55, 0, 7); ctx.stroke();
      ctx.fillStyle = c2; ctx.beginPath(); ctx.arc(sx - z * 0.2, sy - z * 0.2, z * 0.16, 0, 7); ctx.fill(); ctx.lineWidth = 1; break; }
    case "dart": {   // ダーツ: 細い軸 + 羽
      ctx.save(); ctx.translate(sx, sy); ctx.rotate(a); ctx.fillStyle = c; ctx.beginPath();
      ctx.moveTo(z * 2, 0); ctx.lineTo(-z * 0.4, -z * 0.32); ctx.lineTo(-z * 0.4, z * 0.32); ctx.closePath(); ctx.fill();
      ctx.fillStyle = c2; ctx.beginPath(); ctx.moveTo(-z * 0.5, 0); ctx.lineTo(-z * 1.5, -z * 0.8); ctx.lineTo(-z * 1.5, z * 0.8); ctx.closePath(); ctx.fill(); ctx.restore(); break; }
    case "ember": {  // 熾火: ゆらめく塊
      const f = 0.85 + 0.3 * Math.sin(now / 47 + sx * 0.7 + sy); ctx.fillStyle = c; ctx.beginPath(); ctx.arc(sx, sy, z * 0.72 * f, 0, 7); ctx.fill();
      ctx.fillStyle = c2; ctx.beginPath(); ctx.arc(sx + z * 0.15, sy - z * 0.1, z * 0.34 * f, 0, 7); ctx.fill(); break; }
    case "anvil": {  // 金床: 重い台形
      ctx.save(); ctx.translate(sx, sy); ctx.rotate(a); ctx.fillStyle = c; ctx.beginPath();
      ctx.moveTo(z, -z * 0.55); ctx.lineTo(z, z * 0.55); ctx.lineTo(-z * 0.4, z * 0.55); ctx.lineTo(-z * 0.4, z * 0.2); ctx.lineTo(-z, z * 0.2); ctx.lineTo(-z, -z * 0.2); ctx.lineTo(-z * 0.4, -z * 0.2); ctx.lineTo(-z * 0.4, -z * 0.55); ctx.closePath(); ctx.fill();
      ctx.fillStyle = c2; ctx.globalAlpha = 0.5; ctx.fillRect(-z * 0.4, -z * 0.55, z * 1.4, z * 0.3); ctx.globalAlpha = 1; ctx.restore(); break; }
    case "cube3": {  // 立方: 3面の濃淡
      ctx.save(); ctx.translate(sx, sy); ctx.rotate(a + Math.PI / 4);
      ctx.fillStyle = c; ctx.fillRect(-z * 0.7, -z * 0.7, z * 1.4, z * 1.4);
      ctx.fillStyle = c2; ctx.globalAlpha = 0.55; ctx.fillRect(-z * 0.7, -z * 0.7, z * 1.4, z * 0.55); ctx.globalAlpha = 1;
      ctx.fillStyle = "rgba(0,0,0,.35)"; ctx.fillRect(-z * 0.7, z * 0.25, z * 1.4, z * 0.45); ctx.restore(); break; }
    case "hex": {    // 六角: 厚い六角形 + 芯
      ctx.save(); ctx.translate(sx, sy); ctx.rotate(rot); ctx.fillStyle = c; ctx.beginPath();
      for (let k = 0; k < 6; k++){ const t = k * Math.PI / 3; ctx.lineTo(Math.cos(t) * z * 0.95, Math.sin(t) * z * 0.95); }
      ctx.closePath(); ctx.fill(); ctx.fillStyle = c2; ctx.beginPath(); ctx.arc(0, 0, z * 0.3, 0, 7); ctx.fill(); ctx.restore(); break; }
    case "saturn": { // 環球: 球 + 輪
      ctx.fillStyle = c; ctx.beginPath(); ctx.arc(sx, sy, z * 0.62, 0, 7); ctx.fill();
      ctx.fillStyle = c2; ctx.beginPath(); ctx.arc(sx - z * 0.15, sy - z * 0.15, z * 0.2, 0, 7); ctx.fill();
      ctx.strokeStyle = c2; ctx.lineWidth = 1.8; ctx.beginPath(); ctx.ellipse(sx, sy, z * 1.25, z * 0.42, a, 0, 7); ctx.stroke(); ctx.lineWidth = 1; break; }
    case "orb2": {   // 双子球: 2つの球
      ctx.fillStyle = c; ctx.beginPath(); ctx.arc(sx - z * 0.4, sy, z * 0.55, 0, 7); ctx.fill();
      ctx.fillStyle = c2; ctx.beginPath(); ctx.arc(sx + z * 0.45, sy, z * 0.42, 0, 7); ctx.fill();
      ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(sx - z * 0.55, sy - z * 0.18, z * 0.16, 0, 7); ctx.fill(); break; }
    case "missile": {// ミサイル: 胴体 + 翼 + 炎
      ctx.save(); ctx.translate(sx, sy); ctx.rotate(a);
      ctx.fillStyle = "#ff9d3c"; ctx.beginPath(); ctx.moveTo(-z * 1.1, 0); ctx.lineTo(-z * 1.9 - Math.sin(now / 31) * z * 0.3, -z * 0.3); ctx.lineTo(-z * 1.9, z * 0.3); ctx.closePath(); ctx.fill();
      ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(z * 1.6, 0); ctx.quadraticCurveTo(z * 0.6, -z * 0.55, -z * 0.9, -z * 0.5); ctx.lineTo(-z * 0.9, z * 0.5); ctx.quadraticCurveTo(z * 0.6, z * 0.55, z * 1.6, 0); ctx.fill();
      ctx.fillStyle = c2; ctx.beginPath(); ctx.moveTo(-z * 0.9, -z * 0.5); ctx.lineTo(-z * 1.5, -z * 1); ctx.lineTo(-z * 0.9, -z * 0.1); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(-z * 0.9, z * 0.5); ctx.lineTo(-z * 1.5, z * 1); ctx.lineTo(-z * 0.9, z * 0.1); ctx.closePath(); ctx.fill(); ctx.restore(); break; }
    case "fang": {   // 牙: 曲がった牙
      ctx.save(); ctx.translate(sx, sy); ctx.rotate(a); ctx.fillStyle = c; ctx.beginPath();
      ctx.moveTo(z * 1.8, -z * 0.4); ctx.quadraticCurveTo(z * 0.2, z * 0.9, -z * 1.2, z * 0.75); ctx.quadraticCurveTo(z * 0.4, -z * 0.5, z * 1.8, -z * 0.4); ctx.fill();
      ctx.fillStyle = c2; ctx.globalAlpha = 0.6; ctx.beginPath(); ctx.arc(z * 0.9, -z * 0.15, z * 0.18, 0, 7); ctx.fill(); ctx.globalAlpha = 1; ctx.restore(); break; }
    case "star4": {  // 閃光星: 4芒のきらめき
      ctx.save(); ctx.translate(sx, sy); ctx.rotate(rot * 0.5); ctx.fillStyle = c; ctx.beginPath();
      for (let k = 0; k < 8; k++){ const r = k & 1 ? z * 0.28 : z * 1.35, t = k * Math.PI / 4 - Math.PI / 2; ctx.lineTo(Math.cos(t) * r, Math.sin(t) * r); }
      ctx.closePath(); ctx.fill(); ctx.fillStyle = c2; ctx.beginPath(); ctx.arc(0, 0, z * 0.3, 0, 7); ctx.fill(); ctx.restore(); break; }
    case "bolt2": {  // 二重雷: 2本の稲妻
      ctx.save(); ctx.translate(sx, sy); ctx.rotate(a); ctx.strokeStyle = c; ctx.lineWidth = 1.8; ctx.beginPath();
      ctx.moveTo(-z * 2, -z * 0.4); ctx.lineTo(-z * 0.6, -z * 1); ctx.lineTo(z * 0.3, -z * 0.3); ctx.lineTo(z * 1.9, -z * 0.7); ctx.stroke();
      ctx.strokeStyle = c2; ctx.beginPath(); ctx.moveTo(-z * 2, z * 0.5); ctx.lineTo(-z * 0.5, z * 0.05); ctx.lineTo(z * 0.4, z * 0.6); ctx.lineTo(z * 1.9, z * 0.2); ctx.stroke(); ctx.restore(); ctx.lineWidth = 1; break; }
    case "halo": {   // 光輪: 輪 + 光条
      ctx.strokeStyle = c; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(sx, sy, z * 0.85, 0, 7); ctx.stroke();
      ctx.strokeStyle = c2; ctx.lineWidth = 1.5; for (let k = 0; k < 4; k++){ const t = rot + k * Math.PI / 2; ctx.beginPath(); ctx.moveTo(sx + Math.cos(t) * z * 1.05, sy + Math.sin(t) * z * 1.05); ctx.lineTo(sx + Math.cos(t) * z * 1.45, sy + Math.sin(t) * z * 1.45); ctx.stroke(); }
      ctx.fillStyle = c2; ctx.beginPath(); ctx.arc(sx, sy, z * 0.22, 0, 7); ctx.fill(); ctx.lineWidth = 1; break; }
    case "meteor": { // 隕石: 岩 + 炎の尾
      ctx.save(); ctx.translate(sx, sy); ctx.rotate(a); ctx.fillStyle = "rgba(255,120,40,.5)"; ctx.beginPath();
      ctx.moveTo(-z * 0.5, -z * 0.7); ctx.lineTo(-z * 2.6, 0); ctx.lineTo(-z * 0.5, z * 0.7); ctx.closePath(); ctx.fill(); ctx.restore();
      ctx.save(); ctx.translate(sx, sy); ctx.rotate(now / 170 + rot); ctx.fillStyle = c; ctx.beginPath();
      for (let k = 0; k < 7; k++){ const r = z * (0.65 + 0.3 * ((k * 7919) % 5) / 4), t = k * Math.PI * 2 / 7; ctx.lineTo(Math.cos(t) * r, Math.sin(t) * r); }
      ctx.closePath(); ctx.fill(); ctx.fillStyle = c2; ctx.beginPath(); ctx.arc(z * 0.1, -z * 0.1, z * 0.25, 0, 7); ctx.fill(); ctx.restore(); break; }
    case "void": {   // 虚空: 黒い核 + 色の縁
      ctx.fillStyle = "#050208"; ctx.beginPath(); ctx.arc(sx, sy, z * 0.8, 0, 7); ctx.fill();
      ctx.strokeStyle = c; ctx.lineWidth = 2.2; ctx.beginPath(); ctx.arc(sx, sy, z * 0.8, 0, 7); ctx.stroke();
      ctx.strokeStyle = c2; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(sx, sy, z * 1.15, rot, rot + 4.2); ctx.stroke(); ctx.lineWidth = 1; break; }
    case "sun": {    // 太陽: 核 + 三角の光
      ctx.fillStyle = c2; ctx.beginPath(); for (let k = 0; k < 8; k++){ const t = rot + k * Math.PI / 4; ctx.moveTo(sx + Math.cos(t) * z * 0.75, sy + Math.sin(t) * z * 0.75); ctx.lineTo(sx + Math.cos(t + 0.22) * z * 0.75, sy + Math.sin(t + 0.22) * z * 0.75); ctx.lineTo(sx + Math.cos(t + 0.11) * z * 1.5, sy + Math.sin(t + 0.11) * z * 1.5); } ctx.fill();
      ctx.fillStyle = c; ctx.beginPath(); ctx.arc(sx, sy, z * 0.72, 0, 7); ctx.fill();
      ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(sx, sy, z * 0.3, 0, 7); ctx.fill(); break; }
    case "star6": {  // 六芒星
      ctx.save(); ctx.translate(sx, sy); ctx.rotate(rot * 0.6); ctx.fillStyle = c; ctx.beginPath();
      for (let k = 0; k < 12; k++){ const r = k & 1 ? z * 0.52 : z * 1.2, t = k * Math.PI / 6 - Math.PI / 2; ctx.lineTo(Math.cos(t) * r, Math.sin(t) * r); }
      ctx.closePath(); ctx.fill(); ctx.fillStyle = c2; ctx.beginPath(); ctx.arc(0, 0, z * 0.28, 0, 7); ctx.fill(); ctx.restore(); break; }
    case "bubbles": {// 泡塊: 3つの泡
      ctx.strokeStyle = c; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(sx - z * 0.45, sy + z * 0.2, z * 0.55, 0, 7); ctx.stroke();
      ctx.beginPath(); ctx.arc(sx + z * 0.4, sy - z * 0.25, z * 0.45, 0, 7); ctx.stroke();
      ctx.beginPath(); ctx.arc(sx + z * 0.1, sy + z * 0.5, z * 0.32, 0, 7); ctx.stroke();
      ctx.fillStyle = c2; ctx.beginPath(); ctx.arc(sx - z * 0.6, sy, z * 0.14, 0, 7); ctx.fill(); ctx.lineWidth = 1; break; }
    case "petals": { // 花びら塊: 3枚の花びら
      ctx.fillStyle = c; for (let k = 0; k < 3; k++){ ctx.save(); ctx.translate(sx + Math.cos(rot + k * 2.1) * z * 0.4, sy + Math.sin(rot + k * 2.1) * z * 0.4); ctx.rotate(rot + k * 2.1); ctx.beginPath(); ctx.ellipse(0, 0, z * 0.62, z * 0.3, 0, 0, 7); ctx.fill(); ctx.restore(); }
      ctx.fillStyle = c2; ctx.beginPath(); ctx.arc(sx, sy, z * 0.22, 0, 7); ctx.fill(); break; }
    case "mine": {   // 棘爆弾: 棘の生えた球
      ctx.strokeStyle = c; ctx.lineWidth = 2; for (let k = 0; k < 8; k++){ const t = k * Math.PI / 4 + rot * 0.3; ctx.beginPath(); ctx.moveTo(sx + Math.cos(t) * z * 0.55, sy + Math.sin(t) * z * 0.55); ctx.lineTo(sx + Math.cos(t) * z * 1.05, sy + Math.sin(t) * z * 1.05); ctx.stroke(); }
      ctx.fillStyle = c; ctx.beginPath(); ctx.arc(sx, sy, z * 0.62, 0, 7); ctx.fill();
      ctx.fillStyle = (now / 100 | 0) % 2 ? c2 : "#ff5a46"; ctx.beginPath(); ctx.arc(sx, sy, z * 0.22, 0, 7); ctx.fill(); ctx.lineWidth = 1; break; }
    case "pill": {   // カプセル: 2色のカプセル
      ctx.save(); ctx.translate(sx, sy); ctx.rotate(a); ctx.fillStyle = c; ctx.beginPath();
      ctx.moveTo(z * 0.9, -z * 0.5); ctx.lineTo(-z * 0.9, -z * 0.5); ctx.arc(-z * 0.9, 0, z * 0.5, -Math.PI / 2, Math.PI / 2, true); ctx.lineTo(z * 0.9, z * 0.5); ctx.arc(z * 0.9, 0, z * 0.5, Math.PI / 2, -Math.PI / 2, true); ctx.closePath(); ctx.fill();
      ctx.fillStyle = c2; ctx.globalAlpha = 0.8; ctx.fillRect(-z * 0.15, -z * 0.5, z * 1.05, z); ctx.globalAlpha = 1; ctx.restore(); break; }
    case "acorn": {  // 実: 楕円 + 条
      ctx.save(); ctx.translate(sx, sy); ctx.rotate(a); ctx.fillStyle = c; ctx.beginPath(); ctx.ellipse(0, 0, z * 1.05, z * 0.72, 0, 0, 7); ctx.fill();
      ctx.fillStyle = c2; ctx.beginPath(); ctx.ellipse(z * 0.55, 0, z * 0.42, z * 0.72, 0, 0, 7); ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,.35)"; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(-z * 0.5, -z * 0.6); ctx.lineTo(-z * 0.5, z * 0.6); ctx.moveTo(0, -z * 0.7); ctx.lineTo(0, z * 0.7); ctx.stroke(); ctx.restore(); ctx.lineWidth = 1; break; }
    case "snow": {   // 雪結晶: 6方向の枝
      ctx.save(); ctx.translate(sx, sy); ctx.rotate(rot * 0.4); ctx.strokeStyle = c; ctx.lineWidth = 1.7;
      for (let k = 0; k < 6; k++){ const t = k * Math.PI / 3; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(t) * z, Math.sin(t) * z);
        ctx.moveTo(Math.cos(t) * z * 0.55, Math.sin(t) * z * 0.55); ctx.lineTo(Math.cos(t - 0.5) * z * 0.85, Math.sin(t - 0.5) * z * 0.85);
        ctx.moveTo(Math.cos(t) * z * 0.55, Math.sin(t) * z * 0.55); ctx.lineTo(Math.cos(t + 0.5) * z * 0.85, Math.sin(t + 0.5) * z * 0.85); ctx.stroke(); }
      ctx.fillStyle = c2; ctx.beginPath(); ctx.arc(0, 0, z * 0.2, 0, 7); ctx.fill(); ctx.restore(); ctx.lineWidth = 1; break; }
    case "ring2": {  // 二重輪
      ctx.strokeStyle = c; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(sx, sy, z * 0.95, 0, 7); ctx.stroke();
      ctx.strokeStyle = c2; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.arc(sx, sy, z * 0.55, 0, 7); ctx.stroke();
      ctx.fillStyle = c; ctx.beginPath(); ctx.arc(sx, sy, z * 0.2, 0, 7); ctx.fill(); ctx.lineWidth = 1; break; }
    default: { ctx.fillStyle = c; ctx.fillRect(sx - z / 2, sy - z / 2, z, z); }
  }
  if (bl.evo >= 3 && !fxLow() && bullets.length < 500) drawEvoAdorn(bl, sx, sy, z, now);   // 覚醒 ★3〜★5 の飾り
  if (bl.stuck){ const f = 0.5 + 0.5 * Math.sin(now / 70); ctx.strokeStyle = `rgba(255,60,40,${0.35 + 0.4 * f})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(sx, sy, z * (1.5 + 0.3 * f), 0, 7); ctx.stroke(); ctx.lineWidth = 1; }
}
// 覚醒の飾り: ★3 光の衛星 (2つの光点が弾を回る) / ★4 二色の光冠 (脈打つ輪) / ★5 虹のオーロラ (色の巡る弧)
function drawEvoAdorn(bl, sx, sy, z, now){
  const e = bl.evo, seed = bl.seed || 0, t = now / 150 + seed;
  const orbitR = z * 1.9, dotR = Math.max(1, z * 0.24);
  ctx.fillStyle = bl.c2 || "#fff";
  for (let k = 0; k < 2; k++){ const a = t + k * Math.PI; ctx.beginPath(); ctx.arc(sx + Math.cos(a) * orbitR, sy + Math.sin(a) * orbitR, dotR, 0, 7); ctx.fill(); }
  if (e >= 4){
    ctx.strokeStyle = bl.color || "#fff"; ctx.globalAlpha = 0.4 + 0.25 * Math.sin(now / 85 + seed); ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.arc(sx, sy, z * (1.45 + 0.18 * Math.sin(now / 95 + seed)), 0, 7); ctx.stroke();
  }
  if (e >= 5){
    const hue = (now / 5 + seed * 60) % 360;
    ctx.globalAlpha = 0.75; ctx.lineWidth = 1.8; ctx.lineCap = "round";
    ctx.strokeStyle = `hsl(${hue},100%,70%)`; ctx.beginPath(); ctx.arc(sx, sy, z * 2.4, t * 1.6, t * 1.6 + 1.9); ctx.stroke();
    ctx.strokeStyle = `hsl(${(hue + 150) % 360},100%,70%)`; ctx.beginPath(); ctx.arc(sx, sy, z * 2.4, t * 1.6 + Math.PI, t * 1.6 + Math.PI + 1.9); ctx.stroke();
    ctx.lineCap = "butt";
  }
  ctx.globalAlpha = 1; ctx.lineWidth = 1;
}
const hexA = (h, a) => { const n = parseInt(h.slice(1), 16); return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${a})`; };
