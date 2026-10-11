import { describe, expect, it } from 'vitest';
import {
  COLOR_DEPOSITO_ORIGINAL, COLOR_PRIMARIO_ORIGINAL, aplicarMarca, contrasteConBlanco, derivarPaleta, esColorValido, textoLegibleConBlanco,
} from './marca';

function raizFalsa() {
  const puestas = new Map<string, string>();
  return {
    puestas,
    style: {
      setProperty: (n: string, v: string) => { puestas.set(n, v); },
      removeProperty: (n: string) => puestas.delete(n),
    },
  };
}

describe('esColorValido', () => {
  it('acepta #rrggbb y rechaza lo demás', () => {
    expect(esColorValido('#1a3a6b')).toBe(true);
    expect(esColorValido('#1A3A6B')).toBe(true);
    for (const malo of ['1a3a6b', '#fff', '#1a3a6bff', 'rojo', '', null, undefined, 12]) expect(esColorValido(malo)).toBe(false);
  });
});

describe('derivarPaleta', () => {
  it('conserva la base y aclara las variantes en orden', () => {
    const p = derivarPaleta(COLOR_PRIMARIO_ORIGINAL);
    expect(p.base).toBe('#1a3a6b');
    // Las tres tienen formato válido y cada una es más clara que la anterior.
    for (const c of [p.base, p.medio, p.claro]) expect(esColorValido(c)).toBe(true);
    expect(contrasteConBlanco(p.medio)).toBeLessThan(contrasteConBlanco(p.base));
    expect(contrasteConBlanco(p.claro)).toBeLessThan(contrasteConBlanco(p.medio));
  });

  it('con los colores originales da valores cercanos a los de la hoja de estilos', () => {
    // Los originales son #1e4d9b y #2d6bc4: la derivada tiene que parecerse, no ser idéntica.
    const p = derivarPaleta('#1a3a6b');
    const cerca = (a: string, b: string) => [1, 3, 5].every(i => Math.abs(parseInt(a.slice(i, i + 2), 16) - parseInt(b.slice(i, i + 2), 16)) < 30);
    expect(cerca(p.medio, '#1e4d9b')).toBe(true);
    expect(cerca(p.claro, '#2d6bc4')).toBe(true);
  });

  it('no se pasa del blanco con colores ya claros', () => {
    const p = derivarPaleta('#e0e0ff');
    expect(esColorValido(p.medio) && esColorValido(p.claro)).toBe(true);
  });

  it('funciona con grises y colores puros', () => {
    for (const c of ['#000000', '#ffffff', '#808080', '#ff0000', '#00ff00', '#0000ff']) {
      const p = derivarPaleta(c);
      expect(esColorValido(p.medio) && esColorValido(p.claro)).toBe(true);
    }
  });
});

describe('contraste', () => {
  it('blanco sobre blanco es 1, y negro sobre blanco es 21', () => {
    expect(contrasteConBlanco('#ffffff')).toBeCloseTo(1, 1);
    expect(contrasteConBlanco('#000000')).toBeCloseTo(21, 0);
  });
  it('los colores originales se leen bien con texto blanco; un amarillo claro no', () => {
    expect(textoLegibleConBlanco(COLOR_PRIMARIO_ORIGINAL)).toBe(true);
    expect(textoLegibleConBlanco(COLOR_DEPOSITO_ORIGINAL)).toBe(true);
    expect(textoLegibleConBlanco('#ffe97f')).toBe(false);
  });
});

describe('aplicarMarca', () => {
  it('pone las variables del color primario y del depósito', () => {
    const r = raizFalsa();
    aplicarMarca(r, { primario: '#0a6e4f', deposito: '#7a2a8a' });
    expect(r.puestas.get('--blue')).toBe('#0a6e4f');
    expect(['--blue-mid', '--blue-light', '--mant', '--mant-mid'].every(n => esColorValido(r.puestas.get(n)))).toBe(true);
    expect(r.puestas.get('--mant')).toBe('#7a2a8a');
  });

  it('sin color (null o inválido) quita lo que había puesto', () => {
    const r = raizFalsa();
    aplicarMarca(r, { primario: '#0a6e4f', deposito: '#7a2a8a' });
    aplicarMarca(r, { primario: null, deposito: 'no-es-un-color' });
    expect(r.puestas.size).toBe(0);
  });

  it('cada color es independiente del otro', () => {
    const r = raizFalsa();
    aplicarMarca(r, { primario: '#0a6e4f' });
    expect(r.puestas.has('--blue')).toBe(true);
    expect(r.puestas.has('--mant')).toBe(false);
  });
});
