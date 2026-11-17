import { describe, expect, it } from 'vitest';
import { buscarEquipos, normalizar, type Relacionados } from './buscador';
import { type Actual, type Libro, analizarLibro, armarHojas, fechaDeExcel, hayAlgoParaGuardar } from './excel';
import { sectoresConCantidad } from './sectores';
import { fueraDeRango, leerNumero, textoRango } from './preventivo';
import { tareasDeFilas, filasDeTareas } from './filasDeTareas';
import type { Equipo, Intervencion, PlanillaTareas, Rutina, Sector } from './tipos';

// Las reglas del buscador y de los sectores de Mantenimiento (del diseño del socio), con datos inventados.

const equipo = (x: Partial<Equipo> & Pick<Equipo, 'id' | 'codigo' | 'nombre'>): Equipo => ({
  sectorId: null, sector: '', subsector: '', etiquetas: [], marca: '', modelo: '', numeroSerie: '', ubicacion: '', critico: false, notas: '', padreId: null, ...x,
});
const intervencion = (x: Partial<Intervencion> & Pick<Intervencion, 'id' | 'equipoId' | 'fecha' | 'descripcion'>): Intervencion => ({
  tipo: 'correctivo', tecnicos: [], horas: null, repuestosUsados: '', correctivo: null, otNumero: null, horasParada: null, revisadoPor: '', aprobadoPor: '', repuestos: [], ...x,
});

const EQUIPOS = [
  equipo({ id: 'e1', codigo: 'CF-01', nombre: 'Cámara de frío', sector: 'Servicios', subsector: 'Frío', etiquetas: ['compresión'] }),
  equipo({ id: 'e2', codigo: 'BC-01', nombre: 'Bomba centrífuga', sector: 'Proceso', marca: 'Marca J' }),
  equipo({ id: 'e3', codigo: 'PA-01', nombre: 'Pasteurizador 1', sector: 'Proceso' }),
  equipo({ id: 'e4', codigo: 'PA-01-B1', nombre: 'Bomba de alimentación', padreId: 'e3' }),
];
const HISTORIAL = [
  intervencion({ id: 'i1', equipoId: 'e2', fecha: '2026-09-12', descripcion: 'Cambio de sello mecánico', tecnicos: [{ id: 'u1', nombre: 'Ana Técnica' }] }),
];
const rel = (id: string): Relacionados => ({
  intervenciones: HISTORIAL.filter(i => i.equipoId === id),
  repuestos: id === 'e1' ? [{ codigo: 'MRO00012', descripcion: 'Filtro deshidratador', nota: '' }] : [],
  manuales: id === 'e3' ? [{ nombre: 'Manual de operación.pdf' }] : [],
  padre: EQUIPOS.find(e => e.id === EQUIPOS.find(x => x.id === id)?.padreId) ?? null,
});
const codigos = (consulta: string) => buscarEquipos(EQUIPOS, consulta, rel).map(r => r.equipo.codigo);

describe('buscador de equipos', () => {
  it('no le importan tildes ni mayúsculas', () => {
    expect(normalizar('Compresión FRÍO')).toBe('compresion frio');
    expect(codigos('FRIO')).toEqual(['CF-01']);
    expect(codigos('compresion')).toEqual(['CF-01']);
  });

  it('con varias palabras exige todas', () => {
    expect(codigos('bomba proceso')).toEqual(['BC-01']);
    expect(codigos('bomba frío')).toEqual([]);
  });

  it('encuentra por el historial, los repuestos críticos y los manuales, y dice dónde coincidió', () => {
    const [r] = buscarEquipos(EQUIPOS, 'sello', rel);
    expect(r.equipo.codigo).toBe('BC-01');
    expect(r.motivos).toEqual(['historial 12/9/2026']);
    expect(codigos('ana')).toEqual(['BC-01']);
    expect(codigos('deshidratador')).toEqual(['CF-01']);
    expect(codigos('operacion')).toEqual(['PA-01']);
  });

  it('el sub-equipo se encuentra por el nombre de su principal', () => {
    expect(codigos('alimentacion pasteurizador')).toEqual(['PA-01-B1']);
  });

  it('el código exacto queda primero', () => {
    expect(codigos('pa-01')[0]).toBe('PA-01');
  });

  it('sin texto (o solo palabras como "de") devuelve todos, ordenados por nombre', () => {
    expect(codigos('')).toEqual(['BC-01', 'PA-01-B1', 'CF-01', 'PA-01']);
    expect(codigos('de').length).toBeGreaterThan(0);
  });
});

describe('sectores', () => {
  const SECTORES: Sector[] = [
    { id: 's1', nombre: 'Servicios', padreId: null, orden: 2 },
    { id: 's2', nombre: 'Proceso', padreId: null, orden: 1 },
    { id: 's3', nombre: 'Frío', padreId: 's1', orden: null },
    { id: 's4', nombre: 'Aire comprimido', padreId: 's1', orden: null },
    { id: 's5', nombre: 'Almacén', padreId: null, orden: null },
  ];

  it('van en el orden que eligió la empresa (los sin orden al final, por nombre), con sus sub-sectores por nombre', () => {
    const lista = sectoresConCantidad(SECTORES, []);
    expect(lista.map(s => s.nombre)).toEqual(['Proceso', 'Servicios', 'Almacén']);
    expect(lista[1].subsectores.map(s => s.nombre)).toEqual(['Aire comprimido', 'Frío']);
  });

  it('el sector cuenta sus equipos y los de sus sub-sectores', () => {
    const lista = sectoresConCantidad(SECTORES, [{ sectorId: 's1' }, { sectorId: 's3' }, { sectorId: 's3' }, { sectorId: null }]);
    const servicios = lista.find(s => s.id === 's1')!;
    expect(servicios.equipos).toBe(3);
    expect(servicios.subsectores.find(s => s.id === 's3')!.equipos).toBe(2);
  });
});

describe('importar desde Excel', () => {
  // un archivo como el que exporta la versión de ejemplo del socio: más columnas de las que se usan, en otro orden, y hojas de otras etapas
  const libro: Libro = {
    Sectores: [['Sector', 'Subsector'], ['Proceso', ''], ['Servicios', 'Frío'], ['Servicios', 'Agua']],
    Equipos: [
      ['Código', 'Nombre', 'Pertenece a', 'Sector', 'Subsector', 'Etiquetas', 'Marca', 'Modelo', 'N° de serie', 'Ubicación', 'Crítico', 'Notas'],
      ['PA-01-B1', 'Bomba de alimentación', 'PA-01', 'Proceso', '', 'bomba', '', '', '', '', 'NO', ''],
      ['PA-01', 'Pasteurizador 1', '', 'Proceso', '', 'pasteurizador; línea', 'Marca J', 'PZ-10000', 'S-1', 'Sala', 'SI', 'Ejemplo'],
      ['BC-01', 'Bomba centrífuga', '', 'Servicios', 'Agua', '', '', '', '', '', 'no', ''],
      ['', 'Sin código', '', '', '', '', '', '', '', '', '', ''],
      ['XX-01', 'Parte de un sub-equipo', 'PA-01-B1', '', '', '', '', '', '', '', '', ''],
    ],
    Historial: [
      ['Código equipo', 'Fecha', 'Tipo', 'OT', 'Descripción', 'Realizado por', 'Horas', 'Técnicos', 'Repuestos usados', 'Mediciones', 'Prioridad', 'Falla', 'Causa', 'Solución', 'Horas de parada', 'Liberación'],
      ['BC-01', '12/09/2026', 'Correctivo', 'OT-0003', 'Cambio de sello', 'Ana Técnica y Juan', 1.5, '', '1 sello', '', 'Urgente', 'Pierde agua', 'Sello gastado', 'Se cambió', 2, ''],
      ['PA-01', 46000, 'Preventivo', '', 'Limpieza de placas', '', '', '', '', '', '', '', '', '', '', ''],
      ['PA-01', '31/02/2026', 'Preventivo', '', 'Fecha que no existe', '', '', '', '', '', '', '', '', '', '', ''],
      ['ZZ-99', '01/01/2026', 'Preventivo', '', 'Equipo que no existe', '', '', '', '', '', '', '', '', '', '', ''],
      ['BC-01', '2026-08-01', 'Predictivo', '', 'Tipo raro', '', '', '', '', '', '', '', '', '', '', ''],
    ],
    'Repuestos críticos': [
      ['Código equipo', 'Código repuesto', 'Descripción', 'Cantidad', 'Nota'],
      ['BC-01', 'maaaa00001', 'Rodamiento', 2, 'cambiar cada 2000 h'],
      ['BC-01', 'NO-EXISTE', 'Otro', 1, ''],
    ],
    'Órdenes de trabajo': [['Número', 'Código equipo'], ['OT-0001', 'PA-01']],
  };
  const vacio: Actual = { sectores: [], equipos: [], intervenciones: new Set(), repuestos: new Map(), items: new Map([['maaaa00001', { id: 'it1', codigo: 'MAAAA00001' }]]),
    planillas: [], rutinas: [], tecnicos: ['Ana Técnica'] };

  it('lee las hojas por el nombre de sus columnas y separa lo nuevo de los errores', () => {
    const a = analizarLibro(libro, vacio);
    expect(a.hojasLeidas).toEqual(['Sectores', 'Equipos', 'Historial', 'Repuestos críticos']);
    expect(a.hojasParaDespues).toEqual(['Órdenes de trabajo']);
    expect(a.sectoresNuevos).toEqual([{ sector: 'Proceso', subsector: '' }, { sector: 'Servicios', subsector: '' }, { sector: 'Servicios', subsector: 'Frío' }, { sector: 'Servicios', subsector: 'Agua' }]);
    expect(a.ordenSectores).toEqual(['Proceso', 'Servicios']);
    // el sub-equipo puede estar antes que su principal; un sub-equipo no puede tener sub-equipos
    expect(a.equiposNuevos.map(e => [e.codigo, e.padreCodigo])).toEqual([['PA-01-B1', 'PA-01'], ['PA-01', null], ['BC-01', null]]);
    expect(a.equiposNuevos[1]).toMatchObject({ critico: true, etiquetas: ['pasteurizador', 'línea'], numeroSerie: 'S-1' });
    expect(a.intervenciones).toHaveLength(2);
    expect(a.intervenciones[0]).toMatchObject({ fecha: '2026-09-12', tipo: 'correctivo', tecnicos: ['Ana Técnica', 'Juan'], horas: 1.5, prioridad: 'urgente', horasParada: 2 });
    expect(a.intervenciones[1]).toMatchObject({ fecha: '2025-12-09', tipo: 'preventivo', prioridad: null, falla: '' });
    expect(a.repuestosNuevos).toEqual([{ equipoCodigo: 'BC-01', itemId: 'it1', codigo: 'MAAAA00001', cantidad: 2, nota: 'cambiar cada 2000 h' }]);
    expect(a.errores.map(e => `${e.hoja} ${e.fila}`)).toEqual(['Equipos 5', 'Equipos 6', 'Historial 4', 'Historial 5', 'Historial 6', 'Repuestos críticos 3']);
    expect(hayAlgoParaGuardar(a)).toBe(true);
  });

  it('lo que ya está igual no cambia, y el historial repetido se saltea', () => {
    const primero = analizarLibro(libro, vacio);
    const equipos = primero.equiposNuevos.map((e, i) => ({ ...equipo({ id: `n${i}`, codigo: e.codigo, nombre: e.nombre }), ...e, padreId: null as string | null }));
    for (const e of equipos) e.padreId = equipos.find(p => p.codigo === primero.equiposNuevos.find(x => x.codigo === e.codigo)?.padreCodigo)?.id ?? null;
    const actual: Actual = {
      ...vacio,
      sectores: [{ id: 's1', nombre: 'Proceso', padreId: null, orden: 1 }, { id: 's2', nombre: 'Servicios', padreId: null, orden: 2 },
        { id: 's3', nombre: 'Frío', padreId: 's2', orden: null }, { id: 's4', nombre: 'Agua', padreId: 's2', orden: null }],
      equipos,
      intervenciones: new Set(primero.intervenciones.map(i => `${normalizar(i.equipoCodigo)}|${i.fecha}|${i.tipo}|${normalizar(i.descripcion)}`)),
      repuestos: new Map([['bc-01|maaaa00001', { cantidad: 2, nota: 'cambiar cada 2000 h' }]]),
    };
    const a = analizarLibro(libro, actual);
    expect(a.sectoresNuevos).toEqual([]);
    expect(a.ordenSectores).toBeNull();
    expect(a.equiposNuevos).toEqual([]);
    expect(a.equiposActualizados).toEqual([]);
    expect(a.intervenciones).toEqual([]);
    expect(a.repuestosNuevos).toEqual([]);
    expect(hayAlgoParaGuardar(a)).toBe(false);
  });

  it('fechas: dd/mm/aaaa, d/m/aa, aaaa-mm-dd y el número de Excel; las que no existen, no', () => {
    expect(fechaDeExcel('5/3/26')).toBe('2026-03-05');
    expect(fechaDeExcel('2026-03-05')).toBe('2026-03-05');
    expect(fechaDeExcel(46000)).toBe('2025-12-09');
    expect(fechaDeExcel('29/02/2026')).toBeNull();
    expect(fechaDeExcel('mañana')).toBeNull();
  });

  it('exportar y volver a importar no cambia nada', () => {
    const sectores: Sector[] = [{ id: 's1', nombre: 'Proceso', padreId: null, orden: 1 }];
    const equipos = [equipo({ id: 'e1', codigo: 'PA-01', nombre: 'Pasteurizador', sectorId: 's1', sector: 'Proceso', etiquetas: ['a', 'b'], critico: true }),
      equipo({ id: 'e2', codigo: 'PA-01-B1', nombre: 'Bomba', padreId: 'e1' })];
    const intervenciones = [intervencion({ id: 'i1', equipoId: 'e1', fecha: '2026-01-02', descripcion: 'Algo', tecnicos: [{ id: null, nombre: 'Ana' }] })];
    const planillas: PlanillaTareas[] = [{ id: 'p1', nombre: 'Bomba – mensual', notas: '', tareas: [
      { texto: 'Engrasar', medicion: null }, { texto: 'Vibración', medicion: { unidad: 'mm/s', minimo: 0, maximo: 4.5 } }] }];
    const rutinas: Rutina[] = [
      { id: 'r1', equipoId: 'e1', tareas: planillas[0].tareas, planillaId: 'p1', frecuenciaDias: 30, proximaFecha: '2026-12-01', avisoDias: 3, responsableId: 'u1',
        responsable: 'Ana Técnica', activa: true, repuestos: [] },
      { id: 'r2', equipoId: 'e2', tareas: [{ texto: 'Limpiar', medicion: null }, { texto: 'Ajustar', medicion: null }], planillaId: null, frecuenciaDias: 7,
        proximaFecha: '2026-11-10', avisoDias: 1, responsableId: null, responsable: '', activa: false, repuestos: [] },
    ];
    const hojas = armarHojas({ sectores, equipos, intervenciones, repuestos: [{ equipoId: 'e1', codigo: 'MAAAA00001', descripcion: 'R', cantidad: 1, nota: '' }], planillas, rutinas, ordenes: [] });
    const a = analizarLibro(hojas, {
      sectores, equipos, intervenciones: new Set(['pa-01|2026-01-02|correctivo|algo']),
      repuestos: new Map([['pa-01|maaaa00001', { cantidad: 1, nota: '' }]]), items: vacio.items, planillas, tecnicos: ['Ana Técnica'],
      rutinas: [
        { id: 'r1', equipoCodigo: 'PA-01', planilla: 'Bomba – mensual', tareas: [], frecuenciaDias: 30, proximaFecha: '2026-12-01', avisoDias: 3, responsable: 'Ana Técnica', activa: true },
        { id: 'r2', equipoCodigo: 'PA-01-B1', planilla: null, tareas: ['Limpiar', 'Ajustar'], frecuenciaDias: 7, proximaFecha: '2026-11-10', avisoDias: 1, responsable: '', activa: false },
      ],
    });
    expect(a.errores).toEqual([]);
    expect(hayAlgoParaGuardar(a)).toBe(false);
  });

  it('planillas con mediciones y rutinas: lo nuevo, lo que cambia y los problemas', () => {
    const libro: Libro = {
      Equipos: [['Código', 'Nombre'], ['BC-01', 'Bomba']],
      'Planillas de tareas': [['Planilla', 'Tarea', 'Unidad', 'Mínimo', 'Máximo'],
        ['Bomba – mensual', 'Engrasar', '', '', ''], ['Bomba – mensual', 'Vibración', 'mm/s', '0', '4,5'], ['Otra', 'Medir', '', '5', '2']],
      'Rutinas preventivas': [['Código equipo', 'Planilla', 'Tarea', 'Cada (días)', 'Próxima fecha', 'Responsable', 'Activa'],
        ['BC-01', 'Bomba – mensual', '', 30, '01/12/2026', 'Ana Técnica', 'SI'],
        ['BC-01', '', 'Limpiar\nAjustar', 7, '10/11/2026', 'Pedro', ''],
        ['BC-01', 'No existe', '', 30, '01/12/2026', '', ''],
        ['BC-01', '', 'Algo', 0, '01/12/2026', '', '']],
    };
    const a = analizarLibro(libro, vacio);
    expect(a.planillasNuevas).toEqual([{ nombre: 'Bomba – mensual', tareas: [
      { texto: 'Engrasar', medicion: null }, { texto: 'Vibración', medicion: { unidad: 'mm/s', minimo: 0, maximo: 4.5 } }] }]);
    expect(a.rutinasNuevas.map(r => [r.planilla, r.tareas, r.responsable])).toEqual([['Bomba – mensual', [], 'Ana Técnica'], [null, ['Limpiar', 'Ajustar'], '']]);
    expect(a.avisos).toHaveLength(1); // Pedro no es usuario de Mantenimiento
    expect(a.errores.map(e => e.motivo)).toEqual([
      'El mínimo es mayor que el máximo.', 'No existe la planilla "No existe" (cargala en la hoja Planillas de tareas).',
      '"Cada (días)" tiene que ser un número entero de 1 a 3650 (vino "0").',
    ]);
  });

  it('mediciones: rango, fuera de rango y números escritos a mano', () => {
    const m = { unidad: 'mm/s', minimo: 0, maximo: 4.5 };
    expect(textoRango(m)).toBe('normal 0 a 4,5 mm/s');
    expect(textoRango({ unidad: '°C', minimo: null, maximo: 80 })).toBe('máx. 80 °C');
    expect(fueraDeRango(m, 7.2)).toBe(true);
    expect(fueraDeRango(m, 4.5)).toBe(false);
    expect(fueraDeRango(m, null)).toBe(false);
    expect(leerNumero(' 4,5 ')).toBe(4.5);
    expect(leerNumero('')).toBeNull();
    expect(leerNumero('4,5,1')).toBeNaN();
    const filas = filasDeTareas([{ texto: 'Vibración', medicion: m }]);
    expect(filas[0].maximo).toBe('4,5');
    expect(tareasDeFilas([{ ...filas[0], minimo: '9' }])).toEqual({ error: 'Tarea 1: el mínimo es mayor que el máximo.' });
    expect(tareasDeFilas(filas)).toEqual({ tareas: [{ texto: 'Vibración', medicion: m }] });
  });
});
