import 'server-only';
import type { RetiroHistorial } from '@/features/retiros/tipos';
import { comoUsuario } from './db';

// El historial de retiros, igual que en la app de Vite: la base filtra (texto, fechas, persona) y lo da de a páginas, los más nuevos primero.
// La página siguiente sigue desde el último retiro (fecha + id), así una página vieja cuesta lo mismo que la primera.
export const RETIROS_POR_PAGINA = 50;

export interface FiltrosDeLaBase { texto: string; desde: string | null; hasta: string | null; usuario: string }
export interface Cursor { created_at: string; id: string }

interface LineaDeRetiro { id: string; item_id?: string | null; cantidad: number | string; observacion: string | null; codigo: string | null; descripcion: string | null }
const aRetiro = (r: { id: string; usuario_id: string; created_at: Date; observacion_general: string | null; sector: string | null; lineas: LineaDeRetiro[] | null }): RetiroHistorial => ({
  id: r.id, usuario_id: r.usuario_id, created_at: new Date(r.created_at).toISOString(), observacion_general: r.observacion_general,
  sectores: r.sector ? { nombre: r.sector } : null,
  retiro_items: (r.lineas ?? []).map(l => ({
    id: l.id, item_id: l.item_id ?? null, cantidad: Number(l.cantidad), observacion: l.observacion,
    items: l.codigo === null && l.descripcion === null ? null : { codigo: l.codigo ?? '', descripcion: l.descripcion ?? '' },
  })),
});

export function paginaDeRetiros(usuarioId: string, f: FiltrosDeLaBase, despuesDe: Cursor | null): Promise<RetiroHistorial[]> {
  return comoUsuario(usuarioId, async c => (await c.query(
    'select * from public.historial_de_retiros($1, $2, $3, $4, $5, $6, $7)',
    [f.texto.trim() || null, f.desde, f.hasta, f.usuario || null, despuesDe?.created_at ?? null, despuesDe?.id ?? null, RETIROS_POR_PAGINA],
  )).rows.map(aRetiro));
}

// Para exportar: los pendientes de exportar o los de un período, del más viejo al más nuevo, de a 500 por consulta (no miles de una vez).
const TANDA_DE_EXPORTACION = 500;

export function retirosParaExportar(usuarioId: string, filtro: { pendientes: true } | { desde: string; hasta: string }): Promise<RetiroHistorial[]> {
  return comoUsuario(usuarioId, async c => {
    const todos: RetiroHistorial[] = [];
    let cursor: Cursor | null = null;
    for (;;) {
      const condicion = 'pendientes' in filtro ? 'not r.exportado' : 'r.created_at between $1 and $2';
      const desdeCursor: string = cursor ? `and (r.created_at, r.id) > ($${'pendientes' in filtro ? 1 : 3}::timestamptz, $${'pendientes' in filtro ? 2 : 4}::uuid)` : '';
      const valores: string[] = [...('pendientes' in filtro ? [] : [filtro.desde, filtro.hasta]), ...(cursor ? [cursor.created_at, cursor.id] : [])];
      const { rows } = await c.query<Parameters<typeof aRetiro>[0]>(`
        select r.id, r.usuario_id, r.created_at, r.observacion_general, s.nombre as sector,
               (select coalesce(jsonb_agg(jsonb_build_object('id', ri.id, 'item_id', ri.item_id, 'cantidad', ri.cantidad, 'observacion', ri.observacion,
                                                             'codigo', i.codigo, 'descripcion', i.descripcion) order by ri.id), '[]')
                from public.retiro_items ri left join public.items i on i.id = ri.item_id where ri.retiro_id = r.id) as lineas
        from public.retiros r left join public.sectores s on s.id = r.sector_id
        where ${condicion} ${desdeCursor}
        order by r.created_at, r.id limit ${TANDA_DE_EXPORTACION}`, valores);
      const tanda: RetiroHistorial[] = rows.map(aRetiro);
      todos.push(...tanda);
      if (tanda.length < TANDA_DE_EXPORTACION) return todos;
      const ultimo: RetiroHistorial = tanda[tanda.length - 1];
      cursor = { created_at: ultimo.created_at, id: ultimo.id };
    }
  });
}
