-- Koray 12.11.: Ablauf einer Ausfahrt neu (Konzept „Einladen, zusagen, erinnern, losfahren“).
-- Absage mit freiwilligem Grund, stille Übersicht der Absagen für den Veranstalter und eine Mitteilung,
-- sobald der Veranstalter die Gruppenfahrt startet.

-- Absagen mit Grund (Status und Grund in einem Schritt, damit die Mitteilung den Grund kennt)
create function public.decline_invite(ride uuid, reason text default null) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_owner uuid;
  v_status text;
begin
  if auth.uid() is null then
    raise exception 'Bitte anmelden';
  end if;
  select x.owner, x.status into v_owner, v_status from rides x where x.id = decline_invite.ride;
  if v_owner is null then
    raise exception 'Fahrt nicht gefunden';
  end if;
  if v_owner = auth.uid() then
    raise exception 'Als Ersteller kannst du nicht absagen';
  end if;
  if v_status = 'beendet' then
    raise exception 'Die Fahrt ist schon beendet';
  end if;
  update ride_members m
    set status = 'abgesagt', responded_at = now(),
        message = left(nullif(btrim(coalesce(reason, '')), ''), 120)
    where m.ride_id = decline_invite.ride and m.user_id = auth.uid() and m.status in ('eingeladen', 'zugesagt');
  if not found then
    raise exception 'Keine Einladung für diese Fahrt';
  end if;
end $$;

-- Absagen für den Veranstalter, ohne Zahl und ohne Mitteilung in der App
create function public.ride_declines(ride uuid)
returns table (user_id uuid, display_name text, reason text, responded_at timestamptz)
language sql security definer set search_path = public stable as $$
  select m.user_id, p.display_name, m.message, m.responded_at
  from ride_members m
  join rides x on x.id = m.ride_id
  left join profiles p on p.id = m.user_id
  where m.ride_id = ride_declines.ride and m.status = 'abgesagt' and x.owner = auth.uid()
  order by m.responded_at desc nulls last;
$$;

-- Gruppenfahrt gestartet: Mitteilung an alle, die zugesagt haben
create function public.push_ride_start() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'laeuft' and old.status is distinct from 'laeuft' then
    perform public.push_notify(jsonb_build_object('type', 'ride_start', 'ride', new.id, 'actor', auth.uid()));
  end if;
  return null;
end $$;
create trigger rides_start_push after update of status on public.rides
  for each row execute function public.push_ride_start();

revoke all on function public.decline_invite(uuid, text) from public, anon, authenticated;
revoke all on function public.ride_declines(uuid) from public, anon, authenticated;
revoke all on function public.push_ride_start() from public, anon, authenticated;
grant execute on function public.decline_invite(uuid, text) to authenticated;
grant execute on function public.ride_declines(uuid) to authenticated;
