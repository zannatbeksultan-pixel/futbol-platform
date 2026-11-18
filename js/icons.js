// Сызықтық SVG иконкалар (сыртқы қаріп жүктелмесе де жұмыс істейді).
const P = {
  home: '<circle cx="12" cy="12" r="9"/><path d="m12 7 3.8 2.8-1.5 4.4H9.7L8.2 9.8Z"/><path d="M12 3v4M20.6 9.2l-4.8.6M17.3 19.4l-3-5.2M6.7 19.4l3-5.2M3.4 9.2l4.8.6"/>',
  drills: '<path d="m6.5 6.5 11 11"/><path d="m21 21-1-1"/><path d="m3 3 1 1"/><path d="m18 22 4-4"/><path d="m2 6 4-4"/><path d="m3 10 7-7"/><path d="m14 21 7-7"/>',
  chart: '<path d="M3 3v18h18"/><path d="M7 15l4-5 3 3 5-7"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7"/>',
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0"/>',
  flame: '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.4-.5-2-1-3-1.1-2.1-.2-4 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.2.4-2.3 1-3.4.3 1.7 1.3 2.9 2.5 2.9Z"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  checkCircle: '<circle cx="12" cy="12" r="9"/><path d="m8.5 12 2.5 2.5 5-5"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  bolt: '<path d="M13 2 4 14h7l-1 8 9-12h-7Z"/>',
  arrowRight: '<path d="M5 12h14"/><path d="m13 6 6 6-6 6"/>',
  arrowLeft: '<path d="m15 18-6-6 6-6"/>',
  chevronRight: '<path d="m9 18 6-6-6-6"/>',
  play: '<path d="M7 4v16l13-8Z"/>',
  playCircle: '<circle cx="12" cy="12" r="9"/><path d="m10 8.5 5.5 3.5-5.5 3.5Z"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
  whistle: '<circle cx="9" cy="14" r="5"/><path d="M13 11h8v-3h-11"/><circle cx="9" cy="14" r="1.2"/>',
  brain: '<path d="M9.5 3A3 3 0 0 0 7 7.5 3 3 0 0 0 4.5 12 3 3 0 0 0 6 17a3 3 0 0 0 5 2.5V4.5A2.5 2.5 0 0 0 9.5 3Z"/><path d="M14.5 3A3 3 0 0 1 17 7.5a3 3 0 0 1 2.5 4.5A3 3 0 0 1 18 17a3 3 0 0 1-5 2.5V4.5A2.5 2.5 0 0 1 14.5 3Z"/>',
  ball: '<circle cx="12" cy="12" r="9"/><path d="m12 7.5 3.4 2.5-1.3 4H9.9l-1.3-4Z"/><path d="M12 3v4.5M20.4 9.6 15.4 10M16.9 19.2l-2.8-5.2M7.1 19.2l2.8-5.2M3.6 9.6 8.6 10"/>',
  wind: '<path d="M3 8h10a3 3 0 1 0-3-3"/><path d="M3 12h15a3 3 0 1 1-3 3"/><path d="M3 16h7"/>',
  edit: '<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16Z"/><path d="m13.5 6.5 4 4"/>',
  trophy: '<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0Z"/><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3"/>',
  medal: '<circle cx="12" cy="15" r="5"/><path d="M8.5 11 6 3h4l2 5 2-5h4l-2.5 8"/><path d="m12 13 .9 1.8 2 .3-1.5 1.4.4 2-1.8-1-1.8 1 .4-2-1.5-1.4 2-.3Z"/>',
  timer: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2M10 2h4M12 2v3"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
  star: '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9Z"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5M21 12H9"/>',
  refresh: '<path d="M3 12a9 9 0 0 1 15.5-6.2L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15.5 6.2L3 16"/><path d="M3 21v-5h5"/>',
  hourglass: '<path d="M6 2h12M6 22h12M7 2c0 5 5 6 5 10S7 17 7 22M17 2c0 5-5 6-5 10s5 5 5 10"/>',
  heart: '<path d="M12 20s-8-4.6-8-10.5A4.5 4.5 0 0 1 12 7a4.5 4.5 0 0 1 8 2.5C20 15.4 12 20 12 20Z"/>',
  speed: '<path d="M12 14 16 9"/><path d="M3.5 18a10 10 0 1 1 17 0"/>',
  quote: '<path d="M9 7H5v6h4v-1a4 4 0 0 1-4 4M19 7h-4v6h4v-1a4 4 0 0 1-4 4"/>',
  trend: '<path d="m3 17 6-6 4 4 8-8"/><path d="M15 7h6v6"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
  shield: '<path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6Z"/>',
};

export function icon(name, { size = 20, cls = '', fill = false } = {}) {
  const body = P[name] || P.info;
  const f = fill ? 'currentColor' : 'none';
  return `<svg class="ic ${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="${f}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
}

export const CATEGORY_ICON = { tactics: 'whistle', physical: 'bolt', mental: 'brain', technique: 'ball' };
