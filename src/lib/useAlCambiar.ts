import { useState } from 'react';

// Corre `alCambiar` durante el dibujo cuando alguna de las `claves` cambió (y la primera vez). Sirve para reiniciar el estado de un formulario o
// un modal cuando cambia lo que muestra: es lo que hacía un `useEffect` con `setState`, pero sin el dibujado de más (el efecto dibuja con los datos
// viejos, corre, y vuelve a dibujar; esto ajusta el estado antes de mostrar nada). Solo para cambiar el estado de este mismo componente.
export function useAlCambiar(claves: readonly unknown[], alCambiar: () => void): void {
  const [previas, setPrevias] = useState<readonly unknown[] | null>(null);
  if (previas === null || previas.length !== claves.length || claves.some((c, i) => !Object.is(c, previas[i]))) {
    setPrevias(claves);
    alCambiar();
  }
}
