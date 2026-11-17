import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';

// Comportamiento de teclado y de lectores de pantalla para un menú desplegable que
// ya existe visualmente (clases .user-dropdown*): se abre con la flecha ↓, se recorre
// con las flechas, Inicio y Fin, y Esc lo cierra devolviendo el foco al botón. Los
// ítems del menú tienen que llevar role="menuitem" (o "menuitemradio" si son opciones para elegir).
// Los ítems que se recorren con el teclado: acciones y opciones para elegir (con su marca). Los deshabilitados se saltean.
const ITEMS = '[role="menuitem"]:not(:disabled), [role="menuitemradio"]:not(:disabled)';

export function useMenu() {
  const [abierto, setAbierto] = useState(false);
  const contenedorRef = useRef<HTMLDivElement>(null);
  const disparadorRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const idMenu = useId();

  const cerrar = useCallback((devolverFoco = false) => {
    setAbierto(false);
    if (devolverFoco) disparadorRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!abierto) return;
    function alHacerClic(e: MouseEvent) {
      if (contenedorRef.current && !contenedorRef.current.contains(e.target as Node)) setAbierto(false);
    }
    document.addEventListener('click', alHacerClic);
    return () => document.removeEventListener('click', alHacerClic);
  }, [abierto]);

  useEffect(() => {
    if (abierto) menuRef.current?.querySelector<HTMLElement>(ITEMS)?.focus();
  }, [abierto]);

  function alTeclaEnElMenu(e: KeyboardEvent<HTMLElement>) {
    const items = [...(menuRef.current?.querySelectorAll<HTMLElement>(ITEMS) ?? [])];
    const actual = items.indexOf(document.activeElement as HTMLElement);
    const irA = (n: number) => { e.preventDefault(); items[(n + items.length) % items.length]?.focus(); };
    if (e.key === 'ArrowDown') irA(actual + 1);
    else if (e.key === 'ArrowUp') irA(actual - 1);
    else if (e.key === 'Home') irA(0);
    else if (e.key === 'End') irA(items.length - 1);
    else if (e.key === 'Escape') { e.preventDefault(); cerrar(true); }
    else if (e.key === 'Tab') cerrar();
  }

  const disparador = {
    ref: disparadorRef,
    'aria-haspopup': 'menu' as const,
    'aria-expanded': abierto,
    'aria-controls': abierto ? idMenu : undefined,
    onClick: () => setAbierto(prev => !prev),
    onKeyDown: (e: KeyboardEvent<HTMLElement>) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); setAbierto(true); }
      else if (e.key === 'Escape' && abierto) { e.preventDefault(); cerrar(); }
    },
  };

  const menu = { ref: menuRef, id: idMenu, role: 'menu' as const, onKeyDown: alTeclaEnElMenu };

  return { abierto, cerrar, contenedorRef, disparador, menu };
}
