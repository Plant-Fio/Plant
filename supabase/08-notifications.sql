-- NOTIFICATIONS : appareils abonnes + reglages (heures du matin et du soir)
-- A coller dans Supabase : SQL Editor > New query > Run.

-- Un appareil (iPhone) abonne aux notifications. "endpoint", "p256dh" et "auth" viennent du navigateur.
create table public.appareils_push (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  endpoint text not null unique check (char_length(endpoint) <= 1000),
  p256dh text not null check (char_length(p256dh) <= 300),
  auth text not null check (char_length(auth) <= 300),
  created_at timestamptz not null default now()
);
create index appareils_push_user_idx on public.appareils_push (user_id);

-- Reglages de notification (une ligne par utilisatrice)
create table public.reglages_notifs (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  matin_actif boolean not null default true,
  heure_matin smallint not null default 10 check (heure_matin between 0 and 23),
  soir_actif boolean not null default true,
  heure_soir smallint not null default 20 check (heure_soir between 0 and 23),
  fuseau text not null default 'Europe/Paris' check (char_length(fuseau) <= 60),
  dernier_matin date,   -- jour du dernier envoi du matin (evite les doublons)
  dernier_soir date
);

alter table public.appareils_push enable row level security;
alter table public.reglages_notifs enable row level security;

create policy "appareils_push : acces au proprietaire" on public.appareils_push
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "reglages_notifs : acces au proprietaire" on public.reglages_notifs
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
