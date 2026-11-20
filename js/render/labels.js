"use strict";
/* =========================================================
   render/labels.js - ダメージ数値の集計と発行
   ========================================================= */

// ---------- ダメージ数値の表示 (0.15秒ごとに集計し、上位だけを出す) ----------
// 毎ヒット表示すると大量ヒットで埋もれて重くなるので、ブロック単位で貯めた合計を
// 0.15秒に1回だけ・同時に最大8件まで・表示中は最大42件までに絞る。文字列化と
// フォント決定はこの発行時に1回だけ行い、描画中は測り直さない。
let dmgFlushT = 0;
function flushDmgLabels(){
  if (!dmgAcc.size && !mobDmgAcc.size) return;
  if (dmgAcc.size){
  let cand = null;
  if (dmgAcc.size > 5){
    cand = [...dmgAcc.entries()].sort((a, b) => b[1].total - a[1].total);
  }
  let emitted = 0;
  // 重なり回避の目安 (ワールド座標)。画面上で横34px・縦14pxぶん離す
  const minDx = 34 / zoom, minDy = 14 / zoom;
  const emit = (idx, e) => {
    if (dmgLabels.length < MAX_DMG_LABELS){
      const d = dmgPool.pop() || {};
      const h = (idx * 2654435761) >>> 8;
      // 重ならないよう格子状のスロットへ割り当てる: 近くに既にあるラベルの数で置き場所が決まる (決定的・総当たり1回で軽い)
      let near = 0;
      for (const o of dmgLabels){ if (Math.abs(o.x - e.x) <= minDx * 1.5 && o.y <= e.y + minDy && o.y >= e.y - minDy * 5.5) near++; }
      const slot = Math.min(near, 7);
      d.x = e.x + DMG_GRID_X[slot] * minDx;
      d.y = e.y - DMG_GRID_Y[slot] * minDy;
      d.text = fmtDmg(e.total);
      d.crit = e.crit; d.void = !!e.void;
      d.fs = e.void ? 24 : e.crit ? 19 : e.total >= e.max * 0.35 ? 15 : 13;
      d.color = e.void ? "#c77dff" : e.crit ? "#ffa726" : "#ffffff";   // 金色は廃止。通常=白、クリティカル=オレンジ、虚無の単眼=紫・特大
      d.vy = 26 + (h >> 4) % 19;   // 上昇速度にもばらつきを持たせ、浮かぶ間にも離れていく
      d.t = nowMs;
      dmgLabels.push(d);
    }
    emitted++;
  };
  // 1回の発行は大きい順に5件まで。控えめ設定ではクリティカルだけ出す
  const lim = 5, low = fxLow();
  if (cand){ for (let i = 0; i < cand.length && emitted < lim; i++) if (!low || cand[i][1].crit) emit(cand[i][0], cand[i][1]); }
  else for (const [idx, e] of dmgAcc){ if (emitted >= lim) break; if (!low || e.crit) emit(idx, e); }
  for (const e of dmgAcc.values()) dmgEntryPool.push(e);
  dmgAcc.clear();
  }
  // モンスター分: 頭上に表示 (多い時は合計の大きい順に6件まで)
  if (mobDmgAcc.size){
    const list = [...mobDmgAcc.values()].sort((x, y) => y.total - x.total);
    let n = 0;
    for (const e of list){
      if (n >= 6 || dmgLabels.length >= MAX_DMG_LABELS) break;
      const m = e.m, d = dmgPool.pop() || {};
      d.x = m.x + ((m.id * 37) % 13) - 6;
      d.y = m.y - m.type.r - 6;
      d.text = fmtDmg(e.total);
      d.crit = e.crit; d.void = !!e.void;
      d.fs = e.void ? 23 : e.crit ? 19 : 15;
      d.color = e.void ? "#c77dff" : e.crit ? "#ffa726" : "#ffffff";
      d.vy = 30 + (m.id * 13) % 17;
      d.t = nowMs;
      dmgLabels.push(d); n++;
    }
    mobDmgAcc.clear();
  }
}
