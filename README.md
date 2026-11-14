# Nebenbei stark

Strichlisten-Logger fürs Handy: Satz machen, einmal tippen, fertig. Statische PWA ohne Server, ohne Konto, Daten nur lokal im Browser. Details zur Umsetzung stehen in `PLAN.md`.

## Funktionen
- **Heute**: eine Karte je Übung mit zwei Schnellbuttons (zuletzt genutzte Wiederholungszahlen) und „…“ für freie Eingabe mit optionalem Gewicht. Jeder Eintrag lässt sich 5 s lang rückgängig machen.
- **Ziele**: Tages- und Wochenziel je Übung, automatisch Schnitt der letzten Zeit + 5 %, im Dialog „Übung bearbeiten“ überschreibbar.
- **Serie**: 🔥 N = Wochen in Folge mit erreichtem Wochenziel.
- **Belohnung**: aufsteigende Zahl und kurze Vibration bei jedem Eintrag, Konfetti beim Erreichen eines Ziels (aus bei „Bewegung reduzieren“).
- **Statistik**: letzte 7 Tage (Tag antippen → Sätze bearbeiten) und Verlauf je Übung über 12 Wochen oder Monate.
- **Daten**: Export/Import als JSON, Erinnerung nach 14 Tagen ohne Export, Übungen umbenennen und archivieren.
- **Offline** und als App installierbar; Hinweis, wenn eine neue Version verfügbar ist.

## Starten
```sh
npx http-server -p 8765 -c-1   # oder ein anderer statischer Server
```
Dann `http://localhost:8765` öffnen. Auf dem Handy braucht der Service Worker HTTPS (z. B. GitHub Pages).

## Direkt-Eintrag (QR/NFC)
`https://<host>/?u=klimmzuege&n=5` trägt 5 Wiederholungen für „Klimmzüge“ ein und legt die Übung bei Bedarf an. Die fertigen Links je Übung stehen im Menü „⋯“.

## Tests
```sh
npm test
```

## Neue Version veröffentlichen
In `version.js` die Zahl hochzählen, committen, pushen. Offene Apps zeigen dann „Neue Version verfügbar“.
