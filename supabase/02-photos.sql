-- ETAPE 3 : photos (table + bucket prive + RLS)
-- A coller dans Supabase : SQL Editor > New query > Run. (Deja lance le 2026-11-01.)

-- 1) Une ligne par photo (le fichier lui-meme est dans le bucket)
create table public.photos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  plante_id uuid not null references public.plantes(id) on delete cascade,
  chemin text not null unique check (char_length(chemin) <= 300),
  created_at timestamptz not null default now()
);

create index photos_plante_idx on public.photos (plante_id);
create index photos_user_idx on public.photos (user_id);

alter table public.photos enable row level security;

create policy "photos : acces au proprietaire" on public.photos
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- 2) Photo de couverture d'une plante
alter table public.plantes
  add column photo_principale_id uuid references public.photos(id) on delete set null;

-- 3) Bucket PRIVE : 5 Mo maximum, JPEG ou WebP uniquement
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', false, 5242880, array['image/jpeg', 'image/webp'])
on conflict (id) do nothing;

-- 4) Acces au bucket : chaque fichier doit etre dans le dossier portant l'identifiant de l'utilisatrice
create policy "photos : lecture" on storage.objects
  for select to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "photos : ajout" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "photos : modification" on storage.objects
  for update to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "photos : suppression" on storage.objects
  for delete to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
