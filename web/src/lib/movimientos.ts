import 'server-only';
import type { Ajuste } from '@/features/ajustes/tipos';
import type { ClaseMovimiento, TipoAjuste } from '@/lib/ajustes';
import { nombreUsuario, type UsuarioBasico } from '@/lib/nombreUsuario';
import { comoUsuario } from './db';
import type { Cursor } from './retiros';

// Los movimientos de stock (cargas y ajustes) con sus líneas, igual que en la app de Vite: la base filtra (texto, tipo, fechas) y los da de a páginas.
// Solo los puede leer quien puede ajustar el inventario (la base lo impone).
export const MOVIMIENTOS_POR_PAGINA = 50;

export interface FiltrosDeMovimientosEnLaBase { texto: string; filtro: string; desde: string | null; hasta: string | null }

interface LineaDeLaBase { id: string; tipo: TipoAjuste; cantidad: number | string; stock_antes: number | string | null; stock_despues: number | string | null; codigo: string | null; descripcion: string | null; unidad: string | null }
interface FilaDeLaBase {
  id: string; created_at: Date; usuario_id: string; clase: ClaseMovimiento; fecha: string; punto_venta: number; numero: number | string;
  referencia: string | null; observaciones: string | null; motivo: string; anulado: boolean; anulado_por: string | null; anulado_at: Date | null;
  motivo_anulacion: string | null; lineas: LineaDeLaBase[] | null;
}

const numeroONulo = (v: number | string | null) => (v === null ? null : Number(v));

export function paginaDeMovimientos(usuarioId: string, f: FiltrosDeMovimientosEnLaBase, despuesDe: Cursor | null): Promise<Ajuste[]> {
  return comoUsuario(usuarioId, async c => {
    const { rows } = await c.query<FilaDeLaBase>('select * from public.lista_de_movimientos($1, $2, $3, $4, $5, $6, $7)',
      [f.texto.trim() || null, f.filtro || 'todos', f.desde, f.hasta, despuesDe?.created_at ?? null, despuesDe?.id ?? null, MOVIMIENTOS_POR_PAGINA]);
    const ids = [...new Set(rows.flatMap(a => [a.usuario_id, a.anulado_por].filter((x): x is string => !!x)))];
    const quienes = ids.length
      ? (await c.query<UsuarioBasico>('select id, nombre, apellido, email from public.usuarios_perfil where id = any($1::uuid[])', [ids])).rows
      : [];
    const porId = Object.fromEntries(quienes.map(u => [u.id, u]));
    return rows.map(a => ({
      id: a.id, created_at: new Date(a.created_at).toISOString(), usuario_id: a.usuario_id, clase: a.clase, fecha: a.fecha,
      punto_venta: a.punto_venta, numero: Number(a.numero), referencia: a.referencia, observaciones: a.observaciones, motivo: a.motivo,
      anulado: a.anulado, anulado_por: a.anulado_por, anulado_at: a.anulado_at ? new Date(a.anulado_at).toISOString() : null, motivo_anulacion: a.motivo_anulacion,
      ajuste_items: (a.lineas ?? []).map(l => ({
        id: l.id, tipo: l.tipo, cantidad: Number(l.cantidad), stock_antes: numeroONulo(l.stock_antes), stock_despues: numeroONulo(l.stock_despues),
        items: l.codigo === null && l.descripcion === null ? null : { codigo: l.codigo ?? '', descripcion: l.descripcion ?? '', unidad: l.unidad ?? 'Uni' },
      })),
      usuarioNombre: nombreUsuario(porId[a.usuario_id], a.usuario_id),
      anuladoPorNombre: a.anulado_por ? nombreUsuario(porId[a.anulado_por], a.anulado_por) : null,
    }));
  });
}
