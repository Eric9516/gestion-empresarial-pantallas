-- Retiros: la ventana de corrección es de 24 horas, como dicen la pantalla y el manual.
--
-- Antes, las reglas de edición tenían dos condiciones de tiempo distintas:
--   · para empezar a editar (USING): que el retiro tenga menos de 24 horas;
--   · para guardar el cambio (WITH CHECK): que el retiro se haya creado "hoy" según el calendario UTC.
-- El día UTC termina a las 21:00 de Argentina, así que un retiro hecho a las 18:00 ya no se podía corregir ni devolver (parcialmente)
-- a la mañana siguiente, aunque habían pasado solo 16 horas. Ahora las dos condiciones son la misma: menos de 24 horas.
-- (Quien puede ver todos los retiros sigue sin límite de tiempo, igual que antes.)
--
-- Borrar un retiro completo o una línea ya usaba solo las 24 horas: no cambia.

drop policy if exists "retiros_update" on public.retiros;
create policy "retiros_update" on public.retiros
  as permissive for update to authenticated
  using (can_view_all_retiros() or (usuario_id = auth.uid() and created_at > (now() - interval '24 hours')))
  with check (can_view_all_retiros() or (usuario_id = auth.uid() and created_at > (now() - interval '24 hours')));

drop policy if exists "retiro_items_update" on public.retiro_items;
create policy "retiro_items_update" on public.retiro_items
  as permissive for update to authenticated
  using (exists (select 1 from public.retiros r where r.id = retiro_items.retiro_id
    and (can_view_all_retiros() or (r.usuario_id = auth.uid() and r.created_at > (now() - interval '24 hours')))))
  with check (exists (select 1 from public.retiros r where r.id = retiro_items.retiro_id
    and (can_view_all_retiros() or (r.usuario_id = auth.uid() and r.created_at > (now() - interval '24 hours')))));
