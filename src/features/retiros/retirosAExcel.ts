import { nombreUsuario, type UsuarioBasico } from '../../lib/nombreUsuario';
import type { FilaExcel } from '../../lib/exportExcel';
import type { RetiroHistorial } from './tipos';

// Una fila de Excel por línea de retiro (lo usan las dos apps al exportar).
export function retirosAFilas(retiros: RetiroHistorial[], usuarios: Record<string, UsuarioBasico>): FilaExcel[] {
  const filas: FilaExcel[] = [];
  for (const r of retiros) {
    const usuarioNombre = nombreUsuario(usuarios[r.usuario_id], r.usuario_id);
    for (const ri of r.retiro_items) {
      filas.push({
        Fecha: new Date(r.created_at).toLocaleString('es-AR'),
        Usuario: usuarioNombre,
        Sector: r.sectores?.nombre || '',
        Código: ri.items?.codigo || '',
        Descripción: ri.items?.descripcion || '',
        Cantidad: ri.cantidad,
        Observación: ri.observacion || '',
        'Observación general': r.observacion_general || '',
      });
    }
  }
  return filas;
}
