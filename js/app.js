import { CATEGORIES, CATEGORY_ORDER, LEVELS, POSITIONS, AGE_GROUPS } from './data.js';
import * as store from './store.js';
import { state } from './store.js';
import { renderPitch, LEGEND } from './pitch.js';
import { icon, CATEGORY_ICON } from './icons.js';
import { QUOTES, STORIES, FAQ, LESSONS, LESSON_XP_PER_CORRECT } from './content.js';

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
  if (!t) { t = document.createElement('div'); t.className = 'toast'; t.setAttribute('role', 'status'); t.setAttribute('aria-live', 'polite'); document.body.appendChild(t); }
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

const lessonXp = () => Object.values(state.lessons || {}).reduce((a, r) => a + r.score * LESSON_XP_PER_CORRECT, 0);
const xpTotal = () => state.completions.length * XP_PER + lessonXp();
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
      
      <h1>${esc(title)}</h1>
    </div>
    ${back ? '' : `<a class="icon-btn" href="#/ask" aria-label="Бапкерге сұрақ">${icon('chat', { size: 22 })}</a>`}
    <a href="#/profile" class="avatar" aria-label="Профиль">${esc(initials(name))}</a>
  </header>`;
}

function nav(active) {
  const items = [
    ['home', '#/', 'home', 'Басты'],
    ['lessons', '#/lessons', 'school', 'Сабақтар'],
    ['drills', '#/drills', 'drills', 'Жаттығулар'],
    ['progress', '#/progress', 'chart', 'Прогресс'],
    ['profile', '#/profile', 'user', 'Профиль'],
  ];
  return `<nav class="nav" aria-label="Негізгі мәзір">${items.map(([id, href, ic, label]) =>
    `<a href="${href}" class="${active === id ? 'on' : ''}"${active === id ? ' aria-current="page"' : ''}>${icon(ic, { size: 22 })}<span>${label}</span></a>`).join('')}</nav>`;
}

function ring(value, total, { size = 112, stroke = 10, color = 'var(--green)', track = '#0A2B21', label = '', sub = '' } = {}) {
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
  else if (next) right = `<span class="status go">Бастау</span>`;
  else if (status === 'wait') right = `<span class="status wait">${icon('hourglass', { size: 14 })} Күтілуде</span>`;
  else right = `<span class="dim">${icon('chevronRight', { size: 20 })}</span>`;
  return `<a href="#/ex/${ex.id}${day ? `?d=${day}` : ''}" class="drill ${next ? 'next' : ''}" style="--c:${cat.color}">
    <div class="d-icon">${icon(CATEGORY_ICON[ex.category], { size: 26 })}</div>
    <div class="d-body">
      <div class="d-meta">${cat.name} <span class="t">${icon('clock', { size: 13 })} ${ex.duration_min} мин</span></div>
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
      <h2 class="h-display">Сәлем, ${esc(name || 'чемпион')}!</h2>
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

    ${quoteCard(QUOTES[dayIndex(day) % QUOTES.length], 'Күн сөзі')}

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

    ${homeLessonCard()}

    <div class="grid2">
      <a href="#/stories" class="card feature" style="--c:var(--orange)">
        <span class="f-ic">${icon('trophy', { size: 22 })}</span>
        <b>Аңыздар жолы</b><small>Жұлдыздар қалай кәсіби ойыншы болды</small>
      </a>
      <a href="#/ask" class="card feature" style="--c:var(--cyan)">
        <span class="f-ic">${icon('chat', { size: 22 })}</span>
        <b>Бапкерге сұрақ</b><small>Өз сұрағыңды қой</small>
      </a>
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
      <span class="chip" style="background:color-mix(in srgb, ${cat.color} 15%, transparent);color:${cat.color}"><span class="dot"></span>${cat.name}, ${ex.duration_min} мин</span>
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
        <span class="chip gray">${icon('eye', { size: 14 })} Біз жоғары қарай шабуылдаймыз</span>
        <button class="icon-btn" data-replay aria-label="Схеманы қайта көрсету">${icon('refresh', { size: 18 })}</button>
      </div>
      <div data-pitch>${renderPitch(p, { uid: ex.id })}</div>
      <div class="legend">
        <span><i style="background:#FFC93C"></i>Біздің команда</span>
        <span><i style="background:#E5483A"></i>Қарсылас</span>
        <span><i style="background:transparent;border:2px solid #F2EFE6"></i>Назардағы ойыншы</span>
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
    <div data-feedback aria-live="polite"></div>
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
        else if (j === i) { b.classList.add('wrong'); b.querySelector('.radio').innerHTML = '✕'; tag.hidden = false; tag.textContent = 'Сіздің жауабыңыз'; tag.style.color = 'var(--red-text)'; }
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
        app.querySelector('[data-actions]').innerHTML = `<button class="btn btn-primary" data-finish>Аяқтау және келесіге өту</button>`;
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
        <span class="chip">${sets} сет × ${esc(p.reps)}</span>
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
      else if (st.phase === 'rest') primary = `<button class="btn btn-cyan btn" data-act="skip">Келесі сетке өту</button>`;
      else primary = `<button class="btn btn-primary" data-act="finish">${icon('checkCircle', { size: 20 })} Аяқтау, +${XP_PER} XP</button>`;
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
  ['bolt', 'Сенімді', 'Күшке толы'],
  ['flame', 'Ынталы', 'Жеңіске құштар'],
  ['wind', 'Салмақты', 'Зейін толық'],
  ['heart', 'Толқу бар', 'Бақылауда'],
];

function viewMental(ex, day) {
  const p = ex.payload;
  const isDone = store.isDone(ex.id, day);
  const existing = state.completions.find((c) => c.exercise_id === ex.id && c.day === day)?.note || '';
  const quote = QUOTES[(dayIndex(day) + 5) % QUOTES.length];
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
        <span class="chip gray">${icon('wind', { size: 14 })} ${breath.join('-')} әдісі</span>
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
      <div class="label muted" id="mood-label" style="font-size:14px">Бүгінгі көңіл-күйің:</div>
      <div class="mood-grid" role="group" aria-labelledby="mood-label">${MOODS.map(([ic, t, s], i) => `<button class="mood" data-mood="${i}" aria-pressed="false"><span class="e">${icon(ic, { size: 20 })}</span><span><b>${t}</b><small>${s}</small></span></button>`).join('')}</div>
      <label class="field-label" for="journal" style="margin-top:6px">${esc(p.journal || 'Бүгінгі ойың:')}</label>
      <textarea id="journal" class="field" maxlength="500" placeholder="Мысалы: Бүгін маңызды матч, аздап толқу бар, бірақ дайындығым жоғары...">${esc(existing.replace(/^\[.*?\]\s*/, ''))}</textarea>
      <div class="row between dim" style="font-size:12px"><span class="row" style="gap:4px">${icon('lock', { size: 12 })} Жеке жазба</span><span data-count>0 / 500</span></div>
    </section>

    ${quoteCard(quote, 'Күн ойы')}

    <div data-actions>${isDone
      ? `<a class="btn btn-secondary" href="#/">${icon('home', { size: 20 })} Басты бетке</a>`
      : `<button class="btn btn-primary" data-save>${icon('checkCircle', { size: 20 })} Сақтау және аяқтау</button>`}</div>
    <p class="dim" style="text-align:center;font-size:12px;margin:0">Жазбаң тек өзіңе көрінеді және прогресіңе қосылады</p>
  </main>`;

  const mount = () => {
    let mood = null;
    const moodMatch = existing.match(/^\[(.*?)\]/);
    app.querySelectorAll('[data-mood]').forEach((b) => {
      if (moodMatch && MOODS[b.dataset.mood][1] === moodMatch[1]) { b.classList.add('on'); b.setAttribute('aria-pressed', 'true'); mood = Number(b.dataset.mood); }
      b.onclick = () => {
        app.querySelectorAll('[data-mood]').forEach((x) => { x.classList.remove('on'); x.setAttribute('aria-pressed', 'false'); });
        b.classList.add('on'); b.setAttribute('aria-pressed', 'true'); mood = Number(b.dataset.mood);
      };
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
          secEl.textContent = `${left} сек, ${Math.floor(t / cycleSec) + 1}-цикл`;
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
      <p class="muted" style="margin:6px 0 0">${state.exercises.length} жаттығу. Кез келгенін қазір орындауға болады.</p>
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
  const grid = [0.25, 0.5, 0.75, 1].map((k) => `<polygon points="${axes.map(([, x, y]) => `${cx + x * R * k},${cy + y * R * k}`).join(' ')}" fill="none" stroke="rgba(242,239,230,.22)" stroke-dasharray="3 3"/>`).join('');
  const pts = axes.map(([c, x, y]) => { const k = scores[c] / 100; return [cx + x * R * k, cy + y * R * k]; });
  const lines = axes.map(([, x, y]) => `<line x1="${cx}" y1="${cy}" x2="${cx + x * R}" y2="${cy + y * R}" stroke="rgba(242,239,230,.22)" stroke-dasharray="3 3"/>`).join('');
  const labels = axes.map(([c, x, y, name, anchor, dy]) => `<text x="${cx + x * (R + 8)}" y="${cy + y * (R + 4) + dy}" text-anchor="${anchor}" ${c === 'mental' ? 'style="fill:#8AB4FF"' : ''}>${name}</text>`).join('');
  return `<svg class="radar" viewBox="-45 0 390 265" width="100%">
    ${grid}${lines}
    <polygon points="${pts.map((p) => p.join(',')).join(' ')}" fill="rgba(255,201,60,.25)" stroke="#FFC93C" stroke-width="2.5"/>
    ${pts.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="5" fill="#FFC93C" stroke="#0A2B21" stroke-width="2"/>`).join('')}
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
  const lessonsDone = Object.keys(state.lessons || {}).length;
  const perfect = Object.values(state.lessons || {}).filter((r) => r.score === r.total).length;

  const badges = [
    ['flame', 'Алғашқы қадам', 'Бірінші жаттығу', state.completions.length, 1, 'var(--orange)'],
    ['flame', '7 күн қатарынан', 'Үзіліссіз серия', best, 7, 'var(--orange)'],
    ['target', 'Тактик', '10 тактикалық сабақ', byCat('tactics'), 10, 'var(--green)'],
    ['bolt', 'Жүйрік', '10 физикалық жаттығу', byCat('physical'), 10, 'var(--cyan)'],
    ['trophy', 'Толық күн', '4 бөлімді бір күнде', fullDays, 1, 'var(--purple)'],
    ['medal', 'Апта чемпионы', 'Аптада 5 белсенді күн', activeDays, 5, 'var(--purple)'],
    ['school', 'Тактик-ғалым', '4 позиция сабағы', lessonsDone, 4, 'var(--cyan)'],
    ['star', 'Мінсіз сабақ', 'Сабақта барлық жауап дұрыс', perfect, 1, 'var(--green)'],
  ];
  const got = badges.filter((b) => b[3] >= b[4]).length;

  const html = `${topbar({ title: 'Прогресс' })}
  <main class="page fade-in">
    <section class="card lg">
      <div class="row" style="gap:14px">
        <div style="position:relative">
          <div class="avatar lg">${esc(initials(p.name))}</div>
          <span class="chip" style="position:absolute;bottom:-8px;left:50%;transform:translateX(-50%);min-height:22px;padding:0 8px;font-size:12px;background:var(--green);color:var(--bg)">LVL ${lvl}</span>
        </div>
        <div style="min-width:0">
          <div class="h-md" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(p.name || 'Ойыншы')}</div>
          <div class="muted" style="font-size:13px">Деңгей ${lvl} — ${esc(POSITIONS[p.position] || 'Ойыншы')}</div>
          <div class="row" style="gap:6px;margin-top:4px;color:var(--cyan);font:700 12px var(--head)">${icon('star', { size: 14 })} ${esc(LEVELS[p.level] || '')} деңгей</div>
        </div>
      </div>
      <div class="row between" style="margin:16px 0 8px;font:700 13px var(--head)"><span class="row" style="gap:6px">${icon('trend', { size: 16, cls: 'green' })} Тәжірибе ұпайы</span><span class="green tnum">${into} / ${need} XP</span></div>
      <div class="bar" style="height:10px"><i style="width:${(into / need) * 100}%;background:var(--green);box-shadow:var(--glow-green)"></i></div>
      <div class="row between dim" style="margin-top:8px;font:700 12px var(--head)"><span>Келесі деңгейге: ${need - into} XP</span><span class="green">Барлығы ${xp} XP</span></div>
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
      <a href="#/lessons" class="card list-link"><div class="s-ic" style="color:var(--purple)">${icon('school', { size: 22 })}</div><div style="flex:1"><div class="muted" style="font-size:13px">Позиция сабақтары</div><b>${lessonsDone} / ${LESSONS.length} сабақ</b></div><span class="dim">${icon('chevronRight', { size: 20 })}</span></a>
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
      <button class="btn btn-primary btn-sm" data-share>Бөлісу</button>
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
  const choice = (name, map, val) => `<div class="choice-grid" role="group" aria-labelledby="lbl-${name}">${Object.entries(map).map(([k, v]) =>
    `<button type="button" class="choice ${val === k ? 'on' : ''}" data-choice="${name}" data-v="${k}" aria-pressed="${val === k}">${v}</button>`).join('')}</div>`;
  return `
    <div><label class="field-label" for="pf-name">Атың</label><input id="pf-name" class="field" maxlength="40" placeholder="Мысалы: Әлихан" value="${esc(p.name || '')}"/></div>
    <div><span class="field-label" id="lbl-age_group">Жасың</span>${choice('age_group', AGE_GROUPS, p.age_group)}</div>
    <div><span class="field-label" id="lbl-position">Позицияң</span>${choice('position', POSITIONS, p.position)}</div>
    <div><span class="field-label" id="lbl-level">Деңгейің</span>${choice('level', LEVELS, p.level)}</div>`;
}

function bindProfileForm(initial, onSubmit, btnSel) {
  const vals = { age_group: initial.age_group || null, position: initial.position || null, level: initial.level || null };
  const btn = app.querySelector(btnSel);
  const nameEl = app.querySelector('#pf-name');
  const check = () => { btn.disabled = !(nameEl.value.trim() && vals.age_group && vals.position && vals.level); };
  app.querySelectorAll('[data-choice]').forEach((b) => {
    b.onclick = () => {
      app.querySelectorAll(`[data-choice="${b.dataset.choice}"]`).forEach((x) => { x.classList.remove('on'); x.setAttribute('aria-pressed', 'false'); });
      b.classList.add('on'); b.setAttribute('aria-pressed', 'true');
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
    <button class="btn btn-primary" data-save>Жоспарды құру</button>
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
        <div class="muted" style="font-size:13px">${esc(POSITIONS[p.position] || '')}, ${esc(AGE_GROUPS[p.age_group] || '')}</div>
        <div style="margin-top:8px">${state.mode === 'cloud'
          ? `<span class="chip">${icon('shield', { size: 12 })} ${esc(state.user?.email || 'Аккаунт')}</span>`
          : `<span class="chip orange">${icon('info', { size: 12 })} Қонақ режимі</span>`}</div>
      </div>
    </section>
    ${state.mode !== 'cloud' ? `<div class="msg">Қонақ режимінде прогресс тек осы құрылғыда сақталады. Басқа телефоннан да кіру үшін аккаунт ашыңыз.</div>` : ''}
    <div class="grid2">
      <a href="#/stories" class="card feature" style="--c:var(--orange)"><span class="f-ic">${icon('trophy', { size: 22 })}</span><b>Аңыздар жолы</b><small>Тарихтар мен сөздер</small></a>
      <a href="#/ask" class="card feature" style="--c:var(--cyan)"><span class="f-ic">${icon('chat', { size: 22 })}</span><b>Бапкерге сұрақ</b><small>${state.questions.filter((q) => q.mine).length} сұрақ</small></a>
    </div>
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
    <div class="row" style="margin:-6px 0 -8px -8px"><a class="icon-btn" href="#/" aria-label="Басты бетке">${icon('arrowLeft', { size: 22 })}</a><span class="muted" style="font-size:14px">Футбол Коуч</span></div>
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
      <div><label class="field-label" for="au-email">Электрондық пошта</label>
      <input class="field" id="au-email" type="email" inputmode="email" autocomplete="email" placeholder="name@mail.kz"/></div>
      <div><label class="field-label" for="au-pass">Құпиясөз</label>
      <input class="field" id="au-pass" type="password" autocomplete="current-password" aria-describedby="au-pass-hint" placeholder="••••••"/>
      <small id="au-pass-hint" class="dim" style="display:block;margin-top:6px;font-size:13px">Кемінде 6 таңба</small></div>
      <div data-msg role="status" aria-live="polite"></div>
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
      try { await store.signIn(email.value.trim(), pass.value); location.hash = '#/'; render(); }
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
    app.querySelector('[data-guest]').onclick = () => { store.startGuest(); location.hash = '#/'; render(); };
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
  if (m.includes('invalid email')) return 'Электрондық поштаны дұрыс енгізіңіз.';
  if (m.includes('weak password')) return 'Құпиясөз 6–72 таңба болуы керек.';
  if (m.includes('серверге')) return e.message;
  return 'Қате орын алды. Интернетті тексеріп, қайта көріңіз.';
}

// ───────────── Мотивация карточкасы ─────────────
function quoteCard(q, label = 'Күн сөзі') {
  return `<section class="card quote-card">
    <div class="q-ic">${icon('quote', { size: 24 })}</div>
    <div style="min-width:0">
      <div class="label" style="color:var(--orange)">${esc(label)}</div>
      <p>«${esc(q.text)}»</p>
      <small class="muted">— ${esc(q.author)}${q.role ? `, <span class="dim">${esc(q.role)}</span>` : ''}</small>
    </div>
  </section>`;
}

// ───────────── Позиция мектебі ─────────────
const lessonsFor = (pos) => LESSONS.filter((l) => !pos || l.position === pos);

function homeLessonCard() {
  const pos = state.profile?.position;
  const list = lessonsFor(pos);
  const next = list.find((l) => !state.lessons[l.id]) || list[0];
  if (!next) return '';
  const r = state.lessons[next.id];
  return `<a href="#/lesson/${next.id}" class="card lesson-hero">
    <div class="row between" style="margin-bottom:8px">
      <span class="label green">${icon('school', { size: 14 })} ${esc(POSITIONS[next.position])} мектебі</span>
      <span class="chip gray">${next.questions.length} сұрақ, ${next.duration_min} мин</span>
    </div>
    <div class="h-md">${esc(next.title)}</div>
    <div class="muted" style="font-size:13px;margin-top:4px">${esc(next.summary)}</div>
    <div class="row" style="margin-top:12px;gap:8px;color:var(--green);font:700 13px var(--head)">${r ? 'Қайта өту' : 'Сабақты бастау'}</div>
  </a>`;
}

let lessonPos = null;
function viewLessons() {
  if (lessonPos === null) lessonPos = state.profile?.position || 'all';
  const list = lessonsFor(lessonPos === 'all' ? null : lessonPos);
  const doneCount = LESSONS.filter((l) => state.lessons[l.id]).length;
  const html = `${topbar({ title: 'Сабақтар' })}
  <main class="page fade-in">
    <div>
      <h2 class="h-lg">Позиция мектебі</h2>
      <p class="muted" style="margin:6px 0 0">Әр позицияға арналған тактикалық сабақтар: қысқа теория, алаңдағы жағдай және сұрақтар.</p>
    </div>
    <div class="card row" style="gap:14px">
      ${ring(doneCount, LESSONS.length, { size: 64, stroke: 7, label: `${doneCount}`, sub: '' })}
      <div><b style="font:800 16px var(--head)">${doneCount} / ${LESSONS.length} сабақ өтілді</b><div class="muted" style="font-size:13px">Әр дұрыс жауап +${LESSON_XP_PER_CORRECT} XP береді</div></div>
    </div>
    <div class="filters">
      <button class="filter ${lessonPos === 'all' ? 'on' : ''}" data-p="all">Барлығы</button>
      ${Object.entries(POSITIONS).map(([k, v]) => `<button class="filter ${lessonPos === k ? 'on' : ''}" data-p="${k}">${v}${state.profile?.position === k ? ' ★' : ''}</button>`).join('')}
    </div>
    <div class="stack">
      ${list.map((l) => {
        const r = state.lessons[l.id];
        const pct = r ? Math.round((r.score / r.total) * 100) : 0;
        return `<a href="#/lesson/${l.id}" class="drill" style="--c:var(--green)">
          <div class="d-icon">${icon('school', { size: 26 })}</div>
          <div class="d-body">
            <div class="d-meta">${esc(POSITIONS[l.position])} <span class="t">${l.questions.length} сұрақ, ${l.duration_min} мин</span></div>
            <div class="d-title">${esc(l.title)}</div>
            <div class="d-sub">${esc(l.summary)}</div>
          </div>
          ${r ? `<span class="status done">${r.score}/${r.total}</span>` : `<span class="dim">${icon('chevronRight', { size: 20 })}</span>`}
          ${r ? `<i class="mini-bar" style="width:${pct}%"></i>` : ''}
        </a>`;
      }).join('')}
    </div>
  </main>
  ${nav('lessons')}`;
  const mount = () => {
    app.querySelectorAll('[data-p]').forEach((b) => { b.onclick = () => { lessonPos = b.dataset.p; render(); }; });
  };
  return { html, mount };
}

function viewLesson(id) {
  const lesson = LESSONS.find((l) => l.id === id);
  if (!lesson) return { html: `${topbar({ title: 'Табылмады', back: true })}<main class="page"><p>Сабақ табылмады.</p></main>` };
  const qs = lesson.questions;
  const st = { step: 0, answers: [] }; // 0 — теория, 1..n — сұрақтар, n+1 — нәтиже
  const html = `${topbar({ title: 'Сабақ', back: true })}<main class="page no-nav fade-in" data-lesson></main>`;

  const mount = () => {
    const root = app.querySelector('[data-lesson]');
    const header = () => `<div class="ex-head" style="--c:var(--green)">
      <div class="row between">
        <span class="chip"><span class="dot"></span>${esc(POSITIONS[lesson.position])}, ${lesson.duration_min} мин</span>
        <span class="chip gray">${st.step === 0 ? 'Теория' : st.step <= qs.length ? `Сұрақ ${st.step} / ${qs.length}` : 'Нәтиже'}</span>
      </div>
      <h2 class="h-lg" style="margin-top:12px">${esc(lesson.title)}</h2>
      <div class="progress-line"><i style="width:${(Math.min(st.step, qs.length + 1) / (qs.length + 1)) * 100}%"></i></div>
    </div>`;

    const draw = () => {
      window.scrollTo(0, 0);
      if (st.step === 0) {
        root.innerHTML = `${header()}
          <p class="muted" style="margin:0">${esc(lesson.summary)}</p>
          <div class="stack">${lesson.theory.map((t, i) => `<section class="card theory">
            <span class="n">${i + 1}</span>
            <div><div class="h-sm">${esc(t.h)}</div><p class="muted" style="margin:6px 0 0;line-height:1.55">${esc(t.p)}</p></div>
          </section>`).join('')}</div>
          <button class="btn btn-primary" data-next>Сұрақтарға өту</button>`;
      } else if (st.step <= qs.length) {
        const q = qs[st.step - 1];
        const answered = st.answers[st.step - 1];
        root.innerHTML = `${header()}
          ${q.scheme ? `<section class="pitch-card">
            <div data-pitch>${renderPitch(q.scheme, { uid: `${lesson.id}-${st.step}` })}</div>
            <div class="legend">
              <span><i style="background:#FFC93C"></i>Біздің команда</span>
              <span><i style="background:#E5483A"></i>Қарсылас</span>
              <span><i style="background:transparent;border:2px solid #F2EFE6"></i>Сен</span>
              ${LEGEND.filter((l) => (q.scheme.arrows || []).some((a) => a.k === l.k)).map((l) =>
                `<span><em style="border-color:${l.color};${l.dashed ? 'border-top-style:dashed' : ''}"></em>${l.label}</span>`).join('')}
            </div>
          </section>` : ''}
          <section class="card lg">
            <div class="label green" style="margin-bottom:10px">${icon('brain', { size: 14 })} Тактикалық шешім</div>
            <h3 class="h-md" style="margin-bottom:14px">${esc(q.question)}</h3>
            <div class="stack">${q.options.map((o, i) => `<button class="opt" data-opt="${i}"><span class="radio"></span><span><span class="tag" hidden></span>${esc(o)}</span></button>`).join('')}</div>
          </section>
          <div data-feedback aria-live="polite"></div>
          <div data-actions></div>`;
        const opts = [...root.querySelectorAll('[data-opt]')];
        const reveal = (i) => {
          opts.forEach((b, j) => {
            b.disabled = true;
            const tag = b.querySelector('.tag');
            if (j === q.answer) { b.classList.add('right'); b.querySelector('.radio').innerHTML = icon('check', { size: 14 }); tag.hidden = false; tag.textContent = 'Дұрыс жауап'; tag.style.color = 'var(--green)'; }
            else if (j === i) { b.classList.add('wrong'); b.querySelector('.radio').innerHTML = '✕'; tag.hidden = false; tag.textContent = 'Сенің жауабың'; tag.style.color = 'var(--red-text)'; }
          });
          const ok = i === q.answer;
          root.querySelector('[data-feedback]').innerHTML = `<section class="feedback ${ok ? '' : 'bad'}">
            <div class="row between" style="margin-bottom:10px">
              <span class="h-md" style="color:${ok ? 'var(--green)' : '#FDA4AF'}">${ok ? 'Дұрыс! 👏' : 'Дәл емес'}</span>
              ${ok ? `<span class="chip">${icon('bolt', { size: 12 })} +${LESSON_XP_PER_CORRECT} XP</span>` : ''}
            </div>
            <p style="margin:0;line-height:1.55">${esc(q.explain)}</p>
          </section>`;
          const last = st.step === qs.length;
          root.querySelector('[data-actions]').innerHTML = `<button class="btn btn-primary" data-next>${last ? 'Нәтижені көру' : 'Келесі сұрақ'}</button>`;
          root.querySelector('[data-next]').onclick = () => { st.step++; draw(); };
        };
        opts.forEach((b) => { b.onclick = () => { st.answers[st.step - 1] = Number(b.dataset.opt); reveal(Number(b.dataset.opt)); }; });
        if (answered !== undefined) reveal(answered);
        return;
      } else {
        const score = st.answers.filter((a, i) => a === qs[i].answer).length;
        const prev = state.lessons[lesson.id];
        root.innerHTML = `${header()}
          <section class="card lg" style="text-align:center">
            <div style="display:flex;justify-content:center">${ring(score, qs.length, { size: 140, stroke: 12, label: `${score}/${qs.length}`, sub: 'дұрыс' })}</div>
            <div class="h-md" style="margin-top:14px">${score === qs.length ? 'Керемет! Тактикалық сауатың жоғары 🏆' : score >= qs.length / 2 ? 'Жақсы нәтиже! 👍' : 'Түсіндірмелерді қайта оқып шық 💪'}</div>
            <p class="muted" style="margin:6px 0 0" data-xp>${prev && prev.score >= score ? `Сенің ең жақсы нәтижең: ${prev.score}/${prev.total}` : `+${score * LESSON_XP_PER_CORRECT} XP`}</p>
          </section>
          ${lesson.drills.length ? `<div class="section-title"><h3 class="h-md">${icon('drills', { size: 20, cls: 'green' })} Алаңда бекіт</h3></div>
          <div class="stack">${lesson.drills.map((d) => exById(d)).filter(Boolean).map((e) => drillCard(e, { day: today(), status: store.isDone(e.id, today()) ? 'done' : null })).join('')}</div>` : ''}
          <div class="btn-row">
            <button class="btn btn-secondary" data-retry>${icon('refresh', { size: 18 })} Қайта</button>
            <a class="btn btn-primary" href="#/lessons">Сабақтар</a>
          </div>`;
        root.querySelector('[data-retry]').onclick = () => { st.step = 0; st.answers = []; draw(); };
        store.saveLessonResult(lesson.id, score, qs.length)
          .then((improved) => { if (improved && score) toast(`+${score * LESSON_XP_PER_CORRECT} XP — сабақ аяқталды!`); })
          .catch((e) => { console.error(e); toast('Нәтижені сақтау сәтсіз болды'); });
        return;
      }
      const nx = root.querySelector('[data-next]');
      if (nx) nx.onclick = () => { st.step++; draw(); };
    };
    draw();
  };
  return { html, mount };
}

// ───────────── Аңыздар жолы және мотивация ─────────────
let storiesTab = 'stories';
function viewStories() {
  const html = `${topbar({ title: 'Аңыздар', back: true })}
  <main class="page no-nav fade-in">
    <div>
      <h2 class="h-lg">Аңыздар жолы</h2>
      <p class="muted" style="margin:6px 0 0">Әлемдік жұлдыздар да бір кезде сен сияқты бастаған. Олардың жолы мен бапкерлердің сөзі — мотивация көзі.</p>
    </div>
    <div class="filters">
      <button class="filter ${storiesTab === 'stories' ? 'on' : ''}" data-t="stories">Ойыншылар тарихы</button>
      <button class="filter ${storiesTab === 'quotes' ? 'on' : ''}" data-t="quotes">Бапкерлер сөзі</button>
    </div>
    ${storiesTab === 'stories'
      ? `<div class="stack">${STORIES.map((p) => `<a href="#/story/${p.id}" class="card story-card" style="--c:${p.color}">
          <div class="s-avatar">${esc(initials(p.name))}</div>
          <div style="flex:1;min-width:0">
            <div class="h-sm">${esc(p.name)}</div>
            <div class="muted" style="font-size:13px">${esc(p.country)}, ${esc(p.position)}</div>
            <div class="dim" style="font-size:12px;margin-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(p.lesson)}</div>
          </div>
          <span class="dim">${icon('chevronRight', { size: 20 })}</span>
        </a>`).join('')}</div>`
      : `<div class="stack">${QUOTES.map((q) => quoteCard(q, q.role && q.role.includes('Бапкер') ? 'Бапкер' : 'Аңыз')).join('')}</div>
         <p class="dim" style="font-size:12px;margin:0">Сөздер қазақ тіліне аударылған.</p>`}
  </main>`;
  const mount = () => { app.querySelectorAll('[data-t]').forEach((b) => { b.onclick = () => { storiesTab = b.dataset.t; render(); }; }); };
  return { html, mount };
}

function viewStory(id) {
  const p = STORIES.find((x) => x.id === id);
  if (!p) return { html: `${topbar({ title: 'Табылмады', back: true })}<main class="page"><p>Тарих табылмады.</p></main>` };
  const idx = STORIES.indexOf(p);
  const next = STORIES[(idx + 1) % STORIES.length];
  const block = (ic, title, text, color) => `<section class="card story-block" style="--c:${color}">
    <div class="row" style="gap:10px;margin-bottom:8px"><span class="sb-ic">${icon(ic, { size: 18 })}</span><span class="label" style="color:${color}">${title}</span></div>
    <p style="margin:0;line-height:1.6">${esc(text)}</p>
  </section>`;
  const html = `${topbar({ title: 'Аңыздар жолы', back: true })}
  <main class="page no-nav fade-in">
    <section class="hero story-hero" style="--c:${p.color}">
      <div class="hero-ic">${icon('trophy', { size: 190 })}</div>
      <div class="s-avatar lg">${esc(initials(p.name))}</div>
      <h2 class="h-lg" style="margin-top:12px">${esc(p.name)}</h2>
      <div class="muted">${esc(p.country)}, ${esc(p.position)}</div>
    </section>
    <section class="card">
      <div class="label muted" style="margin-bottom:10px">Мансап жолы</div>
      <div class="path">${p.path.map((c, i) => `<span class="path-step"><i style="background:${i === p.path.length - 1 ? p.color : 'var(--border-2)'}"></i>${esc(c)}</span>`).join('')}</div>
    </section>
    ${block('ball', 'Бастауы', p.start, 'var(--cyan)')}
    ${block('flame', 'Қиындық', p.hardship, 'var(--orange)')}
    ${block('trend', 'Бетбұрыс', p.turning, 'var(--green)')}
    <section class="card lg" style="border-color:${p.color};background:linear-gradient(170deg, color-mix(in srgb, ${p.color} 14%, var(--card)), var(--card) 70%)">
      <div class="label" style="color:${p.color};margin-bottom:8px">Саған сабақ</div>
      <p style="margin:0;font:600 16px/1.5 var(--head)">${esc(p.lesson)}</p>
    </section>
    <a class="btn btn-secondary" href="#/story/${next.id}">Келесі: ${esc(next.name)}</a>
  </main>`;
  return { html };
}

// ───────────── Бапкерге сұрақ ─────────────
const Q_CATS = { tactics: 'Тактика', physical: 'Физика', mental: 'Психология', technique: 'Техника', other: 'Басқа' };
const norm = (t) => t.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ');
function faqMatches(text, limit = 2) {
  const t = norm(text);
  if (t.trim().length < 4) return [];
  return FAQ.map((f) => ({ f, s: f.k.reduce((a, k) => a + (t.includes(k) ? 2 : 0), 0) + norm(f.q).split(/\s+/).filter((w) => w.length > 3 && t.includes(w)).length }))
    .filter((x) => x.s >= 2).sort((a, b) => b.s - a.s).slice(0, limit).map((x) => x.f);
}

function faqItem(f, open = false) {
  return `<details class="faq" ${open ? 'open' : ''}><summary>${esc(f.q)}<span>${icon('chevronRight', { size: 18 })}</span></summary><p>${esc(f.a)}</p></details>`;
}

const MONTHS = ['қаңтар', 'ақпан', 'наурыз', 'сәуір', 'мамыр', 'маусым', 'шілде', 'тамыз', 'қыркүйек', 'қазан', 'қараша', 'желтоқсан'];
function fmtDate(iso) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

let askCat = 'tactics';
function viewAsk() {
  const mine = state.questions.filter((q) => q.mine);
  const others = state.questions.filter((q) => !q.mine && q.answer);
  const guest = state.mode !== 'cloud';
  const html = `${topbar({ title: 'Бапкерге сұрақ', back: true })}
  <main class="page no-nav fade-in">
    <section class="auth-hero" style="min-height:0;padding:22px">
      <div class="big-ball" style="top:-40px;right:-40px">${icon('chat', { size: 180 })}</div>
      <span class="chip cyan" style="width:fit-content">${icon('chat', { size: 12 })} Сұрақ-жауап</span>
      <h2 class="h-lg" style="margin-top:12px">Сұрағың бар ма?</h2>
      <p class="muted" style="margin:6px 0 0">Тактика, жаттығу, тамақтану, толқу — кез келген сұрағыңды жаз. Бапкерлер жауап береді, ал ұқсас сұрақтардың жауабын бірден көресің.</p>
    </section>

    <section class="card lg stack">
      <span class="field-label" style="margin:0" id="ask-cat-label">Тақырып</span>
      <div class="filters" style="flex-wrap:wrap" role="group" aria-labelledby="ask-cat-label">${Object.entries(Q_CATS).map(([k, v]) => `<button class="filter ${askCat === k ? 'on' : ''}" data-c="${k}">${v}</button>`).join('')}</div>
      <label class="field-label" for="ask-text" style="margin:0">Сұрағың</label>
      <textarea id="ask-text" class="field" maxlength="600" placeholder="Мысалы: Қорғаушы ретінде жылдам шабуылшыға қарсы қалай ойнаймын?"></textarea>
      <div class="row between dim" style="font-size:12px"><span>${guest ? `${icon('info', { size: 12 })} Қонақ режимінде сұрақ тек осы құрылғыда сақталады` : `${icon('lock', { size: 12 })} Сұрағыңды тек сен және бапкер көреді`}</span><span data-count>0 / 600</span></div>
      <div data-suggest aria-live="polite"></div>
      <button class="btn btn-primary" data-send disabled>${icon('send', { size: 18 })} Сұрақты жіберу</button>
    </section>

    ${mine.length ? `<div class="section-title"><h3 class="h-md">${icon('chat', { size: 20, cls: 'green' })} Менің сұрақтарым</h3><span class="label muted">${mine.length}</span></div>
    <div class="stack">${mine.map((q) => `<section class="card q-card">
      <div class="row between" style="margin-bottom:8px">
        <span class="chip gray">${esc(Q_CATS[q.category] || 'Басқа')}</span>
        ${q.answer ? `<span class="status done">${icon('checkCircle', { size: 14 })} Жауап бар</span>` : `<span class="status wait">${icon('hourglass', { size: 12 })} ${guest ? 'Сақталды' : 'Жауап күтілуде'}</span>`}
      </div>
      <p style="margin:0;font-weight:600">${esc(q.text)}</p>
      <small class="dim">${fmtDate(q.created_at)}</small>
      ${q.answer ? `<div class="answer"><div class="label green" style="margin-bottom:6px">${icon('whistle', { size: 14 })} Бапкер жауабы</div><p style="margin:0;line-height:1.55">${esc(q.answer)}</p></div>` : ''}
    </section>`).join('')}</div>` : ''}

    ${others.length ? `<div class="section-title"><h3 class="h-md">Басқа ойыншылардың сұрақтары</h3></div>
    <div class="stack">${others.map((q) => faqItem({ q: q.text, a: q.answer })).join('')}</div>` : ''}

    <div class="section-title"><h3 class="h-md">${icon('book', { size: 20, cls: 'green' })} Жиі қойылатын сұрақтар</h3></div>
    <div class="stack">${FAQ.map((f) => faqItem(f)).join('')}</div>
  </main>`;

  const mount = () => {
    const ta = app.querySelector('#ask-text');
    const send = app.querySelector('[data-send]');
    const sug = app.querySelector('[data-suggest]');
    const cnt = app.querySelector('[data-count]');
    app.querySelectorAll('[data-c]').forEach((b) => {
      b.onclick = () => { askCat = b.dataset.c; app.querySelectorAll('[data-c]').forEach((x) => { x.classList.toggle('on', x === b); x.setAttribute('aria-pressed', String(x === b)); }); };
    });
    let h;
    ta.oninput = () => {
      cnt.textContent = `${ta.value.length} / 600`;
      send.disabled = ta.value.trim().length < 8;
      clearTimeout(h);
      h = setTimeout(() => {
        const m = faqMatches(ta.value);
        sug.innerHTML = m.length ? `<div class="label muted" style="margin-bottom:8px">Мүмкін, жауап осында бар:</div><div class="stack">${m.map((f) => faqItem(f, true)).join('')}</div>` : '';
      }, 250);
    };
    send.onclick = async () => {
      const text = ta.value.trim();
      if (text.length < 8) return;
      send.disabled = true;
      try {
        await store.askQuestion(text, askCat);
        toast(guest ? 'Сұрақ сақталды' : 'Сұрақ бапкерге жіберілді');
        render();
      } catch (e) {
        console.error(e);
        toast('Жіберу сәтсіз болды. Қайта көріңіз.');
        send.disabled = false;
      }
    };
    if (!guest) store.refreshQuestions().then(() => {
      const fresh = state.questions.filter((q) => q.mine && q.answer).length;
      if (fresh !== mine.filter((q) => q.answer).length && location.hash.startsWith('#/ask')) render();
    }).catch(() => {});
  };
  return { html, mount };
}

// ───────────── LANDING: тіркелмеген қонаққа арналған басты бет ─────────────
function landingBoard() {
  // Көлденең алаң 105×68, біз оңға шабуылдаймыз. Магниттер бір рет орнына отырады, сосын бор жебелері сызылады.
  const ours = [
    [1, 6, 34], [2, 28, 58], [4, 25, 41], [5, 25, 27], [3, 28, 10],
    [6, 44, 34], [8, 47, 18], [10, 52, 50],
    [7, 70, 60], [9, 66, 34], [11, 72, 9],
  ];
  const theirs = [[4, 74, 28], [5, 76, 41], [6, 64, 24], [8, 63, 46], [2, 86, 56], [3, 88, 14], [1, 100, 34]];
  const W = 105, H = 68;
  const s = 'stroke="rgba(242,239,230,.5)" stroke-width=".35" fill="none"';
  let stripes = '';
  for (let i = 0; i < 10; i++) if (i % 2 === 0) stripes += `<rect x="${(W / 10) * i}" y="0" width="${W / 10}" height="${H}" fill="rgba(242,239,230,.028)"/>`;
  const lines = `
    <rect x="1" y="1" width="${W - 2}" height="${H - 2}" ${s}/>
    <line x1="${W / 2}" y1="1" x2="${W / 2}" y2="${H - 1}" ${s}/>
    <circle cx="${W / 2}" cy="${H / 2}" r="9.15" ${s}/>
    <rect x="1" y="${(H - 40.3) / 2}" width="16.5" height="40.3" ${s}/>
    <rect x="1" y="${(H - 18.3) / 2}" width="5.5" height="18.3" ${s}/>
    <rect x="${W - 17.5}" y="${(H - 40.3) / 2}" width="16.5" height="40.3" ${s}/>
    <rect x="${W - 6.5}" y="${(H - 18.3) / 2}" width="5.5" height="18.3" ${s}/>
    <path d="M 17.5 26.7 A 9.15 9.15 0 0 1 17.5 41.3" ${s}/>
    <path d="M ${W - 17.5} 26.7 A 9.15 9.15 0 0 0 ${W - 17.5} 41.3" ${s}/>`;
  const arrows = [
    // [x1,y1,x2,y2, kind, delay]
    [44, 34, 64, 34, 'pass', 1.55],
    [47, 18, 79, 24, 'run', 1.95],
    [66, 34, 78, 27, 'pass', 2.55],
    [70, 60, 90, 58, 'run', 2.95],
  ];
  const arrowEls = arrows.map(([x1, y1, x2, y2, k, d]) => {
    const len = Math.hypot(x2 - x1, y2 - y1);
    const ux = (x2 - x1) / len, uy = (y2 - y1) / len;
    const ex = x2 - ux * 3, ey = y2 - uy * 3; // ұшына орын
    const bx = ex - ux * 2.2, by = ey - uy * 2.2, px = -uy * 1.3, py = ux * 1.3;
    const col = k === 'pass' ? '#8AB4FF' : '#F2EFE6';
    const dash = k === 'run' ? 'stroke-dasharray="1.6 1.2"' : '';
    // жүгіріс сызығы үзік болғандықтан «сызылу» анимациясын тек паста қолданамыз
    const line = k === 'run'
      ? `<path class="head-tip" style="--d:${d}s" d="M ${x1} ${y1} L ${bx} ${by}" stroke="${col}" stroke-width=".7" stroke-linecap="round" ${dash} fill="none"/>`
      : `<path class="chalk-line" style="--len:${len.toFixed(1)};--d:${d}s" d="M ${x1} ${y1} L ${bx} ${by}" stroke="${col}" stroke-width=".7" stroke-linecap="round" fill="none"/>`;
    return `${line}<path class="head-tip" style="--d:${(d + 0.5).toFixed(2)}s" d="M ${ex} ${ey} L ${bx + px} ${by + py} L ${bx - px} ${by - py} Z" fill="${col}"/>`;
  }).join('');
  const magnet = (n, x, y, team, i) => {
    const fill = team === 'a' ? '#FFC93C' : '#E5483A';
    const txt = team === 'a' ? '#16261D' : '#FFFFFF';
    const fx = team === 'a' ? -14 : 14, fy = 10;
    return `<g class="magnet" style="--d:${(0.08 * i).toFixed(2)}s;--fx:${fx}px;--fy:${fy}px">
      <circle cx="${x}" cy="${y + 0.55}" r="2.7" fill="rgba(0,0,0,.35)"/>
      <circle cx="${x}" cy="${y}" r="2.7" fill="${fill}"/>
      <circle cx="${x}" cy="${y}" r="2.05" fill="none" stroke="rgba(0,0,0,.18)" stroke-width=".35"/>
      <text x="${x}" y="${y + 0.95}" text-anchor="middle" font-size="2.5" font-weight="700" fill="${txt}" font-family="Unbounded,Montserrat,sans-serif">${n}</text>
    </g>`;
  };
  const mags = [...ours.map((m, i) => magnet(m[0], m[1], m[2], 'a', i)), ...theirs.map((m, i) => magnet(m[0], m[1], m[2], 'b', i + 4))].join('');
  const ball = `<g class="magnet" style="--d:1.2s;--fx:0px;--fy:-6px"><circle cx="45.6" cy="35.8" r="1.1" fill="#fff" stroke="#111" stroke-width=".25"/></g>`;
  return `<figure class="board" style="margin:0">
    <svg viewBox="-1 -1 ${W + 2} ${H + 2}" role="img" aria-label="Тактика тақтасы: біздің команда үшінші адамның жүгірісімен шабуыл жасайды">
      <rect x="-1" y="-1" width="${W + 2}" height="${H + 2}" rx="3" fill="#145240"/>
      ${stripes}${lines}${arrowEls}${mags}${ball}
    </svg>
    <figcaption class="board-caption"><span>Бүгінгі сабақ: үшінші адамның жүгірісі</span><span style="color:var(--green)">Тактика</span></figcaption>
  </figure>`;
}

const POS_ZONES = { gk: [1, 20, 14, 28], def: [12, 4, 22, 60], mid: [36, 4, 30, 60], fwd: [64, 4, 30, 60] };
function posBoard(pos) {
  const W = 105, H = 68;
  const s = 'stroke="rgba(242,239,230,.45)" stroke-width=".4" fill="none"';
  const [x, y, w, h] = POS_ZONES[pos];
  return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;display:block;border-radius:18px" aria-hidden="true">
    <rect width="${W}" height="${H}" fill="#145240"/>
    <rect x="1" y="1" width="${W - 2}" height="${H - 2}" ${s}/><line x1="${W / 2}" y1="1" x2="${W / 2}" y2="${H - 1}" ${s}/>
    <circle cx="${W / 2}" cy="${H / 2}" r="9" ${s}/>
    <rect x="1" y="${(H - 40) / 2}" width="16.5" height="40" ${s}/><rect x="${W - 17.5}" y="${(H - 40) / 2}" width="16.5" height="40" ${s}/>
    <rect class="zone" x="${x}" y="${y}" width="${w}" height="${h}" rx="4" fill="rgba(255,201,60,.22)" stroke="#FFC93C" stroke-width=".6" stroke-dasharray="2 1.5"/>
  </svg>`;
}

let landingPos = 'mid';
function viewLanding() {
  const day = [
    ['tactics', 'whistle', 'Үшбұрыш: пас нұсқалары', 'Алаңдағы жағдайды оқып, шешім қабылда', 8],
    ['physical', 'bolt', 'Жарылғыш спринттер', 'Таймер мен сеттер сені бағыттайды', 15],
    ['mental', 'brain', 'Шаршы тыныс', 'Матч алдындағы толқуды бас', 4],
    ['technique', 'ball', 'Қабырғамен пас', 'Екі аяқпен дәлдік пен бірінші жанасу', 10],
  ];
  const total = day.reduce((a, d) => a + d[4], 0);
  const posLessons = (p) => LESSONS.filter((l) => l.position === p);
  const posPanel = (p) => `<div class="pos-panel" data-pos-panel>
      ${posBoard(p)}
      <h3 style="margin-top:18px">${esc(POSITIONS[p])}</h3>
      <p class="muted" style="margin:0">${posLessons(p).length} сабақ, ${posLessons(p).reduce((a, l) => a + l.questions.length, 0)} тактикалық сұрақ және арнайы жаттығулар.</p>
      <ul>${posLessons(p).map((l) => `<li>${icon('checkCircle', { size: 18 })}<span><b style="font-weight:600">${esc(l.title)}</b><br><span class="muted" style="font-size:14px">${esc(l.summary)}</span></span></li>`).join('')}</ul>
    </div>`;
  const quote = QUOTES[0];

  const html = `<div class="landing">
  <header class="l-nav"><div class="l-wrap">
    <a class="l-brand" href="#/" aria-label="Футбол Коуч, басты бет"><i>${icon('ball', { size: 20 })}</i>Футбол Коуч</a>
    <span class="grow"></span>
    <button class="link" data-scroll="l-day" style="color:var(--muted);font-weight:500;padding:10px 6px">Жоспар</button>
    <button class="link" data-scroll="l-pos" style="color:var(--muted);font-weight:500;padding:10px 6px">Позициялар</button>
    <a class="btn btn-secondary" href="#/auth">Кіру</a>
  </div></header>

  <main id="main">
    <section class="l-hero"><div class="l-wrap">
      <div>
        <h1>Күн сайын бір&nbsp;қадам алға</h1>
        <p class="lead">Тактика, физика, психология және техника. Әр күні 15–40 минуттық жеке жоспар, сенің жасыңа, позицияңа және деңгейіңе қарай.</p>
        <div class="l-cta">
          <a class="btn btn-primary" href="#/auth">Тегін бастау</a>
          <button class="btn btn-secondary" data-scroll="l-day">Жоспарды көру</button>
        </div>
        <div class="meta">
          <span><b>${state.exercises.length}</b>жаттығу</span>
          <span><b>${LESSONS.length}</b>позиция сабағы</span>
          <span><b>${STORIES.length}</b>аңыз тарихы</span>
        </div>
      </div>
      ${landingBoard()}
    </div></section>

    <section class="l-section" id="l-day"><div class="l-wrap">
      <h2>Бір күн, төрт қысқа жаттығу</h2>
      <p class="sub">Таңертең жоспар өзі құрылады. Әр жаттығуды орындаған сайын серия мен ұпай жиналады, ал прогресс графикте көрінеді.</p>
      <div class="day">
        <div class="day-list">
          ${day.map(([cat, ic, t, sub, min]) => `<div class="day-item" style="--c:${CATEGORIES[cat].color}">
            <span class="mag">${icon(ic, { size: 24 })}</span>
            <span><small style="color:${CATEGORIES[cat].color};font-weight:600">${CATEGORIES[cat].name}</small><b>${esc(t)}</b><small>${esc(sub)}</small></span>
            <span class="min">${min} мин</span>
          </div>`).join('')}
        </div>
        <div class="day-note"><b>${total} мин</b>орташа күндік жоспар. Мектептен кейін де, команда жаттығуының алдында да үлгересің.</div>
      </div>
    </div></section>

    <section class="l-section" id="l-pos"><div class="l-wrap">
      <div class="pos">
        <div>
          <h2>Өз позицияңның мектебі</h2>
          <p class="sub">Қақпашыға, қорғаушыға, жартылай қорғаушыға және шабуылшыға бөлек сабақтар: қысқа теория, алаңдағы жағдай, сұрақ және бапкердің түсіндірмесі.</p>
          <div class="pos-tabs" role="group" aria-label="Позиция таңдау">
            ${Object.entries(POSITIONS).map(([k, v]) => `<button class="filter ${k === landingPos ? 'on' : ''}" data-lpos="${k}" aria-pressed="${k === landingPos}">${v}</button>`).join('')}
          </div>
        </div>
        <div data-pos-slot>${posPanel(landingPos)}</div>
      </div>
    </div></section>

    <section class="l-section"><div class="l-wrap">
      <h2>Аңыздар да бір кезде осылай бастаған</h2>
      <p class="sub">Академиядан шығарылған, соғыстан аман қалған, кеш бастаған. Платформада ${STORIES.length} ойыншының кәсіби жолы бар.</p>
      <div class="legends">
        ${STORIES.map((p) => `<article class="legend-card" style="--c:${p.color}">
          <span class="num" aria-hidden="true">${esc(initials(p.name))}</span>
          <div><b>${esc(p.name)}</b><div class="muted" style="font-size:14px">${esc(p.country)}, ${esc(p.position.toLowerCase())}</div></div>
          <p>${esc(p.lesson)}</p>
        </article>`).join('')}
      </div>
    </div></section>

    <figure class="l-quote" style="margin:0"><div class="l-wrap">
      <blockquote>«${esc(quote.text)}»</blockquote>
      <figcaption>${esc(quote.author)}, ${esc(quote.role.toLowerCase())}</figcaption>
    </div></figure>

    <section class="l-final"><div class="l-wrap"><div class="box">
      <div>
        <h2>Бүгін бірінші жаттығуды жаса</h2>
        <p style="margin-top:12px">Тіркелу бір минут алады. Тіркелмей де бастауға болады, ол кезде прогресс осы құрылғыда сақталады.</p>
      </div>
      <a class="btn" href="#/auth">Тегін бастау</a>
    </div></div></section>
  </main>

  <footer class="l-foot"><div class="l-wrap"><span>© ${new Date().getFullYear()} Футбол Коуч</span><span>Қазақ тілінде, жас футболшыларға арналған</span></div></footer>
  </div>`;

  const mount = () => {
    app.querySelectorAll('[data-scroll]').forEach((b) => {
      b.onclick = () => document.getElementById(b.dataset.scroll)?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
    });
    app.querySelectorAll('[data-lpos]').forEach((b) => {
      b.onclick = () => {
        landingPos = b.dataset.lpos;
        app.querySelectorAll('[data-lpos]').forEach((x) => { const on = x === b; x.classList.toggle('on', on); x.setAttribute('aria-pressed', String(on)); });
        app.querySelector('[data-pos-slot]').innerHTML = posPanel(landingPos);
      };
    });
  };
  return { html, mount, wide: true };
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
  if (!state.mode) view = parseHash().parts[0] === 'auth' ? viewAuth() : viewLanding();
  else if (!state.profile || !state.profile.level) view = viewOnboarding();
  else {
    const { parts, params } = parseHash();
    const [r, id] = parts;
    if (!r || ['drills', 'progress', 'profile', 'lessons'].includes(r)) lastListPage = `#/${r || ''}`;
    if (r === 'ex' && id) view = viewExercise(id, params.get('d') || today());
    else if (r === 'lessons') view = viewLessons();
    else if (r === 'lesson' && id) view = viewLesson(id);
    else if (r === 'stories') view = viewStories();
    else if (r === 'story' && id) view = viewStory(id);
    else if (r === 'ask') view = viewAsk();
    else if (r === 'drills') view = viewDrills();
    else if (r === 'progress') view = viewProgress();
    else if (r === 'profile') view = viewProfile();
    else view = { html: viewHome() };
  }
  if (typeof view === 'string') view = { html: view };
  app.classList.toggle('wide', !!view.wide);
  app.innerHTML = view.html;
  window.scrollTo(0, 0);
  renderedDay = today();
  const main = app.querySelector('main');
  if (main) { main.id = 'main'; main.tabIndex = -1; }
  app.querySelectorAll('.filter').forEach((f) => f.setAttribute('aria-pressed', String(f.classList.contains('on'))));
  const r0 = parseHash().parts[0];
  const backTo = r0 === 'story' ? '#/stories' : lastListPage;
  app.querySelectorAll('[data-back]').forEach((b) => { b.onclick = () => { location.hash = backTo; }; });
  app.querySelectorAll('[data-bell]').forEach((b) => { b.onclick = () => toast('Жаңа хабарлама жоқ'); });
  view.mount?.();
}

window.addEventListener('hashchange', render);
document.querySelector('.skip-link')?.addEventListener('click', () => app.querySelector('main')?.focus());

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
