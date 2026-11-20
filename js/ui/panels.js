"use strict";
/* =========================================================
   ui/panels.js - 右パネルの描画・購入処理・一括強化・ボット編成のイベント
   ========================================================= */

/* ---------- 共通部品 ---------- */
function crewToggleHTML(key){
  if (!(state[key] > 0)) return "";
  const on = !state.off[key];
  return `<div class="crew-toggle${on ? "" : " is-off"}"><span>${on ? "稼働中" : "停止中"}</span>
    <label class="switch"><input type="checkbox" data-crew="${key}" ${on ? "checked" : ""}><span class="slider"></span></label></div>`;
}

/* ---------- 装備バー: 現在の装備を WORKSHOP 上部に小さく表示 (その場で強化できる) ---------- */
let lastEquipHTML = "";
function equipBarHTML(){
  const k = state.weapon, w = WEAPONS[k], lv = weaponLvOf(k), d = buyDef("wupgrade:" + k);
  return `<div class="equip-bar" style="--accent:${w.accent}" data-tip="weapon:${k}">
    <span class="icon-badge sm" style="color:${w.accent};border-color:${w.accent};background:${w.accent}14">${iconSVG(w.icon)}</span>
    <div class="eb-main"><div class="eb-name">${w.name}${lv > 0 ? ` <span class="eb-lv">Lv.${lv}</span>` : ""}</div>
    <div class="eb-sub">DPS <b>${fmtD(weaponDPS(w) * weaponPowerMul(k))}</b> ・ ${w.tag}</div></div>
    <button class="buy-btn sm" data-buy="wupgrade:${k}" ${d && canBuy(d) ? "" : "disabled"}><span>強化</span>${upCostSpan("wupgrade:" + k, d)}</button>
  </div>
  <div class="equip-mats">${d ? recipeChips(d.mats, true) + matSubHTML("wupgrade:" + k) : ""}</div>`;
}
$("equipBar").addEventListener("click", e => {
  const btn = e.target.closest("[data-buy]"); if (!btn || btn.disabled) return;
  doBuy(btn.dataset.buy);
});

/* ---------- panels ---------- */
let activeTab = "craft";
const PANEL_HTML = { craft:craftPanelHTML, bot:botPanelHTML, coinbot:coinBotPanelHTML, items:itemsPanelHTML };
const panelDirty = { craft:true, bot:true, coinbot:true, items:true };
let lastPanelSig = "";
let panelPointerDown = false, pendingPanelRender = false;
function renderPanels(force){
  if (!force && panelPointerDown){ pendingPanelRender = true; return; }
  // コイン残高・素材の所持数は署名に入れない (変わるたび全再構築するとボタンがチカチカして押せなくなる)。
  // 残高依存の表示は refreshAffordability() が DOM を作り替えずに更新する。
  const sig = [state.weapon, JSON.stringify(state.weaponsOwned), JSON.stringify(state.weaponLv), state.bots, state.coinBots, state.botLv,
    JSON.stringify(state.botLoadout), JSON.stringify(state.cbMod), JSON.stringify(state.off), state.lv, Object.keys(state.skills).length, Object.keys(state.seen).length,
    botSlotSel, matFilter, matSel, matOwnedOnly, JSON.stringify(tierOpen), wQuery, wFilter, wSort, wGroup, wSel, state.botMode, state.cbMode, craftableSig()].join("|");
  if (sig !== lastPanelSig){ lastPanelSig = sig; for (const k in panelDirty) panelDirty[k] = true; }
  else if (!force && !panelDirty[activeTab]) return;
  if (force) for (const k in panelDirty) panelDirty[k] = true;
  const el = $("panel-" + activeTab);
  const scrollTop = $("panels").scrollTop;
  el.innerHTML = PANEL_HTML[activeTab]();
  $("panels").scrollTop = scrollTop;
  panelDirty[activeTab] = false;
  updateAffordDots();
  affordCoins = state.coins; affordInv = invVersion;
  // --- header stats ---
  $("statDmg").textContent = fmtD(playerDamage() * globalDmgMul());
  $("statDps").textContent = fmt(totalDPS() * globalDmgMul());
  $("statCrew").textContent = botCount() + coinBotCount();
  $("statTotalCoins").textContent = fmt(state.totalCoins);
  const ebHtml = equipBarHTML();
  if (ebHtml !== lastEquipHTML){ lastEquipHTML = ebHtml; $("equipBar").innerHTML = ebHtml; }
}

/* ---------- affordability: 残高・素材だけが変わった時は DOM を作り替えない ---------- */
let invVersion = 0;   // 素材の所持数が変わるたびに増える (materials.js の invAdd / invTake から)
function updateAffordDots(){
  const afford = {
    craft: WEAPON_KEYS.some(k => canCraft(k)),
    bot:   canBuy(buyDef("bot")) || canBuy(buyDef("bupgrade")),
    coinbot: canBuy(buyDef("coinbot")) || CB_MOD_KEYS.some(k => canBuy(buyDef("cbmod:" + k))),
    items: false,
  };
  document.querySelectorAll("#tabs button").forEach(t => t.classList.toggle("has-afford", !!afford[t.dataset.tab]));
  const ms = $("mShop");   // スマホの「工房」ボタンにも同じ印を出す
  if (ms) ms.classList.toggle("has-afford", afford.craft || afford.bot || afford.coinbot);
}
let affordCoins = NaN, affordInv = -1;
function refreshAffordability(){
  if (state.coins === affordCoins && invVersion === affordInv) return;
  affordCoins = state.coins; affordInv = invVersion;
  for (const root of [$("panel-" + activeTab), $("equipBar")]){
    root.querySelectorAll("[data-buy]").forEach(btn => {
      const d = buyDef(btn.dataset.buy);
      if (d) btn.disabled = !canBuy(d);
      // 買えるタイルは光らせて「次に買うべきもの」を示す (ボット系タイルのみ)
      const tile = btn.closest(".btile");
      if (tile) tile.classList.toggle("afford", canBuy(d));
    });
    root.querySelectorAll("[data-bulk]").forEach(btn => {
      const d = buyDef(btn.dataset.bulk);
      btn.disabled = !canBuy(d);
    });
    root.querySelectorAll("[data-buyreason]").forEach(el => {
      const t = buyReason(el.dataset.buyreason);
      if (el._t !== t){ el._t = t; el.textContent = t; }
    });
    root.querySelectorAll("[data-matsub]").forEach(el => {
      const t = matSubText(matSubPlanFor(buyDef(el.dataset.matsub)));
      if (el._t !== t){ el._t = t; el.textContent = t; }
    });
    root.querySelectorAll("[data-upcost]").forEach(el => {
      const h = upCostHTML(buyDef(el.dataset.upcost));
      if (el._h !== h){ el._h = h; el.innerHTML = h; }
    });
    root.querySelectorAll("[data-bulkup]").forEach(btn => {
      const pv = bulkUpPreview(false);
      btn.disabled = !pv.total;
      const n = btn.querySelector("[data-bulkup-n]");
      if (n){ const t = pv.total ? "×" + fmt(pv.total) : ""; if (n._t !== t){ n._t = t; n.textContent = t; } }
    });
    root.querySelectorAll("[data-bulkup-sub]").forEach(el => {
      const t = bulkUpSubText(bulkUpPreview(false));
      if (el._t !== t){ el._t = t; el.textContent = t; }
    });
    root.querySelectorAll(".mat-chip[data-mat]").forEach(ch => {
      const have = invOf(ch.dataset.mat), need = +ch.dataset.need;
      ch.classList.toggle("ok", have >= need); ch.classList.toggle("lack", have < need);
    });
    root.querySelectorAll("[data-invcount]").forEach(el => { const t = fmt(invOf(el.dataset.invcount)); if (el._t !== t){ el._t = t; el.textContent = t; } });
  }
  updateAffordDots();
}
$("panels").addEventListener("pointerdown", () => { panelPointerDown = true; });
window.addEventListener("pointerup", () => {
  panelPointerDown = false;
  if (pendingPanelRender){ pendingPanelRender = false; renderPanels(true); }
});

/* ---------- tabs ---------- */
document.querySelectorAll("#tabs button").forEach(b => b.addEventListener("click", () => {
  activeTab = b.dataset.tab;
  document.querySelectorAll("#tabs button").forEach(x => x.classList.toggle("active", x === b));
  document.querySelectorAll(".panel").forEach(p => p.classList.toggle("active", p.id === "panel-" + activeTab));
  renderPanels(true);
}));

/* ---------- 購入 / 製作 / 強化 ---------- */
// 直近の購入で素材代用払いした内訳 (購入フィードバック表示用)
let lastMatSubPlan = null;
// 検証済みの1回分を適用するだけ (保存・再描画・音はしない)。まとめ買いはこれを繰り返す
// 武器強化は呼び出しのたびに matSubPlan を引き直すので、まとめ買いでも素材の減り方が正しく反映される
function applyBuy(dataBuy){
  const d = buyDef(dataBuy);
  if (!canBuy(d)) return false;
  const before = state.coins;
  lastMatSubPlan = matSubPlanFor(d);
  if (lastMatSubPlan){
    state.coins -= lastMatSubPlan.coinsPay;                 // 不足分だけコインで払う
    if (d.mats) invTake(d.mats);                            // 要求素材 (代用プールから除外済み)
    if (lastMatSubPlan.subTotal > 0){ const subRec = {}; for (const s of lastMatSubPlan.subs) subRec[s.k] = s.n; invTake(subRec); }
  } else {
    state.coins -= d.coins;
    if (d.mats) invTake(d.mats);
  }
  if (d.mats && sk("e_recycle")) for (const k in d.mats) if (Math.random() < 0.2) invAdd(k, Math.ceil(d.mats[k] / 2));   // 廃材リサイクル
  d.apply();
  if (sk("c_cashback") && state.coins < before) state.coins += Math.floor((before - state.coins) * (sk("c_cash2") ? 0.25 : 0.10));   // キャッシュバック
  if (dataBuy.startsWith("craft:")) wSel = dataBuy.slice(6);
  return true;
}
function doBuy(dataBuy){
  if (!applyBuy(dataBuy)){ sndFail(); return false; }
  if (lastMatSubPlan && lastMatSubPlan.subTotal > 0) toast(`製作素材払い ${fmt(lastMatSubPlan.subTotal)} コイン分で強化した`);
  sndBuy(); save(); renderPanels(true); updateHUD();
  return true;
}
// まとめ買い: 既存の単発購入を、払える分だけ (上限 maxN 回) 繰り返す。コスト計算は単発と完全に同じ
const BULK_LABEL = { bot:"攻撃ボット製造", coinbot:"回収ボット製造", bupgrade:"攻撃ボット強化", botcore:"衛星兵装コア", botarmor:"衛星装甲プレート" };
function bulkLabel(dataBuy){
  if (dataBuy.startsWith("cbmod:")) return CB_MODULES[dataBuy.slice(6)].name;
  return BULK_LABEL[dataBuy] || dataBuy;
}
function doBuyBulk(dataBuy, maxN){
  let n = 0;
  while (n < maxN && applyBuy(dataBuy)) n++;
  if (!n){ sndFail(); return 0; }
  sndBuy(); save(); renderPanels(true); updateHUD();
  toast(`${bulkLabel(dataBuy)} ×${n}`);
  return n;
}
/* ---------- 工房: 一括強化 (強い順) ----------
   所持武器を現在の実効DPS (装備バーの表示と同じ weaponDPS × weaponPowerMul) 降順に並べ、
   先頭から順に「買える間は繰り返し買う」単一パスでまとめて強化する。製作はしない (強化のみ)。
   順番は開始時点のDPSで固定し、途中で再ソートしない (予測可能な挙動にする)。
   支払いは既存の applyBuy をそのまま使うので、製作素材払い (matSubPlan) も自動で効く */
const BULKUP_MAX = 10000;   // 無限ループ防止の総強化回数上限
function bulkUpOrder(){
  return WEAPON_KEYS.filter(k => state.weaponsOwned[k])
    .sort((a, b) => weaponDPS(WEAPONS[b]) * weaponPowerMul(b) - weaponDPS(WEAPONS[a]) * weaponPowerMul(a) || WEAPONS[a].no - WEAPONS[b].no);
}
function bulkUpPass(){
  const order = bulkUpOrder();
  const lv0 = {}; for (const k of order) lv0[k] = weaponLvOf(k);
  let total = 0, capped = false;
  for (const k of order){
    while (total < BULKUP_MAX && applyBuy("wupgrade:" + k)) total++;
    if (total >= BULKUP_MAX){ capped = true; break; }
  }
  const ups = [];
  for (const k of order){ const from = lv0[k], to = weaponLvOf(k); if (to > from) ups.push({ k, from, to, n: to - from }); }
  let top = null; for (const u of ups) if (!top || u.n > top.n) top = u;
  return { total, kinds: ups.length, ups, top, capped };
}
// 見込み回数の事前計算: 状態 (コイン・素材・武器Lv) を退避して実パスを試し、そっくり元に戻す。
// 実処理と同じ applyBuy を通すので、表示する回数は実行結果と一致する
let bulkUpCache = { res: null, coins: NaN, inv: -1, lvKey: "", skN: -1, at: 0 };
function bulkUpPreview(force){
  if (!force && bulkUpCache.res){
    if (bulkUpCache.coins === state.coins && bulkUpCache.inv === invVersion &&
        bulkUpCache.lvKey === JSON.stringify(state.weaponLv) && bulkUpCache.skN === Object.keys(state.skills).length) return bulkUpCache.res;
    if (Date.now() - bulkUpCache.at < 200) return bulkUpCache.res;   // 残高が頻繁に変わる場面では再計算を間引く
  }
  const snap = { coins: state.coins, inv: Object.assign({}, state.inv), lv: Object.assign({}, state.weaponLv), plan: lastMatSubPlan };
  const res = bulkUpPass();
  state.coins = snap.coins;
  for (const k in state.inv) if (!(k in snap.inv)) delete state.inv[k];
  Object.assign(state.inv, snap.inv);
  for (const k in state.weaponLv) if (!(k in snap.lv)) delete state.weaponLv[k];
  Object.assign(state.weaponLv, snap.lv);
  lastMatSubPlan = snap.plan;
  bulkUpCache = { res, coins: state.coins, inv: invVersion, lvKey: JSON.stringify(state.weaponLv), skN: Object.keys(state.skills).length, at: Date.now() };
  return res;
}
const bulkUpSubText = pv => pv.total ? `強い武器から順に ${fmt(pv.total)} 回ぶん強化できる` : "今は強化できる武器がない (コイン・素材を確認)";
function bulkUpBarHTML(pv){
  return `<div class="bulkup-bar"><button class="bulkup-btn" data-bulkup ${pv.total ? "" : "disabled"} title="所持武器を現在のDPSが強い順に並べ、買えるだけまとめて強化する (製作素材払いも自動で適用)"><span class="bulkup-label">${iconSVG("up")}一括強化 (強い順)</span><span class="bulkup-n" data-bulkup-n>${pv.total ? "×" + fmt(pv.total) : ""}</span></button><div class="bulkup-sub" data-bulkup-sub>${bulkUpSubText(pv)}</div></div>`;
}
function doBulkUpgrade(){
  const res = bulkUpPass();
  if (!res.total){ sndFail(); return res; }
  sndBuy(); save(); renderPanels(true); updateHUD();
  const t = res.top;
  toast(`一括強化: ${fmt(res.total)}回 (${res.kinds}種) / 最多: ${WEAPONS[t.k].name} Lv${t.from}→Lv${t.to}${res.capped ? " (上限で停止)" : ""}`);
  return res;
}
$("panels").addEventListener("click", e => {
  const b = e.target.closest("[data-bulkup]"); if (!b || b.disabled) return;
  doBulkUpgrade();
});

// 繰り返し買えるタイルに付ける「×10 / 最大まで」のボタン行
function bulkRowHTML(dataBuy){
  const dis = canBuy(buyDef(dataBuy)) ? "" : "disabled";
  return `<span class="wt-act bulk-row"><button class="wr-btn bulk" data-bulk="${dataBuy}" data-bulkn="10" ${dis} title="買える分だけ最大10回まとめて購入">×10 まとめて</button><button class="wr-btn bulk" data-bulk="${dataBuy}" data-bulkn="max" ${dis} title="払える限り・上限までまとめて購入">最大まで</button></span>`;
}
$("panels").addEventListener("click", e => {
  const btn = e.target.closest("[data-buy]"); if (!btn || btn.disabled) return;
  doBuy(btn.dataset.buy);
});
$("panels").addEventListener("click", e => {
  const b = e.target.closest("[data-bulk]"); if (!b || b.disabled) return;
  doBuyBulk(b.dataset.bulk, b.dataset.bulkn === "max" ? 100000 : +b.dataset.bulkn);
});
$("panels").addEventListener("click", e => {
  if (e.target.closest("[data-boteq-open]")) openBotEq();
});

/* ---------- 工房: ステージ見出しの開閉 ---------- */
$("panels").addEventListener("click", e => {
  const th = e.target.closest("[data-tier]");
  if (th){ const t = +th.dataset.tier; tierOpen[t] = !th.classList.contains("open"); renderPanels(true); }
});

/* ---------- ボット: 作戦モードの切り替え ---------- */
$("panels").addEventListener("click", e => {
  const bm = e.target.closest("[data-bmode]");
  if (bm){ state.botMode = bm.dataset.bmode; for (const b of bots) b.exploreSat = undefined; save(); renderPanels(true); return; }
  const cm = e.target.closest("[data-cbmode]");
  if (cm){ state.cbMode = cm.dataset.cbmode; save(); renderPanels(true); return; }
});

/* ---------- 工房: 武器ブラウザの操作 ---------- */
$("panels").addEventListener("click", e => {
  const f = e.target.closest("[data-wfilter]"); if (f){ wFilter = f.dataset.wfilter; renderPanels(true); return; }
  const so = e.target.closest("[data-wsort]"); if (so){ wSort = so.dataset.wsort; renderPanels(true); return; }
  if (e.target.closest("[data-wgroup]")){ wGroup = !wGroup; renderPanels(true); return; }
  const sel = e.target.closest("[data-wsel]"); if (sel){ wSel = sel.dataset.wsel; renderPanels(true); return; }
});
$("panels").addEventListener("input", e => {
  if (e.target.id !== "wsearch") return;
  wQuery = e.target.value;
  renderPanels(true);
  const inp = $("wsearch");
  if (inp){ inp.focus(); const v = inp.value; try { inp.setSelectionRange(v.length, v.length); } catch(err){} }
});

/* ---------- 攻撃ボットの編成: クリック / ドラッグ&ドロップ (装備モーダル内。処理はパネルと共有) ---------- */
function assignBot(i, k){
  if (k) { if (!state.weaponsOwned[k] || k === state.weapon) return; setBotWeapon(i, k); }
  else setBotWeapon(i, null);
  if (k && botEqOpen) eqFlash = { i, k };   // 装備した瞬間のフィードバック (モーダル内で光る + ガイド表示)
  botSlotSel = -1; sndBuy(); save(); refreshBotViews(); updateHUD();
}
function loadoutClick(e){
  const so = e.target.closest("[data-shelfsort]");
  if (so){ shelfSort = so.dataset.shelfsort; renderBotEq(); return; }
  if (e.target.closest("[data-shelffree]")){ shelfFreeOnly = !shelfFreeOnly; renderBotEq(); return; }
  const un = e.target.closest("[data-unequip]");
  if (un){ assignBot(+un.dataset.unequip, null); return; }
  const slot = e.target.closest("[data-slot]");
  if (slot){ const i = +slot.dataset.slot; botSlotSel = botSlotSel === i ? -1 : i; refreshBotViews(); return; }
  const chip = e.target.closest("[data-shelf]");
  if (chip){
    const k = chip.dataset.shelf;
    let i = botSlotSel;
    if (i < 0){   // スロット未選択: 空きスロット → 最も弱いスロット
      const total = botCount(); i = -1;
      for (let j = 0; j < total; j++) if (!botWeaponAt(j)){ i = j; break; }
      if (i < 0){ let worst = Infinity; for (let j = 0; j < total; j++){ const d = botSlotDPS(j); if (d < worst){ worst = d; i = j; } } }
    }
    if (i >= 0) assignBot(i, k);
    return;
  }
  if (e.target.closest("[data-bauto]")){
    const def = botDefaultDPS();
    const cand = WEAPON_KEYS.filter(k => state.weaponsOwned[k] && k !== state.weapon && botWeaponDPS(k) > def).sort((a, b) => botWeaponDPS(b) - botWeaponDPS(a));
    for (let i = 0; i < botCount(); i++) setBotWeapon(i, cand[i] || null);
    botSlotSel = -1; sndBuy(); save(); refreshBotViews(); updateHUD(); return;
  }
  if (e.target.closest("[data-bclear]")){
    for (let i = 0; i < state.botLoadout.length; i++) state.botLoadout[i] = null;
    botSlotSel = -1; sndBuy(); save(); refreshBotViews(); updateHUD();
  }
}
$("panels").addEventListener("click", loadoutClick);
$("botEqOverlay").addEventListener("click", loadoutClick);
let dragKey = null;
function loadoutDragStart(e){
  const chip = e.target.closest("[data-shelf]"); if (!chip) return;
  dragKey = chip.dataset.shelf; chip.classList.add("dragging"); tipDragging = true; hideTip();
  try { e.dataTransfer.setData("text/plain", dragKey); e.dataTransfer.effectAllowed = "move"; } catch(err){}
  $("panel-bot").classList.add("drag-on"); $("botEqOverlay").classList.add("drag-on");
}
function loadoutDragEnd(){
  dragKey = null; tipDragging = false; $("panel-bot").classList.remove("drag-on"); $("botEqOverlay").classList.remove("drag-on");
  document.querySelectorAll(".btile.dragging").forEach(c => c.classList.remove("dragging"));
  document.querySelectorAll(".btile.over").forEach(s => s.classList.remove("over"));
}
function loadoutDragOver(e){
  const slot = e.target.closest("[data-slot]");
  if (slot && dragKey){ e.preventDefault(); e.dataTransfer.dropEffect = "move"; slot.classList.add("over"); }
}
function loadoutDragLeave(e){ const slot = e.target.closest("[data-slot]"); if (slot) slot.classList.remove("over"); }
function loadoutDrop(e){
  const slot = e.target.closest("[data-slot]"); if (!slot) return;
  e.preventDefault();
  const k = dragKey || (e.dataTransfer && e.dataTransfer.getData("text/plain"));
  if (k) assignBot(+slot.dataset.slot, k);
}
for (const root of [$("panels"), $("botEqOverlay")]){
  root.addEventListener("dragstart", loadoutDragStart);
  root.addEventListener("dragend", loadoutDragEnd);
  root.addEventListener("dragover", loadoutDragOver);
  root.addEventListener("dragleave", loadoutDragLeave);
  root.addEventListener("drop", loadoutDrop);
}

/* ---------- 素材タブ ---------- */
$("panels").addEventListener("click", e => {
  const f = e.target.closest("[data-mfilter]");
  if (f){ matFilter = f.dataset.mfilter; renderPanels(true); return; }
  if (e.target.closest("[data-mowned]")){ matOwnedOnly = !matOwnedOnly; renderPanels(true); return; }
  const t = e.target.closest("[data-mat-tile]");
  if (t){ matSel = matSel === t.dataset.matTile ? null : t.dataset.matTile; renderPanels(true); $("panels").scrollTop = 0; return; }
  if (e.target.closest("[data-matclose]")){ matSel = null; renderPanels(true); }
});

/* ---------- 仲間の稼働 ON/OFF ---------- */
const CREW_SYNC = { bots:() => syncBots(), coinBots:() => syncCoinBots() };
$("panels").addEventListener("change", e => {
  const t = e.target.closest("[data-crew]"); if (!t) return;
  const k = t.dataset.crew;
  if (t.checked) delete state.off[k]; else state.off[k] = true;
  if (CREW_SYNC[k]) CREW_SYNC[k]();
  sndBuy(); save(); renderPanels(true); updateHUD();
});
