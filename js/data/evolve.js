"use strict";
/* =========================================================
   data/evolve.js - 武器の覚醒 (★1〜★10)

   強化レベルが 5 の倍数 (Lv5 / 10 / 15 … / 50) に届くたびに、武器が1段ずつ「覚醒」する (最大 ★10)。
   1. 威力: ★1つにつき +15% (weaponPowerMul に掛かる = DPS 表示にも入る)
   2. 覚醒特性: 武器の持ち味 (貫通・連鎖・範囲・会心・元素…) が★の数だけ伸びる。
      どの特性が伸びるかは武器の性能から自動で決まる (最大2つ)。全武器に必ず1つ以上付く
   3. 固有覚醒: 武器ごとに1つずつ、他の武器と重ならない専用の能力が ★1 で目覚め、★ごとに強くなる
      (★5 で範囲、★10「真覚醒」で全てが大きく伸びる)。定義と処理は data/evo-unique.js
   4. 見た目: ★2つごとに弾・ビーム・オーラ・着弾の演出が派手になる (控えめ設定では一部省略)
      ★1 光をまとう / ★3 残像 / ★5 光の衛星 / ★7 二色の光冠 / ★9 虹のオーロラ
   効果は evoW(k) が返す「覚醒込みの武器オブジェクト」(WEAPONS[k] を原型にした派生) で反映する。
   撃つ処理 (game/combat.js) はこれを使うだけで、元のマスターデータは書き換えない。
   ========================================================= */

const EVO_MAX = 10;
const EVO_LV = [5, 10, 15, 20, 25, 30, 35, 40, 45, 50];
const EVO_TITLE = ["", "覚醒", "胎動", "共鳴", "開眼", "超越", "天啓", "神域", "星詠", "極光", "真覚醒"];
const EVO_POWER = 0.15;
const EVO_FX_TEXT = ["", "弾が光をまとい、固有覚醒が目覚める", "固有覚醒が強まる", "弾が残像を引き、着弾が大きく弾ける", "固有覚醒の再発動が早まる",
  "光の衛星が弾を巡り、固有覚醒の範囲が広がる", "固有覚醒が強まる", "二色の光冠が脈打ち、自機に光輪が宿る", "固有覚醒の再発動が早まる", "虹のオーロラをまとう",
  "真覚醒: 固有覚醒が極まる (威力・範囲・再発動が大きく伸びる)"];
const EVO_COLORS = ["#8a93a6", "#7df9ff", "#5ce6c8", "#57e39a", "#b8f04a", "#ffd60a", "#ffb03a", "#ff8a5c", "#ff6fa8", "#d58bff", "#fff3b0"];

const evoStarAt = lv => { let s = 0; for (const t of EVO_LV) if (lv >= t) s++; return s; };
const evoStar = k => evoStarAt(weaponLvOf(k));
const evoVisAt = s => Math.ceil(s / 2);          // 見た目の段階 (1〜5): ★2つごとに弾・ビーム・オーラの演出が1段上がる
const evoVis = k => evoVisAt(evoStar(k));
const evoPowerMul = k => 1 + EVO_POWER * evoStar(k);
const evoNextLv = k => { const lv = weaponLvOf(k); for (const t of EVO_LV) if (lv < t) return t; return 0; };

const evoR2 = v => Math.round(v * 100) / 100;
const pctS = v => Math.round(v * 100) + "%";
const evoHalf = s => Math.ceil(s / 2);   // 整数で伸びる特性 (跳弾・子弾・破片) は ★2つで +1
// 特性: test で該当判定 → apply(o, w, s) で★s時点の値を o に書く → text(w, s) で「★s時点の効果」を文字にする (s = 1〜10)
const EVO_FAMILIES = [
  { id: "cosmic", name: "宇宙膨張", test: w => !!w.ultra,   // 最難関の武器: 範囲そのものが★ごとに広がる
    apply: (o, w, s) => { const f = 1 + 0.04 * s;
      for (const k of ["novaR", "meteorRange", "meteorR", "bladeLen", "holeRange", "holeR", "collapseR"]) if (w[k]) o[k] = Math.round(w[k] * f);
      if (w.meteorN) o.meteorN = w.meteorN + s; if (w.blades) o.blades = w.blades + Math.floor(s / 3); if (w.holeN) o.holeN = w.holeN + Math.floor(s / 4); },
    text: (w, s) => `範囲 +${Math.round(4 * s)}%${w.meteorN ? `・隕石 +${s}個` : ""}${w.blades && s >= 3 ? `・刃 +${Math.floor(s / 3)}本` : ""}${w.holeN && s >= 4 ? `・特異点 +${Math.floor(s / 4)}` : ""}` },
  { id: "aura", name: "領域拡大", test: w => w.mode === "aura",
    apply: (o, w, s) => { o.auraR = Math.round(w.auraR * (1 + 0.035 * s)); }, text: (w, s) => `範囲 ${w.auraR} → ${Math.round(w.auraR * (1 + 0.035 * s))}` },
  { id: "orb", name: "重力増大", test: w => !!w.orb,
    apply: (o, w, s) => { o.orbR = Math.round(w.orbR * (1 + 0.04 * s)); }, text: (w, s) => `重力球の半径 ${w.orbR} → ${Math.round(w.orbR * (1 + 0.04 * s))}` },
  { id: "chain", name: "連鎖延長", test: w => w.mode === "chain",
    apply: (o, w, s) => { o.chains = w.chains + s; o.chainDecay = Math.min(0.97, (w.chainDecay || 0.7) + 0.007 * s); },
    text: (w, s) => `連鎖 ${w.chains} → ${w.chains + s}回・減衰 ${pctS(w.chainDecay || 0.7)} → ${pctS(Math.min(0.97, (w.chainDecay || 0.7) + 0.007 * s))}` },
  { id: "multi", name: "光条分岐", test: w => w.mode === "laser" || w.mode === "beam",
    apply: (o, w, s) => { o.targets = (w.targets || 1) + Math.floor(s / 3); }, text: (w, s) => `同時照射 ${w.targets || 1} → ${(w.targets || 1) + Math.floor(s / 3)}本 (★3・★6・★9で +1)` },
  { id: "pierce", name: "貫通強化", test: w => w.pierce > 0 && !w.orb,
    apply: (o, w, s) => { o.pierce = w.pierce + s; }, text: (w, s) => `貫通 ${w.pierce} → ${w.pierce + s}個` },
  { id: "bounce", name: "跳弾強化", test: w => w.bounce > 0,
    apply: (o, w, s) => { o.bounce = w.bounce + evoHalf(s); }, text: (w, s) => `跳ね返り ${w.bounce} → ${w.bounce + evoHalf(s)}回` },
  { id: "frags", name: "破片増殖", test: w => w.frags > 0,
    apply: (o, w, s) => { o.frags = w.frags + evoHalf(s); }, text: (w, s) => `子弾 ${w.frags} → ${w.frags + evoHalf(s)}発` },
  { id: "split", name: "結晶分裂", test: w => w.split > 0,
    apply: (o, w, s) => { o.split = w.split + evoHalf(s); }, text: (w, s) => `破片 ${w.split} → ${w.split + evoHalf(s)}個` },
  { id: "bomb", name: "大火薬", test: w => w.bomb > 0,
    apply: (o, w, s) => { o.bomb = w.bomb * (1 + 0.13 * s); }, text: (w, s) => `起爆 ${pctS(w.bomb)} → ${pctS(w.bomb * (1 + 0.13 * s))}` },
  { id: "exec", name: "断罪の刃", test: w => w.exec > 0 && !w.ultra,
    apply: (o, w, s) => { o.exec = Math.min(0.6, w.exec + 0.01 * s); }, text: (w, s) => `処刑ライン HP${pctS(w.exec)} → ${pctS(Math.min(0.6, w.exec + 0.01 * s))}` },
  { id: "burn", name: "業火", test: w => w.burn > 0,
    apply: (o, w, s) => { o.burn = w.burn * (1 + 0.1 * s); }, text: (w, s) => `燃焼 ${pctS(w.burn)} → ${pctS(w.burn * (1 + 0.1 * s))}/秒` },
  { id: "acid", name: "猛毒", test: w => w.acid > 0,
    apply: (o, w, s) => { o.acid = w.acid * (1 + 0.1 * s); }, text: (w, s) => `腐食 ${pctS(w.acid)} → ${pctS(w.acid * (1 + 0.1 * s))}/秒` },
  { id: "rad", name: "臨界", test: w => w.radiation > 0,
    apply: (o, w, s) => { o.radiation = w.radiation * (1 + 0.1 * s); }, text: (w, s) => `放射 ${pctS(w.radiation)} → ${pctS(w.radiation * (1 + 0.1 * s))}/秒` },
  { id: "frost", name: "氷砕の芯", test: w => w.frost > 0,
    apply: (o, w, s) => { o.ap = (w.ap || 0) + 0.0002 * s; }, text: (w, s) => `命中ごとに最大HPの ${evoR2(0.02 * s)}% を追加で砕く` },
  { id: "shock", name: "雷鳴", test: w => w.shock > 0,
    apply: (o, w, s) => { o.shock = Math.min(1, w.shock + 0.025 * s); }, text: (w, s) => `放電 ${pctS(w.shock)} → ${pctS(Math.min(1, w.shock + 0.025 * s))}` },
  { id: "crit", name: "会心研磨", test: w => w.critC > 0,
    apply: (o, w, s) => { o.critC = Math.min(0.95, w.critC + 0.015 * s); o.critM = w.critM + 0.2 * s; },
    text: (w, s) => `会心 ${pctS(w.critC)} → ${pctS(Math.min(0.95, w.critC + 0.015 * s))}・倍率 ×${evoR2(w.critM)} → ×${evoR2(w.critM + 0.2 * s)}` },
  { id: "homing", name: "狩人の目", test: w => !!w.homing && !w.orb,
    apply: (o, w, s) => { o.critC = Math.max(o.critC || 0, w.critC || 0) + 0.0125 * s; o.critM = Math.max(o.critM || 0, w.critM || 2); },
    text: (w, s) => `追尾弾が ${evoR2(1.25 * s)}% の確率で急所を射抜く (会心)` },
  { id: "coin", name: "黄金律", test: w => w.coinMul > 0,
    apply: (o, w, s) => { o.coinMul = w.coinMul + 0.05 * s; }, text: (w, s) => `コイン ×${evoR2(w.coinMul)} → ×${evoR2(w.coinMul + 0.05 * s)}` },
  { id: "xp", name: "叡智", test: w => w.xpMul > 0,
    apply: (o, w, s) => { o.xpMul = w.xpMul + 0.05 * s; }, text: (w, s) => `経験値 ×${evoR2(w.xpMul)} → ×${evoR2(w.xpMul + 0.05 * s)}` },
  { id: "spin", name: "過給回転", test: w => w.spinMax > 0,
    apply: (o, w, s) => { o.spinMax = w.spinMax + 0.3 * s; }, text: (w, s) => `最大連射 ×${w.spinMax} → ×${evoR2(w.spinMax + 0.3 * s)}` },
  { id: "blast", name: "爆裂散弾", test: w => w.splash > 0 && !w.mode && !w.frags,
    apply: (o, w, s) => { o.frags = evoHalf(s); o.fragDmg = 0.4; }, text: (w, s) => `着弾で子弾 ${evoHalf(s)}発 (40%) が飛び散る` },
  { id: "reach", name: "射程延長", test: w => w.mode === "beam",
    apply: (o, w, s) => { o.range = (w.range || 1) * (1 + 0.03 * s); o.beamW = (w.beamW || 5) * (1 + 0.06 * s); }, text: (w, s) => `射程 +${Math.round(3 * s)}%・ビームが太くなる` },
  { id: "hone", name: "研ぎ澄まし", test: () => true,
    apply: (o, w, s) => { o.critC = Math.min(0.95, (w.critC || 0) + 0.02 * s); o.critM = Math.max(w.critM || 0, 2) + 0.15 * s; },
    text: (w, s) => `${pctS(0.02 * s)} の確率で会心 ×${evoR2(2 + 0.15 * s)}` },
];
// 武器ごとの覚醒特性 (最大2つ・上から優先。最後の「研ぎ澄まし」は他に何も無い武器の受け皿)
const EVO_FAM_OF = {};
for (const k of WEAPON_KEYS){
  const w = WEAPONS[k], list = [];
  for (const f of EVO_FAMILIES){
    if (list.length >= 2) break;
    if (f.id === "hone" && list.length) break;
    if (f.test(w)) list.push(f);
  }
  EVO_FAM_OF[k] = list;
}
// 覚醒込みの武器 (★ごとにキャッシュ。★0 なら元の WEAPONS[k] をそのまま返す)
// evo = 見た目の段階 (1〜5, 描画が参照) / evoS = ★の数 (1〜10) / evoU = 固有覚醒 (data/evo-unique.js)
const evoCache = {};
function evoW(k){
  const base = WEAPONS[k], s = evoStar(k);
  if (!s) return base;
  const c = evoCache[k];
  if (c && c.s === s) return c.w;
  const o = Object.create(base);
  o.evo = evoVisAt(s); o.evoS = s;
  o.evoU = typeof EVO_UNIQUE === "object" ? EVO_UNIQUE[k] || null : null;
  for (const f of EVO_FAM_OF[k]) f.apply(o, base, s);
  evoCache[k] = { s, w: o };
  return o;
}
const evoTraitsText = (k, s) => EVO_FAM_OF[k].map(f => `${f.name}: ${f.text(WEAPONS[k], s)}`);
// ★の表示: 通常は10個の星 (5つごとに区切り)。sm は「★7」の小さな札
const evoStarsHTML = (k, cls) => {
  const s = evoStar(k), tip = `覚醒 ★${s}${s ? "「" + EVO_TITLE[s] + "」" : ""}`;
  if (cls === "sm") return `<span class="evo-pill${s >= EVO_MAX ? " max" : ""}" style="--ec:${EVO_COLORS[s]}" title="${tip}">★${s}</span>`;
  let h = "";
  for (let i = 1; i <= EVO_MAX; i++) h += `<i class="${i <= s ? "on" : ""}${i === 6 ? " gap" : ""}"></i>`;
  return `<span class="evo-stars${cls ? " " + cls : ""}${s >= EVO_MAX ? " max" : ""}" style="--ec:${EVO_COLORS[s]}" title="${tip}">${h}</span>`;
};

// ---------- 覚醒の瞬間 (どの経路で強化しても拾えるよう、ループから定期的に★の変化を見る) ----------
const evoSeen = {};
let evoInit = false, evoCheckT = 0;
const evoBursts = [];   // 自機まわりの覚醒演出 {t, color, s}
function evoCheck(dt){
  evoCheckT -= dt;
  if (evoCheckT > 0) return;
  evoCheckT = 0.25;
  for (const k of WEAPON_KEYS){
    if (!state.weaponsOwned[k]) continue;
    const s = evoStar(k), was = evoSeen[k] || 0;
    evoSeen[k] = s;
    if (evoInit && s > was) evoCelebrate(k, s);
  }
  evoInit = true;
}
function evoCelebrate(k, s){
  const w = WEAPONS[k], u = typeof EVO_UNIQUE === "object" ? EVO_UNIQUE[k] : null;
  const uTxt = u ? (s === 1 ? `固有覚醒「${u.name}」が目覚めた!` : s >= EVO_MAX ? `「${u.name}」が極まった!` : `「${u.name}」強化`) : "";
  if (typeof toast === "function") toast(`${w.name} ★${s}「${EVO_TITLE[s]}」覚醒! ${uTxt} 威力 +${Math.round(EVO_POWER * 100)}%`, "good");
  if (evoBursts.length < 6) evoBursts.push({ t: nowMs, color: w.accent, s });
  if (typeof tone === "function") [784, 988, 1175, 1568].forEach((f, i) => tone(f, .22, "triangle", .05, 0, i * .07 + 0.01 * s));
  if (s >= EVO_MAX && typeof tone === "function") [1568, 2093, 2637].forEach((f, i) => tone(f, .3, "sine", .04, 0, 0.35 + i * .09));
}
