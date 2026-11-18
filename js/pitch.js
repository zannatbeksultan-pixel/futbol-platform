// Тактикалық схеманы SVG ретінде салу. Алаң тігінен: ені 68, ұзындығы 105.
const W = 68;
const H = 105;

const ARROW_COLORS = { run: '#FFFFFF', pass: '#FDE047', drib: '#38BDF8' };

function lines() {
  const s = 'stroke="rgba(255,255,255,.55)" stroke-width=".35" fill="none"';
  const paW = 40.32, paD = 16.5, gaW = 18.32, gaD = 5.5;
  const paX = (W - paW) / 2, gaX = (W - gaW) / 2;
  return `
    <rect x="1" y="1" width="${W - 2}" height="${H - 2}" ${s}/>
    <line x1="1" y1="${H / 2}" x2="${W - 1}" y2="${H / 2}" ${s}/>
    <circle cx="${W / 2}" cy="${H / 2}" r="9.15" ${s}/>
    <circle cx="${W / 2}" cy="${H / 2}" r=".5" fill="rgba(255,255,255,.6)"/>
    <rect x="${paX}" y="1" width="${paW}" height="${paD}" ${s}/>
    <rect x="${gaX}" y="1" width="${gaW}" height="${gaD}" ${s}/>
    <rect x="${paX}" y="${H - 1 - paD}" width="${paW}" height="${paD}" ${s}/>
    <rect x="${gaX}" y="${H - 1 - gaD}" width="${gaW}" height="${gaD}" ${s}/>
    <circle cx="${W / 2}" cy="12" r=".45" fill="rgba(255,255,255,.6)"/>
    <circle cx="${W / 2}" cy="${H - 12}" r=".45" fill="rgba(255,255,255,.6)"/>
    <path d="M ${W / 2 - 7.3} 17.5 A 9.15 9.15 0 0 0 ${W / 2 + 7.3} 17.5" ${s}/>
    <path d="M ${W / 2 - 7.3} ${H - 17.5} A 9.15 9.15 0 0 1 ${W / 2 + 7.3} ${H - 17.5}" ${s}/>
    <rect x="${W / 2 - 3.66}" y="-.6" width="7.32" height="1.6" fill="none" stroke="rgba(255,255,255,.8)" stroke-width=".4"/>
    <rect x="${W / 2 - 3.66}" y="${H - 1}" width="7.32" height="1.6" fill="none" stroke="rgba(255,255,255,.8)" stroke-width=".4"/>`;
}

function stripes() {
  let out = '';
  const n = 10;
  for (let i = 0; i < n; i++) {
    if (i % 2 === 0) out += `<rect x="0" y="${(H / n) * i}" width="${W}" height="${H / n}" fill="rgba(255,255,255,.035)"/>`;
  }
  return out;
}

function arrowPath(a) {
  const { x1, y1, x2, y2 } = a;
  // соңын сәл қысқартамыз, жебе ойыншының үстіне түспеуі үшін
  const dx = x2 - x1, dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const ex = x2 - (dx / len) * 1.2, ey = y2 - (dy / len) * 1.2;
  if (a.curve) {
    const mx = (x1 + x2) / 2 - (dy / len) * a.curve;
    const my = (y1 + y2) / 2 + (dx / len) * a.curve;
    return `M ${x1} ${y1} Q ${mx} ${my} ${ex} ${ey}`;
  }
  if (a.k === 'drib') {
    // толқынды сызық
    const steps = Math.max(4, Math.round(len / 2.5));
    const nx = -dy / len, ny = dx / len;
    let d = `M ${x1} ${y1}`;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const off = (i === steps ? 0 : (i % 2 ? 0.8 : -0.8));
      d += ` L ${x1 + (ex - x1) * t + nx * off} ${y1 + (ey - y1) * t + ny * off}`;
    }
    return d;
  }
  return `M ${x1} ${y1} L ${ex} ${ey}`;
}

export function renderPitch(payload, { uid = 'p' } = {}) {
  const players = payload.players || [];
  const arrows = payload.arrows || [];
  const markers = Object.entries(ARROW_COLORS).map(([k, c]) => `
    <marker id="${uid}-m-${k}" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse">
      <path d="M 0 0 L 10 5 L 0 10 z" fill="${c}"/>
    </marker>`).join('');

  const arrowEls = arrows.map((a, i) => {
    const c = ARROW_COLORS[a.k] || '#fff';
    const dash = a.k === 'run' ? 'stroke-dasharray="1.4 1"' : '';
    return `<path class="pitch-arrow" style="animation-delay:${0.35 + i * 0.45}s" d="${arrowPath(a)}"
      stroke="${c}" stroke-width=".6" fill="none" stroke-linecap="round" ${dash} marker-end="url(#${uid}-m-${a.k})"/>`;
  }).join('');

  const playerEls = players.map((p) => {
    const fill = p.t === 'a' ? '#22E55B' : '#F43F5E';
    const text = p.t === 'a' ? '#06240F' : '#FFFFFF';
    const ring = p.hl
      ? `<circle cx="${p.x}" cy="${p.y}" r="3.2" fill="none" stroke="#FDE047" stroke-width=".5" class="pitch-pulse"/>`
      : '';
    return `<g class="pitch-player">${ring}
      <circle cx="${p.x}" cy="${p.y + 0.35}" r="2.3" fill="rgba(0,0,0,.35)"/>
      <circle cx="${p.x}" cy="${p.y}" r="2.3" fill="${fill}" stroke="rgba(255,255,255,.9)" stroke-width=".3"/>
      <text x="${p.x}" y="${p.y + 0.95}" text-anchor="middle" font-size="2.6" font-weight="800" fill="${text}" font-family="Inter,system-ui,sans-serif">${p.n}</text>
    </g>`;
  }).join('');

  const ball = payload.ball
    ? `<g><circle cx="${payload.ball.x}" cy="${payload.ball.y}" r="1.05" fill="#fff" stroke="#111" stroke-width=".25"/>
       <circle cx="${payload.ball.x}" cy="${payload.ball.y}" r=".38" fill="#111"/></g>`
    : '';

  return `<svg class="pitch" viewBox="-1 -2 ${W + 2} ${H + 4}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Тактикалық схема">
    <defs>
      <linearGradient id="${uid}-grass" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#14532D"/><stop offset="1" stop-color="#0F3D22"/>
      </linearGradient>
      ${markers}
    </defs>
    <rect x="-1" y="-2" width="${W + 2}" height="${H + 4}" rx="2" fill="url(#${uid}-grass)"/>
    ${stripes()}
    ${lines()}
    ${arrowEls}
    ${playerEls}
    ${ball}
  </svg>`;
}

export const LEGEND = [
  { k: 'run', label: 'Жүгіріс', dashed: true },
  { k: 'pass', label: 'Пас' },
  { k: 'drib', label: 'Доп жүргізу' },
].map((l) => ({ ...l, color: ARROW_COLORS[l.k] }));
