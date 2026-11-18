"use strict";
/* =========================================================
   core.js - セーブ / マスターデータ (装備・ボット・回収ボット装備) / 派生ステータス
   素材のカタログは materials.js、惑星データは planet.js を参照
   ========================================================= */

// ---------- 数値表示 ----------
// 100万未満はカンマ区切り、それ以上は K / M / B / T ... の略記
const SUFFIX = ["", "K", "M", "B", "T", "Qa", "Qi", "Sx", "Sp", "Oc", "No", "Dc", "Ud", "Dd", "Td", "Qad", "Qid"];
function fmt(n){
  n = Math.floor(n);
  if (!isFinite(n)) return "∞";
  if (n < 0) return "-" + fmt(-n);
  if (n < 1e6) return n.toLocaleString();
  const e = Math.min(SUFFIX.length - 1, Math.floor(Math.log10(n) / 3)), v = n / Math.pow(1000, e);
  return (v >= 100 ? v.toFixed(0) : v >= 10 ? v.toFixed(1) : v.toFixed(2)) + SUFFIX[e];
}
const niceRound = x => { const p = Math.pow(10, Math.max(0, Math.floor(Math.log10(x)) - 1)); return Math.round(x / p) * p; };
// ダメージ表示専用: 常に小数第1位まで出す (1000以上は K/M... 略記でも .0 を含め必ず1桁)
function fmtDmg(n){
  if (!isFinite(n)) return "∞";
  if (n < 0) return "-" + fmtDmg(-n);
  if (n < 1000) return n.toFixed(1);
  const e = Math.min(SUFFIX.length - 1, Math.floor(Math.log10(n) / 3));
  return (n / Math.pow(1000, e)).toFixed(1) + SUFFIX[e];
}

// ---------- save / state ----------
const SAVE_KEY = "billion_shooting_save_v2";
const OLD_SAVE_KEY = "million_shooting_save_v1";
const GAME_VERSION = 79;   // 現在のゲームバージョン (アップデート履歴の未読判定に使う)
const state = {
  coins: 0, totalCoins: 0, destroyed: 0,
  weapon: "handDrill",
  weaponsOwned: { handDrill:true },
  weaponLv: {},
  bots: 0, coinBots: 0, botLv: 0, botMode: "follow", cbMode: "follow",
  botLoadout: [],   // 攻撃ボットの装備 (スロット番号 -> 装備キー。無いスロットは標準装備)
  cbMod: {},        // 回収ボットの装備 (モジュールキー -> レベル)
  inv: {}, seen: {},   // 素材の所持数 / 発見済み
  crafted: 0,
  muted: false,
  xp: 0, lv: 1, skills: {},
  artifacts: {},   // 所持アーティファクト {id: 1}
  botCore: 0, botArmor: 0,   // 衛星テクノロジー (攻撃ボット兵装コア / 自機の衛星装甲)
  hp: 100,   // 自機HP (最大値はレベルで伸びる: playerMaxHP)
  off: {},   // 停止中の仲間 { bots:true, ... }
  visitedBodies: [],   // 訪問済みダンジョン (SATS のインデックス。ファストトラベルの解放条件)
  lastSeenUpdate: 0,   // アップデート履歴を最後に見たバージョン
};
const SAVE_FIELDS = ["coins", "totalCoins", "destroyed", "weapon", "weaponsOwned", "weaponLv", "bots", "coinBots", "botLv",
  "botLoadout", "cbMod", "inv", "seen", "crafted", "muted", "xp", "lv", "skills", "off", "hp", "artifacts", "botCore", "botArmor", "botMode", "cbMode", "visitedBodies", "lastSeenUpdate"];
let migrated = false;
try {
  // 本番の置き場所は IndexedDB (store.js が起動時に読み終えている)。
  // 無ければ旧 localStorage のセーブを引っ越す (初回だけ)
  let s = (window.SAVED && window.SAVED.state) || null;
  if (!s){
    s = JSON.parse(localStorage.getItem(SAVE_KEY) || "null");
    if (!s){
      // 旧バージョン (コイン購入制) のセーブからは、進行度だけ引き継ぐ。装備・スキルは作り直す
      const o = JSON.parse(localStorage.getItem(OLD_SAVE_KEY) || "null");
      if (o) s = { coins:o.coins, totalCoins:o.totalCoins, destroyed:o.destroyed, lv:o.lv, xp:o.xp, muted:o.muted };
    }
    if (s) migrated = true;
    try { localStorage.removeItem(SAVE_KEY); localStorage.removeItem(OLD_SAVE_KEY); } catch(e){}
  }
  if (s) for (const k of SAVE_FIELDS) if (s[k] !== undefined) state[k] = s[k];
} catch(e){}
/* 破壊数は「惑星の実状」そのものなので、小さいセーブ (kv:state) ではなく
   惑星側のセーブ (kv:world の alive) から必ず導く。
   両者は書き込み周期が違うので、別々に持つとリロード後に数個ズレてしまう。
   旧 localStorage からの引っ越しでも、惑星は手つかず = destroyed 0 になって正しい */
state.destroyed = TARGET_TOTAL - alive;

const isObj = v => v && typeof v === "object" && !Array.isArray(v);
// 自機の最大HP: レベルで伸びる (アーティファクト等はここに倍率が掛かる)
const playerMaxHP = () => Math.round((100 + (state.lv - 1) * 30) * (1 + (typeof artVal === "function" ? artVal("hp") : 0)));
for (const k of ["weaponLv", "cbMod", "inv", "seen", "skills", "off", "weaponsOwned", "artifacts"]) if (!isObj(state[k])) state[k] = {};
state.botLv |= 0; state.bots |= 0; state.coinBots |= 0; state.crafted |= 0;
state.lv = Math.max(1, state.lv | 0); state.xp = Math.max(0, +state.xp || 0);
state.coins = Math.max(0, +state.coins || 0); state.totalCoins = Math.max(0, +state.totalCoins || 0);
if (!Array.isArray(state.botLoadout)) state.botLoadout = [];
if (!Array.isArray(state.visitedBodies)) state.visitedBodies = [];
state.visitedBodies = state.visitedBodies.filter(i => Number.isInteger(i) && i >= 0 && i < SATS.length);
state.lastSeenUpdate = Math.max(0, state.lastSeenUpdate | 0);
for (const k of Object.keys(state.inv)) if (!MAT[k]) delete state.inv[k];
// 稼働中の数 (OFFにした種類は0として扱う。所持数 state[k] はそのまま)
const act = k => state.off[k] ? 0 : state[k];
/* save() はクラフト・強化・スキル取得など至る所から呼ばれるので、
   300ms にまとめて IndexedDB へ 1回だけ書く (構造化クローンなので JSON 化は不要)。
   書き込み自体は非同期なのでゲームループは待たない */
let saveTimer = 0;
const stateSnapshot = () => { const o = {}; for (const k of SAVE_FIELDS) o[k] = state[k]; return o; };
function saveNow(){
  if (saveTimer){ clearTimeout(saveTimer); saveTimer = 0; }
  SaveDB.put(ST_KV, [["state", stateSnapshot()]]);
}
function save(){
  if (saveTimer) return;
  saveTimer = setTimeout(() => { saveTimer = 0; SaveDB.put(ST_KV, [["state", stateSnapshot()]]); }, 300);
}
// セーブを全部消す (設定の「最初から」ボタン用)
function wipeSave(){
  if (saveTimer){ clearTimeout(saveTimer); saveTimer = 0; }
  try { localStorage.removeItem(SAVE_KEY); localStorage.removeItem(OLD_SAVE_KEY); } catch(e){}
  return SaveDB.clearAll();
}
if (migrated) saveNow();   // localStorage からの引っ越し分をすぐ IndexedDB へ

/* ---------- 装備 (全137種・素材でクラフト) ----------
   設計の約束: 「リストの後ろにある装備ほど、必ず効率が良い」
   - 各装備の実効DPS (= 基礎ダメージ1あたりの採掘力) は 1つ進むごとに x1.115
     1発の威力は「連射 x 実効倍率 eff」から逆算するので、連射や弾数で効率が逆転しない
   - eff = 1回の射撃が実際に削るブロック量の目安 (弾数・範囲・貫通・連鎖など)
   - 素材の層 (地表 → 内核) ごとにステージが分かれ、深い層の素材でしか作れない
   - 弾の見た目 (shape) と効果 (frost / acid / radiation / shock / matBonus ...) は素材にちなむ
   [key, 名前, 主素材, タグ, アイコン, 弾の形, 性能, 特徴, 説明, レシピ] */
const POWER_STEP = 1.115, CRAFT_STEP = 1.33, YIELD_STEP = 0.015;
const WEAPON_TIERS = LAYERS.map((L, i) => ({ name:L.name, en:L.key.toUpperCase(), note:[
  "最初の道具たち。手近な素材で作れる", "浅い鉱脈の金属と燃料", "岩盤の金属と宝石。弾が本格的になる",
  "熱と圧力の素材。戦術兵器の域へ", "超高圧鉱物と重元素。地形を塗り替える", "液体金属とプラズマ。惑星の鼓動そのもの", "常識の外の物質。終わりと始まり", "衛星惑星の素材。星を巡る旅の成果", "小惑星の素材。小さな星々の、それぞれの答え", "惑星内部の素材。掘り進んだ先の、封じられた空間"][i] }));
const WEAPON_SRC = [
  // ===== 地表 =====
  ["handDrill",   "ハンドドリル",       null,         "標準",   "drill",    "dot",     { eff:1, rate:4 }, "効果なし。でも弾切れも反動もない、いつでも頼れる相棒", "最初から持っている手回しのドリル。まずはこれで素材を集めよう。", {}],
  ["woodBow",     "木の弓",             "wood",       "急所射ち",   "normal",   "arrow",   { eff:1, rate:5, critC:.15, critM:1.5 }, "15%で急所を射抜き、会心1.5倍", "枝をしならせて放つ、最初の一矢。木さえあれば作れる。", { wood:20 }],
  ["stoneSling",  "石の投石器",         "stone",      "重撃",   "heavy",    "rock",    { eff:1.05, rate:2.2, size:6, pierce:1 }, "重い一発。1個貫通し、壊して余った威力で奥のブロックまで撃ち抜く", "大きな石を振り回して投げる。遅いが、重い。", { stone:30, wood:10 }],
  ["sandBlaster", "砂の散弾",           "sand",       "拡散",   "spread",   "grain",   { rate:4, pellets:3, spreadA:.16, eff:3.06 }, "3方向へ同時に発射", "砂を握って投げつける。面で押していく気持ちよさ。", { sand:40, shell:5 }],
  ["waterJet",    "水鉄砲",             "water",      "跳ね水",   "rapid",    "drop",    { eff:.928, rate:10, bounce:1 }, "水流は壁に当たると1回跳ね返り、隣のブロックも濡らして削る", "勢いよく噴き出す水流。柔らかい地表なら、これで十分。", { water:40, clay:10 }],
  ["iceLance",    "氷の槍",             "ice",        "氷結",   "needle",   "shard",   { rate:7, bulletSpeed:1400, pierce:1, eff:2.2, size:3, frost:1 }, "1個貫通。当たったブロックは凍えて、3秒間受けるダメージ +30%", "細く鋭い氷柱。刺さった場所から、冷気が広がる。", { ice:40, snow:15 }],
  ["clayBomb",    "粘土爆弾",           "clay",       "時限爆弾","bomber",  "bomb",    { rate:2.5, bomb:2, eff:2.14 }, "当てたブロックに爆弾を仕掛ける。1.5秒後に200%で起爆し、周囲も巻き込む", "こねた粘土に火薬を詰めて。撃って、待って、ドカン。", { clay:40, salt:10 }],
  ["saltShard",   "塩の結晶弾",         "salt",       "分裂",   "split",    "crystal", { rate:4, split:4, eff:2.83 }, "当たると破片が周囲4個にも40%ダメージ", "着弾の瞬間、塩の結晶が四方へ飛ぶ。", { salt:40, sand:20 }],
  ["coralNeedle", "珊瑚の二連針",       "coral",      "2連装",  "double",   "needle",  { rate:4.5, pellets:2, spreadA:.07, eff:2.05 }, "2発を並べて同時に撃つ", "珊瑚の枝を削った針を、二本並べて放つ。", { coral:30, shell:20 }],
  ["shellBoomerang","貝殻ブーメラン",   "shell",      "跳弾",   "ricochet", "moon",    { rate:4, bounce:3, eff:3.81 }, "当たると近くの別のブロックへ跳ねていく (最大3回)", "一度の射撃で何度も仕事をする跳ね弾。密集地帯で本領発揮。", { shell:40, kelp:15 }],
  // ===== 表土 =====
  ["flintGun",    "火打石の銃",         "flint",      "会心",   "crit",     "spark",   { rate:4, critC:.3, critM:4, eff:1.9 }, "30%の確率でダメージ4倍", "火花と一緒に撃ち出す。当たれば大きく崩れる。", { flint:60, wood:30 }],
  ["copperGun",   "銅の銃",             "copperOre",  "金運",   "normal",   "disc",    { eff:1, rate:5, coinMul:1.1 }, "コイン +10%", "初めての金属の銃。赤茶色の弾は、少しだけ重い。", { copperOre:60, gravel:30 }],
  ["tinRapid",    "錫のラピッド",       "tinOre",     "軽業",   "rapid",    "needle",  { eff:.928, rate:10, critC:.1, critM:2 }, "毎秒10発。軽い錫弾は10%の確率で会心2倍で突き刺さる", "軽い錫の弾を目にも止まらぬ速さで。", { tinOre:60, copperOre:20 }],
  ["coalBurner",  "石炭バーナー",       "coal",       "燃焼",   "burner",   "flame",   { rate:6, burn:.8, eff:1.28 }, "当たったブロックが燃え、3秒間ダメージを受け続ける", "撃ったあとも燃え続ける火炎弾。掘り残しも、じわじわ崩れていく。", { coal:80, flint:20 }],
  ["limeCrusher", "石灰クラッシャー",   "limestone",  "範囲",   "crusher",  "rock",    { rate:2.5, splash:1, eff:4.05, size:5 }, "着弾点の周囲3x3にも50%ダメージ", "白い塊が砕けて、周囲も巻き込む。", { limestone:80, gravel:40 }],
  ["amberLens",   "琥珀のレンズ",       "amber",      "光束",   "laser",    "beam",    { eff:1, rate:16, mode:"laser" }, "弾ではなくビームを照射。余剰は射線の奥へ", "琥珀で光を集める。毎秒16回の、外れない光。", { amber:40, copperOre:30 }],
  ["sulfurFlare", "硫黄の火炎弾",       "sulfur",     "爆炎",   "flare",    "flame",   { rate:2, splash:1, burn:1, eff:4.51, size:5 }, "着弾点の周囲3x3を巻き込み、燃やし続ける", "黄色い粉が爆ぜて、燃えて、まだ燃える。", { sulfur:60, coal:40 }],
  ["bronzeGatling","青銅ガトリング",    "copperOre",  "加速連射","gatling", "disc",    { rate:3, spinMax:6, spinShots:40, eff:3.06, accent:"#cd7f32" }, "撃ち続けるほど連射が加速 (最大6倍)", "銅と錫を合わせた青銅の砲身。温まれば弾幕になる。", { copperOre:80, tinOre:80 }],
  ["fossilBreaker","化石の砕骨弾",      "fossil",     "処刑",   "reaper",   "skull",   { rate:4, exec:.3, eff:1.08, xpMul:1.5 }, "HP30%以下のブロックを即座に砕く。経験値 +50%", "太古の骨を削った弾。弱ったものから刈り取り、学びをもたらす。", { fossil:50, limestone:50 }],
  // ===== 地殻 =====
  ["ironCannon",  "鉄の砲",             "ironOre",    "鉄片炸裂",   "heavy",    "cube",    { rate:2, eff:1.08, size:7, frags:2, fragDmg:.5 }, "重い鉄球。着弾で鉄片2つが飛び散り、周囲にも50%ダメージ", "黒い鉄球が、岩盤をへこませる。", { ironOre:120, coal:40 }],
  ["leadSlug",    "鉛の重弾",           "leadOre",    "貫通",   "pierce",   "cube",    { rate:3, pierce:3, eff:3.74, size:6 }, "弾が最大3個までブロックを貫通する", "止まらない鉛。並んだブロックを、まとめて串刺しにする。", { leadOre:120, ironOre:40 }],
  ["quartzLaser", "水晶レーザー",       "quartz",     "同時照射","twin",    "beam",    { rate:10, mode:"laser", targets:2, eff:2 }, "近い2つのブロックを同時に照射", "水晶で光を二つに割る。狙いはふたつ。", { quartz:100, silverOre:30 }],
  ["magnetHoming","磁鉄ホーミング",     "magnetite",  "追尾",   "homing",   "orb",     { eff:1, rate:5, homing:true }, "弾が近くのブロックへ自動で曲がっていく", "磁石の弾は、勝手に獲物へ吸い寄せられる。", { magnetite:100, copperOre:50 }],
  ["obsidianBlade","黒曜石の刃",        "obsidian",   "貫通刃", "needle",   "shard",   { rate:7, bulletSpeed:1500, pierce:4, eff:4.6, size:4 }, "高速の刃が4個まで貫通する", "火山のガラスは、何よりも鋭い。", { obsidian:100, basalt:50 }],
  ["silverArc",   "銀の連鎖",           "silverOre",  "連鎖雷", "chain",    "bolt",    { rate:3, mode:"chain", chains:6, chainDecay:.75, eff:3.46 }, "命中後、近くのブロックへ6回まで連鎖 (1回ごとに75%)", "銀は電気をよく通す。雷が、ブロックからブロックへ走る。", { silverOre:100, zincOre:50 }],
  ["goldBullet",  "黄金の弾丸",         "goldOre",    "金運",   "midas",    "disc",    { eff:1, rate:5, coinMul:1.5 }, "コイン +50%", "金で撃つのは贅沢に見えるが、戻ってくる額のほうが大きい。", { goldOre:80, ironOre:60 }],
  ["jadeRicochet","翡翠のリコシェ",     "jade",       "跳弾",   "ricochet", "moon",    { rate:4, bounce:5, eff:5.2 }, "別のブロックへ5回まで跳ねる", "磨いた翡翠はよく弾む。", { jade:80, marble:60 }],
  ["amethystPrism","紫水晶プリズム",    "amethyst",   "分光",   "prism",    "beam",    { rate:10, mode:"laser", targets:3, eff:2.83 }, "光が3本に分かれ、3つのブロックを同時に照射", "紫の結晶が、ひとつの光を三つの刃にする。", { amethyst:80, quartz:80 }],
  ["graniteMissile","花崗岩ミサイル",   "granite",    "大爆発", "missile",  "rock",    { rate:1, splash:2, bulletSpeed:380, eff:10.3, size:7 }, "ゆっくり飛ぶ大型弾。着弾で5x5が吹き飛ぶ", "巨岩を撃ち出す。重く、遅く、派手に爆ぜる。", { granite:150, ironOre:80 }],
  ["basaltDrill", "玄武岩ドリル",       "basalt",     "掘削弾", "drillshot","gear",    { rate:2, pierce:8, bulletSpeed:500, eff:8.75, size:6 }, "回転する弾が8個までブロックを掘り抜く", "穴を開けるのではなく、トンネルを作る弾。", { basalt:150, ironOre:100 }],
  ["lapisStorm",  "瑠璃の雷嵐",         "lapis",      "大連鎖", "storm",    "bolt",    { rate:2, mode:"chain", chains:12, chainDecay:.85, eff:5.98 }, "12回まで連鎖する雷 (1回ごとに85%)", "夜空の色の石から、嵐が生まれる。", { lapis:80, silverOre:60 }],
  ["zincSwarm",   "亜鉛スウォーム",     "zincOre",    "群体",   "hydra",    "orb",     { rate:3, pellets:4, spreadA:.35, homing:true, eff:4.1, size:3 }, "4発の追尾弾を広げて撃つ", "小さな弾の群れが、別々の獲物へ食らいつく。", { zincOre:120, magnetite:60 }],
  ["steelVulcan", "鋼のバルカン",       "ironOre",    "弾幕",   "vulcan",   "needle",  { eff:.881, rate:24, jitter:.12, size:3, accent:"#b0c4de" }, "毎秒24発の弾幕", "鉄に炭素を混ぜた鋼の砲身。撃てば撃つほど地形が溶ける。", { ironOre:200, coal:150 }],
  ["nickelShotgun","ニッケル散弾",      "nickelOre",  "散弾",   "shotgun",  "grain",   { rate:1.6, pellets:7, spreadA:.1, range:.75, eff:7.81 }, "7発の散弾。射程は短い", "近づいて、まとめて吹き飛ばす。壁際でこそ真価を発揮する。", { nickelOre:120, zincOre:80 }],
  ["oilFlamethrower","重油の火炎放射",  "oilShale",   "火炎",   "burner",   "flame",   { rate:8, burn:1.2, eff:1.6, range:.7 }, "短射程だが、強く長く燃やす", "黒い油を吹き付けて、火を放つ。", { oilShale:120, sulfur:60 }],
  // ===== 上部マントル =====
  ["titaniumRail","チタンレールガン",   "titaniumOre","超電磁", "rail",     "beam",    { rate:1.2, mode:"beam", range:1.5, beamW:8, eff:22.3 }, "射程1.5倍の超高速ビーム。射線上をすべて貫く", "軽くて強いチタンのレール。音より速い一撃。", { titaniumOre:200, ironOre:150 }],
  ["tungstenAP",  "タングステン徹甲弾", "tungstenOre","徹甲",   "heavy",    "cube",    { rate:2, pierce:2, ap:.002, eff:3.4, size:7 }, "2個貫通。命中ごとに最大HPの0.2%を追加ダメージ", "最も融点の高い金属の弾頭。硬い相手ほどよく効く。", { tungstenOre:200, leadOre:100 }],
  ["rubyLaser",   "ルビーレーザー",     "ruby",       "灼熱光", "laser",    "beam",    { rate:14, mode:"laser", burn:.6, eff:1.3 }, "照射したブロックが燃え続ける", "最初のレーザーはルビーから生まれた。赤い光が岩を焼く。", { ruby:120, goldOre:80 }],
  ["sapphireFrost","サファイア氷結砲",  "sapphire",   "氷結範囲","crusher", "crystal", { rate:2.5, splash:1, frost:1, eff:4.8, size:5 }, "3x3を凍らせる。凍ったブロックは受けるダメージ +30%", "青い結晶が砕け、冷気が周囲を包む。", { sapphire:120, ice:200 }],
  ["emeraldAcid", "エメラルドの毒霧",   "emerald",    "腐食",   "nova",     "drop",    { rate:4, acid:.6, eff:1.3 }, "命中したブロックが4秒間溶け続ける (毎秒60%)", "緑の霧が岩に染み込み、内側から崩していく。", { emerald:120, sulfur:100 }],
  ["topazBeam",   "トパーズの光条",     "topaz",      "二重光", "eclipse",  "beam",    { rate:3, mode:"beam", targets:2, eff:26 }, "2方向へ同時に貫通ビーム", "黄金色の光が、二筋の線を引く。", { topaz:120, quartz:150 }],
  ["garnetBarrage","ガーネットの弾幕",  "garnet",     "炸裂弾幕","spread",  "crystal", { rate:2.5, pellets:5, spreadA:.22, splash:1, eff:9.5, size:4 }, "5発の炸裂弾を扇状に。それぞれ3x3を巻き込む", "深紅の結晶が、扇のように広がって弾ける。", { garnet:150, granite:150 }],
  ["magmaAura",   "マグマ噴射器",       "magma",      "常時範囲","aura",    "flame",   { rate:5, mode:"aura", auraR:90, burn:.3, eff:33 }, "弾は撃たない。周囲90の全ブロックを常に削り、燃やす", "溶けた岩を纏う。近づくだけで、まわりが溶ける。", { magma:200, basalt:150 }],
  ["platinumCrit","白金の会心",         "platinumOre","会心",   "crit",     "star",    { rate:4, critC:.4, critM:5, eff:2.6, coinMul:1.3 }, "40%の確率でダメージ5倍。コイン +30%", "一撃入魂。白金の弾は、外れても価値がある。", { platinumOre:150, goldOre:150 }],
  ["cobaltNova",  "コバルトノヴァ",     "cobaltOre",  "誘爆",   "nova",     "ring",    { rate:2.5, nova:1, eff:3.51 }, "壊したブロックが爆発し、周囲8個へそのブロックの最大HPの60%ダメージ", "青い閃光。ひとつ壊れると、隣も巻き込んで弾け飛ぶ。", { cobaltOre:150, tungstenOre:100 }],
  ["chromeMirror","クロムの鏡弾",       "chromite",   "鏡面",   "ricochet", "disc",    { rate:4, bounce:6, pierce:2, eff:7.5 }, "2個貫通し、6回跳ねる", "鏡のように磨かれた弾は、どこへでも跳ね返る。", { chromite:150, jade:100 }],
  ["olivineVortex","オリビンの渦",      "olivine",    "渦",     "vortex",   "ring",    { rate:6, mode:"aura", auraR:130, eff:77.2 }, "周囲130の全ブロックを削る大渦", "マントルの緑を纏って渦巻く力場。立っているだけで地形がえぐれる。", { olivine:250, peridotite:250 }],
  ["bismuthCluster","ビスマス結晶爆",   "bismuth",    "子弾",   "cluster",  "crystal", { rate:2, frags:8, fragDmg:.5, eff:4.1, size:5 }, "着弾すると8発の子弾 (50%) に分かれて飛び散る", "虹色の階段結晶が、弾けて散る。", { bismuth:150, zincOre:100 }],
  ["lithiumFlash","リチウム閃光",       "lithium",    "電撃弾幕","vulcan",  "spark",   { eff:1.1, rate:30, jitter:.1, size:3, shock:.2 }, "毎秒30発。20%の確率で隣のブロックへ放電 (50%)", "最も軽い金属が、最も速く飛ぶ。", { lithium:250, silverOre:300 }],
  // ===== 下部マントル =====
  ["diamondDrill","ダイヤモンドドリル", "diamond",    "超掘削", "drill",    "gear",    { rate:2, pierce:14, bulletSpeed:520, eff:14, size:6 }, "回転する刃が14個までブロックを掘り抜く", "最も硬いものは、何でも削れる。", { diamond:200, titaniumOre:200 }],
  ["uraniumCannon","ウラン砲",          "uranium",    "放射",   "nova",     "skull",   { rate:3, radiation:.5, splash:1, eff:5.5, size:5 }, "3x3に余波。当たったブロックは崩壊を続け、壊れると隣へ放射能が移る", "静かに、確実に、周囲を蝕んでいく。", { uranium:200, leadOre:300 }],
  ["thoriumEmber","トリウムの熾火",     "thorium",    "業火",   "flare",    "flame",   { rate:2, splash:1, burn:1.5, eff:5.5, size:5 }, "3x3を巻き込み、強く燃やし続ける", "消えない火。熱で崩れる岩盤を眺めよう。", { thorium:200, magma:200 }],
  ["iridiumStarbreaker","イリジウムの星砕き","iridium","殲滅",  "omega",    "cube",    { rate:.6, splash:3, bulletSpeed:420, eff:24.2, size:10 }, "着弾で7x7を消し飛ばす", "恐竜を滅ぼした金属で、惑星を砕く。", { iridium:200, platinumOre:200 }],
  ["osmiumSlug",  "オスミウム超重弾",   "osmium",     "超重撃", "giga",     "cube",    { rate:.8, splash:1, bulletSpeed:520, exec:.3, eff:5.2, size:9 }, "最大級の一発。周囲を巻き込み、HP30%以下を砕く", "最も重い元素の、最も重い一撃。", { osmium:200, tungstenOre:300 }],
  ["rhodiumLight","ロジウムの反射光",   "rhodium",    "多重光", "hyperion", "beam",    { rate:8, mode:"laser", targets:5, eff:5.5 }, "5本の光で同時照射", "鏡の金属が、光を五つに分ける。", { rhodium:200, chromite:200 }],
  ["palladiumCatalyst","パラジウム触媒弾","palladium","触媒",   "homing",   "disc",    { rate:5, homing:true, matBonus:1, eff:1 }, "追尾。壊したブロックから素材が2倍手に入る", "反応を加速させる触媒の弾。採掘量が、目に見えて増える。", { palladium:200, emerald:150 }],
  ["perovskiteResonance","ペロブスカイト共鳴","perovskite","共鳴雷","tempest","bolt",  { rate:2, mode:"chain", chains:16, chainDecay:.88, splash:1, eff:30 }, "16回連鎖する雷。命中点の周囲3x3も巻き込む", "結晶が共鳴し、雷が止まらなくなる。", { perovskite:300, lapis:200 }],
  ["moltenTorrent","溶鉄の奔流",        "moltenIron", "灼熱奔流","quasar",  "flame",   { rate:2, mode:"beam", splash:1, beamW:9, burn:.5, eff:64 }, "射線上すべてを貫き、周囲も焼き、燃やす極太の奔流", "白熱した鉄の川を、まっすぐ撃ち出す。", { moltenIron:300, ironOre:500 }],
  ["spinelStarfall","スピネル星屑",     "spinel",     "流星群", "starfall", "star",    { rate:1.5, pellets:5, spreadA:.2, splash:1, homing:true, eff:19.6, size:5 }, "5発の追尾流星。それぞれ周囲3x3を巻き込む", "降りそそぐ赤い星々。ひとつ残らず、狙った場所へ落ちる。", { spinel:200, garnet:200 }],
  ["carbonadoNeedle","カーボナードの針","carbonado",  "必中会心","nemesis", "needle",  { rate:6, homing:true, pierce:6, critC:.5, critM:5, eff:19.6, size:4 }, "追尾・6貫通。50%の確率でダメージ5倍", "黒いダイヤモンドの針。決して外さず、決して止まらない。", { carbonado:150, diamond:150 }],
  ["stishoviteQuake","スティショバイト震波","stishovite","震波", "wave",     "ring",    { rate:3, mode:"aura", auraR:110, shatter:.05, eff:52 }, "周囲110を削る。壊れたブロックが弾け、隣へ最大HPの5%ダメージ", "超高圧の結晶が脈打つ。地面そのものが震える。", { stishovite:300, bridgmanite:300 }],
  // ===== 外核 =====
  ["liquidIronSerpent","液鉄の大蛇",    "liquidIron", "大蛇雷", "infinity", "bolt",    { rate:2, mode:"chain", chains:22, chainDecay:.9, splash:1, eff:46 }, "22回連鎖する雷。命中点の周囲3x3も巻き込む", "液体の鉄が蛇のようにうねり、ブロックを食い荒らす。", { liquidIron:400, moltenIron:300 }],
  ["nickelMagstorm","ニッケル磁嵐",     "liquidNickel","全方位追尾","ragnarok","orb",  { rate:1.5, pellets:12, arc:true, homing:true, eff:13, size:4 }, "全方向へ12発の追尾弾を放つ", "磁場の嵐。全方位から、惑星が崩れ落ちる。", { liquidNickel:400, magnetite:400 }],
  ["plasmaCannon","プラズマキャノン",   "deepPlasma", "三重極光","eclipse", "beam",    { rate:2, mode:"beam", targets:3, splash:1, beamW:9, eff:201 }, "3方向へ同時に極太ビーム。周囲も焼く", "第四の状態の物質を、三筋の光にして放つ。", { deepPlasma:400, lithium:300 }],
  ["helium3Gravity","ヘリウム3重力球",  "helium3",    "重力球", "singularity","orb",   { rate:.5, orb:true, orbR:64, bulletSpeed:110, eff:415 }, "ブロックをすり抜けて進む重力球。半径64を毎秒8回削り続ける", "融合の火種を球にして放つ。通ったあとには、トンネルだけが残る。", { helium3:300, diamond:300 }],
  ["ferrofluidMaelstrom","磁性流体の大渦","ferrofluid","大渦",  "pulsar",   "ring",    { rate:7, mode:"aura", auraR:170, eff:143 }, "周囲170の全ブロックを削る", "棘を立てる黒い液体が、周囲を飲み込む。", { ferrofluid:400, olivine:400 }],
  ["coriumDecay", "コリウム崩壊弾",     "corium",     "崩壊",   "worldend", "skull",   { rate:1, splash:2, radiation:1, exec:.25, bulletSpeed:400, eff:16, size:8 }, "5x5を巻き込み、放射能を残し、HP25%以下を砕く", "溶け落ちた核燃料のような、不安定な塊を撃つ。", { corium:400, uranium:400 }],
  ["stellarRagnarok","星鉄のラグナロク","stellarIron","神々の黄昏","ragnarok","star",  { rate:1.5, pellets:16, arc:true, homing:true, splash:1, eff:40, size:5 }, "全方向へ16発の炸裂追尾弾", "星の中心で鍛えた鉄が、全方位へ降りそそぐ。", { stellarIron:400, iridium:300 }],
  ["mercurySplit","水銀の分裂弾",       "mercury",    "増殖",   "fractal",  "drop",    { rate:3, split:6, bounce:3, frags:6, eff:16, size:5 }, "跳ねるたびに破片を6個まき散らし、消えるときは6発の子弾になる", "分かれて、跳ねて、また分かれる。液体金属の幾何学。", { mercury:400, bismuth:300 }],
  ["neutronNeedle","中性子の針",        "neutronDust","極貫通", "sniper",   "needle",  { rate:3, range:1.6, bulletSpeed:2000, pierce:20, ap:.005, eff:22, size:3 }, "射程1.6倍。20個貫通し、命中ごとに最大HPの0.5%追加", "ひと粒が山ほど重い針。惑星の反対側まで届きそうだ。", { neutronDust:300, osmium:300 }],
  ["goldMeltRain","溶融金の雨",         "goldMelt",   "黄金の雨","starfall","drop",    { rate:2, pellets:6, spreadA:.3, homing:true, splash:1, coinMul:2.5, eff:22, size:5 }, "6発の炸裂追尾弾。コイン2.5倍", "金の雨が降る。拾うのが追いつかない。", { goldMelt:300, goldOre:800 }],
  // ===== 内核 =====
  ["adamantJudgment","アダマントの断罪","adamant",    "断罪光", "hyperion", "beam",    { rate:8, mode:"laser", targets:6, exec:.35, eff:7.91 }, "6本の光で同時照射。HP35%以下は即座に砕く", "天から下される六条の裁き。逃れられるブロックはない。", { adamant:500, rhodium:400 }],
  ["voidRift",    "虚空の裂け目",       "voidCrystal","虚空球", "graviton", "orb",     { rate:.45, orb:true, orbR:96, bulletSpeed:100, eff:1100 }, "半径96の巨大重力球。通り道をすべて飲み込む", "何もない結晶から、何もかもを飲み込む穴が開く。", { voidCrystal:500, helium3:400 }],
  ["starMetalOmega","星金のオメガ",     "starMetal",  "星砕き", "omega",    "star",    { rate:.6, splash:4, bulletSpeed:420, frags:8, fragDmg:.5, eff:40, size:11 }, "着弾で9x9を消し飛ばし、8発の子弾をまき散らす", "最後の文字を冠した大砲。撃つたびに、景色が変わる。", { starMetal:500, stellarIron:400 }],
  ["darkMatterMaw","暗黒物質の顎",      "darkMatter", "終焉の渦","worldend","ring",    { rate:8, mode:"aura", auraR:220, exec:.3, eff:261 }, "周囲220を削り、HP30%以下を砕く", "見えない顎が、触れるものすべてを噛み砕く。", { darkMatter:500, ferrofluid:400 }],
  ["antimatterGenesis","反物質の創世",  "antimatter", "創世爆発","genesis", "orb",     { rate:.7, splash:3, frags:12, fragDmg:.6, bulletSpeed:440, eff:40, size:9 }, "7x7を吹き飛ばし、さらに12発の子弾 (60%) をまき散らす", "物質と出会えば、すべてが光になる。壊すことは、生み出すこと。", { antimatter:500, corium:400 }],
  ["chroniteInfinity","クロナイトの無限連鎖","chronite","無限連鎖","infinity","bolt",  { rate:2, mode:"chain", chains:30, chainDecay:.92, splash:1, eff:57.2 }, "30回連鎖する雷。命中点の周囲3x3も巻き込む", "時間の遅れた結晶の中で、稲妻が永遠に輪を描く。", { chronite:500, liquidIron:400 }],
  ["aetherPrism", "エーテルの七色光",   "aether",     "七色光", "prism",    "beam",    { rate:10, mode:"laser", targets:7, splash:1, eff:12 }, "7本の光が、それぞれ3x3を焼く", "宇宙を満たす光を、七つに分けて放つ。", { aether:500, coreQuartz:300 }],
  ["quantumSwarm","量子泡の群れ",       "quantumFoam","量子群体","swarm",   "orb",     { rate:1.5, pellets:14, spreadA:.3, homing:true, pierce:3, eff:40, size:3 }, "14発の貫通追尾弾を一斉に放つ", "時空の泡が群れをなし、確率的に獲物へ辿り着く。", { quantumFoam:500, neutronDust:300 }],
  ["singularityCannon","特異点砲",      "singularityShard","宇宙創成","bigbang","orb", { rate:.4, orb:true, orbR:128, bulletSpeed:90, eff:2220 }, "半径128の超重力球。通り道をすべて飲み込む", "すべての始まりの光。ここから宇宙が、もう一度始まる。", { singularityShard:600, voidCrystal:400 }],
  ["primordialOrigin","原初の光",       "primordial", "原点",   "origin",   "beam",    { rate:6, mode:"laser", targets:10, splash:2, exec:.4, eff:95.6 }, "10本の光が5x5ずつ焼き払い、HP40%以下を砕く", "すべての装備の、その先。ハンドドリルから始まった旅の、ひとつの答え。", { primordial:800, adamant:300, antimatter:300 }],
  // ===== 衛星惑星 (ミニダンジョンの素材で作る) =====
  ["magmaForge",  "マグマフォージ",     "magmalite",  "灼熱",   "burner",   "flame",   { rate:3, burn:.5, eff:106, size:6 }, "当たったブロックが強く燃える", "溶岩の星の心臓を炉に組み込んだ。撃つたびに噴火する。", { magmalite:200, magma:300 }],
  ["permaFrost",  "パーマフロスト",     "permaice",   "絶対氷結","crusher",  "crystal", { rate:5, frost:1, splash:1, exec:.3, eff:119, size:5 }, "3x3を凍らせる。凍って残りHP30%以下になったブロックは、その場で砕け散る", "氷の星から切り出した冷気の塊。触れるものは、時ごと凍る。", { permaice:250, permafrost:200 }],
  ["toxicNeedle", "トキサイトニードル", "toxicite",   "猛毒貫通","sniper",   "needle",  { rate:4, acid:.6, pierce:3, eff:132, size:4, bulletSpeed:1600 }, "3個貫通し、猛毒で溶かし続ける", "毒の星の結晶を削った針。刺さった先から、崩れていく。", { toxicite:300, sulfur:200 }],
  ["prismJudgment","プリズムジャッジ",  "prismore",   "分光断罪","hyperion", "beam",    { rate:7, mode:"laser", targets:8, exec:.35, eff:148 }, "8本の分光レーザー。HP35%以下を砕く", "光を七色に裂く結晶の審判。逃れる影はない。", { prismore:350, relicstone:200 }],
  ["voltTempest", "ヴォルトテンペスト", "voltore",    "雷爆",   "nova",     "ring",    { rate:3, shock:.35, nova:1, eff:165, size:7 }, "誘爆と放電の嵐。壊したブロックが爆発する", "雷の星の鉱石は、常に嵐を孕んでいる。", { voltore:400, abyssite:150 }],
  ["novaHeart",   "ノヴァハート",       "novalite",   "星核波動","worldend", "ring",    { rate:6, mode:"aura", auraR:240, exec:.3, eff:184 }, "周囲240を星の核の波動で削り、HP30%以下を砕く", "小さな星の心臓そのもの。鼓動のたびに、世界が削れる。", { novalite:500, magmalite:200, nereidpearl:200 }],
  // ===== 小惑星 (小規模ダンジョン x20 の看板素材で作る) =====
  ["floraBloom",  "フローラブルーム",   "florite",   "開花",   "genesis",  "petal",   { rate:4, pellets:5, spreadA:.3, eff:198 }, "5方向に花びらの弾をばらまく", "撃つたびに花が咲く。戦場が、花畑になる。", { florite:180, ambarite:60 }],
  ["amberHive",   "アンバーハイブ",     "ambarite",  "追尾",   "swarm",    "drop",    { rate:5, homing:1, eff:207 }, "蜜蜂のように獲物を追い続ける弾", "巣ごと背負った射撃。逃げ切れる羽はない。", { ambarite:220, fungite:60 }],
  ["fungusCannon","ファンガスキャノン", "fungite",   "胞子爆弾","bomber",  "bomb",    { rate:2.6, bomb:2, acid:.4, eff:216, size:6 }, "胞子爆弾を仕掛けて1.5秒後に200%で起爆。残った胞子は酸となり4秒間じわじわ溶かす", "菌糸は静かに広がり、ある日どかんと咲く。", { fungite:240, candite:80 }],
  ["candyRain",   "キャンディレイン",   "candite",   "拡散",   "split",    "crystal", { rate:5, pellets:7, spreadA:.4, eff:226 }, "7方向へ甘い破片を雨のように", "お菓子の雨が降る。ただし、歯ではなく岩が砕ける。", { candite:260, cobaltite:80 }],
  ["cobaltDrill", "コバルトドリル",     "cobaltite", "貫通",   "drillshot","needle",  { rate:6, pierce:4, ap:1, eff:236, bulletSpeed:1500, size:3 }, "4個貫通する徹甲ドリル弾", "深い青の回転は、磁力でさらに加速する。", { cobaltite:300, sodite:100 }],
  ["sodaPopper",  "ソーダポッパー",     "sodite",    "炭酸炸裂",   "rapid",    "bubble",  { rate:11, splash:1, frags:3, fragDmg:.3, eff:246 }, "炭酸の泡を毎秒11発。着弾で3x3が弾け、さらに泡の破片3つがパチパチ飛び散る", "シュワシュワと、止まらない。", { sodite:320, lunite:100 }],
  ["lunaSaber",   "ルーナセイバー",     "lunite",    "月光氷結",   "hyperion", "beam",    { rate:6, mode:"laser", targets:4, frost:1, eff:257 }, "月光のレーザーを4目標へ。照らされたブロックは凍え、3秒間受けるダメージ +30%", "静かな光ほど、よく切れる。", { lunite:340, pumpkite:120 }],
  ["pumpkinBomber","パンプキンボマー",  "pumpkite",  "爆発",   "bomber",   "bomb",    { rate:2.2, bomb:3, splash:2, eff:268, size:8 }, "巨大な実弾。起爆で5x5を巻き込む", "収穫祭のフィナーレは、いつも爆発で。", { pumpkite:360, goomite:120 }],
  ["gummyLauncher","グミランチャー",    "goomite",   "弾む分裂",   "ricochet", "moon",    { rate:6, bounce:5, split:2, eff:279 }, "最大5回も跳ね回り、跳ねるたびにグミの破片が周囲2個へ40%ダメージ", "弾む、弾む、どこまでも弾む。", { goomite:380, cometite:140 }],
  ["cometTail",   "コメットテイル",     "cometite",  "連鎖",   "chain",    "bolt",    { rate:4, mode:"chain", chains:6, chainDecay:.8, eff:291 }, "命中後、近くのブロックへ6回まで連鎖 (1回ごとに80%)", "彗星の尾は、触れたものすべてを冷たく撫でる。", { cometite:400, dragonite:150 }],
  ["dragonBreath","ドラゴンブレス",     "dragonite", "灼熱",   "burner",   "flame",   { rate:4, burn:.8, pellets:3, spreadA:.2, eff:303, size:6 }, "3方向へ竜の炎。当たったブロックが強く燃える", "竜の吐息を、瓶詰めにして撃つ。", { dragonite:420, mirageite:150 }],
  ["mirageMirror","ミラージュミラー",   "mirageite", "分光",   "prism",    "beam",    { rate:7, mode:"laser", targets:6, eff:316 }, "蜃気楼のレーザーを6目標へ", "見えている的は、もう砕けている。", { mirageite:450, aurorite:150 }],
  ["auroraVeil",  "オーロラヴェール",   "aurorite",  "極光",   "aura",     "ring",    { rate:6, mode:"aura", auraR:200, eff:329 }, "周囲200を極光のヴェールで削る", "揺らめく光の帳が、触れるものをほどいていく。", { aurorite:480, gearite:160 }],
  ["gearShredder","ギアシュレッダー",   "gearite",   "切削",   "gatling",  "dot",     { rate:13, pierce:1, ap:1, eff:343, size:3 }, "毎秒13発の歯車弾が1個貫通。硬いブロックほど歯車が噛み込み、硬度を無視して削る", "止めようとした者から、砕けていく。", { gearite:520, nebulite:180 }],
  ["nebulaCloud", "ネビュラクラウド",   "nebulite",  "雷爆",   "nova",     "ring",    { rate:3.5, shock:.4, nova:1, eff:357, size:7 }, "誘爆と放電の星雲。壊したブロックが爆発する", "星の生まれる場所は、いつも少し荒れている。", { nebulite:560, aquamarite:200 }],
  ["aquaLance",   "アクアマリンランス", "aquamarite","氷結貫通","sniper",  "needle",  { rate:5, frost:1, pierce:3, eff:372, bulletSpeed:1600, size:3 }, "3個貫通し、凍らせる深海の槍", "ラグーンの底の冷たさを、そのまま突き刺す。", { aquamarite:600, crimsonite:200 }],
  ["crimsonReaper","クリムゾンリーパー","crimsonite","処刑",   "reaper",   "skull",   { rate:3, exec:.45, eff:387, size:7 }, "HP45%以下を砕く深紅の鎌弾", "赤い軌跡は、刈り取られたものの名残。", { crimsonite:650, luminite:220 }],
  ["luminaJudgment","ルミナジャッジメント","luminite","審判",  "hyperion", "beam",    { rate:6, mode:"laser", targets:10, exec:.3, eff:403 }, "10本の光のレーザー。HP30%以下を砕く", "光は暗い場所ほど、容赦がない。", { luminite:700, jadeite:250 }],
  ["jadeFang",    "ジェダイトファング", "jadeite",   "猛毒",   "sniper",   "needle",  { rate:5, acid:.8, pierce:2, eff:419, bulletSpeed:1500, size:3 }, "2個貫通し、猛毒で溶かし続ける", "密林の牙は、刺さった後も効き続ける。", { jadeite:750, horizonite:250 }],
  ["horizonEnd",  "ホライズンエンド",   "horizonite","終焉",   "worldend", "ring",    { rate:7, mode:"aura", auraR:260, exec:.35, eff:436 }, "周囲260を地平面の波動で削り、HP35%以下を砕く", "向こう側を覗いた者は、もう戻れない。", { horizonite:900, dragonite:300, luminite:300 }],
  // ===== 惑星内部 =====
  ["boneLance",   "ボーンランス",       "ossite",    "貫通",   "bonelance", "needle", { rate:4, pierce:2, eff:452, bulletSpeed:1350, size:4 }, "2個貫通。巨獣の骨の槍は、うねりながら獲物を貫く", "骨の回廊で眠っていた巨獣の肋骨を削り出した槍。", { ossite:700, bone:200 }],
  ["rootWhip",    "ルートウィップ",     "rhizomite", "連鎖",   "rootwhip",  "bolt",   { rate:5, mode:"chain", chains:10, eff:472 }, "電撃が10回まで連鎖。根のように、獲物から獲物へ絡みつく", "根の迷宮の主根を編んだ鞭。触れた先へ、次々と巻き付く。", { rhizomite:720, wood:250 }],
  ["stalacDrip",  "スタラクドリップ",   "stalactite","滴下貫通",   "stalacdrop","drop",   { rate:3.5, splash:1, pierce:2, eff:493, size:6 }, "飛ぶほど育つ雫が2個を貫き、着弾で周囲も削る。鍾乳洞の天井が、そのまま落ちてくる", "千年の雫を集めた一撃。鍾乳洞の天井が、そのまま落ちてくる。", { stalactite:740, stone:300 }],
  ["saltPalace",  "ソルトパレス",       "halite",    "結界",   "saltpalace","ring",   { rate:6, mode:"aura", auraR:150, eff:515 }, "周囲150を塩の結界で静かに削る", "塩の宮殿の柱を束ねた結界具。触れるものを、白く乾かしていく。", { halite:760, salt:300 }],
  ["geodeRay",    "ジオードレイ",       "geodite",   "帯電レーザー","geoderay", "beam",   { rate:6, mode:"laser", targets:6, shock:1, eff:538 }, "6本のレーザー。結晶が帯電し、照らされたブロックに感電が走って周囲へ放電する", "ジオードの内側の結晶群を、そのまま光学兵器にした。", { geodite:780, granite:300 }],
  ["lodestoneStorm", "ロードストーム",  "lodestonite","連鎖",  "magnetstorm","bolt",  { rate:6, mode:"chain", chains:18, eff:562 }, "電撃が18回まで連鎖。磁極の嵐が獲物を逃がさない", "磁鉄鉱脈の核を収めた嵐の檻。放たれた雷は、磁場に沿って跳ね回る。", { lodestonite:800, basalt:300 }],
  ["sarcophagusJudge", "サルコジャッジ","sarcophagite","審判", "tombjudge", "beam",   { rate:3, mode:"beam", exec:.25, eff:587 }, "HP25%以下を処刑する墓碑の光", "古代の墓所の碑文が光となる。裁きは、静かに、確実に。", { sarcophagite:820, bone:300 }],
  ["brimFlame",   "ブリムフレイム",     "brimstonite","飛び火",  "brimflame", "flame",  { rate:8, burn:.6, frags:2, fragDmg:.5, eff:613, size:5 }, "当てたブロックを強く燃焼させ、火の粉2つが飛び散って隣にも延焼する", "硫黄地獄の底で燃え続ける石を、火種にした火炎放射器。", { brimstonite:840, sulfur:300 }],
  ["stardustHarvest", "スターダストハーベスト", "stardustite", "分裂", "stardustharvest", "star", { rate:5, split:5, eff:640 }, "当たると破片が周囲5個にも40%ダメージ。星屑の収穫祭", "降り積もった星屑をすくい上げる。着弾のたび、欠片が舞い踊る。", { stardustite:870, horizonite:200 }],
  ["coreHeartBeat", "コアハートビート", "coreheart", "鼓動",   "coreheart", "ring",   { rate:7, mode:"aura", auraR:280, exec:.3, eff:668 }, "周囲280を惑星の鼓動で削り、HP30%以下を砕く", "惑星の心臓の鼓動と同期する。ドクン、と世界が震える。", { coreheart:900, novalite:300, stardustite:300 }],
  // ===== 惑星内部 (幻想) =====
  ["fairyBow",    "フェアリーボウ",     "fairyspring","妖精の三矢",   "fairybow",  "spark",  { rate:6, homing:1, pellets:3, spreadA:.2, coinMul:1.3, eff:698, size:4 }, "3本の妖精の矢がそれぞれ別の獲物を追う。鈴の音が鳴り、コイン +30%", "妖精の泉の水で清めた弓。放たれた矢は、鈴の音とともに敵を探す。", { fairyspring:700, coral:250 }],
  ["rainbowPrism","レインボープリズム", "rainbownite","レーザー","rainbowprism","beam",{ rate:6, mode:"laser", targets:7, eff:730 }, "7本のレーザー。虹の結晶が光を七色に分かつ", "虹の結晶洞の核を磨き上げたプリズム。光は七色に分かれて降り注ぐ。", { rainbownite:720, geodite:200 }],
  ["spiritTreant","スピリットトレント", "spiritwood", "連鎖",   "spirittree","bolt",  { rate:5, mode:"chain", chains:12, eff:763 }, "電撃が12回まで連鎖。精霊の根が、獲物へ伸びていく", "精霊の宿る地底樹の枝を編んだ杖。放った光は根のように連なる。", { spiritwood:740, wood:300 }],
  ["dreamCannon", "ドリームキャノン",   "dreamite",  "夢追い",   "dreamcannon","bubble",{ rate:4, splash:1, homing:1, xpMul:1.5, eff:797, size:6 }, "夢の泡は獲物へ漂い寄り、着弾で3x3が膨らんで弾ける。眠りの中で経験値 +50%", "他人の夢を詰め込んだ砲。撃ち出された泡は、触れたものを眠らせる。", { dreamite:760, ice:250 }],
  ["runeGrimoire","ルーングリモワール", "runestone", "審判",   "grimoire",  "beam",   { rate:3.5, mode:"beam", exec:.2, eff:833 }, "HP20%以下を処刑する、魔導書の一節", "魔法の図書館の最奥に眠る魔導書。開いたページの文字が、裁きの光になる。", { runestone:780, sarcophagite:200 }],
  ["chimeraFang", "キマイラファング",   "chimeraite","獣の牙",   "chimerafang","needle",{ rate:5, pierce:3, critC:.2, critM:3, eff:871, bulletSpeed:1400, size:4 }, "3個貫通。幻獣の牙は20%で急所を噛み砕き、会心3倍", "幻獣の巣に落ちていた巨大な牙。研ぐほどに、持ち主の気配が強くなる。", { chimeraite:800, ossite:250 }],
  ["chronoRevolver", "クロノリボルバー","chronoglass","時巡り",  "chronorevolver","disc",{ rate:7, pellets:2, bounce:2, eff:910, size:4 }, "2発同時発射。時の輪が弾を巻き戻し、別のブロックへ2回跳ねる", "時の間の砂で作られた回転式。撃つたびに、歯車のような時の輪が回る。", { chronoglass:820, halite:250 }],
  ["seraphJudgment", "セラフジャッジ",  "seraphite", "レーザー","seraph",    "beam",   { rate:6, mode:"laser", targets:8, splash:1, eff:951 }, "8本のレーザー+着弾で周囲も削る、天使の裁き", "天使の聖域に降り積もった聖石の光。裁きは、翼のように広がる。", { seraphite:850, luminite:250 }],
  ["demonContract", "デーモンコントラクト", "demonite", "契約", "demoncontract","ring",{ rate:6, mode:"aura", auraR:200, burn:.3, eff:994 }, "周囲200を契約の炎で削り、燃焼させる", "悪魔との契約書を束ねた魔具。代償は、周囲の全てが支払う。", { demonite:880, abyssite:250 }],
  ["yggdrasilRod", "イグドラシルロッド", "yggdrasil", "世界樹", "yggdrasil", "ring",   { rate:7, mode:"aura", auraR:320, exec:.35, eff:1039 }, "周囲320を世界樹の根で削り、HP35%以下を砕く", "世界樹の根源から切り出した杖。振るうたび、惑星そのものが応える。", { yggdrasil:950, coreheart:300, stardustite:300 }],
  ["mossSpreader","モススプレッダー", "mossite",   "胞子散布", "mossgun",   "spark",  { rate:2.2, pellets:3, spreadA:.28, eff:1050, size:4 }, "苔の胞子を3方向にまく。漂う緑がブロックを包む", "苔の洞窟で育った胞子銃。序盤の相棒に", { mossite:45, soil:25 }],
  ["terraHammer", "テラハンマー",     "terracite", "重撃",     "clayhammer","rock",   { rate:1.6, splash:1, eff:1120, size:6 }, "粘土の塊を叩きつける。着弾点の周囲3x3にも50%", "粘土の空洞の恵み。重く、確実", { terracite:55, gravel:30 }],
  ["sapGun",      "サップガン",       "sapite",    "粘着",     "sapdrop",   "shard",  { rate:4, frost:1, eff:1200, size:4 }, "樹液の弾は氷結のように敵を遅くし、脆くする", "樹液の層で採れた粘着銃", { sapite:50, wood:30 }],
  ["ryusaShot",   "リューサショット", "ryusite",   "散弾",     "sandblast", "dot",    { rate:1.8, pellets:5, spreadA:.34, eff:1280, size:3 }, "流砂を5粒一斉に放つ散弾。面で削る", "流砂の間の砂は、握っても零れても武器になる", { ryusite:55, sand:30 }],
  ["ammoShell",   "アンモシェル",     "ammonite",  "帰還殻",   "ammoshell", "ring",   { rate:2.4, eff:1350, size:5 }, "渦巻く殻が飛んで、回って、戻ってくる", "アンモナイトの化石を削り出した回転殻", { ammonite:60, limestone:35 }],
  ["anthraBurner","アントラバーナー", "anthracite","黒炭炎",   "coalfire",  "flame",  { rate:3, burn:.4, eff:1420, size:5 }, "無煙炭の炎。着弾で燃焼が続く", "炭の小部屋の黒い炎。静かに、長く燃える", { anthracite:60, coal:35 }],
  ["aquaJet2",    "アクアジェット改", "aqualite",  "高圧水",   "aquajet",   "stream", { rate:6, eff:1500, size:4 }, "湧水を高圧で撃ち出す。水流は加速して伸びる", "湧水の間の清流を閉じ込めた水銃", { aqualite:65, quartz:30 }],
  ["rustGatling", "ラストガトリング", "rustite",   "錆連射",   "rustgun",   "disc",   { rate:5, pellets:2, spreadA:.12, eff:1580, size:4 }, "錆びた銃身が2発ずつ吐き出す。粗いが速い", "錆鉄の鉱脈の鉄で組んだ連射銃", { rustite:70, gravel:35 }],
  ["petalChain",  "ペタルチェーン",   "petalite",  "花連鎖",   "petalchain","bolt",   { rate:2.6, mode:"chain", chains:6, eff:1660, size:4 }, "花びらの電撃が6回まで連鎖する", "花弁の層の稲妻は、花から花へ渡る", { petalite:70, quartz:35 }],
  ["glassCannon", "グラスキャノン",   "glassite",  "硝子砲",   "glassbeam", "beam",   { rate:5, mode:"beam", exec:.15, eff:1750 }, "HP15%以下を砕く硝子の光。儚く鋭い", "硝子の浅層の天然ガラスを磨いた砲", { glassite:75, sand:40 }],
];
const WEAPONS = {};
WEAPON_SRC.forEach(([key, name, mat, tag, icon, shape, o, feat, desc, recipe], i) => {
  const power = Math.pow(POWER_STEP, i), eff = o.eff || 1, m = mat ? MAT[mat] : null;
  WEAPONS[key] = { ...o, key, name, mat, tag, icon, shape, feat, desc, recipe, no:i + 1, tier: m ? m.layer : 0,
    accent: o.accent || (m ? m.color : "#ffffff"),
    power, yield:1 + YIELD_STEP * i, pellets:o.pellets || 1, splash:o.splash || 0,
    cost: i === 0 ? 0 : niceRound(30 * Math.pow(CRAFT_STEP, i - 1)),
    dmg: 5 * power / (o.rate * eff) };   // 実効DPS = 5 x power になるよう、1発の威力を逆算
});
// 武器アイコンは全137種ユニークに (WEAPON_SRC の icon は下書きで、この表が正)
const WEAPON_ICONS = {
  woodBow: "bow", copperGun: "coin", ironCannon: "cannon", tungstenAP: "ap", tinRapid: "speed",
  oilFlamethrower: "flame", sapphireFrost: "snow", permaFrost: "glacier", rubyLaser: "ray",
  thoriumEmber: "ember", obsidianBlade: "blade", jadeRicochet: "moon", chromeMirror: "mirror",
  gummyLauncher: "bounce", platinumCrit: "star", palladiumCatalyst: "catalyst", lithiumFlash: "flash",
  emeraldAcid: "acid", uraniumCannon: "radiation", voltTempest: "thunder", nebulaCloud: "nebula",
  plasmaCannon: "atom", adamantJudgment: "judgment", prismJudgment: "spectrum", lunaSaber: "crescent",
  luminaJudgment: "sun", liquidIronSerpent: "serpent", goldMeltRain: "rain", stellarRagnarok: "twilight",
  starMetalOmega: "crown", darkMatterMaw: "maw", novaHeart: "heart", horizonEnd: "horizon",
  diamondDrill: "gem", floraBloom: "flower", amberHive: "bee", fungusCannon: "mushroom",
  pumpkinBomber: "pumpkin", candyRain: "candy", cobaltDrill: "magnet", sodaPopper: "bubbles",
  cometTail: "comet", aquaLance: "trident", crimsonReaper: "blood", jadeFang: "fang",
  toxicNeedle: "venom", gearShredder: "gear", auroraVeil: "aurora", garnetBarrage: "barrage",
  aetherPrism: "rainbow", mirageMirror: "mirage", magmaForge: "volcano", dragonBreath: "dragon",
};
for (const k in WEAPON_ICONS) if (WEAPONS[k]) WEAPONS[k].icon = WEAPON_ICONS[k];
// 武器の「動き」と見た目の個性 (v60): move=移動パターン / spin=回転 / pulse=脈動 / trail=残像 / glow=発光 / mine=設置爆弾
const MOVE_INFO = {
  wave: ["蛇行", "波打つように蛇行しながら飛ぶ"],
  spiral: ["旋回", "大きく弧を描きながら旋回する"],
  zigzag: ["ジグザグ", "小刻みにジグザグを切りながら飛ぶ"],
  drift: ["漂い", "ふわりと揺れながら漂う"],
  accel: ["加速", "飛ぶほど加速していく"],
  grow: ["成長", "飛ぶほど大きくなり、威力も増していく"],
  boomerang: ["帰還", "外しても手元へ戻ってくる"],
  mine: ["設置爆弾", "着弾点にくっついて設置され、少しして爆発する"],
};
const FORM_INFO = { cone: "ドリル弾", arrow: "矢", rock: "岩弾", grain: "粒弾", tear: "雫弾", icicle: "氷柱弾", gem: "宝石弾", claw: "爪弾", coin: "コイン弾", dart: "ダーツ弾", ember: "熾火弾", anvil: "金床弾", cube3: "立方弾", hex: "六角弾", saturn: "環球弾", orb2: "双子球", missile: "ミサイル", fang: "牙弾", star4: "閃光星", bolt2: "二重雷", halo: "光輪弾", meteor: "隕石弾", void: "虚空弾", sun: "太陽弾", star6: "六芒星", bubbles: "泡塊", petals: "花びら塊", mine: "棘爆弾", pill: "カプセル弾", acorn: "実弾", snow: "雪結晶", dot: "丸弾", drop: "液弾", shard: "破片弾", needle: "針弾", bomb: "爆弾", crystal: "結晶弾", spark: "火花弾", disc: "円盤弾", flame: "炎弾", star: "星弾", ring: "輪弾", cube: "角弾", orb: "光球", bolt: "雷弾", gear: "歯車弾", moon: "月弾", skull: "髑髏弾", petal: "花びら弾", bubble: "泡弾", ring2: "二重輪" };
const WEAPON_BEHAVIOR = {
  handDrill: { spin: 3, form: "cone", c2: "#ffe9a8", burst: "spark" },
  woodBow: { trail: 1, form: "arrow", c2: "#ffd9a0", burst: "dots" },
  stoneSling: { move: "grow", spin: 1.5, form: "rock", c2: "#d8cfc0", burst: "dots" },
  sandBlaster: { move: "drift", form: "grain", c2: "#fff0b3", burst: "dots" },
  waterJet: { move: "wave", form: "tear", c2: "#dff9ff", burst: "bubble" },
  iceLance: { glow: 1, form: "icicle", c2: "#eaffff", burst: "snow" },
  clayBomb: { pulse: 1, form: "bomb", c2: "#ff8a5c", burst: "ring" },
  saltShard: { spin: 4, form: "gem", c2: "#ffffff", burst: "shard" },
  coralNeedle: { move: "accel", form: "needle", c2: "#ffd1dc", burst: "spark" },
  shellBoomerang: { move: "boomerang", spin: 5, form: "claw", c2: "#fff2cc", burst: "dots" },
  flintGun: { move: "accel", form: "spark", c2: "#ffe14d", burst: "spark" },
  copperGun: { spin: 2.5, form: "coin", c2: "#ffe9a8", burst: "spark" },
  tinRapid: { move: "accel", form: "dart", c2: "#e8f4ff", burst: "spark" },
  coalBurner: { move: "drift", form: "ember", c2: "#ffd23c", burst: "dots" },
  limeCrusher: { move: "grow", form: "anvil", c2: "#e6e6e6", burst: "dots", dmg: 3.08 },
  amberLens: { burst: "star" },
  sulfurFlare: { move: "wave", glow: 1, form: "flame", c2: "#ffe14d", burst: "ring" },
  bronzeGatling: { trail: 1, pulse: 0.5, form: "pill", c2: "#ffd9a0", burst: "spark" },
  fossilBreaker: { move: "grow", spin: 1, form: "fang", c2: "#fff6e0", burst: "dots" },
  ironCannon: { trail: 1, form: "cube3", c2: "#cfd8dc", burst: "ring" },
  leadSlug: { move: "accel", form: "hex", c2: "#ffd9a0", burst: "spark" },
  quartzLaser: { burst: "shard" },
  magnetHoming: { pulse: 0.6, glow: 1, form: "saturn", c2: "#bfe8ff", burst: "ring" },
  obsidianBlade: { trail: 1, spin: 2, form: "shard", c2: "#d9c8ff", burst: "shard" },
  silverArc: { burst: "spark" },
  goldBullet: { move: "accel", glow: 1, form: "coin", c2: "#fff6c9", burst: "star" },
  jadeRicochet: { spin: 3, trail: 1, form: "moon", c2: "#c8ffd9", burst: "dots" },
  amethystPrism: { burst: "shard" },
  graniteMissile: { move: "accel", trail: 1, form: "missile", c2: "#ffd9a0", burst: "ring" },
  basaltDrill: { spin: 6, move: "accel", form: "cone", c2: "#ffc9a3", burst: "dots" },
  lapisStorm: { burst: "spark" },
  zincSwarm: { move: "drift", form: "orb2", c2: "#e3f2ff", burst: "dots" },
  steelVulcan: { trail: 1, form: "shard", c2: "#e8f4ff", burst: "spark" },
  nickelShotgun: { move: "grow", form: "grain", c2: "#ffe9a8", burst: "dots" },
  oilFlamethrower: { move: "wave", pulse: 0.5, form: "flame", c2: "#ffb03a", burst: "ember" },
  titaniumRail: { burst: "spark" },
  tungstenAP: { move: "accel", glow: 1, form: "needle", c2: "#fff3b0", burst: "ring" },
  rubyLaser: { burst: "ember" },
  sapphireFrost: { move: "drift", glow: 1, form: "snow", c2: "#eaffff", burst: "snow" },
  emeraldAcid: { move: "wave", form: "drop", c2: "#d8ff5e", burst: "bubble" },
  topazBeam: { burst: "star" },
  garnetBarrage: { move: "grow", form: "gem", c2: "#ffb3c1", burst: "shard" },
  magmaAura: { burst: "ember" },
  platinumCrit: { spin: 4, glow: 1, form: "star4", c2: "#ffffff", burst: "star" },
  cobaltNova: { pulse: 1, glow: 1, form: "halo", c2: "#bfe8ff", burst: "ring" },
  chromeMirror: { spin: 3, trail: 1, form: "disc", c2: "#ffffff", burst: "ring" },
  olivineVortex: { burst: "ring" },
  bismuthCluster: { spin: 3, form: "crystal", c2: "#ffc7ff", burst: "shard" },
  lithiumFlash: { move: "zigzag", form: "bolt2", c2: "#fff7ae", burst: "spark" },
  diamondDrill: { spin: 8, glow: 1, form: "cone", c2: "#eaffff", burst: "shard" },
  uraniumCannon: { pulse: 0.7, glow: 1, form: "skull", c2: "#b6ff5e", burst: "ring" },
  thoriumEmber: { move: "drift", glow: 1, form: "ember", c2: "#ffb03a", burst: "ember" },
  iridiumStarbreaker: { move: "accel", trail: 1, trailFx: "ember", form: "meteor", c2: "#ffe9a8", burst: "ring" },
  osmiumSlug: { move: "grow", pulse: 0.4, form: "anvil", c2: "#d7dbe0", burst: "ring" },
  rhodiumLight: { burst: "star" },
  palladiumCatalyst: { move: "wave", form: "saturn", c2: "#ffe9f6", burst: "dots" },
  perovskiteResonance: { burst: "spark" },
  moltenTorrent: { burst: "ember" },
  spinelStarfall: { move: "spiral", trail: 1, trailFx: "spark", form: "star", c2: "#ffc7d9", burst: "star" },
  carbonadoNeedle: { move: "accel", form: "needle", c2: "#ffffff", burst: "spark" },
  stishoviteQuake: { burst: "ring" },
  liquidIronSerpent: { burst: "spark" },
  nickelMagstorm: { move: "drift", pulse: 0.5, form: "orb2", c2: "#fff7ae", burst: "spark" },
  plasmaCannon: { burst: "star" },
  helium3Gravity: { pulse: 1, glow: 1, form: "void", c2: "#b18cff", burst: "ring" },
  ferrofluidMaelstrom: { burst: "ring" },
  coriumDecay: { move: "drift", pulse: 0.8, form: "skull", c2: "#d8ff5e", burst: "dots" },
  stellarRagnarok: { trail: 1, glow: 1, form: "star6", c2: "#ffe9a8", burst: "star" },
  mercurySplit: { move: "wave", form: "tear", c2: "#e8f4ff", burst: "dots" },
  neutronNeedle: { move: "accel", trail: 1, glow: 1, form: "icicle", c2: "#fff7ae", burst: "spark" },
  goldMeltRain: { move: "drift", glow: 1, form: "drop", c2: "#fff6c9", burst: "dots" },
  adamantJudgment: { burst: "shard" },
  voidRift: { pulse: 1, glow: 1, form: "void", c2: "#7ee8ff", burst: "ring" },
  starMetalOmega: { move: "grow", trail: 1, form: "star6", c2: "#fff6c9", burst: "ring" },
  darkMatterMaw: { burst: "ring" },
  antimatterGenesis: { move: "grow", glow: 1, form: "sun", c2: "#ffffff", burst: "ring" },
  chroniteInfinity: { burst: "spark" },
  aetherPrism: { burst: "shard" },
  quantumSwarm: { move: "zigzag", form: "bubbles", c2: "#c9f4ff", burst: "dots" },
  singularityCannon: { pulse: 1, glow: 1, form: "void", c2: "#ff9df3", burst: "ring" },
  primordialOrigin: { burst: "star" },
  magmaForge: { move: "grow", glow: 1, form: "flame", c2: "#ffd23c", burst: "ember" },
  permaFrost: { move: "grow", glow: 1, form: "snow", c2: "#dff4ff", burst: "snow" },
  toxicNeedle: { move: "zigzag", form: "needle", c2: "#d8ff5e", burst: "dots" },
  prismJudgment: { burst: "shard" },
  voltTempest: { move: "zigzag", pulse: 0.6, form: "ring2", c2: "#fff7ae", burst: "spark" },
  novaHeart: { burst: "star" },
  floraBloom: { move: "drift", spin: 2, trail: 1, trailFx: "petal", form: "petals", c2: "#ffe3f1", burst: "petal" },
  amberHive: { move: "wave", form: "acorn", c2: "#ffd23c", burst: "dots" },
  fungusCannon: { move: "drift", pulse: 0.6, form: "mine", c2: "#d8ff5e", burst: "dots" },
  candyRain: { move: "drift", spin: 3, form: "pill", c2: "#ffc7e3", burst: "dots" },
  cobaltDrill: { spin: 6, move: "accel", form: "cone", c2: "#bfe8ff", burst: "spark" },
  sodaPopper: { pulse: 1, trail: 1, trailFx: "bubble", form: "bubbles", c2: "#dff9ff", burst: "bubble" },
  lunaSaber: { targets: 4, burst: "shard" },
  pumpkinBomber: { mine: 2.5, form: "bomb", c2: "#ffd23c", burst: "ring" },
  gummyLauncher: { move: "grow", pulse: 0.6, form: "moon", c2: "#ffc7e3", burst: "dots" },
  cometTail: { chains: 8, burst: "star" },
  dragonBreath: { move: "wave", glow: 1, form: "flame", c2: "#ff9d3c", burst: "ember" },
  mirageMirror: { targets: 9, burst: "shard" },
  auroraVeil: { burst: "star" },
  gearShredder: { move: "zigzag", spin: 5, form: "gear", c2: "#ffd9a0", burst: "spark" },
  nebulaCloud: { move: "drift", pulse: 0.5, glow: 1, form: "halo", c2: "#c39bff", burst: "ring" },
  aquaLance: { glow: 1, trail: 1, form: "icicle", c2: "#c9f4ff", burst: "snow" },
  crimsonReaper: { move: "boomerang", spin: 4, form: "claw", c2: "#ffb3c1", burst: "dots" },
  luminaJudgment: { burst: "star" },
  jadeFang: { trail: 1, form: "fang", c2: "#c8ffd9", burst: "dots" },
  horizonEnd: { burst: "ring" },
  boneLance: { move: "wave", form: "fang", c2: "#fff8e1", burst: "dots" },
  rootWhip: { burst: "dots" },
  stalacDrip: { move: "grow", form: "tear", c2: "#eaffff", burst: "bubble" },
  saltPalace: { burst: "shard" },
  geodeRay: { burst: "star" },
  lodestoneStorm: { burst: "spark" },
  sarcophagusJudge: { burst: "ring" },
  brimFlame: { move: "wave", form: "flame", c2: "#fff3b0", burst: "ember" },
  stardustHarvest: { move: "spiral", form: "star6", c2: "#fff8e1", burst: "star" },
  coreHeartBeat: { burst: "ring" },
  fairyBow: { move: "wave", form: "star4", c2: "#ffe3f1", burst: "dots" },
  rainbowPrism: { burst: "star" },
  spiritTreant: { burst: "petal" },
  dreamCannon: { move: "drift", form: "bubbles", c2: "#f3e5f5", burst: "bubble" },
  runeGrimoire: { burst: "shard" },
  chimeraFang: { move: "accel", form: "fang", c2: "#ffe0b2", burst: "dots" },
  chronoRevolver: { spin: 6, form: "saturn", c2: "#fff59d", burst: "ring" },
  seraphJudgment: { burst: "star" },
  demonContract: { burst: "ember" },
  yggdrasilRod: { burst: "ring" },
  // ===== v65 序盤武器: 末尾追加のため index 由来の power/cost/yield を序盤帯に上書き =====
  mossSpreader: { move: "drift", form: "petals", c2: "#dcedc8", burst: "petal", dmg: 1.0, power: 1.32, cost: 120, yield: 1.04 },
  terraHammer: { move: "grow", form: "cube3", c2: "#ffe0b2", burst: "dots", dmg: 5.0, power: 1.6, cost: 180, yield: 1.05 },
  sapGun: { move: "wave", form: "tear", c2: "#fff9c4", burst: "dots", dmg: 1.9, power: 1.52, cost: 220, yield: 1.06 },
  ryusaShot: { form: "dot", c2: "#fff3e0", burst: "dots", trailFx: "spark", dmg: 0.85, power: 1.53, cost: 260, yield: 1.07 },
  ammoShell: { move: "boomerang", spin: 3, form: "ring2", c2: "#efebe9", burst: "ring", dmg: 3.4, power: 1.64, cost: 320, yield: 1.08 },
  anthraBurner: { move: "wave", form: "ember", c2: "#ffccbc", burst: "ember", trailFx: "ember", dmg: 2.9, power: 1.74, cost: 380, yield: 1.09 },
  aquaJet2: { move: "accel", form: "tear", c2: "#e1f5fe", burst: "dots", dmg: 1.55, power: 1.86, cost: 450, yield: 1.1 },
  rustGatling: { form: "pill", c2: "#ffccbc", burst: "spark", trailFx: "spark", dmg: 1.0, power: 2.0, cost: 520, yield: 1.11 },
  petalChain: { burst: "petal", dmg: 3.9, power: 2.02, cost: 600, yield: 1.12 },
  glassCannon: { burst: "shard", dmg: 2.1, power: 2.1, cost: 700, yield: 1.13 },
};
for (const k in WEAPON_BEHAVIOR) if (WEAPONS[k]) Object.assign(WEAPONS[k], WEAPON_BEHAVIOR[k]);
const WEAPON_KEYS = Object.keys(WEAPONS);
for (const k of Object.keys(state.weaponsOwned)) if (!WEAPONS[k]) delete state.weaponsOwned[k];
state.weaponsOwned.handDrill = true;
if (!WEAPONS[state.weapon] || !state.weaponsOwned[state.weapon])
  state.weapon = WEAPON_KEYS.filter(k => state.weaponsOwned[k]).pop() || "handDrill";
// クラフト可能か (素材・コインの両方)
const canCraft = k => { const w = WEAPONS[k]; return !state.weaponsOwned[k] && state.coins >= w.cost && invHas(w.recipe); };
// 強化: コインは製作費の40%から x1.5、素材はレシピの 20% から x1.25 ずつ
const weaponLvOf    = k => state.weaponLv[k] || 0;
const weaponLvMul   = k => 1 + 0.08 * weaponLvOf(k);                       // 装備強化: +8%/Lv
const weaponPellets = k => (WEAPONS[k].pellets || 1) + Math.floor(weaponLvOf(k) / 10);   // 装備強化: Lv10ごとに発射数 +1
const WEAPON_UP_COST = k => niceRound(Math.max(20, WEAPONS[k].cost * 0.4) * Math.pow(1.5, weaponLvOf(k)));
function WEAPON_UP_MATS(k){
  const w = WEAPONS[k], lv = weaponLvOf(k), out = {};
  const keys = Object.keys(w.recipe);
  if (!keys.length) out[["stone", "wood"][lv % 2]] = Math.ceil(10 * Math.pow(1.25, lv));   // ハンドドリルは石と木で
  for (const m of keys) out[m] = Math.ceil(w.recipe[m] * 0.2 * Math.pow(1.25, lv));
  return out;
}
const canUpgradeWeapon = k => state.weaponsOwned[k] && state.coins >= WEAPON_UP_COST(k) && invHas(WEAPON_UP_MATS(k));

// ---------- 攻撃ボット (製造: コイン + 素材) ----------
const BOT_MAX = 12, COINBOT_MAX = 8;
const BOT_MATS = [
  { wood:30, stone:30 }, { copperOre:40, flint:20 }, { tinOre:40, copperOre:60 }, { ironOre:80, coal:50 },
  { ironOre:150, quartz:50 }, { magnetite:100, silverOre:60 }, { titaniumOre:120, ironOre:200 }, { tungstenOre:150, cobaltOre:100 },
  { diamond:80, titaniumOre:200 }, { iridium:120, osmium:120 }, { stellarIron:200, neutronDust:100 }, { adamant:200, starMetal:200 },
];
const COINBOT_MATS = [
  { wood:20, grass:20 }, { copperOre:30, sand:30 }, { magnetite:40, tinOre:40 }, { ironOre:100, goldOre:30 },
  { silverOre:80, quartz:80 }, { platinumOre:60, titaniumOre:100 }, { palladium:80, helium3:40 }, { goldMelt:100, chronite:60 },
];
const BOT_COST     = n => niceRound(100 * Math.pow(2.2, n));
const COINBOT_COST = n => niceRound(80 * Math.pow(2.0, n));
const BOT_RECIPE     = n => BOT_MATS[Math.min(n, BOT_MATS.length - 1)];
const COINBOT_RECIPE = n => COINBOT_MATS[Math.min(n, COINBOT_MATS.length - 1)];
// 攻撃ボット強化: 威力 +12%/Lv。5レベルごとに要求素材の格が上がる
const BOT_UP_MATS_LIST = ["copperOre", "ironOre", "titaniumOre", "tungstenOre", "diamond", "iridium", "stellarIron", "adamant", "singularityShard"];
const BOT_UP_COST = () => niceRound(150 * Math.pow(1.55, state.botLv));
const BOT_UP_MATS = () => { const o = {}; o[BOT_UP_MATS_LIST[Math.min(BOT_UP_MATS_LIST.length - 1, Math.floor(state.botLv / 5))]] = Math.ceil(20 * Math.pow(1.18, state.botLv % 5 + Math.floor(state.botLv / 5) * 2)); return o; };
const botMul = () => (1 + 0.12 * state.botLv) * crewMul() * (sk("d_bot") ? 1.3 : 1) * (1 + (typeof artVal === "function" ? artVal("bot") : 0)) * (1 + 0.25 * (state.botCore || 0));
// ---------- 衛星テクノロジー (ボット強化) ----------
const BOT_CORE_MAX = 5, BOT_ARMOR_MAX = 5;
const BOT_CORE_MATS  = [{ magmalite:60 }, { permaice:60, toxicite:40 }, { prismore:70 }, { voltore:70, duneglass:40 }, { novalite:90 }];
const BOT_ARMOR_MATS = [{ magmalite:50 }, { permaice:50 }, { relicstone:60 }, { abyssite:60 }, { novalite:70 }];
const BOT_CORE_COST  = lv => niceRound(80000 * Math.pow(3.5, lv));
const BOT_ARMOR_COST = lv => niceRound(60000 * Math.pow(3.2, lv));

// ---------- 回収ボットの装備 (モジュール) ----------
/* key: { name, icon, accent, max, cost(lv), mats(lv), eff(lv) 説明, tagline, desc } */
const scaleRec = (rec, lv, step) => { const o = {}; for (const k in rec) o[k] = Math.ceil(rec[k] * Math.pow(step, lv)); return o; };
const CB_MODULES = {
  coil:   { name:"磁気コイル",     icon:"magnet",  accent:"#8fd3ff", max:30, base:120, cstep:1.5, mats:{ magnetite:30, copperOre:30 }, mstep:1.22,
            tagline:"吸い寄せる力を、巻き上げる。", desc:"磁鉄鉱を巻いたコイル。コインを引き寄せる吸引範囲が広がる。",
            eff: lv => `吸引範囲 +${lv * 12}%` },
  frame:  { name:"軽合金フレーム", icon:"speed",   accent:"#d8e0e8", max:30, base:150, cstep:1.5, mats:{ bauxite:30, titaniumOre:10 }, mstep:1.22,
            tagline:"軽くなれば、速くなる。", desc:"アルミとチタンの骨格。機体が軽くなり、移動速度が上がる。",
            eff: lv => `移動速度 +${lv * 10}%` },
  plating:{ name:"金メッキ",       icon:"coin",    accent:"#ffd60a", max:20, base:300, cstep:1.6, mats:{ goldOre:20 }, mstep:1.3,
            tagline:"金は金を呼ぶ。", desc:"機体を金で覆う。回収ボットが拾ったコインの額が増える。",
            eff: lv => `ボット回収コイン +${lv * 5}%` },
  hatch:  { name:"拡張ハッチ",     icon:"bag",     accent:"#c0c0c0", max:10, base:200, cstep:1.7, mats:{ ironOre:40, zincOre:20 }, mstep:1.3,
            tagline:"大きく開けて、まとめて飲み込む。", desc:"回収口を広げる。すれ違うだけで拾える接触範囲が広がる。",
            eff: lv => `接触回収の範囲 +${lv * 20}%` },
  scanner:{ name:"鉱物スキャナ",   icon:"eye",     accent:"#9be15d", max:10, base:400, cstep:1.7, mats:{ quartz:30, silverOre:20 }, mstep:1.3,
            tagline:"コインの下に、何かが埋まっている。", desc:"回収ボットがコインを拾うとき、その場所の地層の素材を一緒に見つけてくる。",
            eff: lv => `コイン回収時 ${lv * 4}% で素材 +1` },
  nozzle: { name:"推進ノズル",     icon:"flame",   accent:"#ff9346", max:5, base:500, cstep:2, mats:{ sulfur:40, magma:20 }, mstep:1.5,
            tagline:"遠いコインほど、急いで取りに行く。", desc:"硫黄とマグマで燃える補助ブースター。目標まで400以上離れているときの速度が上がる。",
            eff: lv => `長距離ブースト +${lv * 30}%` },
  replicator:{ name:"複製回路",    icon:"twin",    accent:"#80ffc0", max:3, base:2000, cstep:5, mats:{ silicon:60, lithium:40 }, mstep:2,
            tagline:"ひとつ作れば、もうひとつ生まれる。", desc:"シリコンとリチウムの自己複製回路。回収ボットが1機おまけで加わる。",
            eff: lv => `回収ボット +${lv}機` },
  interest:{ name:"利息回路",      icon:"clock",   accent:"#e8f0f8", max:10, base:1500, cstep:1.8, mats:{ platinumOre:30, silverOre:50 }, mstep:1.3,
            tagline:"待てば、増える。", desc:"地面に落ちてから2秒以上たったコインは、回収ボットが拾うと利息がつく。",
            eff: lv => `落ちて2秒以上のコイン +${lv * 10}%` },
  gravLens:{ name:"重力レンズ",    icon:"hole",    accent:"#c792ff", max:5, base:1e5, cstep:2.5, mats:{ helium3:40, darkMatter:20 }, mstep:1.5,
            tagline:"空間ごと、引き寄せる。", desc:"ヘリウム3と暗黒物質で空間を曲げる。吸引範囲と吸引力が大きく伸びる。",
            eff: lv => `吸引範囲 +${lv * 40}%・吸引力 +${lv * 30}%` },
  anchor: { name:"時空アンカー",   icon:"warp",    accent:"#40e0d0", max:1, base:1e6, cstep:1, mats:{ chronite:80 }, mstep:1,
            tagline:"歩かない。跳ぶ。", desc:"クロナイトの錨。目標まで800以上離れていると、その手前へ瞬間移動する。",
            eff: lv => lv ? "ワープ稼働中" : "ワープ" },
  stargate:{ name:"星核ワープコア", icon:"warp",   accent:"#fff2b0", max:3, base:3e5, cstep:3, mats:{ novalite:30, nereidpearl:20 }, mstep:1.8,
            tagline:"星の核で、距離を消す。", desc:"ノヴァライトの核で空間を折り畳む。吸引が大きく伸び、ワープの距離制限も緩む (アンカーなしでもワープできる)。",
            eff: lv => `吸引範囲 +${lv * 30}%・吸引力 +${lv * 50}%・ワープ距離 -${lv * 150}` },
};
const CB_MOD_KEYS = Object.keys(CB_MODULES);
const cbLv      = k => state.cbMod[k] || 0;
const CB_COST   = k => { const m = CB_MODULES[k]; return niceRound(m.base * Math.pow(m.cstep, cbLv(k))); };
const CB_MATS   = k => { const m = CB_MODULES[k]; return scaleRec(m.mats, cbLv(k), m.mstep); };
const canUpgradeCB = k => state.coinBots > 0 && cbLv(k) < CB_MODULES[k].max && state.coins >= CB_COST(k) && invHas(CB_MATS(k));
const coinBotSpeed  = () => 300 * (1 + 0.10 * cbLv("frame")) * (sk("d_drone") ? 1.2 : 1) * (sk("c_fleet") ? 1.15 : 1);
const coinBotVacuum = () => 180 * (1 + 0.12 * cbLv("coil")) * (1 + 0.4 * cbLv("gravLens")) * (1 + 0.3 * cbLv("stargate")) * (sk("c_fleet") ? 1.2 : 1);
const coinBotPull   = () => 3200 * (1 + 0.3 * cbLv("gravLens")) * (1 + 0.5 * cbLv("stargate"));
const coinBotTouchR = () => 40 * (1 + 0.2 * cbLv("hatch"));
const botCoinMul    = () => 1 + 0.05 * cbLv("plating");
const cbScanChance  = () => 0.04 * cbLv("scanner");
const cbNozzle      = () => 1 + 0.3 * cbLv("nozzle");
const cbInterest    = () => 0.10 * cbLv("interest");

// ---------- derived stats ----------
const ATTACK_RANGE = 300;
const BULLET_SPD_MUL = 0.6;   // 弾速の全体倍率: 弾の形が見分けられるよう一律で遅くする (射程は寿命側で補正し不変)
const BULLET_SIZE_MUL = 1.3;  // 弾の描画サイズの全体倍率: 何を撃っているか見分けやすく、少しだけ大きくする (当たり判定・範囲は不変)
// 攻撃力: 仲間・スキルの威力の土台。装備の格 (実効DPS倍率) の平方根で伸びる (連射や弾数に左右されない)
const weaponAtkMul = k => Math.sqrt(WEAPONS[k].power) * weaponLvMul(k);
const playerDamage = () => weaponAtkMul(state.weapon);
// 1発の威力: 装備ごとに「実効DPS ÷ 連射 ÷ 実効倍率」で決まる
const shotDamage   = (k = state.weapon) => WEAPONS[k].dmg * weaponLvMul(k);
const weaponYield  = () => WEAPONS[state.weapon].yield;   // 採掘ボーナス (コイン倍率)
const playerSpeed  = () => 270 * (sk("d_boost") ? 1.15 : 1) * (1 + (typeof artVal === "function" ? artVal("spd") : 0));
const magnetRange  = () => 90 * (1 + (typeof artVal === "function" ? artVal("magnet") : 0));
const weaponDPS = w => 5 * w.power;   // 基礎ダメージ1あたりの実効DPS
const playerDPS    = () => weaponDPS(WEAPONS[state.weapon]) * weaponLvMul(state.weapon);
// ---------- 攻撃ボットの装備 ----------
const botWeaponAt = i => {
  const k = state.botLoadout[i];
  if (!k || !WEAPONS[k] || !state.weaponsOwned[k] || k === state.weapon) return null;
  for (let j = 0; j < i; j++) if (state.botLoadout[j] === k) return null;
  return k;
};
const botWeaponDPS  = k => weaponDPS(WEAPONS[k]) * weaponLvMul(k) * 0.6 * botMul();
const botDefaultDPS = () => playerDamage() * 0.6 * botMul() * 3;
const botSlotDPS    = i => { const k = botWeaponAt(i); return k ? botWeaponDPS(k) : botDefaultDPS(); };
const botsTotalDPS  = () => { let s = 0; const n = act("bots"); for (let i = 0; i < n; i++) s += botSlotDPS(i); return s; };
const setBotWeapon  = (i, k) => {
  if (k) for (let j = 0; j < state.botLoadout.length; j++) if (j !== i && state.botLoadout[j] === k) state.botLoadout[j] = null;
  state.botLoadout[i] = k || null;
};
const clearBotWeapon = k => { for (let j = 0; j < state.botLoadout.length; j++) if (state.botLoadout[j] === k) state.botLoadout[j] = null; };
const totalDPS     = () => Math.round(playerDPS() + botsTotalDPS());
