-- HORLOGE : appelle la fonction "rappels" a chaque heure pile.
-- A coller dans Supabase : SQL Editor > New query > Run.
-- AVANT : Database > Extensions : activer "pg_cron" et "pg_net".
-- Remplace les deux valeurs entre < > (ne les mets JAMAIS dans le depot GitHub) :
--   <CLE_ANON>    : la cle "anon public" (Project Settings > API)
--   <CRON_SECRET> : le mot de passe secret choisi (le meme que dans les secrets de la fonction)

select cron.schedule(
  'rappels-horaires',
  '0 * * * *',
  $$
  select net.http_post(
    url := 'https://lqtadrpnxlmkrboqbuql.supabase.co/functions/v1/rappels',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer <CLE_ANON>',
      'x-cron-secret', '<CRON_SECRET>'
    ),
    body := '{}'::jsonb
  );
  $$
);
