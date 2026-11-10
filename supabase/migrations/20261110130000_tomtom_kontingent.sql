-- TomTom Kosten im Griff (Koray 10.11.): jede Abfrage der Edge Functions wird je Monat gezählt.
-- Ist die Obergrenze erreicht, fragen road-closures und pass-status nicht mehr bei TomTom, sondern liefern den
-- letzten bekannten Stand. Obergrenze 2.500 im Monat (freies Kontingent, Kreditkarte ist hinterlegt).
-- Anheben: update public.tomtom_budget set monthly_cap = 5000;

create table if not exists public.tomtom_budget (
  id boolean primary key default true check (id),
  monthly_cap integer not null default 2500 check (monthly_cap >= 0)
);
insert into public.tomtom_budget (id) values (true) on conflict do nothing;

create table if not exists public.tomtom_usage (
  month date primary key,
  calls integer not null default 0,
  updated_at timestamptz not null default now()
);

-- November 2026: laut TomTom Portal 3.700 Abfragen in den letzten 30 Tagen, vermutlich größtenteils im November.
-- Vorsichtig mit 2.500 starten: damit ist das Freikontingent für November als verbraucht markiert.
insert into public.tomtom_usage (month, calls) values ('2026-11-01', 2500) on conflict do nothing;

alter table public.tomtom_budget enable row level security;
alter table public.tomtom_usage enable row level security;
revoke all on public.tomtom_budget, public.tomtom_usage from anon, authenticated;

-- n Abfragen reservieren; true, wenn sie noch in die Obergrenze passen (atomar, auch bei parallelen Aufrufen)
create or replace function public.tomtom_take(n integer default 1) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  m date := date_trunc('month', now() at time zone 'Europe/Berlin')::date;
  cap integer;
  used integer;
begin
  select monthly_cap into cap from public.tomtom_budget where id;
  insert into public.tomtom_usage (month, calls) values (m, 0) on conflict do nothing;
  update public.tomtom_usage set calls = calls + n, updated_at = now()
    where month = m and calls + n <= coalesce(cap, 2500)
    returning calls into used;
  return used is not null;
end $$;

revoke all on function public.tomtom_take(integer) from public, anon, authenticated;
grant execute on function public.tomtom_take(integer) to service_role;
