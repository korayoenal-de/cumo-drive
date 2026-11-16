# CUMO DRIVE

Regeln für jede Arbeit in diesem Repo (Koray 15.11.2026):

* Jede Neuerung folgt dem Design System und den Regeln in `docs/design-prinzipien.md`, vor allem der Konsistenzprüfung vom 15.11. und dem Abschnitt „Pflicht für jede Neuerung“. Bausteine wiederverwenden (Kennzahlen, BackLink, ActionSheet, ShareSheet, ChipRow, Formate aus `app/src/lib/format.ts`, Tokens aus `app/src/constants/theme.ts`), Glossar Wörter, eine Hauptaktion je Ansicht. Abweichungen nur bewusst und dort dokumentiert.
* Texte in Du Form, ohne Gedankenstriche. calimoto nie in App, Web oder Landingpage erwähnen.
* Mit Karte oder Navigation immer CarPlay mitdenken; native Änderungen (app/carplay, app.json Plugins) brauchen einen TestFlight Build, JavaScript geht per OTA.
* OTA Updates, Builds und Migrationen auf main nur nach Korays OK. Schlüssel nie committen oder ausgeben. Kein `git reset --hard`.
* Prüfen vor dem Commit im Ordner app: `npx tsc --noEmit`, `npx eslint src`, `npm test`.
