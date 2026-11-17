"use strict";
/* =========================================================
   skillfx.js - スキル効果の毎フレーム処理 / 描画
   (game.js の後に読み込む。データは skills.js)
   ========================================================= */

// ---------- カーソル位置 ----------
let mouseSX = 0, mouseSY = 0, mouseIn = false;
cv.addEventListener("mousemove", e => { mouseSX = e.offsetX; mouseSY = e.offsetY; mouseIn = true; });
cv.addEventListener("mouseleave", () => { mouseIn = false; });
const mouseWorld = () => ({ x: player.x + (mouseSX - CW / 2) / zoom, y: player.y + (mouseSY - CH / 2) / zoom });
const blockPos = idx => ({ x: g2w(idx % D), y: g2w((idx / D) | 0) });

// ---------- 演出の部品 ----------
const sndLevel = () => [523, 659, 784, 1046, 1318].forEach((f, i) => tone(f, .18, "square", .055, 0, i * .075));
function blast(x, y, r, dmg, color){
  damageRadius(x, y, r, dmg);
  rings.push({ x, y, r: r * 1.15, t: performance.now(), color: color || "255,255,255", dur: 480 });
  shake = Math.max(shake, Math.min(0.45, r / 600)); sndBoom();
}
function levelUpFx(){
  sndLevel();
  if (typeof artHas === "function" && artHas("lg_scepter")) scepterStarfall();   // 星屑の王笏: 星が降り注ぐ
  rings.push({ x: player.x, y: player.y, r: 260, t: performance.now(), color: "255,255,255", dur: 700 });
  let msg = `LEVEL UP!  Lv.${state.lv}  スキルポイント獲得`;
  if (sk("c_bonus")){ const g = state.lv * 60; addCoins(g); msg += `  祝い金 +${fmt(g)}`; }
  toast(msg);
}

// ---------- 設置物 / 継続効果 ----------
const hist = [];      // 影分身用: 自機の位置履歴
const shadows = [{ fireT: 0 }, { fireT: 0.1 }, { fireT: 0.2 }, { fireT: 0.3 }];
const shadowCount = () => 2 + (sk("d_shadow2") ? 1 : 0) + (sk("d_shadow3") ? 1 : 0);
const wing = { fireT: 0 };
let satT = 3, ramT = 0, waveDist = 0, burnTick = 0, autoT = 0, droneT = 2;
let idleT = 0, apT = 0, apTarget = null;
const wingPos = () => ({ x: player.x - Math.sin(player.angle) * 46, y: player.y + Math.cos(player.angle) * 46 });
const shadowPos = k => hist[Math.max(0, hist.length - 1 - 34 * (k + 1))] || player;
// オートパイロット: 操作が無いとき、最寄りのブロックへ向かう入力を返す
function autopilot(dt){
  if (!sk("d_auto")) return [0, 0];
  idleT += dt;
  if (idleT < (sk("d_auto2") ? 1 : 3)) return [0, 0];
  apT -= dt;
  if (apT <= 0 || !apTarget){
    apT = 0.5;
    const idx = findNearestBlock(player.x, player.y, 1500);
    apTarget = idx >= 0 ? blockPos(idx) : { x: PLANET_CX, y: PLANET_CY };
  }
  const dx = apTarget.x - player.x, dy = apTarget.y - player.y, d = Math.hypot(dx, dy);
  return d > atkRange() * 0.5 ? [dx / d, dy / d] : [0, 0];
}


// ---------- 毎フレーム ----------
function skillsUpdate(dt, fdt, bdt, now){
  if (comboT > 0){ comboT -= dt; if (comboT <= 0) combo = 0; }
  heatT -= dt;
  heat = Math.max(0, Math.min(1, heat + (heatT > 0 ? dt / 10 : -dt / 3)));
  gMul = globalDmgMul();
  nearClose = sk("a_close") && findNearestBlock(player.x, player.y, sk("a_point") ? 160 : 100) >= 0;


  // --- 財宝: 利息 / 貯金箱 ---
  if (sk("c_interest")){
    interestT -= dt;
    if (interestT <= 0){ interestT = 10; const g = Math.floor(Math.min(state.coins * (sk("c_interest2") ? 0.008 : 0.003), state.lv * (sk("c_interest2") ? 200 : 100))); if (g > 0) addCoins(g); }
  }
  if (sk("c_piggy")){
    piggyT -= dt;
    if (piggyT <= 0){
      piggyT = 60;
      if (piggy >= 1){ const g = Math.floor(piggy * (sk("c_piggy2") ? 2.5 : 1.5)); piggy = 0; addCoins(g); toast(`貯金箱が満期!  +${fmt(g)} コイン`); }
    }
  }

  // --- 燃焼 (腐食・放射) / 氷結 / 時限爆弾 / 隕石 ---
  burnTick -= dt;
  if (burnTick <= 0){
    burnTick = 0.25;
    const frostGone = [];
    for (const [idx, t] of frosts){ if (isDestroyed(idx)){ frosts.delete(idx); frostGen.delete(idx); } else if (t <= 0.25){ frosts.delete(idx); frostGen.delete(idx); frostGone.push(idx); } else frosts.set(idx, t - 0.25); }
    for (const [idx, t] of embers){ if (t <= 0.25 || isDestroyed(idx)) embers.delete(idx); else embers.set(idx, t - 0.25); }
    for (const [idx, t] of overloads){ if (t <= 0.25 || isDestroyed(idx)) overloads.delete(idx); else overloads.set(idx, t - 0.25); }
    if (frostGone.length && sk("b_frostbite")) rawDamage(() => { for (const idx of frostGone) if (!isDestroyed(idx)) damageBlock(idx, blockMaxHP(idx % D, (idx / D) | 0) * 0.03, 0); });   // 凍傷
    rawDamage(() => {
      for (const [idx, b] of burns){
        b.t -= 0.25;
        if (isDestroyed(idx)){ burns.delete(idx); continue; }
        if (b.t <= 0){
          burns.delete(idx);
          const isBurn = !b.k || b.k === "burn";
          if (isBurn && sk("b_ember")) embers.set(idx, 3);   // 残り火
          if (isBurn && (sk("b_burn2") || sk("b_wildfire")) && (b.g || 0) < (sk("b_wildfire") ? 5 : 3)){   // 延焼 / 山火事 (世代で打ち切り)
            const gx = idx % D, gy = (idx / D) | 0, cand = [];
            for (const [dx, dy] of (sk("b_wildfire") ? N8 : N4)){ const j = liveAt(gx + dx, gy + dy); if (j >= 0 && !burns.has(j)) cand.push(j); }
            if (cand.length){ burns.set(cand[(Math.random() * cand.length) | 0], { d: b.d, t: 3, k: "burn", g: (b.g || 0) + 1 }); bumpProc("burn"); }
          }
          continue;
        }
        let tick = b.d * 0.25;
        if (sk("b_sun") && (!b.k || b.k === "burn")) tick += blockMaxHP(idx % D, (idx / D) | 0) * 0.0025;   // 太陽の核
        if (sk("b_decay") && b.rad) tick += blockMaxHP(idx % D, (idx / D) | 0) * 0.00125;   // 崩壊
        damageBlock(idx, tick, 0);
      }
    });
  }
  for (let i = bombs.length - 1; i >= 0; i--){
    const b = bombs[i]; b.t -= dt;
    if (b.t > 0) continue;
    bombs.splice(i, 1); bombSet.delete(b.idx);
    if (isDestroyed(b.idx)) continue;
    const p = blockPos(b.idx);
    rings.push({ x: p.x, y: p.y, r: BS * 2, t: now, color: "255,90,70", dur: 240 });
    rawDamage(() => damageBlock(b.idx, b.dmg, 1));
  }
  for (let i = meteors.length - 1; i >= 0; i--){
    const m = meteors[i]; m.t -= dt;
    if (m.t > 0) continue;
    meteors.splice(i, 1);
    damageRadius(m.x, m.y, m.r, m.dmg);
    rings.push({ x: m.x, y: m.y, r: m.r * 1.3, t: now, color: "255,170,80", dur: 420 });
    beams.push({ x1: m.x + 500, y1: m.y - 1400, x2: m.x, y2: m.y, t: now, w: 5, color: "#ffb060", life: 150 });
    shake = Math.max(shake, 0.18); sndBoom();
  }

  // --- 爆撃ドローン (自動発進) ---
  if (sk("d_bombdrone")){
    droneT -= dt;
    if (droneT <= 0){
      droneT = sk("d_bombdrone2") ? 2.2 : 4;
      const idx = findNearestBlock(player.x, player.y, atkRange());
      if (idx >= 0){
        const dn = sk("d_bombdrone2") ? 2 : 1, dd = playerDamage() * (sk("d_bombdrone2") ? 6.5 : 3);
        for (let i = 0; i < dn; i++){
          const a = Math.random() * Math.PI * 2;
          bullets.push({ x: player.x, y: player.y, vx: Math.cos(a) * 320 * BULLET_SPD_MUL, vy: Math.sin(a) * 320 * BULLET_SPD_MUL, dmg: dd, splash: 1, life: 5,
            homing: true, targetIdx: idx, targetMob: 0, retargetT: 0, lastHit: -1, color: "#57e39a", shape: "arrow", sz: 4 });
        }
      } else droneT = 0.5;
    }
  }
  // --- 仲間系パッシブ ---
  const w = WEAPONS[state.weapon];
  if (sk("d_wing")){
    wing.fireT -= bdt;
    if (wing.fireT <= 0){ const p = wingPos(); wing.fireT = fireDelay(w, wing, shoot(p.x, p.y, shotDamage() * (0.3 + (sk("d_wing2") ? 0.3 : 0) + (sk("d_formation") ? 0.2 : 0)), state.weapon, false)); }
  }
  if (sk("d_shadow")){
    hist.push({ x: player.x, y: player.y, angle: player.angle });
    if (hist.length > 150) hist.shift();
    shadows.forEach((s, k) => {
      if (k >= shadowCount()) return;
      s.fireT -= fdt;
      if (s.fireT <= 0){ const p = shadowPos(k); s.fireT = fireDelay(w, s, shoot(p.x, p.y, shotDamage() * ((sk("d_shadow3") ? 0.4 : 0.3) + (sk("d_formation") ? 0.2 : 0)), state.weapon, false)); }
    });
  } else hist.length = 0;
  if (sk("d_sat")){
    satT -= dt;
    if (satT <= 0){
      satT = sk("d_sat2") ? 1.5 : 3;
      let best = -1, bestHP = 0;
      for (const i of findNearestBlocks(player.x, player.y, atkRange(), 12)){ const hp = blockHP(i); if (hp > bestHP){ bestHP = hp; best = i; } }
      if (best >= 0){
        const p = blockPos(best);
        beams.push({ x1: player.x, y1: player.y - 52, x2: p.x, y2: p.y, t: now, w: 4, color: "#57e39a", life: 160 });
        damageBlock(best, playerDamage() * (sk("d_sat2") ? 15 : 8), 0);
      } else satT = 0.5;
    }
  }
  if (player.moving){
    if (sk("d_ram")){
      ramT -= dt;
      if (ramT <= 0){ ramT = sk("d_ram2") ? 0.09 : 0.15; damageRadius(player.x + Math.cos(player.angle) * 18, player.y + Math.sin(player.angle) * 18, 24, playerDamage() * (sk("d_ram2") ? 1.6 : 0.55)); }
    }
    if (sk("d_wave")){
      waveDist += playerSpeed() * dt;
      const wThr = sk("d_wave4") ? 150 : sk("d_wave2") ? 200 : 300;
      if (waveDist >= wThr){
        waveDist = 0;
        blast(player.x, player.y, sk("d_wave4") ? 220 : sk("d_wave3") ? 175 : 100,
          playerDamage() * (sk("d_wave4") ? 9 : sk("d_wave3") ? 6 : sk("d_wave2") ? 4 : 1.5), "87,227,154");
      }
    }
  }

}

// ---------- 描画 (draw() の中、弾の後・ユニットの前) ----------
function skillsDraw(now, toScreen){
  const px = BS * zoom;
  // 爆弾 (ブロックの状態異常は game.js の drawStatusFx でスプライト描画する)
  if (px > 4){
    for (const b of bombs){
      const [sx, sy] = toScreen(g2w(b.idx % D), g2w((b.idx / D) | 0));
      ctx.fillStyle = (now / 120 | 0) % 2 ? "#ff5a46" : "#fff";
      ctx.beginPath(); ctx.arc(sx, sy, Math.max(2, px * 0.2), 0, 7); ctx.fill();
    }
    ctx.lineWidth = 1;
  }
  // 隕石の着弾予告
  for (const m of meteors){
    const [sx, sy] = toScreen(m.x, m.y);
    ctx.strokeStyle = "rgba(255,170,80,.8)"; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(sx, sy, m.r * zoom, 0, 7); ctx.stroke();
    ctx.beginPath(); ctx.arc(sx, sy, m.r * zoom * Math.min(1, m.t / 0.6), 0, 7); ctx.stroke(); ctx.lineWidth = 1;
  }
  // 僚機 / 影分身 (自機と同じ矢じり型)
  const tri = (p, a, color) => {
    const [sx, sy] = toScreen(p.x, p.y);
    ctx.save(); ctx.translate(sx, sy); ctx.rotate(a); ctx.strokeStyle = color; ctx.beginPath();
    ctx.moveTo(10, 0); ctx.lineTo(-7, -6.5); ctx.lineTo(-4, 0); ctx.lineTo(-7, 6.5); ctx.closePath(); ctx.stroke();
    ctx.restore();
  };
  if (sk("d_wing")) tri(wingPos(), player.angle, "#57e39a");
  if (sk("d_shadow")) for (let k = 0; k < shadowCount(); k++){ const p = shadowPos(k); tri(p, p.angle === undefined ? player.angle : p.angle, "rgba(255,255,255,.5)"); }
  // 守護衛星
  if (sk("d_sat")){
    const [sx, sy] = toScreen(player.x, player.y - 52);
    ctx.strokeStyle = "#57e39a"; ctx.beginPath();
    ctx.moveTo(sx, sy - 7); ctx.lineTo(sx + 6, sy); ctx.lineTo(sx, sy + 7); ctx.lineTo(sx - 6, sy); ctx.closePath(); ctx.stroke();
  }
}
