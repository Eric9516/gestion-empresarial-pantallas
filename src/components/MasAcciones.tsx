import { Fragment } from 'react';
import type { ReactNode } from 'react';
import { Icono } from '@/components/Icono';
import { Button } from '@/components/ui/button';
import { useMenu } from '../lib/useMenu';

export interface AccionMenu {
  clave: string;
  texto: string;
  icono?: ReactNode;
  deshabilitada?: boolean;
  onClick: () => void;
}

export interface OpcionesMenu<T extends string = string> {
  titulo: string;
  opciones: { id: T; nombre: string }[];
  elegida: T;
  onElegir: (id: T) => void;
}

interface Props {
  acciones?: AccionMenu[];
  /** Grupos de opciones para elegir una (por ejemplo, el tamaño de letra): la elegida queda marcada. */
  grupos?: OpcionesMenu[];
  etiqueta?: string;
}

// El botón "⋯" con las acciones que no se usan todo el tiempo, para que la pantalla no quede cargada de botones.
// Se maneja con el mouse o el teclado (flechas, Esc) y lo entienden los lectores de pantalla.
export default function MasAcciones({ acciones = [], grupos = [], etiqueta = 'Más acciones' }: Props) {
  const { abierto, cerrar, contenedorRef, disparador, menu } = useMenu();
  return (
    <div ref={contenedorRef} style={{ position: 'relative' }}>
      <Button type="button" variant="ghost" size="icon" {...disparador} aria-label={etiqueta} title={etiqueta}><Icono n="masAcciones" /></Button>
      <div className={`user-dropdown${abierto ? ' open' : ''}`} style={{ right: 0, left: 'auto' }} {...menu}>
        {acciones.map(a => (
          <button key={a.clave} type="button" role="menuitem" className="user-dropdown-item" disabled={a.deshabilitada} aria-disabled={a.deshabilitada}
            onClick={() => { if (a.deshabilitada) return; a.onClick(); cerrar(); }}>
            {a.icono} {a.texto}
          </button>
        ))}
        {grupos.map((g, i) => (
          <Fragment key={g.titulo}>
            {(i > 0 || acciones.length > 0) && <div className="user-dropdown-sep" role="separator" />}
            <div className="user-dropdown-grupo" role="presentation">{g.titulo}</div>
            {g.opciones.map(o => (
              <button key={o.id} type="button" role="menuitemradio" aria-checked={g.elegida === o.id} className="user-dropdown-item" onClick={() => { g.onElegir(o.id); cerrar(); }}>
                {o.nombre}
                {g.elegida === o.id && <span className="user-dropdown-marca"><Icono n="ok" /></span>}
              </button>
            ))}
          </Fragment>
        ))}
      </div>
    </div>
  );
}
