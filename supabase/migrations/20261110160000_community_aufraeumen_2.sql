-- Koray 10.11.: Große Sellaronda und RCO 25 Etappe 2 aus der Community nehmen (Konto des CUMO DRIVERS CLUB).
update public.tours set published = false
where id in (
  '6b18ba01-a465-4eff-a044-9e97f992e650', -- Große Sellaronda
  '228953b0-a3a7-435d-a17f-2cc3ee3e73c1'  -- RCO 25, Etappe 2
);
