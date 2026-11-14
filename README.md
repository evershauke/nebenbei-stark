# Nebenbei stark

Strichlisten-Logger fürs Handy: Satz machen, einmal tippen, fertig. Statische PWA ohne Server, ohne Konto, Daten nur lokal im Browser. Details zur Umsetzung stehen in `PLAN.md`.

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
