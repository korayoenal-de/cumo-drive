-- Bewertung nach der Fahrt: 1 nicht gut, 2 gut, 3 sensationell.
-- Bei "nicht gut" zusätzlich die Gründe (Verkehr, Orte, Belag ...) und ein freier Satz.
-- Zusammen mit der Spur (track) zeigt das später, welche Straßen Fahrer wirklich lieben oder meiden.
alter table public.drives add column if not exists rating smallint check (rating between 1 and 3);
alter table public.drives add column if not exists rating_reasons text[];
alter table public.drives add column if not exists rating_note text check (char_length(rating_note) <= 500);
alter table public.drives add column if not exists rated_at timestamptz;

create or replace function public.rate_drive(p_id uuid, p_rating smallint, p_reasons text[] default null, p_note text default null)
returns void
language sql
security definer
set search_path = public
as $$
  update public.drives
  set rating = p_rating,
      rating_reasons = case when p_rating = 1 then p_reasons else null end,
      rating_note = case when p_rating = 1 then nullif(left(trim(p_note), 500), '') else null end,
      rated_at = now()
  where id = p_id and owner = auth.uid() and p_rating between 1 and 3;
$$;

revoke all on function public.rate_drive(uuid, smallint, text[], text) from public, anon;
grant execute on function public.rate_drive(uuid, smallint, text[], text) to authenticated;
