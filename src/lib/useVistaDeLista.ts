import { useSyncExternalStore } from 'react';

// Punto de corte de la lista: es el mismo que usa el CSS (styles/components.css, `@media (min-width: 769px)`): desde ahí se ve la tabla y por
// debajo las tarjetas. Dibujar solo la que se ve (en vez de las dos y esconder una con CSS) deja la mitad de elementos en pantalla.
const CONSULTA = '(min-width: 769px)';

export type VistaDeLista = 'tabla' | 'tarjetas' | 'ambas';

const hayMatchMedia = () => typeof window !== 'undefined' && typeof window.matchMedia === 'function';

function suscribir(aviso: () => void) {
  if (!hayMatchMedia()) return () => {};
  const m = window.matchMedia(CONSULTA);
  m.addEventListener('change', aviso);
  return () => m.removeEventListener('change', aviso);
}

// 0 = no se puede saber (se dibujan las dos, como antes), 1 = escritorio, 2 = celular.
const leer = () => (!hayMatchMedia() ? 0 : window.matchMedia(CONSULTA).matches ? 1 : 2);

export function useVistaDeLista(): VistaDeLista {
  const v = useSyncExternalStore(suscribir, leer, () => 0);
  return v === 1 ? 'tabla' : v === 2 ? 'tarjetas' : 'ambas';
}
