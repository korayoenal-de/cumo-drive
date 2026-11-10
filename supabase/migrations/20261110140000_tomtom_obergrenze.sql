-- Koray 10.11.: bis 200 € für das Testen sind in Ordnung (25 € Guthaben, Kreditkarte hinterlegt).
-- 20.000 Abfragen im Monat liegen selbst bei 1 € je 1.000 Abfragen bei höchstens rund 20 € über dem Freikontingent.
update public.tomtom_budget set monthly_cap = 20000 where id;
