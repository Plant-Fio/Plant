-- LISTE DE SOUHAITS : plantes qu'on aimerait avoir (avec une photo d'inspiration)
-- A coller dans Supabase : SQL Editor > New query > Run.
-- La photo d'inspiration utilise le bucket prive "photos" deja en place (dossier <utilisatrice>/souhaits/).

create table public.souhaits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  nom text not null check (char_length(nom) between 1 and 100),
  espece text check (char_length(espece) <= 100),
  note text check (char_length(note) <= 2000),
  photo_chemin text check (char_length(photo_chemin) <= 300),
  created_at timestamptz not null default now()
);

create index souhaits_user_idx on public.souhaits (user_id);

alter table public.souhaits enable row level security;

create policy "souhaits : acces au proprietaire" on public.souhaits
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
