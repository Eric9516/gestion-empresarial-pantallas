// El historial de actividad (Configuración → Historial): etiquetas, filtros y cómo se agrupan las filas para leerlas.
import type { Database } from '../../lib/database.types';
import { finDelDiaISO, inicioDelDiaISO } from '../../lib/fechaHoy';

export type FilaActividad = Database['public']['Functions']['historial_de_actividad']['Returns'][number];

export type Accion = 'alta' | 'carga' | 'salida' | 'modificacion' | 'eliminacion';
export const ACCIONES: { id: Accion; nombre: string }[] = [
  { id: 'alta', nombre: 'Alta' },
  { id: 'carga', nombre: 'Carga de stock' },
  { id: 'salida', nombre: 'Retiro o salida' },
  { id: 'modificacion', nombre: 'Modificación' },
  { id: 'eliminacion', nombre: 'Eliminación' },
];
export const NOMBRE_ACCION: Record<string, string> = Object.fromEntries(ACCIONES.map(a => [a.id, a.nombre]));

export type Sobre = 'repuesto' | 'reparacion' | 'proveedor' | 'comisionista' | 'contacto' | 'usuario' | 'configuracion';
/** Sobre qué fue cada cambio. Los repuestos y las reparaciones son de un depósito; lo demás no. Usuarios y configuración los ve solo el dueño. */
export const SOBRE: { id: Sobre; nombre: string; deUnDeposito?: boolean; soloDueno?: boolean }[] = [
  { id: 'repuesto', nombre: 'Artículos y stock', deUnDeposito: true },
  { id: 'reparacion', nombre: 'Reparaciones', deUnDeposito: true },
  { id: 'proveedor', nombre: 'Proveedores' },
  { id: 'comisionista', nombre: 'Comisionistas' },
  { id: 'contacto', nombre: 'Contactos' },
  { id: 'usuario', nombre: 'Usuarios y permisos', soloDueno: true },
  { id: 'configuracion', nombre: 'Configuración', soloDueno: true },
];
const NOMBRE_SOBRE_SINGULAR: Record<string, string> = {
  repuesto: 'Artículo', reparacion: 'Reparación', proveedor: 'Proveedor', comisionista: 'Comisionista', contacto: 'Contacto', usuario: 'Usuario', configuracion: 'Configuración',
};

/** En pantalla: de a 50, y "Ver más" hasta 150. Para lo más viejo se sugiere filtrar. */
export const POR_PAGINA_HISTORIAL = 50;
export const MAXIMO_EN_PANTALLA = 150;
/** Más que esto en una descarga: se avisa y se sugiere filtrar (se puede descargar igual). */
export const AVISO_DESCARGA = 1000;

export interface FiltrosHistorial {
  usuario: string;
  deposito: string;
  sobre: string;
  acciones: Accion[];
  desde: string; // yyyy-mm-dd
  hasta: string;
  texto: string;
}
export const SIN_FILTROS: FiltrosHistorial = { usuario: '', deposito: '', sobre: '', acciones: [], desde: '', hasta: '', texto: '' };

/** Lo que se puede elegir en "Sobre qué": con un depósito elegido, solo lo que pertenece a un depósito. */
export function opcionesDeSobre(deposito: string, dueno: boolean) {
  return SOBRE.filter(s => (dueno || !s.soloDueno) && (!deposito || s.deUnDeposito));
}

export function hayFiltros(f: FiltrosHistorial): boolean {
  return !!(f.usuario || f.deposito || f.sobre || f.acciones.length || f.desde || f.hasta || f.texto.trim());
}

export interface GrupoActividad {
  clave: string;
  sobre: string;
  /** "Motorreductor FAF67" o el nombre del proveedor… */
  titulo: string;
  codigo: string | null;
  deposito: string | null;
  filas: FilaActividad[];
}

/** El título de un grupo: la descripción con su código, o el nombre. */
export function tituloDeGrupo(g: Pick<GrupoActividad, 'sobre' | 'titulo' | 'codigo'>): string {
  const nombre = g.titulo || NOMBRE_SOBRE_SINGULAR[g.sobre] || '';
  return g.codigo ? `${nombre} (${g.codigo})` : nombre;
}

export function etiquetaSobre(sobre: string): string {
  return NOMBRE_SOBRE_SINGULAR[sobre] ?? sobre;
}

/**
 * Junta las filas de cada repuesto (o proveedor, usuario…) debajo de su nombre. Los grupos quedan en el orden de su cambio más nuevo
 * y, dentro de cada uno, los cambios siguen de más nuevo a más viejo (como vienen de la base).
 */
export function agruparActividad(filas: FilaActividad[]): GrupoActividad[] {
  const grupos = new Map<string, GrupoActividad>();
  for (const f of filas) {
    const clave = `${f.sobre}:${f.registro_id ?? f.titulo}`;
    let g = grupos.get(clave);
    if (!g) {
      g = { clave, sobre: f.sobre, titulo: f.titulo, codigo: f.codigo, deposito: f.deposito, filas: [] };
      grupos.set(clave, g);
    }
    g.filas.push(f);
  }
  return [...grupos.values()];
}

/** "26/10/26 09:13" (hora de 24) */
export function fechaYHora(iso: string): string {
  const d = new Date(iso);
  const dos = (n: number) => String(n).padStart(2, '0');
  return `${dos(d.getDate())}/${dos(d.getMonth() + 1)}/${dos(d.getFullYear() % 100)} ${dos(d.getHours())}:${dos(d.getMinutes())}`;
}

// Los filtros como los pide la base (vacío = sin filtro).
export function argumentosDelHistorial(f: FiltrosHistorial) {
  return {
    p_usuario: f.usuario || undefined,
    p_deposito: f.deposito || undefined,
    p_sobre: f.sobre ? [f.sobre] : undefined,
    p_acciones: f.acciones.length ? f.acciones : undefined,
    p_desde: f.desde ? inicioDelDiaISO(f.desde) : undefined,
    p_hasta: f.hasta ? finDelDiaISO(f.hasta) : undefined,
    p_texto: f.texto.trim() || undefined,
  };
}

export type ArgumentosDelHistorial = ReturnType<typeof argumentosDelHistorial>;
