-- JOURNAL : icone (emoji) choisie pour chaque note
-- A coller dans Supabase : SQL Editor > New query > Run.

alter table public.journal add column icone text check (char_length(icone) <= 8);
