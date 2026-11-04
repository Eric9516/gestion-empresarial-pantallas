import { normalizar } from './buscador';
import { esFechaValida } from './fechas';
import { horasDeTecnico, listaDeTareas, marcasDe, numeroCorto, tareasDePlanilla, textoRepuestos } from './preventivo';
import type { DatosMantenimiento, DetalleCorrectivo, Liberacion, TrabajoTecnico, Medicion, PlanillaTareas, TareaRegistrada, Equipo, FechaISO, Intervencion, OrdenTrabajo, RepuestoCritico, RutinaPreventiva } from './tipos';

// Exportar e importar el módulo de Mantenimiento en Excel. Un solo archivo con una hoja por
// tema. Las columnas se leen por el NOMBRE del encabezado (no por su posición), sin importar
// tildes ni mayúsculas, así el encargado puede reordenarlas o agregar columnas propias.
// Estas funciones no tocan la librería de Excel (por eso tienen pruebas); la lectura y la
// descarga del archivo están al final y la cargan recién cuando hace falta.

export const HOJAS = {
  sectores: 'Sectores',
  equipos: 'Equipos',
  historial: 'Historial',
  repuestos: 'Repuestos críticos',
  planillas: 'Planillas de tareas',
  rutinas: 'Rutinas preventivas',
  ordenes: 'Órdenes de trabajo',
  manuales: 'Manuales',
} as const;

export const COLUMNAS = {
  sectores: ['Sector', 'Subsector'],
  equipos: ['Código', 'Nombre', 'Pertenece a', 'Sector', 'Subsector', 'Etiquetas', 'Marca', 'Modelo', 'N° de serie', 'Ubicación', 'Crítico', 'Notas'],
  historial: ['Código equipo', 'Fecha', 'Tipo', 'OT', 'Descripción', 'Realizado por', 'Horas', 'Técnicos', 'Repuestos usados', 'Mediciones', 'Prioridad', 'Falla', 'Causa', 'Solución', 'Horas de parada', 'Liberación'],
  repuestos: ['Código equipo', 'Código repuesto', 'Descripción', 'Cantidad', 'Nota'],
  planillas: ['Planilla', 'Tarea', 'Unidad', 'Mínimo', 'Máximo'],
  rutinas: ['Código equipo', 'Planilla', 'Tarea', 'Cada (días)', 'Próxima fecha', 'Avisar (días antes)', 'Responsable', 'Activa', 'Repuestos'],
  ordenes: ['Número', 'Tipo', 'Código equipo', 'Equipo', 'Fecha programada', 'Tareas', 'Tareas hechas', 'Asignado a', 'Estado', 'Fecha de cierre', 'Horas', 'Repuestos', 'Prioridad', 'Falla', 'Causa', 'Solución', 'Horas de parada', 'Observaciones'],
  manuales: ['Código equipo', 'Archivo', 'Subido el'],
} as const;

type Celda = string | number;
export type Tabla = Celda[][];

/** "8 de 10" y, si falta algo, cuáles. */
function resumenMarcas(o: OrdenTrabajo): string {
  const tareas = listaDeTareas(o.tareas);
  const marcas = marcasDe(o);
  const sinHacer = tareas.filter((_, i) => !marcas[i]);
  const base = `${tareas.length - sinHacer.length} de ${tareas.length}`;
  return o.estado === 'terminada' && sinHacer.length ? `${base} (sin hacer: ${sinHacer.join('; ')})` : base;
}

const ESTADOS_OT = { pendiente: 'Pendiente', en_curso: 'En curso', terminada: 'Terminada' } as const;

/** dd/mm/aaaa, que es como lo escribe y lo lee cualquiera en Excel. */
export function fechaParaExcel(iso: FechaISO | null): string {
  if (!iso) return '';
  const [a, m, d] = iso.split('-');
  return `${d}/${m}/${a}`;
}

function siNo(v: boolean): string {
  return v ? 'SI' : 'NO';
}

/** Las hojas del archivo, cada una con su fila de encabezados. */
export function armarHojas(datos: DatosMantenimiento): Record<string, Tabla> {
  const codigo = new Map(datos.equipos.map(e => [e.id, e]));
  const cod = (id: string) => codigo.get(id)?.codigo ?? '';
  const porEquipoYFecha = <T extends { equipoId: string }>(lista: T[], fecha: (x: T) => string) =>
    [...lista].sort((a, b) => cod(a.equipoId).localeCompare(cod(b.equipoId)) || fecha(a).localeCompare(fecha(b)));

  // Sectores y sub-sectores: los creados a mano más los que usan los equipos (sin repetir).
  const filasSectores = new Map<string, Celda[]>();
  const agregarSector = (sector: string, sub: string) => {
    if (!sector.trim()) return;
    filasSectores.set(`${normalizar(sector)}|${normalizar(sub)}`, [sector.trim(), sub.trim()]);
  };
  datos.sectores.forEach(s => agregarSector(s, ''));
  datos.subsectores.forEach(x => agregarSector(x.sector, x.nombre));
  datos.equipos.forEach(e => { agregarSector(e.sector, ''); if (e.subsector) agregarSector(e.sector, e.subsector); });

  return {
    [HOJAS.sectores]: [
      [...COLUMNAS.sectores],
      // En el orden elegido para los sectores (el orden de esta hoja es el orden en la app).
      ...[...filasSectores.values()].sort((x, y) => {
        const pos = (s: Celda) => { const i = datos.ordenSectores.findIndex(o => normalizar(o) === normalizar(String(s))); return i < 0 ? Infinity : i; };
        return pos(x[0]) - pos(y[0]) || String(x[0]).localeCompare(String(y[0]), 'es') || String(x[1]).localeCompare(String(y[1]), 'es');
      }),
    ],
    [HOJAS.equipos]: [
      [...COLUMNAS.equipos],
      ...[...datos.equipos].sort((a, b) => a.codigo.localeCompare(b.codigo)).map(e => [
        e.codigo, e.nombre, e.padreId ? cod(e.padreId) : '', e.sector, e.subsector, e.etiquetas.join(', '), e.marca, e.modelo, e.numeroSerie, e.ubicacion, siNo(e.critico), e.notas,
      ]),
    ],
    [HOJAS.historial]: [
      [...COLUMNAS.historial],
      ...porEquipoYFecha(datos.intervenciones, i => i.fecha).map(i => [
        cod(i.equipoId), fechaParaExcel(i.fecha), i.tipo === 'correctivo' ? 'Correctivo' : 'Preventivo', i.otNumero ?? '', i.descripcion, i.realizadoPor, i.horas ?? '', textoTecnicos(i.tecnicos ?? []),
        [textoRepuestos(i.repuestos), i.repuestosUsados].filter(Boolean).join('; '), textoMediciones(i.tareas), ...columnasCorrectivo(i.correctivo),
        textoLiberacion(i.liberacion ?? null),
      ]),
    ],
    [HOJAS.repuestos]: [
      [...COLUMNAS.repuestos],
      ...porEquipoYFecha(datos.repuestosCriticos, r => r.codigo).map(r => [cod(r.equipoId), r.codigo, r.descripcion, r.cantidad, r.nota]),
    ],
    [HOJAS.planillas]: [
      [...COLUMNAS.planillas],
      ...[...datos.planillas].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')).flatMap(p => p.tareas.map(t => [
        p.nombre, t.texto, t.medicion?.unidad ?? '', t.medicion?.minimo ?? '', t.medicion?.maximo ?? '',
      ])),
    ],
    [HOJAS.rutinas]: [
      [...COLUMNAS.rutinas],
      ...porEquipoYFecha(datos.rutinas, r => r.proximaFecha).map(r => [
        cod(r.equipoId), datos.planillas.find(p => p.id === r.planillaId)?.nombre ?? '', r.tarea, r.frecuenciaDias, fechaParaExcel(r.proximaFecha), r.avisoDiasAntes, r.responsable, siNo(r.activa), textoRepuestos(r.repuestos),
      ]),
    ],
    [HOJAS.ordenes]: [
      [...COLUMNAS.ordenes],
      ...[...datos.ordenes].sort((a, b) => a.numero.localeCompare(b.numero)).map(o => [
        o.numero, o.tipo === 'preventiva' ? 'Preventiva' : 'Correctiva', cod(o.equipoId), codigo.get(o.equipoId)?.nombre ?? '',
        fechaParaExcel(o.fechaProgramada), o.tareas, resumenMarcas(o), o.asignadoA, ESTADOS_OT[o.estado], fechaParaExcel(o.fechaCierre), o.horas ?? '',
        [textoRepuestos(o.estado === 'terminada' ? o.repuestos.map(r => ({ ...r, cantidad: r.usado ?? r.cantidad })).filter(r => r.cantidad > 0) : o.repuestos), o.repuestosUsados].filter(Boolean).join('; '),
        ...columnasCorrectivo(o.correctivo), o.observaciones,
      ]),
    ],
    [HOJAS.manuales]: [
      [...COLUMNAS.manuales],
      ...porEquipoYFecha(datos.manuales, m => m.nombre).map(m => [cod(m.equipoId), m.nombre, fechaParaExcel(m.subidoEl)]),
    ],
  };
}

/** La plantilla vacía para completar: solo las hojas que se pueden importar, más las instrucciones. */
export function armarPlantilla(): Record<string, Tabla> {
  return {
    Instrucciones: [
      ['Cómo completar esta planilla'],
      ['Cada hoja es un tema. No cambies los nombres de las hojas ni de los encabezados (la fila 1). El orden de las columnas no importa.'],
      ['Sectores: (opcional) para crear sectores y sub-sectores aunque todavía no tengan equipos. Una fila por sector o por sub-sector. El orden de esta hoja es el orden en que se ven los sectores en la app (poné primero los más importantes).'],
      ['Equipos: el Código identifica al equipo y tiene que ser único. Si ya existe, se actualizan sus datos.'],
      ['Sector y Subsector: el subsector es opcional y va dentro del sector (ej.: Sector "Servicios", Subsector "Aire comprimido").'],
      ['Sub-equipos: en "Pertenece a" poné el código del equipo principal (ej.: la bomba PA-01-B1 pertenece a PA-01). Vacío = equipo principal.'],
      ['Etiquetas: palabras para encontrarlo rápido, separadas por coma (ej.: bomba, línea 1, frío).'],
      ['Crítico y Activa: SI o NO.'],
      ['Fechas: dd/mm/aaaa (ej.: 25/10/2026).'],
      ['Historial: Tipo es Correctivo o Preventivo. Cada fila se agrega al historial del equipo (las repetidas se saltean).'],
      ['Repuestos críticos: el Código repuesto es el mismo del Depósito, así se ve su stock.'],
      ['Planillas de tareas: listas de tareas armadas de antemano (ej.: "Bomba centrífuga – mensual"). Una fila por tarea, con el nombre de la planilla repetido. Si la tarea es una medición, completá la Unidad (ej.: mm/s, °C, bar) y, si querés que avise, Mínimo y/o Máximo. Sin unidad, la tarea solo se tilda. Si la planilla ya existe, se reemplazan sus tareas.'],
      ['Rutinas preventivas: cada rutina genera sola su orden de trabajo (OT) para la próxima fecha. Poné el nombre de una planilla en "Planilla" (y la Tarea queda vacía), o escribí en "Tarea" una tarea por renglón (Alt+Enter en Excel para pasar de renglón): en la OT salen como lista para tildar.'],
      ['Las hojas "Órdenes de trabajo" y "Manuales" solo salen al exportar: no se importan.'],
    ],
    [HOJAS.sectores]: [[...COLUMNAS.sectores]],
    [HOJAS.equipos]: [[...COLUMNAS.equipos]],
    [HOJAS.historial]: [[...COLUMNAS.historial]],
    [HOJAS.repuestos]: [[...COLUMNAS.repuestos]],
    [HOJAS.planillas]: [[...COLUMNAS.planillas]],
    [HOJAS.rutinas]: [[...COLUMNAS.rutinas]],
  };
}

// ---------- Importar ----------

export interface ErrorImportacion {
  hoja: string;
  /** Número de fila como se ve en Excel (la 1 es el encabezado). */
  fila: number;
  motivo: string;
}

export interface AnalisisImportacion {
  equiposNuevos: Equipo[];
  equiposActualizados: Equipo[];
  intervenciones: Intervencion[];
  repuestosNuevos: RepuestoCritico[];
  repuestosActualizados: RepuestoCritico[];
  rutinasNuevas: RutinaPreventiva[];
  rutinasActualizadas: RutinaPreventiva[];
  planillasNuevas: PlanillaTareas[];
  planillasActualizadas: PlanillaTareas[];
  /** Filas que ya estaban igual (no cambia nada). */
  sinCambios: number;
  errores: ErrorImportacion[];
  hojasLeidas: string[];
  /** Sectores y sub-sectores que no existían (subsector vacío = es un sector). */
  sectoresNuevos: { sector: string; subsector: string }[];
  /** Orden de los sectores según la hoja Sectores (null si el archivo no la trae). */
  ordenSectores: string[] | null;
}

export function hayAlgoParaGuardar(a: AnalisisImportacion): boolean {
  return (a.ordenSectores ? 1 : 0) + a.sectoresNuevos.length + a.equiposNuevos.length + a.equiposActualizados.length + a.intervenciones.length + a.repuestosNuevos.length
    + a.repuestosActualizados.length + a.rutinasNuevas.length + a.rutinasActualizadas.length + a.planillasNuevas.length + a.planillasActualizadas.length > 0;
}

function texto(v: unknown): string {
  if (v == null) return '';
  if (v instanceof Date) return fechaDeExcel(v) ?? '';
  return String(v).trim();
}

/** Acepta una fecha de Excel (Date o número de serie) o un texto dd/mm/aaaa, d/m/aa o aaaa-mm-dd. */
export function fechaDeExcel(v: unknown): FechaISO | null {
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, '0')}-${String(v.getDate()).padStart(2, '0')}`;
  }
  if (typeof v === 'number' && v > 20000 && v < 80000) {
    // Número de serie de Excel: días desde el 30/12/1899.
    const d = new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86_400_000);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
  }
  const t = texto(v);
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t);
  if (m) {
    const iso = `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
    return esFechaValida(iso) ? iso : null;
  }
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/.exec(t);
  if (m) {
    const anio = m[3].length === 2 ? `20${m[3]}` : m[3];
    const iso = `${anio}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    return esFechaValida(iso) ? iso : null;
  }
  return null;
}

function numero(v: unknown): number | null {
  if (v === '' || v == null) return null;
  const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

function booleano(v: unknown, porDefecto: boolean): boolean {
  const t = normalizar(texto(v));
  if (!t) return porDefecto;
  return ['si', 's', 'x', 'true', '1', 'yes'].includes(t);
}

const normalizarEncabezado = (t: string) => normalizar(t).replace(/[°º.]/g, '').replace(/\s+/g, ' ').trim();

function tieneColumna(filas: Tabla, columna: string): boolean {
  return (filas[0] ?? []).some(c => normalizarEncabezado(texto(c)) === normalizarEncabezado(columna));
}

/** Busca la hoja por nombre sin importar tildes ni mayúsculas. */
function hoja(libro: Record<string, Tabla>, nombre: string): { nombre: string; filas: Tabla } | null {
  const clave = Object.keys(libro).find(k => normalizar(k).trim() === normalizar(nombre));
  return clave ? { nombre: clave, filas: libro[clave] } : null;
}

/** Lee las filas de una hoja como objetos {columna: valor}, ubicando cada columna por su encabezado. */
function filasComoObjetos(filas: Tabla, columnas: readonly string[]): { fila: number; valores: Record<string, unknown> }[] {
  if (!filas.length) return [];
  const encabezado = filas[0].map(c => normalizar(texto(c)).replace(/[°º.]/g, '').replace(/\s+/g, ' ').trim());
  const indice = new Map(columnas.map(c => [c, encabezado.indexOf(normalizar(c).replace(/[°º.]/g, '').replace(/\s+/g, ' ').trim())]));
  return filas.slice(1).map((f, i) => ({
    fila: i + 2,
    valores: Object.fromEntries(columnas.map(c => [c, (indice.get(c) ?? -1) >= 0 ? f[indice.get(c)!] : ''])),
  })).filter(({ valores }) => Object.values(valores).some(v => texto(v) !== ''));
}

/** "Medir vibración: 3,9 mm/s; Medir temperatura: 66 °C" (las tareas con valor anotado). */
export function textoMediciones(tareas: TareaRegistrada[]): string {
  return tareas.filter(t => t.medicion && t.valor != null).map(t => `${t.texto}: ${numeroCorto(t.valor!)}${t.medicion!.unidad ? ` ${t.medicion!.unidad}` : ''}`).join('; ');
}

/** "Técnico 1 08:00–10:30 (2,5 HH); Técnico 2 …" */
export function textoTecnicos(tecnicos: TrabajoTecnico[]): string {
  return tecnicos.map(t => {
    const hh = horasDeTecnico(t);
    return `${t.nombre}${t.inicio || t.fin ? ` ${t.inicio}–${t.fin}` : ''}${hh != null ? ` (${numeroCorto(hh)} HH)` : ''}`;
  }).join('; ');
}

/** "Limpieza: sí; Sanitización: no · Recibió: Nombre" */
export function textoLiberacion(l: Liberacion | null): string {
  if (!l) return '';
  return `${l.controles.map(c => `${c.texto}: ${c.ok ? 'sí' : 'no'}`).join('; ')}${l.recibio ? ` · Recibió: ${l.recibio}` : ''}`;
}

function columnasCorrectivo(c: DetalleCorrectivo | null): (string | number)[] {
  if (!c) return ['', '', '', '', ''];
  return [c.prioridad === 'urgente' ? 'Urgente' : 'Normal', c.falla, c.causa, c.solucion, c.horasParada ?? ''];
}

function etiquetas(v: unknown): string[] {
  return [...new Set(texto(v).split(/[,;]/).map(s => s.trim()).filter(Boolean))];
}

const igualesJSON = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Analiza un libro ya leído (hoja → filas) contra los datos actuales y dice qué se va a agregar,
 * qué se va a actualizar y qué filas tienen problemas. No guarda nada.
 */
export function analizarLibro(libro: Record<string, Tabla>, actual: DatosMantenimiento, nuevoId: () => string): AnalisisImportacion {
  const a: AnalisisImportacion = {
    equiposNuevos: [], equiposActualizados: [], intervenciones: [], repuestosNuevos: [], repuestosActualizados: [],
    rutinasNuevas: [], rutinasActualizadas: [], planillasNuevas: [], planillasActualizadas: [], sinCambios: 0, errores: [], hojasLeidas: [], sectoresNuevos: [], ordenSectores: null,
  };

  // 0) Sectores (opcional): los que no existen todavía.
  const hSe = hoja(libro, HOJAS.sectores);
  if (hSe) {
    a.hojasLeidas.push(hSe.nombre);
    const existentes = new Set([
      ...actual.sectores.map(s => `${normalizar(s.trim())}|`),
      ...actual.subsectores.map(x => `${normalizar(x.sector.trim())}|${normalizar(x.nombre.trim())}`),
      ...actual.equipos.flatMap(e => [`${normalizar(e.sector.trim())}|`, `${normalizar(e.sector.trim())}|${normalizar(e.subsector.trim())}`]),
    ]);
    const orden: string[] = [];
    for (const { fila, valores: v } of filasComoObjetos(hSe.filas, COLUMNAS.sectores)) {
      const sector = texto(v['Sector']);
      if (sector && !orden.some(o => normalizar(o) === normalizar(sector))) orden.push(sector);
      const subsector = texto(v['Subsector']);
      if (!sector) { a.errores.push({ hoja: hSe.nombre, fila, motivo: 'Falta el nombre del sector.' }); continue; }
      for (const [s, sub] of [[sector, ''], ...(subsector ? [[sector, subsector]] : [])]) {
        const k = `${normalizar(s)}|${normalizar(sub)}`;
        if (existentes.has(k)) { if (sub || !subsector) a.sinCambios += 1; continue; }
        existentes.add(k);
        a.sectoresNuevos.push({ sector: s, subsector: sub });
      }
    }
    // El orden de la hoja pasa a ser el orden de los sectores (los que no están en la hoja quedan después).
    if (orden.length) {
      const resto = actual.ordenSectores.filter(o => !orden.some(x => normalizar(x) === normalizar(o)));
      const nuevo = [...orden, ...resto];
      if (JSON.stringify(nuevo) !== JSON.stringify(actual.ordenSectores)) a.ordenSectores = nuevo;
    }
  }
  const porCodigo = new Map(actual.equipos.map(e => [normalizar(e.codigo), e]));

  // 1) Equipos (primero, así las otras hojas pueden usar equipos nuevos del mismo archivo).
  const hEq = hoja(libro, HOJAS.equipos);
  if (hEq) {
    a.hojasLeidas.push(hEq.nombre);
    const vistos = new Set<string>();
    const conColumnaPadre = tieneColumna(hEq.filas, 'Pertenece a');
    // Primero se leen todas las filas (un sub-equipo puede estar antes que su principal en la planilla).
    const leidas: { fila: number; clave: string; datos: Omit<Equipo, 'id' | 'padreId'>; padreCodigo: string }[] = [];
    for (const { fila, valores: v } of filasComoObjetos(hEq.filas, COLUMNAS.equipos)) {
      const codigo = texto(v['Código']);
      const nombre = texto(v['Nombre']);
      if (!codigo) { a.errores.push({ hoja: hEq.nombre, fila, motivo: 'Falta el código del equipo.' }); continue; }
      if (!nombre) { a.errores.push({ hoja: hEq.nombre, fila, motivo: `Falta el nombre del equipo ${codigo}.` }); continue; }
      const clave = normalizar(codigo);
      if (vistos.has(clave)) { a.errores.push({ hoja: hEq.nombre, fila, motivo: `El código ${codigo} está repetido en la planilla.` }); continue; }
      vistos.add(clave);
      leidas.push({
        fila, clave, padreCodigo: texto(v['Pertenece a']),
        datos: {
          codigo, nombre, sector: texto(v['Sector']), subsector: texto(v['Sector']) ? texto(v['Subsector']) : '', etiquetas: etiquetas(v['Etiquetas']), marca: texto(v['Marca']), modelo: texto(v['Modelo']),
          numeroSerie: texto(v['N° de serie']), ubicacion: texto(v['Ubicación']), critico: booleano(v['Crítico'], false), notas: texto(v['Notas']),
        },
      });
    }
    // Los equipos nuevos reciben su id antes de resolver quién pertenece a quién.
    for (const l of leidas) if (!porCodigo.has(l.clave)) porCodigo.set(l.clave, { id: nuevoId(), ...l.datos, padreId: null });
    const padreCodigoDe = new Map(leidas.map(l => [l.clave, normalizar(l.padreCodigo)]));
    for (const l of leidas) {
      const previo = actual.equipos.find(e => normalizar(e.codigo) === l.clave);
      let padreId: string | null = previo?.padreId ?? null;
      if (conColumnaPadre) {
        padreId = null;
        if (l.padreCodigo) {
          const padre = porCodigo.get(normalizar(l.padreCodigo));
          if (!padre) { a.errores.push({ hoja: hEq.nombre, fila: l.fila, motivo: `"Pertenece a": no existe un equipo con código ${l.padreCodigo}.` }); if (!previo) porCodigo.delete(l.clave); continue; }
          const padreEsSub = padreCodigoDe.has(normalizar(padre.codigo)) ? !!padreCodigoDe.get(normalizar(padre.codigo)) : !!padre.padreId;
          if (normalizar(padre.codigo) === l.clave || padreEsSub) { a.errores.push({ hoja: hEq.nombre, fila: l.fila, motivo: `"Pertenece a" tiene que ser un equipo principal (${l.padreCodigo} no lo es).` }); if (!previo) porCodigo.delete(l.clave); continue; }
          padreId = padre.id;
        }
      }
      const base = porCodigo.get(l.clave)!;
      if (!previo) {
        const nuevo = { ...base, ...l.datos, padreId };
        a.equiposNuevos.push(nuevo);
        porCodigo.set(l.clave, nuevo);
      } else {
        const actualizado = { ...previo, ...l.datos, codigo: previo.codigo, padreId };
        if (igualesJSON(actualizado, previo)) a.sinCambios += 1;
        else a.equiposActualizados.push(actualizado);
      }
    }
  }

  const equipoDe = (hojaNombre: string, fila: number, v: Record<string, unknown>) => {
    const codigo = texto(v['Código equipo']);
    if (!codigo) { a.errores.push({ hoja: hojaNombre, fila, motivo: 'Falta el código del equipo.' }); return null; }
    const e = porCodigo.get(normalizar(codigo));
    if (!e) a.errores.push({ hoja: hojaNombre, fila, motivo: `No existe un equipo con código ${codigo} (agregalo en la hoja Equipos).` });
    return e ?? null;
  };

  // 2) Historial: se agrega; si ya hay una igual (mismo equipo, fecha, tipo y descripción), se saltea.
  const hHi = hoja(libro, HOJAS.historial);
  if (hHi) {
    a.hojasLeidas.push(hHi.nombre);
    const yaEstan = new Set(actual.intervenciones.map(i => `${i.equipoId}|${i.fecha}|${i.tipo}|${normalizar(i.descripcion)}`));
    for (const { fila, valores: v } of filasComoObjetos(hHi.filas, COLUMNAS.historial)) {
      const e = equipoDe(hHi.nombre, fila, v);
      if (!e) continue;
      const fecha = fechaDeExcel(v['Fecha']);
      if (!fecha) { a.errores.push({ hoja: hHi.nombre, fila, motivo: `Fecha inválida: "${texto(v['Fecha'])}" (usá dd/mm/aaaa).` }); continue; }
      const t = normalizar(texto(v['Tipo']));
      const tipo = t.startsWith('prev') ? 'preventivo' : t.startsWith('corr') ? 'correctivo' : null;
      if (!tipo) { a.errores.push({ hoja: hHi.nombre, fila, motivo: `Tipo inválido: "${texto(v['Tipo'])}" (Correctivo o Preventivo).` }); continue; }
      const descripcion = texto(v['Descripción']);
      if (!descripcion) { a.errores.push({ hoja: hHi.nombre, fila, motivo: 'Falta la descripción de lo que se hizo.' }); continue; }
      const clave = `${e.id}|${fecha}|${tipo}|${normalizar(descripcion)}`;
      if (yaEstan.has(clave)) { a.sinCambios += 1; continue; }
      yaEstan.add(clave);
      a.intervenciones.push({
        id: nuevoId(), equipoId: e.id, fecha, tipo, descripcion, realizadoPor: texto(v['Realizado por']),
        horas: numero(v['Horas']), repuestosUsados: texto(v['Repuestos usados']), otId: null,
        // Los repuestos del Excel quedan como texto (no se descuentan del stock).
        repuestos: [], tareas: [], otNumero: texto(v['OT']) || null, tecnicos: [], liberacion: null,
        correctivo: tipo === 'correctivo' ? {
          prioridad: normalizar(texto(v['Prioridad'])).startsWith('urg') ? 'urgente' : 'normal',
          falla: texto(v['Falla']), causa: texto(v['Causa']), solucion: texto(v['Solución']), horasParada: numero(v['Horas de parada']),
        } : null,
      });
    }
  }

  // 3) Repuestos críticos: uno por equipo y código de repuesto (si ya está, se actualiza).
  const hRe = hoja(libro, HOJAS.repuestos);
  if (hRe) {
    a.hojasLeidas.push(hRe.nombre);
    const existentes = new Map(actual.repuestosCriticos.map(r => [`${r.equipoId}|${normalizar(r.codigo)}`, r]));
    for (const { fila, valores: v } of filasComoObjetos(hRe.filas, COLUMNAS.repuestos)) {
      const e = equipoDe(hRe.nombre, fila, v);
      if (!e) continue;
      const codigo = texto(v['Código repuesto']);
      if (!codigo) { a.errores.push({ hoja: hRe.nombre, fila, motivo: 'Falta el código del repuesto.' }); continue; }
      const cantidad = numero(v['Cantidad']) ?? 1;
      if (cantidad < 0) { a.errores.push({ hoja: hRe.nombre, fila, motivo: 'La cantidad no puede ser negativa.' }); continue; }
      const clave = `${e.id}|${normalizar(codigo)}`;
      const previo = existentes.get(clave);
      const datos = { equipoId: e.id, codigo, descripcion: texto(v['Descripción']), cantidad, nota: texto(v['Nota']) };
      if (!previo) {
        const nuevo = { id: nuevoId(), ...datos };
        a.repuestosNuevos.push(nuevo);
        existentes.set(clave, nuevo);
      } else {
        const act = { ...previo, ...datos, descripcion: datos.descripcion || previo.descripcion };
        if (igualesJSON(act, previo)) a.sinCambios += 1;
        else a.repuestosActualizados.push(act);
      }
    }
  }

  // 3b) Planillas de tareas: las filas se juntan por nombre de planilla; si ya existe, se reemplazan sus tareas.
  const planillaPorNombre = new Map(actual.planillas.map(p => [normalizar(p.nombre.trim()), p]));
  const hPl = hoja(libro, HOJAS.planillas);
  if (hPl) {
    a.hojasLeidas.push(hPl.nombre);
    const leidas = new Map<string, { nombre: string; tareas: PlanillaTareas['tareas'] }>();
    for (const { fila, valores: v } of filasComoObjetos(hPl.filas, COLUMNAS.planillas)) {
      const nombre = texto(v['Planilla']);
      const tarea = texto(v['Tarea']).replace(/\s+/g, ' ');
      if (!nombre) { a.errores.push({ hoja: hPl.nombre, fila, motivo: 'Falta el nombre de la planilla.' }); continue; }
      if (!tarea) { a.errores.push({ hoja: hPl.nombre, fila, motivo: 'Falta la tarea.' }); continue; }
      const unidad = texto(v['Unidad']);
      const minimo = numero(v['Mínimo']);
      const maximo = numero(v['Máximo']);
      if (texto(v['Mínimo']) && minimo == null) { a.errores.push({ hoja: hPl.nombre, fila, motivo: `Mínimo inválido: "${texto(v['Mínimo'])}".` }); continue; }
      if (texto(v['Máximo']) && maximo == null) { a.errores.push({ hoja: hPl.nombre, fila, motivo: `Máximo inválido: "${texto(v['Máximo'])}".` }); continue; }
      if (minimo != null && maximo != null && minimo > maximo) { a.errores.push({ hoja: hPl.nombre, fila, motivo: 'El mínimo es mayor que el máximo.' }); continue; }
      const medicion: Medicion | null = unidad || minimo != null || maximo != null ? { unidad, minimo, maximo } : null;
      const k = normalizar(nombre);
      const p = leidas.get(k) ?? { nombre, tareas: [] };
      p.tareas.push({ id: nuevoId(), texto: tarea, medicion });
      leidas.set(k, p);
    }
    for (const [k, p] of leidas) {
      const previa = planillaPorNombre.get(k);
      if (!previa) {
        const nueva: PlanillaTareas = { id: nuevoId(), nombre: p.nombre, tareas: p.tareas, notas: '' };
        a.planillasNuevas.push(nueva);
        planillaPorNombre.set(k, nueva);
      } else {
        const iguales = igualesJSON(previa.tareas.map(t => [t.texto, t.medicion]), p.tareas.map(t => [t.texto, t.medicion]));
        if (iguales) { a.sinCambios += 1; continue; }
        // Se mantienen los ids de las tareas que ya estaban en el mismo lugar.
        const act = { ...previa, tareas: p.tareas.map((t, i) => ({ ...t, id: previa.tareas[i]?.id ?? t.id })) };
        a.planillasActualizadas.push(act);
        planillaPorNombre.set(k, act);
      }
    }
  }

  // 4) Rutinas preventivas: una por equipo y tarea (si ya está, se actualiza).
  const hRu = hoja(libro, HOJAS.rutinas);
  if (hRu) {
    a.hojasLeidas.push(hRu.nombre);
    const existentes = new Map(actual.rutinas.map(r => [`${r.equipoId}|${normalizar(r.tarea)}`, r]));
    for (const { fila, valores: v } of filasComoObjetos(hRu.filas, COLUMNAS.rutinas)) {
      const e = equipoDe(hRu.nombre, fila, v);
      if (!e) continue;
      const nombrePlanilla = texto(v['Planilla']);
      const planilla = nombrePlanilla ? planillaPorNombre.get(normalizar(nombrePlanilla)) : undefined;
      if (nombrePlanilla && !planilla) { a.errores.push({ hoja: hRu.nombre, fila, motivo: `No existe la planilla "${nombrePlanilla}" (cargala en la hoja ${HOJAS.planillas}).` }); continue; }
      const deLaPlanilla = planilla ? tareasDePlanilla(planilla) : null;
      const tarea = deLaPlanilla ? deLaPlanilla.tarea : texto(v['Tarea']);
      if (!tarea) { a.errores.push({ hoja: hRu.nombre, fila, motivo: 'Falta la tarea (o el nombre de una planilla).' }); continue; }
      const cada = numero(v['Cada (días)']);
      if (!cada || cada < 1 || !Number.isInteger(cada)) { a.errores.push({ hoja: hRu.nombre, fila, motivo: `"Cada (días)" tiene que ser un número entero mayor a 0 (vino "${texto(v['Cada (días)'])}").` }); continue; }
      const proxima = fechaDeExcel(v['Próxima fecha']);
      if (!proxima) { a.errores.push({ hoja: hRu.nombre, fila, motivo: `Próxima fecha inválida: "${texto(v['Próxima fecha'])}" (usá dd/mm/aaaa).` }); continue; }
      const aviso = numero(v['Avisar (días antes)']) ?? 3;
      const clave = `${e.id}|${normalizar(tarea)}`;
      const previo = existentes.get(clave);
      const datos = {
        equipoId: e.id, tarea, frecuenciaDias: cada, proximaFecha: proxima, avisoDiasAntes: Math.max(0, Math.round(aviso)),
        responsable: texto(v['Responsable']), activa: booleano(v['Activa'], true),
        planillaId: planilla?.id ?? null, mediciones: deLaPlanilla?.mediciones ?? (previo && !previo.planillaId ? previo.mediciones : []),
      };
      if (!previo) {
        // La columna "Repuestos" es solo para leer: los repuestos de la rutina se cargan en la app.
        const nueva = { id: nuevoId(), ...datos, repuestos: [] };
        a.rutinasNuevas.push(nueva);
        existentes.set(clave, nueva);
      } else {
        const act = { ...previo, ...datos };
        if (igualesJSON(act, previo)) a.sinCambios += 1;
        else a.rutinasActualizadas.push(act);
      }
    }
  }

  if (!a.hojasLeidas.length) {
    a.errores.push({ hoja: '-', fila: 0, motivo: `El archivo no tiene ninguna de las hojas esperadas (${[HOJAS.sectores, HOJAS.equipos, HOJAS.historial, HOJAS.repuestos, HOJAS.planillas, HOJAS.rutinas].join(', ')}). Descargá la plantilla para ver el formato.` });
  }
  return a;
}

// ---------- Archivo (usa la librería de Excel, que se descarga recién la primera vez) ----------

export async function leerArchivoExcel(file: File): Promise<Record<string, Tabla>> {
  const XLSX = await import('xlsx');
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
  return Object.fromEntries(wb.SheetNames.map(n => [n, XLSX.utils.sheet_to_json<Celda[]>(wb.Sheets[n], { header: 1, defval: '', raw: true })]));
}

export async function descargarExcel(hojas: Record<string, Tabla>, nombreArchivo: string) {
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();
  for (const [nombre, filas] of Object.entries(hojas)) {
    const ws = XLSX.utils.aoa_to_sheet(filas);
    const anchos = (filas[0] ?? []).map((_, c) => Math.min(60, Math.max(10, ...filas.map(f => String(f[c] ?? '').length + 2))));
    ws['!cols'] = anchos.map(wch => ({ wch }));
    XLSX.utils.book_append_sheet(wb, ws, nombre.slice(0, 31));
  }
  XLSX.writeFile(wb, nombreArchivo);
}
