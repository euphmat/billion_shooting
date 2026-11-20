"use strict";
/* =========================================================
   ui/hud.js - サイドパネルの HUD とホバーツールチップ
   ========================================================= */

/* ---------- HUD (side panel only) ---------- */
function setText(el, t){ if (el._t !== t){ el._t = t; el.textContent = t; } }
function updateHUD(){
  refreshAffordability();
  const pct = state.destroyed / TARGET_TOTAL * 100, w = Math.max(pct, 0.05).toFixed(4) + "%", bar = $("sideProgress");
  setText($("sidePct"), pct.toFixed(5) + "%");
  if (bar._w !== w){ bar._w = w; bar.style.width = w; }
  setText($("sideDestroyed"), "破壊 " + fmt(state.destroyed));
  setText($("sideRemain"), "残り " + fmt(mainAlive));   // 主惑星の残数 (alive は全天体の合算なので、惑星の残りはこちらが正しい)
  setText($("sideCoins"), fmt(state.coins));
}

/* ---------- ホバーツールチップ: 武器 / 強化 / モジュール の説明カード ---------- */
function weaponTipHTML(k){
  const w = WEAPONS[k], owned = state.weaponsOwned[k], eq = state.weapon === k, lv = weaponLvOf(k);
  return `<div class="tip-head">${iconBadge(w.icon, w.accent)}<div class="tip-main"><div class="tip-name">${w.name}</div><div class="tip-tag">No.${String(w.no).padStart(2, "0")} ・ ${w.tag}</div></div><span class="wt-st ${eq ? "eq" : owned ? "own" : "dim"}">${eq ? "装備中" : owned ? "Lv." + lv : "未所持"}</span></div>
    ${weaponStatsHTML(k, w)}
    <div class="tip-line">個性: ${[`弾は${FORM_INFO[w.form || w.shape] || "特殊な形"}`, w.move ? MOVE_INFO[w.move][1] : "", w.mine ? MOVE_INFO.mine[1] : "", w.spin ? "回転しながら飛ぶ" : "", w.pulse ? "脈動する" : "", w.trail ? "残像を引く" : "", w.glow ? "光を放つ" : ""].filter(Boolean).join(" ・ ")}</div>
    ${w.desc ? `<p class="tip-desc">${w.desc}</p>` : ""}
    ${owned ? `<div class="tip-line">強化 Lv.${lv} → ${lv + 1} : 威力 +8%${Math.floor(lv / 10) > 0 ? ` ・ 発射数 +${Math.floor(lv / 10)}` : ""}${Math.floor((lv + 1) / 10) > Math.floor(lv / 10) ? ` ・ <b style="color:#57e39a">次の強化で発射数 +1!</b>` : ""}</div>` : `<div class="tip-line">製作レシピ (素材が揃うと製作できる)</div>${recipeChips(w.recipe, true)}`}`;
}
function buyTipHTML(arg){
  const head = (icon, color, name, tag) => `<div class="tip-head">${iconBadge(icon, color)}<div class="tip-main"><div class="tip-name">${name}</div><div class="tip-tag">${tag}</div></div></div>`;
  if (arg === "bot") return head("bot", "#ffffff", "攻撃ボット", "製造") + `<p class="tip-desc">自機と一緒に惑星を掘る相棒。標準装備は威力60%・毎秒3発。編成で余った武器を持たせると、その武器の撃ち方そのままで戦う。作戦モード (追従 / 独立 / 探索) で動き方が変わる。</p><div class="tip-line">現在 ${state.bots} 機 (上限 ${BOT_MAX} 機) ・ スキル追加分を含め ${botCount()} 機が稼働</div>`;
  if (arg === "bupgrade") return head("up", "#ffffff", "攻撃ボット強化", "強化") + `<p class="tip-desc">全ての攻撃ボットの威力が上がる。強化倍率は Lv ごとに +12% ずつ積み上がる。</p><div class="tip-line">現在 Lv.${state.botLv} (倍率 x${(1 + 0.12 * state.botLv).toFixed(2)}) → Lv.${state.botLv + 1} (x${(1 + 0.12 * (state.botLv + 1)).toFixed(2)})</div>`;
  if (arg === "botcore"){ const lv = state.botCore || 0; return head("star", "#fff2b0", "衛星兵装コア", "衛星テクノロジー") + `<p class="tip-desc">衛星惑星の素材で作る兵装コア。攻撃ボットの威力が +25%/Lv 上がる (ボット強化やスキルとは乗算で効く)。</p><div class="tip-line">現在 Lv.${lv} (+${lv * 25}%)${lv < BOT_CORE_MAX ? ` → Lv.${lv + 1} (+${(lv + 1) * 25}%)` : " ・ 最大レベル"}</div>`; }
  if (arg === "botarmor"){ const lv = state.botArmor || 0; return head("layers", "#fff2b0", "衛星装甲プレート", "衛星テクノロジー") + `<p class="tip-desc">衛星惑星の素材で作る装甲プレート。自機がモンスターから受けるダメージが -4%/Lv 軽減される。</p><div class="tip-line">現在 Lv.${lv} (-${lv * 4}%)${lv < BOT_ARMOR_MAX ? ` → Lv.${lv + 1} (-${(lv + 1) * 4}%)` : " ・ 最大レベル"}</div>`; }
  if (arg === "coinbot") return head("coinbot", "#ffd60a", "コイン回収ボット", "製造") + `<p class="tip-desc">落ちたコインを自動で拾う相棒。吸引範囲内のコインを引き寄せ、触れると回収する。モジュールで吸引・速度・接触範囲・回収額が伸びていく。</p><div class="tip-line">現在 ${state.coinBots} 機 (上限 ${COINBOT_MAX} 機) ・ スキル等を含め ${coinBotCount()} 機が稼働</div>`;
  if (arg.startsWith("cbmod:")){
    const k = arg.slice(6), m = CB_MODULES[k], lv = cbLv(k), maxed = lv >= m.max, d = buyDef(arg);
    return head(m.icon, m.accent, m.name, "回収ボット モジュール") + `<p class="tip-desc">${m.desc}</p><div class="tip-line">${m.eff(lv)}${maxed ? " ・ 最大レベル" : ` → ${m.eff(lv + 1)} (Lv.${lv} / ${m.max})`}</div>${maxed ? "" : recipeChips(d.mats, true)}`;
  }
  if (arg.startsWith("wupgrade:")){
    const k = arg.slice(9), w = WEAPONS[k], lv = weaponLvOf(k), d = buyDef(arg);
    return head(w.icon, w.accent, `${w.name} を強化`, "武器の強化") + `<p class="tip-desc">この武器の威力が +8% 上がる。その武器を使う自機・攻撃ボット・僚機すべてに効く。さらに Lv が 10 上がるごとに発射数も +1 される。</p><div class="tip-line">Lv.${lv} → Lv.${lv + 1} の素材${Math.floor((lv + 1) / 10) > Math.floor(lv / 10) ? ` ・ <b style="color:#57e39a">発射数 +1!</b>` : ""}</div>${recipeChips(d.mats, true)}${matSubHTML(arg)}`;
  }
  return "";
}
function tipHTML(spec){
  const i = spec.indexOf(":"), kind = spec.slice(0, i), arg = spec.slice(i + 1);
  if (kind === "weapon") return weaponTipHTML(arg);
  if (kind === "buy") return buyTipHTML(arg);
  if (kind === "bot"){
    const idx = +arg, k = botWeaponAt(idx);
    const base = k ? weaponTipHTML(k) : `<div class="tip-head">${iconBadge("bot", "#999999")}<div class="tip-main"><div class="tip-name">未装備（デフォルト砲）</div><div class="tip-tag">ボットの初期装備</div></div></div><p class="tip-desc">素の射撃 (威力60%・毎秒3発)。編成で余った武器を持たせると、はるかに強くなる。</p>`;
    return base + `<div class="tip-foot">ボット${idx + 1} ・ DPS ${fmtD(botSlotDPS(idx))} — ${TAP}で選択、棚の装備を${TAP}して割り当て</div>`;
  }
  return "";
}
let tipAnchor = null, tipDragging = false;
function hideTip(){ const t = $("tooltip"); if (t) t.classList.remove("show"); tipAnchor = null; }
function attachTip(root){
  if (!root) return;
  root.addEventListener("mousemove", e => {
    if (tipDragging) return;
    const a = e.target.closest("[data-tip]"), tip = $("tooltip");
    if (!a || !root.contains(a) || !document.contains(a)){ hideTip(); return; }
    if (tipAnchor !== a){
      tipAnchor = a;
      tip.innerHTML = tipHTML(a.dataset.tip);
      tip.style.setProperty("--accent", a.style.getPropertyValue("--accent") || "#666");
    }
    const w = tip.offsetWidth, h = tip.offsetHeight;
    let x = e.clientX + 16, y = e.clientY + 16;
    if (x + w > window.innerWidth - 8) x = e.clientX - w - 12;
    if (y + h > window.innerHeight - 8) y = e.clientY - h - 12;
    tip.style.left = x + "px"; tip.style.top = y + "px";
    tip.classList.add("show");
  });
  root.addEventListener("mouseleave", hideTip);
  root.addEventListener("click", hideTip);
}
attachTip($("panels"));
attachTip($("equipBar"));
attachTip($("botEqOverlay"));
$("panels").addEventListener("scroll", hideTip);
