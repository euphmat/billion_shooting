"use strict";
/* =========================================================
   audio.js - WebAudio による効果音シンセ (音源ファイル不要)

   負荷対策:
   - 全ての音は 1本のマスター (ゲイン + コンプレッサー) を通す。
     大量に重なっても音割れせず、音量が暴れない
   - 音の種類ごと (チャンネル) に同時発音数の上限を設け、
     全体でも上限を超えたら新しい音を鳴らさない (ノードを作らない)
   - 同じ種類の音は最短間隔で間引く (1フレームに大量に壊れる/拾う対策)
   - 連続音 (購入・レベルアップ等) は setTimeout ではなく
     AudioContext の時刻で予約する (タイマーを使わない・ずれない)
   - 鳴り終わったノードはすぐ切り離す
   - ミュート中・タブが裏にある間は AudioContext を止める
   ========================================================= */
let AC = null, master = null;
// チャンネルごとの同時発音数の上限 (全体の上限は VOICE_TOTAL)
const VOICE_MAX = { shoot: 3, break: 4, coin: 4, boom: 3, fx: 8, ui: 10 };
const VOICE_TOTAL = 20;
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
    const comp = AC.createDynamicsCompressor();
    comp.threshold.value = -16; comp.knee.value = 12; comp.ratio.value = 6;
    comp.attack.value = 0.003; comp.release.value = 0.2;
    master.connect(comp); comp.connect(AC.destination);
  }
  if (AC.state === "suspended" && !state.muted && !document.hidden) AC.resume();
  return AC;
}
// ミュート / タブ切り替えに合わせて、音の処理そのものを止める
function syncAudioActive(){
  if (!AC) return;
  if (state.muted || document.hidden){ if (AC.state === "running") AC.suspend(); }
  else if (AC.state === "suspended") AC.resume();
}
document.addEventListener("visibilitychange", syncAudioActive);

// delay: 何秒後に鳴らすか / ch: チャンネル (同時発音数の管理単位)
function tone(freq, dur, type, vol, slideTo, delay, ch){
  if (state.muted || document.hidden) return;
  ch = ch || "ui";
  try {
    const ac = audio(), now = ac.currentTime;
    let total = 0;
    for (const k in voiceEnds) total += liveVoices(voiceEnds[k], now);
    if (voiceEnds[ch].length >= VOICE_MAX[ch] || total >= VOICE_TOTAL) return;   // 鳴らしすぎ: ノードを作らずに捨てる
    const o = ac.createOscillator(), g = ac.createGain();
    const t0 = now + (delay || 0), t1 = t0 + dur;
    o.type = type || "square";
    o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t1);
    g.gain.setValueAtTime(vol || 0.05, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t1);
    o.connect(g); g.connect(master);
    o.start(t0); o.stop(t1 + 0.01);
    voiceEnds[ch].push(t1);
    o.onended = () => { o.disconnect(); g.disconnect(); };
  } catch(e){}
}
// 最短間隔で間引く効果音を作る
function throttled(gapMs, fn){
  let last = 0;
  return () => { const n = performance.now(); if (n - last < gapMs) return; last = n; fn(); };
}
const sndShoot  = throttled(60, () => tone(880, .06, "square", .025, 440, 0, "shoot"));
const sndBreak  = throttled(45, () => tone(220, .18, "sawtooth", .06, 40, 0, "break"));
const sndCoin   = throttled(40, () => tone(1320, .09, "sine", .05, 1760, 0, "coin"));
const sndBoom   = throttled(90, () => tone(110, .4, "sawtooth", .09, 28, 0, "boom"));
const sndStrike = throttled(120, () => tone(1400, .5, "sine", .05, 180, 0, "fx"));
const sndBuy    = () => { tone(660, .09, "square", .05); tone(990, .12, "square", .05, 0, .08); };
const sndFail   = () => tone(160, .15, "square", .05);
const sndClear  = () => [523, 659, 784, 1046].forEach((f, i) => tone(f, .35, "square", .06, 0, i * .16));
