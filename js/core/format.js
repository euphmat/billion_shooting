"use strict";
/* =========================================================
   core/format.js - 数値の表示 (fmt / fmtDmg / niceRound)
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
