import type { KeyboardEvent } from 'react';

// Para elementos que no son botones pero se activan con un clic (filas, tarjetas,
// interruptores): los hace alcanzables con Tab y activables con Enter o espacio.
// Solo reacciona si la tecla se apretó sobre el propio elemento, para no pisar los
// botones o campos que tenga adentro.
export function clicConTeclado(accion: () => void, rol: 'button' | 'switch' | null = 'button') {
  return {
    ...(rol ? { role: rol } : {}),
    tabIndex: 0,
    onClick: accion,
    onKeyDown: (e: KeyboardEvent<HTMLElement>) => {
      if (e.target !== e.currentTarget) return;
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        accion();
      }
    },
  };
}
