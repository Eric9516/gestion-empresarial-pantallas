import { describe, expect, it } from 'vitest';
import { comprobanteTexto, formatoCantidad, leerCantidad, problemaDelAjuste, problemaDelMovimiento, resumenDelAjuste, stockResultante, type LineaAjuste } from './ajustes';

const linea = (tipo: 'suma' | 'resta', cantidad: number | null, stock: number | null): LineaAjuste => ({ tipo, cantidad, stock });

describe('stockResultante', () => {
  it('suma y resta sobre el stock actual', () => {
    expect(stockResultante(10, 'suma', 5)).toBe(15);
    expect(stockResultante(10, 'resta', 4)).toBe(6);
  });
  it('un stock sin cargar cuenta como cero', () => {
    expect(stockResultante(null, 'suma', 3)).toBe(3);
    expect(stockResultante(null, 'resta', 3)).toBe(-3);
  });
  it('no arrastra errores de decimales', () => {
    expect(stockResultante(0.1, 'suma', 0.2)).toBe(0.3);
  });
});

describe('leerCantidad', () => {
  it('acepta coma y punto decimal', () => {
    expect(leerCantidad('12')).toBe(12);
    expect(leerCantidad('12,5')).toBe(12.5);
    expect(leerCantidad(' 0.25 ')).toBe(0.25);
  });
  it('rechaza vacío, cero, negativos y texto', () => {
    for (const t of ['', '0', '-3', 'abc', '1,2,3', '  ']) expect(leerCantidad(t)).toBeNull();
  });
});

describe('problemaDelAjuste', () => {
  it('pide al menos un artículo y un motivo', () => {
    expect(problemaDelAjuste([], 'x')).toMatch(/al menos un art/i);
    expect(problemaDelAjuste([linea('suma', 1, 5)], '   ')).toMatch(/motivo/i);
  });
  it('rechaza cantidades inválidas', () => {
    expect(problemaDelAjuste([linea('suma', null, 5)], 'x')).toMatch(/cantidad/i);
  });
  it('no deja restar más de lo que hay, pero sí restar todo', () => {
    expect(problemaDelAjuste([linea('resta', 6, 5)], 'x')).toMatch(/m[aá]s de lo que hay/i);
    expect(problemaDelAjuste([linea('resta', 5, 5)], 'x')).toBeNull();
  });
  it('sumar nunca da problema de stock, y un ajuste correcto no tiene problemas', () => {
    expect(problemaDelAjuste([linea('suma', 100, 0), linea('resta', 1, 1)], 'conteo de octubre')).toBeNull();
  });
  it('rechaza un motivo demasiado largo', () => {
    expect(problemaDelAjuste([linea('suma', 1, 1)], 'x'.repeat(501))).toMatch(/largo/i);
  });
});

describe('resumenDelAjuste', () => {
  it('cuenta artículos y unidades de cada tipo', () => {
    expect(resumenDelAjuste([linea('suma', 5, 0), linea('suma', 2.5, 0), linea('resta', 8, 0)])).toEqual({ sumas: 2, restas: 1, unidadesSumadas: 7.5, unidadesRestadas: 8 });
  });
});

describe('formatoCantidad', () => {
  it('usa coma decimal y no agrega ceros', () => {
    expect(formatoCantidad(5)).toBe('5');
    expect(formatoCantidad(2.5)).toBe('2,5');
    expect(formatoCantidad(null)).toBe('—');
  });
});

describe('comprobanteTexto', () => {
  it('arma tipo, punto de venta y número como un remito', () => {
    expect(comprobanteTexto('carga', 1, 12)).toBe('CAR 0001-00000012');
    expect(comprobanteTexto('ajuste', 3, 128)).toBe('AJU 0003-00000128');
    expect(comprobanteTexto('ajuste', 1, '7')).toBe('AJU 0001-00000007');
  });
});

describe('problemaDelMovimiento', () => {
  it('una carga no necesita motivo, un ajuste sí', () => {
    const una = [linea('suma', 5, 0)];
    expect(problemaDelMovimiento('carga', una, '')).toBeNull();
    expect(problemaDelMovimiento('ajuste', una, '')).toMatch(/motivo/i);
  });
  it('pide al menos un artículo y cantidades válidas, en los dos tipos', () => {
    expect(problemaDelMovimiento('carga', [], '')).toMatch(/al menos un artículo/i);
    expect(problemaDelMovimiento('carga', [linea('suma', null, 0)], '')).toMatch(/cantidad válida/i);
  });
  it('un ajuste no puede dejar el stock en negativo', () => {
    expect(problemaDelMovimiento('ajuste', [linea('resta', 5, 3)], 'conteo')).toMatch(/más de lo que hay/i);
  });
});
