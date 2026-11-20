-- Aktivität in den Nachrichten (Konzept „Ausfahrt im Fokus“, Koray 20.11.2026): die leisen Dinge an einem Ort.
-- Offene Kontaktanfragen an mich, neue Kontakte der letzten 30 Tage und Zusagen zu meinen Ausfahrten der letzten
-- 30 Tage. Nur lesen, nur für mich, neueste zuerst.

create or replace function public.my_activity()
returns table (kind text, actor uuid, actor_name text, ride uuid, ride_name text, at timestamptz)
language sql security definer set search_path = public stable as $$
  select * from (
    select 'kontaktanfrage'::text, c.requester, p.display_name, null::uuid, null::text, c.created_at
      from contacts c join profiles p on p.id = c.requester
     where c.addressee = auth.uid() and c.status = 'pending' and p.banned_at is null
    union all
    select 'kontakt'::text, case when c.requester = auth.uid() then c.addressee else c.requester end, p.display_name, null::uuid, null::text, coalesce(c.answered_at, c.created_at)
      from contacts c
      join profiles p on p.id = case when c.requester = auth.uid() then c.addressee else c.requester end
     where (c.requester = auth.uid() or c.addressee = auth.uid()) and c.status = 'accepted'
       and coalesce(c.answered_at, c.created_at) > now() - interval '30 days'
    union all
    select 'zusage'::text, m.user_id, p.display_name, r.id, r.name, coalesce(m.responded_at, m.joined_at)
      from ride_members m
      join rides r on r.id = m.ride_id
      join profiles p on p.id = m.user_id
     where r.owner = auth.uid() and m.user_id <> auth.uid() and m.status = 'zugesagt'
       and coalesce(m.responded_at, m.joined_at) > now() - interval '30 days'
  ) a
  where auth.uid() is not null
  order by 6 desc
  limit 50;
$$;
revoke all on function public.my_activity() from public, anon;
grant execute on function public.my_activity() to authenticated;
