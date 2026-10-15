import type { RotuloGenerado } from './useRotulos';

type EnvioParaEtiqueta = Pick<RotuloGenerado, 'tipo_documento' | 'numero_documento' | 'extra' | 'comentario' | 'created_at'>;

const LARGO_MAXIMO = 70;

function recortar(texto: string, max = LARGO_MAXIMO): string {
  return texto.length > max ? texto.slice(0, max - 1).trimEnd() + '…' : texto;
}

// Qué lleva el envío, para reconocerlo de un vistazo: lo que se anotó en cada bulto (sin repetir) o, si los
// bultos no tienen detalle, la nota del rótulo o el comentario.
export function descripcionDeEnvio(envio: Pick<RotuloGenerado, 'extra' | 'comentario'>, detallesDeBultos: string[] = []): string {
  const detalles = [...new Set(detallesDeBultos.map(d => d.trim()).filter(Boolean))];
  const base = detalles.length ? detalles.join(' · ') : (envio.extra?.trim() || envio.comentario?.trim() || '');
  return recortar(base);
}

// "Remito 0001-00123 — 12/10/2026 — Motor trifásico 5 HP": número, fecha y descripción.
export function etiquetaDeEnvio(envio: EnvioParaEtiqueta, detallesDeBultos: string[] = []): string {
  const numero = envio.numero_documento?.trim() || '(sin número)';
  const tipo = envio.tipo_documento?.trim();
  const fecha = new Date(envio.created_at).toLocaleDateString('es-AR');
  return [tipo ? `${tipo} ${numero}` : numero, fecha, descripcionDeEnvio(envio, detallesDeBultos)].filter(Boolean).join(' — ');
}

// Saca los envíos (notas de despacho) que ya tiene asignados otra reparación. `asignados` dice, por cada envío (todas sus versiones comparten el
// mismo grupo), qué reparación lo tiene. La reparación que se está editando conserva el suyo.
export function enviosLibres<T extends { grupo_id: string }>(envios: T[], asignados: Map<string, string> | undefined, reparacionActualId?: string): T[] {
  if (!asignados) return envios;
  return envios.filter(e => {
    const reparacion = asignados.get(e.grupo_id);
    return !reparacion || reparacion === reparacionActualId;
  });
}

// Solo los envíos del proveedor elegido. Si la reparación ya tenía un envío de otro proveedor, se conserva en la lista
// para que no quede la casilla en blanco sin que nadie lo haya decidido.
export function enviosDelProveedor<T extends { id: string; proveedor_id: string }>(envios: T[] | undefined, proveedorId: string, envioActualId?: string | null): T[] {
  if (!proveedorId) return [];
  return (envios ?? []).filter(e => e.proveedor_id === proveedorId || e.id === envioActualId);
}
