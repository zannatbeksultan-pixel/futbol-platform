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
};

export async function init() {
  state.mode = LS.get('fp_mode', null);
  if (state.mode === 'cloud') {
    const sb = await getClient();
    if (sb) {
      const { data } = await sb.auth.getSession();
      if (data?.session?.user) {
        state.user = data.session.user;
        await loadCloud();
        return state;
      }
    }
    state.mode = null;
    LS.del('fp_mode');
  }
  if (state.mode === 'guest') {
    state.profile = LS.get('fp_profile', null);
    state.completions = LS.get('fp_completions', []);
  }
  return state;
}

async function loadCloud() {
  const sb = await getClient();
  const uid = state.user.id;
  const [{ data: profile }, { data: comps }, { data: exs }] = await Promise.all([
    sb.from('profiles').select('*').eq('id', uid).maybeSingle(),
    sb.from('completions').select('exercise_id, day, category, note').eq('user_id', uid),
    sb.from('exercises').select('*'),
  ]);
  state.profile = profile || null;
  state.completions = comps || [];
  if (exs && exs.length) {
    state.exercises = exs.map((e) => ({ ...e, positions: e.positions || undefined }));
  }
}

export async function cloudAvailable() {
  return !!(await getClient());
}

export async function signUp(email, password) {
  const sb = await getClient();
  if (!sb) throw new Error('Серверге қосылу мүмкін болмады.');
  const redirect = location.origin + location.pathname;
  const { data, error } = await sb.auth.signUp({ email, password, options: { emailRedirectTo: redirect } });
  if (error) throw error;
  if (!data.session) return { needsConfirm: true };
  state.user = data.user;
  state.mode = 'cloud';
  LS.set('fp_mode', 'cloud');
  await loadCloud();
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
}

export function startGuest() {
  state.mode = 'guest';
  LS.set('fp_mode', 'guest');
  state.profile = LS.get('fp_profile', null);
  state.completions = LS.get('fp_completions', []);
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
