# Mail Vorlagen (Supabase Auth)

Stand 18.11.2026. Die Vorlagen werden im Supabase Dashboard eingetragen (Authentication, Emails), nicht per Migration.

| Vorlage | Datei | Betreff |
| --- | --- | --- |
| Confirm signup | confirm-signup.html | siehe unten |

Betreff (ein Feld, drei Sprachen):

```
{{ $l := printf "%v" .Data.lang }}{{ if eq $l "en" }}Confirm your email for CUMO DRIVE{{ else if eq $l "it" }}Conferma la tua email per CUMO DRIVE{{ else }}Bestätige deine E Mail für CUMO DRIVE{{ end }}
```

Die Sprache kommt aus den Angaben der Registrierung (`lang`, seit 18.11. in `auth.ts`); fehlt sie, gilt Deutsch.

Voraussetzung: eigener Absender über SMTP (Authentication, Emails, SMTP Settings), Absender `CUMO DRIVE <noreply@cumodrive.com>`. Der eingebaute Versand von Supabase ist nur zum Testen gedacht: wenige Mails je Stunde, Absender „Supabase Auth“, Abmeldelink, landet im Spam. Für die Zustellung braucht die Domain SPF und DKIM.

Rückkehr nach dem Klick: `https://cumodrive.de/bestaetigt` (unter Authentication, URL Configuration als Redirect URL eintragen).
