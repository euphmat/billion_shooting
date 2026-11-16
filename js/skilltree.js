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
function applyView(){ $("treeWorld").style.transform = `translate(${tv.x}px,${tv.y}px) scale(${tv.s})`; }
function refreshTree(){
  if (!treeBuilt) return;
  const sp = spLeft();
  document.querySelectorAll("#treeWorld .tn").forEach(el => {
    const n = SKILL[el.dataset.id], on = sk(n.id), open = skillUnlocked(n);
    el.classList.toggle("on", on);
    el.classList.toggle("can", !on && open && sp >= n.cost);
    el.classList.toggle("wait", !on && open && sp < n.cost);
    el.classList.toggle("sel", n.id === selId);
  });
  document.querySelectorAll("#treeWorld [data-ln]").forEach(el => {
    const n = SKILL[el.dataset.ln];
    el.setAttribute("class", sk(n.id) ? "on" : skillUnlocked(n) ? "open" : "");
  });
  $("treeCoreLv").textContent = state.lv;
  $("treeSp").innerHTML = `スキルポイント <b>${sp}</b>`;
  $("treeCount").textContent = `習得 ${Object.keys(state.skills).length} / ${SKILLS.length}`;
  renderDetail();
}
function renderDetail(){
  const n = SKILL[hoverId || selId];
  if (!n){
    $("treeDetail").innerHTML = `<div class="td-empty"><b>スキルツリー</b>
      <p>ブロックを壊すと経験値が入り、レベルアップでスキルポイントが手に入る (5レベルごとにボーナス +1)。レベル1ごとに全ダメージ +2%。</p>
      <p>中心から外へ、線でつながった順に習得できる。スキルは全てパッシブ (常時発動)。外周の大きなスキルは各系統の切り札。</p>
      <p>${TOUCH_UI ? "ノードをタップで選択、下に出る「習得」ボタンで習得。" : "クリックで選択、ダブルクリックか Enter で習得。"}</p>
      ${BRANCHES.map(b => `<div class="td-br" style="color:${b.color}"><b>${b.name}</b><span>${b.sub}</span></div>`).join("")}</div>`;
    return;
  }
  const on = sk(n.id), open = skillUnlocked(n), sp = spLeft();
  const status = on ? `<div class="td-state on">習得済み</div>`
    : !open ? (n.parent && !sk(n.parent.id) ? `<div class="td-state">未解放 — 先に「${n.parent.name}」が必要</div>` : `<div class="td-state">未解放 — Lv ${n.reqLv} 以上で解放 (現在 Lv ${state.lv})</div>`)
    : sp < n.cost ? `<div class="td-state">スキルポイントが足りない (あと ${n.cost - sp})</div>` : "";
  $("treeDetail").innerHTML = `<div class="td-top" style="--c:${n.br.color}">
      <div class="td-icon">${skillSVG(n)}</div>
      <div><h4>${n.name}</h4><div class="td-meta">${n.br.name} ・ パッシブ</div></div>
    </div>
    <p>${n.desc}</p>
    <div class="td-cost">必要スキルポイント <b>${n.cost}</b>${n.reqLv ? ` ・ 必要Lv <b>${n.reqLv}</b>` : ""}</div>
    ${status}
    ${!on && n.id === selId ? `<button class="buy-btn" id="learnBtn" ${canLearn(n) ? "" : "disabled"}><span>習得する</span><span>${TOUCH_UI ? "" : "Enter"}</span></button>` : ""}`;
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
$("treeDetail").addEventListener("click", e => { if (e.target.closest("#learnBtn")) tryLearn(selId); });

// パン (ドラッグ) / ズーム (ホイール)
let drag = null;
$("treeView").addEventListener("pointerdown", e => {
  if (e.target.closest(".tn")) return;
  drag = { x: e.clientX - tv.x, y: e.clientY - tv.y };
  $("treeView").setPointerCapture(e.pointerId);
  $("treeView").classList.add("dragging");
});
$("treeView").addEventListener("pointermove", e => { if (drag){ tv.x = e.clientX - drag.x; tv.y = e.clientY - drag.y; applyView(); } });
const endDrag = () => { drag = null; $("treeView").classList.remove("dragging"); };
$("treeView").addEventListener("pointerup", endDrag);
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
    if (e.key === "Escape") toggleTree(false);
    else if (e.key === "Enter" && selId) tryLearn(selId);
    return;
  }
});

