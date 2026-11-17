import { describe, expect, it } from 'vitest';
import { textoParaPdf } from './textoPdf';

describe('textoParaPdf', () => {
  it('cambia la flecha por "->" (la letra del PDF no la tiene)', () => {
    expect(textoParaPdf('Stock 7 \u2192 12 · Punto de pedido 0 \u2192 1')).toBe('Stock 7 -> 12 · Punto de pedido 0 -> 1');
  });
  it('deja los acentos, la ñ, las comillas y los guiones largos', () => {
    expect(textoParaPdf('Piñón — “nuevo” … 1/2" ¿sí?')).toBe('Piñón — “nuevo” … 1/2" ¿sí?');
  });
  it('quita lo que no se puede escribir (emojis)', () => {
    expect(textoParaPdf('Bomba \u{1F527} lista')).toBe('Bomba  lista');
  });
});
