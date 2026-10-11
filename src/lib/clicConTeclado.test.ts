import { describe, expect, it, vi } from 'vitest';
import type { KeyboardEvent } from 'react';
import { clicConTeclado } from './clicConTeclado';

function evento(key: string, propio = true) {
  const elemento = {};
  const preventDefault = vi.fn();
  const e = { key, preventDefault, target: propio ? elemento : {}, currentTarget: elemento } as unknown as KeyboardEvent<HTMLElement>;
  return { e, preventDefault };
}

describe('clicConTeclado', () => {
  it('hace el elemento alcanzable con Tab y lo marca como botón', () => {
    const props = clicConTeclado(() => {});
    expect(props.tabIndex).toBe(0);
    expect(props.role).toBe('button');
  });

  it('permite otro rol, o ninguno (por ejemplo una fila de tabla)', () => {
    expect(clicConTeclado(() => {}, 'switch').role).toBe('switch');
    expect('role' in clicConTeclado(() => {}, null)).toBe(false);
  });

  it('ejecuta la acción con Enter y con espacio, sin desplazar la página', () => {
    const accion = vi.fn();
    const { onKeyDown } = clicConTeclado(accion);
    for (const tecla of ['Enter', ' ']) {
      const { e, preventDefault } = evento(tecla);
      onKeyDown(e);
      expect(preventDefault).toHaveBeenCalled();
    }
    expect(accion).toHaveBeenCalledTimes(2);
  });

  it('ignora cualquier otra tecla', () => {
    const accion = vi.fn();
    const { onKeyDown } = clicConTeclado(accion);
    for (const tecla of ['a', 'Tab', 'Escape', 'ArrowDown']) onKeyDown(evento(tecla).e);
    expect(accion).not.toHaveBeenCalled();
  });

  it('no pisa los botones o campos de adentro: solo reacciona si la tecla fue sobre el propio elemento', () => {
    const accion = vi.fn();
    const { onKeyDown } = clicConTeclado(accion);
    const { e, preventDefault } = evento('Enter', false);
    onKeyDown(e);
    expect(accion).not.toHaveBeenCalled();
    expect(preventDefault).not.toHaveBeenCalled();
  });

  it('el clic con el mouse ejecuta la misma acción', () => {
    const accion = vi.fn();
    clicConTeclado(accion).onClick();
    expect(accion).toHaveBeenCalledTimes(1);
  });
});
