import './version.js';
import {
  isoLocal, localDay, validateSet, upsertSet, removeSet, quickValues, sortedExercises,
  setsOfDay, findOrCreateExercise, parseImport, mergeImport, exportNeeded, lastDays, goals, periodTotals, streak, weekGoalHits,
} from './logic.js';

const KEY = 'nebenbei-stark/v1';
const $ = (id) => document.getElementById(id);
const h = (tag, attrs = {}, ...kids) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) (k in e ? (e[k] = v) : e.setAttribute(k, v));
  e.append(...kids);
  return e;
};

const empty = () => ({ version: 1, exercises: [], sets: [], lastExportAt: null });
let state;
try {
  const raw = localStorage.getItem(KEY);
  state = raw ? JSON.parse(raw) : empty();
  if (!raw) navigator.storage?.persist?.();
} catch {
  // Beschädigte Daten nicht überschreiben: Rohtext sichern, damit nichts verloren geht.
  try { localStorage.setItem(`${KEY}/defekt-${Date.now()}`, localStorage.getItem(KEY)); } catch {}
  state = empty();
  queueMicrotask(() => showError('Gespeicherte Daten waren beschädigt und wurden gesichert (localStorage „…/defekt-…“). Die App startet leer.'));
}

function showError(msg) { $('error').textContent = msg; $('error').hidden = !msg; }
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); showError(''); }
  catch { showError('Speichern fehlgeschlagen – Daten sind nur bis zum Schließen der App vorhanden. Bitte exportieren.'); }
}
function commit(next) { state = next; save(); render(); }

const nameOf = (id) => state.exercises.find((e) => e.id === id)?.name ?? '?';
const today = () => localDay(isoLocal(new Date()));
let openDay = null; // in „Letzte 7 Tage“ aufgeklappter Tag, bleibt beim Neuzeichnen offen
const dayLabel = (d) => new Date(`${d}T12:00`).toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'numeric' });
// „vor 5 Min.“, „vor 2 Std.“ am selben Tag, sonst nach Kalendertagen („gestern“, „vor 3 Tagen“).
const rtf = new Intl.RelativeTimeFormat('de-DE', { numeric: 'auto', style: 'short' });
function ago(at) {
  const min = Math.floor((Date.now() - Date.parse(at)) / 6e4), d = localDay(at), t = today();
  if (d === t) return min < 1 ? 'gerade eben' : min < 60 ? rtf.format(-min, 'minute') : rtf.format(-Math.floor(min / 60), 'hour');
  return rtf.format(-Math.round((Date.parse(`${t}T12:00`) - Date.parse(`${d}T12:00`)) / 864e5), 'day');
}
const kg = (w) => (w || w === 0 ? ` · ${w} kg` : '');

// ---- Toast ----
const toastEl = $('toast');
const hasPopover = Object.hasOwn(HTMLElement.prototype, 'popover');
if (!hasPopover) { toastEl.removeAttribute('popover'); toastEl.hidden = true; }
let timer, undoFn;
const hideToast = () => { clearTimeout(timer); hasPopover ? toastEl.hidePopover() : (toastEl.hidden = true); };
const startTimer = () => { clearTimeout(timer); timer = setTimeout(hideToast, 5000); };
function toast(msg, undo) {
  undoFn = undo;
  $('toastMsg').textContent = msg;
  $('undo').hidden = !undo;
  if (hasPopover) { if (!toastEl.matches(':popover-open')) toastEl.showPopover(); } else toastEl.hidden = false;
  if (document.ariaNotify) document.ariaNotify(msg);
  else { $('live').textContent = ''; setTimeout(() => ($('live').textContent = msg), 50); }
  startTimer();
}
toastEl.addEventListener('focusin', () => clearTimeout(timer));
toastEl.addEventListener('focusout', startTimer);
$('undo').onclick = () => { undoFn?.(); hideToast(); };

// ---- Dialoge ----
function openDialog(dlg, onDone) {
  dlg.onclose = () => { const v = dlg.returnValue; dlg.returnValue = ''; onDone?.(v); };
  dlg.showModal();
}
// Fallback für closedby="any": Klick (down + up) auf den Backdrop schließt.
const outside = (dlg, e) => { const r = dlg.getBoundingClientRect(); return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom; };
if (!('closedBy' in HTMLDialogElement.prototype)) {
  for (const dlg of document.querySelectorAll('dialog')) {
    let down = false;
    dlg.addEventListener('pointerdown', (e) => { down = e.target === dlg && outside(dlg, e); });
    dlg.addEventListener('pointerup', (e) => { if (down && e.target === dlg && outside(dlg, e)) dlg.close(); down = false; });
  }
}

function setDialog(title, set, onSave, deletable) {
  const dlg = $('dlgSet'), f = dlg.querySelector('form');
  $('setTitle').textContent = title;
  $('setDel').hidden = !deletable;
  f.reps.value = set.reps ?? ''; f.w.value = set.weightKg ?? '';
  openDialog(dlg, (v) => {
    if (v === 'del') return onSave(null);
    if (v !== 'ok') return;
    const reps = Number(f.reps.value), weightKg = f.w.value === '' ? null : Number(f.w.value);
    const err = validateSet({ reps, weightKg });
    err ? toast(err) : onSave({ reps, weightKg });
  });
}

// Ideen beim Anlegen: Name + zwei Startwerte. Halte-Übungen zählen Sekunden statt Wiederholungen.
const IDEAS = {
  Ziehen: [['Klimmzüge', 3, 5], ['Rudern', 8, 12], ['Australian Pull-ups', 8, 12], ['Hängen (Sek.)', 20, 30]],
  Drücken: [['Liegestütze', 10, 15], ['Dips', 5, 8], ['Pike-Liegestütze', 5, 8], ['Überkopfdrücken', 8, 10]],
  Beine: [['Kniebeugen', 10, 15], ['Ausfallschritte', 10, 16], ['Bulgarian Split Squats', 8, 10], ['Wadenheben', 15, 20]],
  Hüfte: [['Kettlebell-Swings', 10, 15], ['Glute Bridge', 10, 15], ['Hip Thrusts', 10, 12]],
  Rumpf: [['Plank (Sek.)', 30, 60], ['Hollow Hold (Sek.)', 20, 30], ['Beinheben', 8, 10], ['Sit-ups', 10, 15]],
};
function renderIdeas(f) {
  // Schon vorhanden, auch in anderer Form („Klimmzug“ deckt „Klimmzüge“ ab, Umlaute ohne Punkte verglichen).
  const norm = (n) => n.toLowerCase().normalize('NFD').replace(/[^a-z0-9]/g, '');
  const have = state.exercises.map((e) => norm(e.name)), known = (n) => have.some((x) => x.startsWith(norm(n)) || norm(n).startsWith(x));
  $('exIdeas').replaceChildren(h('p', { className: 'hint' }, 'Ideen – antippen übernimmt Name und Startwerte:'),
    ...Object.entries(IDEAS).map(([group, list]) => h('div', { role: 'group', ariaLabel: group },
      h('span', { className: 'hint' }, group),
      ...list.filter(([name]) => !known(name)).map(([name, a, b]) => h('button', { type: 'button', onclick: () => {
        f.name.value = name; f.q1.value = a; f.q2.value = b;
      } }, name)))));
}

function exDialog(ex) {
  const dlg = $('dlgEx'), f = dlg.querySelector('form');
  $('exTitle').textContent = ex ? 'Übung bearbeiten' : 'Übung anlegen';
  $('exQuick').hidden = $('exIdeas').hidden = !!ex;
  if (!ex) renderIdeas(f);
  $('exGoals').hidden = !ex;
  f.q1.disabled = f.q2.disabled = !!ex;
  f.dayGoal.disabled = f.weekGoal.disabled = !ex;
  f.name.value = ex?.name ?? '';
  if (ex) {
    const g = goals(state, ex, today());
    f.dayGoal.value = ex.dayGoal ?? ''; f.dayGoal.placeholder = g.day.auto ? `automatisch: ${g.day.auto}` : 'automatisch';
    f.weekGoal.value = ex.weekGoal ?? ''; f.weekGoal.placeholder = g.week.auto ? `automatisch: ${g.week.auto}` : 'automatisch';
  }
  openDialog(dlg, (v) => {
    const name = f.name.value.trim();
    if (v !== 'ok' || !name) return;
    if (ex) {
      const dayGoal = f.dayGoal.value === '' ? null : Number(f.dayGoal.value), weekGoal = f.weekGoal.value === '' ? null : Number(f.weekGoal.value);
      if (![dayGoal, weekGoal].every((n) => n === null || (Number.isInteger(n) && n >= 1))) return toast('Ziele müssen leer oder ganze Zahlen ab 1 sein.');
      return commit({ ...state, exercises: state.exercises.map((e) => (e.id === ex.id ? { ...e, name, dayGoal, weekGoal } : e)) });
    }
    const q = [Number(f.q1.value), Number(f.q2.value)];
    if (!q.every((n) => Number.isInteger(n) && n >= 1)) return toast('Startwerte müssen ganze Zahlen ab 1 sein.');
    commit({ ...state, exercises: [...state.exercises, { id: crypto.randomUUID(), name, archived: false, startQuick: q, createdAt: isoLocal(new Date()) }] });
  });
}

// ---- Sätze ----
function add(exerciseId, reps, weightKg = null, from = null) {
  const ex = state.exercises.find((e) => e.id === exerciseId);
  const rect = from?.getBoundingClientRect(), before = goals(state, ex, today());
  const set = { id: crypto.randomUUID(), exerciseId, at: isoLocal(new Date()), reps, weightKg };
  commit(upsertSet(state, set));
  const after = goals(state, ex, today());
  const reached = (k) => after[k].goal && before[k].reps < after[k].goal && after[k].reps >= after[k].goal;
  const card = document.querySelector(`[data-ex="${CSS.escape(exerciseId)}"]`);
  const undo = () => commit(removeSet(state, set.id));
  if (reached('week') || reached('day')) {
    navigator.vibrate?.([30, 60, 30, 60, 120]);
    confetti(rect ?? card?.getBoundingClientRect());
    const n = streak(state, ex, today());
    return toast(reached('week') ? `Wochenziel geschafft! 🔥 ${n} ${n === 1 ? 'Woche' : 'Wochen'} in Folge` : `${ex.name}: Tagesziel geschafft! 🎉`, undo);
  }
  navigator.vibrate?.(15);
  if (rect) burst(`+${reps}`, rect);
  if (!calm()) card?.animate([{ scale: 1 }, { scale: 1.025 }, { scale: 1 }], { duration: 300, easing: 'ease-out' });
  toast(`${nameOf(exerciseId)} +${reps} gespeichert`, undo);
}

// ---- Belohnung: schwebende Zahl, Konfetti (nur ohne „Bewegung reduzieren“) ----
const calm = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const fx = (cls, text, x, y) => document.body.appendChild(h('span', { className: cls, ariaHidden: 'true', style: `left:${x}px;top:${y}px` }, text));
function burst(text, r) {
  if (calm()) return;
  const el = fx('float', text, r.left + r.width / 2, r.top);
  el.animate([{ translate: '-50% 0', scale: 0.8 }, { translate: '-50% -3rem', scale: 1.5, opacity: 1, offset: 0.6 }, { translate: '-50% -4.5rem', scale: 1.6, opacity: 0 }], { duration: 750, easing: 'cubic-bezier(.2,.8,.3,1)' })
    .finished.then(() => el.remove());
}
function confetti(r) {
  if (calm() || !r) return;
  const colors = ['var(--accent)', '#f5c542', '#ff8a65', '#64b5f6', '#ba68c8'];
  for (let i = 0; i < 40; i++) {
    const el = fx('confetti', '', r.left + r.width / 2, r.top + r.height / 2), a = Math.random() * 2 * Math.PI, d = 60 + Math.random() * 120;
    el.style.background = colors[i % colors.length];
    el.animate([{ translate: '0 0', rotate: '0turn', opacity: 1 },
      { translate: `${Math.cos(a) * d}px ${Math.sin(a) * d - 40}px`, rotate: `${Math.random() * 2}turn`, opacity: 1, offset: 0.5 },
      { translate: `${Math.cos(a) * d * 1.3}px ${Math.sin(a) * d + 160}px`, rotate: `${Math.random() * 4}turn`, opacity: 0 }],
    { duration: 1200 + Math.random() * 600, easing: 'ease-out' }).finished.then(() => el.remove());
  }
}

function editSet(set) {
  setDialog('Satz bearbeiten', set, (r) => {
    if (!r) {
      commit(removeSet(state, set.id));
      return toast('Satz gelöscht', () => commit(upsertSet(state, set)));
    }
    commit(upsertSet(state, { ...set, ...r }));
    toast('Satz gespeichert');
  }, true);
}

// ---- Render ----
function render() {
  $('date').textContent = new Date().toLocaleDateString('de-DE', { dateStyle: 'full' });
  $('exportBanner').hidden = !exportNeeded(state, Date.now());
  const day = today();
  const exs = sortedExercises(state, day);
  const cards = exs.map((ex) => {
    const g = goals(state, ex, day);
    // Ohne Ziel (noch keine Daten) nur die Zahl, sonst „11/9 ✓“ mit Balken.
    const n = streak(state, ex, day);
    const last = state.sets.reduce((a, s) => (s.exerciseId === ex.id && (!a || Date.parse(s.at) > Date.parse(a)) ? s.at : a), null);
    const txt = (label, x) => `${label} ${x.reps}${x.goal ? `/${x.goal}${x.reps >= x.goal ? ' ✓' : ''}` : ''}`;
    const meter = (aria, x) => (x.goal ? h('progress', { max: x.goal, value: Math.min(x.reps, x.goal), ariaLabel: `${aria} ${ex.name}` }) : h('span'));
    return h('div', { className: 'card', 'data-ex': ex.id },
      h('div', { className: 'top' },
        h('h3', {}, h('button', { type: 'button', className: 'name', title: 'Umbenennen', onclick: () => exDialog(ex) }, ex.name),
          last ? h('span', { className: 'ago' }, `zuletzt ${ago(last)}`) : ''),
        h('button', { type: 'button', className: 'goals', title: 'Name und Ziele ändern', onclick: () => exDialog(ex) },
          `${txt('Heute', g.day)} · ${txt('Woche', g.week)}${n ? ` 🔥${n}` : ''}`)),
      g.day.goal || g.week.goal ? h('div', { className: 'meters' }, meter('Tagesziel', g.day), meter('Wochenziel', g.week)) : '',
      h('div', { className: 'quick' },
        ...quickValues(state, ex.id).map((q) => h('button', { type: 'button', onclick: (e) => add(ex.id, q, null, e.currentTarget) }, `+${q}`)),
        h('button', { type: 'button', className: 'more', 'aria-label': `Freie Eingabe für ${ex.name}`, onclick: () => setDialog(ex.name, {}, (r) => r && add(ex.id, r.reps, r.weightKg)) }, '…')));
  });
  cards.push(exs.length
    ? h('button', { type: 'button', className: 'primary', onclick: () => exDialog() }, '+ Übung')
    : h('div', {}, h('p', { className: 'hint' }, 'Noch keine Übung. Lege deine erste an und tippe danach nebenbei auf +5.'),
      h('button', { type: 'button', className: 'primary', onclick: () => exDialog() }, 'Erste Übung anlegen')));
  $('cards').replaceChildren(...cards);
  $('today').replaceChildren(...setItems(day));
  const week = lastDays(state, day), wmax = Math.max(1, ...week.map((d) => d.reps));
  $('week').replaceChildren(...week.map((d) => h('li', {},
    h('details', { name: 'tag', open: d.day === openDay, ontoggle: (e) => { if (e.target.open) openDay = d.day; else if (openDay === d.day) openDay = null; } },
      h('summary', {}, ...barKids({ label: d.day === day ? 'Heute' : dayLabel(d.day), reps: d.reps, split: d.items.map((s) => `${s.name} ${s.reps}`).join(' · ') }, wmax)),
      h('ul', { className: 'sets' }, ...setItems(d.day))))));

  const hx = $('histEx'), sel = hx.value, unit = $('histUnit').value;
  hx.replaceChildren(...exs.map((ex) => h('option', { value: ex.id }, ex.name)));
  if (exs.some((ex) => ex.id === sel)) hx.value = sel;
  hx.closest('section').hidden = !exs.length;
  const hex = exs.find((ex) => ex.id === hx.value);
  const hist = exs.length ? (unit === 'week' ? weekGoalHits(state, hex, day) : periodTotals(state, hx.value, unit, day)).map((r, i) => ({
    label: unit === 'month'
      ? new Date(`${r.from}T12:00`).toLocaleDateString('de-DE', { month: 'short', year: '2-digit' })
      : i === 0 ? 'Diese Woche' : `ab ${new Date(`${r.from}T12:00`).toLocaleDateString('de-DE', { day: 'numeric', month: 'numeric' })}`,
    reps: r.reps, hit: r.hit })) : [];
  const hmax = Math.max(1, ...hist.map((r) => r.reps));
  $('hist').replaceChildren(...hist.map((r) => h('li', {}, h('div', {}, ...barKids(r, hmax)))));
}

const setItems = (day) => setsOfDay(state, day).map((s) => h('li', {},
  h('button', { type: 'button', onclick: () => editSet(s) },
    `${new Date(s.at).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} · ${nameOf(s.exerciseId)} · ${s.reps} Wdh.${kg(s.weightKg)}`)));

// Balkenzeile: Beschriftung, Balken relativ zum größten Wert, Zahl, optional Aufteilung darunter.
function barKids(r, max) {
  return [
    h('span', {}, r.label),
    h('span', { className: 'bar', style: `--w:${(r.reps / max) * 100}%`, ariaHidden: 'true' }),
    h('span', { className: 'num' }, r.reps ? `${r.reps} Wdh.${r.hit ? ' ✓' : ''}` : '–'),
    r.split ? h('span', { className: 'split' }, r.split) : ''];
}

// ---- Daten & Übungen ----
function renderData() {
  $('exList').replaceChildren(...state.exercises.map((ex) => {
    const url = `${location.origin}${location.pathname}?u=${encodeURIComponent(ex.name)}&n=${ex.startQuick[0]}`;
    return h('li', {},
      h('strong', {}, ex.name + (ex.archived ? ' (archiviert)' : '')),
      h('input', { readOnly: true, value: url, 'aria-label': `Direkt-Link ${ex.name}`, onfocus: (e) => e.target.select() }),
      h('button', { type: 'button', onclick: () => { $('dlgData').close(); exDialog(ex); } }, 'Bearbeiten'),
      h('button', { type: 'button', onclick: () => { commit({ ...state, exercises: state.exercises.map((e) => (e.id === ex.id ? { ...e, archived: !e.archived } : e)) }); renderData(); } }, ex.archived ? 'Wiederherstellen' : 'Archivieren'));
  }));
}

$('menu').onclick = () => { $('dataError').hidden = true; renderData(); openDialog($('dlgData')); };

async function doExport() {
  const day = today();
  const file = new File([JSON.stringify({ ...state, unit: 'kg' }, null, 1)], `nebenbei-stark-${day}.json`, { type: 'application/json' });
  try {
    if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file] });
    else {
      const a = h('a', { href: URL.createObjectURL(file), download: file.name });
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    }
  } catch (e) {
    if (e.name === 'AbortError') return false;
    showError('Export fehlgeschlagen.');
    return false;
  }
  commit({ ...state, lastExportAt: isoLocal(new Date()) });
  return true;
}
$('exportNow').onclick = async () => { if (await doExport()) toast('Export erstellt'); };
$('export').onclick = async () => { if (await doExport()) { $('dlgData').close(); toast('Export erstellt'); } };

$('import').onchange = async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    const imp = parseImport(await file.text());
    commit(mergeImport(state, imp));
    $('dlgData').close();
    toast(`${imp.sets.length} Sätze importiert`);
  } catch (err) {
    $('dataError').textContent = err.message;
    $('dataError').hidden = false;
  }
};

// ---- Direkt-Eintrag ----
function directEntry() {
  const q = new URLSearchParams(location.search);
  if (!q.has('u') && !q.has('n')) return;
  const u = q.get('u')?.trim(), n = q.get('n') ?? '';
  history.replaceState(null, '', location.pathname);
  if (!u || !/^\d+$/.test(n) || Number(n) < 1) return toast('Direkt-Link ungültig: u und n (ganze Zahl ab 1) nötig.');
  const r = findOrCreateExercise(state, u, Number(n));
  state = r.state;
  add(r.exercise.id, Number(n));
}

// Ansichten über den URL-Hash: Zurück-Geste auf Android führt von „Statistik“ zu „Heute“.
function showView() {
  const stats = location.hash === '#statistik';
  $('viewToday').hidden = stats; $('viewStats').hidden = !stats;
  $('navToday').ariaCurrent = stats ? null : 'page'; $('navStats').ariaCurrent = stats ? 'page' : null;
  scrollTo(0, 0);
}
addEventListener('hashchange', showView);
$('histEx').onchange = $('histUnit').onchange = () => render();

// ---- Update-Hinweis: version.js frisch vom Server mit der geladenen Version vergleichen ----
const loaded = self.APP_VERSION;
async function checkUpdate() {
  try {
    const v = Number((await (await fetch('version.js', { cache: 'no-store' })).text()).match(/APP_VERSION\s*=\s*(\d+)/)?.[1]);
    $('updateBanner').hidden = !(v > loaded);
  } catch {} // offline: kein Hinweis
}
// Beim Zurückkehren neu zeichnen (die App bleibt im Hintergrund offen, über Mitternacht sonst „gestern“) und nach Updates sehen.
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { render(); checkUpdate(); } });
$('reload').onclick = () => location.reload();

render();
showView();
directEntry();
checkUpdate();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');
