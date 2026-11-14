# Nebenbei stark – Technischer Plan

Quelle: Claude Doc „Nebenbei stark – Projektplan v2“. Begonnen als Prototyp v1 (Schritte 1+2 des Vorgehens), seitdem um Statistik, Ziele, Serie und Belohnung erweitert. Diese Datei beschreibt den aktuellen Stand.

## Rahmen
- Statische PWA, Vanilla HTML/CSS/JS (ES-Module), **kein Build, keine Dependencies**. Läuft per `npx serve .` / GitHub Pages.
- Daten nur lokal in `localStorage` (Key `nebenbei-stark/v1`). shortcut: localStorage statt IndexedDB, reicht für Tausende Sätze; upgraden, wenn > ~2 MB.
- Beim ersten Start `navigator.storage.persist()` anfordern.
- Sprache UI: Deutsch. Hochformat, Daumenbedienung, Buttons ≥ 48 px.

## Dateien
| Datei | Inhalt |
|---|---|
| `index.html` | Markup, Dialoge, Toast-Region |
| `style.css` | Tokens mit `light-dark()`, `color-scheme: light dark` |
| `logic.js` | Reine Funktionen, keine DOM-Zugriffe (testbar mit Node) |
| `app.js` | DOM, Speicher, Events |
| `version.js` | `self.APP_VERSION`: bei jeder Änderung hochzählen (Cache-Name, Update-Hinweis) |
| `sw.js` | Service Worker: App-Shell cachen (network-first, offline aus dem Cache) |
| `manifest.webmanifest` | `id: "./"`, `start_url: "./"`, `display: standalone`, Icon SVG |
| `icon.svg`, `icon-192.png`, `icon-512.png` | Icon (Strichliste); PNGs für Android (any + maskable) |
| `test/logic.test.js` | `node --test` |

## Datenmodell (genau so speichern)
```json
{ "version": 1, "exercises": [ { "id": "uuid", "name": "Klimmzüge", "archived": false, "startQuick": [5, 8], "createdAt": "ISO", "dayGoal": null, "weekGoal": null } ],
  "sets": [ { "id": "uuid", "exerciseId": "uuid", "at": "2026-11-14T10:03:00+01:00", "reps": 5, "weightKg": null } ],
  "lastExportAt": null }
```
- `at` = ISO 8601 mit lokalem Offset (Helfer `isoLocal(date)`), nicht `toISOString()`.
- `dayGoal` / `weekGoal` optional: ganzzahlig ≥ 1 überschreibt das automatische Ziel, fehlt/`null` = automatisch.
- Export-Datei = dieses Objekt plus `"unit": "kg"`.

## logic.js – Funktionen (alle pure, exportiert)
- `isoLocal(date)` → `YYYY-MM-DDTHH:mm:ss±HH:MM`
- `localDay(iso)` → `YYYY-MM-DD` in lokaler Zeit (Tagesgrenze = lokale Mitternacht)
- `validateSet({reps, weightKg})` → Fehlertext oder `null` (reps ganzzahlig ≥ 1, weight leer/null oder Zahl ≥ 0)
- `upsertSet(state, set)` → neuer State; gleiche id überschreibt (Idempotenz)
- `removeSet(state, id)`
- `quickValues(state, exerciseId)` → 2 Zahlen: die zwei zuletzt genutzten **verschiedenen** Wiederholungszahlen, aufgefüllt mit `startQuick`
- `sortedExercises(state)` → nicht archiviert, nach letzter Nutzung absteigend, nie genutzte danach in Anlage-Reihenfolge
- `daySummary(state, day)` → `[{exerciseId, name, sets, reps}]`
- `setsOfDay(state, day)` → neueste zuerst
- `findOrCreateExercise(state, u)` → Abgleich `u` gegen id, oder `slug(name) === slug(u)` (klein, Umlaute ä→ae usw., Nicht-Alphanumerisch → `-`); nicht gefunden → neue Übung mit Name aus `u` (Bindestriche → Leerzeichen, erster Buchstabe groß, ae/oe/ue → ä/ö/ü außer nach a/e/q), startQuick `[n, n]`. Archivierte Übung bei Treffer wieder aktivieren.
- `parseImport(json)` → validierter State oder wirft `Error` mit deutschem Text (prüft Struktur und jede Satz-Regel)
- `mergeImport(state, imported)` → Upsert nach id für Übungen und Sätze (nichts geht verloren)
- `exportNeeded(state, now)` → true, wenn Sätze existieren und `lastExportAt` fehlt oder > 14 Tage alt
- `addDays(day, n)`, `weekStart(day)` (Montag)
- `lastDays(state, day, n = 7)` → `[{day, reps, items}]` für „Letzte 7 Tage“
- `periodTotals(state, exerciseId, 'week' | 'month', today, n = 12)` → `[{from, to, reps}]`, neueste zuerst
- `autoGoals(state, exerciseId, today)` → `{day, week}`: Schnitt × 1,05 aufgerundet; Tag = Trainingstage der 14 Tage vor heute, Woche = Wochen mit Wdh. unter den 4 Wochen davor; ohne Daten `null`
- `goals(state, ex, today)` → `{day, week}` je `{goal, auto, reps}`; `ex.dayGoal` / `ex.weekGoal` überschreiben
- `weekGoalHits(state, ex, today, n = 12)` → Wochen wie `periodTotals` plus `goal` (das damals gültige Ziel) und `hit`
- `streak(state, ex, today)` → Wochen in Folge mit erreichtem Wochenziel; laufende Woche zählt erst, wenn geschafft, bricht die Serie aber nicht

## UI (eine Seite, zwei Reiter)
Kopf: Datum (lang, de-DE) + Menü-Button „⋯“ (öffnet Dialog „Daten & Übungen“).
Reiter „Heute“ / „Statistik“: zwei Links (`#` / `#statistik`) mit `aria-current="page"`, kein ARIA-Tabs-Muster (Seitennavigation); Zurück-Taste wechselt zurück.
Banner „Neue Version verfügbar“: beim Start und bei `visibilitychange` wird `version.js` ohne Cache geladen; neuere Zahl → Banner mit „Neu laden“.
Banner (nur wenn `exportNeeded`): „Letzter Export > 14 Tage – jetzt sichern“ mit Button.
Fehlerbanner (role=alert), wenn Speichern fehlschlägt (try/catch um `localStorage.setItem`).

**Übungskarten** (Reiter Heute, Reihenfolge `sortedExercises`): Name, Zeile „Heute 11/9 ✓“ und „Woche 35/40 · 🔥3“ mit `<progress>` (ohne Ziel nur „Heute 11 Wdh.“; Antippen öffnet „Übung bearbeiten“ mit Tages-/Wochenziel), zwei große Buttons „+5“ „+8“ (aus `quickValues`), Button „…“ → Dialog freie Eingabe (Wiederholungen, Gewicht optional).
Leerer Zustand: Hinweis + Button „Erste Übung anlegen“.
Button „+ Übung“ am Ende der Liste.

**Sätze heute**: Liste der heutigen Sätze, neueste oben („10:03 · Klimmzüge · 5 Wdh. · 10 kg“). Tippen → Dialog Satz bearbeiten (Wdh., Gewicht, Speichern, Löschen).

**Statistik** (Reiter): „Letzte 7 Tage“ als Balken je Tag mit Aufteilung je Übung; jeder Tag ist ein `<details name="tag">` (immer nur einer offen) mit seinen Sätzen zum Bearbeiten. „Verlauf“: Übung + Wochen/Monate wählen, 12 Balken; bei Wochen ✓ für erreichtes Wochenziel.

**Belohnung** beim Eintragen über einen Schnellbutton: Knopf gibt beim Drücken nach, „+5“ steigt aus dem Knopf auf, Karte pulsiert, `navigator.vibrate(15)`. Wird damit das Tages- oder Wochenziel erreicht: Konfetti (Web Animations API, Elemente danach entfernt), längeres Vibrationsmuster, Toast „Tagesziel geschafft! 🎉“ bzw. „Wochenziel geschafft! 🔥 N Wochen in Folge“. Bei `prefers-reduced-motion: reduce` keine Bewegung, Vibration und Toast bleiben.

**Toast** nach jedem Eintrag / Löschen: „Klimmzüge +5 gespeichert · Rückgängig“, 5 s, `popover="manual"`, in `<div role="region" aria-label="Benachrichtigungen">`, Ansage über `ariaNotify` falls vorhanden, sonst `aria-live`-Region. Timer pausiert, solange Fokus im Toast. Rückgängig entfernt den Satz (bzw. stellt gelöschten Satz wieder her).

**Dialoge**: natives `<dialog>` + `showModal()`, `closedby="any"` mit Fallback-Script (pointerdown/pointerup außerhalb), `aria-labelledby`, `<form method="dialog">`, `autofocus` auf erstes Feld, `dialog:modal { overscroll-behavior: contain }` und `::backdrop` ebenso. Kein `display` auf `dialog` ohne `[open]`. Im Dialog keine Toasts – Toast erst nach `close`.
- Freie Eingabe (Wdh. `inputmode=numeric`, `min=1`, `step=1`, required; Gewicht `inputmode=decimal`, `min=0`, `step=0.5`)
- Satz bearbeiten (+ Löschen)
- Übung anlegen / bearbeiten (Name, zwei Startwerte nur beim Anlegen, Tages-/Wochenziel nur beim Bearbeiten, leer = automatisch)
- Daten & Übungen: Liste aller Übungen mit Umbenennen / Archivieren / Wiederherstellen; Export; Import (`<input type=file accept=application/json>`); Hinweis wie man den Direkt-Link baut (`?u=klimmzuege&n=5`) inkl. Anzeige der vollen URL je Übung zum Kopieren.

**Direkt-Eintrag**: Beim Laden `?u=&n=` lesen. `n` ganzzahlig ≥ 1, sonst Fehlertoast. Übung via `findOrCreateExercise`, Satz speichern, Toast mit Undo, danach `history.replaceState` auf URL ohne Query (Reload trägt nicht doppelt ein).

**Export**: JSON-Blob `nebenbei-stark-YYYY-MM-DD.json`. Wenn `navigator.canShare?.({files:[file]})` → `navigator.share`, sonst `<a download>`. Danach `lastExportAt` setzen.
**Import**: Datei lesen → `parseImport` → `mergeImport` → speichern, Toast „X Sätze importiert“. Fehler sichtbar anzeigen.

## Stil
- `<meta name="color-scheme" content="light dark">`, `:root { color-scheme: light dark }`, Farb-Tokens via `light-dark()`, `accent-color`.
- `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">`, Safe-Area-Padding.
- Toast-Animation mit `@starting-style`, `transition-behavior: allow-discrete` separat, `prefers-reduced-motion` ohne Animation.
- Max-Breite 32rem zentriert.

## Service Worker
- Cache `ns-v${APP_VERSION}` mit `./`, `index.html`, `style.css`, `app.js`, `logic.js`, `version.js`, `manifest.webmanifest`, Icons.
- Network-first (`cache: 'no-cache'`), damit Updates sofort ankommen; offline aus dem Cache.
- Navigationsanfragen (auch mit `?u=`) → gecachtes `index.html` wenn offline (`ignoreSearch: true`).
- Alte Caches bei `activate` löschen.

## Abnahme
1. `node --test` grün.
2. Lokal serviert: Übung anlegen, +5 tippen, Toast, Rückgängig, Reload → Daten noch da.
3. `?u=klimmzuege&n=5` legt Satz an, URL wird bereinigt, Reload trägt nicht doppelt ein.
4. Satz bearbeiten/löschen, Übung archivieren (Sätze bleiben im Export), Export/Import-Roundtrip.
5. Keine Console-Fehler, Service Worker registriert.
6. Reiter wechseln (auch per Zurück-Taste), früheren Tag in der Statistik aufklappen und Satz bearbeiten.
7. Ziel per Tipp erreichen → Konfetti + Meldung; Serie und ✓ im Verlauf stimmen.
