import { describe, expect, it } from 'vitest';
import { fechaHoyISO, fechaLocalDe, finDelDiaISO, formatearFechaSola, inicioDelDiaISO } from './fechaHoy';

describe('formatearFechaSola', () => {
  it('muestra el mismo día que se guardó, sin correrlo por la zona horaria', () => {
    expect(formatearFechaSola('2026-10-06')).toBe('6/10/2026');
    expect(formatearFechaSola('2026-01-01')).toBe('1/1/2026');
    expect(formatearFechaSola('2026-12-31')).toBe('31/12/2026');
  });
});

describe('día local de un momento con hora', () => {
  it('un momento de la noche local sigue siendo del mismo día aunque en hora universal ya sea el siguiente', () => {
    const noche = new Date(2026, 9, 9, 22, 30, 0); // 9/10/2026 22:30 hora local
    expect(fechaLocalDe(noche.toISOString())).toBe('2026-10-09');
  });
  it('el rango de un día local cubre el día entero y nada más', () => {
    const desde = new Date(inicioDelDiaISO('2026-10-09'));
    const hasta = new Date(finDelDiaISO('2026-10-09'));
    expect(desde.getTime()).toBe(new Date(2026, 9, 9, 0, 0, 0, 0).getTime());
    expect(hasta.getTime()).toBe(new Date(2026, 9, 9, 23, 59, 59, 999).getTime());
    expect(fechaLocalDe(new Date(2026, 9, 9, 23, 0, 0).toISOString())).toBe('2026-10-09');
    expect(hasta.getTime() < new Date(2026, 9, 10, 0, 0, 0).getTime()).toBe(true);
  });
});

describe('fechaHoyISO', () => {
  it('devuelve el día local con formato yyyy-mm-dd', () => {
    const d = new Date();
    const esperado = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    expect(fechaHoyISO()).toBe(esperado);
    expect(fechaHoyISO()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
