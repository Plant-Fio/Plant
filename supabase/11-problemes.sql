-- SUIVI DES PROBLEMES : parasites, maladies... avec traitement et relance
-- A coller dans Supabase : SQL Editor > New query > Run.

create table public.problemes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  plante_id uuid not null references public.plantes(id) on delete cascade,
  type text not null check (char_length(type) between 1 and 40),   -- cochenilles, araignees rouges...
  note text check (char_length(note) <= 500),                      -- observation / traitement applique
  debut date not null default ((now() at time zone 'Europe/Paris')::date),
  relance_le date,                                                 -- prochain traitement a faire (vide = pas de relance)
  resolu_le date,                                                  -- vide = probleme en cours
  created_at timestamptz not null default now()
);

create index problemes_plante_idx on public.problemes (plante_id);
create index problemes_user_idx on public.problemes (user_id);

alter table public.problemes enable row level security;

create policy "problemes : acces au proprietaire" on public.problemes
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
