-- TYPE D'ENGRAIS : preciser quel engrais a ete donne (Osmocote, engrais liquide...)
-- A coller dans Supabase : SQL Editor > New query > Run.

alter table public.plantes
  add column type_engrais text;
