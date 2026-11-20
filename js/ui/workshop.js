"use strict";
/* =========================================================
   ui/workshop.js - 武器タブ: 装備中カード / 一括強化 / 検索・絞り込み・並び替え / 一覧
   一覧は1武器=1行。右端のボタンで「製作 / 強化」が1タップで済み、行を押すと詳細が開く。
   ========================================================= */

const tierOpen = {};   // ステージ見出しの開閉 (未操作なら自動)
let wQuery = "", wFilter = "all", wSort = "no", wSel = null;

function weaponFeatTags(w){
  const t = [];
  if (w.frost) t.push("氷結"); if (w.acid) t.push("腐食"); if (w.radiation) t.push("放射"); if (w.shock) t.push("放電");
  if (w.matBonus) t.push("素材2倍"); if (w.coinMul) t.push(`コイン x${w.coinMul}`); if (w.xpMul) t.push(`XP x${w.xpMul}`);
  if (w.ap) t.push("徹甲"); if (w.exec) t.push("処刑"); if (w.burn) t.push("燃焼"); if (w.shatter) t.push("破砕");
  return t.map(x => `<span class="ftag">${x}</span>`).join("");
}
// 武器のステータスバッジ (詳細とツールチップで共有)
function weaponStatsHTML(k, w){
  const mul = weaponPowerMul(k), cur = WEAPONS[state.weapon], tier = weaponTierMul(k);
  const dps = weaponDPS(w) * mul, rel = (w.power * mul) / (cur.power * weaponPowerMul(state.weapon));
  const cmp = k === state.weapon ? "" : rel > 1.0001 ? `<span class="sbadge up">▲ ${relUp(rel)}</span>` : `<span class="sbadge down">▼ 弱い</span>`;
  const tags = weaponFeatTags(w);
  const pel = weaponPellets(k), pelBonus = pel - (w.pellets || 1);
  return `<div class="sbadges"><span class="sbadge main">${iconSVG("damage")}DPS <b>${fmtD(dps)}</b></span>${cmp}<span class="sbadge">${iconSVG("heavy")}1発 <b>x${fmtX(w.dmg * mul)}</b></span><span class="sbadge">${iconSVG("rapid")}<b>${w.rate}</b>/秒</span><span class="sbadge${w.yield > 1 ? "" : " dim"}">${iconSVG("coin")}<b>+${Math.round((w.yield - 1) * 100)}%</b></span>${tier > 1 ? `<span class="sbadge up" title="強化Lv10ごとに威力 +50%">${iconSVG("up")}節目 <b>×${fmtX(tier)}</b></span>` : ""}${evoStar(k) ? `<span class="sbadge evo" style="--ec:${EVO_COLORS[evoStar(k)]}" title="覚醒 ★ごとに威力 +${Math.round(EVO_POWER * 100)}%">★${evoStar(k)} ${EVO_TITLE[evoStar(k)]} <b>×${fmtX(evoPowerMul(k))}</b></span>` : ""}${pel > 1 && !w.mode && !w.orb ? `<span class="sbadge${pelBonus > 0 ? " up" : ""}">${iconSVG("spread")}<b>${pel}</b>発${pelBonus > 0 ? ` (+${pelBonus})` : ""}</span>` : ""}${w.move ? `<span class="sbadge">${iconSVG("wave")}${MOVE_INFO[w.move][0]}</span>` : ""}${w.mine ? `<span class="sbadge">${iconSVG("bomber")}設置爆弾</span>` : ""}${(w.targets || 1) > 1 ? `<span class="sbadge">${iconSVG("normal")}<b>${w.targets}</b>目標</span>` : ""}${tags}</div>${w.feat ? `<div class="feat-line">${w.feat}</div>` : ""}`;
}
// 製作素材の揃い具合 (0〜100)
function recipePct(rec){
  let got = 0, tot = 0;
  for (const mk in rec){ tot += rec[mk]; got += Math.min(invOf(mk), rec[mk]); }
  return tot ? Math.floor(100 * got / tot) : 100;
}
// 「次の目標」: 今の装備より強い未所持装備のうち、作れるもの → 無ければ一番手前のもの
function pickNextKey(){
  const cur = WEAPONS[state.weapon];
  const cands = WEAPON_KEYS.filter(k => !state.weaponsOwned[k] && WEAPONS[k].power > cur.power);
  return cands.find(k => canBuy(buyDef("craft:" + k))) || cands[0] || null;
}
// 今の装備に対する強さ (所持品は強化込み)
function weaponRel(k){
  const w = WEAPONS[k], cur = WEAPONS[state.weapon];
  return (w.power * (state.weaponsOwned[k] ? weaponPowerMul(k) : 1)) / (cur.power * weaponPowerMul(state.weapon));
}
// 強さの比較表示: 10倍未満は「+35%」、それ以上は「×120」(桁が大きすぎる % は読めないので)
const relUp = rel => rel >= 10 ? "×" + fmtX(rel) : pctUp(rel);
const relHTML = rel => rel > 1.0001 ? `<span class="up">${relUp(rel)}</span>` : rel < 0.9999 ? `<span class="down">-${Math.min(99, Math.round((1 - rel) * 100))}%</span>` : "";

/* ---------- 覚醒 (★1〜★5): 強化の節目で武器が化ける (data/evolve.js) ---------- */
// 装備中カードの1行: 次の覚醒までのレベルと、その時に伸びるもの
function evoNextHTML(k){
  const s = evoStar(k), nx = evoNextLv(k), lv = weaponLvOf(k);
  if (!nx) return `<div class="evo-next max" style="--ec:${EVO_COLORS[5]}">★5「${EVO_TITLE[5]}」完全覚醒 ・ ${evoTraitsText(k, 5).join(" / ")}</div>`;
  const prev = s ? EVO_LV[s - 1] : 0, pct = Math.round((lv - prev) / (nx - prev) * 100);
  return `<div class="evo-next" style="--ec:${EVO_COLORS[s + 1]}"><span class="evo-bar"><i style="width:${pct}%"></i></span>Lv.${nx} で <b>★${s + 1}「${EVO_TITLE[s + 1]}」</b> ・ ${evoTraitsText(k, s + 1).map(t => t.split(": ")[1]).join("・")} ・ ${EVO_FX_TEXT[s + 1]}</div>`;
}
// 詳細: 覚醒の道のり (★1〜★5 の各段階で何が起きるか)
function evoRoadHTML(k){
  const s = state.weaponsOwned[k] ? evoStar(k) : 0, fams = EVO_FAM_OF[k];
  const rows = EVO_LV.map((lv, i) => {
    const st = i + 1, done = st <= s, next = st === s + 1;
    return `<li class="${done ? "done" : next ? "next" : ""}" style="--ec:${EVO_COLORS[st]}"><span class="er-lv">Lv.${lv}</span><b>★${st} ${EVO_TITLE[st]}</b><span class="er-fx">威力 ×${fmtX(1 + EVO_POWER * st)} ・ ${evoTraitsText(k, st).map(t => t.split(": ")[1]).join(" ・ ")} ・ ${EVO_FX_TEXT[st]}</span></li>`;
  }).join("");
  return `<div class="evo-road"><div class="wd-label">覚醒の道のり ・ 特性 <b>${fams.map(f => f.name).join(" + ")}</b></div><ol>${rows}</ol></div>`;
}

/* ---------- 装備中の武器カード (武器タブ・おすすめタブの先頭) ---------- */
function equippedCardHTML(){
  const k = state.weapon, w = WEAPONS[k], lv = weaponLvOf(k), d = buyDef("wupgrade:" + k);
  const tierUp = Math.floor((lv + 1) / 10) > Math.floor(lv / 10);
  return `<div class="eqcard" style="--accent:${w.accent}" data-tip="weapon:${k}">
    <div class="ar-top">${iconBadge(w.icon, w.accent)}
      <div class="ar-main"><div class="eqc-label">装備中の武器</div>
        <div class="ar-title"><span class="ar-name">${w.name}</span><span class="lv-pill">Lv.${lv}</span>${evoStarsHTML(k)}</div>
        <div class="ar-eff">DPS <b>${fmtD(weaponDPS(w) * weaponPowerMul(k))}</b> ・ ${w.tag}${tierUp ? ` ・ <span class="up">次で威力 +50%</span>` : ""}</div>
        ${evoNextHTML(k)}</div>
      ${d ? `<button class="act-btn" data-buy="wupgrade:${k}" ${canBuy(d) ? "" : "disabled"}><span class="ab-label">強化</span>${upCostSpan("wupgrade:" + k, d)}</button>` : ""}
    </div>
    ${d ? `<div class="ar-foot">${recipeChips(d.mats, true)}</div>${matSubHTML("wupgrade:" + k)}${buyReasonHTML("wupgrade:" + k)}` : ""}
  </div>`;
}

/* ---------- 一覧の絞り込み・並び替え ---------- */
const WFILTERS = [["all", "すべて"], ["craftable", "製作可"], ["owned", "所持"], ["unowned", "未所持"]];
const WSORTS = [["no", "番号順 (ステージ別)"], ["dps", "強い順"], ["osusume", "おすすめ順"]];
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
// 製作可能セットの指紋: 「作れる武器の集合」が変わった時だけ変わる (renderPanels の署名に入れる)
function craftableSig(){
  let s = "";
  for (const k of WEAPON_KEYS) if (!state.weaponsOwned[k] && canBuy(buyDef("craft:" + k))) s += k + ",";
  return s;
}
function weaponSearchText(k){
  const w = WEAPONS[k];
  return (w.no + " " + w.name + " " + w.tag + " " + (w.mat ? MAT[w.mat].name : "") + " " + Object.keys(w.recipe).map(mk => MAT[mk].name).join(" ") + " " + (w.feat || "") + " " + (w.desc || "")).toLowerCase();
}
function weaponListKeys(){
  let keys = WEAPON_KEYS.filter(k => weaponFilterMatch(k, wFilter));
  const q = wQuery.trim().toLowerCase();
  if (q) keys = keys.filter(k => weaponSearchText(k).includes(q));
  const dpsOf = k => weaponDPS(WEAPONS[k]) * (state.weaponsOwned[k] ? weaponPowerMul(k) : 1);
  if (wSort === "dps") keys.sort((a, b) => dpsOf(b) - dpsOf(a));
  else if (wSort === "osusume") keys.sort((a, b) => {
    const rank = k => state.weaponsOwned[k] ? 2 : (canBuy(buyDef("craft:" + k)) ? 0 : 1);
    const ra = rank(a), rb = rank(b);
    if (ra !== rb) return ra - rb;
    return ra === 2 ? dpsOf(b) - dpsOf(a) : WEAPONS[a].power - WEAPONS[b].power;
  });
  else keys.sort((a, b) => WEAPONS[a].no - WEAPONS[b].no);
  return keys;
}

/* ---------- 一覧の1行 + 開いたときの詳細 ---------- */
function weaponRowHTML(k){
  const w = WEAPONS[k], owned = !!state.weaponsOwned[k], eq = state.weapon === k, lv = weaponLvOf(k);
  const dCraft = owned ? null : buyDef("craft:" + k), craftable = !!dCraft && canBuy(dCraft);
  const open = wSel === k, rel = weaponRel(k);
  const holder = owned && typeof shelfHolder === "function" ? shelfHolder(k) : -1;
  let act;
  if (!owned){
    const pct = recipePct(w.recipe);
    act = craftable ? `<button class="act-btn go" data-buy="craft:${k}"><span class="ab-label">製作</span>${costHTML(dCraft.coins)}</button>`
      : `<span class="wl-prog" title="製作素材の揃い具合 (行を${TAP}でレシピ)"><i style="width:${pct}%"></i><b>素材 ${pct}%</b></span>`;
  } else {
    const d = buyDef("wupgrade:" + k);
    act = `<button class="act-btn" data-buy="wupgrade:${k}" ${canBuy(d) ? "" : "disabled"}><span class="ab-label">強化</span>${upCostSpan("wupgrade:" + k, d)}</button>`;
  }
  const pills = (eq ? `<span class="st-pill eq">装備中</span>` : "") + (holder >= 0 ? `<span class="st-pill">ボット${holder + 1}</span>` : "") + (craftable ? `<span class="st-pill go">製作可</span>` : "");
  return `<div class="wl-row${owned ? " owned" : ""}${eq ? " eq" : ""}${craftable ? " craftable" : ""}${open ? " open" : ""}" style="--accent:${w.accent}" data-wsel="${k}" data-tip="weapon:${k}" role="button" tabindex="0" aria-expanded="${open}">
    ${iconBadge(w.icon, w.accent)}
    <div class="wl-main">
      <div class="wl-name"><span class="wno">${w.no}</span><span class="wl-n">${w.name}</span>${owned ? `<span class="lv-pill">Lv.${lv}</span>${evoStar(k) ? evoStarsHTML(k, "sm") : ""}` : ""}${pills}</div>
      <div class="wl-sub">${w.tag} ・ DPS ${fmtD(weaponDPS(w) * (owned ? weaponPowerMul(k) : 1))} ${eq ? "" : relHTML(rel)}</div>
    </div>
    <div class="wl-act">${act}</div>
  </div>${open ? weaponDetailHTML(k) : ""}`;
}
function weaponDetailHTML(k){
  const w = WEAPONS[k], owned = !!state.weaponsOwned[k], eq = state.weapon === k, lv = weaponLvOf(k);
  let body;
  if (!owned){
    const d = buyDef("craft:" + k), stronger = w.power > WEAPONS[state.weapon].power;
    body = `<div class="wd-label">製作レシピ${stronger ? " ・ 作ると自動で装備する" : ""}</div>${recipeChips(w.recipe)}
      <button class="act-btn wide go" data-buy="craft:${k}" ${canBuy(d) ? "" : "disabled"}><span class="ab-label">製作する</span>${costHTML(d.coins)}</button>${buyReasonHTML("craft:" + k)}`;
  } else {
    const d = buyDef("wupgrade:" + k), tierUp = Math.floor((lv + 1) / 10) > Math.floor(lv / 10);
    body = `<div class="wd-label">強化 Lv.${lv} → ${lv + 1} ・ <span class="up">威力 +8%${tierUp ? " ・ 節目で威力 +50%!" : ""}${EVO_LV.includes(lv + 1) ? ` ・ ★${evoStarAt(lv + 1)}「${EVO_TITLE[evoStarAt(lv + 1)]}」覚醒!` : ""}</span></div>${recipeChips(d.mats, true)}${matSubHTML("wupgrade:" + k)}
      <div class="btn-row">${eq ? `<button class="act-btn ghost wide" disabled>装備中</button>` : `<button class="act-btn ghost wide" data-buy="equip:${k}">装備する</button>`}<button class="act-btn wide" data-buy="wupgrade:${k}" ${canBuy(d) ? "" : "disabled"}><span class="ab-label">強化</span>${upCostSpan("wupgrade:" + k, d)}</button></div>${buyReasonHTML("wupgrade:" + k)}`;
  }
  return `<div class="wl-detail" style="--accent:${w.accent}">${weaponStatsHTML(k, w)}${w.desc ? `<p class="wd-desc">${w.desc}</p>` : ""}${evoRoadHTML(k)}${body}</div>`;
}

const WFILTER_EMPTY = {
  unowned: "未所持の装備はない。全137種コンプリート!",
  craftable: "今すぐ製作できる装備はない。素材とコインを集めよう。",
  owned: "所持している装備はまだない。まずは1つ製作しよう。",
};
// 一覧本体 (検索の入力中はここだけ描き直す)
function weaponListHTML(){
  const keys = weaponListKeys();
  if (!keys.length) return `<p class="empty">${wQuery.trim() ? `「${escAttr(wQuery.trim())}」に一致する装備はない。` : WFILTER_EMPTY[wFilter] || "該当する装備はない。"}</p>`;
  // 番号順で検索していない時だけ、ステージ別に畳める見出しを付ける
  if (wSort !== "no" || wQuery.trim()) return `<div class="wlist">${keys.map(weaponRowHTML).join("")}</div>`;
  const set = new Set(keys);
  let html = "";
  WEAPON_TIERS.forEach((t, ti) => {
    const all = WEAPON_KEYS.filter(k => WEAPONS[k].tier === ti);
    const tk = all.filter(k => set.has(k));
    if (!tk.length) return;
    const have = all.filter(k => state.weaponsOwned[k]).length;
    const craftable = all.filter(k => !state.weaponsOwned[k] && canBuy(buyDef("craft:" + k))).length;
    // 未操作なら「全部そろったステージ」は畳む (装備中の武器があるステージと、絞り込み中は開く)
    const auto = !(have === all.length && WEAPONS[state.weapon].tier !== ti) || wFilter !== "all";
    const open = tierOpen[ti] !== undefined ? tierOpen[ti] : auto;
    html += `<button type="button" class="stage-head${open ? " open" : ""}" data-tier="${ti}" aria-expanded="${open}">
      <span class="sg-no">${ti + 1}</span><span class="sg-name">${t.name}</span><span class="sg-note">${t.note}</span>
      ${craftable ? `<span class="st-pill go">製作可 ${craftable}</span>` : ""}<span class="sg-count${have === all.length ? " done" : ""}">${have}/${all.length}</span><span class="sg-chev">${chevSVG}</span></button>
      ${open ? `<div class="wlist">${tk.map(weaponRowHTML).join("")}</div>` : ""}`;
  });
  return html;
}
function refreshWeaponList(){
  const el = $("wlistWrap"); if (!el) return;
  el.innerHTML = weaponListHTML();
}
function craftPanelHTML(){
  const counts = weaponFilterCounts();
  return `${equippedCardHTML()}
    ${bulkUpBarHTML(bulkUpPreview(true))}
    <div class="toolbar">${searchBoxHTML("wsearch", wQuery, "名前・素材・効果で検索")}
      <select id="wsort" class="sel" aria-label="並び順">${WSORTS.map(([v, l]) => `<option value="${v}"${wSort === v ? " selected" : ""}>${l}</option>`).join("")}</select></div>
    <div class="seg" role="tablist" aria-label="絞り込み">${WFILTERS.map(([f, label]) => `<button class="seg-btn${wFilter === f ? " on" : ""}" data-wfilter="${f}" role="tab" aria-selected="${wFilter === f}">${label}<span class="seg-n">${counts[f]}</span></button>`).join("")}</div>
    <div id="wlistWrap">${weaponListHTML()}</div>
    <p class="foot-hint">番号が大きいほど強い (実効DPS +11.5%ずつ)。行を${TAP}すると詳細とレシピが開く。</p>`;
}
