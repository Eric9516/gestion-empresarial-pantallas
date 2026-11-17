import { normalizar } from './buscador';
import { listaDeTareas, numeroCorto, textoRepuestos } from './preventivo';
import type { Equipo, FechaISO, Intervencion, OrdenTrabajo, PlanillaTareas, Rutina, Sector, TareaDef } from './tipos';

// Importar y exportar Mantenimiento en Excel (del diseño del socio: src/features/mantenimiento/excelMantenimiento.ts en su repositorio).
// Un archivo con una hoja por tema, leyendo las columnas por su nombre (sin importar el orden, las tildes ni las mayúsculas), con una vista
// previa que dice qué se agrega, qué cambia y qué filas tienen problemas antes de guardar. Usa las mismas hojas y columnas que su
// "Exportar a Excel", así lo que cargó en su versión de ejemplo entra tal cual.
// Se cargan Sectores, Equipos, Historial, Repuestos críticos, Planillas de tareas y Rutinas preventivas. Órdenes de trabajo y Manuales solo
// se exportan (las OT las arman las rutinas; los manuales se suben en la ficha).

export const HOJAS = {
  sectores: 'Sectores',
  equipos: 'Equipos',
  historial: 'Historial',
  repuestos: 'Repuestos críticos',
  planillas: 'Planillas de tareas',
  rutinas: 'Rutinas preventivas',
  ordenes: 'Órdenes de trabajo',
} as const;

/** Hojas que puede traer el archivo y que no se cargan (solo se exportan). */
export const HOJAS_DE_OTRAS_ETAPAS = ['Órdenes de trabajo', 'Manuales'];

export const COLUMNAS = {
  sectores: ['Sector', 'Subsector'],
  equipos: ['Código', 'Nombre', 'Pertenece a', 'Sector', 'Subsector', 'Etiquetas', 'Marca', 'Modelo', 'N° de serie', 'Ubicación', 'Crítico', 'Notas'],
  historial: ['Código equipo', 'Fecha', 'Tipo', 'Descripción', 'Realizado por', 'Horas', 'Repuestos usados', 'Prioridad', 'Falla', 'Causa', 'Solución', 'Horas de parada'],
  repuestos: ['Código equipo', 'Código repuesto', 'Descripción', 'Cantidad', 'Nota'],
  planillas: ['Planilla', 'Tarea', 'Unidad', 'Mínimo', 'Máximo'],
  rutinas: ['Código equipo', 'Planilla', 'Tarea', 'Cada (días)', 'Próxima fecha', 'Avisar (días antes)', 'Responsable', 'Activa', 'Repuestos'],
  ordenes: ['Número', 'Tipo', 'Código equipo', 'Equipo', 'Fecha programada', 'Tareas', 'Tareas hechas', 'Asignado a', 'Estado', 'Fecha de cierre', 'Horas', 'Repuestos',
    'Prioridad', 'Falla', 'Causa', 'Solución', 'Horas de parada', 'Observaciones', 'Mediciones', 'Liberación'],
} as const;

/** Una celda tal como viaja al servidor: texto o número (las fechas, ya como aaaa-mm-dd). */
export type Celda = string | number | null;
export type Tabla = Celda[][];
export type Libro = Record<string, Tabla>;

export interface ErrorImportacion {
  hoja: string;
  /** Número de fila como se ve en Excel (la 1 es el encabezado). */
  fila: number;
  motivo: string;
}

export interface EquipoImportado {
  codigo: string;
  nombre: string;
  sector: string;
  subsector: string;
  etiquetas: string[];
  marca: string;
  modelo: string;
  numeroSerie: string;
  ubicacion: string;
  critico: boolean;
  notas: string;
  /** El código de su equipo principal (null = es principal). */
  padreCodigo: string | null;
}

export interface IntervencionImportada {
  equipoCodigo: string;
  fecha: FechaISO;
  tipo: 'correctivo' | 'preventivo';
  descripcion: string;
  /** Los nombres de quienes lo hicieron (se buscan entre los usuarios; si no hay, queda el nombre escrito). */
  tecnicos: string[];
  horas: number | null;
  repuestos: string;
  prioridad: 'normal' | 'urgente' | null;
  falla: string;
  causa: string;
  solucion: string;
  horasParada: number | null;
}

export interface RepuestoImportado { equipoCodigo: string; itemId: string; codigo: string; cantidad: number; nota: string }

export interface PlanillaImportada { nombre: string; tareas: TareaDef[] }

export interface RutinaImportada {
  /** La que se actualiza (null = nueva). */
  id: string | null;
  equipoCodigo: string;
  /** El nombre de la planilla de donde salen sus tareas (null = las de `tareas`). */
  planilla: string | null;
  tareas: string[];
  frecuenciaDias: number;
  proximaFecha: FechaISO;
  avisoDias: number;
  /** El nombre del responsable (vacío = sin asignar). Tiene que ser un usuario de Mantenimiento. */
  responsable: string;
  activa: boolean;
}

/** Una rutina como está en la base, para comparar. */
export interface RutinaActual extends Omit<RutinaImportada, 'id'> { id: string }

/** Lo que se va a hacer, sin guardar nada todavía. */
export interface Analisis {
  sectoresNuevos: { sector: string; subsector: string }[];
  /** El orden de los sectores según la hoja Sectores (null si el archivo no la trae o no cambia nada). */
  ordenSectores: string[] | null;
  equiposNuevos: EquipoImportado[];
  equiposActualizados: EquipoImportado[];
  intervenciones: IntervencionImportada[];
  repuestosNuevos: RepuestoImportado[];
  repuestosActualizados: RepuestoImportado[];
  planillasNuevas: PlanillaImportada[];
  planillasActualizadas: PlanillaImportada[];
  rutinasNuevas: RutinaImportada[];
  rutinasActualizadas: RutinaImportada[];
  /** Cosas que se cargan igual pero conviene revisar (ej.: un responsable que no es usuario de Mantenimiento). */
  avisos: string[];
  /** Filas que ya estaban igual (no cambia nada). */
  sinCambios: number;
  errores: ErrorImportacion[];
  hojasLeidas: string[];
  /** Hojas que se reconocen pero todavía no se cargan (otras etapas). */
  hojasParaDespues: string[];
}

/** Lo que ya hay en la base, para saber qué es nuevo y qué cambia. */
export interface Actual {
  sectores: Sector[];
  equipos: Equipo[];
  /** "códigoDeEquipo|fecha|tipo|descripción" (normalizados) de lo que ya está en el historial. */
  intervenciones: Set<string>;
  /** "códigoDeEquipo|códigoDeRepuesto" (normalizados) → lo guardado. */
  repuestos: Map<string, { cantidad: number; nota: string }>;
  /** Los repuestos del Depósito que nombra el archivo, por su código normalizado. */
  items: Map<string, { id: string; codigo: string }>;
  planillas: PlanillaTareas[];
  rutinas: RutinaActual[];
  /** Los nombres de los usuarios de Mantenimiento (los que pueden ser responsables de una rutina). */
  tecnicos: string[];
}

export function hayAlgoParaGuardar(a: Analisis): boolean {
  return (a.ordenSectores ? 1 : 0) + a.sectoresNuevos.length + a.equiposNuevos.length + a.equiposActualizados.length + a.intervenciones.length
    + a.repuestosNuevos.length + a.repuestosActualizados.length + a.planillasNuevas.length + a.planillasActualizadas.length + a.rutinasNuevas.length
    + a.rutinasActualizadas.length > 0;
}

function texto(v: unknown): string {
  return v == null ? '' : String(v).trim();
}

const clave = (t: string) => normalizar(t.trim());

/** Acepta aaaa-mm-dd, dd/mm/aaaa, d/m/aa o un número de serie de Excel. */
export function fechaDeExcel(v: unknown): FechaISO | null {
  if (typeof v === 'number' && v > 20000 && v < 80000) {
    // número de serie de Excel: días desde el 30/12/1899
    const d = new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86_400_000);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
  }
  const t = texto(v);
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(t);
  let iso: string | null = null;
  if (m) iso = `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  else if ((m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/.exec(t))) {
    iso = `${m[3].length === 2 ? `20${m[3]}` : m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  }
  if (!iso) return null;
  const d = new Date(`${iso}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === iso ? iso : null;
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

/** La hoja por su nombre, sin importar tildes ni mayúsculas. */
function hoja(libro: Libro, nombre: string): { nombre: string; filas: Tabla } | null {
  const k = Object.keys(libro).find(x => clave(x) === clave(nombre));
  return k ? { nombre: k, filas: libro[k] } : null;
}

/** Las filas de una hoja como {columna: valor}, ubicando cada columna por su encabezado. Saltea las vacías. */
function filasComoObjetos(filas: Tabla, columnas: readonly string[]): { fila: number; v: Record<string, Celda> }[] {
  if (!filas.length) return [];
  const encabezado = filas[0].map(c => normalizarEncabezado(texto(c)));
  const indice = new Map(columnas.map(c => [c, encabezado.indexOf(normalizarEncabezado(c))]));
  return filas.slice(1).map((f, i) => ({
    fila: i + 2,
    v: Object.fromEntries(columnas.map(c => [c, (indice.get(c) ?? -1) >= 0 ? f[indice.get(c)!] ?? '' : ''])),
  })).filter(({ v }) => Object.values(v).some(x => texto(x) !== ''));
}

const etiquetas = (v: unknown) => [...new Set(texto(v).split(/[,;]/).map(s => s.trim()).filter(Boolean))];
/** "Ana Pérez, Juan Gómez y Luis" → los tres nombres. */
const nombres = (v: unknown) => [...new Set(texto(v).split(/\s*(?:[,;/+]|\by\b)\s*/i).map(s => s.trim()).filter(Boolean))];

/** Los códigos de repuesto que nombra el archivo (para buscarlos en el Depósito antes de analizar). */
export function codigosDeRepuestos(libro: Libro): string[] {
  const h = hoja(libro, HOJAS.repuestos);
  return h ? [...new Set(filasComoObjetos(h.filas, COLUMNAS.repuestos).map(({ v }) => texto(v['Código repuesto'])).filter(Boolean))] : [];
}

const iguales = (a: EquipoImportado, e: Equipo, padreCodigo: string | null) =>
  a.nombre === e.nombre && clave(a.sector) === clave(e.sector) && clave(a.subsector) === clave(e.subsector) && a.etiquetas.join('|') === e.etiquetas.join('|')
  && a.marca === e.marca && a.modelo === e.modelo && a.numeroSerie === e.numeroSerie && a.ubicacion === e.ubicacion && a.critico === e.critico
  && a.notas === e.notas && clave(a.padreCodigo ?? '') === clave(padreCodigo ?? '');

/** Dice qué se va a agregar, qué cambia y qué filas tienen problemas. No guarda nada. */
export function analizarLibro(libro: Libro, actual: Actual): Analisis {
  const a: Analisis = {
    sectoresNuevos: [], ordenSectores: null, equiposNuevos: [], equiposActualizados: [], intervenciones: [], repuestosNuevos: [], repuestosActualizados: [],
    planillasNuevas: [], planillasActualizadas: [], rutinasNuevas: [], rutinasActualizadas: [], avisos: [], sinCambios: 0, errores: [], hojasLeidas: [], hojasParaDespues: HOJAS_DE_OTRAS_ETAPAS.filter(n => hoja(libro, n)),
  };
  const sectorPorId = new Map(actual.sectores.map(s => [s.id, s]));
  const existentes = new Set(actual.sectores.map(s => {
    const padre = s.padreId ? sectorPorId.get(s.padreId) : null;
    return padre ? `${clave(padre.nombre)}|${clave(s.nombre)}` : `${clave(s.nombre)}|`;
  }));
  const anotarSector = (sector: string, subsector: string) => {
    for (const [s, sub] of [[sector, ''], ...(subsector ? [[sector, subsector]] : [])]) {
      const k = `${clave(s)}|${clave(sub)}`;
      if (s && !existentes.has(k)) { existentes.add(k); a.sectoresNuevos.push({ sector: s, subsector: sub }); }
    }
  };

  // 0) Sectores (opcional): los que no existen, y el orden de importancia (el de la hoja).
  const hSe = hoja(libro, HOJAS.sectores);
  if (hSe) {
    a.hojasLeidas.push(hSe.nombre);
    const orden: string[] = [];
    for (const { fila, v } of filasComoObjetos(hSe.filas, COLUMNAS.sectores)) {
      const sector = texto(v['Sector']), subsector = texto(v['Subsector']);
      if (!sector) { a.errores.push({ hoja: hSe.nombre, fila, motivo: 'Falta el nombre del sector.' }); continue; }
      if (sector.length > 80 || subsector.length > 80) { a.errores.push({ hoja: hSe.nombre, fila, motivo: 'El nombre del sector es demasiado largo (más de 80 letras).' }); continue; }
      if (!orden.some(o => clave(o) === clave(sector))) orden.push(sector);
      const antes = a.sectoresNuevos.length;
      anotarSector(sector, subsector);
      if (a.sectoresNuevos.length === antes) a.sinCambios += 1;
    }
    const actuales = actual.sectores.filter(s => !s.padreId).sort((x, y) => (x.orden ?? Infinity) - (y.orden ?? Infinity) || x.nombre.localeCompare(y.nombre, 'es')).map(s => s.nombre);
    const nuevo = [...orden, ...actuales.filter(n => !orden.some(o => clave(o) === clave(n)))];
    if (orden.length && nuevo.map(clave).join('|') !== actuales.map(clave).join('|')) a.ordenSectores = nuevo;
  }

  // 1) Equipos (primero, así las otras hojas pueden usar los equipos nuevos del mismo archivo).
  const previos = new Map(actual.equipos.map(e => [clave(e.codigo), e]));
  const codigoDeId = new Map(actual.equipos.map(e => [e.id, e.codigo]));
  /** Los equipos que van a quedar (los de la base más los nuevos del archivo), por código: si son principales. */
  const esPrincipal = new Map(actual.equipos.map(e => [clave(e.codigo), !e.padreId]));
  const hEq = hoja(libro, HOJAS.equipos);
  if (hEq) {
    a.hojasLeidas.push(hEq.nombre);
    const conColumnaPadre = tieneColumna(hEq.filas, 'Pertenece a');
    const vistos = new Set<string>();
    // primero se leen todas las filas (un sub-equipo puede estar antes que su principal en la planilla)
    const leidas: { fila: number; datos: EquipoImportado }[] = [];
    for (const { fila, v } of filasComoObjetos(hEq.filas, COLUMNAS.equipos)) {
      const codigo = texto(v['Código']), nombre = texto(v['Nombre']);
      if (!codigo) { a.errores.push({ hoja: hEq.nombre, fila, motivo: 'Falta el código del equipo.' }); continue; }
      if (!nombre) { a.errores.push({ hoja: hEq.nombre, fila, motivo: `Falta el nombre del equipo ${codigo}.` }); continue; }
      if (codigo.length > 40 || nombre.length > 160) { a.errores.push({ hoja: hEq.nombre, fila, motivo: `El código (hasta 40 letras) o el nombre (hasta 160) de ${codigo} es demasiado largo.` }); continue; }
      if (vistos.has(clave(codigo))) { a.errores.push({ hoja: hEq.nombre, fila, motivo: `El código ${codigo} está repetido en la planilla.` }); continue; }
      vistos.add(clave(codigo));
      const previo = previos.get(clave(codigo));
      const sector = texto(v['Sector']);
      leidas.push({
        fila,
        datos: {
          codigo: previo?.codigo ?? codigo, nombre, sector, subsector: sector ? texto(v['Subsector']) : '', etiquetas: etiquetas(v['Etiquetas']).slice(0, 30),
          marca: texto(v['Marca']), modelo: texto(v['Modelo']), numeroSerie: texto(v['N° de serie']), ubicacion: texto(v['Ubicación']),
          critico: booleano(v['Crítico'], false), notas: texto(v['Notas']),
          padreCodigo: conColumnaPadre ? texto(v['Pertenece a']) || null : (previo?.padreId ? codigoDeId.get(previo.padreId) ?? null : null),
        },
      });
    }
    for (const { datos } of leidas) esPrincipal.set(clave(datos.codigo), !datos.padreCodigo);
    for (const { fila, datos } of leidas) {
      const previo = previos.get(clave(datos.codigo));
      if (datos.padreCodigo) {
        const padre = datos.padreCodigo;
        if (!esPrincipal.has(clave(padre))) { a.errores.push({ hoja: hEq.nombre, fila, motivo: `"Pertenece a": no existe un equipo con código ${padre}.` }); continue; }
        if (clave(padre) === clave(datos.codigo) || !esPrincipal.get(clave(padre))) {
          a.errores.push({ hoja: hEq.nombre, fila, motivo: `"Pertenece a" tiene que ser un equipo principal (${padre} no lo es).` }); continue;
        }
        datos.padreCodigo = previos.get(clave(padre))?.codigo ?? leidas.find(l => clave(l.datos.codigo) === clave(padre))?.datos.codigo ?? padre;
      }
      anotarSector(datos.sector, datos.subsector);
      if (!previo) a.equiposNuevos.push(datos);
      else if (iguales(datos, previo, previo.padreId ? codigoDeId.get(previo.padreId) ?? null : null)) a.sinCambios += 1;
      else a.equiposActualizados.push(datos);
    }
  }
  const quedan = new Set([...actual.equipos.map(e => clave(e.codigo)), ...a.equiposNuevos.map(e => clave(e.codigo))]);
  const equipoDe = (hojaNombre: string, fila: number, v: Record<string, Celda>): string | null => {
    const codigo = texto(v['Código equipo']);
    if (!codigo) { a.errores.push({ hoja: hojaNombre, fila, motivo: 'Falta el código del equipo.' }); return null; }
    if (!quedan.has(clave(codigo))) { a.errores.push({ hoja: hojaNombre, fila, motivo: `No existe un equipo con código ${codigo} (agregalo en la hoja Equipos).` }); return null; }
    return previos.get(clave(codigo))?.codigo ?? a.equiposNuevos.find(e => clave(e.codigo) === clave(codigo))?.codigo ?? codigo;
  };

  // 2) Historial: se agrega; si ya hay uno igual (mismo equipo, fecha, tipo y descripción), se saltea.
  const hHi = hoja(libro, HOJAS.historial);
  if (hHi) {
    a.hojasLeidas.push(hHi.nombre);
    const yaEstan = new Set(actual.intervenciones);
    for (const { fila, v } of filasComoObjetos(hHi.filas, COLUMNAS.historial)) {
      const equipo = equipoDe(hHi.nombre, fila, v);
      if (!equipo) continue;
      const fecha = fechaDeExcel(v['Fecha']);
      if (!fecha) { a.errores.push({ hoja: hHi.nombre, fila, motivo: `Fecha inválida: "${texto(v['Fecha'])}" (usá dd/mm/aaaa).` }); continue; }
      const t = clave(texto(v['Tipo']));
      const tipo = t.startsWith('prev') ? 'preventivo' : t.startsWith('corr') ? 'correctivo' : null;
      if (!tipo) { a.errores.push({ hoja: hHi.nombre, fila, motivo: `Tipo inválido: "${texto(v['Tipo'])}" (Correctivo o Preventivo).` }); continue; }
      const descripcion = texto(v['Descripción']).slice(0, 4000);
      if (!descripcion) { a.errores.push({ hoja: hHi.nombre, fila, motivo: 'Falta la descripción de lo que se hizo.' }); continue; }
      const horas = numero(v['Horas']), parada = numero(v['Horas de parada']);
      if ((horas != null && (horas < 0 || horas > 100000)) || (parada != null && (parada < 0 || parada > 100000))) {
        a.errores.push({ hoja: hHi.nombre, fila, motivo: 'Las horas tienen que ser un número positivo.' }); continue;
      }
      const k = `${clave(equipo)}|${fecha}|${tipo}|${clave(descripcion)}`;
      if (yaEstan.has(k)) { a.sinCambios += 1; continue; }
      yaEstan.add(k);
      a.intervenciones.push({
        equipoCodigo: equipo, fecha, tipo, descripcion, tecnicos: nombres(v['Realizado por']).map(n => n.slice(0, 160)).slice(0, 20), horas,
        repuestos: texto(v['Repuestos usados']).slice(0, 2000),
        prioridad: tipo === 'correctivo' ? (clave(texto(v['Prioridad'])).startsWith('urg') ? 'urgente' : 'normal') : null,
        falla: tipo === 'correctivo' ? texto(v['Falla']).slice(0, 4000) : '', causa: tipo === 'correctivo' ? texto(v['Causa']).slice(0, 4000) : '',
        solucion: tipo === 'correctivo' ? texto(v['Solución']).slice(0, 4000) : '', horasParada: tipo === 'correctivo' ? parada : null,
      });
    }
  }

  // 3) Repuestos críticos: tienen que estar en el Depósito (uno por equipo y repuesto; si ya está, se actualiza).
  const hRe = hoja(libro, HOJAS.repuestos);
  if (hRe) {
    a.hojasLeidas.push(hRe.nombre);
    const vistos = new Set<string>();
    for (const { fila, v } of filasComoObjetos(hRe.filas, COLUMNAS.repuestos)) {
      const equipo = equipoDe(hRe.nombre, fila, v);
      if (!equipo) continue;
      const codigo = texto(v['Código repuesto']);
      if (!codigo) { a.errores.push({ hoja: hRe.nombre, fila, motivo: 'Falta el código del repuesto.' }); continue; }
      const item = actual.items.get(clave(codigo));
      if (!item) { a.errores.push({ hoja: hRe.nombre, fila, motivo: `El repuesto ${codigo} no está en el Depósito: cargalo primero allá.` }); continue; }
      const cantidad = numero(v['Cantidad']) ?? 1;
      if (cantidad <= 0 || cantidad > 1000000) { a.errores.push({ hoja: hRe.nombre, fila, motivo: 'La cantidad tiene que ser mayor que cero.' }); continue; }
      const k = `${clave(equipo)}|${clave(item.codigo)}`;
      if (vistos.has(k)) { a.errores.push({ hoja: hRe.nombre, fila, motivo: `El repuesto ${codigo} está repetido para ${equipo}.` }); continue; }
      vistos.add(k);
      const fila_ = { equipoCodigo: equipo, itemId: item.id, codigo: item.codigo, cantidad, nota: texto(v['Nota']).slice(0, 300) };
      const previo = actual.repuestos.get(k);
      if (!previo) a.repuestosNuevos.push(fila_);
      else if (previo.cantidad === cantidad && previo.nota === fila_.nota) a.sinCambios += 1;
      else a.repuestosActualizados.push(fila_);
    }
  }

  // 4) Planillas de tareas: las filas se juntan por el nombre de la planilla; si ya existe, se reemplazan sus tareas. Con unidad, mínimo o
  //    máximo, la tarea es una medición.
  const planillas = new Map(actual.planillas.map(p => [clave(p.nombre), p.tareas]));
  const hPl = hoja(libro, HOJAS.planillas);
  if (hPl) {
    a.hojasLeidas.push(hPl.nombre);
    const leidas = new Map<string, PlanillaImportada>();
    for (const { fila, v } of filasComoObjetos(hPl.filas, COLUMNAS.planillas)) {
      const nombre = texto(v['Planilla']).replace(/\s+/g, ' ');
      const tarea = texto(v['Tarea']).replace(/\s+/g, ' ');
      if (!nombre) { a.errores.push({ hoja: hPl.nombre, fila, motivo: 'Falta el nombre de la planilla.' }); continue; }
      if (!tarea) { a.errores.push({ hoja: hPl.nombre, fila, motivo: 'Falta la tarea.' }); continue; }
      if (nombre.length > 160 || tarea.length > 500) { a.errores.push({ hoja: hPl.nombre, fila, motivo: 'El nombre (hasta 160 letras) o la tarea (hasta 500) es demasiado largo.' }); continue; }
      const unidad = texto(v['Unidad']).slice(0, 30);
      const minimo = numero(v['Mínimo']), maximo = numero(v['Máximo']);
      if ((texto(v['Mínimo']) && minimo == null) || (texto(v['Máximo']) && maximo == null)) { a.errores.push({ hoja: hPl.nombre, fila, motivo: 'El mínimo y el máximo tienen que ser números.' }); continue; }
      if (minimo != null && maximo != null && minimo > maximo) { a.errores.push({ hoja: hPl.nombre, fila, motivo: 'El mínimo es mayor que el máximo.' }); continue; }
      const p = leidas.get(clave(nombre)) ?? { nombre, tareas: [] };
      p.tareas.push({ texto: tarea, medicion: unidad || minimo != null || maximo != null ? { unidad, minimo, maximo } : null });
      leidas.set(clave(nombre), p);
    }
    for (const [k, p] of leidas) {
      const previa = planillas.get(k);
      if (!previa) a.planillasNuevas.push(p);
      else if (JSON.stringify(previa) === JSON.stringify(p.tareas)) a.sinCambios += 1;
      else a.planillasActualizadas.push(p);
      planillas.set(k, p.tareas);
    }
  }

  // 5) Rutinas preventivas: una por equipo y planilla (o por equipo y tareas, si no usa planilla); si ya está, se actualiza.
  const hRu = hoja(libro, HOJAS.rutinas);
  if (hRu) {
    a.hojasLeidas.push(hRu.nombre);
    const claveRutina = (equipo: string, planilla: string | null, tareas: string[]) =>
      `${clave(equipo)}|${planilla ? `planilla:${clave(planilla)}` : `tareas:${tareas.map(clave).join('\n')}`}`;
    const existentes = new Map(actual.rutinas.map(r => [claveRutina(r.equipoCodigo, r.planilla, r.tareas), r]));
    const tecnicos = new Map(actual.tecnicos.map(t => [clave(t), t]));
    const vistas = new Set<string>();
    for (const { fila, v } of filasComoObjetos(hRu.filas, COLUMNAS.rutinas)) {
      const equipo = equipoDe(hRu.nombre, fila, v);
      if (!equipo) continue;
      const nombrePlanilla = texto(v['Planilla']).replace(/\s+/g, ' ');
      if (nombrePlanilla && !planillas.has(clave(nombrePlanilla))) {
        a.errores.push({ hoja: hRu.nombre, fila, motivo: `No existe la planilla "${nombrePlanilla}" (cargala en la hoja ${HOJAS.planillas}).` }); continue;
      }
      const planilla = nombrePlanilla ? actual.planillas.find(p => clave(p.nombre) === clave(nombrePlanilla))?.nombre ?? nombrePlanilla : null;
      const tareas = planilla ? [] : listaDeTareas(texto(v['Tarea'])).slice(0, 100);
      if (!planilla && !tareas.length) { a.errores.push({ hoja: hRu.nombre, fila, motivo: 'Falta la tarea (o el nombre de una planilla).' }); continue; }
      const cada = numero(v['Cada (días)']);
      if (!cada || !Number.isInteger(cada) || cada < 1 || cada > 3650) {
        a.errores.push({ hoja: hRu.nombre, fila, motivo: `"Cada (días)" tiene que ser un número entero de 1 a 3650 (vino "${texto(v['Cada (días)'])}").` }); continue;
      }
      const proxima = fechaDeExcel(v['Próxima fecha']);
      if (!proxima) { a.errores.push({ hoja: hRu.nombre, fila, motivo: `Próxima fecha inválida: "${texto(v['Próxima fecha'])}" (usá dd/mm/aaaa).` }); continue; }
      const aviso = numero(v['Avisar (días antes)']) ?? 3;
      if (aviso < 0 || aviso > 365) { a.errores.push({ hoja: hRu.nombre, fila, motivo: '"Avisar (días antes)" tiene que ser de 0 a 365.' }); continue; }
      const k = claveRutina(equipo, planilla, tareas);
      if (vistas.has(k)) { a.errores.push({ hoja: hRu.nombre, fila, motivo: `La rutina está repetida para ${equipo}.` }); continue; }
      vistas.add(k);
      let responsable = texto(v['Responsable']);
      if (responsable && !tecnicos.has(clave(responsable))) {
        a.avisos.push(`${hRu.nombre}, fila ${fila}: "${responsable}" no es un usuario de Mantenimiento; la rutina queda sin responsable.`);
        responsable = '';
      }
      const previo = existentes.get(k);
      const datos: RutinaImportada = {
        id: previo?.id ?? null, equipoCodigo: equipo, planilla, tareas, frecuenciaDias: cada, proximaFecha: proxima, avisoDias: Math.round(aviso),
        responsable: responsable ? tecnicos.get(clave(responsable))! : '', activa: booleano(v['Activa'], true),
      };
      if (!previo) a.rutinasNuevas.push(datos);
      else if (previo.frecuenciaDias === datos.frecuenciaDias && previo.proximaFecha === datos.proximaFecha && previo.avisoDias === datos.avisoDias
        && clave(previo.responsable) === clave(datos.responsable) && previo.activa === datos.activa) a.sinCambios += 1;
      else a.rutinasActualizadas.push(datos);
    }
  }
  return a;
}

// ---------- Exportar ----------

const fechaParaExcel = (iso: FechaISO) => { const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}`; };

/** Las hojas del archivo, con lo que hay (o vacías, para la plantilla), cada una con su fila de encabezados. */
const ESTADOS = { pendiente: 'Pendiente', en_curso: 'En curso', terminada: 'Terminada' } as const;

export function armarHojas(datos: {
  sectores: Sector[]; equipos: Equipo[]; intervenciones: Intervencion[]; repuestos: { equipoId: string; codigo: string; descripcion: string; cantidad: number; nota: string }[];
  planillas: PlanillaTareas[]; rutinas: Rutina[]; ordenes: OrdenTrabajo[];
}): Libro {
  const porId = new Map(datos.equipos.map(e => [e.id, e]));
  const cod = (id: string) => porId.get(id)?.codigo ?? '';
  const nombrePlanilla = new Map(datos.planillas.map(p => [p.id, p.nombre]));
  const principales = datos.sectores.filter(s => !s.padreId).sort((x, y) => (x.orden ?? Infinity) - (y.orden ?? Infinity) || x.nombre.localeCompare(y.nombre, 'es'));
  return {
    [HOJAS.sectores]: [[...COLUMNAS.sectores], ...principales.flatMap(s => {
      const subs = datos.sectores.filter(x => x.padreId === s.id).sort((x, y) => x.nombre.localeCompare(y.nombre, 'es'));
      return subs.length ? subs.map(x => [s.nombre, x.nombre]) : [[s.nombre, '']];
    })],
    [HOJAS.equipos]: [[...COLUMNAS.equipos], ...[...datos.equipos].sort((x, y) => x.codigo.localeCompare(y.codigo, 'es')).map(e => [
      e.codigo, e.nombre, e.padreId ? porId.get(e.padreId)?.codigo ?? '' : '', e.sector, e.subsector, e.etiquetas.join(', '), e.marca, e.modelo,
      e.numeroSerie, e.ubicacion, e.critico ? 'SI' : 'NO', e.notas,
    ])],
    [HOJAS.historial]: [[...COLUMNAS.historial], ...[...datos.intervenciones].sort((x, y) => x.fecha.localeCompare(y.fecha)).map(i => [
      porId.get(i.equipoId)?.codigo ?? '', fechaParaExcel(i.fecha), i.tipo === 'correctivo' ? 'Correctivo' : 'Preventivo', i.descripcion,
      i.tecnicos.map(t => t.nombre).join(', '), i.horas ?? '', i.repuestosUsados,
      i.correctivo ? (i.correctivo.prioridad === 'urgente' ? 'Urgente' : 'Normal') : '', i.correctivo?.falla ?? '', i.correctivo?.causa ?? '',
      i.correctivo?.solucion ?? '', i.correctivo?.horasParada ?? '',
    ])],
    [HOJAS.repuestos]: [[...COLUMNAS.repuestos], ...datos.repuestos.map(r => [porId.get(r.equipoId)?.codigo ?? '', r.codigo, r.descripcion, r.cantidad, r.nota])],
    [HOJAS.planillas]: [[...COLUMNAS.planillas], ...datos.planillas.flatMap(p => p.tareas.map(t => [
      p.nombre, t.texto, t.medicion?.unidad ?? '', t.medicion?.minimo ?? '', t.medicion?.maximo ?? '',
    ]))],
    [HOJAS.rutinas]: [[...COLUMNAS.rutinas], ...[...datos.rutinas].sort((x, y) => cod(x.equipoId).localeCompare(cod(y.equipoId), 'es') || x.proximaFecha.localeCompare(y.proximaFecha)).map(r => [
      cod(r.equipoId), r.planillaId ? nombrePlanilla.get(r.planillaId) ?? '' : '', r.planillaId ? '' : r.tareas.map(t => t.texto).join('\n'), r.frecuenciaDias,
      fechaParaExcel(r.proximaFecha), r.avisoDias, r.responsable, r.activa ? 'SI' : 'NO', textoRepuestos(r.repuestos),
    ])],
    [HOJAS.ordenes]: [[...COLUMNAS.ordenes], ...[...datos.ordenes].sort((x, y) => x.numero - y.numero).map(o => [
      `OT-${String(o.numero).padStart(4, '0')}`, o.tipo === 'preventiva' ? 'Preventiva' : 'Correctiva', cod(o.equipoId), porId.get(o.equipoId)?.nombre ?? '',
      fechaParaExcel(o.fechaProgramada), o.tareas.map(t => t.texto).join('\n'), `${o.tareas.filter(t => t.hecha).length} de ${o.tareas.length}`, o.asignado,
      ESTADOS[o.estado], o.fechaCierre ? fechaParaExcel(o.fechaCierre) : '', o.horas ?? '',
      textoRepuestos(o.estado === 'terminada' ? o.repuestos.map(r => ({ ...r, cantidad: r.usado ?? 0 })).filter(r => r.cantidad > 0) : o.repuestos),
      o.correctivo ? (o.correctivo.prioridad === 'urgente' ? 'Urgente' : 'Normal') : '', o.correctivo?.falla ?? '', o.correctivo?.causa ?? '',
      o.correctivo?.solucion ?? '', o.correctivo?.horasParada ?? '', o.observaciones,
      o.tareas.filter(t => t.medicion && t.valor != null).map(t => `${t.texto}: ${numeroCorto(t.valor!)}${t.medicion!.unidad ? ` ${t.medicion!.unidad}` : ''}`).join('; '),
      o.liberacion ? [...o.liberacion.controles.map(c => `${c.texto}: ${c.ok ? 'sí' : 'no'}`), o.liberacion.recibio && `recibió ${o.liberacion.recibio}`].filter(Boolean).join('; ') : '',
    ])],
  };
}

// ---------- Archivo (la librería de Excel se descarga recién la primera vez) ----------

/** Lee el archivo en el navegador: cada hoja, con sus filas. Las fechas pasan a aaaa-mm-dd. */
export async function leerArchivoExcel(file: File): Promise<Libro> {
  const XLSX = await import('xlsx');
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
  const celda = (c: unknown): Celda => c instanceof Date
    ? `${c.getFullYear()}-${String(c.getMonth() + 1).padStart(2, '0')}-${String(c.getDate()).padStart(2, '0')}`
    : typeof c === 'number' ? c : c == null ? '' : String(c).slice(0, 4000);
  return Object.fromEntries(wb.SheetNames.map(n => [n, XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[n], { header: 1, defval: '', raw: true })
    .slice(0, 5001).map(f => f.slice(0, 40).map(celda))]));
}

export async function descargarExcel(hojas: Libro, nombreArchivo: string) {
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();
  for (const [nombre, filas] of Object.entries(hojas)) {
    const ws = XLSX.utils.aoa_to_sheet(filas);
    ws['!cols'] = (filas[0] ?? []).map((_, c) => ({ wch: Math.min(60, Math.max(10, ...filas.map(f => String(f[c] ?? '').length + 2))) }));
    XLSX.utils.book_append_sheet(wb, ws, nombre.slice(0, 31));
  }
  XLSX.writeFile(wb, nombreArchivo);
}
