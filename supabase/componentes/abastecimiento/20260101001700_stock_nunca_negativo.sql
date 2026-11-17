-- El stock de un repuesto no puede quedar negativo, nunca, por ningún camino (retiro, reparación, edición, importación).
--
-- Antes solo los ajustes de inventario lo impedían: un retiro de más unidades de las que había dejaba el stock en negativo, y con dos retiros a la vez sobre el mismo repuesto la pantalla no
-- podía evitarlo (cada uno veía "hay 3" y retiraba 3). Ahora lo hace cumplir la propia tabla de repuestos, en la base, de forma atómica: todos los movimientos de stock son una sola operación
-- (`stock = stock ± cantidad`) y la base la verifica con el valor actual, así que dos retiros simultáneos no pueden dejar el stock por debajo de cero: el segundo falla.
--
-- Un repuesto con el stock sin cargar (vacío) se trata como 0 al sacar: primero hay que cargar el stock (por ejemplo con un ajuste).
--
-- El mensaje dice qué repuesto, cuánto hay y cuánto se necesitaba. Como un retiro o una reparación es "todo o nada", si falla una línea no se registra ninguna.

create or replace function public.items_trg_stock_no_negativo()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.stock is not null and new.stock < 0 and new.stock is distinct from old.stock then
    raise exception 'No hay stock suficiente de %: hay % y se necesitan %.', new.codigo, coalesce(old.stock, 0), coalesce(old.stock, 0) - new.stock
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_items_stock_no_negativo on public.items;
create trigger trg_items_stock_no_negativo
  before update of stock on public.items
  for each row execute function public.items_trg_stock_no_negativo();

-- Red de seguridad: aunque algo escribiera el stock por otro camino, la tabla lo rechaza. Se agrega sin revisar lo que ya había (si una base antigua tuviera algún negativo,
-- no se rompe la actualización: solo se rechazan los cambios nuevos) y se intenta validar todo lo existente.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'items_stock_no_negativo' and conrelid = 'public.items'::regclass) then
    alter table public.items add constraint items_stock_no_negativo check (stock is null or stock >= 0) not valid;
  end if;
  begin
    alter table public.items validate constraint items_stock_no_negativo;
  exception when check_violation then
    raise notice 'Hay repuestos con stock negativo de antes: la regla vale para todo cambio nuevo; corregí esos repuestos con un ajuste y volvé a validarla.';
  end;
end;
$$;
