-- Sicherheit vor dem Start (Koray 17.11., Sicherheitskonzept Maßnahme 10)
--
-- 1. highlight_feedback nur noch mit Anmeldung: die Summen je Highlight sind unser gelerntes Wissen. Ohne Konto
--    bleibt in der App der kuratierte oder zuletzt gespeicherte Stand (highlight-feedback.ts fängt den Fehler ab).
-- 2. Teilen Links und Übergabe Codes mit Mengengrenze: bisher konnte jeder ohne Anmeldung beliebig viele anlegen
--    (bis 200 KB je Übergabe) und so den Speicher füllen. Lesen bleibt offen, die Codes sind 8 Zeichen aus 31
--    (rund 850 Milliarden Möglichkeiten), Raten lohnt nicht.
--    Grenzen: je Konto 60 pro Stunde; ohne Anmeldung zusammen 300 Links und 100 Übergaben pro Stunde.

revoke all on function public.highlight_feedback() from public, anon;
grant execute on function public.highlight_feedback() to authenticated;

alter table public.share_links add column if not exists created_by uuid;
alter table public.handoffs add column if not exists created_by uuid;
create index if not exists share_links_recent on public.share_links (created_at desc);
create index if not exists handoffs_recent on public.handoffs (created_at desc);

create or replace function public.create_share_link(payload text) returns text
language plpgsql security definer set search_path = public as $$
declare
  c text;
  me uuid := auth.uid();
  alphabet constant text := 'abcdefghjkmnpqrstuvwxyz23456789';
begin
  if payload is null or char_length(payload) > 20000 or left(payload, 6) <> 'cumo1:' then
    raise exception 'Kein Tour Code';
  end if;
  -- gleicher Inhalt, gleicher Link (zählt nicht gegen die Grenze)
  select s.code into c from share_links s where s.payload = create_share_link.payload limit 1;
  if c is not null then
    return c;
  end if;
  if (select count(*) from share_links s
      where s.created_at > now() - interval '1 hour'
        and s.created_by is not distinct from me) >= (case when me is null then 300 else 60 end) then
    raise exception 'Gerade zu viele Links. Bitte versuch es später noch einmal.' using errcode = 'P0001';
  end if;
  loop
    c := '';
    for i in 1..8 loop
      c := c || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    begin
      insert into share_links (code, payload, created_by) values (c, create_share_link.payload, me);
      return c;
    exception when unique_violation then
      -- sehr selten, neuer Versuch
    end;
  end loop;
end $$;

create or replace function public.create_handoff(payload jsonb) returns text
language plpgsql security definer set search_path = public as $$
declare
  c text;
  me uuid := auth.uid();
  alphabet constant text := 'abcdefghjkmnpqrstuvwxyz23456789';
begin
  if pg_column_size(payload) > 200000 then
    raise exception 'Tour zu groß';
  end if;
  delete from handoffs where expires_at < now();
  if (select count(*) from handoffs h
      where h.created_at > now() - interval '1 hour'
        and h.created_by is not distinct from me) >= (case when me is null then 100 else 60 end) then
    raise exception 'Gerade zu viele Übergaben. Bitte versuch es später noch einmal.' using errcode = 'P0001';
  end if;
  loop
    c := '';
    for i in 1..8 loop
      c := c || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    begin
      insert into handoffs (code, payload, created_by) values (c, payload, me);
      return c;
    exception when unique_violation then
      -- sehr selten, neuer Versuch
    end;
  end loop;
end $$;

revoke all on function public.create_share_link(text) from public;
revoke all on function public.create_handoff(jsonb) from public;
grant execute on function public.create_share_link(text) to anon, authenticated;
grant execute on function public.create_handoff(jsonb) to anon, authenticated;
