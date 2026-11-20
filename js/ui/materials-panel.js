"use strict";
/* =========================================================
   ui/materials-panel.js - 素材パネル (図鑑 / 所持数)
   ========================================================= */

/* ---------- 素材: 図鑑 / 所持数 ---------- */
let matCat = "all", matLayer = "all", matQuery = "", matSel = null, matOwnedOnly = false;
function matUses(k){   // この素材を使うレシピ
  const out = [];
  for (const wk of WEAPON_KEYS) if (WEAPONS[wk].recipe[k]) out.push({ name:WEAPONS[wk].name, color:WEAPONS[wk].accent, kind:"装備" });
  BOT_MATS.forEach((r, i) => { if (r[k]) out.push({ name:`攻撃ボット ${i + 1}機目`, color:"#fff", kind:"製造" }); });
  COINBOT_MATS.forEach((r, i) => { if (r[k]) out.push({ name:`回収ボット ${i + 1}機目`, color:"#ffd60a", kind:"製造" }); });
  for (const mk of CB_MOD_KEYS) if (CB_MODULES[mk].mats[k]) out.push({ name:CB_MODULES[mk].name, color:CB_MODULES[mk].accent, kind:"モジュール" });
  if (BOT_UP_MATS_LIST.includes(k)) out.push({ name:"攻撃ボット強化", color:"#fff", kind:"強化" });
  return out;
}
// ゲーム画面のブロックをクリックした時などに、素材タブでその素材を開く
function openMaterial(key){
  if (!MAT[key]) return;
  state.seen[key] = true;
  matSel = key;
  // 開いた素材が一覧から消えないよう、合わない絞り込みだけ外す
  const m = MAT[key];
  if (matCat !== "all" && matCat !== m.cat) matCat = "all";
  if (matLayer !== "all" && +matLayer !== m.layer) matLayer = "all";
  if (matOwnedOnly && invOf(key) <= 0) matOwnedOnly = false;
  if (matQuery && !matSearchText(m).includes(matQuery.trim().toLowerCase())) matQuery = "";
  setTab("items");
  $("panels").scrollTop = 0;
}
// この素材を「今すぐ」使える購入先 (武器の製作/強化、ボット製造/強化、モジュール、衛星テク)
function matUseActions(k){
  const rows = [];
  for (const wk of WEAPON_KEYS){
    const w = WEAPONS[wk];
    if (!state.weaponsOwned[wk] && w.recipe[k]) rows.push({ icon: w.icon, color: w.accent, name: w.name, kind: "武器の製作", need: w.recipe[k], buy: "craft:" + wk, label: "製作" });
    else if (state.weaponsOwned[wk]){
      const d = buyDef("wupgrade:" + wk);
      if (d && d.mats && d.mats[k]) rows.push({ icon: w.icon, color: w.accent, name: w.name, kind: "武器の強化", need: d.mats[k], buy: "wupgrade:" + wk, label: "強化", equip: wk });
    }
  }
  const botD = buyDef("bot"); if (botD && botD.mats && botD.mats[k]) rows.push({ icon: "hammer", color: "#ffffff", name: `攻撃ボット ${state.bots + 1}機目`, kind: "ボット製造", need: botD.mats[k], buy: "bot", label: "製造" });
  const cbD = buyDef("coinbot"); if (cbD && cbD.mats && cbD.mats[k]) rows.push({ icon: "coin", color: "#ffd60a", name: `回収ボット ${state.coinBots + 1}機目`, kind: "ボット製造", need: cbD.mats[k], buy: "coinbot", label: "製造" });
  const buD = buyDef("bupgrade"); if (buD && buD.mats && buD.mats[k]) rows.push({ icon: "up", color: "#ffffff", name: "攻撃ボット強化", kind: `現在 Lv.${state.botLv}`, need: buD.mats[k], buy: "bupgrade", label: "強化" });
  const bcD = buyDef("botcore"); if (bcD && bcD.mats && bcD.mats[k]) rows.push({ icon: "star", color: "#7df0ff", name: "衛星兵装コア", kind: `現在 Lv.${state.botCore || 0}`, need: bcD.mats[k], buy: "botcore", label: "強化" });
  const baD = buyDef("botarmor"); if (baD && baD.mats && baD.mats[k]) rows.push({ icon: "layers", color: "#a8c8ff", name: "衛星装甲プレート", kind: `現在 Lv.${state.botArmor || 0}`, need: baD.mats[k], buy: "botarmor", label: "強化" });
  for (const mk of CB_MOD_KEYS){
    const d = buyDef("cbmod:" + mk);
    if (d && d.mats && d.mats[k]) rows.push({ icon: CB_MODULES[mk].icon || "bag", color: CB_MODULES[mk].accent, name: CB_MODULES[mk].name, kind: `モジュール Lv.${cbLv(mk)}`, need: d.mats[k], buy: "cbmod:" + mk, label: "強化" });
  }
  return rows;
}
function matDetailHTML(m){
  const seen = !!state.seen[m.key], uses = matUses(m.key);
  const cat = MAT_CATS[m.cat];
  return `<div class="mat-detail" style="--accent:${m.color}">
    <div class="card-top"><div class="mat-swatch big cat-${m.cat}" style="--mc:${m.color}"></div>
      <div class="card-main"><div class="card-head"><h3>${seen ? m.name : "？？？"}</h3><span class="badge dim">${RARITY_NAMES[matRarity(m)]}</span></div>
      <div class="tagline" style="color:${cat.color}">${cat.name} ・ ${LAYERS[m.layer].name}${m.explosive ? " ・ 爆発性" : ""}</div></div>
      <button class="icon-btn sm" data-matclose aria-label="閉じる">${iconSVG("close")}</button></div>
    <p class="md-note">${seen ? (m.note || `${LAYERS[m.layer].name}で見つかる${cat.name}。`) : `まだ見つけていない。${LAYERS[m.layer].name}を掘ると出てくるはず。`}</p>
    <div class="md-stats"><span>所持 <b data-invcount="${m.key}">${fmt(invOf(m.key))}</b></span><span>硬さ <b>x${m.hard}</b></span><span>コイン <b>x${m.coin}</b></span>${m.xp > 1 ? `<span>経験値 <b>x${m.xp}</b></span>` : ""}</div>
    ${(() => {
      const rows = matUseActions(m.key), have = invOf(m.key);
      const covered = new Set(rows.map(r => r.name));
      const others = uses.filter(u => !covered.has(u.name));
      let out = "";
      if (rows.length) out += `<div class="recipe-head">使い道 — そのまま使える</div>` + rows.map(u => {
        const d = buyDef(u.buy), ok = canBuy(d);
        return `<div class="use-row" style="--accent:${u.color}">${iconBadge(u.icon, u.color)}<div class="ur-main"><div class="ur-name">${u.name}</div><div class="ur-sub">${u.kind} ・ ${m.name} x${u.need}</div></div><span class="ur-need${have >= u.need ? "" : " lack"}">所持 ${fmt(have)}</span>${u.equip && state.weapon !== u.equip ? `<button class="act-btn ghost" data-buy="equip:${u.equip}">装備</button>` : ""}<button class="act-btn" data-buy="${u.buy}" ${ok ? "" : "disabled"}><span class="ab-label">${u.label}</span>${u.buy.startsWith("wupgrade:") ? upCostSpan(u.buy, d) : costHTML(d ? d.coins : 0)}</button></div>`;
      }).join("");
      if (others.length) out += `<div class="recipe-head">その他の使い道</div><div class="uses">${others.map(u => `<span class="use-chip" style="--mc:${u.color}"><i></i>${u.name}<em>${u.kind}</em></span>`).join("")}</div>`;
      return out || `<div class="sub">使い道: なし (売ることはできないが、集める楽しみはある)</div>`;
    })()}
  </div>`;
}
const matSearchText = m => (state.seen[m.key] ? m.name + " " + (m.note || "") : "") + " " + MAT_CATS[m.cat].name + " " + LAYERS[m.layer].name;
function matListKeys(){
  const q = matQuery.trim().toLowerCase();
  return MATS.filter(m => (matCat === "all" || matCat === m.cat) && (matLayer === "all" || +matLayer === m.layer)
    && (!matOwnedOnly || invOf(m.key) > 0) && (!q || matSearchText(m).toLowerCase().includes(q)));
}
function matGridHTML(){
  const list = matListKeys();
  if (!list.length) return `<p class="empty">条件に合う素材はない。絞り込みを外してみよう。</p>`;
  return `<div class="mat-grid">` + list.map(m => {
    const seen = !!state.seen[m.key], n = invOf(m.key);
    return `<button class="mat-tile${seen ? "" : " unknown"}${matSel === m.key ? " sel" : ""}${seen && n <= 0 ? " zero" : ""}" data-mat-tile="${m.key}" title="${seen ? m.name : "？？？"} ・ ${LAYERS[m.layer].name}">
      <span class="mat-swatch cat-${m.cat}" style="--mc:${seen ? m.color : "#333"}"></span>
      <span class="mt-name">${seen ? m.name : "？？？"}</span>
      <span class="mt-count" data-invcount="${m.key}">${seen ? fmt(n) : ""}</span></button>`;
  }).join("") + `</div>`;
}
function refreshMatGrid(){ const el = $("mgridWrap"); if (el) el.innerHTML = matGridHTML(); }
function itemsPanelHTML(){
  const found = MATS.filter(m => state.seen[m.key]).length;
  const here = LAYERS[Math.max(0, layerIndexOf(blockDepth(w2g(player.x), w2g(player.y))))].name;
  const filtered = matCat !== "all" || matLayer !== "all" || matOwnedOnly || matQuery.trim();
  let html = `<div class="kpis">
      <div class="kpi"><em>発見</em><b>${found}<small>/${MATS.length}</small></b></div>
      <div class="kpi"><em>所持合計</em><b>${fmt(Object.values(state.inv).reduce((s, v) => s + v, 0))}</b></div>
      <div class="kpi"><em>採掘倍率</em><b>x${fmtX(matDropMul())}</b></div>
      <div class="kpi"><em>いまの地層</em><b>${here}</b></div>
    </div>`;
  if (matSel && MAT[matSel]) html += matDetailHTML(MAT[matSel]);
  html += `<div class="toolbar">${searchBoxHTML("msearch", matQuery, "素材名で検索")}</div>
    <div class="toolbar">
      <select id="mcat" class="sel grow" aria-label="種類で絞り込み"><option value="all">種類: すべて</option>${MAT_CAT_KEYS.map(c => `<option value="${c}"${matCat === c ? " selected" : ""}>${MAT_CATS[c].name}</option>`).join("")}</select>
      <select id="mlayer" class="sel grow" aria-label="地層で絞り込み"><option value="all">地層: すべて</option>${LAYERS.map((L, i) => `<option value="${i}"${matLayer === String(i) ? " selected" : ""}>${L.name}</option>`).join("")}</select>
      <button class="tog${matOwnedOnly ? " on" : ""}" data-mowned aria-pressed="${matOwnedOnly}">所持のみ</button>
      ${filtered ? `<button class="tog ghost" data-mreset title="絞り込みを全て外す">${iconSVG("close")}</button>` : ""}
    </div>
    <div id="mgridWrap">${matGridHTML()}</div>
    <p class="foot-hint">ゲーム画面のブロックを${TAP}すると、その素材の詳細と使い道がここに開く。</p>`;
  return html;
}
