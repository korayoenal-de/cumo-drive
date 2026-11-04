-- Neue Tabellen werden nicht automatisch freigegeben; die Server Rolle (Edge Functions)
-- braucht deshalb ausdrückliche Rechte.
grant usage on schema public to service_role;
grant select, insert, update, delete on all tables in schema public to service_role;
alter default privileges in schema public grant select, insert, update, delete on tables to service_role;
