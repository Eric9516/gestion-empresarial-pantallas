import 'server-only';
import type { Familia, Subfamilia } from '@/features/familias/tipos';
import type { MovimientoFila } from '@/features/items/tipos';
import type { FiltrosDeReposicion, InformeDeReposicion, Item, RepuestoAReponer, RepuestoDeLista } from '@/features/items/tipos';
import { comoUsuario } from './db';

// El catálogo se busca en la base (función buscar_repuestos, la misma que usa la app de Vite) y nunca se trae entero.
// La base no devuelve más de 500 por búsqueda: con más resultados, se afina (texto, familia o subfamilia).
export const LIMITE_DE_BUSQUEDA = 500;
export const TANDA = 100;

export interface Busqueda { texto: string; familiaId: string; subfamiliaId: string; cantidad: number }

export const hayBusqueda = (b: Busqueda) => b.texto.trim() !== '' || !!b.familiaId || !!b.subfamiliaId;

// los números llegan de la base como texto (numeric): se pasan a número una sola vez, acá
type Fila = Omit<RepuestoDeLista, 'stock' | 'stock_minimo' | 'punto_pedido'> & { stock: string | null; stock_minimo: string; punto_pedido: string };
const aNumeros = (r: Fila): RepuestoDeLista => ({ ...r, stock: r.stock === null ? null : Number(r.stock), stock_minimo: Number(r.stock_minimo), punto_pedido: Number(r.punto_pedido) });

/** Lo que hace falta para la pantalla de búsqueda, en una sola ida a la base: los resultados, las familias y si hay algún repuesto cargado. */
export function datosDeBusqueda(usuarioId: string, b: Busqueda) {
  return comoUsuario(usuarioId, async c => {
    const resultados = hayBusqueda(b)
      ? await c.query<Fila>('select * from public.buscar_repuestos($1, $2, $3, $4)',
          [b.texto.trim(), Math.min(b.cantidad, LIMITE_DE_BUSQUEDA), b.familiaId || null, b.subfamiliaId || null])
      : { rows: [] as Fila[] };
    const familias = await c.query<Familia>('select * from public.familias order by nombre');
    const subfamilias = await c.query<Subfamilia>('select * from public.subfamilias order by nombre');
    const hay = await c.query('select 1 from public.items where activo limit 1');
    return { resultados: resultados.rows.map(aNumeros), familias: familias.rows, subfamilias: subfamilias.rows, hayRepuestos: (hay.rowCount ?? 0) > 0 };
  });
}

// ---------------------------------------------------------------------------------------------------------------------------------------------
// El detalle de un repuesto (lo mismo que trae la app de Vite al abrirlo) y lo que tiene afuera en reparación.
// ---------------------------------------------------------------------------------------------------------------------------------------------

const COLUMNAS_DEL_DETALLE = `i.id, i.codigo, i.numero, i.descripcion, i.detalles, i.palabras_clave, i.ubicacion, i.unidad, i.stock, i.stock_minimo, i.punto_pedido,
  i.activo, i.familia_id, i.subfamilia_id, i.foto_url, i.foto_url_2, i.foto_url_3, i.foto_pendiente, i.foto_pendiente_2, i.foto_pendiente_3, i.estado_reposicion`;

export interface RepuestoDetalle extends Omit<Item, 'stock' | 'stock_minimo' | 'punto_pedido'> { stock: number | null; stock_minimo: number; punto_pedido: number }
export interface EnReparacion { id: string; proveedor: string | null; motivo: string; pendiente: number }

export async function repuestoCompleto(usuarioId: string, id: string): Promise<{ repuesto: RepuestoDetalle; enReparacion: EnReparacion[] } | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const repuesto = await comoUsuario(usuarioId, async c => {
    const { rows: [r] } = await c.query(`
      select ${COLUMNAS_DEL_DETALLE},
             case when f.id is null then null else json_build_object('id', f.id, 'codigo', f.codigo, 'nombre', f.nombre) end as familias,
             case when s.id is null then null else json_build_object('id', s.id, 'codigo', s.codigo, 'nombre', s.nombre) end as subfamilias
      from public.items i left join public.familias f on f.id = i.familia_id left join public.subfamilias s on s.id = i.subfamilia_id
      where i.id = $1`, [id]);
    return r ? { ...r, stock: r.stock === null ? null : Number(r.stock), stock_minimo: Number(r.stock_minimo), punto_pedido: Number(r.punto_pedido) } as RepuestoDetalle : null;
  });
  if (!repuesto) return null;
  // Lo que está afuera en reparación: aparte, porque quien no puede ver reparaciones recibe un "no" de la base y el detalle se muestra igual.
  const enReparacion = await comoUsuario(usuarioId, async c => (await c.query<EnReparacion>(`
      select r.id, p.nombre as proveedor, r.motivo,
             (ri.cantidad - coalesce((select sum(e.cantidad_devuelta) from public.reparacion_entregas e where e.reparacion_item_id = ri.id), 0))::float8 as pendiente
      from public.reparacion_items ri join public.reparaciones r on r.id = ri.reparacion_id left join public.proveedores p on p.id = r.proveedor_id
      where ri.item_id = $1 and r.activo order by r.created_at desc`, [id])).rows.filter(l => l.pendiente > 0)).catch(() => []);
  return { repuesto, enReparacion };
}

// La ficha de stock: de a tandas, las más nuevas primero; la siguiente tanda sigue desde el último movimiento.
export const TANDA_DE_MOVIMIENTOS = 50;

export function fichaDeStock(usuarioId: string, itemId: string, antes: number | null): Promise<MovimientoFila[]> {
  return comoUsuario(usuarioId, async c => {
    const { rows } = await c.query(`
      select m.*, coalesce(nullif(trim(concat_ws(' ', u.nombre, u.apellido)), ''), u.email) as usuario_nombre
      from public.ficha_de_stock($1, $2, $3) m left join public.usuarios_perfil u on u.id = m.usuario_id order by m.id desc`, [itemId, antes, TANDA_DE_MOVIMIENTOS]);
    return rows.map(f => ({
      id: Number(f.id), created_at: new Date(f.created_at).toISOString(), tipo: f.tipo, detalle: f.detalle,
      entrada: Number(f.entrada), salida: Number(f.salida), existencia: f.existencia === null ? null : Number(f.existencia),
      comprobante: f.comprobante, referencia: f.referencia, sector: f.sector, motivo: f.motivo,
      usuarioNombre: f.usuario_id ? (f.usuario_nombre ?? f.usuario_id) : '—',
    }));
  });
}

/** Los primeros repuestos que coinciden con un texto (para los selectores: "buscá un repuesto y agregalo"). */
export function buscarRepuestosEnLaBase(usuarioId: string, texto: string, limite: number): Promise<RepuestoDeLista[]> {
  if (!texto.trim()) return Promise.resolve([]);
  return comoUsuario(usuarioId, async c =>
    (await c.query<Fila>('select * from public.buscar_repuestos($1, $2, null, null)', [texto.trim(), limite])).rows.map(aNumeros));
}

// ---------------------------------------------------------------------------------------------------------------------------------------------
// El informe de reposición: lo que hay que comprar, filtrado y ordenado por urgencia en la base (función repuestos_a_reponer), con el total.
// ---------------------------------------------------------------------------------------------------------------------------------------------

export async function informeDeReposicion(usuarioId: string, f: FiltrosDeReposicion): Promise<InformeDeReposicion> {
  const { rows } = await comoUsuario(usuarioId, c => c.query<RepuestoAReponer & { total: string | number; total_sin_stock: string | number }>(
    'select * from public.repuestos_a_reponer($1, $2, $3, $4)',
    [(f.texto ?? '').trim() || null, f.familiaId || null, f.estado || null, Math.min(Math.max(f.limite ?? 500, 1), 5000)]));
  const filas = rows.map(({ total: _t, total_sin_stock: _s, ...r }) => ({
    ...r, stock: r.stock === null ? null : Number(r.stock), stock_minimo: Number(r.stock_minimo), punto_pedido: Number(r.punto_pedido),
  }));
  return { filas, total: Number(rows[0]?.total ?? 0), totalSinStock: Number(rows[0]?.total_sin_stock ?? 0) };
}
