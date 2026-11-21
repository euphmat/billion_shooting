"use strict";
/* =========================================================
   artifacts.js - 宝箱 / アーティファクト (全60種・ランダム抽選・自動発動)
   - 各衛星に宝箱が3つ (浅い/中間/最深)。惑星が再生するたび宝箱も戻るので、
     繰り返し潜れば全60種コンプリートできる (ローグライク式)
   - 抽選: レアリティを引いてから、未所持の中からランダムに1つ
   - 効果は全部「所持しているだけで自動発動」。管理画面でコレクションと
     合計ボーナスを確認できる
   - ティアは5段階: コモン (灰) / レア (青) / エピック (紫) / レジェンダリー (金) / ミシック (虹)
   - rar:4 = ミシック MYTHIC (最上位10種)。専用の虹色アニメ枠で表示され、
     効果は mod の乗算キー (dmgMul / coinMul / xpMul) と各所の専用フックで効く
   ========================================================= */
const RARITY = [
  { name:"コモン",       en:"COMMON",    color:"#cfd8dc", w:50 },
  { name:"レア",         en:"RARE",      color:"#57b6ff", w:32 },
  { name:"エピック",     en:"EPIC",      color:"#c792ff", w:13 },
  { name:"レジェンダリー", en:"LEGENDARY", color:"#ffb340", w:5 },
  { name:"ミシック",     en:"MYTHIC",    color:"#ffd700", w:2 },
];
// mod のキー: dmg 攻撃 / def 被ダメ減 / hp 最大HP / regen 回復速度 / regenAlways 常時回復(%/秒)
// spd 移動 / rate 連射 / coin コイン / xp 経験値 / drop 素材ドロップ / bot 攻撃ボット / cbot 回収ボット
// elem 元素 / burn 燃焼 / acid 腐食 / frostV 氷結弱点(加算) / shockP 放電率(pt) / crit 会心率(pt) / critd 会心ダメ
// deep 深さダメ / magnet 吸引 / splash 範囲 / sell 自動売却
// dmgMul / coinMul / xpMul は「乗算キー」: artMul() が (1+値) を掛け合わせる (ミシック専用)
// special: shield 結界 / zap 連鎖の稲妻 / meteor 隕石 / chestSense 宝箱探知 / mobDrop 星屑の収穫 / revive 不死
const ARTIFACTS = [
  // ---- コモン (20) ----
  { id:"st_dmg",  name:"旅人の護石",   rar:0, icon:"◆", desc:"攻撃力 +15%",           mod:{ dmg:.15 } },
  { id:"st_def",  name:"鉄壁の欠片",   rar:0, icon:"■", desc:"受けるダメージ -8%、最大HP +5%", mod:{ def:.08, hp:.05 } },
  { id:"st_spd",  name:"疾風の羽根",   rar:0, icon:"▲", desc:"移動速度 +15%、連射速度 +5%", mod:{ spd:.15, rate:.05 } },
  { id:"st_mag",  name:"磁石の欠片",   rar:0, icon:"⬢", desc:"コイン吸引範囲 +50%",   mod:{ magnet:.50 } },
  { id:"st_hp",   name:"小さな心臓",   rar:0, icon:"●", desc:"最大HP +20%",           mod:{ hp:.20 } },
  { id:"st_reg",  name:"再生の雫",     rar:0, icon:"✦", desc:"HP回復速度 +80%、常時回復 0.2%/秒", mod:{ regen:.80, regenAlways:.2 } },
  { id:"st_coin", name:"商人の小判",   rar:0, icon:"⬟", desc:"コイン +20%",           mod:{ coin:.20 } },
  { id:"st_xp",   name:"学びの欠片",   rar:0, icon:"♦", desc:"経験値 +20%",           mod:{ xp:.20 } },
  { id:"st_elem", name:"元素の欠片",   rar:0, icon:"❖", desc:"元素ダメージ +20%",     mod:{ elem:.20 } },
  { id:"st_drop", name:"掘削の欠片",   rar:0, icon:"♜", desc:"素材ドロップ +20%",     mod:{ drop:.20 } },
  { id:"st_bot",  name:"ボットの歯車", rar:0, icon:"⚙", desc:"攻撃ボット +20%",       mod:{ bot:.20 } },
  { id:"st_cbot", name:"回収の歯車",   rar:0, icon:"⚙", desc:"回収ボット +20%、コイン +5%", mod:{ cbot:.20, coin:.05 } },
  { id:"st_crit", name:"鋭い欠片",     rar:0, icon:"★", desc:"会心率 +5%、会心ダメージ +15%", mod:{ crit:5, critd:15 } },
  { id:"st_critd",name:"重い欠片",     rar:0, icon:"★", desc:"会心ダメージ +50%",     mod:{ critd:50 } },
  { id:"st_rate", name:"速射の欠片",   rar:0, icon:"▲", desc:"連射速度 +15%",         mod:{ rate:.15 } },
  { id:"st_burn", name:"炎の欠片",     rar:0, icon:"◆", desc:"燃焼ダメージ +30%",     mod:{ burn:.30 } },
  { id:"st_frost",name:"氷の欠片",     rar:0, icon:"♦", desc:"氷結の弱点倍率 +0.2、元素ダメージ +5%", mod:{ frostV:.2, elem:.05 } },
  { id:"st_shock",name:"雷の欠片",     rar:0, icon:"✦", desc:"放電率 +10%",           mod:{ shockP:10 } },
  { id:"st_acid", name:"酸の欠片",     rar:0, icon:"●", desc:"腐食ダメージ +30%",     mod:{ acid:.30 } },
  { id:"st_hp2",  name:"巨人の骨",     rar:0, icon:"■", desc:"最大HP +20%、受けるダメージ -3%", mod:{ hp:.20, def:.03 } },
  // ---- レア (15) ----
  { id:"r_dmg",   name:"戦神の護石",   rar:1, icon:"◆", desc:"攻撃力 +30%",           mod:{ dmg:.30 } },
  { id:"r_hp",    name:"不屈の心臓",   rar:1, icon:"●", desc:"最大HP +45%、常時回復 0.2%/秒", mod:{ hp:.45, regenAlways:.2 } },
  { id:"r_reg",   name:"再生の心臓",   rar:1, icon:"✦", desc:"HP回復 +150%、常時回復 0.5%/秒", mod:{ regen:1.5, regenAlways:.5 } },
  { id:"r_spd",   name:"疾風の心臓",   rar:1, icon:"▲", desc:"移動速度 +25%、連射 +15%", mod:{ spd:.25, rate:.15 } },
  { id:"r_coin",  name:"黄金の心臓",   rar:1, icon:"⬟", desc:"コイン +40%",           mod:{ coin:.40 } },
  { id:"r_xp",    name:"賢者の心臓",   rar:1, icon:"♦", desc:"経験値 +40%",           mod:{ xp:.40 } },
  { id:"r_elem",  name:"元素の心臓",   rar:1, icon:"❖", desc:"元素ダメージ +40%",     mod:{ elem:.40 } },
  { id:"r_drop",  name:"豊穣の心臓",   rar:1, icon:"♜", desc:"素材ドロップ +40%",     mod:{ drop:.40 } },
  { id:"r_bot",   name:"司令の心臓",   rar:1, icon:"⚙", desc:"全ボット +35%",         mod:{ bot:.35, cbot:.35 } },
  { id:"r_crit",  name:"会心の心臓",   rar:1, icon:"★", desc:"会心率 +8%、会心ダメージ +60%", mod:{ crit:8, critd:60 } },
  { id:"r_burn",  name:"炎帝の欠片",   rar:1, icon:"◆", desc:"燃焼ダメージ +60%",     mod:{ burn:.60 } },
  { id:"r_frost", name:"氷帝の欠片",   rar:1, icon:"♦", desc:"氷結の弱点倍率 +0.35、元素ダメージ +10%", mod:{ frostV:.35, elem:.10 } },
  { id:"r_shock", name:"雷帝の欠片",   rar:1, icon:"✦", desc:"放電率 +18%",           mod:{ shockP:18 } },
  { id:"r_acid",  name:"腐食の心臓",   rar:1, icon:"●", desc:"腐食ダメージ +60%",     mod:{ acid:.60 } },
  { id:"r_deep",  name:"大地の心臓",   rar:1, icon:"■", desc:"深い場所ほど攻撃 +55%", mod:{ deep:.55 } },
  // ---- エピック (10) ----
  { id:"r_shield",name:"結界の欠片",   rar:2, icon:"⬢", desc:"12秒ごとに攻撃を1回防ぐ結界、受けるダメージ -5%", mod:{ def:.05 }, special:"shield" },
  { id:"e_dmg",   name:"破壊神の核",   rar:2, icon:"◆", desc:"攻撃力 +60%",           mod:{ dmg:.60 } },
  { id:"e_phoe",  name:"不死鳥の核",   rar:2, icon:"●", desc:"最大HP +40%、常時回復 1.5%/秒", mod:{ hp:.40, regenAlways:1.5 } },
  { id:"e_rate",  name:"時詠みの核",   rar:2, icon:"▲", desc:"連射速度 +40%",         mod:{ rate:.40 } },
  { id:"e_harv",  name:"星屑の収穫者", rar:2, icon:"♜", desc:"モンスター撃破で看板素材が必ず落ちる。素材ドロップ +30%", mod:{ drop:.30 }, special:"mobDrop" },
  { id:"e_zap",   name:"連鎖の稲妻",   rar:2, icon:"✦", desc:"命中時18%で近くのブロックへ雷撃 (50%ダメージ)", mod:{}, special:"zap" },
  { id:"e_meteor",name:"隕石の腕輪",   rar:2, icon:"⬟", desc:"8秒ごとに隕石が落ち、大ダメージを与える", mod:{}, special:"meteor" },
  { id:"e_sense", name:"宝箱探知機",   rar:2, icon:"⬢", desc:"ミニマップに宝箱が表示される。コイン +15%、素材ドロップ +15%", mod:{ coin:.15, drop:.15 }, special:"chestSense" },
  { id:"e_coin",  name:"商神の核",     rar:2, icon:"⬟", desc:"コイン +70%、自動売却 +100%", mod:{ coin:.70, sell:1.0 } },
  { id:"e_deep",  name:"深淵の核",     rar:2, icon:"■", desc:"深い場所ほど攻撃 +120%", mod:{ deep:1.20 } },
  // ---- レジェンダリー (5) ----
  { id:"l_sun",   name:"太陽の核",     rar:3, icon:"☀", desc:"攻撃 +50%、元素 +50%、燃焼 +80%、腐食 +50%", mod:{ dmg:.50, elem:.50, burn:.80, acid:.50 } },
  { id:"l_tree",  name:"世界樹の核",   rar:3, icon:"●", desc:"最大HP +90%、回復 +250%、常時回復 1%/秒", mod:{ hp:.90, regen:2.5, regenAlways:1.0 } },
  { id:"l_end",   name:"終焉の核",     rar:3, icon:"◆", desc:"攻撃範囲 +1、攻撃力 +40%、連射速度 +15%", mod:{ splash:1, dmg:.40, rate:.15 } },
  { id:"l_revive",name:"不死の核",     rar:3, icon:"✚", desc:"受けるダメージ -20%。倒れても75%の確率で、HP75%でその場に復活", mod:{ def:.20 }, special:"revive" },
  { id:"l_origin",name:"原初の核",     rar:3, icon:"◉", desc:"攻撃・コイン・経験値・ボット・ドロップ・元素 すべて +35%", mod:{ dmg:.35, coin:.35, xp:.35, bot:.35, cbot:.35, drop:.35, elem:.35 } },
  // ---- ミシック MYTHIC (10) ---- 最上位。color は固有のテーマカラー (一覧・獲得演出・固有演出で使う)
  { id:"lg_heart",  name:"惑星の心臓",   rar:4, icon:"♥", color:"#ff5a7a", desc:"全ダメージ ×1.65。4秒ごとに鼓動の衝撃波が広がり、周囲のブロックとモンスターに大ダメージ", mod:{ dmgMul:.65 } },
  { id:"lg_gold",   name:"黄金の特異点", rar:4, icon:"✸", color:"#ffd60a", desc:"コイン獲得 ×2.5。画面内のコインが自機へ強力に引き寄せられる", mod:{ coinMul:1.5 } },
  { id:"lg_nova",   name:"超新星の核",   rar:4, icon:"✹", color:"#ffa502", desc:"ブロックを50個壊すごとに超新星爆発。大範囲をまとめて破壊する", mod:{} },
  { id:"lg_gear",   name:"時空の歯車",   rar:4, icon:"◔", color:"#7df0ff", desc:"連射速度 +40%", mod:{ rate:.40 } },
  { id:"lg_crown",  name:"元素の王冠",   rar:4, icon:"♛", color:"#c792ff", desc:"全元素の付与率 +20%、状態異常ダメージ ×1.75", mod:{} },
  { id:"lg_void",   name:"虚無の単眼",   rar:4, icon:"◐", color:"#b06eff", desc:"クリティカル率 +25%、クリティカルダメージは最低でも ×3", mod:{} },
  { id:"lg_gaia",   name:"大地母神の腕", rar:4, icon:"✿", color:"#57e39a", desc:"ブロックを壊すと30%の確率で、上下左右のブロックも一緒に砕く", mod:{} },
  { id:"lg_phoenix",name:"不死鳥の灰",   rar:4, icon:"✜", color:"#ff7b3f", desc:"倒れても全HPで復活し、周囲に大爆発 (45秒に1回)。HP回復速度 ×4", mod:{ regen:3 } },
  { id:"lg_scepter",name:"星屑の王笏",   rar:4, icon:"⚜", color:"#ffe9a8", desc:"経験値 ×2.5。レベルアップ時に星が降り注ぎ、全モンスターに大ダメージ", mod:{ xpMul:1.5 } },
  { id:"lg_dice",   name:"混沌のサイコロ", rar:4, icon:"⚄", color:"#ff5a4a", desc:"命中時 7%でサイコロが転がり、強撃×5 / コインバースト / 全体凍結 / 大爆発 のどれかが発動", mod:{} },
];
const ART_BY_ID = {};
for (const a of ARTIFACTS) ART_BY_ID[a.id] = a;
const artHas = id => !!state.artifacts[id];
function artVal(key){
  let s = 0;
  for (const a of ARTIFACTS) if (state.artifacts[a.id] && a.mod[key]) s += a.mod[key];
  return s;
}
// 乗算キー用: 所持中の (1 + mod[key]) を全て掛け合わせる (例: dmgMul .5 → ×1.5)
function artMul(key){
  let m = 1;
  for (const a of ARTIFACTS) if (state.artifacts[a.id] && a.mod[key]) m *= 1 + a.mod[key];
  return m;
}
function artSpecial(name){ for (const a of ARTIFACTS) if (a.special === name && state.artifacts[a.id]) return true; return false; }
const artOwnedCount = () => ARTIFACTS.filter(a => state.artifacts[a.id]).length;

// ---------- 発動の見える化 (カウンタ + 左上の発動フィード + 一覧の発動表示) ----------
// スキルの見える化 (skillProc) と同じ思想: 発動回数はセッション限りで全数数え (セーブしない)、
// 発動した瞬間は画面左上の DOM フィードに小さなチップで知らせる (キャンバスには描かない)。
// チップはプール再利用し、同一アーティファクトの連続発動は集約して ×n 表示にする。
const artProc = {};   // id -> 今セッションの発動回数
// 離散的に「発動」するアーティファクト (ここに無いものは常時パッシブとして扱う)
const ART_PROC_IDS = new Set(["r_shield", "e_zap", "e_meteor", "e_harv", "l_revive",
  "lg_heart", "lg_nova", "lg_gaia", "lg_phoenix", "lg_scepter", "lg_dice", "lg_void"]);
// mod では表せない常時効果の補足 (一覧の「発動中」表示用)
const ART_LIVE_NOTE = {
  lg_crown: "全元素の付与率 +20% ・ 状態異常ダメージ ×1.75",
  lg_gold: "コインを強力に吸引中",
  lg_gear: "残像を発生中",
  e_sense: "ミニマップに宝箱を表示中",
};
function bumpArtProc(id){
  artProc[id] = (artProc[id] || 0) + 1;   // カウンタは間引かず全数数える
  const a = ART_BY_ID[id];
  if (a) artFeedShow(a);
}
// そのアーティファクトの mod を「攻撃 +60% ・ 連射 +15%」形式に (一覧の発動中表示用)
function artModText(a){
  const parts = [];
  for (const k in a.mod){
    const v = a.mod[k];
    if (!v) continue;
    if (k === "dmgMul" || k === "coinMul" || k === "xpMul") parts.push(MOD_LABEL[k] + " ×" + parseFloat((1 + v).toFixed(2)));
    else if (k === "crit" || k === "critd" || k === "shockP") parts.push(MOD_LABEL[k] + " +" + Math.round(v) + "%");
    else if (k === "frostV") parts.push(MOD_LABEL[k] + " +" + v.toFixed(1));
    else if (k === "regenAlways") parts.push(MOD_LABEL[k] + " +" + v + "%/秒");
    else if (k === "splash") parts.push(MOD_LABEL[k] + " +" + Math.round(v));
    else parts.push(MOD_LABEL[k] + " +" + Math.round(v * 100) + "%");
  }
  return parts.join(" ・ ");
}

// ----- 発動フィード (左上に積む DOM チップ。発動時のみ DOM を触る) -----
const ART_FEED_MAX = 5;      // 同時に出すチップの上限
const ART_FEED_LIFE = 2600;  // チップの表示時間 (ms)
const artFeedVisible = new Map();   // id -> chip rec (表示中のみ)
const artFeedPool = [];             // 使い回すチップ要素 (新規生成はプールが空のときだけ)
let artFeedBox = null, artFeedSeq = 0;
function artFeedRec(){
  if (artFeedPool.length) return artFeedPool.pop();
  const el = document.createElement("div");
  el.className = "art-chip";
  const icon = document.createElement("span"); icon.className = "af-icon";
  const name = document.createElement("span"); name.className = "af-name";
  const cnt = document.createElement("span"); cnt.className = "af-cnt";
  el.appendChild(icon); el.appendChild(name); el.appendChild(cnt);
  return { el, icon, name, cnt, id: null, n: 0, seq: 0, feedAt: 0, timer: 0, fadeTimer: 0 };
}
function artFeedRelease(rec){   // フェードが終わったチップを外してプールへ戻す
  if (rec.id != null && artFeedVisible.get(rec.id) === rec) artFeedVisible.delete(rec.id);
  rec.id = null; rec.n = 0;
  rec.el.classList.remove("show"); rec.el.classList.remove("mythic");
  if (rec.el.parentNode) rec.el.parentNode.removeChild(rec.el);
  artFeedPool.push(rec);
}
function artFeedExpire(rec){   // 表示時間が切れたらフェードさせ、終わったら手放す
  rec.el.classList.remove("show");
  rec.fadeTimer = setTimeout(() => artFeedRelease(rec), 400);
}
function artFeedShow(a){
  if (!artFeedBox){ artFeedBox = $("artFeed"); if (!artFeedBox) return; }
  const rec = artFeedVisible.get(a.id);
  if (rec){   // 表示中の同一アーティファクトは集約: ×n を増やし寿命を延ばす (チップは増やさない)
    rec.n++;
    if (rec.n > 1) rec.cnt.textContent = "×" + rec.n;
    const now = Date.now();
    if (now - rec.feedAt >= 120){   // 寿命延長と並び替えは間引く (発動が頻発しても軽く保つ)
      rec.feedAt = now; rec.seq = ++artFeedSeq;
      clearTimeout(rec.timer); clearTimeout(rec.fadeTimer);
      rec.el.classList.add("show");
      rec.timer = setTimeout(() => artFeedExpire(rec), ART_FEED_LIFE);
      artFeedBox.prepend(rec.el);
    }
    return;
  }
  if (artFeedVisible.size >= ART_FEED_MAX){   // 上限: いちばん古いチップを押し出す
    let old = null;
    for (const r of artFeedVisible.values()) if (!old || r.seq < old.seq) old = r;
    if (old){ clearTimeout(old.timer); clearTimeout(old.fadeTimer); artFeedRelease(old); }
  }
  const nr = artFeedRec(), col = a.color || RARITY[a.rar].color;
  nr.id = a.id; nr.n = 1; nr.seq = ++artFeedSeq; nr.feedAt = Date.now();
  nr.icon.textContent = a.icon; nr.icon.style.color = col;
  nr.name.textContent = a.name;
  nr.cnt.textContent = "";
  nr.el.classList.toggle("mythic", a.rar === 4);
  nr.el.style.borderLeftColor = a.rar === 4 ? "" : col;
  artFeedVisible.set(a.id, nr);
  artFeedBox.appendChild(nr.el);
  artFeedBox.prepend(nr.el);
  void nr.el.offsetWidth;   // 初回だけ: 遷移 (フェードイン) を効かせてから show する
  nr.el.classList.add("show");
  nr.timer = setTimeout(() => artFeedExpire(nr), ART_FEED_LIFE);
}

// ---------- 宝箱 ----------
const CHEST_DEPTHS = [0.35, 0.65, 0.92];
const chests = [];          // {si, ci, gx, gy, x, y}
const openedChests = new Set(window.SAVED && SAVED.world && SAVED.world.chests || []);   // 開封済みの宝箱 (セーブに残る)
let chestsInit = false;
let artMeteorT = 8, artShieldT = 0, artZapBusy = false;
// ミシックの継続効果用 (セーブしない)
let artHeartT = 4, artPhoenixT = 0, novaArtN = 0, novaBusy = false;
let diceFxT = 0, diceSettled = 1, diceColor = "#ffffff";
const playerTrail = [];   // 時空の歯車: 残像用に自機の直近位置を保持 (最大9件、追加確保なしで使い回す)
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
  // レアリティ抽選 (高レアほど出にくい)。重みの合計で割るので、ティアを足しても比率は保たれる
  const totalW = RARITY.reduce((s, x) => s + x.w, 0);
  let roll = Math.random() * totalW, want = 0, acc = 0;
  for (let r = RARITY.length - 1; r >= 0; r--){ acc += RARITY[r].w; if (roll < acc){ want = r; break; } }
  // 枯渇していたら下のレアリティ→全体の順に探す
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
  } else {   // 全60種コンプリート済み: 代わりに大金
    const v = 800 + ch.si * 400;
    for (let k = 0; k < 6; k++) spawnCoin({ x: ch.x, y: ch.y, vx: (Math.random() - .5) * 160, vy: (Math.random() - .5) * 160, value: Math.round(v / 6), chest: false, age: 0 });
    toast("宝箱: アーティファクトはコンプリート済み。コインを大量に得た", "good");
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
      artMeteorT = 8;
      const a = Math.random() * Math.PI * 2, d = 120 + Math.random() * 380;
      const tx = player.x + Math.cos(a) * d, ty = player.y + Math.sin(a) * d;
      const idx = findNearestBlock(tx, ty, 420);
      if (idx >= 0){
        const bx = g2w(idx % D), by = g2w((idx / D) | 0);
        addRing({ x: bx, y: by, r: 175, t: performance.now(), color: "255,170,80", dur: 480 });
        damageRadius(bx, by, 160, shotDamage() * 10);
        bumpArtProc("e_meteor");
      }
    }
  }
  // 結界の欠片: 20秒で再展開
  if (artShieldT > 0) artShieldT -= dt;
  // ---- ミシックの継続効果 (タイマーは既存の更新ループに相乗り) ----
  if (artPhoenixT > 0) artPhoenixT -= dt;   // 不死鳥の灰: 復活のクールダウン
  if (diceFxT > 0) diceFxT -= dt;           // 混沌のサイコロ: 演出タイマー
  if (artHas("lg_heart") && started){       // 惑星の心臓: 4秒ごとに鼓動の衝撃波
    artHeartT -= dt;
    if (artHeartT <= 0){ artHeartT = 4; heartPulse(); }
  }
  if (artHas("lg_gear")){                   // 時空の歯車: 残像用の位置履歴
    playerTrail.unshift({ x: player.x, y: player.y, angle: player.angle });
    if (playerTrail.length > 9) playerTrail.pop();
  } else if (playerTrail.length) playerTrail.length = 0;
}

// ---------- ミシック: 発動系の効果と演出 ----------
// 惑星の心臓: 鼓動の衝撃波 (二重のリング + 範囲ダメージ。モンスターにも当たる)
function heartPulse(){
  bumpArtProc("lg_heart");
  addRing({ x: player.x, y: player.y, r: 300, t: performance.now(), color: "255,90,122", dur: 650 });
  addRing({ x: player.x, y: player.y, r: 185, t: performance.now(), color: "255,160,180", dur: 480 });
  rawDamage(() => damageRadius(player.x, player.y, 280, playerDamage() * 6));
}
// 超新星の核: 50個破壊ごとの大爆発 (虹色の三重リング + 星バースト)
function supernovaAt(x, y){
  bumpArtProc("lg_nova");
  addRing({ x, y, r: BS * 7,   t: performance.now(), color: "255,90,90",   dur: 700 });
  addRing({ x, y, r: BS * 5.5, t: performance.now(), color: "120,255,140", dur: 600 });
  addRing({ x, y, r: BS * 4,   t: performance.now(), color: "130,160,255", dur: 500 });
  burstAt(x, y, { accent: "#ffa502", c2: "#ffffff", burst: "star" }, null);
  damageRadius(x, y, BS * 6, playerDamage() * 16);
  sndBoom();
}
// 不死鳥の灰: 復活時の大爆発 (炎の翼のような花弁バースト x3 + 範囲ダメージ)
function phoenixBlast(){
  bumpArtProc("lg_phoenix");
  for (let k = 0; k < 3; k++) burstAt(player.x, player.y, { accent: "#ff7b3f", c2: "#ffd60a", burst: "petal" }, null);
  addRing({ x: player.x, y: player.y, r: 340, t: performance.now(), color: "255,123,63", dur: 620 });
  addRing({ x: player.x, y: player.y, r: 210, t: performance.now(), color: "255,214,10", dur: 460 });
  rawDamage(() => damageRadius(player.x, player.y, 320, playerDamage() * 12));
  sndBoom();
}
// 星屑の王笏: レベルアップ時に星が降り注ぐ (ビーム + リング + 大ダメージ、同時演出は24体まで)
function scepterStarfall(){
  let n = 0;
  for (const m of mobs){
    if (m.dead) continue;
    addBeam({ x1: m.x + 300, y1: m.y - 900, x2: m.x, y2: m.y, t: performance.now(), w: 4, color: "#ffe9a8", life: 220 });
    addRing({ x: m.x, y: m.y, r: 90, t: performance.now(), color: "255,233,168", dur: 400 });
    damageMob(m, playerDamage() * 20, null);
    if (++n >= 24) break;
  }
  if (n) bumpArtProc("lg_scepter");
}
// 混沌のサイコロ: 結果を浮かぶ文字で知らせる (ダメージ数値のプールに相乗り)
function diceLabel(text, color){
  if (dmgLabels.length >= MAX_DMG_LABELS) return;
  const d = dmgPool.pop() || {};
  d.x = player.x; d.y = player.y - 46; d.text = text; d.color = color;
  d.fs = 17; d.font = DMG_FONT(17); d.crit = false; d.void = false; d.vy = 30; d.vx = 0; d.pop = 0.5; d.shake = 0; d.flash = false; d.t = nowMs;
  dmgLabels.push(d);
}
// 全体凍結: 半径内のブロックを氷結させ、モンスターを鈍らせる
function freezeAllAround(x, y){
  const R2 = 560 * 560, cgx = w2g(x), cgy = w2g(y), rb = Math.ceil(560 / BS);
  for (let gy = Math.max(0, cgy - rb); gy <= Math.min(D - 1, cgy + rb); gy++)
    for (let gx = Math.max(0, cgx - rb); gx <= Math.min(D - 1, cgx + rb); gx++){
      const dx = g2w(gx) - x, dy = g2w(gy) - y;
      if (dx * dx + dy * dy > R2) continue;
      const j = liveAt(gx, gy);
      if (j >= 0 && frosts.size < 1500){ frosts.set(j, 4); frostGen.set(j, 0); }
    }
  for (const m of mobs) if (!m.dead){ const dx = m.x - x, dy = m.y - y; if (dx * dx + dy * dy <= R2) m.slowT = Math.max(m.slowT || 0, 3.5); }
  addRing({ x, y, r: 560, t: performance.now(), color: "125,240,255", dur: 600 });
}
// 混沌のサイコロ: 4つの結果から1つ (game/skill-hooks.js の命中時フックから呼ばれる)
function chaosDice(idx, gx, gy, dmg){
  bumpArtProc("lg_dice");
  const x = g2w(gx), y = g2w(gy), roll = (Math.random() * 4) | 0;
  diceFxT = 0.9; diceSettled = roll + 3;
  if (roll === 0){          // 強撃: その命中を合計×5相当に (残っていなければ近くのブロックへ)
    diceColor = "#ff5a4a";
    let j = idx;
    if (isDestroyed(j)){ const near = findNearestBlock(x, y, 220); j = near >= 0 ? near : -1; }
    if (j >= 0) rawDamage(() => damageBlock(j, dmg * 4, 0));
    diceLabel("🎲 強撃！ ダメージ×5", "#ff8a75");
  } else if (roll === 1){   // コインバースト
    diceColor = "#ffd60a";
    const v = Math.max(10, Math.round(blockCoinValue(gx, gy) * 3));
    for (let k = 0; k < 8; k++){ const a = Math.random() * Math.PI * 2, sp = 140 + Math.random() * 240; spawnCoin({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, value: Math.ceil(v / 2), chest: false, age: 0 }); }
    diceLabel("🎲 コインバースト！", "#ffd60a");
  } else if (roll === 2){   // 全体凍結
    diceColor = "#7df0ff";
    freezeAllAround(player.x, player.y);
    diceLabel("🎲 全体凍結！", "#7df0ff");
  } else {                  // 大爆発
    diceColor = "#ffb060";
    blast(x, y, 210, playerDamage() * 8, "255,170,80");
    diceLabel("🎲 大爆発！", "#ffb060");
  }
}

// ---------- ミシック: 常時演出の描画 (render/draw.js の draw から自機描画の直後に呼ばれる) ----------
// パーティクルは新規配列を作らず、その場のプリミティブ描画だけ。shadowBlur は使わない
const DICE_PIPS = { 1:[[0,0]], 2:[[-.45,-.45],[.45,.45]], 3:[[-.45,-.45],[0,0],[.45,.45]], 4:[[-.45,-.45],[.45,-.45],[-.45,.45],[.45,.45]], 5:[[-.45,-.45],[.45,-.45],[0,0],[-.45,.45],[.45,.45]], 6:[[-.45,-.5],[.45,-.5],[-.45,0],[.45,0],[-.45,.5],[.45,.5]] };
function drawArtifactsFx(now, toScreen){
  const [px, py] = toScreen(player.x, player.y);
  if (artHas("lg_gear") && playerTrail.length > 2){   // 時空の歯車: 残像 (薄い矢じり)
    for (let i = playerTrail.length - 1; i >= 2; i -= 2){   // 自機と同じシルエットの発光輪郭 (render/unit-art.js)
      const p = playerTrail[i], [sx, sy] = toScreen(p.x, p.y);
      if (sx < -30 || sy < -30 || sx > CW + 30 || sy > CH + 30) continue;
      ctx.globalAlpha = 0.38 * (1 - i / playerTrail.length);
      uaXf(sx, sy, p.angle); uaImg(UA_GHOST_CYAN, 0, 0, SHIP_S);
    }
    uaEnd(); ctx.globalAlpha = 1;
  }
  if (artHas("lg_crown")){   // 元素の王冠: プリズムオーラ (周回する3色の光点 + 虹色の弧)
    for (let k = 0; k < 3; k++){
      const a = now / 280 + k * (Math.PI * 2 / 3);
      ctx.fillStyle = `hsl(${(now / 6 + k * 120) % 360},95%,68%)`;
      ctx.beginPath(); ctx.arc(px + Math.cos(a) * 30 * zoom, py + Math.sin(a) * 30 * zoom, 3.2, 0, 7); ctx.fill();
    }
    ctx.strokeStyle = `hsla(${(now / 6 + 60) % 360},95%,70%,.45)`; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(px, py, 24 * zoom, now / 300, now / 300 + 4.2); ctx.stroke(); ctx.lineWidth = 1;
  }
  if (artHas("lg_gold")){   // 黄金の特異点: 引き寄せ中のコインに金色のきらめき (状態を持たない瞬き)
    const mr = magnetRange() * 6, mr2 = mr * mr;
    ctx.fillStyle = "#ffd60a";
    let n = 0;
    for (let i = 0; i < coinsArr.length && n < 40; i++){
      const c = coinsArr[i], dx = c.x - player.x, dy = c.y - player.y;
      if (dx * dx + dy * dy > mr2 || Math.sin(now / 110 + i * 1.93) < 0.2) continue;
      const [sx, sy] = toScreen(c.x, c.y);
      if (sx < -10 || sy < -10 || sx > CW + 10 || sy > CH + 10) continue;
      n++;
      const s = 3.5;
      ctx.beginPath();
      ctx.moveTo(sx, sy - s); ctx.lineTo(sx + s * .38, sy - s * .38); ctx.lineTo(sx + s, sy); ctx.lineTo(sx + s * .38, sy + s * .38);
      ctx.lineTo(sx, sy + s); ctx.lineTo(sx - s * .38, sy + s * .38); ctx.lineTo(sx - s, sy); ctx.lineTo(sx - s * .38, sy - s * .38);
      ctx.closePath(); ctx.fill();
    }
  }
  if (diceFxT > 0){   // 混沌のサイコロ: 自機の上で転がって止まる
    const rolling = diceFxT > 0.3, face = rolling ? ((now / 70) | 0) % 6 + 1 : diceSettled, s = 11;
    ctx.save(); ctx.translate(px, py - 34 * zoom - 8); ctx.rotate(rolling ? Math.sin(now / 45) * 0.5 : 0);
    ctx.fillStyle = "#f5f2ea"; ctx.strokeStyle = diceColor; ctx.lineWidth = 2;
    ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(-s, -s, s * 2, s * 2, 4); else ctx.rect(-s, -s, s * 2, s * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#22242a";
    for (const [ox, oy] of DICE_PIPS[face]){ ctx.beginPath(); ctx.arc(ox * s * 1.15, oy * s * 1.15, 2.1, 0, 7); ctx.fill(); }
    ctx.restore(); ctx.lineWidth = 1;
  }
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
  const R = RARITY[art.rar], col = art.color || R.color, mythic = art.rar === 4;
  el.innerHTML = `<div class="ag-rar" style="color:${col}">${R.name} アーティファクト獲得！</div>` +
    `<div class="ag-name"><span class="ag-icon" style="color:${col}">${art.icon}</span>${art.name}</div>` +
    `<div class="ag-desc">${art.desc}</div><div class="ag-count">コレクション ${artOwnedCount()} / ${ARTIFACTS.length}</div>`;
  el.style.borderColor = mythic ? "" : col;   // ミシックは CSS の虹枠が担当するので inline では塗らない
  el.classList.toggle("mythic", mythic);      // ミシックは虹色に光る専用枠
  el.classList.add("show");
  clearTimeout(artGetTimer);
  artGetTimer = setTimeout(() => { el.classList.remove("show"); el.classList.remove("mythic"); }, mythic ? 6000 : art.rar === 3 ? 5200 : 4600);
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
const MOD_LABEL = { dmg:"攻撃", def:"被ダメ減", hp:"最大HP", regen:"回復速度", regenAlways:"常時回復", spd:"移動速度", rate:"連射", coin:"コイン", xp:"経験値", drop:"素材ドロップ", bot:"攻撃ボット", cbot:"回収ボット", elem:"元素", burn:"燃焼", acid:"腐食", frostV:"氷結弱点", shockP:"放電率", crit:"会心率", critd:"会心ダメ", deep:"深さ攻撃", magnet:"吸引範囲", splash:"範囲", sell:"自動売却", dmgMul:"全ダメージ", coinMul:"コイン倍率", xpMul:"経験値倍率" };
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
    const owned = !!state.artifacts[a.id], R = RARITY[a.rar], col = a.color || R.color, mythic = a.rar === 4;
    // 発動の見える化: 常時パッシブは「発動中 + 実効値」、発動系は「発動 n回 (このセッション)」
    let status = "";
    if (owned){
      const liveParts = [], mt = artModText(a);
      if (mt) liveParts.push(mt);
      if (ART_LIVE_NOTE[a.id]) liveParts.push(ART_LIVE_NOTE[a.id]);
      if (liveParts.length) status += `<div class="art-live"><span class="art-live-dot"></span>発動中： ${liveParts.join(" ・ ")}</div>`;
      if (ART_PROC_IDS.has(a.id)) status += `<div class="art-proc">発動 <b>${artProc[a.id] || 0}</b> 回<span class="art-proc-note"> (このセッション)</span></div>`;
    }
    // 枠色はティア色で統一する (未所持でも色で格が分かる)。ミシックだけ CSS の虹枠が担当
    return `<div class="art-card rar-${a.rar} ${owned ? "" : "locked"}${mythic ? " mythic" : ""}"${mythic ? "" : ` style="border-color:${col}"`}>
      <div class="art-icon" style="color:${owned ? col : "#565d66"}">${owned ? a.icon : "?"}</div>
      <div class="art-main"><div class="art-name" style="color:${owned ? col : "#8a929c"}">${owned ? a.name : "？？？"}</div>
      <div class="art-rar" style="color:${col}">${R.name}</div><div class="art-desc">${owned ? a.desc : "まだ見つけていない"}</div>${status}</div></div>`;
  }).join("");
  artPanelSig = artProcSig();
}
// 発動回数の署名 (一覧を開いている間の自動更新の判定用)
function artProcSig(){ let s = ""; for (const id in artProc) s += id + ":" + artProc[id] + ";"; return s; }
let artPanelSig = "";
document.addEventListener("DOMContentLoaded", () => {});
setTimeout(() => {   // ボタンの配線 (スクリプトは body 末尾なので即時でよいが、念のため遅延)
  const btn = $("artBtn"), close = $("artClose");
  if (btn) btn.addEventListener("click", openArtifacts);
  if (close) close.addEventListener("click", closeArtifacts);
  const ov = $("artOverlay");
  if (ov) ov.addEventListener("click", e => { if (e.target === ov) closeArtifacts(); });
  updateArtBadge();
}, 0);
setInterval(() => {   // 一覧を開いている間、発動回数が変わったら表示を最新化する (閉じている間は何もしない)
  if (artOpen && artProcSig() !== artPanelSig) renderArtifacts();
}, 700);
