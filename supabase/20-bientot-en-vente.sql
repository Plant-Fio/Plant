-- Statut « Bientot en vente » (en plus de En vente et Vendu)
alter table public.plantes add column bientot_en_vente boolean not null default false;
