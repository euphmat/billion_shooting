"use strict";
/* =========================================================
   ui/common.js - DOM ヘルパー / アイコン / 購入定義 (各パネル共通の部品)
   ========================================================= */

const $ = id => document.getElementById(id);
// タッチ端末かどうか (文言を「クリック」/「タップ」で出し分けるのに使う。mobile.js もこれを見る)
const TOUCH_UI = (window.matchMedia && matchMedia("(pointer: coarse)").matches) || navigator.maxTouchPoints > 0;
const TAP = TOUCH_UI ? "タップ" : "クリック";
const costHTML = c => `<span class="cost"><i class="coin-dot"></i>${fmt(c)}</span>`;

/* ---------- icons (stroke = currentColor) ---------- */
const ICONS = {
  mossgun:   `<path d="M4 20 14 10M14 10a5 5 0 1 1 6 6M14 10a5 5 0 1 0-6-6" stroke-linecap="round"/>`,
  clayhammer:`<path d="M13 3l8 8M9 7l8 8-3 3-8-8zM9 7L5 3M5 21l4-4" stroke-linejoin="round"/>`,
  sapdrop:   `<path d="M12 3c3.5 4.5 6 7.8 6 11a6 6 0 1 1-12 0c0-3.2 2.5-6.5 6-11z" stroke-linejoin="round"/>`,
  sandblast: `<path d="M3 12h6M13 7l8-2M13 17l8 2M11 12h10" stroke-linecap="round"/>`,
  ammoshell: `<path d="M12 4a8 8 0 1 1-8 8 8 8 0 0 1 8-8zM12 8a4 4 0 1 1-4 4 4 4 0 0 1 4-4zM12 12h.01" stroke-linecap="round"/>`,
  coalfire:  `<path d="M12 3c1 4-4 6-4 10a4.5 4.5 0 0 0 9 0c0-2-1-3-2-4 3 1 5 3.5 5 6a8 8 0 1 1-16 0C4 8 10 6 12 3z" stroke-linejoin="round"/>`,
  aquajet:   `<path d="M3 9c3-2 6-2 9 0s6 2 9 0M3 15c3-2 6-2 9 0s6 2 9 0" stroke-linecap="round"/>`,
  rustgun:   `<path d="M3 9h13l5 3-5 3H9l-2 6H4zM16 9V5" stroke-linejoin="round"/>`,
  petalchain:`<path d="M12 3c2 2.5 2 5 0 7-2-2-2-4.5 0-7zM5 10c3 .5 4.5 2 5 5-3-.5-4.5-2-5-5zM19 10c-3 .5-4.5 2-5 5 3-.5 4.5-2 5-5z" stroke-linejoin="round"/>`,
  glassbeam: `<path d="M4 4l6 8-6 8M10 12h11M17 8l4 4-4 4" stroke-linejoin="round"/>`,
  damage:  `<path d="M13 2 4.5 13.5H11L9.8 22 19.5 10H13L13 2z" stroke-linejoin="round"/>`,
  speed:   `<path d="M9.6 4.6A2 2 0 1 1 11 8H2.5M12.6 19.4A2 2 0 1 0 14 16H2.5M17.7 7.7A2.5 2.5 0 1 1 19.5 12H2.5" stroke-linecap="round"/>`,
  magnet:  `<path d="M6 3v8a6 6 0 0 0 12 0V3" /><path d="M6 3h4v5H6zM14 3h4v5h-4z" stroke-linejoin="round"/>`,
  normal:  `<circle cx="12" cy="12" r="3.2"/><path d="M12 2.5v4M12 17.5v4M2.5 12h4M17.5 12h4" stroke-linecap="round"/>`,
  rapid:   `<path d="M4 6h9M4 12h13M4 18h9" stroke-linecap="round"/><path d="M16.5 3.8 20 6l-3.5 2.2M16.5 9.8 20 12l-3.5 2.2M16.5 15.8 20 18l-3.5 2.2" stroke-linejoin="round"/>`,
  heavy:   `<path d="M12 2.8c2.4 2.8 3.6 6 3.6 9.2l-3.6 4-3.6-4c0-3.2 1.2-6.4 3.6-9.2z" stroke-linejoin="round"/><path d="M9.5 20.5h5" stroke-linecap="round"/>`,
  spread:  `<circle cx="12" cy="18" r="1.6"/><path d="M12 16V6M12 9 5.5 4.5M12 9l6.5-4.5" stroke-linecap="round"/><path d="M9.8 3.5 12 5.8l2.2-2.3M3.6 3.4l2.9.4-.4 2.9M20.4 3.4l-2.9.4.4 2.9" stroke-linejoin="round"/>`,
  crusher: `<circle cx="12" cy="12" r="2.4"/><path d="M12 2.5v4M12 17.5v4M2.5 12h4M17.5 12h4M5 5l2.8 2.8M16.2 16.2 19 19M19 5l-2.8 2.8M7.8 16.2 5 19" stroke-linecap="round"/>`,
  laser:   `<path d="M2 12h20" stroke-linecap="round"/><circle cx="12" cy="12" r="2.6"/><path d="M5 8.5 3 6M19 8.5 21 6M5 15.5 3 18M19 15.5l2 2.5" stroke-linecap="round"/>`,
  bot:     `<rect x="5" y="9" width="14" height="9" rx="1.5"/><path d="M12 9V5" stroke-linecap="round"/><circle cx="12" cy="3.8" r="1.3"/><circle cx="9.3" cy="13.5" r="1" fill="currentColor" stroke="none"/><circle cx="14.7" cy="13.5" r="1" fill="currentColor" stroke="none"/><path d="M2.8 12.5v3M21.2 12.5v3" stroke-linecap="round"/>`,
  coinbot: `<rect x="4" y="8" width="12" height="8.5" rx="1.5"/><path d="M10 8V4.8" stroke-linecap="round"/><circle cx="10" cy="3.6" r="1.2"/><circle cx="7.6" cy="12.2" r=".9" fill="currentColor" stroke="none"/><circle cx="12" cy="12.2" r=".9" fill="currentColor" stroke="none"/><circle cx="17.8" cy="17.2" r="4"/><path d="M16 17.2h3.6" stroke-linecap="round"/>`,
  orbital: `<circle cx="12" cy="12" r="3"/><path d="M12 2.8a9.2 9.2 0 1 0 9.2 9.2" stroke-dasharray="3 3"/><rect x="17.6" y="4" width="4.6" height="4.6" rx="1"/>`,
  shotgun: `<circle cx="4.6" cy="12" r="1.7"/><path d="M6.5 12 18.5 5.5M6.5 12h13.5M6.5 12l12 6.5" stroke-linecap="round"/><path d="M16 4.3l3.2.9-.9 3.2M17.5 12h3.5" stroke-linejoin="round"/>`,
  recycle: `<path d="M5.5 12a6.5 6.5 0 0 1 11-4.5M18.5 12a6.5 6.5 0 0 1-11 4.5"/><path d="M16.8 3.8v4h-4M7.2 20.2v-4h4" stroke-linejoin="round"/>`,
  homing:  `<circle cx="12" cy="12" r="3"/><path d="M12 3a9 9 0 1 0 9 9" stroke-linecap="round"/><path d="M21 8v4h-4" stroke-linejoin="round"/>`,
  twin:    `<circle cx="7.5" cy="12" r="3.4"/><circle cx="16.5" cy="12" r="3.4"/><circle cx="7.5" cy="12" r=".7" fill="currentColor" stroke="none"/><circle cx="16.5" cy="12" r=".7" fill="currentColor" stroke="none"/>`,
  pierce:  `<path d="M7 4v16M12 4v16"/><path d="M2 12h16" stroke-linecap="round"/><path d="M14.5 6.5 20 12l-5.5 5.5" stroke-linejoin="round"/>`,
  crit:    `<path d="M12 3l1.8 5.4L19 10l-5.2 1.6L12 17l-1.8-5.4L5 10l5.2-1.6z" stroke-linejoin="round"/><path d="M19.5 16.5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z" stroke-linejoin="round"/>`,
  ricochet:`<path d="M3 19 9.5 6.5 14 15l5-8.5"/><path d="M15.5 6.5H20V11"/>`,
  split:   `<circle cx="4.5" cy="12" r="1.8"/><path d="M6.5 12h5M11.5 12l6.5-4.5M11.5 12H19M11.5 12l6.5 4.5"/><circle cx="20" cy="7.5" r="1.4"/><circle cx="20.8" cy="12" r="1.4"/><circle cx="20" cy="16.5" r="1.4"/>`,
  aura:    `<circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="5.5"/><circle cx="12" cy="12" r="9.5" stroke-dasharray="3 3"/>`,
  missile: `<path d="M12 2.5c2.6 2.6 4 5.8 4 9.2l-4 4-4-4c0-3.4 1.4-6.6 4-9.2z" stroke-linejoin="round"/><circle cx="12" cy="9" r="1.6"/><path d="M8 13.5 5.5 19 10 16.5M16 13.5 18.5 19 14 16.5"/>`,
  beam:    `<path d="M2 12h20" stroke-width="3.4" stroke-linecap="round"/><path d="M6 6.5 3.5 4M18 6.5 20.5 4M6 17.5 3.5 20M18 17.5l2.5 2.5"/>`,
  giga:    `<path d="M12 3c3 3.2 4.5 7 4.5 10.5L12 19l-4.5-5.5C7.5 10 9 6.2 12 3z" stroke-linejoin="round"/><circle cx="12" cy="11" r="2"/><path d="M4 21.5h16"/>`,
  gatling: `<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="7.5" r="1.6"/><circle cx="8.1" cy="14.2" r="1.6"/><circle cx="15.9" cy="14.2" r="1.6"/>`,
  midas:   `<circle cx="11" cy="13" r="7"/><path d="M8.5 13h5M11 10.5v5" stroke-linecap="round"/><path d="M18.5 2.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z" stroke-linejoin="round"/>`,
  chain:   `<path d="M3 6l6 5-3 2 7 5" stroke-linejoin="round"/><circle cx="3" cy="6" r="1.3"/><circle cx="14.5" cy="19" r="1.6"/><path d="M14 4l3 3-2 1.5 4.5 3.5" stroke-linejoin="round"/>`,
  nova:    `<circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="7" stroke-dasharray="2 2.5"/><path d="M12 1.5v3M12 19.5v3M1.5 12h3M19.5 12h3" stroke-linecap="round"/>`,
  singularity: `<circle cx="12" cy="12" r="3.2" fill="currentColor" stroke="none"/><path d="M12 5a7 7 0 0 1 7 7M12 19a7 7 0 0 1-7-7" stroke-linecap="round"/><path d="M3 9.5A9.5 9.5 0 0 1 12 2.5M21 14.5a9.5 9.5 0 0 1-9 7" stroke-linecap="round" stroke-dasharray="2 3"/>`,
  // --- 奥義専用アイコン (15種) ---
  apex:        `<circle cx="12" cy="12" r="6.2"/><path d="M12 2v3.5M12 18.5V22M2 12h3.5M18.5 12H22" stroke-linecap="round"/><path d="M8.5 8.5l7 7M15.5 8.5l-7 7" stroke-linecap="round"/>`,
  dimension:   `<circle cx="12" cy="12" r="8.5"/><path d="M12.5 3.6 10.2 9l3.6 3-2.4 3 1.4 5.4" stroke-linejoin="round"/><path d="M4.8 7.8l4 1.6M19.2 16.2l-4-1" stroke-linecap="round"/>`,
  planetkiller:`<path d="M12 .8v5.4" stroke-linecap="round"/><path d="M9.2 3.4 12 6.2l2.8-2.8" stroke-linejoin="round"/><circle cx="12" cy="14.2" r="6.6"/><path d="M8.2 11.2l3 2.4-1.6 3.2M15.8 10.6l-2.4 2.4 1.8 3" stroke-linejoin="round"/>`,
  elemsing:    `<circle cx="12" cy="12" r="1.8" fill="currentColor" stroke="none"/><circle cx="12" cy="4" r="1.6"/><circle cx="19.6" cy="9.5" r="1.6"/><circle cx="16.7" cy="18.5" r="1.6"/><circle cx="7.3" cy="18.5" r="1.6"/><circle cx="4.4" cy="9.5" r="1.6"/><path d="M12 6.6v2M17.9 11l-1.8.8M15.2 16.8l-1.2-1.5M8.8 16.8l1.2-1.5M6.1 11l1.8.8" stroke-linecap="round"/>`,
  chainreaction:`<circle cx="6" cy="7" r="2.6"/><circle cx="17" cy="10" r="2.6"/><circle cx="9" cy="17.5" r="2.6"/><path d="M8.3 8.3 14.5 9.6M15.5 12.3l-4.3 3.4M7.7 14.5 6.6 9.8" stroke-linecap="round"/><path d="M20.8 2.8v3M19.3 4.3h3" stroke-linecap="round"/>`,
  elemcore:    `<path d="M12 2.8 20 7.4v9.2L12 21.2 4 16.6V7.4z" stroke-linejoin="round"/><circle cx="12" cy="12" r="3.4"/><path d="M12 9.6c.9 1.3.9 2.6 0 3.8-.9-1.2-.9-2.5 0-3.8z" fill="currentColor" stroke="none"/>`,
  eldorado:    `<path d="M3.5 20.5h17M6 20.5v-6h4v6M14 20.5v-6h4v6M8.2 14.5V9.8h7.6v4.7" stroke-linejoin="round"/><circle cx="12" cy="5.2" r="2"/><path d="M12 1.2v1.2M5.6 3.4l1 1M18.4 3.4l-1 1" stroke-linecap="round"/>`,
  tycoon:      `<circle cx="10" cy="13" r="6.5"/><path d="M7.6 10.4 10 12.8l2.4-2.4M10 12.8v3.6M8.1 14.9h3.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M18.6 3.4l.7 1.9 1.9.7-1.9.7-.7 1.9-.7-1.9-1.9-.7 1.9-.7z" stroke-linejoin="round"/><circle cx="19.2" cy="15.5" r="2.5"/>`,
  philosopher: `<path d="M7 9.5c-2 0-3.5 1.1-3.5 2.5S5 14.5 7 14.5c3.5 0 6.5-5 10-5 2 0 3.5 1.1 3.5 2.5S19 14.5 17 14.5c-3.5 0-6.5-5-10-5z" stroke-linejoin="round"/><path d="M12 3.6l1.1 2.1 2.1 1.1-2.1 1.1L12 10l-1.1-2.1-2.1-1.1 2.1-1.1z" stroke-linejoin="round"/>`,
  funnel:      `<path d="M12 6.8 15.6 12 12 17.2 8.4 12z" stroke-linejoin="round"/><circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none"/><path d="M3.6 12a8.4 8.4 0 0 1 4.8-7.6M20.4 12a8.4 8.4 0 0 1-4.8 7.6" stroke-linecap="round" stroke-dasharray="2.5 2.5"/><circle cx="4.9" cy="8.6" r="1.2"/><circle cx="19.1" cy="15.4" r="1.2"/>`,
  orbitalbot:  `<circle cx="12" cy="12" r="4.4"/><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"/><path d="M12 5.4a6.6 6.6 0 1 1-6.6 6.6" stroke-linecap="round"/><circle cx="19.6" cy="6.2" r="1.8"/><path d="M17.9 12.9l2.6 2.6M20.5 12.9l-2.6 2.6" stroke-linecap="round"/>`,
  grandfleet:  `<path d="M12 3.8 14.7 9 12 20.2 9.3 9z" stroke-linejoin="round"/><path d="M4.6 8.8l1.9 3.6-1.9 4.8-1.9-4.8zM19.4 8.8l-1.9 3.6 1.9 4.8 1.9-4.8z" stroke-linejoin="round"/><path d="M8 21.2h8" stroke-linecap="round"/>`,
  rights:      `<path d="M6.5 21V4" stroke-linecap="round"/><path d="M6.5 4.6c3-1.8 5 1.4 9 .2v5.2c-4 1.2-6-2-9-.2" stroke-linejoin="round"/><path d="M3 21h18" stroke-linecap="round"/><path d="M14.5 21 17 16.8 19.5 21" stroke-linejoin="round"/>`,
  automine:    `<path d="M4.5 19.5 14 10" stroke-linecap="round"/><path d="M9.2 3.8c4.6.4 8.2 3.4 9.8 8.2C15.4 9 12.2 7.4 9.2 7z" stroke-linejoin="round"/><circle cx="19" cy="19" r="1.5"/><circle cx="12.2" cy="20.2" r="1.5"/><path d="M15.8 13.2 18 17.5M13.4 14.8l-.6 3.6" stroke-linecap="round"/>`,
  stareater:   `<path d="M12 2.8l2 5.3 5.6.5-4.3 3.7 1.4 5.5L12 14.6l-4.7 3.2 1.4-5.5L4.4 8.6 10 8.1z" stroke-linejoin="round"/><path d="M12 .8v3M12 20.2v3M.8 12h3M20.2 12h3" stroke-linecap="round"/>`,
  // --- 究極専用アイコン (5種) ---
  ultdestroy:  `<circle cx="12" cy="12" r="6.8"/><path d="M8.2 10.2l2.4 1.8-1 2.6M15.8 10l-2 2 1.2 2.4" stroke-linejoin="round"/><path d="M4.5 4.5l15 15M19.5 4.5l-15 15" stroke-linecap="round"/>`,
  ultbigbang:  `<circle cx="12" cy="12" r="1.7" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="4.6"/><circle cx="12" cy="12" r="8.6" stroke-dasharray="2.5 3"/><path d="M12 0.8v2.2M12 21v2.2M0.8 12H3M21 12h2.2M4.2 4.2l1.6 1.6M19.8 4.2l-1.6 1.6M4.2 19.8l1.6-1.6M19.8 19.8l-1.6-1.6" stroke-linecap="round"/>`,
  ultgold:     `<path d="M6.5 8.5c-2.2 0-4 1.6-4 3.5s1.8 3.5 4 3.5c3.8 0 7-7 10.5-7 2.2 0 4 1.6 4 3.5s-1.8 3.5-4 3.5c-3.5 0-6.7-7-10.5-7z" stroke-linejoin="round"/><circle cx="12" cy="18" r="2.6"/><path d="M10.8 18h2.4M12 16.8v2.4" stroke-linecap="round"/><path d="M19.5 1.6l.6 1.6 1.6.6-1.6.6-.6 1.6-.6-1.6-1.6-.6 1.6-.6z" stroke-linejoin="round"/>`,
  ultmothership:`<path d="M21.5 12 16 8.8H8.5L4 6.8l1.2 5.2L4 17.2l4.5-2H16z" stroke-linejoin="round"/><path d="M8.5 8.8v6.4M13 9.5v5" stroke-linecap="round"/><circle cx="18.2" cy="12" r="1.3" fill="currentColor" stroke="none"/><path d="M2.2 9.8v4.4" stroke-linecap="round"/>`,
  ultdevour:   `<path d="M12 2.8l2 5.3 5.6.5-4.3 3.7 1.4 5.5L12 14.6l-4.7 3.2 1.4-5.5L4.4 8.6 10 8.1z" stroke-linejoin="round"/><path d="M12 10.1a1.9 1.9 0 1 1-1.9 1.9" stroke-linecap="round"/>`,
  // --- 機兵系統 (自律機兵) ---
  hunter:      `<path d="M21 12 8 5.5 4.5 7 7 12l-2.5 5L8 18.5z" stroke-linejoin="round"/><circle cx="12.5" cy="12" r="1.6" fill="currentColor" stroke="none"/><path d="M1.5 10.5v3" stroke-linecap="round"/>`,
  spider:      `<ellipse cx="12" cy="13" rx="4" ry="3.4"/><circle cx="12" cy="8.2" r="2"/><path d="M8.3 11.5 3.5 8.5M8.3 13.5 3 13.5M8.6 15.2 4 19M15.7 11.5l4.8-3M15.7 13.5H21M15.4 15.2 20 19" stroke-linecap="round"/>`,
  warbomber:   `<path d="M21 12 9 3.5H6.5L9 10.5 4 12l5 1.5-2.5 7H9z" stroke-linejoin="round"/><circle cx="12" cy="19.5" r="1.6"/><path d="M12 15.5v2.4" stroke-linecap="round" stroke-dasharray="1 1.2"/>`,
  artillery:   `<path d="M3.5 19.5h11l1.5-4h-14z" stroke-linejoin="round"/><circle cx="8" cy="13.5" r="3"/><path d="M10 12 19.5 5.5" stroke-linecap="round" stroke-width="2.6"/><path d="M21.5 3.5l1 1M20 2l.4 1.3" stroke-linecap="round"/>`,
  nuke:        `<circle cx="12" cy="12" r="2"/><path d="M12 9.8 9.2 4.6a8.4 8.4 0 0 1 5.6 0zM13.9 13.1l5.9.2a8.4 8.4 0 0 1-2.8 4.9zM10.1 13.1 7 18.2a8.4 8.4 0 0 1-2.8-4.9z" stroke-linejoin="round"/>`,
  titan:       `<rect x="7" y="3.5" width="10" height="9" rx="1.5"/><circle cx="12" cy="7.5" r="1.4" fill="currentColor" stroke="none"/><path d="M7 6.5H3.5v4M17 6.5h3.5v4M9.5 12.5l-1.5 8M14.5 12.5l1.5 8M6 20.5h4M14 20.5h4" stroke-linecap="round" stroke-linejoin="round"/>`,
  hivemind:    `<circle cx="12" cy="5" r="2"/><circle cx="5" cy="17" r="2"/><circle cx="19" cy="17" r="2"/><circle cx="12" cy="13" r="2.4"/><path d="M12 7v3.6M6.6 15.8l3.4-1.7M17.4 15.8 14 14.1M7 17h10M10.8 5.9 6 15.3M13.2 5.9 18 15.3" stroke-linecap="round"/>`,
  nanite:      `<path d="M12 4.5 16.3 7v5L12 14.5 7.7 12V7z" stroke-linejoin="round"/><path d="M5 14.5 7.6 16v3L5 20.5 2.4 19v-3zM19 14.5l2.6 1.5v3L19 20.5 16.4 19v-3z" stroke-linejoin="round"/><circle cx="12" cy="9.5" r="1.3" fill="currentColor" stroke="none"/>`,
  drill:   `<path d="M7 4h10l-5 17z" stroke-linejoin="round"/><path d="M8.2 8.5l7.2 2M9.6 13l4.4 1.5" stroke-linecap="round"/>`,
  rare:    `<path d="M6 4h12l4 5.5L12 21 2 9.5z" stroke-linejoin="round"/><path d="M2 9.5h20M9 4l-2 5.5L12 21l5-11.5L15 4"/>`,
  double:  `<path d="M4 9h11M4 15h11" stroke-linecap="round"/><path d="M14 6.5 19 9l-5 2.5M14 12.5 19 15l-5 2.5" stroke-linejoin="round"/>`,
  needle:  `<path d="M3.5 20.5 20 4" stroke-linecap="round"/><path d="M15 4h5v5" stroke-linejoin="round"/><path d="M5.5 13.5l5 5" stroke-linecap="round"/>`,
  burner:  `<path d="M12 3c1 3 4.5 4.8 4.5 9a4.5 4.5 0 0 1-9 0c0-1.8.8-2.9 1.8-3.8.3 1.4.9 2.1 1.6 2.4C10.6 8 11 5.6 12 3z" stroke-linejoin="round"/><path d="M8 21h8" stroke-linecap="round"/>`,
  reaper:  `<path d="M6 21 15 5" stroke-linecap="round"/><path d="M15 5c-3.5-1.5-8-.5-10 3 3-1 6.5-.6 9 1" stroke-linejoin="round"/>`,
  sniper:  `<circle cx="12" cy="12" r="7.5"/><circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none"/><path d="M12 2v5M12 17v5M2 12h5M17 12h5" stroke-linecap="round"/>`,
  cluster: `<circle cx="12" cy="12" r="3.5"/><circle cx="12" cy="4" r="1.3"/><circle cx="12" cy="20" r="1.3"/><circle cx="4.5" cy="8" r="1.3"/><circle cx="19.5" cy="8" r="1.3"/><circle cx="4.5" cy="16" r="1.3"/><circle cx="19.5" cy="16" r="1.3"/>`,
  bomber:  `<circle cx="11" cy="14" r="6.5"/><path d="M15.5 9.5 18 7c.5-1.5 2-2.5 3-2" stroke-linecap="round"/><path d="M8.5 12.5a3 3 0 0 1 2.5-1.5" stroke-linecap="round"/>`,
  vulcan:  `<path d="M3 7h3M9 7h3M15 7h3M5 12h3M11 12h3M17 12h3M3 17h3M9 17h3M15 17h3" stroke-linecap="round" stroke-width="2.2"/>`,
  hydra:   `<circle cx="5" cy="18" r="1.8"/><path d="M6.5 16.5C9 12 12 9 19 5M7 17c4-2 8-3 13-2.5M6 16c1-4 2-8 5.5-12" stroke-linecap="round"/>`,
  rail:    `<path d="M2 7.5h20M2 16.5h20" stroke-linecap="round"/><path d="M3 12h18" stroke-width="3" stroke-linecap="round"/>`,
  flare:   `<path d="M12 2.5l2 5.5 5.5-2-2.5 5.5 4.5 2.5-5.5 1 1 5.5-5-3-5 3 1-5.5-5.5-1 4.5-2.5L4.5 6l5.5 2z" stroke-linejoin="round"/>`,
  storm:   `<path d="M3 7c2-2 4 2 6 0s4 2 6 0 4 2 6 0" stroke-linecap="round"/><path d="M12.5 10l-3 5h4l-2 6" stroke-linecap="round" stroke-linejoin="round"/>`,
  drillshot:`<path d="M3 9h8l9 3-9 3H3z" stroke-linejoin="round"/><path d="M7 9l2 6M11 9l2 6" stroke-linecap="round"/>`,
  prism:   `<path d="M8 4 13.5 15H2.5z" stroke-linejoin="round"/><path d="M13 11l8-5M13.5 13h8M13 15l8 4" stroke-linecap="round"/>`,
  vortex:  `<path d="M12 12a2 2 0 1 1 2-2 4 4 0 1 1-4-4 6.5 6.5 0 1 1-6.5 6.5A9 9 0 0 1 12 3.5" stroke-linecap="round"/>`,
  swarm:   `<path d="M4 6l3 1.5L4 9zM10 4l3 1.5L10 7zM16 7l3 1.5L16 10zM6 13l3 1.5L6 16zM13 12l3 1.5-3 1.5zM9 18l3 1.5L9 21z" stroke-linejoin="round"/>`,
  thunder: `<path d="M7 13a4 4 0 0 1 .5-8 5 5 0 0 1 9.5 1.5A3.3 3.3 0 0 1 17 13z" stroke-linejoin="round"/><path d="M12 13l-2.5 4h3.5L11 22" stroke-linecap="round" stroke-linejoin="round"/>`,
  fractal: `<path d="M12 3 21 19H3z" stroke-linejoin="round"/><path d="M7.5 11h9L12 19z" stroke-linejoin="round"/>`,
  quasar:  `<circle cx="12" cy="12" r="2.5" fill="currentColor" stroke="none"/><ellipse cx="12" cy="12" rx="9.5" ry="3"/><path d="M12 2v5M12 17v5" stroke-width="2.6" stroke-linecap="round"/>`,
  omega:   `<path d="M4 20h5v-2.5A7 7 0 1 1 15 17.5V20h5" stroke-linejoin="round" stroke-linecap="round"/>`,
  pulsar:  `<circle cx="12" cy="12" r="2" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="5.5"/><circle cx="12" cy="12" r="9"/><path d="M12 1v2M12 21v2M1 12h2M21 12h2" stroke-linecap="round"/>`,
  starfall:`<path d="M15 4l1 2.5 2.5 1-2.5 1L15 11l-1-2.5-2.5-1 2.5-1z" stroke-linejoin="round"/><path d="M8 11l.8 2 2 .8-2 .8L8 17l-.8-2-2-.8 2-.8z" stroke-linejoin="round"/><path d="M11 3 4 10M21 13l-7 7" stroke-linecap="round" stroke-dasharray="2 2"/>`,
  graviton:`<circle cx="12" cy="12" r="4.5" fill="currentColor" stroke="none"/><ellipse cx="12" cy="12" rx="10" ry="4" transform="rotate(-25 12 12)"/>`,
  tempest: `<path d="M3 5h18M5 9h14M7 13h10M9 17h6M11 21h2" stroke-linecap="round"/>`,
  ragnarok:`<circle cx="12" cy="12" r="8.5" stroke-dasharray="2.5 2.5"/><path d="M12 7v10M7 12h10M8.5 8.5l7 7M15.5 8.5l-7 7" stroke-linecap="round"/>`,
  eclipse: `<circle cx="12" cy="12" r="8"/><path d="M13 4.1a8 8 0 0 1 0 15.8 6.5 6.5 0 0 0 0-15.8z" fill="currentColor" stroke="none"/>`,
  genesis: `<circle cx="12" cy="12" r="3"/><path d="M12 6V2M12 22v-4M6 12H2M22 12h-4" stroke-linecap="round"/><circle cx="6" cy="6" r="1.2"/><circle cx="18" cy="6" r="1.2"/><circle cx="6" cy="18" r="1.2"/><circle cx="18" cy="18" r="1.2"/>`,
  hyperion:`<circle cx="12" cy="12" r="4"/><path d="M12 2v4M12 18v4M3.3 7l3.5 2M17.2 15l3.5 2M3.3 17l3.5-2M17.2 9l3.5-2" stroke-linecap="round"/>`,
  nemesis: `<circle cx="10" cy="14" r="7"/><circle cx="10" cy="14" r="2.6"/><path d="M10 14 20 4M16 4h4v4" stroke-linecap="round" stroke-linejoin="round"/>`,
  infinity:`<path d="M12 12c-2-3-4-4.5-6-4.5a4.5 4.5 0 0 0 0 9c2 0 4-1.5 6-4.5s4-4.5 6-4.5a4.5 4.5 0 0 1 0 9c-2 0-4-1.5-6-4.5z" stroke-linejoin="round"/>`,
  bigbang: `<circle cx="12" cy="12" r="1.8" fill="currentColor" stroke="none"/><path d="M12 7.5V2M12 22v-5.5M7.5 12H2M22 12h-5.5M8.8 8.8 5 5M19 19l-3.8-3.8M15.2 8.8 19 5M5 19l3.8-3.8" stroke-linecap="round" stroke-dasharray="2 1.5"/>`,
  worldend:`<circle cx="12" cy="12" r="8.5"/><path d="M12 3.5 10 9l4 2.5-3 5 1.5 4" stroke-linejoin="round" stroke-linecap="round"/>`,
  origin:  `<rect x="4" y="4" width="16" height="16"/><circle cx="12" cy="12" r="2.2" fill="currentColor" stroke="none"/>`,
  bow:     `<path d="M8 2.5C13 7 13 17 8 21.5M8 2.5v19M8 12h12M17 9l3 3-3 3" stroke-linecap="round" stroke-linejoin="round"/>`,
  cannon:  `<path d="M3 10h13l5-2v6l-5-1H3z" stroke-linejoin="round"/><circle cx="8" cy="18" r="2.6"/><path d="M14 18h7" stroke-linecap="round"/>`,
  ap:      `<path d="M17.5 3v18" stroke-linecap="round"/><path d="M2 12h13M11 7l5 5-5 5" stroke-linejoin="round"/>`,
  volcano: `<path d="M4 21l5-9h6l5 9z" stroke-linejoin="round"/><path d="M10.5 8.5c0-2 1.8-2.2 1.8-4.5M13.8 8.5c0-2 1.8-2.2 1.8-4.5" stroke-linecap="round"/>`,
  dragon:  `<path d="M3 21c2-8 8-14 18-16-2 3-2 5-1 7-3-1-5 0-6 2-1-2-3-3-5-2 0 3-2 6-6 9z" stroke-linejoin="round"/>`,
  snow:    `<path d="M12 2v20M4 6l16 12M20 6L4 18M12 2 9.8 4.8M12 2l2.2 2.8M12 22l-2.2-2.8M12 22l2.2-2.8" stroke-linecap="round"/>`,
  glacier: `<path d="M3 20 9 6l3 6 3-8 6 16z" stroke-linejoin="round"/><path d="M12 12l-2 8" stroke-linecap="round"/>`,
  ray:     `<path d="M3 12l6-5v10z" stroke-linejoin="round"/><path d="M12.5 8 21 5M12.5 12H22M12.5 16 21 19" stroke-linecap="round"/>`,
  ember:   `<path d="M12 21.5a6 6 0 0 0 6-6c0-4-3-5.2-3-9.2-3 1-4.2 3-4.2 5.2C9.8 10.7 9 9.7 9 7.5 6.8 9.7 6 12.3 6 15.5a6 6 0 0 0 6 6z" stroke-linejoin="round"/>`,
  blade:   `<path d="M5.5 18.5 17 7c2-2 4-2.2 4-2.2S20.8 7 18.8 9L7.5 20.5l-2-2z" stroke-linejoin="round"/><path d="M13.5 10.5l3 3" stroke-linecap="round"/>`,
  moon:    `<path d="M20 14.5A8.5 8.5 0 1 1 9.5 4 7 7 0 0 0 20 14.5z" stroke-linejoin="round"/>`,
  crescent:`<path d="M18.5 14.5A8 8 0 1 1 9.5 5.5a6.5 6.5 0 0 0 9 9z" stroke-linejoin="round"/><path d="M18 2.6l.7 1.9 1.9.7-1.9.7L18 7.8l-.7-1.9-1.9-.7 1.9-.7z" stroke-linejoin="round"/>`,
  mirror:  `<circle cx="12" cy="10" r="6.5"/><path d="M12 16.5V22M8.5 22h7M9.8 7 8.2 12M13.2 6.8 11.2 12" stroke-linecap="round"/>`,
  bounce:  `<circle cx="8.5" cy="7.5" r="4.5"/><path d="M12.5 15.5 19 21M21 14v7h-7" stroke-linecap="round" stroke-linejoin="round"/>`,
  catalyst:`<circle cx="12" cy="12" r="3"/><circle cx="12" cy="3.8" r="1.7"/><circle cx="19.2" cy="17" r="1.7"/><circle cx="4.8" cy="17" r="1.7"/>`,
  flash:   `<circle cx="12" cy="12" r="3.4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9 17 7M7 17l-2.1 2.1" stroke-linecap="round"/>`,
  acid:    `<path d="M9.5 3h5M11 3v5.2L6.6 16a3.6 3.6 0 0 0 3.1 5h4.6a3.6 3.6 0 0 0 3.1-5L13 8.2V3" stroke-linejoin="round"/><path d="M8 15.5h8" stroke-linecap="round"/>`,
  radiation:`<circle cx="12" cy="12" r="1.8" fill="currentColor" stroke="none"/><path d="M12 10.2 8.2 3.9a9 9 0 0 1 7.6 0zM13.6 13l6.7 1.6a9 9 0 0 1-7.3 5.3zM10.4 13l-6.7 1.6a9 9 0 0 0 7.3 5.3z" stroke-linejoin="round"/>`,
  nebula:  `<path d="M12 12c0-1.6 2.6-1.6 2.6.4 0 2.1-3.1 2.7-4.7 1.6C7.9 12.6 8.4 8.9 11 7.9c3.1-1.2 6.7 1 7.3 4.6.6 4.1-2.6 7.7-6.7 8.1" stroke-linecap="round"/>`,
  atom:    `<circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none"/><ellipse cx="12" cy="12" rx="9.2" ry="3.8"/><ellipse cx="12" cy="12" rx="9.2" ry="3.8" transform="rotate(60 12 12)"/><ellipse cx="12" cy="12" rx="9.2" ry="3.8" transform="rotate(120 12 12)"/>`,
  judgment:`<path d="M12 3v3M12 6v15M8 21h8M12 6H5m7 0h7" stroke-linecap="round"/><path d="M5 6 2.5 12a3.6 3.6 0 0 0 5 0zM19 6l-2.5 6a3.6 3.6 0 0 0 5 0z" stroke-linejoin="round"/>`,
  spectrum:`<path d="M9 4l6 16H3z" stroke-linejoin="round"/><path d="M15.2 8.5 22 6M15.8 12H22M15.2 15.5 22 18" stroke-linecap="round"/>`,
  sun:     `<circle cx="12" cy="12" r="4"/><path d="M12 2.5V5M12 19v2.5M2.5 12H5M19 12h2.5M5 5l1.8 1.8M17.2 17.2 19 19M19 5l-1.8 1.8M6.8 17.2 5 19" stroke-linecap="round"/>`,
  serpent: `<path d="M3 18c5 1 6-4 10-5 3-.8 5 .5 7-.5M20 12l1-3.5M20 12l3.5.5" stroke-linecap="round"/>`,
  rain:    `<path d="M7 14.5a4.5 4.5 0 1 1 .8-8.9A5.5 5.5 0 0 1 18.4 7.6 3.9 3.9 0 0 1 17.5 14.5z" stroke-linejoin="round"/><path d="M8 17.5 7 21M13 17.5 12 21M18 17.5 17 21" stroke-linecap="round"/>`,
  twilight:`<path d="M6.5 18a5.5 5.5 0 0 1 11 0M3 21.5h18M12 8V5M5.6 10 3.8 8.2M18.4 10l1.8-1.8" stroke-linecap="round"/>`,
  maw:     `<path d="M4 4.5c2 4.2 5 6.3 8 6.3s6-2.1 8-6.3M5.2 4.5 6.7 8 8.4 4.7 10 8l1.6-3.3L13.2 8 14.8 4.7 16.4 8l1.5-3.5" stroke-linejoin="round"/><path d="M6 19.5c4 2 8 2 12 0" stroke-linecap="round"/>`,
  heart:   `<path d="M12 20.5S4 15.2 4 9.9A4.3 4.3 0 0 1 12 7.2a4.3 4.3 0 0 1 8 2.7c0 5.3-8 10.6-8 10.6z" stroke-linejoin="round"/><circle cx="12" cy="11.8" r="1.4" fill="currentColor" stroke="none"/>`,
  horizon: `<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5v3M12 17.5v3" stroke-linecap="round"/>`,
  flower:  `<circle cx="12" cy="12" r="2"/><path d="M12 10c-1.2-2.8-.8-5 0-6.5.8 1.5 1.2 3.7 0 6.5zM14 12c2.8-1.2 5-.8 6.5 0-1.5.8-3.7 1.2-6.5 0zM12 14c1.2 2.8.8 5 0 6.5-.8-1.5-1.2-3.7 0-6.5zM10 12c-2.8 1.2-5 .8-6.5 0 1.5-.8 3.7-1.2 6.5 0z" stroke-linejoin="round"/>`,
  bee:     `<ellipse cx="11" cy="13.5" rx="5" ry="6"/><path d="M8 10c2 1 4 1 6 0M7.6 14.5c2.2 1 4.6 1 6.8 0M9.5 5 7 2.5M13.5 5.5 16 3M16.5 10.5c2.5-2.2 4.2-1.8 4.7-1.3-.2 1.6-2 3.2-4 3.3" stroke-linecap="round"/>`,
  mushroom:`<path d="M3.5 12.5a8.5 7.5 0 0 1 17 0z" stroke-linejoin="round"/><path d="M9.6 13 9 20a3.2 3.2 0 0 0 6 0l-.6-7" stroke-linejoin="round"/><circle cx="9" cy="8.5" r=".6" fill="currentColor" stroke="none"/><circle cx="14.5" cy="7" r=".6" fill="currentColor" stroke="none"/>`,
  pumpkin: `<path d="M12 7c5-1.8 8.5 1.2 8.5 5.8S17 20.3 12 18.6C7 20.3 3.5 17.3 3.5 12.8S7 5.2 12 7z" stroke-linejoin="round"/><path d="M12 7c-.8-2.2.6-3.6 2.6-3.6M12 7v11.6M8.2 6.2v13.2M15.8 6.2v13.2" stroke-linecap="round"/>`,
  candy:   `<circle cx="12" cy="12" r="5"/><path d="M7.6 9.6 3 6.4c1.1 2 1.1 3.2 0 5.2l4.6-3.2zM16.4 14.4 21 17.6c-1.1-2-1.1-3.2 0-5.2l-4.6 3.2z" stroke-linejoin="round"/><path d="M9.6 9.6a3.4 3.4 0 0 1 3.8 3.8" stroke-linecap="round"/>`,
  bubbles: `<circle cx="9" cy="15" r="4.5"/><circle cx="16.5" cy="8.5" r="3.2"/><circle cx="17.5" cy="17.5" r="2.2"/><path d="M7.3 13.4a2.2 2.2 0 0 1 1.2-2" stroke-linecap="round"/>`,
  comet:   `<circle cx="7" cy="17" r="3.4"/><path d="M9.8 14.2 20 4M13.2 15.8 21 9.5M14.8 11.2 20.5 5.5" stroke-linecap="round"/>`,
  trident: `<path d="M12 9.5V21M8 21h8M5 3v5c0 2.2 1.6 3.5 3.5 3.5M19 3v5c0 2.2-1.6 3.5-3.5 3.5M12 3v8.5" stroke-linecap="round"/>`,
  blood:   `<path d="M12 3c3 4.6 6 8.2 6 11.6a6 6 0 0 1-12 0C6 11.2 9 7.6 12 3z" stroke-linejoin="round"/><path d="M9.3 14.8a2.7 2.7 0 0 0 2.2 3.2" stroke-linecap="round"/>`,
  fang:    `<path d="M5 3c0 6.5 2.2 12.5 7 18 4.8-5.5 7-11.5 7-18-2.2 2.2-4.5 2.2-7 .2C9.5 5.2 7.2 5.2 5 3z" stroke-linejoin="round"/>`,
  venom:   `<path d="M12 3c2.6 4.1 5.5 7.4 5.5 10.6a5.5 5.5 0 0 1-11 0C6.5 10.4 9.4 7.1 12 3z" stroke-linejoin="round"/><path d="M9.9 12.6l4.2 4.2M14.1 12.6l-4.2 4.2" stroke-linecap="round"/>`,
  gear:    `<circle cx="12" cy="12" r="3.4"/><path d="M12 2.8v3M12 18.2v3M2.8 12h3M18.2 12h3M5.5 5.5l2.1 2.1M16.4 16.4l2.1 2.1M18.5 5.5l-2.1 2.1M7.6 16.4l-2.1 2.1" stroke-linecap="round"/>`,
  aurora:  `<path d="M5 3c2 5-2 8 0 13M10 3c2 5-2 9 0 15M15 3c2 5-2 8 0 13M20 3c1.5 4-1.5 7 0 11" stroke-linecap="round"/>`,
  barrage: `<circle cx="5" cy="6" r="1.3"/><circle cx="12" cy="5" r="1.3"/><circle cx="19" cy="6" r="1.3"/><circle cx="7" cy="12" r="1.3"/><circle cx="14" cy="12" r="1.3"/><circle cx="20" cy="13" r="1.3"/><circle cx="5" cy="18" r="1.3"/><circle cx="12" cy="19" r="1.3"/><circle cx="18" cy="18" r="1.3"/>`,
  rainbow: `<path d="M4 19a8 8 0 0 1 16 0M7.5 19a4.5 4.5 0 0 1 9 0M2 19.5h20" stroke-linecap="round"/>`,
  mirage:  `<path d="M4 7c3-2.2 5-2.2 8 0s5 2.2 8 0M4 12.5c3-2.2 5-2.2 8 0s5 2.2 8 0M4 18c3-2.2 5-2.2 8 0s5 2.2 8 0" stroke-linecap="round"/>`,
  // --- スキル / 汎用 ---
  up:     `<path d="M12 20V5M5.5 11.5 12 5l6.5 6.5" stroke-linecap="round" stroke-linejoin="round"/>`,
  coin:   `<circle cx="12" cy="12" r="8.5"/><path d="M14.8 9.2a3.6 3.6 0 1 0 0 5.6" stroke-linecap="round"/>`,
  star:   `<path d="M12 3l2.7 5.8 6.3.7-4.7 4.3 1.3 6.2L12 16.9 6.4 20l1.3-6.2L3 9.5l6.3-.7z" stroke-linejoin="round"/>`,
  flame:  `<path d="M12 3c1 3.5 5 5.5 5 10a5 5 0 0 1-10 0c0-2 1-3.2 2-4.2.3 1.6 1 2.4 1.8 2.6C10.5 8.5 11 5.5 12 3z" stroke-linejoin="round"/>`,
  clock:  `<circle cx="12" cy="12" r="8.5"/><path d="M12 7v5l3.5 2" stroke-linecap="round"/>`,
  skull:  `<path d="M5 11a7 7 0 0 1 14 0c0 2.5-1 4-2.5 5v3h-9v-3C6 15 5 13.5 5 11z" stroke-linejoin="round"/><circle cx="9.3" cy="11.5" r="1.4"/><circle cx="14.7" cy="11.5" r="1.4"/><path d="M12 19v-2.5"/>`,
  eye:    `<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" stroke-linejoin="round"/><circle cx="12" cy="12" r="2.8"/>`,
  gem:    `<path d="M6.5 4h11L21.5 9.5 12 20.5 2.5 9.5z" stroke-linejoin="round"/><path d="M2.5 9.5h19M9 4 7.5 9.5 12 20.5l4.5-11L15 4"/>`,
  chest:  `<path d="M3.5 10.5V19h17v-8.5M3.5 10.5A4.5 4.5 0 0 1 8 6h8a4.5 4.5 0 0 1 4.5 4.5z" stroke-linejoin="round"/><path d="M3.5 10.5h17"/><rect x="10.3" y="9" width="3.4" height="4.4"/>`,
  book:   `<path d="M12 6.5C10 5 7 4.5 3.5 5v13c3.5-.5 6.5 0 8.5 1.5 2-1.5 5-2 8.5-1.5V5C17 4.5 14 5 12 6.5zM12 6.5v13" stroke-linejoin="round"/>`,
  ghost:  `<path d="M5.5 20.5V11a6.5 6.5 0 0 1 13 0v9.5l-2.2-2-2.1 2-2.2-2-2.2 2-2.1-2z" stroke-linejoin="round"/><circle cx="9.6" cy="11" r="1"/><circle cx="14.4" cy="11" r="1"/>`,
  warp:   `<path d="M3 12h2.5M8 12h2.5M13 12h7.5M16 7.5l4.5 4.5-4.5 4.5" stroke-linecap="round" stroke-linejoin="round"/>`,
  meteor: `<circle cx="8.5" cy="15.5" r="4.5"/><path d="M12 12l8.5-8.5M14.5 15 21 8.5M9 9.5 15.5 3" stroke-linecap="round"/>`,
  hole:   `<circle cx="12" cy="12" r="3" fill="currentColor" stroke="none"/><path d="M12 3.5a8.5 8.5 0 0 1 8.5 8.5M12 20.5A8.5 8.5 0 0 1 3.5 12M17.5 12a5.5 5.5 0 0 1-5.5 5.5M6.5 12A5.5 5.5 0 0 1 12 6.5" stroke-linecap="round"/>`,
  wave:   `<circle cx="12" cy="12" r="2"/><path d="M7.5 7.5a6.4 6.4 0 0 0 0 9M16.5 7.5a6.4 6.4 0 0 1 0 9M4.6 4.6a10.5 10.5 0 0 0 0 14.8M19.4 4.6a10.5 10.5 0 0 1 0 14.8" stroke-linecap="round"/>`,
  crown:  `<path d="M3.5 18.5h17M4 16 3 7l5 4 4-6.5L16 11l5-4-1 9z" stroke-linejoin="round"/>`,
  link:   `<rect x="2.5" y="8.5" width="9" height="7" rx="3.5"/><rect x="12.5" y="8.5" width="9" height="7" rx="3.5"/><path d="M8.5 12h7" stroke-linecap="round"/>`,
  turret: `<path d="M5 20h14M7 20l1.5-6h7L17 20" stroke-linejoin="round"/><rect x="8" y="8" width="8" height="6" rx="1"/><path d="M16 11h5.5" stroke-linecap="round"/>`,
  ship:   `<path d="M20.5 12 4.5 5l3 7-3 7z" stroke-linejoin="round"/>`,
  quake:  `<path d="M2.5 12h4l2-6 3.5 12 3-9 2 3h4.5" stroke-linecap="round" stroke-linejoin="round"/>`,
  bag:    `<path d="M8.5 7.5 7 4h10l-1.5 3.5M8.5 7.5h7c3 2.5 4.5 5.5 4.5 8.5 0 3-2 4.5-4.5 4.5h-7C6 20.5 4 19 4 16c0-3 1.5-6 4.5-8.5z" stroke-linejoin="round"/>`,
  hammer: `<path d="M14 4l6 6-2.5 2.5-6-6z" stroke-linejoin="round"/><path d="M12.5 8.5 3.5 17.5a1.4 1.4 0 0 0 2 2l9-9" stroke-linejoin="round"/>`,
  layers: `<path d="M12 3 3 8l9 5 9-5z" stroke-linejoin="round"/><path d="M3 12l9 5 9-5M3 16l9 5 9-5" stroke-linejoin="round"/>`,
  close:  `<path d="M6 6l12 12M18 6 6 18" stroke-linecap="round"/>`,
  bonelance: `<path d="M4.5 19.5 16.5 7.5"/><circle cx="4" cy="20" r="2.1"/><circle cx="6.8" cy="17.2" r="1.7"/><path d="M16.5 7.5 20 4l-.8 4.2-4.2.8z" stroke-linejoin="round"/>`,
  rootwhip: `<path d="M4 4c6.5 1.5 4.5 8 10.5 10 2.8 1 4.8.2 6-1.8"/><path d="M14.5 14 12 19M14.5 14l5.5 1.5M10.5 10.5 7.5 15" stroke-linecap="round"/>`,
  stalacdrop: `<path d="M4 3h16l-1.8 6.5-3-4-2.2 6-2.2-6-3 4z" stroke-linejoin="round"/><path d="M12 14.5c1.7 2.1 1.7 3.9 0 5-1.7-1.1-1.7-2.9 0-5z" stroke-linejoin="round"/>`,
  saltpalace: `<path d="M5 21V10.5L8 7.5l4 3.5 4-3.5 3 3V21z" stroke-linejoin="round"/><path d="M10 21v-4.5h4V21M12 4V2.5" stroke-linecap="round"/>`,
  geoderay: `<path d="M12 2.8 19 9l-2.6 9.5H7.6L5 9z" stroke-linejoin="round"/><path d="M5 9h14M12 2.8V9l-2.6 9.5M12 9l2.6 9.5" stroke-linejoin="round"/>`,
  magnetstorm: `<path d="M7 3v8a5 5 0 0 0 10 0V3"/><path d="M7 3h3.4v4H7zM13.6 3H17v4h-3.4z" stroke-linejoin="round"/><path d="M13.5 13.5 11 17h3l-2.5 4" stroke-linejoin="round"/>`,
  tombjudge: `<path d="M6 21.5V8.2A6.2 5.4 0 0 1 18 8.2v13.3z" stroke-linejoin="round"/><path d="M12 8v6.5M9.2 11h5.6" stroke-linecap="round"/>`,
  brimflame: `<path d="M12 2.8c1.2 4.2-3.2 5.8-3.2 9.4a5.2 5.2 0 0 0 10.4 0c0-2.1-1-3.7-2.1-5.2-.3 1.6-1 2.5-2.1 3.2.6-2.7-.5-5.8-3-7.6z" stroke-linejoin="round"/><path d="M3.5 21h17" stroke-linecap="round"/>`,
  stardustharvest: `<path d="M11 3l1.7 5L18 9.7l-5.3 1.7L11 16.5l-1.7-5.1L4 9.7 9.3 8z" stroke-linejoin="round"/><circle cx="18.5" cy="16.5" r="1.5"/><circle cx="5" cy="18" r="1.1"/><circle cx="20" cy="6" r="1"/>`,
  coreheart: `<path d="M12 20.5C6.2 16.2 3.6 12.8 3.6 9.4A4.7 4.7 0 0 1 12 6a4.7 4.7 0 0 1 8.4 3.4c0 3.4-2.6 6.8-8.4 11.1z" stroke-linejoin="round"/><circle cx="12" cy="11.5" r="2.3"/>`,
  fairybow: `<path d="M8.5 2.5c3.5 3.8 3.5 15.4 0 19"/><path d="M8.5 2.5v19"/><path d="M8.5 12H20M20 12l-3.6-2.2M20 12l-3.6 2.2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="5" cy="5" r="1.1"/>`,
  rainbowprism: `<path d="M12 4.5 19.5 19h-15z" stroke-linejoin="round"/><path d="M15.5 8.5a5.5 5.5 0 0 1 2.5 3.5M14 6a8.5 8.5 0 0 1 4 5" stroke-linecap="round"/>`,
  spirittree: `<circle cx="12" cy="7.5" r="4.5"/><path d="M12 12v4M12 16c-2.5 0-4 1-5.5 3M12 16c2.5 0 4 1 5.5 3M12 16v5" stroke-linecap="round"/>`,
  dreamcannon: `<path d="M5.5 20a4.2 4.2 0 1 1 .7-8.3A5.6 5.6 0 0 1 17.2 12 3.9 3.9 0 0 1 16.8 20z" stroke-linejoin="round"/><path d="M17.5 2.5h4l-4 4h4" stroke-linecap="round" stroke-linejoin="round"/>`,
  grimoire: `<path d="M5.5 4A1.6 1.6 0 0 1 7.1 2.5H19V19H7.2a1.7 1.7 0 0 0-1.7 1.7z" stroke-linejoin="round"/><path d="M5.5 17.3V21M19 19H9.5"/><circle cx="12.2" cy="9" r="2.5"/><path d="M12.2 6.5v-1M12.2 12.5v-1M9.7 9h-1M15.7 9h-1" stroke-linecap="round"/>`,
  chimerafang: `<path d="M6.5 3c.3 6.5 2.3 11.5 6 15.5C11.3 12 9.3 7 6.5 3z" stroke-linejoin="round"/><path d="M17.5 3c-.3 6.5-2.3 11.5-6 15.5" stroke-linejoin="round"/>`,
  chronorevolver: `<circle cx="12" cy="12" r="8.2"/><path d="M12 7.2V12l3.4 2" stroke-linecap="round" stroke-linejoin="round"/><path d="M12 1.5v2.2M12 20.3v2.2M1.5 12h2.2M20.3 12h2.2" stroke-linecap="round"/>`,
  seraph: `<path d="M12 2.8V15M12 15l-2.6 4.5M12 15l2.6 4.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M9.5 8C6.8 6 4.3 5.8 2.5 6.8c1.8 2.6 4.2 3.8 7 3.7M14.5 8c2.7-2 5.2-2.2 7-1.2-1.8 2.6-4.2 3.8-7 3.7" stroke-linejoin="round"/>`,
  demoncontract: `<rect x="5" y="2.8" width="14" height="18.4" rx="1.6"/><path d="M12 7.5l1.3 2.7 3 .4-2.2 2.1.6 3L12 14.2l-2.7 1.5.6-3-2.2-2.1 3-.4z" stroke-linejoin="round"/><path d="M8.5 18.5h7" stroke-linecap="round"/>`,
  novahalo: `<circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="6.6" stroke-dasharray="2.2 1.6"/><circle cx="12" cy="12" r="10"/><path d="M12 .8v2.6M12 20.6v2.6M.8 12h2.6M20.6 12h2.6" stroke-linecap="round"/>`,
  ragnameteor: `<circle cx="15.5" cy="15.5" r="4.6"/><path d="M12.2 12.2 3 3M15 10.6 8.6 4.2M10.6 15 4.2 8.6" stroke-linecap="round"/><circle cx="6" cy="18.5" r="1.4"/><circle cx="19.5" cy="5" r="1.2"/>`,
  galaxyedge: `<circle cx="12" cy="12" r="2.2"/><path d="M12 9.8C12 5 15.5 2.5 20 3M14.2 12c4.8 0 7.3 3.5 6.8 8M12 14.2c0 4.8-3.5 7.3-8 6.8M9.8 12C5 12 2.5 8.5 3 4" stroke-linecap="round"/>`,
  worldeater: `<circle cx="12" cy="12" r="3.6" fill="currentColor" stroke="none"/><ellipse cx="12" cy="12" rx="10" ry="4" transform="rotate(-25 12 12)"/><path d="M12 6.2a5.8 5.8 0 0 1 5.8 5.8M12 17.8A5.8 5.8 0 0 1 6.2 12" stroke-linecap="round"/>`,
  omegagenesis: `<path d="M5.5 19.5h4.2v-2.2a6.5 6.5 0 1 1 4.6 0v2.2h4.2" stroke-linejoin="round" stroke-linecap="round"/><path d="M12 2v2.4M3.5 5.5l1.7 1.7M20.5 5.5l-1.7 1.7" stroke-linecap="round"/>`,
  yggdrasil: `<circle cx="12" cy="4.6" r="2.3"/><path d="M12 6.9V12M12 9.5C9.3 9.5 7.4 8.2 6.8 6M12 9.5c2.7 0 4.6-1.3 5.2-3.5M12 12c-2.2 1.8-4.2 2.8-6.5 3.3M12 12c2.2 1.8 4.2 2.8 6.5 3.3M12 12v3.8c0 2-1 3.6-2.6 5.2M12 15.8c0 2 1 3.6 2.6 5.2" stroke-linecap="round"/>`,
};
const iconSVG = (name, cls) => `<svg class="${cls || ""}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7">${ICONS[name] || ""}</svg>`;
const iconBadge = (name, accent) =>
  `<div class="icon-badge" style="color:${accent};border-color:${accent};background:${accent}14">${iconSVG(name)}</div>`;

function slotsHTML(filled, max){
  let s = `<div class="slots">`;
  for (let i = 0; i < max; i++) s += `<span class="slot${i < filled ? " filled" : ""}"></span>`;
  return s + `</div>`;
}
const cardTop = (icon, accent, title, rightBadge, tagline) => `
  <div class="card-top">${iconBadge(icon, accent)}
    <div class="card-main">
      <div class="card-head"><h3>${title}</h3>${rightBadge || ""}</div>
      <div class="tagline" style="color:${accent}">${tagline}</div>
    </div>
  </div>`;
const chevSVG = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M5 9l7 7 7-7"/></svg>`;
const fmtX = v => v >= 100 ? fmt(v) : v >= 10 ? v.toFixed(1) : v.toFixed(2);
const fmtD = v => v >= 1000 ? fmt(v) : v >= 100 ? v.toFixed(0) : v.toFixed(1);
const pctUp = r => `+${r >= 10 ? fmt((r - 1) * 100) : Math.round((r - 1) * 100)}%`;

/* ---------- 素材チップ (DOM を作り直さずに所持数だけ更新できるよう data 属性を持つ) ---------- */
function matChip(k, need, small){
  const m = MAT[k], have = invOf(k), ok = have >= need;
  return `<span class="mat-chip${ok ? " ok" : " lack"}${small ? " sm" : ""}" data-mat="${k}" data-need="${need}" style="--mc:${m.color}" title="${m.name} ・ ${MAT_CATS[m.cat].name} ・ ${LAYERS[m.layer].name}"><i></i><span class="mc-name">${m.name}</span> <b data-invcount="${k}">${fmt(have)}</b><span class="mc-need">/${fmt(need)}</span><em class="mc-where">${LAYERS[m.layer].name}</em></span>`;   // 足りない間だけ「どこで採れるか」を出す (CSS で .ok のときは隠す)
}
const recipeChips = (rec, small) => `<div class="recipe">${Object.keys(rec).map(k => matChip(k, rec[k], small)).join("")}</div>`;
// コイン + 素材 の両方を見て買えるか
const canPay = (coins, mats) => state.coins >= coins && (!mats || invHas(mats));

/* ---------- 武器強化の「素材代用払い」 ----------
   強化のコイン部分は、その武器の製作レシピに使われている素材だけを 1個 = 1コイン として代用払いできる
   (素材を優先し、不足分だけコインで払う)。製作レシピに無い素材は、その武器の強化には1個も使えない。
   要求素材は先に差し引き、その購入では代用プールから除外する (二重計上しない)。
   代用素材はプール内で所持数の多い順に使い、同数なら素材の並び順 (MAT_KEYS) で安定させる。
   購入可否・買えない理由・支払い実行・内訳表示はすべてこのプラン計算を通す (二重実装しない) */
function matSubPlan(coins, mats, subMats){
  const req = mats || {};
  const plan = { subs: [], subTotal: 0, coinsPay: coins, short: 0, ok: false };
  if (!invHas(req)) return plan;   // 要求素材が揃っていない (coinsPay は名目値のまま)
  let rest = coins;
  if (rest > 0){
    const allow = subMats ? new Set(subMats) : null;   // 代用できるのは製作素材だけ (空配列 = 代用不可)
    const pool = [];
    for (let i = 0; i < MAT_KEYS.length; i++){
      const k = MAT_KEYS[i];
      if (allow && !allow.has(k)) continue;
      const free = invOf(k) - (req[k] || 0);
      if (free > 0) pool.push({ k, i, free, have: invOf(k) });
    }
    pool.sort((a, b) => b.have - a.have || a.i - b.i);   // 所持数降順 → 並び順で安定
    for (const p of pool){
      if (rest <= 0) break;
      const use = Math.min(p.free, rest);
      plan.subs.push({ k: p.k, n: use });
      plan.subTotal += use; rest -= use;
    }
  }
  plan.coinsPay = rest;
  plan.short = Math.max(0, rest - state.coins);   // コイン+代用素材でも足りない分
  plan.ok = plan.short === 0;                     // 実質所持 (コイン + 代用可能素材) で払えるか
  return plan;
}
// buyDef の結果からプランを引く (素材代用が効く購入 = 武器強化だけ。代用プールは d.subMats = 製作素材)
const matSubPlanFor = d => d && d.matSub ? matSubPlan(d.coins, d.mats, d.subMats) : null;
// 内訳表示: 「支払い: 石 132・木材 126 (258コイン分) + コイン 2,342」(代用が無い時は空文字)
// 使う素材は消費の多い順に3種まで名前を出す (強化ボタンの主表示と同じ素材が先頭に来る)
function matSubText(plan){
  if (!plan || plan.subTotal <= 0) return "";
  const subs = plan.subs.slice().sort((a, b) => b.n - a.n);
  let s = "支払い: " + subs.slice(0, 3).map(x => `${MAT[x.k].name} ${fmt(x.n)}`).join("・");
  if (subs.length > 3) s += ` 他${subs.length - 3}種`;
  s += ` (${fmt(plan.subTotal)}コイン分)`;
  if (plan.coinsPay > 0) s += ` + コイン ${fmt(plan.coinsPay)}`;
  return s;
}
const matSubHTML = dataBuy => `<span class="matsub-line" data-matsub="${dataBuy}">${matSubText(matSubPlanFor(buyDef(dataBuy)))}</span>`;

/* ---------- 武器強化ボタンのコスト表示 ----------
   代用払いが発生する時はコインアイコンだと「コインを払う」ように見えるので、
   主たる代用素材 (消費数が最大のもの) のアイコン + 消費数を主表示にする。
   複数種に渡る場合は「他n種」、混合払いは後ろにコインアイコン + 残額を併記し、
   全額素材払いならコインアイコンは一切出さない。詳細は .matsub-line の内訳行に任せる。
   data-upcost を付け、refreshAffordability で所持数の変化に合わせてライブ更新する */
function upCostHTML(d){
  const plan = matSubPlanFor(d);
  if (!plan || plan.subTotal <= 0) return costHTML(d ? d.coins : 0);
  const main = plan.subs.reduce((a, b) => b.n > a.n ? b : a);
  const m = MAT[main.k];
  let s = `<span class="cost${plan.subs.length > 1 || plan.coinsPay > 0 ? " has-more" : ""}"><span class="cp-mat"><i class="mat-dot" style="--mc:${m.color}" title="${m.name}"></i>${fmt(main.n)}</span>`;
  if (plan.subs.length > 1) s += `<span class="cost-more">他${plan.subs.length - 1}種</span>`;
  if (plan.coinsPay > 0) s += `<span class="cp-coin"><i class="coin-dot"></i>${fmt(plan.coinsPay)}</span>`;
  return s + "</span>";
}
const upCostSpan = (dataBuy, d) => `<span data-upcost="${dataBuy}">${upCostHTML(d)}</span>`;

/* ---------- 購入 / 製作の定義 ----------
   data-buy="kind:arg" ごとに { coins, mats, ok, apply } を返す。ボタンの有効化判定と実行の両方で使う */
function buyDefRaw(dataBuy){
  const [kind, arg] = dataBuy.split(":");
  switch (kind){
    case "craft": { const w = WEAPONS[arg]; if (!w) return null;
      return { coins:w.cost, mats:w.recipe, ok:!state.weaponsOwned[arg], apply(){
        state.weaponsOwned[arg] = true; state.crafted++;
        if (w.power > WEAPONS[state.weapon].power){ state.weapon = arg; clearBotWeapon(arg); }
        toast(`${w.name} を製作した`);
      } }; }
    case "equip": return { coins:0, ok:!!state.weaponsOwned[arg], apply(){ state.weapon = arg; clearBotWeapon(arg); } };
    case "wupgrade": if (!WEAPONS[arg]) return null;
      return { coins:WEAPON_UP_COST(arg), mats:WEAPON_UP_MATS(arg), matSub:true, subMats:Object.keys(WEAPONS[arg].recipe), ok:!!state.weaponsOwned[arg], apply(){ state.weaponLv[arg] = weaponLvOf(arg) + 1; } };
    case "bot":   return { coins:BOT_COST(state.bots), mats:BOT_RECIPE(state.bots), ok:state.bots < BOT_MAX, apply(){ state.bots++; syncBots(); } };
    case "coinbot": return { coins:COINBOT_COST(state.coinBots), mats:COINBOT_RECIPE(state.coinBots), ok:state.coinBots < COINBOT_MAX, apply(){ state.coinBots++; syncCoinBots(); } };
    case "bupgrade": return { coins:BOT_UP_COST(), mats:BOT_UP_MATS(), ok:state.bots > 0, apply(){ state.botLv++; } };
    case "botcore": { const lv = state.botCore || 0; if (lv >= BOT_CORE_MAX) return null;
      return { coins:BOT_CORE_COST(lv), mats:BOT_CORE_MATS[lv], ok:state.bots > 0, apply(){ state.botCore = lv + 1; } }; }
    case "botarmor": { const lv = state.botArmor || 0; if (lv >= BOT_ARMOR_MAX) return null;
      return { coins:BOT_ARMOR_COST(lv), mats:BOT_ARMOR_MATS[lv], ok:true, apply(){ state.botArmor = lv + 1; } }; }
    case "cbmod": { const m = CB_MODULES[arg]; if (!m) return null;
      return { coins:CB_COST(arg), mats:CB_MATS(arg), ok:state.coinBots > 0 && cbLv(arg) < m.max, apply(){ state.cbMod[arg] = cbLv(arg) + 1; syncCoinBots(); } }; }
  }
  return null;
}
const canBuy = d => {
  if (!d || !d.ok) return false;
  if (d.matSub) return matSubPlan(d.coins, d.mats, d.subMats).ok;   // 武器強化: 実質所持 (コイン+製作素材の代用分) で判定
  return canPay(d.coins, d.mats);
};
// 買えない理由 (ボット系タイルでボタンの下に赤字で出す。買える時は空文字)
const BUY_NEED = { bupgrade:"攻撃ボットが1機以上必要", botcore:"攻撃ボットが1機以上必要" };
function buyReason(dataBuy){
  const d = buyDef(dataBuy);
  if (!d || canBuy(d)) return "";
  if (!d.ok){
    if (dataBuy.startsWith("cbmod:")) return "回収ボットが1機以上必要";
    return BUY_NEED[dataBuy] || "条件を満たしていない";
  }
  if (d.matSub){
    // 武器強化: 要求素材が不足なら素材不足、そうでなければ実質所持 (コイン+製作素材換算) での不足分を出す
    if (d.mats) for (const k in d.mats){ const lack = d.mats[k] - invOf(k); if (lack > 0) return `${MAT[k].name} が不足 (あと ${fmt(lack)})`; }
    const p = matSubPlan(d.coins, d.mats, d.subMats);
    return `あと ${fmt(p.short)} コイン分たりない (コインか製作素材を集める)`;
  }
  if (state.coins < d.coins) return `コイン不足 (あと ${fmt(d.coins - state.coins)})`;
  if (d.mats) for (const k in d.mats){ const lack = d.mats[k] - invOf(k); if (lack > 0) return `${MAT[k].name} が不足 (あと ${fmt(lack)})`; }
  return "";
}
const buyReasonHTML = dataBuy => `<span class="buy-reason" data-buyreason="${dataBuy}">${buyReason(dataBuy)}</span>`;
// 採掘スキル: 製作・強化のコスト軽減を全ての購入定義に適用する
function buyDef(dataBuy){
  const d = buyDefRaw(dataBuy);
  if (!d) return d;
  if (d.mats){
    const f = (sk("e_master") ? 0.9 : 1) * (sk("e_master2") ? 0.9 : 1) * (sk("e_god") ? 0.8 : 1);
    if (f < 1){ const out = {}; for (const k in d.mats) out[k] = Math.max(1, Math.floor(d.mats[k] * f)); d.mats = out; }
  }
  if (d.coins && sk("e_design")) d.coins = Math.floor(d.coins * 0.9);
  return d;
}

/* ---------- サイドバー共通部品 (v91 リニューアル) ---------- */
// 文字入力中かどうか (検索欄に打った文字で自機が動いたり、T でツリーが開いたりしないように)
const isTypingTarget = e => { const t = e && e.target, tag = t && t.tagName; return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || !!(t && t.isContentEditable); };
const escAttr = s => String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
const searchSVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5 21 21"/></svg>`;
// 検索欄 (クリアボタン付き)。id ごとに input / compositionend を panels.js が拾う
const searchBoxHTML = (id, value, placeholder) =>
  `<label class="search${value ? " has-q" : ""}">${searchSVG}<input id="${id}" type="text" inputmode="search" enterkeyhint="search" placeholder="${placeholder}" value="${escAttr(value)}" autocomplete="off" spellcheck="false"><button type="button" class="search-x" data-clear="${id}" aria-label="検索をクリア">${iconSVG("close")}</button></label>`;
// セクション見出し (タイトル + 補足 + 右端の件数)
const secTitleHTML = (title, note, right) =>
  `<div class="sec-title"><b>${title}</b>${note ? `<span class="sec-note">${note}</span>` : ""}${right !== undefined && right !== null && right !== "" ? `<span class="sec-right">${right}</span>` : ""}</div>`;
// まとめ買い (×10 / 最大まで) の小ボタン
function bulkRowHTML(dataBuy){
  const dis = canBuy(buyDef(dataBuy)) ? "" : "disabled";
  return `<span class="bulk-row"><button class="mini-act" data-bulk="${dataBuy}" data-bulkn="10" ${dis} title="買える分だけ最大10回まとめて購入">×10</button><button class="mini-act" data-bulk="${dataBuy}" data-bulkn="max" ${dis} title="払える限り・上限までまとめて購入">MAX</button></span>`;
}
/* アクション行: 「何が・どう良くなって・いくらで買えるか」を1行で見せ、右端に主ボタンを1つだけ置く。
   おすすめ / 武器 / 攻撃ボット / 回収ボット の全タブで同じ文法を使う。
   o = { buy, icon, accent, title, lv, eff, label, go, bulk, maxed, maxedText, tip, mats } */
function actRowHTML(o){
  const d = o.maxed ? null : buyDef(o.buy), ok = !!d && canBuy(d);
  const cost = o.buy.startsWith("wupgrade:") ? upCostSpan(o.buy, d) : costHTML(d ? d.coins : 0);
  const tip = o.tip === undefined ? `buy:${o.buy}` : o.tip;
  const mats = o.mats !== undefined ? o.mats : d && d.mats;
  return `<div class="arow${ok ? " afford" : ""}${o.maxed ? " maxed" : ""}" style="--accent:${o.accent}"${tip ? ` data-tip="${tip}"` : ""}>
    <div class="ar-top">${iconBadge(o.icon, o.accent)}
      <div class="ar-main"><div class="ar-title"><span class="ar-name">${o.title}</span>${o.lv ? `<span class="lv-pill">${o.lv}</span>` : ""}</div>${o.eff ? `<div class="ar-eff">${o.eff}</div>` : ""}</div>
      ${o.maxed ? `<span class="max-pill">${o.maxedText || "MAX"}</span>` : `<button class="act-btn${o.go ? " go" : ""}" data-buy="${o.buy}" ${ok ? "" : "disabled"}><span class="ab-label">${o.label}</span>${cost}</button>`}
    </div>
    ${o.maxed ? "" : `${(mats && Object.keys(mats).length) || o.bulk ? `<div class="ar-foot">${mats ? recipeChips(mats, true) : "<span></span>"}${o.bulk ? bulkRowHTML(o.buy) : ""}</div>` : ""}${o.buy.startsWith("wupgrade:") ? matSubHTML(o.buy) : ""}${buyReasonHTML(o.buy)}`}
  </div>`;
}
