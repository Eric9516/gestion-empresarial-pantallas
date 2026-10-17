import { useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { isDirectorioAdmin, isDepositoAdmin, isOwner } from '../lib/types';
import { useMenu } from '../lib/useMenu';
import ProfileModal from './ProfileModal';
import SugerenciaModal from './SugerenciaModal';
import { Icono } from '@/components/Icono';

// Insignia de usuario con menú desplegable, compartido entre las 3 pantallas: arriba, quién tiene la sesión abierta (nombre, correo y rol);
// después Mi perfil y Sugerencia, y al final Cerrar sesión, separado. Configuración y las áreas están en el menú lateral.
export default function UserMenu() {
  const { profile, signOut } = useAuth();
  const { abierto: open, cerrar, contenedorRef, disparador, menu } = useMenu();
  const [profileOpen, setProfileOpen] = useState(false);
  const [sugerenciaOpen, setSugerenciaOpen] = useState(false);

  const nombre = profile?.nombre || profile?.email?.split('@')[0] || 'Usuario';
  const inicial = (nombre[0] || 'U').toUpperCase();
  const rol = isOwner(profile) ? 'Dueño' : isDirectorioAdmin(profile) || isDepositoAdmin(profile) ? 'Admin' : 'Usuario';

  return (
    <>
      <div className="user-badge" ref={contenedorRef} style={{ position: 'relative' }}>
        {/* El toggle vive solo acá — antes envolvía también el menú desplegado,
            así que cualquier clic adentro del menú rebotaba a este mismo onClick
            y lo volvía a abrir apenas se cerraba, dejando los botones "sin efecto". */}
        <button
          type="button"
          {...disparador}
          style={{ all: 'unset', display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}
        >
          <div className="user-avatar">{inicial}</div>
          <span className="user-name">{nombre} {profile?.apellido}</span>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="2.5"><polyline points="6 9 12 15 18 9" /></svg>
        </button>

        <div className={`user-dropdown${open ? ' open' : ''}`} {...menu}>
          <div role="presentation" className="user-dropdown-cuenta">
            <div className="user-dropdown-nombre">{nombre} {profile?.apellido}</div>
            {profile?.email && <div className="user-dropdown-correo">{profile.email}</div>}
            <span className="badge badge-rubro user-dropdown-rol">{rol}</span>
          </div>
          <div role="separator" style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
          <button role="menuitem" className="user-dropdown-item" onClick={() => { setProfileOpen(true); cerrar(); }}>
            <span><Icono n="usuario" /></span> Mi perfil
          </button>
          {!isOwner(profile) && (
            <button role="menuitem" className="user-dropdown-item" onClick={() => { setSugerenciaOpen(true); cerrar(); }}>
              <span><Icono n="idea" /></span> Sugerencia
            </button>
          )}
          <div role="separator" style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
          <button role="menuitem" className="user-dropdown-item user-dropdown-danger" onClick={() => void signOut()}>
            <span><Icono n="salir" /></span> Cerrar sesión
          </button>
        </div>
      </div>

      <ProfileModal open={profileOpen} onClose={() => setProfileOpen(false)} />
      <SugerenciaModal open={sugerenciaOpen} onClose={() => setSugerenciaOpen(false)} />
    </>
  );
}
