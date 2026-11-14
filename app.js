import {
  isoLocal, localDay, validateSet, upsertSet, removeSet, quickValues, sortedExercises,
  daySummary, setsOfDay, slug, findOrCreateExercise, parseImport, mergeImport, exportNeeded, lastDays,
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

function exDialog(ex) {
  const dlg = $('dlgEx'), f = dlg.querySelector('form');
  $('exTitle').textContent = ex ? 'Übung umbenennen' : 'Übung anlegen';
  $('exQuick').hidden = !!ex;
  f.q1.disabled = f.q2.disabled = !!ex;
  f.name.value = ex?.name ?? '';
  openDialog(dlg, (v) => {
    const name = f.name.value.trim();
    if (v !== 'ok' || !name) return;
    if (ex) return commit({ ...state, exercises: state.exercises.map((e) => (e.id === ex.id ? { ...e, name } : e)) });
    const q = [Number(f.q1.value), Number(f.q2.value)];
    if (!q.every((n) => Number.isInteger(n) && n >= 1)) return toast('Startwerte müssen ganze Zahlen ab 1 sein.');
    commit({ ...state, exercises: [...state.exercises, { id: crypto.randomUUID(), name, archived: false, startQuick: q, createdAt: isoLocal(new Date()) }] });
  });
}

// ---- Sätze ----
function add(exerciseId, reps, weightKg = null) {
  const set = { id: crypto.randomUUID(), exerciseId, at: isoLocal(new Date()), reps, weightKg };
  commit(upsertSet(state, set));
  toast(`${nameOf(exerciseId)} +${reps} gespeichert`, () => commit(removeSet(state, set.id)));
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
  const sums = new Map(daySummary(state, day).map((s) => [s.exerciseId, s]));
  const exs = sortedExercises(state);
  const cards = exs.map((ex) => {
    const s = sums.get(ex.id) ?? { sets: 0, reps: 0 };
    return h('div', { className: 'card' },
      h('h3', {}, ex.name),
      h('p', {}, `${s.sets} ${s.sets === 1 ? 'Satz' : 'Sätze'} · ${s.reps} Wdh.`),
      h('div', { className: 'quick' },
        ...quickValues(state, ex.id).map((q) => h('button', { type: 'button', onclick: () => add(ex.id, q) }, `+${q}`)),
        h('button', { type: 'button', className: 'more', "aria-label": `Freie Eingabe für ${ex.name}`, onclick: () => setDialog(ex.name, {}, (r) => r && add(ex.id, r.reps, r.weightKg)) }, '…')));
  });
  cards.push(exs.length
    ? h('button', { type: 'button', className: 'primary', onclick: () => exDialog() }, '+ Übung')
    : h('div', {}, h('p', { className: 'hint' }, 'Noch keine Übung. Lege deine erste an und tippe danach nebenbei auf +5.'),
      h('button', { type: 'button', className: 'primary', onclick: () => exDialog() }, 'Erste Übung anlegen')));
  $('cards').replaceChildren(...cards);
  $('today').replaceChildren(...setsOfDay(state, day).map((s) => h('li', {},
    h('button', { type: 'button', onclick: () => editSet(s) },
      `${new Date(s.at).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} · ${nameOf(s.exerciseId)} · ${s.reps} Wdh.${kg(s.weightKg)}`))));
  const week = lastDays(state, day);
  const max = Math.max(1, ...week.map((d) => d.reps));
  $('week').replaceChildren(...week.map((d) => h('li', {},
    h('span', { className: 'day' }, d.day === day ? 'Heute' : new Date(`${d.day}T12:00`).toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'numeric' })),
    h('span', { className: 'bar', style: `--w:${(d.reps / max) * 100}%`, ariaHidden: 'true' }),
    h('span', { className: 'num' }, d.reps ? `${d.reps} Wdh.` : '–'),
    d.items.length ? h('span', { className: 'split' }, d.items.map((s) => `${s.name} ${s.reps}`).join(' · ')) : '')));
}

// ---- Daten & Übungen ----
function renderData() {
  $('exList').replaceChildren(...state.exercises.map((ex) => {
    const url = `${location.origin}${location.pathname}?u=${slug(ex.name)}&n=${ex.startQuick[0]}`;
    return h('li', {},
      h('strong', {}, ex.name + (ex.archived ? ' (archiviert)' : '')),
      h('input', { readOnly: true, value: url, "aria-label": `Direkt-Link ${ex.name}`, onfocus: (e) => e.target.select() }),
      h('button', { type: 'button', onclick: () => { $('dlgData').close(); exDialog(ex); } }, 'Umbenennen'),
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

render();
directEntry();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');
