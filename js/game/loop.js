"use strict";
/* =========================================================
   game/loop.js - メインループ (毎フレームの更新)
   ========================================================= */

// ---------- main loop ----------
let last = performance.now(), uiT = 0, saveT = 0, worldT = 3;
function frame(now){
  requestAnimationFrame(frame);
  trackFrameRate(now - last);
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  nowMs = now;
  resetFxBudget();   // 演出をこのフレームに積める数 (game/entities.js)
  updateSkillHUD();
  updateHpHud();
  if (!started || cleared || treeOpen || artOpen || mapOpen || updOpen || botEqOpen){ draw(now); return; }   // ツリー/アーティファクト/マップ/履歴/ボット装備を開いている間は一時停止
  state.playTime = (state.playTime || 0) + dt;   // プレイ時間 (エンディングの統計用)
  updateDungeonBanner();

  // --- timers ---
  dmgFlushT -= dt;   // 0以下になったら draw 前に flushDmgLabels が集計を発行し、周期を戻す
  const pfdt = dt * playerRate(), bdt = dt * crewRate();   // 自機 / 仲間それぞれの連射スキル込み
  // --- player move ---
  let ax = 0, ay = 0, amp = 1, manual = false;
  if (keys["w"]) ay -= 1; if (keys["s"]) ay += 1; if (keys["a"]) ax -= 1; if (keys["d"]) ax += 1;
  if (ax || ay) manual = true;
  if (!ax && !ay && touchAxis.on && touchAxis.mag > 0){ ax = touchAxis.x; ay = touchAxis.y; amp = touchAxis.mag; manual = true; }   // スマホのスティック (傾けた分だけ速い)
  if (ax || ay) idleT = 0; else { [ax, ay] = autopilot(dt); amp = 1; }   // オートパイロット (スキル)
  player.moving = !!(ax || ay);
  boostOn = manual && (boostKey || boostTouchOn);   // ブーストは手動入力の間だけ (放置の自動移動は速くしない)
  const al = Math.hypot(ax, ay) || 1, sp = playerSpeed() * amp * (boostOn ? BOOST_MUL : 1);
  player.vx = ax / al * sp * (ax || ay ? 1 : 0); player.vy = ay / al * sp * (ax || ay ? 1 : 0);
  // 高速時は 1 フレームの移動量がブロック (BS=24) を超えるので、小刻みに進めて各歩で衝突を解く (game/physics.js)
  moveWithCollision(player, player.vx * dt, player.vy * dt, 10);
  if (ax || ay) player.angle = Math.atan2(ay, ax);
  // ブースト演出の発生 (残像と噴射。寿命は draw 側が時刻で管理する)
  if (boostOn){
    boostGhostT -= dt; boostPartT -= dt;
    if (boostGhostT <= 0){
      boostGhostT = 0.03;
      boostGhosts.push({ x: player.x, y: player.y, a: player.angle, t: now });
      if (boostGhosts.length > 14) boostGhosts.shift();
    }
    if (boostPartT <= 0){
      boostPartT = 0.012;
      const bx = player.x - Math.cos(player.angle) * 12, by = player.y - Math.sin(player.angle) * 12;
      for (let k = 0; k < 2; k++){
        const ja = player.angle + Math.PI + (Math.random() - 0.5) * 0.7, js = 120 + Math.random() * 160;
        boostParts.push({ x: bx, y: by, vx: Math.cos(ja) * js - player.vx * 0.25, vy: Math.sin(ja) * js - player.vy * 0.25, t: now, life: 260 + Math.random() * 160 });
      }
      if (boostParts.length > 90) boostParts.splice(0, boostParts.length - 90);
    }
  }

  // --- player fire ---
  player.fireT -= pfdt;
  const w = evoW(state.weapon);   // 覚醒 (★) 込み (ガトリングの最大連射も伸びる)
  evoCheck(dt);                   // ★が上がった瞬間の演出 (data/evolve.js)
  if (player.fireT <= 0){
    const fired = shoot(player.x, player.y, shotDamage(), null, false);
    player.fireT = fireDelay(w, player, fired);
    if (fired){
      player.muzzleT = now;   // 銃口の閃光 (render/draw.js)
      heatT = 0.5;                                                                        // ウォームアップ
      if (sk("a_double") && Math.random() < (sk("a_triple") ? 0.35 : 0.2)) player.fireT = Math.min(player.fireT, 0.04);   // ダブルタップ
    }
  }


  skillsUpdate(dt, dt, bdt, now);   // スキルの継続効果・設置物・自動詠唱
  updatePlayerHP(dt);   // 自機HP (無敵時間・自動回復)
  updateMobs(dt);       // 衛星のモンスター・敵弾
  updateArtifacts(dt);  // 宝箱・アーティファクトの継続効果

  // --- bots (作戦モード: follow=追従 / solo=独立 / explore=探索) ---
  const botMode = state.botMode || "follow";
  for (let bi = 0; bi < bots.length; bi++){
    const b = bots[bi];
    const wk = botWeaponAt(bi), bw = wk ? WEAPONS[wk] : null;
    b.retargetT -= dt;
    if (b.retargetT <= 0){
      b.retargetT = 0.4;
      if (botMode === "explore") updateExploreTarget(b);
      else if (botMode === "solo"){
        const idx = findNearestBlock(b.x, b.y, 1400);
        if (idx >= 0){ b.tx = g2w(idx % D); b.ty = g2w(((idx / D) | 0)); }
        else { const sp = nearestBodySurface(b.x, b.y); if (sp){ b.tx = sp.x; b.ty = sp.y; } }   // 宇宙にいたら最寄りの天体へ
      } else {   // follow: 自機から離れすぎていたら掘らずに合流する
        const pd = Math.hypot(player.x - b.x, player.y - b.y);
        if (pd > 620) b.tx = null;
        else { const idx = findNearestBlock(b.x, b.y, 1400); if (idx >= 0){ b.tx = g2w(idx % D); b.ty = g2w(((idx / D) | 0)); } }
      }
    }
    // 移動先: 目標ブロック。追従モードで合流中は自機の周りの編隊位置
    let mvx = b.tx, mvy = b.ty, regroup = false;
    if (botMode === "follow" && mvx === null){
      const a2 = bi / Math.max(1, bots.length) * Math.PI * 2 + nowMs / 5000;
      mvx = player.x + Math.cos(a2) * 95; mvy = player.y + Math.sin(a2) * 95; regroup = true;
    }
    if (mvx !== null && mvx !== undefined){
      const dx = mvx - b.x, dy = mvy - b.y, d = Math.hypot(dx, dy);
      // 装備の届く距離まで近づく (オーラは範囲内まで、短射程は撃ち切れる距離まで)。遠い目標へは距離に応じて加速する
      const stopD = regroup ? 24 : bw && bw.mode === "aura" ? (bw.auraR || 110) * 0.7
                  : Math.min(atkRange() * 0.75, atkRange() * ((bw && bw.range) || 1) * 0.9);
      // 追いつき上限: 通常は従来通り 2200。プレイヤーがブースト中だけ、自機のブースト速度に
      // 合わせて上限を広げる (置いてけぼりにせず、ブーストを止めればすぐ編隊に戻れる範囲)
      const spdCap = boostOn ? Math.max(2200, playerSpeed() * BOOST_MUL) : 2200;
      if (d > stopD){ const spd = 210 + Math.min(spdCap, Math.max(0, d - 400) * 0.75); moveWithCollision(b, dx / d * spd * dt, dy / d * spd * dt, 10); }
      else resolveCollision(b, 10);
      b.angle = Math.atan2(dy, dx);
    }
    // 追従モードで壁に阻まれて自機から離れたままのボットは、自機のそばへワープさせる
    // (壁をすり抜けなくなったので、ブーストで置いていかれると戻れなくなるのを防ぐ)
    if (botMode === "follow"){
      const fdx = player.x - b.x, fdy = player.y - b.y;
      b.farT = fdx * fdx + fdy * fdy > 900 * 900 ? (b.farT || 0) + dt : 0;
      if (b.farT > 2){
        b.farT = 0;
        addRing({ x: b.x, y: b.y, r: 36, color: "255,255,255", dur: 300 });
        const a2 = bi / Math.max(1, bots.length) * Math.PI * 2;
        b.x = player.x + Math.cos(a2) * 30; b.y = player.y + Math.sin(a2) * 30; b.tx = null;
        resolveCollision(b, 10);
        addRing({ x: b.x, y: b.y, r: 36, color: "255,255,255", dur: 300 });
      }
    }
    b.fireT -= bdt;
    if (b.fireT <= 0){
      if (bw) b.fireT = fireDelay(bw, b, shoot(b.x, b.y, shotDamage(wk) * 0.6 * botMul(), wk, true));
      else if (shoot(b.x, b.y, playerDamage() * 0.6 * botMul(), null, true)) b.fireT = 1 / 3;
      else b.fireT = 0.15;
    }
  }

  // --- coin bots: 他ボットと被らないコインを価値・密集度・距離で選ぶ ---
  // 割り当て表は、このフレームで誰かが目標を選び直すときにだけ作る
  // コインが無いときは自機には付いて行かず、最近コインがよく湧いている場所で待ち伏せする
  let coinClaims = null;
  const claims = () => coinClaims || (coinClaims = buildCoinClaims());
  heatPruneT -= dt; if (heatPruneT <= 0){ heatPruneT = 2; pruneCoinHeat(); }
  const cbSpd = coinBotSpeed(), cbVac = coinBotVacuum(), cbTouch2 = coinBotTouchR() ** 2;
  const cbMode = state.cbMode || "follow";   // follow=追従 / solo=独立 / botfollow=ボット追従
  for (let ci = 0; ci < coinBots.length; ci++){
    const cb = coinBots[ci];
    cb.retargetT -= dt;
    if (cb.target && cb.target.gone){ cb.target = null; cb.retargetT = 0; }
    if (cb.retargetT <= 0){
      cb.target = coinsArr.length ? pickCoinTarget(cb, claims(), cbSpd, cbVac) : null;
      if (cb.target && cbMode === "follow"){   // 追従: 自機から遠いコインは追わない
        const pdx = cb.target.x - player.x, pdy = cb.target.y - player.y;
        if (pdx * pdx + pdy * pdy > 2600 * 2600) cb.target = null;
      }
      if (cb.target && cbMode === "botfollow"){   // ボット追従: 担当ボットの近くのコインだけ拾う
        const tdx2 = cb.target.x - cb.x, tdy2 = cb.target.y - cb.y;
        if (tdx2 * tdx2 + tdy2 * tdy2 > 950 * 950) cb.target = null;
      }
      cb.idle = cb.target ? null : (cbMode === "solo" ? pickIdleSpot(cb, cbSpd) : null);
      cb.retargetT = 0.15;
    }
    if (cb.target){
      // 目標の周りに山があるときは、その重心へ向かう (一停車で山ごと吸引圏内に入れる)
      let ax = cb.target.x, ay = cb.target.y;
      const caim = coinClusterAim(claims(), cb.target, Math.min(cbVac, 320));
      if (caim){ ax = caim[0]; ay = caim[1]; }
      // 独立モード: 同じ山に複数台が向かうときは、重心の周りに花びら状に散って吸引エリアを分担する (1点に重ならない)
      if (caim && cbMode === "solo"){
        let sharers = 0;
        for (const o of coinBots){ if (o === cb || !o.target) continue;
          const odx = o.target.x - cb.target.x, ody = o.target.y - cb.target.y;
          if (odx * odx + ody * ody < 480 * 480) sharers++; }
        if (sharers > 0){ const a = ci * 2.39996; ax += Math.cos(a) * 150; ay += Math.sin(a) * 150; }
      }
      const tdx = ax - cb.x, tdy = ay - cb.y, td2 = tdx * tdx + tdy * tdy;
      const warpR = 800 - 150 * cbLv("stargate");
      if ((cbLv("anchor") > 0 || cbLv("stargate") > 0) && td2 > warpR * warpR){   // 時空アンカー / 星核ワープコア: 遠い目標の手前へワープ
        const td = Math.sqrt(td2);
        addRing({ x:cb.x, y:cb.y, r:40, t:nowMs, color:"64,224,208", dur:300 });
        cb.x = ax - tdx / td * 120; cb.y = ay - tdy / td * 120;
        addRing({ x:cb.x, y:cb.y, r:40, t:nowMs, color:"64,224,208", dur:300 });
      }
      steerBot(cb, ax, ay, cbSpd * (td2 > 400 * 400 ? cbNozzle() : 1) * (td2 > 1200 * 1200 ? 1.35 : 1), dt, 0);   // 推進ノズル + 長距離巡航ブースト: 移動の死に時間を減らす
    }
    else if (cbMode === "follow"){   // 自機の周りの編隊位置で待つ (遠いときは加速して合流)
      const a3 = ci / Math.max(1, coinBots.length) * Math.PI * 2 + nowMs / 6000;
      const tx3 = player.x + Math.cos(a3) * 75, ty3 = player.y + Math.sin(a3) * 75;
      const dd3 = Math.hypot(tx3 - cb.x, ty3 - cb.y);
      steerBot(cb, tx3, ty3, cbSpd * (1 + Math.min(5, dd3 / 700)), dt, 10);
    }
    else if (cbMode === "botfollow"){   // 担当の攻撃ボット (1台につき回収ボット1台) の側で待つ。攻撃ボットが回収ボットより多い/少ない場合は割り当てを繰り返す
      const ab = bots.length ? bots[ci % bots.length] : null;
      const ax = ab ? ab.x : player.x, ay = ab ? ab.y : player.y;
      const a3 = ci * 2.39996;
      const tx3 = ax + Math.cos(a3) * 48, ty3 = ay + Math.sin(a3) * 48;
      const dd3 = Math.hypot(tx3 - cb.x, ty3 - cb.y);
      steerBot(cb, tx3, ty3, cbSpd * 1.2 * (1 + Math.min(5, dd3 / 700)), dt, 8);
    }
    else idleMove(cb, cbSpd, dt, ci, coinBots.length);
    // 接触回収: 近づいたコインはその場で確実に拾う (吸引だけに頼らない)。拡張ハッチで範囲が広がる
    for (let j = coinsArr.length - 1; j >= 0; j--){
      const cn = coinsArr[j], ex = cn.x - cb.x, ey = cn.y - cb.y;
      if (ex * ex + ey * ey < cbTouch2){
        gainCoin(cn);
        removeCoinAt(j); hudDirty = true;
        if (cn === cb.target){ cb.target = null; cb.retargetT = 0; }   // 拾い終わったら待たずに次の目標へ
      }
    }
  }

  // --- bullets ---
  for (let i = bullets.length - 1; i >= 0; i--){
    const bl = bullets[i];
    // 追尾: 目標へ旋回し続ける (目標が消えたら近くのブロックを探し直す)
    if (bl.homing){
      bl.retargetT -= dt;
      const steer = (tx, ty) => {
        const want = Math.atan2(ty - bl.y, tx - bl.x);
        const cur = Math.atan2(bl.vy, bl.vx);
        let diff = ((want - cur + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
        const turn = 7 * dt, na = cur + Math.max(-turn, Math.min(turn, diff));
        const spd = Math.hypot(bl.vx, bl.vy);
        bl.vx = Math.cos(na) * spd; bl.vy = Math.sin(na) * spd;
      };
      const hm = bl.targetMob ? mobById(bl.targetMob) : null;
      if (hm) steer(hm.x, hm.y);   // モンスターを追尾
      else {
        if (bl.targetMob) bl.targetMob = 0;   // 目標のモンスターは倒れた
        if (bl.targetIdx < 0 || isDestroyed(bl.targetIdx)){
          if (bl.retargetT <= 0){
            const mb = nearestMob(bl.x, bl.y, atkRange());   // 探し直しもモンスター優先
            if (mb) bl.targetMob = mb.id;
            else bl.targetIdx = findNearestBlock(bl.x, bl.y, atkRange());
            bl.retargetT = 0.12;
          }
        }
        if (bl.targetIdx >= 0) steer(g2w(bl.targetIdx % D), g2w((bl.targetIdx / D) | 0));
      }
    }
    bl.life -= dt;
    bl.age = (bl.age || 0) + dt;
    if (bl.stuck){   // 設置爆弾: くっついた場所で信管が進み、敵が近づくか時間切れで起爆
      bl.armT -= dt;
      let boom = bl.life <= 0;
      if (!boom && bl.armT <= 0) for (const m of mobs){ if (!m.dead && (m.x - bl.x) ** 2 + (m.y - bl.y) ** 2 < 2304){ boom = true; break; } }
      if (boom){
        const mr = (bl.mine || 2) * BS;
        damageRadius(bl.x, bl.y, mr, bl.dmg);
        addRing({ x: bl.x, y: bl.y, r: mr, t: performance.now(), color: hexRGB(bl.color) });
        removeBulletAt(i);
      }
      continue;
    }
    if (bl.move){   // 武器ごとの移動パターン
      const rot = ang => { const c = Math.cos(ang), sn = Math.sin(ang), vx = bl.vx, vy = bl.vy; bl.vx = vx * c - vy * sn; bl.vy = vx * sn + vy * c; };
      switch (bl.move){
        case "wave": rot(Math.sin(bl.age * 9 + bl.seed) * 2.0 * dt); break;
        case "spiral": rot((bl.seed > 3.14 ? -1 : 1) * 2.3 * dt); break;
        case "zigzag": bl.zzT = (bl.zzT || 0) - dt; if (bl.zzT <= 0){ bl.zzT = 0.11; bl.zzS = -(bl.zzS || 1); rot(bl.zzS * 0.55); } break;
        case "drift": rot((Math.sin(bl.age * 3.1 + bl.seed) + Math.sin(bl.age * 7.7 + bl.seed * 2)) * 0.9 * dt); break;
        case "accel": { const f = 1 + 1.7 * Math.min(1, bl.age / (bl.life0 * 0.8)), cur = Math.hypot(bl.vx, bl.vy), want = bl.spd0 * f; if (cur > 0){ bl.vx *= want / cur; bl.vy *= want / cur; } break; }
        case "grow": { const nf = 1 + 1.2 * Math.min(1, bl.age / (bl.life0 * 0.75)), of = bl.growF || 1; bl.sz = bl.baseSz * nf; bl.dmg *= nf / of; bl.growF = nf; break; }
        case "boomerang": {
          if (!bl.ret && bl.age > bl.life0 * 0.5) bl.ret = true;
          if (bl.ret){
            const dx = bl.ox - bl.x, dy = bl.oy - bl.y, d = Math.hypot(dx, dy), spd = Math.hypot(bl.vx, bl.vy);
            if (d < 18){ removeBulletAt(i); continue; }
            const want = Math.atan2(dy, dx), cur = Math.atan2(bl.vy, bl.vx);
            let diff = ((want - cur + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
            const turn = 11 * dt, na = cur + Math.max(-turn, Math.min(turn, diff));
            bl.vx = Math.cos(na) * spd; bl.vy = Math.sin(na) * spd;
            bl.life = Math.max(bl.life, d / spd + 0.05);
          }
          break; }
      }
    }
    if (bl.trail){ (bl.ghost = bl.ghost || []).unshift({ x: bl.x, y: bl.y }); if (bl.ghost.length > 3) bl.ghost.pop(); }
    if (bl.orb){   // 重力球: ブロックをすり抜け、周囲を削り続ける
      bl.x += bl.vx * dt; bl.y += bl.vy * dt;
      bl.tickT -= dt;
      if (bl.tickT <= 0){ bl.tickT = 1 / 8; damageRadius(bl.x, bl.y, bl.orb, bl.dmg); }
      if (bl.life <= 0) removeBulletAt(i);
      continue;
    }
    // 速い弾がブロックを飛び越えないよう、1フレームの移動をブロック半分ずつに刻んで当たり判定する
    const sub = Math.min(6, Math.max(1, Math.ceil(Math.hypot(bl.vx, bl.vy) * dt / (BS * 0.5))));
    let gx = 0, gy = 0, idx = -1, hit = false, mobHit = null;
    for (let k = 0; k < sub && !hit && !mobHit; k++){
      bl.x += bl.vx * dt / sub; bl.y += bl.vy * dt / sub;
      mobHit = mobAtPoint(bl.x, bl.y, bl.lastMob);
      if (!mobHit){
        gx = w2g(bl.x); gy = w2g(bl.y); idx = gy * D + gx;
        hit = blockExists(gx, gy) && !isDestroyed(idx) && idx !== bl.lastHit;
      }
    }
    if ((hit || mobHit) && bl.mine && !bl.stuck){   // 設置爆弾は当たらずにくっつく
      bl.stuck = true; bl.vx = 0; bl.vy = 0; bl.life = 2.4; bl.armT = 0.35; bl.move = null; hit = false; mobHit = null;
    }
    let dead = bl.life <= 0;
    if (mobHit){   // モンスターに命中
      curPl = !!bl.pl; curFx = bl.fx || null;
      damageMob(mobHit, bl.dmg, bl);
      curFx = null; curPl = false;
      if (bl.pierce > 0){ bl.pierce--; bl.lastMob = mobHit.id; }
      else dead = true;
    }
    if (hit){
      curPl = !!bl.pl; curEcho = !!bl.echo; curFx = bl.fx || null; curCarry = true;
      curCoinMul = bl.coinMul || 1; novaLeft = bl.nova || 0;
      const hitDmg = bl.dmg;
      dmgCritFlag = !!bl.crit;
      dmgVoidFlag = !!bl.crit && artHas("lg_void");   // 虚無の単眼: 武器の会心も紫の特大数字にする
      const over = damageBlock(idx, bl.dmg, bl.splash);
      dmgCritFlag = false; dmgVoidFlag = false;
      curCoinMul = 1; novaLeft = 0; curFx = null; curCarry = false;
      if (bl.split){   // 分裂: 周囲のブロックへ破片
        const neigh = [];
        for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++){
          if (!dx && !dy) continue;
          const x = gx + dx, y = gy + dy;
          if (blockExists(x, y) && !isDestroyed(y * D + x)) neigh.push(y * D + x);
        }
        for (let k = 0; k < bl.split && neigh.length; k++){
          const j = neigh.splice((Math.random() * neigh.length) | 0, 1)[0];
          damageBlock(j, hitDmg * 0.4, 0);
        }
      }
      // 貫通・跳弾は「威力を落とさずにもう1個」。使い切ったあとは、余剰ダメージを持ったまま奥へ進み続ける
      if (bl.pierce > 0){ bl.pierce--; bl.lastHit = idx; }   // 貫通: 死なない (大口径で威力増)
      else if (bl.bounce > 0){                                     // 跳弾: 別のブロックへ
        const nxt = findNearestBlocks(bl.x, bl.y, 170, 1, new Set([idx]))[0];
        if (nxt !== undefined){
          const spd = Math.hypot(bl.vx, bl.vy);
          const a = Math.atan2(g2w((nxt / D) | 0) - bl.y, g2w(nxt % D) - bl.x);
          bl.vx = Math.cos(a) * spd; bl.vy = Math.sin(a) * spd;
          bl.x += bl.vx * 0.03; bl.y += bl.vy * 0.03;
          bl.bounce--; bl.lastHit = idx;
        } else if (over > 0.01){ bl.dmg = over; bl.lastHit = idx; }
        else dead = true;
      }
      else if (over > 0.01){ bl.dmg = over; bl.lastHit = idx; }   // 余剰ダメージ: 壊して余った威力で、奥のブロックへ
      else dead = true;
      curPl = false; curEcho = false;
      if (dead && bl.frags && bullets.length < 900){   // クラスター: 子弾をばらまく
        const life = 0.28 / BULLET_SPD_MUL;
        for (let k = 0; k < bl.frags; k++){
          const a = Math.random() * Math.PI * 2;
          bullets.push({ x:bl.x, y:bl.y, vx:Math.cos(a)*600*BULLET_SPD_MUL, vy:Math.sin(a)*600*BULLET_SPD_MUL, dmg:hitDmg * (bl.fx.fragDmg || 0.5), splash:0, life, lastHit:idx, color:bl.color, pl:bl.pl, child:true, fx:bl.fx, shape:"spark", sz:3 });
        }
      }
    }
    if (dead) removeBulletAt(i);
  }
  processAftershocks(AFTERSHOCK_BUDGET_MS);   // 撃破の余波 (連破・発破・誘爆…) を時間予算の範囲で処理 (game/skill-hooks.js)
  pruneFx(now);

  // --- コインの合体: 密集して静止したコインを 0.25 秒ごとに間引いて大きな1枚にする ---
  // --- コインの引き合い: 散らばったコインの重心方向を 0.5 秒ごとに決める (合体より緩くて十分) ---
  coinMergeT -= dt; if (coinMergeT <= 0){ coinMergeT = 0.25; mergeCoinsPass(); }
  coinPullT -= dt; if (coinPullT <= 0){ coinPullT = 0.5; coinPullPass(); }

  // --- coins (player magnet / coin-bot vacuum, yellow) ---
  // 距離の比較は2乗のまま行い、平方根は必要なときだけ取る
  const goldSing = artHas("lg_gold");   // 黄金の特異点: 吸引範囲 ×6・吸引力も大幅アップ
  const mr = magnetRange() * (goldSing ? 6 : 1), mr2 = mr * mr, vac = coinBotVacuum(), vac2 = vac * vac, pull = coinBotPull(), touch2 = coinBotTouchR() ** 2;
  const pPull = goldSing ? 9000 : 1400;
  const damp = Math.pow(0.92, dt * 60);   // フレームレートに依らない減衰 (60fps で従来の 0.92)
  for (let i = coinsArr.length - 1; i >= 0; i--){
    const c = coinsArr[i];
    let collected = false, towed = false;   // towed = マグネット/真空の吸引を受けている (引き合いより回収が優先)
    const dx = player.x - c.x, dy = player.y - c.y, d2 = dx * dx + dy * dy;
    c.age = (c.age || 0) + dt;
    if (d2 < mr2){ const d = Math.sqrt(d2) || 1; c.vx += dx / d * pPull * dt; c.vy += dy / d * pPull * dt; towed = true; }
    if (d2 < 676) collected = true;
    if (!collected){
      for (const cb of coinBots){
        const bx = cb.x - c.x, by = cb.y - c.y, bd2 = bx * bx + by * by;
        if (bd2 < vac2){ const bd = Math.sqrt(bd2) || 1; c.vx += bx / bd * pull * dt; c.vy += by / bd * pull * dt; towed = true; }
        if (bd2 < touch2){ collected = 2; break; }   // 2 = 回収ボットが拾った
      }
    }
    // コイン同士の引き合い (coinPullPass が保存した加速度ベクトル)。吸引中はそちらに従い、
    // 上限速度を超えている間は足さない (回収の勢いを邪魔せず、暴走もしない)
    if (!towed && (c.pax || c.pay) && c.vx * c.vx + c.vy * c.vy < COIN_PULL_MAX_SPD2){
      c.vx += c.pax * dt; c.vy += c.pay * dt;
    }
    c.vx *= damp; c.vy *= damp;
    c.x += c.vx * dt; c.y += c.vy * dt;
    if (collected){
      gainCoin(c, collected === 2);
      removeCoinAt(i); hudDirty = true;
    }
  }

  if (dmgFlushT <= 0){ dmgFlushT = 0.15; flushDmgLabels(); }

  draw(now);

  // --- target HP bar ---
  updateTargetBar();

  uiT -= dt; hudT -= dt;
  if (uiT <= 0){ uiT = 0.25; renderPanels(); updateHUD(); hudDirty = false; }
  else if (hudDirty && hudT <= 0){ hudT = 0.1; hudDirty = false; updateHUD(); }
  saveT -= dt; if (saveT <= 0){ saveT = 5; save(); }
  worldT -= dt; if (worldT <= 0){ worldT = 8; flushWorld(); }   // 惑星の破壊状況 (差分のみ)
}
