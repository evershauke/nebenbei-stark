import test from 'node:test';
import assert from 'node:assert/strict';
import * as L from '../logic.js';

const empty = () => ({ version: 1, exercises: [], sets: [], lastExportAt: null });
const ex = (id, name, extra = {}) => ({ id, name, archived: false, startQuick: [5, 8], createdAt: 'x', ...extra });
const set = (id, exerciseId, at, reps = 5) => ({ id, exerciseId, at, reps, weightKg: null });

test('isoLocal: Format und Rundreise', () => {
  const d = new Date(2026, 10, 14, 10, 3, 7);
  const s = L.isoLocal(d);
  assert.match(s, /^2026-11-14T10:03:07[+-]\d\d:\d\d$/);
  assert.equal(Date.parse(s), d.getTime());
});

test('localDay: Tagesgrenze ist lokale Mitternacht', () => {
  assert.equal(L.localDay(L.isoLocal(new Date(2026, 10, 14, 23, 59, 59))), '2026-11-14');
  assert.equal(L.localDay(L.isoLocal(new Date(2026, 10, 15, 0, 0, 0))), '2026-11-15');
});

test('validateSet', () => {
  assert.equal(L.validateSet({ reps: 5, weightKg: null }), null);
  assert.equal(L.validateSet({ reps: 5, weightKg: 0 }), null);
  assert.equal(L.validateSet({ reps: 5, weightKg: '' }), null);
  assert.ok(L.validateSet({ reps: 0, weightKg: null }));
  assert.ok(L.validateSet({ reps: 2.5, weightKg: null }));
  assert.ok(L.validateSet({ reps: 5, weightKg: -1 }));
  assert.ok(L.validateSet({ reps: 5, weightKg: 'abc' }));
});

test('upsertSet ist idempotent, removeSet entfernt', () => {
  const a = set('1', 'e', '2026-11-14T10:00:00+01:00');
  const s1 = L.upsertSet(empty(), a);
  const s2 = L.upsertSet(s1, a);
  assert.deepEqual(s1, s2);
  assert.equal(L.upsertSet(s1, { ...a, reps: 9 }).sets[0].reps, 9);
  assert.equal(L.removeSet(s2, '1').sets.length, 0);
});

test('quickValues: verschiedene Werte, zuletzt zuerst, Auffüllen', () => {
  let s = { ...empty(), exercises: [ex('e', 'A')] };
  assert.deepEqual(L.quickValues(s, 'e'), [5, 8]);
  s = L.upsertSet(s, set('1', 'e', '2026-11-14T10:00:00+01:00', 12));
  assert.deepEqual(L.quickValues(s, 'e'), [12, 5]);
  s = L.upsertSet(s, set('2', 'e', '2026-11-14T11:00:00+01:00', 12));
  s = L.upsertSet(s, set('3', 'e', '2026-11-14T09:00:00+01:00', 7));
  assert.deepEqual(L.quickValues(s, 'e'), [12, 7]);
});

test('sortedExercises: letzte Nutzung, ungenutzte danach, ohne archivierte', () => {
  const s = {
    ...empty(),
    exercises: [ex('a', 'A'), ex('b', 'B'), ex('c', 'C'), ex('d', 'D', { archived: true })],
    sets: [set('1', 'b', '2026-11-14T10:00:00+01:00'), set('2', 'c', '2026-11-14T12:00:00+01:00')],
  };
  assert.deepEqual(L.sortedExercises(s).map((e) => e.id), ['c', 'b', 'a']);
});

test('findOrCreateExercise: Slug mit Umlauten, Neuanlage, Reaktivierung', () => {
  assert.equal(L.slug('Klimmzüge'), 'klimmzuege');
  const s = { ...empty(), exercises: [ex('x', 'Klimmzüge', { archived: true })] };
  const r = L.findOrCreateExercise(s, 'klimmzuege', 5);
  assert.equal(r.exercise.id, 'x');
  assert.equal(r.state.exercises[0].archived, false);
  assert.equal(L.findOrCreateExercise(s, 'x').exercise.id, 'x');
  const n = L.findOrCreateExercise(empty(), 'liegestuetz-variante', 7);
  assert.equal(n.exercise.name, 'Liegestütz variante');
  const nm = (u) => L.findOrCreateExercise(empty(), u).exercise.name;
  assert.equal(nm('klimmzuege'), 'Klimmzüge');
  assert.equal(nm('Klimmzüge'), 'Klimmzüge');
  assert.equal(nm('ueberzug-neue-bauer'), 'Überzug neue bauer');
  assert.equal(nm('squeeze-kraeftig-hoehe'), 'Squeeze kräftig höhe');
  assert.deepEqual(n.exercise.startQuick, [7, 10]);
  assert.equal(n.state.exercises.length, 1);
});

test('daySummary und setsOfDay', () => {
  const s = {
    ...empty(), exercises: [ex('e', 'A')],
    sets: [set('1', 'e', '2026-11-14T10:00:00+01:00', 5), set('2', 'e', '2026-11-14T11:00:00+01:00', 8)],
  };
  const day = L.localDay(s.sets[0].at);
  assert.deepEqual(L.setsOfDay(s, day).map((x) => x.id), ['2', '1']);
  assert.deepEqual(L.daySummary(s, day), [{ exerciseId: 'e', name: 'A', sets: 2, reps: 13 }]);
});

test('parseImport: gültig und ungültig', () => {
  const ok = { version: 1, unit: 'kg', exercises: [ex('e', 'A')], sets: [set('1', 'e', '2026-11-14T10:00:00+01:00')], lastExportAt: null };
  const p = L.parseImport(JSON.stringify(ok));
  assert.equal(p.sets.length, 1);
  assert.equal('unit' in p, false);
  assert.throws(() => L.parseImport('kein json'), /JSON/);
  assert.throws(() => L.parseImport({ ...ok, version: 2 }), /Version/);
  assert.throws(() => L.parseImport({ ...ok, sets: [set('1', 'zzz', '2026-11-14T10:00:00+01:00')] }), /unbekannter Übung/);
  assert.throws(() => L.parseImport({ ...ok, sets: [set('1', 'e', '2026-11-14T10:00:00+01:00', 0)] }), /Wiederholungen/);
  assert.throws(() => L.parseImport({ ...ok, exercises: [{ id: 'e', name: 'A' }] }), /archived/);
});

test('mergeImport: Upsert nach id, nichts geht verloren', () => {
  const a = { ...empty(), exercises: [ex('e', 'A')], sets: [set('1', 'e', '2026-11-14T10:00:00+01:00', 5)] };
  const b = { ...empty(), exercises: [ex('e', 'A neu'), ex('f', 'F')], sets: [set('1', 'e', '2026-11-14T10:00:00+01:00', 9), set('2', 'f', '2026-11-14T11:00:00+01:00')] };
  const m = L.mergeImport(a, b);
  assert.equal(m.exercises.length, 2);
  assert.equal(m.exercises[0].name, 'A neu');
  assert.equal(m.sets.length, 2);
  assert.equal(m.sets.find((s) => s.id === '1').reps, 9);
});

test('exportNeeded', () => {
  const now = Date.parse('2026-11-14T12:00:00Z');
  const withSet = { ...empty(), sets: [set('1', 'e', '2026-11-14T10:00:00+01:00')] };
  assert.equal(L.exportNeeded(empty(), now), false);
  assert.equal(L.exportNeeded(withSet, now), false); // erster Satz heute: noch kein Hinweis
  assert.equal(L.exportNeeded({ ...empty(), sets: [set('1', 'e', '2026-10-01T10:00:00+02:00')] }, now), true);
  assert.deepEqual(L.quickValues({ ...empty(), exercises: [ex('e', 'A', { startQuick: [5, 5] })] }, 'e'), [5, 6]);
  assert.equal(L.exportNeeded({ ...withSet, lastExportAt: '2026-11-10T12:00:00Z' }, now), false);
  assert.equal(L.exportNeeded({ ...withSet, lastExportAt: '2026-10-20T12:00:00Z' }, now), true);
});

test('lastDays: 7 Tage rückwärts, Monatswechsel, leere Tage', async () => {
  const { lastDays } = await import('../logic.js');
  const st = {
    exercises: [{ id: 'a', name: 'Klimmzug' }, { id: 'b', name: 'Liegestütz' }],
    sets: [
      { id: '1', exerciseId: 'a', at: '2026-11-02T10:00:00+01:00', reps: 5 },
      { id: '2', exerciseId: 'b', at: '2026-11-02T11:00:00+01:00', reps: 10 },
      { id: '3', exerciseId: 'a', at: '2026-10-28T09:00:00+01:00', reps: 3 },
      { id: '4', exerciseId: 'a', at: '2026-10-26T09:00:00+01:00', reps: 99 },
    ],
  };
  const r = lastDays(st, '2026-11-02');
  assert.equal(r.length, 7);
  assert.deepEqual(r.map((x) => x.day), ['2026-11-02', '2026-11-01', '2026-10-31', '2026-10-30', '2026-10-29', '2026-10-28', '2026-10-27']);
  assert.equal(r[0].reps, 15);
  assert.equal(r[0].items.length, 2);
  assert.equal(r[1].reps, 0);
  assert.equal(r[5].reps, 3);
});

test('weekStart/addDays: Montag, Monats- und Sommerzeitwechsel', () => {
  assert.equal(L.weekStart('2026-11-14'), '2026-11-09'); // Samstag
  assert.equal(L.weekStart('2026-11-09'), '2026-11-09'); // Montag
  assert.equal(L.weekStart('2026-11-15'), '2026-11-09'); // Sonntag
  assert.equal(L.addDays('2026-03-28', 2), '2026-03-30');
  assert.equal(L.addDays('2026-03-01', -1), '2026-02-28');
});

const at = (day, reps, ex = 'a') => ({ id: `${day}-${reps}-${ex}`, exerciseId: ex, at: `${day}T10:00:00+01:00`, reps });

test('periodTotals: Wochen und Monate, neueste zuerst', () => {
  const st = { exercises: [{ id: 'a' }], sets: [at('2026-11-14', 5), at('2026-11-09', 3), at('2026-11-08', 7), at('2026-10-31', 2), at('2026-11-14', 9, 'b')] };
  const w = L.periodTotals(st, 'a', 'week', '2026-11-14', 3);
  assert.deepEqual(w, [
    { from: '2026-11-09', to: '2026-11-15', reps: 8 },
    { from: '2026-11-02', to: '2026-11-08', reps: 7 },
    { from: '2026-10-26', to: '2026-11-01', reps: 2 },
  ]);
  const m = L.periodTotals(st, 'a', 'month', '2026-11-14', 2);
  assert.deepEqual(m, [{ from: '2026-11-01', to: '2026-11-30', reps: 15 }, { from: '2026-10-01', to: '2026-10-31', reps: 2 }]);
});

test('goals: automatisch +5 % aufgerundet, manuell überschreibt, ohne Daten null', () => {
  // Trainingstage der 14 Tage vor heute: 10, 20, 30 (Schnitt 20 -> 21); Wochen davor: 30 (Schnitt 30 -> 32)
  const st = { exercises: [{ id: 'a' }], sets: [at('2026-11-13', 10), at('2026-11-12', 20), at('2026-11-05', 30), at('2026-11-14', 4)] };
  const g = L.goals(st, { id: 'a' }, '2026-11-14');
  assert.deepEqual(g.day, { goal: 21, auto: 21, reps: 4 });
  assert.deepEqual(g.week, { goal: 32, auto: 32, reps: 34 });
  const o = L.goals(st, { id: 'a', dayGoal: 50, weekGoal: null }, '2026-11-14');
  assert.equal(o.day.goal, 50);
  assert.equal(o.week.goal, 32);
  assert.deepEqual(L.autoGoals({ exercises: [], sets: [] }, 'a', '2026-11-14'), { day: null, week: null });
});

test('streak: Wochen in Folge mit Wochenziel, laufende Woche zählt erst wenn geschafft', () => {
  const ex = { id: 'a', weekGoal: 10 };
  const sets = [at('2026-11-10', 5), at('2026-11-03', 12), at('2026-10-27', 10), at('2026-10-20', 3)];
  assert.equal(L.streak({ exercises: [ex], sets }, ex, '2026-11-14'), 2);
  assert.equal(L.streak({ exercises: [ex], sets: [...sets, at('2026-11-11', 6)] }, ex, '2026-11-14'), 3);
  assert.deepEqual(L.weekGoalHits({ exercises: [ex], sets }, ex, '2026-11-14', 2).map((w) => w.hit), [false, true]);
  assert.equal(L.streak({ exercises: [{ id: 'a' }], sets: [] }, { id: 'a' }, '2026-11-14'), 0);
});
