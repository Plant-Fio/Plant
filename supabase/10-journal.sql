-- JOURNAL DE LA PLANTE : notes datees (nouvelle feuille, cochenilles, rempotage...), photo optionnelle
-- A coller dans Supabase : SQL Editor > New query > Run.

create table public.journal (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  plante_id uuid not null references public.plantes(id) on delete cascade,
  texte text not null check (char_length(texte) between 1 and 1000),
  date_note date not null default ((now() at time zone 'Europe/Paris')::date),
  photo_id uuid references public.photos(id) on delete set null,  -- photo optionnelle (meme stockage que la galerie)
  created_at timestamptz not null default now()
);

create index journal_plante_idx on public.journal (plante_id);
create index journal_user_idx on public.journal (user_id);

alter table public.journal enable row level security;

create policy "journal : acces au proprietaire" on public.journal
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
