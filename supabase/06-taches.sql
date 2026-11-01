-- TACHES LIBRES : petites choses a faire (ex. "Vaporiser les plantes du salon"), dans l'ecran Aujourd'hui
-- A coller dans Supabase : SQL Editor > New query > Run. (Deja lance le 2026-11-01.)

create table public.taches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  texte text not null check (char_length(texte) between 1 and 120),
  fait_le date,                       -- vide = pas encore faite
  created_at timestamptz not null default now()
);

create index taches_user_idx on public.taches (user_id);

alter table public.taches enable row level security;

create policy "taches : acces au proprietaire" on public.taches
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
