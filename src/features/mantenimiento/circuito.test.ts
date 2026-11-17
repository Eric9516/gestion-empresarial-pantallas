import { describe, expect, it } from 'vitest';
import { calcularCostos, leerMonto } from './costos';
import { calcularDisponibilidad, horasDelPeriodo, periodo } from './disponibilidad';
import { HORARIO_DE_FABRICA, colorDe, devolucion, horarioDe, laVe, llegaEn, yaLlego } from './flujo';
import type { Equipo, GastoExterno, Intervencion, OrdenTrabajo } from './tipos';

// Lo que trajo el socio el 11/11/2026: el circuito de las OT (horario de recepción, colores, quién ve qué), la disponibilidad y los costos.
// Mismos casos que sus pruebas (flujo.test.ts y disponibilidadCostos.test.ts), con los tipos de la app.

const H = HORARIO_DE_FABRICA;

// 2026-11-09 es lunes; 2026-11-13 viernes; 2026-11-14 sábado.
describe('horario de recepción de las OT terminadas', () => {
  it('dentro del horario llega en el momento; antes de las 8:30, a las 8:30; a la noche, al otro día', () => {
    expect(llegaEn('2026-11-10T10:15', H)).toBe('2026-11-10T10:15');
    expect(llegaEn('2026-11-10T06:40', H)).toBe('2026-11-10T08:30');
    expect(llegaEn('2026-11-10T23:05', H)).toBe('2026-11-11T08:30');
  });
  it('los sábados se recibe hasta las 12: viernes a la noche llega el sábado; sábado a la tarde y domingo, el lunes', () => {
    expect(llegaEn('2026-11-13T18:00', H)).toBe('2026-11-14T08:30');
    expect(llegaEn('2026-11-14T11:00', H)).toBe('2026-11-14T11:00');
    expect(llegaEn('2026-11-14T12:30', H)).toBe('2026-11-16T08:30');
    expect(llegaEn('2026-11-15T10:00', H)).toBe('2026-11-16T08:30');
  });
  it('yaLlego compara con ahora', () => {
    expect(yaLlego({ terminadaEn: '2026-11-10T23:05' }, '2026-11-11T08:00', H)).toBe(false);
    expect(yaLlego({ terminadaEn: '2026-11-10T23:05' }, '2026-11-11T08:30', H)).toBe(true);
  });
  it('lo que guarda la base se lee como horario (lo raro se descarta)', () => {
    expect(horarioDe([{ dia: 1, desde: '07:00', hasta: '15:00' }, { dia: 9, desde: '07:00', hasta: '15:00' }, { dia: 2, desde: '15:00', hasta: '07:00' }]))
      .toEqual({ dias: [{ dia: 1, desde: '07:00', hasta: '15:00' }] });
    expect(horarioDe(null)).toEqual(H);
  });
});

const ot = (o: Partial<OrdenTrabajo>): OrdenTrabajo => ({
  id: 'o1', numero: 1, tipo: 'preventiva', equipoId: 'e1', rutinaId: null, fechaProgramada: '2026-11-12', asignadoId: null, asignado: '', estado: 'pendiente',
  empezadaAt: null, fechaCierre: null, observaciones: '', horas: null, avisoDias: 3, tareas: [], repuestos: [], tecnicos: [], correctivo: null, liberacion: null,
  horasParada: null, etapa: 'por_derivar', asignados: [], pasos: [], terminadaEn: null, ...o,
});

describe('quién ve cada OT y de qué color', () => {
  const momento = '2026-11-10T09:00';
  it('recién generada: verde para el responsable; el jefe no la ve hasta que se la derivan', () => {
    const o = ot({});
    expect(colorDe(o, '2026-11-10', 'responsable')).toBe('verde');
    expect(laVe(o, { id: 'j', rol: 'jefe' }, momento, H)).toBe(false);
    const derivada = ot({ etapa: 'por_asignar' });
    expect(laVe(derivada, { id: 'j', rol: 'jefe' }, momento, H)).toBe(true);
    expect(colorDe(derivada, '2026-11-10', 'jefe')).toBe('verde');
  });
  it('el técnico ve solo las que tiene asignadas; vencida es roja; terminada es azul', () => {
    const asignada = ot({ etapa: 'asignada', asignados: [{ id: 't1', nombre: 'Téc 1' }] });
    expect(laVe(asignada, { id: 't1', rol: 'tecnico' }, momento, H)).toBe(true);
    expect(laVe(asignada, { id: 't2', rol: 'tecnico' }, momento, H)).toBe(false);
    expect(colorDe(asignada, '2026-11-13', 'tecnico')).toBe('rojo');
    expect(colorDe(ot({ etapa: 'a_revisar', estado: 'terminada' }), '2026-11-13', 'jefe')).toBe('azul');
  });
  it('terminada fuera de horario: el jefe la ve recién al abrir la recepción', () => {
    const o = ot({ etapa: 'a_revisar', estado: 'terminada', terminadaEn: '2026-11-10T23:05' });
    expect(laVe(o, { id: 'j', rol: 'jefe' }, '2026-11-11T07:00', H)).toBe(false);
    expect(laVe(o, { id: 'j', rol: 'jefe' }, '2026-11-11T08:30', H)).toBe(true);
  });
  it('la devolución se muestra hasta que el técnico la vuelve a terminar', () => {
    const dev = { cuando: '2026-11-10T10:00', quien: 'Jefe', accion: 'Devolvió la OT al técnico', comentario: 'Falta la foto' };
    expect(devolucion(ot({ etapa: 'asignada', pasos: [dev] }))?.comentario).toBe('Falta la foto');
    expect(devolucion(ot({ etapa: 'asignada', pasos: [dev, { ...dev, accion: 'Terminó la OT', comentario: '' }] }))).toBeNull();
  });
});

const equipo = (e: Partial<Equipo>): Equipo => ({
  id: 'e1', codigo: 'EQ-001', nombre: 'Compresor', sectorId: null, sector: 'Servicios', subsector: '', etiquetas: [], marca: '', modelo: '', numeroSerie: '',
  ubicacion: '', critico: false, notas: '', padreId: null, ...e,
} as Equipo);
const registro = (i: Partial<Intervencion>): Intervencion => ({
  id: 'i1', equipoId: 'e1', fecha: '2026-11-05', tipo: 'correctivo', descripcion: '', tecnicos: [], horas: null, repuestosUsados: '', correctivo: null, otNumero: null,
  horasParada: null, revisadoPor: '', aprobadoPor: '', repuestos: [], ...i,
});

describe('disponibilidad', () => {
  it('este mes va del 1 a hoy y el mes pasado es el mes completo; 24 h por día', () => {
    expect(periodo('mes', '2026-11-10')).toEqual({ desde: '2026-11-01', hasta: '2026-11-10' });
    expect(periodo('mesAnterior', '2026-01-10')).toEqual({ desde: '2025-12-01', hasta: '2025-12-31' });
    expect(horasDelPeriodo({ desde: '2026-11-01', hasta: '2026-11-10' })).toBe(240);
  });
  it('separa correctivo y preventivo, cuenta los sub-equipos en el principal e ignora lo de fuera del período', () => {
    const equipos = [equipo({}), equipo({ id: 'e2', padreId: 'e1' }), equipo({ id: 'e3', sector: 'Envasado' })];
    const r = calcularDisponibilidad(equipos, [
      { equipoId: 'e1', fecha: '2026-11-05', tipo: 'correctivo', horas: 10 },
      { equipoId: 'e2', fecha: '2026-11-06', tipo: 'preventivo', horas: 2 },
      { equipoId: 'e3', fecha: '2026-10-30', tipo: 'correctivo', horas: 50 },
    ], { desde: '2026-11-01', hasta: '2026-11-10' }, ['Envasado', 'Servicios']);
    expect(r.general.equipos).toBe(2);
    expect(r.equipos[0]).toMatchObject({ paradaCorrectivo: 10, paradaPreventivo: 2 });
    expect(r.equipos[0].disponibilidad).toBeCloseTo(95);
    expect(r.porSector.map(s => s.sector)).toEqual(['Envasado', 'Servicios']);
  });
  it('la parada no pasa las horas del período', () => {
    const r = calcularDisponibilidad([equipo({})], [{ equipoId: 'e1', fecha: '2026-11-01', tipo: 'correctivo', horas: 999 }], { desde: '2026-11-01', hasta: '2026-11-01' });
    expect(r.general.disponibilidad).toBe(0);
  });
});

describe('costos por equipo', () => {
  const gastos: GastoExterno[] = [{ id: 'g1', equipoId: 'e2', fecha: '2026-11-03', proveedor: 'Taller X', descripcion: 'Rebobinado', monto: 50000 }];
  const historial = [
    registro({ horas: 2, otNumero: 'OT-0001', repuestos: [{ codigo: 'R1', descripcion: 'Rodamiento', componente: '', cantidad: 2, precio: 1500 }, { codigo: 'R2', descripcion: 'Correa', componente: '', cantidad: 1, precio: null }] }),
    registro({ id: 'i2', equipoId: 'e2', horas: 1, fecha: '2025-12-01' }),
  ];
  it('suma repuestos con precio, horas × valor de la hora y gastos externos, con los sub-equipos', () => {
    const c = calcularCostos(equipo({}), [equipo({ id: 'e2', padreId: 'e1', codigo: 'EQ-002', nombre: 'Motor' })], historial, gastos, 10000, null);
    expect(c).toMatchObject({ repuestos: 3000, manoDeObra: 30000, externos: 50000, total: 83000, repuestosSinPrecio: 1, faltaCostoHora: false });
  });
  it('con período, solo lo del período; sin valor de la hora la mano de obra no suma y avisa', () => {
    const c = calcularCostos(equipo({}), [equipo({ id: 'e2', padreId: 'e1' })], historial, gastos, null, { desde: '2026-11-01', hasta: '2026-11-30' });
    expect(c).toMatchObject({ repuestos: 3000, manoDeObra: 0, externos: 50000, horas: 2, faltaCostoHora: true });
  });
  it('lee montos escritos de varias formas', () => {
    expect(leerMonto('15000')).toBe(15000);
    expect(leerMonto('15.000')).toBe(15000);
    expect(leerMonto('$ 15.000,50')).toBe(15000.5);
    expect(leerMonto('1.5')).toBe(1.5);
    expect(leerMonto('abc')).toBeNull();
  });
});
