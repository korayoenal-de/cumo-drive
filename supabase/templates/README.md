# Mail Vorlagen (Supabase Auth)

Stand 19.11.2026. Die Vorlagen werden im Supabase Dashboard eingetragen (Authentication, Emails), nicht per Migration.

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

## Link in der Mail (seit 19.11.2026)

Der Link zeigt auf unsere eigene Seite und trägt nur den Code: `https://cumodrive.de/bestaetigt?token_hash={{ .TokenHash }}&type=email`. Die Seite löst ihn mit `verifyOtp` ein (`app/src/app/bestaetigt.tsx`). Grund: mit `{{ .ConfirmationURL }}` stand sichtbar eine lange Adresse bei supabase.co in der Mail, und iCloud sortierte sie in den Spam, obwohl SPF, DKIM und DMARC bestanden waren. Reihenfolge beim Ausrollen: erst das Web Paket mit der neuen Seite hochladen, dann die Vorlage im Dashboard speichern.

## Versand über Brevo (seit 19.11.2026)

SMTP in Supabase: Host `smtp-relay.brevo.com`, Port 587, Benutzer aus Brevo (SMTP und API), Passwort ist der SMTP Schlüssel aus Brevo (trägt Koray ein). Das Postfach beim Hoster war zu langsam: Supabase bricht nach 10 Sekunden ab und nimmt die Registrierung zurück.

DNS für cumodrive.com (DomainFactory): TXT `@` mit dem Brevo Code, CNAME `brevo1._domainkey` und `brevo2._domainkey` auf die DKIM Namen von Brevo, TXT `_dmarc` mit `v=DMARC1; p=none; rua=mailto:rua@dmarc.brevo.com`. Geprüft an einer Mail vom 19.11.: SPF, DKIM und DMARC bestanden.
