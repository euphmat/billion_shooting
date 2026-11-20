"use strict";
/* =========================================================
   game/physics.js - ブロックとの衝突 (押し出し)
   ========================================================= */

// ---------- collision (ブロックを貫通させない) ----------
// 自機を円として扱い、重なった生存ブロックの外へ押し出す。
// 掘った穴 (破壊済み) には入れるので、採掘したトンネルは通れる。
function resolveCollision(ent, rad){
  for (let iter = 0; iter < 3; iter++){
    const cgx = w2g(ent.x), cgy = w2g(ent.y);
    const rb = Math.ceil(rad / BS) + 1;
    let moved = false;
    for (let gy = cgy - rb; gy <= cgy + rb; gy++){
      for (let gx = cgx - rb; gx <= cgx + rb; gx++){
        if (!blockExists(gx, gy) || isDestroyed(gy * D + gx)) continue;
        const bx = (gx - GC) * BS, by = (gy - GC) * BS;   // ブロック左上 (world)
        const cx = Math.max(bx, Math.min(ent.x, bx + BS));
        const cy = Math.max(by, Math.min(ent.y, by + BS));
        let dx = ent.x - cx, dy = ent.y - cy;
        const d2 = dx * dx + dy * dy;
        if (d2 > rad * rad) continue;
        if (d2 > 1e-6){
          const d = Math.sqrt(d2);
          ent.x = cx + dx / d * rad; ent.y = cy + dy / d * rad;
        } else {
          // 中心がブロック内: 最も近い辺から押し出す
          const left = ent.x - bx, right = bx + BS - ent.x, top = ent.y - by, bottom = by + BS - ent.y;
          const m = Math.min(left, right, top, bottom);
          if (m === left) ent.x = bx - rad; else if (m === right) ent.x = bx + BS + rad;
          else if (m === top) ent.y = by - rad; else ent.y = by + BS + rad;
        }
        moved = true;
      }
    }
    if (!moved) break;
  }
}

/* 移動しながら衝突を解く (自機・攻撃ボット共通)。
   1歩を当たり半径の半分以下に刻むのが肝: 1歩が半径より大きいと、角だけで接したブロックの並び
   (斜めの1マス壁。掘った跡によくできる) を、円の中心が角の点ごと飛び越えてすり抜けてしまう。
   以前は 16px 刻み (半径 10px) だったため、ブースト (×10) で斜めの壁を抜けていた */
const MOVE_STEP_MAX = 400;   // 1フレームの歩数の上限 (異常な速度でもフレームが固まらないように)
function moveWithCollision(ent, dx, dy, rad){
  const len = Math.hypot(dx, dy);
  if (len === 0){ resolveCollision(ent, rad); return; }
  const n = Math.min(MOVE_STEP_MAX, Math.max(1, Math.ceil(len / (rad * 0.5))));
  const sx = dx / n, sy = dy / n;
  for (let s = 0; s < n; s++){ ent.x += sx; ent.y += sy; resolveCollision(ent, rad); }
}
