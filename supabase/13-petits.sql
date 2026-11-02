-- PETITS : boutures / bulbilles rattachees a leur plante mere, avec leur etape
-- A coller dans Supabase : SQL Editor > New query > Run.

alter table public.plantes
  add column mere_id uuid references public.plantes(id) on delete set null,   -- la plante mere (vide = plante normale)
  add column etape_bouture text check (etape_bouture in ('preleve', 'eau', 'terre', 'adopte', 'donne')),
  add column date_bouture date;                                               -- jour du prelevement

create index plantes_mere_idx on public.plantes (mere_id);
