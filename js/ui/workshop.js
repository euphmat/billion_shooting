"use strict";
/* =========================================================
   ui/workshop.js - 工房パネル: 装備の一覧・製作・強化
   ========================================================= */

/* ---------- 工房: 装備 (全137種 / 9ステージ = 地層+衛星+小惑星) ---------- */
const tierOpen = {};   // ステージ見出しの開閉 (未操作なら自動)
// 「次に狙う装備」= 今の装備より強い未所持装備のうち、順番に3つ
function nextWeaponKeys(){
  const cur = WEAPONS[state.weapon];
  return WEAPON_KEYS.filter(k => !state.weaponsOwned[k] && WEAPONS[k].power > cur.power).slice(0, 3);
}
function weaponFeatTags(w){
  const t = [];
  if (w.frost) t.push("氷結"); if (w.acid) t.push("腐食"); if (w.radiation) t.push("放射"); if (w.shock) t.push("放電");
  if (w.matBonus) t.push("素材2倍"); if (w.coinMul) t.push(`コイン x${w.coinMul}`); if (w.xpMul) t.push(`XP x${w.xpMul}`);
  if (w.ap) t.push("徹甲"); if (w.exec) t.push("処刑"); if (w.burn) t.push("燃焼"); if (w.shatter) t.push("破砕");
  return t.map(x => `<span class="ftag">${x}</span>`).join("");
}
function weaponStatsHTML(k, w){
  const mul = weaponPowerMul(k), cur = WEAPONS[state.weapon], tier = weaponTierMul(k);
  const dps = weaponDPS(w) * mul, rel = (w.power * mul) / (cur.power * weaponPowerMul(state.weapon));
  const cmp = k === state.weapon ? "" : rel > 1.0001 ? `<span class="sbadge up">▲ ${pctUp(rel)}</span>` : `<span class="sbadge down">▼ 弱い</span>`;
  const tags = weaponFeatTags(w);
  const pel = weaponPellets(k), pelBonus = pel - (w.pellets || 1);
  return `<div class="sbadges"><span class="sbadge main">${iconSVG("damage")}DPS <b>${fmtD(dps)}</b></span>${cmp}<span class="sbadge">${iconSVG("heavy")}1発 <b>x${fmtX(w.dmg * mul)}</b></span><span class="sbadge">${iconSVG("rapid")}<b>${w.rate}</b>/秒</span><span class="sbadge${w.yield > 1 ? "" : " dim"}">${iconSVG("coin")}<b>+${Math.round((w.yield - 1) * 100)}%</b></span>${tier > 1 ? `<span class="sbadge up" title="強化Lv10ごとに威力 +50%">${iconSVG("up")}節目 <b>×${fmtX(tier)}</b></span>` : ""}${pel > 1 ? `<span class="sbadge${pelBonus > 0 ? " up" : ""}">${iconSVG("spread")}<b>${pel}</b>発${pelBonus > 0 ? ` (+${pelBonus})` : ""}</span>` : ""}${w.move ? `<span class="sbadge">${iconSVG("wave")}${MOVE_INFO[w.move][0]}</span>` : ""}${w.mine ? `<span class="sbadge">${iconSVG("bomber")}設置爆弾</span>` : ""}${(w.targets || 1) > 1 ? `<span class="sbadge">${iconSVG("normal")}<b>${w.targets}</b>目標</span>` : ""}${tags}</div><div class="pbar${rel > 1.0001 ? " up" : ""}"><i style="width:${Math.max(3, Math.min(100, 50 * rel))}%"></i></div>${w.feat ? `<div class="feat-line">${w.feat}</div>` : ""}`;
}
function weaponCardHTML(k, w){
  const owned = state.weaponsOwned[k], eq = state.weapon === k, lv = weaponLvOf(k);
  const holder = state.botLoadout.indexOf(k), botHeld = owned && holder >= 0 && botWeaponAt(holder) === k;
  const dCraft = !owned ? buyDef("craft:" + k) : null, craftable = !!dCraft && canBuy(dCraft);
  const badge = (eq ? `<span class="badge solid">装備中</span>` : owned ? `<span class="badge dim">所持</span>` : craftable ? `<span class="badge go">製作可</span>` : `<span class="badge next-badge">NEXT</span>`) + (owned && lv > 0 ? `<span class="badge dim">Lv.${lv}</span>` : "") + (botHeld ? `<span class="badge dim">ボット${holder + 1}が使用中</span>` : "");
  let body;
  if (!owned){
    const d = dCraft;
    body = `${recipeChips(w.recipe)}
      <button class="buy-btn" data-buy="craft:${k}" ${canBuy(d) ? "" : "disabled"}><span>製作する</span>${costHTML(d.coins)}</button>`;
  } else {
    const d = buyDef("wupgrade:" + k);
    body = `<div class="sbadges" style="border-top:none;padding-top:0"><span class="sbadge">Lv <b>${lv} → ${lv + 1}</b></span><span class="sbadge up">威力 +8%</span></div>${recipeChips(d.mats, true)}${matSubHTML("wupgrade:" + k)}
      <div class="btn-row">${eq ? `<button class="buy-btn" disabled><span>装備中</span></button>` : `<button class="equip-btn" data-buy="equip:${k}">装備する</button>`}<button class="buy-btn" data-buy="wupgrade:${k}" ${canBuy(d) ? "" : "disabled"}><span>強化</span>${upCostSpan("wupgrade:" + k, d)}</button></div>`;
  }
  const m = w.mat ? MAT[w.mat] : null;
  return `<div class="card${eq ? " equipped-card" : ""}${craftable ? " craftable" : ""}" style="--accent:${w.accent}" title="${w.desc.replace(/"/g, "")}">
    ${cardTop(w.icon, w.accent, `<span class="wno">No.${String(w.no).padStart(2, "0")}</span>${w.name}`, badge, w.tag + (m ? ` ・ ${m.name}製` : ""))}
    ${weaponStatsHTML(k, w)}
    ${body}
  </div>`;
}
function weaponRowCompactHTML(k, w){
  const owned = state.weaponsOwned[k], eq = state.weapon === k;
  const rel = w.power / WEAPONS[state.weapon].power;
  let right;
  if (owned) right = eq ? `<span class="wr-state">装備中</span>` : `<button class="wr-btn" data-buy="equip:${k}">装備</button>`;
  else {
    const d = buyDef("craft:" + k), keys = Object.keys(w.recipe), have = keys.filter(mk => invOf(mk) >= w.recipe[mk]).length;
    right = `<span class="wr-mats" title="素材の揃い具合">${keys.map(mk => `<i style="background:${MAT[mk].color};opacity:${invOf(mk) >= w.recipe[mk] ? 1 : .25}"></i>`).join("")}</span>
      <button class="wr-btn buy" data-buy="craft:${k}" ${canBuy(d) ? "" : "disabled"}>${costHTML(d.coins)}</button>`;
  }
  const craftableRow = !owned && canBuy(buyDef("craft:" + k));
  return `<div class="wrow${owned ? " owned" : ""}${eq ? " eq" : ""}${craftableRow ? " craftable" : ""}" style="--accent:${w.accent}">
    ${iconBadge(w.icon, w.accent)}
    <div class="wr-main"><div class="wr-name"><span class="wno">No.${String(w.no).padStart(2, "0")}</span>${w.name}${owned && weaponLvOf(k) > 0 ? ` <span class="wr-lv">Lv.${weaponLvOf(k)}</span>` : ""}</div>
      <div class="wr-sub">${w.tag} ・ DPS x${fmtX(w.power)}${eq ? "" : rel > 1 ? ` <span class="up">${pctUp(rel)}</span>` : ""}${!owned ? ` ・ ${Object.keys(w.recipe).map(mk => MAT[mk].name).join("+")}` : ""}</div><div class="pbar mini${rel > 1 ? " up" : ""}"><i style="width:${Math.max(3, Math.min(100, 50 * rel))}%"></i></div></div>
    ${right}
  </div>`;
}
// 「次のおすすめ」: 作れるものがあればそれを、無ければ次の装備 (素材の進み具合つき)、全部持っていれば今の装備の強化
function pickNextKey(){
  const cur = WEAPONS[state.weapon];
  const cands = WEAPON_KEYS.filter(k => !state.weaponsOwned[k] && WEAPONS[k].power > cur.power);
  return cands.find(k => canBuy(buyDef("craft:" + k))) || cands[0] || null;
}
function nextActionHTML(nk){
  const cur = WEAPONS[state.weapon];
  if (!nk){
    const lv = weaponLvOf(state.weapon), d = buyDef("wupgrade:" + state.weapon);
    return `<div class="hero" style="--accent:${cur.accent}"><div class="hero-label">NEXT — 次のおすすめ</div>
      ${cardTop(cur.icon, cur.accent, cur.name, `<span class="badge solid">強化</span>`, cur.tag)}
      <div class="sbadges"><span class="sbadge">Lv <b>${lv} → ${lv + 1}</b></span><span class="sbadge up">威力 +8%</span></div>
      ${recipeChips(d.mats, true)}${matSubHTML("wupgrade:" + state.weapon)}
      <button class="buy-btn" data-buy="wupgrade:${state.weapon}" ${canBuy(d) ? "" : "disabled"}><span>強化する</span>${upCostSpan("wupgrade:" + state.weapon, d)}</button></div>`;
  }
  const w = WEAPONS[nk], d = buyDef("craft:" + nk), ok = canBuy(d), rel = w.power / cur.power;
  let got = 0, tot = 0;
  for (const mk in w.recipe){ tot += w.recipe[mk]; got += Math.min(invOf(mk), w.recipe[mk]); }
  const pct = tot ? Math.floor(100 * got / tot) : 100;
  return `<div class="hero${ok ? " ready" : ""}" style="--accent:${w.accent}"><div class="hero-label">NEXT — 次のおすすめ</div>
    ${cardTop(w.icon, w.accent, `<span class="wno">No.${String(w.no).padStart(2, "0")}</span>${w.name}`, ok ? `<span class="badge go">製作可</span>` : `<span class="badge dim">素材 ${pct}%</span>`, w.tag + (w.mat ? ` ・ ${MAT[w.mat].name}製` : ""))}
    <div class="sbadges"><span class="sbadge main">${iconSVG("damage")}DPS <b>${fmtD(weaponDPS(w))}</b></span><span class="sbadge up">▲ ${pctUp(rel)}</span><span class="sbadge">${iconSVG("heavy")}1発 <b>x${fmtX(w.dmg)}</b></span><span class="sbadge">${iconSVG("rapid")}<b>${w.rate}</b>/秒</span></div>
    <div class="pbar big"><i style="width:${pct}%"></i><span>素材 ${pct}%</span></div>
    ${recipeChips(w.recipe)}
    <button class="buy-btn" data-buy="craft:${nk}" ${ok ? "" : "disabled"}><span>製作する</span>${costHTML(d.coins)}</button></div>`;
}
/* ---------- 工房: 装備ブラウザ (検索・フィルター・ソート + タイル一覧と詳細ペイン) ---------- */
let wQuery = "", wFilter = "all", wSort = "no", wGroup = true, wSel = null;
function weaponSearchText(k){
  const w = WEAPONS[k];
  return (w.name + " " + w.tag + " " + (w.mat ? MAT[w.mat].name : "") + " " + Object.keys(w.recipe).map(mk => MAT[mk].name).join(" ") + " " + (w.feat || "") + " " + (w.desc || "")).toLowerCase();
}
function weaponListKeys(){
  let keys = WEAPON_KEYS.slice();
  if (wFilter === "craftable") keys = keys.filter(k => !state.weaponsOwned[k] && canBuy(buyDef("craft:" + k)));
  else if (wFilter === "owned") keys = keys.filter(k => state.weaponsOwned[k]);
  else if (wFilter === "unowned") keys = keys.filter(k => !state.weaponsOwned[k]);
  if (wQuery){ const q = wQuery.trim().toLowerCase(); if (q) keys = keys.filter(k => weaponSearchText(k).includes(q)); }
  if (wSort === "power") keys.sort((a, b) => WEAPONS[b].power - WEAPONS[a].power);
  else if (wSort === "dps") keys.sort((a, b) => weaponDPS(WEAPONS[b]) * weaponPowerMul(b) - weaponDPS(WEAPONS[a]) * weaponPowerMul(a));
  else if (wSort === "osusume") keys.sort((a, b) => {
    const rank = k => state.weaponsOwned[k] ? 2 : (canBuy(buyDef("craft:" + k)) ? 0 : 1);
    const ra = rank(a), rb = rank(b);
    if (ra !== rb) return ra - rb;
    return ra === 2 ? WEAPONS[b].power - WEAPONS[a].power : WEAPONS[a].power - WEAPONS[b].power;
  });
  else keys.sort((a, b) => WEAPONS[a].no - WEAPONS[b].no);
  return keys;
}
function weaponTileHTML(k){
  const w = WEAPONS[k], owned = state.weaponsOwned[k], eq = state.weapon === k;
  const craftable = !owned && canBuy(buyDef("craft:" + k));
  const rel = w.power / WEAPONS[state.weapon].power;
  const st = eq ? `<span class="wt-st eq">装備中</span>` : craftable ? `<span class="wt-st go">製作可</span>` : owned ? `<span class="wt-st own">Lv.${weaponLvOf(k)}</span>` : `<span class="wt-st dim">未所持</span>`;
  let act;
  if (!owned){ const d = buyDef("craft:" + k); act = `<button class="wr-btn buy" data-buy="craft:${k}" ${canBuy(d) ? "" : "disabled"}>製作 ${costHTML(d.coins)}</button>`; }
  else { const d = buyDef("wupgrade:" + k); act = `${eq ? "" : `<button class="wr-btn" data-buy="equip:${k}">装備</button>`}<button class="wr-btn buy" data-buy="wupgrade:${k}" data-tip="buy:wupgrade:${k}" ${canBuy(d) ? "" : "disabled"}>強化 ${upCostSpan("wupgrade:" + k, d)}</button>`; }
  return `<div class="wtile${eq ? " eq" : ""}${craftable ? " craftable" : ""}" style="--accent:${w.accent}" data-tip="weapon:${k}">
    <span class="wt-top"><span class="icon-badge sm" style="color:${w.accent};border-color:${w.accent};background:${w.accent}14">${iconSVG(w.icon)}</span><span class="wt-no">No.${String(w.no).padStart(2, "0")}</span>${st}</span>
    <span class="wt-name">${w.name}</span>
    <span class="wt-sub">DPS x${fmtX(w.power)}${!eq && rel > 1 ? ` <span class="up">${pctUp(rel)}</span>` : ""}</span>
    <span class="pbar mini${rel > 1 ? " up" : ""}"><i style="width:${Math.max(3, Math.min(100, 50 * rel))}%"></i></span>
    <span class="wt-act">${act}</span>
  </div>`;
}
/* ---------- 工房: 武器フィルタ (チップで一覧を絞り込む。状態は wFilter = UI 状態のみでセーブしない) ---------- */
const WFILTERS = [["all", "すべて"], ["unowned", "未製作のみ"], ["craftable", "製作可能のみ"], ["owned", "所持済みのみ"]];
function weaponFilterMatch(k, f){
  if (f === "unowned") return !state.weaponsOwned[k];
  if (f === "craftable") return !state.weaponsOwned[k] && canBuy(buyDef("craft:" + k));
  if (f === "owned") return !!state.weaponsOwned[k];
  return true;
}
function weaponFilterCounts(){
  const c = { all: WEAPON_KEYS.length, unowned: 0, craftable: 0, owned: 0 };
  for (const k of WEAPON_KEYS){
    if (state.weaponsOwned[k]) c.owned++;
    else { c.unowned++; if (canBuy(buyDef("craft:" + k))) c.craftable++; }
  }
  return c;
}
// 製作可能セットの指紋: 残高そのものではなく「作れる武器の集合」だけを見るので、
// 素材・コインが境界を跨いだ時だけ変わる。renderPanels の署名に入れてフィルタ表示を追従させる
function craftableSig(){
  let s = "";
  for (const k of WEAPON_KEYS) if (!state.weaponsOwned[k] && canBuy(buyDef("craft:" + k))) s += k + ",";
  return s;
}
const WFILTER_EMPTY = {
  unowned: "未製作の装備はない。全137種コンプリート！",
  craftable: "今すぐ製作できる装備はない。素材とコインを集めよう。",
  owned: "所持している装備はまだない。まずは1つ製作しよう。",
};
function craftPanelHTML(){
  const counts = weaponFilterCounts();
  let html = `${bulkUpBarHTML(bulkUpPreview(true))}<div class="panel-intro"><b>番号が大きいほど強い</b> (実効DPS +11.5%ずつ)。</div>
  <div class="filters wfilters">${WFILTERS.map(([f, label]) => `<button class="fchip${wFilter === f ? " on" : ""}" data-wfilter="${f}">${label} <span class="wf-n" data-wfcount="${f}">${counts[f]}</span></button>`).join("")}</div>`;
  let shown = 0;
  WEAPON_TIERS.forEach((t, ti) => {
    const all = WEAPON_KEYS.filter(k => WEAPONS[k].tier === ti);
    if (!all.length) return;
    const tk = all.filter(k => weaponFilterMatch(k, wFilter));
    if (!tk.length) return;   // フィルタで該当ゼロのステージは見出しごと隠す
    shown += tk.length;
    const have = all.filter(k => state.weaponsOwned[k]).length;
    const craftable = all.filter(k => !state.weaponsOwned[k] && canBuy(buyDef("craft:" + k))).length;
    // 開閉: 未操作なら「全部そろったステージ」は畳む (装備中の武器があるステージと、絞り込み中は開く)。
    // 終盤でも一覧の先頭が STAGE 1 のままで、長いスクロールが必要だったのを解消する
    const auto = !(have === all.length && WEAPONS[state.weapon].tier !== ti) || wFilter !== "all";
    const open = tierOpen[ti] !== undefined ? tierOpen[ti] : auto;
    html += `<button type="button" class="tier-head${open ? " open" : ""}" data-tier="${ti}" aria-expanded="${open}"><span class="th-no">STAGE ${ti + 1}</span><span class="th-name">${t.name}</span><span class="th-note">${t.note}</span>${craftable ? `<span class="th-craft" title="製作できる装備">${craftable}</span>` : ""}<span class="th-count">${have}/${all.length}</span><span class="th-chev">${chevSVG}</span></button>${open ? `<div class="wgrid">${tk.map(weaponTileHTML).join("")}</div>` : ""}`;
  });
  if (!shown) html += `<p class="lo-empty">${WFILTER_EMPTY[wFilter] || "該当する装備はない。"}</p>`;
  return html;
}
