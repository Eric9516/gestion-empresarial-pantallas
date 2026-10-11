import { describe, expect, it } from 'vitest';
import { analizarNumeros, filtrarOpciones, normalizarTexto, numeroConCeros, repuestoConNumero, type RepuestoNumerado } from './numeracion';

const r = (numero: string, descripcion: string | null = 'algo', id = numero): RepuestoNumerado => ({ id, codigo: `MABPU${numero.padStart(5, '0')}`, numero, descripcion });

describe('normalizarTexto', () => {
  it('saca tildes y mayúsculas', () => {
    expect(normalizarTexto('  BULONERÍA y Fijación ')).toBe('buloneria y fijacion');
  });
});

describe('filtrarOpciones', () => {
  const familias = [
    { nombre: 'Bulonería y fijación', codigo: 'BF' },
    { nombre: 'Rodamientos, retenes y transmisión', codigo: 'RR' },
    { nombre: 'Aberturas', codigo: 'AB' },
  ];
  const campos = (f: { nombre: string; codigo: string }) => [f.nombre, f.codigo];
  it('sin texto devuelve todo', () => {
    expect(filtrarOpciones(familias, '  ', campos)).toHaveLength(3);
  });
  it('encuentra por nombre sin importar tildes ni mayúsculas', () => {
    expect(filtrarOpciones(familias, 'buloneria', campos).map(f => f.codigo)).toEqual(['BF']);
    expect(filtrarOpciones(familias, 'TRANSMISION', campos).map(f => f.codigo)).toEqual(['RR']);
  });
  it('encuentra por código', () => {
    expect(filtrarOpciones(familias, 'ab', campos).map(f => f.codigo)).toEqual(['AB']);
  });
  it('con varias palabras exige todas, en cualquier orden', () => {
    expect(filtrarOpciones(familias, 'fijacion bulon', campos)).toHaveLength(1);
    expect(filtrarOpciones(familias, 'fijacion rodamientos', campos)).toHaveLength(0);
  });
});

describe('analizarNumeros', () => {
  it('sin repuestos, empieza por 00001', () => {
    expect(analizarNumeros([])).toEqual({ siguiente: '00001', ultimo: null, enBlanco: [] });
  });
  it('sugiere el siguiente al más alto, con ceros', () => {
    const a = analizarNumeros([r('00001'), r('00002'), r('00012')]);
    expect(a.siguiente).toBe('00013');
    expect(a.ultimo).toBe('00012');
  });
  it('el más alto manda, aunque haya números salteados', () => {
    expect(analizarNumeros([r('00001'), r('00040')]).siguiente).toBe('00041');
  });
  it('entiende números guardados sin ceros', () => {
    expect(analizarNumeros([r('7'), r('23')]).siguiente).toBe('00024');
  });
  it('detecta los repuestos sin descripción (vacía o solo espacios), ordenados por número', () => {
    const a = analizarNumeros([r('00005'), r('00009', ''), r('00003', '   '), r('00004', null)]);
    expect(a.enBlanco.map(x => x.numero)).toEqual(['00003', '00004', '00009']);
  });
  it('los sin descripción también cuentan para el "último" (ese número ya está usado)', () => {
    expect(analizarNumeros([r('00002'), r('00008', '')]).siguiente).toBe('00009');
  });
  it('avisa cuando ya no quedan números', () => {
    expect(analizarNumeros([r('99999')]).siguiente).toBeNull();
  });
  it('ignora números que no son números', () => {
    expect(analizarNumeros([r('abc'), r('00003')]).siguiente).toBe('00004');
  });
});

describe('repuestoConNumero', () => {
  const lista = [r('00023', 'Rodamiento'), r('00004', '')];
  it('encuentra el repuesto aunque se escriba sin ceros', () => {
    expect(repuestoConNumero(lista, '23')?.codigo).toBe('MABPU00023');
    expect(repuestoConNumero(lista, '0023')?.codigo).toBe('MABPU00023');
  });
  it('devuelve null si está libre o si no es un número', () => {
    expect(repuestoConNumero(lista, '24')).toBeNull();
    expect(repuestoConNumero(lista, 'x')).toBeNull();
    expect(repuestoConNumero(lista, '')).toBeNull();
  });
});

describe('numeroConCeros', () => {
  it('rellena a 5 dígitos', () => {
    expect(numeroConCeros(7)).toBe('00007');
    expect(numeroConCeros(12345)).toBe('12345');
  });
});
