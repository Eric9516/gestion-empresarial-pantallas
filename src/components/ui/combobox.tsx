import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { cn } from '@/lib/utils';
import { filtrarOpciones } from '@/lib/numeracion';
import { campoBase } from './campo';

export interface OpcionCombobox {
  value: string;
  /** Lo que se ve en el campo al elegirla. */
  label: string;
  /** Otros textos por los que se puede encontrar (por ejemplo, el código). */
  buscar?: string[];
}

interface Props {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  opciones: OpcionCombobox[];
  placeholder?: string;
  disabled?: boolean;
  /** Texto cuando lo escrito no coincide con nada. */
  sinResultados?: string;
  className?: string;
}

// Campo con lista: se puede abrir y elegir, o escribir y la lista va filtrando (sin importar tildes ni mayúsculas).
// La lista se muestra debajo del campo, en el flujo normal (no flotando), así funciona igual dentro de ventanas y en el celular.
// Teclado: ↑ ↓ para moverse, Enter para elegir, Esc para cerrar. Sigue el patrón "combobox" de accesibilidad.
export function Combobox({ id, value, onChange, opciones, placeholder = 'Elegir...', disabled, sinResultados = 'Sin coincidencias', className }: Props) {
  const idLista = useId();
  const seleccionada = opciones.find(o => o.value === value) ?? null;
  const [texto, setTexto] = useState('');
  const [escribiendo, setEscribiendo] = useState(false); // false = el campo muestra la opción elegida
  const [abierto, setAbierto] = useState(false);
  const [activa, setActiva] = useState(0);
  const listaRef = useRef<HTMLUListElement>(null);

  const visible = escribiendo ? texto : (seleccionada?.label ?? '');
  const filtradas = useMemo(
    () => (escribiendo ? filtrarOpciones(opciones, texto, o => [o.label, ...(o.buscar ?? [])]) : opciones),
    [opciones, texto, escribiendo],
  );

  // La opción resaltada siempre queda a la vista al moverse con el teclado.
  useEffect(() => {
    listaRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [activa, abierto]);

  function abrir() {
    if (disabled) return;
    setAbierto(true);
    const i = opciones.findIndex(o => o.value === value);
    setActiva(i >= 0 ? i : 0);
  }

  function cerrar() {
    setAbierto(false);
    setEscribiendo(false);
    setTexto('');
  }

  function elegir(o: OpcionCombobox) {
    onChange(o.value);
    cerrar();
  }

  function alTocarTeclado(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!abierto) { abrir(); return; }
      setActiva(a => Math.min(a + 1, filtradas.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiva(a => Math.max(a - 1, 0));
    } else if (e.key === 'Enter') {
      if (abierto && filtradas[activa]) { e.preventDefault(); elegir(filtradas[activa]); }
    } else if (e.key === 'Escape') {
      if (abierto) { e.preventDefault(); e.stopPropagation(); cerrar(); }
    }
  }

  return (
    <div className={cn('w-full', className)}>
      <input
        id={id}
        type="text"
        role="combobox"
        aria-expanded={abierto}
        aria-controls={idLista}
        aria-autocomplete="list"
        aria-activedescendant={abierto && filtradas[activa] ? `${idLista}-${activa}` : undefined}
        autoComplete="off"
        disabled={disabled}
        placeholder={placeholder}
        data-slot="combobox"
        className={campoBase}
        value={visible}
        onFocus={abrir}
        onClick={abrir}
        onChange={e => { setTexto(e.target.value); setEscribiendo(true); setAbierto(true); setActiva(0); }}
        onKeyDown={alTocarTeclado}
        // Al salir sin elegir: si borró todo, se quita la elección; si no, se vuelve a la que había.
        onBlur={() => { if (escribiendo && !texto.trim() && value) onChange(''); cerrar(); }}
      />
      {abierto && (
        <ul
          ref={listaRef}
          id={idLista}
          role="listbox"
          className="mt-1.5 max-h-56 overflow-y-auto rounded-[var(--radius-sm)] border-[1.5px] border-solid border-[var(--border)] bg-[var(--white)] p-1 m-0 list-none"
        >
          {filtradas.length === 0 && <li className="px-3 py-2 text-[13px] text-[var(--text-muted)]">{sinResultados}</li>}
          {filtradas.map((o, i) => (
            <li
              key={o.value}
              id={`${idLista}-${i}`}
              role="option"
              aria-selected={i === activa}
              // mousedown (no click): se elige antes de que el campo pierda el foco y cierre la lista
              onMouseDown={e => { e.preventDefault(); elegir(o); }}
              onMouseEnter={() => setActiva(i)}
              className={cn(
                'cursor-pointer rounded-[6px] px-3 py-2 text-[14px] font-medium text-[var(--text)]',
                i === activa && 'bg-[var(--surface2)]',
                o.value === value && 'font-bold text-[var(--blue)]',
              )}
            >
              {o.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
