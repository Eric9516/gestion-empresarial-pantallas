-- Seguridad, fase 1 (parte de Mantenimiento). Sale de la auditoría del 2026-10-17 (ver docs/AUDITORIA-BASE-DE-DATOS.md).
-- Las reglas de la carpeta de documentos se calculaban una vez por archivo; ahora una sola vez por consulta. La de escribir queda solo para
-- usuarios con sesión (antes estaba para "public", que incluye a quien no inició sesión; igual la función devolvía falso).
-- Y sin permisos TRUNCATE / REFERENCES / TRIGGER sobre las tablas de este componente.

alter policy documentos_write on storage.objects to authenticated
  using (bucket_id = 'documentos' and (select public.is_mantenimiento_admin()))
  with check (bucket_id = 'documentos' and (select public.is_mantenimiento_admin()));
alter policy bloqueo_modulo_documentos on storage.objects
  using (bucket_id <> 'documentos' or ((select public.modulo_activo('mantenimiento')) and (select public.modulo_activo('deposito'))))
  with check (bucket_id <> 'documentos' or ((select public.modulo_activo('mantenimiento')) and (select public.modulo_activo('deposito'))));

select public._quitar_permisos_sobrantes();
