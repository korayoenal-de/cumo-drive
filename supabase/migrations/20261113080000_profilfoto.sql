-- Profilfoto (Koray 13.11.): ein quadratisches JPEG je Konto, 512 Pixel, öffentlich lesbar unter avatars/<id>.jpg.
-- avatar_v zählt die Fassung hoch (für den Cache der anderen), null heißt kein Foto.
alter table public.profiles add column if not exists avatar_v integer;
grant select (avatar_v) on public.profiles to authenticated;
grant update (avatar_v) on public.profiles to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 1048576, array['image/jpeg'])
on conflict (id) do update set public = true, file_size_limit = 1048576, allowed_mime_types = array['image/jpeg'];

-- Nur die eigene Datei <id>.jpg anlegen, ersetzen und löschen; Admins dürfen löschen (Prüfbereich)
create policy "Eigenes Profilfoto hochladen" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and name = auth.uid()::text || '.jpg');
create policy "Eigenes Profilfoto ersetzen" on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and name = auth.uid()::text || '.jpg')
  with check (bucket_id = 'avatars' and name = auth.uid()::text || '.jpg');
create policy "Eigenes Profilfoto löschen" on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (name = auth.uid()::text || '.jpg' or public.is_admin()));
-- Lesen für die Ersetzung durch den Besitzer (öffentlich lesbar ist der Bucket ohnehin)
create policy "Profilfotos lesen" on storage.objects for select to authenticated using (bucket_id = 'avatars');

-- Prüfbereich: ein gemeldetes Foto entfernen (Datei und Fassung)
create function public.admin_remove_avatar(target uuid) returns void
language plpgsql security definer set search_path = public, storage as $$
begin
  if not public.is_admin() then
    raise exception 'Nur für Admins';
  end if;
  update public.profiles set avatar_v = null where id = target;
  delete from storage.objects where bucket_id = 'avatars' and name = target::text || '.jpg';
end;
$$;
revoke all on function public.admin_remove_avatar(uuid) from public, anon;
grant execute on function public.admin_remove_avatar(uuid) to authenticated;
