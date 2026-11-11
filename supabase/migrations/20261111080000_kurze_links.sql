-- Kurze Links zum Teilen (Koray 11.11.): Der Link enthält nur eine Kennung, der Tour Code liegt hier.
-- Lange Links mit Namen wurden in WhatsApp unhandlich. Gültig ohne Ablauf, Inhalt ist nur die Route.
create table if not exists public.share_links (
  code text primary key,
  payload text not null check (char_length(payload) <= 20000),
  created_at timestamptz not null default now()
);
alter table public.share_links enable row level security;

create or replace function public.create_share_link(payload text) returns text
language plpgsql security definer set search_path = public as $$
declare
  c text;
  alphabet constant text := 'abcdefghjkmnpqrstuvwxyz23456789';
begin
  if payload is null or char_length(payload) > 20000 or left(payload, 6) <> 'cumo1:' then
    raise exception 'Kein Tour Code';
  end if;
  -- gleicher Inhalt, gleicher Link
  select s.code into c from share_links s where s.payload = create_share_link.payload limit 1;
  if c is not null then
    return c;
  end if;
  loop
    c := '';
    for i in 1..8 loop
      c := c || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    begin
      insert into share_links (code, payload) values (c, create_share_link.payload);
      return c;
    exception when unique_violation then
      -- sehr selten, neuer Versuch
    end;
  end loop;
end $$;

create or replace function public.get_share_link(code text) returns text
language sql security definer set search_path = public stable as $$
  select s.payload from share_links s where s.code = get_share_link.code;
$$;

revoke all on function public.create_share_link(text) from public;
revoke all on function public.get_share_link(text) from public;
grant execute on function public.create_share_link(text) to anon, authenticated;
grant execute on function public.get_share_link(text) to anon, authenticated;
