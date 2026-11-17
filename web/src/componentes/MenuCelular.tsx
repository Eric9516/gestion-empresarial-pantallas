'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState, type CSSProperties } from 'react';
import BotonHamburguesa from '@/components/BotonHamburguesa';
import { Icono } from '@/components/Icono';
import { textoDeAviso } from '@/features/avisos/textoDeAviso';
import { isOwner, trabajaEnEquipos } from '@/lib/types';
import { salir } from '~/app/entrar/acciones';
import { MOSTRAR_CARTEL_DE_AVISOS } from './avisos/ActivarAvisos';
import { useConAvisos } from './avisos/ProveedorDeAvisos';
import { desplegadoAl, estaActiva, type ItemDeMenu, type SeccionDeMenu } from './menu';
import type { DatosDeUsuario } from './MenuDeUsuario';
import { useVentanasDeLaPersona } from './perfil/VentanasDeLaPersona';

// El menú de la hamburguesa (celular): las mismas secciones del menú de la computadora, cada grupo con su título (Áreas, Mantenimiento,
// Sectores...), y abajo lo de siempre (Configuración, Mi perfil, Sugerencia y salir).
export default function MenuCelular({ secciones: sinAvisos, pie: pieSinAvisos = [], inicio, usuario }:
  { secciones: SeccionDeMenu[]; pie?: ItemDeMenu[]; inicio: string; usuario: DatosDeUsuario }) {
  const conAvisos = useConAvisos();
  const secciones = sinAvisos.map(s => ({ ...s, items: conAvisos(s.items) }));
  const pie = conAvisos(pieSinAvisos);
  const items = [...secciones.flatMap(s => s.items), ...pie];
  const [abierto, setAbierto] = useState(false);
  const ruta = usePathname();
  const { abrirPerfil, abrirSugerencia, ventanas } = useVentanasDeLaPersona(usuario);
  // al cambiar de página, se cierra
  const [rutaAnterior, setRutaAnterior] = useState(ruta);
  if (ruta !== rutaAnterior) { setRutaAnterior(ruta); setAbierto(false); }

  useEffect(() => {
    if (!abierto) return;
    const alApretar = (e: KeyboardEvent) => { if (e.key === 'Escape') setAbierto(false); };
    document.addEventListener('keydown', alApretar);
    return () => document.removeEventListener('keydown', alApretar);
  }, [abierto]);

  const aviso = items.some(i => (i.cantidad ?? 0) > 0);
  // el sector desplegado (de a uno por vez); arranca desplegado el que tiene adentro la página actual
  const [desplegado, setDesplegado] = useState<string | null>(() => desplegadoAl(items, ruta, inicio));
  const enlace = (i: ItemDeMenu, sub = false) => (
    <Link key={i.clave} href={i.href} className={`mobile-nav-item${sub ? ' sub' : ''}${estaActiva(i, ruta, inicio) ? ' active' : ''}`}>
      {sub ? <span className="mobile-nav-punto" aria-hidden="true" /> : <span className="mobile-nav-icon"><Icono n={i.icono} /></span>}<span>{i.titulo}</span>
      {!!i.cantidad && <span className="aviso-numero">{textoDeAviso(i.cantidad)}</span>}
    </Link>
  );
  return (
    <>
      <BotonHamburguesa onClick={() => setAbierto(true)} aviso={aviso} />
      <div className={`mobile-menu-overlay${abierto ? ' open' : ''}`} onClick={() => setAbierto(false)} aria-hidden="true" />
      <div className={`mobile-menu${abierto ? ' open' : ''}`} inert={!abierto} aria-hidden={!abierto} role={abierto ? 'dialog' : undefined} aria-modal={abierto ? true : undefined} aria-label="Menú">
        <div className="mobile-menu-header">
          <div className="mobile-menu-user-info">
            <div className="user-avatar">{(usuario.nombre[0] || 'U').toUpperCase()}</div>
            <div style={{ minWidth: 0 }}>
              <div className="mobile-menu-username">{usuario.nombre} {usuario.apellido}</div>
              <div className="mobile-menu-email">{usuario.email}</div>
            </div>
          </div>
          <button className="mobile-menu-close" onClick={() => setAbierto(false)} aria-label="Cerrar menú"><Icono n="cerrar" /></button>
        </div>
        <nav className="mobile-menu-nav" aria-label="Menú principal">
          {secciones.map(s => (
            <div key={s.titulo} role="group" aria-label={s.titulo}>
              <div className="mobile-nav-grupo" aria-hidden="true">{s.titulo}</div>
              {s.items.map(i => (!i.color ? enlace(i) : !i.hijos?.length ? (
                // el título de una lista (un sector, con la barrita de su color)
                <div key={i.clave} className="mobile-nav-lista" style={{ '--marca': i.color } as CSSProperties}>
                  <Link href={i.href} className={`mobile-nav-item mobile-nav-titulo${estaActiva(i, ruta, inicio) ? ' active' : ''}`}>
                    <span className="mobile-nav-marca" aria-hidden="true" /><span>{i.titulo}</span>
                  </Link>
                </div>
              ) : (
                // con sub-sectores: arrancan plegados; tocar el título los despliega y "ver todos" abre todos sus equipos
                <div key={i.clave} role="group" aria-label={i.titulo} className="mobile-nav-lista" style={{ '--marca': i.color } as CSSProperties}>
                  <div className={`mobile-nav-fila${estaActiva(i, ruta, inicio) || (desplegado !== i.clave && i.hijos.some(h => estaActiva(h, ruta, inicio))) ? ' active' : ''}`}>
                    <button type="button" className="mobile-nav-item mobile-nav-titulo" aria-expanded={desplegado === i.clave} onClick={() => setDesplegado(desplegado === i.clave ? null : i.clave)}>
                      <span className="mobile-nav-marca" aria-hidden="true" /><span>{i.titulo}</span>
                      <span className={`mobile-nav-flecha${desplegado === i.clave ? ' desplegada' : ''}`} aria-hidden="true"><Icono n="desplegar" /></span>
                    </button>
                    <Link href={i.href} className="mobile-nav-nota" aria-label={`Todos los equipos de ${i.titulo}`}>ver todos</Link>
                  </div>
                  {desplegado === i.clave && i.hijos.map(h => enlace(h, true))}
                </div>
              )))}
            </div>
          ))}
          <div className="mobile-nav-separador" aria-hidden="true" />
          {pie.map(i => enlace(i))}
          <button type="button" className="mobile-nav-item" onClick={() => { setAbierto(false); abrirPerfil(); }}>
            <span className="mobile-nav-icon"><Icono n="usuario" /></span><span>Mi perfil</span>
          </button>
          {usuario.conMantenimiento && trabajaEnEquipos(usuario.perfil) && (
            <button type="button" className="mobile-nav-item" onClick={() => { setAbierto(false); window.dispatchEvent(new Event(MOSTRAR_CARTEL_DE_AVISOS)); }}>
              <span className="mobile-nav-icon"><Icono n="aviso" /></span><span>Avisos al celular</span>
            </button>
          )}
          {usuario.esPlataforma && (
            <Link href="/plataforma" className="mobile-nav-item" onClick={() => setAbierto(false)}>
              <span className="mobile-nav-icon"><Icono n="empresa" /></span><span>Plataforma</span>
            </Link>
          )}
          {!isOwner(usuario.perfil) && (
            <button type="button" className="mobile-nav-item" onClick={() => { setAbierto(false); abrirSugerencia(); }}>
              <span className="mobile-nav-icon"><Icono n="idea" /></span><span>Sugerencia</span>
            </button>
          )}
        </nav>
        <form className="mobile-menu-footer" action={salir}>
          <button type="submit" className="mobile-logout-btn"><span><Icono n="salir" /></span> Cerrar Sesión</button>
        </form>
      </div>
      {ventanas}
    </>
  );
}
