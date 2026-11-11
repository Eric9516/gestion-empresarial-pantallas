import { useRef, useState } from 'react';
import type { FocusEvent, ReactNode } from 'react';
import { Icono } from '@/components/Icono';
import { textoDeAviso } from '../features/avisos/useAvisos';

export interface ItemMenu {
  clave: string;
  icono: ReactNode;
  titulo: string;
  onClick: () => void;
  activo?: boolean;
  /** Número chico sobre el ícono (por ejemplo, lo que hay en "A retirar"). */
  cantidad?: number;
  /**
   * Sub-menú (por ejemplo, los sub-sectores de un sector). Si tiene, el ítem lleva una flechita y su onClick
   * solo lo despliega o lo pliega (no cierra el menú). Se ven solo con el menú abierto.
   */
  hijos?: ItemMenu[];
  /** Si el sub-menú está desplegado. */
  desplegado?: boolean;
}

export interface SeccionMenu {
  titulo: string;
  items: ItemMenu[];
}

interface Props {
  secciones: SeccionMenu[];
  /** Lo que va abajo, separado (por ejemplo, Configuración). */
  pie?: ItemMenu[];
  fijo: boolean;
  onAlternarFijo: () => void;
}

function Item({ item, alElegir, sub = false, abierto }: { item: ItemMenu; alElegir: () => void; sub?: boolean; abierto: boolean }) {
  const conHijos = !!item.hijos?.length;
  return (
    <>
      <button
        type="button"
        className={`menu-lateral-item${item.activo ? ' activo' : ''}${sub ? ' sub' : ''}`}
        aria-current={item.activo ? 'page' : undefined}
        aria-expanded={conHijos ? !!item.desplegado : undefined}
        onClick={() => { item.onClick(); if (!conHijos) alElegir(); }}
      >
        <span className="menu-lateral-icono">{item.icono}</span>
        <span className="menu-lateral-texto">{item.titulo}</span>
        {conHijos && <span className={`menu-lateral-flecha${item.desplegado ? ' desplegada' : ''}`} aria-hidden="true"><Icono n="desplegar" /></span>}
        {!!item.cantidad && <span className="menu-lateral-cant">{textoDeAviso(item.cantidad)}</span>}
      </button>
      {conHijos && item.desplegado && abierto && item.hijos!.map(h => <Item key={h.clave} item={h} alElegir={alElegir} sub abierto={abierto} />)}
    </>
  );
}

// Menú lateral de escritorio: una franja angosta de íconos que flota sobre la pantalla (no le quita ancho al
// contenido) y, al acercar el mouse o entrar con el teclado, se ensancha por encima mostrando los nombres.
// Solo crece hacia el costado: su alto es siempre el de la pantalla. En el celular no se ve: ahí está el menú de la hamburguesa.
export default function MenuLateral({ secciones, pie = [], fijo, onAlternarFijo }: Props) {
  const [adentro, setAdentro] = useState(false);
  const ref = useRef<HTMLElement>(null);
  const abierto = fijo || adentro;

  // Con el teclado se abre al enfocar; con el mouse, al pasar por encima (el clic no lo deja trabado).
  function alEnfocar(e: FocusEvent<HTMLElement>) {
    if (e.target.matches(':focus-visible')) setAdentro(true);
  }
  function alSalirElFoco(e: FocusEvent<HTMLElement>) {
    if (!ref.current?.contains(e.relatedTarget as Node | null)) setAdentro(false);
  }

  // Al elegir una sección el menú se repliega y deja ver la pantalla; para volver a abrirlo se saca el mouse y se vuelve a entrar.
  const cerrar = () => setAdentro(false);

  return (
    <nav
      ref={ref}
      className={`menu-lateral${abierto ? ' abierto' : ''}${fijo ? ' fijo' : ''}`}
      aria-label="Secciones"
      onMouseEnter={() => setAdentro(true)}
      onMouseLeave={() => setAdentro(false)}
      onFocus={alEnfocar}
      onBlur={alSalirElFoco}
      onKeyDown={e => { if (e.key === 'Escape') setAdentro(false); }}
    >
      <div className="menu-lateral-medio">
        {secciones.map((seccion, i) => (
          <div key={seccion.titulo} role="group" aria-label={seccion.titulo}>
            <div className={`menu-lateral-grupo${i === 0 ? ' primero' : ''}`} aria-hidden="true"><span>{seccion.titulo}</span></div>
            {seccion.items.map(item => <Item key={item.clave} item={item} alElegir={cerrar} abierto={abierto} />)}
          </div>
        ))}
      </div>
      <div className="menu-lateral-pie">
        {pie.map(item => <Item key={item.clave} item={item} alElegir={cerrar} abierto={abierto} />)}
        <button type="button" className="menu-lateral-item" onClick={onAlternarFijo} aria-pressed={fijo}>
          <span className="menu-lateral-icono"><Icono n="fijar" /></span>
          <span className="menu-lateral-texto">{fijo ? 'Soltar menú' : 'Dejar fijo'}</span>
        </button>
      </div>
    </nav>
  );
}
