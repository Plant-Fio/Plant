-- Etapes d'un baby : on retire « Preleve », on ajoute germination, vermiculite et pon
do $$ declare c text; begin
  for c in select conname from pg_constraint where conrelid = 'public.plantes'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%etape_bouture%' loop
    execute format('alter table public.plantes drop constraint %I', c);
  end loop;
end $$;

-- Les babies qui etaient a l'etape « Preleve » passent a « Dans l'eau »
update public.plantes set etape_bouture = 'eau' where etape_bouture = 'preleve';

alter table public.plantes add constraint plantes_etape_bouture_check
  check (etape_bouture in ('germination', 'eau', 'vermiculite', 'pon', 'terre', 'adopte', 'donne'));
