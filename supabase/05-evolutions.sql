-- EVOLUTIONS : en vente, derniere feuille, rappel d'engrais, date des photos
-- A coller dans Supabase : SQL Editor > New query > Run.

-- 1) Plantes : etiquette "en vente", date de la derniere feuille, frequence d'engrais (en jours)
alter table public.plantes
  add column en_vente boolean not null default false,
  add column derniere_feuille date,
  add column engrais_jours int check (engrais_jours between 1 and 730);

-- 2) Photos : date de la photo (modifiable), pour suivre l'evolution d'une plante
alter table public.photos add column date_photo date;
update public.photos set date_photo = (created_at at time zone 'Europe/Paris')::date;
alter table public.photos
  alter column date_photo set not null,
  alter column date_photo set default ((now() at time zone 'Europe/Paris')::date);
