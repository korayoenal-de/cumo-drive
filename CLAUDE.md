# CUMO DRIVE

Regeln für jede Arbeit in diesem Repo (Koray 15.11.2026):

* Jede Neuerung folgt dem Design System und den Regeln in `docs/design-prinzipien.md`, vor allem der Konsistenzprüfung vom 15.11. und dem Abschnitt „Pflicht für jede Neuerung“. Bausteine wiederverwenden (Kennzahlen, BackLink, ActionSheet, ShareSheet, ChipRow, Formate aus `app/src/lib/format.ts`, Tokens aus `app/src/constants/theme.ts`), Glossar Wörter, eine Hauptaktion je Ansicht. Abweichungen nur bewusst und dort dokumentiert.
* Texte in Du Form, ohne Gedankenstriche. calimoto nie in App, Web oder Landingpage erwähnen.
* Mit Karte oder Navigation immer CarPlay mitdenken; native Änderungen (app/carplay, app.json Plugins) brauchen einen TestFlight Build, JavaScript geht per OTA.
* OTA Updates, Builds und Migrationen auf main nur nach Korays OK. Schlüssel nie committen oder ausgeben. Kein `git reset --hard`.
* Prüfen vor dem Commit im Ordner app: `npx tsc --noEmit`, `npx eslint src`, `npm test`.
* Vor jedem Update (OTA und Build) muss ein Testlauf grün sein (Koray 17.11.2026): im Ordner app `npm run vor-update` (Typen, Lint, Tests, QS Korpus, Stresstest, Simulation, feste Routen, etwa 4 Minuten). Ist ein Schritt rot, geht kein Update raus. Bericht in `app/qa/out/vor-update.md`, Katalog der Tests: Doc „CUMO DRIVE Testkatalog“.
* OTA Update auslösen (nach Korays OK): Tag `ota-JJJJMMTT-HHMM` auf den Commit setzen und pushen, etwa `git tag ota-20261117-1430 && git push origin ota-20261117-1430`. GitHub Actions (`.github/workflows/eas-update.yml`) führt den Testlauf aus und veröffentlicht nur, wenn er grün ist. So braucht keine Sitzung einen eigenen Expo Zugang; das Secret EXPO_TOKEN liegt im Repo.
