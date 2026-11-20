// ─────────────────────────────────────────────────────────────
// «Қалай жасалады» анимациялары: кодпен салынған футболшы.
// Бүйірден көрініс, адам пропорциясы (~7.5 бас), қаңқа + тура
// кинематика. Қимылдар кілттік кадрлардан Catmull-Rom арқылы
// біркелкі интерполяцияланады, аяқтар жерге өзі қонады.
// ─────────────────────────────────────────────────────────────

const L = { T: 50, neck: 7, headR: 10.5, U: 29, F: 26, Th: 44, Sh: 43, Fo: 15 };
const BALL_R = 10.5;
const W = 400, H = 225, GROUND = 205;

const rad = (d) => (d * Math.PI) / 180;
const KEYS = ['tl', 'hd', 'sL', 'eL', 'sR', 'eR', 'hL', 'kL', 'fL', 'hR', 'kR', 'fR', 'lift', 'x', 'eye'];
const BASE = { tl: 0, hd: 0, sL: 2, eL: 8, sR: -2, eR: 8, hL: 2, kL: -3, fL: 0, hR: -2, kR: -3, fR: 0, lift: 0, x: 0, eye: 1 };
const P = (o = {}) => ({ ...BASE, ...o });
const mirror = (p, extra = {}) => ({
  ...p, sL: p.sR, eL: p.eR, sR: p.sL, eR: p.eL, hL: p.hR, kL: p.kR, fL: p.fR, hR: p.hL, kR: p.kL, fR: p.fL, ...extra,
});
const scale = (p, k, extra = {}) => {
  const o = { ...p };
  ['sL', 'eL', 'sR', 'eR', 'hL', 'kL', 'hR', 'kR', 'fL', 'fR'].forEach((key) => { o[key] = p[key] * k; });
  return { ...o, ...extra };
};

// ── Интерполяция ──
const cr = (p0, p1, p2, p3, t) => {
  const t2 = t * t, t3 = t2 * t;
  return 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
};
function samplePose(keys, u, loop) {
  // keys: [[t (0..1), pose], ...] сұрыпталған
  const n = keys.length;
  let i = n - 1;
  for (let j = 0; j < n; j++) { if (keys[j][0] > u) { i = j - 1; break; } }
  if (i < 0) i = loop ? n - 1 : 0;
  const k1 = keys[i], k2 = keys[(i + 1) % n];
  const t1 = k1[0], t2 = i + 1 < n ? k2[0] : (loop ? k2[0] + 1 : 1);
  const uu = u < t1 ? u + 1 : u;
  const t = t2 === t1 ? 0 : Math.min(1, Math.max(0, (uu - t1) / (t2 - t1)));
  const k0 = keys[(i - 1 + n) % n], k3 = keys[(i + 2) % n];
  const out = {};
  for (const key of KEYS) {
    const a = k0[1][key], b = k1[1][key], c = k2[1][key], d = k3[1][key];
    out[key] = key === 'eye' ? (t < 0.5 ? b : c) : cr(loop || i > 0 ? a : b, b, c, loop || i + 2 < n ? d : c, t);
  }
  out.face = t < 0.5 ? (k1[1].face ?? 1) : (k2[1].face ?? 1);
  out.seat = k1[1].seat;
  return out;
}

// ── Тура кинематика ──
const v = (a) => [Math.sin(rad(a)), Math.cos(rad(a))];
function solve(p) {
  const hip = [0, 0];
  const up = [Math.sin(rad(p.tl)), -Math.cos(rad(p.tl))];
  const sh = [hip[0] + up[0] * L.T * 0.9, hip[1] + up[1] * L.T * 0.9];
  const neck = [hip[0] + up[0] * L.T, hip[1] + up[1] * L.T];
  const ha = p.tl + p.hd;
  const head = [neck[0] + Math.sin(rad(ha)) * (L.neck + L.headR), neck[1] - Math.cos(rad(ha)) * (L.neck + L.headR)];
  const arm = (s, e) => {
    const a = v(s), b = v(s + e);
    const el = [sh[0] + a[0] * L.U, sh[1] + a[1] * L.U];
    return { el, wr: [el[0] + b[0] * L.F, el[1] + b[1] * L.F] };
  };
  const leg = (h, k, f) => {
    const a = v(h), b = v(h + k), c = v(h + k + 90 + f);
    const kn = [hip[0] + a[0] * L.Th, hip[1] + a[1] * L.Th];
    const an = [kn[0] + b[0] * L.Sh, kn[1] + b[1] * L.Sh];
    return { kn, an, toe: [an[0] + c[0] * L.Fo, an[1] + c[1] * L.Fo], heel: [an[0] - c[0] * 3, an[1] - c[1] * 3 + 2] };
  };
  return { hip, sh, neck, head, ha, aL: arm(p.sL, p.eL), aR: arm(p.sR, p.eR), lL: leg(p.hL, p.kL, p.fL), lR: leg(p.hR, p.kR, p.fR) };
}

function place(p, figX, sc) {
  const s = solve(p);
  const pts = [s.lL.toe, s.lL.heel, s.lR.toe, s.lR.heel, s.lL.kn, s.lR.kn, s.aL.wr, s.aR.wr, s.aL.el, s.aR.el, s.head, s.hip];
  const lowest = Math.max(...pts.map((q) => q[1]));
  const hipY = p.seat != null ? GROUND - p.seat : GROUND - lowest * sc - p.lift;
  const hipX = figX + p.x;
  const f = p.face || 1;
  const tr = (q) => [hipX + q[0] * sc * f, hipY + q[1] * sc];
  const map = (o) => Object.fromEntries(Object.entries(o).map(([k, val]) => [k, Array.isArray(val) ? tr(val) : (typeof val === 'object' ? map(val) : val)]));
  return { ...map(s), face: f, sc, p };
}

// ── Сурет салу ──
const KITS = {
  field: { shirt: '#F3F5EE', trim: '#FFB21A', shorts: '#16233F', socks: '#F3F5EE', boots: '#151515', skin: '#B9845A', hair: '#1C140F' },
  gk: { shirt: '#3DDC8C', trim: '#0A1324', shorts: '#0A1324', socks: '#3DDC8C', boots: '#151515', skin: '#B9845A', hair: '#1C140F', gloves: '#F3F5EE' },
};
function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.round(((n >> 16) & 255) * k), g = Math.round(((n >> 8) & 255) * k), b = Math.round((n & 255) * k);
  return `rgb(${Math.min(255, r)},${Math.min(255, g)},${Math.min(255, b)})`;
}
function capsule(ctx, a, b, w1, w2, color) {
  const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len, ny = dx / len;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(a[0] + nx * w1 / 2, a[1] + ny * w1 / 2);
  ctx.lineTo(b[0] + nx * w2 / 2, b[1] + ny * w2 / 2);
  ctx.arc(b[0], b[1], w2 / 2, Math.atan2(ny, nx), Math.atan2(ny, nx) - Math.PI, true);
  ctx.lineTo(a[0] - nx * w1 / 2, a[1] - ny * w1 / 2);
  ctx.arc(a[0], a[1], w1 / 2, Math.atan2(-ny, -nx), Math.atan2(-ny, -nx) - Math.PI, true);
  ctx.closePath();
  ctx.fill();
}
const lerp2 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

function drawLeg(ctx, f, l, kit, k) {
  const sc = f.sc;
  capsule(ctx, f.hip, l.kn, 16 * sc, 11.5 * sc, shade(kit.skin, k));
  capsule(ctx, l.kn, l.an, 11 * sc, 7 * sc, shade(kit.skin, k));
  capsule(ctx, f.hip, lerp2(f.hip, l.kn, 0.62), 18 * sc, 15 * sc, shade(kit.shorts, k));
  capsule(ctx, lerp2(l.kn, l.an, 0.18), l.an, 11.5 * sc, 8 * sc, shade(kit.socks, k));
  capsule(ctx, l.heel, l.toe, 8 * sc, 6 * sc, shade(kit.boots, k));
}
function drawArm(ctx, f, a, kit, k, gloves) {
  const sc = f.sc;
  capsule(ctx, f.sh, a.el, 9.5 * sc, 7.5 * sc, shade(kit.skin, k));
  capsule(ctx, a.el, a.wr, 7.5 * sc, 5.5 * sc, shade(kit.skin, k));
  capsule(ctx, f.sh, lerp2(f.sh, a.el, 0.5), 12 * sc, 10.5 * sc, shade(kit.shirt, k));
  ctx.fillStyle = gloves ? shade(gloves, k) : shade(kit.skin, k * 0.95);
  ctx.beginPath(); ctx.arc(a.wr[0], a.wr[1], (gloves ? 5.5 : 4) * sc, 0, Math.PI * 2); ctx.fill();
}
function drawBody(ctx, f, kit) {
  const sc = f.sc;
  // тұлға: жамбастан кеудеге қарай кеңейетін пішін
  capsule(ctx, f.hip, f.sh, 21 * sc, 26 * sc, kit.shirt);
  // форма жиегі
  ctx.strokeStyle = kit.trim; ctx.lineWidth = 2.2 * sc; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(...lerp2(f.hip, f.sh, 0.05)); ctx.lineTo(...lerp2(f.hip, f.sh, 0.98)); ctx.stroke();
  capsule(ctx, f.hip, lerp2(f.hip, f.sh, 0.12), 21 * sc, 21 * sc, kit.shorts);
  capsule(ctx, f.neck, lerp2(f.neck, f.head, 0.5), 8 * sc, 8 * sc, kit.skin);
  // бас
  const r = L.headR * sc, [hx, hy] = f.head, dir = f.face, ang = rad(f.ha);
  ctx.fillStyle = kit.skin; ctx.beginPath(); ctx.ellipse(hx, hy, r * 0.92, r, ang * dir, 0, Math.PI * 2); ctx.fill();
  // мұрын
  const fx = Math.cos(ang) * dir, fy = Math.sin(ang);
  ctx.beginPath(); ctx.arc(hx + fx * r * 0.9, hy + fy * r * 0.9 + 1 * sc, 2.2 * sc, 0, Math.PI * 2); ctx.fill();
  // шаш: желке мен төбе
  ctx.fillStyle = kit.hair; ctx.beginPath();
  ctx.ellipse(hx - fx * r * 0.18, hy - r * 0.28, r * 0.98, r * 0.78, ang * dir, Math.PI * 0.95, Math.PI * 2.05);
  ctx.fill();
  ctx.beginPath(); ctx.ellipse(hx - fx * r * 0.55, hy, r * 0.5, r * 0.75, ang * dir, 0, Math.PI * 2); ctx.fill();
  // көз (жабық/ашық)
  ctx.fillStyle = '#0A0A0A';
  if (f.p.eye >= 0.5) { ctx.beginPath(); ctx.arc(hx + fx * r * 0.45, hy - r * 0.12, 1.2 * sc, 0, Math.PI * 2); ctx.fill(); }
  else { ctx.strokeStyle = '#0A0A0A'; ctx.lineWidth = 1 * sc; ctx.beginPath(); ctx.moveTo(hx + fx * r * 0.3, hy - r * 0.1); ctx.lineTo(hx + fx * r * 0.6, hy - r * 0.1); ctx.stroke(); }
}
function drawFigure(ctx, f, kit) {
  // алыс жақ (сол) күңгірт, жақын жақ (оң) жарық
  const far = 0.68;
  ctx.fillStyle = 'rgba(0,0,0,.28)';
  ctx.beginPath(); ctx.ellipse(f.hip[0], GROUND + 2, 30 * f.sc, 4.5 * f.sc, 0, 0, Math.PI * 2); ctx.fill();
  drawArm(ctx, f, f.aL, kit, far, kit.gloves);
  drawLeg(ctx, f, f.lL, kit, far);
  drawBody(ctx, f, kit);
  drawLeg(ctx, f, f.lR, kit, 1);
  drawArm(ctx, f, f.aR, kit, 1, kit.gloves);
}
function drawBall(ctx, x, y, rot, shadow = true) {
  if (shadow) {
    const hgt = Math.max(0, GROUND - y - BALL_R);
    ctx.fillStyle = `rgba(0,0,0,${0.3 * Math.max(0.25, 1 - hgt / 120)})`;
    ctx.beginPath(); ctx.ellipse(x, GROUND + 2, BALL_R * (1 - Math.min(0.5, hgt / 240)), 3, 0, 0, Math.PI * 2); ctx.fill();
  }
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
  ctx.fillStyle = '#F7F7F2'; ctx.beginPath(); ctx.arc(0, 0, BALL_R, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#1A1A1A';
  ctx.beginPath();
  for (let i = 0; i < 5; i++) { const a = rad(i * 72 - 90); ctx.lineTo(Math.cos(a) * 3.6, Math.sin(a) * 3.6); }
  ctx.closePath(); ctx.fill();
  for (let i = 0; i < 5; i++) {
    const a = rad(i * 72 - 90);
    ctx.beginPath(); ctx.arc(Math.cos(a) * 9.2, Math.sin(a) * 9.2, 2.6, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
  ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(x, y, BALL_R, 0, Math.PI * 2); ctx.stroke();
}

// ── Сахна ──
function drawStage(ctx, t, def, scrollX) {
  const g = ctx.createLinearGradient(0, 0, 0, GROUND);
  g.addColorStop(0, '#0B1630'); g.addColorStop(1, '#142744');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, GROUND);
  // прожектор жарығы
  const rg = ctx.createRadialGradient(W * 0.5, -40, 10, W * 0.5, -40, 300);
  rg.addColorStop(0, 'rgba(220,232,255,.22)'); rg.addColorStop(1, 'rgba(220,232,255,0)');
  ctx.fillStyle = rg; ctx.fillRect(0, 0, W, GROUND);
  // трибуна сұлбасы
  ctx.fillStyle = 'rgba(7,15,29,.55)';
  for (let i = 0; i < 40; i++) {
    const x = ((i * 11 - scrollX * 0.15) % (W + 22) + W + 22) % (W + 22) - 11;
    ctx.beginPath(); ctx.arc(x, 128 + (i % 3) * 6, 5 + (i % 2), Math.PI, 0); ctx.fill();
  }
  ctx.fillRect(0, 128, W, GROUND - 128);
  // алаң
  ctx.fillStyle = '#145A3D'; ctx.fillRect(0, GROUND - 22, W, H - GROUND + 22);
  for (let i = -1; i < 9; i++) {
    const x = i * 60 - (scrollX % 120 + 120) % 120;
    ctx.fillStyle = 'rgba(255,255,255,.035)'; ctx.fillRect(x, GROUND - 22, 60, H);
    i++;
  }
  ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.fillRect(0, GROUND + 9, W, 1.5);
}
function drawProps(ctx, def, scrollX, t) {
  for (const pr of def.props || []) {
    const x = pr.moving ? (((pr.x - scrollX) % (pr.wrap || W + 80)) + (pr.wrap || W + 80)) % (pr.wrap || W + 80) - 40 : pr.x;
    if (pr.type === 'cone') {
      ctx.fillStyle = '#FF7A1A'; ctx.beginPath(); ctx.moveTo(x - 7, GROUND + 3); ctx.lineTo(x + 7, GROUND + 3); ctx.lineTo(x + 2, GROUND - 16); ctx.lineTo(x - 2, GROUND - 16); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#F3F5EE'; ctx.fillRect(x - 4.5, GROUND - 8, 9, 2.5);
    } else if (pr.type === 'wall') {
      ctx.fillStyle = '#3A4660'; ctx.fillRect(x, 60, 26, GROUND - 58);
      ctx.fillStyle = 'rgba(255,255,255,.08)';
      for (let y = 64; y < GROUND; y += 14) ctx.fillRect(x, y, 26, 1);
    } else if (pr.type === 'goal') {
      ctx.strokeStyle = '#F3F5EE'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(x, GROUND + 2); ctx.lineTo(x, GROUND - 80); ctx.lineTo(x + 40, GROUND - 80); ctx.stroke();
      ctx.strokeStyle = 'rgba(243,245,238,.28)'; ctx.lineWidth = 1;
      for (let i = 0; i <= 8; i++) { ctx.beginPath(); ctx.moveTo(x + i * 5, GROUND - 80); ctx.lineTo(x + 40, GROUND - 80 + i * 10); ctx.stroke(); }
      for (let i = 0; i <= 8; i++) { ctx.beginPath(); ctx.moveTo(x, GROUND - 80 + i * 10); ctx.lineTo(x + 40, GROUND - 80 + i * 10); ctx.stroke(); }
    } else if (pr.type === 'bench') {
      ctx.fillStyle = '#5A3E2B'; ctx.fillRect(x - 40, GROUND - 46, 80, 8);
      ctx.fillStyle = '#3C2A1D'; ctx.fillRect(x - 34, GROUND - 38, 6, 40); ctx.fillRect(x + 28, GROUND - 38, 6, 40);
    } else if (pr.type === 'mat') {
      ctx.fillStyle = '#2B3A5A'; ctx.fillRect(x - 100, GROUND - 2, 200, 6);
    } else if (pr.type === 'flash') {
      const on = t % 1 > pr.at && t % 1 < pr.at + 0.06;
      ctx.fillStyle = on ? '#FFB21A' : 'rgba(255,178,26,.2)';
      ctx.beginPath(); ctx.arc(x, 40, 9, 0, Math.PI * 2); ctx.fill();
    }
  }
}

// ── Доп траекториясы ──
function ballAt(def, u, fig) {
  const ks = def.ball;
  if (!ks) return null;
  const res = (k) => {
    if (k.at) {
      const part = k.at;
      const pt = part === 'head' ? fig.head : part === 'chest' ? lerp2(fig.hip, fig.sh, 0.8)
        : part === 'handR' ? fig.aR.wr : part === 'handL' ? fig.aL.wr
        : part === 'toeR' ? fig.lR.toe : part === 'toeL' ? fig.lL.toe
        : part === 'kneeR' ? fig.lR.kn : part === 'kneeL' ? fig.lL.kn : fig.hip;
      return [pt[0] + (k.dx || 0) * fig.face, pt[1] + (k.dy || 0)];
    }
    return [k.x, k.y ?? GROUND - BALL_R];
  };
  let i = ks.length - 1;
  for (let j = 0; j < ks.length; j++) { if (ks[j].t > u) { i = j - 1; break; } }
  if (i < 0) return { pos: res(ks[0]), hide: ks[0].hide };
  const a = ks[i], b = ks[Math.min(i + 1, ks.length - 1)];
  if (a === b || a.hold) return { pos: res(a), hide: a.hide };
  const t = (u - a.t) / (b.t - a.t);
  const pa = res(a), pb = res(b);
  const arc = b.arc || 0;
  return { pos: [pa[0] + (pb[0] - pa[0]) * t, pa[1] + (pb[1] - pa[1]) * t - arc * 4 * t * (1 - t)], hide: a.hide };
}

// ── Қимылдар кітапханасы ──
const RUN_A = P({ tl: 14, hR: 32, kR: -14, fR: 6, hL: -26, kL: -98, fL: -22, sL: 50, eL: 88, sR: -44, eR: 96, lift: 3 });
const RUN_B = P({ tl: 14, hR: 2, kR: -24, fR: 0, hL: 58, kL: -112, fL: 4, sL: 6, eL: 82, sR: -6, eR: 82, lift: -2 });
const runKeys = (k = 1, tl = 14) => {
  const a = scale(RUN_A, k, { tl }), b = scale(RUN_B, k, { tl, lift: -2 * k });
  return [[0, a], [0.25, b], [0.5, mirror(a)], [0.75, mirror(b)]];
};
const STAND = P();
const READY = P({ tl: 10, hL: 18, kL: -34, hR: -8, kR: -30, sL: 20, eL: 60, sR: 10, eR: 60 });
const GK_SET = P({ tl: 16, hL: 26, kL: -50, hR: 14, kR: -46, fL: 6, fR: 6, sL: 60, eL: 50, sR: 70, eR: 45 });
const SIT = P({ seat: 46, tl: -2, hL: 88, kL: -88, hR: 84, kR: -84, sL: 24, eL: 64, sR: 28, eR: 60 });

export const MOTIONS = {
  sprint: { dur: 0.66, loop: true, scroll: 380, keys: runKeys(1, 16), cap: 'Алға еңкей, қолдар 90° бүгілген, жерге аяқтың алдыңғы жағымен тиіс' },
  jog: { dur: 0.9, loop: true, scroll: 170, keys: runKeys(0.55, 7), cap: 'Жеңіл жүгіріс: тыныс біркелкі, иық бос' },
  intervals: {
    dur: 6, loop: true,
    keys: [[0, scale(RUN_A, 0.55, { tl: 7 })], [0.06, scale(RUN_B, 0.55, { tl: 7 })], [0.12, mirror(scale(RUN_A, 0.55, { tl: 7 }))], [0.18, mirror(scale(RUN_B, 0.55, { tl: 7 }))],
      [0.24, scale(RUN_A, 0.55, { tl: 7 })], [0.3, scale(RUN_B, 0.55, { tl: 7 })], [0.36, mirror(scale(RUN_A, 0.55, { tl: 7 }))], [0.42, mirror(scale(RUN_B, 0.55, { tl: 7 }))],
      [0.5, RUN_A], [0.56, RUN_B], [0.62, mirror(RUN_A)], [0.68, mirror(RUN_B)], [0.74, RUN_A], [0.8, RUN_B], [0.86, mirror(RUN_A)], [0.93, mirror(RUN_B)]],
    scroll: 260, cues: [[0, 0.48, '4 мин: орташа қарқын'], [0.5, 1, '4 мин: жоғары қарқын']], cap: 'Жүрек соғысы жоғарылайды, бірақ сөйлей алатындай бол',
  },
  plyo: {
    dur: 2.2, loop: true,
    keys: [[0, STAND], [0.18, P({ tl: 34, hL: 74, kL: -112, hR: 70, kR: -110, fL: 18, fR: 18, sL: -55, eL: 10, sR: -60, eR: 10 })],
      [0.32, P({ tl: 2, hL: -4, kL: -2, hR: -6, kR: -2, fL: -35, fR: -35, sL: 165, eL: 5, sR: 160, eR: 5, lift: 28 })],
      [0.46, P({ tl: 8, hL: 20, kL: -30, hR: 18, kR: -28, fL: -10, fR: -10, sL: 70, eL: 20, sR: 64, eR: 20, lift: 10 })],
      [0.58, P({ tl: 30, hL: 70, kL: -106, hR: 66, kR: -104, fL: 16, fR: 16, sL: 40, eL: 50, sR: 36, eR: 50 })], [0.8, STAND]],
    cap: 'Терең отыр, қолды сермеп жоғары атыл, тізені бүгіп жұмсақ қон',
  },
  core: {
    dur: 4, loop: true, scaleFig: 0.95, figX: 190, props: [{ type: 'mat', x: 200 }],
    keys: [[0, P({ tl: 98, hd: -12, sL: 4, eL: 88, sR: -4, eR: 92, hL: -82, kL: 0, fL: -8, hR: -84, kR: 0, fR: -8 })],
      [0.25, P({ tl: 98, hd: -12, sL: 4, eL: 88, sR: -4, eR: 92, hL: -82, kL: 0, fL: -8, hR: -110, kR: 0, fR: -40 })],
      [0.5, P({ tl: 98, hd: -12, sL: 4, eL: 88, sR: -4, eR: 92, hL: -82, kL: 0, fL: -8, hR: -84, kR: 0, fR: -8 })],
      [0.75, P({ tl: 98, hd: -12, sL: 4, eL: 88, sR: -4, eR: 92, hL: -110, kL: 0, fL: -40, hR: -84, kR: 0, fR: -8 })]],
    cap: 'Денең бір түзу сызық: жамбасты түсірме де, көтерме де',
  },
  balance: {
    dur: 3.2, loop: true,
    keys: [[0, P({ tl: 2, hL: 0, kL: -6, hR: 70, kR: -90, sL: 40, eL: 20, sR: -30, eR: 20 })],
      [0.25, P({ tl: 6, hL: 2, kL: -8, hR: 72, kR: -92, sL: 55, eL: 15, sR: -15, eR: 25 })],
      [0.5, P({ tl: -2, hL: -1, kL: -5, hR: 68, kR: -88, sL: 25, eL: 25, sR: -45, eR: 15 })],
      [0.75, P({ tl: 4, hL: 1, kL: -7, hR: 70, kR: -90, sL: 45, eL: 18, sR: -25, eR: 22 })]],
    cap: 'Бір аяқта тұр, тізе сәл бүгілген, денені қолмен теңестір',
  },
  breathe: {
    dur: 16, loop: true, figX: 200, props: [{ type: 'bench', x: 196 }],
    keys: [[0, SIT], [0.25, P({ ...SIT, tl: -6, sL: 20, sR: 24, hd: -6 })], [0.5, P({ ...SIT, tl: -6, sL: 20, sR: 24, hd: -6 })], [0.75, SIT]],
    cues: [[0, 0.25, 'Мұрынмен дем ал: 4'], [0.25, 0.5, 'Ұстап тұр: 4'], [0.5, 0.75, 'Аузыңмен шығар: 4'], [0.75, 1, 'Ұстап тұр: 4']],
    ring: true, cap: 'Иықты көтерме: ауа ішке, кеуде емес, іш толады',
  },
  visualize: {
    dur: 6, loop: true, figX: 150, props: [{ type: 'bench', x: 146 }],
    keys: [[0, P({ ...SIT, hd: 14, eye: 0 })], [0.5, P({ ...SIT, tl: -4, hd: 10, eye: 0 })]],
    dream: true, cap: 'Көзіңді жұмып, сәтті ойыңды бар бөлшегімен елестет',
  },
  reset: {
    dur: 4, loop: true,
    keys: [[0, P({ tl: 18, hd: 20, sL: 10, sR: 6 })], [0.3, P({ tl: -4, hd: -12, sL: 14, eL: 10, sR: 10, eR: 10 })],
      [0.5, P({ tl: 2, sL: 10, eL: 30, sR: 30, eR: 70 })], [0.62, P({ tl: 4, sR: 10, eR: 40, sL: 8 })], [0.8, P({ tl: 0, sL: 20, eL: 60, sR: 18, eR: 60 })]],
    cues: [[0, 0.3, 'Қате болды'], [0.3, 0.5, 'Терең дем'], [0.5, 0.7, '«Қайта жүктеу» белгісі'], [0.7, 1, 'Келесі әрекетке дайын']],
    cap: 'Қателікті ойлама: дем ал, белгі жаса, келесі допқа назар аудар',
  },
  write: {
    dur: 2.4, loop: true, figX: 200, props: [{ type: 'bench', x: 196 }], pad: true,
    keys: [[0, P({ ...SIT, tl: 14, hd: 22, sR: 40, eR: 70, sL: 34, eL: 60 })], [0.25, P({ ...SIT, tl: 14, hd: 22, sR: 44, eR: 66, sL: 34, eL: 60 })],
      [0.5, P({ ...SIT, tl: 14, hd: 22, sR: 38, eR: 74, sL: 34, eL: 60 })], [0.75, P({ ...SIT, tl: 14, hd: 22, sR: 46, eR: 64, sL: 34, eL: 60 })]],
    cap: 'Нақты, өлшенетін, әрекетке қатысты етіп жаз',
  },
  wallpass: {
    dur: 2.6, loop: true, figX: 140, props: [{ type: 'wall', x: 330 }],
    keys: [[0, READY], [0.12, P({ ...READY, hR: -40, kR: -60, fR: 10, sL: 30, sR: -20 })], [0.2, P({ ...READY, hR: 30, kR: -10, fR: 20, sL: -20, sR: 30 })],
      [0.32, READY], [0.62, P({ ...READY, hL: 10, kL: -40 })], [0.7, P({ ...READY, hL: -40, kL: -60, fL: 10 })], [0.78, P({ ...READY, hL: 28, kL: -10, fL: 20 })], [0.9, READY]],
    ball: [{ t: 0, x: 168, hold: true }, { t: 0.2, x: 168 }, { t: 0.4, x: 318 }, { t: 0.62, x: 168, hold: true }, { t: 0.78, x: 168 }, { t: 0.95, x: 318 }, { t: 1, x: 168 }],
    cap: 'Аяқтың ішкі жағымен соқ, тірек аяқ доптың жанында',
  },
  juggle: {
    dur: 1.2, loop: true,
    keys: [[0, P({ tl: 4, hL: -2, kL: -10, hR: 58, kR: -46, fR: 12, sL: 30, eL: 30, sR: -20, eR: 30 })], [0.25, P({ tl: 4, hL: 0, kL: -12, hR: 4, kR: -8, sL: 20, eL: 30, sR: -10, eR: 30 })],
      [0.5, P({ tl: 4, hR: -2, kR: -10, hL: 58, kL: -46, fL: 12, sR: 30, eR: 30, sL: -20, eL: 30 })], [0.75, P({ tl: 4, hR: 0, kR: -12, hL: 4, kL: -8, sR: 20, eR: 30, sL: -10, eL: 30 })]],
    ball: [{ t: 0, at: 'toeR', dx: -2, dy: -12 }, { t: 0.5, at: 'toeL', dx: -2, dy: -12, arc: 80 }, { t: 1, at: 'toeR', dx: -2, dy: -12, arc: 80 }],
    cap: 'Аяқ ұшы сәл жоғары, допты белдеуден төмен биіктікке соқ',
  },
  dribble: {
    dur: 0.9, loop: true, scroll: 150, keys: runKeys(0.45, 10),
    props: [{ type: 'cone', x: 60, moving: true, wrap: 300 }, { type: 'cone', x: 160, moving: true, wrap: 300 }, { type: 'cone', x: 260, moving: true, wrap: 300 }],
    ball: [{ t: 0, at: 'toeR', dx: 14, dy: -8 }, { t: 0.5, at: 'toeL', dx: 14, dy: -8 }, { t: 1, at: 'toeR', dx: 14, dy: -8 }],
    cap: 'Әр қадамда жеңіл жанасу, доп аяқтан бір қадамнан алыс кетпейді',
  },
  receive: {
    dur: 2.6, loop: true, figX: 200,
    keys: [[0, P({ ...READY, face: -1, hd: 10 })], [0.15, P({ ...READY, face: -1, hd: -30 })], [0.3, P({ ...READY, face: -1 })],
      [0.42, P({ ...READY, face: -1, hR: -30, kR: -30 })], [0.52, P({ ...READY, face: 1, tl: 12 })], [0.62, scale(RUN_A, 0.5, { tl: 12, face: 1, x: 20 })],
      [0.74, scale(mirror(RUN_A), 0.5, { tl: 12, face: 1, x: 60 })], [0.86, scale(RUN_A, 0.5, { tl: 12, face: 1, x: 100 })], [0.99, P({ ...READY, x: 0, face: -1 })]],
    ball: [{ t: 0, x: 40 }, { t: 0.42, at: 'toeR', dx: -6, dy: -8 }, { t: 0.62, at: 'toeR', dx: 16, dy: -8 }, { t: 0.74, at: 'toeL', dx: 16, dy: -8 }, { t: 0.86, at: 'toeR', dx: 16, dy: -8 }, { t: 0.95, x: 380, hide: true }, { t: 1, x: 40, hide: true }],
    cues: [[0, 0.3, 'Иық арқылы қара'], [0.3, 0.52, 'Артқы аяқпен қабылда'], [0.52, 1, 'Алға бұрылып кет']],
    cap: 'Денені ашық ұста: допты алыс аяқпен қабылдап, бірден алға бұрыл',
  },
  shoot: {
    dur: 2.4, loop: true, figX: 120, props: [{ type: 'goal', x: 350 }],
    keys: [[0, P({ x: -60 })], [0.14, scale(RUN_A, 0.6, { tl: 10, x: -40 })], [0.26, scale(mirror(RUN_A), 0.6, { tl: 10, x: -14 })],
      [0.36, P({ tl: -4, x: 0, hL: 10, kL: -18, hR: -58, kR: -118, fR: -40, sL: 70, eL: 10, sR: -40, eR: 20 })],
      [0.44, P({ tl: 8, x: 6, hL: 6, kL: -14, hR: 30, kR: -10, fR: -45, sL: 30, eL: 30, sR: 30, eR: 30 })],
      [0.56, P({ tl: 14, x: 14, hL: 0, kL: -10, hR: 80, kR: -12, fR: -40, sL: -20, eL: 20, sR: 60, eR: 30, lift: 4 })], [0.8, P({ x: 20 })], [0.99, P({ x: -60 })]],
    ball: [{ t: 0, x: 140 }, { t: 0.42, x: 140, hold: true }, { t: 0.44, x: 140 }, { t: 0.6, x: 372, y: 160, arc: 20 }, { t: 0.75, x: 380, y: 196, hide: false }, { t: 0.9, x: 380, y: 194, hide: true }, { t: 1, x: 140, hide: true }],
    cap: 'Тірек аяқ доптың жанында, бас пен кеуде доптың үстінде, бұрышқа көзде',
  },
  gkcatch: {
    dur: 2.2, loop: true, kit: 'gk', figX: 150,
    keys: [[0, GK_SET], [0.3, GK_SET], [0.42, P({ tl: 6, hL: 14, kL: -22, hR: 6, kR: -20, sL: 92, eL: 30, sR: 96, eR: 28 })],
      [0.55, P({ tl: 12, hL: 16, kL: -26, hR: 8, kR: -24, sL: 40, eL: 100, sR: 44, eR: 98 })], [0.8, P({ tl: 4, sL: 30, eL: 110, sR: 34, eR: 106 })], [0.99, GK_SET]],
    ball: [{ t: 0, x: 420, y: 120, hide: true }, { t: 0.05, x: 420, y: 120 }, { t: 0.42, at: 'handR', dx: 10, dy: -2, arc: 14 }, { t: 0.55, at: 'chest', dx: 14 }, { t: 0.85, at: 'chest', dx: 14 }, { t: 0.9, at: 'chest', dx: 14, hide: true }, { t: 1, x: 420, y: 120, hide: true }],
    cap: 'Саусақтар «W» пішінінде, допты ұстап, бірден кеудеге тарт',
  },
  gkdive: {
    dur: 2.8, loop: true, kit: 'gk', figX: 150,
    keys: [[0, GK_SET], [0.12, P({ ...GK_SET, x: 14, hL: 34, hR: 0 })], [0.24, P({ ...GK_SET, x: 28 })], [0.36, P({ ...GK_SET, x: 42, hL: 34, hR: 0 })],
      [0.46, P({ ...GK_SET, x: 50, tl: 30, hL: 40, kL: -70 })],
      [0.58, P({ tl: 80, x: 110, hL: -60, kL: -20, hR: -70, kR: -10, sL: 175, eL: 5, sR: 170, eR: 5, lift: 34 })],
      [0.72, P({ tl: 92, x: 140, hL: -80, kL: -10, hR: -84, kR: -6, sL: 180, eL: 0, sR: 176, eR: 0, lift: 0 })], [0.86, P({ ...GK_SET, x: 120 })], [0.99, P({ ...GK_SET, x: 0 })]],
    ball: [{ t: 0, x: 420, y: 150, hide: true }, { t: 0.46, x: 420, y: 150 }, { t: 0.6, at: 'handR', dx: 8, arc: 6 }, { t: 0.74, at: 'handR', dx: 8 }, { t: 0.8, at: 'handR', dx: 8, hide: true }, { t: 1, x: 420, y: 150, hide: true }],
    cap: 'Бүйірге қысқа қадамдар, сосын жақын аяқпен итеріліп, қолды созып секір',
  },
  heading: {
    dur: 2.4, loop: true, figX: 160,
    keys: [[0, READY], [0.3, P({ ...READY, tl: 14, hL: 40, kL: -70, hR: 30, kR: -64, sL: 60, sR: 70 })],
      [0.42, P({ tl: -14, hd: -10, hL: -6, kL: -30, hR: -10, kR: -40, fL: -30, fR: -30, sL: 90, eL: 40, sR: 100, eR: 40, lift: 26 })],
      [0.5, P({ tl: 22, hd: 6, hL: 10, kL: -20, hR: 0, kR: -30, fL: -20, fR: -20, sL: 20, eL: 40, sR: 30, eR: 40, lift: 24 })], [0.66, READY]],
    ball: [{ t: 0, x: 420, y: 60, hide: true }, { t: 0.1, x: 420, y: 60 }, { t: 0.5, at: 'head', dx: 14, dy: -4, arc: 40 }, { t: 0.8, x: 420, y: 40, arc: 30 }, { t: 0.85, x: 430, y: 40, hide: true }, { t: 1, x: 420, y: 60, hide: true }],
    cap: 'Маңдаймен соқ, көзді жұмба, мойын мен тұлға бірге қозғалады',
  },
  backpedal: {
    dur: 2.4, loop: true, figX: 200,
    keys: [[0, P({ tl: 14, hL: 26, kL: -50, hR: 6, kR: -44, sL: 30, eL: 60, sR: -10, eR: 60, x: 60 })], [0.12, P({ tl: 14, hL: 6, kL: -44, hR: 26, kR: -50, sR: 30, eR: 60, sL: -10, eL: 60, x: 36 })],
      [0.24, P({ tl: 14, hL: 26, kL: -50, hR: 6, kR: -44, sL: 30, eL: 60, sR: -10, eR: 60, x: 12 })], [0.36, P({ tl: 14, hL: 6, kL: -44, hR: 26, kR: -50, sR: 30, eR: 60, sL: -10, eL: 60, x: -12 })],
      [0.46, P({ tl: 18, hL: 30, kL: -60, hR: 10, kR: -50, x: -24, face: -1 })], [0.58, scale(RUN_A, 0.8, { tl: 16, face: -1, x: -60 })], [0.7, scale(mirror(RUN_A), 0.8, { tl: 16, face: -1, x: -110 })],
      [0.82, scale(RUN_A, 0.8, { tl: 16, face: -1, x: -160 })], [0.99, P({ tl: 14, hL: 26, kL: -50, hR: 6, kR: -44, x: 60 })]],
    cues: [[0, 0.44, 'Артқа: қысқа қадамдар'], [0.44, 1, 'Жамбасты бұрып, жүгір']],
    cap: 'Денені алға еңкейт, артқа қысқа қадамдар, сосын жамбасты бұрып спринт',
  },
  scan: {
    dur: 3, loop: true, figX: 200,
    keys: [[0, P({ ...READY, hd: 0 })], [0.12, P({ ...READY, tl: 4, hd: -40, face: 1 })], [0.2, P({ ...READY, hd: 0 })], [0.32, P({ ...READY, hd: -40, face: -1 })], [0.4, P({ ...READY })],
      [0.55, P({ ...READY, hR: -36, kR: -50 })], [0.62, P({ ...READY, hR: 30, kR: -10, fR: 20 })], [0.75, READY]],
    ball: [{ t: 0, x: 440, hide: true }, { t: 0.3, x: 440 }, { t: 0.6, at: 'toeR', dx: 10, dy: -8 }, { t: 0.62, at: 'toeR', dx: 10, dy: -8 }, { t: 0.85, x: -30 }, { t: 0.9, x: -40, hide: true }, { t: 1, x: 440, hide: true }],
    cues: [[0, 0.42, 'Доп келгенше екі жаққа қара'], [0.42, 1, 'Бір жанасумен бер']],
    vision: true, cap: 'Доп келмей тұрып бас бұрып қара: шешім алдын ала дайын болады',
  },
  finish: {
    dur: 2.2, loop: true, figX: 170, props: [{ type: 'goal', x: 350 }],
    keys: [[0, READY], [0.3, READY], [0.4, P({ tl: -2, hL: 8, kL: -18, hR: -50, kR: -100, fR: -40, sL: 60, eL: 10, sR: -30, eR: 20 })],
      [0.48, P({ tl: 10, hL: 4, kL: -14, hR: 50, kR: -10, fR: -40, sL: 10, eL: 30, sR: 40, eR: 30 })], [0.7, READY]],
    ball: [{ t: 0, x: 0, hide: true }, { t: 0.05, x: 0 }, { t: 0.46, at: 'toeR', dx: 6, dy: -8 }, { t: 0.62, x: 372, y: 150, arc: 10 }, { t: 0.72, x: 380, y: 194 }, { t: 0.8, x: 380, y: 194, hide: true }, { t: 1, x: 0, hide: true }],
    cap: 'Доп келгенге дейін денені қақпаға бұр, бір жанасумен бұрышқа',
  },
  start: {
    dur: 2.2, loop: true, figX: 100, props: [{ type: 'flash', x: 340, at: 0.2 }],
    keys: [[0, P({ tl: 34, hL: 50, kL: -80, hR: -6, kR: -40, sL: -30, eL: 70, sR: 40, eR: 70 })], [0.2, P({ tl: 34, hL: 50, kL: -80, hR: -6, kR: -40, sL: -30, eL: 70, sR: 40, eR: 70 })],
      [0.3, P({ tl: 40, hL: -20, kL: -40, hR: 70, kR: -100, sL: 60, eL: 80, sR: -50, eR: 90, x: 20 })], [0.42, scale(RUN_A, 1, { tl: 30, x: 70 })], [0.54, scale(mirror(RUN_A), 1, { tl: 22, x: 130 })],
      [0.66, scale(RUN_A, 1, { tl: 18, x: 190 })], [0.8, scale(mirror(RUN_B), 1, { tl: 16, x: 250 })], [0.99, P({ tl: 34, hL: 50, kL: -80, hR: -6, kR: -40, x: 0 })]],
    cues: [[0, 0.2, 'Жартылай бұрылып, төмен тұр'], [0.2, 1, 'Белгі! Алғашқы 3 қадам қысқа әрі жылдам']],
    cap: 'Денені алға еңкейтіп, алғашқы қадамдарды қысқа әрі қуатты жаса',
  },
  zigzag: {
    dur: 2, loop: true, figX: 200,
    props: [{ type: 'cone', x: 90 }, { type: 'cone', x: 200 }, { type: 'cone', x: 310 }],
    keys: [[0, scale(RUN_A, 0.8, { tl: 16, x: -110 })], [0.12, scale(RUN_B, 0.8, { tl: 16, x: -70 })], [0.22, P({ tl: 20, hL: 40, kL: -70, hR: -30, kR: -30, x: -40, sL: -30, sR: 40 })],
      [0.3, scale(mirror(RUN_A), 0.8, { tl: 16, x: -10 })], [0.4, scale(mirror(RUN_B), 0.8, { tl: 16, x: 30 })], [0.5, P({ tl: 20, hR: 40, kR: -70, hL: -30, kL: -30, x: 60, sR: -30, sL: 40 })],
      [0.6, scale(RUN_A, 0.8, { tl: 16, x: 90 })], [0.72, P({ tl: 20, hL: 40, kL: -70, hR: -30, kR: -30, x: 110 })], [0.86, P({ ...READY, x: 110 })], [0.99, scale(RUN_A, 0.8, { tl: 16, x: -110 })]],
    cap: 'Конус жанында денені төмен түсіріп, сыртқы аяқпен итеріліп бағытты өзгерт',
  },
};

// Жаттығу / сабақ → қимыл
export const MOTION_FOR = {
  'tac-counter-width': 'sprint', 'tac-triangles': 'wallpass', 'tac-press-trap': 'backpedal', 'tac-line-step-up': 'jog',
  'tac-third-man': 'scan', 'tac-counter-press': 'sprint',
  'phy-sprints': 'sprint', 'phy-agility': 'zigzag', 'phy-plyo': 'plyo', 'phy-core': 'core', 'phy-intervals': 'intervals',
  'phy-injury-prevention': 'balance', 'phy-gk-reflex': 'gkdive', 'phy-def-backpedal': 'backpedal', 'phy-mid-repeat': 'intervals', 'phy-fwd-acceleration': 'start',
  'men-box-breathing': 'breathe', 'men-visualization': 'visualize', 'men-reset': 'reset', 'men-goals': 'write', 'men-self-talk': 'reset', 'men-review': 'write',
  'tec-wall-pass': 'wallpass', 'tec-juggling': 'juggle', 'tec-dribble-cones': 'dribble', 'tec-open-body': 'receive', 'tec-shooting': 'shoot',
  'tec-gk-handling': 'gkcatch', 'tec-def-heading': 'heading', 'tec-mid-scan': 'scan', 'tec-fwd-finishing': 'finish',
  'les-gk-angle': 'gkdive', 'les-gk-box': 'gkcatch', 'les-def-1v1': 'backpedal', 'les-def-cross': 'heading',
  'les-mid-scan': 'scan', 'les-mid-screen': 'backpedal', 'les-fwd-runs': 'start', 'les-fwd-box': 'finish',
};

// ── Ойнатқыш ──
export function drawFrame(ctx, name, time) {
  const def = MOTIONS[name];
  const u = (time / def.dur) % 1;
  const scrollX = (def.scroll || 0) * time;
  drawStage(ctx, u, def, scrollX);
  drawProps(ctx, def, scrollX, u);
  const pose = samplePose(def.keys, u, def.loop);
  const fig = place(pose, def.figX ?? 170, def.scaleFig ?? 0.95);
  const kit = KITS[def.kit || 'field'];
  const b = ballAt(def, u, fig);
  const ballBehind = b && !b.hide && def.ballBehind;
  if (ballBehind) drawBall(ctx, b.pos[0], b.pos[1], b.pos[0] / BALL_R);
  if (def.vision) {
    const hd = pose.hd;
    if (hd < -15) {
      const [hx, hy] = fig.head; const dir = -fig.face;
      const g = ctx.createRadialGradient(hx, hy, 4, hx, hy, 160);
      g.addColorStop(0, 'rgba(127,178,255,.35)'); g.addColorStop(1, 'rgba(127,178,255,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(hx + dir * 170, hy - 50); ctx.lineTo(hx + dir * 170, hy + 60); ctx.closePath(); ctx.fill();
    }
  }
  drawFigure(ctx, fig, kit);
  if (def.pad) {
    const [x, y] = fig.aL.wr;
    ctx.fillStyle = '#F3F5EE'; ctx.save(); ctx.translate(x + 6, y - 2); ctx.rotate(-0.25); ctx.fillRect(-2, -10, 26, 18);
    ctx.fillStyle = '#7FB2FF'; for (let i = 0; i < 4; i++) ctx.fillRect(2, -6 + i * 4, 16 - (i % 2) * 5, 1.2); ctx.restore();
  }
  if (b && !b.hide && !ballBehind) drawBall(ctx, b.pos[0], b.pos[1], (b.pos[0] + scrollX) / BALL_R);
  if (def.ring) {
    const ph = u * 4, seg = Math.floor(ph), k = ph - seg;
    const r = seg === 0 ? 14 + 22 * k : seg === 1 ? 36 : seg === 2 ? 36 - 22 * k : 14;
    ctx.strokeStyle = 'rgba(127,178,255,.85)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(320, 70, r, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = 'rgba(127,178,255,.25)'; ctx.lineWidth = 1; ctx.strokeRect(284, 34, 72, 72);
  }
  if (def.dream) {
    // ой бұлты: шағын алаңда доп қақпаға кіреді
    const x0 = 230, y0 = 30, w = 150, h = 84;
    ctx.fillStyle = 'rgba(7,15,29,.75)'; ctx.strokeStyle = 'rgba(243,245,238,.35)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.roundRect(x0, y0, w, h, 10); ctx.fill(); ctx.stroke();
    [[x0 - 14, y0 + h + 4, 5], [x0 - 26, y0 + h + 16, 3]].forEach(([cx, cy, r]) => { ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); });
    ctx.fillStyle = '#145A3D'; ctx.fillRect(x0 + 8, y0 + 8, w - 16, h - 16);
    ctx.strokeStyle = 'rgba(255,255,255,.6)'; ctx.strokeRect(x0 + 8, y0 + 8, w - 16, h - 16);
    ctx.strokeRect(x0 + w - 30, y0 + 26, 22, 32);
    const k = u < 0.7 ? u / 0.7 : 1;
    const bx = x0 + 30 + (w - 50) * k, by = y0 + h / 2 + Math.sin(k * Math.PI) * -14;
    ctx.fillStyle = '#FFB21A'; ctx.beginPath(); ctx.arc(x0 + 30 + (w - 70) * Math.min(1, k * 1.2), y0 + h / 2 + 10, 4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(bx, by, 3, 0, Math.PI * 2); ctx.fill();
    if (u > 0.72) { ctx.fillStyle = '#FFB21A'; ctx.font = '600 14px Oswald, sans-serif'; ctx.fillText('ГОЛ!', x0 + 14, y0 + 24); }
  }
  // тақырыпша
  const cue = (def.cues || []).find(([a, z]) => u >= a && u < z);
  if (cue) {
    ctx.font = '600 15px Oswald, "Arial Narrow", sans-serif';
    const tw = ctx.measureText(cue[2]).width;
    ctx.fillStyle = 'rgba(7,15,29,.82)'; ctx.beginPath(); ctx.roundRect(12, 12, tw + 20, 26, 4); ctx.fill();
    ctx.fillStyle = '#FFB21A'; ctx.fillText(cue[2], 22, 30);
  }
}

export function mountMotion(canvas, name, { onState } = {}) {
  const def = MOTIONS[name];
  if (!def || !canvas.getContext) return () => {};
  const ctx = canvas.getContext('2d');
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = W * dpr; canvas.height = H * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  let playing = !still, speed = 1, t = def.dur * 0.35, last = 0, raf = 0, visible = true;
  const frame = (now) => {
    if (last) t += ((now - last) / 1000) * speed;
    last = now;
    drawFrame(ctx, name, t);
    if (playing && visible) raf = requestAnimationFrame(frame); else { raf = 0; last = 0; }
  };
  const start = () => { if (!raf && playing && visible) raf = requestAnimationFrame(frame); };
  drawFrame(ctx, name, t);
  const io = 'IntersectionObserver' in window ? new IntersectionObserver(([e]) => { visible = e.isIntersecting; start(); }) : null;
  io?.observe(canvas);
  start();
  const api = {
    toggle() { playing = !playing; if (playing) start(); onState?.({ playing, speed }); return playing; },
    setSpeed(s) { speed = s; onState?.({ playing, speed }); },
    stop() { playing = false; cancelAnimationFrame(raf); io?.disconnect(); },
  };
  onState?.({ playing, speed });
  return api;
}
