'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useRef, useState, useTransition, type CSSProperties, type FocusEvent } from 'react';
import { Icono } from '@/components/Icono';
import { textoDeAviso } from '@/features/avisos/textoDeAviso';
import { POSICIONES_MENU, type PosicionMenu } from '@/lib/preferencias';
import { guardarPreferencias } from '~/lib/preferencias';
import { useConAvisos } from './avisos/ProveedorDeAvisos';
import { desplegadoAl, estaActiva, type ItemDeMenu, type SeccionDeMenu } from './menu';

// El menú de secciones en la computadora, igual que en la app de Vite (mismas clases, mismo comportamiento): a la izquierda como franja
// que se abre al acercar el mouse (o fija), arriba como pestañas o abajo como barra. Cada sección es un enlace a su página.
// En el celular no se ve: ahí está el menú de la hamburguesa (MenuCelular).

const ICONO_POSICION = { lateral: 'menuLateral', arriba: 'menuArriba', abajo: 'menuAbajo' } as const;

interface Props {
  secciones: SeccionDeMenu[];
  pie?: ItemDeMenu[];
  inicio: string;
  posicion: PosicionMenu;
  fijo: boolean;
}

function SelectorDePosicion({ posicion }: { posicion: PosicionMenu }) {
  const [, empezar] = useTransition();
  return (
    <div className="menu-selector" role="radiogroup" aria-label="Dónde va el menú">
      {POSICIONES_MENU.map(p => (
        <button key={p.id} type="button" role="radio" aria-checked={posicion === p.id} aria-label={p.nombre} title={p.nombre}
          className={`menu-selector-boton${posicion === p.id ? ' activo' : ''}`}
          onClick={() => empezar(() => guardarPreferencias({ menu_posicion: p.id }))}>
          <Icono n={ICONO_POSICION[p.id]} />
        </button>
      ))}
    </div>
  );
}

export default function MenuDeSecciones({ secciones: sinAvisos, pie: pieSinAvisos = [], inicio, posicion, fijo }: Props) {
  const conAvisos = useConAvisos();
  const secciones = sinAvisos.map(s => ({ ...s, items: conAvisos(s.items) }));
  const pie = conAvisos(pieSinAvisos);
  const ruta = usePathname();
  const [adentro, setAdentro] = useState(false);
  const [, empezar] = useTransition();
  const ref = useRef<HTMLElement>(null);
  const activo = (i: ItemDeMenu) => estaActiva(i, ruta, inicio);
  // el sector desplegado (de a uno por vez); arranca desplegado el que tiene adentro la página actual
  const [desplegado, setDesplegado] = useState<string | null>(() => desplegadoAl(secciones.flatMap(s => s.items), ruta, inicio));

  if (posicion !== 'lateral') {
    const enlace = (i: ItemDeMenu) => (
      <Link key={i.clave} href={i.href} className={`nav-tab${activo(i) ? ' active' : ''}`} aria-current={activo(i) ? 'page' : undefined}>
        <Icono n={i.icono} /> {i.titulo}
        {!!i.cantidad && <span className="aviso-numero">{textoDeAviso(i.cantidad)}</span>}
      </Link>
    );
    return (
      <nav className={`app-nav menu-barra menu-barra-${posicion}`} aria-label="Secciones">
        {secciones.map((s, n) => (
          <div key={s.titulo} className="menu-barra-grupo" role="group" aria-label={s.titulo}>
            {n > 0 && <span className="menu-barra-separador" aria-hidden="true" />}
            {s.items.map(enlace)}
          </div>
        ))}
        <div className="menu-barra-fin">
          {pie.map(enlace)}
          <SelectorDePosicion posicion={posicion} />
        </div>
      </nav>
    );
  }

  const abierto = fijo || adentro;
  const cerrar = () => setAdentro(false);
  const enlace = (i: ItemDeMenu) => (
    <Link key={i.clave} href={i.href} onClick={cerrar} className={`menu-lateral-item${activo(i) ? ' activo' : ''}`} aria-current={activo(i) ? 'page' : undefined}>
      <span className="menu-lateral-icono"><Icono n={i.icono} /></span>
      <span className="menu-lateral-texto">{i.titulo}</span>
      {!!i.cantidad && <span className="menu-lateral-cant">{textoDeAviso(i.cantidad)}</span>}
    </Link>
  );
  // el título de una lista (un sector): su barrita de color (con el menú cerrado, la inicial). Si tiene sub-sectores, arrancan plegados:
  // tocar el título los despliega (y pliega el que estaba abierto) y "ver todos" abre todos sus equipos.
  const titulo = (i: ItemDeMenu) => {
    const marca = <span className="menu-lateral-icono"><span className="menu-lateral-marca" aria-hidden="true">{i.titulo.trim()[0]?.toUpperCase()}</span></span>;
    if (!i.hijos?.length) {
      return (
        <div key={i.clave} className="menu-lateral-lista" style={{ '--marca': i.color } as CSSProperties}>
          <Link href={i.href} onClick={cerrar} className={`menu-lateral-item menu-lateral-titulo${activo(i) ? ' activo' : ''}`} aria-current={activo(i) ? 'page' : undefined}>
            {marca}<span className="menu-lateral-texto">{i.titulo}</span>
          </Link>
        </div>
      );
    }
    const abiertoEste = desplegado === i.clave;
    const adentro = activo(i) || i.hijos.some(activo);
    return (
      <div key={i.clave} role="group" aria-label={i.titulo} className="menu-lateral-lista" style={{ '--marca': i.color } as CSSProperties}>
        <div className={`menu-lateral-fila${adentro && (!abiertoEste || activo(i)) ? ' activo' : ''}`}>
          <button type="button" className="menu-lateral-item menu-lateral-titulo" aria-expanded={abiertoEste} onClick={() => setDesplegado(abiertoEste ? null : i.clave)}>
            {marca}<span className="menu-lateral-texto">{i.titulo}</span>
            <span className={`menu-lateral-flecha${abiertoEste ? ' desplegada' : ''}`} aria-hidden="true"><Icono n="desplegar" /></span>
          </button>
          <Link href={i.href} onClick={cerrar} className="menu-lateral-nota" aria-label={`Todos los equipos de ${i.titulo}`} aria-current={activo(i) ? 'page' : undefined}>ver todos</Link>
        </div>
        {abiertoEste && i.hijos.map(h => (
          <Link key={h.clave} href={h.href} onClick={cerrar} className={`menu-lateral-item menu-lateral-hijo${activo(h) ? ' activo' : ''}`} aria-current={activo(h) ? 'page' : undefined}>
            <span className="menu-lateral-icono"><span className="menu-lateral-punto" /></span>
            <span className="menu-lateral-texto">{h.titulo}</span>
          </Link>
        ))}
      </div>
    );
  };
  const item = (i: ItemDeMenu) => (i.color ? titulo(i) : enlace(i));
  return (
    <nav ref={ref} className={`menu-lateral${abierto ? ' abierto' : ''}${fijo ? ' fijo' : ''}`} aria-label="Secciones"
      onMouseEnter={() => setAdentro(true)} onMouseLeave={cerrar}
      onFocus={(e: FocusEvent<HTMLElement>) => { if (e.target.matches(':focus-visible')) setAdentro(true); }}
      onBlur={(e: FocusEvent<HTMLElement>) => { if (!ref.current?.contains(e.relatedTarget as Node | null)) cerrar(); }}
      onKeyDown={e => { if (e.key === 'Escape') cerrar(); }}>
      <div className="menu-lateral-medio">
        {secciones.map((s, n) => (
          <div key={s.titulo} role="group" aria-label={s.titulo}>
            <div className={`menu-lateral-grupo${n === 0 ? ' primero' : ''}`}>
              <span aria-hidden="true">{s.titulo}</span>
              {n === 0 && <SelectorDePosicion posicion={posicion} />}
            </div>
            {s.items.map(item)}
          </div>
        ))}
      </div>
      <div className="menu-lateral-pie">
        {pie.map(item)}
        <button type="button" className="menu-lateral-item" aria-pressed={fijo} onClick={() => empezar(() => guardarPreferencias({ menu_fijo: !fijo }))}>
          <span className="menu-lateral-icono"><Icono n="fijar" /></span>
          <span className="menu-lateral-texto">{fijo ? 'Soltar menú' : 'Dejar fijo'}</span>
        </button>
      </div>
    </nav>
  );
}
