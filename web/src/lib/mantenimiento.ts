import 'server-only';
import type { PoolClient } from 'pg';
import { comoUsuario } from './db';
import { horarioDe, pendientesDe } from '@/features/mantenimiento/flujo';
import { CONFIG_DE_FABRICA } from '@/features/mantenimiento/preventivo';
import type { ConfigMantenimiento, Liberacion, Medicion, OrdenTrabajo, PlanillaTareas, RepuestoLinea, RolMantenimiento, Rutina, TareaDef } from '@/features/mantenimiento/tipos';

// Leer rutinas y órdenes de trabajo de Mantenimiento (lo usan las acciones de app/(app)/mantenimiento). Va aparte de los archivos
// 'use server': lo que se exporta de ahí es una acción que cualquiera con sesión puede llamar.

// Una tarea (de una planilla, una rutina o una OT) como JSON: {texto, medicion: {unidad, minimo, maximo} | null}.
const TAREA = (t: string) => `'texto', ${t}.texto, 'medicion', case when ${t}.mide then jsonb_build_object('unidad', ${t}.unidad, 'minimo', ${t}.minimo, 'maximo', ${t}.maximo) end`;
type TareaCruda = { texto: string; medicion: { unidad: string; minimo: string | number | null; maximo: string | number | null } | null };
const medicionDe = (m: TareaCruda['medicion']): Medicion | null => (m ? { unidad: m.unidad, minimo: numero(m.minimo), maximo: numero(m.maximo) } : null);
export const tareaDe = (t: TareaCruda): TareaDef => ({ texto: t.texto, medicion: medicionDe(t.medicion) });

const NOMBRE = (u: string) => `coalesce(nullif(btrim(concat(${u}.nombre, ' ', ${u}.apellido)), ''), ${u}.email, '')`;
/** Un momento como "aaaa-mm-ddThh:mm", en la hora de la empresa (para el recorrido de la OT y el horario de recepción). */
export const MOMENTO = (m: string) =>
  `to_char(${m} at time zone coalesce((select zona_horaria from public.configuracion order by id limit 1), 'America/Argentina/Buenos_Aires'), 'YYYY-MM-DD"T"HH24:MI')`;

export const SQL_ORDENES = `
  select o.id, o.numero, o.tipo, o.equipo_id, o.rutina_id, o.fecha_programada, o.asignado_id, ${NOMBRE('u')} as asignado, o.estado, o.empezada_at,
         o.fecha_cierre, o.observaciones, o.horas, coalesce(r.aviso_dias, 3) as aviso_dias, o.prioridad, o.falla, o.causa, o.solucion, o.horas_parada,
         o.liberacion, o.etapa, ${MOMENTO('o.terminada_at')} as terminada_en,
         coalesce((select jsonb_agg(jsonb_build_object('id', a.usuario_id, 'nombre', a.nombre) order by a.orden)
                   from public.ot_asignados a where a.ot_id = o.id), '[]') as asignados,
         coalesce((select jsonb_agg(jsonb_build_object('cuando', ${MOMENTO('p.cuando')}, 'quien', p.quien, 'accion', p.accion, 'comentario', p.comentario) order by p.cuando, p.id)
                   from public.ot_pasos p where p.ot_id = o.id), '[]') as pasos,
         coalesce((select jsonb_agg(jsonb_build_object('id', t.id, ${TAREA('t')}, 'hecha', t.hecha, 'valor', t.valor) order by t.orden)
                   from public.ot_tareas t where t.ot_id = o.id), '[]') as tareas,
         coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'componente', x.componente, 'itemId', x.item_id, 'codigo', x.codigo, 'descripcion', x.descripcion,
                     'cantidad', x.cantidad, 'usado', x.usado, 'descontado', x.descontado, 'faltante', x.faltante, 'precio', x.precio) order by x.orden)
                   from public.ot_repuestos x where x.ot_id = o.id), '[]') as repuestos,
         coalesce((select jsonb_agg(jsonb_build_object('usuarioId', t.usuario_id, 'nombre', t.nombre, 'fecha', coalesce(t.fecha::text, ''),
                     'inicio', coalesce(to_char(t.inicio, 'HH24:MI'), ''), 'fin', coalesce(to_char(t.fin, 'HH24:MI'), '')) order by t.orden)
                   from public.ot_tecnicos t where t.ot_id = o.id), '[]') as tecnicos
  from public.ordenes_trabajo o
  left join public.usuarios_perfil u on u.id = o.asignado_id
  left join public.rutinas_preventivas r on r.id = o.rutina_id`;

export interface FilaOrden {
  id: string; numero: string; tipo: 'preventiva' | 'correctiva'; equipo_id: string; rutina_id: string | null; fecha_programada: string; asignado_id: string | null;
  asignado: string; estado: 'pendiente' | 'en_curso' | 'terminada'; empezada_at: Date | null; fecha_cierre: string | null; observaciones: string;
  horas: string | null; aviso_dias: number; prioridad: 'normal' | 'urgente' | null; falla: string; causa: string; solucion: string; horas_parada: string | null;
  tareas: (TareaCruda & { id: string; hecha: boolean; valor: string | number | null })[]; repuestos: RepuestoLinea[]; tecnicos: OrdenTrabajo['tecnicos'];
  liberacion: Liberacion | null; etapa: OrdenTrabajo['etapa']; terminada_en: string | null; asignados: OrdenTrabajo['asignados']; pasos: OrdenTrabajo['pasos'];
}
export const numero = (v: string | number | null | undefined) => (v === null || v === undefined ? null : Number(v));
export const ordenDe = (f: FilaOrden): OrdenTrabajo => ({
  id: f.id, numero: Number(f.numero), tipo: f.tipo, equipoId: f.equipo_id, rutinaId: f.rutina_id, fechaProgramada: f.fecha_programada,
  asignadoId: f.asignado_id, asignado: f.asignado, estado: f.estado, empezadaAt: f.empezada_at ? new Date(f.empezada_at).toISOString() : null,
  fechaCierre: f.fecha_cierre, observaciones: f.observaciones, horas: numero(f.horas), avisoDias: f.aviso_dias,
  tareas: f.tareas.map(t => ({ id: t.id, texto: t.texto, hecha: t.hecha, medicion: medicionDe(t.medicion), valor: numero(t.valor) })),
  repuestos: f.repuestos.map(r => ({ ...r, cantidad: Number(r.cantidad), usado: numero(r.usado), descontado: numero(r.descontado ?? null), faltante: numero(r.faltante ?? null),
    precio: numero(r.precio ?? null) })),
  tecnicos: f.tecnicos,
  correctivo: f.tipo === 'correctiva'
    ? { prioridad: f.prioridad ?? 'normal', falla: f.falla, causa: f.causa, solucion: f.solucion, horasParada: numero(f.horas_parada) }
    : null,
  liberacion: f.liberacion,
  horasParada: f.tipo === 'preventiva' ? numero(f.horas_parada) : null,
  etapa: f.etapa, asignados: f.asignados, pasos: f.pasos, terminadaEn: f.terminada_en,
});

const SQL_RUTINAS = `
  select r.id, r.equipo_id, r.planilla_id, r.frecuencia_dias, r.proxima_fecha, r.aviso_dias, r.responsable_id, ${NOMBRE('u')} as responsable, r.activa,
         coalesce((select jsonb_agg(jsonb_build_object(${TAREA('t')}) order by t.orden) from public.rutina_tareas t where t.rutina_id = r.id), '[]') as tareas,
         coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'componente', x.componente, 'itemId', x.item_id, 'codigo', x.codigo,
                     'descripcion', x.descripcion, 'cantidad', x.cantidad, 'usado', null) order by x.orden)
                   from public.rutina_repuestos x where x.rutina_id = r.id), '[]') as repuestos
  from public.rutinas_preventivas r
  left join public.usuarios_perfil u on u.id = r.responsable_id`;

interface FilaRutina {
  id: string; equipo_id: string; planilla_id: string | null; frecuencia_dias: number; proxima_fecha: string; aviso_dias: number; responsable_id: string | null; responsable: string;
  activa: boolean; tareas: TareaCruda[]; repuestos: RepuestoLinea[];
}
const rutinaDe = (f: FilaRutina): Rutina => ({
  id: f.id, equipoId: f.equipo_id, tareas: f.tareas.map(tareaDe), planillaId: f.planilla_id, frecuenciaDias: f.frecuencia_dias, proximaFecha: f.proxima_fecha, avisoDias: f.aviso_dias,
  responsableId: f.responsable_id, responsable: f.responsable, activa: f.activa, repuestos: f.repuestos.map(r => ({ ...r, cantidad: Number(r.cantidad) })),
});

/** Le pone a cada repuesto del Depósito su stock de ahora (lo lee una función de la base: quien solo ve Mantenimiento no tiene el Depósito). */
export async function conStock(c: PoolClient, listas: RepuestoLinea[][]): Promise<void> {
  const ids = [...new Set(listas.flat().flatMap(l => (l.itemId ? [l.itemId] : [])))];
  if (!ids.length) return;
  const stock = new Map((await c.query<{ id: string; stock: string | null; ubicacion: string | null }>('select id, stock, ubicacion from public.stock_de_repuestos($1::uuid[])', [ids]))
    .rows.map(r => [r.id, r]));
  for (const l of listas.flat()) {
    const s = l.itemId ? stock.get(l.itemId) : undefined;
    l.stock = s ? Number(s.stock ?? 0) : null;
    l.ubicacion = s?.ubicacion ?? null;
  }
}

/** Las OT y las rutinas (de todos los equipos, o de los que se piden). Las terminadas, de los últimos 6 meses. */
export async function leerPreventivo(c: PoolClient, equipos?: string[]): Promise<{ rutinas: Rutina[]; ordenes: OrdenTrabajo[] }> {
  const filtroEquipos = equipos ? ' and o.equipo_id = any ($1::uuid[])' : '';
  const ordenes = (await c.query<FilaOrden>(`${SQL_ORDENES}
      where (o.estado <> 'terminada' or o.fecha_cierre >= public.hoy_local() - 183)${filtroEquipos}
      order by o.fecha_programada, o.numero`, equipos ? [equipos] : [])).rows.map(ordenDe);
  const rutinas = (await c.query<FilaRutina>(`${SQL_RUTINAS}${equipos ? ' where r.equipo_id = any ($1::uuid[])' : ''} order by r.proxima_fecha`, equipos ? [equipos] : []))
    .rows.map(rutinaDe);
  await conStock(c, [...ordenes.map(o => o.repuestos), ...rutinas.map(r => r.repuestos)]);
  return { rutinas, ordenes };
}


/** Las planillas de tareas, por nombre. */
export async function leerPlanillas(c: PoolClient): Promise<PlanillaTareas[]> {
  return (await c.query<{ id: string; nombre: string; notas: string; tareas: TareaCruda[] }>(`
    select p.id, p.nombre, p.notas,
           coalesce((select jsonb_agg(jsonb_build_object(${TAREA('t')}) order by t.orden) from public.planilla_tareas_items t where t.planilla_id = p.id), '[]') as tareas
    from public.planillas_tareas p order by public.texto_de_busqueda(p.nombre)`)).rows.map(p => ({ ...p, tareas: p.tareas.map(tareaDe) }));
}

/** El formato de la OT de la empresa (el de fábrica, si todavía no se eligió). */
export async function leerConfig(c: PoolClient): Promise<ConfigMantenimiento> {
  const [f] = (await c.query<{ registro_codigo: string; registro_version: string; registro_vigencia: string | null; controles_liberacion: string[]; recibe_liberacion: string;
    costo_hora: string | null; horario_recepcion: unknown }>(
    `select registro_codigo, registro_version, registro_vigencia::text, controles_liberacion, recibe_liberacion, costo_hora, horario_recepcion
     from public.mantenimiento_config`)).rows;
  return f
    ? { registroCodigo: f.registro_codigo, registroVersion: f.registro_version, registroVigencia: f.registro_vigencia ?? '', controlesLiberacion: f.controles_liberacion,
      recibeLiberacion: f.recibe_liberacion, costoHora: numero(f.costo_hora), horarioRecepcion: horarioDe(f.horario_recepcion) }
    : CONFIG_DE_FABRICA;
}

/** Cuántas OT abiertas están vencidas o por vencer (dentro de los días de aviso de su rutina; 3 en las correctivas): el número del menú. */
export async function avisosDeMantenimiento(usuario: string): Promise<number> {
  try {
    return await comoUsuario(usuario, async c => Number((await c.query<{ n: string }>(`
      select count(*) as n from public.ordenes_trabajo o left join public.rutinas_preventivas r on r.id = o.rutina_id
      where o.estado <> 'terminada' and o.fecha_programada <= public.hoy_local() + coalesce(r.aviso_dias, 3)`)).rows[0].n));
  } catch {
    // el número del menú no puede tirar la pantalla
    return 0;
  }
}

/** Lo que el menú de Mantenimiento necesita: los sectores (en el orden de importancia de la empresa) y lo que la persona tiene que hacer con las OT. */
export async function menuDeMantenimiento(usuario: string, rol: RolMantenimiento): Promise<{
  sectores: { id: string; nombre: string; padreId: string | null }[];
  pendientes: { paraMandar: number; paraRevisar: number; asignadas: number };
}> {
  const nada = { sectores: [], pendientes: { paraMandar: 0, paraRevisar: 0, asignadas: 0 } };
  try {
    return await comoUsuario(usuario, async c => {
      const sectores = (await c.query<{ id: string; nombre: string; padre_id: string | null }>(
        'select id, nombre, padre_id from public.equipo_sectores order by orden nulls last, nombre')).rows.map(s => ({ id: s.id, nombre: s.nombre, padreId: s.padre_id }));
      const ordenes = (await c.query<{ etapa: OrdenTrabajo['etapa']; terminada_en: string | null; asignados: (string | null)[] }>(`
        select o.etapa, ${MOMENTO('o.terminada_at')} as terminada_en,
               coalesce((select array_agg(a.usuario_id) from public.ot_asignados a where a.ot_id = o.id), '{}') as asignados
        from public.ordenes_trabajo o where o.etapa <> 'aprobada'`)).rows
        .map(o => ({ etapa: o.etapa, terminadaEn: o.terminada_en, asignados: o.asignados.map(id => ({ id, nombre: '' })) }));
      const momento = (await c.query<{ m: string }>(`select ${MOMENTO('now()')} as m`)).rows[0].m;
      const { horarioRecepcion } = await leerConfig(c);
      return { sectores, pendientes: pendientesDe(ordenes, { id: usuario, rol }, momento, horarioRecepcion) };
    });
  } catch {
    // el menú no puede tirar la pantalla
    return nada;
  }
}
