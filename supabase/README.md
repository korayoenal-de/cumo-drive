# Supabase für CUMO DRIVE

Über die GitHub Integration spielt Supabase bei jedem Push auf `main` ein:

* `migrations/`: Datenbankstruktur mit Row Level Security
* `functions/pass-status`: Passstatus aus TomTom Sperrmeldungen (Secret `TOMTOM_KEY`), läuft alle 4 Stunden per pg_cron

`functions/pass-status/passes.json` ist eine Kopie von `app/src/data/passes.json`; nach Änderungen an den Pässen in `app/` den Befehl `npm run sync:functions` ausführen.
