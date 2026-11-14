// Reine Funktionen, kein DOM / window / localStorage.
const pad = (n) => String(n).padStart(2, '0');

export function isoLocal(date) {
  const off = -date.getTimezoneOffset();
  const a = Math.abs(off);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}` +
    `${off < 0 ? '-' : '+'}${pad(Math.floor(a / 60))}:${pad(a % 60)}`;
}

export function localDay(iso) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function validateSet({ reps, weightKg }) {
  if (!Number.isInteger(reps) || reps < 1) return 'Wiederholungen müssen eine ganze Zahl ab 1 sein.';
  if (weightKg !== null && weightKg !== undefined && weightKg !== '' &&
      !(typeof weightKg === 'number' && Number.isFinite(weightKg) && weightKg >= 0)) {
    return 'Gewicht muss leer oder eine Zahl ab 0 sein.';
  }
  return null;
}

export function upsertSet(state, set) {
  const i = state.sets.findIndex((s) => s.id === set.id);
  const sets = state.sets.slice();
  if (i >= 0) sets[i] = set; else sets.push(set);
  return { ...state, sets };
}

export function removeSet(state, id) {
  return { ...state, sets: state.sets.filter((s) => s.id !== id) };
}

const t = (iso) => Date.parse(iso);

export function quickValues(state, exerciseId) {
  const ex = state.exercises.find((e) => e.id === exerciseId);
  const recent = state.sets.filter((s) => s.exerciseId === exerciseId)
    .sort((a, b) => t(b.at) - t(a.at)).map((s) => s.reps);
  const list = [...new Set(recent)].slice(0, 2);
  const start = ex?.startQuick ?? [5, 8];
  for (const v of start) if (list.length < 2 && !list.includes(v)) list.push(v);
  while (list.length < 2) list.push(list[0] + 1); // nie zwei gleiche Buttons
  return list;
}

export function sortedExercises(state) {
  const last = new Map();
  for (const s of state.sets) last.set(s.exerciseId, Math.max(last.get(s.exerciseId) ?? 0, t(s.at)));
  return state.exercises.map((e, i) => ({ e, i, u: last.get(e.id) }))
    .filter((x) => !x.e.archived)
    .sort((a, b) => (a.u === undefined) - (b.u === undefined) || (b.u ?? 0) - (a.u ?? 0) || a.i - b.i)
    .map((x) => x.e);
}

export function setsOfDay(state, day) {
  // reverse: bei gleicher Sekunde steht der zuletzt gespeicherte oben (sort ist stabil)
  return state.sets.filter((s) => localDay(s.at) === day).reverse().sort((a, b) => t(b.at) - t(a.at));
}

export function daySummary(state, day) {
  const m = new Map();
  for (const s of setsOfDay(state, day)) {
    const r = m.get(s.exerciseId) ?? { exerciseId: s.exerciseId, name: state.exercises.find((e) => e.id === s.exerciseId)?.name ?? '?', sets: 0, reps: 0 };
    r.sets++; r.reps += s.reps;
    m.set(s.exerciseId, r);
  }
  return [...m.values()];
}

export function slug(s) {
  return s.toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

// Gibt { state, exercise } zurück. n = Wiederholungen für startQuick bei Neuanlage.
export function findOrCreateExercise(state, u, n = 5) {
  const found = state.exercises.find((e) => e.id === u || slug(e.name) === slug(u));
  if (found) {
    if (!found.archived) return { state, exercise: found };
    const exercise = { ...found, archived: false };
    return { state: { ...state, exercises: state.exercises.map((e) => (e === found ? exercise : e)) }, exercise };
  }
  const name = u.replace(/-+/g, ' ').trim();
  const exercise = {
    id: crypto.randomUUID(), name: name.charAt(0).toUpperCase() + name.slice(1),
    archived: false, startQuick: [n, n + 3], createdAt: isoLocal(new Date()),
  };
  return { state: { ...state, exercises: [...state.exercises, exercise] }, exercise };
}

export function parseImport(json) {
  let d;
  try { d = typeof json === 'string' ? JSON.parse(json) : json; } catch { throw new Error('Datei ist kein gültiges JSON.'); }
  const bad = (m) => { throw new Error(`Ungültige Datei: ${m}`); };
  if (!d || typeof d !== 'object' || d.version !== 1) bad('Version 1 erwartet.');
  if (!Array.isArray(d.exercises) || !Array.isArray(d.sets)) bad('Übungen oder Sätze fehlen.');
  const ids = new Set();
  for (const e of d.exercises) {
    if (!e || typeof e.id !== 'string' || typeof e.name !== 'string' || !e.name.trim()) bad('Übung ohne Id oder Namen.');
    if (typeof e.archived !== 'boolean') bad(`Übung „${e.name}“: archived fehlt.`);
    if (!Array.isArray(e.startQuick) || e.startQuick.length !== 2 || !e.startQuick.every((v) => Number.isInteger(v) && v >= 1)) bad(`Übung „${e.name}“: startQuick ungültig.`);
    ids.add(e.id);
  }
  for (const s of d.sets) {
    if (!s || typeof s.id !== 'string' || !ids.has(s.exerciseId)) bad('Satz mit unbekannter Übung.');
    if (typeof s.at !== 'string' || Number.isNaN(Date.parse(s.at))) bad('Satz mit ungültigem Zeitpunkt.');
    const err = validateSet(s);
    if (err) bad(err);
  }
  return {
    version: 1, exercises: d.exercises, sets: d.sets,
    lastExportAt: typeof d.lastExportAt === 'string' ? d.lastExportAt : null,
  };
}

const merge = (a, b) => {
  const m = new Map(a.map((x) => [x.id, x]));
  for (const x of b) m.set(x.id, x);
  return [...m.values()];
};

export function mergeImport(state, imported) {
  return { ...state, exercises: merge(state.exercises, imported.exercises), sets: merge(state.sets, imported.sets) };
}

export function exportNeeded(state, now) {
  if (!state.sets.length) return false;
  // Ohne Export zählt der erste Satz als Startpunkt – sonst warnt die App schon beim ersten Tippen.
  const since = state.lastExportAt ? Date.parse(state.lastExportAt) : Math.min(...state.sets.map((x) => t(x.at)));
  return now - since > 14 * 864e5;
}
