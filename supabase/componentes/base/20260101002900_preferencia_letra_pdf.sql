-- Una preferencia más de pantalla: el tamaño de letra de los PDF con tablas (informe de reposición, solicitud de presupuesto…).
-- La base la valida igual que las otras: solo "chica", "normal" o "grande".

alter table public.usuarios_perfil drop constraint usuarios_perfil_preferencias_check;
alter table public.usuarios_perfil
  add constraint usuarios_perfil_preferencias_check check (
    jsonb_typeof(preferencias) = 'object'
    and octet_length(preferencias::text) <= 2000
    and (not preferencias ? 'menu_posicion' or preferencias ->> 'menu_posicion' in ('lateral', 'arriba', 'abajo'))
    and (not preferencias ? 'menu_fijo' or jsonb_typeof(preferencias -> 'menu_fijo') = 'boolean')
    and (not preferencias ? 'pdf_letra' or preferencias ->> 'pdf_letra' in ('chica', 'normal', 'grande'))
  );
