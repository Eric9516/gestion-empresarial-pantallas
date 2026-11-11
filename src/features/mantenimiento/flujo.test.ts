import { describe, expect, it } from 'vitest';
import { colorDe, laVe, llegaEn, pendientesDe, yaLlego, devolucion } from './flujo';
import { aprobarOrden, armarCorrectivaCargada, HORARIO_POR_DEFECTO, normalizarHorario, sincronizarOrdenes, terminarOrden } from './preventivo';
import type { HorarioRecepcion, OrdenTrabajo, PersonaMantenimiento, RutinaPreventiva } from './tipos';

const H: HorarioRecepcion = HORARIO_POR_DEFECTO;
const resp: PersonaMantenimiento = { id: 'r', nombre: 'Resp', rol: 'responsable' };
const jefe: PersonaMantenimiento = { id: 'j', nombre: 'Jefe', rol: 'jefe' };
const t1: PersonaMantenimiento = { id: 't1', nombre: 'Téc 1', rol: 'tecnico' };
const t2: PersonaMantenimiento = { id: 't2', nombre: 'Téc 2', rol: 'tecnico' };
let n = 0;
const id = () => `f-${++n}`;

// 2026-11-09 es lunes; 2026-11-13 viernes; 2026-11-14 sábado.
describe('horario de recepción de las OT terminadas', () => {
  it('dentro del horario llega en el momento', () => {
    expect(llegaEn('2026-11-10T10:15', H)).toBe('2026-11-10T10:15');
  });
  it('antes de las 8:30 llega a las 8:30 de ese día', () => {
    expect(llegaEn('2026-11-10T06:40', H)).toBe('2026-11-10T08:30');
  });
  it('a la noche llega al otro día a las 8:30', () => {
    expect(llegaEn('2026-11-10T23:05', H)).toBe('2026-11-11T08:30');
  });
  it('los sábados se recibe hasta las 12: viernes a la noche llega el sábado; sábado a la tarde y domingo, el lunes', () => {
    expect(llegaEn('2026-11-13T18:00', H)).toBe('2026-11-14T08:30');
    expect(llegaEn('2026-11-14T11:00', H)).toBe('2026-11-14T11:00');
    expect(llegaEn('2026-11-14T12:30', H)).toBe('2026-11-16T08:30');
    expect(llegaEn('2026-11-15T10:00', H)).toBe('2026-11-16T08:30');
  });
  it('el horario guardado con la versión anterior se convierte (y el de fábrica suma los sábados)', () => {
    expect(normalizarHorario({ desde: '08:30', hasta: '17:00', dias: [1, 2, 3, 4, 5] })).toEqual(HORARIO_POR_DEFECTO);
    expect(normalizarHorario({ desde: '07:00', hasta: '15:00', dias: [1, 2] }).dias).toEqual([{ dia: 1, desde: '07:00', hasta: '15:00' }, { dia: 2, desde: '07:00', hasta: '15:00' }]);
  });
  it('yaLlego compara con ahora', () => {
    expect(yaLlego({ terminadaEn: '2026-11-10T23:05' }, '2026-11-11T08:00', H)).toBe(false);
    expect(yaLlego({ terminadaEn: '2026-11-10T23:05' }, '2026-11-11T08:30', H)).toBe(true);
  });
});

describe('circuito de una OT preventiva', () => {
  const rutina: RutinaPreventiva = { id: 'ru', equipoId: 'e1', tarea: 'Engrasar\nMedir vibración\nCambiar correa', frecuenciaDias: 30, proximaFecha: '2026-11-12', avisoDiasAntes: 3, responsable: '', activa: true, repuestos: [], planillaId: null, mediciones: [null, { unidad: 'mm/s', minimo: 0, maximo: 4.5 }, null] };

  it('se genera para el responsable (verde), la ve el jefe recién derivada y el técnico recién asignada', () => {
    const [ot] = sincronizarOrdenes([rutina], [], id);
    expect(ot).toMatchObject({ etapa: 'por_derivar', asignados: [], asignadoA: '' });
    const ahora = '2026-11-10T09:00';
    expect(colorDe(ot, '2026-11-10', 'responsable')).toBe('verde');
    expect(laVe(ot, jefe, ahora, H)).toBe(false);
    const derivada = { ...ot, etapa: 'por_asignar' as const };
    expect(laVe(derivada, jefe, ahora, H)).toBe(true);
    expect(colorDe(derivada, '2026-11-10', 'jefe')).toBe('verde');
    expect(colorDe(derivada, '2026-11-10', 'responsable')).toBe('amarillo');
    const asignada = { ...derivada, etapa: 'asignada' as const, asignados: ['t1'] };
    expect(laVe(asignada, t1, ahora, H)).toBe(true);
    expect(laVe(asignada, t2, ahora, H)).toBe(false);
    expect(colorDe(asignada, '2026-11-20', 'tecnico')).toBe('rojo');
    expect(pendientesDe([ot, asignada], resp, ahora, H).paraMandar).toBe(1);
  });

  it('el técnico la termina (no va al historial) y el responsable la aprueba (va al historial y genera lo pendiente)', () => {
    const [ot0] = sincronizarOrdenes([rutina], [], id);
    const ot = { ...ot0, etapa: 'asignada' as const, asignados: ['t1'], asignadoA: 'Téc 1', valores: [null, 6.1, null] };
    const t = terminarOrden(ot, {
      fechaCierre: '2026-11-12', tareasHechas: [true, true, false], realizadoPor: 'Téc 1', observaciones: '', horas: 1, repuestosUsados: '',
      repuestos: [{ id: 'l1', componente: 'Motor', codigo: 'R1', descripcion: 'Rodamiento', cantidad: 2, usado: 2 }],
    }, rutina, id, '2026-11-12T22:00', t1);
    expect(t.ot).toMatchObject({ etapa: 'a_revisar', estado: 'terminada', terminadaEn: '2026-11-12T22:00' });
    expect(t.rutina?.proximaFecha).toBe('2026-12-12');
    // Terminada de noche: al jefe le llega al otro día.
    expect(laVe(t.ot, jefe, '2026-11-12T22:30', H)).toBe(false);
    expect(laVe(t.ot, jefe, '2026-11-13T08:30', H)).toBe(true);
    expect(colorDe(t.ot, '2026-11-13', 'jefe')).toBe('azul');

    const revisada: OrdenTrabajo = { ...t.ot, etapa: 'para_aprobar', pasos: [...t.ot.pasos, { cuando: '2026-11-13T09:00', quien: 'Jefe', accion: 'Revisó y pasó a aprobación', comentario: '' }] };
    const a = aprobarOrden(revisada, { pendientes: true, valores: true }, id, 1, '2026-11-13T10:00', resp);
    expect(a.ot.etapa).toBe('aprobada');
    expect(a.intervencion).toMatchObject({ revisadoPor: 'Jefe', aprobadoPor: 'Resp', fecha: '2026-11-12' });
    expect(a.consumos.map(c => [c.codigo, c.cantidad])).toEqual([['R1', 2]]);
    expect(a.nuevas).toHaveLength(2);
    expect(a.nuevas[0]).toMatchObject({ tipo: 'correctiva', etapa: 'por_asignar', tareas: 'Cambiar correa', numero: 'OT-0002' });
    expect(a.nuevas[1].tareas).toContain('Medir vibración');
    // Sin las opciones, no se genera nada.
    expect(aprobarOrden(revisada, { pendientes: false, valores: false }, id, 1, '2026-11-13T10:00', resp).nuevas).toEqual([]);
  });

  it('una devuelta se marca con su comentario hasta que se vuelve a terminar', () => {
    const [ot0] = sincronizarOrdenes([rutina], [], id);
    const dev = { ...ot0, etapa: 'asignada' as const, pasos: [{ cuando: '2026-11-13T09:00', quien: 'Jefe', accion: 'Devolvió al técnico', comentario: 'Falta la vibración' }] };
    expect(devolucion(dev)?.comentario).toBe('Falta la vibración');
    expect(devolucion({ ...dev, pasos: [...dev.pasos, { cuando: '2026-11-13T11:00', quien: 'Téc 1', accion: 'Terminó la OT', comentario: '' }] })).toBeNull();
  });
});

describe('OT correctiva cargada por el técnico (llamado de guardia)', () => {
  it('queda para revisar, sin lista de tareas (lo que hizo lo redacta el técnico; lo pendiente va en observaciones)', () => {
    const ot = armarCorrectivaCargada({
      equipoId: 'e2', fecha: '2026-11-08', prioridad: 'urgente', falla: 'Se frena la cinta', causa: 'Rodillo trabado', solucion: 'Se destrabó y se engrasó el rodillo',
      tecnicos: [{ id: 'x', nombre: 'Téc 2', fecha: '2026-11-08', inicio: '22:00', fin: '23:30' }],
      horas: 1.5, horasParada: 2, repuestos: [], liberacion: null, observaciones: 'Falta cambiar el rodamiento del rodillo',
    }, 'c1', 'OT-0050', '2026-11-08T23:40', t2);
    expect(ot).toMatchObject({ etapa: 'a_revisar', estado: 'terminada', asignados: ['t2'], tareas: '', observaciones: 'Falta cambiar el rodamiento del rodillo' });
    expect(ot.correctivo).toMatchObject({ falla: 'Se frena la cinta', horasParada: 2 });
    // Domingo a la noche: le llega al jefe el lunes 8:30.
    expect(llegaEn(ot.terminadaEn!, H)).toBe('2026-11-09T08:30');
    const a = aprobarOrden({ ...ot, etapa: 'para_aprobar' }, { pendientes: true, valores: true, tareasNuevas: 'Cambiar rodamiento del rodillo' }, id, 50, '2026-11-09T10:00', resp);
    expect(a.intervencion.correctivo?.causa).toBe('Rodillo trabado');
    expect(a.intervencion.tareas).toEqual([]);
    expect(a.intervencion.descripcion).toContain('Se destrabó y se engrasó el rodillo');
    expect(a.nuevas.map(x => [x.tareas, x.etapa])).toEqual([['Cambiar rodamiento del rodillo', 'por_asignar']]);
    // Sin tareas escritas al aprobar, no se genera nada.
    expect(aprobarOrden({ ...ot, etapa: 'para_aprobar' }, { pendientes: true, valores: true }, id, 50, '2026-11-09T10:00', resp).nuevas).toEqual([]);
  });
});
