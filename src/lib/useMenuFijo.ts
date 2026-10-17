import { useCallback, useState } from 'react';

const CLAVE_FIJO = 'menu-lateral-fijo';

/** Si el menú queda fijo abierto o se despliega solo al acercar el mouse. Se recuerda en este navegador. */
export function useMenuFijo(): [boolean, () => void] {
  const [fijo, setFijo] = useState(() => {
    try { return localStorage.getItem(CLAVE_FIJO) === '1'; } catch { return false; }
  });
  const alternar = useCallback(() => {
    setFijo(actual => {
      const nuevo = !actual;
      try { localStorage.setItem(CLAVE_FIJO, nuevo ? '1' : '0'); } catch { /* sin almacenamiento: queda solo en esta visita */ }
      return nuevo;
    });
  }, []);
  return [fijo, alternar];
}
