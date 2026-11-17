'use server';
import { z } from 'zod';
import type { PoolClient } from 'pg';
import type {
  AprobacionInput, CierreInput, ConfigMantenimiento, CorrectivaCargadaInput, CorrectivaInput, OrdenTrabajo, PlanillaTareas, RepuestoLinea, ResultadoAprobacion,
  ResultadoCierre, Rutina, RutinaInput, TareaDef,
} from '@/features/mantenimiento/tipos';
import { horarioDe } from '@/features/mantenimiento/flujo';
import { type FilaOrden, SQL_ORDENES, conStock, leerPreventivo, numero, ordenDe } from '~/lib/mantenimiento';
import { comoUsuario } from '~/lib/db';
import { Cantidad, Fecha, Id, IdONulo, Lista, Numero, SiNo, Texto, entrada } from '~/lib/entrada';
import { mensajeDe } from '~/lib/registroDeErrores';

// Mantenimiento, etapas 2 y 3: rutinas preventivas, órdenes de trabajo, planillas de tareas (con mediciones) y el formato de la OT. Armar la OT de cada rutina, crear una correctiva y terminarla (con el
// descuento de stock) lo hacen funciones de la base, todo junto o nada (supabase/componentes/mantenimiento/…_preventivo_y_ordenes_de_trabajo.sql).

type Resultado = { error: string | null };
const esId = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f-]{36}$/i.test(v);
const esDia = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
const texto = (v: unknown, maximo: number) => (typeof v === 'string' ? v.trim().slice(0, maximo) : '');
const numeroONulo = (v: unknown, maximo = 100000): number | null => {
  const n = typeof v === 'number' ? v : Number(String(v ?? '').replace(',', '.'));
  return v === null || v === '' || v === undefined || !Number.isFinite(n) || n < 0 || n > maximo ? null : n;
};
const aviso = (mensaje: string) => Object.assign(new Error(mensaje), { code: 'P0001' });

async function cambiar(usuario: string, hacer: (c: PoolClient) => Promise<unknown>, porDefecto: string): Promise<Resultado> {
  try {
    await comoUsuario(usuario, hacer);
    return { error: null };
  } catch (e) {
    return { error: mensajeDe(e, porDefecto) };
  }
}

// ---------------------------------------------------------------------------------------------------------------------------------------------
// Lectura
// ---------------------------------------------------------------------------------------------------------------------------------------------

export interface DatosDePreventivo { rutinas: Rutina[]; ordenes: OrdenTrabajo[] }

export async function datosDePreventivo(): Promise<DatosDePreventivo> {
  const usuario = await entrada('datosDePreventivo');
  return comoUsuario(usuario, c => leerPreventivo(c));
}

/** Una OT, al día (con el stock de ahora). */
export async function ordenDeTrabajo(id: string): Promise<OrdenTrabajo | null> {
  const usuario = await entrada('ordenDeTrabajo', [Id], [id]);
  if (!esId(id)) return null;
  return comoUsuario(usuario, async c => {
    const [ot] = (await c.query<FilaOrden>(`${SQL_ORDENES} where o.id = $1`, [id])).rows.map(ordenDe);
    if (ot) await conStock(c, [ot.repuestos]);
    return ot ?? null;
  });
}

// ---------------------------------------------------------------------------------------------------------------------------------------------
// Rutinas
// ---------------------------------------------------------------------------------------------------------------------------------------------

const Linea = z.object({ componente: Texto(300), itemId: IdONulo, codigo: Texto(100), descripcion: Texto(600), cantidad: Cantidad });
const lineas = (l: z.infer<typeof Linea>[]) => l
  .map(r => ({ componente: texto(r.componente, 160), item_id: esId(r.itemId) ? r.itemId : null, codigo: texto(r.codigo, 60), descripcion: texto(r.descripcion, 300),
    cantidad: numeroONulo(r.cantidad, 1000000) ?? 0 }))
  .filter(r => (r.item_id || r.codigo || r.descripcion) && r.cantidad > 0)
  .slice(0, 100);
const Tarea = z.object({
  texto: Texto(1000),
  medicion: z.object({ unidad: Texto(60), minimo: Numero().nullable(), maximo: Numero().nullable() }).nullable(),
});
const limite = (v: number | null) => (v === null || !Number.isFinite(v) || Math.abs(v) >= 1e12 ? null : v);
/** Las tareas limpias (sin vacías; el mínimo nunca mayor que el máximo), como las guarda la base: {texto, mide, unidad, minimo, maximo}. */
const tareas = (t: TareaDef[]) => t
  .map(x => {
    const m = x.medicion;
    let [minimo, maximo] = [limite(m?.minimo ?? null), limite(m?.maximo ?? null)];
    if (minimo !== null && maximo !== null && minimo > maximo) [minimo, maximo] = [maximo, minimo];
    return { texto: texto(x.texto, 500).replace(/\s+/g, ' '), mide: !!m, unidad: texto(m?.unidad, 30), minimo: m ? minimo : null, maximo: m ? maximo : null };
  })
  .filter(x => x.texto)
  .slice(0, 100);
type TareaLimpia = ReturnType<typeof tareas>[number];
/** Inserta las tareas en rutina_tareas o planilla_tareas_items. */
const guardarTareas = (c: PoolClient, tabla: 'rutina_tareas' | 'planilla_tareas_items', columna: 'rutina_id' | 'planilla_id', id: string, lista: TareaLimpia[]) =>
  c.query(`insert into public.${tabla} (${columna}, orden, texto, mide, unidad, minimo, maximo)
      select $1, n, x ->> 'texto', (x ->> 'mide')::boolean, x ->> 'unidad', (x ->> 'minimo')::numeric, (x ->> 'maximo')::numeric
      from jsonb_array_elements($2::jsonb) with ordinality as y(x, n)`, [id, JSON.stringify(lista)]);

const RutinaRecibida = z.object({
  id: IdONulo, equipoId: Id, tareas: Lista(Tarea, 200), planillaId: IdONulo, frecuenciaDias: z.number().int().min(1).max(3650), proximaFecha: Fecha,
  avisoDias: z.number().int().min(0).max(365), responsableId: IdONulo, activa: SiNo, repuestos: Lista(Linea, 200),
});

/** Crea o cambia una rutina; la base deja su OT al día (o la quita, si se desactivó). Con planilla, las tareas salen de la planilla. */
export async function guardarRutina(r: RutinaInput): Promise<Resultado> {
  const usuario = await entrada('guardarRutina', [RutinaRecibida], [r]);
  const lista = tareas(r.tareas);
  if (!esId(r.equipoId)) return { error: 'Elegí el equipo.' };
  if (!lista.length && !esId(r.planillaId)) return { error: 'Escribí al menos una tarea.' };
  if (!esDia(r.proximaFecha)) return { error: 'Elegí la próxima fecha.' };
  return cambiar(usuario, async c => {
    const planilla = esId(r.planillaId) ? r.planillaId : null;
    const valores = [r.equipoId, r.frecuenciaDias, r.proximaFecha, r.avisoDias, esId(r.responsableId) ? r.responsableId : null, r.activa === true, planilla];
    let id = r.id;
    if (id) {
      const { rowCount } = await c.query(`update public.rutinas_preventivas set equipo_id = $2, frecuencia_dias = $3, proxima_fecha = $4, aviso_dias = $5,
          responsable_id = $6, activa = $7, planilla_id = $8 where id = $1`, [id, ...valores]);
      if (!rowCount) throw aviso('No podés cambiar esta rutina.');
    } else {
      id = (await c.query<{ id: string }>(`insert into public.rutinas_preventivas (equipo_id, frecuencia_dias, proxima_fecha, aviso_dias, responsable_id, activa, planilla_id)
          values ($1, $2, $3, $4, $5, $6, $7) returning id`, valores)).rows[0].id;
    }
    await c.query('delete from public.rutina_tareas where rutina_id = $1', [id]);
    if (planilla) {
      const { rowCount } = await c.query(`insert into public.rutina_tareas (rutina_id, orden, texto, mide, unidad, minimo, maximo)
          select $1, orden, texto, mide, unidad, minimo, maximo from public.planilla_tareas_items where planilla_id = $2 order by orden`, [id, planilla]);
      if (!rowCount) throw aviso('La planilla elegida no tiene tareas.');
    } else {
      await guardarTareas(c, 'rutina_tareas', 'rutina_id', id, lista);
    }
    await c.query('delete from public.rutina_repuestos where rutina_id = $1', [id]);
    await c.query(`insert into public.rutina_repuestos (rutina_id, orden, componente, item_id, codigo, descripcion, cantidad)
        select $1, n, x ->> 'componente', nullif(x ->> 'item_id', '')::uuid, x ->> 'codigo', x ->> 'descripcion', (x ->> 'cantidad')::numeric
        from jsonb_array_elements($2::jsonb) with ordinality as y(x, n)`, [id, JSON.stringify(lineas(r.repuestos))]);
    await c.query('select public.sincronizar_rutina($1)', [id]);
  }, 'No se pudo guardar la rutina');
}

/** Borra la rutina: su OT pendiente se quita; lo que ya se hizo queda en el historial. */
export async function eliminarRutina(id: string): Promise<Resultado> {
  const usuario = await entrada('eliminarRutina', [Id], [id]);
  if (!esId(id)) return { error: 'Rutina no válida' };
  return cambiar(usuario, async c => {
    const { rowCount } = await c.query('update public.rutinas_preventivas set activa = false where id = $1', [id]);
    if (!rowCount) throw aviso('No podés borrar esta rutina.');
    await c.query('select public.sincronizar_rutina($1)', [id]);
    await c.query('delete from public.rutinas_preventivas where id = $1', [id]);
  }, 'No se pudo borrar la rutina');
}

// ---------------------------------------------------------------------------------------------------------------------------------------------
// Órdenes de trabajo
// ---------------------------------------------------------------------------------------------------------------------------------------------

const CorrectivaRecibida = z.object({
  equipoId: Id, fecha: Fecha, asignadoId: IdONulo, prioridad: z.enum(['normal', 'urgente']), falla: Texto(8000), tareas: Lista(Tarea, 200),
  repuestos: Lista(Linea, 200),
});

/** Crea una OT correctiva. Devuelve su número. */
export async function crearOtCorrectiva(o: CorrectivaInput): Promise<Resultado & { numero?: number }> {
  const usuario = await entrada('crearOtCorrectiva', [CorrectivaRecibida], [o]);
  const lista = tareas(o.tareas);
  if (!esId(o.equipoId)) return { error: 'Elegí el equipo.' };
  if (!lista.length) return { error: 'Escribí qué hay que hacer.' };
  try {
    const n = await comoUsuario(usuario, async c => (await c.query<{ numero: string }>('select numero from public.crear_ot_correctiva($1)', [JSON.stringify({
      equipo_id: o.equipoId, fecha: esDia(o.fecha) ? o.fecha : null, asignado_id: esId(o.asignadoId) ? o.asignadoId : null, prioridad: o.prioridad,
      falla: texto(o.falla, 4000), tareas: lista, repuestos: lineas(o.repuestos),
    })])).rows[0].numero);
    return { error: null, numero: Number(n) };
  } catch (e) {
    return { error: mensajeDe(e, 'No se pudo crear la OT') };
  }
}

/** Tildar o destildar una tarea de una OT abierta (o todas, sin tarea). */
export async function marcarTareas(otId: string, tareaId: string | null, hecha: boolean): Promise<Resultado> {
  const usuario = await entrada('marcarTareas', [Id, IdONulo, SiNo], [otId, tareaId, hecha]);
  if (!esId(otId)) return { error: 'OT no válida' };
  return cambiar(usuario, async c => {
    const { rowCount } = await c.query(`update public.ot_tareas set hecha = $3 where ot_id = $1 and ($2::uuid is null or id = $2)`, [otId, esId(tareaId) ? tareaId : null, hecha === true]);
    if (!rowCount) throw aviso('No podés cambiar esta OT.');
  }, 'No se pudo guardar la tarea');
}

/** Anota (o borra, con null) el valor medido de una tarea de una OT abierta. */
export async function anotarValor(otId: string, tareaId: string, valor: number | null): Promise<Resultado> {
  const usuario = await entrada('anotarValor', [Id, Id, Numero(-1e11, 1e11).nullable()], [otId, tareaId, valor]);
  if (!esId(otId) || !esId(tareaId)) return { error: 'Tarea no válida' };
  return cambiar(usuario, async c => {
    const { rowCount } = await c.query('update public.ot_tareas set valor = $3 where ot_id = $1 and id = $2 and mide', [otId, tareaId, limite(valor)]);
    if (!rowCount) throw aviso('No podés cambiar esta OT.');
  }, 'No se pudo guardar el valor');
}

/** "Empezar": la OT pasa a en curso y queda anotada la hora (sirve de hora de inicio al terminar). */
export async function empezarOt(id: string): Promise<Resultado> {
  const usuario = await entrada('empezarOt', [Id], [id]);
  if (!esId(id)) return { error: 'OT no válida' };
  return cambiar(usuario, async c => {
    const { rowCount } = await c.query(`update public.ordenes_trabajo set estado = 'en_curso', empezada_at = now() where id = $1 and estado = 'pendiente'`, [id]);
    if (!rowCount) throw aviso('No podés empezar esta OT.');
  }, 'No se pudo empezar la OT');
}

export async function reprogramarOt(id: string, fecha: string): Promise<Resultado> {
  const usuario = await entrada('reprogramarOt', [Id, Fecha], [id, fecha]);
  if (!esId(id) || !esDia(fecha)) return { error: 'Elegí la fecha.' };
  return cambiar(usuario, c => c.query('select public.reprogramar_ot($1, $2)', [id, fecha]), 'No se pudo cambiar la fecha');
}

/** Cambia los repuestos previstos de una OT abierta. */
export async function guardarRepuestosOt(id: string, repuestos: RepuestoLinea[]): Promise<Resultado> {
  const usuario = await entrada('guardarRepuestosOt', [Id, Lista(Linea.passthrough(), 200)], [id, repuestos]);
  if (!esId(id)) return { error: 'OT no válida' };
  return cambiar(usuario, async c => {
    const [ot] = (await c.query<{ estado: string }>('select estado from public.ordenes_trabajo where id = $1', [id])).rows;
    if (!ot) throw aviso('No se encontró la OT.');
    await c.query('delete from public.ot_repuestos where ot_id = $1', [id]);
    await c.query(`insert into public.ot_repuestos (ot_id, orden, componente, item_id, codigo, descripcion, cantidad)
        select $1, n, x ->> 'componente', nullif(x ->> 'item_id', '')::uuid, x ->> 'codigo', x ->> 'descripcion', (x ->> 'cantidad')::numeric
        from jsonb_array_elements($2::jsonb) with ordinality as y(x, n)`, [id, JSON.stringify(lineas(repuestos))]);
  }, 'No se pudieron guardar los repuestos');
}

/** Cambia la prioridad o la falla reportada de una OT correctiva abierta. */
export async function guardarFallaOt(id: string, prioridad: 'normal' | 'urgente', falla: string): Promise<Resultado> {
  const usuario = await entrada('guardarFallaOt', [Id, z.enum(['normal', 'urgente']), Texto(8000)], [id, prioridad, falla]);
  if (!esId(id)) return { error: 'OT no válida' };
  return cambiar(usuario, async c => {
    const { rowCount } = await c.query(`update public.ordenes_trabajo set prioridad = $2, falla = $3 where id = $1 and tipo = 'correctiva'`,
      [id, prioridad === 'urgente' ? 'urgente' : 'normal', texto(falla, 4000)]);
    if (!rowCount) throw aviso('No podés cambiar esta OT.');
  }, 'No se pudo guardar');
}

const CierreRecibido = z.object({
  fecha: Fecha, observaciones: Texto(8000), horas: z.union([Cantidad, z.null()]), causa: Texto(8000), solucion: Texto(8000),
  horasParada: z.union([Cantidad, z.null()]), otPendientes: SiNo, otPorValores: SiNo,
  liberacion: z.object({ controles: Lista(z.object({ texto: Texto(300), ok: SiNo }), 40), recibio: Texto(300) }).nullable(),
  tecnicos: Lista(z.object({ usuarioId: IdONulo, nombre: Texto(300), fecha: Texto(20), inicio: Texto(10), fin: Texto(10) }), 20),
  repuestos: Lista(Linea.extend({ usado: z.union([Cantidad, z.null()]), precio: z.union([Cantidad, z.null()]).optional() }), 200),
});
const hora = (v: string) => (/^\d{1,2}:\d{2}$/.test(v) ? v : '');

/** Lo que cargó quien terminó la OT, como lo recibe la base (terminar_ot, cargar_ot_correctiva y cerrar_ot). */
const datosDeCierre = (d: Omit<CierreInput, 'otPendientes' | 'otPorValores'>) => ({
  fecha: d.fecha, observaciones: texto(d.observaciones, 4000), horas: numeroONulo(d.horas), causa: texto(d.causa, 4000), solucion: texto(d.solucion, 4000),
  horas_parada: numeroONulo(d.horasParada),
  liberacion: d.liberacion
    ? { controles: d.liberacion.controles.map(x => ({ texto: texto(x.texto, 200), ok: x.ok === true })).filter(x => x.texto), recibio: texto(d.liberacion.recibio, 120) }
    : null,
  tecnicos: d.tecnicos.filter(t => esId(t.usuarioId)).map(t => ({ usuario_id: t.usuarioId, fecha: esDia(t.fecha) ? t.fecha : null, inicio: hora(t.inicio), fin: hora(t.fin) })),
  repuestos: d.repuestos
    .map(x => ({ componente: texto(x.componente, 160), item_id: esId(x.itemId) ? x.itemId : null, codigo: texto(x.codigo, 60), descripcion: texto(x.descripcion, 300),
      cantidad: numeroONulo(x.cantidad, 1000000) ?? 0, usado: numeroONulo(x.usado, 1000000) ?? 0, precio: numeroONulo(x.precio, 1e12) }))
    .filter(x => (x.item_id || x.codigo || x.descripcion) && (x.cantidad > 0 || x.usado > 0)),
});

// ---------------------------------------------------------------------------------------------------------------------------------------------
// El circuito de las OT (del socio, 10/11/2026): derivar → asignar → terminar → revisar → aprobar. Cada paso lo valida la base según el rol
// (supabase/componentes/mantenimiento/…_circuito_de_las_ot_y_costos.sql).
// ---------------------------------------------------------------------------------------------------------------------------------------------

/** El técnico termina la OT: queda para revisar (todavía sin historial ni descuento de stock). Devuelve el número de la siguiente de la rutina. */
export async function terminarOt(id: string, d: CierreInput): Promise<Resultado & { siguiente?: number | null }> {
  const usuario = await entrada('terminarOt', [Id, CierreRecibido], [id, d]);
  if (!esId(id) || !esDia(d.fecha)) return { error: 'Elegí la fecha en que se hizo.' };
  try {
    const r = await comoUsuario(usuario, async c => (await c.query<{ r: { siguiente: string | null } }>('select public.terminar_ot($1, $2) as r',
      [id, JSON.stringify(datosDeCierre(d))])).rows[0].r);
    return { error: null, siguiente: numero(r.siguiente) };
  } catch (e) {
    return { error: mensajeDe(e, 'No se pudo terminar la OT. No se guardó nada.') };
  }
}

const CorrectivaCargadaRecibida = z.object({
  equipoId: Id, fecha: Fecha, prioridad: z.enum(['normal', 'urgente']), falla: Texto(8000), causa: Texto(8000), solucion: Texto(8000),
  horas: z.union([Cantidad, z.null()]), horasParada: z.union([Cantidad, z.null()]), observaciones: Texto(8000),
  liberacion: CierreRecibido.shape.liberacion, tecnicos: CierreRecibido.shape.tecnicos, repuestos: CierreRecibido.shape.repuestos,
});

/** El técnico carga una correctiva que ya hizo (llamado de guardia): nace terminada, para que la revise el jefe de taller. Devuelve su número. */
export async function cargarCorrectiva(d: CorrectivaCargadaInput): Promise<Resultado & { numero?: number }> {
  const usuario = await entrada('cargarCorrectiva', [CorrectivaCargadaRecibida], [d]);
  if (!esId(d.equipoId)) return { error: 'Elegí el equipo.' };
  if (!esDia(d.fecha)) return { error: 'Elegí la fecha en que se hizo.' };
  try {
    const n = await comoUsuario(usuario, async c => (await c.query<{ n: string }>('select public.cargar_ot_correctiva($1) as n', [JSON.stringify({
      ...datosDeCierre(d), equipo_id: d.equipoId, prioridad: d.prioridad === 'urgente' ? 'urgente' : 'normal', falla: texto(d.falla, 4000),
    })])).rows[0].n);
    return { error: null, numero: Number(n) };
  } catch (e) {
    return { error: mensajeDe(e, 'No se pudo cargar la OT. No se guardó nada.') };
  }
}

/** El responsable deriva al jefe de taller las OT que le llegaron. */
export async function derivarOts(ids: string[]): Promise<Resultado & { cuantas?: number }> {
  const usuario = await entrada('derivarOts', [Lista(Id, 500)], [ids]);
  try {
    const n = await comoUsuario(usuario, async c => (await c.query<{ n: number }>('select public.derivar_ots($1::uuid[]) as n', [ids.filter(esId)])).rows[0].n);
    return { error: null, cuantas: n };
  } catch (e) {
    return { error: mensajeDe(e, 'No se pudieron derivar las OT') };
  }
}

/** El jefe de taller asigna (o reasigna) la OT a uno o varios técnicos. */
export async function asignarOt(id: string, usuarios: string[]): Promise<Resultado> {
  const usuario = await entrada('asignarOt', [Id, Lista(Id, 20)], [id, usuarios]);
  if (!esId(id)) return { error: 'OT no válida' };
  return cambiar(usuario, c => c.query('select public.asignar_ot($1, $2::uuid[])', [id, [...new Set(usuarios.filter(esId))]]), 'No se pudo asignar la OT');
}

/** El jefe de taller la revisó: pasa al responsable para aprobar. */
export async function pasarAAprobacion(id: string, comentario: string): Promise<Resultado> {
  const usuario = await entrada('pasarAAprobacion', [Id, Texto(4000)], [id, comentario]);
  if (!esId(id)) return { error: 'OT no válida' };
  return cambiar(usuario, c => c.query('select public.pasar_ot_a_aprobacion($1, $2)', [id, texto(comentario, 2000)]), 'No se pudo pasar a aprobación');
}

/** El jefe (al revisar) o el responsable (al aprobar) la devuelven al técnico con un comentario. */
export async function devolverOt(id: string, comentario: string): Promise<Resultado> {
  const usuario = await entrada('devolverOt', [Id, Texto(4000)], [id, comentario]);
  if (!esId(id)) return { error: 'OT no válida' };
  return cambiar(usuario, c => c.query('select public.devolver_ot($1, $2)', [id, texto(comentario, 2000)]), 'No se pudo devolver la OT');
}

const AprobacionRecibida = z.object({ otPendientes: SiNo, otPorValores: SiNo, tareasNuevas: Texto(8000) });

/** El responsable la aprueba: va al historial del equipo y se descuentan los repuestos; si se pide, las OT nuevas (van al jefe de taller). */
export async function aprobarOt(id: string, op: AprobacionInput): Promise<Resultado & { resultado?: ResultadoAprobacion }> {
  const usuario = await entrada('aprobarOt', [Id, AprobacionRecibida], [id, op]);
  if (!esId(id)) return { error: 'OT no válida' };
  try {
    const r = await comoUsuario(usuario, async c => (await c.query<{ r: { pendientes: string | null; a_mano: string | null; valores: string | null; descontados: number; faltantes: number } }>(
      'select public.aprobar_ot($1, $2) as r', [id, JSON.stringify({
        ot_pendientes: op.otPendientes === true, ot_por_valores: op.otPorValores === true, tareas_nuevas: texto(op.tareasNuevas, 4000),
      })])).rows[0].r);
    return { error: null, resultado: { pendientes: numero(r.pendientes), aMano: numero(r.a_mano), valores: numero(r.valores), descontados: r.descontados, faltantes: r.faltantes } };
  } catch (e) {
    return { error: mensajeDe(e, 'No se pudo aprobar la OT. No se guardó nada.') };
  }
}

/** Terminar y aprobar en un solo paso (solo el responsable): historial, descuento de stock, la siguiente de la rutina y, si se pide, una OT con lo pendiente. */
export async function cerrarOt(id: string, d: CierreInput): Promise<Resultado & { resultado?: ResultadoCierre }> {
  const usuario = await entrada('cerrarOt', [Id, CierreRecibido], [id, d]);
  if (!esId(id) || !esDia(d.fecha)) return { error: 'Elegí la fecha en que se hizo.' };
  try {
    const r = await comoUsuario(usuario, async c => (await c.query<{ r: { siguiente: string | null; pendientes: string | null; valores: string | null; descontados: number; faltantes: number } }>(
      'select public.cerrar_ot($1, $2) as r', [id, JSON.stringify({ ...datosDeCierre(d), ot_pendientes: d.otPendientes === true, ot_por_valores: d.otPorValores === true })])).rows[0].r);
    return { error: null, resultado: { siguiente: numero(r.siguiente), pendientes: numero(r.pendientes), valores: numero(r.valores), descontados: r.descontados, faltantes: r.faltantes } };
  } catch (e) {
    return { error: mensajeDe(e, 'No se pudo terminar la OT. No se guardó nada.') };
  }
}

/** Borra una OT correctiva abierta (solo quien administra). */
export async function eliminarOt(id: string): Promise<Resultado> {
  const usuario = await entrada('eliminarOt', [Id], [id]);
  if (!esId(id)) return { error: 'OT no válida' };
  return cambiar(usuario, async c => {
    const { rowCount } = await c.query('delete from public.ordenes_trabajo where id = $1', [id]);
    if (!rowCount) throw aviso('Solo quien administra Mantenimiento puede borrar una OT correctiva abierta.');
  }, 'No se pudo borrar la OT');
}

// ---------------------------------------------------------------------------------------------------------------------------------------------
// Planillas de tareas y formato de la OT (etapa 3; solo quien administra)
// ---------------------------------------------------------------------------------------------------------------------------------------------

const PlanillaRecibida = z.object({ id: IdONulo, nombre: Texto(400), notas: Texto(4000), tareas: Lista(Tarea, 200) });

/** Crea o cambia una planilla. Las rutinas que la usan toman sus tareas (y sus OT pendientes también). Devuelve cuántas rutinas se cambiaron. */
export async function guardarPlanilla(p: Omit<PlanillaTareas, 'id'> & { id: string | null }): Promise<Resultado & { rutinas?: number }> {
  const usuario = await entrada('guardarPlanilla', [PlanillaRecibida], [p]);
  const nombre = texto(p.nombre, 160).replace(/\s+/g, ' ');
  const lista = tareas(p.tareas);
  if (!nombre) return { error: 'Poné un nombre a la planilla.' };
  if (!lista.length) return { error: 'Agregá al menos una tarea.' };
  try {
    const rutinas = await comoUsuario(usuario, async c => {
      let id = esId(p.id) ? p.id : null;
      if (id) {
        const { rowCount } = await c.query('update public.planillas_tareas set nombre = $2, notas = $3 where id = $1', [id, nombre, texto(p.notas, 2000)]);
        if (!rowCount) throw aviso('Solo quien administra Mantenimiento puede cambiar las planillas.');
      } else {
        id = (await c.query<{ id: string }>('insert into public.planillas_tareas (nombre, notas) values ($1, $2) returning id', [nombre, texto(p.notas, 2000)])).rows[0].id;
      }
      await c.query('delete from public.planilla_tareas_items where planilla_id = $1', [id]);
      await guardarTareas(c, 'planilla_tareas_items', 'planilla_id', id, lista);
      return (await c.query<{ n: number }>('select public.aplicar_planilla($1) as n', [id])).rows[0].n;
    });
    return { error: null, rutinas };
  } catch (e) {
    if ((e as { code?: string } | null)?.code === '23505') return { error: `Ya hay una planilla que se llama "${nombre}".` };
    return { error: mensajeDe(e, 'No se pudo guardar la planilla') };
  }
}

/** Borra una planilla: las rutinas que la usaban se quedan con una copia de sus tareas. */
export async function eliminarPlanilla(id: string): Promise<Resultado> {
  const usuario = await entrada('eliminarPlanilla', [Id], [id]);
  if (!esId(id)) return { error: 'Planilla no válida' };
  return cambiar(usuario, async c => {
    const { rowCount } = await c.query('delete from public.planillas_tareas where id = $1', [id]);
    if (!rowCount) throw aviso('Solo quien administra Mantenimiento puede borrar las planillas.');
  }, 'No se pudo borrar la planilla');
}

const ConfigRecibida = z.object({
  registroCodigo: Texto(200), registroVersion: Texto(100), registroVigencia: Fecha, controlesLiberacion: Lista(Texto(400), 40), recibeLiberacion: Texto(400),
  costoHora: z.union([Cantidad, z.null()]),
  horarioRecepcion: z.object({ dias: Lista(z.object({ dia: z.number().int().min(0).max(6), desde: Texto(10), hasta: Texto(10) }), 7) }),
});

/** Guarda el formato de la OT (registro de calidad y controles de la liberación). */
export async function guardarConfig(d: ConfigMantenimiento): Promise<Resultado> {
  const usuario = await entrada('guardarConfig', [ConfigRecibida], [d]);
  const controles = [...new Set(d.controlesLiberacion.map(x => texto(x, 200).replace(/\s+/g, ' ')).filter(Boolean))].slice(0, 30);
  // el horario de recepción: un día una sola vez, con "desde" antes que "hasta"
  const horario = horarioDe(d.horarioRecepcion.dias).dias.filter((x, i, todos) => todos.findIndex(y => y.dia === x.dia) === i);
  return cambiar(usuario, async c => {
    const { rowCount } = await c.query(`
      insert into public.mantenimiento_config (registro_codigo, registro_version, registro_vigencia, controles_liberacion, recibe_liberacion, costo_hora, horario_recepcion)
      values ($1, $2, $3, $4, $5, $6, $7)
      on conflict (empresa_id) do update set registro_codigo = excluded.registro_codigo, registro_version = excluded.registro_version,
        registro_vigencia = excluded.registro_vigencia, controles_liberacion = excluded.controles_liberacion, recibe_liberacion = excluded.recibe_liberacion,
        costo_hora = excluded.costo_hora, horario_recepcion = excluded.horario_recepcion`,
      [texto(d.registroCodigo, 60), texto(d.registroVersion, 30), esDia(d.registroVigencia) ? d.registroVigencia : null, controles, texto(d.recibeLiberacion, 120),
        numeroONulo(d.costoHora, 1e9), JSON.stringify(horario)]);
    if (!rowCount) throw aviso('Solo quien administra Mantenimiento puede cambiar el formato de la OT.');
  }, 'No se pudo guardar el formato');
}
