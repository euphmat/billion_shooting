"use strict";
/* =========================================================
   render/labels.js - ダメージ数値の集計と発行
   ========================================================= */

// ---------- ダメージ数値の表示 (0.15秒ごとに集計し、上位だけを出す) ----------
// 毎ヒット表示すると大量ヒットで埋もれて重くなるので、ブロック単位で貯めた合計を
// 0.15秒に1回だけ・同時に最大11件まで・表示中は最大 MAX_DMG_LABELS 件までに絞る。
// 画面外のヒットは集計の時点で捨てる (combat.js / mobs.js)。発行時にもう一度画面内か確かめる。
// 文字列化・フォント文字列・演出パラメータはこの発行時に1回だけ決め、描画中は計算し直さない。
let dmgFlushT = 0;
let dmgPeak = 0;   // 最近の最大ダメージ (ゆっくり減衰)。これに近い一撃ほど大きく派手に出す
function dmgLabelStyle(d, total, crit, voidHit, rank, base){
  // 強さ: 0 (小さい) 〜 1 (最近の最大級)。対数で比べるので桁が違っても段階的に効く
  const r = dmgPeak > 0 ? Math.max(0, Math.min(1, 1 + Math.log10(Math.max(1e-9, total / dmgPeak)) / 2)) : 1;
  const big = r >= 0.85 || rank === 0;
  let fs = base + Math.round(r * 4) + (big ? 2 : 0);
  if (crit) fs += 5;
  if (voidHit) fs = Math.max(fs + 6, 25);
  d.fs = fs;
  d.font = DMG_FONT(fs);
  d.text = fmtDmg(total) + (voidHit ? "!!" : crit ? "!" : "");
  d.crit = crit; d.void = voidHit;
  d.color = voidHit ? "#c77dff" : crit ? "#ffa726" : big ? "#fff6d6" : "#ffffff";   // 通常=白 (大きい一撃はわずかに暖色)、クリティカル=オレンジ、虚無の単眼=紫
  d.pop = voidHit ? 1.3 : crit ? 0.95 : big ? 0.6 : 0.35;   // 出現時の跳ね (拡大率の上乗せ)
  d.shake = voidHit ? 5 : crit ? 3 : 0;                     // 出現直後の横揺れ (px)
  d.flash = crit || voidHit || big;                          // 出た瞬間だけ白く光らせる
  d.t = nowMs;
}
function flushDmgLabels(){
  dmgPeak *= 0.97;   // 0.15秒ごと → 約5秒で半分。強くなった直後の数字が派手に出る
  if (!dmgAcc.size && !mobDmgAcc.size) return;
  // モンスター分を先に出す (ブロックの数字に枠を奪われてボスへのダメージが見えなくなるのを防ぐ)
  if (mobDmgAcc.size){
    const list = [...mobDmgAcc.values()].sort((x, y) => y.total - x.total);
    if (list[0].total > dmgPeak) dmgPeak = list[0].total;
    let n = 0;
    for (const e of list){
      if (n >= 6 || dmgLabels.length >= MAX_DMG_LABELS) break;
      const m = e.m;
      if (m.hp > 0 && !onScreen(m.x, m.y, 60)) continue;
      const d = dmgPool.pop() || {};
      d.x = m.x + ((m.id * 37) % 13) - 6;
      d.y = m.y - m.type.r - 6;
      dmgLabelStyle(d, e.total, e.crit, !!e.void, n, 14);
      d.vy = 34 + (m.id * 13) % 17;
      d.vx = ((m.id * 29) % 21) - 10;
      dmgLabels.push(d); n++;
    }
    mobDmgAcc.clear();
  }
  if (dmgAcc.size){
    const cand = [...dmgAcc.entries()];
    if (cand.length > 1) cand.sort((a, b) => b[1].total - a[1].total);
    if (cand[0][1].total > dmgPeak) dmgPeak = cand[0][1].total;
    // 重なり回避の目安 (ワールド座標)。画面上で横34px・縦14pxぶん離す
    const minDx = 34 / zoom, minDy = 14 / zoom;
    // 1回の発行は大きい順に5件まで。控えめ設定ではクリティカルだけ出す
    const lim = 5, low = fxLow();
    let emitted = 0;
    for (let i = 0; i < cand.length && emitted < lim && dmgLabels.length < MAX_DMG_LABELS; i++){
      const idx = cand[i][0], e = cand[i][1];
      if (low && !e.crit) continue;
      if (!onScreen(e.x, e.y, BS)) continue;   // 集計中に画面外へ流れたもの
      const d = dmgPool.pop() || {};
      const h = (idx * 2654435761) >>> 8;
      // 重ならないよう格子状のスロットへ割り当てる: 近くに既にあるラベルの数で置き場所が決まる (決定的・総当たり1回で軽い)
      let near = 0;
      for (const o of dmgLabels){ if (Math.abs(o.x - e.x) <= minDx * 1.5 && o.y <= e.y + minDy && o.y >= e.y - minDy * 5.5) near++; }
      const slot = Math.min(near, 7);
      d.x = e.x + DMG_GRID_X[slot] * minDx;
      d.y = e.y - DMG_GRID_Y[slot] * minDy;
      dmgLabelStyle(d, e.total, e.crit, !!e.void, emitted, 12);
      d.vy = 28 + (h >> 4) % 19;   // 上昇量にもばらつきを持たせ、浮かぶ間にも離れていく
      d.vx = ((h >> 9) % 25) - 12;  // 左右にも少し散らす (扇状に広がる)
      if (d.crit) d.vy += 12;
      dmgLabels.push(d);
      emitted++;
    }
    for (const e of dmgAcc.values()) dmgEntryPool.push(e);
    dmgAcc.clear();
  }
}
