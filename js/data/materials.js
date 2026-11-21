"use strict";
/* =========================================================
   materials.js - 素材カタログ (全168種) / 地層ごとの分布 / 所持数
   - 素材は「どの地層 (深さ) に、どの割合で埋まっているか」で配置する
   - 鉱脈らしく見えるよう、8x8 のセル単位で素材を決め、一部のブロックだけ個別に揺らす
   - 全て座標から決定的に求まる (保存不要・1億ブロック分の配列は作らない)
   ========================================================= */

// ---------- カテゴリ ----------
const MAT_CATS = {
  soil:    { name:"土・砂",   color:"#c9a56a" },
  rock:    { name:"岩石",     color:"#a8a8a8" },
  ore:     { name:"鉱石",     color:"#e0a46a" },
  metal:   { name:"金属",     color:"#d0dce8" },
  gem:     { name:"宝石",     color:"#ff7ad9" },
  element: { name:"元素",     color:"#a6ea62" },
  liquid:  { name:"液体",     color:"#5cbcff" },
  organic: { name:"有機物",   color:"#8fd16a" },
  exotic:  { name:"特異物質", color:"#c792ff" },
};
const MAT_CAT_KEYS = Object.keys(MAT_CATS);

// ---------- 地層 ----------
// depth = 0 (地表) 〜 1 (中心)。各層の [最小深さ, 名前, 説明]
const LAYERS = [
  { key:"surface", name:"地表",       min:0,     desc:"海・大地・砂漠・氷冠。柔らかく、すぐ崩れる。" },
  { key:"topsoil", name:"表土",       min:0.012, desc:"土と砂利、石炭や銅の浅い鉱脈。" },
  { key:"crust",   name:"地殻",       min:0.05,  desc:"花崗岩と玄武岩の岩盤。鉄・銀・金・宝石が眠る。" },
  { key:"umantle", name:"上部マントル", min:0.22, desc:"かんらん岩の熱い層。チタンやルビーが見つかる。" },
  { key:"lmantle", name:"下部マントル", min:0.42, desc:"超高圧の鉱物。ダイヤモンドと重金属の領域。" },
  { key:"ocore",   name:"外核",       min:0.60, desc:"液体の鉄とニッケル。プラズマが渦巻く。" },
  { key:"icore",   name:"内核",       min:0.82, desc:"常識の通じない物質。惑星の心臓。" },
  { key:"satellite", name:"衛星惑星", min:99,   desc:"メイン惑星の周囲に浮かぶ、小さな惑星たちの素材。" },
  { key:"asteroid",  name:"小惑星",   min:99,   desc:"宇宙に点在する小さなダンジョン惑星たちの素材。それぞれの星に1種ずつ。" },
  { key:"cave",      name:"惑星内部", min:99,   desc:"メイン惑星の内部に封じられた、矩形のダンジョン空間の素材。掘り進んだ者だけが辿り着く。" },
  { key:"ultimate",  name:"最難関",   min:99,   desc:"ワールドの四隅に浮かぶ最難関ダンジョンの素材。硬さは異次元。持ち帰れば、世界の理を超えた武器になる。" },
];
const layerIndexOf = depth => { let i = LAYERS.length - 1; while (i > 0 && depth < LAYERS[i].min) i--; return i; };

/* ---------- 素材カタログ ----------
   [key, 名前, カテゴリ, 色, 硬さ (HP倍率), コイン倍率, 地層, 分布の重み, オプション]
   オプション: explosive=壊すと誘爆 / xp=経験値倍率 / note=一言 */
const MAT_SRC = [
  // ===== 地表 (バイオームごとに分布が変わる。重みは参考値) =====
  ["water",     "水",           "liquid",  "#2f6fd8", 0.4, 0.8, 0, 0, { note:"惑星の7割を覆う。壊せば一瞬で蒸発する。" }],
  ["deepWater", "深海水",       "liquid",  "#1a3f8f", 0.5, 1.1, 0, 0, { note:"光の届かない海の水。わずかに冷たい。" }],
  ["salt",      "塩",           "element", "#e8e8f0", 0.7, 1.0, 0, 0, { note:"海から生まれた白い結晶。" }],
  ["kelp",      "海藻",         "organic", "#2f8f5a", 0.5, 0.9, 0, 0, { note:"ゆらゆら揺れる海の森。" }],
  ["coral",     "珊瑚",         "organic", "#ff8a80", 0.9, 1.3, 0, 0, { note:"小さな生き物が積み上げた骨格。" }],
  ["shell",     "貝殻",         "organic", "#f0e6d2", 1.0, 1.1, 0, 0, { note:"螺旋を描く殻。意外と丈夫。" }],
  ["sand",      "砂",           "soil",    "#d8c27a", 0.6, 0.9, 0, 0, { note:"どこにでもある。だから、どこにでも使える。" }],
  ["grass",     "草",           "organic", "#4caf50", 0.5, 0.9, 0, 0, { note:"大地を覆う緑。" }],
  ["soil",      "土",           "soil",    "#7a5a3a", 0.8, 1.0, 0, 0, { note:"命を育てる茶色。" }],
  ["wood",      "木材",         "organic", "#8b5a2b", 1.0, 1.0, 0, 0, { note:"最初の道具は、いつも木から。" }],
  ["stone",     "石",           "rock",    "#8a8a8a", 1.2, 1.0, 0, 0, { note:"硬くて、重くて、頼れる。" }],
  ["clay",      "粘土",         "soil",    "#a86f5c", 0.9, 1.0, 0, 0, { note:"こねれば形になる。焼けば固まる。" }],
  ["ice",       "氷",           "liquid",  "#b8e8ff", 0.8, 1.0, 0, 0, { note:"極地の透き通った氷。" }],
  ["snow",      "雪",           "soil",    "#f4f8ff", 0.4, 0.9, 0, 0, { note:"ふわふわ。すぐ溶ける。" }],
  ["permafrost","永久凍土",     "soil",    "#8fa8b8", 1.1, 1.1, 0, 0, { note:"何万年も凍ったままの土。" }],
  ["sandstone", "砂岩",         "rock",    "#d2a86c", 1.1, 1.0, 0, 0, { note:"砂が押し固められてできた岩。" }],
  ["bone",      "骨",           "organic", "#e8e0c8", 1.0, 1.5, 0, 0, { note:"砂漠に眠る、何かの骨。" }],
  // ===== 表土 =====
  ["gravel",    "砂利",         "soil",    "#9c8f7c", 1.0, 1.0, 1, 16],
  ["soil2",     "深土",         "soil",    "#5e4530", 0.9, 1.0, 1, 20, { note:"地表より締まった、暗い色の土。" }],
  ["clay2",     "青粘土",       "soil",    "#6f7f8c", 1.0, 1.1, 1, 10, { note:"鉄分の少ない、青みがかった粘土。" }],
  ["peat",      "泥炭",         "organic", "#4a3a28", 0.8, 1.0, 1, 8, { note:"植物が腐らずに積もったもの。燃える。" }],
  ["limestone", "石灰岩",       "rock",    "#d8d2c0", 1.1, 1.0, 1, 10, { note:"太古の海の底。貝の墓場。" }],
  ["chalk",     "白亜",         "rock",    "#f0f0e8", 0.8, 1.0, 1, 5, { note:"白くて柔らかい石灰の岩。" }],
  ["flint",     "火打石",       "rock",    "#4a4a52", 1.4, 1.2, 1, 6, { note:"打てば火花。鋭く割れる。" }],
  ["coal",      "石炭",         "element", "#2b2b2b", 1.1, 1.3, 1, 6, { note:"黒い炭素のかたまり。文明の燃料。" }],
  ["copperOre", "銅鉱石",       "ore",     "#c87a3a", 1.4, 1.5, 1, 4, { note:"赤茶色の光。最初に手に入る金属。" }],
  ["tinOre",    "錫鉱石",       "ore",     "#b8b8a8", 1.3, 1.5, 1, 2.5, { note:"銅と混ぜると青銅になる。" }],
  ["fossil",    "化石",         "organic", "#c8b890", 1.2, 2.0, 1, 1.5, { xp:2, note:"石になった、遠い昔の生き物。" }],
  ["amber",     "琥珀",         "gem",     "#ffb03a", 1.0, 3.0, 1, 0.8, { note:"樹液が何千万年もかけて固まった宝石。" }],
  ["sulfur",    "硫黄",         "element", "#e8e03a", 0.9, 1.4, 1, 1.2, { note:"黄色くて、臭くて、よく燃える。" }],
  ["saltRock",  "岩塩",         "element", "#f8d8e8", 0.9, 1.2, 1, 2, { note:"地中に閉じ込められた古代の海。" }],
  ["gasPocket", "ガス溜まり",   "liquid",  "#c8ffc8", 0.3, 0.5, 1, 0.6, { explosive:1, note:"触れると爆発する。周囲を巻き込む。" }],
  // ===== 地殻 =====
  ["granite",   "花崗岩",       "rock",    "#b08c8c", 1.3, 1.0, 2, 18],
  ["basalt",    "玄武岩",       "rock",    "#4a4a4a", 1.4, 1.0, 2, 14],
  ["marble",    "大理石",       "rock",    "#e8e8f0", 1.2, 1.3, 2, 7, { note:"彫像にも、床にも。美しい岩。" }],
  ["slate",     "粘板岩",       "rock",    "#5a6070", 1.1, 1.0, 2, 9],
  ["shale",     "頁岩",         "rock",    "#6a6058", 1.0, 1.0, 2, 7],
  ["ironOre",   "鉄鉱石",       "ore",     "#a0583a", 1.6, 1.6, 2, 9, { note:"すべての工業の背骨。" }],
  ["quartz",    "水晶",         "gem",     "#e8f4ff", 1.3, 2.2, 2, 5.5, { note:"透明な六角柱。光を通し、光を曲げる。" }],
  ["magnetite", "磁鉄鉱",       "ore",     "#3a3a48", 1.7, 1.7, 2, 3.5, { note:"天然の磁石。" }],
  ["leadOre",   "鉛鉱石",       "ore",     "#6a6a80", 1.8, 1.6, 2, 3],
  ["zincOre",   "亜鉛鉱石",     "ore",     "#9aa8b0", 1.4, 1.6, 2, 3],
  ["nickelOre", "ニッケル鉱石", "ore",     "#8a9a6a", 1.6, 1.8, 2, 2.5],
  ["bauxite",   "ボーキサイト", "ore",     "#c86a4a", 1.2, 1.5, 2, 2.5, { note:"アルミニウムのもと。軽さの源。" }],
  ["silverOre", "銀鉱石",       "ore",     "#d8dce8", 1.5, 2.5, 2, 1.8],
  ["obsidian",  "黒曜石",       "rock",    "#1a1020", 1.8, 1.8, 2, 2.2, { note:"火山のガラス。刃物になるほど鋭い。" }],
  ["goldOre",   "金鉱石",       "ore",     "#ffd040", 1.4, 5.0, 2, 1.0, { note:"輝きは、何千年経っても曇らない。" }],
  ["jade",      "翡翠",         "gem",     "#3fa86a", 1.5, 3.0, 2, 0.9],
  ["amethyst",  "紫水晶",       "gem",     "#9b5de5", 1.4, 3.0, 2, 0.9],
  ["lapis",     "瑠璃",         "gem",     "#2a4fc8", 1.4, 3.0, 2, 0.7, { note:"夜空の色をした石。" }],
  ["graphite",  "黒鉛",         "element", "#3a3a3a", 1.0, 1.3, 2, 1.5, { note:"鉛筆の芯。柔らかい炭素。" }],
  ["phosphorite","燐鉱石",      "ore",     "#c8d890", 1.1, 1.4, 2, 1.0, { note:"暗闇で淡く光る。" }],
  ["oilShale",  "油母頁岩",     "liquid",  "#2a2a20", 0.8, 1.6, 2, 1.5, { note:"石油を含んだ岩。" }],
  ["gasPocket2","メタン溜まり", "liquid",  "#b0e8d0", 0.3, 0.6, 2, 0.5, { explosive:1, note:"地殻に閉じ込められたガス。爆発する。" }],
  // ===== 上部マントル =====
  ["peridotite","かんらん岩",   "rock",    "#5a7a4a", 1.3, 1.0, 3, 24],
  ["olivine",   "オリビン",     "gem",     "#8fbf3f", 1.4, 1.8, 3, 14, { note:"マントルの緑。宝石名はペリドット。" }],
  ["pyroxene",  "輝石",         "rock",    "#3a4a3a", 1.3, 1.0, 3, 10],
  ["garnet",    "ガーネット",   "gem",     "#a01030", 1.5, 3.0, 3, 5],
  ["magma",     "マグマ",       "liquid",  "#ff5a1a", 0.7, 1.2, 3, 9, { note:"溶けた岩。触れたものを焼く。" }],
  ["titaniumOre","チタン鉱石",  "ore",     "#9ab0c8", 1.8, 2.2, 3, 5, { note:"軽くて強い、空の金属。" }],
  ["chromite",  "クロム鉄鉱",   "ore",     "#4a5a6a", 1.7, 2.0, 3, 4],
  ["cobaltOre", "コバルト鉱石", "ore",     "#3060c0", 1.6, 2.4, 3, 3.5, { note:"深い青の顔料になる。" }],
  ["tungstenOre","タングステン鉱石","ore", "#505050", 2.2, 2.5, 3, 3, { note:"最も融点の高い金属。" }],
  ["bismuth",   "ビスマス",     "element", "#d090ff", 1.3, 2.5, 3, 2, { note:"虹色の階段状結晶を作る。" }],
  ["lithium",   "リチウム",     "element", "#e8e8d0", 1.0, 2.2, 3, 2, { note:"最も軽い金属。電気を蓄える。" }],
  ["silicon",   "シリコン",     "element", "#6a7a8a", 1.2, 1.8, 3, 3, { note:"半導体の基礎。砂の心臓。" }],
  ["platinumOre","白金鉱石",    "ore",     "#e8f0f8", 1.8, 6.0, 3, 1.3, { note:"金より重く、金より希少。" }],
  ["ruby",      "ルビー",       "gem",     "#e0115f", 1.6, 5.0, 3, 1.0, { note:"燃えるような赤。" }],
  ["sapphire",  "サファイア",   "gem",     "#0f52ba", 1.6, 5.0, 3, 1.0, { note:"凍るような青。ルビーと同じ鉱物。" }],
  ["emerald",   "エメラルド",   "gem",     "#50c878", 1.5, 5.0, 3, 0.8, { note:"深い緑。内包物さえ美しい。" }],
  ["topaz",     "トパーズ",     "gem",     "#ffc87c", 1.4, 4.0, 3, 1.2],
  // ===== 下部マントル =====
  ["bridgmanite","ブリッジマナイト","rock","#6a5a7a", 1.4, 1.0, 4, 24, { note:"地球で最も多い鉱物。地上では存在できない。" }],
  ["perovskite","ペロブスカイト","rock",   "#8a7aa0", 1.5, 1.5, 4, 14],
  ["ferropericlase","フェロペリクレース","rock","#4a5a4a",1.4,1.0,4,12],
  ["stishovite","スティショバイト","rock", "#b0b8c8", 1.7, 1.6, 4, 7, { note:"超高圧で生まれる、硬い石英。" }],
  ["spinel",    "スピネル",     "gem",     "#ff4d6d", 1.6, 4.0, 4, 5],
  ["moltenIron","溶鉄",         "liquid",  "#ff8a3a", 0.8, 1.5, 4, 10, { note:"白熱した液体の鉄。" }],
  ["sulfideMelt","硫化物メルト","liquid",  "#d8b030", 0.9, 1.6, 4, 4],
  ["diamond",   "ダイヤモンド", "gem",     "#c8f8ff", 2.5, 10,  4, 2.5, { note:"炭素の最も硬い姿。" }],
  ["carbonado", "カーボナード", "gem",     "#202028", 2.6, 8.0, 4, 1.0, { note:"黒いダイヤモンド。宇宙から来たとも言われる。" }],
  ["uranium",   "ウラン",       "element", "#7fff3f", 1.8, 4.0, 4, 3, { xp:1.5, note:"静かに崩壊し続ける、重い元素。" }],
  ["thorium",   "トリウム",     "element", "#c8ff8f", 1.7, 3.5, 4, 3],
  ["osmium",    "オスミウム",   "element", "#7080a0", 2.6, 6.0, 4, 2, { note:"最も密度の高い元素。" }],
  ["iridium",   "イリジウム",   "element", "#f0f0ff", 2.4, 7.0, 4, 2, { note:"隕石に多く含まれる。恐竜絶滅の証人。" }],
  ["rhodium",   "ロジウム",     "element", "#e8f8f8", 2.0, 8.0, 4, 1.5, { note:"鏡のように光を返す。" }],
  ["palladium", "パラジウム",   "element", "#d0d8e0", 1.8, 6.0, 4, 2, { note:"触媒の王。反応を加速させる。" }],
  // ===== 外核 =====
  ["liquidIron","液体鉄",       "liquid",  "#ffa040", 1.0, 1.5, 5, 34, { note:"惑星の磁場を生む、巨大な鉄の海。" }],
  ["liquidNickel","液体ニッケル","liquid", "#d8e890", 1.0, 1.8, 5, 18],
  ["ferrofluid","磁性流体",     "liquid",  "#303040", 1.3, 2.0, 5, 8, { note:"磁石に反応して棘を立てる液体。" }],
  ["deepPlasma","深層プラズマ", "exotic",  "#ff40ff", 1.2, 3.0, 5, 7, { note:"電離した物質の第四の状態。" }],
  ["mercury",   "水銀",         "liquid",  "#c8c8d8", 1.1, 3.0, 5, 5, { note:"常温で液体の金属。鏡のように重い。" }],
  ["corium",    "コリウム",     "exotic",  "#80ff40", 1.5, 3.0, 5, 4, { explosive:1, note:"溶け落ちた核燃料のような、不安定な塊。" }],
  ["helium3",   "ヘリウム3",    "element", "#80e0ff", 0.8, 5.0, 5, 3, { note:"核融合の夢の燃料。" }],
  ["stellarIron","星鉄",        "metal",   "#ffe0a0", 2.5, 4.0, 5, 4, { note:"星の中心で鍛えられた鉄。" }],
  ["coreQuartz","核水晶",       "gem",     "#a0ffff", 2.0, 8.0, 5, 3, { note:"核の圧力で透き通った結晶。" }],
  ["neutronDust","中性子塵",    "exotic",  "#e0e0ff", 3.0, 6.0, 5, 2, { note:"ひと粒が山ほど重い塵。" }],
  ["goldMelt",  "溶融金",       "liquid",  "#ffd700", 0.9, 12,  5, 1.5, { note:"川のように流れる金。" }],
  // ===== 内核 =====
  ["ironCrystal","鉄結晶",      "metal",   "#c0c8d8", 2.0, 2.0, 6, 30, { note:"超高圧で結晶化した鉄。内核そのもの。" }],
  ["adamant",   "アダマント",   "metal",   "#ff6060", 3.5, 6.0, 6, 10, { note:"伝説の硬さを持つ金属。" }],
  ["starMetal", "星金",         "metal",   "#fff0b0", 3.0, 8.0, 6, 10, { note:"星そのものを削り出したような金属。" }],
  ["voidCrystal","虚空結晶",    "exotic",  "#6030a0", 2.8, 10,  6, 8, { note:"中を覗くと、何もない。" }],
  ["darkMatter","暗黒物質",     "exotic",  "#202030", 2.5, 10,  6, 7, { note:"見えないのに、重い。" }],
  ["aether",    "エーテル",     "exotic",  "#b0a0ff", 1.5, 8.0, 6, 6, { note:"かつて宇宙を満たすと信じられた物質。" }],
  ["chronite",  "クロナイト",   "exotic",  "#40e0d0", 3.0, 12,  6, 6, { note:"時間がわずかに遅れて流れる結晶。" }],
  ["quantumFoam","量子泡",      "exotic",  "#80ffc0", 1.2, 6.0, 6, 5, { note:"時空の最小単位が泡立っている。" }],
  ["antimatter","反物質",       "exotic",  "#ff40a0", 2.0, 15,  6, 4, { explosive:1, note:"物質と出会えば、すべてが光になる。" }],
  ["singularityShard","特異点の欠片","exotic","#ffffff",4.0,25, 6, 3, { note:"重力が無限になる点の、破片。" }],
  ["primordial","原初の光",     "exotic",  "#fff8e0", 3.0, 30,  6, 2, { xp:3, note:"宇宙が始まった瞬間の光が、ここに固まっている。" }],
  // ===== 衛星惑星 (ミニダンジョン) の看板素材。メイン惑星には出ない (layer 7 / w 0) =====
  ["magmalite", "マグマライト",   "element", "#ff6a2a", 1.3, 1.6, 7, 0, { note:"溶岩の星の心臓。常に熱を帯びている。" }],
  ["permaice",  "パーマアイス",   "liquid",  "#aef4ff", 1.1, 1.7, 7, 0, { note:"何万年も溶けない氷。" }],
  ["toxicite",  "トキサイト",     "element", "#7dff4a", 1.2, 1.9, 7, 0, { note:"触れるだけで痺れる毒の結晶。" }],
  ["prismore",  "プリズム鉱",     "gem",     "#d9a0ff", 1.5, 2.2, 7, 0, { note:"光を七色に裂く結晶。" }],
  ["relicstone","レリックストーン","rock",   "#d8b878", 1.6, 2.4, 7, 0, { note:"古代の紋様が刻まれた石。" }],
  ["nereidpearl","ネレイド真珠",  "gem",     "#7fe8e0", 1.4, 2.6, 7, 0, { note:"深海の星で育つ大きな真珠。" }],
  ["voltore",   "ヴォルト鉱",     "element", "#ffe14d", 1.7, 2.9, 7, 0, { explosive:1, note:"常に放電している危険な鉱石。" }],
  ["duneglass", "デューンガラス", "element", "#ffd98a", 1.5, 3.2, 7, 0, { note:"砂が星の熱で溶けて固まったガラス。" }],
  ["abyssite",  "アビサイト",     "exotic",  "#7a4ae8", 2.0, 3.8, 7, 0, { note:"光を吸い込む暗黒の物質。" }],
  ["novalite",  "ノヴァライト",   "exotic",  "#fff2b0", 2.4, 5.0, 7, 0, { xp:2, note:"星の核そのもの。眩しくて直視できない。" }],
  // ===== 小惑星 (小規模ダンジョン x20) の看板素材。メイン惑星には出ない (layer 8 / w 0) =====
  ["florite",   "フローライト",   "gem",     "#86efac", 1.2, 1.8, 8, 0, { note:"花の形に結晶する、甘い香りの宝石。" }],
  ["ambarite",  "アンバライト",   "gem",     "#ffb020", 1.2, 2.0, 8, 0, { note:"太古の蜜が固まった琥珀色の塊。" }],
  ["fungite",   "ファンガイト",   "element", "#d8b4fe", 1.3, 2.1, 8, 0, { note:"発光する菌糸が編み込まれた鉱石。" }],
  ["candite",   "キャンダイト",   "gem",     "#ff8fab", 1.1, 2.2, 8, 0, { note:"舐めると甘い。掘る手が止まらなくなる。" }],
  ["cobaltite", "コバルト鉱",     "element", "#60a5fa", 1.6, 2.4, 8, 0, { note:"深い青の金属鉱。磁石によく反応する。" }],
  ["sodite",    "ソーダイト",     "liquid",  "#7dd3fc", 1.2, 2.5, 8, 0, { note:"触れるとパチパチ弾ける炭酸の結晶。" }],
  ["lunite",    "ルーナイト",     "rock",    "#e2e8f0", 1.5, 2.7, 8, 0, { note:"月光を吸ってほのかに光る白い石。" }],
  ["pumpkite",  "パンプカイト",   "element", "#fb923c", 1.3, 2.9, 8, 0, { note:"実りの季節にだけ育つ、橙色の実鉱。" }],
  ["goomite",   "グーマイト",     "liquid",  "#a3e635", 1.2, 3.0, 8, 0, { note:"弾力のある粘液が固まったゼリー鉱。" }],
  ["cometite",  "コメタイト",     "liquid",  "#bae6fd", 1.4, 3.2, 8, 0, { note:"彗星の尾から落ちた、冷たい氷塵の核。" }],
  ["dragonite", "ドラゴナイト",   "exotic",  "#f87171", 1.8, 3.5, 8, 0, { note:"竜の鱗のように重なり合う赤い結晶。" }],
  ["mirageite", "ミラージュライト","gem",    "#fde68a", 1.5, 3.7, 8, 0, { note:"見る角度で色が変わる、蜃気楼の結晶。" }],
  ["aurorite",  "オーロライト",   "exotic",  "#6ee7b7", 1.6, 4.0, 8, 0, { xp:2, note:"極光がそのまま固まったような、揺らめく鉱石。" }],
  ["gearite",   "ギアライト",     "element", "#facc15", 1.9, 4.2, 8, 0, { explosive:1, note:"歯車の形に育つ金属。噛み合うと火花を散らす。" }],
  ["nebulite",  "ネビュライト",   "exotic",  "#818cf8", 2.0, 4.5, 8, 0, { note:"星雲のガスが圧縮された、紫紺の塊。" }],
  ["aquamarite","アクアマライト", "gem",     "#2dd4bf", 1.7, 4.8, 8, 0, { note:"深いラグーンの色を閉じ込めた宝石。" }],
  ["crimsonite","クリムゾナイト", "element", "#dc2626", 2.1, 5.2, 8, 0, { note:"血のように赤い、熱を持った鉱石。" }],
  ["luminite",  "ルミナイト",     "exotic",  "#fef9c3", 2.2, 5.6, 8, 0, { xp:2, note:"闇の中で自ら光を放ち続ける石。" }],
  ["jadeite",   "ジェダイト",     "gem",     "#34d399", 2.3, 6.0, 8, 0, { note:"密林の奥でしか育たない、深緑の翡翠。" }],
  ["horizonite","ホライズナイト", "exotic",  "#7c3aed", 2.6, 7.0, 8, 0, { xp:3, note:"事象の地平面の欠片。覗き込むと吸い込まれそうになる。" }],
  // ===== 惑星内部 (矩形ダンジョンの看板素材) =====
  ["ossite",      "オッサイト",     "organic", "#e8e0cc", 1.1, 1.7, 9, 0, { note:"太古の巨獣の骨が石化したもの。骨の回廊に眠る。" }],
  ["rhizomite",   "リゾマイト",     "organic", "#8a9a5b", 1.2, 1.9, 9, 0, { note:"地底を這う根が鉱物化した石。根の迷宮の壁そのもの。" }],
  ["stalactite",  "スタラクタイト", "rock",    "#cfd8dc", 1.3, 2.0, 9, 0, { note:"千年の雫が積み上げた鍾乳石。澄んだ音がする。" }],
  ["halite",      "ハライト",       "gem",     "#fce4ec", 1.4, 2.4, 9, 0, { note:"塩の宮殿に結晶する、淡い桃色の岩塩。" }],
  ["geodite",     "ジオダイト",     "gem",     "#b39ddb", 1.6, 2.8, 9, 0, { note:"岩の中に隠れた空洞で育つ、紫の結晶。" }],
  ["lodestonite", "ロードストーン", "element", "#5c6bc0", 1.8, 3.2, 9, 0, { note:"強い磁気を帯びた石。羅針盤が狂う鉱脈の核。" }],
  ["sarcophagite","サルコファーガイト", "rock", "#78909c", 2.0, 3.6, 9, 0, { note:"古代の墓所を形作る、重く冷たい墓碑石。" }],
  ["brimstonite", "ブリムストーン", "element", "#ff7043", 2.1, 4.0, 9, 0, { explosive:true, note:"硫黄地獄の底で燃え続ける煉獄石。壊すと誘爆する。" }],
  ["stardustite", "スターダスト",   "exotic",  "#ffe082", 2.3, 5.0, 9, 0, { xp:2, note:"降り積もった星屑の層。掘るたびに宇宙の記憶が舞う。" }],
  ["coreheart",   "コアハート",     "exotic",  "#ff5252", 2.6, 7.0, 9, 0, { xp:3, note:"惑星の心臓そのもの。かすかに、鼓動している。" }],
  // ===== 惑星内部 (幻想ダンジョンの看板素材) =====
  ["fairyspring", "フェアリースプリング", "gem",  "#a5f2ff", 1.15, 1.8, 9, 0, { note:"妖精の泉の水が結晶したもの。触れると鈴の音がする。" }],
  ["rainbownite", "レインボーナイト", "gem",     "#f48fb1", 1.3, 2.2, 9, 0, { note:"虹の結晶洞で育つ、七色に瞬く宝石。" }],
  ["spiritwood",  "スピリットウッド", "organic", "#aed581", 1.35, 2.3, 9, 0, { note:"精霊の宿る地底樹の幹。ほのかに光を放つ。" }],
  ["dreamite",    "ドリーマイト",   "exotic",  "#ce93d8", 1.5, 2.7, 9, 0, { note:"夢の層に沈殿する鉱物。眠る者の夢が染み込んでいる。" }],
  ["runestone",   "ルーンストーン", "rock",    "#90caf9", 1.7, 3.0, 9, 0, { note:"魔法の図書館の壁を形作る、文字の浮かぶ石。" }],
  ["chimeraite",  "キマイライト",   "exotic",  "#ffb74d", 1.9, 3.4, 9, 0, { note:"幻獣の巣に残された、獣の気配を帯びた鉱石。" }],
  ["chronoglass", "クロノグラス",   "gem",     "#fff59d", 2.0, 3.8, 9, 0, { note:"時の間の砂が固まったガラス。中の砂は逆向きに落ちる。" }],
  ["seraphite",   "セラファイト",   "exotic",  "#fff9c4", 2.2, 4.4, 9, 0, { note:"天使の聖域に降り積もる、羽のように軽い聖なる石。" }],
  ["demonite",    "デモナイト",     "exotic",  "#6a1b9a", 2.3, 4.8, 9, 0, { note:"悪魔の契約所で交わされた契約が石化したもの。囁きが聞こえる。" }],
  ["yggdrasil",   "イグドラシル",   "exotic",  "#66bb6a", 2.5, 6.5, 9, 0, { xp:3, note:"世界樹の根源そのもの。惑星の全ての命と繋がっている。" }],
  ["mossite",     "モッサイト",     "organic", "#7cb342", 0.8, 1.2, 9, 0, { note:"苔の洞窟の看板素材。湿った緑" }],
  ["terracite",   "テラサイト",     "soil",    "#c97b4a", 0.85, 1.25, 9, 0, { note:"粘土の空洞の看板素材。焼くと固い" }],
  ["sapite",      "サッパイト",     "organic", "#d4a017", 0.9, 1.3, 9, 0, { note:"樹液の層の看板素材。甘く粘る" }],
  ["ryusite",     "リューサイト",   "soil",    "#e0c98f", 0.85, 1.3, 9, 0, { note:"流砂の間の看板素材。握ると零れる" }],
  ["ammonite",    "アンモナイト",   "rock",    "#a1887f", 1.0, 1.4, 9, 0, { note:"アンモナイト層の看板素材。渦巻く化石" }],
  ["anthracite",  "アントラサイト", "element", "#616161", 1.0, 1.4, 9, 0, { note:"炭の小部屋の看板素材。無煙でよく燃える" }],
  ["aqualite",    "アクアライト",   "gem",     "#4fc3f7", 0.9, 1.45, 9, 0, { note:"湧水の間の看板素材。水の結晶" }],
  ["rustite",     "ラスタイト",     "rock",    "#a15c3f", 1.05, 1.5, 9, 0, { note:"錆鉄の鉱脈の看板素材。赤茶の鉄" }],
  ["petalite",    "ペタライト",     "gem",     "#f06292", 0.95, 1.55, 9, 0, { note:"花弁の層の看板素材。散らない花びら" }],
  ["glassite",    "グラサイト",     "gem",     "#a7d7d0", 1.1, 1.6, 9, 0, { note:"硝子の浅層の看板素材。天然のガラス" }],
  // ===== 最難関ダンジョン (ワールドの四隅) の看板素材 =====
  ["astralite",   "アストラライト", "exotic",  "#8ec5ff", 3.0, 12, 10, 0, { xp:5, note:"星界の終点で結晶した、星そのものの欠片。光が中で何度も生まれ直している。" }],
  ["meteorium",   "メテオリウム",   "exotic",  "#ff7a3d", 3.4, 15, 10, 0, { xp:6, note:"流星の墓場に積もる隕鉄。触れると、落ちてきた時の熱がまだ残っている。" }],
  ["galaxium",    "ガラクシウム",   "exotic",  "#d77bff", 3.8, 19, 10, 0, { xp:7, note:"銀河の回廊で渦を巻く、紫の星雲が固まった金属。覗き込むと銀河が回っている。" }],
  ["voidheart",   "ヴォイドハート", "exotic",  "#3dffc8", 4.2, 24, 10, 0, { xp:8, note:"虚空の胃袋の最奥で脈打つ、光を呑む心臓。重さが、周りの空間ごと歪めている。" }],
];
const MATS = [], MAT = {};
MAT_SRC.forEach(([key, name, cat, color, hard, coin, layer, w, opt], i) => {
  const n = parseInt(color.slice(1), 16);
  const m = { key, name, cat, color, hard, coin, layer, w, i, r:n >> 16 & 255, g:n >> 8 & 255, b:n & 255, ...(opt || {}) };
  m.xp = m.xp || 1; m.explosive = !!m.explosive;
  MATS.push(m); MAT[key] = m;
});
const MAT_KEYS = MATS.map(m => m.key);
const matColorRGB = m => `${m.r},${m.g},${m.b}`;

// ---------- 地層ごとの分布表 (累積重み) ----------
// 地表はバイオーム別に別の表を使う
function buildTable(list){   // list: [[matIndex, weight], ...]。重い (よく出る) 順に並べる: 遠景は先頭側だけから選ぶ
  list = list.slice().sort((a, b) => b[1] - a[1]);
  const total = list.reduce((s, e) => s + e[1], 0);
  const idx = new Int16Array(list.length), cum = new Float32Array(list.length);
  let acc = 0;
  list.forEach((e, i) => { acc += e[1] / total; idx[i] = e[0]; cum[i] = acc; });
  cum[list.length - 1] = 1.0001;
  return { idx, cum, total };
}
const LAYER_TABLES = LAYERS.map((_, li) => buildTable(MATS.filter(m => m.layer === li && m.w > 0).map(m => [m.i, m.w])));
const biomeTable = o => buildTable(Object.entries(o).map(([k, w]) => [MAT[k].i, w]));
const BIOME = {
  ocean:  biomeTable({ water:84, salt:4, kelp:5, coral:3, shell:2, sand:2 }),
  deep:   biomeTable({ deepWater:88, salt:3, kelp:2, coral:2, shell:2, sand:3 }),
  land:   biomeTable({ grass:40, soil:28, wood:12, stone:9, clay:6, sand:2, sandstone:3 }),
  forest: biomeTable({ wood:45, grass:30, soil:15, stone:5, clay:5 }),
  desert: biomeTable({ sand:66, sandstone:18, salt:6, clay:5, bone:2, stone:3 }),
  polar:  biomeTable({ ice:56, snow:30, permafrost:14 }),
};
function pickFrom(tab, h){
  const c = tab.cum; let lo = 0, hi = c.length - 1;
  while (lo < hi){ const mid = (lo + hi) >> 1; if (h <= c[mid]) hi = mid; else lo = mid + 1; }
  return tab.idx[lo];
}
// 希少度 (アイテム一覧の表示用): 層の中での出現割合
const matShare = m => { if (m.layer === 0 || !m.w) return 0.3; return m.w / LAYER_TABLES[m.layer].total; };
const matRarity = m => { const s = matShare(m); return s < 0.012 ? 3 : s < 0.03 ? 2 : s < 0.09 ? 1 : 0; };
const RARITY_NAMES = ["ありふれた", "よく見る", "希少", "極稀"];

// ---------- 所持数 ----------
// state.inv[key] = 個数。state は core/state.js で定義される (materials.js の方が先に読み込まれるので、参照は関数の中でだけ行う)
const invOf   = k => (state.inv && state.inv[k]) || 0;
const invHas  = rec => Object.keys(rec).every(k => invOf(k) >= rec[k]);
const invTake = rec => { for (const k in rec) state.inv[k] = Math.max(0, invOf(k) - rec[k]); invVersion++; };
function invAdd(k, n){
  if (n <= 0) return;
  state.inv[k] = invOf(k) + n; invVersion++;
  if (!state.seen[k]){ state.seen[k] = 1; newMaterialFound(MAT[k]); }
  // 自動換金 (採掘スキル): 999個を超えた分はコインに変わる
  if (typeof sk === "function" && sk("e_sell")){
    const cap = sk("e_sell3") ? 9999 : sk("e_sell2") ? 2999 : 999;
    if (state.inv[k] > cap){
      const ex = state.inv[k] - cap; state.inv[k] = cap;
      if (typeof addCoins === "function") addCoins(Math.round(ex * Math.max(1, Math.round(MAT[k].coin * 10)) * skA("e_sell") * skMul("e_sell2", 2) * skMul("e_sell3", 2) * (1 + (typeof artVal === "function" ? artVal("sell") : 0))));
    }
  }
}
// 新素材の発見通知 (ui/notify.js の toast を使う。読み込み前に呼ばれたときは何もしない)
function newMaterialFound(m){
  if (typeof toast === "function" && typeof started !== "undefined" && started) toast(`新素材「${m.name}」を発見`, "good");
}
// 不足分: { key: 不足数 }
function invLack(rec){
  const out = {}; let any = false;
  for (const k in rec){ const d = rec[k] - invOf(k); if (d > 0){ out[k] = d; any = true; } }
  return any ? out : null;
}
