-- Chats in der Liste der Nachrichten löschen (Koray 20.11.2026, per Wischen): wie bei WhatsApp nur für mich. Der Chat
-- verschwindet aus meiner Liste, bis eine neue Nachricht kommt; für die anderen bleibt alles erhalten.
-- chat: 'dm:<Partner>' oder 'ride:<Ausfahrt>'. Die App blendet aus, was nicht neuer als hidden_at ist.

create table if not exists public.chat_hidden (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  chat text not null check (chat ~ '^(dm|ride):[0-9a-f-]{36}$'),
  hidden_at timestamptz not null default now(),
  primary key (user_id, chat)
);
alter table public.chat_hidden enable row level security;
drop policy if exists "Eigene ausgeblendete Chats" on public.chat_hidden;
create policy "Eigene ausgeblendete Chats" on public.chat_hidden for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select, insert, update, delete on public.chat_hidden to authenticated;
