"use strict";
/* =========================================================
   data/weapons.js - 装備 (全137種) のマスターデータと強化コスト
   ========================================================= */

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
  "手近な素材で作れる最初の道具", "浅い鉱脈の金属と燃料", "岩盤の金属と宝石",
  "熱と圧力の素材", "超高圧鉱物と重元素", "液体金属とプラズマ", "常識の外の物質", "衛星惑星の素材", "小惑星の素材", "惑星内部の素材", "ワールド四隅の最難関ダンジョンの素材。超広範囲・超火力"][i] }));
const WEAPON_SRC = [
  // ===== 地表 =====
  ["handDrill",   "ハンドドリル",       null,         "標準",   "drill",    "dot",     { eff:1, rate:4 }, "効果なし", "最初から持っている手回しのドリル。", {}],
  ["woodBow",     "木の弓",             "wood",       "急所射ち",   "normal",   "arrow",   { eff:1, rate:5, critC:.15, critM:1.5 }, "15%の確率で会心 (1.5倍)", "枝をしならせて矢を放つ弓。", { wood:10 }],
  ["stoneSling",  "石の投石器",         "stone",      "重撃",   "heavy",    "rock",    { eff:1.05, rate:2.2, size:6, pierce:1 }, "1個貫通し、壊して余った威力で奥のブロックも撃ち抜く", "大きな石を振り回して投げる。", { stone:6, wood:8 }],
  ["sandBlaster", "砂の散弾",           "sand",       "拡散",   "spread",   "grain",   { rate:4, pellets:3, spreadA:.16, eff:3.06 }, "3方向へ同時に発射", "砂をつかんで投げつける。", { sand:20, shell:2 }],
  ["waterJet",    "水鉄砲",             "water",      "跳ね水",   "rapid",    "drop",    { eff:.928, rate:10, bounce:1 }, "壁に当たると1回跳ね返り、隣のブロックも削る", "勢いよく水を噴き出す。", { water:20, clay:6 }],
  ["iceLance",    "氷の槍",             "ice",        "氷結",   "needle",   "shard",   { rate:7, bulletSpeed:1400, pierce:1, eff:2.2, size:3, frost:1 }, "1個貫通。当たったブロックは凍り、3秒間受けるダメージ +30%", "細く鋭い氷柱。", { ice:20, snow:8 }],
  ["clayBomb",    "粘土爆弾",           "clay",       "時限爆弾","bomber",  "bomb",    { rate:2.5, bomb:2, eff:2.14 }, "当てたブロックに爆弾を仕掛け、1.5秒後に200%で起爆して周囲も巻き込む", "粘土に火薬を詰めた爆弾。", { clay:15, salt:5 }],
  ["saltShard",   "塩の結晶弾",         "salt",       "分裂",   "split",    "crystal", { rate:4, split:4, eff:2.83 }, "当たると破片が周囲4個にも40%ダメージ", "着弾の瞬間、塩の結晶が四方へ飛ぶ。", { salt:15, sand:20 }],
  ["coralNeedle", "珊瑚の二連針",       "coral",      "2連装",  "double",   "needle",  { rate:4.5, pellets:2, spreadA:.07, eff:2.05 }, "2発を並べて同時に撃つ", "珊瑚の枝を削った針。", { coral:12, shell:6 }],
  ["shellBoomerang","貝殻ブーメラン",   "shell",      "跳弾",   "ricochet", "moon",    { rate:4, bounce:3, eff:3.81 }, "当たると近くの別のブロックへ跳ねる (最大3回)", "ブロックが密集した場所に向く。", { shell:12, kelp:8 }],
  // ===== 表土 =====
  ["flintGun",    "火打石の銃",         "flint",      "会心",   "crit",     "spark",   { rate:4, critC:.3, critM:4, eff:1.9 }, "30%の確率でダメージ4倍", "火花とともに撃ち出す弾。", { flint:50, peat:20 }],
  ["copperGun",   "銅の銃",             "copperOre",  "金運",   "normal",   "disc",    { eff:1, rate:5, coinMul:1.1 }, "コイン +10%", "初めての金属の銃。", { copperOre:60, gravel:30 }],
  ["tinRapid",    "錫のラピッド",       "tinOre",     "軽業",   "rapid",    "needle",  { eff:.928, rate:10, critC:.1, critM:2 }, "毎秒10発。10%の確率で会心 (2倍)", "軽い錫の弾を高速で連射する。", { tinOre:60, copperOre:20 }],
  ["coalBurner",  "石炭バーナー",       "coal",       "燃焼",   "burner",   "flame",   { rate:6, burn:.8, eff:1.28 }, "当たったブロックが燃え、3秒間ダメージを受け続ける", "撃ったあとも燃え続ける火炎弾。", { coal:80, flint:20 }],
  ["limeCrusher", "石灰クラッシャー",   "limestone",  "範囲",   "crusher",  "rock",    { rate:2.5, splash:1, eff:4.05, size:5 }, "着弾点の周囲3x3にも50%ダメージ", "白い塊が砕けて周囲も巻き込む。", { limestone:80, gravel:40 }],
  ["amberLens",   "琥珀のレンズ",       "amber",      "光束",   "laser",    "beam",    { eff:1, rate:16, mode:"laser" }, "ビームを照射し、余ったダメージは射線の奥へ届く", "琥珀で集めた光を毎秒16回照射する。", { amber:40, copperOre:30 }],
  ["sulfurFlare", "硫黄の火炎弾",       "sulfur",     "爆炎",   "flare",    "flame",   { rate:2, splash:1, burn:1, eff:4.51, size:5 }, "着弾点の周囲3x3を巻き込み、燃やし続ける", "硫黄の粉が爆ぜて燃える。", { sulfur:60, coal:40 }],
  ["bronzeGatling","青銅ガトリング",    "copperOre",  "加速連射","gatling", "disc",    { rate:3, spinMax:6, spinShots:40, eff:3.06, accent:"#cd7f32" }, "撃ち続けるほど連射が加速 (最大6倍)", "銅と錫を合わせた青銅の砲身。", { copperOre:80, tinOre:80 }],
  ["fossilBreaker","化石の砕骨弾",      "fossil",     "処刑",   "reaper",   "skull",   { rate:4, exec:.3, eff:1.08, xpMul:1.5 }, "HP30%以下のブロックを即座に砕く。経験値 +50%", "太古の骨を削った弾。", { fossil:50, limestone:50 }],
  // ===== 地殻 =====
  ["ironCannon",  "鉄の砲",             "ironOre",    "鉄片炸裂",   "heavy",    "cube",    { rate:2, eff:1.08, size:7, frags:2, fragDmg:.5 }, "着弾すると鉄片2つが飛び散り、周囲にも50%ダメージ", "黒い鉄球を撃ち出す砲。", { ironOre:120, coal:40 }],
  ["leadSlug",    "鉛の重弾",           "leadOre",    "貫通",   "pierce",   "cube",    { rate:3, pierce:3, eff:3.74, size:6 }, "弾が最大3個までブロックを貫通する", "並んだブロックをまとめて貫く鉛弾。", { leadOre:120, ironOre:40 }],
  ["quartzLaser", "水晶レーザー",       "quartz",     "同時照射","twin",    "beam",    { rate:10, mode:"laser", targets:2, eff:2 }, "近い2つのブロックを同時に照射", "水晶で光を2本に分ける。", { quartz:100, silverOre:30 }],
  ["magnetHoming","磁鉄ホーミング",     "magnetite",  "追尾",   "homing",   "orb",     { eff:1, rate:5, homing:true }, "弾が近くのブロックへ自動で曲がっていく", "磁石の弾がブロックへ吸い寄せられる。", { magnetite:100, copperOre:50 }],
  ["obsidianBlade","黒曜石の刃",        "obsidian",   "貫通刃", "needle",   "shard",   { rate:7, bulletSpeed:1500, pierce:4, eff:4.6, size:4 }, "高速の刃が4個まで貫通する", "火山ガラスを削った刃。", { obsidian:100, basalt:50 }],
  ["silverArc",   "銀の連鎖",           "silverOre",  "連鎖雷", "chain",    "bolt",    { rate:3, mode:"chain", chains:6, chainDecay:.75, eff:3.46 }, "命中後、近くのブロックへ6回まで連鎖 (1回ごとに75%)", "銀を伝って、雷がブロックからブロックへ走る。", { silverOre:100, zincOre:50 }],
  ["goldBullet",  "黄金の弾丸",         "goldOre",    "金運",   "midas",    "disc",    { eff:1, rate:5, coinMul:1.5 }, "コイン +50%", "金で作った弾丸。", { goldOre:80, ironOre:60 }],
  ["jadeRicochet","翡翠のリコシェ",     "jade",       "跳弾",   "ricochet", "moon",    { rate:4, bounce:5, eff:5.2 }, "別のブロックへ5回まで跳ねる", "磨いた翡翠はよく弾む。", { jade:80, marble:60 }],
  ["amethystPrism","紫水晶プリズム",    "amethyst",   "分光",   "prism",    "beam",    { rate:10, mode:"laser", targets:3, eff:2.83 }, "光が3本に分かれ、3つのブロックを同時に照射", "紫の結晶で光を3本に分ける。", { amethyst:80, quartz:80 }],
  ["graniteMissile","花崗岩ミサイル",   "granite",    "大爆発", "missile",  "rock",    { rate:1, splash:2, bulletSpeed:380, eff:10.3, size:7 }, "ゆっくり飛ぶ大型弾。着弾すると5x5が吹き飛ぶ", "巨岩を撃ち出す。", { granite:150, ironOre:80 }],
  ["basaltDrill", "玄武岩ドリル",       "basalt",     "掘削弾", "drillshot","gear",    { rate:2, pierce:8, bulletSpeed:500, eff:8.75, size:6 }, "回転する弾が8個までブロックを掘り抜く", "回転しながら掘り進む弾。", { basalt:150, ironOre:100 }],
  ["lapisStorm",  "瑠璃の雷嵐",         "lapis",      "大連鎖", "storm",    "bolt",    { rate:2, mode:"chain", chains:12, chainDecay:.85, eff:5.98 }, "12回まで連鎖する雷 (1回ごとに85%)", "瑠璃から雷を呼ぶ。", { lapis:80, silverOre:60 }],
  ["zincSwarm",   "亜鉛スウォーム",     "zincOre",    "群体",   "hydra",    "orb",     { rate:3, pellets:4, spreadA:.35, homing:true, eff:4.1, size:3 }, "4発の追尾弾を広げて撃つ", "小さな弾の群れが、それぞれ別のブロックを狙う。", { zincOre:120, magnetite:60 }],
  ["steelVulcan", "鋼のバルカン",       "ironOre",    "弾幕",   "vulcan",   "needle",  { eff:.881, rate:24, jitter:.12, size:3, accent:"#b0c4de" }, "毎秒24発の弾幕", "鉄に炭素を混ぜた鋼の砲身。", { ironOre:200, coal:150 }],
  ["nickelShotgun","ニッケル散弾",      "nickelOre",  "散弾",   "shotgun",  "grain",   { rate:1.6, pellets:7, spreadA:.1, range:.75, eff:7.81 }, "7発の散弾。射程は短い", "近づいてまとめて吹き飛ばす。", { nickelOre:120, zincOre:80 }],
  ["oilFlamethrower","重油の火炎放射",  "oilShale",   "火炎",   "burner",   "flame",   { rate:8, burn:1.2, eff:1.6, range:.7 }, "短射程だが、強く長く燃やす", "黒い油を吹き付けて火を放つ。", { oilShale:120, sulfur:60 }],
  // ===== 上部マントル =====
  ["titaniumRail","チタンレールガン",   "titaniumOre","超電磁", "rail",     "beam",    { rate:1.2, mode:"beam", range:1.5, beamW:8, eff:22.3 }, "射程1.5倍の超高速ビーム。射線上をすべて貫く", "軽くて強いチタンのレール。", { titaniumOre:200, ironOre:150 }],
  ["tungstenAP",  "タングステン徹甲弾", "tungstenOre","徹甲",   "heavy",    "cube",    { rate:2, pierce:2, ap:.002, eff:3.4, size:7 }, "2個貫通。命中ごとに最大HPの0.2%を追加ダメージ", "最も融点の高い金属の弾頭。", { tungstenOre:200, leadOre:100 }],
  ["rubyLaser",   "ルビーレーザー",     "ruby",       "灼熱光", "laser",    "beam",    { rate:14, mode:"laser", burn:.6, eff:1.3 }, "照射したブロックが燃え続ける", "赤い光で岩を焼く。", { ruby:120, goldOre:80 }],
  ["sapphireFrost","サファイア氷結砲",  "sapphire",   "氷結範囲","crusher", "crystal", { rate:2.5, splash:1, frost:1, eff:4.8, size:5 }, "3x3を凍らせる。凍ったブロックは受けるダメージ +30%", "青い結晶が砕け、冷気が周囲を包む。", { sapphire:120, ice:200 }],
  ["emeraldAcid", "エメラルドの毒霧",   "emerald",    "腐食",   "nova",     "drop",    { rate:4, acid:.6, eff:1.3 }, "命中したブロックが4秒間溶け続ける (毎秒60%)", "緑の霧が岩に染み込み、内側から崩す。", { emerald:120, sulfur:100 }],
  ["topazBeam",   "トパーズの光条",     "topaz",      "二重光", "eclipse",  "beam",    { rate:3, mode:"beam", targets:2, eff:26 }, "2方向へ同時に貫通ビーム", "黄金色の光が2本の線を引く。", { topaz:120, quartz:150 }],
  ["garnetBarrage","ガーネットの弾幕",  "garnet",     "炸裂弾幕","spread",  "crystal", { rate:2.5, pellets:5, spreadA:.22, splash:1, eff:9.5, size:4 }, "5発の炸裂弾を扇状に撃ち、それぞれ3x3を巻き込む", "深紅の結晶が扇状に弾ける。", { garnet:150, granite:150 }],
  ["magmaAura",   "マグマ噴射器",       "magma",      "常時範囲","aura",    "flame",   { rate:5, mode:"aura", auraR:90, burn:.3, eff:33 }, "弾は撃たない。周囲90の全ブロックを常に削り、燃やす", "溶けた岩をまとい、まわりを溶かす。", { magma:200, basalt:150 }],
  ["platinumCrit","白金の会心",         "platinumOre","会心",   "crit",     "star",    { rate:4, critC:.4, critM:5, eff:2.6, coinMul:1.3 }, "40%の確率でダメージ5倍。コイン +30%", "白金の弾。", { platinumOre:150, goldOre:150 }],
  ["cobaltNova",  "コバルトノヴァ",     "cobaltOre",  "誘爆",   "nova",     "ring",    { rate:2.5, nova:1, eff:3.51 }, "壊したブロックが爆発し、周囲8個へそのブロックの最大HPの60%ダメージ", "壊れたブロックが隣も巻き込んで弾ける。", { cobaltOre:150, tungstenOre:100 }],
  ["chromeMirror","クロムの鏡弾",       "chromite",   "鏡面",   "ricochet", "disc",    { rate:4, bounce:6, pierce:2, eff:7.5 }, "2個貫通し、6回跳ねる", "鏡のように磨かれた跳弾。", { chromite:150, jade:100 }],
  ["olivineVortex","オリビンの渦",      "olivine",    "渦",     "vortex",   "ring",    { rate:6, mode:"aura", auraR:130, eff:77.2 }, "周囲130の全ブロックを削る大渦", "マントルの緑をまとって渦巻く力場。", { olivine:250, peridotite:250 }],
  ["bismuthCluster","ビスマス結晶爆",   "bismuth",    "子弾",   "cluster",  "crystal", { rate:2, frags:8, fragDmg:.5, eff:4.1, size:5 }, "着弾すると8発の子弾 (50%) に分かれて飛び散る", "虹色の階段結晶が弾けて散る。", { bismuth:150, zincOre:100 }],
  ["lithiumFlash","リチウム閃光",       "lithium",    "電撃弾幕","vulcan",  "spark",   { eff:1.1, rate:30, jitter:.1, size:3, shock:.2 }, "毎秒30発。20%の確率で隣のブロックへ放電 (50%)", "最も軽い金属の高速弾。", { lithium:250, silverOre:300 }],
  // ===== 下部マントル =====
  ["diamondDrill","ダイヤモンドドリル", "diamond",    "超掘削", "drill",    "gear",    { rate:2, pierce:14, bulletSpeed:520, eff:14, size:6 }, "回転する刃が14個までブロックを掘り抜く", "最も硬い物質の刃。", { diamond:200, titaniumOre:200 }],
  ["uraniumCannon","ウラン砲",          "uranium",    "放射",   "nova",     "skull",   { rate:3, radiation:.5, splash:1, eff:5.5, size:5 }, "3x3に余波。当たったブロックは崩壊を続け、壊れると隣へ放射能が移る", "周囲を少しずつ蝕む放射能の弾。", { uranium:200, leadOre:300 }],
  ["thoriumEmber","トリウムの熾火",     "thorium",    "業火",   "flare",    "flame",   { rate:2, splash:1, burn:1.5, eff:5.5, size:5 }, "3x3を巻き込み、強く燃やし続ける", "消えない火で岩盤を崩す。", { thorium:200, magma:200 }],
  ["iridiumStarbreaker","イリジウムの星砕き","iridium","殲滅",  "omega",    "cube",    { rate:.6, splash:3, bulletSpeed:420, eff:24.2, size:10 }, "着弾で7x7を消し飛ばす", "恐竜を滅ぼした金属で、惑星を砕く。", { iridium:200, platinumOre:200 }],
  ["osmiumSlug",  "オスミウム超重弾",   "osmium",     "超重撃", "giga",     "cube",    { rate:.8, splash:1, bulletSpeed:520, exec:.3, eff:5.2, size:9 }, "最大級の一発。周囲を巻き込み、HP30%以下を砕く", "最も重い元素の弾。", { osmium:200, tungstenOre:300 }],
  ["rhodiumLight","ロジウムの反射光",   "rhodium",    "多重光", "hyperion", "beam",    { rate:8, mode:"laser", targets:5, eff:5.5 }, "5本の光で同時照射", "鏡の金属で光を5本に分ける。", { rhodium:200, chromite:200 }],
  ["palladiumCatalyst","パラジウム触媒弾","palladium","触媒",   "homing",   "disc",    { rate:5, homing:true, matBonus:1, eff:1 }, "追尾。壊したブロックの素材が2倍", "反応を加速させる触媒の弾。", { palladium:200, emerald:150 }],
  ["perovskiteResonance","ペロブスカイト共鳴","perovskite","共鳴雷","tempest","bolt",  { rate:2, mode:"chain", chains:16, chainDecay:.88, splash:1, eff:30 }, "16回連鎖する雷。命中点の周囲3x3も巻き込む", "結晶が共鳴して雷を連鎖させる。", { perovskite:300, lapis:200 }],
  ["moltenTorrent","溶鉄の奔流",        "moltenIron", "灼熱奔流","quasar",  "flame",   { rate:2, mode:"beam", splash:1, beamW:9, burn:.5, eff:64 }, "射線上をすべて貫き、周囲も燃やす極太の奔流", "白熱した鉄の流れをまっすぐ撃ち出す。", { moltenIron:300, ironOre:500 }],
  ["spinelStarfall","スピネル星屑",     "spinel",     "流星群", "starfall", "star",    { rate:1.5, pellets:5, spreadA:.2, splash:1, homing:true, eff:19.6, size:5 }, "5発の追尾流星。それぞれ周囲3x3を巻き込む", "赤い星屑を狙った場所へ降らせる。", { spinel:200, garnet:200 }],
  ["carbonadoNeedle","カーボナードの針","carbonado",  "必中会心","nemesis", "needle",  { rate:6, homing:true, pierce:6, critC:.5, critM:5, eff:19.6, size:4 }, "追尾・6貫通。50%の確率でダメージ5倍", "黒いダイヤモンドの針。", { carbonado:150, diamond:150 }],
  ["stishoviteQuake","スティショバイト震波","stishovite","震波", "wave",     "ring",    { rate:3, mode:"aura", auraR:110, shatter:.05, eff:52 }, "周囲110を削る。壊れたブロックが弾け、隣へ最大HPの5%ダメージ", "超高圧の結晶が脈打ち、地面を震わせる。", { stishovite:300, bridgmanite:300 }],
  // ===== 外核 =====
  ["liquidIronSerpent","液鉄の大蛇",    "liquidIron", "大蛇雷", "infinity", "bolt",    { rate:2, mode:"chain", chains:22, chainDecay:.9, splash:1, eff:46 }, "22回連鎖する雷。命中点の周囲3x3も巻き込む", "液体の鉄が蛇のようにうねる。", { liquidIron:400, moltenIron:300 }],
  ["nickelMagstorm","ニッケル磁嵐",     "liquidNickel","全方位追尾","ragnarok","orb",  { rate:1.5, pellets:12, arc:true, homing:true, eff:13, size:4 }, "全方向へ12発の追尾弾を放つ", "磁場の嵐を全方位へ放つ。", { liquidNickel:400, magnetite:400 }],
  ["plasmaCannon","プラズマキャノン",   "deepPlasma", "三重極光","eclipse", "beam",    { rate:2, mode:"beam", targets:3, splash:1, beamW:9, eff:201 }, "3方向へ同時に極太ビーム。周囲も焼く", "プラズマを3本のビームにして放つ。", { deepPlasma:400, lithium:300 }],
  ["helium3Gravity","ヘリウム3重力球",  "helium3",    "重力球", "singularity","orb",   { rate:.5, orb:true, orbR:64, bulletSpeed:110, eff:415 }, "ブロックをすり抜けて進む重力球。半径64を毎秒8回削り続ける", "核融合の燃料を球にして放つ。", { helium3:300, diamond:300 }],
  ["ferrofluidMaelstrom","磁性流体の大渦","ferrofluid","大渦",  "pulsar",   "ring",    { rate:7, mode:"aura", auraR:170, eff:143 }, "周囲170の全ブロックを削る", "棘を立てる黒い液体が周囲を飲み込む。", { ferrofluid:400, olivine:400 }],
  ["coriumDecay", "コリウム崩壊弾",     "corium",     "崩壊",   "worldend", "skull",   { rate:1, splash:2, radiation:1, exec:.25, bulletSpeed:400, eff:16, size:8 }, "5x5を巻き込み、放射能を残し、HP25%以下を砕く", "溶け落ちた核燃料の塊を撃つ。", { corium:400, uranium:400 }],
  ["stellarRagnarok","星鉄のラグナロク","stellarIron","神々の黄昏","ragnarok","star",  { rate:1.5, pellets:16, arc:true, homing:true, splash:1, eff:40, size:5 }, "全方向へ16発の炸裂追尾弾", "星の中心で鍛えた鉄の弾。", { stellarIron:400, iridium:300 }],
  ["mercurySplit","水銀の分裂弾",       "mercury",    "増殖",   "fractal",  "drop",    { rate:3, split:6, bounce:3, frags:6, eff:16, size:5 }, "跳ねるたびに破片を6個まき散らし、消えるときは6発の子弾になる", "分かれては跳ねる液体金属の弾。", { mercury:400, bismuth:300 }],
  ["neutronNeedle","中性子の針",        "neutronDust","極貫通", "sniper",   "needle",  { rate:3, range:1.6, bulletSpeed:2000, pierce:20, ap:.005, eff:22, size:3 }, "射程1.6倍。20個貫通し、命中ごとに最大HPの0.5%を追加ダメージ", "ひと粒が山ほど重い針。", { neutronDust:300, osmium:300 }],
  ["goldMeltRain","溶融金の雨",         "goldMelt",   "黄金の雨","starfall","drop",    { rate:2, pellets:6, spreadA:.3, homing:true, splash:1, coinMul:2.5, eff:22, size:5 }, "6発の炸裂追尾弾。コイン2.5倍", "金の雨を降らせる。", { goldMelt:300, goldOre:800 }],
  // ===== 内核 =====
  ["adamantJudgment","アダマントの断罪","adamant",    "断罪光", "hyperion", "beam",    { rate:8, mode:"laser", targets:6, exec:.35, eff:7.91 }, "6本の光で同時照射。HP35%以下は即座に砕く", "天から下る6本の裁きの光。", { adamant:500, rhodium:400 }],
  ["voidRift",    "虚空の裂け目",       "voidCrystal","虚空球", "graviton", "orb",     { rate:.45, orb:true, orbR:96, bulletSpeed:100, eff:1100 }, "半径96の巨大重力球。通り道をすべて飲み込む", "虚空の結晶から、すべてを飲み込む穴を開ける。", { voidCrystal:500, helium3:400 }],
  ["starMetalOmega","星金のオメガ",     "starMetal",  "星砕き", "omega",    "star",    { rate:.6, splash:4, bulletSpeed:420, frags:8, fragDmg:.5, eff:40, size:11 }, "着弾すると9x9を消し飛ばし、8発の子弾をまき散らす", "最後の文字の名を冠した大砲。", { starMetal:500, stellarIron:400 }],
  ["darkMatterMaw","暗黒物質の顎",      "darkMatter", "終焉の渦","worldend","ring",    { rate:8, mode:"aura", auraR:220, exec:.3, eff:261 }, "周囲220を削り、HP30%以下を砕く", "見えない顎がすべてを噛み砕く。", { darkMatter:500, ferrofluid:400 }],
  ["antimatterGenesis","反物質の創世",  "antimatter", "創世爆発","genesis", "orb",     { rate:.7, splash:3, frags:12, fragDmg:.6, bulletSpeed:440, eff:40, size:9 }, "7x7を吹き飛ばし、さらに12発の子弾 (60%) をまき散らす", "物質に触れると光に変わる反物質の弾。", { antimatter:500, corium:400 }],
  ["chroniteInfinity","クロナイトの無限連鎖","chronite","無限連鎖","infinity","bolt",  { rate:2, mode:"chain", chains:30, chainDecay:.92, splash:1, eff:57.2 }, "30回連鎖する雷。命中点の周囲3x3も巻き込む", "時間が遅れた結晶の中で、稲妻が輪を描く。", { chronite:500, liquidIron:400 }],
  ["aetherPrism", "エーテルの七色光",   "aether",     "七色光", "prism",    "beam",    { rate:10, mode:"laser", targets:7, splash:1, eff:12 }, "7本の光が、それぞれ3x3を焼く", "宇宙を満たす光を7本に分けて放つ。", { aether:500, coreQuartz:300 }],
  ["quantumSwarm","量子泡の群れ",       "quantumFoam","量子群体","swarm",   "orb",     { rate:1.5, pellets:14, spreadA:.3, homing:true, pierce:3, eff:40, size:3 }, "14発の貫通追尾弾を一斉に放つ", "時空の泡の群れ。", { quantumFoam:500, neutronDust:300 }],
  ["singularityCannon","特異点砲",      "singularityShard","宇宙創成","bigbang","orb", { rate:.4, orb:true, orbR:128, bulletSpeed:90, eff:2220 }, "半径128の超重力球。通り道をすべて飲み込む", "宇宙の始まりの一点を撃ち出す。", { singularityShard:600, voidCrystal:400 }],
  ["primordialOrigin","原初の光",       "primordial", "原点",   "origin",   "beam",    { rate:6, mode:"laser", targets:10, splash:2, exec:.4, eff:95.6 }, "10本の光が5x5ずつ焼き払い、HP40%以下を砕く", "原初の光を10本に分けて放つ。", { primordial:800, adamant:300, antimatter:300 }],
  // ===== 衛星惑星 (ミニダンジョンの素材で作る) =====
  ["magmaForge",  "マグマフォージ",     "magmalite",  "灼熱",   "burner",   "flame",   { rate:3, burn:.5, eff:106, size:6 }, "当たったブロックが強く燃える", "溶岩の星の核を炉に組み込んだ銃。", { magmalite:200, magma:300 }],
  ["permaFrost",  "パーマフロスト",     "permaice",   "絶対氷結","crusher",  "crystal", { rate:5, frost:1, splash:1, exec:.3, eff:119, size:5 }, "3x3を凍らせる。凍って残りHP30%以下になったブロックは、その場で砕け散る", "氷の星から切り出した冷気の塊。", { permaice:250, permafrost:200 }],
  ["toxicNeedle", "トキサイトニードル", "toxicite",   "猛毒貫通","sniper",   "needle",  { rate:4, acid:.6, pierce:3, eff:132, size:4, bulletSpeed:1600 }, "3個貫通し、猛毒で溶かし続ける", "毒の星の結晶を削った針。", { toxicite:300, sulfur:200 }],
  ["prismJudgment","プリズムジャッジ",  "prismore",   "分光断罪","hyperion", "beam",    { rate:7, mode:"laser", targets:8, exec:.35, eff:148 }, "8本の分光レーザー。HP35%以下を砕く", "光を七色に裂く結晶。", { prismore:350, relicstone:200 }],
  ["voltTempest", "ヴォルトテンペスト", "voltore",    "雷爆",   "nova",     "ring",    { rate:3, shock:.35, nova:1, eff:165, size:7 }, "誘爆と放電の嵐。壊したブロックが爆発する", "雷の星の鉱石を使った銃。", { voltore:400, abyssite:150 }],
  ["novaHeart",   "ノヴァハート",       "novalite",   "星核波動","worldend", "ring",    { rate:6, mode:"aura", auraR:240, exec:.3, eff:184 }, "周囲240を星の核の波動で削り、HP30%以下を砕く", "小さな星の心臓を組み込んだ兵器。", { novalite:500, magmalite:200, nereidpearl:200 }],
  // ===== 小惑星 (小規模ダンジョン x20 の看板素材で作る) =====
  ["floraBloom",  "フローラブルーム",   "florite",   "開花",   "genesis",  "petal",   { rate:4, pellets:5, spreadA:.3, eff:198 }, "5方向に花びらの弾をばらまく", "撃つたびに花が咲く。", { florite:180, ambarite:60 }],
  ["amberHive",   "アンバーハイブ",     "ambarite",  "追尾",   "swarm",    "drop",    { rate:5, homing:1, eff:207 }, "蜜蜂のようにブロックを追い続ける弾", "蜂の巣ごと背負った銃。", { ambarite:220, fungite:60 }],
  ["fungusCannon","ファンガスキャノン", "fungite",   "胞子爆弾","bomber",  "bomb",    { rate:2.6, bomb:2, acid:.4, eff:216, size:6 }, "胞子爆弾を仕掛け、1.5秒後に200%で起爆。残った胞子は酸になり、4秒間溶かし続ける", "胞子を詰めた爆弾。", { fungite:240, candite:80 }],
  ["candyRain",   "キャンディレイン",   "candite",   "拡散",   "split",    "crystal", { rate:5, pellets:7, spreadA:.4, eff:226 }, "7方向へ甘い破片を雨のように撒く", "お菓子の雨で岩を砕く。", { candite:260, cobaltite:80 }],
  ["cobaltDrill", "コバルトドリル",     "cobaltite", "貫通",   "drillshot","needle",  { rate:6, pierce:4, ap:1, eff:236, bulletSpeed:1500, size:3 }, "4個貫通する徹甲ドリル弾", "磁力で加速する青い回転弾。", { cobaltite:300, sodite:100 }],
  ["sodaPopper",  "ソーダポッパー",     "sodite",    "炭酸炸裂",   "rapid",    "bubble",  { rate:11, splash:1, frags:3, fragDmg:.3, eff:246 }, "炭酸の泡を毎秒11発。着弾すると3x3が弾け、泡の破片3つが飛び散る", "炭酸の泡を撃ち続ける。", { sodite:320, lunite:100 }],
  ["lunaSaber",   "ルーナセイバー",     "lunite",    "月光氷結",   "hyperion", "beam",    { rate:6, mode:"laser", targets:4, frost:1, eff:257 }, "月光のレーザーを4目標へ。照らされたブロックは凍り、3秒間受けるダメージ +30%", "月光を刃にした剣。", { lunite:340, pumpkite:120 }],
  ["pumpkinBomber","パンプキンボマー",  "pumpkite",  "爆発",   "bomber",   "bomb",    { rate:2.2, bomb:3, splash:2, eff:268, size:8 }, "巨大な実弾。起爆すると5x5を巻き込む", "収穫祭のかぼちゃ爆弾。", { pumpkite:360, goomite:120 }],
  ["gummyLauncher","グミランチャー",    "goomite",   "弾む分裂",   "ricochet", "moon",    { rate:6, bounce:5, split:2, eff:279 }, "最大5回跳ね、跳ねるたびにグミの破片が周囲2個へ40%ダメージ", "よく弾むグミの弾。", { goomite:380, cometite:140 }],
  ["cometTail",   "コメットテイル",     "cometite",  "連鎖",   "chain",    "bolt",    { rate:4, mode:"chain", chains:6, chainDecay:.8, eff:291 }, "命中後、近くのブロックへ6回まで連鎖 (1回ごとに80%)", "彗星の尾がブロックを伝う。", { cometite:400, dragonite:150 }],
  ["dragonBreath","ドラゴンブレス",     "dragonite", "灼熱",   "burner",   "flame",   { rate:4, burn:.8, pellets:3, spreadA:.2, eff:303, size:6 }, "3方向へ竜の炎。当たったブロックが強く燃える", "竜の吐息を瓶詰めにして撃つ。", { dragonite:420, mirageite:150 }],
  ["mirageMirror","ミラージュミラー",   "mirageite", "分光",   "prism",    "beam",    { rate:7, mode:"laser", targets:6, eff:316 }, "蜃気楼のレーザーを6目標へ", "蜃気楼で光を6本に分ける。", { mirageite:450, aurorite:150 }],
  ["auroraVeil",  "オーロラヴェール",   "aurorite",  "極光",   "aura",     "ring",    { rate:6, mode:"aura", auraR:200, eff:329 }, "周囲200を極光のヴェールで削る", "揺らめく極光の帳。", { aurorite:480, gearite:160 }],
  ["gearShredder","ギアシュレッダー",   "gearite",   "切削",   "gatling",  "dot",     { rate:13, pierce:1, ap:1, eff:343, size:3 }, "毎秒13発の歯車弾が1個貫通。硬いブロックほど歯車が噛み込み、硬度を無視して削る", "噛み合う歯車でブロックを砕く。", { gearite:520, nebulite:180 }],
  ["nebulaCloud", "ネビュラクラウド",   "nebulite",  "雷爆",   "nova",     "ring",    { rate:3.5, shock:.4, nova:1, eff:357, size:7 }, "誘爆と放電の星雲。壊したブロックが爆発する", "星が生まれる荒れた星雲を撃ち出す。", { nebulite:560, aquamarite:200 }],
  ["aquaLance",   "アクアマリンランス", "aquamarite","氷結貫通","sniper",  "needle",  { rate:5, frost:1, pierce:3, eff:372, bulletSpeed:1600, size:3 }, "3個貫通し、凍らせる深海の槍", "ラグーンの底の冷たさをまとった槍。", { aquamarite:600, crimsonite:200 }],
  ["crimsonReaper","クリムゾンリーパー","crimsonite","処刑",   "reaper",   "skull",   { rate:3, exec:.45, eff:387, size:7 }, "HP45%以下を砕く深紅の鎌弾", "深紅の軌跡を残す鎌。", { crimsonite:650, luminite:220 }],
  ["luminaJudgment","ルミナジャッジメント","luminite","審判",  "hyperion", "beam",    { rate:6, mode:"laser", targets:10, exec:.3, eff:403 }, "10本の光のレーザー。HP30%以下を砕く", "10本の光で裁く。", { luminite:700, jadeite:250 }],
  ["jadeFang",    "ジェダイトファング", "jadeite",   "猛毒",   "sniper",   "needle",  { rate:5, acid:.8, pierce:2, eff:419, bulletSpeed:1500, size:3 }, "2個貫通し、猛毒で溶かし続ける", "密林の毒牙。", { jadeite:750, horizonite:250 }],
  ["horizonEnd",  "ホライズンエンド",   "horizonite","終焉",   "worldend", "ring",    { rate:7, mode:"aura", auraR:260, exec:.35, eff:436 }, "周囲260を地平面の波動で削り、HP35%以下を砕く", "事象の地平面の波動で削る。", { horizonite:900, dragonite:300, luminite:300 }],
  // ===== 惑星内部 =====
  ["boneLance",   "ボーンランス",       "ossite",    "貫通",   "bonelance", "needle", { rate:4, pierce:2, eff:452, bulletSpeed:1350, size:4 }, "2個貫通。うねりながら飛ぶ骨の槍", "骨の回廊で眠っていた巨獣の肋骨を削り出した槍。", { ossite:700, bone:200 }],
  ["rootWhip",    "ルートウィップ",     "rhizomite", "連鎖",   "rootwhip",  "bolt",   { rate:5, mode:"chain", chains:10, eff:472 }, "電撃が10回まで連鎖する", "根の迷宮の主根を編んだ鞭。", { rhizomite:720, wood:250 }],
  ["stalacDrip",  "スタラクドリップ",   "stalactite","滴下貫通",   "stalacdrop","drop",   { rate:3.5, splash:1, pierce:2, eff:493, size:6 }, "飛ぶほど大きくなる雫が2個を貫き、着弾すると周囲も削る", "千年の雫を集めた一撃。", { stalactite:740, stone:300 }],
  ["saltPalace",  "ソルトパレス",       "halite",    "結界",   "saltpalace","ring",   { rate:6, mode:"aura", auraR:150, eff:515 }, "周囲150を塩の結界で削る", "塩の宮殿の柱を束ねた結界具。", { halite:760, salt:300 }],
  ["geodeRay",    "ジオードレイ",       "geodite",   "帯電レーザー","geoderay", "beam",   { rate:6, mode:"laser", targets:6, shock:1, eff:538 }, "6本のレーザー。照らされたブロックに感電が走り、周囲へ放電する", "ジオードの内側の結晶群で作った光学兵器。", { geodite:780, granite:300 }],
  ["lodestoneStorm", "ロードストーム",  "lodestonite","連鎖",  "magnetstorm","bolt",  { rate:6, mode:"chain", chains:18, eff:562 }, "電撃が18回まで連鎖する", "磁鉄鉱脈の核を収めた嵐の檻。", { lodestonite:800, basalt:300 }],
  ["sarcophagusJudge", "サルコジャッジ","sarcophagite","審判", "tombjudge", "beam",   { rate:3, mode:"beam", exec:.25, eff:587 }, "HP25%以下のブロックを砕く墓碑の光", "古代の墓所の碑文が光になる。", { sarcophagite:820, bone:300 }],
  ["brimFlame",   "ブリムフレイム",     "brimstonite","飛び火",  "brimflame", "flame",  { rate:8, burn:.6, frags:2, fragDmg:.5, eff:613, size:5 }, "当てたブロックを強く燃やし、火の粉2つが飛び散って隣にも燃え移る", "硫黄地獄の底で燃え続ける石を火種にした火炎放射器。", { brimstonite:840, sulfur:300 }],
  ["stardustHarvest", "スターダストハーベスト", "stardustite", "分裂", "stardustharvest", "star", { rate:5, split:5, eff:640 }, "当たると破片が周囲5個にも40%ダメージ", "降り積もった星屑をすくい上げて撃つ。", { stardustite:870, horizonite:200 }],
  ["coreHeartBeat", "コアハートビート", "coreheart", "鼓動",   "coreheart", "ring",   { rate:7, mode:"aura", auraR:280, exec:.3, eff:668 }, "周囲280を惑星の鼓動で削り、HP30%以下を砕く", "惑星の心臓の鼓動と同期する。", { coreheart:900, novalite:300, stardustite:300 }],
  // ===== 惑星内部 (幻想) =====
  ["fairyBow",    "フェアリーボウ",     "fairyspring","妖精の三矢",   "fairybow",  "spark",  { rate:6, homing:1, pellets:3, spreadA:.2, coinMul:1.3, eff:698, size:4 }, "3本の矢がそれぞれ別のブロックを追う。コイン +30%", "妖精の泉の水で清めた弓。", { fairyspring:700, coral:250 }],
  ["rainbowPrism","レインボープリズム", "rainbownite","レーザー","rainbowprism","beam",{ rate:6, mode:"laser", targets:7, eff:730 }, "7本のレーザー", "虹の結晶洞の核を磨いたプリズム。", { rainbownite:720, geodite:200 }],
  ["spiritTreant","スピリットトレント", "spiritwood", "連鎖",   "spirittree","bolt",  { rate:5, mode:"chain", chains:12, eff:763 }, "電撃が12回まで連鎖する", "精霊の宿る地底樹の枝を編んだ杖。", { spiritwood:740, wood:300 }],
  ["dreamCannon", "ドリームキャノン",   "dreamite",  "夢追い",   "dreamcannon","bubble",{ rate:4, splash:1, homing:1, xpMul:1.5, eff:797, size:6 }, "夢の泡がブロックへ漂い寄り、着弾すると3x3が弾ける。経験値 +50%", "他人の夢を詰め込んだ砲。", { dreamite:760, ice:250 }],
  ["runeGrimoire","ルーングリモワール", "runestone", "審判",   "grimoire",  "beam",   { rate:3.5, mode:"beam", exec:.2, eff:833 }, "HP20%以下のブロックを砕く", "魔法の図書館の最奥に眠る魔導書。", { runestone:780, sarcophagite:200 }],
  ["chimeraFang", "キマイラファング",   "chimeraite","獣の牙",   "chimerafang","needle",{ rate:5, pierce:3, critC:.2, critM:3, eff:871, bulletSpeed:1400, size:4 }, "3個貫通。20%の確率で会心 (3倍)", "幻獣の巣に落ちていた巨大な牙。", { chimeraite:800, ossite:250 }],
  ["chronoRevolver", "クロノリボルバー","chronoglass","時巡り",  "chronorevolver","disc",{ rate:7, pellets:2, bounce:2, eff:910, size:4 }, "2発同時発射。弾は別のブロックへ2回跳ねる", "時の間の砂で作った回転式拳銃。", { chronoglass:820, halite:250 }],
  ["seraphJudgment", "セラフジャッジ",  "seraphite", "レーザー","seraph",    "beam",   { rate:6, mode:"laser", targets:8, splash:1, eff:951 }, "8本のレーザー。着弾点の周囲も削る", "天使の聖域に積もった聖石の光。", { seraphite:850, luminite:250 }],
  ["demonContract", "デーモンコントラクト", "demonite", "契約", "demoncontract","ring",{ rate:6, mode:"aura", auraR:200, burn:.3, eff:994 }, "周囲200を炎で削り、燃やす", "悪魔との契約書を束ねた魔具。", { demonite:880, abyssite:250 }],
  ["yggdrasilRod", "イグドラシルロッド", "yggdrasil", "世界樹", "yggdrasil", "ring",   { rate:7, mode:"aura", auraR:320, exec:.35, eff:1039 }, "周囲320を世界樹の根で削り、HP35%以下を砕く", "世界樹の根源から切り出した杖。", { yggdrasil:950, coreheart:300, stardustite:300 }],
  ["mossSpreader","モススプレッダー", "mossite",   "胞子散布", "mossgun",   "spark",  { rate:2.2, pellets:3, spreadA:.28, eff:1050, size:4 }, "苔の胞子を3方向にまく", "苔の洞窟で育った胞子銃。", { mossite:45, soil:25 }],
  ["terraHammer", "テラハンマー",     "terracite", "重撃",     "clayhammer","rock",   { rate:1.6, splash:1, eff:1120, size:6 }, "粘土の塊を叩きつける。着弾点の周囲3x3にも50%ダメージ", "粘土の空洞で採れた粘土の塊。", { terracite:55, gravel:30 }],
  ["sapGun",      "サップガン",       "sapite",    "粘着",     "sapdrop",   "shard",  { rate:4, frost:1, eff:1200, size:4 }, "樹液の弾が、氷結のように敵を遅くし脆くする", "樹液の層で採れた粘着銃。", { sapite:50, wood:30 }],
  ["ryusaShot",   "リューサショット", "ryusite",   "散弾",     "sandblast", "dot",    { rate:1.8, pellets:5, spreadA:.34, eff:1280, size:3 }, "流砂を5粒同時に放つ散弾", "流砂の間の砂を撃ち出す。", { ryusite:55, sand:30 }],
  ["ammoShell",   "アンモシェル",     "ammonite",  "帰還殻",   "ammoshell", "ring",   { rate:2.4, eff:1350, size:5 }, "渦巻く殻が回りながら飛び、戻ってくる", "アンモナイトの化石を削り出した回転殻。", { ammonite:60, limestone:35 }],
  ["anthraBurner","アントラバーナー", "anthracite","黒炭炎",   "coalfire",  "flame",  { rate:3, burn:.4, eff:1420, size:5 }, "着弾したブロックが燃え続ける", "炭の小部屋の無煙炭を燃やす。", { anthracite:60, coal:35 }],
  ["aquaJet2",    "アクアジェット改", "aqualite",  "高圧水",   "aquajet",   "stream", { rate:6, eff:1500, size:4 }, "湧水を高圧で撃ち出す。水流は加速して伸びる", "湧水の間の清流を閉じ込めた水鉄砲。", { aqualite:65, quartz:30 }],
  ["rustGatling", "ラストガトリング", "rustite",   "錆連射",   "rustgun",   "disc",   { rate:5, pellets:2, spreadA:.12, eff:1580, size:4 }, "錆びた銃身から2発ずつ撃つ", "錆鉄の鉱脈の鉄で組んだ連射銃。", { rustite:70, gravel:35 }],
  ["petalChain",  "ペタルチェーン",   "petalite",  "花連鎖",   "petalchain","bolt",   { rate:2.6, mode:"chain", chains:6, eff:1660, size:4 }, "花びらの電撃が6回まで連鎖する", "花弁の層の稲妻。", { petalite:70, quartz:35 }],
  ["glassCannon", "グラスキャノン",   "glassite",  "硝子砲",   "glassbeam", "beam",   { rate:5, mode:"beam", exec:.15, eff:1750 }, "HP15%以下を砕く硝子の光", "硝子の浅層の天然ガラスを磨いた砲。", { glassite:75, sand:40 }],
  // ===== 最難関 (ワールド四隅のダンジョンの看板素材で作る): これまでにない超広範囲・超火力 =====
  // mode は game/ultra.js が処理する専用の撃ち方。1発の威力は下の ULTRA_TUNE で決める (index 由来の power は使わない)
  ["supernovaHalo", "スーパーノヴァ・ハロー", "astralite", "超新星", "novahalo", "ring",
    { rate:1.1, mode:"nova", ultra:1, novaR:110, novaSpd:150, exec:.5, eff:1 },
    "自機を中心に超新星の衝撃波が半径110ブロックまで広がり、触れたものをすべて削る。残りHP50%以下は消滅", "星界の終点の星の光を輪にして放つ。",
    { astralite:1500, starMetal:800, coreheart:400 }],
  ["ragnaMeteor", "ラグナメテオ", "meteorium", "流星群", "ragnameteor", "meteor",
    { rate:1.2, mode:"meteor", ultra:1, meteorN:16, meteorRange:75, meteorR:8, exec:.5, eff:1 },
    "射程75ブロック以内に巨大隕石を16個同時に降らせる。1個ごとに半径8ブロックを吹き飛ばし、残りHP50%以下は消滅", "流星の墓場の隕鉄で鍛えた召喚杖。",
    { meteorium:1800, astralite:600, adamant:800 }],
  ["galaxyEdge", "ギャラクシーエッジ", "galaxium", "銀河斬", "galaxyedge", "beam",
    { rate:0.8, mode:"storm", ultra:1, blades:6, bladeLen:95, bladeW:2, spin:2.6, stormLife:1.3, exec:.5, eff:1 },
    "長さ95ブロック・幅5ブロックの刃6本が自機の周りを回転し、触れたものをすべて0.1秒ごとに斬る。残りHP50%以下は消滅", "銀河の回廊の渦を刃に変えた剣。",
    { galaxium:2100, meteorium:700, aether:900 }],
  ["worldEater", "ワールドイーター", "voidheart", "特異点", "worldeater", "void",
    { rate:0.9, mode:"hole", ultra:1, holeN:2, holeRange:60, holeR:15, holeLife:3.2, collapseR:26, exec:.5, eff:1 },
    "射程60ブロック以内に特異点を2つ生む。特異点は半径15ブロックまで育って3秒間すべてを呑み込み、最後に半径26ブロックを崩壊させる。モンスターも引きずり込む", "虚空の胃袋の心臓を砲身に詰めた。",
    { voidheart:2400, galaxium:800, singularityShard:900 }],
  ["omegaGenesis", "オメガ・ジェネシス", "voidheart", "創世", "omegagenesis", "sun",
    { rate:1.5, mode:"omni", ultra:1, novaR:160, novaSpd:220, meteorN:28, meteorRange:110, meteorR:11, blades:10, bladeLen:135, bladeW:3, spin:3.2, stormLife:1.6,
      holeN:3, holeRange:90, holeR:22, holeLife:3.6, collapseR:36, exec:.7, eff:1, accent:"#fff3b0" },
    "超新星 → 流星群 → 銀河斬 → 特異点 を順番に、すべて最大級で撃ち続ける。残りHP70%以下は消滅", "4つの最難関の心臓を1つに鍛え上げた兵器。",
    { astralite:3000, meteorium:3000, galaxium:3000, voidheart:3000 }],
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
/* ---------- 最難関の武器 (v93) ----------
   リストの末尾に足したので index 由来の power/cost は当てにせず、ここで「異次元」に上書きする。
   どれも 1発で広大な範囲の全ブロックへ「実効DPS ÷ 連射」をそのまま叩き込む (eff=1: 範囲で割らない)。
   内核 (最大HP 約1.6e13) を一撃で砕く火力から始まり、最後のオメガ・ジェネシスは 1e19 級を消し飛ばす */
const ULTRA_TUNE = {
  supernovaHalo: { power: 2e12, cost: 2e14, yield: 3 },
  ragnaMeteor:   { power: 4e13, cost: 5e16, yield: 4 },
  galaxyEdge:    { power: 8e14, cost: 1e19, yield: 5 },
  worldEater:    { power: 2e16, cost: 3e21, yield: 6 },
  omegaGenesis:  { power: 1e18, cost: 1e24, yield: 10 },
};
for (const k in ULTRA_TUNE){
  const w = WEAPONS[k]; if (!w) continue;
  Object.assign(w, ULTRA_TUNE[k]);
  w.dmg = 5 * w.power / (w.rate * (w.eff || 1));
  w.c2 = w.c2 || "#ffffff"; w.burst = w.burst || "star"; w.glow = 1;
}
const WEAPON_KEYS = Object.keys(WEAPONS);
for (const k of Object.keys(state.weaponsOwned)) if (!WEAPONS[k]) delete state.weaponsOwned[k];
state.weaponsOwned.handDrill = true;
if (!WEAPONS[state.weapon] || !state.weaponsOwned[state.weapon])
  state.weapon = WEAPON_KEYS.filter(k => state.weaponsOwned[k]).pop() || "handDrill";
// クラフト可能か (素材・コインの両方)
const canCraft = k => { const w = WEAPONS[k]; return !state.weaponsOwned[k] && state.coins >= w.cost && invHas(w.recipe); };
// 強化: コインは製作費の40%から x1.5、素材はレシピの 20% から x1.25 ずつ
const weaponLvOf    = k => state.weaponLv[k] || 0;
const weaponLvMul   = k => 1 + 0.08 * weaponLvOf(k);                       // 装備強化: +8%/Lv (スキル等の威力の土台にも使う)
/* 強化の節目ボーナス: Lv10 ごとに威力 +50% (全装備共通)。
   以前は「Lv10ごとに発射数 +1」が上限なしで、しかも表示 DPS に含まれていなかった。
   1発撃ちの装備ほど得をし (Lv100 で隠れ ×11)、レーザー・ビーム・オーラ・チェインは恩恵ゼロ、
   弾が増えすぎて重くもなっていた。節目ボーナスを全装備共通の威力倍率にし、DPS 表示にも含める */
const UPGRADE_TIER_BONUS = 0.5;
const weaponTierMul  = k => 1 + UPGRADE_TIER_BONUS * Math.floor(weaponLvOf(k) / 10);
const weaponPowerMul = k => weaponLvMul(k) * weaponTierMul(k) * evoPowerMul(k);   // 装備の威力倍率 (1発の威力・DPS 表示はこれ)。覚醒 (★) の威力は data/evolve.js
// 弾を撃つ装備は Lv10・20 で発射数も +1 (手応えの演出。1発の威力は弾数で割るので DPS は変わらない)
const PELLET_BONUS_MAX = 2;
const weaponPellets = k => (WEAPONS[k].pellets || 1) + Math.min(PELLET_BONUS_MAX, Math.floor(weaponLvOf(k) / 10));
const WEAPON_UP_COST = k => niceRound(Math.max(20, WEAPONS[k].cost * 0.4) * Math.pow(1.5, weaponLvOf(k)));
const UP_MAT_MAX = 9999;   // 強化の素材要求数 (1種あたり) の上限。高レベルでも天文学的な数にならないように
function WEAPON_UP_MATS(k){
  const w = WEAPONS[k], lv = weaponLvOf(k), out = {};
  const keys = Object.keys(w.recipe);
  // ハンドドリル (レシピなし) はコインだけで強化できる。以前は石/木を交互に要求していたが、
  // 地表は約68ブロックと薄く石は2〜4%しか出ないので、内側へ掘り進むと序盤で詰まっていた
  for (const m of keys) out[m] = Math.min(UP_MAT_MAX, Math.ceil(w.recipe[m] * 0.2 * Math.pow(1.25, lv)));
  return out;
}
// 武器強化は素材代用払い (ui/common.js の matSubPlan) が効くので、判定も実質所持に合わせる (代用できるのは製作素材だけ)
const canUpgradeWeapon = k => state.weaponsOwned[k] && invHas(WEAPON_UP_MATS(k)) &&
  (typeof matSubPlan === "function" ? matSubPlan(WEAPON_UP_COST(k), WEAPON_UP_MATS(k), Object.keys(WEAPONS[k].recipe)).ok : state.coins >= WEAPON_UP_COST(k));
