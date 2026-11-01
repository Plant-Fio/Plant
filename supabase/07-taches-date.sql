-- TACHES PREVUES A L'AVANCE : date a laquelle la tache est prevue (vide = des maintenant)
-- A coller dans Supabase : SQL Editor > New query > Run.
alter table public.taches add column pour_le date;
