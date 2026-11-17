'use client';
import Link from 'next/link';
import { Icono } from '@/components/Icono';
import { useMenu } from '@/lib/useMenu';
import { isOwner, trabajaEnEquipos, type Profile } from '@/lib/types';
import { salir } from '~/app/entrar/acciones';
import { MOSTRAR_CARTEL_DE_AVISOS } from './avisos/ActivarAvisos';
import { useVentanasDeLaPersona } from './perfil/VentanasDeLaPersona';

export interface DatosDeUsuario {
  nombre: string; apellido: string; email: string; rol: string;
  /** Para "Mi perfil": el perfil completo y el Depósito de la persona (si la empresa lo usa). */
  perfil: Profile; conDeposito: boolean; conMantenimiento: boolean; nombreDeposito: string;
  /** Administra la plataforma (las empresas del servidor): ve el enlace al panel. */
  esPlataforma?: boolean;
  /** La cuenta es solo de administración de la plataforma: Mi perfil no muestra roles ni permisos de empresa. */
  cuentaDePlataforma?: boolean;
}

// La insignia de la cabecera (en la computadora): quién tiene la sesión y, al abrirla, Mi perfil, Sugerencia y salir. Mismas clases que la app de Vite.
export default function MenuDeUsuario({ usuario }: { usuario: DatosDeUsuario }) {
  const { abierto, cerrar, contenedorRef, disparador, menu } = useMenu();
  const { abrirPerfil, abrirSugerencia, ventanas } = useVentanasDeLaPersona(usuario);
  const inicial = (usuario.nombre[0] || 'U').toUpperCase();
  return (
    <>
      <div className="user-badge" ref={contenedorRef} style={{ position: 'relative' }}>
        <button type="button" {...disparador} style={{ all: 'unset', display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
          <div className="user-avatar">{inicial}</div>
          <span className="user-name">{usuario.nombre} {usuario.apellido}</span>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="2.5"><polyline points="6 9 12 15 18 9" /></svg>
        </button>
        <div className={`user-dropdown${abierto ? ' open' : ''}`} {...menu}>
          <div role="presentation" className="user-dropdown-cuenta">
            <div className="user-dropdown-nombre">{usuario.nombre} {usuario.apellido}</div>
            {usuario.email && <div className="user-dropdown-correo">{usuario.email}</div>}
            <span className="badge badge-rubro user-dropdown-rol">{usuario.rol}</span>
          </div>
          <div role="separator" style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
          <button role="menuitem" type="button" className="user-dropdown-item" onClick={() => { abrirPerfil(); cerrar(); }}>
            <span><Icono n="usuario" /></span> Mi perfil
          </button>
          {usuario.conMantenimiento && trabajaEnEquipos(usuario.perfil) && (
            <button role="menuitem" type="button" className="user-dropdown-item" onClick={() => { cerrar(); window.dispatchEvent(new Event(MOSTRAR_CARTEL_DE_AVISOS)); }}>
              <span><Icono n="aviso" /></span> Avisos al celular
            </button>
          )}
          {usuario.esPlataforma && (
            <Link role="menuitem" href="/plataforma" className="user-dropdown-item" onClick={() => cerrar()}>
              <span><Icono n="empresa" /></span> Plataforma
            </Link>
          )}
          {!isOwner(usuario.perfil) && (
            <button role="menuitem" type="button" className="user-dropdown-item" onClick={() => { abrirSugerencia(); cerrar(); }}>
              <span><Icono n="idea" /></span> Sugerencia
            </button>
          )}
          <div role="separator" style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
          <form action={salir}>
            <button role="menuitem" type="submit" className="user-dropdown-item user-dropdown-danger">
              <span><Icono n="salir" /></span> Cerrar sesión
            </button>
          </form>
        </div>
      </div>
      {ventanas}
    </>
  );
}
