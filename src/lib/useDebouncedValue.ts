import { useEffect, useState } from 'react';

// Devuelve `value`, pero recién después de que pase `delayMs` sin que cambie
// de nuevo — para no repetir un cálculo pesado (p.ej. filtrar miles de
// filas) en cada tecla mientras alguien todavía está escribiendo.
export function useDebouncedValue<T>(value: T, delayMs = 250): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);
  return debounced;
}
