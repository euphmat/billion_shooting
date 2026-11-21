"use strict";
/* =========================================================
   ui/notify.js - 画面上の通知

   1. 通知ログ (toast): 画面の左下に小さく積む。最大4件・約4秒で消える。
      同じ文言が続いたら新しい行を足さずに「×n」をまとめる。
      以前は画面中央に大きな発光文字を出していたが、レベルアップや素材発見のたびに
      中央を覆ってうるさかったので、ログ形式に変えた。
   2. 発動タグ (procTag): スキルが発動した場所に、その名前を小さく浮かべる。
      リングや爆発が「何のスキルの演出か」を分かるようにするためのもの。
      同じスキルは一定間隔に1回だけ・同時表示は数個までに絞る。
   ========================================================= */

// ---------- 1. 通知ログ ----------
const NOTE_MAX = 4, NOTE_LIFE = 4200;
const noteRecs = [];   // {el, text, n, timer}
let noteBox = null;
// kind: "info" (白) / "good" (金: レベルアップや大当たり) / "warn" (赤: 撃墜など)
// group: 同じ group の通知が続いたら、行を足さずに最新の文言へ書き換える (連続レベルアップなど)
function toast(text, kind, group){
  if (!noteBox){ noteBox = $("noteLog"); if (!noteBox) return; }
  const last = noteRecs[noteRecs.length - 1];
  if (last && (last.text === text || (group && last.group === group))){   // 直前と同じ文言・同じ種類は ×n にまとめて寿命を延ばす
    last.n++;
    if (last.text !== text){ last.text = text; last.label.textContent = text; }
    last.cnt.textContent = "×" + last.n;
    clearTimeout(last.timer);
    last.timer = setTimeout(() => noteRemove(last), NOTE_LIFE);
    return;
  }
  while (noteRecs.length >= NOTE_MAX) noteRemove(noteRecs[0], true);
  const el = document.createElement("div");
  el.className = "note " + (kind || "info");
  const t = document.createElement("span"); t.textContent = text;
  const cnt = document.createElement("b");
  el.append(t, cnt);
  noteBox.appendChild(el);
  const rec = { el, text, n: 1, cnt, label: t, group, timer: 0 };
  rec.timer = setTimeout(() => noteRemove(rec), NOTE_LIFE);
  noteRecs.push(rec);
  requestAnimationFrame(() => el.classList.add("show"));
}
function noteRemove(rec, now){
  const i = noteRecs.indexOf(rec);
  if (i < 0) return;
  noteRecs.splice(i, 1);
  clearTimeout(rec.timer);
  if (now){ rec.el.remove(); return; }
  rec.el.classList.remove("show");
  setTimeout(() => rec.el.remove(), 300);
}

// ---------- 2. 発動タグ ----------
// bumpProc(key, x, y) から呼ばれる。状態異常 (燃焼・氷結など) は数が多すぎるので対象外 (ブロック上のスプライトで分かる)
const PROC_TAG = {
  warpout:       ["ワープアウト", "#78beff"],
  thermo:        ["熱衝撃",     "#ff9650"],
  bolt:          ["落雷",       "#ffe14d"],
  firestorm:     ["火炎嵐",     "#ff7a3a"],
  icebreak:      ["氷砕",       "#9be7ff"],
  meteor:        ["流星",       "#ffb060"],
  treasureBreak: ["お宝！",     "#ffd640"],
  jackpot:       ["一攫千金",   "#ffd60a"],
  chain:         ["連破",       "#f2a65a"],
  blast:         ["発破",       "#ff6e32"],
  quake:         ["地殻振動",   "#f2a65a"],
  dimension:     ["次元崩壊",   "#c878ff"],
  chainreact:    ["連鎖反応",   "#ff8a5c"],
  automine:      ["自動採掘網", "#50dcff"],
  stareater:     ["星喰い",     "#ffb060"],
  elemnova:      ["元素新星",   "#ff8a5c"],
  goldify:       ["黄金化",     "#ffd60a"],
  devour:        ["星喰い・真", "#ffbe5a"],
  diswave:       ["解体波",     "#ffb060"],
  frip:          ["解体",       "#b9a8ff"],
  freplicate:    ["自己複製",   "#b9a8ff"],
  fdisch:        ["放電",       "#9ff0ff"],
  frail:         ["レールガン", "#cfc4ff"],
  fmagma:        ["マグマ噴出", "#ff7a3a"],
  fbomb:         ["爆撃",       "#ffb070"],
  fshell:        ["砲撃",       "#ffb070"],
  fnuke:         ["戦術核",     "#c8ffaa"],
  fstomp:        ["踏みつけ",   "#b9a8ff"],
  fsalvo:        ["ミサイル",   "#d6ccff"],
  fnano:         ["分解",       "#d8d4ea"],
  fsplit:        ["分裂",       "#ff6fa8"],
  f0drone:       ["自爆ドローン", "#ffb070"],
  f0mine:        ["地雷",       "#ff7a3a"],
  f0kami:        ["突撃",       "#7df9ff"],
  f0pack:        ["撤収爆破",   "#ffb070"],
};
const procTags = [];   // {x, y, text, color, t}
const procTagLast = {};
const PROC_TAG_MAX = 5, PROC_TAG_TTL = 1000;
function procTag(key, x, y){
  const info = PROC_TAG[key];
  if (!info || procTags.length >= PROC_TAG_MAX || !onScreen(x, y, 0)) return;
  const gap = fxLow() ? 4000 : 1600;   // 同じスキルの名前は、この間隔に1回だけ出す
  if (nowMs - (procTagLast[key] || -1e9) < gap) return;
  procTagLast[key] = nowMs;
  procTags.push({ x, y, text: info[0], color: info[1], t: nowMs });
}
function drawProcTags(now, ox, oy){
  if (!procTags.length) return;
  let w = 0;
  ctx.font = '700 12px "Hiragino Kaku Gothic ProN","Yu Gothic",system-ui,sans-serif';
  ctx.textAlign = "center"; ctx.textBaseline = "bottom"; ctx.lineJoin = "round"; ctx.lineWidth = 3;
  for (let i = 0; i < procTags.length; i++){
    const p = procTags[i], age = (now - p.t) / PROC_TAG_TTL;
    if (age >= 1) continue;
    procTags[w++] = p;
    const sx = p.x * zoom + ox, sy = p.y * zoom + oy - 14 - age * 18;
    ctx.globalAlpha = Math.max(0, 1 - Math.max(0, age - 0.55) / 0.45);
    ctx.strokeStyle = "rgba(0,0,0,.85)"; ctx.strokeText(p.text, sx, sy);
    ctx.fillStyle = p.color; ctx.fillText(p.text, sx, sy);
  }
  procTags.length = w;
  ctx.globalAlpha = 1; ctx.textAlign = "start"; ctx.textBaseline = "alphabetic"; ctx.lineWidth = 1;
}
