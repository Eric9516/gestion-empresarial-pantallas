import { describe, expect, it } from 'vitest';
import { calcularCostos, leerMonto } from './costos';
import { calcularDisponibilidad, horasDelPeriodo, periodo } from './disponibilidad';
import { cerrarOrden } from './preventivo';
import type { Equipo, GastoExterno, Intervencion, OrdenTrabajo } from './tipos';

const eq = (id: string, sector: string, padreId: string | null = null): Equipo => ({
  id, codigo: id.toUpperCase(), nombre: `Equipo ${id}`, sector, subsector: '', etiquetas: [], marca: '', modelo: '', numeroSerie: '', ubicacion: '', critico: false, notas: '', padreId,
});

const inter = (x: Partial<Intervencion> & Pick<Intervencion, 'id' | 'equipoId' | 'fecha' | 'tipo'>): Intervencion => ({
  descripcion: '', realizadoPor: '', horas: null, repuestosUsados: '', otId: null, repuestos: [], tareas: [], correctivo: null, otNumero: null, tecnicos: [], liberacion: null, ...x,
});

const correctivo = (horasParada: number | null) => ({ prioridad: 'normal' as const, falla: '', causa: '', solucion: '', horasParada });

describe('períodos', () => {
  it('este mes va del 1 a hoy y el mes pasado es el mes completo', () => {
    expect(periodo('mes', '2026-11-06')).toEqual({ desde: '2026-11-01', hasta: '2026-11-06' });
    expect(periodo('mesAnterior', '2026-11-06')).toEqual({ desde: '2026-10-01', hasta: '2026-10-31' });
    expect(periodo('mesAnterior', '2026-01-15')).toEqual({ desde: '2025-12-01', hasta: '2025-12-31' });
    expect(periodo('anio', '2026-11-06')).toEqual({ desde: '2026-01-01', hasta: '2026-11-06' });
  });

  it('24 horas por día, contando los dos extremos', () => {
    expect(horasDelPeriodo({ desde: '2026-10-01', hasta: '2026-10-31' })).toBe(744);
  });
});

describe('disponibilidad', () => {
  const p = { desde: '2026-10-01', hasta: '2026-10-10' }; // 240 h por equipo
  const equipos = [eq('a', 'Servicios'), eq('b', 'Servicios'), eq('a1', 'Servicios', 'a'), eq('c', 'Recibo')];

  it('separa correctivo y preventivo, cuenta los sub-equipos en el principal e ignora lo de fuera del período', () => {
    const r = calcularDisponibilidad(equipos, [
      inter({ id: '1', equipoId: 'a', fecha: '2026-10-02', tipo: 'correctivo', correctivo: correctivo(10) }),
      inter({ id: '2', equipoId: 'a1', fecha: '2026-10-03', tipo: 'preventivo', horasParada: 2 }),
      inter({ id: '3', equipoId: 'c', fecha: '2026-10-05', tipo: 'preventivo', horasParada: 4 }),
      inter({ id: '4', equipoId: 'b', fecha: '2026-09-30', tipo: 'correctivo', correctivo: correctivo(50) }),
    ], p, ['Recibo', 'Servicios']);

    expect(r.general.equipos).toBe(3); // a, b y c (a1 es sub-equipo)
    expect(r.general.horas).toBe(720);
    expect(r.general.paradaCorrectivo).toBe(10);
    expect(r.general.paradaPreventivo).toBe(6);
    expect(r.general.disponibilidad).toBeCloseTo(((720 - 16) / 720) * 100);

    expect(r.porSector.map(s => s.sector)).toEqual(['Recibo', 'Servicios']);
    const serv = r.porSector[1];
    expect(serv).toMatchObject({ equipos: 2, horas: 480, paradaCorrectivo: 10, paradaPreventivo: 2 });

    expect(r.equipos.map(e => e.equipo.id)).toEqual(['a', 'c']);
    expect(r.equipos[0]).toMatchObject({ paradaCorrectivo: 10, paradaPreventivo: 2 });
  });

  it('la parada no pasa las horas del período', () => {
    const r = calcularDisponibilidad([eq('a', 'S')], [inter({ id: '1', equipoId: 'a', fecha: '2026-10-02', tipo: 'correctivo', correctivo: correctivo(999) })], p);
    expect(r.general.disponibilidad).toBe(0);
    expect(r.general.paradaCorrectivo).toBe(240);
  });
});

describe('cierre de OT preventiva con horas de parada', () => {
  it('guarda las horas de parada en la OT y en el historial', () => {
    const ot: OrdenTrabajo = {
      id: 'ot', numero: 'OT-0001', tipo: 'preventiva', equipoId: 'a', rutinaId: null, fechaProgramada: '2026-10-01', tareas: 'Engrasar', tareasHechas: [], asignadoA: 'T1',
      estado: 'pendiente', fechaCierre: null, observaciones: '', horas: null, repuestosUsados: '', repuestos: [], correctivo: null, mediciones: [], valores: [], tecnicos: [], liberacion: null,
      etapa: 'por_derivar', asignados: [], pasos: [], terminadaEn: null, cierre: null,
    };
    const r = cerrarOrden(ot, { fechaCierre: '2026-10-01', tareasHechas: [true], realizadoPor: 'T1', observaciones: '', horas: 1, repuestosUsados: '', repuestos: [], horasParada: 1.5 }, undefined, () => 'x');
    expect(r.ot.horasParada).toBe(1.5);
    expect(r.intervencion.horasParada).toBe(1.5);
  });
});

describe('costos del equipo', () => {
  const principal = eq('a', 'S');
  const sub = eq('a1', 'S', 'a');
  const intervenciones = [
    inter({ id: '1', equipoId: 'a', fecha: '2026-10-02', tipo: 'correctivo', horas: 3, otNumero: 'OT-0001', repuestos: [
      { id: 'r1', componente: 'Motor', codigo: 'ROD', descripcion: 'Rodamiento', cantidad: 2, usado: 2, precio: 10000 },
      { id: 'r2', componente: '', codigo: 'SEL', descripcion: 'Sello', cantidad: 1, usado: 1 },
      { id: 'r3', componente: '', codigo: 'FIL', descripcion: 'Filtro', cantidad: 1, usado: 0, precio: 5000 },
    ] }),
    inter({ id: '2', equipoId: 'a1', fecha: '2026-10-05', tipo: 'preventivo', horas: 1 }),
    inter({ id: '3', equipoId: 'otro', fecha: '2026-10-05', tipo: 'preventivo', horas: 8 }),
    inter({ id: '4', equipoId: 'a', fecha: '2025-12-01', tipo: 'preventivo', horas: 2 }),
  ];
  const gastos: GastoExterno[] = [
    { id: 'g1', equipoId: 'a', fecha: '2026-10-03', proveedor: 'Taller', descripcion: 'Rebobinado', monto: 70000 },
    { id: 'g2', equipoId: 'otro', fecha: '2026-10-03', proveedor: '', descripcion: 'X', monto: 1 },
  ];

  it('suma repuestos con precio, horas × valor de la hora y gastos externos, con los sub-equipos', () => {
    const c = calcularCostos(principal, [sub], intervenciones, gastos, 15000, { desde: '2026-01-01', hasta: '2026-12-31' });
    expect(c.repuestos).toBe(20000); // el sello no tiene precio; el filtro no se usó
    expect(c.repuestosSinPrecio).toBe(1);
    expect(c.horas).toBe(4);
    expect(c.manoDeObra).toBe(60000);
    expect(c.externos).toBe(70000);
    expect(c.total).toBe(150000);
    expect(c.faltaCostoHora).toBe(false);
    expect(c.lineas.find(l => l.tipo === 'manoDeObra' && l.subEquipo)).toBeTruthy();
  });

  it('sin período cuenta todo; sin valor de la hora la mano de obra no suma y avisa', () => {
    const c = calcularCostos(principal, [sub], intervenciones, gastos, null, null);
    expect(c.horas).toBe(6);
    expect(c.manoDeObra).toBe(0);
    expect(c.faltaCostoHora).toBe(true);
  });

  it('lee montos escritos de varias formas', () => {
    expect(leerMonto('15000')).toBe(15000);
    expect(leerMonto('15.000')).toBe(15000);
    expect(leerMonto('$ 1.234.567,50')).toBe(1234567.5);
    expect(leerMonto('12,5')).toBe(12.5);
    expect(leerMonto('12.5')).toBe(12.5);
    expect(leerMonto('abc')).toBeNull();
    expect(leerMonto('')).toBeNull();
  });
});
