import { describe, expect, it } from 'vitest';
import { generarOtPdf, generarPlanillaPdf } from './otPdf';
import type { OrdenTrabajo } from './tipos';

// La OT impresa (con el registro de calidad, los valores medidos y la liberación) y la planilla en blanco se arman sin fallar.
const config = {
  registroCodigo: 'REG-MANT-01', registroVersion: '02', registroVigencia: '2026-01-01',
  controlesLiberacion: ['Sin objetos extraños', 'Limpieza', 'Sanitización', 'Prueba en vacío', 'Retiro de herramientas', 'Otro control'], recibeLiberacion: 'Producción',
  costoHora: null, horarioRecepcion: { dias: [] },
};
const ot: OrdenTrabajo = {
  id: 'o1', numero: 7, tipo: 'preventiva', equipoId: 'e1', rutinaId: null, fechaProgramada: '2026-11-04', asignadoId: null, asignado: 'Ana', estado: 'terminada',
  empezadaAt: null, fechaCierre: '2026-11-04', observaciones: 'Todo bien', horas: 2, avisoDias: 3, repuestos: [], correctivo: null,
  tecnicos: [{ usuarioId: 'u1', nombre: 'Ana', fecha: '2026-11-04', inicio: '08:00', fin: '10:00' }],
  tareas: [
    { id: 't1', texto: 'Engrasar', hecha: true, medicion: null, valor: null },
    { id: 't2', texto: 'Vibración', hecha: true, medicion: { unidad: 'mm/s', minimo: 0, maximo: 4.5 }, valor: 7.2 },
  ],
  liberacion: { controles: [{ texto: 'Limpieza', ok: true }, { texto: 'Retiro de herramientas', ok: false }], recibio: 'Juan' },
  horasParada: null, etapa: 'aprobada', asignados: [], pasos: [], terminadaEn: null,
};

describe('PDF de la OT', () => {
  it('una OT terminada con mediciones, liberación y registro de calidad', async () => {
    const pdf = await generarOtPdf([{ empresa: 'Empresa de ejemplo', logo: '', ot, equipo: undefined, rutina: undefined, config },
      { empresa: 'Empresa de ejemplo', logo: '', ot: { ...ot, estado: 'pendiente', liberacion: null }, equipo: undefined, rutina: undefined, config }]);
    expect(pdf.size).toBeGreaterThan(3000);
  });

  it('una planilla en blanco', async () => {
    const pdf = await generarPlanillaPdf([{ empresa: 'Empresa de ejemplo', logo: '', config, planilla: {
      id: 'p1', nombre: 'Bomba – mensual', notas: 'Con la bomba parada', tareas: ot.tareas.map(t => ({ texto: t.texto, medicion: t.medicion })),
    } }]);
    expect(pdf.size).toBeGreaterThan(3000);
  });
});
