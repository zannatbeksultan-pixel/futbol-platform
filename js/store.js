// Деректер қабаты: Supabase (бұлт) немесе localStorage (қонақ режимі).
import { SUPABASE_URL, SUPABASE_KEY, SUPABASE_CDN } from './config.js';
import { EXERCISES } from './data.js';

const LS = {
  get(key, fallback) {
    try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* сақтау мүмкін емес */ }
  },
  del(key) { try { localStorage.removeItem(key); } catch { /* */ } },
};

let client = null;
let clientTried = false;

async function getClient() {
  if (clientTried) return client;
  clientTried = true;
  try {
    const mod = await import(SUPABASE_CDN);
    client = mod.createClient(SUPABASE_URL, SUPABASE_KEY);
  } catch (e) {
    console.warn('Supabase жүктелмеді, қонақ режимі ғана қолжетімді', e);
    client = null;
  }
  return client;
}

export const state = {
  mode: null,      // 'guest' | 'cloud' | null
  user: null,
  profile: null,
  completions: [], // { exercise_id, day, category, note }
  exercises: EXERCISES,
  lessons: {},     // lesson_id -> { score, total }
  questions: [],   // { id, text, category, created_at, answer, answered_at, mine }
};

function loadGuestExtras() {
  state.lessons = LS.get('fp_lessons', {});
  state.questions = LS.get('fp_questions', []);
}

export async function init() {
  state.mode = LS.get('fp_mode', null);
  if (state.mode === 'cloud') {
    const sb = await getClient();
    if (sb) {
      const { data } = await sb.auth.getSession();
      if (data?.session?.user) {
        state.user = data.session.user;
        await loadCloud();
        await migrateGuest();
        return state;
      }
    }
    state.mode = null;
    LS.del('fp_mode');
  }
  if (state.mode === 'guest') {
    state.profile = LS.get('fp_profile', null);
    state.completions = LS.get('fp_completions', []);
    loadGuestExtras();
  }
  return state;
}

// Қонақ режимінде жиналған прогресті жаңа аккаунтқа көшіру
async function migrateGuest() {
  const sb = await getClient();
  const uid = state.user.id;
  const gProfile = LS.get('fp_profile', null);
  const gComps = LS.get('fp_completions', []);
  const gLessons = LS.get('fp_lessons', {});
  const gQuestions = LS.get('fp_questions', []);
  if (!gProfile && !gComps.length && !Object.keys(gLessons).length && !gQuestions.length) return;
  try {
    if (!state.profile && gProfile) {
      const { data } = await sb.from('profiles').upsert({ id: uid, ...gProfile }).select().single();
      if (data) state.profile = data;
    }
    const known = new Set(state.exercises.map((e) => e.id));
    const rows = gComps.filter((c) => known.has(c.exercise_id)).map((c) => ({ ...c, user_id: uid }));
    if (rows.length) {
      const { error } = await sb.from('completions').upsert(rows, { onConflict: 'user_id,exercise_id,day', ignoreDuplicates: true });
      if (!error) {
        const { data } = await sb.from('completions').select('exercise_id, day, category, note').eq('user_id', uid);
        if (data) state.completions = data;
      }
    }
    for (const [lesson_id, r] of Object.entries(gLessons)) {
      if (!state.lessons[lesson_id] || state.lessons[lesson_id].score < r.score) {
        await sb.from('lesson_results').upsert({ user_id: uid, lesson_id, score: r.score, total: r.total });
        state.lessons[lesson_id] = r;
      }
    }
    for (const q of gQuestions) {
      const { data } = await sb.from('questions').insert({ user_id: uid, text: q.text, category: q.category }).select().single();
      if (data) state.questions.unshift({ ...data, mine: true });
    }
    ['fp_profile', 'fp_completions', 'fp_lessons', 'fp_questions'].forEach((k) => LS.del(k));
  } catch (e) { console.warn('Қонақ деректерін көшіру сәтсіз', e); }
}

async function loadCloud() {
  const sb = await getClient();
  const uid = state.user.id;
  const [{ data: profile }, { data: comps }, { data: exs }, { data: lessons }, { data: qs }] = await Promise.all([
    sb.from('profiles').select('*').eq('id', uid).maybeSingle(),
    sb.from('completions').select('exercise_id, day, category, note').eq('user_id', uid),
    sb.from('exercises').select('*'),
    sb.from('lesson_results').select('lesson_id, score, total').eq('user_id', uid),
    sb.from('questions').select('id, user_id, text, category, created_at, answer, answered_at').order('created_at', { ascending: false }),
  ]);
  state.profile = profile || null;
  state.completions = comps || [];
  state.lessons = Object.fromEntries((lessons || []).map((l) => [l.lesson_id, { score: l.score, total: l.total }]));
  state.questions = (qs || []).map((q) => ({ ...q, mine: q.user_id === uid }));
  if (exs && exs.length) {
    state.exercises = exs.map((e) => ({ ...e, positions: e.positions || undefined }));
  }
}

let probe = null;
// Сервер шынымен қолжетімді ме? (кітапхана жүктелді және Supabase жауап береді)
export function cloudAvailable() {
  if (!probe) {
    probe = (async () => {
      if (!(await getClient())) return false;
      try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 6000);
        const r = await fetch(`${SUPABASE_URL}/auth/v1/health`, { headers: { apikey: SUPABASE_KEY }, signal: ctrl.signal });
        clearTimeout(t);
        return r.ok;
      } catch { return false; }
    })();
  }
  return probe;
}

// Тіркелу серверлік функция арқылы: аккаунт бірден расталады, растау хаты керек емес.
export async function signUp(email, password) {
  const sb = await getClient();
  if (!sb) throw new Error('Серверге қосылу мүмкін болмады.');
  let res;
  try {
    res = await fetch(`${SUPABASE_URL}/functions/v1/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: SUPABASE_KEY },
      body: JSON.stringify({ email, password }),
    });
  } catch {
    throw new Error('Серверге қосылу мүмкін болмады.');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const map = {
      already_registered: 'User already registered',
      invalid_email: 'invalid email',
      weak_password: 'weak password',
    };
    throw new Error(map[data.error] || 'signup failed');
  }
  await signIn(email, password);
  return { needsConfirm: false };
}

export async function signIn(email, password) {
  const sb = await getClient();
  if (!sb) throw new Error('Серверге қосылу мүмкін болмады.');
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw error;
  state.user = data.user;
  state.mode = 'cloud';
  LS.set('fp_mode', 'cloud');
  await loadCloud();
  await migrateGuest();
}

export function startGuest() {
  state.mode = 'guest';
  LS.set('fp_mode', 'guest');
  state.profile = LS.get('fp_profile', null);
  state.completions = LS.get('fp_completions', []);
  loadGuestExtras();
}

export async function signOut() {
  if (state.mode === 'cloud') {
    const sb = await getClient();
    if (sb) await sb.auth.signOut();
  }
  LS.del('fp_mode');
  state.mode = null;
  state.user = null;
  state.profile = null;
  state.completions = [];
  state.exercises = EXERCISES;
  state.lessons = {};
  state.questions = [];
}

export async function saveProfile(profile) {
  if (state.mode === 'cloud') {
    const sb = await getClient();
    const row = { id: state.user.id, ...profile };
    const { data, error } = await sb.from('profiles').upsert(row).select().single();
    if (error) throw error;
    state.profile = data;
  } else {
    state.profile = { ...profile };
    LS.set('fp_profile', state.profile);
  }
}

export function isDone(exerciseId, day) {
  return state.completions.some((c) => c.exercise_id === exerciseId && c.day === day);
}

export async function complete(exercise, day, note) {
  if (isDone(exercise.id, day)) return;
  const row = { exercise_id: exercise.id, day, category: exercise.category, note: note || null };
  if (state.mode === 'cloud') {
    const sb = await getClient();
    const { error } = await sb.from('completions').insert({ ...row, user_id: state.user.id });
    if (error) throw error;
  }
  state.completions = [...state.completions, row];
  if (state.mode !== 'cloud') LS.set('fp_completions', state.completions);
}

export async function uncomplete(exercise, day) {
  if (state.mode === 'cloud') {
    const sb = await getClient();
    const { error } = await sb.from('completions').delete()
      .eq('user_id', state.user.id).eq('exercise_id', exercise.id).eq('day', day);
    if (error) throw error;
  }
  state.completions = state.completions.filter((c) => !(c.exercise_id === exercise.id && c.day === day));
  if (state.mode !== 'cloud') LS.set('fp_completions', state.completions);
}

// ───────── Позиция сабақтарының нәтижесі ─────────
export async function saveLessonResult(lessonId, score, total) {
  const prev = state.lessons[lessonId];
  if (prev && prev.score >= score) return false;
  if (state.mode === 'cloud') {
    const sb = await getClient();
    const { error } = await sb.from('lesson_results').upsert({ user_id: state.user.id, lesson_id: lessonId, score, total, updated_at: new Date().toISOString() });
    if (error) throw error;
  }
  state.lessons = { ...state.lessons, [lessonId]: { score, total } };
  if (state.mode !== 'cloud') LS.set('fp_lessons', state.lessons);
  return true;
}

// ───────── Бапкерге сұрақ ─────────
export async function askQuestion(text, category) {
  const row = { text, category };
  let saved;
  if (state.mode === 'cloud') {
    const sb = await getClient();
    const { data, error } = await sb.from('questions').insert({ ...row, user_id: state.user.id }).select().single();
    if (error) throw error;
    saved = { ...data, mine: true };
  } else {
    saved = { ...row, id: `local-${Date.now()}`, created_at: new Date().toISOString(), answer: null, mine: true };
  }
  state.questions = [saved, ...state.questions];
  if (state.mode !== 'cloud') LS.set('fp_questions', state.questions);
  return saved;
}

export async function refreshQuestions() {
  if (state.mode !== 'cloud') return;
  const sb = await getClient();
  const { data } = await sb.from('questions').select('id, user_id, text, category, created_at, answer, answered_at').order('created_at', { ascending: false });
  if (data) state.questions = data.map((q) => ({ ...q, mine: q.user_id === state.user.id }));
}
