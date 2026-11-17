-- Los depósitos nacen con el azul de la app (pedido del encargado, 05/11/2026). El marrón era el "original" de antes: si quedó guardado
-- como color elegido, se borra (sin color = el azul de la app, o el de la empresa si eligió uno).
update public.depositos set color = null where lower(color) = '#9a5b12';
