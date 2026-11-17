import { describe, expect, it } from 'vitest';
import { leerPreferencias } from './preferencias';

describe('leerPreferencias', () => {
  it('toma la posición del menú y si queda fijo', () => {
    expect(leerPreferencias({ menu_posicion: 'abajo', menu_fijo: true })).toEqual({ menu_posicion: 'abajo', menu_fijo: true });
  });

  it('toma la letra de los PDF', () => {
    expect(leerPreferencias({ pdf_letra: 'grande' })).toEqual({ pdf_letra: 'grande' });
  });

  it('descarta lo inválido sin romper', () => {
    expect(leerPreferencias({ menu_posicion: 'derecha', menu_fijo: 'sí', pdf_letra: 'enorme', otra: 1 })).toEqual({});
    expect(leerPreferencias(null)).toEqual({});
    expect(leerPreferencias('arriba')).toEqual({});
    expect(leerPreferencias([1, 2])).toEqual({});
  });
});
