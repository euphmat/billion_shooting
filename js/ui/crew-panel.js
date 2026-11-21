"use strict";
/* =========================================================
   ui/crew-panel.js - 攻撃ボット / 回収ボットのパネルと、ボット装備モーダル
   ========================================================= */

/* ---------- 攻撃ボット / 回収ボット タブ ----------
   上から「艦隊カード (状況 + 稼働スイッチ)」→「作戦モード (セグメント)」→「買えるもの (アクション行)」。
   アクション行の中身 (crewRowOpts) は おすすめタブとも共有する */
let botSlotSel = -1;   // 選択中のスロット (-1 = なし)
// ボットの作戦モード定義 (サマリ表示とセグメント部品で共有)
const BOT_MODES = [["follow", "追従モード", "自機についてきて、周りを掘る"], ["solo", "独立モード", "自機から離れて、自分の周りを掘り続ける"], ["explore", "探索モード", "ランダムな小惑星へ向かい、掘り尽くすまで採掘する"]];
const CB_MODES  = [["follow", "追従モード", "自機についてきて、近くのコインを拾う"], ["solo", "独立モード", "自機から離れて、ひたすらコインを拾い回る"], ["botfollow", "ボット追従モード", "攻撃ボット1台につき回収ボット1台がついて回る"]];
const modeNameOf = (modes, v) => (modes.find(m => m[0] === v) || modes[0])[1];
function botModeSegHTML(kind){
  const isBot = kind === "bot";
  const cur = isBot ? (state.botMode || "follow") : (state.cbMode || "follow");
  const modes = isBot ? BOT_MODES : CB_MODES, curM = modes.find(m => m[0] === cur) || modes[0];
  return `<div class="field"><div class="field-label">作戦モード <span>全機の動き方</span></div>
    <div class="seg">${modes.map(([v, name, desc]) => `<button class="seg-btn${cur === v ? " on" : ""}" data-${isBot ? "bmode" : "cbmode"}="${v}" title="${desc}">${name.replace(/モード$/, "")}</button>`).join("")}</div>
    <div class="field-hint">${curM[2]}</div></div>`;
}
// 稼働 ON/OFF (艦隊カードの右上に置く小さなスイッチ)
function crewSwitchHTML(key){
  if (!(state[key] > 0)) return "";
  const on = !state.off[key];
  return `<label class="fleet-switch${on ? "" : " off"}" title="${on ? "稼働中 (押すと停止)" : "停止中 (押すと稼働)"}"><span>${on ? "稼働中" : "停止中"}</span><span class="switch sm"><input type="checkbox" data-crew="${key}" ${on ? "checked" : ""}><span class="slider"></span></span></label>`;
}
function fleetCardHTML(o){
  return `<div class="fleet${o.off ? " is-off" : ""}" style="--accent:${o.accent}">
    <div class="fl-top">${iconBadge(o.icon, o.accent)}
      <div class="fl-main"><div class="fl-name">${o.name}</div><div class="fl-count"><b>${o.n}</b><span> / ${o.max} 機</span>${o.extra ? `<em>${o.extra}</em>` : ""}</div></div>
      ${o.sw}</div>
    <div class="fl-stats">${o.stats.map(([l, v, hl]) => `<div class="fl-stat${hl ? " hl" : ""}"><em>${l}</em><b>${v}</b></div>`).join("")}</div>
  </div>`;
}
// 購入アクション行の中身 (攻撃ボット / 回収ボット / 衛星テク / モジュール)
function crewRowOpts(buy){
  if (buy === "bot"){
    const n = state.bots, full = n >= BOT_MAX;
    return { buy, icon:"bot", accent:"#ffffff", title: full ? "攻撃ボット (上限)" : `攻撃ボット ${n + 1}機目を製造`, lv: `${n}/${BOT_MAX}`,
      eff: full ? `上限 ${BOT_MAX} 機に到達。スキルで増える分は別枠` : `合計DPS <span class="up">+${fmtD(botSlotDPS(n))}</span>`, label:"製造", bulk:true, maxed:full, maxedText:"上限" };
  }
  if (buy === "bupgrade"){
    const lv = state.botLv, now = 1 + 0.12 * lv, nx = 1 + 0.12 * (lv + 1);
    return { buy, icon:"up", accent:"#ffffff", title:"攻撃ボット強化", lv:`Lv.${lv}`,
      eff: `全ボットの威力 <span class="up">+12%</span> (x${now.toFixed(2)} → x${nx.toFixed(2)})${state.bots > 0 ? ` ・ 合計DPS ${fmtD(botsTotalDPS())} → <span class="up">${fmtD(botsTotalDPS() * nx / now)}</span>` : ""}`, label:"強化", bulk:true };
  }
  if (buy === "botcore"){
    const lv = state.botCore || 0, maxed = lv >= BOT_CORE_MAX;
    return { buy, icon:"star", accent:"#fff2b0", title:"衛星兵装コア", lv:`Lv.${lv}/${BOT_CORE_MAX}`,
      eff: maxed ? `攻撃ボットの威力 +${lv * 25}%` : `攻撃ボットの威力 +${lv * 25}% → <span class="up">+${(lv + 1) * 25}%</span>`, label:"開発", bulk:true, maxed };
  }
  if (buy === "botarmor"){
    const lv = state.botArmor || 0, maxed = lv >= BOT_ARMOR_MAX;
    return { buy, icon:"layers", accent:"#fff2b0", title:"衛星装甲プレート", lv:`Lv.${lv}/${BOT_ARMOR_MAX}`,
      eff: maxed ? `自機の被ダメージ -${lv * 4}%` : `自機の被ダメージ -${lv * 4}% → <span class="up">-${(lv + 1) * 4}%</span>`, label:"開発", bulk:true, maxed };
  }
  if (buy === "coinbot"){
    const n = state.coinBots, full = n >= COINBOT_MAX;
    return { buy, icon:"coinbot", accent:"#ffd60a", title: full ? "回収ボット (上限)" : `回収ボット ${n + 1}機目を製造`, lv:`${n}/${COINBOT_MAX}`,
      eff: full ? `上限 ${COINBOT_MAX} 機に到達。スキルやモジュールで増える分は別枠` : `稼働 ${coinBotCount()} → <span class="up">${coinBotCount() + 1}</span> 機`, label:"製造", bulk:true, maxed:full, maxedText:"上限" };
  }
  if (buy.startsWith("cbmod:")){
    const k = buy.slice(6), m = CB_MODULES[k], lv = cbLv(k), maxed = lv >= m.max;
    return { buy, icon:m.icon, accent:m.accent, title:m.name, lv:`Lv.${lv}/${m.max}`,
      eff: maxed ? m.eff(lv) : `${lv ? m.eff(lv) + " → " : ""}<span class="up">${m.eff(lv + 1)}</span>`, label: lv ? "強化" : "組込", bulk:true, maxed };
  }
  return null;
}
const crewRowHTML = buy => actRowHTML(crewRowOpts(buy));
function botPanelHTML(){
  const n = state.bots, total = botCount();
  let equippedN = 0; for (let i = 0; i < total; i++) if (botWeaponAt(i)) equippedN++;
  const spareN = WEAPON_KEYS.filter(k => state.weaponsOwned[k] && k !== state.weapon).length;
  const core = state.botCore || 0, armor = state.botArmor || 0;
  return fleetCardHTML({ icon:"bot", accent:"#ffffff", name:"攻撃ボット", n, max:BOT_MAX, extra: total > n ? `+${total - n} スキル` : "",
      sw: crewSwitchHTML("bots"), off: n > 0 && state.off.bots,
      stats:[["合計DPS", fmtD(botsTotalDPS()), true], ["倍率", "x" + fmtX(botMul())], ["強化", "Lv." + state.botLv], ["稼働", botCount() + "機"]] })
    + (total > 0 ? `<button class="nav-row" data-boteq-open>${iconBadge("bot", "#57e39a")}<span class="nr-main"><span class="nr-title">武器を持たせる (編成)</span><span class="nr-sub">装備済み ${equippedN}/${total}機 ・ 余った武器 ${spareN}点</span></span>${equippedN < total && spareN > 0 ? `<span class="st-pill go">空き ${total - equippedN}</span>` : ""}<span class="nr-arrow">›</span></button>`
      : `<p class="hint-box">製造したボットには、余った武器を持たせられる。</p>`)
    + (n > 0 ? botModeSegHTML("bot") : "")
    + secTitleHTML("製造・強化")
    + `<div class="alist">${crewRowHTML("bot")}${crewRowHTML("bupgrade")}</div>`
    + secTitleHTML("衛星テクノロジー", "衛星惑星の素材で開発", `${core + armor}/${BOT_CORE_MAX + BOT_ARMOR_MAX}`)
    + `<div class="alist">${crewRowHTML("botcore")}${crewRowHTML("botarmor")}</div>`;
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
  if (!total) return `<p class="lo-empty">攻撃ボットがまだいない。工房の「攻撃ボット」タブで製造できる。</p>`;
  let maxDps = 0;
  for (let i = 0; i < total; i++) maxDps = Math.max(maxDps, botSlotDPS(i));
  const slots = Array.from({ length: total }, (_, i) => botTileHTML(i, maxDps)).join("");
  let spare = WEAPON_KEYS.filter(k => state.weaponsOwned[k] && k !== state.weapon);
  const def = botDefaultDPS();
  // おまかせが実際に何か変える時だけ押せるように: 空きスロットがあるか、余り武器が一番弱い装備より強いこと
  let minSlotRank = Infinity;
  for (let i = 0; i < total; i++) minSlotRank = Math.min(minSlotRank, botSlotRank(i));
  const canAuto = spare.some(k => shelfHolder(k) < 0 && botWeaponRawDPS(k) > minSlotRank);
  const sel = botSlotSel >= 0 && botSlotSel < total ? botSlotSel : -1;
  const base = sel >= 0 ? botSlotDPS(sel) : def;
  const baseLabel = sel >= 0 ? `ボット${sel + 1}の現在比` : "デフォルト砲比";
  const allSpare = spare.length;
  if (shelfFreeOnly) spare = spare.filter(k => shelfHolder(k) < 0);
  if (shelfSort === "dps") spare.sort((a, b) => botWeaponRawDPS(b) - botWeaponRawDPS(a));
  else if (shelfSort === "name") spare.sort((a, b) => WEAPONS[a].name.localeCompare(WEAPONS[b].name, "ja") || WEAPONS[a].no - WEAPONS[b].no);
  else spare.sort((a, b) => (shelfHolder(a) >= 0) - (shelfHolder(b) >= 0) || botWeaponRawDPS(b) - botWeaponRawDPS(a));
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
function coinBotPanelHTML(){
  const n = state.coinBots, total = coinBotCount();
  const fieldCoins = typeof coinsArr !== "undefined" ? coinsArr.length : 0;
  const modOn = CB_MOD_KEYS.filter(k => cbLv(k) > 0).length;
  // モジュールは「今買える → 未導入 → 導入済み → MAX」の順に並べ、次に押すものが上に来るようにする
  const rank = k => { const m = CB_MODULES[k], lv = cbLv(k); if (lv >= m.max) return 3; return canBuy(buyDef("cbmod:" + k)) ? 0 : lv ? 2 : 1; };
  const mods = CB_MOD_KEYS.slice().sort((a, b) => rank(a) - rank(b));
  return fleetCardHTML({ icon:"coinbot", accent:"#ffd60a", name:"コイン回収ボット", n, max:COINBOT_MAX, extra: total > n ? `+${total - n} 追加` : "",
      sw: crewSwitchHTML("coinBots"), off: n > 0 && state.off.coinBots,
      stats:[["回収額", "x" + (botCoinMul() * skMul("c_haul", 1.10)).toFixed(2), true], ["速度", Math.round(coinBotSpeed())], ["吸引", Math.round(coinBotVacuum())], ["場のコイン", fieldCoins]] })
    + (n > 0 ? botModeSegHTML("coinbot") : `<p class="hint-box">落ちたコインを自動で拾う。1機目を製造すると、モジュールを組み込める。</p>`)
    + secTitleHTML("製造")
    + `<div class="alist">${crewRowHTML("coinbot")}</div>`
    + secTitleHTML("モジュール", n > 0 ? "買えるものから順に並ぶ" : "回収ボットが1機以上必要", `${modOn}/${CB_MOD_KEYS.length}`)
    + `<div class="alist">${mods.map(k => crewRowHTML("cbmod:" + k)).join("")}</div>`;
}
