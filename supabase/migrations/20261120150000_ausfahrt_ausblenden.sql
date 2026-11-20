-- Ausfahrten im Tab Ausfahrten per Wischen entfernen (Koray 20.11.2026): abgesagte und vergangene verschwinden nur
-- aus meiner Liste. Dafür nimmt die Tabelle der ausgeblendeten Chats auch 'ausfahrt:<Ausfahrt>' auf.
alter table public.chat_hidden drop constraint if exists chat_hidden_chat_check;
alter table public.chat_hidden add constraint chat_hidden_chat_check check (chat ~ '^(dm|ride|ausfahrt):[0-9a-f-]{36}$');
