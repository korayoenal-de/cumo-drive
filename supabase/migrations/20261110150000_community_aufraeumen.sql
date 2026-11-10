-- Koray 10.11.: Vogesen Etappe 1 und 2 sowie RCO 23 Tag 2 aus der Community nehmen. Die drei Touren gehören dem
-- Konto des CUMO DRIVERS CLUB (nicht Korays eigenem Konto), deshalb konnte er sie in der App nicht zurückziehen.
-- Die Zeilen bleiben im Konto des Clubs, nur nicht mehr veröffentlicht.
update public.tours set published = false
where id in (
  'a0f78799-e86f-49d3-9858-3b3c86a45372', -- Vogesen, Etappe 1
  '12950266-f1e4-4820-940a-072629ee15e8', -- Vogesen, Etappe 2
  'd71e2222-2686-4ac0-bf18-f10a257fa89b'  -- RCO 23, Tag 2
);
