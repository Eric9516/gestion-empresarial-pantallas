import { describe, expect, it } from 'vitest';
import { HUECOS_VISIBLES, analizarNumeros, filtrarOpciones, normalizarTexto, numeroConCeros, repuestoConNumero, type RepuestoNumerado } from './numeracion';

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
    expect(analizarNumeros([])).toEqual({ siguiente: '00001', ultimo: null, enBlanco: [], huecos: [], totalHuecos: 0 });
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

describe('analizarNumeros: números libres en el medio (huecos)', () => {
  it('avisa del que falta entre dos usados', () => {
    const a = analizarNumeros([r('00001'), r('00002'), r('00004')]);
    expect(a.huecos).toEqual(['00003']);
    expect(a.totalHuecos).toBe(1);
    expect(a.siguiente).toBe('00005'); // el sugerido por defecto no cambia
  });
  it('el 1 también cuenta si nunca se usó', () => {
    expect(analizarNumeros([r('00002'), r('00004')]).huecos).toEqual(['00001', '00003']);
  });
  it('sin huecos si los números son seguidos, y sin repuestos tampoco', () => {
    expect(analizarNumeros([r('00001'), r('00002'), r('00003')]).totalHuecos).toBe(0);
    expect(analizarNumeros([]).huecos).toEqual([]);
  });
  it('entiende números guardados sin ceros', () => {
    expect(analizarNumeros([r('2'), r('4')]).huecos).toEqual(['00001', '00003']);
  });
  it('un número usado por un repuesto sin descripción no es un hueco (ya está ocupado)', () => {
    expect(analizarNumeros([r('00001'), r('00002', ''), r('00004')]).huecos).toEqual(['00003']);
  });
  it('con muchos huecos trae solo los primeros pero cuenta todos', () => {
    const a = analizarNumeros([r('00100')]);
    expect(a.totalHuecos).toBe(99);
    expect(a.huecos).toHaveLength(HUECOS_VISIBLES);
    expect(a.huecos[0]).toBe('00001');
    expect(a.huecos[HUECOS_VISIBLES - 1]).toBe(numeroConCeros(HUECOS_VISIBLES));
  });
  it('ignora lo que no es número', () => {
    expect(analizarNumeros([r('abc'), r('00003')]).huecos).toEqual(['00001', '00002']);
  });
  it('el peor caso (el último número posible) se calcula al instante', () => {
    const antes = performance.now();
    const a = analizarNumeros([r('99999')]);
    expect(a.totalHuecos).toBe(99998);
    expect(performance.now() - antes).toBeLessThan(250);
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
