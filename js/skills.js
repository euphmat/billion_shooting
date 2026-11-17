"use strict";
/* =========================================================
   skills.js - レベル / 経験値 / スキルツリーのマスターデータ (全150種)
   と、ダメージ・コイン・撃破に割り込むパッシブ効果

   - レベルアップごとにスキルポイント +1 (5レベルごとにさらに +1)、全ダメージ +1.5%
   - スキルは5系統 x 20種。各系統は同じ形の木 (TOPO) で、親を習得すると子が解放される
   - 効果は全て sk("id") で「習得しているか」を見るだけ。振り直しても状態が壊れない
   - 1000時間級の放置を見据え、個々の倍率は控えめに。積み重ねで効いてくる
   - スキルは全てパッシブ (常時発動)。毎フレーム処理は skillfx.js、画面は skilltree.js
   ========================================================= */

const BRANCHES = [
  { key:"a", name:"破壊", en:"DESTRUCTION", color:"#ff6b4a", sub:"火力・会心・連鎖" },
  { key:"b", name:"元素", en:"ELEMENTS",    color:"#ff8a5c", sub:"元素付与と状態異常反応" },
  { key:"c", name:"財宝", en:"FORTUNE",     color:"#ffd60a", sub:"コイン・素材・経験値" },
  { key:"d", name:"艦隊", en:"FLEET",       color:"#57e39a", sub:"仲間と機動力" },
  { key:"e", name:"採掘", en:"EXCAVATION",  color:"#f2a65a", sub:"素材・お宝・連破・発破" },
];
// 各系統共通の木の形: TOPO[i] = i番目のスキルの親 (-1 = 系統の入口)
const TOPO = [-1, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 5, 6, 7, 8, 9, 10, 12, 15, 17, 11, 13, 14, 16, 18, 19, 20, 21, 23, 25];
const COST_BY_DEPTH = [0, 1, 1, 2, 3, 4, 6, 8, 10];   // 深い (強い) スキルほど高コスト
const REQ_LV_OLD = { 5: 15, 6: 25 }, REQ_LV_NEW = { 5: 18, 6: 28, 7: 40, 8: 55 };   // 深いスキルにはLv条件

// [id, 名前, アイコン, 説明]
const SKILL_SRC = {
  a: [
    ["a_train",   "鍛錬",             "up",      "全ての攻撃のダメージ +6%。まずは基礎から。"],
    ["a_first",   "ファーストブラッド", "heavy",   "無傷のブロックへの一撃は、ダメージ +20%。"],
    ["a_crit",    "会心",             "crit",    "全ての攻撃が6%の確率でクリティカル (ダメージ2倍) になる。"],
    ["a_combo",   "コンボ",           "link",    "ブロックを壊すとコンボ +1 (3秒で途切れる)。コンボ2につき全ダメージ +1%、最大 +15%。"],
    ["a_execute", "処刑",             "skull",   "HPが10%以下になったブロックは、その場で砕け散る。"],
    ["a_weak",    "弱点露出",         "eye",     "同じブロックに当てるたび、そのブロックへのダメージ +4% (最大 +40%)。"],
    ["a_critx",   "急所狙い",         "star",    "クリティカルの倍率が 2倍 → 3倍 に上がる。"],
    ["a_rapid",   "速射機構",         "rapid",   "自機の連射速度 +8%。"],
    ["a_warm",    "ウォームアップ",   "clock",   "撃ち続けるほど熱を帯び、10秒かけて全ダメージ最大 +20%。手を止めると冷める。"],
    ["a_burn",    "燃焼",             "flame",   "攻撃が当たったブロックは燃え上がり、3秒間、毎秒ダメージの15%を受け続ける。"],
    ["a_ap",      "徹甲弾",           "pierce",  "全ての命中に、ブロック最大HPの0.05%を追加ダメージ。硬い相手ほどよく効く。"],
    ["a_deep",    "深層掘削",         "drill",   "惑星の深部ほどダメージが増える (中心で最大 +100%)。"],
    ["a_bolt",    "雷の加護",         "damage",  "命中時5%の確率で落雷。近くのブロック3個に150%ダメージ。"],
    ["a_double",  "ダブルタップ",     "twin",    "自機の射撃が20%の確率で、間髪入れずもう一発。"],
    ["a_close",   "インファイト",     "shotgun", "ブロックの目の前 (距離100以内) にいる間、全ダメージ +30%。"],
    ["a_spread",  "延焼",             "wave",    "燃えているブロックが壊れると、上下左右のブロックへ火が燃え移る (燃え移りは3世代まで)。"],
    ["a_overkill","オーバーキル",     "giga",    "余剰ダメージの引き継ぎを強化。弾・照射は目減りが半分になり、それ以外の攻撃も余剰が隣のブロックへ移る (最大6個)。"],
    ["a_meteor",  "流星の呼び声",     "meteor",  "ブロックを300個壊すごとに、隕石がひとりでに降ってくる (1000%)。"],
    ["a_shatter", "破砕",             "split",   "攻撃で壊したブロックが弾け、上下左右のブロックへ最大HPの5%ダメージ (破砕で壊れたブロックは弾けない)。"],
    ["a_doom",    "終末の一撃",       "crown",   "自機の10発目ごとの射撃が、ダメージ3倍・着弾範囲 +1 の特大弾になる。"],
    ["a_deep2",   "深層掘削・改",       "drill",   "深層掘削がさらに強化され、惑星の中心では最大 +200% ダメージ。"],
    ["a_triple",  "トリプルタップ",     "twin",    "ダブルタップの確率が 20% → 35% に上がる。"],
    ["a_point",   "至近弾",             "shotgun", "インファイトの範囲が 100 → 160 に広がり、効果が +30% → +45% になる。"],
    ["a_carry",   "残弾継承",           "heavy",   "オーバーキルの余剰ダメージが、壊したブロックの最大HP分まで増える。"],
    ["a_shatter2","大破砕",             "crusher", "破砕の効果が 最大HPの5% → 12% に上がる。"],
    ["a_doom2",   "終末の連打",         "skull",   "終末の一撃が 10発ごと → 5発ごと に発動する。"],
    ["a_abyss",   "深淵の力",           "eye",     "深さ50%より内側のブロックへのダメージ +25%。"],
    ["a_rapid2",  "連射の極み",         "rapid",   "自機の連射速度 +20%。"],
    ["a_meteor2", "隕石群",             "meteor",  "流星の呼び声の間隔が 300個 → 120個 になる。"],
    ["a_core",    "惑星殺し",           "crown",   "最深層 (コア) のブロックへのダメージ 3倍。"],
  ],
  b: [
    ["b_elem",    "元素付与",     "flame",   "どの武器でも元素が宿る。命中時10%でランダムな元素 (炎・氷・雷・酸) を付与。状態異常ダメージ +20%。"],
    ["b_frost",   "氷結付与",     "prism",   "どの武器でも、命中時8%で氷結を付与する。氷結中のブロックの脆さが +30% → +50% になる。"],
    ["b_burn",    "燃焼付与",     "flame",   "どの武器でも、命中時8%で燃焼を付与する。燃焼ダメージ +50%。"],
    ["b_shock",   "放電付与",     "thunder", "どの武器でも、命中時8%で放電が走り隣のブロックへ跳ねる。放電の威力 +50%。"],
    ["b_frost2",  "深凍",         "prism",   "氷結の持続が 3秒 → 5秒 になる。"],
    ["b_chill",   "冷気",         "aura",    "全ダメージ +5%。氷結中のブロックには、さらに +10%。"],
    ["b_burn2",   "延焼体質",     "flame",   "燃焼は、燃え尽きる時に隣のブロックへ移る (燃え移りは通算3世代まで)。"],
    ["b_ember",   "残り火",       "flare",   "燃焼が消えたブロックは、3秒間 受けるダメージ +20%。"],
    ["b_conductor","伝導体",      "chain",   "放電が、もう1体のブロックへ跳ねる (威力70%)。"],
    ["b_acid",    "腐食付与",     "burner",  "どの武器でも、命中時8%で腐食を付与する。腐食の威力 +50%、持続が 4秒 → 6秒 になる。"],
    ["b_icebreak","氷砕",         "crusher", "氷結中のブロックを壊すと、周囲のブロックに最大HPの5%の氷片ダメージ。"],
    ["b_frost3",  "氷結伝播",     "prism",   "氷結中のブロックを壊すと、周囲のブロックが氷結する (伝播は2世代まで)。"],
    ["b_thermo",  "熱衝撃",       "nova",    "燃焼中のブロックが氷結すると、熱衝撃で最大HPの15%の爆発ダメージ (燃焼と氷結は消える)。"],
    ["b_kindling","元素活性",     "flare",   "全ての元素の付与率 +5%。どの武器でも、状態異常がぐっと乗りやすくなる。"],
    ["b_overload","過負荷",       "thunder", "放電が当たったブロックは、2秒間 受けるダメージ +25%。"],
    ["b_melt",    "溶解",         "burner",  "腐食中のブロックへのダメージ +20%。"],
    ["b_frostbite","凍傷",        "prism",   "氷結が自然に解ける時、そのブロックに最大HPの3%のダメージ。"],
    ["b_firestorm","火炎嵐",      "storm",   "燃焼中のブロックを壊すと、その燃焼ダメージの6倍で周囲が爆発する。"],
    ["b_radio",   "放射付与",     "quasar",  "どの武器でも、命中時5%で放射を付与する。放射が壊れたブロックから移る範囲が、周囲8マスに広がる。"],
    ["b_plasma",  "プラズマ化",   "nova",    "燃焼ダメージ +100%、持続 +2秒。"],
    ["b_iceage",  "氷河期",       "eclipse", "氷結中のブロックの脆さが +50% → +80% になる。"],
    ["b_wildfire","山火事",       "tempest", "燃焼の燃え移りが、周囲8マスに広がり、通算5世代まで連鎖する。"],
    ["b_tesla",   "テスラコイル", "thunder", "放電の付与率 さらに +8%。放電の連鎖が3体まで届く。"],
    ["b_zero",    "絶対零度",     "prism",   "氷結中のブロックは、HPが10%以下になると砕け散る。"],
    ["b_decay",   "崩壊",         "pulsar",  "放射中のブロックは、毎秒 最大HPの0.5% を失う。"],
    ["b_supernova","超新星",      "bigbang", "火炎嵐の爆発が、範囲5x5・威力12倍に広がる。"],
    ["b_glacier", "氷河崩し",     "crusher", "氷砕の威力が 5% → 12% になり、範囲が周囲8マスに広がる。"],
    ["b_magma",   "マグマ化",     "vulcan",  "燃焼中のブロックへのダメージ +25%。"],
    ["b_permafrost","永久凍土",   "genesis", "ブロックが新たに氷結すると、周囲のブロックも50%の確率で氷結する (伝播した氷結からは広がらない)。"],
    ["b_sun",     "太陽の核",     "star",    "燃焼中のブロックは、毎秒 最大HPの1% の追加ダメージを受ける。"],
  ],
  c: [
    ["c_merchant","商才",             "coin",    "獲得コイン +10%。"],
    ["c_haul",    "回収手当",         "coinbot", "回収ボットが拾ったコインは +10%。"],
    ["c_lucky",   "幸運のコイン",     "star",    "ブロックのコインが8%の確率で2倍になる。"],
    ["c_xp",      "学びの心得",       "book",    "獲得経験値 +15%。"],
    ["c_fleet",   "回収網",           "wave",    "回収ボットの移動速度 +15%・吸引範囲 +20%。"],
    ["c_interest","利息",             "clock",   "10秒ごとに所持コインの0.3%を受け取る (上限: レベル x 100)。"],
    ["c_vein",    "採掘の心得",       "gem",     "ブロックから手に入る素材 +15%。"],
    ["c_bomb",    "危険物取扱",       "crusher", "爆発性ブロックの誘爆が 5x5 → 7x7 に広がり、威力も1.5倍。"],
    ["c_bonus",   "祝い金",           "up",      "レベルアップのたび、レベル x 60 コインを受け取る。"],
    ["c_combo",   "コンボ報酬",       "link",    "コンボ10ごとに獲得コイン +2% (最大 +40%)。コンボはブロックを壊すと増える。"],
    ["c_spill",   "こぼれコイン",     "twin",    "コインを拾うと5%の確率で、同じ額のコインがもう1枚こぼれ落ちる。"],
    ["c_cashback","キャッシュバック", "recycle", "製作・強化で払ったコインの10%が、その場で戻ってくる。"],
    ["c_gem",     "宝石細工",         "gem",     "宝石ブロック (宝石カテゴリの素材) のコイン +50%・素材ドロップ +1。"],
    ["c_jackpot", "一攫千金",         "chest",   "ブロックを1,000個壊すごとに、その1個のコインが30倍になる。"],
    ["c_know",    "鑑定眼",           "eye",     "宝石・爆発性・黄金ブロックを壊すと、経験値が5倍。"],
    ["c_bonus2",  "ボーナスタイム",   "coin",    "獲得コイン +20%。"],
    ["c_piggy",   "貯金箱",           "bag",     "拾ったコインの10%が貯金箱にも貯まり、60秒ごとに1.5倍になって払い出される。"],
    ["c_goldhand","黄金の手",         "aura",    "自機の攻撃が当たったブロックが3%の確率で黄金に変わる (コイン4倍)。"],
    ["c_goldbullet","金の弾丸",       "heavy",   "所持コインの桁数ひとつにつき、全ダメージ +3%。貯めるほど強い。"],
    ["c_king",    "ミダス王",         "crown",   "全てのコイン +30%。さらに0.5%の確率で、20倍の宝箱が出る。"],
    ["c_cash2",      "完全還元",       "recycle", "キャッシュバックが 10% → 25% に上がる。"],
    ["c_jackpot2",   "大当たり",       "chest",    "一攫千金の間隔が 1,000個 → 400個 になり、倍率が 30倍 → 50倍 になる。"],
    ["c_know2",      "真理の鑑定",     "eye",     "鑑定眼の経験値が 5倍 → 12倍 になる。"],
    ["c_piggy2",     "黄金の貯金箱",   "bag",     "貯金箱に貯まる割合が 10% → 20%、払い出しが 1.5倍 → 2.5倍 になる。"],
    ["c_goldbullet2","富の弾丸",       "coin",    "金の弾丸の効果が、所持コインの桁ひとつにつき +3% → +5% になる。"],
    ["c_king2",      "ミダスの加護",   "crown",   "宝箱の確率が 0.5% → 1.5%、倍率が 20倍 → 30倍 になる。"],
    ["c_bonus3",     "祝祭",           "coin",    "獲得コイン +25%。"],
    ["c_god",        "資本神",         "crown",   "累計コインの桁数ひとつにつき、全ダメージ +6%。貯めた富が、そのまま力になる。"],
    ["c_interest2",  "複利の極み",     "clock",   "利息が 0.3% → 0.8% になり、上限も2倍になる。"],
    ["c_king3",      "ミダス神",       "crown",   "宝箱の倍率が 30倍 → 60倍 になり、獲得コイン +20%。"],
  ],
  d: [
    ["d_boost",   "ブースター",       "speed",   "移動速度 +15%。"],
    ["d_ram",     "体当たり掘進",     "drill",   "移動中、進行方向のブロックを機体で削る。"],
    ["d_command", "指揮",             "damage",  "攻撃ボットの威力 +15%。"],
    ["d_bot",     "ボット同調",       "bot",     "攻撃ボットの威力 +30%。"],
    ["d_ram2",    "掘進ドリル",       "drill",   "体当たり掘進が強化される。威力 55% → 160%、間隔も 0.15秒 → 0.09秒 と短くなる。"],
    ["d_cruise",  "巡航モード",       "speed",   "移動している間、全ダメージ +12%。動き続ける艦隊は強い。"],
    ["d_rate",    "高速回路",         "rapid",   "ボットの連射 +15%。"],
    ["d_ap",      "ボット徹甲弾",     "pierce",  "ボットの弾が1回貫通する。"],
    ["d_wing",    "ウィングマン",     "twin",    "自機と同じ装備で撃つ僚機が、隣に並ぶ (威力30%)。"],
    ["d_drone",   "回収ドローン",     "coinbot", "コイン回収ボットが1機おまけで加わり、回収ボットの速度 +20%。"],
    ["d_wave",    "ソニックブーム",   "wave",    "300進むごとに衝撃波を放ち、周囲のブロックへ150%ダメージ。"],
    ["d_auto",    "オートパイロット", "homing",  "3秒間操作しないと、自機が最寄りのブロックへ自動で向かう。放置のお供に。"],
    ["d_reinforce","増援",            "bot",     "攻撃ボットが1機、無料で加わる。"],
    ["d_bombdrone","爆撃ドローン",    "missile", "4秒ごとに爆撃ドローンが自動で発進し、最寄りのブロックへ突っ込んで 300% ダメージの爆発を起こす。"],
    ["d_wing2",   "僚機強化",         "twin",    "ウィングマンの威力が 30% → 60% に上がる。"],
    ["d_synergy", "相乗効果",         "link",    "仲間1機につき、全ダメージ +1% (最大 +20%)。"],
    ["d_wave2",   "衝撃波増幅",       "wave",    "ソニックブームが強化される。200 進むごとに発動し、威力 150% → 400%。"],
    ["d_rate2",   "高速指揮網",       "rapid",   "仲間全員 (ボット・僚機・影分身) の連射 +25%。"],
    ["d_sat",     "守護衛星",         "orbital", "3秒ごとに、射程内でいちばん硬いブロックへ800%のレーザーを撃ち込む。"],
    ["d_shadow",  "影分身",           "crown",   "自機の動きを追う分身が2体現れ、自機と同じ装備で撃つ (威力30%)。"],
    ["d_auto2",     "完全自動操縦",   "homing",  "オートパイロットが 3秒 → 1秒 で起動するようになる。"],
    ["d_bombdrone2","爆撃群",           "missile", "爆撃ドローンが強化される。間隔 4秒 → 2.2秒、威力 300% → 650%、同時に 2機 発進する。"],
    ["d_formation", "連携フォーメーション","link",   "ウィングマンと影分身の威力が、それぞれ +20% 分上乗せされる。"],
    ["d_wave3",     "大衝撃波",         "wave",    "ソニックブームの範囲が 100 → 175 に広がり、威力 400% → 600%。"],
    ["d_sat2",      "軌道砲",           "orbital", "守護衛星の間隔が 3秒 → 1.5秒、威力が 800% → 1500% になる。"],
    ["d_shadow2",   "影の軍団",         "crown",   "影分身が 2体 → 3体 になる。"],
    ["d_reinforce2","大増援",           "bot",     "攻撃ボットがさらに1機、無料で加わる。"],
    ["d_god",       "艦隊総帥",         "crown",   "仲間1機につき、全ダメージ +2% (最大 +40%)。"],
    ["d_wave4",     "震撃の極み",       "nova",    "ソニックブームが 150 進むごとに発動するようになり、威力 900%、範囲 220。艦隊の機動力が、そのまま破壊力になる。"],
    ["d_shadow3",   "影の軍団・改",     "crown",   "影分身が 3体 → 4体 になり、威力が 30% → 40% になる。"],
  ],
  e: [
    ["e_mine",    "採掘学",         "drill",   "素材ドロップが15%の確率で +1。掘る楽しさは、まず量から。"],
    ["e_vein",    "鉱脈読み",       "eye",     "周囲に同じ素材のブロックが2つ以上あるブロック (鉱脈) からは、素材 +1。"],
    ["e_treasure","お宝センサー",   "star",    "ブロックを壊すと、0.5%の確率で近くのブロックが『お宝ブロック』に変わる (最大20個)。キラキラ光るお宝を壊すと、素材ボーナス +4個・コイン大放出・経験値3倍。"],
    ["e_blast",   "発破採掘",       "crusher", "ブロックを25個壊すごとに、破壊した場所を中心に発破が炸裂! 周囲3x3のブロックが一緒に吹き飛ぶ。ダイナマイト採掘の快感。"],
    ["e_double",  "二重採掘",       "twin",    "素材ドロップが15%の確率で2倍になる。"],
    ["e_reso",    "鉱脈共鳴",       "wave",    "ブロックを壊すと、隣の同じ素材のブロックにも最大HPの20%ダメージ。鉱脈ごと崩れる。"],
    ["e_design",  "工学設計",       "up",      "製作・強化のコインコスト -10%。"],
    ["e_recycle", "廃材リサイクル", "chest",   "製作・強化で素材を使うと、素材ごとに20%の確率で半分 (切り上げ) 戻ってくる。"],
    ["e_deepfit", "深層適性",       "speed",   "深い場所のブロックほど獲得コインが増える (中心で最大 +20%)。"],
    ["e_core",    "コアサンプル",   "gem",     "最深層 (コア) の素材ドロップが2倍になる。"],
    ["e_rare",    "希少鉱脈",       "star",    "希少な素材 (レア度2以上) のドロップ +1。"],
    ["e_chain",   "連破",           "link",    "ブロックを壊すと12%の確率で、周囲のブロックが1つ巻き込まれて一緒に壊れる。連破は最大2回まで続く。"],
    ["e_treasure2","お宝の嗅覚",    "star",    "お宝ブロックの出現率が 0.5% → 1.2%、上限が 20 → 40個 に増える。お宝の素材ボーナスも +4 → +8個 になる。"],
    ["e_sell",    "自動換金",       "bag",     "素材が999個を超えた分は、自動でコインに換金される (1個 = 素材のコイン倍率 x 10)。"],
    ["e_scan",    "未知スキャン",   "homing",  "まだ手に入れたことのない素材のブロックが、キラッと光って見える。"],
    ["e_quake2",  "地殻振動",       "quake",   "ブロックを400個壊すごとに自動で地震が発生し、周囲 (半径300) のブロックへ最大HPの3%ダメージ。"],
    ["e_vein2",   "極厚鉱脈",       "heavy",   "鉱脈読みの条件が『周囲に1つ以上』に緩み、ボーナスが +2 になる。"],
    ["e_treasure3","お宝ハンター",  "crown",   "お宝ブロックの出現率が 1.2% → 2%、上限が 60個 になる。お宝を壊すと経験値が5倍になり、コインが周囲に弾け飛ぶ。"],
    ["e_blast2",  "大発破",         "nova",    "発破の間隔が 25個 → 15個 になり、範囲が 3x3 → 5x5 に広がる。"],
    ["e_master",  "惑星採掘者",     "crown",   "全ての素材ドロップが2倍。さらに製作・強化の素材コスト -10%。"],
    ["e_reso3",   "共鳴増幅",           "wave",    "鉱脈共鳴が、2マス先の同じ素材のブロックにも 30% ダメージで届く。"],
    ["e_sell2",   "高額換金",           "bag",     "自動換金のレートが2倍になり、上限も 999 → 2,999個 になる。"],
    ["e_scan2",   "全域スキャン",       "homing",  "未知スキャンが、ズームアウトしていても光るようになる。"],
    ["e_vein3",   "惑星鉱脈",           "heavy",   "鉱脈読みのボーナスが +2 → +4 になる。"],
    ["e_blast3",  "超発破",           "bigbang", "発破の間隔が 15個 → 10個 になり、範囲が 5x5 → 7x7 に広がる。惑星に大穴を開ける快感。"],
    ["e_master2", "惑星採掘神",         "crown",   "全ての素材ドロップがさらに2倍。製作・強化の素材コスト さらに -10%。"],
    ["e_chain2",  "連破・改",           "link",    "連破の確率が 12% → 20% になり、最大連鎖が 2回 → 4回 になる。"],
    ["e_sell3",   "換金市場",           "up",      "自動換金のレートがさらに2倍になり、上限も 9,999個 になる。"],
    ["e_vein4",   "鉱脈の心臓",         "gem",     "周囲に同じ素材が4つ以上あるブロック (鉱脈の中心) は、素材ドロップが2倍になる。"],
    ["e_god",     "採掘神",             "drill",   "全ての素材ドロップが3倍。製作・強化の素材コスト -20%。掘ることの極致。"],
  ],
};

// ---------- 木の組み立て (座標は放射状レイアウト) ----------
const TREE_SIZE = 1960, TREE_C = TREE_SIZE / 2;
const treeRadius = depth => 140 + (depth - 1) * 105;
const SKILLS = [], SKILL = {};
(function buildSkills(){
  const SECTOR = 60 * Math.PI / 180;
  BRANCHES.forEach((br, bi) => {
    const center = -Math.PI / 2 + bi * Math.PI * 2 / BRANCHES.length;
    const list = SKILL_SRC[br.key].map(s => ({ id:s[0], name:s[1], ic:s[2], desc:s[3], br, kids:[] }));
    list.forEach((n, i) => {
      n.parent = TOPO[i] < 0 ? null : list[TOPO[i]];
      n.depth = n.parent ? n.parent.depth + 1 : 1;
      n.cost = COST_BY_DEPTH[Math.min(8, n.depth)];
      n.reqLv = (i >= 20 ? REQ_LV_NEW : REQ_LV_OLD)[n.depth] || 0;
      if (n.parent) n.parent.kids.push(n);
    });
    const leaves = [];
    (function dfs(n){ if (!n.kids.length) leaves.push(n); n.kids.forEach(dfs); })(list[0]);
    leaves.forEach((n, k) => { n.ang = center + (k / (leaves.length - 1) - 0.5) * SECTOR; });
    (function setAng(n){
      n.kids.forEach(setAng);
      if (n.kids.length) n.ang = n.kids.reduce((s, k) => s + k.ang, 0) / n.kids.length;
    })(list[0]);
    for (const n of list){
      const r = treeRadius(n.depth);
      n.x = TREE_C + Math.cos(n.ang) * r; n.y = TREE_C + Math.sin(n.ang) * r;
      SKILLS.push(n); SKILL[n.id] = n;
    }
    br.ang = center;
  });
})();
for (const k of Object.keys(state.skills)) if (!SKILL[k]) delete state.skills[k];   // 古いセーブの知らないIDは捨てる

// ---------- 習得 / レベル ----------
const sk = id => state.skills[id] === 1;
const xpNeed  = lv => Math.floor(25 + 25 * Math.pow(lv, 2.1));   // レベルアップはゆっくり
const spTotal = () => (state.lv - 1) + Math.floor(state.lv / 5);
const spSpent = () => { let n = 0; for (const k in state.skills) n += SKILL[k].cost; return n; };
const spLeft  = () => spTotal() - spSpent();
const skillUnlocked = n => (!n.parent || sk(n.parent.id)) && state.lv >= (n.reqLv || 0);
const canLearn = n => !sk(n.id) && skillUnlocked(n) && spLeft() >= n.cost;
const levelDmgMul = () => 1 + 0.015 * (state.lv - 1);
const blockXP = (gx, gy) => Math.max(1, Math.round(Math.sqrt(blockMaxHP(gx, gy) / 5)));
function gainXP(n){
  state.xp += n * (1 + artVal("xp")) * artMul("xpMul");   // 星屑の王笏: 経験値 ×2 (乗算キー)
  while (state.xp >= xpNeed(state.lv)){
    state.xp -= xpNeed(state.lv); state.lv++;
    if (typeof onLevelUpHeal === "function") onLevelUpHeal();   // レベルアップでHP全回復
    levelUpFx();
  }
}

// ---------- 派生ステータス (core.js / game.js から参照) ----------
const atkRange   = () => ATTACK_RANGE;
const crewMul    = () => (sk("d_command") ? 1.15 : 1) * (1 + artVal("cbot"));
const crewCount  = () => state.bots + state.coinBots;
const botCount     = () => act("bots") + (sk("d_reinforce") ? 1 : 0) + (sk("d_reinforce2") ? 1 : 0);
const coinBotCount = () => act("coinBots") + (sk("d_drone") ? 1 : 0) + cbLv("replicator");
const playerRate = () => (sk("a_rapid") ? 1.08 : 1) * (sk("a_rapid2") ? 1.2 : 1) * (1 + artVal("rate"));
const crewRate   = () => (sk("d_rate") ? 1.15 : 1) * (sk("d_rate2") ? 1.25 : 1);
// 素材ドロップ倍率 (装備の触媒効果はヒット時に別に掛かる)
const matDropMul = () => (1 + artVal("drop")) * (1 + (sk("c_vein") ? 0.15 : 0)) * (sk("e_master") ? 2 : 1) * (sk("e_master2") ? 2 : 1) * (sk("e_god") ? 3 : 1);
const elemMul    = () => (sk("b_elem") ? 1.2 : 1) * (1 + artVal("elem")) * (artHas("lg_crown") ? 1.75 : 1);   // 元素の心得: 状態異常ダメージ / 元素の王冠: ×1.75
const burnSetMul = () => elemMul() * (sk("b_burn") ? 1.5 : 1) * (sk("b_plasma") ? 2 : 1) * (1 + artVal("burn"));   // 燃焼の付与倍率

// ---------- 元素付与 (スキルツリー): どの武器でも状態異常が乗る ----------
function elemChances(){
  const all = sk("b_kindling") ? 0.05 : 0;   // 元素活性: 全ての付与率アップ
  const crown = artHas("lg_crown") ? 0.20 : 0;   // 元素の王冠: 全元素の付与率 +20% (絶対値)
  return {
    burn:  (sk("b_burn")  ? 0.08 : 0) + all + crown,
    frost: (sk("b_frost") ? 0.08 : 0) + all + crown,
    acid:  (sk("b_acid")  ? 0.08 : 0) + all + crown,
    rad:   (sk("b_radio") ? 0.05 : 0) + all + crown,
    shock: (sk("b_shock") ? 0.08 : 0) + (sk("b_tesla") ? 0.08 : 0) + all + crown,
  };
}
// 現在の武器 + スキル込みで「命中時にその状態異常が付く確率」(武器特性は命中時常時付与 = 100%扱い)
function elemTotals(){
  const w = WEAPONS[state.weapon], ec = elemChances();
  const rnd = sk("b_elem") ? 0.10 / 3 : 0;   // 元素付与のランダム枠 (炎/氷/酸のどれか1つに 10%/3 ずつ)
  const mix = (feat, c) => feat ? 1 : 1 - (1 - rnd) * (1 - c);
  return {
    burn:  mix(w.burn, ec.burn),
    frost: mix(w.frost, ec.frost),
    acid:  mix(w.acid, ec.acid),
    rad:   w.radiation ? 1 : ec.rad,
    shock: Math.min(1, (w.shock || 0) + ec.shock + (sk("b_elem") ? 0.025 : 0) + artVal("shockP") / 100),
  };
}

// ---------- 発動カウンタ (セッション内のみ・セーブしない。「本当に発動しているか」の見える化用) ----------
const skillProc = { burn: 0, frost: 0, acid: 0, rad: 0, shock: 0, thermo: 0, bolt: 0, firestorm: 0, icebreak: 0, meteor: 0, treasure: 0, treasureBreak: 0, chain: 0, blast: 0, quake: 0, jackpot: 0 };
function bumpProc(k){ skillProc[k]++; }

// 自機の命中時に呼ばれる。装備の特性とは独立に、スキル由来の状態異常を付ける
function infuseElements(idx, gx, gy, dmg){
  const ec = elemChances();
  let kind = null;
  if (sk("b_elem") && Math.random() < 0.10) kind = ["burn", "frost", "acid"][(Math.random() * 3) | 0];   // 元素付与: ランダムに1つ (雷は放電判定側)
  const roll = k => kind === k || (ec[k] > 0 && Math.random() < ec[k]);
  if (roll("burn") && (burns.size < 800 || burns.has(idx))){ burns.set(idx, { d: dmg * 0.15 * burnSetMul(), t: 3 + (sk("b_plasma") ? 2 : 0), k: "burn", g: 0 }); bumpProc("burn"); }
  if (roll("acid") && (burns.size < 800 || burns.has(idx))){ burns.set(idx, { d: dmg * 0.3 * elemMul() * (sk("b_acid") ? 1.5 : 1) * (1 + artVal("acid")), t: 4 + (sk("b_acid") ? 2 : 0), k: "acid" }); bumpProc("acid"); }
  if (ec.rad > 0 && Math.random() < ec.rad && (burns.size < 800 || burns.has(idx))){ burns.set(idx, { d: dmg * 0.3 * elemMul(), t: 4, rad: true, k: "rad" }); bumpProc("rad"); }
  if (roll("frost")){
    if (sk("b_thermo") && burns.has(idx)){   // 熱衝撃: 燃焼中の氷結で大爆発 (両方消える)
      burns.delete(idx);
      rings.push({ x: g2w(gx), y: g2w(gy), r: BS * 2, t: performance.now(), color: "255,150,60", dur: 300 });
      damageBlock(idx, blockMaxHP(gx, gy) * 0.15, 0);
      bumpProc("thermo");
    } else if (frosts.size < 1500 || frosts.has(idx)){
      const freshFrost = !frosts.has(idx);
      frosts.set(idx, 3 + (sk("b_frost2") ? 2 : 0)); frostGen.set(idx, 0);
      bumpProc("frost");
      if (freshFrost && sk("b_permafrost")) for (const [dx, dy] of N4){ const j = liveAt(gx + dx, gy + dy); if (j >= 0 && Math.random() < 0.5 && frosts.size < 1500 && !frosts.has(j)){ frosts.set(j, 2); frostGen.set(j, 1); bumpProc("frost"); } }   // 永久凍土
    }
  }
}

// ---------- 実行時の状態 (セーブしない) ----------
let treeOpen = false;
let combo = 0, comboT = 0, heat = 0, heatT = 0, gMul = 1, nearClose = false;
let doomN = 0, ringN = 0, breakN = 0, jackN = 0, quakeN = 0;
let piggy = 0, piggyT = 60, interestT = 10;
let dmgDepth = 0;          // damageBlock の入れ子の深さ (0 = 攻撃そのもの / 1以上 = 余波・誘爆)
let curPl = false;         // いま処理中の攻撃が「自機の攻撃」か
let curEcho = false;       // いま処理中の弾がエコーショットか (エコーはエコーを呼ばない)
let shattering = false;    // 破砕のダメージを与えている最中か (破砕は破砕を呼ばない)
let resonating = false, firestorming = false, blasting = false;    // 共鳴/火炎嵐/発破の処理中か (再入防止)
const vuln = new Map();
const embers = new Map(), overloads = new Map();   // 残り火 / 過負荷 (残り秒数)    // 弱点露出: idx -> 重ねた回数
const burns = new Map();   // 燃焼 / 腐食 / 放射: idx -> {d: 毎秒ダメージ, t: 残り秒, rad: 放射 (壊れると隣へ移る)}
const frosts = new Map();  // 氷結: idx -> 残り秒 (受けるダメージ +30%)
const frostGen = new Map();   // 氷結の伝播世代 (無限に広がらないよう世代で打ち切る)
const bombs = [], bombSet = new Set();   // 時限爆弾 {idx,t,dmg}
const meteors = [];        // 落下待ちの隕石 {x,y,t,r,dmg}
const treasureSet = new Set();   // お宝ブロック (壊すと大ボーナス)
let blastN = 0;                  // 発破採掘: 前回の発破から壊した数
let chainBudget = 0;             // 連破の残り連鎖数
const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const N8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
const liveAt = (gx, gy) => (blockExists(gx, gy) && !isDestroyed(gy * D + gx)) ? gy * D + gx : -1;
// 余波扱い (スキル補正なし) でダメージを与える
function rawDamage(fn){ dmgDepth++; try { fn(); } finally { dmgDepth--; } }

// 全ての攻撃に掛かる倍率。毎フレーム gMul に入れておき、命中時はそれを使う
function globalDmgMul(){
  let m = levelDmgMul() * (1 + artVal("dmg")) * artMul("dmgMul");   // 惑星の心臓: 全ダメージ ×1.5 (乗算キー)
  if (sk("a_train")) m *= 1.06;
  if (sk("a_combo")) m *= 1 + Math.min(30, combo) * 0.005;
  if (sk("a_warm"))  m *= 1 + 0.2 * heat;
  if (sk("d_cruise") && player.moving) m *= 1.12;
  if (sk("c_goldbullet")) m *= 1 + (sk("c_goldbullet2") ? 0.05 : 0.03) * Math.floor(Math.log10(Math.max(1, state.coins)) + 1);
  if (sk("c_god")) m *= 1 + 0.06 * Math.floor(Math.log10(Math.max(1, state.totalCoins)) + 1);
  if (sk("d_god")) m *= 1 + Math.min(0.4, 0.02 * crewCount());
  else if (sk("d_synergy")) m *= 1 + Math.min(0.2, 0.01 * crewCount());
  return m;
}

// ---------- 命中時 (攻撃そのものにだけ掛かる。余波・誘爆には掛からない) ----------
function skillHitMods(idx, gx, gy, dmg, hp){
  let m = gMul;
  const max = blockMaxHP(gx, gy);
  if (hp >= max && sk("a_first")) m *= 1.2;
  { const voidEye = artHas("lg_void");   // 虚無の単眼: 会心率 +25%、会心ダメは最低でも ×3、専用演出フラグを立てる
    const ac = (sk("a_crit") ? 0.06 : 0) + artVal("crit") / 100 + (voidEye ? 0.25 : 0);
    if (ac > 0 && Math.random() < ac){ let cm = (sk("a_critx") ? 3 : 2) + artVal("critd") / 100; if (voidEye){ cm = Math.max(cm, 3); dmgVoidFlag = true; } m *= cm; } }   // 会心 (スキル+アーティファクト合算)
  if (sk("a_deep")) m *= 1 + (sk("a_deep2") ? 2.0 : 1.0) * blockDepth(gx, gy);
  if (artVal("deep")) m *= 1 + artVal("deep") * blockDepth(gx, gy);   // アーティファクト: 深さダメ
  if (sk("a_abyss") && blockDepth(gx, gy) >= 0.5) m *= 1.25;
  if (sk("a_core") && MATS[materialAt(gx, gy)].layer === 6) m *= 3;   // 内核の素材のみ (衛星レイヤー追加で index がずれたので固定)
  if (nearClose) m *= sk("a_point") ? 1.45 : 1.3;
  if (sk("a_weak")){
    const v = vuln.get(idx) || 0;
    m *= 1 + 0.04 * v;
    if (v < 10){ if (vuln.size > 3000) vuln.clear(); vuln.set(idx, v + 1); }
  }
  if (frosts.has(idx)) m *= (sk("b_iceage") ? 1.8 : sk("b_frost") ? 1.5 : 1.3) + artVal("frostV");   // 氷結は脆い
  if (sk("b_chill")){ m *= 1.05; if (frosts.has(idx)) m *= 1.1; }   // 冷気
  if (sk("b_magma") && burns.has(idx)) m *= 1.25;   // マグマ化: 燃焼中は脆い
  if (sk("b_melt") && burns.get(idx) && burns.get(idx).k === "acid") m *= 1.2;   // 溶解: 腐食中は脆い
  if (embers.has(idx)) m *= 1.2;   // 残り火
  if (overloads.has(idx)) m *= 1.25;   // 過負荷
  dmg *= m;
  if (sk("a_ap")) dmg += max * 0.0005;
  if (curFx && curFx.ap) dmg += max * curFx.ap;   // 装備の徹甲
  return dmg;
}
// cur = 命中後の残りHP (0以下なら壊れた)
function skillAfterHit(idx, gx, gy, dmg, cur){
  if (curPl && !artZapBusy && artSpecial("zap") && Math.random() < 0.18){   // アーティファクト: 連鎖の稲妻
    artZapBusy = true;
    try {
      const cand = findNearestBlocks(g2w(gx), g2w(gy), 210, 1, new Set([idx]));
      if (cand.length){ const j = cand[0]; beams.push({ x1: g2w(gx), y1: g2w(gy), x2: g2w(j % D), y2: g2w((j / D) | 0), t: performance.now(), w: 2, color: "#ffe14d" }); damageBlock(j, dmg * 0.5, 0); }
    } finally { artZapBusy = false; }
  }
  if (curPl && artHas("lg_dice") && Math.random() < 0.07) chaosDice(idx, gx, gy, dmg);   // 混沌のサイコロ: 自機の命中時 7%で発動
  if (cur < 0 && dmg < 1e300 && !curCarry && sk("a_overkill")){   // 弾・照射は damageBlock の余剰引き継ぎで強化される
    let carry = -cur, cx = gx, cy = gy;
    for (let k = 0; k < 6 && carry > 0; k++){
      let j = -1;
      const o = (Math.random() * 4) | 0;
      for (let q = 0; q < 4 && j < 0; q++){ const [dx, dy] = N4[(o + q) % 4]; j = liveAt(cx + dx, cy + dy); }
      if (j < 0) break;
      const hp = blockHP(j);
      damageBlock(j, carry, 0);
      carry -= hp; cx = j % D; cy = (j / D) | 0;
    }
  }
  if (sk("a_bolt") && Math.random() < 0.05){
    bumpProc("bolt");
    const x = g2w(gx), y = g2w(gy), cand = findNearestBlocks(x, y, 150, 8, new Set([idx]));
    for (let k = 0; k < 3 && cand.length; k++){
      const j = cand.splice((Math.random() * cand.length) | 0, 1)[0];
      beams.push({ x1:x, y1:y, x2:g2w(j % D), y2:g2w((j / D) | 0), t:performance.now(), w:1.5, color:"#ffe14d", zig:true, life:130 });
      damageBlock(j, dmg * 1.5, 0);
    }
  }
  // 放電: 隣へ跳ねる (伝導体/テスラで連鎖、過負荷で脆くする)。装備の特性が無くても、スキルの放電付与で走る
  const shockP = (curFx && curFx.shock ? curFx.shock : 0) + (curPl ? elemChances().shock + (sk("b_elem") ? 0.025 : 0) : 0) + artVal("shockP") / 100;
  if (shockP > 0 && Math.random() < shockP){
    bumpProc("shock");
    let left = sk("b_tesla") ? 3 : sk("b_conductor") ? 2 : 1;
    let from = idx, dealt = dmg * 0.5 * elemMul() * (sk("b_shock") ? 1.5 : 1);
    const hitSet = new Set([idx]);
    while (left-- > 0){
      const fx = from % D, fy = (from / D) | 0, cand = [];
      for (const [dx, dy] of N4){ const j = liveAt(fx + dx, fy + dy); if (j >= 0 && !hitSet.has(j)) cand.push(j); }
      if (!cand.length) break;
      const j = cand[(Math.random() * cand.length) | 0];
      beams.push({ x1:g2w(fx), y1:g2w(fy), x2:g2w(j % D), y2:g2w((j / D) | 0), t:performance.now(), w:1.5, color:(curFx && curFx.accent) || "#ffe14d", zig:true, life:100 });
      rawDamage(() => damageBlock(j, dealt, 0));
      if (sk("b_overload")) overloads.set(j, 2);
      hitSet.add(j); from = j; dealt *= 0.7;
    }
  }
  if (cur > 0){
    if (sk("a_burn") && (burns.size < 500 || burns.has(idx))){ burns.set(idx, { d: dmg * 0.15 * burnSetMul(), t: 3 + (sk("b_plasma") ? 2 : 0), k: "burn" }); bumpProc("burn"); }
    if (curPl){
      if (sk("c_goldhand") && Math.random() < 0.03 && goldSet.size < 4000) goldSet.add(idx);
      infuseElements(idx, gx, gy, dmg);   // 元素付与 (スキル): どの武器でも状態異常が乗る
    }
  }
}

// ---------- 撃破時 ----------
function coinSkillMul(){
  let m = (1 + artVal("coin")) * artMul("coinMul");   // 黄金の特異点: コイン ×2 (乗算キー)
  if (sk("c_merchant")) m *= 1.10;
  if (sk("c_king")) m *= 1.3;
  if (sk("c_bonus2")) m *= 1.2;
  if (sk("c_combo")) m *= 1 + Math.min(20, Math.floor(combo / 10)) * 0.02;
  if (sk("c_lucky") && Math.random() < 0.08) m *= 2;
  if (sk("c_jackpot") && ++jackN >= (sk("c_jackpot2") ? 400 : 1000)){ jackN = 0; bumpProc("jackpot"); const jm = sk("c_jackpot2") ? 50 : 30; m *= jm; toast(`JACKPOT!!  コイン${jm}倍`); }
  if (sk("c_bonus3")) m *= 1.25;
  if (sk("c_king3")) m *= 1.2;
  return m;
}
function skillOnBreak(idx, gx, gy, kind, rare){
  let xp = blockXP(gx, gy) * MATS[materialAt(gx, gy)].xp;
  if (sk("c_xp")) xp *= 1.15;
  if (rare && sk("c_know")) xp *= sk("c_know2") ? 12 : 5;
  if (curFx && curFx.xpMul) xp *= curFx.xpMul;
  const dfx = dungeonFxAt(gx, gy); if (dfx) xp *= dfx.xp;   // ダンジョン固有効果: 経験値倍率
  gainXP(xp);
  combo++; comboT = 3;
  const wasFrost = frosts.has(idx), frostG = frostGen.get(idx) || 0;
  vuln.delete(idx); frosts.delete(idx); frostGen.delete(idx);
  const x = g2w(gx), y = g2w(gy), deep = dmgDepth > 40;   // 連鎖が深くなりすぎたら打ち切る
  const fire = burns.get(idx);
  if (fire){
    burns.delete(idx);
    if (sk("a_spread") || fire.rad) for (const [dx, dy] of (fire.rad && sk("b_radio") ? N8 : N4)){   // 延焼 / 放射能は隣へ移る
      const j = liveAt(gx + dx, gy + dy);
      if (j >= 0 && burns.size < 800 && !burns.has(j) && (fire.g || 0) < 3){ burns.set(j, { d: fire.d, t: fire.rad ? 4 : 3, rad: fire.rad, k: fire.k, g: (fire.g || 0) + 1 }); bumpProc(fire.k); }   // 燃え移りは3世代まで
    }
    if (sk("b_firestorm") && !deep && !firestorming){   // 火炎嵐: 燃焼中の撃破で爆発
      bumpProc("firestorm");
      firestorming = true;
      try {
        const fd = fire.d * (sk("b_supernova") ? 12 : 6), rr = sk("b_supernova") ? 2 : 1;
        for (let dy = -rr; dy <= rr; dy++) for (let dx = -rr; dx <= rr; dx++){
          if (!dx && !dy) continue;
          const j = liveAt(gx + dx, gy + dy);
          if (j >= 0) damageBlock(j, fd, 0);
        }
        rings.push({ x, y, r: BS * (rr + 1), t: performance.now(), color: "255,120,40", dur: 350 });
      } finally { firestorming = false; }
    }
  }
  if (wasFrost && sk("b_icebreak") && !deep && !shattering){   // 氷砕: 氷結中の撃破で氷片が飛ぶ
    bumpProc("icebreak");
    const d = blockMaxHP(gx, gy) * (sk("b_glacier") ? 0.12 : 0.05), dirs = sk("b_glacier") ? N8 : N4;
    shattering = true;
    try { for (const [dx, dy] of dirs){ const j = liveAt(gx + dx, gy + dy); if (j >= 0) damageBlock(j, d, 0); } }
    finally { shattering = false; }
  }
  if (wasFrost && sk("b_frost3") && frostG < 2) for (const [dx, dy] of N4){ const j = liveAt(gx + dx, gy + dy); if (j >= 0 && frosts.size < 1500 && !frosts.has(j)){ frosts.set(j, 3 + (sk("b_frost2") ? 2 : 0)); frostGen.set(j, frostG + 1); bumpProc("frost"); } }   // 氷結伝播 (2世代まで)
  const shat = (!deep && !shattering) ? (sk("a_shatter") ? (sk("a_shatter2") ? 0.12 : 0.05) : 0) + (curFx && curFx.shatter ? curFx.shatter : 0) : 0;
  if (shat > 0){   // 破砕で壊れたブロックは弾けない (連鎖で星ごと崩れないように)
    const d = blockMaxHP(gx, gy) * shat;
    shattering = true;
    try { for (const [dx, dy] of N4){ const j = liveAt(gx + dx, gy + dy); if (j >= 0) damageBlock(j, d, 0); } }
    finally { shattering = false; }
  }
  if (sk("a_meteor") && ++breakN >= (sk("a_meteor2") ? 120 : 300)){ breakN = 0; bumpProc("meteor"); meteors.push({ x, y, t: 0.6, r: BS * 4, dmg: playerDamage() * 10 }); }
  if (artHas("lg_nova") && !novaBusy && ++novaArtN >= 50){ novaArtN = 0; novaBusy = true; try { supernovaAt(x, y); } finally { novaBusy = false; } }   // 超新星の核: 50個破壊ごと
  if (artHas("lg_gaia") && !deep && !shattering && Math.random() < 0.30){   // 大地母神の腕: 隣接ブロックも一緒に砕く (緑の衝撃波)
    shattering = true;
    try { for (const [dx, dy] of N4){ const j = liveAt(gx + dx, gy + dy); if (j >= 0) damageBlock(j, blockMaxHP(gx + dx, gy + dy) * 10, 0); } }
    finally { shattering = false; }
    rings.push({ x, y, r: BS * 1.8, t: performance.now(), color: "90,220,120", dur: 320 });
  }
  if (sk("e_reso") && !resonating){   // 鉱脈共鳴: 隣の同じ素材も一緒に削れる
    const pw = 0.2, dirs = N4, mi = materialAt(gx, gy);
    resonating = true;
    try { for (const [dx, dy] of dirs){ const j = liveAt(gx + dx, gy + dy); if (j >= 0 && materialAt(gx + dx, gy + dy) === mi) damageBlock(j, blockMaxHP(gx + dx, gy + dy) * pw, 0); } }
    finally { resonating = false; }
  }
  if (sk("e_reso3") && !resonating){   // 共鳴増幅: 2マス先の同じ素材にも届く
    const pw2 = 0.3, rr = 2, mi2 = materialAt(gx, gy);
    resonating = true;
    try { for (let dy = -rr; dy <= rr; dy++) for (let dx = -rr; dx <= rr; dx++){
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 2) continue;
      const j = liveAt(gx + dx, gy + dy);
      if (j >= 0 && materialAt(gx + dx, gy + dy) === mi2) damageBlock(j, blockMaxHP(gx + dx, gy + dy) * pw2, 0);
    } } finally { resonating = false; }
  }
  if (sk("e_quake2") && ++quakeN >= 400){   // 地殻振動: 400個壊すごとに自動で地震
    quakeN = 0; bumpProc("quake");
    const r = 300, rb = Math.ceil(r / BS);
    rawDamage(() => {
      for (let yy = Math.max(0, gy - rb); yy <= Math.min(D - 1, gy + rb); yy++)
        for (let xx = Math.max(0, gx - rb); xx <= Math.min(D - 1, gx + rb); xx++){
          const j = liveAt(xx, yy);
          if (j >= 0 && Math.hypot(g2w(xx) - x, g2w(yy) - y) <= r) damageBlock(j, blockMaxHP(xx, yy) * 0.03, 0);
        }
    });
    rings.push({ x, y, r, t: performance.now(), color: "242,166,90", dur: 600 });
    shake = Math.max(shake, 0.3); sndBoom();
  }
  // --- お宝ブロック: 壊したら大ボーナス、壊すたび近くのブロックがまれにお宝化する ---
  if (treasureSet.has(idx)){
    bumpProc("treasureBreak");
    treasureSet.delete(idx);
    const tm = MATS[materialAt(gx, gy)], tb = sk("e_treasure3") ? 12 : sk("e_treasure2") ? 8 : 4;
    invAdd(tm.key, tb); noteDrop(x, y, tm, tb);
    gainXP(blockXP(gx, gy) * (sk("e_treasure3") ? 4 : 2));   // 通常分と合わせて 3倍 / 5倍
    const cv = Math.max(5, Math.round(blockCoinValue(gx, gy) * 2)), cn2 = sk("e_treasure3") ? 8 : 5;
    for (let i = 0; i < cn2; i++){ const a = Math.random() * Math.PI * 2, sp = 120 + Math.random() * 260; coinsArr.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, value: cv, chest: false, age: 0 }); }
    rings.push({ x, y, r: BS * 2.2, t: performance.now(), color: "255,214,64", dur: 500 });
    toast(`お宝ブロック! ${tm.name} +${tb} / コイン大放出`);
  }
  if (sk("e_treasure") && treasureSet.size < (sk("e_treasure3") ? 60 : sk("e_treasure2") ? 40 : 20) && Math.random() < (sk("e_treasure3") ? 0.02 : sk("e_treasure2") ? 0.012 : 0.005)){
    for (let t = 0; t < 10; t++){
      const j = liveAt(gx + ((Math.random() * 29) | 0) - 14, gy + ((Math.random() * 29) | 0) - 14);
      if (j >= 0 && j !== idx && !treasureSet.has(j)){ treasureSet.add(j); bumpProc("treasure"); break; }
    }
  }
  // --- 連破: 周囲のブロックが巻き込まれて一緒に壊れる (予算の範囲で連鎖) ---
  if ((sk("e_chain") || sk("e_chain2")) && !deep){
    if (chainBudget > 0){ chainBudget--; if (Math.random() < 0.75) chainStrike(gx, gy); }
    else if (Math.random() < (sk("e_chain2") ? 0.20 : 0.12)){ chainBudget = (sk("e_chain2") ? 4 : 2) - 1; chainStrike(gx, gy); }
  }
  // --- 発破採掘: 一定数壊すごとに、破壊地点を中心に大爆発 (発破で壊れた分は数えない) ---
  if (sk("e_blast") && !blasting && ++blastN >= (sk("e_blast3") ? 10 : sk("e_blast2") ? 15 : 25)){
    blastN = 0; bumpProc("blast");
    blasting = true;
    try {
      const rr = sk("e_blast3") ? 3 : sk("e_blast2") ? 2 : 1;
      for (let dy = -rr; dy <= rr; dy++) for (let dx = -rr; dx <= rr; dx++){
        if (!dx && !dy) continue;
        const j = liveAt(gx + dx, gy + dy);
        if (j >= 0) damageBlock(j, blockMaxHP(gx + dx, gy + dy) * 10, 0);
      }
      rings.push({ x, y, r: BS * (rr + 1.5), t: performance.now(), color: "255,110,50", dur: 450 });
      shake = Math.max(shake, 0.35); sndBoom();
    } finally { blasting = false; }
  }
}
// 連破の一撃: 周囲8マスからランダムな1ブロックを即座に砕く
function chainStrike(gx, gy){
  bumpProc("chain");
  const cand = [];
  for (const [dx, dy] of N8){ const j = liveAt(gx + dx, gy + dy); if (j >= 0) cand.push(j); }
  if (!cand.length) return;
  const j = cand[(Math.random() * cand.length) | 0];
  rings.push({ x: g2w(j % D), y: g2w((j / D) | 0), r: BS * 1.4, t: performance.now(), color: "242,166,90", dur: 260 });
  damageBlock(j, blockMaxHP(j % D, (j / D) | 0) * 10, 0);
}

// ---------- コイン ----------
function addCoins(n){ state.coins += n; state.totalCoins += n; }
function gainCoin(c, byBot){
  let v = c.value;
  if (byBot){
    v *= botCoinMul();
    if (sk("c_haul")) v *= 1.10;
    if (c.age > 2 && cbInterest() > 0) v *= 1 + cbInterest();
    if (cbScanChance() > 0 && Math.random() < cbScanChance()) scanMaterialAt(c.x, c.y);   // 鉱物スキャナ
  }
  v = Math.round(v);
  addCoins(v); sndCoin();
  if (sk("c_piggy")) piggy += v * (sk("c_piggy2") ? 0.2 : 0.1);
  if (!c.dup && sk("c_spill") && Math.random() < 0.05){
    const a = Math.random() * Math.PI * 2;
    coinsArr.push({ x: c.x, y: c.y, vx: Math.cos(a) * 420, vy: Math.sin(a) * 420, value: c.value, dup: true, age: 0 });
  }
}
// 鉱物スキャナ: その場所の地層からランダムな素材を1つ見つける
function scanMaterialAt(x, y){
  const gx = w2g(x), gy = w2g(y);
  if (gx < 0 || gy < 0 || gx >= D || gy >= D) return;
  const b = bodyAt(gx, gy);
  if (b < 0) return;
  let m;
  if (b > 0){ const S = SATS[b - 1], dep = blockDepth(gx, gy); m = MATS[pickFrom(dep < 0.2 ? S.tab0 : dep < 0.6 ? S.tab1 : S.tab2, Math.random())]; }
  else { const li = Math.max(1, layerIndexOf(blockDepth(gx, gy))), tab = LAYER_TABLES[li]; m = MATS[pickFrom(tab, Math.random())]; }
  invAdd(m.key, 1); noteDrop(x, y, m, 1);
}
