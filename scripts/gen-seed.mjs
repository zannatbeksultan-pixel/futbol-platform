import { EXERCISES } from '../js/data.js';
const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
const rows = EXERCISES.map(e => `(${q(e.id)}, ${q(e.category)}, ${q(e.title)}, ${q(e.summary)}, ${q(JSON.stringify(e.steps))}::jsonb, ${e.duration_min}, '{${e.levels.join(',')}}'::public.level[], ${e.positions ? `'{${e.positions.join(',')}}'::text[]` : 'null'}, ${q(JSON.stringify(e.payload))}::jsonb)`);
console.log(`insert into public.exercises (id, category, title, summary, steps, duration_min, levels, positions, payload) values
${rows.join(',\n')}
on conflict (id) do update set category=excluded.category, title=excluded.title, summary=excluded.summary, steps=excluded.steps, duration_min=excluded.duration_min, levels=excluded.levels, positions=excluded.positions, payload=excluded.payload;`);
