-- Petite description d'une photo (galerie de la plante)
alter table public.photos add column description text check (char_length(description) <= 200);
