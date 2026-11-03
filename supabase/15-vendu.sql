-- VENDU : date de vente d'une plante (vide = pas vendue)
-- A coller dans Supabase : SQL Editor > New query > Run.

alter table public.plantes
  add column vendu_le date;
