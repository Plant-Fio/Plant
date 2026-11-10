-- Quarantaine au choix (vrai par defaut, comme avant)
alter table public.plantes add column quarantaine boolean not null default true;
