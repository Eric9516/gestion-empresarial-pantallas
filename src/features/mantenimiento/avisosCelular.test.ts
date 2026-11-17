import { describe, expect, it } from 'vitest';
import { repartirAvisos, mensajeDe, type AvisoPendiente } from './avisosCelular';

const CEL = [{ endpoint: 'https://push.ejemplo.test/1', p256dh: 'p', auth: 'a' }];
const HORARIO = [{ dia: 1, desde: '08:30', hasta: '17:00' }, { dia: 2, desde: '08:30', hasta: '17:00' }, { dia: 3, desde: '08:30', hasta: '17:00' },
  { dia: 4, desde: '08:30', hasta: '17:00' }, { dia: 5, desde: '08:30', hasta: '17:00' }];
const aviso = (x: Partial<AvisoPendiente>): AvisoPendiente => ({
  id: 'a1', empresa_id: 'e1', usuario_id: 'u1', tipo: 'asignada', ot_id: 'o1', cantidad: 1, vigente: true, numero: 123, equipo: 'PR-01 — Prensa', detalle: 'Cambiar filtro',
  urgente: false, comentario: null, quien: 'Tito', terminada_en: null, momento: '2026-11-12T10:00', horario: HORARIO, celulares: CEL, ...x,
});

describe('avisos al celular', () => {
  it('el técnico ve qué OT le asignaron, el equipo y la tarea, y al tocarlo se abre esa OT', () => {
    const m = mensajeDe(aviso({}));
    expect(m.titulo).toBe('Te asignaron la OT-0123');
    expect(m.cuerpo).toBe('PR-01 — Prensa · Cambiar filtro');
    expect(m.url).toBe('/mantenimiento/ordenes?ot=o1');
  });

  it('la devolución trae el comentario', () => {
    expect(mensajeDe(aviso({ tipo: 'devuelta', comentario: 'Falta la foto' })).cuerpo).toBe('Falta la foto · PR-01 — Prensa');
  });

  it('las urgentes se marcan', () => {
    expect(mensajeDe(aviso({ tipo: 'para_asignar', urgente: true })).titulo).toBe('URGENTE · OT-0123 para asignar');
  });

  it('los que ya no valen o no tienen celular se descartan', () => {
    const r = repartirAvisos([aviso({ id: 'x', vigente: false }), aviso({ id: 'y', celulares: [] })]);
    expect(r.envios).toEqual([]);
    expect(r.descartar).toEqual(['x', 'y']);
  });

  it('una OT terminada a la noche le llega al jefe al abrir el horario del día siguiente', () => {
    const noche = aviso({ tipo: 'para_revisar', terminada_en: '2026-11-12T22:00', momento: '2026-11-12T22:01' });
    expect(repartirAvisos([noche])).toEqual({ envios: [], descartar: [] });
    expect(repartirAvisos([{ ...noche, momento: '2026-11-13T08:30' }]).envios).toHaveLength(1);
  });

  it('varias del mismo tipo para la misma persona van en un solo aviso', () => {
    const r = repartirAvisos([aviso({ id: '1', tipo: 'para_asignar', ot_id: 'o1' }), aviso({ id: '2', tipo: 'para_asignar', ot_id: 'o2' }),
      aviso({ id: '3', tipo: 'para_asignar', ot_id: 'o3' }), aviso({ id: '4', usuario_id: 'u2' })]);
    expect(r.envios).toHaveLength(2);
    expect(r.envios[0]).toMatchObject({ usuario: 'u1', ids: ['1', '2', '3'], mensaje: { titulo: '3 OT nuevas para asignar', url: '/mantenimiento/ordenes' } });
    expect(r.envios[1].mensaje.titulo).toBe('Te asignaron la OT-0123');
  });

  it('cada aviso lleva los íconos de su empresa (el celular los pide sin la sesión)', () => {
    expect(repartirAvisos([aviso({})]).envios[0].mensaje).toMatchObject({ icono: '/icono?t=192&e=e1', insignia: '/icono?t=96&e=e1' });
  });

  it('el resumen de la mañana dice cuántas preventivas hay para derivar', () => {
    expect(mensajeDe(aviso({ tipo: 'para_derivar', ot_id: null, numero: null, cantidad: 5 })).titulo).toBe('Tenés 5 preventivas para derivar');
  });
});
