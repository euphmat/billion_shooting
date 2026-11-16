"use strict";
/* =========================================================
   artifacts.js - 宝箱 / アーティファクト (全50種・ランダム抽選・自動発動)
   - 各衛星に宝箱が3つ (浅い/中間/最深)。惑星が再生するたび宝箱も戻るので、
     繰り返し潜れば全50種コンプリートできる (ローグライク式)
   - 抽選: レアリティを引いてから、未所持の中からランダムに1つ
   - 効果は全部「所持しているだけで自動発動」。管理画面でコレクションと
     合計ボーナスを確認できる
   ========================================================= */
const RARITY = [
  { name:"コモン",       color:"#cfd8dc", w:50 },
  { name:"レア",         color:"#57b6ff", w:32 },
  { name:"エピック",     color:"#c792ff", w:13 },
  { name:"レジェンダリー", color:"#ffb340", w:5 },
];
// mod のキー: dmg 攻撃 / def 被ダメ減 / hp 最大HP / regen 回復速度 / regenAlways 常時回復(%/秒)
// spd 移動 / rate 連射 / coin コイン / xp 経験値 / drop 素材ドロップ / bot 攻撃ボット / cbot 回収ボット
// elem 元素 / burn 燃焼 / acid 腐食 / frostV 氷結弱点(加算) / shockP 放電率(pt) / crit 会心率(pt) / critd 会心ダメ
// deep 深さダメ / magnet 吸引 / splash 範囲 / sell 自動売却
// special: shield 結界 / zap 連鎖の稲妻 / meteor 隕石 / chestSense 宝箱探知 / mobDrop 星屑の収穫 / revive 不死
const ARTIFACTS = [
  // ---- コモン (20) ----
  { id:"st_dmg",  name:"旅人の護石",   rar:0, icon:"◆", desc:"攻撃力 +8%",            mod:{ dmg:.08 } },
  { id:"st_def",  name:"鉄壁の欠片",   rar:0, icon:"■", desc:"受けるダメージ -5%",    mod:{ def:.05 } },
  { id:"st_spd",  name:"疾風の羽根",   rar:0, icon:"▲", desc:"移動速度 +10%",         mod:{ spd:.10 } },
  { id:"st_mag",  name:"磁石の欠片",   rar:0, icon:"⬢", desc:"コイン吸引範囲 +25%",   mod:{ magnet:.25 } },
  { id:"st_hp",   name:"小さな心臓",   rar:0, icon:"●", desc:"最大HP +12%",           mod:{ hp:.12 } },
  { id:"st_reg",  name:"再生の雫",     rar:0, icon:"✦", desc:"HP回復速度 +40%",       mod:{ regen:.40 } },
  { id:"st_coin", name:"商人の小判",   rar:0, icon:"⬟", desc:"コイン +10%",           mod:{ coin:.10 } },
  { id:"st_xp",   name:"学びの欠片",   rar:0, icon:"♦", desc:"経験値 +10%",           mod:{ xp:.10 } },
  { id:"st_elem", name:"元素の欠片",   rar:0, icon:"❖", desc:"元素ダメージ +10%",     mod:{ elem:.10 } },
  { id:"st_drop", name:"掘削の欠片",   rar:0, icon:"♜", desc:"素材ドロップ +10%",     mod:{ drop:.10 } },
  { id:"st_bot",  name:"ボットの歯車", rar:0, icon:"⚙", desc:"攻撃ボット +10%",       mod:{ bot:.10 } },
  { id:"st_cbot", name:"回収の歯車",   rar:0, icon:"⚙", desc:"回収ボット +10%",       mod:{ cbot:.10 } },
  { id:"st_crit", name:"鋭い欠片",     rar:0, icon:"★", desc:"会心率 +3%",            mod:{ crit:3 } },
  { id:"st_critd",name:"重い欠片",     rar:0, icon:"★", desc:"会心ダメージ +25%",     mod:{ critd:25 } },
  { id:"st_rate", name:"速射の欠片",   rar:0, icon:"▲", desc:"連射速度 +8%",          mod:{ rate:.08 } },
  { id:"st_burn", name:"炎の欠片",     rar:0, icon:"◆", desc:"燃焼ダメージ +15%",     mod:{ burn:.15 } },
  { id:"st_frost",name:"氷の欠片",     rar:0, icon:"♦", desc:"氷結の弱点倍率 +0.1",   mod:{ frostV:.1 } },
  { id:"st_shock",name:"雷の欠片",     rar:0, icon:"✦", desc:"放電率 +6%",            mod:{ shockP:6 } },
  { id:"st_acid", name:"酸の欠片",     rar:0, icon:"●", desc:"腐食ダメージ +15%",     mod:{ acid:.15 } },
  { id:"st_hp2",  name:"巨人の骨",     rar:0, icon:"■", desc:"最大HP +12%",           mod:{ hp:.12 } },
  // ---- レア (16) ----
  { id:"r_dmg",   name:"戦神の護石",   rar:1, icon:"◆", desc:"攻撃力 +20%",           mod:{ dmg:.20 } },
  { id:"r_hp",    name:"不屈の心臓",   rar:1, icon:"●", desc:"最大HP +30%",           mod:{ hp:.30 } },
  { id:"r_reg",   name:"再生の心臓",   rar:1, icon:"✦", desc:"HP回復 +100%、常時回復 0.3%/秒", mod:{ regen:1.0, regenAlways:.3 } },
  { id:"r_spd",   name:"疾風の心臓",   rar:1, icon:"▲", desc:"移動速度 +18%、連射 +10%", mod:{ spd:.18, rate:.10 } },
  { id:"r_coin",  name:"黄金の心臓",   rar:1, icon:"⬟", desc:"コイン +25%",           mod:{ coin:.25 } },
  { id:"r_xp",    name:"賢者の心臓",   rar:1, icon:"♦", desc:"経験値 +25%",           mod:{ xp:.25 } },
  { id:"r_elem",  name:"元素の心臓",   rar:1, icon:"❖", desc:"元素ダメージ +25%",     mod:{ elem:.25 } },
  { id:"r_drop",  name:"豊穣の心臓",   rar:1, icon:"♜", desc:"素材ドロップ +25%",     mod:{ drop:.25 } },
  { id:"r_bot",   name:"司令の心臓",   rar:1, icon:"⚙", desc:"全ボット +22%",         mod:{ bot:.22, cbot:.22 } },
  { id:"r_crit",  name:"会心の心臓",   rar:1, icon:"★", desc:"会心率 +6%、会心ダメージ +40%", mod:{ crit:6, critd:40 } },
  { id:"r_burn",  name:"炎帝の欠片",   rar:1, icon:"◆", desc:"燃焼ダメージ +35%",     mod:{ burn:.35 } },
  { id:"r_frost", name:"氷帝の欠片",   rar:1, icon:"♦", desc:"氷結の弱点倍率 +0.2",   mod:{ frostV:.2 } },
  { id:"r_shock", name:"雷帝の欠片",   rar:1, icon:"✦", desc:"放電率 +12%",           mod:{ shockP:12 } },
  { id:"r_acid",  name:"腐食の心臓",   rar:1, icon:"●", desc:"腐食ダメージ +35%",     mod:{ acid:.35 } },
  { id:"r_deep",  name:"大地の心臓",   rar:1, icon:"■", desc:"深い場所ほど攻撃 +35%", mod:{ deep:.35 } },
  { id:"r_shield",name:"結界の欠片",   rar:1, icon:"⬢", desc:"20秒ごとに攻撃を1回防ぐ結界", mod:{}, special:"shield" },
  // ---- エピック (9) ----
  { id:"e_dmg",   name:"破壊神の核",   rar:2, icon:"◆", desc:"攻撃力 +40%",           mod:{ dmg:.40 } },
  { id:"e_phoe",  name:"不死鳥の核",   rar:2, icon:"●", desc:"最大HP +25%、常時回復 1%/秒", mod:{ hp:.25, regenAlways:1.0 } },
  { id:"e_rate",  name:"時詠みの核",   rar:2, icon:"▲", desc:"連射速度 +25%",         mod:{ rate:.25 } },
  { id:"e_harv",  name:"星屑の収穫者", rar:2, icon:"♜", desc:"モンスター撃破で看板素材が必ず落ちる。素材ドロップ +15%", mod:{ drop:.15 }, special:"mobDrop" },
  { id:"e_zap",   name:"連鎖の稲妻",   rar:2, icon:"✦", desc:"命中時12%で近くのブロックへ雷撃 (30%ダメージ)", mod:{}, special:"zap" },
  { id:"e_meteor",name:"隕石の腕輪",   rar:2, icon:"⬟", desc:"12秒ごとに隕石が落ちる", mod:{}, special:"meteor" },
  { id:"e_sense", name:"宝箱探知機",   rar:2, icon:"⬢", desc:"ミニマップに宝箱が表示される", mod:{}, special:"chestSense" },
  { id:"e_coin",  name:"商神の核",     rar:2, icon:"⬟", desc:"コイン +45%、自動売却 +50%", mod:{ coin:.45, sell:.5 } },
  { id:"e_deep",  name:"深淵の核",     rar:2, icon:"■", desc:"深い場所ほど攻撃 +80%", mod:{ deep:.80 } },
  // ---- レジェンダリー (5) ----
  { id:"l_sun",   name:"太陽の核",     rar:3, icon:"☀", desc:"攻撃 +35%、元素 +35%、燃焼 +50%", mod:{ dmg:.35, elem:.35, burn:.50 } },
  { id:"l_tree",  name:"世界樹の核",   rar:3, icon:"●", desc:"最大HP +60%、回復 +150%、常時回復 0.5%/秒", mod:{ hp:.60, regen:1.5, regenAlways:.5 } },
  { id:"l_end",   name:"終焉の核",     rar:3, icon:"◆", desc:"攻撃範囲 +1、攻撃力 +25%", mod:{ splash:1, dmg:.25 } },
  { id:"l_revive",name:"不死の核",     rar:3, icon:"✚", desc:"受けるダメージ -15%。倒れても50%でその場に復活", mod:{ def:.15 }, special:"revive" },
  { id:"l_origin",name:"原初の核",     rar:3, icon:"◉", desc:"攻撃・コイン・経験値・ボット・ドロップ すべて +20%", mod:{ dmg:.20, coin:.20, xp:.20, bot:.20, cbot:.20, drop:.20 } },
];
const ART_BY_ID = {};
for (const a of ARTIFACTS) ART_BY_ID[a.id] = a;
const artHas = id => !!state.artifacts[id];
function artVal(key){
  let s = 0;
  for (const a of ARTIFACTS) if (state.artifacts[a.id] && a.mod[key]) s += a.mod[key];
  return s;
}
function artSpecial(name){ for (const a of ARTIFACTS) if (a.special === name && state.artifacts[a.id]) return true; return false; }
const artOwnedCount = () => ARTIFACTS.filter(a => state.artifacts[a.id]).length;

// ---------- 宝箱 ----------
const CHEST_DEPTHS = [0.35, 0.65, 0.92];
const chests = [];          // {si, ci, gx, gy, x, y}
const openedChests = new Set(window.SAVED && SAVED.world && SAVED.world.chests || []);   // 開封済みの宝箱 (セーブに残る)
let chestsInit = false;
let artMeteorT = 12, artShieldT = 0, artZapBusy = false;
function chestKey(si, ci){ return si + "-" + ci; }
function initChests(){
  chestsInit = true;
  for (let si = 0; si < SATS.length; si++){
    const S = SATS[si];
    for (let ci = 0; ci < 3; ci++){
      const ang = hash01(si * 131 + ci * 57 + 3) * Math.PI * 2;
      const rr = (1 - CHEST_DEPTHS[ci]) * S.r;
      const gx = S.cx + Math.round(Math.cos(ang) * rr), gy = S.cy + Math.round(Math.sin(ang) * rr);
      chests.push({ si, ci, gx, gy, x: g2w(gx), y: g2w(gy) });
      const idx = gy * D + gx;
      if (!isDestroyed(idx)) markDestroyed(idx);   // 宝箱の置き場所を1マス空ける
    }
  }
}
function drawArtifact(){
  const rest = ARTIFACTS.filter(a => !state.artifacts[a.id]);
  if (!rest.length) return null;
  let roll = Math.random() * 100, want = 0;
  for (let r = 3; r >= 0; r--){ if (roll < RARITY[r].w + (r < 3 ? RARITY.slice(r + 1).reduce((s, x) => s + x.w, 0) : 0)) { want = r; break; } }
  // ↑ レアリティ抽選 (高レアほど出にくい)。枯渇していたら下のレアリティ→全体の順に探す
  for (let r = want; r >= 0; r--){
    const pool = rest.filter(a => a.rar === r);
    if (pool.length) return pool[(Math.random() * pool.length) | 0];
  }
  return rest[(Math.random() * rest.length) | 0];
}
function openChest(ch){
  openedChests.add(chestKey(ch.si, ch.ci));
  const art = drawArtifact();
  if (art){
    state.artifacts[art.id] = 1;
    showArtGet(art);
    updateArtBadge();
    save();
  } else {   // 全50種コンプリート済み: 代わりに大金
    const v = 800 + ch.si * 400;
    for (let k = 0; k < 6; k++) coinsArr.push({ x: ch.x, y: ch.y, vx: (Math.random() - .5) * 160, vy: (Math.random() - .5) * 160, value: Math.round(v / 6), chest: false, age: 0 });
    toast("宝箱: アーティファクトはコンプリート済み。コインを大量に得た");
  }
}
function updateArtifacts(dt){
  if (!chestsInit) initChests();
  // 宝箱との接触で開封
  if (started){
    for (const ch of chests){
      if (openedChests.has(chestKey(ch.si, ch.ci))) continue;
      const dx = player.x - ch.x, dy = player.y - ch.y;
      if (dx * dx + dy * dy < 42 * 42){ openChest(ch); break; }
    }
  }
  // 隕石の腕輪
  if (artSpecial("meteor")){
    artMeteorT -= dt;
    if (artMeteorT <= 0){
      artMeteorT = 12;
      const a = Math.random() * Math.PI * 2, d = 120 + Math.random() * 380;
      const tx = player.x + Math.cos(a) * d, ty = player.y + Math.sin(a) * d;
      const idx = findNearestBlock(tx, ty, 420);
      if (idx >= 0){
        const bx = g2w(idx % D), by = g2w((idx / D) | 0);
        rings.push({ x: bx, y: by, r: 150, t: performance.now(), color: "255,170,80", dur: 480 });
        damageRadius(bx, by, 130, shotDamage() * 6);
      }
    }
  }
  // 結界の欠片: 20秒で再展開
  if (artShieldT > 0) artShieldT -= dt;
}
function drawChests(toScreen, zoom){
  for (const ch of chests){
    const opened = openedChests.has(chestKey(ch.si, ch.ci));
    const [sx, sy] = toScreen(ch.x, ch.y);
    if (sx < -50 || sy < -50 || sx > CW + 50 || sy > CH + 50) continue;
    const w = 30 * zoom + 8, h = 22 * zoom + 6, bob = opened ? 0 : Math.sin(nowMs / 380 + ch.si * 2 + ch.ci) * 2.5;
    ctx.save(); ctx.translate(sx, sy + bob);
    if (!opened){   // 光の柱で宝箱をアピール
      const grd = ctx.createLinearGradient(0, -90, 0, 0);
      grd.addColorStop(0, "rgba(255,205,80,0)"); grd.addColorStop(1, "rgba(255,205,80,.30)");
      ctx.fillStyle = grd; ctx.fillRect(-3, -90, 6, 90);
    }
    ctx.globalAlpha = opened ? 0.35 : 1;
    ctx.fillStyle = opened ? "#6a5320" : "#c9922e";
    ctx.strokeStyle = "#ffe9a8"; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.rect(-w / 2, -h / 2, w, h); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.rect(-w / 2, -h / 2, w, h * 0.38); ctx.fill(); ctx.stroke();   // 蓋
    ctx.fillStyle = "#ffe9a8"; ctx.fillRect(-3, -4, 6, 8);   // 錠前
    ctx.restore();
  }
}

// ---------- 獲得演出 ----------
let artGetTimer = 0;
function showArtGet(art){
  const el = $("artGet");
  if (!el) return;
  const R = RARITY[art.rar];
  el.innerHTML = `<div class="ag-rar" style="color:${R.color}">${R.name} アーティファクト獲得！</div>` +
    `<div class="ag-name"><span class="ag-icon" style="color:${R.color}">${art.icon}</span>${art.name}</div>` +
    `<div class="ag-desc">${art.desc}</div><div class="ag-count">コレクション ${artOwnedCount()} / ${ARTIFACTS.length}</div>`;
  el.style.borderColor = R.color;
  el.classList.add("show");
  clearTimeout(artGetTimer);
  artGetTimer = setTimeout(() => el.classList.remove("show"), 4600);
}

// ---------- 管理画面 ----------
let artOpen = false;
function updateArtBadge(){
  const b = $("artBadge");
  if (b) b.textContent = artOwnedCount();
}
function openArtifacts(){
  artOpen = true;
  renderArtifacts();
  $("artOverlay").classList.add("open");
}
function closeArtifacts(){
  artOpen = false;
  $("artOverlay").classList.remove("open");
}
const MOD_LABEL = { dmg:"攻撃", def:"被ダメ減", hp:"最大HP", regen:"回復速度", regenAlways:"常時回復", spd:"移動速度", rate:"連射", coin:"コイン", xp:"経験値", drop:"素材ドロップ", bot:"攻撃ボット", cbot:"回収ボット", elem:"元素", burn:"燃焼", acid:"腐食", frostV:"氷結弱点", shockP:"放電率", crit:"会心率", critd:"会心ダメ", deep:"深さ攻撃", magnet:"吸引範囲", splash:"範囲", sell:"自動売却" };
function renderArtifacts(){
  const grid = $("artGrid"), sum = $("artSummary");
  if (!grid) return;
  // 合計ボーナス
  const sums = {};
  for (const a of ARTIFACTS) if (state.artifacts[a.id]) for (const k in a.mod) sums[k] = (sums[k] || 0) + a.mod[k];
  const parts = [];
  for (const k in sums){
    const v = sums[k];
    if (!v) continue;
    parts.push(MOD_LABEL[k] + " +" + (k === "crit" || k === "critd" || k === "shockP" ? Math.round(v) + "%" : k === "frostV" ? v.toFixed(1) : k === "regenAlways" ? v.toFixed(1) + "%/秒" : k === "splash" ? Math.round(v) : Math.round(v * 100) + "%"));
  }
  const specials = ARTIFACTS.filter(a => a.special && state.artifacts[a.id]).map(a => a.name);
  sum.innerHTML = `<b>${artOwnedCount()} / ${ARTIFACTS.length}</b> 所持中` +
    (parts.length ? `<div class="art-sum-line">${parts.join(" ・ ")}</div>` : "") +
    (specials.length ? `<div class="art-sum-line">特殊効果: ${specials.join(" / ")}</div>` : "") +
    `<div class="art-sum-note">宝箱は各衛星に3つ。惑星が再生すると宝箱も戻るので、繰り返し挑戦すればコンプリートできる。</div>`;
  grid.innerHTML = ARTIFACTS.map(a => {
    const owned = !!state.artifacts[a.id], R = RARITY[a.rar];
    return `<div class="art-card ${owned ? "" : "locked"}" style="border-color:${owned ? R.color : "#3a3f46"}">
      <div class="art-icon" style="color:${owned ? R.color : "#565d66"}">${owned ? a.icon : "?"}</div>
      <div class="art-main"><div class="art-name" style="color:${owned ? R.color : "#8a929c"}">${owned ? a.name : "？？？"}</div>
      <div class="art-rar">${R.name}</div><div class="art-desc">${owned ? a.desc : "まだ見つけていない"}</div></div></div>`;
  }).join("");
}
document.addEventListener("DOMContentLoaded", () => {});
setTimeout(() => {   // ボタンの配線 (スクリプトは body 末尾なので即時でよいが、念のため遅延)
  const btn = $("artBtn"), close = $("artClose");
  if (btn) btn.addEventListener("click", openArtifacts);
  if (close) close.addEventListener("click", closeArtifacts);
  const ov = $("artOverlay");
  if (ov) ov.addEventListener("click", e => { if (e.target === ov) closeArtifacts(); });
  updateArtBadge();
}, 0);
