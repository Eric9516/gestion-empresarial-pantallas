import { horarioDe, llegaEn } from './flujo';
import { numeroOT } from './preventivo';

// Los avisos al celular de Mantenimiento (pedido del dueño, 12/11/2026): qué dice cada uno y cuándo se manda. La base anota qué hay que
// avisar (supabase/componentes/mantenimiento/…_avisos_al_celular.sql); el servidor de la app los manda cada minuto con esto.

export const TIPOS_DE_AVISO = ['asignada', 'devuelta', 'para_asignar', 'para_revisar', 'para_derivar', 'para_aprobar'] as const;
export type TipoDeAviso = (typeof TIPOS_DE_AVISO)[number];

/** Para la pantalla de Configuración: qué es cada aviso y a qué rol le llega. */
export const AVISOS: Record<TipoDeAviso, { nombre: string; para: ('responsable' | 'jefe' | 'tecnico')[] }> = {
  asignada: { nombre: 'Le asignan una OT', para: ['responsable', 'jefe', 'tecnico'] },
  devuelta: { nombre: 'Le devuelven una OT', para: ['responsable', 'jefe', 'tecnico'] },
  para_asignar: { nombre: 'OT para asignar', para: ['responsable', 'jefe'] },
  para_revisar: { nombre: 'OT terminada, para revisar', para: ['responsable', 'jefe'] },
  para_derivar: { nombre: 'Resumen de la mañana: preventivas para derivar', para: ['responsable'] },
  para_aprobar: { nombre: 'OT revisada, para aprobar', para: ['responsable'] },
};

export interface Celular { endpoint: string; p256dh: string; auth: string }

/** Una fila de servidor.avisos_para_mandar() (web/db/05-avisos.sql). */
export interface AvisoPendiente {
  id: string;
  empresa_id: string;
  usuario_id: string;
  tipo: TipoDeAviso | 'prueba';
  ot_id: string | null;
  cantidad: number;
  vigente: boolean;
  numero: number | string | null;
  equipo: string | null;
  detalle: string | null;
  urgente: boolean;
  comentario: string | null;
  quien: string | null;
  terminada_en: string | null;
  momento: string;
  horario: unknown;
  celulares: Celular[];
}

/** Lo que se le manda a un celular (lo muestra public/sw.js). */
/** `icono`: el grande (el logo de la empresa); `insignia`: el chiquito de la barra de arriba de Android (la inicial). */
export interface Mensaje { titulo: string; cuerpo: string; url: string; etiqueta: string; icono?: string; insignia?: string }

export interface Envio { usuario: string; celulares: Celular[]; mensaje: Mensaje; ids: string[] }

const corto = (s: string | null | undefined, n = 120) => {
  const t = (s ?? '').replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};
const juntar = (...partes: (string | null | undefined)[]) => partes.map(p => corto(p)).filter(Boolean).join(' · ');
const URL_OT = (id: string | null) => (id ? `/mantenimiento/ordenes?ot=${id}` : '/mantenimiento/ordenes');

/** El texto de un aviso solo. */
export function mensajeDe(a: AvisoPendiente): Mensaje {
  const ot = a.numero != null ? numeroOT(Number(a.numero)) : 'una OT';
  const url = URL_OT(a.ot_id);
  const etiqueta = `${a.tipo}-${a.ot_id ?? a.id}`;
  switch (a.tipo) {
    case 'asignada':
      return { titulo: `${a.urgente ? 'URGENTE · ' : ''}Te asignaron la ${ot}`, cuerpo: juntar(a.equipo, a.detalle), url, etiqueta };
    case 'devuelta':
      return { titulo: `Te devolvieron la ${ot}`, cuerpo: juntar(a.comentario || 'Fijate qué hay que corregir.', a.equipo), url, etiqueta };
    case 'para_asignar':
      return { titulo: `${a.urgente ? 'URGENTE · ' : ''}${ot} para asignar`, cuerpo: juntar(a.equipo, a.detalle), url, etiqueta };
    case 'para_revisar':
      return { titulo: `${ot} terminada, para revisar`, cuerpo: juntar(a.equipo, a.quien ? `La terminó ${a.quien}` : null), url, etiqueta };
    case 'para_aprobar':
      return { titulo: `${ot} lista para aprobar`, cuerpo: juntar(a.equipo, a.quien ? `La revisó ${a.quien}` : null), url, etiqueta };
    case 'para_derivar':
      return {
        titulo: a.cantidad === 1 ? 'Tenés 1 preventiva para derivar' : `Tenés ${a.cantidad} preventivas para derivar`,
        cuerpo: 'Vencidas o por vencer. Derivalas al jefe de taller.', url: '/mantenimiento/ordenes', etiqueta: 'para_derivar',
      };
    default:
      return { titulo: 'Aviso de prueba', cuerpo: 'Si ves esto, los avisos de Mantenimiento llegan bien a este celular.', url: '/mantenimiento/inicio', etiqueta: `prueba-${a.id}` };
  }
}

/** Varios del mismo tipo para la misma persona, en un solo aviso (no llenar el teléfono). */
function mensajeJunto(tipo: AvisoPendiente['tipo'], n: number): Mensaje {
  const url = '/mantenimiento/ordenes';
  const titulos: Partial<Record<AvisoPendiente['tipo'], string>> = {
    asignada: `Te asignaron ${n} OT`,
    devuelta: `Te devolvieron ${n} OT`,
    para_asignar: `${n} OT nuevas para asignar`,
    para_revisar: `${n} OT terminadas, para revisar`,
    para_aprobar: `${n} OT listas para aprobar`,
  };
  return { titulo: titulos[tipo] ?? `${n} avisos de Mantenimiento`, cuerpo: 'Tocá para verlas.', url, etiqueta: `${tipo}-varias` };
}

/** Las OT terminadas les llegan al jefe y al responsable dentro del horario de recepción (como en la pantalla). */
const esperaHorario = (tipo: AvisoPendiente['tipo']) => tipo === 'para_revisar' || tipo === 'para_aprobar';

/**
 * Qué hacer con los pendientes: los que ya no valen o no tienen a dónde ir se dan por mandados (`descartar`); los que esperan el horario de
 * recepción quedan para otra vuelta; el resto se agrupa por persona y tipo, en un aviso por grupo.
 */
export function repartirAvisos(pendientes: AvisoPendiente[]): { envios: Envio[]; descartar: string[] } {
  const descartar: string[] = [];
  const grupos = new Map<string, AvisoPendiente[]>();
  for (const a of pendientes) {
    if (!a.vigente || !a.celulares?.length) { descartar.push(a.id); continue; }
    if (esperaHorario(a.tipo) && a.terminada_en && llegaEn(a.terminada_en, horarioDe(a.horario)) > a.momento) continue;
    const clave = `${a.usuario_id}|${a.tipo}`;
    grupos.set(clave, [...(grupos.get(clave) ?? []), a]);
  }
  const envios: Envio[] = [];
  for (const lista of grupos.values()) {
    const [a] = lista;
    // el resumen y las pruebas van siempre de a uno (el resumen ya es un total)
    const juntos = lista.length > 1 && a.tipo !== 'prueba' && a.tipo !== 'para_derivar';
    // los íconos de la empresa (el celular los pide sin cookies)
    const iconos = { icono: `/icono?t=192&e=${a.empresa_id}`, insignia: `/icono?t=96&e=${a.empresa_id}` };
    if (juntos) envios.push({ usuario: a.usuario_id, celulares: a.celulares, mensaje: { ...mensajeJunto(a.tipo, lista.length), ...iconos }, ids: lista.map(x => x.id) });
    else for (const x of lista) envios.push({ usuario: x.usuario_id, celulares: x.celulares, mensaje: { ...mensajeDe(x), ...iconos }, ids: [x.id] });
  }
  return { envios, descartar };
}
