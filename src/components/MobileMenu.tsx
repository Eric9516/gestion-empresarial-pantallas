import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { isOwner, tieneAccesoAdmin } from '../lib/types';
import ProfileModal from './ProfileModal';
import SugerenciaModal from './SugerenciaModal';
import { Icono } from '@/components/Icono';
import { textoDeAviso, useAvisos } from '../features/avisos/useAvisos';
import type { ReactNode } from 'react';

export interface MobileNavItem {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  active?: boolean;
  /** Número rojo (por ejemplo, lo que hay para retirar o las novedades). */
  cantidad?: number;
}

interface Props {
  open: boolean;
  onClose: () => void;
  navItems: MobileNavItem[];
}

// El menú hamburguesa mobile: reemplaza tanto la nav de pestañas (.app-nav, que
// se oculta por completo debajo de 768px) como el menú de usuario (.user-badge,
// también oculto en mobile) — sin esto, en el celular no hay forma de cambiar
// de pestaña, entrar a Configuración, ni cerrar sesión.
export default function MobileMenu({ open, onClose, navItems }: Props) {
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();
  const [profileOpen, setProfileOpen] = useState(false);
  const [sugerenciaOpen, setSugerenciaOpen] = useState(false);
  const { sugerencias: sugerenciasNuevas } = useAvisos();

  const nombre = profile?.nombre || profile?.email?.split('@')[0] || 'Usuario';
  const inicial = (nombre[0] || 'U').toUpperCase();

  useEffect(() => {
    if (!open) return;
    function alApretarTecla(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('keydown', alApretarTecla);
    return () => document.removeEventListener('keydown', alApretarTecla);
  }, [open, onClose]);

  function ir(fn: () => void) {
    fn();
    onClose();
  }

  return (
    <>
      <div className={`mobile-menu-overlay${open ? ' open' : ''}`} onClick={onClose} aria-hidden="true" />
      <div className={`mobile-menu${open ? ' open' : ''}`} inert={!open} aria-hidden={!open} role={open ? 'dialog' : undefined} aria-modal={open ? true : undefined} aria-label="Menú">
        <div className="mobile-menu-header">
          <div className="mobile-menu-user-info">
            <div className="user-avatar">{inicial}</div>
            <div style={{ minWidth: 0 }}>
              <div className="mobile-menu-username">{nombre} {profile?.apellido}</div>
              <div className="mobile-menu-email">{profile?.email}</div>
            </div>
          </div>
          <button className="mobile-menu-close" onClick={onClose} aria-label="Cerrar menú"><Icono n="cerrar" /></button>
        </div>

        <nav className="mobile-menu-nav" aria-label="Menú principal">
          {navItems.map((item, i) => (
            <button key={i} className={`mobile-nav-item${item.active ? ' active' : ''}`} onClick={() => ir(item.onClick)}>
              <span className="mobile-nav-icon">{item.icon}</span><span>{item.label}</span>
              {!!item.cantidad && <span className="aviso-numero">{textoDeAviso(item.cantidad)}</span>}
            </button>
          ))}

          <div style={{ height: 1, background: 'var(--border)', margin: '8px 16px' }} />

          <button className="mobile-nav-item" onClick={() => ir(() => setProfileOpen(true))}>
            <span className="mobile-nav-icon"><Icono n="usuario" /></span><span>Mi perfil</span>
          </button>
          <button className="mobile-nav-item" onClick={() => ir(() => navigate('/'))}>
            <span className="mobile-nav-icon"><Icono n="inicio" /></span><span>Inicio</span>
          </button>
          {!isOwner(profile) && (
            <button className="mobile-nav-item" onClick={() => ir(() => setSugerenciaOpen(true))}>
              <span className="mobile-nav-icon"><Icono n="idea" /></span><span>Sugerencia</span>
            </button>
          )}
          {tieneAccesoAdmin(profile) && (
            <button className="mobile-nav-item" onClick={() => ir(() => navigate('/admin'))}>
              <span className="mobile-nav-icon"><Icono n="config" /></span><span>Configuración</span>
              {sugerenciasNuevas > 0 && <span className="aviso-numero">{textoDeAviso(sugerenciasNuevas)}</span>}
            </button>
          )}
        </nav>

        <div className="mobile-menu-footer">
          <button className="mobile-logout-btn" onClick={() => void signOut()}>
            <span><Icono n="salir" /></span> Cerrar Sesión
          </button>
        </div>
      </div>

      <ProfileModal open={profileOpen} onClose={() => setProfileOpen(false)} />
      <SugerenciaModal open={sugerenciaOpen} onClose={() => setSugerenciaOpen(false)} />
    </>
  );
}
