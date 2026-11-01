-- ETAPE 2 : pieces et plantes (une seule utilisatrice, RLS activee)
-- A coller dans Supabase : SQL Editor > New query > Run. (Deja lance le 2026-11-01.)

-- Pieces (liste modifiable par l'utilisatrice)
create table public.pieces (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  nom text not null check (char_length(trim(nom)) between 1 and 60),
  position int not null default 0,
  created_at timestamptz not null default now(),
  unique (user_id, nom)
);

-- Plantes
create table public.plantes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  nom text not null check (char_length(trim(nom)) between 1 and 100),
  espece text check (char_length(espece) <= 100),
  piece_id uuid references public.pieces(id) on delete set null,
  date_acquisition date,
  notes text check (char_length(notes) <= 5000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index plantes_user_idx on public.plantes (user_id);
create index plantes_piece_idx on public.plantes (piece_id);
create index pieces_user_idx on public.pieces (user_id);

-- Securite : chaque ligne n'est visible et modifiable que par son proprietaire
alter table public.pieces enable row level security;
alter table public.plantes enable row level security;

create policy "pieces : acces au proprietaire" on public.pieces
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "plantes : acces au proprietaire" on public.plantes
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
