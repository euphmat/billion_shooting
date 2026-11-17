"use strict";
/* =========================================================
   skilltree.js - レベルHUD / スキルツリー画面
   (最後に読み込む。データは skills.js、効果は skillfx.js)
   ========================================================= */

// ---------- アイコンは ui.js の ICONS にまとめてある ----------
const skillSVG = n => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7">${ICONS[n.ic] || ""}</svg>`;


// ---------- HUD (毎フレーム。変わったところだけ書き換える) ----------
let hudSig = "", buffSig = "";
function updateSkillHUD(){
  const sp = spLeft(), need = xpNeed(state.lv);
  const sig = state.lv + "|" + Math.floor(state.xp) + "|" + sp;
  if (sig !== hudSig){
    hudSig = sig;
    $("lvNum").textContent = state.lv;
    $("xpFill").style.width = Math.min(100, state.xp / need * 100) + "%";
    $("xpText").textContent = `${fmt(state.xp)} / ${fmt(need)} XP`;
    $("spBadge").textContent = sp;
    $("treeBtn").classList.toggle("has-sp", sp > 0);
  }
  const tags = [];
  if (combo > 1 && (sk("a_combo") || sk("c_combo"))) tags.push(`<b class="combo">${combo} COMBO</b>`);
  if (sk("a_warm") && heat > 0.05) tags.push(`<span>HEAT ${Math.round(heat * 100)}%</span>`);
  const bs = tags.join("");
  if (bs !== buffSig){ buffSig = bs; $("buffBox").innerHTML = bs; }
  if (treeOpen) renderTreeStats();   // ツリーを開いている間も発動状況バーを最新に保つ (中身が変わった時だけ再描画)
}

// ---------- ツリー画面 ----------
const tv = { x: 0, y: 0, s: 0 };   // パン / ズーム
let selId = null, hoverId = null, treeBuilt = false;
function buildTree(){
  let lines = "", nodes = "", labels = "";
  for (let d = 1; d <= 6; d++) lines += `<circle cx="${TREE_C}" cy="${TREE_C}" r="${treeRadius(d)}" class="t-ring"/>`;
  for (const n of SKILLS){
    const px = n.parent ? n.parent.x : TREE_C, py = n.parent ? n.parent.y : TREE_C;
    lines += `<line data-ln="${n.id}" x1="${px.toFixed(1)}" y1="${py.toFixed(1)}" x2="${n.x.toFixed(1)}" y2="${n.y.toFixed(1)}" style="--c:${n.br.color}"/>`;
    nodes += `<button class="tn${n.depth >= 8 ? " cap" : ""}" data-id="${n.id}" style="left:${n.x.toFixed(1)}px;top:${n.y.toFixed(1)}px;--c:${n.br.color}">${skillSVG(n)}${n.cost > 1 ? `<i class="tn-cost">${n.cost}</i>` : ""}</button>`;
  }
  for (const br of BRANCHES){
    const r = treeRadius(6) + 78, x = TREE_C + Math.cos(br.ang) * r, y = TREE_C + Math.sin(br.ang) * r;
    labels += `<div class="t-label" style="left:${x.toFixed(1)}px;top:${y.toFixed(1)}px;color:${br.color}"><b>${br.name}</b><span>${br.en}</span></div>`;
  }
  $("treeWorld").style.width = $("treeWorld").style.height = TREE_SIZE + "px";
  $("treeWorld").innerHTML = `<svg class="t-lines" width="${TREE_SIZE}" height="${TREE_SIZE}">${lines}</svg>
    <div class="t-core" style="left:${TREE_C}px;top:${TREE_C}px"><span>Lv</span><b id="treeCoreLv"></b></div>${labels}${nodes}`;
  treeBuilt = true;
}
function applyView(){ $("treeWorld").style.transform = `translate(${tv.x}px,${tv.y}px) scale(${tv.s})`; positionDetail(); }
function refreshTree(){
  if (!treeBuilt) return;
  const sp = spLeft(), avail = elemAvail();
  document.querySelectorAll("#treeWorld .tn").forEach(el => {
    const n = SKILL[el.dataset.id], on = sk(n.id), open = skillUnlocked(n);
    const ls = on ? skillLiveState(n.id, avail) : null;
    el.classList.toggle("on", on);
    el.classList.toggle("can", !on && open && sp >= n.cost);
    el.classList.toggle("wait", !on && open && sp < n.cost);
    el.classList.toggle("sel", n.id === selId);
    el.classList.toggle("live", ls === "live");   // 緑ドット: いま発動中
    el.classList.toggle("idle", ls === "idle");   // 灰ドット: 習得済みだが条件待ち
  });
  document.querySelectorAll("#treeWorld [data-ln]").forEach(el => {
    const n = SKILL[el.dataset.ln];
    el.setAttribute("class", sk(n.id) ? "on" : skillUnlocked(n) ? "open" : "");
  });
  $("treeCoreLv").textContent = state.lv;
  $("treeSp").innerHTML = `スキルポイント <b>${sp}</b>`;
  $("treeCount").textContent = `習得 ${Object.keys(state.skills).length} / ${SKILLS.length}`;
  renderTreeStats();
  renderDetail();
}

// ---------- 発動の見える化: 現在値プローブ / 発動状況パネル / ノードの発動中判定 ----------
const elemAvail = () => { const t = elemTotals(); return { burn: t.burn > 0, frost: t.frost > 0, acid: t.acid > 0, rad: t.rad > 0, shock: t.shock > 0 }; };
// 数値化できる派生ステータスを一括で測る (スキルを付け外しして前後比較するために使う)
function probeStats(){
  const ec = elemChances();
  return {
    dmg: globalDmgMul(),
    critP: (sk("a_crit") ? 0.06 : 0) + artVal("crit") / 100 + (artHas("lg_void") ? 0.20 : 0),
    critX: Math.max((sk("a_critx") ? 3 : 2) + artVal("critd") / 100, artHas("lg_void") ? 3 : 0),
    rate: playerRate(), bot: botMul(), crate: crewRate(),
    elem: elemMul(), burnD: burnSetMul(), drop: matDropMul(), speed: playerSpeed(),
    bots: botCount(), cbots: coinBotCount(),
    ec_burn: ec.burn, ec_frost: ec.frost, ec_acid: ec.acid, ec_rad: ec.rad, ec_shock: ec.shock,
  };
}
function probeWith(id, on){
  const had = state.skills[id];
  if (on) state.skills[id] = 1; else delete state.skills[id];
  const p = probeStats();
  if (had) state.skills[id] = 1; else delete state.skills[id];
  return p;
}
const _fxX = v => "×" + v.toFixed(2), _fxPct = v => Math.round(v * 100) + "%", _fxInt = v => "" + Math.round(v);
const _dfX = d => (d >= 0 ? "+" : "") + d.toFixed(2), _dfPct = d => (d >= 0 ? "+" : "") + Math.round(d * 100) + "%", _dfInt = d => (d >= 0 ? "+" : "") + Math.round(d);
const PROBE_DEFS = [
  { key: "dmg",   label: "全ダメージ",       fmt: _fxX,   diff: _dfX,   eps: 0.001 },
  { key: "critP", label: "会心率",           fmt: _fxPct, diff: _dfPct, eps: 0.0005 },
  { key: "critX", label: "会心ダメージ",     fmt: _fxX,   diff: _dfX,   eps: 0.001 },
  { key: "rate",  label: "自機の連射",       fmt: _fxX,   diff: _dfX,   eps: 0.001 },
  { key: "bot",   label: "攻撃ボット威力",   fmt: _fxX,   diff: _dfX,   eps: 0.001 },
  { key: "crate", label: "仲間の連射",       fmt: _fxX,   diff: _dfX,   eps: 0.001 },
  { key: "elem",  label: "状態異常ダメージ", fmt: _fxX,   diff: _dfX,   eps: 0.001 },
  { key: "burnD", label: "燃焼ダメージ",     fmt: _fxX,   diff: _dfX,   eps: 0.001 },
  { key: "drop",  label: "素材ドロップ",     fmt: _fxX,   diff: _dfX,   eps: 0.001 },
  { key: "speed", label: "移動速度",         fmt: _fxInt, diff: _dfInt, eps: 0.5 },
  { key: "bots",  label: "攻撃ボット",       fmt: _fxInt, diff: _dfInt, eps: 0.5 },
  { key: "cbots", label: "回収ボット",       fmt: _fxInt, diff: _dfInt, eps: 0.5 },
  { key: "ec_burn",  label: "燃焼付与率 (スキル分)", fmt: _fxPct, diff: _dfPct, eps: 0.0005 },
  { key: "ec_frost", label: "氷結付与率 (スキル分)", fmt: _fxPct, diff: _dfPct, eps: 0.0005 },
  { key: "ec_acid",  label: "腐食付与率 (スキル分)", fmt: _fxPct, diff: _dfPct, eps: 0.0005 },
  { key: "ec_rad",   label: "放射付与率 (スキル分)", fmt: _fxPct, diff: _dfPct, eps: 0.0005 },
  { key: "ec_shock", label: "放電率 (スキル分)",     fmt: _fxPct, diff: _dfPct, eps: 0.0005 },
];
// 詳細ポップオーバー用: そのスキルで変わる数値を「現在 → 取得後」/「発動中 (このスキルで +n)」で出す
function skillEffectLines(n){
  const on = sk(n.id), cur = probeStats(), alt = probeWith(n.id, !on), rows = [];
  for (const d of PROBE_DEFS){
    const a = cur[d.key], b = alt[d.key];
    if (Math.abs(a - b) < d.eps) continue;
    if (on) rows.push(`<div class="td-fx on"><span class="td-fx-label">${d.label}</span> <b>${d.fmt(a)}</b><span class="td-fx-sub">発動中 ・ このスキルで ${d.diff(a - b)}</span></div>`);
    else rows.push(`<div class="td-fx"><span class="td-fx-label">${d.label}</span> <b>${d.fmt(a)}</b> → <b class="up">${d.fmt(b)}</b><span class="td-fx-sub">習得すると ${d.diff(b - a)}</span></div>`);
  }
  if (!rows.length) return "";
  return `<div class="td-fx-head">${on ? "数値で見る効果 (現在値)" : "習得するとこう変わる"}</div>` + rows.join("");
}
// スキル → 発動カウンタの対応 (詳細に「今セッションの発動: n回」を出す)
const SKILL_PROC = {
  b_elem: [["burn", "燃焼付与"], ["frost", "氷結付与"], ["acid", "腐食付与"], ["rad", "放射付与"], ["shock", "放電"]],
  a_burn: [["burn", "燃焼付与"]], b_burn: [["burn", "燃焼付与"]], b_plasma: [["burn", "燃焼付与"]], b_sun: [["burn", "燃焼付与"]],
  b_burn2: [["burn", "燃焼の燃え移り"]], b_wildfire: [["burn", "燃焼の燃え移り"]],
  b_frost: [["frost", "氷結付与"]], b_frost2: [["frost", "氷結付与"]], b_permafrost: [["frost", "氷結付与"]],
  b_frost3: [["frost", "氷結伝播"]], b_icebreak: [["icebreak", "氷砕"]], b_glacier: [["icebreak", "氷砕"]],
  b_thermo: [["thermo", "熱衝撃"]],
  b_acid: [["acid", "腐食付与"]], b_melt: [["acid", "腐食付与"]],
  b_radio: [["rad", "放射付与"]], b_decay: [["rad", "放射付与"]],
  b_shock: [["shock", "放電"]], b_tesla: [["shock", "放電"]], b_conductor: [["shock", "放電"]], b_overload: [["shock", "放電"]],
  b_firestorm: [["firestorm", "火炎嵐"]], b_supernova: [["firestorm", "火炎嵐"]],
  a_bolt: [["bolt", "落雷"]], a_meteor: [["meteor", "隕石"]], a_meteor2: [["meteor", "隕石"]],
  c_jackpot: [["jackpot", "JACKPOT"]], c_jackpot2: [["jackpot", "JACKPOT"]],
  e_treasure: [["treasure", "お宝出現"], ["treasureBreak", "お宝破壊"]], e_treasure2: [["treasure", "お宝出現"], ["treasureBreak", "お宝破壊"]], e_treasure3: [["treasure", "お宝出現"], ["treasureBreak", "お宝破壊"]],
  e_chain: [["chain", "連破"]], e_chain2: [["chain", "連破"]],
  e_blast: [["blast", "発破"]], e_blast2: [["blast", "発破"]], e_blast3: [["blast", "発破"]],
  e_quake2: [["quake", "地震"]],
};
function skillProcLines(n){
  if (!sk(n.id)) return "";
  const list = SKILL_PROC[n.id];
  if (!list) return "";
  return `<div class="td-proc">今セッションの発動: ${list.map(([k, label]) => `${label} <b>${skillProc[k]}回</b>`).join(" ・ ")}</div>`;
}
// 習得済みスキルの「いま発動しているか」: 条件付きスキルと、元素の前提が要る派生スキだけ条件を見る (他は常時発動)
const SKILL_COND = {
  a_combo: () => combo > 0, c_combo: () => combo >= 10, a_warm: () => heat > 0.05,
  a_close: () => nearClose, a_point: () => nearClose, d_cruise: () => !!player.moving,
};
const SKILL_NEED_ELEM = {
  b_frost2: "frost", b_icebreak: "frost", b_frost3: "frost", b_frostbite: "frost", b_iceage: "frost", b_zero: "frost", b_permafrost: "frost",
  b_burn2: "burn", b_ember: "burn", b_firestorm: "burn", b_supernova: "burn", b_magma: "burn", b_sun: "burn", b_wildfire: "burn",
  b_melt: "acid", b_decay: "rad", b_conductor: "shock", b_overload: "shock",
};
function skillLiveState(id, avail){
  if (!sk(id)) return null;
  if (id === "b_thermo") return (avail.burn && avail.frost) ? "live" : "idle";
  const cond = SKILL_COND[id];
  if (cond) return cond() ? "live" : "idle";
  const need = SKILL_NEED_ELEM[id];
  if (need) return avail[need] ? "live" : "idle";
  return "live";
}
// ツリー画面上部の「発動状況」バー: 現在の武器での付与率・倍率と、セッション発動回数
let treeStatsSig = "";
function renderTreeStats(){
  const el = $("treeStats");
  if (!el) return;
  const t = elemTotals(), P = skillProc;
  const sig = [t.burn, t.frost, t.acid, t.rad, t.shock, elemMul(), P.burn, P.frost, P.acid, P.rad, P.shock, P.blast, P.chain, P.treasure].join("|");
  if (sig === treeStatsSig) return;
  treeStatsSig = sig;
  const pct = v => (v * 100).toFixed(v > 0 && v < 0.1 ? 1 : 0) + "%";
  const procs = [["blast", "発破"], ["chain", "連破"], ["treasure", "お宝出現"], ["treasureBreak", "お宝破壊"], ["firestorm", "火炎嵐"], ["icebreak", "氷砕"], ["thermo", "熱衝撃"], ["meteor", "隕石"], ["bolt", "落雷"], ["quake", "地震"], ["jackpot", "JACKPOT"]]
    .filter(([k]) => P[k] > 0).map(([k, l]) => `${l} <b>${P[k]}回</b>`).join(" ・ ");
  el.innerHTML = `<span class="ts-group"><b class="ts-title">発動状況</b>元素付与率 (${WEAPONS[state.weapon].name}) 燃焼 <b>${pct(t.burn)}</b> ・ 氷結 <b>${pct(t.frost)}</b> ・ 腐食 <b>${pct(t.acid)}</b> ・ 放射 <b>${pct(t.rad)}</b> ・ 放電 <b>${pct(t.shock)}</b> ／ 状態異常ダメージ <b>×${elemMul().toFixed(2)}</b></span>`
    + `<span class="ts-group">付与回数 燃焼 <b>${P.burn}回</b> ・ 氷結 <b>${P.frost}回</b> ・ 腐食 <b>${P.acid}回</b> ・ 放射 <b>${P.rad}回</b> ・ 放電 <b>${P.shock}回</b>${procs ? ` ／ ${procs}` : ""}</span>`;
}
function renderDetail(){
  const n = SKILL[hoverId || selId];
  if (!n){
    $("treeDetail").innerHTML = `<div class="td-empty"><b>スキルツリー</b>
      <p>ブロックを壊すと経験値が入り、レベルアップでスキルポイントが手に入る (5レベルごとにボーナス +1)。レベル1ごとに全ダメージ +2%。</p>
      <p>中心から外へ、線でつながった順に習得できる。スキルは全てパッシブ (常時発動)。外周の大きなスキルは各系統の切り札。</p>
      <p>${TOUCH_UI ? "ノードをタップで選択、下に出る「習得」ボタンで習得。" : "ノードをクリックすると、近くに詳細と「習得」ボタンが出る。ダブルクリックか Enter でも習得できる。"}</p>
      <p>習得済みノードの<b>緑の点は「いま発動中」</b>、灰色の点は「条件待ち」の印。画面上の「発動状況」バーで、現在の付与率と今セッションの発動回数がいつでも確認できる。詳細では効果が現在値でどう変わるかも数値で出る。</p>
      ${BRANCHES.map(b => `<div class="td-br" style="color:${b.color}"><b>${b.name}</b><span>${b.sub}</span></div>`).join("")}</div>`;
    positionDetail();
    return;
  }
  const on = sk(n.id), open = skillUnlocked(n), sp = spLeft();
  const ls = on ? skillLiveState(n.id, elemAvail()) : null;
  const status = on ? (ls === "idle" ? `<div class="td-state">習得済み ・ 条件待ち (条件を満たすと発動)</div>` : `<div class="td-state on">習得済み ・ 発動中</div>`)
    : !open ? (n.parent && !sk(n.parent.id) ? `<div class="td-state">未解放 — 先に「${n.parent.name}」が必要</div>` : `<div class="td-state">未解放 — Lv ${n.reqLv} 以上で解放 (現在 Lv ${state.lv})</div>`)
    : sp < n.cost ? `<div class="td-state">スキルポイントが足りない (あと ${n.cost - sp})</div>` : "";
  $("treeDetail").innerHTML = `<div class="td-top" style="--c:${n.br.color}">
      <div class="td-icon">${skillSVG(n)}</div>
      <div><h4>${n.name}</h4><div class="td-meta">${n.br.name} ・ パッシブ</div></div>
      <button class="td-close" id="tdClose" aria-label="閉じる">×</button>
    </div>
    <p>${n.desc}</p>
    <div class="td-cost">必要スキルポイント <b>${n.cost}</b>${n.reqLv ? ` ・ 必要Lv <b>${n.reqLv}</b>` : ""}</div>
    ${status}
    ${skillEffectLines(n)}
    ${skillProcLines(n)}
    ${!on && n.id === selId ? `<button class="buy-btn" id="learnBtn" ${canLearn(n) ? "" : "disabled"}><span>習得する</span><span>${TOUCH_UI ? "" : "Enter"}</span></button>` : ""}`;
  positionDetail();
}
// ---------- 詳細ポップオーバー: 選択/ホバー中のノードの近くに出す ----------
function clearTreeSelection(){ selId = null; hoverId = null; renderDetail(); }
function positionDetail(){
  const el = $("treeDetail"), n = SKILL[hoverId || selId];
  if (!treeOpen || !n || TOUCH_UI){   // 未選択 / 閉じている間 / タッチUI (下部シート固定) は CSS の定位置に戻す
    el.classList.remove("pop");
    el.style.left = el.style.top = el.style.right = el.style.bottom = "";
    return;
  }
  const orc = $("treeOverlay").getBoundingClientRect(), vr = $("treeView").getBoundingClientRect();
  const pw = el.offsetWidth || 264, ph = el.offsetHeight || 200;
  const nx = vr.left - orc.left + tv.x + n.x * tv.s, ny = vr.top - orc.top + tv.y + n.y * tv.s;   // ノード中心の画面座標 (#treeOverlay 基準)
  const nr = (n.depth >= 8 ? 66 : 46) * tv.s / 2, gap = 12, m = 8;
  let left = nx + nr + gap;                                        // 基本はノードの右隣
  if (left + pw > orc.width - m) left = nx - nr - gap - pw;        // 右に収まらなければ左隣へ回り込む
  left = Math.max(m, Math.min(left, Math.max(m, orc.width - pw - m)));
  const minTop = vr.top - orc.top + 6, maxTop = Math.max(minTop, orc.height - ph - m);
  const top = Math.max(minTop, Math.min(ny - ph / 2, maxTop));     // ノード中心の高さに合わせ、上下はツリー表示域内にクランプ
  el.classList.add("pop");
  el.style.right = el.style.bottom = "auto";
  el.style.left = left + "px"; el.style.top = top + "px";
}
function tryLearn(id){
  const n = SKILL[id];
  if (!n || !canLearn(n)){ sndFail(); return; }
  state.skills[id] = 1;
  sndLevel();
  onSkillsChanged();
}
// 習得 / 振り直しのあと: スキルで増減する機体数や表示を合わせ直す
function onSkillsChanged(){
  syncBots(); syncCoinBots();
  gMul = globalDmgMul();
  save(); refreshTree(); renderPanels(true); hudSig = "";
}
function toggleTree(open){
  const want = open === undefined ? !treeOpen : open;
  if (want && (!started || cleared)) return;
  treeOpen = want;
  $("treeOverlay").classList.toggle("open", treeOpen);
  if (!treeOpen){ hoverId = null; return; }
  if (!treeBuilt) buildTree();
  if (!tv.s){   // 初回は中心 (系統の入口) が見える倍率で開く
    const r = $("treeView").getBoundingClientRect();
    tv.s = Math.max(0.42, Math.min(1, r.height / 900));
    tv.x = r.width / 2 - TREE_C * tv.s; tv.y = r.height / 2 - TREE_C * tv.s;
  }
  applyView(); refreshTree();
}

$("treeBtn").addEventListener("click", () => toggleTree());
$("treeClose").addEventListener("click", () => toggleTree(false));
$("respecBtn").addEventListener("click", () => {
  if (!Object.keys(state.skills).length) return;
  if (!confirm("習得したスキルを全て解除して、スキルポイントを振り直しますか？ (無料)")) return;
  state.skills = {};
  burns.clear(); bombs.length = 0; bombSet.clear(); vuln.clear();
  selId = null;
  onSkillsChanged();
});
$("treeWorld").addEventListener("click", e => {
  const el = e.target.closest(".tn");
  if (!el) return;
  selId = el.dataset.id; refreshTree();
});
$("treeWorld").addEventListener("dblclick", e => { const el = e.target.closest(".tn"); if (el) tryLearn(el.dataset.id); });
$("treeWorld").addEventListener("mouseover", e => { const el = e.target.closest(".tn"); if (el && hoverId !== el.dataset.id){ hoverId = el.dataset.id; renderDetail(); } });
$("treeWorld").addEventListener("mouseout", e => { if (e.target.closest(".tn") && hoverId){ hoverId = null; renderDetail(); } });
$("treeDetail").addEventListener("click", e => {
  if (e.target.closest("#tdClose")){ clearTreeSelection(); return; }
  if (e.target.closest("#learnBtn")) tryLearn(selId);
});

// パン (ドラッグ) / ズーム (ホイール)
let drag = null;
$("treeView").addEventListener("pointerdown", e => {
  if (e.target.closest(".tn")) return;
  drag = { x: e.clientX - tv.x, y: e.clientY - tv.y, sx: e.clientX, sy: e.clientY, moved: false };
  $("treeView").setPointerCapture(e.pointerId);
  $("treeView").classList.add("dragging");
});
$("treeView").addEventListener("pointermove", e => { if (drag){ if (Math.abs(e.clientX - drag.sx) > 6 || Math.abs(e.clientY - drag.sy) > 6) drag.moved = true; tv.x = e.clientX - drag.x; tv.y = e.clientY - drag.y; applyView(); } });
const endDrag = () => { drag = null; $("treeView").classList.remove("dragging"); };
$("treeView").addEventListener("pointerup", () => { const d = drag; endDrag(); if (d && !d.moved && selId) clearTreeSelection(); });   // 何もない場所のクリック (ドラッグなし) で選択解除
$("treeView").addEventListener("pointercancel", endDrag);
$("treeView").addEventListener("wheel", e => {
  e.preventDefault();
  const r = $("treeView").getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top;
  const ns = Math.max(0.3, Math.min(1.8, tv.s * (e.deltaY < 0 ? 1.12 : 0.89)));
  tv.x = mx - (mx - tv.x) * ns / tv.s; tv.y = my - (my - tv.y) * ns / tv.s; tv.s = ns;
  applyView();
}, { passive: false });

// ---------- キー: T = ツリー ----------
window.addEventListener("keydown", e => {
  if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.code === "KeyT"){ toggleTree(); return; }
  if (treeOpen){
    if (e.key === "Escape"){ if (selId) clearTreeSelection(); else toggleTree(false); }   // 選択中はまずポップオーバーを閉じる
    else if (e.key === "Enter" && selId) tryLearn(selId);
    return;
  }
});

