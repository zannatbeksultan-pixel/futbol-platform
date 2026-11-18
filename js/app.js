import { CATEGORIES, CATEGORY_ORDER, LEVELS, POSITIONS, AGE_GROUPS } from './data.js';
import * as store from './store.js';
import { state } from './store.js';
import { renderPitch, LEGEND } from './pitch.js';
import { icon, CATEGORY_ICON } from './icons.js';

const app = document.getElementById('app');
let cleanups = [];
const onLeave = (fn) => cleanups.push(fn);

// ───────────── Көмекші функциялар ─────────────
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = (n) => String(n).padStart(2, '0');
const dayKey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const today = () => dayKey();
const addDays = (key, n) => { const [y, m, d] = key.split('-').map(Number); return dayKey(new Date(y, m - 1, d + n)); };
const dayIndex = (key) => { const [y, m, d] = key.split('-').map(Number); return Math.floor(Date.UTC(y, m - 1, d) / 86400000); };
const fmt = (sec) => `${pad(Math.floor(Math.max(0, sec) / 60))}:${pad(Math.max(0, sec) % 60)}`;
const initials = (name) => (name || '?').trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase() || '?';
const WEEKDAYS = ['Жс', 'Дс', 'Сс', 'Ср', 'Бс', 'Жм', 'Сб'];
const XP_PER = 50;

const LS = {
  get(k, f) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : f; } catch { return f; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* */ } },
};

function toast(text) {
  let t = document.querySelector('.toast');
  if (!t) { t = document.createElement('div'); t.className = 'toast'; document.body.appendChild(t); }
  t.textContent = text;
  t.classList.add('show');
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.remove('show'), 2200);
}

// ───────────── Жоспар және статистика ─────────────
function poolFor(category) {
  const p = state.profile || {};
  return state.exercises.filter((e) => e.category === category
    && (e.levels || []).includes(p.level || 'beginner')
    && (!e.positions || e.positions.length === 0 || e.positions.includes(p.position)));
}

function planFor(day) {
  const idx = dayIndex(day);
  return CATEGORY_ORDER.map((cat, i) => {
    const pool = poolFor(cat);
    if (!pool.length) return null;
    return pool[(idx + i * 3) % pool.length];
  }).filter(Boolean);
}

const doneOn = (day) => state.completions.filter((c) => c.day === day);
const exById = (id) => state.exercises.find((e) => e.id === id);

function streak() {
  const days = new Set(state.completions.map((c) => c.day));
  let d = today();
  if (!days.has(d)) d = addDays(d, -1);
  let n = 0;
  while (days.has(d)) { n++; d = addDays(d, -1); }
  return n;
}

function bestStreak() {
  const days = [...new Set(state.completions.map((c) => c.day))].sort();
  let best = 0, cur = 0, prev = null;
  for (const d of days) {
    cur = prev && addDays(prev, 1) === d ? cur + 1 : 1;
    best = Math.max(best, cur);
    prev = d;
  }
  return best;
}

const xpTotal = () => state.completions.length * XP_PER;
const levelInfo = () => {
  const xp = xpTotal();
  const lvl = Math.floor(xp / 500) + 1;
  return { xp, lvl, into: xp % 500, need: 500 };
};

function minutesOn(day) {
  return doneOn(day).reduce((s, c) => s + (exById(c.exercise_id)?.duration_min || 0), 0);
}

function skillScores() {
  const since = addDays(today(), -29);
  const out = {};
  for (const cat of CATEGORY_ORDER) {
    const n = state.completions.filter((c) => c.category === cat && c.day >= since).length;
    out[cat] = Math.min(99, 40 + n * 4);
  }
  return out;
}

const quizLog = () => LS.get('fp_quiz', {});

// ───────────── Ортақ бөліктер ─────────────
function topbar({ eyebrow = 'Жаттықтырушы', title, back = false }) {
  const name = state.profile?.name || '';
  return `<header class="topbar">
    ${back
      ? `<button class="icon-btn" data-back aria-label="Артқа">${icon('arrowLeft', { size: 22 })}</button>`
      : `<div class="logo">${icon('ball', { size: 22 })}</div>`}
    <div class="titles">
      ${back ? '' : `<div class="eyebrow">${esc(eyebrow)}</div>`}
      <h1>${esc(title)}</h1>
    </div>
    ${back ? '' : `<button class="icon-btn" aria-label="Хабарламалар" data-bell>${icon('bell', { size: 22 })}</button>`}
    <a href="#/profile" class="avatar" aria-label="Профиль">${esc(initials(name))}</a>
  </header>`;
}

function nav(active) {
  const items = [
    ['home', '#/', 'home', 'Басты'],
    ['drills', '#/drills', 'drills', 'Жаттығулар'],
    ['progress', '#/progress', 'chart', 'Прогресс'],
    ['profile', '#/profile', 'user', 'Профиль'],
  ];
  return `<nav class="nav">${items.map(([id, href, ic, label]) =>
    `<a href="${href}" class="${active === id ? 'on' : ''}">${icon(ic, { size: 22 })}<span>${label}</span></a>`).join('')}</nav>`;
}

function ring(value, total, { size = 112, stroke = 10, color = 'var(--green)', track = '#1E2638', label = '', sub = '' } = {}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = total ? Math.min(1, value / total) : 0;
  return `<div class="ring-wrap" style="width:${size}px;height:${size}px">
    <svg width="${size}" height="${size}">
      <circle cx="${size / 2}" cy="${size / 2}" r="${r}" stroke="${track}" stroke-width="${stroke}" fill="none"/>
      <circle class="ring-fg" cx="${size / 2}" cy="${size / 2}" r="${r}" stroke="${color}" stroke-width="${stroke}" fill="none"
        stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - pct)}"/>
    </svg>
    <div class="ring-label"><b>${label}</b><span>${sub}</span></div>
  </div>`;
}

function drillCard(ex, { day, status, next = false }) {
  const cat = CATEGORIES[ex.category];
  let right;
  if (status === 'done') right = `<span class="status done">${icon('checkCircle', { size: 16 })} Аяқталды</span>`;
  else if (next) right = `<span class="status go">Бастау ${icon('arrowRight', { size: 16 })}</span>`;
  else if (status === 'wait') right = `<span class="status wait">${icon('hourglass', { size: 14 })} Күтілуде</span>`;
  else right = `<span class="dim">${icon('chevronRight', { size: 20 })}</span>`;
  return `<a href="#/ex/${ex.id}${day ? `?d=${day}` : ''}" class="drill ${next ? 'next' : ''}" style="--c:${cat.color}">
    <div class="d-icon">${icon(CATEGORY_ICON[ex.category], { size: 26 })}</div>
    <div class="d-body">
      <div class="d-meta">${cat.name} <span class="t">· ${icon('clock', { size: 13 })} ${ex.duration_min} мин</span></div>
      <div class="d-title">${esc(ex.title)}</div>
      <div class="d-sub">${esc(ex.summary)}</div>
    </div>
    ${right}
  </a>`;
}

const TIPS = [
  ['Дене теңгерімін сақта', 'Соққы алдында тірек аяқты доптың жанына, шамамен 15 см қашықтыққа қой.'],
  ['Иық үстінен қара', 'Доп келмей тұрып екі рет айналаңа қара — шешімді ертерек қабылдайсың.'],
  ['Су іш', 'Жаттығудан 2 сағат бұрын 500 мл су ішсең, төзімділік жақсарады.'],
  ['Ұйқы — ең жақсы қалпына келтіру', 'Жасөспірімдерге күніне 8–10 сағат ұйқы керек.'],
  ['Әлсіз аяқпен ойна', 'Күнде 10 минут тек әлсіз аяқпен пас бер — бір айда айырмашылықты сезесің.'],
  ['Қателіктен қорықпа', 'Жаттығуда қателеспеген ойыншы жаңа нәрсе үйренбейді.'],
  ['Денеңді ашық ұста', 'Допты алыс аяқпен қабылдасаң, алаңның көп бөлігін көресің.'],
];

// ───────────── Экрандар ─────────────
function viewHome() {
  const day = today();
  const plan = planFor(day);
  const done = plan.filter((e) => store.isDone(e.id, day));
  const nextEx = plan.find((e) => !store.isDone(e.id, day));
  const s = streak();
  const best = bestStreak();
  const totalMin = plan.reduce((a, e) => a + e.duration_min, 0);
  const left = plan.length - done.length;
  const pct = plan.length ? Math.round((done.length / plan.length) * 100) : 0;
  const [tipT, tipB] = TIPS[dayIndex(day) % TIPS.length];
  const weekXp = state.completions.filter((c) => c.day > addDays(day, -7)).length * XP_PER;
  const name = (state.profile?.name || '').split(' ')[0];
  const nextCat = nextEx ? CATEGORIES[nextEx.category] : null;

  let streakText = 'Бүгін бастасаң, серия басталады';
  if (s > 0 && s >= best) streakText = 'Бұл — сенің рекордың!';
  else if (s > 0) streakText = `Рекордқа ${best - s + 1} күн қалды`;

  return `${topbar({ title: 'Басты' })}
  <main class="page fade-in">
    <div>
      <h2 class="h-display">Сәлем, ${esc(name || 'чемпион')}! 👋</h2>
      <p class="muted" style="margin:6px 0 0">Бүгінгі жаттығуға дайынсың ба?</p>
    </div>

    <div class="streak">
      <div class="flame">${icon('flame', { size: 22 })}</div>
      <div style="flex:1;min-width:0"><b>${s} күн қатарынан</b><small>${streakText}</small></div>
      ${s >= 3 ? '<span class="chip">Керемет!</span>' : ''}
    </div>

    <section class="card lg">
      <div class="row between" style="margin-bottom:14px">
        <div class="row" style="gap:8px">${icon('target', { size: 20, cls: 'green' })}<span class="label">Бүгінгі прогресс</span></div>
        <span class="chip">${pct}% орындалды</span>
      </div>
      <div class="row" style="gap:18px">
        ${ring(done.length, plan.length, { label: `${done.length}/${plan.length}`, sub: 'бөлім' })}
        <div style="flex:1">
          <p style="margin:0 0 6px;font:600 15px/1.4 var(--head)">${left
            ? `Күндік мақсатқа жету үшін тағы <span class="green">${left} жаттығу</span> қалды.`
            : '<span class="green">Бүгінгі жоспар толық орындалды!</span> Ертең жаңа тапсырмалар күтеді.'}</p>
          <p class="muted" style="margin:0 0 10px;font-size:13px">${nextCat ? `Келесі: ${nextCat.name.toLowerCase()} — ${esc(nextEx.title)}` : 'Демал, қалпына кел.'}</p>
          <div class="bar"><i style="width:${pct}%"></i></div>
        </div>
      </div>
    </section>

    <div class="section-title">
      <h3 class="h-md">${icon('drills', { size: 22, cls: 'green' })} Бүгінгі жоспар</h3>
      <span class="label muted">Жалпы: ${totalMin} мин</span>
    </div>
    <div class="stack">
      ${plan.map((e) => drillCard(e, {
        day,
        status: store.isDone(e.id, day) ? 'done' : 'wait',
        next: nextEx && e.id === nextEx.id,
      })).join('')}
    </div>

    <section class="card tip-card">
      <div class="thumb">${icon('ball', { size: 34 })}</div>
      <div>
        <div class="label green">Бапкердің кеңесі</div>
        <div class="h-sm" style="margin:4px 0 2px">${esc(tipT)}</div>
        <div class="muted" style="font-size:13px">${esc(tipB)}</div>
      </div>
    </section>

    <div class="grid2">
      <div class="card stat"><div class="s-ic green">${icon('medal', { size: 22 })}</div><div><div class="label muted">Апталық XP</div><b class="green">${weekXp.toLocaleString('ru-RU')}</b></div></div>
      <div class="card stat"><div class="s-ic" style="color:var(--cyan)">${icon('timer', { size: 22 })}</div><div><div class="label muted">Бүгін</div><b>${minutesOn(day)} мин</b></div></div>
    </div>

    ${nextEx
      ? `<a class="btn btn-primary" href="#/ex/${nextEx.id}?d=${day}">${icon('playCircle', { size: 22 })} Келесі жаттығуды бастау</a>`
      : `<a class="btn btn-secondary" href="#/progress">${icon('chart', { size: 20 })} Прогресті көру</a>`}
  </main>
  ${nav('home')}`;
}

function exHeader(ex, day) {
  const cat = CATEGORIES[ex.category];
  const plan = planFor(day);
  const pos = plan.findIndex((e) => e.id === ex.id);
  const doneCount = plan.filter((e) => store.isDone(e.id, day)).length;
  return `<div class="ex-head" style="--c:${cat.color}">
    <div class="row between">
      <span class="chip" style="background:color-mix(in srgb, ${cat.color} 15%, transparent);color:${cat.color}"><span class="dot"></span>${cat.name} · ${ex.duration_min} мин</span>
      ${pos >= 0 ? `<span class="chip gray">${pos + 1} / ${plan.length} жаттығу</span>` : ''}
    </div>
    <h2 class="h-lg" style="margin-top:12px">${esc(ex.title)}</h2>
    <p class="muted" style="margin:6px 0 0">${esc(ex.summary)}</p>
    ${pos >= 0 ? `<div class="progress-line"><i style="width:${(doneCount / plan.length) * 100}%"></i></div>` : ''}
  </div>`;
}

function stepsCard(ex, title = 'Бапкер нұсқаулары') {
  const cat = CATEGORIES[ex.category];
  return `<section class="card lg" style="--c:${cat.color}">
    <div class="row between" style="margin-bottom:14px">
      <h3 class="h-md row" style="gap:8px">${icon('whistle', { size: 20, cls: '' })} ${title}</h3>
    </div>
    <ol class="steps">${(ex.steps || []).map((s, i) => `<li><span class="n">${i + 1}</span><span>${esc(s)}</span></li>`).join('')}</ol>
    ${ex.payload?.tip ? `<div class="msg" style="margin-top:12px;display:flex;gap:8px">${icon('info', { size: 18 })}<span>${esc(ex.payload.tip)}</span></div>` : ''}
  </section>`;
}

function nextAfter(ex, day) {
  const plan = planFor(day);
  return plan.find((e) => e.id !== ex.id && !store.isDone(e.id, day));
}

let finishing = false;
async function finish(ex, day, note) {
  if (finishing) return;
  finishing = true;
  app.querySelectorAll('[data-finish],[data-act="finish"],[data-save]').forEach((b) => { b.disabled = true; });
  try {
    await store.complete(ex, day, note);
    toast(`+${XP_PER} XP — ${CATEGORIES[ex.category].name} аяқталды!`);
    const nx = nextAfter(ex, day);
    location.hash = nx && day === today() ? `#/ex/${nx.id}?d=${day}` : '#/';
  } catch (e) {
    toast('Сақтау сәтсіз болды. Қайта көріңіз.');
    console.error(e);
    app.querySelectorAll('[data-finish],[data-act="finish"],[data-save]').forEach((b) => { b.disabled = false; });
  } finally {
    finishing = false;
  }
}

async function undo(ex, day) {
  await store.uncomplete(ex, day);
  render();
}

function doneBanner(ex, day) {
  if (!store.isDone(ex.id, day)) return '';
  return `<div class="card row between" style="border-color:rgba(34,229,91,.4)">
    <span class="row" style="gap:8px;color:var(--green);font:700 14px var(--head)">${icon('checkCircle', { size: 20 })} Бұл жаттығу орындалды</span>
    <button class="btn-ghost label" data-undo>Болдырмау</button>
  </div>`;
}

// — Тактика —
function viewTactics(ex, day) {
  const p = ex.payload;
  const q = p.quiz;
  const isDone = store.isDone(ex.id, day);
  const prev = quizLog()[ex.id];
  const html = `${topbar({ title: 'Жаттығу барысы', back: true })}
  <main class="page no-nav fade-in">
    ${exHeader(ex, day)}
    ${doneBanner(ex, day)}
    <section class="pitch-card">
      <div class="row between" style="padding:2px 4px 8px">
        <span class="chip gray" style="text-transform:none;letter-spacing:0">${icon('eye', { size: 14 })} Біз жоғары қарай шабуылдаймыз</span>
        <button class="icon-btn" data-replay aria-label="Қайта көрсету" style="width:36px;height:36px">${icon('refresh', { size: 18 })}</button>
      </div>
      <div data-pitch>${renderPitch(p, { uid: ex.id })}</div>
      <div class="legend">
        <span><i style="background:#22E55B"></i>Біздің команда</span>
        <span><i style="background:#F43F5E"></i>Қарсылас</span>
        <span><i style="background:transparent;border:2px solid #FDE047"></i>Назардағы ойыншы</span>
        ${LEGEND.filter((l) => (p.arrows || []).some((a) => a.k === l.k)).map((l) =>
          `<span><em style="border-color:${l.color};${l.dashed ? 'border-top-style:dashed' : ''}"></em>${l.label}</span>`).join('')}
      </div>
    </section>

    <ol class="steps" style="--c:var(--green)">${ex.steps.map((s, i) => `<li><span class="n">${i + 1}</span><span>${esc(s)}</span></li>`).join('')}</ol>

    <section class="card lg">
      <div class="row" style="gap:10px;margin-bottom:12px">
        <div class="s-ic" style="width:36px;height:36px;border-radius:50%;display:grid;place-items:center;background:rgba(34,229,91,.14);color:var(--green)">${icon('brain', { size: 18 })}</div>
        <span class="label green">Тактикалық шешім</span>
      </div>
      <h3 class="h-md" style="margin-bottom:14px">${esc(q.question)}</h3>
      <div class="stack" data-opts>
        ${q.options.map((o, i) => `<button class="opt" data-opt="${i}"><span class="radio"></span><span><span class="tag" hidden></span>${esc(o)}</span></button>`).join('')}
      </div>
    </section>
    <div data-feedback></div>
    <div data-actions>
      ${isDone ? `<a class="btn btn-secondary" href="#/">${icon('home', { size: 20 })} Басты бетке</a>` : ''}
    </div>
    <p class="dim row" style="justify-content:center;gap:6px;font-size:12px;margin:0">${icon('info', { size: 14 })} Жауап бергеннен кейін жаттығуды аяқтай аласыз</p>
  </main>`;

  const mount = () => {
    const opts = [...app.querySelectorAll('[data-opt]')];
    const answer = (i, silent = false) => {
      opts.forEach((b, j) => {
        b.disabled = true;
        const tag = b.querySelector('.tag');
        if (j === q.answer) { b.classList.add('right'); b.querySelector('.radio').innerHTML = icon('check', { size: 14 }); tag.hidden = false; tag.textContent = 'Дұрыс бағыт'; tag.style.color = 'var(--green)'; }
        else if (j === i) { b.classList.add('wrong'); b.querySelector('.radio').innerHTML = '✕'; tag.hidden = false; tag.textContent = 'Сіздің жауабыңыз'; tag.style.color = 'var(--red)'; }
      });
      const ok = i === q.answer;
      if (!silent) { const log = quizLog(); log[ex.id] = ok; LS.set('fp_quiz', log); }
      app.querySelector('[data-feedback]').innerHTML = `<section class="feedback ${ok ? '' : 'bad'}">
        <div class="row between" style="margin-bottom:12px">
          <span class="h-md" style="color:${ok ? 'var(--green)' : '#FDA4AF'}">${ok ? 'Дұрыс! 👏' : 'Дәл емес'}</span>
          <span class="chip ${ok ? '' : 'orange'}">${icon('bolt', { size: 12 })} +${XP_PER} XP</span>
        </div>
        <div class="label" style="color:var(--orange);margin-bottom:6px">Бас бапкер кеңесі</div>
        <p style="margin:0;line-height:1.55">${esc(q.explain)}</p>
      </section>`;
      if (!isDone) {
        app.querySelector('[data-actions]').innerHTML = `<button class="btn btn-primary" data-finish>Аяқтау және келесіге өту ${icon('arrowRight', { size: 20 })}</button>`;
        app.querySelector('[data-finish]').onclick = () => finish(ex, day, ok ? 'quiz:right' : 'quiz:wrong');
      }
    };
    opts.forEach((b) => { b.onclick = () => answer(Number(b.dataset.opt)); });
    if (prev !== undefined && isDone) answer(prev ? q.answer : (q.answer + 1) % q.options.length, true);
    app.querySelector('[data-replay]').onclick = () => {
      app.querySelector('[data-pitch]').innerHTML = renderPitch(p, { uid: ex.id });
    };
  };
  return { html, mount };
}

// — Физика / Техника —
function viewWorkout(ex, day) {
  const cat = CATEGORIES[ex.category];
  const p = ex.payload;
  const sets = p.sets || 3;
  const isDone = store.isDone(ex.id, day);
  const intensity = (ex.levels || []).includes('beginner') ? ['Орташа', 'cyan'] : ['Жоғары қарқын', 'orange'];
  const html = `${topbar({ title: 'Жаттығу барысы', back: true })}
  <main class="page no-nav fade-in" style="--c:${cat.color}">
    ${exHeader(ex, day)}
    ${doneBanner(ex, day)}
    <section class="hero">
      <div class="hero-ic">${icon(CATEGORY_ICON[ex.category], { size: 190 })}</div>
      <span class="chip hero-badge ${intensity[1]}">${icon('bolt', { size: 12 })} ${intensity[0]}</span>
      <div class="row between" style="align-items:flex-end;gap:12px">
        <div class="h-md" style="max-width:60%">${esc(ex.title)}</div>
        <span class="chip" style="text-transform:none;letter-spacing:0">${sets} подход × ${esc(p.reps)}</span>
      </div>
    </section>

    <section class="card lg">
      <div class="timer" data-timer></div>
      <div class="timer-stats">
        <div><div class="label muted">Қалған сет</div><b data-left>${sets} / ${sets}</b></div>
        <div><div class="label muted">Мақсат</div><b style="color:var(--orange)">${esc(p.reps)}</b></div>
        <div><div class="label muted">Демалыс</div><b class="green">${p.rest_sec} сек</b></div>
      </div>
      <div class="sets" data-sets>${Array.from({ length: sets }, (_, i) => `<span class="set-dot">${i + 1}</span>`).join('')}</div>
    </section>

    ${stepsCard(ex)}

    <div class="stack" data-controls></div>
  </main>`;

  const mount = () => {
    const st = { phase: isDone ? 'done' : 'idle', setsDone: isDone ? sets : 0, elapsed: 0, rest: 0, paused: false };
    const timerEl = app.querySelector('[data-timer]');
    const controls = app.querySelector('[data-controls]');

    const draw = () => {
      let label = '00:00', sub = 'Дайынсың ба?', value = 0, total = 1, color = cat.color;
      if (st.phase === 'work') {
        if (p.work_sec) { label = fmt(p.work_sec - st.elapsed); value = st.elapsed; total = p.work_sec; }
        else { label = fmt(st.elapsed); value = st.elapsed % 60; total = 60; }
        sub = st.paused ? 'Үзіліс' : `Сет ${st.setsDone + 1} — белсенді`;
      } else if (st.phase === 'rest') {
        label = fmt(st.rest); value = st.rest; total = p.rest_sec; color = 'var(--cyan)'; sub = st.paused ? 'Үзіліс' : 'Демалыс';
      } else if (st.phase === 'done') {
        label = '✓'; value = 1; total = 1; color = 'var(--green)'; sub = 'Барлық сет орындалды';
      }
      timerEl.innerHTML = ring(value, total, { size: 220, stroke: 14, color, label, sub });
      timerEl.querySelector('.ring-label b').style.cssText = 'font:800 46px/1 var(--head);letter-spacing:-.02em';
      app.querySelector('[data-left]').textContent = `${sets - st.setsDone} / ${sets}`;
      app.querySelectorAll('.set-dot').forEach((d, i) => d.classList.toggle('on', i < st.setsDone));

      if (isDone) { controls.innerHTML = `<a class="btn btn-secondary" href="#/">${icon('home', { size: 20 })} Басты бетке</a>`; return; }
      let primary;
      if (st.phase === 'idle') primary = `<button class="btn btn-primary" data-act="start">${icon('play', { size: 20, fill: true })} Бастау</button>`;
      else if (st.phase === 'work') primary = `<button class="btn btn-primary" data-act="set">${icon('check', { size: 20 })} Сет ${st.setsDone + 1} аяқталды</button>`;
      else if (st.phase === 'rest') primary = `<button class="btn btn-cyan btn" data-act="skip">${icon('arrowRight', { size: 20 })} Келесі сетке өту</button>`;
      else primary = `<button class="btn btn-primary" data-act="finish">${icon('checkCircle', { size: 20 })} Аяқтау · +${XP_PER} XP</button>`;
      const secondary = (st.phase === 'work' || st.phase === 'rest')
        ? `<div class="btn-row">
            <button class="btn btn-secondary" data-act="pause">${icon(st.paused ? 'play' : 'pause', { size: 18 })} ${st.paused ? 'Жалғастыру' : 'Үзіліс'}</button>
            <button class="btn btn-secondary" data-act="finish">${icon('checkCircle', { size: 18 })} Аяқтау</button>
          </div>` : '';
      controls.innerHTML = primary + secondary;
      controls.querySelectorAll('[data-act]').forEach((b) => { b.onclick = () => act(b.dataset.act); });
    };

    const act = (a) => {
      acc = 0; last = Date.now();
      if (a === 'start') { st.phase = 'work'; st.elapsed = 0; st.paused = false; }
      if (a === 'set') { st.setsDone++; st.paused = false; if (st.setsDone >= sets) st.phase = 'done'; else { st.phase = 'rest'; st.rest = p.rest_sec; } }
      if (a === 'skip') { st.phase = 'work'; st.elapsed = 0; }
      if (a === 'pause') st.paused = !st.paused;
      if (a === 'finish') { finish(ex, day); return; }
      draw();
    };

    let last = Date.now();
    let acc = 0;
    const h = setInterval(() => {
      const now = Date.now();
      acc += (now - last) / 1000;
      last = now;
      const secs = Math.floor(acc);
      if (!secs) return;
      acc -= secs;
      if (st.paused) return;
      for (let i = 0; i < secs; i++) {
        if (st.phase === 'work') {
          st.elapsed++;
          if (p.work_sec && st.elapsed >= p.work_sec) { act('set'); return; }
        } else if (st.phase === 'rest') {
          st.rest--;
          if (st.rest <= 0) { st.phase = 'work'; st.elapsed = 0; try { navigator.vibrate?.(200); } catch { /* */ } }
        }
      }
      if (st.phase === 'work' || st.phase === 'rest') draw();
    }, 250);
    onLeave(() => clearInterval(h));
    draw();
  };
  return { html, mount };
}

// — Психология —
const MOODS = [
  ['⚡', 'Сенімді', 'Күшке толы'],
  ['🔥', 'Ынталы', 'Жеңіске құштар'],
  ['🧘', 'Салмақты', 'Зейін толық'],
  ['🌪️', 'Толқу бар', 'Бақылауда'],
];
const QUOTES = [
  ['Табыс — дайындық пен мүмкіндіктің кездесуі.', 'Сенека'],
  ['Жеңіс бір күнде келмейді — ол күн сайынғы еңбектен құралады.', 'Бапкер кеңесі'],
  ['Қателік — сабақ. Оны қайталамау — шеберлік.', 'Бапкер кеңесі'],
  ['Алаңда ең мықты бұлшықет — ми.', 'Бапкер кеңесі'],
];

function viewMental(ex, day) {
  const p = ex.payload;
  const isDone = store.isDone(ex.id, day);
  const existing = state.completions.find((c) => c.exercise_id === ex.id && c.day === day)?.note || '';
  const [qt, qa] = QUOTES[dayIndex(day) % QUOTES.length];
  const breath = p.breath;
  const cycleSec = breath ? breath.reduce((a, b) => a + b, 0) : 0;
  const totalSec = breath ? cycleSec * p.rounds : 0;

  const html = `${topbar({ title: 'Жаттығу барысы', back: true })}
  <main class="page no-nav fade-in" style="--c:var(--cyan)">
    ${exHeader(ex, day)}
    ${doneBanner(ex, day)}
    ${breath ? `
    <section class="card lg" style="background:linear-gradient(180deg,#18243A,#121A2A)">
      <div class="row between">
        <span class="chip gray" style="text-transform:none;letter-spacing:0">${icon('wind', { size: 14 })} ${breath.join('-')} әдісі</span>
        <span class="chip" data-remain>${icon('timer', { size: 12 })} ${fmt(totalSec)}</span>
      </div>
      <div class="breath-stage">
        <div class="breath-ring"></div><div class="breath-ring r2"></div>
        <div class="breath-core" data-core>${icon('wind', { size: 26, cls: 'green' })}<b data-phase>Дайынсың ба?</b><span data-sec>${p.rounds} цикл</span></div>
      </div>
      <div class="phases" data-phases><span>Тыныс алу</span>${icon('arrowRight', { size: 12 })}<span>Ұстау</span>${icon('arrowRight', { size: 12 })}<span>Тыныс шығару</span>${icon('arrowRight', { size: 12 })}<span>Ұстау</span></div>
      <button class="btn btn-cyan" style="margin-top:16px" data-breath>${icon('play', { size: 18, fill: true })} Тыныс жаттығуын бастау</button>
    </section>` : `
    <section class="hero" style="--c:var(--cyan)">
      <div class="hero-ic">${icon('brain', { size: 190 })}</div>
      <span class="chip hero-badge cyan">${icon('brain', { size: 12 })} Спорттық психология</span>
      <div class="h-md">${esc(ex.title)}</div>
    </section>`}

    ${stepsCard(ex, 'Қалай орындаймыз')}

    <section class="stack">
      <div class="section-title"><h3 class="h-md">${icon('edit', { size: 20, cls: 'green' })} Жаттығушы күнделігі</h3><span class="chip">Бүгін</span></div>
      <div class="label muted" style="text-transform:none;letter-spacing:0;font-size:14px">Бүгінгі көңіл-күйің:</div>
      <div class="mood-grid">${MOODS.map(([e, t, s], i) => `<button class="mood" data-mood="${i}"><span class="e">${e}</span><span><b>${t}</b><small>${s}</small></span></button>`).join('')}</div>
      <label class="field-label" for="journal" style="margin-top:6px">${esc(p.journal || 'Бүгінгі ойың:')}</label>
      <textarea id="journal" class="field" maxlength="500" placeholder="Мысалы: Бүгін маңызды матч, аздап толқу бар, бірақ дайындығым жоғары...">${esc(existing.replace(/^\[.*?\]\s*/, ''))}</textarea>
      <div class="row between dim" style="font-size:12px"><span class="row" style="gap:4px">${icon('lock', { size: 12 })} Жеке жазба</span><span data-count>0 / 500</span></div>
    </section>

    <section class="card quote-card">
      <div class="q-ic">${icon('quote', { size: 24 })}</div>
      <div><div class="label" style="color:var(--orange)">Күн ойы</div><p>«${esc(qt)}»</p><small class="muted">— ${esc(qa)}</small></div>
    </section>

    <div data-actions>${isDone
      ? `<a class="btn btn-secondary" href="#/">${icon('home', { size: 20 })} Басты бетке</a>`
      : `<button class="btn btn-primary" data-save>${icon('checkCircle', { size: 20 })} Сақтау және аяқтау</button>`}</div>
    <p class="dim" style="text-align:center;font-size:12px;margin:0">Жазбаң тек өзіңе көрінеді және прогресіңе қосылады</p>
  </main>`;

  const mount = () => {
    let mood = null;
    const moodMatch = existing.match(/^\[(.*?)\]/);
    app.querySelectorAll('[data-mood]').forEach((b) => {
      if (moodMatch && MOODS[b.dataset.mood][1] === moodMatch[1]) { b.classList.add('on'); mood = Number(b.dataset.mood); }
      b.onclick = () => { app.querySelectorAll('[data-mood]').forEach((x) => x.classList.remove('on')); b.classList.add('on'); mood = Number(b.dataset.mood); };
    });
    const ta = app.querySelector('#journal');
    const cnt = app.querySelector('[data-count]');
    const upd = () => { cnt.textContent = `${ta.value.length} / 500`; };
    ta.oninput = upd; upd();

    const save = app.querySelector('[data-save]');
    if (save) save.onclick = () => {
      const note = `${mood !== null ? `[${MOODS[mood][1]}] ` : ''}${ta.value.trim()}`;
      finish(ex, day, note);
    };

    if (breath) {
      const names = ['Тыныс ал...', 'Ұстап тұр', 'Тыныс шығар...', 'Ұстап тұр'];
      const core = app.querySelector('[data-core]');
      const phaseEl = app.querySelector('[data-phase]');
      const secEl = app.querySelector('[data-sec]');
      const remainEl = app.querySelector('[data-remain]');
      const phaseSpans = app.querySelectorAll('[data-phases] span');
      const btn = app.querySelector('[data-breath]');
      let h = null;
      const stop = () => { clearInterval(h); h = null; };
      onLeave(stop);
      btn.onclick = () => {
        if (h) { stop(); btn.innerHTML = `${icon('play', { size: 18, fill: true })} Жалғастыру`; return; }
        let t = btn.dataset.t ? Number(btn.dataset.t) : 0;
        btn.innerHTML = `${icon('pause', { size: 18 })} Тоқтату`;
        const tick = () => {
          if (t >= totalSec) {
            stop(); core.classList.remove('big'); phaseEl.textContent = 'Тамаша!'; secEl.textContent = 'Цикл аяқталды';
            btn.innerHTML = `${icon('refresh', { size: 18 })} Қайта бастау`; btn.dataset.t = 0; remainEl.innerHTML = `${icon('check', { size: 12 })} Дайын`;
            return;
          }
          const inCycle = t % cycleSec;
          let acc = 0, ph = 0;
          for (let i = 0; i < 4; i++) { if (inCycle < acc + breath[i]) { ph = i; break; } acc += breath[i]; }
          const left = breath[ph] - (inCycle - acc);
          phaseEl.textContent = names[ph];
          secEl.textContent = `${left} сек · ${Math.floor(t / cycleSec) + 1}/${p.rounds}`;
          core.classList.toggle('big', ph === 0 || ph === 1);
          phaseSpans.forEach((s, i) => s.classList.toggle('on', i === ph));
          remainEl.innerHTML = `${icon('timer', { size: 12 })} ${fmt(totalSec - t)} қалды`;
          t++; btn.dataset.t = t;
        };
        tick();
        h = setInterval(tick, 1000);
      };
    }
  };
  return { html, mount };
}

function viewExercise(id, day) {
  const ex = exById(id);
  if (!ex) return { html: `${topbar({ title: 'Табылмады', back: true })}<main class="page"><p>Жаттығу табылмады.</p></main>` };
  const v = ex.category === 'tactics' ? viewTactics(ex, day)
    : ex.category === 'mental' ? viewMental(ex, day)
    : viewWorkout(ex, day);
  const mount = v.mount;
  v.mount = () => {
    mount?.();
    const u = app.querySelector('[data-undo]');
    if (u) u.onclick = () => undo(ex, day);
  };
  return v;
}

// — Жаттығулар кітапханасы —
let libFilter = 'all';
function viewDrills() {
  const day = today();
  const list = state.exercises.filter((e) => libFilter === 'all' || e.category === libFilter);
  const html = `${topbar({ title: 'Жаттығулар' })}
  <main class="page fade-in">
    <div>
      <h2 class="h-lg">Жаттығулар кітапханасы</h2>
      <p class="muted" style="margin:6px 0 0">${state.exercises.length} жаттығу · кез келгенін қазір орындауға болады</p>
    </div>
    <div class="filters">
      <button class="filter ${libFilter === 'all' ? 'on' : ''}" data-f="all">Барлығы</button>
      ${CATEGORY_ORDER.map((c) => `<button class="filter ${libFilter === c ? 'on' : ''}" data-f="${c}">${CATEGORIES[c].name}</button>`).join('')}
    </div>
    <div class="stack">
      ${list.map((e) => drillCard(e, { day, status: store.isDone(e.id, day) ? 'done' : null })).join('')}
    </div>
  </main>
  ${nav('drills')}`;
  const mount = () => {
    app.querySelectorAll('[data-f]').forEach((b) => { b.onclick = () => { libFilter = b.dataset.f; render(); }; });
  };
  return { html, mount };
}

// — Прогресс —
function radar(scores) {
  const cx = 150, cy = 130, R = 90;
  const axes = [
    ['tactics', 0, -1, 'Тактика', 'middle', -12],
    ['mental', 1, 0, 'Психология', 'start', 4],
    ['physical', 0, 1, 'Физика', 'middle', 20],
    ['technique', -1, 0, 'Техника', 'end', 4],
  ];
  const grid = [0.25, 0.5, 0.75, 1].map((k) => `<polygon points="${axes.map(([, x, y]) => `${cx + x * R * k},${cy + y * R * k}`).join(' ')}" fill="none" stroke="rgba(148,163,184,.18)"/>`).join('');
  const pts = axes.map(([c, x, y]) => { const k = scores[c] / 100; return [cx + x * R * k, cy + y * R * k]; });
  const lines = axes.map(([, x, y]) => `<line x1="${cx}" y1="${cy}" x2="${cx + x * R}" y2="${cy + y * R}" stroke="rgba(148,163,184,.18)"/>`).join('');
  const labels = axes.map(([c, x, y, name, anchor, dy]) => `<text x="${cx + x * (R + 8)}" y="${cy + y * (R + 4) + dy}" text-anchor="${anchor}" ${c === 'mental' ? 'style="fill:#00D2FF"' : ''}>${name}</text>`).join('');
  return `<svg class="radar" viewBox="-45 0 390 265" width="100%">
    ${grid}${lines}
    <polygon points="${pts.map((p) => p.join(',')).join(' ')}" fill="rgba(34,229,91,.28)" stroke="#22E55B" stroke-width="2.5" style="filter:drop-shadow(0 0 8px rgba(34,229,91,.6))"/>
    ${pts.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="5" fill="#22E55B" stroke="#0B0F1A" stroke-width="2"/>`).join('')}
    ${labels}
  </svg>`;
}

const skillWord = (n) => (n >= 85 ? ['Өте мықты', 'var(--orange)'] : n >= 70 ? ['Жоғары', 'var(--green)'] : n >= 55 ? ['Жақсы', 'var(--cyan)'] : ['Дамуда', 'var(--muted)']);

function viewProgress() {
  const p = state.profile || {};
  const { xp, lvl, into, need } = levelInfo();
  const scores = skillScores();
  const ovr = Math.round(CATEGORY_ORDER.reduce((a, c) => a + scores[c], 0) / 4);
  const day = today();
  const week = Array.from({ length: 7 }, (_, i) => addDays(day, i - 6));
  const mins = week.map(minutesOn);
  const maxMin = Math.max(30, ...mins);
  const weekTotal = mins.reduce((a, b) => a + b, 0);
  const prevWeek = Array.from({ length: 7 }, (_, i) => minutesOn(addDays(day, i - 13))).reduce((a, b) => a + b, 0);
  const activeDays = mins.filter((m) => m > 0).length;
  const delta = prevWeek ? Math.round(((weekTotal - prevWeek) / prevWeek) * 100) : null;
  const totalMin = state.completions.reduce((s, c) => s + (exById(c.exercise_id)?.duration_min || 0), 0);
  const ql = Object.values(quizLog());
  const acc = ql.length ? Math.round((ql.filter(Boolean).length / ql.length) * 100) : null;
  const byCat = (c) => state.completions.filter((x) => x.category === c).length;
  const fullDays = [...new Set(state.completions.map((c) => c.day))].filter((d) => doneOn(d).length >= 4).length;
  const best = bestStreak();

  const badges = [
    ['flame', 'Алғашқы қадам', 'Бірінші жаттығу', state.completions.length, 1, 'var(--orange)'],
    ['flame', '7 күн қатарынан', 'Үзіліссіз серия', best, 7, 'var(--orange)'],
    ['target', 'Тактик', '10 тактикалық сабақ', byCat('tactics'), 10, 'var(--green)'],
    ['bolt', 'Жүйрік', '10 физикалық жаттығу', byCat('physical'), 10, 'var(--cyan)'],
    ['trophy', 'Толық күн', '4 бөлімді бір күнде', fullDays, 1, 'var(--purple)'],
    ['medal', 'Апта чемпионы', 'Аптада 5 белсенді күн', activeDays, 5, 'var(--purple)'],
  ];
  const got = badges.filter((b) => b[3] >= b[4]).length;

  const html = `${topbar({ title: 'Прогресс' })}
  <main class="page fade-in">
    <section class="card lg">
      <div class="row" style="gap:14px">
        <div style="position:relative">
          <div class="avatar lg">${esc(initials(p.name))}</div>
          <span class="chip" style="position:absolute;bottom:-8px;left:50%;transform:translateX(-50%);height:22px;padding:0 8px;font-size:10px;background:var(--green);color:var(--bg)">LVL ${lvl}</span>
        </div>
        <div style="min-width:0">
          <div class="h-md" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(p.name || 'Ойыншы')}</div>
          <div class="muted" style="font-size:13px">Деңгей ${lvl} — ${esc(POSITIONS[p.position] || 'Ойыншы')}</div>
          <div class="row" style="gap:6px;margin-top:4px;color:var(--cyan);font:700 12px var(--head)">${icon('star', { size: 14 })} ${esc(LEVELS[p.level] || '')} деңгей</div>
        </div>
      </div>
      <div class="row between" style="margin:16px 0 8px;font:700 13px var(--head)"><span class="row" style="gap:6px">${icon('trend', { size: 16, cls: 'green' })} Тәжірибе ұпайы</span><span class="green tnum">${into} / ${need} XP</span></div>
      <div class="bar" style="height:10px"><i style="width:${(into / need) * 100}%;background:var(--green);box-shadow:var(--glow-green)"></i></div>
      <div class="row between dim" style="margin-top:8px;font:700 11px var(--head);letter-spacing:.04em;text-transform:uppercase"><span>Келесі деңгейге: ${need - into} XP</span><span class="green">Барлығы ${xp} XP</span></div>
    </section>

    <section class="card lg">
      <div class="row between">
        <div><div class="label green">Шеберлік картасы</div><div class="h-md" style="margin-top:4px">Атлетикалық қабілеттер</div></div>
        <div class="score-box"><b>${ovr}</b><small>OVR</small></div>
      </div>
      ${radar(scores)}
      <div class="grid2">
        ${CATEGORY_ORDER.map((c) => { const [w, col] = skillWord(scores[c]); return `<div class="skill"><div>${CATEGORIES[c].name}<small style="color:${col}">${w}</small></div><b>${scores[c]}</b></div>`; }).join('')}
      </div>
      <p class="dim" style="font-size:12px;margin:12px 0 0">Ұпай соңғы 30 күндегі жаттығулар бойынша есептеледі.</p>
    </section>

    <section class="card lg">
      <div class="row between">
        <div><div class="h-md">Апталық белсенділік</div><div class="muted" style="font-size:13px">Соңғы 7 күннің көлемі</div></div>
        ${delta !== null ? `<span class="chip ${delta >= 0 ? '' : 'orange'}">${icon('trend', { size: 12 })} ${delta >= 0 ? '+' : ''}${delta}%</span>` : ''}
      </div>
      <div class="bars">
        ${week.map((d, i) => { const [y, m, dd] = d.split('-').map(Number); const wd = WEEKDAYS[new Date(y, m - 1, dd).getDay()];
          return `<div class="b ${d === day ? 'today' : ''} ${mins[i] ? '' : 'zero'}"><em>${mins[i]}м</em><i style="height:${Math.max(4, (mins[i] / maxMin) * 100)}%"></i><small>${wd}</small></div>`; }).join('')}
      </div>
      <div class="card" style="margin-top:14px;background:var(--inset);border:0;display:flex;gap:10px;align-items:center;font-size:13px">
        ${icon('drills', { size: 20, cls: 'green' })}<span>Аптасына <b>${activeDays} күн</b> жаттықтың${delta !== null ? ` (<span class="${delta >= 0 ? 'green' : ''}">${delta >= 0 ? '+' : ''}${delta}% өткен аптадан</span>)` : ''}. ${activeDays >= 5 ? 'Қарқының өте жоғары!' : 'Аптасына 5 күнге жетуге тырыс!'}</span>
      </div>
    </section>

    <div class="stack">
      <div class="card list-link"><div class="s-ic green">${icon('clock', { size: 22 })}</div><div style="flex:1"><div class="muted" style="font-size:13px">Барлық жаттығу уақыты</div><b>${totalMin >= 60 ? `${Math.floor(totalMin / 60)} сағ ${totalMin % 60} мин` : `${totalMin} мин`}</b></div></div>
      <div class="card list-link"><div class="s-ic" style="color:var(--cyan)">${icon('checkCircle', { size: 22 })}</div><div style="flex:1"><div class="muted" style="font-size:13px">Орындалған сабақтар</div><b>${state.completions.length} сабақ</b></div></div>
      <div class="card list-link"><div class="s-ic" style="color:var(--orange)">${icon('target', { size: 22 })}</div><div style="flex:1"><div class="muted" style="font-size:13px">Дұрыс тактикалық шешімдер</div><b>${acc === null ? '—' : `${acc}% нәтиже`}</b></div></div>
    </div>

    <section class="card lg">
      <div class="row between" style="margin-bottom:14px">
        <div><div class="label green">Марапаттар</div><div class="h-md" style="margin-top:4px">Жетістіктер</div></div>
        <span class="label green">${got} / ${badges.length}</span>
      </div>
      <div class="grid2">
        ${badges.map(([ic, t, s, v, goal, col]) => { const ok = v >= goal; const pc = Math.min(100, Math.round((v / goal) * 100));
          return `<div class="badge ${ok ? '' : 'locked'}">
            <span class="chip ${ok ? '' : 'gray'}">${ok ? 'Алынды' : `${pc}%`}</span>
            <div class="b-ic" style="background:color-mix(in srgb, ${col} 18%, transparent);color:${col}">${icon(ic, { size: 22 })}</div>
            <b>${t}</b><small>${s}</small>
            ${ok ? '' : `<div class="bar" style="height:5px;margin-top:8px"><i style="width:${pc}%"></i></div>`}
          </div>`; }).join('')}
      </div>
    </section>

    <section class="card lg row between">
      <div><div class="h-md">Нәтижені бөліс</div><div class="muted" style="font-size:13px">Жаттықтырушың мен достарыңа көрсет</div></div>
      <button class="btn btn-primary btn-sm" data-share>${icon('arrowRight', { size: 16 })} Бөлісу</button>
    </section>
  </main>
  ${nav('progress')}`;

  const mount = () => {
    app.querySelector('[data-share]').onclick = async () => {
      const text = `⚽ Күнделікті футбол жаттықтырушысы\n${p.name || 'Ойыншы'} — деңгей ${lvl}, ${xp} XP\n🔥 ${streak()} күн қатарынан, ${state.completions.length} сабақ орындалды. OVR ${ovr}`;
      try {
        if (navigator.share) await navigator.share({ text });
        else { await navigator.clipboard.writeText(text); toast('Нәтиже көшірілді'); }
      } catch { /* бас тартылды */ }
    };
  };
  return { html, mount };
}

// — Профиль формасы —
function profileForm(p = {}) {
  const choice = (name, map, val) => `<div class="choice-grid">${Object.entries(map).map(([k, v]) =>
    `<button type="button" class="choice ${val === k ? 'on' : ''}" data-choice="${name}" data-v="${k}">${v}</button>`).join('')}</div>`;
  return `
    <div><label class="field-label" for="pf-name">Атың</label><input id="pf-name" class="field" maxlength="40" placeholder="Мысалы: Әлихан" value="${esc(p.name || '')}"/></div>
    <div><span class="field-label">Жасың</span>${choice('age_group', AGE_GROUPS, p.age_group)}</div>
    <div><span class="field-label">Позицияң</span>${choice('position', POSITIONS, p.position)}</div>
    <div><span class="field-label">Деңгейің</span>${choice('level', LEVELS, p.level)}</div>`;
}

function bindProfileForm(initial, onSubmit, btnSel) {
  const vals = { age_group: initial.age_group || null, position: initial.position || null, level: initial.level || null };
  const btn = app.querySelector(btnSel);
  const nameEl = app.querySelector('#pf-name');
  const check = () => { btn.disabled = !(nameEl.value.trim() && vals.age_group && vals.position && vals.level); };
  app.querySelectorAll('[data-choice]').forEach((b) => {
    b.onclick = () => {
      app.querySelectorAll(`[data-choice="${b.dataset.choice}"]`).forEach((x) => x.classList.remove('on'));
      b.classList.add('on');
      vals[b.dataset.choice] = b.dataset.v;
      check();
    };
  });
  nameEl.oninput = check;
  check();
  btn.onclick = async () => {
    btn.disabled = true;
    try { await onSubmit({ name: nameEl.value.trim(), ...vals }); }
    catch (e) { toast('Сақтау сәтсіз болды'); console.error(e); btn.disabled = false; }
  };
}

function viewOnboarding() {
  const html = `<main class="page no-nav fade-in">
    <div>
      <span class="chip">${icon('user', { size: 12 })} 1-қадам</span>
      <h2 class="h-display" style="margin-top:12px">Өзің туралы айт</h2>
      <p class="muted" style="margin:6px 0 0">Күндік жоспар сенің жасыңа, позицияңа және деңгейіңе қарай құрылады.</p>
    </div>
    ${profileForm(state.profile || {})}
    <button class="btn btn-primary" data-save>Жоспарды құру ${icon('arrowRight', { size: 20 })}</button>
  </main>`;
  const mount = () => bindProfileForm(state.profile || {}, async (v) => {
    await store.saveProfile(v);
    location.hash = '#/';
    render();
  }, '[data-save]');
  return { html, mount };
}

function viewProfile() {
  const p = state.profile || {};
  const html = `${topbar({ title: 'Профиль' })}
  <main class="page fade-in">
    <section class="card lg row" style="gap:16px">
      <div class="avatar lg">${esc(initials(p.name))}</div>
      <div style="min-width:0">
        <div class="h-md">${esc(p.name)}</div>
        <div class="muted" style="font-size:13px">${esc(POSITIONS[p.position] || '')} · ${esc(AGE_GROUPS[p.age_group] || '')}</div>
        <div style="margin-top:8px">${state.mode === 'cloud'
          ? `<span class="chip">${icon('shield', { size: 12 })} ${esc(state.user?.email || 'Аккаунт')}</span>`
          : `<span class="chip orange">${icon('info', { size: 12 })} Қонақ режимі</span>`}</div>
      </div>
    </section>
    ${state.mode !== 'cloud' ? `<div class="msg">Қонақ режимінде прогресс тек осы құрылғыда сақталады. Басқа телефоннан да кіру үшін аккаунт ашыңыз.</div>` : ''}
    <h3 class="h-md">Баптаулар</h3>
    ${profileForm(p)}
    <button class="btn btn-primary" data-save>${icon('check', { size: 20 })} Сақтау</button>
    ${state.mode !== 'cloud'
      ? `<button class="btn btn-secondary" data-account>${icon('mail', { size: 20 })} Аккаунт ашу</button>`
      : ''}
    <button class="btn btn-ghost" data-logout>${icon('logout', { size: 18 })} Шығу</button>
  </main>
  ${nav('profile')}`;
  const mount = () => {
    bindProfileForm(p, async (v) => { await store.saveProfile(v); toast('Сақталды'); render(); }, '[data-save]');
    const acc = app.querySelector('[data-account]');
    if (acc) acc.onclick = async () => { await store.signOut(); location.hash = '#/'; render(); };
    app.querySelector('[data-logout]').onclick = async () => {
      await store.signOut(); location.hash = '#/'; render();
    };
  };
  return { html, mount };
}

// — Кіру —
function viewAuth() {
  const html = `<main class="page no-nav fade-in">
    <section class="auth-hero">
      <div class="big-ball">${icon('ball', { size: 220 })}</div>
      <span class="chip" style="width:fit-content">${icon('bolt', { size: 12 })} Күн сайын жаңа жаттығу</span>
      <h1 class="h-display" style="margin-top:14px">Күнделікті футбол жаттықтырушысы</h1>
      <p class="muted" style="margin:8px 0 0">Тактика, физика, психология және техника — күніне 4 қысқа сабақ.</p>
    </section>
    <div class="grid2">
      ${CATEGORY_ORDER.map((c) => `<div class="card row" style="gap:10px;padding:12px;--c:${CATEGORIES[c].color}"><span style="color:${CATEGORIES[c].color}">${icon(CATEGORY_ICON[c], { size: 20 })}</span><b style="font:700 14px var(--head)">${CATEGORIES[c].name}</b></div>`).join('')}
    </div>
    <div class="stack">
      <input class="field" id="au-email" type="email" autocomplete="email" placeholder="Электрондық пошта"/>
      <input class="field" id="au-pass" type="password" autocomplete="current-password" placeholder="Құпиясөз (кемінде 6 таңба)"/>
      <div data-msg></div>
      <div class="btn-row">
        <button class="btn btn-primary" data-in>Кіру</button>
        <button class="btn btn-secondary" data-up>Тіркелу</button>
      </div>
    </div>
    <div class="divider">немесе</div>
    <button class="btn btn-secondary" data-guest>${icon('play', { size: 18, fill: true })} Тіркелмей бастау</button>
    <p class="dim" style="text-align:center;font-size:12px;margin:0">Тіркелмей бастасаң, прогресс осы құрылғыда сақталады.</p>
  </main>`;
  const mount = () => {
    const email = app.querySelector('#au-email');
    const pass = app.querySelector('#au-pass');
    const msg = app.querySelector('[data-msg]');
    const show = (t, err = false) => { msg.innerHTML = t ? `<div class="msg ${err ? 'err' : ''}">${esc(t)}</div>` : ''; };
    const valid = () => {
      if (!/^\S+@\S+\.\S+$/.test(email.value)) { show('Электрондық поштаны дұрыс енгізіңіз.', true); return false; }
      if (pass.value.length < 6) { show('Құпиясөз кемінде 6 таңба болуы керек.', true); return false; }
      return true;
    };
    const busy = (b) => app.querySelectorAll('[data-in],[data-up],[data-guest]').forEach((x) => { x.disabled = b; });
    const lock = (b) => app.querySelectorAll('[data-in],[data-up],#au-email,#au-pass').forEach((x) => { x.disabled = b; });
    lock(true);
    show('Серверге қосылуды тексеру...');
    store.cloudAvailable().then((ok) => {
      if (!app.contains(msg)) return;
      if (ok) { lock(false); show(''); return; }
      show('Серверге қосылу мүмкін емес. Алдын ала көру режимінде (claude.ai ішінде) сыртқы серверге қосылуға тыйым салынған, ал нағыз сайтта бұл жұмыс істейді. Әзірге «Тіркелмей бастау» батырмасын басыңыз.', true);
    });
    app.querySelector('[data-in]').onclick = async () => {
      if (!valid()) return;
      busy(true); show('Кіру...');
      try { await store.signIn(email.value.trim(), pass.value); render(); }
      catch (e) { show(authError(e), true); busy(false); }
    };
    app.querySelector('[data-up]').onclick = async () => {
      if (!valid()) return;
      busy(true); show('Тіркелу...');
      try {
        const r = await store.signUp(email.value.trim(), pass.value);
        if (r.needsConfirm) { show('Поштаңызға растау хаты жіберілді. Сілтемені басып, осы жерден кіріңіз.'); busy(false); }
        else render();
      } catch (e) { show(authError(e), true); busy(false); }
    };
    app.querySelector('[data-guest]').onclick = () => { store.startGuest(); render(); };
    [email, pass].forEach((el) => el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !app.querySelector('[data-in]').disabled) app.querySelector('[data-in]').click();
    }));
  };
  return { html, mount };
}

function authError(e) {
  const m = (e?.message || '').toLowerCase();
  if (m.includes('invalid login')) return 'Пошта немесе құпиясөз қате.';
  if (m.includes('already registered')) return 'Бұл пошта тіркелген. «Кіру» батырмасын басыңыз.';
  if (m.includes('email not confirmed')) return 'Алдымен поштаңызға келген хаттағы сілтемені басыңыз.';
  if (m.includes('серверге')) return e.message;
  return 'Қате орын алды. Интернетті тексеріп, қайта көріңіз.';
}

// ───────────── Маршрутизатор ─────────────
function parseHash() {
  const h = location.hash.replace(/^#/, '') || '/';
  const [path, query] = h.split('?');
  const params = new URLSearchParams(query || '');
  return { parts: path.split('/').filter(Boolean), params };
}

// «Артқа» батырмасы соңғы ашылған тізім бетіне (басты, жаттығулар, т.б.) қайтарады
let lastListPage = '#/';

function render() {
  cleanups.forEach((f) => f());
  cleanups = [];
  let view;
  if (!state.mode) view = viewAuth();
  else if (!state.profile || !state.profile.level) view = viewOnboarding();
  else {
    const { parts, params } = parseHash();
    const [r, id] = parts;
    if (r !== 'ex') lastListPage = `#/${r || ''}`;
    if (r === 'ex' && id) view = viewExercise(id, params.get('d') || today());
    else if (r === 'drills') view = viewDrills();
    else if (r === 'progress') view = viewProgress();
    else if (r === 'profile') view = viewProfile();
    else view = { html: viewHome() };
  }
  if (typeof view === 'string') view = { html: view };
  app.innerHTML = view.html;
  window.scrollTo(0, 0);
  renderedDay = today();
  app.querySelectorAll('[data-back]').forEach((b) => { b.onclick = () => { location.hash = lastListPage; }; });
  app.querySelectorAll('[data-bell]').forEach((b) => { b.onclick = () => toast('Жаңа хабарлама жоқ'); });
  view.mount?.();
}

window.addEventListener('hashchange', render);

// Түн ортасынан кейін немесе қосымшаға қайта оралғанда күндік жоспарды жаңарту
let renderedDay = today();
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && today() !== renderedDay) render();
});

(async function boot() {
  app.innerHTML = `<div class="loader">${icon('ball', { size: 44, cls: 'spin' })}</div>`;
  try { await store.init(); } catch (e) { console.error(e); }
  render();
})();
