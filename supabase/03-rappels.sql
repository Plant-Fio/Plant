-- ETAPE 4 : rappels d'arrosage + dates d'engrais et de rempotage
-- A coller dans Supabase : SQL Editor > New query > Run. (Deja lance le 2026-11-01.)

-- 1) Nouvelles colonnes sur les plantes
--    arrosage_jours : tous les combien de jours arroser (vide = pas de rappel)
alter table public.plantes
  add column arrosage_jours int check (arrosage_jours between 1 and 365),
  add column dernier_engrais date,
  add column dernier_rempotage date;

-- 2) Historique des arrosages : une ligne par plante et par jour
create table public.arrosages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  plante_id uuid not null references public.plantes(id) on delete cascade,
  jour date not null,
  created_at timestamptz not null default now(),
  unique (plante_id, jour)
);

create index arrosages_plante_idx on public.arrosages (plante_id, jour desc);
create index arrosages_user_idx on public.arrosages (user_id);

alter table public.arrosages enable row level security;

create policy "arrosages : acces au proprietaire" on public.arrosages
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
