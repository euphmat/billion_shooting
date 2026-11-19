"use strict";
/* =========================================================
   ui.js - 右パネル: 工房 (クラフト) / 攻撃ボット (編成) / 回収ボット (装備) / 素材 (図鑑)
   HUD / 設定ポップアップ。アイコンは全てインラインSVG (線画・絵文字は使わない)
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
  return `<span class="mat-chip${ok ? " ok" : " lack"}${small ? " sm" : ""}" data-mat="${k}" data-need="${need}" style="--mc:${m.color}" title="${m.name} ・ ${MAT_CATS[m.cat].name} ・ ${LAYERS[m.layer].name}"><i></i><span class="mc-name">${m.name}</span> <b data-invcount="${k}">${fmt(have)}</b><span class="mc-need">/${fmt(need)}</span></span>`;
}
const recipeChips = (rec, small) => `<div class="recipe">${Object.keys(rec).map(k => matChip(k, rec[k], small)).join("")}</div>`;
// コイン + 素材 の両方を見て買えるか
const canPay = (coins, mats) => state.coins >= coins && (!mats || invHas(mats));

/* ---------- 武器強化の「素材代用払い」 ----------
   強化のコイン部分は、手持ち素材を 1個 = 1コイン として代用払いできる (素材を優先し、不足分だけコインで払う)。
   要求素材は先に差し引き、その購入では代用プールから除外する (二重計上しない)。
   代用素材は所持数の多い順に使い、同数なら素材の並び順 (MAT_KEYS) で安定させる。
   購入可否・買えない理由・支払い実行・内訳表示はすべてこのプラン計算を通す (二重実装しない) */
function matSubPlan(coins, mats){
  const req = mats || {};
  const plan = { subs: [], subTotal: 0, coinsPay: coins, short: 0, ok: false };
  if (!invHas(req)) return plan;   // 要求素材が揃っていない (coinsPay は名目値のまま)
  let rest = coins;
  if (rest > 0){
    const pool = [];
    for (let i = 0; i < MAT_KEYS.length; i++){
      const k = MAT_KEYS[i], free = invOf(k) - (req[k] || 0);
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
// buyDef の結果からプランを引く (素材代用が効く購入 = 武器強化だけ)
const matSubPlanFor = d => d && d.matSub ? matSubPlan(d.coins, d.mats) : null;
// 内訳表示: 「素材払い: ○○ ×n 他m種 = Xコイン分 + コイン Y」(代用が無い時は空文字)
function matSubText(plan){
  if (!plan || plan.subTotal <= 0) return "";
  const first = plan.subs[0];
  let s = `素材払い: ${MAT[first.k].name} ×${fmt(first.n)}`;
  if (plan.subs.length > 1) s += ` 他${plan.subs.length - 1}種`;
  s += ` = ${fmt(plan.subTotal)}コイン分`;
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
  let s = `<span class="cost"><i class="mat-dot" style="--mc:${m.color}" title="${m.name}"></i>${fmt(main.n)}`;
  if (plan.subs.length > 1) s += `<span class="cost-more">他${plan.subs.length - 1}種</span>`;
  if (plan.coinsPay > 0) s += `<i class="coin-dot"></i>${fmt(plan.coinsPay)}`;
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
      return { coins:WEAPON_UP_COST(arg), mats:WEAPON_UP_MATS(arg), matSub:true, ok:!!state.weaponsOwned[arg], apply(){ state.weaponLv[arg] = weaponLvOf(arg) + 1; } };
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
  if (d.matSub) return matSubPlan(d.coins, d.mats).ok;   // 武器強化: 実質所持 (コイン+代用素材) で判定
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
    // 武器強化: 要求素材が不足なら素材不足、そうでなければ実質所持 (コイン+全素材換算) での不足分を出す
    if (d.mats) for (const k in d.mats){ const lack = d.mats[k] - invOf(k); if (lack > 0) return `${MAT[k].name} が不足 (あと ${fmt(lack)})`; }
    const p = matSubPlan(d.coins, d.mats);
    return `コイン・素材が不足 (あと ${fmt(p.short)})`;
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

/* ---------- 工房: 装備 (全137種 / 9ステージ = 地層+衛星+小惑星) ---------- */
const tierOpen = {};   // ステージ見出しの開閉 (未操作なら自動)
// 「次に狙う装備」= 今の装備より強い未所持装備のうち、順番に3つ
function nextWeaponKeys(){
  const cur = WEAPONS[state.weapon];
  return WEAPON_KEYS.filter(k => !state.weaponsOwned[k] && WEAPONS[k].power > cur.power).slice(0, 3);
}
function weaponFeatTags(w){
  const t = [];
  if (w.frost) t.push("氷結"); if (w.acid) t.push("腐食"); if (w.radiation) t.push("放射"); if (w.shock) t.push("放電");
  if (w.matBonus) t.push("素材2倍"); if (w.coinMul) t.push(`コイン x${w.coinMul}`); if (w.xpMul) t.push(`XP x${w.xpMul}`);
  if (w.ap) t.push("徹甲"); if (w.exec) t.push("処刑"); if (w.burn) t.push("燃焼"); if (w.shatter) t.push("破砕");
  return t.map(x => `<span class="ftag">${x}</span>`).join("");
}
function weaponStatsHTML(k, w){
  const mul = weaponLvMul(k), cur = WEAPONS[state.weapon];
  const dps = weaponDPS(w) * mul, rel = (w.power * mul) / (cur.power * weaponLvMul(state.weapon));
  const cmp = k === state.weapon ? "" : rel > 1.0001 ? `<span class="sbadge up">▲ ${pctUp(rel)}</span>` : `<span class="sbadge down">▼ 弱い</span>`;
  const tags = weaponFeatTags(w);
  const pel = weaponPellets(k), pelBonus = pel - (w.pellets || 1);
  return `<div class="sbadges"><span class="sbadge main">${iconSVG("damage")}DPS <b>${fmtD(dps)}</b></span>${cmp}<span class="sbadge">${iconSVG("heavy")}1発 <b>x${fmtX(w.dmg * mul)}</b></span><span class="sbadge">${iconSVG("rapid")}<b>${w.rate}</b>/秒</span><span class="sbadge${w.yield > 1 ? "" : " dim"}">${iconSVG("coin")}<b>+${Math.round((w.yield - 1) * 100)}%</b></span>${pel > 1 ? `<span class="sbadge${pelBonus > 0 ? " up" : ""}">${iconSVG("spread")}<b>${pel}</b>発${pelBonus > 0 ? ` (+${pelBonus})` : ""}</span>` : ""}${w.move ? `<span class="sbadge">${iconSVG("wave")}${MOVE_INFO[w.move][0]}</span>` : ""}${w.mine ? `<span class="sbadge">${iconSVG("bomber")}設置爆弾</span>` : ""}${(w.targets || 1) > 1 ? `<span class="sbadge">${iconSVG("normal")}<b>${w.targets}</b>目標</span>` : ""}${tags}</div><div class="pbar${rel > 1.0001 ? " up" : ""}"><i style="width:${Math.max(3, Math.min(100, 50 * rel))}%"></i></div>${w.feat ? `<div class="feat-line">${w.feat}</div>` : ""}`;
}
function weaponCardHTML(k, w){
  const owned = state.weaponsOwned[k], eq = state.weapon === k, lv = weaponLvOf(k);
  const holder = state.botLoadout.indexOf(k), botHeld = owned && holder >= 0 && botWeaponAt(holder) === k;
  const dCraft = !owned ? buyDef("craft:" + k) : null, craftable = !!dCraft && canBuy(dCraft);
  const badge = (eq ? `<span class="badge solid">装備中</span>` : owned ? `<span class="badge dim">所持</span>` : craftable ? `<span class="badge go">製作可</span>` : `<span class="badge next-badge">NEXT</span>`) + (owned && lv > 0 ? `<span class="badge dim">Lv.${lv}</span>` : "") + (botHeld ? `<span class="badge dim">ボット${holder + 1}が使用中</span>` : "");
  let body;
  if (!owned){
    const d = dCraft;
    body = `${recipeChips(w.recipe)}
      <button class="buy-btn" data-buy="craft:${k}" ${canBuy(d) ? "" : "disabled"}><span>製作する</span>${costHTML(d.coins)}</button>`;
  } else {
    const d = buyDef("wupgrade:" + k);
    body = `<div class="sbadges" style="border-top:none;padding-top:0"><span class="sbadge">Lv <b>${lv} → ${lv + 1}</b></span><span class="sbadge up">威力 +8%</span></div>${recipeChips(d.mats, true)}${matSubHTML("wupgrade:" + k)}
      <div class="btn-row">${eq ? `<button class="buy-btn" disabled><span>装備中</span></button>` : `<button class="equip-btn" data-buy="equip:${k}">装備する</button>`}<button class="buy-btn" data-buy="wupgrade:${k}" ${canBuy(d) ? "" : "disabled"}><span>強化</span>${upCostSpan("wupgrade:" + k, d)}</button></div>`;
  }
  const m = w.mat ? MAT[w.mat] : null;
  return `<div class="card${eq ? " equipped-card" : ""}${craftable ? " craftable" : ""}" style="--accent:${w.accent}" title="${w.desc.replace(/"/g, "")}">
    ${cardTop(w.icon, w.accent, `<span class="wno">No.${String(w.no).padStart(2, "0")}</span>${w.name}`, badge, w.tag + (m ? ` ・ ${m.name}製` : ""))}
    ${weaponStatsHTML(k, w)}
    ${body}
  </div>`;
}
function weaponRowCompactHTML(k, w){
  const owned = state.weaponsOwned[k], eq = state.weapon === k;
  const rel = w.power / WEAPONS[state.weapon].power;
  let right;
  if (owned) right = eq ? `<span class="wr-state">装備中</span>` : `<button class="wr-btn" data-buy="equip:${k}">装備</button>`;
  else {
    const d = buyDef("craft:" + k), keys = Object.keys(w.recipe), have = keys.filter(mk => invOf(mk) >= w.recipe[mk]).length;
    right = `<span class="wr-mats" title="素材の揃い具合">${keys.map(mk => `<i style="background:${MAT[mk].color};opacity:${invOf(mk) >= w.recipe[mk] ? 1 : .25}"></i>`).join("")}</span>
      <button class="wr-btn buy" data-buy="craft:${k}" ${canBuy(d) ? "" : "disabled"}>${costHTML(d.coins)}</button>`;
  }
  const craftableRow = !owned && canBuy(buyDef("craft:" + k));
  return `<div class="wrow${owned ? " owned" : ""}${eq ? " eq" : ""}${craftableRow ? " craftable" : ""}" style="--accent:${w.accent}">
    ${iconBadge(w.icon, w.accent)}
    <div class="wr-main"><div class="wr-name"><span class="wno">No.${String(w.no).padStart(2, "0")}</span>${w.name}${owned && weaponLvOf(k) > 0 ? ` <span class="wr-lv">Lv.${weaponLvOf(k)}</span>` : ""}</div>
      <div class="wr-sub">${w.tag} ・ DPS x${fmtX(w.power)}${eq ? "" : rel > 1 ? ` <span class="up">${pctUp(rel)}</span>` : ""}${!owned ? ` ・ ${Object.keys(w.recipe).map(mk => MAT[mk].name).join("+")}` : ""}</div><div class="pbar mini${rel > 1 ? " up" : ""}"><i style="width:${Math.max(3, Math.min(100, 50 * rel))}%"></i></div></div>
    ${right}
  </div>`;
}
// 「次のおすすめ」: 作れるものがあればそれを、無ければ次の装備 (素材の進み具合つき)、全部持っていれば今の装備の強化
function pickNextKey(){
  const cur = WEAPONS[state.weapon];
  const cands = WEAPON_KEYS.filter(k => !state.weaponsOwned[k] && WEAPONS[k].power > cur.power);
  return cands.find(k => canBuy(buyDef("craft:" + k))) || cands[0] || null;
}
function nextActionHTML(nk){
  const cur = WEAPONS[state.weapon];
  if (!nk){
    const lv = weaponLvOf(state.weapon), d = buyDef("wupgrade:" + state.weapon);
    return `<div class="hero" style="--accent:${cur.accent}"><div class="hero-label">NEXT — 次のおすすめ</div>
      ${cardTop(cur.icon, cur.accent, cur.name, `<span class="badge solid">強化</span>`, cur.tag)}
      <div class="sbadges"><span class="sbadge">Lv <b>${lv} → ${lv + 1}</b></span><span class="sbadge up">威力 +8%</span></div>
      ${recipeChips(d.mats, true)}${matSubHTML("wupgrade:" + state.weapon)}
      <button class="buy-btn" data-buy="wupgrade:${state.weapon}" ${canBuy(d) ? "" : "disabled"}><span>強化する</span>${upCostSpan("wupgrade:" + state.weapon, d)}</button></div>`;
  }
  const w = WEAPONS[nk], d = buyDef("craft:" + nk), ok = canBuy(d), rel = w.power / cur.power;
  let got = 0, tot = 0;
  for (const mk in w.recipe){ tot += w.recipe[mk]; got += Math.min(invOf(mk), w.recipe[mk]); }
  const pct = tot ? Math.floor(100 * got / tot) : 100;
  return `<div class="hero${ok ? " ready" : ""}" style="--accent:${w.accent}"><div class="hero-label">NEXT — 次のおすすめ</div>
    ${cardTop(w.icon, w.accent, `<span class="wno">No.${String(w.no).padStart(2, "0")}</span>${w.name}`, ok ? `<span class="badge go">製作可</span>` : `<span class="badge dim">素材 ${pct}%</span>`, w.tag + (w.mat ? ` ・ ${MAT[w.mat].name}製` : ""))}
    <div class="sbadges"><span class="sbadge main">${iconSVG("damage")}DPS <b>${fmtD(weaponDPS(w))}</b></span><span class="sbadge up">▲ ${pctUp(rel)}</span><span class="sbadge">${iconSVG("heavy")}1発 <b>x${fmtX(w.dmg)}</b></span><span class="sbadge">${iconSVG("rapid")}<b>${w.rate}</b>/秒</span></div>
    <div class="pbar big"><i style="width:${pct}%"></i><span>素材 ${pct}%</span></div>
    ${recipeChips(w.recipe)}
    <button class="buy-btn" data-buy="craft:${nk}" ${ok ? "" : "disabled"}><span>製作する</span>${costHTML(d.coins)}</button></div>`;
}
/* ---------- 工房: 装備ブラウザ (検索・フィルター・ソート + タイル一覧と詳細ペイン) ---------- */
let wQuery = "", wFilter = "all", wSort = "no", wGroup = true, wSel = null;
function weaponSearchText(k){
  const w = WEAPONS[k];
  return (w.name + " " + w.tag + " " + (w.mat ? MAT[w.mat].name : "") + " " + Object.keys(w.recipe).map(mk => MAT[mk].name).join(" ") + " " + (w.feat || "") + " " + (w.desc || "")).toLowerCase();
}
function weaponListKeys(){
  let keys = WEAPON_KEYS.slice();
  if (wFilter === "craftable") keys = keys.filter(k => !state.weaponsOwned[k] && canBuy(buyDef("craft:" + k)));
  else if (wFilter === "owned") keys = keys.filter(k => state.weaponsOwned[k]);
  else if (wFilter === "unowned") keys = keys.filter(k => !state.weaponsOwned[k]);
  if (wQuery){ const q = wQuery.trim().toLowerCase(); if (q) keys = keys.filter(k => weaponSearchText(k).includes(q)); }
  if (wSort === "power") keys.sort((a, b) => WEAPONS[b].power - WEAPONS[a].power);
  else if (wSort === "dps") keys.sort((a, b) => weaponDPS(WEAPONS[b]) * weaponLvMul(b) - weaponDPS(WEAPONS[a]) * weaponLvMul(a));
  else if (wSort === "osusume") keys.sort((a, b) => {
    const rank = k => state.weaponsOwned[k] ? 2 : (canBuy(buyDef("craft:" + k)) ? 0 : 1);
    const ra = rank(a), rb = rank(b);
    if (ra !== rb) return ra - rb;
    return ra === 2 ? WEAPONS[b].power - WEAPONS[a].power : WEAPONS[a].power - WEAPONS[b].power;
  });
  else keys.sort((a, b) => WEAPONS[a].no - WEAPONS[b].no);
  return keys;
}
function weaponTileHTML(k){
  const w = WEAPONS[k], owned = state.weaponsOwned[k], eq = state.weapon === k;
  const craftable = !owned && canBuy(buyDef("craft:" + k));
  const rel = w.power / WEAPONS[state.weapon].power;
  const st = eq ? `<span class="wt-st eq">装備中</span>` : craftable ? `<span class="wt-st go">製作可</span>` : owned ? `<span class="wt-st own">Lv.${weaponLvOf(k)}</span>` : `<span class="wt-st dim">未所持</span>`;
  let act;
  if (!owned){ const d = buyDef("craft:" + k); act = `<button class="wr-btn buy" data-buy="craft:${k}" ${canBuy(d) ? "" : "disabled"}>製作 ${costHTML(d.coins)}</button>`; }
  else { const d = buyDef("wupgrade:" + k); act = `${eq ? "" : `<button class="wr-btn" data-buy="equip:${k}">装備</button>`}<button class="wr-btn buy" data-buy="wupgrade:${k}" data-tip="buy:wupgrade:${k}" ${canBuy(d) ? "" : "disabled"}>強化 ${upCostSpan("wupgrade:" + k, d)}</button>`; }
  return `<div class="wtile${eq ? " eq" : ""}${craftable ? " craftable" : ""}" style="--accent:${w.accent}" data-tip="weapon:${k}">
    <span class="wt-top"><span class="icon-badge sm" style="color:${w.accent};border-color:${w.accent};background:${w.accent}14">${iconSVG(w.icon)}</span><span class="wt-no">No.${String(w.no).padStart(2, "0")}</span>${st}</span>
    <span class="wt-name">${w.name}</span>
    <span class="wt-sub">DPS x${fmtX(w.power)}${!eq && rel > 1 ? ` <span class="up">${pctUp(rel)}</span>` : ""}</span>
    <span class="pbar mini${rel > 1 ? " up" : ""}"><i style="width:${Math.max(3, Math.min(100, 50 * rel))}%"></i></span>
    <span class="wt-act">${act}</span>
  </div>`;
}
/* ---------- 工房: 武器フィルタ (チップで一覧を絞り込む。状態は wFilter = UI 状態のみでセーブしない) ---------- */
const WFILTERS = [["all", "すべて"], ["unowned", "未製作のみ"], ["craftable", "製作可能のみ"], ["owned", "所持済みのみ"]];
function weaponFilterMatch(k, f){
  if (f === "unowned") return !state.weaponsOwned[k];
  if (f === "craftable") return !state.weaponsOwned[k] && canBuy(buyDef("craft:" + k));
  if (f === "owned") return !!state.weaponsOwned[k];
  return true;
}
function weaponFilterCounts(){
  const c = { all: WEAPON_KEYS.length, unowned: 0, craftable: 0, owned: 0 };
  for (const k of WEAPON_KEYS){
    if (state.weaponsOwned[k]) c.owned++;
    else { c.unowned++; if (canBuy(buyDef("craft:" + k))) c.craftable++; }
  }
  return c;
}
// 製作可能セットの指紋: 残高そのものではなく「作れる武器の集合」だけを見るので、
// 素材・コインが境界を跨いだ時だけ変わる。renderPanels の署名に入れてフィルタ表示を追従させる
function craftableSig(){
  let s = "";
  for (const k of WEAPON_KEYS) if (!state.weaponsOwned[k] && canBuy(buyDef("craft:" + k))) s += k + ",";
  return s;
}
const WFILTER_EMPTY = {
  unowned: "未製作の装備はない。全137種コンプリート！",
  craftable: "今すぐ製作できる装備はない。素材とコインを集めよう。",
  owned: "所持している装備はまだない。まずは1つ製作しよう。",
};
function craftPanelHTML(){
  const counts = weaponFilterCounts();
  let html = `<div class="panel-intro"><b>番号が大きいほど強い</b> (実効DPS +11.5%ずつ)。</div>
  <div class="filters wfilters">${WFILTERS.map(([f, label]) => `<button class="fchip${wFilter === f ? " on" : ""}" data-wfilter="${f}">${label} <span class="wf-n" data-wfcount="${f}">${counts[f]}</span></button>`).join("")}</div>`;
  let shown = 0;
  WEAPON_TIERS.forEach((t, ti) => {
    const all = WEAPON_KEYS.filter(k => WEAPONS[k].tier === ti);
    if (!all.length) return;
    const tk = all.filter(k => weaponFilterMatch(k, wFilter));
    if (!tk.length) return;   // フィルタで該当ゼロのステージは見出しごと隠す
    shown += tk.length;
    const have = all.filter(k => state.weaponsOwned[k]).length;
    const craftable = all.filter(k => !state.weaponsOwned[k] && canBuy(buyDef("craft:" + k))).length;
    html += `<div class="tier-head open static"><span class="th-no">STAGE ${ti + 1}</span><span class="th-name">${t.name}</span><span class="th-note">${t.note}</span>${craftable ? `<span class="th-craft" title="製作できる装備">${craftable}</span>` : ""}<span class="th-count">${have}/${all.length}</span></div><div class="wgrid">${tk.map(weaponTileHTML).join("")}</div>`;
  });
  if (!shown) html += `<p class="lo-empty">${WFILTER_EMPTY[wFilter] || "該当する装備はない。"}</p>`;
  return html;
}

/* ---------- 攻撃ボット: 製造 + 編成 (クリック or ドラッグで装備を渡す) ---------- */
let botSlotSel = -1;   // 選択中のスロット (-1 = なし)
// セクション見出し (工房の tier-head と同じ見た目)
function secHeadHTML(no, name, note, count, actions){
  return `<div class="tier-head open static"><span class="th-no">${no}</span><span class="th-name">${name}</span><span class="th-note">${note || ""}</span>${actions || ""}${count !== undefined && count !== null ? `<span class="th-count">${count}</span>` : ""}</div>`;
}
// ボットの作戦モード定義 (サマリ表示とセグメント部品で共有)
const BOT_MODES = [["follow", "追従モード", "自機についてきて、周りを掘る"], ["solo", "独立モード", "自機から離れて、自分の周りを掘り続ける"], ["explore", "探索モード", "ランダムな小惑星へ向かい、掘り尽くすまで採掘する"]];
const CB_MODES  = [["follow", "追従モード", "自機についてきて、近くのコインを拾う"], ["solo", "独立モード", "自機から離れて、ひたすらコインを拾い回る"], ["botfollow", "ボット追従モード", "攻撃ボット1台につき回収ボット1台がついて回る"]];
const modeNameOf = (modes, v) => (modes.find(m => m[0] === v) || modes[0])[1];
// ボットの作戦モード選択 (攻撃ボット / 回収ボット共通部品)
function botModeSegHTML(kind){
  const isBot = kind === "bot";
  const cur = isBot ? (state.botMode || "follow") : (state.cbMode || "follow");
  const modes = isBot ? BOT_MODES : CB_MODES;
  return `<div class="mode-label">作戦モード — ${isBot ? "攻撃ボット全機の行動パターン" : "回収ボット全機の行動パターン"}</div>
    <div class="mode-grid" style="margin-bottom:12px">${modes.map(([v, name, desc]) => `<button class="mode-btn${cur === v ? " on" : ""}" data-${isBot ? "bmode" : "cbmode"}="${v}"><span class="mb-name">${name}</span><span class="mb-desc">${desc}</span></button>`).join("")}</div>`;
}
function botPanelHTML(){
  const n = state.bots, full = n >= BOT_MAX, dBuy = buyDef("bot"), dUp = buyDef("bupgrade");
  const total = botCount();
  let equippedN = 0; for (let i = 0; i < total; i++) if (botWeaponAt(i)) equippedN++;
  const spareN = WEAPON_KEYS.filter(k => state.weaponsOwned[k] && k !== state.weapon).length;
  let html = `<div class="panel-intro"><b>余った装備を持たせる</b>と、その撃ち方で戦う相棒。</div>
    ${total > 0 ? `<button class="eq-open-btn" data-boteq-open>${iconBadge("bot", "#ffffff")}<span class="eqb-main"><span class="eqb-title">装備を編成する</span><span class="eqb-sub">ボットに武器を持たせる ・ 装備済み ${equippedN}/${total}機 ・ 棚に ${spareN}点</span></span><span class="eqb-arrow">›</span></button>` : ""}
    <div class="fleet-bar" style="--accent:#ffffff">
      ${iconBadge("bot", "#ffffff")}
      <div class="fb-main"><div class="fb-name">攻撃ボット <span class="fb-count">${n}<span class="count-max"> / ${BOT_MAX}</span></span></div>
      <div class="fb-sub">稼働 <b>${botCount()}</b> 機 ・ 合計DPS <b>${fmtD(botsTotalDPS())}</b> ・ モード <b>${modeNameOf(BOT_MODES, state.botMode || "follow")}</b></div></div>
      <div class="fb-side"><span class="fb-lv">強化 Lv.${state.botLv}</span><span class="fb-mul">x${botMul().toFixed(2)}</span></div>
    </div>
    ${crewToggleHTML("bots")}
    ${botModeSegHTML("bot")}
    ${secHeadHTML("SHOP", "製造・強化", "ボットを増やし、強くする", `${n}/${BOT_MAX}`)}
    <div class="wgrid">
      <div class="btile${canBuy(dBuy) ? " afford" : ""}" style="--accent:#ffffff" data-tip="buy:bot">
        <span class="wt-top">${iconBadge("bot", "#ffffff")}<span class="wt-no">MANUFACTURE</span>${full ? `<span class="wt-st dim">最大数</span>` : `<span class="wt-st go">${n + 1}機目</span>`}</span>
        <span class="wt-name">${full ? "製造は上限です" : "攻撃ボットを製造"}</span>
        ${full ? `<span class="wt-sub">上限 ${BOT_MAX} 機に到達。スキルで増える分は別枠。</span>` : `<span class="wt-sub gain-line">製造すると 合計DPS +${fmtD(botSlotDPS(n))} (新しい1機のぶん)</span>${recipeChips(dBuy.mats, true)}<span class="wt-act"><button class="wr-btn buy" data-buy="bot" ${canBuy(dBuy) ? "" : "disabled"}>製造 ${costHTML(dBuy.coins)}</button></span>${bulkRowHTML("bot")}${buyReasonHTML("bot")}`}
      </div>
      <div class="btile${canBuy(dUp) ? " afford" : ""}" style="--accent:#ffffff" data-tip="buy:bupgrade">
        <span class="wt-top">${iconBadge("up", "#ffffff")}<span class="wt-no">UPGRADE</span><span class="wt-st own">Lv.${state.botLv}</span></span>
        <span class="wt-name">攻撃ボット強化</span>
        <span class="wt-sub">Lv.${state.botLv} → ${state.botLv + 1} ・ 全ボットの威力 +12%</span>
        <span class="wt-sub">倍率 <b>x${(1 + 0.12 * state.botLv).toFixed(2)} → x${(1 + 0.12 * (state.botLv + 1)).toFixed(2)}</b>${n > 0 ? ` ・ 合計DPS <b>${fmtD(botsTotalDPS())} → ${fmtD(botsTotalDPS() * (1 + 0.12 * (state.botLv + 1)) / (1 + 0.12 * state.botLv))}</b>` : ""}</span>
        ${recipeChips(dUp.mats, true)}
        <span class="wt-act"><button class="wr-btn buy" data-buy="bupgrade" ${canBuy(dUp) ? "" : "disabled"}>強化 ${costHTML(dUp.coins)}</button></span>${bulkRowHTML("bupgrade")}${buyReasonHTML("bupgrade")}
      </div>
    </div>`
    + satTechHTML();
  return html;
}
function satTechTileHTML(title, icon, lv, max, effNow, effNext, d, kind){
  const maxed = lv >= max;
  return `<div class="btile${!maxed && canBuy(d) ? " afford" : ""}" style="--accent:#fff2b0" data-tip="buy:${kind}">
    <span class="wt-top">${iconBadge(icon, "#fff2b0")}<span class="wt-no">SAT TECH</span>${maxed ? `<span class="wt-st eq">MAX</span>` : `<span class="wt-st own">Lv.${lv}</span>`}</span>
    <span class="wt-name">${title}</span>
    <span class="pbar mini"><i style="width:${lv / max * 100}%"></i></span>
    <span class="wt-sub">${effNow}${maxed ? "" : ` <span class="arrow">→</span> ${effNext}`}</span>
    ${maxed ? `<span class="wt-sub">最大レベルに到達</span>` : `${recipeChips(d.mats, true)}<span class="wt-act"><button class="wr-btn buy" data-buy="${kind}" ${canBuy(d) ? "" : "disabled"}>開発 ${costHTML(d.coins)}</button></span>${bulkRowHTML(kind)}${buyReasonHTML(kind)}`}
  </div>`;
}
function satTechHTML(){
  const core = state.botCore || 0, armor = state.botArmor || 0;
  return secHeadHTML("SAT", "衛星テクノロジー", "衛星惑星の素材で、ボットと自機を強化", `${core + armor}/${BOT_CORE_MAX + BOT_ARMOR_MAX}`)
    + `<div class="wgrid">
      ${satTechTileHTML("衛星兵装コア", "star", core, BOT_CORE_MAX, `攻撃ボットの威力 +${core * 25}%`, `+${(core + 1) * 25}%`, buyDef("botcore"), "botcore")}
      ${satTechTileHTML("衛星装甲プレート", "layers", armor, BOT_ARMOR_MAX, `自機の被ダメージ -${armor * 4}%`, `-${(armor + 1) * 4}%`, buyDef("botarmor"), "botarmor")}
    </div>`;
}
function botTileHTML(i, maxDps){
  const k = botWeaponAt(i), w = k ? WEAPONS[k] : null, extra = i >= state.bots, dps = botSlotDPS(i);
  return `<div class="btile bot-tile${k ? " has" : " none"}${botSlotSel === i ? " sel" : ""}${eqFlash && eqFlash.i === i ? " flash" : ""}" data-slot="${i}" style="--accent:${w ? w.accent : "#666"}" data-tip="bot:${i}">
    <span class="wt-top"><span class="bt-no">${i + 1}</span>${extra ? `<span class="wt-st dim">スキル追加</span>` : ""}${botSlotSel === i ? `<span class="wt-st eq">選択中</span>` : ""}${k ? `<button class="bt-x" data-unequip="${i}" title="デフォルト砲に戻す">${iconSVG("close")}</button>` : ""}</span>
    <span class="bt-wrow">${w ? iconBadge(w.icon, w.accent) : `<span class="icon-badge sm" style="color:#888;border-color:#444;background:#44444414">${iconSVG("bot")}</span>`}<span class="wt-name">${w ? w.name : "未装備（デフォルト砲）"}</span></span>
    <span class="bt-dps">DPS ${fmtD(dps)}${w && weaponLvOf(k) > 0 ? `<span class="bt-lv">武器Lv.${weaponLvOf(k)}</span>` : ""}</span>
    ${w ? "" : `<span class="wt-sub">下の棚の装備を割り当てると、もっと強くなる</span>`}
    <span class="pbar mini"><i style="width:${maxDps > 0 ? Math.max(3, Math.round(dps / maxDps * 100)) : 0}%"></i></span>
  </div>`;
}
/* ---------- 攻撃ボットの装備モーダル ----------
   ボット画面の「装備を編成する」ボタンで開く別モーダル (artOverlay 等と同じ作法)。
   上 = ボットスロット一覧 / 下 = 武器グリッド。開いている間は game.js 側で一時停止する */
let botEqOpen = false;
let shelfSort = "rec";        // rec = おすすめ順 (空き優先 → DPS降順) / dps = DPS順 / name = 名前順
let shelfFreeOnly = false;    // 「空きのみ」フィルタ
let eqFlash = null;           // 装備直後のフィードバック { i, k } (スロットと武器を一時的に光らせる)
// その武器を実際に持っているボットの番号 (持たれていなければ -1)
const shelfHolder = k => { const h = state.botLoadout.indexOf(k); return h >= 0 && botWeaponAt(h) === k ? h : -1; };
function eqShelfTileHTML(k, base, baseLabel, selIdx){
  const w = WEAPONS[k], holder = shelfHolder(k), held = holder >= 0, dps = botWeaponDPS(k), lv = weaponLvOf(k);
  const rel = base > 0 ? dps / base : 1, mine = held && holder === selIdx;
  return `<div class="btile shelf-tile eq-tile${held ? " held" : ""}${eqFlash && eqFlash.k === k ? " flash" : ""}" draggable="true" data-shelf="${k}" style="--accent:${w.accent}" data-tip="weapon:${k}">
    <span class="wt-top">${iconBadge(w.icon, w.accent)}<span class="wt-no">${w.tag}</span>${held ? `<span class="wt-st ${mine ? "eq" : "dim"}">${mine ? "装備中" : `ボット${holder + 1} 装備中`}</span>` : `<span class="wt-st go">空き</span>`}</span>
    <span class="wt-name" title="${w.name}">${w.name}</span>
    <span class="bt-dps">DPS ${fmtD(dps)}${lv > 0 ? `<span class="bt-lv">武器Lv.${lv}</span>` : ""}</span>
    <span class="wt-sub"><span class="${rel >= 1 ? "up" : "down"}">${rel >= 1 ? "+" : ""}${Math.round((rel - 1) * 100)}%</span> <span class="shelf-base">${baseLabel}</span></span>
    <span class="pbar mini${rel > 1 ? " up" : ""}"><i style="width:${Math.max(3, Math.min(100, 50 * rel))}%"></i></span>
  </div>`;
}
function botEqHTML(){
  const total = botCount();
  if (!total) return `<p class="lo-empty">攻撃ボットがまだいない。工房の「攻撃ボット」タブで製造すると、ここで装備を持たせられる。</p>`;
  let maxDps = 0;
  for (let i = 0; i < total; i++) maxDps = Math.max(maxDps, botSlotDPS(i));
  const slots = Array.from({ length: total }, (_, i) => botTileHTML(i, maxDps)).join("");
  let spare = WEAPON_KEYS.filter(k => state.weaponsOwned[k] && k !== state.weapon);
  const def = botDefaultDPS();
  const canAuto = spare.some(k => botWeaponDPS(k) > def);
  const sel = botSlotSel >= 0 && botSlotSel < total ? botSlotSel : -1;
  const base = sel >= 0 ? botSlotDPS(sel) : def;
  const baseLabel = sel >= 0 ? `ボット${sel + 1}の現在比` : "デフォルト砲比";
  const allSpare = spare.length;
  if (shelfFreeOnly) spare = spare.filter(k => shelfHolder(k) < 0);
  if (shelfSort === "dps") spare.sort((a, b) => botWeaponDPS(b) - botWeaponDPS(a));
  else if (shelfSort === "name") spare.sort((a, b) => WEAPONS[a].name.localeCompare(WEAPONS[b].name, "ja") || WEAPONS[a].no - WEAPONS[b].no);
  else spare.sort((a, b) => (shelfHolder(a) >= 0) - (shelfHolder(b) >= 0) || botWeaponDPS(b) - botWeaponDPS(a));
  const guide = eqFlash ? `<div class="eq-guide done">ボット${eqFlash.i + 1} に「${WEAPONS[eqFlash.k].name}」を装備した</div>`
    : sel >= 0 ? `<div class="eq-guide">ボット${sel + 1} を選択中 — 下の武器を${TAP}すると装備する。もう一度ボットを${TAP}すると選択解除</div>`
    : `<div class="eq-guide">ボットを${TAP}で選んで、武器を${TAP}で装備。選ばずに武器を${TAP}すると、空きスロット → 一番弱いボットの順で自動で入る</div>`;
  return guide
    + `<div class="eq-sec"><b>ボットスロット</b><span>合計DPS ${fmtD(botsTotalDPS())} ・ ${total}機</span></div>`
    + `<div class="eq-grid eq-slots">${slots}</div>`
    + `<div class="lo-bar eq-bar"><button class="lo-act" data-bauto ${canAuto ? "" : "disabled"}>おまかせ編成<span>強い装備から自動で割り当て</span></button><button class="lo-act" data-bclear>全て外す<span>全機をデフォルト砲に戻す</span></button></div>`
    + `<div class="eq-sec"><b>武器の棚</b><span>${spare.length}点 表示 ・ %は${baseLabel}</span></div>`
    + `<div class="eq-toolbar"><span class="wlab">並び替え</span><button class="fchip${shelfSort === "rec" ? " on" : ""}" data-shelfsort="rec">おすすめ順</button><button class="fchip${shelfSort === "dps" ? " on" : ""}" data-shelfsort="dps">DPS順</button><button class="fchip${shelfSort === "name" ? " on" : ""}" data-shelfsort="name">名前順</button><span class="eq-wsp"></span><button class="fchip${shelfFreeOnly ? " on" : ""}" data-shelffree>空きのみ</button></div>`
    + (spare.length ? `<div class="eq-grid eq-shelf">${spare.map(k => eqShelfTileHTML(k, base, baseLabel, sel)).join("")}</div>`
      : `<p class="lo-empty">${allSpare ? "空きの武器はない (全部どれかのボットが装備中)。「空きのみ」を外すと全部見える。" : "持たせられる余り装備がまだない。工房で2つ目の装備を作ると、ここに並ぶ。"}</p>`);
}
function renderBotEq(){
  const el = $("botEqBody"); if (!el) return;
  el.innerHTML = botEqHTML();
  const total = botCount();
  let equippedN = 0; for (let i = 0; i < total; i++) if (botWeaponAt(i)) equippedN++;
  const c = $("botEqCount"); if (c) c.textContent = total ? `装備済み ${equippedN} / ${total}機` : "";
  if (eqFlash){ const f = eqFlash; setTimeout(() => { if (eqFlash === f){ eqFlash = null; if (botEqOpen) renderBotEq(); } }, 1200); }
}
function openBotEq(){
  botEqOpen = true;
  if (typeof setSheet === "function") setSheet(false);   // スマホではボトムシートを閉じてから出す
  renderBotEq();
  $("botEqOverlay").classList.add("open");
}
function closeBotEq(){ botEqOpen = false; eqFlash = null; $("botEqOverlay").classList.remove("open"); }
// パネル側とモーダル側の両方の見た目を最新にする
function refreshBotViews(){ renderPanels(true); if (botEqOpen) renderBotEq(); }
$("botEqClose").addEventListener("click", closeBotEq);
$("botEqOverlay").addEventListener("click", e => { if (e.target === $("botEqOverlay") || e.target === $("botEqBody")) closeBotEq(); });
window.addEventListener("keydown", e => { if (e.key === "Escape" && botEqOpen) closeBotEq(); });
/* ---------- 回収ボット: 製造 + モジュール ---------- */
function cbModTileHTML(k){
  const m = CB_MODULES[k], lv = cbLv(k), maxed = lv >= m.max, d = buyDef("cbmod:" + k);
  return `<div class="btile${lv > 0 ? " on" : ""}${!maxed && canBuy(d) ? " afford" : ""}" style="--accent:${m.accent}" data-tip="buy:cbmod:${k}">
    <span class="wt-top">${iconBadge(m.icon, m.accent)}<span class="wt-no">MODULE</span>${maxed ? `<span class="wt-st eq">MAX</span>` : `<span class="wt-st own">Lv.${lv}</span>`}</span>
    <span class="wt-name">${m.name}</span>
    <span class="pbar mini"><i style="width:${lv / m.max * 100}%"></i></span>
    <span class="wt-sub">${m.eff(lv)}${maxed ? "" : ` <span class="arrow">→</span> ${m.eff(lv + 1)}`}</span>
    ${maxed ? `<span class="wt-sub">最大レベルに到達</span>` : `${recipeChips(d.mats, true)}<span class="wt-act"><button class="wr-btn buy" data-buy="cbmod:${k}" ${canBuy(d) ? "" : "disabled"}>${lv ? "強化" : "組み込む"} ${costHTML(d.coins)}</button></span>${bulkRowHTML("cbmod:" + k)}${buyReasonHTML("cbmod:" + k)}`}
  </div>`;
}
function coinBotPanelHTML(){
  const n = state.coinBots, full = n >= COINBOT_MAX, dBuy = buyDef("coinbot");
  const fieldCoins = typeof coinsArr !== "undefined" ? coinsArr.length : 0;
  let html = `<div class="panel-intro">コインを拾う相棒。<b>モジュール</b>で伸びる。</div>
    <div class="fleet-bar" style="--accent:#ffd60a">
      ${iconBadge("coinbot", "#ffd60a")}
      <div class="fb-main"><div class="fb-name">コイン回収ボット <span class="fb-count">${n}<span class="count-max"> / ${COINBOT_MAX}</span></span></div>
      <div class="fb-sub">稼働 <b>${coinBotCount()}</b> 機 ・ 回収額 <b>x${(botCoinMul() * (sk("c_haul") ? 1.10 : 1)).toFixed(2)}</b> ・ モード <b>${modeNameOf(CB_MODES, state.cbMode || "follow")}</b></div></div>
      <div class="fb-side"><span class="fb-lv">場のコイン</span><span class="fb-mul">${fieldCoins}</span></div>
    </div>
    <div class="sbadges"><span class="sbadge">${iconSVG("speed")}速度 <b>${Math.round(coinBotSpeed())}</b></span><span class="sbadge">${iconSVG("magnet")}吸引 <b>${Math.round(coinBotVacuum())}</b></span><span class="sbadge">${iconSVG("bag")}接触 <b>${Math.round(coinBotTouchR())}</b></span></div>
    ${crewToggleHTML("coinBots")}
    ${botModeSegHTML("coinbot")}
    ${secHeadHTML("SHOP", "製造", "回収ボットを増やす", `${n}/${COINBOT_MAX}`)}
    <div class="wgrid">
      <div class="btile${canBuy(dBuy) ? " afford" : ""}" style="--accent:#ffd60a" data-tip="buy:coinbot">
        <span class="wt-top">${iconBadge("coinbot", "#ffd60a")}<span class="wt-no">MANUFACTURE</span>${full ? `<span class="wt-st dim">最大数</span>` : `<span class="wt-st go">${n + 1}機目</span>`}</span>
        <span class="wt-name">${full ? "製造は上限です" : "回収ボットを製造"}</span>
        ${full ? `<span class="wt-sub">上限 ${COINBOT_MAX} 機に到達。スキルやモジュールで増える分は別枠。</span>` : `<span class="wt-sub gain-line">製造すると 稼働 ${coinBotCount()} → ${coinBotCount() + 1} 機</span>${recipeChips(dBuy.mats, true)}<span class="wt-act"><button class="wr-btn buy" data-buy="coinbot" ${canBuy(dBuy) ? "" : "disabled"}>製造 ${costHTML(dBuy.coins)}</button></span>${bulkRowHTML("coinbot")}${buyReasonHTML("coinbot")}`}
      </div>
      <div class="btile" style="--accent:#ffd60a">
        <span class="wt-top">${iconBadge("coin", "#ffd60a")}<span class="wt-no">STATUS</span></span>
        <span class="wt-name">回収の状況</span>
        <span class="wt-sub">場のコイン <b>${fieldCoins}</b> 枚 ・ 稼働 <b>${coinBotCount()}</b> 機</span>
        <span class="wt-sub">1機の吸引範囲 <b>${Math.round(coinBotVacuum())}</b> ・ 接触 <b>${Math.round(coinBotTouchR())}</b></span>
        <span class="wt-sub">モジュールで吸引・速度・回収額が伸びる</span>
      </div>
    </div>
    ${secHeadHTML("MODULE", "モジュール", "回収ボットが1機以上いると組み込める", `${CB_MOD_KEYS.filter(k => cbLv(k) > 0).length}/${CB_MOD_KEYS.length}`)}
    <div class="wgrid">${CB_MOD_KEYS.map(cbModTileHTML).join("")}</div>`;
  return html;
}
/* ---------- 素材: 図鑑 / 所持数 ---------- */
let matFilter = "all", matSel = null, matOwnedOnly = false;
function matUses(k){   // この素材を使うレシピ
  const out = [];
  for (const wk of WEAPON_KEYS) if (WEAPONS[wk].recipe[k]) out.push({ name:WEAPONS[wk].name, color:WEAPONS[wk].accent, kind:"装備" });
  BOT_MATS.forEach((r, i) => { if (r[k]) out.push({ name:`攻撃ボット ${i + 1}機目`, color:"#fff", kind:"製造" }); });
  COINBOT_MATS.forEach((r, i) => { if (r[k]) out.push({ name:`回収ボット ${i + 1}機目`, color:"#ffd60a", kind:"製造" }); });
  for (const mk of CB_MOD_KEYS) if (CB_MODULES[mk].mats[k]) out.push({ name:CB_MODULES[mk].name, color:CB_MODULES[mk].accent, kind:"モジュール" });
  if (BOT_UP_MATS_LIST.includes(k)) out.push({ name:"攻撃ボット強化", color:"#fff", kind:"強化" });
  return out;
}
// ゲーム画面のブロックをクリックした時などに、素材タブでその素材を開く
function openMaterial(key){
  if (!MAT[key]) return;
  state.seen[key] = true;
  matSel = key; matFilter = "all"; matOwnedOnly = false;
  activeTab = "items";
  document.querySelectorAll("#tabs button").forEach(x => x.classList.toggle("active", x.dataset.tab === "items"));
  document.querySelectorAll(".panel").forEach(p => p.classList.toggle("active", p.id === "panel-items"));
  renderPanels(true);
  $("panels").scrollTop = 0;
}
// この素材を「今すぐ」使える購入先 (武器の製作/強化、ボット製造/強化、モジュール、衛星テク)
function matUseActions(k){
  const rows = [];
  for (const wk of WEAPON_KEYS){
    const w = WEAPONS[wk];
    if (!state.weaponsOwned[wk] && w.recipe[k]) rows.push({ icon: w.icon, color: w.accent, name: w.name, kind: "武器の製作", need: w.recipe[k], buy: "craft:" + wk, label: "製作" });
    else if (state.weaponsOwned[wk]){
      const d = buyDef("wupgrade:" + wk);
      if (d && d.mats && d.mats[k]) rows.push({ icon: w.icon, color: w.accent, name: w.name, kind: "武器の強化", need: d.mats[k], buy: "wupgrade:" + wk, label: "強化", equip: wk });
    }
  }
  const botD = buyDef("bot"); if (botD && botD.mats && botD.mats[k]) rows.push({ icon: "hammer", color: "#ffffff", name: `攻撃ボット ${state.bots + 1}機目`, kind: "ボット製造", need: botD.mats[k], buy: "bot", label: "製造" });
  const cbD = buyDef("coinbot"); if (cbD && cbD.mats && cbD.mats[k]) rows.push({ icon: "coin", color: "#ffd60a", name: `回収ボット ${state.coinBots + 1}機目`, kind: "ボット製造", need: cbD.mats[k], buy: "coinbot", label: "製造" });
  const buD = buyDef("bupgrade"); if (buD && buD.mats && buD.mats[k]) rows.push({ icon: "up", color: "#ffffff", name: "攻撃ボット強化", kind: `現在 Lv.${state.botLv}`, need: buD.mats[k], buy: "bupgrade", label: "強化" });
  const bcD = buyDef("botcore"); if (bcD && bcD.mats && bcD.mats[k]) rows.push({ icon: "star", color: "#7df0ff", name: "衛星兵装コア", kind: `現在 Lv.${state.botCore || 0}`, need: bcD.mats[k], buy: "botcore", label: "強化" });
  const baD = buyDef("botarmor"); if (baD && baD.mats && baD.mats[k]) rows.push({ icon: "layers", color: "#a8c8ff", name: "衛星装甲プレート", kind: `現在 Lv.${state.botArmor || 0}`, need: baD.mats[k], buy: "botarmor", label: "強化" });
  for (const mk of CB_MOD_KEYS){
    const d = buyDef("cbmod:" + mk);
    if (d && d.mats && d.mats[k]) rows.push({ icon: CB_MODULES[mk].icon || "bag", color: CB_MODULES[mk].accent, name: CB_MODULES[mk].name, kind: `モジュール Lv.${cbLv(mk)}`, need: d.mats[k], buy: "cbmod:" + mk, label: "強化" });
  }
  return rows;
}
function matDetailHTML(m){
  const seen = !!state.seen[m.key], uses = matUses(m.key);
  const cat = MAT_CATS[m.cat];
  return `<div class="card mat-detail" style="--accent:${m.color}">
    <div class="card-top"><div class="mat-swatch big cat-${m.cat}" style="--mc:${m.color}"></div>
      <div class="card-main"><div class="card-head"><h3>${seen ? m.name : "？？？"}</h3><span class="badge dim">${RARITY_NAMES[matRarity(m)]}</span></div>
      <div class="tagline" style="color:${cat.color}">${cat.name} ・ ${LAYERS[m.layer].name}${m.explosive ? " ・ 爆発性" : ""}</div></div>
      <button class="icon-btn sm" data-matclose aria-label="閉じる">${iconSVG("close")}</button></div>
    <p>${seen ? (m.note || `${LAYERS[m.layer].name}で見つかる${cat.name}。`) : `まだ見つけていない。${LAYERS[m.layer].name}を掘ると出てくるはず。`}</p>
    <div class="effect-line">所持 <span class="next" data-invcount="${m.key}">${fmt(invOf(m.key))}</span> ・ 硬さ x${m.hard} ・ コイン x${m.coin}${m.xp > 1 ? ` ・ 経験値 x${m.xp}` : ""}</div>
    ${(() => {
      const rows = matUseActions(m.key), have = invOf(m.key);
      const covered = new Set(rows.map(r => r.name));
      const others = uses.filter(u => !covered.has(u.name));
      let out = "";
      if (rows.length) out += `<div class="recipe-head">使い道 — そのまま使える</div>` + rows.map(u => {
        const d = buyDef(u.buy), ok = canBuy(d);
        return `<div class="use-row" style="--accent:${u.color}">${iconBadge(u.icon, u.color)}<div class="ur-main"><div class="ur-name">${u.name}</div><div class="ur-sub">${u.kind} ・ ${m.name} x${u.need}</div></div><span class="ur-need${have >= u.need ? "" : " lack"}">所持 ${fmt(have)}</span>${u.equip && state.weapon !== u.equip ? `<button class="wr-btn" data-buy="equip:${u.equip}">装備</button>` : ""}<button class="buy-btn sm" data-buy="${u.buy}" ${ok ? "" : "disabled"}><span>${u.label}</span>${u.buy.startsWith("wupgrade:") ? upCostSpan(u.buy, d) : costHTML(d ? d.coins : 0)}</button></div>`;
      }).join("");
      if (others.length) out += `<div class="recipe-head">その他の使い道</div><div class="uses">${others.map(u => `<span class="use-chip" style="--mc:${u.color}"><i></i>${u.name}<em>${u.kind}</em></span>`).join("")}</div>`;
      return out || `<div class="sub">使い道: なし (売ることはできないが、集める楽しみはある)</div>`;
    })()}
  </div>`;
}
function itemsPanelHTML(){
  const found = MATS.filter(m => state.seen[m.key]).length;
  let html = `<div class="panel-intro">ブロックを壊すと手に入る素材、全<b>${MATS.length}種</b>。<b>ゲーム画面のブロックを${TAP}</b>すると、その素材の詳細と使い道がここに開くよ。</div>
    <div class="weapon-summary" style="--accent:#c792ff">
      <div><span class="ws-label">発見</span><b>${found}</b><span class="ws-dim"> / ${MATS.length}</span></div>
      <div><span class="ws-label">所持合計</span><b>${fmt(Object.values(state.inv).reduce((s, v) => s + v, 0))}</b></div>
      <div><span class="ws-label">採掘倍率</span><b>x${matDropMul().toFixed(2)}</b></div>
      <div><span class="ws-label">地層</span><b>${LAYERS[Math.max(0, layerIndexOf(blockDepth(w2g(player.x), w2g(player.y))))].name}</b></div>
    </div>
    <div class="filters">
      <button class="fchip${matFilter === "all" ? " on" : ""}" data-mfilter="all">全て</button>
      ${MAT_CAT_KEYS.map(c => `<button class="fchip${matFilter === c ? " on" : ""}" data-mfilter="${c}" style="--mc:${MAT_CATS[c].color}"><i></i>${MAT_CATS[c].name}</button>`).join("")}
      ${LAYERS.map((L, i) => `<button class="fchip${matFilter === "L" + i ? " on" : ""}" data-mfilter="L${i}">${L.name}</button>`).join("")}
      <button class="fchip${matOwnedOnly ? " on" : ""}" data-mowned>所持のみ</button>
    </div>`;
  if (matSel && MAT[matSel]) html += matDetailHTML(MAT[matSel]);
  const list = MATS.filter(m => (matFilter === "all" || matFilter === m.cat || matFilter === "L" + m.layer) && (!matOwnedOnly || invOf(m.key) > 0));
  html += `<div class="mat-grid">` + list.map(m => {
    const seen = !!state.seen[m.key], n = invOf(m.key);
    return `<button class="mat-tile${seen ? "" : " unknown"}${matSel === m.key ? " sel" : ""}" data-mat-tile="${m.key}" title="${seen ? m.name : "？？？"} ・ ${LAYERS[m.layer].name}">
      <span class="mat-swatch cat-${m.cat}" style="--mc:${seen ? m.color : "#333"}"></span>
      <span class="mt-name">${seen ? m.name : "？？？"}</span>
      <span class="mt-count" data-invcount="${m.key}">${seen ? fmt(n) : ""}</span></button>`;
  }).join("") + `</div>`;
  return html;
}

/* ---------- 共通部品 ---------- */
function crewToggleHTML(key){
  if (!(state[key] > 0)) return "";
  const on = !state.off[key];
  return `<div class="crew-toggle${on ? "" : " is-off"}"><span>${on ? "稼働中" : "停止中"}</span>
    <label class="switch"><input type="checkbox" data-crew="${key}" ${on ? "checked" : ""}><span class="slider"></span></label></div>`;
}

/* ---------- 装備バー: 現在の装備を WORKSHOP 上部に小さく表示 (その場で強化できる) ---------- */
let lastEquipHTML = "";
function equipBarHTML(){
  const k = state.weapon, w = WEAPONS[k], lv = weaponLvOf(k), d = buyDef("wupgrade:" + k);
  return `<div class="equip-bar" style="--accent:${w.accent}" data-tip="weapon:${k}">
    <span class="icon-badge sm" style="color:${w.accent};border-color:${w.accent};background:${w.accent}14">${iconSVG(w.icon)}</span>
    <div class="eb-main"><div class="eb-name">${w.name}${lv > 0 ? ` <span class="eb-lv">Lv.${lv}</span>` : ""}</div>
    <div class="eb-sub">DPS <b>${fmtD(weaponDPS(w) * weaponLvMul(k))}</b> ・ ${w.tag}</div></div>
    <button class="buy-btn sm" data-buy="wupgrade:${k}" ${d && canBuy(d) ? "" : "disabled"}><span>強化</span>${upCostSpan("wupgrade:" + k, d)}</button>
  </div>
  <div class="equip-mats">${d ? recipeChips(d.mats, true) + matSubHTML("wupgrade:" + k) : ""}</div>`;
}
$("equipBar").addEventListener("click", e => {
  const btn = e.target.closest("[data-buy]"); if (!btn || btn.disabled) return;
  doBuy(btn.dataset.buy);
});

/* ---------- panels ---------- */
let activeTab = "craft";
const PANEL_HTML = { craft:craftPanelHTML, bot:botPanelHTML, coinbot:coinBotPanelHTML, items:itemsPanelHTML };
const panelDirty = { craft:true, bot:true, coinbot:true, items:true };
let lastPanelSig = "";
let panelPointerDown = false, pendingPanelRender = false;
function renderPanels(force){
  if (!force && panelPointerDown){ pendingPanelRender = true; return; }
  // コイン残高・素材の所持数は署名に入れない (変わるたび全再構築するとボタンがチカチカして押せなくなる)。
  // 残高依存の表示は refreshAffordability() が DOM を作り替えずに更新する。
  const sig = [state.weapon, JSON.stringify(state.weaponsOwned), JSON.stringify(state.weaponLv), state.bots, state.coinBots, state.botLv,
    JSON.stringify(state.botLoadout), JSON.stringify(state.cbMod), JSON.stringify(state.off), state.lv, Object.keys(state.skills).length, Object.keys(state.seen).length,
    botSlotSel, matFilter, matSel, matOwnedOnly, JSON.stringify(tierOpen), wQuery, wFilter, wSort, wGroup, wSel, state.botMode, state.cbMode, craftableSig()].join("|");
  if (sig !== lastPanelSig){ lastPanelSig = sig; for (const k in panelDirty) panelDirty[k] = true; }
  else if (!force && !panelDirty[activeTab]) return;
  if (force) for (const k in panelDirty) panelDirty[k] = true;
  const el = $("panel-" + activeTab);
  const scrollTop = $("panels").scrollTop;
  el.innerHTML = PANEL_HTML[activeTab]();
  $("panels").scrollTop = scrollTop;
  panelDirty[activeTab] = false;
  updateAffordDots();
  affordCoins = state.coins; affordInv = invVersion;
  // --- header stats ---
  $("statDmg").textContent = fmtD(playerDamage() * globalDmgMul());
  $("statDps").textContent = fmt(totalDPS() * globalDmgMul());
  $("statCrew").textContent = botCount() + coinBotCount();
  $("statTotalCoins").textContent = fmt(state.totalCoins);
  const ebHtml = equipBarHTML();
  if (ebHtml !== lastEquipHTML){ lastEquipHTML = ebHtml; $("equipBar").innerHTML = ebHtml; }
}

/* ---------- affordability: 残高・素材だけが変わった時は DOM を作り替えない ---------- */
let invVersion = 0;   // 素材の所持数が変わるたびに増える (materials.js の invAdd / invTake から)
function updateAffordDots(){
  const afford = {
    craft: WEAPON_KEYS.some(k => canCraft(k)),
    bot:   canBuy(buyDef("bot")) || canBuy(buyDef("bupgrade")),
    coinbot: canBuy(buyDef("coinbot")) || CB_MOD_KEYS.some(k => canBuy(buyDef("cbmod:" + k))),
    items: false,
  };
  document.querySelectorAll("#tabs button").forEach(t => t.classList.toggle("has-afford", !!afford[t.dataset.tab]));
  const ms = $("mShop");   // スマホの「工房」ボタンにも同じ印を出す
  if (ms) ms.classList.toggle("has-afford", afford.craft || afford.bot || afford.coinbot);
}
let affordCoins = NaN, affordInv = -1;
function refreshAffordability(){
  if (state.coins === affordCoins && invVersion === affordInv) return;
  affordCoins = state.coins; affordInv = invVersion;
  for (const root of [$("panel-" + activeTab), $("equipBar")]){
    root.querySelectorAll("[data-buy]").forEach(btn => {
      const d = buyDef(btn.dataset.buy);
      if (d) btn.disabled = !canBuy(d);
      // 買えるタイルは光らせて「次に買うべきもの」を示す (ボット系タイルのみ)
      const tile = btn.closest(".btile");
      if (tile) tile.classList.toggle("afford", canBuy(d));
    });
    root.querySelectorAll("[data-bulk]").forEach(btn => {
      const d = buyDef(btn.dataset.bulk);
      btn.disabled = !canBuy(d);
    });
    root.querySelectorAll("[data-buyreason]").forEach(el => {
      const t = buyReason(el.dataset.buyreason);
      if (el._t !== t){ el._t = t; el.textContent = t; }
    });
    root.querySelectorAll("[data-matsub]").forEach(el => {
      const t = matSubText(matSubPlanFor(buyDef(el.dataset.matsub)));
      if (el._t !== t){ el._t = t; el.textContent = t; }
    });
    root.querySelectorAll("[data-upcost]").forEach(el => {
      const h = upCostHTML(buyDef(el.dataset.upcost));
      if (el._h !== h){ el._h = h; el.innerHTML = h; }
    });
    root.querySelectorAll(".mat-chip[data-mat]").forEach(ch => {
      const have = invOf(ch.dataset.mat), need = +ch.dataset.need;
      ch.classList.toggle("ok", have >= need); ch.classList.toggle("lack", have < need);
    });
    root.querySelectorAll("[data-invcount]").forEach(el => { const t = fmt(invOf(el.dataset.invcount)); if (el._t !== t){ el._t = t; el.textContent = t; } });
  }
  updateAffordDots();
}
$("panels").addEventListener("pointerdown", () => { panelPointerDown = true; });
window.addEventListener("pointerup", () => {
  panelPointerDown = false;
  if (pendingPanelRender){ pendingPanelRender = false; renderPanels(true); }
});

/* ---------- tabs ---------- */
document.querySelectorAll("#tabs button").forEach(b => b.addEventListener("click", () => {
  activeTab = b.dataset.tab;
  document.querySelectorAll("#tabs button").forEach(x => x.classList.toggle("active", x === b));
  document.querySelectorAll(".panel").forEach(p => p.classList.toggle("active", p.id === "panel-" + activeTab));
  renderPanels(true);
}));

/* ---------- 購入 / 製作 / 強化 ---------- */
// 直近の購入で素材代用払いした内訳 (購入フィードバック表示用)
let lastMatSubPlan = null;
// 検証済みの1回分を適用するだけ (保存・再描画・音はしない)。まとめ買いはこれを繰り返す
// 武器強化は呼び出しのたびに matSubPlan を引き直すので、まとめ買いでも素材の減り方が正しく反映される
function applyBuy(dataBuy){
  const d = buyDef(dataBuy);
  if (!canBuy(d)) return false;
  const before = state.coins;
  lastMatSubPlan = matSubPlanFor(d);
  if (lastMatSubPlan){
    state.coins -= lastMatSubPlan.coinsPay;                 // 不足分だけコインで払う
    if (d.mats) invTake(d.mats);                            // 要求素材 (代用プールから除外済み)
    if (lastMatSubPlan.subTotal > 0){ const subRec = {}; for (const s of lastMatSubPlan.subs) subRec[s.k] = s.n; invTake(subRec); }
  } else {
    state.coins -= d.coins;
    if (d.mats) invTake(d.mats);
  }
  if (d.mats && sk("e_recycle")) for (const k in d.mats) if (Math.random() < 0.2) invAdd(k, Math.ceil(d.mats[k] / 2));   // 廃材リサイクル
  d.apply();
  if (sk("c_cashback") && state.coins < before) state.coins += Math.floor((before - state.coins) * (sk("c_cash2") ? 0.25 : 0.10));   // キャッシュバック
  if (dataBuy.startsWith("craft:")) wSel = dataBuy.slice(6);
  return true;
}
function doBuy(dataBuy){
  if (!applyBuy(dataBuy)){ sndFail(); return false; }
  if (lastMatSubPlan && lastMatSubPlan.subTotal > 0) toast(`素材払い ${fmt(lastMatSubPlan.subTotal)} コイン分で強化した`);
  sndBuy(); save(); renderPanels(true); updateHUD();
  return true;
}
// まとめ買い: 既存の単発購入を、払える分だけ (上限 maxN 回) 繰り返す。コスト計算は単発と完全に同じ
const BULK_LABEL = { bot:"攻撃ボット製造", coinbot:"回収ボット製造", bupgrade:"攻撃ボット強化", botcore:"衛星兵装コア", botarmor:"衛星装甲プレート" };
function bulkLabel(dataBuy){
  if (dataBuy.startsWith("cbmod:")) return CB_MODULES[dataBuy.slice(6)].name;
  return BULK_LABEL[dataBuy] || dataBuy;
}
function doBuyBulk(dataBuy, maxN){
  let n = 0;
  while (n < maxN && applyBuy(dataBuy)) n++;
  if (!n){ sndFail(); return 0; }
  sndBuy(); save(); renderPanels(true); updateHUD();
  toast(`${bulkLabel(dataBuy)} ×${n}`);
  return n;
}
// 繰り返し買えるタイルに付ける「×10 / 最大まで」のボタン行
function bulkRowHTML(dataBuy){
  const dis = canBuy(buyDef(dataBuy)) ? "" : "disabled";
  return `<span class="wt-act bulk-row"><button class="wr-btn bulk" data-bulk="${dataBuy}" data-bulkn="10" ${dis} title="買える分だけ最大10回まとめて購入">×10 まとめて</button><button class="wr-btn bulk" data-bulk="${dataBuy}" data-bulkn="max" ${dis} title="払える限り・上限までまとめて購入">最大まで</button></span>`;
}
$("panels").addEventListener("click", e => {
  const btn = e.target.closest("[data-buy]"); if (!btn || btn.disabled) return;
  doBuy(btn.dataset.buy);
});
$("panels").addEventListener("click", e => {
  const b = e.target.closest("[data-bulk]"); if (!b || b.disabled) return;
  doBuyBulk(b.dataset.bulk, b.dataset.bulkn === "max" ? 100000 : +b.dataset.bulkn);
});
$("panels").addEventListener("click", e => {
  if (e.target.closest("[data-boteq-open]")) openBotEq();
});

/* ---------- 工房: ステージ見出しの開閉 ---------- */
$("panels").addEventListener("click", e => {
  const th = e.target.closest("[data-tier]");
  if (th){ const t = +th.dataset.tier; tierOpen[t] = !th.classList.contains("open"); renderPanels(true); }
});

/* ---------- ボット: 作戦モードの切り替え ---------- */
$("panels").addEventListener("click", e => {
  const bm = e.target.closest("[data-bmode]");
  if (bm){ state.botMode = bm.dataset.bmode; for (const b of bots) b.exploreSat = undefined; save(); renderPanels(true); return; }
  const cm = e.target.closest("[data-cbmode]");
  if (cm){ state.cbMode = cm.dataset.cbmode; save(); renderPanels(true); return; }
});

/* ---------- 工房: 武器ブラウザの操作 ---------- */
$("panels").addEventListener("click", e => {
  const f = e.target.closest("[data-wfilter]"); if (f){ wFilter = f.dataset.wfilter; renderPanels(true); return; }
  const so = e.target.closest("[data-wsort]"); if (so){ wSort = so.dataset.wsort; renderPanels(true); return; }
  if (e.target.closest("[data-wgroup]")){ wGroup = !wGroup; renderPanels(true); return; }
  const sel = e.target.closest("[data-wsel]"); if (sel){ wSel = sel.dataset.wsel; renderPanels(true); return; }
});
$("panels").addEventListener("input", e => {
  if (e.target.id !== "wsearch") return;
  wQuery = e.target.value;
  renderPanels(true);
  const inp = $("wsearch");
  if (inp){ inp.focus(); const v = inp.value; try { inp.setSelectionRange(v.length, v.length); } catch(err){} }
});

/* ---------- 攻撃ボットの編成: クリック / ドラッグ&ドロップ (装備モーダル内。処理はパネルと共有) ---------- */
function assignBot(i, k){
  if (k) { if (!state.weaponsOwned[k] || k === state.weapon) return; setBotWeapon(i, k); }
  else setBotWeapon(i, null);
  if (k && botEqOpen) eqFlash = { i, k };   // 装備した瞬間のフィードバック (モーダル内で光る + ガイド表示)
  botSlotSel = -1; sndBuy(); save(); refreshBotViews(); updateHUD();
}
function loadoutClick(e){
  const so = e.target.closest("[data-shelfsort]");
  if (so){ shelfSort = so.dataset.shelfsort; renderBotEq(); return; }
  if (e.target.closest("[data-shelffree]")){ shelfFreeOnly = !shelfFreeOnly; renderBotEq(); return; }
  const un = e.target.closest("[data-unequip]");
  if (un){ assignBot(+un.dataset.unequip, null); return; }
  const slot = e.target.closest("[data-slot]");
  if (slot){ const i = +slot.dataset.slot; botSlotSel = botSlotSel === i ? -1 : i; refreshBotViews(); return; }
  const chip = e.target.closest("[data-shelf]");
  if (chip){
    const k = chip.dataset.shelf;
    let i = botSlotSel;
    if (i < 0){   // スロット未選択: 空きスロット → 最も弱いスロット
      const total = botCount(); i = -1;
      for (let j = 0; j < total; j++) if (!botWeaponAt(j)){ i = j; break; }
      if (i < 0){ let worst = Infinity; for (let j = 0; j < total; j++){ const d = botSlotDPS(j); if (d < worst){ worst = d; i = j; } } }
    }
    if (i >= 0) assignBot(i, k);
    return;
  }
  if (e.target.closest("[data-bauto]")){
    const def = botDefaultDPS();
    const cand = WEAPON_KEYS.filter(k => state.weaponsOwned[k] && k !== state.weapon && botWeaponDPS(k) > def).sort((a, b) => botWeaponDPS(b) - botWeaponDPS(a));
    for (let i = 0; i < botCount(); i++) setBotWeapon(i, cand[i] || null);
    botSlotSel = -1; sndBuy(); save(); refreshBotViews(); updateHUD(); return;
  }
  if (e.target.closest("[data-bclear]")){
    for (let i = 0; i < state.botLoadout.length; i++) state.botLoadout[i] = null;
    botSlotSel = -1; sndBuy(); save(); refreshBotViews(); updateHUD();
  }
}
$("panels").addEventListener("click", loadoutClick);
$("botEqOverlay").addEventListener("click", loadoutClick);
let dragKey = null;
function loadoutDragStart(e){
  const chip = e.target.closest("[data-shelf]"); if (!chip) return;
  dragKey = chip.dataset.shelf; chip.classList.add("dragging"); tipDragging = true; hideTip();
  try { e.dataTransfer.setData("text/plain", dragKey); e.dataTransfer.effectAllowed = "move"; } catch(err){}
  $("panel-bot").classList.add("drag-on"); $("botEqOverlay").classList.add("drag-on");
}
function loadoutDragEnd(){
  dragKey = null; tipDragging = false; $("panel-bot").classList.remove("drag-on"); $("botEqOverlay").classList.remove("drag-on");
  document.querySelectorAll(".btile.dragging").forEach(c => c.classList.remove("dragging"));
  document.querySelectorAll(".btile.over").forEach(s => s.classList.remove("over"));
}
function loadoutDragOver(e){
  const slot = e.target.closest("[data-slot]");
  if (slot && dragKey){ e.preventDefault(); e.dataTransfer.dropEffect = "move"; slot.classList.add("over"); }
}
function loadoutDragLeave(e){ const slot = e.target.closest("[data-slot]"); if (slot) slot.classList.remove("over"); }
function loadoutDrop(e){
  const slot = e.target.closest("[data-slot]"); if (!slot) return;
  e.preventDefault();
  const k = dragKey || (e.dataTransfer && e.dataTransfer.getData("text/plain"));
  if (k) assignBot(+slot.dataset.slot, k);
}
for (const root of [$("panels"), $("botEqOverlay")]){
  root.addEventListener("dragstart", loadoutDragStart);
  root.addEventListener("dragend", loadoutDragEnd);
  root.addEventListener("dragover", loadoutDragOver);
  root.addEventListener("dragleave", loadoutDragLeave);
  root.addEventListener("drop", loadoutDrop);
}

/* ---------- 素材タブ ---------- */
$("panels").addEventListener("click", e => {
  const f = e.target.closest("[data-mfilter]");
  if (f){ matFilter = f.dataset.mfilter; renderPanels(true); return; }
  if (e.target.closest("[data-mowned]")){ matOwnedOnly = !matOwnedOnly; renderPanels(true); return; }
  const t = e.target.closest("[data-mat-tile]");
  if (t){ matSel = matSel === t.dataset.matTile ? null : t.dataset.matTile; renderPanels(true); $("panels").scrollTop = 0; return; }
  if (e.target.closest("[data-matclose]")){ matSel = null; renderPanels(true); }
});

/* ---------- 仲間の稼働 ON/OFF ---------- */
const CREW_SYNC = { bots:() => syncBots(), coinBots:() => syncCoinBots() };
$("panels").addEventListener("change", e => {
  const t = e.target.closest("[data-crew]"); if (!t) return;
  const k = t.dataset.crew;
  if (t.checked) delete state.off[k]; else state.off[k] = true;
  if (CREW_SYNC[k]) CREW_SYNC[k]();
  sndBuy(); save(); renderPanels(true); updateHUD();
});

/* ---------- settings popup ---------- */
const settingsOverlay = $("settingsOverlay");
$("gearBtn").addEventListener("click", () => { $("soundToggle").checked = !state.muted; $("atkSndToggle").checked = !state.atkMuted; settingsOverlay.classList.add("open"); });
$("settingsClose").addEventListener("click", () => settingsOverlay.classList.remove("open"));
settingsOverlay.addEventListener("click", e => { if (e.target === settingsOverlay) settingsOverlay.classList.remove("open"); });
window.addEventListener("keydown", e => { if (e.key === "Escape") settingsOverlay.classList.remove("open"); });
$("soundToggle").addEventListener("change", e => { state.muted = !e.target.checked; save(); syncAudioActive(); if (!state.muted) sndBuy(); });
$("atkSndToggle").addEventListener("change", e => { state.atkMuted = !e.target.checked; save(); if (!state.atkMuted) sndBuy(); });
$("resetBtn").addEventListener("click", () => {
  if (confirm("セーブを削除して最初からにしますか？")) wipeSave().then(() => location.reload());
});

/* ---------- アップデート履歴 ---------- */
let updOpen = false;
// 新しい順。行を足すときは先頭に追加し、core.js の GAME_VERSION を上げる
const UPDATE_HISTORY = [
  { v:84, text:"落ちたコインが密集すると合体して大きなコインになるようにした (総額はそのまま・額が大きいほど豪華に・描画も軽く)" },
  { v:83, text:"素材で支払う時は強化ボタンにも素材のアイコンを表示するようにした (全額素材払いではコイン表示なし・混合払いは両方表示)" },
  { v:82, text:"武器強化で素材を代用払いできるようにした (1素材=1コイン・所持数の多い素材から優先使用・支払い内訳を表示)" },
  { v:81, text:"超高速移動を追加：PCはスペースキー長押し、スマホは高速移動トグルボタン (通常の10倍速・残像と噴射の演出つき)" },
  { v:80, text:"スキルツリーに奥義15種を追加 (全165種・各系統に100/200/300SPの最終スキル：ファンネル/オービタルボット/軌道砲撃など) ・ ファストトラベル強化 (検索/リスト/ホーム＆リターン) ・ 画面シェイクを全廃止 ・ 設定に攻撃/破壊音のオフを追加" },
  { v:79, text:"拡大マップで重なっていたダンジョン名のラベルが重ならないように調整 (4組)" },
  { v:78, text:"アーティファクトの発動を左上のフィードに表示 (発動カウンタ付き) ・ 工房に武器フィルタを追加 (未製作のみ/製作可能のみ/所持済みのみ)" },
  { v:77, text:"アーティファクト全60種の効果を強化し、レア度を5段階に整理 (コモン/レア/エピック/レジェンダリー/ミシック・枠に色) ・ スキルの発動が見えるように (発動カウンタ/取得前後の合計値/発動中マーク)" },
  { v:76, text:"スキルツリーの詳細を、クリックしたノードの近くに出るポップオーバーに変更" },
  { v:75, text:"レジェンダリーアーティファクト10種を追加 (全60種に) ・ ボットUI大改修 (装備モーダル/まとめ買い) ・ 状態異常をグラフィカルに表示" },
  { v:74, text:"ファストトラベル (訪問済みダンジョンへ、右下マップから) とアップデート履歴を追加" },
  { v:73, text:"スタート画面の数を実数に修正 (素材168種・装備137種・スキル150種)" },
  { v:72, text:"スマホ・PWA対応 (タッチ操作、ホーム画面に追加して全画面プレイ)" },
  { v:69, text:"発破採掘を追加 (一定数壊すと周囲がまとめて爆砕)" },
  { v:68, text:"元素付与を全武器対応に再編 (お宝ブロック・連破も追加)" },
  { v:65, text:"序盤ダンジョン+10と武器見直し (石灰クラッシャー底上げ)" },
  { v:64, text:"ダンジョン固有効果 (倍率・状態付与) とHUDバナー" },
  { v:63, text:"幻想ダンジョン+10 (妖精の泉〜世界樹の根源)" },
  { v:62, text:"惑星内部ダンジョン+10 (骨の回廊〜惑星の心臓)" },
  { v:61, text:"弾のデザイン一新 (全武器に固有の弾フォームと破壊エフェクト)" },
  { v:60, text:"武器大改修 (全武器に固有の能力を付与)" },
  { v:56, text:"ズーム最適化 (ズームイン/アウトの重さを解消)" },
  { v:55, text:"アクティブスキル廃止 (スキルツリーはパッシブ専用に)" },
];
function renderUpdates(){
  const el = $("updateList"); if (!el) return;
  el.innerHTML = UPDATE_HISTORY.map((u, i) =>
    `<div class="upd-row${i === 0 ? " latest" : ""}"><span class="upd-ver">v${u.v}</span><span class="upd-text">${u.text}</span>${i === 0 ? `<span class="upd-new">NEW</span>` : ""}</div>`).join("");
}
function updateUpdBadge(){
  const b = $("updBadge"); if (b) b.style.display = state.lastSeenUpdate < GAME_VERSION ? "block" : "none";
}
function openUpdates(){
  updOpen = true;
  renderUpdates();
  $("updateOverlay").classList.add("open");
  if (state.lastSeenUpdate < GAME_VERSION){ state.lastSeenUpdate = GAME_VERSION; save(); }
  updateUpdBadge();
}
function closeUpdates(){ updOpen = false; $("updateOverlay").classList.remove("open"); }
$("updateBtn").addEventListener("click", openUpdates);
$("updateClose").addEventListener("click", closeUpdates);
$("updateOverlay").addEventListener("click", e => { if (e.target === $("updateOverlay")) closeUpdates(); });
window.addEventListener("keydown", e => { if (e.key === "Escape") closeUpdates(); });
updateUpdBadge();

/* ---------- HUD (side panel only) ---------- */
function setText(el, t){ if (el._t !== t){ el._t = t; el.textContent = t; } }
function updateHUD(){
  refreshAffordability();
  const pct = state.destroyed / TARGET_TOTAL * 100, w = Math.max(pct, 0.05).toFixed(4) + "%", bar = $("sideProgress");
  setText($("sidePct"), pct.toFixed(5) + "%");
  if (bar._w !== w){ bar._w = w; bar.style.width = w; }
  setText($("sideDestroyed"), "破壊 " + fmt(state.destroyed));
  setText($("sideRemain"), "残り " + fmt(alive));
  setText($("sideCoins"), fmt(state.coins));
}

/* ---------- ホバーツールチップ: 武器 / 強化 / モジュール の説明カード ---------- */
function weaponTipHTML(k){
  const w = WEAPONS[k], owned = state.weaponsOwned[k], eq = state.weapon === k, lv = weaponLvOf(k);
  return `<div class="tip-head">${iconBadge(w.icon, w.accent)}<div class="tip-main"><div class="tip-name">${w.name}</div><div class="tip-tag">No.${String(w.no).padStart(2, "0")} ・ ${w.tag}</div></div><span class="wt-st ${eq ? "eq" : owned ? "own" : "dim"}">${eq ? "装備中" : owned ? "Lv." + lv : "未所持"}</span></div>
    ${weaponStatsHTML(k, w)}
    <div class="tip-line">個性: ${[`弾は${FORM_INFO[w.form || w.shape] || "特殊な形"}`, w.move ? MOVE_INFO[w.move][1] : "", w.mine ? MOVE_INFO.mine[1] : "", w.spin ? "回転しながら飛ぶ" : "", w.pulse ? "脈動する" : "", w.trail ? "残像を引く" : "", w.glow ? "光を放つ" : ""].filter(Boolean).join(" ・ ")}</div>
    ${w.desc ? `<p class="tip-desc">${w.desc}</p>` : ""}
    ${owned ? `<div class="tip-line">強化 Lv.${lv} → ${lv + 1} : 威力 +8%${Math.floor(lv / 10) > 0 ? ` ・ 発射数 +${Math.floor(lv / 10)}` : ""}${Math.floor((lv + 1) / 10) > Math.floor(lv / 10) ? ` ・ <b style="color:#57e39a">次の強化で発射数 +1!</b>` : ""}</div>` : `<div class="tip-line">製作レシピ (素材が揃うと製作できる)</div>${recipeChips(w.recipe, true)}`}`;
}
function buyTipHTML(arg){
  const head = (icon, color, name, tag) => `<div class="tip-head">${iconBadge(icon, color)}<div class="tip-main"><div class="tip-name">${name}</div><div class="tip-tag">${tag}</div></div></div>`;
  if (arg === "bot") return head("bot", "#ffffff", "攻撃ボット", "製造") + `<p class="tip-desc">自機と一緒に惑星を掘る相棒。標準装備は威力60%・毎秒3発。編成で余った武器を持たせると、その武器の撃ち方そのままで戦う。作戦モード (追従 / 独立 / 探索) で動き方が変わる。</p><div class="tip-line">現在 ${state.bots} 機 (上限 ${BOT_MAX} 機) ・ スキル追加分を含め ${botCount()} 機が稼働</div>`;
  if (arg === "bupgrade") return head("up", "#ffffff", "攻撃ボット強化", "強化") + `<p class="tip-desc">全ての攻撃ボットの威力が上がる。強化倍率は Lv ごとに +12% ずつ積み上がる。</p><div class="tip-line">現在 Lv.${state.botLv} (倍率 x${(1 + 0.12 * state.botLv).toFixed(2)}) → Lv.${state.botLv + 1} (x${(1 + 0.12 * (state.botLv + 1)).toFixed(2)})</div>`;
  if (arg === "botcore"){ const lv = state.botCore || 0; return head("star", "#fff2b0", "衛星兵装コア", "衛星テクノロジー") + `<p class="tip-desc">衛星惑星の素材で作る兵装コア。攻撃ボットの威力が +25%/Lv 上がる (ボット強化やスキルとは乗算で効く)。</p><div class="tip-line">現在 Lv.${lv} (+${lv * 25}%)${lv < BOT_CORE_MAX ? ` → Lv.${lv + 1} (+${(lv + 1) * 25}%)` : " ・ 最大レベル"}</div>`; }
  if (arg === "botarmor"){ const lv = state.botArmor || 0; return head("layers", "#fff2b0", "衛星装甲プレート", "衛星テクノロジー") + `<p class="tip-desc">衛星惑星の素材で作る装甲プレート。自機がモンスターから受けるダメージが -4%/Lv 軽減される。</p><div class="tip-line">現在 Lv.${lv} (-${lv * 4}%)${lv < BOT_ARMOR_MAX ? ` → Lv.${lv + 1} (-${(lv + 1) * 4}%)` : " ・ 最大レベル"}</div>`; }
  if (arg === "coinbot") return head("coinbot", "#ffd60a", "コイン回収ボット", "製造") + `<p class="tip-desc">落ちたコインを自動で拾う相棒。吸引範囲内のコインを引き寄せ、触れると回収する。モジュールで吸引・速度・接触範囲・回収額が伸びていく。</p><div class="tip-line">現在 ${state.coinBots} 機 (上限 ${COINBOT_MAX} 機) ・ スキル等を含め ${coinBotCount()} 機が稼働</div>`;
  if (arg.startsWith("cbmod:")){
    const k = arg.slice(6), m = CB_MODULES[k], lv = cbLv(k), maxed = lv >= m.max, d = buyDef(arg);
    return head(m.icon, m.accent, m.name, "回収ボット モジュール") + `<p class="tip-desc">${m.desc}</p><div class="tip-line">${m.eff(lv)}${maxed ? " ・ 最大レベル" : ` → ${m.eff(lv + 1)} (Lv.${lv} / ${m.max})`}</div>${maxed ? "" : recipeChips(d.mats, true)}`;
  }
  if (arg.startsWith("wupgrade:")){
    const k = arg.slice(9), w = WEAPONS[k], lv = weaponLvOf(k), d = buyDef(arg);
    return head(w.icon, w.accent, `${w.name} を強化`, "武器の強化") + `<p class="tip-desc">この武器の威力が +8% 上がる。その武器を使う自機・攻撃ボット・僚機すべてに効く。さらに Lv が 10 上がるごとに発射数も +1 される。</p><div class="tip-line">Lv.${lv} → Lv.${lv + 1} の素材${Math.floor((lv + 1) / 10) > Math.floor(lv / 10) ? ` ・ <b style="color:#57e39a">発射数 +1!</b>` : ""}</div>${recipeChips(d.mats, true)}${matSubHTML(arg)}`;
  }
  return "";
}
function tipHTML(spec){
  const i = spec.indexOf(":"), kind = spec.slice(0, i), arg = spec.slice(i + 1);
  if (kind === "weapon") return weaponTipHTML(arg);
  if (kind === "buy") return buyTipHTML(arg);
  if (kind === "bot"){
    const idx = +arg, k = botWeaponAt(idx);
    const base = k ? weaponTipHTML(k) : `<div class="tip-head">${iconBadge("bot", "#999999")}<div class="tip-main"><div class="tip-name">未装備（デフォルト砲）</div><div class="tip-tag">ボットの初期装備</div></div></div><p class="tip-desc">素の射撃 (威力60%・毎秒3発)。編成で余った武器を持たせると、はるかに強くなる。</p>`;
    return base + `<div class="tip-foot">ボット${idx + 1} ・ DPS ${fmtD(botSlotDPS(idx))} — ${TAP}で選択、棚の装備を${TAP}して割り当て</div>`;
  }
  return "";
}
let tipAnchor = null, tipDragging = false;
function hideTip(){ const t = $("tooltip"); if (t) t.classList.remove("show"); tipAnchor = null; }
function attachTip(root){
  if (!root) return;
  root.addEventListener("mousemove", e => {
    if (tipDragging) return;
    const a = e.target.closest("[data-tip]"), tip = $("tooltip");
    if (!a || !root.contains(a) || !document.contains(a)){ hideTip(); return; }
    if (tipAnchor !== a){
      tipAnchor = a;
      tip.innerHTML = tipHTML(a.dataset.tip);
      tip.style.setProperty("--accent", a.style.getPropertyValue("--accent") || "#666");
    }
    const w = tip.offsetWidth, h = tip.offsetHeight;
    let x = e.clientX + 16, y = e.clientY + 16;
    if (x + w > window.innerWidth - 8) x = e.clientX - w - 12;
    if (y + h > window.innerHeight - 8) y = e.clientY - h - 12;
    tip.style.left = x + "px"; tip.style.top = y + "px";
    tip.classList.add("show");
  });
  root.addEventListener("mouseleave", hideTip);
  root.addEventListener("click", hideTip);
}
attachTip($("panels"));
attachTip($("equipBar"));
attachTip($("botEqOverlay"));
$("panels").addEventListener("scroll", hideTip);
