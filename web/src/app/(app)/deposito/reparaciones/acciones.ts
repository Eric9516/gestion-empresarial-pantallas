'use server';
import { z } from 'zod';
import type { EditarReparacionInput, NuevaReparacionInput, RegistrarEntregaInput, ReparacionConDetalle } from '@/features/reparaciones/tipos';
import type { RotuloGenerado } from '@/features/rotulos/tipos';
import { comoUsuario } from '~/lib/db';
import { exigirUsuario } from '~/lib/sesion';
import { Cantidad, Celda, FechaONula, Id, IdONulo, Lista, SiNoONulo, TextoONulo, entrada } from '~/lib/entrada';
import { mensajeDe } from '~/lib/registroDeErrores';

// Reparaciones: las mismas funciones y reglas de la base que usa la app de Vite. Los registros se arman con to_jsonb, con la misma forma que
// devuelve Supabase (reparación → proveedor, envío, líneas → repuesto y entregas).

const esId = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f-]{36}$/i.test(v);
const esDia = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);

// Lo que reciben las acciones (lo revisa entrada(): ver ~/lib/entrada)
const Comunes = { proveedor_id: TextoONulo(60), motivo: TextoONulo(2000), fecha_salida: FechaONula, envio_id: TextoONulo(60) };
// cada línea: un repuesto del depósito (item_id) o algo que no está en el depósito (descripcion)
const NuevaReparacion = z.object({
  ...Comunes, items: Lista(z.object({ item_id: IdONulo, descripcion: TextoONulo(300), cantidad: Cantidad, descuenta_stock: SiNoONulo }), 1000),
});
const ReparacionEditada = z.object({ ...Comunes, id: Id, orden_compra_numero: TextoONulo(100), orden_compra_fecha: FechaONula });
const Entrega = z.object({
  reparacion_item_id: Id, cantidad_devuelta: Cantidad, resultado: TextoONulo(20), remito_punto_venta: Celda, remito_numero: Celda,
  remito_fecha: FechaONula, fecha_entrega: FechaONula, repone_stock: SiNoONulo,
});
async function hacer(sql: string, valores: unknown[], porDefecto: string): Promise<{ error: string | null }> {
  const usuario = await exigirUsuario();
  try {
    await comoUsuario(usuario, c => c.query(sql, valores));
    return { error: null };
  } catch (e) {
    return { error: mensajeDe(e, porDefecto) };
  }
}

export interface DatosDeReparaciones {
  reparaciones: ReparacionConDetalle[];
  proveedores: { id: string; nombre: string }[];
  envios: RotuloGenerado[];
  /** [grupo del envío, reparación activa que lo usa] */
  enviosAsignados: [string, string][];
  /** [envío, detalle de sus bultos] */
  detallesDeEnvios: [string, string[]][];
}

/** Todo lo que necesita la pantalla, en una sola ida a la base. */
export async function datosDeReparaciones(): Promise<DatosDeReparaciones> {
  const usuario = await entrada('datosDeReparaciones');
  return comoUsuario(usuario, async c => {
    const reparaciones = (await c.query<{ r: ReparacionConDetalle }>(`
      select to_jsonb(r) || jsonb_build_object(
        'proveedores', (select jsonb_build_object('id', p.id, 'nombre', p.nombre) from public.proveedores p where p.id = r.proveedor_id),
        'rotulos_generados', (select jsonb_build_object('numero_documento', g.numero_documento) from public.rotulos_generados g where g.id = r.envio_id),
        'reparacion_items', (select coalesce(jsonb_agg(to_jsonb(ri) || jsonb_build_object(
            'items', (select jsonb_build_object('id', i.id, 'codigo', i.codigo, 'descripcion', i.descripcion) from public.items i where i.id = ri.item_id),
            'reparacion_entregas', (select coalesce(jsonb_agg(to_jsonb(e) order by e.created_at), '[]') from public.reparacion_entregas e where e.reparacion_item_id = ri.id)
          )), '[]') from public.reparacion_items ri where ri.reparacion_id = r.id)
      ) as r
      from public.reparaciones r where r.activo order by r.created_at desc`)).rows.map(x => x.r);
    const proveedores = (await c.query<{ id: string; nombre: string }>('select id, nombre from public.proveedores where not eliminado order by nombre')).rows;
    const envios = (await c.query<{ r: RotuloGenerado }>(
      // sin el diseño de cada uno (con el logo adentro, ~8 KB por envío): la lista no lo usa y el PDF lo lee al pedirlo
      "select to_jsonb(g) - 'design_snapshot' as r from public.rotulos_generados g where g.vigente and not g.eliminado order by g.created_at desc limit 300")).rows.map(x => x.r);
    const asignados = (await c.query<{ grupo_id: string; id: string }>(`
      select g.grupo_id, r.id from public.reparaciones r join public.rotulos_generados g on g.id = r.envio_id where r.activo`)).rows;
    const bultos = envios.length ? (await c.query<{ rotulo_id: string; detalle: string }>(
      'select rotulo_id, detalle from public.rotulos_bultos where rotulo_id = any($1::uuid[]) and detalle is not null and detalle <> \'\' order by numero',
      [envios.map(e => e.id)])).rows : [];
    const detalles = new Map<string, string[]>();
    for (const b of bultos) detalles.set(b.rotulo_id, [...(detalles.get(b.rotulo_id) ?? []), b.detalle]);
    return { reparaciones, proveedores, envios, enviosAsignados: asignados.map(a => [a.grupo_id, a.id]), detallesDeEnvios: [...detalles] };
  });
}

export async function crearReparacion(r: NuevaReparacionInput) {
  await entrada('crearReparacion', [NuevaReparacion], [r]);
  if (!esId(r.proveedor_id) || !String(r.motivo ?? '').trim() || !esDia(r.fecha_salida) || (r.envio_id && !esId(r.envio_id))) return { error: 'Faltan datos de la reparación' };
  const items = (r.items ?? []).slice(0, 200).map(i => i.item_id
    ? { item_id: i.item_id, descripcion: null, cantidad: Number(i.cantidad), descuenta_stock: !!i.descuenta_stock }
    : { item_id: null, descripcion: String(i.descripcion ?? '').trim().slice(0, 300), cantidad: Number(i.cantidad), descuenta_stock: false });
  if (!items.length || items.some(i => (i.item_id ? !esId(i.item_id) : !i.descripcion) || !(i.cantidad > 0))) return { error: 'Hay un artículo que no es válido' };
  // siempre en el mismo orden (por repuesto): dos reparaciones a la vez con los mismos repuestos no se traban entre sí
  items.sort((a, b) => (a.item_id ?? '').localeCompare(b.item_id ?? ''));
  return hacer('select public.crear_reparacion($1, $2, $3, $4, $5::jsonb)',
    [r.proveedor_id, r.motivo.trim().slice(0, 500), r.fecha_salida, r.envio_id || null, JSON.stringify(items)], 'No se pudo guardar la reparación');
}

export async function editarReparacion(r: EditarReparacionInput) {
  await entrada('editarReparacion', [ReparacionEditada], [r]);
  if (!esId(r.id) || !esId(r.proveedor_id) || !String(r.motivo ?? '').trim() || !esDia(r.fecha_salida) || (r.envio_id && !esId(r.envio_id))
    || (r.orden_compra_fecha && !esDia(r.orden_compra_fecha))) return { error: 'Faltan datos de la reparación' };
  return hacer(`update public.reparaciones set proveedor_id = $2, motivo = $3, fecha_salida = $4, envio_id = $5, orden_compra_numero = $6, orden_compra_fecha = $7
                where id = $1`,
  [r.id, r.proveedor_id, r.motivo.trim().slice(0, 500), r.fecha_salida, r.envio_id || null, String(r.orden_compra_numero ?? '').trim().slice(0, 60) || null,
    r.orden_compra_fecha || null], 'No se pudo guardar');
}

/** Lo que volvió de una línea. Quién lo registra es quien tiene la sesión (lo pone la base, no el navegador). */
export async function registrarEntrega(e: Omit<RegistrarEntregaInput, 'registrado_por'>) {
  await entrada('registrarEntrega', [Entrega], [e]);
  if (!esId(e.reparacion_item_id) || !(Number(e.cantidad_devuelta) > 0) || !['reparado', 'baja'].includes(e.resultado) || !esDia(e.fecha_entrega)
    || (e.remito_fecha && !esDia(e.remito_fecha))) return { error: 'Faltan datos de la entrega' };
  return hacer(`insert into public.reparacion_entregas (reparacion_item_id, cantidad_devuelta, resultado, remito_punto_venta, remito_numero, remito_fecha,
                                                        fecha_entrega, registrado_por, repone_stock)
                values ($1, $2, $3, $4, $5, $6, $7, auth.uid(), $8)`,
  [e.reparacion_item_id, Number(e.cantidad_devuelta), e.resultado, String(e.remito_punto_venta ?? '').trim().slice(0, 10) || null,
    String(e.remito_numero ?? '').trim().slice(0, 20) || null, e.remito_fecha || null, e.fecha_entrega, !!e.repone_stock], 'No se pudo registrar la entrega');
}

export async function eliminarReparacion(id: string) {
  await entrada('eliminarReparacion', [Id], [id]);
  if (!esId(id)) return { error: 'Reparación no válida' };
  return hacer('select public.eliminar_reparacion($1)', [id], 'No se pudo eliminar');
}

/** El envío vigente del mismo grupo (si el que tiene la reparación se rehízo, se muestra la versión de ahora). */
export async function envioVigente(id: string): Promise<string> {
  const usuario = await entrada('envioVigente', [Id], [id]);
  if (!esId(id)) return id;
  return comoUsuario(usuario, async c => (await c.query<{ id: string }>(`
    select coalesce((select v.id from public.rotulos_generados v where v.grupo_id = g.grupo_id and v.vigente limit 1), g.id) as id
    from public.rotulos_generados g where g.id = $1`, [id])).rows[0]?.id ?? id);
}
