"use strict";
/* =========================================================
   ui/crew-panel.js - 攻撃ボット / 回収ボットのパネルと、ボット装備モーダル
   ========================================================= */

/* ---------- 攻撃ボット: 製造 + 編成 (クリック or ドラッグで装備を渡す) ---------- */
let botSlotSel = -1;   // 選択中のスロット (-1 = なし)
// セクション見出し (工房の tier-head と同じ見た目)
function secHeadHTML(no, name, note, count, actions){
  return `<div class="tier-head open static"><span class="th-no">${no}</span><span class="th-name">${name}</span><span class="th-note">${note || ""}</span>${actions || ""}${count !== undefined && count !== null ? `<span class="th-count">${count}</span>` : ""}</div>`;
}
// ボットの作戦モード定義 (サマリ表示とセグメント部品で共有)
const BOT_MODES = [["follow", "追従モード", "自機についてきて、周りを掘る"], ["solo", "独立モード", "自機から離れて、自分の周りを掘り続ける"], ["explore", "探索モード", "ランダムな小惑星へ向かい、掘り尽くすまで採掘する"]];
const CB_MODES  = [["follow", "追従モード", "自機についてきて、近くのコインを拾う"], ["solo", "独立モード", "自機から離れて、ひたすらコインを拾い回る"], ["botfollow", "ボット追従モード", "攻撃ボット1台につき回収ボット1台がついて回る"]];
const modeNameOf = (modes, v) => (modes.find(m => m[0] === v) || modes[0])[1];
// ボットの作戦モード選択 (攻撃ボット / 回収ボット共通部品)
function botModeSegHTML(kind){
  const isBot = kind === "bot";
  const cur = isBot ? (state.botMode || "follow") : (state.cbMode || "follow");
  const modes = isBot ? BOT_MODES : CB_MODES;
  return `<div class="mode-label">作戦モード — ${isBot ? "攻撃ボット全機の行動パターン" : "回収ボット全機の行動パターン"}</div>
    <div class="mode-grid" style="margin-bottom:12px">${modes.map(([v, name, desc]) => `<button class="mode-btn${cur === v ? " on" : ""}" data-${isBot ? "bmode" : "cbmode"}="${v}"><span class="mb-name">${name}</span><span class="mb-desc">${desc}</span></button>`).join("")}</div>`;
}
function botPanelHTML(){
  const n = state.bots, full = n >= BOT_MAX, dBuy = buyDef("bot"), dUp = buyDef("bupgrade");
  const total = botCount();
  let equippedN = 0; for (let i = 0; i < total; i++) if (botWeaponAt(i)) equippedN++;
  const spareN = WEAPON_KEYS.filter(k => state.weaponsOwned[k] && k !== state.weapon).length;
  let html = `<div class="panel-intro"><b>余った装備を持たせる</b>と、その撃ち方で戦う相棒。</div>
    ${total > 0 ? `<button class="eq-open-btn" data-boteq-open>${iconBadge("bot", "#ffffff")}<span class="eqb-main"><span class="eqb-title">装備を編成する</span><span class="eqb-sub">ボットに武器を持たせる ・ 装備済み ${equippedN}/${total}機 ・ 棚に ${spareN}点</span></span><span class="eqb-arrow">›</span></button>` : ""}
    <div class="fleet-bar" style="--accent:#ffffff">
      ${iconBadge("bot", "#ffffff")}
      <div class="fb-main"><div class="fb-name">攻撃ボット <span class="fb-count">${n}<span class="count-max"> / ${BOT_MAX}</span></span></div>
      <div class="fb-sub">稼働 <b>${botCount()}</b> 機 ・ 合計DPS <b>${fmtD(botsTotalDPS())}</b> ・ モード <b>${modeNameOf(BOT_MODES, state.botMode || "follow")}</b></div></div>
      <div class="fb-side"><span class="fb-lv">強化 Lv.${state.botLv}</span><span class="fb-mul">x${botMul().toFixed(2)}</span></div>
    </div>
    ${crewToggleHTML("bots")}
    ${botModeSegHTML("bot")}
    ${secHeadHTML("SHOP", "製造・強化", "ボットを増やし、強くする", `${n}/${BOT_MAX}`)}
    <div class="wgrid">
      <div class="btile${canBuy(dBuy) ? " afford" : ""}" style="--accent:#ffffff" data-tip="buy:bot">
        <span class="wt-top">${iconBadge("bot", "#ffffff")}<span class="wt-no">MANUFACTURE</span>${full ? `<span class="wt-st dim">最大数</span>` : `<span class="wt-st go">${n + 1}機目</span>`}</span>
        <span class="wt-name">${full ? "製造は上限です" : "攻撃ボットを製造"}</span>
        ${full ? `<span class="wt-sub">上限 ${BOT_MAX} 機に到達。スキルで増える分は別枠。</span>` : `<span class="wt-sub gain-line">製造すると 合計DPS +${fmtD(botSlotDPS(n))} (新しい1機のぶん)</span>${recipeChips(dBuy.mats, true)}<span class="wt-act"><button class="wr-btn buy" data-buy="bot" ${canBuy(dBuy) ? "" : "disabled"}>製造 ${costHTML(dBuy.coins)}</button></span>${bulkRowHTML("bot")}${buyReasonHTML("bot")}`}
      </div>
      <div class="btile${canBuy(dUp) ? " afford" : ""}" style="--accent:#ffffff" data-tip="buy:bupgrade">
        <span class="wt-top">${iconBadge("up", "#ffffff")}<span class="wt-no">UPGRADE</span><span class="wt-st own">Lv.${state.botLv}</span></span>
        <span class="wt-name">攻撃ボット強化</span>
        <span class="wt-sub">Lv.${state.botLv} → ${state.botLv + 1} ・ 全ボットの威力 +12%</span>
        <span class="wt-sub">倍率 <b>x${(1 + 0.12 * state.botLv).toFixed(2)} → x${(1 + 0.12 * (state.botLv + 1)).toFixed(2)}</b>${n > 0 ? ` ・ 合計DPS <b>${fmtD(botsTotalDPS())} → ${fmtD(botsTotalDPS() * (1 + 0.12 * (state.botLv + 1)) / (1 + 0.12 * state.botLv))}</b>` : ""}</span>
        ${recipeChips(dUp.mats, true)}
        <span class="wt-act"><button class="wr-btn buy" data-buy="bupgrade" ${canBuy(dUp) ? "" : "disabled"}>強化 ${costHTML(dUp.coins)}</button></span>${bulkRowHTML("bupgrade")}${buyReasonHTML("bupgrade")}
      </div>
    </div>`
    + satTechHTML();
  return html;
}
function satTechTileHTML(title, icon, lv, max, effNow, effNext, d, kind){
  const maxed = lv >= max;
  return `<div class="btile${!maxed && canBuy(d) ? " afford" : ""}" style="--accent:#fff2b0" data-tip="buy:${kind}">
    <span class="wt-top">${iconBadge(icon, "#fff2b0")}<span class="wt-no">SAT TECH</span>${maxed ? `<span class="wt-st eq">MAX</span>` : `<span class="wt-st own">Lv.${lv}</span>`}</span>
    <span class="wt-name">${title}</span>
    <span class="pbar mini"><i style="width:${lv / max * 100}%"></i></span>
    <span class="wt-sub">${effNow}${maxed ? "" : ` <span class="arrow">→</span> ${effNext}`}</span>
    ${maxed ? `<span class="wt-sub">最大レベルに到達</span>` : `${recipeChips(d.mats, true)}<span class="wt-act"><button class="wr-btn buy" data-buy="${kind}" ${canBuy(d) ? "" : "disabled"}>開発 ${costHTML(d.coins)}</button></span>${bulkRowHTML(kind)}${buyReasonHTML(kind)}`}
  </div>`;
}
function satTechHTML(){
  const core = state.botCore || 0, armor = state.botArmor || 0;
  return secHeadHTML("SAT", "衛星テクノロジー", "衛星惑星の素材で、ボットと自機を強化", `${core + armor}/${BOT_CORE_MAX + BOT_ARMOR_MAX}`)
    + `<div class="wgrid">
      ${satTechTileHTML("衛星兵装コア", "star", core, BOT_CORE_MAX, `攻撃ボットの威力 +${core * 25}%`, `+${(core + 1) * 25}%`, buyDef("botcore"), "botcore")}
      ${satTechTileHTML("衛星装甲プレート", "layers", armor, BOT_ARMOR_MAX, `自機の被ダメージ -${armor * 4}%`, `-${(armor + 1) * 4}%`, buyDef("botarmor"), "botarmor")}
    </div>`;
}
function botTileHTML(i, maxDps){
  const k = botWeaponAt(i), w = k ? WEAPONS[k] : null, extra = i >= state.bots, dps = botSlotDPS(i);
  return `<div class="btile bot-tile${k ? " has" : " none"}${botSlotSel === i ? " sel" : ""}${eqFlash && eqFlash.i === i ? " flash" : ""}" data-slot="${i}" style="--accent:${w ? w.accent : "#666"}" data-tip="bot:${i}">
    <span class="wt-top"><span class="bt-no">${i + 1}</span>${extra ? `<span class="wt-st dim">スキル追加</span>` : ""}${botSlotSel === i ? `<span class="wt-st eq">選択中</span>` : ""}${k ? `<button class="bt-x" data-unequip="${i}" title="デフォルト砲に戻す">${iconSVG("close")}</button>` : ""}</span>
    <span class="bt-wrow">${w ? iconBadge(w.icon, w.accent) : `<span class="icon-badge sm" style="color:#888;border-color:#444;background:#44444414">${iconSVG("bot")}</span>`}<span class="wt-name">${w ? w.name : "未装備（デフォルト砲）"}</span></span>
    <span class="bt-dps">DPS ${fmtD(dps)}${w && weaponLvOf(k) > 0 ? `<span class="bt-lv">武器Lv.${weaponLvOf(k)}</span>` : ""}</span>
    ${w ? "" : `<span class="wt-sub">下の棚の装備を割り当てると、もっと強くなる</span>`}
    <span class="pbar mini"><i style="width:${maxDps > 0 ? Math.max(3, Math.round(dps / maxDps * 100)) : 0}%"></i></span>
  </div>`;
}
/* ---------- 攻撃ボットの装備モーダル ----------
   ボット画面の「装備を編成する」ボタンで開く別モーダル (artOverlay 等と同じ作法)。
   上 = ボットスロット一覧 / 下 = 武器グリッド。開いている間は game/loop.js 側で一時停止する */
let botEqOpen = false;
let shelfSort = "rec";        // rec = おすすめ順 (空き優先 → DPS降順) / dps = DPS順 / name = 名前順
let shelfFreeOnly = false;    // 「空きのみ」フィルタ
let eqFlash = null;           // 装備直後のフィードバック { i, k } (スロットと武器を一時的に光らせる)
// その武器を実際に持っているボットの番号 (持たれていなければ -1)
const shelfHolder = k => { const h = state.botLoadout.indexOf(k); return h >= 0 && botWeaponAt(h) === k ? h : -1; };
function eqShelfTileHTML(k, base, baseLabel, selIdx){
  const w = WEAPONS[k], holder = shelfHolder(k), held = holder >= 0, dps = botWeaponDPS(k), lv = weaponLvOf(k);
  const rel = base > 0 ? dps / base : 1, mine = held && holder === selIdx;
  return `<div class="btile shelf-tile eq-tile${held ? " held" : ""}${eqFlash && eqFlash.k === k ? " flash" : ""}" draggable="true" data-shelf="${k}" style="--accent:${w.accent}" data-tip="weapon:${k}">
    <span class="wt-top">${iconBadge(w.icon, w.accent)}<span class="wt-no">${w.tag}</span>${held ? `<span class="wt-st ${mine ? "eq" : "dim"}">${mine ? "装備中" : `ボット${holder + 1} 装備中`}</span>` : `<span class="wt-st go">空き</span>`}</span>
    <span class="wt-name" title="${w.name}">${w.name}</span>
    <span class="bt-dps">DPS ${fmtD(dps)}${lv > 0 ? `<span class="bt-lv">武器Lv.${lv}</span>` : ""}</span>
    <span class="wt-sub"><span class="${rel >= 1 ? "up" : "down"}">${rel >= 1 ? "+" : ""}${Math.round((rel - 1) * 100)}%</span> <span class="shelf-base">${baseLabel}</span></span>
    <span class="pbar mini${rel > 1 ? " up" : ""}"><i style="width:${Math.max(3, Math.min(100, 50 * rel))}%"></i></span>
  </div>`;
}
function botEqHTML(){
  const total = botCount();
  if (!total) return `<p class="lo-empty">攻撃ボットがまだいない。工房の「攻撃ボット」タブで製造すると、ここで装備を持たせられる。</p>`;
  let maxDps = 0;
  for (let i = 0; i < total; i++) maxDps = Math.max(maxDps, botSlotDPS(i));
  const slots = Array.from({ length: total }, (_, i) => botTileHTML(i, maxDps)).join("");
  let spare = WEAPON_KEYS.filter(k => state.weaponsOwned[k] && k !== state.weapon);
  const def = botDefaultDPS();
  const canAuto = spare.some(k => botWeaponDPS(k) > def);
  const sel = botSlotSel >= 0 && botSlotSel < total ? botSlotSel : -1;
  const base = sel >= 0 ? botSlotDPS(sel) : def;
  const baseLabel = sel >= 0 ? `ボット${sel + 1}の現在比` : "デフォルト砲比";
  const allSpare = spare.length;
  if (shelfFreeOnly) spare = spare.filter(k => shelfHolder(k) < 0);
  if (shelfSort === "dps") spare.sort((a, b) => botWeaponDPS(b) - botWeaponDPS(a));
  else if (shelfSort === "name") spare.sort((a, b) => WEAPONS[a].name.localeCompare(WEAPONS[b].name, "ja") || WEAPONS[a].no - WEAPONS[b].no);
  else spare.sort((a, b) => (shelfHolder(a) >= 0) - (shelfHolder(b) >= 0) || botWeaponDPS(b) - botWeaponDPS(a));
  const guide = eqFlash ? `<div class="eq-guide done">ボット${eqFlash.i + 1} に「${WEAPONS[eqFlash.k].name}」を装備した</div>`
    : sel >= 0 ? `<div class="eq-guide">ボット${sel + 1} を選択中 — 下の武器を${TAP}すると装備する。もう一度ボットを${TAP}すると選択解除</div>`
    : `<div class="eq-guide">ボットを${TAP}で選んで、武器を${TAP}で装備。選ばずに武器を${TAP}すると、空きスロット → 一番弱いボットの順で自動で入る</div>`;
  return guide
    + `<div class="eq-sec"><b>ボットスロット</b><span>合計DPS ${fmtD(botsTotalDPS())} ・ ${total}機</span></div>`
    + `<div class="eq-grid eq-slots">${slots}</div>`
    + `<div class="lo-bar eq-bar"><button class="lo-act" data-bauto ${canAuto ? "" : "disabled"}>おまかせ編成<span>強い装備から自動で割り当て</span></button><button class="lo-act" data-bclear>全て外す<span>全機をデフォルト砲に戻す</span></button></div>`
    + `<div class="eq-sec"><b>武器の棚</b><span>${spare.length}点 表示 ・ %は${baseLabel}</span></div>`
    + `<div class="eq-toolbar"><span class="wlab">並び替え</span><button class="fchip${shelfSort === "rec" ? " on" : ""}" data-shelfsort="rec">おすすめ順</button><button class="fchip${shelfSort === "dps" ? " on" : ""}" data-shelfsort="dps">DPS順</button><button class="fchip${shelfSort === "name" ? " on" : ""}" data-shelfsort="name">名前順</button><span class="eq-wsp"></span><button class="fchip${shelfFreeOnly ? " on" : ""}" data-shelffree>空きのみ</button></div>`
    + (spare.length ? `<div class="eq-grid eq-shelf">${spare.map(k => eqShelfTileHTML(k, base, baseLabel, sel)).join("")}</div>`
      : `<p class="lo-empty">${allSpare ? "空きの武器はない (全部どれかのボットが装備中)。「空きのみ」を外すと全部見える。" : "持たせられる余り装備がまだない。工房で2つ目の装備を作ると、ここに並ぶ。"}</p>`);
}
function renderBotEq(){
  const el = $("botEqBody"); if (!el) return;
  el.innerHTML = botEqHTML();
  const total = botCount();
  let equippedN = 0; for (let i = 0; i < total; i++) if (botWeaponAt(i)) equippedN++;
  const c = $("botEqCount"); if (c) c.textContent = total ? `装備済み ${equippedN} / ${total}機` : "";
  if (eqFlash){ const f = eqFlash; setTimeout(() => { if (eqFlash === f){ eqFlash = null; if (botEqOpen) renderBotEq(); } }, 1200); }
}
function openBotEq(){
  botEqOpen = true;
  if (typeof setSheet === "function") setSheet(false);   // スマホではボトムシートを閉じてから出す
  renderBotEq();
  $("botEqOverlay").classList.add("open");
}
function closeBotEq(){ botEqOpen = false; eqFlash = null; $("botEqOverlay").classList.remove("open"); }
// パネル側とモーダル側の両方の見た目を最新にする
function refreshBotViews(){ renderPanels(true); if (botEqOpen) renderBotEq(); }
$("botEqClose").addEventListener("click", closeBotEq);
$("botEqOverlay").addEventListener("click", e => { if (e.target === $("botEqOverlay") || e.target === $("botEqBody")) closeBotEq(); });
window.addEventListener("keydown", e => { if (e.key === "Escape" && botEqOpen) closeBotEq(); });
/* ---------- 回収ボット: 製造 + モジュール ---------- */
function cbModTileHTML(k){
  const m = CB_MODULES[k], lv = cbLv(k), maxed = lv >= m.max, d = buyDef("cbmod:" + k);
  return `<div class="btile${lv > 0 ? " on" : ""}${!maxed && canBuy(d) ? " afford" : ""}" style="--accent:${m.accent}" data-tip="buy:cbmod:${k}">
    <span class="wt-top">${iconBadge(m.icon, m.accent)}<span class="wt-no">MODULE</span>${maxed ? `<span class="wt-st eq">MAX</span>` : `<span class="wt-st own">Lv.${lv}</span>`}</span>
    <span class="wt-name">${m.name}</span>
    <span class="pbar mini"><i style="width:${lv / m.max * 100}%"></i></span>
    <span class="wt-sub">${m.eff(lv)}${maxed ? "" : ` <span class="arrow">→</span> ${m.eff(lv + 1)}`}</span>
    ${maxed ? `<span class="wt-sub">最大レベルに到達</span>` : `${recipeChips(d.mats, true)}<span class="wt-act"><button class="wr-btn buy" data-buy="cbmod:${k}" ${canBuy(d) ? "" : "disabled"}>${lv ? "強化" : "組み込む"} ${costHTML(d.coins)}</button></span>${bulkRowHTML("cbmod:" + k)}${buyReasonHTML("cbmod:" + k)}`}
  </div>`;
}
function coinBotPanelHTML(){
  const n = state.coinBots, full = n >= COINBOT_MAX, dBuy = buyDef("coinbot");
  const fieldCoins = typeof coinsArr !== "undefined" ? coinsArr.length : 0;
  let html = `<div class="panel-intro">コインを拾う相棒。<b>モジュール</b>で伸びる。</div>
    <div class="fleet-bar" style="--accent:#ffd60a">
      ${iconBadge("coinbot", "#ffd60a")}
      <div class="fb-main"><div class="fb-name">コイン回収ボット <span class="fb-count">${n}<span class="count-max"> / ${COINBOT_MAX}</span></span></div>
      <div class="fb-sub">稼働 <b>${coinBotCount()}</b> 機 ・ 回収額 <b>x${(botCoinMul() * (sk("c_haul") ? 1.10 : 1)).toFixed(2)}</b> ・ モード <b>${modeNameOf(CB_MODES, state.cbMode || "follow")}</b></div></div>
      <div class="fb-side"><span class="fb-lv">場のコイン</span><span class="fb-mul">${fieldCoins}</span></div>
    </div>
    <div class="sbadges"><span class="sbadge">${iconSVG("speed")}速度 <b>${Math.round(coinBotSpeed())}</b></span><span class="sbadge">${iconSVG("magnet")}吸引 <b>${Math.round(coinBotVacuum())}</b></span><span class="sbadge">${iconSVG("bag")}接触 <b>${Math.round(coinBotTouchR())}</b></span></div>
    ${crewToggleHTML("coinBots")}
    ${botModeSegHTML("coinbot")}
    ${secHeadHTML("SHOP", "製造", "回収ボットを増やす", `${n}/${COINBOT_MAX}`)}
    <div class="wgrid">
      <div class="btile${canBuy(dBuy) ? " afford" : ""}" style="--accent:#ffd60a" data-tip="buy:coinbot">
        <span class="wt-top">${iconBadge("coinbot", "#ffd60a")}<span class="wt-no">MANUFACTURE</span>${full ? `<span class="wt-st dim">最大数</span>` : `<span class="wt-st go">${n + 1}機目</span>`}</span>
        <span class="wt-name">${full ? "製造は上限です" : "回収ボットを製造"}</span>
        ${full ? `<span class="wt-sub">上限 ${COINBOT_MAX} 機に到達。スキルやモジュールで増える分は別枠。</span>` : `<span class="wt-sub gain-line">製造すると 稼働 ${coinBotCount()} → ${coinBotCount() + 1} 機</span>${recipeChips(dBuy.mats, true)}<span class="wt-act"><button class="wr-btn buy" data-buy="coinbot" ${canBuy(dBuy) ? "" : "disabled"}>製造 ${costHTML(dBuy.coins)}</button></span>${bulkRowHTML("coinbot")}${buyReasonHTML("coinbot")}`}
      </div>
      <div class="btile" style="--accent:#ffd60a">
        <span class="wt-top">${iconBadge("coin", "#ffd60a")}<span class="wt-no">STATUS</span></span>
        <span class="wt-name">回収の状況</span>
        <span class="wt-sub">場のコイン <b>${fieldCoins}</b> 枚 ・ 稼働 <b>${coinBotCount()}</b> 機</span>
        <span class="wt-sub">1機の吸引範囲 <b>${Math.round(coinBotVacuum())}</b> ・ 接触 <b>${Math.round(coinBotTouchR())}</b></span>
        <span class="wt-sub">モジュールで吸引・速度・回収額が伸びる</span>
      </div>
    </div>
    ${secHeadHTML("MODULE", "モジュール", "回収ボットが1機以上いると組み込める", `${CB_MOD_KEYS.filter(k => cbLv(k) > 0).length}/${CB_MOD_KEYS.length}`)}
    <div class="wgrid">${CB_MOD_KEYS.map(cbModTileHTML).join("")}</div>`;
  return html;
}
