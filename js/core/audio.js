"use strict";
/* =========================================================
   audio.js - WebAudio による効果音シンセ (音源ファイル不要)

   音作りの方針 (v92):
   - 武器ごとに「声」がある: 武器の性質 (照射/連鎖/炎/氷/重砲/散弾/追尾…) から
     音色を選び、武器キーから決めた音程 (ペンタトニック) で鳴らす。全武器で少しずつ違う
   - ブロックは素材の系統で壊れ方の音が違う: 土=ぼすっ / 岩=ガリッ / 鉱石=カキン /
     金属=キン / 宝石=チリン / 液体=ポコッ / 有機=コツッ / 元素=バチッ / 異物質=ふわん
   - 音のある成分は、連続で壊すほどペンタトニックを駆け上がる (どこで切っても不協和にならない)
   - うるさくしない: 角の立つ矩形波・ノコギリ波は使わず、正弦/三角波と、フィルタを通したノイズで作る。
     連射の速い武器ほど1発を小さく・間引きを長く。自機以外 (ボット等) の音はさらに小さく。
     最後にローパスを掛けて耳に痛い高域を落とす

   負荷対策:
   - 全ての音は 1本のマスター (ゲイン + ローパス + コンプレッサー) を通す。
     大量に重なっても音割れせず、音量が暴れない
   - 音の種類ごと (チャンネル) に同時発音数の上限を設け、
     全体でも上限を超えたら新しい音を鳴らさない (ノードを作らない)
   - 同じ種類の音は最短間隔で間引く (1フレームに大量に壊れる/拾う対策)
   - 連続音 (購入・レベルアップ等) は setTimeout ではなく
     AudioContext の時刻で予約する (タイマーを使わない・ずれない)
   - ノイズは 1秒ぶんのバッファを1回だけ作り、読み出し位置を変えて使い回す
   - 鳴り終わったノードはすぐ切り離す
   - ミュート中・タブが裏にある間は AudioContext を止める
   ========================================================= */
let AC = null, master = null, NOISE = null;
// チャンネルごとの同時発音数の上限 (全体の上限は VOICE_TOTAL)。1つの音 (複数のノードの重ね) で1声と数える
const VOICE_MAX = { shoot: 4, break: 4, coin: 4, boom: 3, fx: 8, ui: 10 };
const VOICE_TOTAL = 22;
// 鳴っている音の終了時刻 (AudioContext の時刻)。終わった分は数える前に取り除く。
// onended に頼らないので、AudioContext が止まっていても数がずれない
const voiceEnds = { shoot: [], break: [], coin: [], boom: [], fx: [], ui: [] };
function liveVoices(list, now){
  let w = 0;
  for (let i = 0; i < list.length; i++) if (list[i] > now) list[w++] = list[i];
  list.length = w;
  return w;
}

function audio(){
  if (!AC){
    AC = new (window.AudioContext || window.webkitAudioContext)();
    master = AC.createGain(); master.gain.value = 0.9;
    const soft = AC.createBiquadFilter();   // 耳に痛い高域を少し落とす
    soft.type = "lowpass"; soft.frequency.value = 9000; soft.Q.value = 0.5;
    const comp = AC.createDynamicsCompressor();
    comp.threshold.value = -18; comp.knee.value = 14; comp.ratio.value = 6;
    comp.attack.value = 0.003; comp.release.value = 0.25;
    master.connect(soft); soft.connect(comp); comp.connect(AC.destination);
  }
  if (AC.state === "suspended" && !state.muted && !document.hidden) AC.resume();
  return AC;
}
function noiseBuf(ac){
  if (!NOISE){
    const n = ac.sampleRate, b = ac.createBuffer(1, n, n), d = b.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    NOISE = b;
  }
  return NOISE;
}
// ミュート / タブ切り替えに合わせて、音の処理そのものを止める
function syncAudioActive(){
  if (!AC) return;
  if (state.muted || document.hidden){ if (AC.state === "running") AC.suspend(); }
  else if (AC.state === "suspended") AC.resume();
}
document.addEventListener("visibilitychange", syncAudioActive);

// 攻撃・破壊音のチャンネル (設定 state.atkMuted でこの系統だけを止める)
const ATK_CH = { shoot: 1, break: 1, boom: 1 };

/* ---------- 発音の土台 ----------
   play(ch, dur, delay, vol, build): 上限を確かめてから 1声ぶんの出口 (ゲイン) を作り、
   build(c) がそこへ音の層 (osc / noise) を重ねる。最後に鳴り終わる層で全ノードを切り離す */
function play(ch, dur, delay, vol, build){
  if (state.muted || document.hidden) return;
  if (state.atkMuted && ATK_CH[ch]) return;   // 攻撃・破壊音オフ: 発射/破壊/爆発だけを再生直前で止める (他SE・レベルアップ等は鳴る)
  try {
    const ac = audio(), now = ac.currentTime;
    let total = 0;
    for (const k in voiceEnds) total += liveVoices(voiceEnds[k], now);
    if (voiceEnds[ch].length >= VOICE_MAX[ch] || total >= VOICE_TOTAL) return;   // 鳴らしすぎ: ノードを作らずに捨てる
    const t0 = now + (delay || 0);
    const out = ac.createGain(); out.gain.value = vol; out.connect(master);
    const c = { ac, t0, out, nodes: [out], last: null, lastEnd: 0 };
    build(c);
    voiceEnds[ch].push(Math.max(t0 + dur, c.lastEnd));
    if (c.last){ const nodes = c.nodes; c.last.onended = () => { for (const n of nodes) n.disconnect(); }; }
  } catch(e){}
}
// 音量の包絡: 一瞬で立ち上がり、指数で消える
function env(p, t0, t1, v, att){
  p.setValueAtTime(0.0001, t0);
  p.exponentialRampToValueAtTime(Math.max(0.0002, v), t0 + att);
  p.exponentialRampToValueAtTime(0.0001, t1);
}
function track(c, src, t1){ c.nodes.push(src); if (t1 >= c.lastEnd){ c.lastEnd = t1; c.last = src; } }
// 発振器の層 o = { type, f, f2 (滑らせる先), dur, vol, at (開始のずれ), att (立ち上がり), vib (揺れ幅Hz) }
function osc(c, o){
  const ac = c.ac, t0 = c.t0 + (o.at || 0), t1 = t0 + o.dur;
  const s = ac.createOscillator(), e = ac.createGain();
  s.type = o.type || "sine";
  s.frequency.setValueAtTime(o.f, t0);
  if (o.f2) s.frequency.exponentialRampToValueAtTime(o.f2, t1);
  if (o.vib){   // ゆらぎ (異物質のシマー等)
    const l = ac.createOscillator(), lg = ac.createGain();
    l.frequency.value = o.vibF || 9; lg.gain.value = o.vib;
    l.connect(lg); lg.connect(s.frequency); l.start(t0); l.stop(t1 + 0.02);
    c.nodes.push(l, lg);
  }
  env(e.gain, t0, t1, o.vol == null ? 1 : o.vol, o.att || 0.003);
  s.connect(e); e.connect(c.out);
  s.start(t0); s.stop(t1 + 0.02);
  c.nodes.push(e); track(c, s, t1 + 0.02);
}
// ノイズの層 o = { ft (フィルタの種類), f, f2, q, dur, vol, at, att }
function noise(c, o){
  const ac = c.ac, t0 = c.t0 + (o.at || 0), t1 = t0 + o.dur;
  const s = ac.createBufferSource(), fl = ac.createBiquadFilter(), e = ac.createGain();
  s.buffer = noiseBuf(ac);
  fl.type = o.ft || "bandpass"; fl.Q.value = o.q || 1;
  fl.frequency.setValueAtTime(o.f, t0);
  if (o.f2) fl.frequency.exponentialRampToValueAtTime(o.f2, t1);
  env(e.gain, t0, t1, o.vol == null ? 1 : o.vol, o.att || 0.002);
  s.connect(fl); fl.connect(e); e.connect(c.out);
  s.start(t0, Math.random() * 0.6); s.stop(t1 + 0.02);
  c.nodes.push(fl, e); track(c, s, t1 + 0.02);
}
// 旧来の単音 (UI音・レベルアップ等で使う)。矩形波指定でも少し丸めた三角波で鳴らす
function tone(freq, dur, type, vol, slideTo, delay, ch){
  const t = (!type || type === "square" || type === "sawtooth") ? "triangle" : type;
  play(ch || "ui", dur, delay, (vol || 0.05) * (t !== type ? 1.4 : 1), c => osc(c, { type: t, f: freq, f2: slideTo || 0, dur }));
}

// ---------- 音程 ----------
const PENTA = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21];
const semi = s => Math.pow(2, s / 12);
const jit = (a) => 1 + (Math.random() - 0.5) * a;   // 毎回少しだけ揺らして、同じ音の連打に聞こえないように
const hashKey = k => { let h = 7; for (let i = 0; i < k.length; i++) h = (h * 31 + k.charCodeAt(i)) >>> 0; return h; };

// ---------- 発射音: 武器の性質から音色を決める (1回だけ計算して覚える) ----------
const SHOT_PROFILE = new Map();
function shotProfile(w){
  let p = SHOT_PROFILE.get(w.key);
  if (p) return p;
  const shape = w.form || w.shape || "dot", rate = w.rate || 4, h = hashKey(w.key);
  let kind;
  if (w.mode === "aura") kind = "aura";
  else if (w.mode === "beam") kind = "rail";
  else if (w.mode === "chain") kind = "zap";
  else if (w.mode === "laser") kind = "laser";
  else if (w.burn || shape === "flame" || shape === "ember") kind = "flame";
  else if (w.frost || shape === "icicle" || shape === "snow") kind = "ice";
  else if (w.bomb || w.mine || w.move === "mine" || shape === "bomb") kind = "lob";
  else if ((w.splash || 0) >= 2 || (w.size || 4) >= 7 || rate <= 1.2) kind = "heavy";
  else if ((w.pellets || 1) >= 3) kind = "spread";
  else if (w.homing) kind = "bloop";
  else if (w.acid || w.bounce || shape === "drop" || shape === "tear" || shape === "bubble" || shape === "bubbles") kind = "bubble";
  else if (rate >= 10) kind = "tick";
  else if (w.critC >= 0.3 || shape === "star" || shape === "spark" || shape === "star4" || shape === "star6") kind = "sparkle";
  else if (w.pierce >= 3 || shape === "gear" || shape === "cone") kind = "drill";
  else kind = "pew";
  // 音程: 武器ごとにペンタトニックの1音。深い層の武器ほど少し低く、重みを出す
  const pm = semi(PENTA[h % 7] - Math.min(7, w.tier || 0));
  // 連射が速いほど 1発を小さく、間引きを長く (毎秒の音量がほぼ一定になる)
  const vol = Math.min(1, 1.6 / Math.sqrt(Math.max(1, rate)));
  const gap = kind === "aura" ? 240 : rate >= 20 ? 95 : rate >= 10 ? 75 : 55;
  p = { kind, pm, vol, gap };
  SHOT_PROFILE.set(w.key, p);
  return p;
}
const SHOT_SOUNDS = {
  pew:    (c, m) => { osc(c, { type: "triangle", f: 900 * m, f2: 420 * m, dur: 0.07 }); osc(c, { f: 1800 * m, f2: 900 * m, dur: 0.04, vol: 0.25 }); },
  tick:   (c, m) => { osc(c, { type: "triangle", f: 1400 * m, f2: 1000 * m, dur: 0.03 }); noise(c, { ft: "highpass", f: 4000, dur: 0.02, vol: 0.3 }); },
  laser:  (c, m) => { osc(c, { f: 1600 * m, f2: 700 * m, dur: 0.06 }); osc(c, { f: 2410 * m, f2: 1050 * m, dur: 0.05, vol: 0.2 }); },
  rail:   (c, m) => { osc(c, { type: "triangle", f: 300 * m, f2: 2400 * m, dur: 0.08, vol: 0.6 }); osc(c, { f: 2400 * m, f2: 260 * m, dur: 0.32, at: 0.07 }); noise(c, { ft: "bandpass", f: 3000, f2: 600, q: 2, dur: 0.3, at: 0.07, vol: 0.6 }); },
  zap:    (c, m) => { noise(c, { ft: "bandpass", f: 5000, q: 4, dur: 0.05, vol: 0.9 }); noise(c, { ft: "bandpass", f: 3200, q: 5, dur: 0.05, at: 0.04, vol: 0.6 }); osc(c, { type: "triangle", f: 220 * m, f2: 110 * m, dur: 0.1, vol: 0.5, vib: 60, vibF: 40 }); },
  aura:   (c, m) => { noise(c, { ft: "bandpass", f: 300 * m, f2: 900 * m, q: 1.5, dur: 0.22, att: 0.06, vol: 0.8 }); osc(c, { f: 110 * m, dur: 0.22, att: 0.05, vol: 0.35 }); },
  flame:  (c, m) => { noise(c, { ft: "lowpass", f: 2200, f2: 500, q: 0.7, dur: 0.12, att: 0.01 }); osc(c, { f: 160 * m, f2: 90 * m, dur: 0.08, vol: 0.3 }); },
  ice:    (c, m) => { osc(c, { f: 2100 * m, f2: 1900 * m, dur: 0.09, vol: 0.6 }); osc(c, { f: 3150 * m, dur: 0.06, vol: 0.25 }); noise(c, { ft: "highpass", f: 6000, dur: 0.04, vol: 0.3 }); },
  lob:    (c, m) => { osc(c, { f: 260 * m, f2: 520 * m, dur: 0.1 }); noise(c, { ft: "lowpass", f: 800, dur: 0.05, vol: 0.4 }); },
  heavy:  (c, m) => { osc(c, { f: 150 * m, f2: 55, dur: 0.22 }); noise(c, { ft: "lowpass", f: 1400, f2: 200, dur: 0.15, vol: 0.7 }); osc(c, { type: "triangle", f: 600 * m, f2: 200, dur: 0.05, vol: 0.3 }); },
  spread: (c, m) => { noise(c, { ft: "bandpass", f: 1800, f2: 700, q: 0.8, dur: 0.09 }); osc(c, { type: "triangle", f: 500 * m, f2: 250 * m, dur: 0.06, vol: 0.35 }); },
  bloop:  (c, m) => { osc(c, { f: 500 * m, f2: 1100 * m, dur: 0.08 }); osc(c, { f: 750 * m, f2: 1650 * m, dur: 0.06, vol: 0.2 }); },
  bubble: (c, m) => { osc(c, { f: 380 * m, f2: 1000 * m, dur: 0.06 }); osc(c, { f: 600 * m, f2: 1300 * m, dur: 0.045, at: 0.035, vol: 0.5 }); },
  sparkle:(c, m) => { osc(c, { type: "triangle", f: 1300 * m, f2: 900 * m, dur: 0.06 }); osc(c, { f: 2600 * m, dur: 0.09, at: 0.02, vol: 0.3 }); },
  drill:  (c, m) => { osc(c, { type: "triangle", f: 300 * m, f2: 220 * m, dur: 0.11, vib: 40, vibF: 55 }); noise(c, { ft: "bandpass", f: 2400, q: 3, dur: 0.08, vol: 0.4 }); },
};
const SHOT_VOL = { pew: .035, tick: .02, laser: .025, rail: .05, zap: .045, aura: .03, flame: .05, ice: .03, lob: .04, heavy: .07, spread: .05, bloop: .035, bubble: .035, sparkle: .03, drill: .035 };
const SHOT_DUR = { rail: .4, aura: .22, heavy: .22, flame: .12, zap: .1, drill: .11 };
const lastShot = new Map();   // 間引き: 「音色 + 自機かどうか」ごとに最後に鳴らした時刻
// w = 武器 (無ければ素の単発) / mine = 自機の攻撃か (自機以外は小さく・間引きも長め)
function sndShoot(w, mine){
  const p = w ? shotProfile(w) : { kind: "tick", pm: 1.2, vol: 0.8, gap: 90 };
  const key = p.kind + (mine ? "!" : ""), n = performance.now(), gap = mine ? p.gap : p.gap * 2;
  if (n - (lastShot.get(key) || 0) < gap) return;
  lastShot.set(key, n);
  const m = p.pm * jit(0.06), fn = SHOT_SOUNDS[p.kind];
  play("shoot", SHOT_DUR[p.kind] || 0.08, 0, SHOT_VOL[p.kind] * p.vol * (mine ? 1 : 0.4), c => fn(c, m));
}

// ---------- 破壊音: 素材の系統ごとの壊れ方 ----------
// 連続で壊すほど、音のある成分がペンタトニックを1段ずつ上がる (少し間が空くと最初に戻る)
let brkStep = 0, brkT = 0, brkLast = 0;
const BREAK_SOUNDS = {
  soil:    (c, m) => { noise(c, { ft: "lowpass", f: 900, f2: 200, dur: 0.12 }); osc(c, { f: 130 * m, f2: 70, dur: 0.1, vol: 0.5 }); },
  rock:    (c, m) => { noise(c, { ft: "bandpass", f: 1900, f2: 500, q: 1.3, dur: 0.13 }); osc(c, { type: "triangle", f: 190 * m, f2: 80, dur: 0.09, vol: 0.4 }); },
  organic: (c, m) => { osc(c, { f: 440 * m, f2: 260 * m, dur: 0.07 }); noise(c, { ft: "bandpass", f: 2600, q: 2, dur: 0.03, vol: 0.4 }); },
  ore:     (c, m) => { noise(c, { ft: "bandpass", f: 1600, f2: 600, q: 1.2, dur: 0.1, vol: 0.7 }); osc(c, { type: "triangle", f: 1180 * m, dur: 0.14, vol: 0.4 }); osc(c, { f: 3250 * m, dur: 0.07, vol: 0.12 }); },
  metal:   (c, m) => { osc(c, { f: 900 * m, dur: 0.28, vol: 0.5 }); osc(c, { f: 2160 * m, dur: 0.18, vol: 0.25 }); osc(c, { f: 3510 * m, dur: 0.1, vol: 0.12 }); noise(c, { ft: "highpass", f: 3000, dur: 0.03, vol: 0.3 }); },
  gem:     (c, m) => { osc(c, { f: 1568 * m, dur: 0.3, vol: 0.55 }); osc(c, { f: 3136 * m, dur: 0.16, vol: 0.2 }); osc(c, { f: 2349 * m, dur: 0.2, at: 0.04, vol: 0.25 }); noise(c, { ft: "highpass", f: 7000, dur: 0.05, vol: 0.25 }); },
  liquid:  (c, m) => { osc(c, { f: 320 * m, f2: 900 * m, dur: 0.08 }); noise(c, { ft: "lowpass", f: 1200, dur: 0.09, vol: 0.35 }); },
  element: (c, m) => { osc(c, { type: "triangle", f: 880 * m, f2: 220 * m, dur: 0.09, vib: 80, vibF: 45 }); noise(c, { ft: "highpass", f: 5000, dur: 0.05, vol: 0.4 }); },
  exotic:  (c, m) => { osc(c, { f: 660 * m, f2: 990 * m, dur: 0.26, vib: 12, vibF: 7, vol: 0.6 }); osc(c, { f: 990 * m, f2: 1320 * m, dur: 0.22, vib: 14, vibF: 6, vol: 0.3 }); noise(c, { ft: "highpass", f: 6000, dur: 0.08, vol: 0.2 }); },
};
const BREAK_VOL = { soil: .07, rock: .07, organic: .05, ore: .06, metal: .035, gem: .04, liquid: .05, element: .045, exotic: .04 };
const BREAK_DUR = { metal: .28, gem: .3, exotic: .26, ore: .14 };
// m = 壊れた素材 (無ければ岩)
function sndBreak(m){
  const n = performance.now();
  if (n - brkLast < 50) return;
  brkLast = n;
  brkStep = n - brkT < 380 ? (brkStep + 1) % PENTA.length : 0;
  brkT = n;
  const cat = m && BREAK_SOUNDS[m.cat] ? m.cat : "rock";
  // 硬い素材ほど少し低く (重い手応え)。段の上がり方は控えめに半分の幅で
  const hard = m ? Math.min(2, m.hard || 1) : 1;
  const pm = semi(PENTA[brkStep] * 0.5) * (1.15 - hard * 0.15) * jit(0.05), fn = BREAK_SOUNDS[cat];
  play("break", BREAK_DUR[cat] || 0.13, 0, BREAK_VOL[cat], c => fn(c, pm));
}

// ---------- 爆発: 低いうなり + 崩れる音。big で大爆発 (奥義・究極など) ----------
let boomLast = 0;
function sndBoom(big){
  const n = performance.now();
  if (n - boomLast < (big ? 60 : 110)) return;
  boomLast = n;
  const k = jit(0.15), d = big ? 0.9 : 0.45;
  play("boom", d, 0, big ? 0.13 : 0.08, c => {
    osc(c, { f: 95 * k, f2: 32, dur: d });
    noise(c, { ft: "lowpass", f: 1600 * k, f2: 120, q: 0.8, dur: d * 0.9 });
    noise(c, { ft: "bandpass", f: 3000, f2: 800, q: 1, dur: 0.08, vol: 0.4 });   // 弾ける瞬間のパチッ
    if (big) osc(c, { type: "triangle", f: 60 * k, f2: 28, dur: d, vol: 0.6, vib: 4, vibF: 11 });
  });
}
const sndStrike = (() => { let t = 0; return () => {
  const n = performance.now(); if (n - t < 120) return; t = n;
  play("fx", 0.5, 0, 0.04, c => { osc(c, { f: 1400, f2: 180, dur: 0.5 }); noise(c, { ft: "highpass", f: 4000, dur: 0.12, vol: 0.4 }); });
}; })();

// ---------- コイン: チャリン。合体コインほど厚く、宝箱は小さなファンファーレ ----------
let coinLast = 0, coinStep = 0, coinT = 0;
function sndCoin(n, chest, byBot){
  const now = performance.now();
  if (chest){   // 宝箱: 間引かずに鳴らす (めったに出ない)
    [0, 4, 7, 12].forEach((s, i) => play("coin", 0.2, i * 0.06, 0.045, c => { osc(c, { type: "triangle", f: 1047 * semi(s), dur: 0.2 }); osc(c, { f: 2094 * semi(s), dur: 0.12, vol: 0.3 }); }));
    return;
  }
  if (now - coinLast < (byBot ? 90 : 45)) return;
  coinLast = now;
  coinStep = now - coinT < 300 ? (coinStep + 1) % 5 : 0;   // 拾い続けると少しずつ上がる
  coinT = now;
  const f = 1976 * semi(PENTA[coinStep] * 0.5) * jit(0.03), rich = n > 1;
  play("coin", 0.14, 0, byBot ? 0.018 : 0.04, c => {
    osc(c, { f, dur: 0.06 });
    osc(c, { f: f * 1.335, dur: 0.11, at: 0.045 });   // 2音目 (完全4度上): チャ・リン
    if (rich) osc(c, { type: "triangle", f: f * 0.5, dur: 0.14, vol: 0.4 });
  });
}
// 黄金化 (破壊時にコイン×100): きらきらの上昇アルペジオ
// 終盤は 5% の破壊で起きるので、1声にまとめて 0.45秒に1回まで (連発してもジャラジャラ鳴り続けない)
let goldLast = 0;
function sndGoldify(){
  const n = performance.now(); if (n - goldLast < 450) return; goldLast = n;
  play("fx", 0.4, 0, 0.03, c => [0, 4, 7, 11, 14].forEach((s, i) => { osc(c, { f: 1319 * semi(s), dur: 0.18, at: i * 0.045 }); osc(c, { f: 2638 * semi(s), dur: 0.08, at: i * 0.045, vol: 0.3 }); }));
}
// モンスター撃破: ポンッと弾けて、短く落ちる
let mobLast = 0;
function sndMobDie(){
  const n = performance.now(); if (n - mobLast < 80) return; mobLast = n;
  const k = jit(0.1);
  play("fx", 0.22, 0, 0.05, c => { osc(c, { f: 700 * k, f2: 1400 * k, dur: 0.05 }); osc(c, { type: "triangle", f: 900 * k, f2: 180 * k, dur: 0.2, at: 0.04, vol: 0.7 }); noise(c, { ft: "bandpass", f: 2000, q: 1, dur: 0.06, vol: 0.4 }); });
}

// ---------- UI ----------
const pluck = (f, at, v) => play("ui", 0.14, at, v, c => { osc(c, { type: "triangle", f, dur: 0.14 }); osc(c, { f: f * 2, dur: 0.07, vol: 0.3 }); });
const sndBuy   = () => { pluck(784, 0, 0.06); pluck(1175, 0.07, 0.06); };
const sndFail  = () => play("ui", 0.16, 0, 0.05, c => { osc(c, { type: "triangle", f: 200, f2: 150, dur: 0.16 }); osc(c, { type: "triangle", f: 212, f2: 158, dur: 0.16, vol: 0.6 }); });
const sndClear = () => [523, 659, 784, 1046].forEach((f, i) => tone(f, .35, "triangle", .07, 0, i * .16));
