-- Koray 10.11.: Die Sellaronda ist seine Tour. Seine eigene „Kleine Sellaronda“ wird veröffentlicht (mit der
-- Beschreibung der bisherigen Club Fassung), die Fassung im Konto des CUMO DRIVERS CLUB wird zurückgezogen,
-- damit die Tour nicht doppelt in der Community steht.
do $$
declare
  mine uuid;
  club_desc text;
begin
  select description into club_desc from public.tours where id = '8cccb743-6c64-4bba-b935-3deb129995ce';
  select id into mine from public.tours
    where owner = '5e981c05-a751-44b3-8506-7595e5f5d299' and name = 'Kleine Sellaronda' and in_library
    order by updated_at desc limit 1;
  if mine is null then
    raise notice 'Kleine Sellaronda im Konto von Koray nicht gefunden, nichts geändert';
    return;
  end if;
  update public.tours
    set published = true, published_at = now(), author = 'Koray', description = coalesce(description, club_desc)
    where id = mine;
  update public.tours set published = false where id = '8cccb743-6c64-4bba-b935-3deb129995ce';
end $$;
