import { describe, expect, it } from 'vitest';
import { mensajeDeError } from './errores';

describe('mensajeDeError', () => {
  it('toma el mensaje de un Error común', () => {
    expect(mensajeDeError(new Error('falló algo'))).toBe('falló algo');
  });

  it('toma el mensaje de un error de la base (objeto, no Error)', () => {
    expect(mensajeDeError({ code: 'P0001', message: 'La fecha asignada no puede ser anterior a hoy' })).toBe('La fecha asignada no puede ser anterior a hoy');
  });

  it('si no hay mensaje usa el detalle', () => {
    expect(mensajeDeError({ message: '', details: 'Key (id) already exists' })).toBe('Key (id) already exists');
  });

  it('acepta un texto suelto', () => {
    expect(mensajeDeError('sin conexión')).toBe('sin conexión');
  });

  it('con algo desconocido devuelve vacío y no se rompe', () => {
    expect(mensajeDeError(undefined)).toBe('');
    expect(mensajeDeError(null)).toBe('');
    expect(mensajeDeError(42)).toBe('');
    expect(mensajeDeError({})).toBe('');
  });
});
