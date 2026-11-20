"use strict";
/* =========================================================
   ui/panels.js - 右サイドバーの描画・タブ・購入処理・一括強化・ボット編成のイベント
   ========================================================= */

/* ---------- タブ ---------- */
const PANEL_HTML = { home:homePanelHTML, craft:craftPanelHTML, bot:botPanelHTML, coinbot:coinBotPanelHTML, items:itemsPanelHTML };
const panelDirty = { home:true, craft:true, bot:true, coinbot:true, items:true };
// 最後に開いていたタブとスクロール位置は端末ごとに覚えておく (無くても動く)
const TAB_KEY = "bs.sideTab";
let activeTab = (() => { try { return localStorage.getItem(TAB_KEY) || "home"; } catch(e){ return "home"; } })();
if (!PANEL_HTML[activeTab]) activeTab = "home";
const tabScroll = {};
function syncTabUI(){
  document.querySelectorAll("#tabs button").forEach(x => { const on = x.dataset.tab === activeTab; x.classList.toggle("active", on); x.setAttribute("aria-selected", on); });
  document.querySelectorAll(".panel").forEach(p => p.classList.toggle("active", p.id === "panel-" + activeTab));
}
function setTab(t){
  if (!PANEL_HTML[t]) return;
  if (t !== activeTab) tabScroll[activeTab] = $("panels").scrollTop;
  activeTab = t;
  try { localStorage.setItem(TAB_KEY, t); } catch(e){}
  syncTabUI();
  hideTip();
  renderPanels(true);
  $("panels").scrollTop = tabScroll[t] || 0;
}
syncTabUI();
document.querySelectorAll("#tabs button").forEach(b => b.addEventListener("click", () => {
  if (b.dataset.tab === activeTab){ $("panels").scrollTo({ top:0, behavior:"smooth" }); return; }   // 同じタブをもう一度押すと先頭へ
  setTab(b.dataset.tab);
}));

/* ---------- 描画 ---------- */
let lastPanelSig = "";
let panelPointerDown = false, pendingPanelRender = false, imeComposing = false;
function renderPanels(force){
  if (!force && (panelPointerDown || imeComposing)){ pendingPanelRender = true; return; }
  // コイン残高・素材の所持数は署名に入れない (変わるたび全再構築するとボタンがチカチカして押せなくなる)。
  // 残高依存の表示は refreshAffordability() が DOM を作り替えずに更新する。
  // 「買える物の集合」が変わった時だけ描き直す (craftableSig / homeSig)
  const sig = [state.weapon, JSON.stringify(state.weaponsOwned), JSON.stringify(state.weaponLv), state.bots, state.coinBots, state.botLv, state.botCore, state.botArmor,
    JSON.stringify(state.botLoadout), JSON.stringify(state.cbMod), JSON.stringify(state.off), state.lv, Object.keys(state.skills).length, Object.keys(state.seen).length,
    botSlotSel, matCat, matLayer, matSel, matOwnedOnly, JSON.stringify(tierOpen), wFilter, wSort, wSel, state.botMode, state.cbMode, craftableSig(), homeSig()].join("|");
  if (sig !== lastPanelSig){ lastPanelSig = sig; for (const k in panelDirty) panelDirty[k] = true; }
  else if (!force && !panelDirty[activeTab]) { updateHeaderStats(); return; }
  if (force) for (const k in panelDirty) panelDirty[k] = true;
  const el = $("panel-" + activeTab);
  // 描き直しても、検索欄などのフォーカスとカーソル位置は保つ
  const ae = document.activeElement, focusId = ae && ae.id && el.contains(ae) ? ae.id : null;
  let selS = null, selE = null; if (focusId){ try { selS = ae.selectionStart; selE = ae.selectionEnd; } catch(err){} }
  const scrollTop = $("panels").scrollTop;
  el.innerHTML = PANEL_HTML[activeTab]();
  $("panels").scrollTop = scrollTop;
  if (focusId){ const n = $(focusId); if (n){ n.focus({ preventScroll:true }); if (selS !== null) try { n.setSelectionRange(selS, selE); } catch(err){} } }
  panelDirty[activeTab] = false;
  updateTabBadges();
  affordCoins = state.coins; affordInv = invVersion;
  updateHeaderStats();
}
function updateHeaderStats(){
  setText($("statDmg"), fmtD(playerDamage() * globalDmgMul()));
  setText($("statDps"), fmt(totalDPS() * globalDmgMul()));
  setText($("statCrew"), String(botCount() + coinBotCount()));
  setText($("statTotalCoins"), fmt(state.totalCoins));
}

/* ---------- タブの件数バッジ: 「今買えるもの」の数 ---------- */
function updateTabBadges(){
  const r = homeReady();
  const isBot = b => b === "bot" || b === "bupgrade" || b === "botcore" || b === "botarmor";
  const n = {
    home: r.craft.length + r.crew.length + (r.equip ? 1 : 0),
    craft: r.craft.length,
    bot: r.crew.filter(isBot).length,
    coinbot: r.crew.filter(b => !isBot(b)).length,
    items: 0,
  };
  document.querySelectorAll("#tabs button").forEach(t => {
    const c = n[t.dataset.tab] || 0, b = t.querySelector(".tab-badge");
    if (b){ const s = c ? (c > 99 ? "99+" : String(c)) : ""; if (b._t !== s){ b._t = s; b.textContent = s; } }
    t.classList.toggle("has-afford", c > 0);
  });
  const ms = $("mShop");   // スマホの「工房」ボタンにも同じ印を出す
  if (ms) ms.classList.toggle("has-afford", n.home > 0);
}
const updateAffordDots = updateTabBadges;   // 旧名 (他ファイル互換)

/* ---------- affordability: 残高・素材だけが変わった時は DOM を作り替えない ---------- */
let invVersion = 0;   // 素材の所持数が変わるたびに増える (materials.js の invAdd / invTake から)
let affordCoins = NaN, affordInv = -1;
function refreshAffordability(){
  if (state.coins === affordCoins && invVersion === affordInv) return;
  affordCoins = state.coins; affordInv = invVersion;
  const root = $("panel-" + activeTab);
  root.querySelectorAll("[data-buy]").forEach(btn => {
    const d = buyDef(btn.dataset.buy);
    const ok = !!d && canBuy(d);
    if (d && btn.dataset.buy.indexOf("equip:") !== 0) btn.disabled = !ok;
    const row = btn.closest(".arow");   // 今買える行は光らせて「次に押すもの」を示す
    if (row && row.querySelector(".act-btn") === btn) row.classList.toggle("afford", ok);
  });
  root.querySelectorAll("[data-bulk]").forEach(btn => { btn.disabled = !canBuy(buyDef(btn.dataset.bulk)); });
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
  updateTabBadges();
}
$("panels").addEventListener("pointerdown", () => { panelPointerDown = true; });
window.addEventListener("pointerup", () => {
  panelPointerDown = false;
  if (pendingPanelRender && !imeComposing){ pendingPanelRender = false; renderPanels(true); }
});
window.addEventListener("pointercancel", () => { panelPointerDown = false; });

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
  if (dataBuy.startsWith("equip:")){ const w = WEAPONS[dataBuy.slice(6)]; toast(`${w.name} に持ち替えた (DPS ${fmtD(weaponDPS(w) * weaponPowerMul(dataBuy.slice(6)))})`); }
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
  if (!WEAPON_KEYS.some(k => state.weaponsOwned[k])) return "";
  return `<button class="bulkup-btn" data-bulkup ${pv.total ? "" : "disabled"} title="所持武器を現在のDPSが強い順に並べ、買えるだけまとめて強化する (製作素材払いも自動で適用)">
    <span class="bu-icon">${iconSVG("up")}</span><span class="bu-main"><span class="bu-label">まとめて強化</span><span class="bu-sub" data-bulkup-sub>${bulkUpSubText(pv)}</span></span><span class="bu-n" data-bulkup-n>${pv.total ? "×" + fmt(pv.total) : ""}</span></button>`;
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
$("panels").addEventListener("click", e => {
  if (e.target.closest("[data-qsall]")){ qsAll = !qsAll; renderPanels(true); }
});
$("panels").addEventListener("click", e => {
  const b = e.target.closest("[data-buyall]"); if (!b || b.disabled) return;
  doBuyAllOnce();
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

/* ---------- 武器タブ: 絞り込み / 行の開閉 ---------- */
$("panels").addEventListener("click", e => {
  const f = e.target.closest("[data-wfilter]"); if (f){ wFilter = f.dataset.wfilter; renderPanels(true); return; }
  // 行の中のボタン (製作・強化・装備) を押した時は開閉しない
  if (e.target.closest("button, input, select, label")) return;
  const sel = e.target.closest("[data-wsel]"); if (sel){ wSel = wSel === sel.dataset.wsel ? null : sel.dataset.wsel; renderPanels(true); }
});
$("panels").addEventListener("keydown", e => {
  if (e.key !== "Enter" && e.key !== " ") return;
  const sel = e.target.closest && e.target.closest(".wl-row[data-wsel]");
  if (sel && e.target === sel){ e.preventDefault(); wSel = wSel === sel.dataset.wsel ? null : sel.dataset.wsel; renderPanels(true); const n = $("panel-craft").querySelector(`[data-wsel="${sel.dataset.wsel}"]`); if (n) n.focus(); }
});
/* ---------- 別タブへ飛ぶリンク (おすすめ → 武器タブの「製作可」など) ---------- */
$("panels").addEventListener("click", e => {
  const g = e.target.closest("[data-goto]"); if (!g) return;
  if (g.dataset.gofilter) wFilter = g.dataset.gofilter;
  if (g.dataset.gosel){ wSel = g.dataset.gosel; wFilter = "all"; wQuery = ""; wSort = "no"; tierOpen[WEAPONS[wSel].tier] = true; }
  setTab(g.dataset.goto);
  if (g.dataset.gosel){ const n = $("panel-craft").querySelector(`[data-wsel="${g.dataset.gosel}"]`); if (n) n.scrollIntoView({ block:"center" }); }
});
/* ---------- 検索欄 (日本語入力の変換中は描き直さない) / 並び替え / 絞り込み ---------- */
function onSearchInput(t){
  if (t.id === "wsearch"){ wQuery = t.value; refreshWeaponList(); }
  else if (t.id === "msearch"){ matQuery = t.value; refreshMatGrid(); }
  else return;
  const box = t.closest(".search"); if (box) box.classList.toggle("has-q", !!t.value);
}
$("panels").addEventListener("compositionstart", () => { imeComposing = true; });
$("panels").addEventListener("compositionend", e => { imeComposing = false; onSearchInput(e.target); });
$("panels").addEventListener("input", e => { if (e.isComposing || imeComposing) return; onSearchInput(e.target); });
$("panels").addEventListener("click", e => {
  const c = e.target.closest("[data-clear]"); if (!c) return;
  e.preventDefault();
  const inp = $(c.dataset.clear); if (!inp) return;
  inp.value = ""; onSearchInput(inp); inp.focus();
});
$("panels").addEventListener("keydown", e => {
  if (e.key === "Escape" && (e.target.id === "wsearch" || e.target.id === "msearch")){ e.target.value = ""; onSearchInput(e.target); e.target.blur(); }
});
$("panels").addEventListener("change", e => {
  const t = e.target;
  if (t.id === "wsort"){ wSort = t.value; renderPanels(true); }
  else if (t.id === "mcat"){ matCat = t.value; renderPanels(true); }
  else if (t.id === "mlayer"){ matLayer = t.value; renderPanels(true); }
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
  if (e.target.closest("[data-mreset]")){ matCat = "all"; matLayer = "all"; matOwnedOnly = false; matQuery = ""; renderPanels(true); return; }
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
