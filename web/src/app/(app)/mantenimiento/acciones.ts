'use server';
import { z } from 'zod';
import type { PoolClient } from 'pg';
import { buscarEquipos as ordenarPorBusqueda, normalizar, palabrasDeBusqueda } from '@/features/mantenimiento/buscador';
import { type Actual, type Analisis, type Libro, analizarLibro, armarHojas, codigosDeRepuestos } from '@/features/mantenimiento/excel';
import type {
  ConfigMantenimiento, DuplicarInput, Equipo, EquipoDeLista, EquipoInput, FichaDeEquipo, GastoExterno, Intervencion, IntervencionInput, Manual, PlanillaTareas, RepuestoCritico, RepuestoParaElegir,
  Parada, Sector, Tecnico, ValorMedido,
} from '@/features/mantenimiento/tipos';
import { comoUsuario } from '~/lib/db';
import { Cantidad, Fecha, Id, IdONulo, Lista, Numero, SiNo, Texto, entrada } from '~/lib/entrada';
import { borrarArchivo } from '~/lib/archivos';
import { type FilaOrden, SQL_ORDENES, leerConfig, leerPlanillas, leerPreventivo, numero, ordenDe } from '~/lib/mantenimiento';
import { mensajeDe } from '~/lib/registroDeErrores';

// Mantenimiento, etapa 1: los equipos y su ficha. Todo se lee y se guarda como la persona: la base decide quién ve y quién cambia
// (supabase/componentes/mantenimiento/…_equipos_y_su_ficha.sql). Las respuestas tienen la forma de los tipos del socio
// (@/features/mantenimiento/tipos), así sus pantallas se usan casi sin cambios.

type Resultado = { error: string | null };
const esId = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f-]{36}$/i.test(v);
const esDia = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
const texto = (v: unknown, maximo: number) => (typeof v === 'string' ? v.trim().slice(0, maximo) : '');
const numeroONulo = (v: unknown, maximo = 100000): number | null => {
  const n = typeof v === 'number' ? v : Number(String(v ?? '').replace(',', '.'));
  return v === null || v === '' || v === undefined || !Number.isFinite(n) || n < 0 || n > maximo ? null : n;
};
/** Un aviso propio para el que repite un código o un nombre (la base lo rechaza por su índice único). */
const repetido = (e: unknown) => (e as { code?: string } | null)?.code === '23505';
const aviso = (mensaje: string) => Object.assign(new Error(mensaje), { code: 'P0001' });

async function cambiar(usuario: string, hacer: (c: PoolClient) => Promise<unknown>, porDefecto: string, siRepetido?: string): Promise<Resultado> {
  try {
    await comoUsuario(usuario, hacer);
    return { error: null };
  } catch (e) {
    if (siRepetido && repetido(e)) return { error: siRepetido };
    return { error: mensajeDe(e, porDefecto) };
  }
}

// ---------------------------------------------------------------------------------------------------------------------------------------------
// Lectura
// ---------------------------------------------------------------------------------------------------------------------------------------------

// Cada equipo con el nombre de su sector (y de su sub-sector, si el elegido es un sub-sector).
const SQL_EQUIPOS = `
  select e.id, e.codigo, e.nombre, e.sector_id, coalesce(sp.nombre, s.nombre, '') as sector, case when sp.id is null then '' else s.nombre end as subsector,
         e.etiquetas, e.marca, e.modelo, e.numero_serie, e.ubicacion, e.critico, e.notas, e.padre_id
  from public.equipos e
  left join public.equipo_sectores s on s.id = e.sector_id
  left join public.equipo_sectores sp on sp.id = s.padre_id`;

interface FilaEquipo {
  id: string; codigo: string; nombre: string; sector_id: string | null; sector: string; subsector: string; etiquetas: string[]; marca: string;
  modelo: string; numero_serie: string; ubicacion: string; critico: boolean; notas: string; padre_id: string | null;
}
const equipoDe = (f: FilaEquipo): Equipo => ({
  id: f.id, codigo: f.codigo, nombre: f.nombre, sectorId: f.sector_id, sector: f.sector, subsector: f.subsector, etiquetas: f.etiquetas ?? [],
  marca: f.marca, modelo: f.modelo, numeroSerie: f.numero_serie, ubicacion: f.ubicacion, critico: f.critico, notas: f.notas, padreId: f.padre_id,
});

interface FilaRepuesto { equipo_id: string; item_id: string; codigo: string; descripcion: string; stock: string | null; ubicacion: string | null; deposito: string | null; cantidad: string; nota: string }
const repuestoDe = (f: FilaRepuesto): RepuestoCritico => ({
  equipoId: f.equipo_id, itemId: f.item_id, codigo: f.codigo, descripcion: f.descripcion ?? '', cantidad: Number(f.cantidad), nota: f.nota,
  stock: f.stock === null ? null : Number(f.stock), ubicacion: f.ubicacion, deposito: f.deposito,
});
/** Falta si en el Depósito hay menos de lo que conviene tener (al menos uno). */
const falta = (r: Pick<RepuestoCritico, 'stock' | 'cantidad'>) => (r.stock ?? 0) < Math.max(1, r.cantidad);

const repuestosDe = async (c: PoolClient, equipos: string[]) => equipos.length
  ? (await c.query<FilaRepuesto>('select * from public.repuestos_criticos_de($1::uuid[])', [equipos])).rows.map(repuestoDe)
  : [];

const SQL_INTERVENCIONES = `
  select i.id, i.equipo_id, i.fecha, i.tipo, i.descripcion, i.horas, i.prioridad, i.falla, i.causa, i.solucion, i.horas_parada, i.repuestos, i.ot_numero,
         i.revisado_por, i.aprobado_por,
         coalesce((select jsonb_agg(jsonb_build_object('codigo', x.codigo, 'descripcion', x.descripcion, 'componente', x.componente, 'cantidad', x.usado, 'precio', x.precio)
                     order by x.orden) from public.ot_repuestos x where i.ot_id is not null and x.ot_id = i.ot_id and x.usado > 0), '[]') as repuestos_ot,
         coalesce((select jsonb_agg(jsonb_build_object('id', t.usuario_id, 'nombre', t.nombre, 'fecha', coalesce(t.fecha::text, ''),
                     'inicio', coalesce(to_char(t.inicio, 'HH24:MI'), ''), 'fin', coalesce(to_char(t.fin, 'HH24:MI'), '')) order by t.orden)
                   from public.intervencion_tecnicos t where t.intervencion_id = i.id), '[]') as tecnicos
  from public.equipo_intervenciones i`;
interface FilaIntervencion {
  id: string; equipo_id: string; fecha: string; tipo: 'correctivo' | 'preventivo'; descripcion: string; horas: string | null; prioridad: 'normal' | 'urgente' | null;
  falla: string; causa: string; solucion: string; horas_parada: string | null; repuestos: string; ot_numero: string | null; tecnicos: Intervencion['tecnicos'];
  revisado_por: string; aprobado_por: string;
  repuestos_ot: { codigo: string; descripcion: string; componente: string; cantidad: string | number; precio: string | number | null }[];
}
const intervencionDe = (f: FilaIntervencion): Intervencion => ({
  id: f.id, equipoId: f.equipo_id, fecha: f.fecha, tipo: f.tipo, descripcion: f.descripcion, tecnicos: f.tecnicos,
  horas: f.horas === null ? null : Number(f.horas), repuestosUsados: f.repuestos, otNumero: f.ot_numero,
  correctivo: f.tipo === 'correctivo'
    ? { prioridad: f.prioridad ?? 'normal', falla: f.falla, causa: f.causa, solucion: f.solucion, horasParada: f.horas_parada === null ? null : Number(f.horas_parada) }
    : null,
  horasParada: f.horas_parada === null ? null : Number(f.horas_parada),
  revisadoPor: f.revisado_por, aprobadoPor: f.aprobado_por,
  repuestos: f.repuestos_ot.map(r => ({ codigo: r.codigo, descripcion: r.descripcion, componente: r.componente, cantidad: Number(r.cantidad), precio: numero(r.precio) })),
});

/** Quienes pueden figurar en un trabajo, ser responsables de una rutina o tener una OT asignada: los dueños, el responsable, el jefe de taller y los técnicos. */
const SQL_TECNICOS = `
  select id, coalesce(nullif(btrim(concat(nombre, ' ', apellido)), ''), email) as nombre from public.usuarios_perfil
  where activo and (es_owner or rol_equipos in ('admin', 'jefe', 'tecnico')) order by 2`;

export interface DatosDeMantenimiento {
  equipos: EquipoDeLista[];
  sectores: Sector[];
  /** Quienes pueden figurar en un trabajo: los administradores y técnicos de Mantenimiento. */
  tecnicos: Tecnico[];
  /** Las planillas de tareas y el formato de la OT (etapa 3). */
  planillas: PlanillaTareas[];
  config: ConfigMantenimiento;
}

/** La lista de equipos con lo que muestra cada tarjeta, los sectores y los técnicos, en una sola ida a la base. */
export async function datosDeMantenimiento(): Promise<DatosDeMantenimiento> {
  const usuario = await entrada('datosDeMantenimiento');
  return comoUsuario(usuario, async c => {
    const filas = (await c.query<FilaEquipo & { ultimo_fecha: string | null; ultimo_tipo: 'correctivo' | 'preventivo' | null; correctivo_reciente: boolean }>(`
      select x.*, u.fecha as ultimo_fecha, u.tipo as ultimo_tipo,
             exists (select 1 from public.equipo_intervenciones i
                     where i.equipo_id = x.id and i.tipo = 'correctivo' and i.fecha >= public.hoy_local() - 30) as correctivo_reciente
      from (${SQL_EQUIPOS}) x
      left join lateral (select i.fecha, i.tipo from public.equipo_intervenciones i where i.equipo_id = x.id order by i.fecha desc, i.created_at desc limit 1) u on true
      order by x.nombre`)).rows;
    const repuestos = await repuestosDe(c, filas.map(f => f.id));
    const conFalta = new Set(repuestos.filter(falta).map(r => r.equipoId));
    const sectores = (await c.query<{ id: string; nombre: string; padre_id: string | null; orden: number | null }>(
      'select id, nombre, padre_id, orden from public.equipo_sectores order by orden nulls last, nombre')).rows;
    const tecnicos = (await c.query<Tecnico>(SQL_TECNICOS)).rows;
    const planillas = await leerPlanillas(c);
    const config = await leerConfig(c);
    return {
      planillas,
      config,
      equipos: filas.map(f => ({
        ...equipoDe(f),
        resumen: {
          ultimo: f.ultimo_fecha && f.ultimo_tipo ? { fecha: f.ultimo_fecha, tipo: f.ultimo_tipo } : null,
          correctivoReciente: f.correctivo_reciente,
          faltaRepuesto: conFalta.has(f.id),
        },
      })),
      sectores: sectores.map(s => ({ id: s.id, nombre: s.nombre, padreId: s.padre_id, orden: s.orden })),
      tecnicos,
    };
  });
}

/** El escape de un patrón LIKE (que % y _ sean letras). */
const literal = (p: string) => p.replace(/[\\%_]/g, m => `\\${m}`);

/**
 * Los equipos que coinciden con lo escrito, ordenados, y dónde coincidió cada uno. La base trae solo el historial que tiene alguna de las
 * palabras; el orden y los motivos los decide el buscador del socio (@/features/mantenimiento/buscador).
 */
export async function buscarEquipos(consulta: string): Promise<{ id: string; motivos: string[] }[]> {
  const usuario = await entrada('buscarEquipos', [Texto(200)], [consulta]);
  const palabras = palabrasDeBusqueda(texto(consulta, 200)).slice(0, 8);
  if (!palabras.length) return [];
  return comoUsuario(usuario, async c => {
    const equipos = (await c.query<FilaEquipo>(SQL_EQUIPOS)).rows.map(equipoDe);
    const intervenciones = (await c.query<FilaIntervencion>(`${SQL_INTERVENCIONES}
      where public.texto_de_busqueda(concat_ws(' ', i.tipo, i.descripcion, i.repuestos, i.falla, i.causa, i.solucion,
              (select string_agg(t.nombre, ' ') from public.intervencion_tecnicos t where t.intervencion_id = i.id))) like any ($1::text[])
      order by i.fecha desc limit 2000`, [palabras.map(p => `%${literal(p)}%`)])).rows.map(intervencionDe);
    const repuestos = await repuestosDe(c, equipos.map(e => e.id));
    const manuales = (await c.query<{ equipo_id: string; nombre: string }>('select equipo_id, nombre from public.equipo_manuales')).rows;
    const porId = new Map(equipos.map(e => [e.id, e]));
    const agrupar = <T,>(lista: T[], clave: (x: T) => string) => {
      const m = new Map<string, T[]>();
      for (const x of lista) m.set(clave(x), [...(m.get(clave(x)) ?? []), x]);
      return m;
    };
    const deIntervenciones = agrupar(intervenciones, i => i.equipoId);
    const deRepuestos = agrupar(repuestos, r => r.equipoId);
    const deManuales = agrupar(manuales, m => m.equipo_id);
    return ordenarPorBusqueda(equipos, consulta, id => ({
      intervenciones: deIntervenciones.get(id) ?? [],
      repuestos: deRepuestos.get(id) ?? [],
      manuales: deManuales.get(id) ?? [],
      padre: porId.get(porId.get(id)?.padreId ?? '') ?? null,
    })).map(r => ({ id: r.equipo.id, motivos: r.motivos }));
  });
}

/** Todo lo de un equipo junto (su ficha); null si no existe o no se puede ver. */
export async function fichaDeEquipo(id: string): Promise<FichaDeEquipo | null> {
  const usuario = await entrada('fichaDeEquipo', [Id], [id]);
  if (!esId(id)) return null;
  return comoUsuario(usuario, async c => {
    const [fila] = (await c.query<FilaEquipo>(`${SQL_EQUIPOS} where e.id = $1`, [id])).rows;
    if (!fila) return null;
    const equipo = equipoDe(fila);
    const padre = equipo.padreId ? (await c.query<FilaEquipo>(`${SQL_EQUIPOS} where e.id = $1`, [equipo.padreId])).rows.map(equipoDe)[0] ?? null : null;
    const subs = (await c.query<FilaEquipo & { ultimo_fecha: string | null; ultimo_tipo: 'correctivo' | 'preventivo' | null }>(`
      select x.*, u.fecha as ultimo_fecha, u.tipo as ultimo_tipo from (${SQL_EQUIPOS} where e.padre_id = $1) x
      left join lateral (select i.fecha, i.tipo from public.equipo_intervenciones i where i.equipo_id = x.id order by i.fecha desc, i.created_at desc limit 1) u on true
      order by x.codigo`, [id])).rows;
    const intervenciones = (await c.query<FilaIntervencion>(`${SQL_INTERVENCIONES} where i.equipo_id = $1 order by i.fecha desc, i.created_at desc`, [id])).rows.map(intervencionDe);
    const intervencionesSub = subs.length ? (await c.query<FilaIntervencion>(`${SQL_INTERVENCIONES} where i.equipo_id = any ($1::uuid[]) order by i.fecha desc, i.created_at desc`,
      [subs.map(s => s.id)])).rows.map(intervencionDe) : [];
    const repuestos = await repuestosDe(c, [id, ...subs.map(s => s.id)]);
    const manuales = (await c.query<{ id: string; equipo_id: string; nombre: string; tamanio_bytes: string | null; subido_el: string }>(`
      select id, equipo_id, nombre, tamanio_bytes, public.fecha_local(created_at)::text as subido_el
      from public.equipo_manuales where equipo_id = $1 order by created_at`, [id])).rows;
    const { rutinas, ordenes } = await leerPreventivo(c, [id]);
    const mediciones = (await c.query<{ tarea: string; unidad: string; minimo: string | null; maximo: string | null; valor: string; fecha: string; ot: string }>(`
      select t.texto as tarea, t.unidad, t.minimo, t.maximo, t.valor, o.fecha_cierre::text as fecha, o.numero as ot
      from public.ot_tareas t join public.ordenes_trabajo o on o.id = t.ot_id
      where o.equipo_id = $1 and o.etapa = 'aprobada' and t.mide and t.valor is not null
      order by o.fecha_cierre, o.numero, t.orden limit 2000`, [id])).rows
      .map((m): ValorMedido => ({ tarea: m.tarea, unidad: m.unidad, minimo: numero(m.minimo), maximo: numero(m.maximo), valor: Number(m.valor), fecha: m.fecha, ot: Number(m.ot) }));
    const gastos = (await c.query<{ id: string; equipo_id: string; fecha: string; proveedor: string; descripcion: string; monto: string }>(`
      select id, equipo_id, fecha::text, proveedor, descripcion, monto from public.equipo_gastos_externos where equipo_id = any ($1::uuid[]) order by fecha desc, created_at desc`,
      [[id, ...subs.map(s => s.id)]])).rows.map((g): GastoExterno => ({ id: g.id, equipoId: g.equipo_id, fecha: g.fecha, proveedor: g.proveedor, descripcion: g.descripcion, monto: Number(g.monto) }));
    return {
      equipo,
      mediciones,
      gastos,
      padre,
      rutinas,
      ordenes: ordenes.filter(o => o.estado !== 'terminada'),
      subEquipos: subs.map(s => ({
        ...equipoDe(s),
        resumen: {
          ultimo: s.ultimo_fecha && s.ultimo_tipo ? { fecha: s.ultimo_fecha, tipo: s.ultimo_tipo } : null,
          correctivoReciente: false,
          faltaRepuesto: repuestos.some(r => r.equipoId === s.id && falta(r)),
        },
      })),
      intervenciones,
      intervencionesSub,
      repuestos: repuestos.filter(r => r.equipoId === id),
      manuales: manuales.map((m): Manual => ({
        id: m.id, equipoId: m.equipo_id, nombre: m.nombre, url: `/mantenimiento/manuales/${m.id}`,
        tamanioBytes: m.tamanio_bytes === null ? null : Number(m.tamanio_bytes), subidoEl: m.subido_el,
      })),
    };
  });
}

// ---------------------------------------------------------------------------------------------------------------------------------------------
// Equipos
// ---------------------------------------------------------------------------------------------------------------------------------------------

const EquipoRecibido = z.object({
  id: IdONulo, codigo: Texto(100), nombre: Texto(300), sector: Texto(200), subsector: Texto(200), etiquetas: Lista(Texto(60), 40), marca: Texto(200), modelo: Texto(200),
  numeroSerie: Texto(200), ubicacion: Texto(300), critico: SiNo, notas: Texto(4000), padreId: IdONulo,
});

/** El sector (o sub-sector) con ese nombre, sin importar mayúsculas ni tildes; si no existe, se crea (solo quien administra puede). */
async function sectorPorNombre(c: PoolClient, sector: string, subsector: string): Promise<string | null> {
  if (!sector) return null;
  const buscar = async (nombre: string, padre: string | null) => (await c.query<{ id: string }>(`select id from public.equipo_sectores
      where padre_id is not distinct from $2 and public.texto_de_busqueda(btrim(nombre)) = public.texto_de_busqueda(btrim($1))`, [nombre, padre])).rows[0]?.id
    ?? (await c.query<{ id: string }>(`insert into public.equipo_sectores (nombre, padre_id, orden)
      values ($1, $2, case when $2::uuid is null then (select coalesce(max(orden), 0) + 1 from public.equipo_sectores where padre_id is null) end) returning id`,
      [nombre, padre])).rows[0].id;
  const id = await buscar(sector, null);
  return subsector ? buscar(subsector, id) : id;
}

/** Crea o cambia un equipo. Devuelve su id. */
export async function guardarEquipo(e: EquipoInput): Promise<Resultado & { id?: string }> {
  const usuario = await entrada('guardarEquipo', [EquipoRecibido], [e]);
  const codigo = texto(e.codigo, 40), nombre = texto(e.nombre, 160);
  if (!codigo || !nombre) return { error: 'Completá el código y el nombre.' };
  const etiquetas = [...new Set((e.etiquetas ?? []).map(t => texto(t, 40)).filter(Boolean))].slice(0, 30);
  const valores = [codigo, nombre, null as string | null, etiquetas, texto(e.marca, 120), texto(e.modelo, 120), texto(e.numeroSerie, 120),
    texto(e.ubicacion, 200), e.critico === true, texto(e.notas, 4000), e.padreId || null];
  let id = e.id ?? '';
  const r = await cambiar(usuario, async c => {
    valores[2] = await sectorPorNombre(c, texto(e.sector, 80), texto(e.subsector, 80));
    if (e.id) {
      const { rowCount } = await c.query(`update public.equipos set codigo = $2, nombre = $3, sector_id = $4, etiquetas = $5, marca = $6, modelo = $7,
          numero_serie = $8, ubicacion = $9, critico = $10, notas = $11, padre_id = $12 where id = $1`, [e.id, ...valores]);
      if (!rowCount) throw aviso('No podés cambiar este equipo.');
    } else {
      id = (await c.query<{ id: string }>(`insert into public.equipos (codigo, nombre, sector_id, etiquetas, marca, modelo, numero_serie, ubicacion, critico, notas, padre_id)
          values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) returning id`, valores)).rows[0].id;
    }
  }, 'No se pudo guardar el equipo', `Ya existe un equipo con el código ${codigo}.`);
  return r.error ? r : { error: null, id };
}

/** Las rutas de los manuales de estos equipos: al borrar los equipos, sus archivos también se van. */
async function sacarManuales(c: PoolClient, equipos: string[]): Promise<string[]> {
  const rutas = (await c.query<{ ruta: string }>('select ruta from public.equipo_manuales where equipo_id = any ($1::uuid[])', [equipos])).rows.map(r => r.ruta);
  if (rutas.length) await c.query(`delete from storage.objects where bucket_id = 'manuales' and name = any ($1::text[])`, [rutas]);
  return rutas;
}

/** Borra el equipo (y sus sub-equipos) con todo lo suyo: historial, repuestos críticos y manuales. */
export async function eliminarEquipo(id: string): Promise<Resultado> {
  const usuario = await entrada('eliminarEquipo', [Id], [id]);
  if (!esId(id)) return { error: 'Equipo no válido' };
  let rutas: string[] = [];
  const r = await cambiar(usuario, async c => {
    const ids = (await c.query<{ id: string }>('select id from public.equipos where id = $1 or padre_id = $1', [id])).rows.map(x => x.id);
    rutas = await sacarManuales(c, ids);
    const { rowCount } = await c.query('delete from public.equipos where id = $1', [id]);
    if (!rowCount) throw aviso('No podés eliminar este equipo.');
  }, 'No se pudo eliminar el equipo');
  if (!r.error) for (const ruta of rutas) await borrarArchivo('manuales', ruta);
  return r;
}

const Duplicado = z.object({ id: Id, codigo: Texto(100), nombre: Texto(300), numeroSerie: Texto(200) });

/**
 * Copia un equipo con sus sub-equipos y sus repuestos críticos, para cargar rápido equipos iguales (4 pasteurizadores). Los códigos de los
 * sub-equipos cambian el principio: PA-01-B1 pasa a PA-02-B1. El historial y los manuales no se copian. Devuelve el id del nuevo.
 */
export async function duplicarEquipo(d: DuplicarInput): Promise<Resultado & { id?: string }> {
  const usuario = await entrada('duplicarEquipo', [Duplicado], [d]);
  const codigo = texto(d.codigo, 40), nombre = texto(d.nombre, 160);
  if (!esId(d.id) || !codigo || !nombre) return { error: 'Completá el código y el nombre.' };
  let nuevo = '';
  let choca = codigo;
  try {
    await comoUsuario(usuario, async c => {
      const [original] = (await c.query<{ codigo: string }>('select codigo from public.equipos where id = $1 and padre_id is null', [d.id])).rows;
      if (!original) throw aviso('No se encontró el equipo principal.');
      const copiar = `insert into public.equipos (codigo, nombre, sector_id, etiquetas, marca, modelo, numero_serie, ubicacion, critico, notas, padre_id)
        select $2::text, $3::text, sector_id, etiquetas, marca, modelo, $4::text, ubicacion, critico, notas, $5::uuid from public.equipos where id = $1 returning id`;
      nuevo = (await c.query<{ id: string }>(copiar, [d.id, codigo, nombre, texto(d.numeroSerie, 120), null])).rows[0].id;
      const mapa: [string, string][] = [[d.id, nuevo]];
      const hijos = (await c.query<{ id: string; codigo: string; nombre: string }>('select id, codigo, nombre from public.equipos where padre_id = $1 order by codigo', [d.id])).rows;
      for (const h of hijos) {
        choca = h.codigo.startsWith(original.codigo) ? codigo + h.codigo.slice(original.codigo.length) : `${codigo}-${h.codigo}`;
        const id = (await c.query<{ id: string }>(copiar, [h.id, choca.slice(0, 40), h.nombre, '', nuevo])).rows[0].id;
        mapa.push([h.id, id]);
      }
      for (const [de, a] of mapa) {
        await c.query('insert into public.equipo_items (equipo_id, item_id, cantidad, nota) select $2, item_id, cantidad, nota from public.equipo_items where equipo_id = $1', [de, a]);
      }
    });
  } catch (e) {
    return { error: repetido(e) ? `Ya existe un equipo con el código ${choca}.` : mensajeDe(e, 'No se pudo duplicar el equipo') };
  }
  return { error: null, id: nuevo };
}

// ---------------------------------------------------------------------------------------------------------------------------------------------
// Sectores y sub-sectores
// ---------------------------------------------------------------------------------------------------------------------------------------------

export async function crearSector(nombre: string, padreId: string | null): Promise<Resultado> {
  const usuario = await entrada('crearSector', [Texto(200), IdONulo], [nombre, padreId]);
  const n = texto(nombre, 80);
  if (!n) return { error: 'Escribí el nombre.' };
  return cambiar(usuario, c => c.query(
    `insert into public.equipo_sectores (nombre, padre_id, orden)
     values ($1, $2, case when $2::uuid is null then (select coalesce(max(orden), 0) + 1 from public.equipo_sectores where padre_id is null) end)`,
    [n, padreId || null]), 'No se pudo crear', padreId ? `Ya existe "${n}" en ese sector.` : `Ya existe el sector "${n}".`);
}

/**
 * Cambia el nombre (se ve en todos sus equipos). Si ya hay otro igual en el mismo nivel, los dos quedan juntos en ese: sus equipos y
 * sus sub-sectores pasan al otro.
 */
export async function renombrarSector(id: string, nombre: string): Promise<Resultado> {
  const usuario = await entrada('renombrarSector', [Id, Texto(200)], [id, nombre]);
  const n = texto(nombre, 80);
  if (!esId(id) || !n) return { error: 'Escribí el nombre nuevo.' };
  return cambiar(usuario, async c => {
    const [actual] = (await c.query<{ padre_id: string | null }>('select padre_id from public.equipo_sectores where id = $1', [id])).rows;
    if (!actual) throw aviso('No se encontró el sector.');
    const [otro] = (await c.query<{ id: string }>(`select id from public.equipo_sectores where id <> $1 and padre_id is not distinct from $2
        and public.texto_de_busqueda(btrim(nombre)) = public.texto_de_busqueda(btrim($3))`, [id, actual.padre_id, n])).rows;
    if (!otro) {
      const { rowCount } = await c.query('update public.equipo_sectores set nombre = $2 where id = $1', [id, n]);
      if (!rowCount) throw aviso('No podés cambiar los sectores.');
      return;
    }
    // juntar: los sub-sectores que se llaman igual se juntan también; los demás pasan al otro sector
    for (const sub of (await c.query<{ id: string; nombre: string }>('select id, nombre from public.equipo_sectores where padre_id = $1', [id])).rows) {
      const [igual] = (await c.query<{ id: string }>(`select id from public.equipo_sectores where padre_id = $1
          and public.texto_de_busqueda(btrim(nombre)) = public.texto_de_busqueda(btrim($2))`, [otro.id, sub.nombre])).rows;
      if (igual) {
        await c.query('update public.equipos set sector_id = $2 where sector_id = $1', [sub.id, igual.id]);
        await c.query('delete from public.equipo_sectores where id = $1', [sub.id]);
      } else {
        await c.query('update public.equipo_sectores set padre_id = $2 where id = $1', [sub.id, otro.id]);
      }
    }
    await c.query('update public.equipos set sector_id = $2 where sector_id = $1', [id, otro.id]);
    const { rowCount } = await c.query('delete from public.equipo_sectores where id = $1', [id]);
    if (!rowCount) throw aviso('No podés cambiar los sectores.');
  }, 'No se pudo cambiar el nombre');
}

/** Borra el sector (y sus sub-sectores): sus equipos quedan sin sector. Un sub-sector: sus equipos quedan en el sector. */
export async function eliminarSector(id: string): Promise<Resultado> {
  const usuario = await entrada('eliminarSector', [Id], [id]);
  if (!esId(id)) return { error: 'Sector no válido' };
  return cambiar(usuario, async c => {
    await c.query(`update public.equipos e set sector_id = s.padre_id from public.equipo_sectores s where s.id = $1 and s.padre_id is not null and e.sector_id = s.id`, [id]);
    const { rowCount } = await c.query('delete from public.equipo_sectores where id = $1', [id]);
    if (!rowCount) throw aviso('No podés borrar este sector.');
  }, 'No se pudo borrar');
}

/** Sube o baja un sector un lugar en el orden de importancia. */
export async function moverSector(id: string, delta: number): Promise<Resultado> {
  const usuario = await entrada('moverSector', [Id, Numero(-1, 1)], [id, delta]);
  if (!esId(id) || (delta !== -1 && delta !== 1)) return { error: 'Sector no válido' };
  return cambiar(usuario, async c => {
    const lista = (await c.query<{ id: string }>('select id from public.equipo_sectores where padre_id is null order by orden nulls last, nombre')).rows.map(s => s.id);
    const i = lista.indexOf(id), j = i + delta;
    if (i < 0 || j < 0 || j >= lista.length) return;
    [lista[i], lista[j]] = [lista[j], lista[i]];
    await c.query('update public.equipo_sectores s set orden = o.n from unnest($1::uuid[]) with ordinality as o(id, n) where s.id = o.id', [lista]);
  }, 'No se pudo cambiar el orden');
}

// ---------------------------------------------------------------------------------------------------------------------------------------------
// Repuestos críticos
// ---------------------------------------------------------------------------------------------------------------------------------------------

export async function buscarRepuestosParaEquipos(textoBuscado: string): Promise<RepuestoParaElegir[]> {
  const usuario = await entrada('buscarRepuestosParaEquipos', [Texto(200)], [textoBuscado]);
  const t = texto(textoBuscado, 100);
  if (t.length < 2) return [];
  return comoUsuario(usuario, async c => (await c.query<{ id: string; codigo: string; descripcion: string; stock: string | null; deposito: string | null }>(
    'select * from public.repuestos_para_equipos($1, 8)', [t])).rows.map(r => ({ ...r, stock: r.stock === null ? null : Number(r.stock) })));
}

const RepuestoRecibido = z.object({ equipoId: Id, itemId: Id, cantidad: Cantidad, nota: Texto(1000), nuevo: SiNo });

export async function guardarRepuestoCritico(r: { equipoId: string; itemId: string; cantidad: number | string; nota: string; nuevo: boolean }): Promise<Resultado> {
  const usuario = await entrada('guardarRepuestoCritico', [RepuestoRecibido], [r]);
  const cantidad = numeroONulo(r.cantidad, 1000000);
  if (!esId(r.equipoId) || !esId(r.itemId)) return { error: 'Elegí un repuesto.' };
  if (!cantidad) return { error: 'La cantidad tiene que ser un número mayor que cero.' };
  return cambiar(usuario, async c => {
    if (r.nuevo) {
      await c.query('insert into public.equipo_items (equipo_id, item_id, cantidad, nota) values ($1, $2, $3, $4)', [r.equipoId, r.itemId, cantidad, texto(r.nota, 300)]);
    } else {
      const { rowCount } = await c.query('update public.equipo_items set cantidad = $3, nota = $4 where equipo_id = $1 and item_id = $2',
        [r.equipoId, r.itemId, cantidad, texto(r.nota, 300)]);
      if (!rowCount) throw aviso('No podés cambiar los repuestos de este equipo.');
    }
  }, 'No se pudo guardar el repuesto', 'Ese repuesto ya está en la lista de este equipo.');
}

export async function quitarRepuestoCritico(equipoId: string, itemId: string): Promise<Resultado> {
  const usuario = await entrada('quitarRepuestoCritico', [Id, Id], [equipoId, itemId]);
  if (!esId(equipoId) || !esId(itemId)) return { error: 'Repuesto no válido' };
  return cambiar(usuario, async c => {
    const { rowCount } = await c.query('delete from public.equipo_items where equipo_id = $1 and item_id = $2', [equipoId, itemId]);
    if (!rowCount) throw aviso('No podés cambiar los repuestos de este equipo.');
  }, 'No se pudo quitar el repuesto');
}

// ---------------------------------------------------------------------------------------------------------------------------------------------
// Manuales (subirlos y abrirlos va por manuales/route.ts: un PDF puede pasar el tope de las acciones)
// ---------------------------------------------------------------------------------------------------------------------------------------------

export async function quitarManual(id: string): Promise<Resultado> {
  const usuario = await entrada('quitarManual', [Id], [id]);
  if (!esId(id)) return { error: 'Manual no válido' };
  let ruta = '';
  const r = await cambiar(usuario, async c => {
    const [m] = (await c.query<{ ruta: string }>('delete from public.equipo_manuales where id = $1 returning ruta', [id])).rows;
    if (!m) throw aviso('No podés quitar este manual.');
    ruta = m.ruta;
    await c.query(`delete from storage.objects where bucket_id = 'manuales' and name = $1`, [ruta]);
  }, 'No se pudo quitar el manual');
  if (!r.error) await borrarArchivo('manuales', ruta);
  return r;
}

// ---------------------------------------------------------------------------------------------------------------------------------------------
// Historial
// ---------------------------------------------------------------------------------------------------------------------------------------------

const IntervencionRecibida = z.object({
  id: IdONulo, equipoId: Id, fecha: Fecha, tipo: z.enum(['correctivo', 'preventivo']), descripcion: Texto(8000), tecnicos: Lista(Id, 20),
  horas: z.union([Cantidad, z.null()]), repuestosUsados: Texto(4000),
  correctivo: z.object({
    prioridad: z.enum(['normal', 'urgente']), falla: Texto(8000), causa: Texto(8000), solucion: Texto(8000), horasParada: z.union([Cantidad, z.null()]),
  }).nullable(),
  horasParada: z.union([Cantidad, z.null()]).optional(),
});

/** Registra (o corrige) un trabajo en el historial del equipo, con quiénes lo hicieron. */
export async function guardarIntervencion(i: IntervencionInput): Promise<Resultado> {
  const usuario = await entrada('guardarIntervencion', [IntervencionRecibida], [i]);
  const descripcion = texto(i.descripcion, 4000);
  if (!esId(i.equipoId) || !esDia(i.fecha)) return { error: 'Faltan datos del registro.' };
  if (!descripcion) return { error: 'Contá qué se hizo.' };
  const c_ = i.tipo === 'correctivo' ? i.correctivo : null;
  // las horas de equipo parado se anotan también en los preventivos (para la disponibilidad)
  const valores = [i.equipoId, i.fecha, i.tipo, descripcion, numeroONulo(i.horas), c_ ? c_.prioridad : null, texto(c_?.falla, 4000), texto(c_?.causa, 4000),
    texto(c_?.solucion, 4000), c_ ? numeroONulo(c_.horasParada) : numeroONulo(i.horasParada), texto(i.repuestosUsados, 2000)];
  return cambiar(usuario, async c => {
    let id = i.id;
    if (id) {
      const { rowCount } = await c.query(`update public.equipo_intervenciones set equipo_id = $2, fecha = $3, tipo = $4, descripcion = $5, horas = $6, prioridad = $7,
          falla = $8, causa = $9, solucion = $10, horas_parada = $11, repuestos = $12 where id = $1`, [id, ...valores]);
      if (!rowCount) throw aviso('No podés cambiar este registro.');
      await c.query('delete from public.intervencion_tecnicos where intervencion_id = $1', [id]);
    } else {
      id = (await c.query<{ id: string }>(`insert into public.equipo_intervenciones
          (equipo_id, fecha, tipo, descripcion, horas, prioridad, falla, causa, solucion, horas_parada, repuestos, creado_por)
          values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, auth.uid()) returning id`, valores)).rows[0].id;
    }
    // los técnicos, con su nombre de hoy (queda escrito aunque un día se borre el usuario)
    await c.query(`insert into public.intervencion_tecnicos (intervencion_id, usuario_id, nombre, orden)
      select $1, u.id, coalesce(nullif(btrim(concat(u.nombre, ' ', u.apellido)), ''), u.email), o.n
      from unnest($2::uuid[]) with ordinality as o(id, n) join public.usuarios_perfil u on u.id = o.id`, [id, [...new Set(i.tecnicos.filter(esId))]]);
  }, 'No se pudo guardar el registro');
}

// ---------------------------------------------------------------------------------------------------------------------------------------------
// Disponibilidad y costos (del socio, 06/11/2026)
// ---------------------------------------------------------------------------------------------------------------------------------------------

/** Las paradas por mantenimiento de todos los equipos en un período (salen del historial): para el Inicio de Mantenimiento. */
export async function paradasDeEquipos(desde: string, hasta: string): Promise<Parada[]> {
  const usuario = await entrada('paradasDeEquipos', [Fecha, Fecha], [desde, hasta]);
  if (!esDia(desde) || !esDia(hasta)) return [];
  return comoUsuario(usuario, async c => (await c.query<{ equipo_id: string; fecha: string; tipo: 'correctivo' | 'preventivo'; horas: string }>(`
    select equipo_id, fecha::text, tipo, horas_parada as horas from public.equipo_intervenciones
    where fecha between $1 and $2 and horas_parada > 0`, [desde, hasta])).rows.map(p => ({ equipoId: p.equipo_id, fecha: p.fecha, tipo: p.tipo, horas: Number(p.horas) })));
}

const GastoRecibido = z.object({ equipoId: Id, fecha: Fecha, proveedor: Texto(400), descripcion: Texto(1000), monto: Cantidad });

/** Carga un gasto de un servicio externo en el equipo (solo quien administra Mantenimiento). */
export async function guardarGastoExterno(g: Omit<GastoExterno, 'id'>): Promise<Resultado> {
  const usuario = await entrada('guardarGastoExterno', [GastoRecibido], [g]);
  const descripcion = texto(g.descripcion, 500);
  const monto = numeroONulo(g.monto, 1e12);
  if (!esId(g.equipoId) || !esDia(g.fecha)) return { error: 'Faltan datos del gasto.' };
  if (!descripcion) return { error: 'Contá qué se hizo.' };
  if (monto === null) return { error: 'El monto tiene que ser un número.' };
  return cambiar(usuario, c => c.query(`insert into public.equipo_gastos_externos (equipo_id, fecha, proveedor, descripcion, monto, creado_por)
      values ($1, $2, $3, $4, $5, auth.uid())`, [g.equipoId, g.fecha, texto(g.proveedor, 160), descripcion, monto]), 'No se pudo guardar el gasto');
}

export async function eliminarGastoExterno(id: string): Promise<Resultado> {
  const usuario = await entrada('eliminarGastoExterno', [Id], [id]);
  if (!esId(id)) return { error: 'Gasto no válido' };
  return cambiar(usuario, async c => {
    const { rowCount } = await c.query('delete from public.equipo_gastos_externos where id = $1', [id]);
    if (!rowCount) throw aviso('Solo quien administra Mantenimiento puede borrar gastos.');
  }, 'No se pudo borrar el gasto');
}

export async function eliminarIntervencion(id: string): Promise<Resultado> {
  const usuario = await entrada('eliminarIntervencion', [Id], [id]);
  if (!esId(id)) return { error: 'Registro no válido' };
  return cambiar(usuario, async c => {
    const { rowCount } = await c.query('delete from public.equipo_intervenciones where id = $1', [id]);
    if (!rowCount) throw aviso('No podés borrar registros del historial.');
  }, 'No se pudo borrar el registro');
}

// ---------------------------------------------------------------------------------------------------------------------------------------------
// Excel: importar (con vista previa) y exportar. El archivo se lee en el navegador (@/features/mantenimiento/excel) y viaja como filas;
// acá se revisa contra lo que hay y se guarda todo junto: si algo falla, no queda nada a medias.
// ---------------------------------------------------------------------------------------------------------------------------------------------

const LibroRecibido = z.record(z.string().max(100), Lista(Lista(z.union([z.string().max(4000), z.number().finite(), z.null()]), 40), 5001))
  .refine(l => Object.keys(l).length <= 20, 'demasiadas hojas');

/** Lo que ya hay en la base, para comparar con el archivo. */
async function loQueHay(c: PoolClient, libro: Libro): Promise<Actual> {
  const sectores = (await c.query<{ id: string; nombre: string; padre_id: string | null; orden: number | null }>(
    'select id, nombre, padre_id, orden from public.equipo_sectores')).rows.map(s => ({ id: s.id, nombre: s.nombre, padreId: s.padre_id, orden: s.orden }));
  const equipos = (await c.query<FilaEquipo>(SQL_EQUIPOS)).rows.map(equipoDe);
  const intervenciones = new Set((await c.query<{ codigo: string; fecha: string; tipo: string; descripcion: string }>(`
    select e.codigo, i.fecha, i.tipo, i.descripcion from public.equipo_intervenciones i join public.equipos e on e.id = i.equipo_id`)).rows
    .map(i => `${normalizar(i.codigo.trim())}|${i.fecha}|${i.tipo}|${normalizar(i.descripcion.trim())}`));
  const codigoDe = new Map(equipos.map(e => [e.id, e.codigo]));
  const repuestos = new Map((await repuestosDe(c, equipos.map(e => e.id)))
    .map(r => [`${normalizar((codigoDe.get(r.equipoId) ?? '').trim())}|${normalizar(r.codigo.trim())}`, { cantidad: r.cantidad, nota: r.nota }]));
  // los repuestos del Depósito que nombra el archivo, por su código exacto
  const items = new Map<string, { id: string; codigo: string }>();
  for (const codigo of codigosDeRepuestos(libro).slice(0, 2000)) {
    const encontrados = (await c.query<{ id: string; codigo: string }>('select id, codigo from public.repuestos_para_equipos($1, 30)', [codigo])).rows;
    const exacto = encontrados.find(i => normalizar(i.codigo.trim()) === normalizar(codigo.trim()));
    if (exacto) items.set(normalizar(codigo.trim()), exacto);
  }
  const planillas = await leerPlanillas(c);
  const rutinas = (await c.query<{ id: string; codigo: string; planilla: string | null; tareas: string[]; frecuencia_dias: number; proxima_fecha: string;
    aviso_dias: number; responsable: string; activa: boolean }>(`
    select r.id, e.codigo, p.nombre as planilla, coalesce((select array_agg(t.texto order by t.orden) from public.rutina_tareas t where t.rutina_id = r.id), '{}') as tareas,
           r.frecuencia_dias, r.proxima_fecha::text, r.aviso_dias, coalesce(nullif(btrim(concat(u.nombre, ' ', u.apellido)), ''), u.email, '') as responsable, r.activa
    from public.rutinas_preventivas r join public.equipos e on e.id = r.equipo_id
    left join public.planillas_tareas p on p.id = r.planilla_id left join public.usuarios_perfil u on u.id = r.responsable_id`)).rows
    .map(r => ({ id: r.id, equipoCodigo: r.codigo, planilla: r.planilla, tareas: r.planilla ? [] : r.tareas, frecuenciaDias: r.frecuencia_dias,
      proximaFecha: r.proxima_fecha, avisoDias: r.aviso_dias, responsable: r.responsable, activa: r.activa }));
  const tecnicos = (await c.query<Tecnico>(SQL_TECNICOS)).rows.map(t => t.nombre);
  return { sectores, equipos, intervenciones, repuestos, items, planillas, rutinas, tecnicos };
}

/** Qué se va a agregar, qué cambia y qué filas tienen problemas. No guarda nada. */
export async function analizarImportacion(libro: Libro): Promise<{ error: string | null; analisis?: Analisis }> {
  const usuario = await entrada('analizarImportacion', [LibroRecibido], [libro]);
  try {
    return { error: null, analisis: await comoUsuario(usuario, async c => analizarLibro(libro, await loQueHay(c, libro))) };
  } catch (e) {
    return { error: mensajeDe(e, 'No se pudo leer el archivo') };
  }
}

/** Guarda lo que trae el archivo (lo vuelve a revisar contra lo que hay en este momento). Todo junto o nada. */
export async function importarMantenimiento(libro: Libro): Promise<{ error: string | null; analisis?: Analisis }> {
  const usuario = await entrada('importarMantenimiento', [LibroRecibido], [libro]);
  try {
    const analisis = await comoUsuario(usuario, async c => {
      const a = analizarLibro(libro, await loQueHay(c, libro));
      // 1) sectores nuevos y el orden de importancia
      for (const s of a.sectoresNuevos) await sectorPorNombre(c, s.sector.slice(0, 80), s.subsector.slice(0, 80));
      if (a.ordenSectores) {
        const ids: (string | null)[] = [];
        for (const nombre of a.ordenSectores) ids.push(await sectorPorNombre(c, nombre.slice(0, 80), ''));
        await c.query('update public.equipo_sectores s set orden = o.n from unnest($1::uuid[]) with ordinality as o(id, n) where s.id = o.id', [ids]);
      }
      // 2) equipos: primero todos sin "pertenece a" (los nuevos y los que pasan a ser principales), después cada uno con su principal
      const idDe = new Map((await c.query<{ id: string; codigo: string }>('select id, codigo from public.equipos')).rows.map(e => [normalizar(e.codigo.trim()), e.id]));
      for (const e of [...a.equiposNuevos, ...a.equiposActualizados]) {
        const valores = [e.codigo.slice(0, 40), e.nombre.slice(0, 160), await sectorPorNombre(c, e.sector.slice(0, 80), e.subsector.slice(0, 80)), e.etiquetas,
          e.marca.slice(0, 120), e.modelo.slice(0, 120), e.numeroSerie.slice(0, 120), e.ubicacion.slice(0, 200), e.critico, e.notas.slice(0, 4000)];
        const id = idDe.get(normalizar(e.codigo.trim()));
        if (id) {
          await c.query(`update public.equipos set codigo = $2, nombre = $3, sector_id = $4, etiquetas = $5, marca = $6, modelo = $7, numero_serie = $8,
              ubicacion = $9, critico = $10, notas = $11, padre_id = case when $12 then null else padre_id end where id = $1`, [id, ...valores, !e.padreCodigo]);
        } else {
          idDe.set(normalizar(e.codigo.trim()), (await c.query<{ id: string }>(`insert into public.equipos
              (codigo, nombre, sector_id, etiquetas, marca, modelo, numero_serie, ubicacion, critico, notas) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) returning id`,
            valores)).rows[0].id);
        }
      }
      for (const e of [...a.equiposNuevos, ...a.equiposActualizados]) {
        if (e.padreCodigo) await c.query('update public.equipos set padre_id = $2 where id = $1 and padre_id is distinct from $2',
          [idDe.get(normalizar(e.codigo.trim())), idDe.get(normalizar(e.padreCodigo.trim()))]);
      }
      // 3) historial, con sus técnicos (si el nombre es el de un usuario, queda vinculado; si no, queda el nombre escrito)
      const usuarios = new Map((await c.query<{ id: string; nombre: string }>(`
        select id, coalesce(nullif(btrim(concat(nombre, ' ', apellido)), ''), email) as nombre from public.usuarios_perfil`)).rows
        .map(u => [normalizar(u.nombre.trim()), u.id]));
      for (const i of a.intervenciones) {
        const id = (await c.query<{ id: string }>(`insert into public.equipo_intervenciones
            (equipo_id, fecha, tipo, descripcion, horas, prioridad, falla, causa, solucion, horas_parada, repuestos, creado_por)
            values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, auth.uid()) returning id`,
          [idDe.get(normalizar(i.equipoCodigo.trim())), i.fecha, i.tipo, i.descripcion, i.horas, i.prioridad, i.falla, i.causa, i.solucion, i.horasParada, i.repuestos])).rows[0].id;
        for (const [n, nombre] of i.tecnicos.entries()) {
          await c.query('insert into public.intervencion_tecnicos (intervencion_id, usuario_id, nombre, orden) values ($1, $2, $3, $4)',
            [id, usuarios.get(normalizar(nombre)) ?? null, nombre, n + 1]);
        }
      }
      // 4) repuestos críticos
      for (const r of a.repuestosNuevos) {
        await c.query('insert into public.equipo_items (equipo_id, item_id, cantidad, nota) values ($1, $2, $3, $4)',
          [idDe.get(normalizar(r.equipoCodigo.trim())), r.itemId, r.cantidad, r.nota]);
      }
      for (const r of a.repuestosActualizados) {
        await c.query('update public.equipo_items set cantidad = $3, nota = $4 where equipo_id = $1 and item_id = $2',
          [idDe.get(normalizar(r.equipoCodigo.trim())), r.itemId, r.cantidad, r.nota]);
      }
      // 5) planillas de tareas (las rutinas que ya las usan toman sus tareas nuevas)
      const planillaDe = new Map((await c.query<{ id: string; nombre: string }>('select id, nombre from public.planillas_tareas')).rows.map(p => [normalizar(p.nombre.trim()), p.id]));
      for (const p of [...a.planillasNuevas, ...a.planillasActualizadas]) {
        let id = planillaDe.get(normalizar(p.nombre.trim()));
        if (!id) {
          id = (await c.query<{ id: string }>('insert into public.planillas_tareas (nombre) values ($1) returning id', [p.nombre.slice(0, 160)])).rows[0].id;
          planillaDe.set(normalizar(p.nombre.trim()), id);
        }
        await c.query('delete from public.planilla_tareas_items where planilla_id = $1', [id]);
        await c.query(`insert into public.planilla_tareas_items (planilla_id, orden, texto, mide, unidad, minimo, maximo)
            select $1, n, x ->> 'texto', x -> 'medicion' is not null and jsonb_typeof(x -> 'medicion') = 'object', coalesce(x #>> '{medicion,unidad}', ''),
                   (x #>> '{medicion,minimo}')::numeric, (x #>> '{medicion,maximo}')::numeric
            from jsonb_array_elements($2::jsonb) with ordinality as y(x, n)`, [id, JSON.stringify(p.tareas.slice(0, 200))]);
        await c.query('select public.aplicar_planilla($1)', [id]);
      }
      // 6) rutinas preventivas: cada una arma su OT para la próxima fecha
      const tecnicoDe = new Map((await c.query<Tecnico>(SQL_TECNICOS)).rows.map(t => [normalizar(t.nombre.trim()), t.id]));
      for (const r of [...a.rutinasNuevas, ...a.rutinasActualizadas]) {
        const planilla = r.planilla ? planillaDe.get(normalizar(r.planilla.trim())) ?? null : null;
        const valores = [r.frecuenciaDias, r.proximaFecha, r.avisoDias, r.responsable ? tecnicoDe.get(normalizar(r.responsable.trim())) ?? null : null, r.activa];
        let id = r.id;
        if (id) {
          await c.query('update public.rutinas_preventivas set frecuencia_dias = $2, proxima_fecha = $3, aviso_dias = $4, responsable_id = $5, activa = $6 where id = $1', [id, ...valores]);
        } else {
          id = (await c.query<{ id: string }>(`insert into public.rutinas_preventivas (equipo_id, frecuencia_dias, proxima_fecha, aviso_dias, responsable_id, activa, planilla_id)
              values ($1, $2, $3, $4, $5, $6, $7) returning id`, [idDe.get(normalizar(r.equipoCodigo.trim())), ...valores, planilla])).rows[0].id;
          if (planilla) {
            await c.query(`insert into public.rutina_tareas (rutina_id, orden, texto, mide, unidad, minimo, maximo)
                select $1, orden, texto, mide, unidad, minimo, maximo from public.planilla_tareas_items where planilla_id = $2`, [id, planilla]);
          } else {
            await c.query('insert into public.rutina_tareas (rutina_id, orden, texto) select $1, n, t from unnest($2::text[]) with ordinality as x(t, n)', [id, r.tareas]);
          }
        }
        await c.query('select public.sincronizar_rutina($1)', [id]);
      }
      return a;
    });
    return { error: null, analisis };
  } catch (e) {
    return { error: mensajeDe(e, 'No se pudo cargar el archivo. No se guardó nada.') };
  }
}

/** Todo Mantenimiento en hojas, para descargar en Excel (sin equipos, sirve de plantilla). */
export async function exportarMantenimiento(): Promise<Libro> {
  const usuario = await entrada('exportarMantenimiento');
  return comoUsuario(usuario, async c => {
    const sectores = (await c.query<{ id: string; nombre: string; padre_id: string | null; orden: number | null }>(
      'select id, nombre, padre_id, orden from public.equipo_sectores')).rows.map(s => ({ id: s.id, nombre: s.nombre, padreId: s.padre_id, orden: s.orden }));
    const equipos = (await c.query<FilaEquipo>(SQL_EQUIPOS)).rows.map(equipoDe);
    const intervenciones = (await c.query<FilaIntervencion>(`${SQL_INTERVENCIONES} order by i.fecha`)).rows.map(intervencionDe);
    const repuestos = await repuestosDe(c, equipos.map(e => e.id));
    const planillas = await leerPlanillas(c);
    const { rutinas } = await leerPreventivo(c);
    const ordenes = (await c.query<FilaOrden>(`${SQL_ORDENES} order by o.numero`)).rows.map(ordenDe);
    return armarHojas({ sectores, equipos, intervenciones, repuestos, planillas, rutinas, ordenes });
  });
}
