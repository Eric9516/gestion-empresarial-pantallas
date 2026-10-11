import { describe, expect, it } from 'vitest';
import { cantidadAComprar, necesitaReposicion } from './reposicion';

describe('necesitaReposicion', () => {
  it('no reponer si el repuesto no tiene stock mínimo configurado', () => {
    expect(necesitaReposicion({ stock: 0, stock_minimo: 0, punto_pedido: 0 })).toBe(false);
  });

  it('reponer cuando el stock es igual al punto de pedido', () => {
    expect(necesitaReposicion({ stock: 10, stock_minimo: 20, punto_pedido: 10 })).toBe(true);
  });

  it('reponer cuando el stock ya bajó del punto de pedido', () => {
    expect(necesitaReposicion({ stock: 6, stock_minimo: 20, punto_pedido: 10 })).toBe(true);
  });

  it('no reponer todavía si el stock está arriba del punto de pedido', () => {
    expect(necesitaReposicion({ stock: 15, stock_minimo: 20, punto_pedido: 10 })).toBe(false);
  });

  it('con punto de pedido en 0, avisa recién cuando el stock llega a 0 (repuestos de "tener solo 1")', () => {
    expect(necesitaReposicion({ stock: 1, stock_minimo: 1, punto_pedido: 0 })).toBe(false);
    expect(necesitaReposicion({ stock: 0, stock_minimo: 1, punto_pedido: 0 })).toBe(true);
  });

  it('un repuesto sin stock cargado (null) se trata como si tuviera 0', () => {
    expect(necesitaReposicion({ stock: null, stock_minimo: 5, punto_pedido: 2 })).toBe(true);
  });
});

describe('cantidadAComprar', () => {
  it('compra hasta volver al stock mínimo (el ejemplo de los bulones: 6 en stock, mínimo 20)', () => {
    expect(cantidadAComprar({ stock: 6, stock_minimo: 20, punto_pedido: 10 })).toBe(14);
  });

  it('nunca da un número negativo si el stock ya superó el mínimo', () => {
    expect(cantidadAComprar({ stock: 25, stock_minimo: 20, punto_pedido: 10 })).toBe(0);
  });
});
