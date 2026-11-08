-- Lernende Bewertung (Koray 8.11.2026): Gesamtnote stufenlos 0 bis 100 statt drei Stufen,
-- dazu Daumen hoch oder runter je gefahrenem Highlight (Pass oder Strecke).
-- Aus den Daumen entsteht je Highlight eine Summe, mit der die App den Fahrspaß Pegel nachführt.

alter table public.drives add column if not exists rating_score smallint check (rating_score between 0 and 100);

-- Daumen je Highlight einer Fahrt. hl_key: Pass id oder road:<id> wie in der App.
create table if not exists public.drive_highlights (
  drive_id uuid not null references public.drives (id) on delete cascade,
  owner uuid not null default auth.uid() references auth.users (id) on delete cascade,
  hl_key text not null check (char_length(hl_key) between 1 and 120),
  hl_name text check (char_length(hl_name) <= 120),
  vote smallint check (vote in (-1, 1)),
  created_at timestamptz not null default now(),
  primary key (drive_id, hl_key)
);
create index if not exists drive_highlights_key on public.drive_highlights (hl_key);
alter table public.drive_highlights enable row level security;
create policy "Eigene Highlight Bewertungen lesen" on public.drive_highlights for select to authenticated using (owner = auth.uid());

-- Bewertung speichern: Note, Gründe und Notiz bei schwacher Note (unter 40), Daumen je Highlight.
-- rating (1 bis 3) wird für ältere App Stände mitgeführt.
create or replace function public.rate_drive_v2(
  p_id uuid,
  p_score smallint,
  p_reasons text[] default null,
  p_note text default null,
  p_highlights jsonb default '[]'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  h jsonb;
begin
  if p_score is null or p_score < 0 or p_score > 100 then
    return;
  end if;
  update public.drives
  set rating_score = p_score,
      rating = case when p_score < 40 then 1 when p_score < 80 then 2 else 3 end,
      rating_reasons = case when p_score < 40 then p_reasons else null end,
      rating_note = case when p_score < 40 then nullif(left(trim(p_note), 500), '') else null end,
      rated_at = now()
  where id = p_id and owner = auth.uid();
  if not found then
    return;
  end if;
  for h in select * from jsonb_array_elements(coalesce(p_highlights, '[]'::jsonb)) loop
    insert into public.drive_highlights (drive_id, owner, hl_key, hl_name, vote)
    values (
      p_id,
      auth.uid(),
      left(h->>'key', 120),
      left(h->>'name', 120),
      case when (h->>'vote')::int in (-1, 1) then (h->>'vote')::smallint else null end
    )
    on conflict (drive_id, hl_key) do update set vote = excluded.vote, hl_name = excluded.hl_name;
  end loop;
end;
$$;

revoke all on function public.rate_drive_v2(uuid, smallint, text[], text, jsonb) from public, anon;
grant execute on function public.rate_drive_v2(uuid, smallint, text[], text, jsonb) to authenticated;

-- Summen je Highlight für alle: nur Zahlen, keine Fahrer, keine Spuren.
-- score_avg: mittlere Gesamtnote der Fahrten über dieses Highlight; reasons: Gründe schwacher Fahrten.
create or replace function public.highlight_feedback()
returns table (hl_key text, votes integer, up integer, down integer, drives integer, score_avg numeric, reasons jsonb)
language sql
stable
security definer
set search_path = public
as $$
  select
    h.hl_key,
    count(h.vote)::int as votes,
    count(*) filter (where h.vote = 1)::int as up,
    count(*) filter (where h.vote = -1)::int as down,
    count(*)::int as drives,
    round(avg(d.rating_score), 1) as score_avg,
    coalesce(
      (select jsonb_object_agg(r, n) from (
        select r, count(*) as n
        from public.drive_highlights h2
        join public.drives d2 on d2.id = h2.drive_id, unnest(d2.rating_reasons) as r
        where h2.hl_key = h.hl_key
        group by r
      ) x),
      '{}'::jsonb
    ) as reasons
  from public.drive_highlights h
  join public.drives d on d.id = h.drive_id
  group by h.hl_key;
$$;

revoke all on function public.highlight_feedback() from public;
grant execute on function public.highlight_feedback() to anon, authenticated;
