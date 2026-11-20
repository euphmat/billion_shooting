"use strict";
/* =========================================================
   game/ending.js - スタート画面 / エンディング (惑星崩壊シネマティック)
   ========================================================= */

// ---------- start / clear ----------
let started = false, cleared = false;
$("startBtn").addEventListener("click", () => { audio(); tone(523,.12,"square",.05); $("startOverlay").style.display = "none"; started = true; });
function updateClearBadge(){ const b = $("clearBadge"); if (b) b.hidden = !state.endingSeen; }
updateClearBadge();

/* ---------- エンディング ----------
   条件: 主惑星の残数 mainAlive (planet.js。破壊イベント連動のカウンタで、毎フレームの走査はしない) が 0 になった瞬間。
   記録: state.endingSeen (セーブされる) — 自動再生は1回だけ。再開・再訪では繰り返さない。
   演出: 専用オーバーレイの Canvas を自前 rAF で駆動 (本体ループは cleared で停止するので競合しない)。
         ひび割れ → 白い閃光 → 爆発リングと破片 → フェードアウト。クリック / Esc でスキップ可。シェイクは使わない。 */
function gameClear(quiet){
  if (state.endingSeen || cleared) return;
  state.endingSeen = true; cleared = true;
  saveNow(); flushWorld(true); updateClearBadge();
  if (quiet){ showEndingScreen(); return; }   // 起動時点で既に破壊し尽くしていた場合: 演出なしで結果画面だけ出す
  sndClear();
  startCinematic();
}
function fmtPlayTime(sec){
  sec = Math.floor(sec || 0);
  const h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60), s = sec % 60;
  return h > 0 ? `${h}時間 ${m}分` : m > 0 ? `${m}分 ${s}秒` : `${s}秒`;
}
function showEndingScreen(){
  $("clearStats").innerHTML =
    `<div class="end-stat"><span>総破壊ブロック数</span><b>${fmt(state.destroyed)}</b></div>` +
    `<div class="end-stat"><span>プレイ時間</span><b>${fmtPlayTime(state.playTime)}</b></div>` +
    `<div class="end-stat"><span>レベル</span><b>Lv.${state.lv}</b></div>` +
    `<div class="end-stat"><span>習得スキル</span><b>${Object.keys(state.skills).length} / ${SKILLS.length}種</b></div>` +
    `<div class="end-stat"><span>アーティファクト</span><b>${Object.keys(state.artifacts).length} / ${ARTIFACTS.length}種</b></div>` +
    `<div class="end-stat"><span>累計獲得コイン</span><b>${fmt(state.totalCoins)}</b></div>` +
    `<div class="end-stat"><span>製作した装備</span><b>${state.crafted} 個</b></div>`;
  $("clearOverlay").style.display = "flex";
}

$("backBtn").addEventListener("click", () => { $("clearOverlay").style.display = "none"; cleared = false; });   // ゲームに戻る → そのままエンドレスに遊べる
$("restartBtn").addEventListener("click", () => wipeSave().then(() => location.reload()));

// --- シネマティック用スプライト (事前レンダリング: 惑星・ひび×3・グロー) ---
function cineSprite(size, draw){ const c = document.createElement("canvas"); c.width = c.height = size; draw(c.getContext("2d"), size); return c; }
let cinePlanetSpr = null, cineCrackSprs = null, cineGlowSpr = null;
function cineSprites(){
  if (cinePlanetSpr) return;
  cinePlanetSpr = cineSprite(512, (g, S) => {
    const cx = S / 2, cy = S / 2, r = S / 2 - 6;
    const oc = g.createRadialGradient(cx - r * 0.35, cy - r * 0.35, r * 0.1, cx, cy, r);
    oc.addColorStop(0, "#7ec8ff"); oc.addColorStop(0.45, "#2f7fd0"); oc.addColorStop(0.8, "#174a86"); oc.addColorStop(1, "#0a2c56");
    g.fillStyle = oc; g.beginPath(); g.arc(cx, cy, r, 0, 7); g.fill();
    g.fillStyle = "rgba(90,200,120,.75)";   // 大陸
    for (const [bx, by, br] of [[-0.35, -0.2, 0.30], [0.25, -0.35, 0.22], [0.05, 0.3, 0.34], [-0.45, 0.35, 0.18], [0.5, 0.15, 0.16]]){
      g.beginPath(); g.ellipse(cx + bx * r, cy + by * r, br * r, br * r * 0.62, bx * 2, 0, 7); g.fill();
    }
    g.fillStyle = "rgba(240,200,120,.5)";
    g.beginPath(); g.ellipse(cx + 0.1 * r, cy + 0.05 * r, 0.2 * r, 0.12 * r, 0.6, 0, 7); g.fill();
    g.fillStyle = "rgba(255,255,255,.5)";   // 雲
    for (let k = 0; k < 7; k++){ const a = k * 0.9 + 0.4; g.beginPath(); g.ellipse(cx + Math.cos(a) * r * 0.55, cy + Math.sin(a) * r * 0.5, r * 0.22, r * 0.055, a, 0, 7); g.fill(); }
    const sh = g.createRadialGradient(cx - r * 0.4, cy - r * 0.4, r * 0.2, cx, cy, r * 1.05);
    sh.addColorStop(0, "rgba(0,0,0,0)"); sh.addColorStop(0.75, "rgba(0,0,0,0)"); sh.addColorStop(1, "rgba(0,0,10,.55)");
    g.fillStyle = sh; g.beginPath(); g.arc(cx, cy, r, 0, 7); g.fill();
  });
  const crack = seed => cineSprite(512, (g, S) => {
    let s = seed; const rnd = () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    const cx = S / 2, cy = S / 2;
    g.lineCap = "round";
    for (let b = 0; b < 6; b++){
      const pts = [[cx, cy]]; let x = cx, y = cy, a = rnd() * Math.PI * 2;
      for (let k = 0; k < 6; k++){ a += (rnd() - 0.5) * 0.9; const l = 26 + rnd() * 34; x += Math.cos(a) * l; y += Math.sin(a) * l; pts.push([x, y]); }
      for (const [w, col] of [[7, "rgba(255,120,30,.5)"], [2.4, "#fff6d8"]]){
        g.strokeStyle = col; g.lineWidth = w; g.beginPath();
        pts.forEach(([px, py], i) => i ? g.lineTo(px, py) : g.moveTo(px, py));
        g.stroke();
      }
    }
  });
  cineCrackSprs = [crack(1234567), crack(7654321), crack(20261119)];
  cineGlowSpr = cineSprite(512, (g, S) => {
    const rg = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    rg.addColorStop(0, "rgba(255,255,255,.95)"); rg.addColorStop(0.35, "rgba(255,190,90,.55)"); rg.addColorStop(1, "rgba(255,120,40,0)");
    g.fillStyle = rg; g.beginPath(); g.arc(S / 2, S / 2, S / 2, 0, 7); g.fill();
  });
}
// --- シネマティックの駆動 (約5.6秒。テストからは cineStep / endCinematic を直接叩ける) ---
let cine = null;   // { t, last, parts, exploded, raf }
function startCinematic(){
  cineSprites();
  const cnv = $("cineCanvas");
  cnv.width = window.innerWidth; cnv.height = window.innerHeight;
  $("cineOverlay").style.display = "block";
  cine = { t: 0, last: performance.now(), parts: [], exploded: false, raf: 0 };
  const step = () => { if (cine && cineStep()) cine.raf = requestAnimationFrame(step); };
  cine.raf = requestAnimationFrame(step);
}
function cineStep(){   // 1フレーム進める。終わったら false
  const now = performance.now();
  cine.t += Math.min(0.05, Math.max(0, (now - cine.last) / 1000)); cine.last = now;
  cineDraw(cine.t);
  if (cine.t >= 5.6){ endCinematic(); return false; }
  return true;
}
function endCinematic(){
  if (!cine) return;
  cancelAnimationFrame(cine.raf); cine = null;
  $("cineOverlay").style.display = "none";
  showEndingScreen();
}
function cineDraw(t){
  const cnv = $("cineCanvas"), g = cnv.getContext("2d"), W = cnv.width, H = cnv.height;
  const cx = W / 2, cy = H / 2, PR = Math.min(W, H) * 0.30;
  g.fillStyle = "#01020a"; g.fillRect(0, 0, W, H);
  g.fillStyle = "#fff";
  for (let i = 0; i < 90; i++){
    const sx = ((i * 733.7) % W + W) % W, sy = ((i * 517.3) % H + H) % H;
    g.globalAlpha = 0.25 + (i % 3) * 0.2; g.fillRect(sx, sy, 2, 2);
  }
  g.globalAlpha = 1;
  const flashT = 1.7;
  if (t < flashT){
    // 崩壊前: 惑星が脈動し、ひびが段階的に増え、内側から光が漏れる
    const pulse = 1 + 0.012 * Math.sin(t * 9);
    g.save(); g.translate(cx, cy); g.scale(pulse, pulse);
    g.drawImage(cinePlanetSpr, -PR, -PR, PR * 2, PR * 2);
    g.globalAlpha = Math.min(1, t / flashT) * 0.55; g.globalCompositeOperation = "lighter";
    g.drawImage(cineGlowSpr, -PR, -PR, PR * 2, PR * 2);
    g.globalCompositeOperation = "source-over"; g.globalAlpha = 1;
    if (t > 0.45) g.drawImage(cineCrackSprs[0], -PR, -PR, PR * 2, PR * 2);
    if (t > 0.95) g.drawImage(cineCrackSprs[1], -PR, -PR, PR * 2, PR * 2);
    if (t > 1.35) g.drawImage(cineCrackSprs[2], -PR, -PR, PR * 2, PR * 2);
    g.restore();
  } else {
    const et = t - flashT;
    if (!cine.exploded){
      cine.exploded = true;
      for (let k = 0; k < 90; k++){
        const a = Math.random() * Math.PI * 2, sp = 40 + Math.random() * 330;
        cine.parts.push({ x: cx, y: cy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, t: 0, life: 1.6 + Math.random() * 1.8, rot: Math.random() * 6.3, vr: (Math.random() - 0.5) * 8, s: 4 + Math.random() * 10, spr: (Math.random() * 2) | 0 });
      }
    }
    const pa = Math.max(0, 1 - et / 1.1);   // 惑星の残影: 膨らみながら消える
    if (pa > 0){
      const sc = 1 + et * 0.25;
      g.save(); g.translate(cx, cy); g.globalAlpha = pa * 0.9;
      g.drawImage(cinePlanetSpr, -PR * sc, -PR * sc, PR * 2 * sc, PR * 2 * sc);
      g.globalCompositeOperation = "lighter"; g.globalAlpha = pa;
      g.drawImage(cineGlowSpr, -PR * sc * 1.3, -PR * sc * 1.3, PR * 2.6 * sc, PR * 2.6 * sc);
      g.restore(); g.globalAlpha = 1;
    }
    for (let k = 0; k < 3; k++){   // 爆発リング ×3 (時間差)
      const rt = et - k * 0.22; if (rt < 0) continue;
      const rp = Math.min(1, rt / 2.4);
      g.strokeStyle = k === 1 ? `rgba(255,200,110,${0.75 * (1 - rp)})` : `rgba(255,255,255,${0.8 * (1 - rp)})`;
      g.lineWidth = 3 + 5 * (1 - rp);
      g.beginPath(); g.arc(cx, cy, PR * (0.3 + rp * 3.4), 0, 7); g.stroke();
    }
    g.lineWidth = 1;
    const ga = Math.max(0, 1 - et / 3.2);   // 中心の残光
    if (ga > 0){ g.save(); g.globalCompositeOperation = "lighter"; g.globalAlpha = ga * 0.8; const gs = PR * (1.6 + et * 0.5); g.drawImage(cineGlowSpr, cx - gs, cy - gs, gs * 2, gs * 2); g.restore(); g.globalAlpha = 1; }
    const dt = 1 / 60;
    for (const p of cine.parts){
      p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
      g.save(); g.translate(p.x, p.y); g.rotate(p.rot); g.globalAlpha = Math.max(0, 1 - p.t / p.life);
      g.drawImage(shardSprs[p.spr], -p.s, -p.s, p.s * 2, p.s * 2); g.restore();
    }
    g.globalAlpha = 1;
    if (et < 0.5){ g.fillStyle = `rgba(255,255,255,${(1 - et / 0.5) * 0.95})`; g.fillRect(0, 0, W, H); }   // 白い閃光
  }
  if (t > 4.6){ g.fillStyle = `rgba(0,0,0,${Math.min(1, (t - 4.6))})`; g.fillRect(0, 0, W, H); }   // 黒へフェードアウト
}
$("cineOverlay").addEventListener("click", () => { if (cine) endCinematic(); });
window.addEventListener("keydown", e => { if (cine && e.key === "Escape") endCinematic(); });
