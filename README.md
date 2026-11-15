# Nebenbei stark

Strichlisten-Logger fürs Handy: Satz machen, einmal tippen, fertig. Fünf Klimmzüge zwischen zwei Meetings sind in unter drei Sekunden eingetragen – ohne Workout zu starten, ohne Konto, ohne Server.

**App:** https://evershauke.github.io/nebenbei-stark/

## Installieren (Android)
Link in Chrome öffnen → Menü „⋮“ → „Zum Startbildschirm hinzufügen“ bzw. „App installieren“. Danach startet sie wie eine normale App, auch offline.

## Funktionen
- **Heute**: kompakte Karte je Übung mit zwei Schnellknöpfen (die zwei zuletzt genutzten Wiederholungszahlen, aufsteigend, damit nichts unter dem Daumen springt) und „…“ für freie Eingabe mit optionalem Gewicht. Jeder Eintrag lässt sich 5 s lang rückgängig machen. Die Reihenfolge der Karten richtet sich nach der Häufigkeit der letzten 4 Wochen (bei Gleichstand nach der letzten Nutzung), gezählt bis gestern, und bleibt den Tag über fest. Antippen des Namens öffnet „Übung bearbeiten“ zum Umbenennen.
- **Ideen**: Beim Anlegen einer Übung gibt es Vorschläge nach Gruppe (Ziehen, Drücken, Beine, Hüfte, Rumpf); Halte-Übungen wie Plank zählen Sekunden.
- **Ziele**: Tages- und Wochenziel je Übung, automatisch Schnitt der letzten Zeit + 5 %, steigt also langsam mit. Antippen der Zielzeile öffnet „Übung bearbeiten“ zum Überschreiben.
- **Serie**: 🔥 N = Wochen in Folge mit erreichtem Wochenziel.
- **Belohnung**: aufsteigende Zahl und kurze Vibration bei jedem Eintrag, Konfetti beim Erreichen eines Ziels (aus bei „Bewegung reduzieren“).
- **Statistik** (eigener Reiter): letzte 7 Tage (Tag antippen → Sätze bearbeiten) und Verlauf je Übung über 12 Wochen oder Monate, ✓ für erreichte Wochenziele.
- **Direkt-Link**: `…/?u=klimmzuege&n=5` trägt 5 Wiederholungen ein und legt die Übung bei Bedarf an (als Lesezeichen oder Kurzbefehl). Die Links je Übung stehen im Menü „⋯“.
- **Daten**: Export/Import als JSON, Erinnerung nach 14 Tagen ohne Export, Übungen umbenennen und archivieren (Sätze bleiben).
- **Offline** und installierbar; Hinweis „Neue Version verfügbar“ nach einem Update.

## Daten & Datenschutz
Alles bleibt im Browser des Handys (`localStorage`). Es gibt keinen Server und kein Konto. Wer das Handy wechselt oder die Browserdaten löscht, braucht einen Export – die App erinnert daran.

## Aufbau
Plain HTML/CSS/JavaScript als ES-Module, kein Build, keine Abhängigkeiten.

| Datei | Inhalt |
|---|---|
| `index.html`, `style.css` | Seite, Dialoge, Stil (hell/dunkel über `light-dark()`) |
| `app.js` | Oberfläche, Speichern, Ereignisse |
| `logic.js` | Reine Funktionen ohne DOM (Ziele, Serie, Statistik, Import …), getestet |
| `sw.js`, `manifest.webmanifest` | Offline und Installation |
| `version.js` | Versionsnummer für Cache und Update-Hinweis |
| `PLAN.md` | Technischer Plan mit Datenmodell und allen Funktionen |

## Entwickeln
```sh
npx http-server -p 8765 -c-1   # oder ein anderer statischer Server
npm test                       # Tests für logic.js (node --test)
```
Dann `http://localhost:8765` öffnen. Auf dem Handy braucht der Service Worker HTTPS (z. B. GitHub Pages).

## Neue Version veröffentlichen
In `version.js` die Zahl hochzählen, committen, pushen. GitHub Pages veröffentlicht automatisch; offene Apps zeigen dann „Neue Version verfügbar“.
