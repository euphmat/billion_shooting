"use strict";
/* =========================================================
   ui/home-panel.js - おすすめタブ: 「今すぐできること」を全タブから集めて1画面に並べる
   ・装備中の武器 + 一括強化 (いちばん押すボタン) を先頭に
   ・今買えるもの (武器の製作 / ボット / 衛星テク / モジュール) を、効果の大きい順に1行ずつ
   ・何も買えない時は「次の目標」= 何を集めればいいかを見せる
   ========================================================= */

const HOME_CRAFT_MAX = 3;   // おすすめに出す製作候補の数 (それ以上は武器タブの「製作可」へ)
const CREW_BUYS = () => ["bot", "bupgrade", "botcore", "botarmor", "coinbot", ...CB_MOD_KEYS.map(k => "cbmod:" + k)];
function homeReady(){
  const craft = WEAPON_KEYS.filter(k => !state.weaponsOwned[k] && canBuy(buyDef("craft:" + k)))
    .sort((a, b) => WEAPONS[b].power - WEAPONS[a].power);
  const crew = CREW_BUYS().filter(b => { const d = buyDef(b); return d && canBuy(d); });
  return { craft, crew, equip: betterOwnedKey() };
}
// 装備中より強い所持武器 (強化込みで比べて一番強いもの。無ければ null)
function betterOwnedKey(){
  let best = null, bestRel = 1.0001;
  // ボットに持たせている武器は、わざとそうしている可能性が高いので候補にしない
  for (const k of WEAPON_KEYS) if (state.weaponsOwned[k] && k !== state.weapon && shelfHolder(k) < 0){ const r = weaponRel(k); if (r > bestRel){ bestRel = r; best = k; } }
  return best;
}
// 署名: 「今買えるものの集合」が変わった時だけおすすめを描き直す
const homeSig = () => { const r = homeReady(); return r.craft.join(",") + "/" + r.crew.join(",") + "/" + r.equip; };
function equipRowHTML(k){
  const w = WEAPONS[k];
  return `<div class="arow afford" style="--accent:${w.accent}" data-tip="weapon:${k}">
    <div class="ar-top">${iconBadge(w.icon, w.accent)}
      <div class="ar-main"><div class="ar-title"><span class="ar-name">${w.name}</span><span class="lv-pill">Lv.${weaponLvOf(k)}</span>${evoStar(k) ? evoStarsHTML(k, "sm") : ""}</div>
      <div class="ar-eff">持っている中で最強 ・ 今の装備より <span class="up">${relUp(weaponRel(k))}</span></div></div>
      <button class="act-btn go" data-buy="equip:${k}"><span class="ab-label">持ち替え</span></button></div>
  </div>`;
}

function craftRowOpts(k){
  const w = WEAPONS[k], rel = w.power / WEAPONS[state.weapon].power;
  return { buy:"craft:" + k, icon:w.icon, accent:w.accent, title:w.name, lv:`No.${w.no}`, tip:`weapon:${k}`, go:true, label:"製作",
    eff: rel > 1 ? `今の装備より <span class="up">${relUp(rel)}</span> ・ 作ると自動で装備` : `${w.tag} ・ ボットに持たせられる` };
}
// 次の目標: 作れない一番手前の強い武器と、その不足素材 (どこで採れるか付き)
function goalHTML(){
  const cur = WEAPONS[state.weapon];
  const k = WEAPON_KEYS.find(x => !state.weaponsOwned[x] && WEAPONS[x].power > cur.power && !canBuy(buyDef("craft:" + x)));
  let html = "";
  if (k){
    const w = WEAPONS[k], d = buyDef("craft:" + k), pct = recipePct(w.recipe), coinLack = Math.max(0, d.coins - state.coins);
    html += `<div class="goal" style="--accent:${w.accent}" data-tip="weapon:${k}">
      <div class="ar-top">${iconBadge(w.icon, w.accent)}
        <div class="ar-main"><div class="ar-title"><span class="ar-name">${w.name}</span><span class="lv-pill">No.${w.no}</span></div>
        <div class="ar-eff">今の装備より <span class="up">${relUp(w.power / cur.power)}</span> ・ ${w.tag}</div></div>
        <button class="act-btn ghost" data-goto="craft" data-gosel="${k}">見る</button></div>
      <div class="goal-bar"><i style="width:${pct}%"></i><span>素材 ${pct}%${coinLack > 0 ? ` ・ コイン あと ${fmt(coinLack)}` : ""}</span></div>
      ${recipeChips(w.recipe, false)}
    </div>`;
  }
  if (state.bots < BOT_MAX && !canBuy(buyDef("bot"))) html += actRowHTML(crewRowOpts("bot"));
  return html || `<p class="empty">目標はすべて達成済み。強化で惑星を削り切ろう。</p>`;
}
function homePanelHTML(){
  const { craft, crew, equip } = homeReady();
  const buyN = craft.length + crew.length, n = buyN + (equip ? 1 : 0);
  let html = equippedCardHTML() + bulkUpBarHTML(bulkUpPreview(true));
  html += secTitleHTML("今すぐできること", n ? "押せばすぐ強くなる" : "", buyN > 1 ? `<button class="mini-act all" data-buyall title="製作・ボット・モジュールを上から順に1回ずつ買う (持ち替えはしない。払えなくなったら止まる)">すべて1回ずつ (${buyN})</button>` : n ? `${n}件` : "");
  if (n){
    html += `<div class="alist">`;
    if (equip) html += equipRowHTML(equip);
    html += craft.slice(0, HOME_CRAFT_MAX).map(k => actRowHTML(craftRowOpts(k))).join("");
    if (craft.length > HOME_CRAFT_MAX) html += `<button class="more-row" data-goto="craft" data-gofilter="craftable">ほかに製作できる武器 ${craft.length - HOME_CRAFT_MAX} 件 ›</button>`;
    html += crew.map(crewRowHTML).join("");
    html += `</div>`;
  } else {
    html += `<div class="hint-box">今すぐ買えるものはない。ブロックを壊してコインと素材を集めよう。<br>下の「次の目標」で、何を集めればいいか分かる。</div>`;
  }
  html += secTitleHTML("次の目標", "これを目指して掘る");
  html += `<div class="alist">${goalHTML()}</div>`;
  return html;
}

// 「すべて1回ずつ」: おすすめに並んでいる順 (製作 → ボット → モジュール) に1回ずつ買う
function doBuyAllOnce(){
  const { craft, crew } = homeReady();   // 持ち替えは好みがあるので含めない (コイン倍率の武器をわざと使う人もいる)
  const list = craft.map(k => "craft:" + k).concat(crew);
  let n = 0;
  for (const b of list) if (applyBuy(b)) n++;
  if (!n){ sndFail(); return 0; }
  sndBuy(); save(); renderPanels(true); updateHUD();
  toast(`まとめて購入: ${n}件`);
  return n;
}
