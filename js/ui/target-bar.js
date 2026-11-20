"use strict";
/* =========================================================
   ui/target-bar.js - 狙っているブロック / モンスターの HP バー
   ========================================================= */

// ---------- 狙っているブロックの HP バー (値が変わったときだけ DOM を書き換える) ----------
const tbEl = { bar: $("targetBar"), text: $("targetText"), fill: $("targetFill"), pct: $("targetPct"), sub: $("targetSub") };
let tbShown = null, tbText = "", tbWidth = "", tbPct = "", tbMatKey = "";
function updateTargetBar(){
  // モンスター優先 (照準と同じ): 射程内にいれば名前とHPを上部バーに表示
  const mob = nearestMob(player.x, player.y, atkRange());
  let show = false, nameText = "", dimText = "", ratio = 0;
  if (mob){
    show = true;
    const key = "mob:" + mob.type.name + ":" + mob.sat;
    if (key !== tbMatKey){
      tbMatKey = key;
      tbEl.bar.style.setProperty("--tc", mob.type.color);
      tbEl.sub.textContent = `モンスター ・ ${SATS[mob.sat].name}`;
    }
    nameText = `${mob.type.name}  HP ${fmtDmg(Math.max(0, mob.hp))}`;
    dimText = ` / ${fmtDmg(mob.maxHp)}`;
    ratio = Math.max(0, mob.hp / mob.maxHp);
  } else {
    const tIdx = findNearestBlock(player.x, player.y, atkRange());
    if (tIdx >= 0){
      show = true;
      const tMax = blockMaxHP(tIdx % D, (tIdx / D) | 0), tCur = blockHP(tIdx);
      const tm = MATS[materialAt(tIdx % D, (tIdx / D) | 0)];
      if (tm.key !== tbMatKey){   // 素材が変わったときだけ色と補足情報を差し替える
        tbMatKey = tm.key;
        tbEl.bar.style.setProperty("--tc", tm.color);
        tbEl.sub.textContent = `${MAT_CATS[tm.cat].name} ・ ${LAYERS[tm.layer].name}`;
      }
      nameText = `${tm.name}  HP ${fmtDmg(Math.max(0, tCur))}`;
      dimText = ` / ${fmtDmg(tMax)}`;
      ratio = Math.max(0, tCur / tMax);
    }
  }
  if (show !== tbShown){ tbShown = show; tbEl.bar.style.display = show ? "block" : "none"; }
  if (!show) return;
  const text = nameText + dimText;
  if (text !== tbText){
    tbText = text;
    tbEl.text.innerHTML = "";
    const name = document.createElement("span"); name.textContent = nameText;
    const dim = document.createElement("span"); dim.className = "hp-dim"; dim.textContent = dimText;
    tbEl.text.append(name, dim);
  }
  const pct = (ratio * 100).toFixed(1) + "%";
  if (pct !== tbPct){ tbPct = pct; tbEl.pct.textContent = pct; }
  const width = (ratio * 100).toFixed(1) + "%";
  if (width !== tbWidth){ tbWidth = width; tbEl.fill.style.width = width; }
}
